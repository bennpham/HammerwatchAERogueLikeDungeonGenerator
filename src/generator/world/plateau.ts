/**
 * Raised plateaus inside the island: patches of high ground ringed by the
 * same cliff pieces as the coast, climbed by stairs cut into a south face.
 *
 * The cliff sets are plateau edges to begin with (`coast.ts`), so a plateau
 * is the coast again, one level up: its own land mask, built and cleaned by
 * `buildIsland` in a small window, its rim from `coastUnits` with the low
 * ground standing in for the water. Stock closes a plateau with the pieces'
 * own collision and no fence (Shaftlocke `town.lvl`), so none is added here.
 *
 * The only stock walk-up is `_stairs`: an `s_32` with a 16-px walkway between
 * two walls (town.lvl has one). Ramps are never used in stock, and granite's
 * stairs and ramp art is broken, so plateaus use stairs only, from a set in
 * `PLATEAU_EDGE_SETS`.
 *
 * On the grid: plateau land is `HIGH`; its rim cells are `CLIFF`, and so are
 * the two low rows a south face hangs over. Each stairway's cells are open
 * again and `RESERVED`, with a landing kept clear above and below.
 *
 * Bounded: each plateau gets `PLATEAU_TRIES` tries; one that doesn't fit is
 * left out, as scatter is.
 */

import type { Rand } from '../core/rand'
import type { WorldDef } from './options'
import { worldTerrain } from './options'
import { buildIsland } from './island'
import { coastPiece, coastUnits } from './coast'
import type { CoastUnit } from './coast'
import { WorldGrid, dist2 } from './grid'
import type { Tile } from './grid'

/** Low ground kept between a plateau and the coast, the hub or another plateau, in tiles. */
export const PLATEAU_GAP = 4
const PLATEAU_TRIES = 30
/** Water (here: low ground) round a plateau inside its window, as `buildIsland`'s margin. */
const WINDOW_MARGIN = 2
/** Land always kept round a plateau's centre. */
const PLATEAU_CORE = 3
/** How ragged a plateau's rim is, as a world's `coast`. */
const PLATEAU_COAST = 50
/** Tiles between two stairways on one plateau. */
const STAIR_SPACING = 4

/**
 * Raise `def`'s plateaus on `grid` with cliff pieces from `set`, and return
 * the pieces to emit (after every object, with the coast's).
 */
export function placePlateaus(rand: Rand, grid: WorldGrid, def: WorldDef, set: string): CoastUnit[] {
  const terrain = worldTerrain(def)
  const out: CoastUnit[] = []
  for (let p = 0; p < terrain.plateaus; p++) {
    for (let t = 0; t < PLATEAU_TRIES; t++) {
      const units = tryPlateau(rand, grid, set, rand.iRand(terrain.minSize, terrain.maxSize + 1), terrain.stairs)
      if (units === null) continue
      out.push(...units)
      break
    }
  }
  return out
}

function tryPlateau(rand: Rand, grid: WorldGrid, set: string, size: number, stairs: number): CoastUnit[] | null {
  const span = size + 2 * WINDOW_MARGIN
  const ox = rand.iRand(0, grid.width - span)
  const oy = rand.iRand(0, grid.height - span)
  const mask = buildIsland(rand, span, span, WINDOW_MARGIN, PLATEAU_COAST, PLATEAU_CORE)
  if (mask === null) return null
  const isHigh = (x: number, y: number) => x >= 0 && y >= 0 && x < span && y < span && mask.land[y * span + x] === 1

  // every high cell, and the gap round it, over open low ground
  const low = (x: number, y: number) =>
    grid.walkable(x, y) && !grid.has(x, y, WorldGrid.RESERVED | WorldGrid.HIGH | WorldGrid.TRAIL)
  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      if (isHigh(x, y) && !grid.discAll({ x: ox + x, y: oy + y }, PLATEAU_GAP, low)) return null
    }
  }

  const units = coastUnits(set, span, span, mask.land).map((u) => ({ ...u, x: u.x + ox * 16, y: u.y + oy * 16 }))

  // stairways: an `s_32` under plateau top, over the low ground
  const candidates: Array<{ unit: CoastUnit; at: Tile }> = []
  for (const unit of units) {
    if (!unit.path.endsWith('/s_32.unit')) continue
    const x = unit.x / 16 - ox
    const y = unit.y / 16 - 3 - oy
    const top = [x, x + 1].every((cx) => isHigh(cx, y - 1) && coastPiece(isHigh, cx, y - 1) === 'inland')
    if (top) candidates.push({ unit, at: { x: ox + x, y: oy + y } })
  }
  const chosen: Array<{ unit: CoastUnit; at: Tile }> = []
  while (chosen.length < stairs && candidates.length > 0) {
    const [c] = candidates.splice(rand.nextInt(candidates.length), 1)
    if (chosen.every((s) => dist2(s.at, c.at) >= STAIR_SPACING * STAIR_SPACING)) chosen.push(c)
  }
  if (chosen.length === 0) return null

  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      if (!isHigh(x, y)) continue
      const gx = ox + x
      const gy = oy + y
      grid.set(gx, gy, WorldGrid.HIGH)
      const piece = coastPiece(isHigh, x, y)
      if (piece === 'inland') continue
      grid.set(gx, gy, WorldGrid.CLIFF)
      // a south face hangs over the two low rows below its lip
      if (piece === 's' || piece === 'se' || piece === 'sw') {
        grid.set(gx, gy + 1, WorldGrid.CLIFF)
        grid.set(gx, gy + 2, WorldGrid.CLIFF)
      }
    }
  }
  for (const { unit, at } of chosen) {
    unit.path = unit.path.replace(/s_32\.unit$/, '_stairs.unit')
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        grid.clear(at.x + dx, at.y + dy, WorldGrid.CLIFF)
        grid.set(at.x + dx, at.y + dy, WorldGrid.RESERVED)
      }
    }
  }
  return units
}
