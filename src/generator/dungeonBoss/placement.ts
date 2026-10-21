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
 *   - not `tile.wall` (rasterized solid) and not `tile.reserved` (a prefab
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
import { entranceReach } from '../map/reachability'
import { STATUE_MAX_GAP } from '../boss/statue'

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

/**
 * Rows a statue keeps above a room's last floor row: the south wall's art
 * covers that row and the one above it (room.ts visibleDropY), as for a
 * mystery plate.
 */
const STATUE_SOUTH_ROWS = 3

/**
 * Where a boss's statue stands (`boss/statue.ts`): a free interior tile the
 * party can walk to, off the boss and everything else the floor put down.
 * Draws nothing.
 *
 * The boss's own room first, on the tile farthest from the boss but within
 * `STATUE_MAX_GAP` (first in row-major order on ties): set apart, as stock's
 * are, yet close enough that the party breaking it is inside the wraith's
 * update range (`boss/statue.ts`). A room with no such tile falls back to the
 * nearest one in any other room the party can enter. Each tries a three-tile
 * gap from the boss, then two; the boss's room then lets the statue stand
 * right beside its loot. `avoid` is the tiles already taken
 * by other bosses' statues. Null only for a floor with no free interior tile
 * at all.
 */
export function statueSlot(
  level: Level,
  ctx: GenerationContext,
  boss: { x: number; y: number },
  avoid: ReadonlyArray<{ x: number; y: number }>
): Slot | null {
  const reach = entranceReach(level, ctx)
  const bossRoom = level.regionMap[boss.x + boss.y * level.width] ?? -1

  const items = ctx.items.map((item) => ({ x: Math.trunc(item.x), y: Math.trunc(item.y) }))
  const taken: Array<{ x: number; y: number; gap: number }> = []
  for (const b of level.lockButtons) taken.push({ x: Math.trunc(b.x), y: Math.trunc(b.y), gap: 2 })
  // the other bosses; this boss's own distance is `minGap` below
  for (const s of level.bossSpots) {
    if (Math.trunc(s.x) !== boss.x || Math.trunc(s.y) !== boss.y) taken.push({ x: Math.trunc(s.x), y: Math.trunc(s.y), gap: 2 })
  }
  for (const s of avoid) taken.push({ x: s.x, y: s.y, gap: 2 })

  const candidates = (room: Room, roomIndex: number, minGap: number, itemGap: number): Slot[] =>
    roomInteriorSlots(level, ctx, room, roomIndex).filter(
      (s) =>
        s.y <= room.y + room.height - STATUE_SOUTH_ROWS &&
        (reach === null || reach.visited[s.x + s.y * level.width] === 1) &&
        chebyshev(s, boss) >= minGap &&
        !items.some((t) => chebyshev(s, t) <= itemGap) &&
        !taken.some((t) => chebyshev(s, t) <= t.gap)
    )

  // A loot-packed room may leave no tile a clear tile from every item; the
  // last pass only keeps the statue off the items' own tiles.
  for (const [minGap, itemGap] of [[3, 1], [2, 1], [2, 0]]) {
    const room = level.rooms[bossRoom]
    if (room === undefined) break
    let best: Slot | null = null
    for (const s of candidates(room, bossRoom, minGap, itemGap)) {
      if (chebyshev(s, boss) > STATUE_MAX_GAP) continue
      if (best === null || chebyshev(s, boss) > chebyshev(best, boss)) best = s
    }
    if (best !== null) return best
  }

  for (const minGap of [3, 2]) {
    let best: Slot | null = null
    level.rooms.forEach((room, roomIndex) => {
      if (roomIndex === bossRoom || !eligibleRoom(room) || room.locked) return
      for (const s of candidates(room, roomIndex, minGap, 1)) {
        if (best === null || chebyshev(s, boss) < chebyshev(best, boss)) best = s
      }
    })
    if (best !== null) return best
  }

  return null
}

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
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
  if (tile === undefined || tile.wall || tile.reserved) return false
  if (level.regionMap[idx] !== roomIndex) return false

  for (const set of ctx.objectSets) {
    if (set.contains(x, y) || set.containsWall(x, y)) return false
  }

  return true
}
