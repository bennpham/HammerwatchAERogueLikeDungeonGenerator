/**
 * The boss actor on a dungeon floor.
 *
 * A bare actor placement with no rig of its own — the engine fires the
 * `Boss 75% / 50% / 25% / Died` global events for any actor in the
 * `actors/boss_*` folders, which is what lets every tier-keyed rig in `boss/`
 * be reused here unchanged. A one-off `MonsterTypeDef` (never added to
 * `MONSTER_TYPES`) lets `Monster`'s existing `getXML()` emit the usual
 * `{id, type, x, y}` shape. This is `boss/arena.ts`'s own trick, on a floor.
 *
 * Which boss is a seeded pick from the floor's pool; WHERE it stands was
 * decided during construction and is already a `ctx.reachTargets` entry, so the
 * party is guaranteed to be able to walk to it. See `map/level.ts`.
 */

import type { GenerationContext } from '../core/context'
import type { Monster as MonsterInstance } from '../objects/monster'
import { Monster } from '../objects/monster'
import { BOSS_DEFS, pickBosses } from '../boss/bosses'
import type { BossId } from '../boss/bosses'

/**
 * Places one boss from `pool` at `spot`. Returns the actor, whose id the
 * invulnerability rig needs — its `ToggleImmortality` nodes target the ACTOR,
 * not a script node.
 *
 * Draws exactly one value from `ctx.floorBossRand`: which boss. Returns null
 * for an empty or entirely unknown pool rather than throwing, and draws nothing
 * in that case — `config/validation.ts` is the gate.
 */
export function placeFloorBoss(
  ctx: GenerationContext,
  pool: readonly string[],
  spot: { x: number; y: number }
): MonsterInstance | null {
  const known = pool.filter((id) => id in BOSS_DEFS)
  if (known.length === 0) return null

  const bossId = known[ctx.floorBossRand.iRand(0, known.length)] as BossId
  const def = BOSS_DEFS[bossId]

  return Monster.create(
    ctx,
    spot.x,
    spot.y,
    { id: def.id, configKey: '', tiers: [def.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Bosses' },
    0
  )
}

/**
 * Places `count` bosses on `spots` — issue #64 part 1, plus the follow-up's
 * exact lineups. `spots[i]` is used for the i-th placed boss (`map/level.ts`
 * already chose one `ctx.reachTargets` entry per spot, in the same fixed
 * pattern spot 1 has always used).
 *
 * `lineup`, when given, is `bossSelection: 'lineup'`'s already-expanded id
 * list (`expandLineup()` in `boss/bosses.ts`) — used verbatim, sliced to
 * `spots.length`, with ZERO `ctx.floorBossRand` draws, even when
 * `lineup.length <= 1`: a lineup floor never takes the single-draw shortcut
 * below, because that shortcut draws and a lineup floor must not.
 *
 * Without a lineup: `count = 1` calls `placeFloorBoss` exactly once, on
 * `spots[0]`, so a single-boss floor is byte-identical to before this
 * function existed. `count > 1` draws through `pickBosses` — MOBILE_BOSS_IDS
 * holds no unique boss, so every draw there behaves as an ordinary
 * (non-unique) pick, but `pickBosses` is still the single source of that
 * logic.
 *
 * Draws exactly `count` values from `ctx.floorBossRand` in random mode (one
 * per boss), and nothing when `pool` has no known boss or `spots` is shorter
 * than `count` — `config/validation.ts` is the gate that keeps the latter
 * from happening for a validated parameter set. Returns one actor per spot
 * actually filled, in spot order.
 */
export function placeFloorBosses(
  ctx: GenerationContext,
  pool: readonly string[],
  spots: ReadonlyArray<{ x: number; y: number }>,
  count: number,
  lineup?: readonly BossId[]
): MonsterInstance[] {
  if (lineup !== undefined) {
    const ids = lineup.slice(0, spots.length)
    return ids.map((id, i) => {
      const def = BOSS_DEFS[id]
      return Monster.create(
        ctx,
        spots[i].x,
        spots[i].y,
        { id: def.id, configKey: '', tiers: [def.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Bosses' },
        0
      )
    })
  }

  if (count <= 1) {
    if (spots.length === 0) return []
    const actor = placeFloorBoss(ctx, pool, spots[0])
    return actor === null ? [] : [actor]
  }

  const known = pool.filter((id) => id in BOSS_DEFS)
  if (known.length === 0) return []

  const ids = pickBosses(ctx.floorBossRand, known, Math.min(count, spots.length))
  return ids.map((id, i) => {
    const def = BOSS_DEFS[id]
    return Monster.create(
      ctx,
      spots[i].x,
      spots[i].y,
      { id: def.id, configKey: '', tiers: [def.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Bosses' },
      0
    )
  })
}
