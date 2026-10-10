/**
 * Item drops per boss wave tier — the loot half of the wave rig.
 *
 * Each of the five tiers (100 / 75 / 50 / 25% and Boss Died) may carry any
 * number of drop rows, each naming an item from PICKUP_DEFS and how many copies
 * of it land. When the tier's threshold fires, the copies appear on the
 * entrance drop pad (boss/pickupPad.ts) and stay on the floor until somebody
 * walks over them.
 *
 *   tier 0 (100%)   AreaTrigger -> entranceShape
 *                        └─ SpawnObject{trigger-times: 1} × copies
 *
 *   tier N          GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *                        └─ SpawnObject{trigger-times: 1} × copies
 *
 * Three things separate this from waveBuffs.ts, which it is otherwise modelled
 * on:
 *
 * 1. **Tiers do not replace one another.** A buff field is a live effect, so a
 *    tier switches the previous tier's set off as it switches its own on. An
 *    item is an object on the floor — there is nothing to switch off, and the
 *    50% health the party did not collect is still there at 25%. So no
 *    ToggleElement chain at all.
 *
 * 2. **A count is copies, not `trigger-times`.** A SpawnObject spawns ONE actor
 *    per incoming trigger, and a tier trigger fires once, so `trigger-times: 4`
 *    on one node would drop one item and bank three. Four copies means four
 *    nodes. `trigger-times: 1` is still what each node carries, and it matters:
 *    tier 0's AreaTrigger re-fires every time a player walks back over the
 *    entrance, and without the bound the 100% drop would be an infinite item
 *    fountain.
 *
 * 3. **It builds its own tier trigger** rather than sharing waves.ts's. A tier
 *    with drops but no monsters is legal, and waves.ts skips a monsterless tier
 *    entirely.
 *
 * Placement is the drop pad, not the nine spawn anchors. The anchors were the
 * first attempt and were wrong: they are chosen to be far apart so a horde
 * surrounds the party, which turned a mid-fight heal into a cross-arena run
 * through the wave that had just spawned on the same tile (playtest
 * 2026-08-28 — the 50% health and the 25% potion were never found). Every drop
 * now lands in one learnable place just inside the entrance, sorted into a
 * lane by item kind.
 *
 * One cursor per lane, carried across every tier rather than reset per tier, so
 * the 50% drops and the boss-death drops fill a column side by side instead of
 * landing on the same tile. A slot with a cover pillar on it is skipped for the
 * lane's next slot; the mask is read, never written, so cover placement is
 * unaffected and no ctx.bossRand draw moves.
 *
 * Like waves.ts, waveBuffs.ts and invulnerability.ts this module draws **no**
 * random values from any stream — not from `ctx.bossRand` either — and writes
 * no XML directly. It is built last, so switching it on only ever appends ids
 * and no existing arena seed moves.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave, WavePickup } from '../config/parameters'
import { wavePickups } from '../config/parameters'
import type { PickupLane } from '../objects/pickupTypes'
import { pickupById } from '../objects/pickupTypes'
import { NodeAreaTrigger, NodeRectangleShape, NodeSpawnObject } from '../objects/nodes'
import type { PadSlot, PickupArena } from './pickupPad'
import { pickupPad } from './pickupPad'
import type { TierSource } from './tierSource'
import { singleBossTierSource } from './tierSource'

/**
 * Re-exported so the boss arena stays the one place that talks about its own
 * drops: `arena.ts` and `tests/bossWavePickups.test.ts` import it from here,
 * and did before the shape moved next to the pad for the survival rig.
 */
export type { PickupArena }

/**
 * Builds the arena's per-tier drop rig. Emits nothing at all — not one node,
 * not one id — when no tier carries a drop, so an arena without them stays
 * byte-identical to the pre-feature output.
 *
 * A row naming an unknown item, or asking for no copies, is skipped rather than
 * thrown on; config/validation.ts is the gate.
 */
export function buildWavePickupRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  arena: PickupArena,
  entranceShape: NodeRectangleShape,
  tierSource: TierSource = singleBossTierSource()
): void {
  const carried: WavePickup[][] = waves.map((wave) =>
    wavePickups(wave).filter((entry) => pickupById(entry.item) !== undefined && entry.count > 0)
  )
  if (carried.every((entries) => entries.length === 0)) return

  const pad = pickupPad(arena.entranceCx, arena.entranceTop, arena.width, arena.height)
  const cursors: Record<PickupLane, number> = { health: 0, mana: 0, potion: 0, upgrade: 0 }

  /**
   * The next free slot in a lane. Advances past slots a cover pillar sits on,
   * and gives up after one full pass around the lane — a lane buried end to
   * end falls back to stacking on its first slot rather than dropping the item
   * on the floor of a pillar the party cannot reach.
   */
  const nextSlot = (lane: PickupLane): PadSlot => {
    const slots = pad[lane]
    for (let tried = 0; tried < slots.length; tried++) {
      const slot = slots[cursors[lane] % slots.length]
      cursors[lane] += 1
      if (isFreeFloor(arena, slot)) return slot
    }
    return slots[0]
  }

  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    // Trigger nodes are parked off the arena, one column per tier — cosmetic
    // editor markers only. The SpawnObjects DO care about position: that is
    // where the item lands.
    const col = entranceShape.x + tier
    const row = entranceShape.y

    let triggerNode
    if (tier === 0) {
      const areaTrig = new NodeAreaTrigger(ctx, col, row)
      areaTrig.connectToShape(entranceShape)
      triggerNode = areaTrig
    } else {
      triggerNode = tierSource.tierTrigger(ctx, col, row, tier)
    }

    for (const entry of entries) {
      const def = pickupById(entry.item)!
      for (let copy = 0; copy < entry.count; copy++) {
        const slot = nextSlot(def.lane)
        const spawn = new NodeSpawnObject(ctx, slot.x, slot.y, def.path)
        spawn.triggerTimes = 1
        triggerNode.connectTo(spawn)
      }
    }
  }
}

/** Whether a pad slot is walkable floor rather than a cover pillar. */
function isFreeFloor(arena: PickupArena, slot: PadSlot): boolean {
  const { walkable, width, height } = arena
  if (!walkable) return true
  if (slot.x < 0 || slot.y < 0 || slot.x >= width || slot.y >= height) return false
  return walkable[slot.x + slot.y * width] !== 0
}
