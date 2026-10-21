import type { WallGrid } from './aeWalls'

/**
 * Anniversary Edition wall-top cover: the set's `__color_N` squares, flat
 * theme-coloured fill (layer 10, over walls and actors, x-ray masked) that
 * makes the solid mass read as the top of the wall, hides the faces of rooms'
 * south walls behind their cap edge, and covers everything off the map.
 *
 * The rule, measured on Castle's stock levels (DISCOVERY-LOG "Wall-top
 * cover"): take the solid mass, lift it 32 px (a wall's art is its footprint
 * drawn 32 px higher), and pull its edge 8 px in. So colour starts 24 px above
 * a room's south wall line and ends 24 px above a room's north wall line, and
 * covers half a vertical wall's strip. In cells it is HW1's `Cover` rule two
 * rows up: the 16-px square centred on the corner of drawn cells (x, y) and
 * (x+1, y+1) is coloured when cells (x, y+2)…(x+1, y+3) are all solid.
 *
 * Coordinates are px in the grid's own space (cell × 16). Pure: no RNG, no I/O.
 */

export interface CoverRect {
  /** px; any alignment, rounded outward to the 8-px lattice */
  x: number
  y: number
  w: number
  h: number
}

export interface CoverUnit {
  path: string
  /** px, the unit's anchor (the square's bottom-left corner: origin `0 N`) */
  x: number
  y: number
  /** edge length in px */
  size: number
}

/** The square sizes every coloured wall set ships, largest first. */
export const COVER_SIZES = [1024, 512, 256, 128, 96, 64, 48, 32, 16, 8] as const

/** How far past the map the cover reaches, in cells: more than half a screen. */
export const COVER_MARGIN = 32

const SUB = 8
/** A wall's art is its footprint drawn this many 8-px rows higher. */
const LIFT = 4

export function coverUnitPath(walls: string, size: number): string {
  return `doodads/walls/${walls}/__color_${size}.unit`
}

/**
 * The cover squares for `g`. Returns nothing for a wall set without colour
 * pieces (the flat bonus sets; stock bonus levels have none either).
 *
 * Squares are greedy and may overlap (the fill is opaque and one colour): each
 * covered 8-px subcell not yet painted starts the largest square that lies
 * wholly inside the covered region. Every loop is bounded by the lattice.
 */
export function placeCover(
  g: WallGrid,
  walls: string,
  exists: (path: string) => boolean,
  opts: { marginCells?: number; exclude?: readonly CoverRect[] } = {}
): CoverUnit[] {
  const sizes = COVER_SIZES.filter((s) => exists(coverUnitPath(walls, s)))
  if (!sizes.includes(SUB)) return []
  const margin = opts.marginCells ?? COVER_MARGIN

  // lattice of 8-px subcells over the drawn box (columns -margin..width+margin,
  // rows lifted two cells), started half a cell in: the covered region comes
  // in 2×2 blocks of subcells on that odd phase, so with every square even
  // (16 px and up) and anchored on it, no 8-px sliver is ever needed except
  // at an exclusion. Anchors land at (8, 8) mod 16, as stock's mostly do.
  const i0 = -margin * 2 + 1
  const j0 = (-margin - 2) * 2 + 1
  const W = (g.width + margin * 2) * 2 - 2
  const H = (g.height + margin * 2) * 2 - 2
  const solid = (cx: number, cy: number) => g.solid(cx, cy)
  const half = (k: number) => Math.floor(k / 2)

  const mask = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) {
    // the collision-space subcell rows either side of this one
    const r = j0 + j + LIFT
    const ya = half(r - 1)
    const yb = half(r + 1)
    for (let i = 0; i < W; i++) {
      const c = i0 + i
      const xa = half(c - 1)
      const xb = half(c + 1)
      if (solid(xa, ya) && solid(xb, ya) && solid(xa, yb) && solid(xb, yb)) mask[i + j * W] = 1
    }
  }

  for (const e of opts.exclude ?? []) {
    const ia = Math.max(0, Math.floor(e.x / SUB) - i0)
    const ib = Math.min(W, Math.ceil((e.x + e.w) / SUB) - i0)
    const ja = Math.max(0, Math.floor(e.y / SUB) - j0)
    const jb = Math.min(H, Math.ceil((e.y + e.h) / SUB) - j0)
    for (let j = ja; j < jb; j++) for (let i = ia; i < ib; i++) mask[i + j * W] = 0
  }

  // prefix sums: sum[(i) + (j) * (W + 1)] = covered subcells in [0, i) × [0, j)
  const W1 = W + 1
  const sum = new Int32Array(W1 * (H + 1))
  for (let j = 0; j < H; j++) {
    let row = 0
    for (let i = 0; i < W; i++) {
      row += mask[i + j * W]
      sum[i + 1 + (j + 1) * W1] = sum[i + 1 + j * W1] + row
    }
  }
  const full = (i: number, j: number, n: number) =>
    i + n <= W &&
    j + n <= H &&
    sum[i + n + (j + n) * W1] - sum[i + (j + n) * W1] - sum[i + n + j * W1] + sum[i + j * W1] === n * n

  const out: CoverUnit[] = []
  const painted = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (mask[i + j * W] === 0 || painted[i + j * W] === 1) continue
      // the 8-px piece always fits: this subcell is covered
      const size = sizes.find((s) => full(i, j, s / SUB)) ?? SUB
      const n = size / SUB
      for (let jj = j; jj < j + n; jj++) painted.fill(1, i + jj * W, i + n + jj * W)
      out.push({ path: coverUnitPath(walls, size), x: (i0 + i) * SUB, y: (j0 + j + n) * SUB, size })
    }
  }
  return out
}
