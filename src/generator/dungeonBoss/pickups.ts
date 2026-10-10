/**
 * A floor boss's per-tier item drops — `boss/wavePickups.ts` with the arena's
 * drop pad swapped for tiles scattered across the floor.
 *
 * The arena drops on one learnable pad by its entrance. A dungeon floor has no
 * such spot, so each copy lands on its own random interior tile, drawn the way
 * the floor's wave monsters are: `floorInteriorSlots` (every eligible room,
 * inside `roomSpawnBox`'s wall margin) and `takeSlot`, whose spacing keeps
 * copies from piling on one tile. The party finds them while roaming, not by
 * running back to a pad.
 *
 * The wiring is the arena's. One SpawnObject per copy, `trigger-times: 1`,
 * hanging straight off the tier trigger — see `boss/wavePickups.ts` for why a
 * count is copies rather than `trigger-times`. Tiers do not replace one
 * another: an item stays on the floor until picked up. Tier 0 fires on
 * `LevelLoaded`, as the floor wave rig's does, since a floor has no entrance
 * AreaTrigger.
 *
 * Draws only from `ctx.floorBossRand`, one per copy, and is built LAST in
 * `buildFloorBossRig`, so turning drops on appends ids and draws and moves
 * nothing already on the floor. With no drops it returns before touching the
 * stream.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave, WavePickup } from '../config/parameters'
import { wavePickups } from '../config/parameters'
import type { Level } from '../map/level'
import { pickupById } from '../objects/pickupTypes'
import { NodeGlobalEventTrigger, NodeSpawnObject } from '../objects/nodes'
import { LEVEL_LOADED_EVENT } from '../core/events'
import type { TierSource } from '../boss/tierSource'
import { singleBossTierSource } from '../boss/tierSource'
import type { Slot } from '../traps/slots'
import { takeSlot } from '../traps/slots'
import { floorInteriorSlots } from './placement'

/**
 * Builds the floor's per-tier drop rig. `(x, y)` is the cosmetic marker column
 * for the triggers; every SpawnObject sits where its item lands.
 */
export function buildFloorBossPickupRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  level: Level,
  x: number,
  y: number,
  tierSource: TierSource = singleBossTierSource()
): void {
  const carried: WavePickup[][] = waves.map((wave) =>
    wavePickups(wave).filter((entry) => pickupById(entry.item) !== undefined && entry.count > 0)
  )
  if (carried.every((entries) => entries.length === 0)) return

  // Refilled when a big drop table exhausts it, so every copy lands. That can
  // only happen once per `pool.length` copies, and copies are bounded by
  // validation, so this never loops without end.
  let pool: Slot[] = floorInteriorSlots(level, ctx)
  if (pool.length === 0) return
  const nextSlot = (): Slot => {
    if (pool.length === 0) pool = floorInteriorSlots(level, ctx)
    return takeSlot(ctx.floorBossRand, pool)
  }

  let row = y
  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    row += 1
    const trigger = tier === 0 ? new NodeGlobalEventTrigger(ctx, x, row, LEVEL_LOADED_EVENT) : tierSource.tierTrigger(ctx, x, row, tier)

    for (const entry of entries) {
      const def = pickupById(entry.item)!
      for (let copy = 0; copy < entry.count; copy++) {
        const slot = nextSlot()
        const spawn = new NodeSpawnObject(ctx, slot.x, slot.y, def.path)
        spawn.triggerTimes = 1
        trigger.connectTo(spawn)
      }
    }
  }
}
