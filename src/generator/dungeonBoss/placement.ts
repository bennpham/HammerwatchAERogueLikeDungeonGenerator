/**
 * Where a dungeon boss and its wave monsters stand — free INTERIOR floor tiles
 * of a finished level.
 *
 * Nothing in the repo enumerated these before. `traps/floor.ts` finds
 * wall-ADJACENT slots, because a spewer stands on the wall it fires away from;
 * a wave monster lands anywhere the party could. The test for "this tile is
 * genuinely open floor" is the same one either way, and it is already written
 * out inside `slotClear`'s inner loop — this is that test, applied over a
 * rectangle instead of along a line:
 *
 *   - not `tile.wall` (rasterized solid) and not `tile.wallSet` (a prefab
 *     claimed it and brought its own walls);
 *   - `regionMap[idx] === roomIndex`, so a corridor's overlapping tail does not
 *     count as room floor — `Room.contains` is INCLUSIVE at both ends, and a
 *     passage's last cells sit inside the room it arrives at;
 *   - clear of every `ObjectSet`'s footprint AND its wall rect, which are
 *     different rectangles, so the stairs, the shop and the portal are all out.
 *
 * Plus the one thing a rectangle scan needs that a wall scan got for free: a
 * margin. The scan runs over `roomSpawnBox` (map/room.ts), the original's own
 * Lair-spawner box, not the raw room rectangle. A tile can be open floor in the
 * tile map and still be inside a wall's collision — the row under the north
 * wall art, the column beside the west wall, the rows above the south wall —
 * and a monster spawned there cannot move. That was every stuck wave spawn in
 * the 2026-09-22 playtest; the box's north inset also covers the overhang
 * `map/reachability.ts` models.
 *
 * Pure — draws nothing. The caller spends the stream.
 */

import type { Level } from '../map/level'
import type { Room } from '../map/room'
import { roomSpawnBox } from '../map/room'
import type { GenerationContext } from '../core/context'
import type { Slot } from '../traps/slots'
import { eligibleRoom, inBounds } from '../traps/floor'

/**
 * Every free interior tile of one room, in row-major order.
 *
 * `roomIndex` is the room's position in `level.rooms`, which is what
 * `regionMap` stores — passing the wrong one silently yields nothing.
 */
export function roomInteriorSlots(
  level: Level,
  ctx: GenerationContext,
  room: Room,
  roomIndex: number
): Slot[] {
  const slots: Slot[] = []
  const box = roomSpawnBox(room)

  // Inclusive, like the box itself. A room too small for it yields nothing.
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (!interiorClear(level, ctx, roomIndex, x, y)) continue
      slots.push({ x, y })
    }
  }

  return slots
}

/**
 * Every free interior tile of every eligible room on the floor, walked in room
 * index order.
 *
 * One flat pool, exactly as `traps/floor.ts` pools its wall slots: bigger rooms
 * contribute more tiles and so attract proportionally more of whatever is dealt
 * over it, which is the behaviour a dungeon master expects from "spread them
 * across the floor".
 */
export function floorInteriorSlots(level: Level, ctx: GenerationContext): Slot[] {
  const slots: Slot[] = []
  level.rooms.forEach((room, roomIndex) => {
    if (!eligibleRoom(room)) return
    slots.push(...roomInteriorSlots(level, ctx, room, roomIndex))
  })
  return slots
}

/** Whether one tile is this room's own open floor, unclaimed by any prefab. */
function interiorClear(
  level: Level,
  ctx: GenerationContext,
  roomIndex: number,
  x: number,
  y: number
): boolean {
  if (!inBounds(level, x, y)) return false

  const idx = x + y * level.width
  const tile = level.tileArray[idx]
  if (tile === undefined || tile.wall || tile.wallSet) return false
  if (level.regionMap[idx] !== roomIndex) return false

  for (const set of ctx.objectSets) {
    if (set.contains(x, y) || set.containsWall(x, y)) return false
  }

  return true
}
