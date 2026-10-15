/**
 * Timed item drops — `boss/wavePickups.ts` re-keyed to the clock.
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        └─ delay atSeconds*1000 ─> SpawnObject{trigger-times: 1} × copies
 *
 * Everything that makes the boss version what it is carries over unchanged, and
 * is worth restating because each part has a reason:
 *
 * - **A count is copies, not `trigger-times`.** A SpawnObject spawns one actor
 *   per incoming trigger and the clock fires once, so `trigger-times: 4` on one
 *   node would drop one item and bank three. Four copies means four nodes.
 * - **Placement is the entrance drop pad** (`boss/pickupPad.ts`), never the
 *   nine spawn anchors: the anchors are chosen to be far apart so a horde
 *   surrounds the party, which is exactly wrong for a resupply they have to
 *   walk to (playtest 2026-08-28).
 * - **One cursor per lane, carried across every entry** rather than reset per
 *   entry, so a 0:30 drop and a 2:00 drop fill a column side by side instead of
 *   landing on the same tile. The reachability mask is READ, never written, so
 *   no pillar moves and no `ctx.bossRand` draw shifts.
 *
 * Drops never replace one another — an item is an object on the floor, and the
 * health nobody collected at 0:30 is still lying there at 2:00 — so unlike the
 * buff and trap windows there is nothing to switch off and no end timestamp.
 *
 * Draws no random values from any stream.
 */

import type { GenerationContext } from '../core/context'
import type { SurvivalPickup } from '../config/parameters'
import type { PickupLane } from '../objects/pickupTypes'
import { pickupById } from '../objects/pickupTypes'
import { NodeGlobalEventTrigger, NodeSpawnObject } from '../objects/nodes'
import type { PadSlot, PickupArena } from '../boss/pickupPad'
import { pickupPad } from '../boss/pickupPad'

/**
 * Builds the arena's timed drops. Emits nothing at all when no entry is usable.
 * An entry naming an unknown item, or asking for no copies, is skipped rather
 * than thrown on; `config/validation.ts` is the gate.
 */
export function buildSurvivalPickupRig(
  ctx: GenerationContext,
  entries: readonly SurvivalPickup[],
  arena: PickupArena,
  clock: NodeGlobalEventTrigger
): void {
  const usable = entries.filter((entry) => pickupById(entry.item) !== undefined && entry.count > 0)
  if (usable.length === 0) return

  const pad = pickupPad(arena.entranceCx, arena.entranceTop, arena.width, arena.height)
  const cursors: Record<PickupLane, number> = { health: 0, mana: 0, potion: 0, upgrade: 0 }

  /**
   * The next free slot in a lane. Advances past slots a cover pillar sits on,
   * and gives up after one full pass — a lane buried end to end stacks on its
   * first slot rather than dropping an item under a pillar.
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

  for (const entry of usable) {
    const def = pickupById(entry.item)!
    for (let copy = 0; copy < entry.count; copy++) {
      const slot = nextSlot(def.lane)
      const spawn = new NodeSpawnObject(ctx, slot.x, slot.y, def.path)
      spawn.triggerTimes = 1
      clock.connectTo(spawn, entry.atSeconds * 1000)
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
