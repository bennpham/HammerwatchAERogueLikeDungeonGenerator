/**
 * A boss standing on an ordinary dungeon floor (issue #61) — the floor keeps
 * every one of its standard controls and gains a boss, a sealed way out, and
 * the same health-tier rigs the arena runs.
 *
 * Why this is a thinner module than `survival/`. Survival's problem was that
 * the engine fires `Boss 75% / 50% / 25% / Died` ONLY for an actor in the
 * `actors/boss_*` folders, so an arena with no boss had to re-key every rig to
 * a clock. A dungeon floor WITH a boss actor gets those events for free, so
 * `boss/invulnerability.ts` and `boss/checkpoints.ts` are called here verbatim
 * and the tier wiring of `boss/waves.ts` and `boss/traps.ts` is reused as-is.
 * What is genuinely new is PLACEMENT — an arena is one open rectangle and a
 * floor is a graph of rooms — which is what `placement.ts` supplies.
 *
 * Fixed build order. Ids are handed out in call order, so reordering these
 * moves every node after the change:
 *
 *   1. boss actor      one draw: which boss
 *   2. waves           spawn points across the floor   <- draws
 *   3. buffs           one whole-floor field per tier
 *   4. traps           per-tier spewers on room walls  <- draws
 *   5. invulnerability windows on the boss actor
 *   6. checkpoints     respawn / save-game milestones
 *   7. opener          Boss Died -> DestroyObject on the seals
 *   8. pickups         per-tier item drops across the floor <- draws
 *
 * Every step from 2 on returns before allocating an id when its own config is
 * empty, which is what keeps one from moving another's ids. Steps 1, 2, 4 and
 * 8 are the only ones that draw, and they draw only from `ctx.floorBossRand`.
 * Pickups come last on purpose: they were added after the rest, and running
 * last is what lets turning them on move nothing already on the floor.
 */

import type { GenerationContext } from '../core/context'
import type { DungeonBoss } from '../config/parameters'
import { bossSelection, floorBossCount, isMultiBoss } from '../config/parameters'
import type { Level } from '../map/level'
import { buildInvulnerabilityRig } from '../boss/invulnerability'
import { buildCheckpointRig } from '../boss/checkpoints'
import { buildWaveBuffRig } from '../boss/waveBuffs'
import { buildAllBossesDied, multiBossTierSource, singleBossTierSource } from '../boss/tierSource'
import { expandLineup } from '../boss/bosses'
import { placeFloorBoss, placeFloorBosses } from './actor'
import { floorInteriorSlots } from './placement'
import { buildFloorBossWaveRig } from './waves'
import { buildFloorBossTrapRig } from './traps'
import { buildFloorBossOpener } from './opener'
import { buildFloorBossPickupRig } from './pickups'

export { placeFloorBoss, placeFloorBosses } from './actor'
export { floorInteriorSlots, roomInteriorSlots } from './placement'
export { buildFloorBossWaveRig, FLOOR_SPAWN_POINTS } from './waves'
export { buildFloorBossTrapRig } from './traps'
export { BOSS_DIED_EVENT, OPENED_TEXT, buildFloorBossOpener } from './opener'
export { buildFloorBossPickupRig } from './pickups'

/**
 * Builds the whole dungeon-boss rig for one accepted floor, in the fixed order
 * documented above. Emits nothing at all when `boss` is undefined.
 *
 * Called from `index.ts`'s floor loop after every other per-floor rig, so
 * arming a boss cannot move a buff, timer, music or ordinary-trap node's id.
 *
 * `level.bossSpot` was chosen during construction and is already a
 * `ctx.reachTargets` entry — see `map/level.ts` for why it cannot be chosen
 * here. A floor whose spot is missing emits nothing rather than guessing.
 */
export function buildFloorBossRig(
  ctx: GenerationContext,
  boss: DungeonBoss | undefined,
  level: Level
): void {
  if (boss === undefined || !boss.enabled) return
  if (level.bossSpots.length === 0) return

  // Marker column for the cosmetic editor nodes: just past the map's east
  // edge, where nothing can be standing. The spewers, SpawnObjects and the
  // checkpoint rig's Checkpoint/RespawnPlayers care about their real
  // positions — the last two teleport the party to themselves, so they go on
  // the floor's LevelStart instead.
  const markerX = level.width + 1
  const markerY = 0

  const count = floorBossCount(boss)
  const multi = isMultiBoss(count)
  // Exact lineups (issue #64 follow-up): zero ctx.floorBossRand draws for the
  // pick, and boss.bossPool is not read at all — see placeFloorBosses.
  const lineup = bossSelection(boss) === 'lineup' ? expandLineup(boss.bossLineup) : undefined
  const actors = placeFloorBosses(ctx, boss.bossPool, level.bossSpots, count, lineup)
  if (actors.length === 0) return

  // Multi-boss (issue #64 part 1): the same "all bosses died" rig every
  // arena builds, built once right after the actors are placed. Single boss:
  // unused — every tier-keyed rig below keeps building its own
  // `GlobalEventTrigger`, exactly as it always has.
  const tierSource = multi
    ? multiBossTierSource(buildAllBossesDied(ctx, actors, markerX, markerY))
    : singleBossTierSource()

  const pool = floorInteriorSlots(level, ctx)
  buildFloorBossWaveRig(ctx, boss.waves, boss.monsterMultiplier, pool, markerX, markerY, tierSource)

  buildWaveBuffRig(ctx, boss.waves, level.width, level.height, markerX, markerY, tierSource)

  buildFloorBossTrapRig(ctx, boss.waves, level, markerX, markerY, tierSource)

  // Invulnerability and checkpoints need to know THE boss, not a boss, so
  // both are skipped outright for a multi-boss floor — same reasoning as the
  // arena's (`boss/arena.ts`). Their settings stay on `boss`, simply unread.
  if (!multi) {
    buildInvulnerabilityRig(ctx, boss.invulnerability, actors[0].id, markerX, markerY)

    // `scriptNodes` is cleared per level, so this is this floor's own start.
    // A floor always has one; without it there is nowhere safe to respawn.
    const start = ctx.scriptNodes.find((n) => n.type === 'LevelStart')
    if (start !== undefined) {
      buildCheckpointRig(ctx, boss.checkpoints, markerX, markerY, { x: start.x, y: start.y })
    }
  }

  buildFloorBossOpener(
    ctx,
    level.seals,
    markerX,
    markerY,
    // `multiBossTierSource.tierTrigger` ignores its tier argument and always
    // returns the shared all-bosses-died check, so any value reaches it — the opener just
    // wants the same node every death-tier rig above connected from.
    multi ? tierSource.tierTrigger(ctx, markerX, markerY, 0) : undefined,
    count,
    // A locked boss floor's buttons (issue #69) — empty otherwise.
    level.sealButtons
  )

  buildFloorBossPickupRig(ctx, boss.waves, level, markerX, markerY, tierSource)
}
