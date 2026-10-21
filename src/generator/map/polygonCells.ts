/**
 * Which cells of a grid a collision polygon blocks.
 *
 * AE fences a level with `:Physics_Freeform` polygons (state `points`, relative
 * to the unit), and a unit file's `<collision>` can hold `<polygon>`s. Stock
 * polygons are not always simple: the crystal mines shop's rounded corners
 * double back on themselves. An even-odd fill opens a hole wherever a polygon
 * overlaps itself, so a cell is blocked when its centre has a non-zero winding
 * number OR any edge passes through it. The edges alone already make a wall a
 * 4-connected fill can't cross.
 *
 * Pure, used by the crystal shop's cleanup (lobby/crystalShop.ts) and the
 * closure check (tests/closure.ts).
 */

export type Point = readonly [number, number]

/** A grid of `cell`-px squares from (x0, y0), `w` × `h` cells. */
export interface CellGrid {
  x0: number
  y0: number
  cell: number
  w: number
  h: number
}

/** The winding number of a closed polygon round a point; 0 is outside. */
export function windingNumber(pts: readonly Point[], px: number, py: number): number {
  let wn = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay)
    if (ay <= py) {
      if (by > py && side > 0) wn++
    } else if (by <= py && side < 0) wn--
  }
  return wn
}

/** Call `mark` with the index (`cx + cy * w`) of every grid cell the polygon blocks. */
export function polygonCells(pts: readonly Point[], g: CellGrid, mark: (i: number) => void): void {
  if (pts.length < 2) return
  const at = (x: number, y: number): number => {
    const cx = Math.floor((x - g.x0) / g.cell)
    const cy = Math.floor((y - g.y0) / g.cell)
    return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h ? cx + cy * g.w : -1
  }
  // the edges: sampled at an eighth of a cell, so every cell a segment crosses
  // by more than a sliver is hit, and consecutive hits share a side or corner
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    const steps = Math.max(1, Math.ceil((Math.hypot(bx - ax, by - ay) * 8) / g.cell))
    for (let s = 0; s <= steps; s++) {
      const k = at(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps)
      if (k >= 0) mark(k)
    }
  }
  // the inside, by winding number, over the polygon's bounding cells
  const xs = pts.map(([x]) => x)
  const ys = pts.map(([, y]) => y)
  const cx0 = Math.max(0, Math.floor((Math.min(...xs) - g.x0) / g.cell))
  const cy0 = Math.max(0, Math.floor((Math.min(...ys) - g.y0) / g.cell))
  const cx1 = Math.min(g.w - 1, Math.floor((Math.max(...xs) - g.x0) / g.cell))
  const cy1 = Math.min(g.h - 1, Math.floor((Math.max(...ys) - g.y0) / g.cell))
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (windingNumber(pts, g.x0 + (cx + 0.5) * g.cell, g.y0 + (cy + 0.5) * g.cell) !== 0) mark(cx + cy * g.w)
    }
  }
}
