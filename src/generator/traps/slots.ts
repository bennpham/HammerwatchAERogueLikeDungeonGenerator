/**
 * Shared spewer primitives — the parts of trap placement that are the same
 * whether the wall belongs to a boss arena or an ordinary dungeon room.
 *
 * All of this was `boss/traps.ts`'s, and every constant in it was paid for by a
 * playtest; the provenance comments are kept verbatim because they are the
 * reason the numbers are what they are. What stayed behind in `boss/traps.ts`
 * is the arena's own geometry (its four walls, its entrance strip, its alcove
 * mouth); what moved here is everything a room wall needs too.
 *
 * The one deliberate change is `takeSlot`, which now takes a `Rand` rather than
 * a `GenerationContext`: the arena passes `ctx.bossRand` and the floor rig
 * passes `ctx.trapRand`. Passing `ctx.bossRand` makes exactly the draw the
 * arena always made, so the extraction moves no seed — `tests/bossTraps.test.ts`
 * passing untouched is the proof.
 */

import type { Rand } from '../core/rand'
import type { BossTrapDirection } from '../config/parameters'

/**
 * The engine's `direction` parameter. [VERIFIED] 2026-09-01 from
 * `campaign/levels/level_10.xml` ids 2579-2582 — four spewers ringing the point
 * (-31.5, -6), each offset one tile in the direction it fires: the one below
 * centre is 1, the one to the right 3, to the left 2, above 0. Confirmed
 * against the same level's second cluster and `level_temple_3.xml`, and then
 * [VERIFIED] in game 2026-09-02 by firing all four from a generated arena: the
 * file-derived mapping needed no correction.
 */
export const SPEWER_DIRECTION: Record<BossTrapDirection, number> = {
  up: 0,
  down: 1,
  left: 2,
  right: 3
}

/**
 * Tiles kept clear at each end of a wall. Two, because the wall band can itself
 * be two tiles thick (theme h) and a spewer in the corner would fire along the
 * adjacent band rather than across the room.
 */
export const TRAP_WALL_MARGIN = 2

/** Minimum gap between two spewers on the same wall. */
export const TRAP_MIN_SPACING = 2

/**
 * Half a tile, added to both axes of every spewer's emitted position.
 *
 * An integer coordinate in this dialect is a tile CORNER, not a tile centre —
 * `objects/doodad.ts` says the same thing in the other direction, giving every
 * floor-anchored piece (Cover, BossDoorButton, Torch) an `xOffset`/`yOffset` of
 * 0.5 to sit it in the middle of its tile, and the shipped campaign places its
 * actors on half coordinates (`level_boss_4.xml`'s dragon at `-5 -26.5`).
 *
 * A node in the middle of a room does not care: the wave rig, the pickups and
 * the spawn points all emit raw integers and land visibly inside a tile. A
 * spewer is the first thing this generator puts *against* a wall, and there the
 * corner is the whole problem — at interior column 0 the point sits exactly on
 * the boundary with the wall band at column -1, so the projectile is born
 * inside collision and is eaten on the spot.
 *
 * [VERIFIED] 2026-09-02 in game: the traps on the two minimum-edge walls fired
 * but their projectiles were intercepted immediately; the maximum-edge walls
 * (whose corner point falls between two interior tiles) played correctly. With
 * the half-tile applied, all four walls fire cleanly.
 */
export const TILE_CENTRE = 0.5

/** The four walls, named by the direction a trap on them fires. */
export const WALLS: readonly BossTrapDirection[] = ['up', 'down', 'left', 'right']

/** One legal mounting tile, in the coordinates of whatever enumerated it. */
export interface Slot {
  x: number
  y: number
}

/**
 * Takes one slot from `pool` at a seeded index, and removes every slot within
 * TRAP_MIN_SPACING of it so the next spewer cannot crowd it. Exactly one
 * `iRand` draw.
 *
 * `rand` rather than a context: the arena draws from `ctx.bossRand` and a
 * dungeon floor from `ctx.trapRand`, and neither may ever reach the other's.
 *
 * The manhattan prune is deliberately blind to which wall — or which room — a
 * slot came from. Within one wall it is the spacing rule; across rooms it never
 * bites, because two rooms are `roomPadding` plus two wall bands apart.
 */
export function takeSlot(rand: Rand, pool: Slot[]): Slot {
  const index = rand.iRand(0, pool.length)
  const chosen = pool[index]
  for (let i = pool.length - 1; i >= 0; i--) {
    const gap = Math.abs(pool[i].x - chosen.x) + Math.abs(pool[i].y - chosen.y)
    if (gap < TRAP_MIN_SPACING) pool.splice(i, 1)
  }
  return chosen
}

/**
 * `takeSlot` with a square exclusion instead of the manhattan one: one `iRand`
 * draw, then every slot within Chebyshev distance `< gap` of the chosen one is
 * removed. For things that occupy floor rather than a wall line — a mystery
 * button's plate and the loot around it — where the manhattan-2 prune would
 * still let two plates touch diagonally.
 */
export function takeSpacedSlot<T extends Slot>(rand: Rand, pool: T[], gap: number): T {
  const index = rand.iRand(0, pool.length)
  const chosen = pool[index]
  for (let i = pool.length - 1; i >= 0; i--) {
    if (Math.max(Math.abs(pool[i].x - chosen.x), Math.abs(pool[i].y - chosen.y)) < gap) pool.splice(i, 1)
  }
  return chosen
}

/**
 * How many spewers a wall of this size can hold — what `config/validation.ts`
 * checks trap counts against before generation. Assumes an empty floor:
 * pillars, prefabs and doorways can only ever reduce it, which is why running
 * the pool dry is a warning's job and not an error's.
 */
export function wallCapacity(width: number, height: number, direction: BossTrapDirection): number {
  const vertical = direction === 'left' || direction === 'right'
  const span = vertical ? height : width
  const usable = span - 2 * TRAP_WALL_MARGIN
  if (usable <= 0) return 0
  return Math.max(1, Math.ceil(usable / TRAP_MIN_SPACING))
}
