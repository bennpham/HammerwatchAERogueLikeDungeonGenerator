/**
 * Wall traps that switch with the boss's health, on a dungeon floor.
 *
 * The issue states the difference exactly: a floor's ordinary traps
 * (`traps/floor.ts`) are always on, and these are the same spewers in the same
 * places but switchable. So this is `traps/floor.ts`'s PLACEMENT welded to
 * `boss/traps.ts`'s per-tier WIRING:
 *
 *   ProjectileSpewer × count, on room walls    (tier 0 live, later tiers disabled)
 *
 *   GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *        ├─ ToggleElement{state: 1} per previous carrying tier's spewer  (off)
 *        └─ ToggleElement{state: 0} per own spewer                      (on)
 *
 * Tiers REPLACE one another, as they do in the arena: the hazard changes with
 * the phase instead of accumulating into an uncrossable crossfire. Tier 0
 * arrives live with no trigger at all, because nothing exists to switch it on.
 * "Previous" is the nearest EARLIER tier that actually carries a trap, not
 * `tier - 1` — a floor trapping only 100% and 25% needs the 25% trigger to
 * clear the 100% set, and there is no tier-2 set to name.
 *
 * Pools are per direction and carried across every tier, so two tiers cannot
 * crowd one tile. Draws one `ctx.floorBossRand` value per placed spewer, and
 * must return before touching the stream when no tier carries a trap.
 */

import type { GenerationContext } from '../core/context'
import type { BossTrap, BossTrapDirection, BossWave } from '../config/parameters'
import { waveTraps } from '../config/parameters'
import type { Level } from '../map/level'
import type { ProjectileDef } from '../objects/projectileTypes'
import { projectileById } from '../objects/projectileTypes'
import { NodeProjectileSpewer, NodeToggleElement } from '../objects/nodes'
import type { Slot } from '../traps/slots'
import { SPEWER_DIRECTION, TILE_CENTRE, WALLS, takeSlot } from '../traps/slots'
import { floorSlots } from '../traps/floor'
import type { TierSource } from '../boss/tierSource'
import { singleBossTierSource } from '../boss/tierSource'

/**
 * Builds the floor's per-tier trap rig. Emits nothing at all — not one node,
 * not one id, and not one draw — when no tier carries a trap.
 *
 * A row naming an unknown projectile, or asking for no spewers, is skipped
 * rather than thrown on; `config/validation.ts` is the gate.
 */
export function buildFloorBossTrapRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  level: Level,
  x: number,
  y: number,
  tierSource: TierSource = singleBossTierSource()
): void {
  const carried: { def: ProjectileDef; row: BossTrap }[][] = waves.map((wave) =>
    waveTraps(wave).flatMap((row) => {
      const def = projectileById(row.projectile)
      return def === undefined || row.count < 1 ? [] : [{ def, row }]
    })
  )
  // Must come before any floorBossRand draw.
  if (carried.every((entries) => entries.length === 0)) return

  // One pool per wall, built lazily and consumed across every tier. Lazy
  // because enumerating a wall the floor never uses is wasted work on a big
  // floor, and because a pool that is never read must never be built — it
  // would make no draw either way, but the cost is real.
  const pools = new Map<BossTrapDirection, Slot[]>()
  const poolFor = (direction: BossTrapDirection): Slot[] => {
    const existing = pools.get(direction)
    if (existing !== undefined) return existing
    const built = WALLS.includes(direction) ? floorSlots(level, ctx, direction) : []
    pools.set(direction, built)
    return built
  }

  let previous: NodeProjectileSpewer[] = []
  let row = y

  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    const spewers: NodeProjectileSpewer[] = []
    for (const { def, row: trap } of entries) {
      const pool = poolFor(trap.direction)

      for (let copy = 0; copy < trap.count; copy++) {
        // Pool dry: stop placing this row rather than stacking spewers on one
        // tile. No draw is made, which keeps the stream tied to the number of
        // spewers actually placed.
        if (pool.length === 0) break

        const slot = takeSlot(ctx.floorBossRand, pool)
        const spewer = new NodeProjectileSpewer(
          ctx,
          slot.x + TILE_CENTRE,
          slot.y + TILE_CENTRE,
          def.path,
          SPEWER_DIRECTION[trap.direction],
          trap.spread,
          trap.spawnRateMs
        )
        // The opening tier has nothing to switch it on, so it must arrive live;
        // every later tier ships disabled (the node's own default).
        spewer.enabled = tier === 0
        spewers.push(spewer)
      }
    }

    if (spewers.length === 0) continue

    if (tier > 0) {
      row += 1
      const trigger = tierSource.tierTrigger(ctx, x, row, tier)

      for (const stale of previous) {
        row += 1
        const off = new NodeToggleElement(ctx, x, row)
        off.state = 1 // 1 disables the target element
        off.connectToElement(stale)
        trigger.connectTo(off)
      }

      for (const spewer of spewers) {
        row += 1
        const on = new NodeToggleElement(ctx, x, row)
        on.state = 0 // 0 enables the target element
        on.connectToElement(spewer)
        trigger.connectTo(on)
      }
    }

    previous = spewers
  }
}
