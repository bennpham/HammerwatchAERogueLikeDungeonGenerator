/**
 * Where a mystery button's plate, loot and monsters land on a finished floor.
 *
 * Pure — draws nothing. `rig.ts` spends `ctx.mysteryRand` on the pool this
 * builds; everything else (where the loot and monsters of a pressed plate go)
 * is a fixed function of the plate's tile, so it costs no draw at all.
 */

import type { Level } from '../map/level'
import type { Room } from '../map/room'
import type { GenerationContext } from '../core/context'
import type { Slot } from '../traps/slots'
import { roomInteriorSlots } from '../dungeonBoss/placement'
import { entranceReach } from '../map/reachability'

/** A candidate plate tile, remembering the room it belongs to. */
export interface ButtonSlot extends Slot {
  roomIndex: number
}

/**
 * Minimum Chebyshev gap between two plates — room for each plate's own loot
 * ring without the two rings merging into one pile.
 */
export const MYSTERY_BUTTON_SPACING = 4

/** Chebyshev distance a plate keeps from any item the floor already placed. */
const ITEM_CLEARANCE = 1

/** Chebyshev distance a plate keeps from a lock button or a floor boss's tile. */
const PLATE_CLEARANCE = 3

/**
 * Rooms a mystery plate may go in. The per-floor rigs' own `eligibleRoom`
 * (Entrance, Shop and the sealed exit room out) plus locked VAULTS: the
 * entrance flood walks through door items, so it cannot tell that a vault
 * needs a key the party may already have spent.
 */
function plateRoom(room: Room): boolean {
  if (room.type === 'Entrance' || room.type === 'Shop') return false
  if (room.sealed || room.locked) return false
  return true
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

/**
 * Every tile a mystery plate may land on, room by room in index order and
 * row-major within a room — a fixed order, so the one `iRand` per plate that
 * picks from it is the only thing the seed decides.
 *
 * A tile must be interior room floor (`roomInteriorSlots`: off the wall
 * collision, off every prefab), in a plate room, reachable from the entrance
 * with the overhang modelled, and clear of what the floor already put down —
 * the treasure, breakables, food and keys (a plate under a chest reads as a
 * bug), the lock buttons, and the floor boss's own tiles.
 */
export function mysteryButtonSlots(level: Level, ctx: GenerationContext): ButtonSlot[] {
  const reach = entranceReach(level, ctx)
  if (reach === null) return []

  const avoid: Array<{ x: number; y: number; gap: number }> = []
  for (const item of ctx.items) avoid.push({ x: Math.trunc(item.x), y: Math.trunc(item.y), gap: ITEM_CLEARANCE })
  // Read off level.lockButtons rather than scanning for BossDoorButton doodads
  // — a disguised lock button (enhanced lock buttons' per-floor tickbox) wears
  // the mystery plate's own TriggerButton art and would not be found by type,
  // but it still needs the same clearance an ordinary lock plate gets. Same
  // tiles either way, since these are exactly the coordinates buttonSeal.ts
  // drew for the doodad.
  for (const b of level.lockButtons) {
    avoid.push({ x: Math.trunc(b.x), y: Math.trunc(b.y), gap: PLATE_CLEARANCE })
  }
  for (const spot of level.bossSpots) {
    avoid.push({ x: Math.trunc(spot.x), y: Math.trunc(spot.y), gap: PLATE_CLEARANCE })
  }

  const slots: ButtonSlot[] = []
  level.rooms.forEach((room, roomIndex) => {
    if (!plateRoom(room)) return
    for (const slot of roomInteriorSlots(level, ctx, room, roomIndex)) {
      if (!reach.visited[slot.x + slot.y * level.width]) continue
      if (avoid.some((a) => chebyshev(a.x, a.y, slot.x, slot.y) <= a.gap)) continue
      slots.push({ ...slot, roomIndex })
    }
  })
  return slots
}

/**
 * Roughly how many plates the smallest floor this parameter set can roll will
 * hold — what `config/validation.ts` warns a floor's count against.
 *
 * `minRoomCount` rooms less the entrance and the exit room, each the smallest
 * `Room` can be (`minRoomSize` wide, `minRoomSize + 2` tall), whose
 * `roomSpawnBox` is then `minRoomSize - 3` tiles square, packed at
 * `MYSTERY_BUTTON_SPACING`. Deliberately optimistic — items, shops, vaults and
 * reachability only ever remove tiles — so overshooting it is a warning, and
 * the rig simply places fewer plates.
 */
export function mysteryCapacity(minRoomCount: number, minRoomSize: number): number {
  const side = Math.max(0, minRoomSize - 3)
  const perRoom = Math.ceil(side / MYSTERY_BUTTON_SPACING) ** 2
  return Math.max(0, minRoomCount - 2) * perRoom
}

/**
 * `count` tiles for a pressed plate's spawns, nearest first — zero draws.
 *
 * Candidates are the plate room's interior tiles at least `minGap` (Chebyshev)
 * from the plate and not on any plate in `plates`, ordered by squared distance
 * from the plate's centre, then y, then x (a total order, so the pick is
 * stable). They are taken greedily, each at least 2 tiles from the ones before
 * it so copies do not pile onto one tile; when the ring runs out the spacing
 * is dropped and the list cycles, so a large count still lands every copy.
 */
export function spawnTiles(
  roomSlots: readonly Slot[],
  plate: Slot,
  plates: readonly Slot[],
  minGap: number,
  count: number
): Slot[] {
  if (count <= 0) return []
  const cx = plate.x + 0.5
  const cy = plate.y + 0.5
  const candidates = roomSlots
    .filter((s) => chebyshev(s.x, s.y, plate.x, plate.y) >= minGap)
    .filter((s) => !plates.some((p) => p.x === s.x && p.y === s.y))
    .map((s) => ({ s, d: (s.x + 0.5 - cx) ** 2 + (s.y + 0.5 - cy) ** 2 }))
    .sort((a, b) => a.d - b.d || a.s.y - b.s.y || a.s.x - b.s.x)
    .map((c) => c.s)

  // A room too cramped for any tile that far out still spawns its copies —
  // on the plate itself, which is where the owner's sample put them anyway.
  if (candidates.length === 0) return Array.from({ length: count }, () => ({ x: plate.x, y: plate.y }))

  // Spaced picks first, then the rest of the ring in the same order, then
  // round again — every tile is used once before any is used twice.
  const spaced: Slot[] = []
  for (const c of candidates) {
    if (spaced.length >= count) break
    if (spaced.every((t) => chebyshev(t.x, t.y, c.x, c.y) >= 2)) spaced.push(c)
  }
  const ring = [...spaced, ...candidates.filter((c) => !spaced.includes(c))]
  const out: Slot[] = []
  for (let i = 0; i < count; i++) out.push(ring[i % ring.length])
  return out
}
