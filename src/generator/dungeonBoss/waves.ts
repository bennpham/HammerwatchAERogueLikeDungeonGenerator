/**
 * The boss's spawn tiers on a dungeon floor — `boss/waves.ts`'s anchors path
 * with the nine arena anchors swapped for points scattered across the floor.
 *
 * That swap is the whole module. In the arena rig the anchor list is only ever
 * read as (a) a list of positions to construct `SpawnObject` nodes at and
 * (b) a round-robin divisor; nothing else in the chain knows what an arena is.
 * So the trigger, the interval grouping, the `state: 0` toggle polarity, the
 * `-1` endless branch, `splitRoundRobin` and `scaledMax` all carry over
 * untouched, and only the points differ:
 *
 *   tier 0        GlobalEventTrigger("LevelLoaded")
 *   tier N        GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *        └─ ToggleElement{state: 0} ─> arms TimerTrigger(intervalMs)
 *                                          └─ SpawnObject × spawn points
 *
 * Tier 0 is the one place the two genuinely differ. An arena fires it from an
 * `AreaTrigger` over the entrance mouth, because the party walks into an arena
 * through one door; a dungeon floor has no such choke point — the party arrives
 * on the stairs and the boss may be anywhere — so tier 0 arms on `LevelLoaded`
 * instead. [UNVERIFIED], same as everywhere else that event is used.
 *
 * Points come from `placement.ts`'s floor-wide interior pool, which means a
 * tier's monsters arrive from every eligible room rather than from one place.
 * That is the issue's own wording — "like how the current dungeon place
 * monsters in areas where you can place monster in a dungeon" — and it makes
 * the fight pull the party around the floor instead of being a single arena
 * brawl.
 *
 * Draws one value per spawn point taken, from `ctx.floorBossRand`.
 *
 * Deliberately stays on plain `resolveActorPath`, never
 * `resolveArenaActorPath` — the bodyguard-twin swap (issue #64 part 2) is an
 * ARENA substitution (`arenaUsesBodyguards`/`BossArenaOptions.bodyguardVariants`),
 * and a boss floor is a dungeon floor, not an arena: it has no such field to
 * read and its actors are the regular roster ones, same as everything else on
 * the floor.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave } from '../config/parameters'
import type { Slot } from '../traps/slots'
import { takeSlot } from '../traps/slots'
import { scaledMax, splitRoundRobin } from '../boss/waves'
import { resolveActorPath } from '../objects/monsterTypes'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { NodeGlobalEventTrigger, NodeSpawnObject, NodeTimerTrigger, NodeToggleElement } from '../objects/nodes'
import type { TierSource } from '../boss/tierSource'
import { singleBossTierSource } from '../boss/tierSource'

/**
 * How many distinct points one tier's monster is dealt across.
 *
 * The arena's equivalent is its nine fixed anchors. A floor could in principle
 * use far more — a big floor has hundreds of free tiles — but the arena's batch
 * lesson applies just as hard here: the 2026-08-27 playtest put ~480 actors on
 * the floor in one frame and it never recovered. Nine keeps a tier's arrival
 * spread out in the same way, and keeps the node count per tier bounded.
 */
export const FLOOR_SPAWN_POINTS = 9

/**
 * Builds the floor boss's spawn tiers. Emits nothing at all — not one node, not
 * one id, and not one draw — when no tier carries a monster.
 *
 * `pool` is consumed: points are taken from it so no two tiers stack their
 * spawns on one tile, exactly as the trap rigs consume their wall pools.
 */
export function buildFloorBossWaveRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  monsterMultiplier: number,
  pool: Slot[],
  x: number,
  y: number,
  tierSource: TierSource = singleBossTierSource()
): void {
  if (waves.every((wave) => wave.monsters.length === 0)) return
  if (pool.length === 0) return

  let row = y

  for (let tier = 0; tier < waves.length; tier++) {
    const wave = waves[tier]
    if (wave.monsters.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely, before
    // any point is drawn for them.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    // Each tier gets its own points, drawn once and shared by every monster in
    // it — so a tier arrives as one spread-out wave rather than each monster
    // type picking its own scatter.
    const points: Slot[] = []
    for (let i = 0; i < FLOOR_SPAWN_POINTS && pool.length > 0; i++) {
      points.push(takeSlot(ctx.floorBossRand, pool))
    }
    if (points.length === 0) continue

    row += 1
    const triggerNode =
      tier === 0 ? new NodeGlobalEventTrigger(ctx, x, row, LEVEL_LOADED_EVENT) : tierSource.tierTrigger(ctx, x, row, tier)

    // Group by effective interval, preserving the order monsters first appear
    // in `wave.monsters` — Map iteration is insertion order, so this is
    // deterministic and independent of any object key order.
    const byInterval = new Map<number, string[]>()
    for (const id of wave.monsters) {
      const interval = wave.intervalMs?.[id] ?? wave.defaultIntervalMs
      const group = byInterval.get(interval)
      if (group) group.push(id)
      else byInterval.set(interval, [id])
    }

    for (const [interval, ids] of byInterval) {
      row += 1
      const timer = new NodeTimerTrigger(ctx, x, row, interval)

      row += 1
      const toggle = new NodeToggleElement(ctx, x, row)
      toggle.state = 0 // 0 enables the target element — see nodes.ts
      toggle.connectToElement(timer)
      triggerNode.connectTo(toggle)

      for (const id of ids) {
        const max = scaledMax(wave.monsterMax[id], monsterMultiplier)
        const actorPath = resolveActorPath(id)

        if (max === -1) {
          // Endless: every point spawns this monster, unbounded, unchanged —
          // the arena's own reading of the sentinel.
          for (const point of points) {
            const spawn = new NodeSpawnObject(ctx, point.x, point.y, actorPath)
            timer.connectTo(spawn)
          }
          continue
        }

        const shares = splitRoundRobin(max, points.length)
        for (let i = 0; i < points.length; i++) {
          if (shares[i] === 0) continue
          const spawn = new NodeSpawnObject(ctx, points[i].x, points[i].y, actorPath)
          spawn.triggerTimes = shares[i]
          timer.connectTo(spawn)
        }
      }
    }
  }
}
