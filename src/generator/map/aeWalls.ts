import type { ThemeDef } from '../config/themes'

/**
 * Anniversary Edition wall placement.
 *
 * Works on the generator's solid/floor grid (16-px cells) and emits AE wall
 * units. The model, measured against stock levels with
 * `scripts/render-level.mjs` (DISCOVERY-LOG "Walls"):
 *
 * - A wall is a LINE of footprint cells: every solid cell that touches floor
 *   (8-neighbourhood) carries exactly one piece whose collision is that cell.
 *   The piece's art is the footprint drawn 32 px higher; south-facing pieces
 *   add a face that fills the two cells between.
 * - Which piece goes on a cell is decided by which orthogonal neighbours it
 *   CONNECTS to (`connectionMask`), and AE encodes that same connectivity in
 *   each piece's collision extensions: `crn_nw` reaches east and south, `x_n`
 *   west, east and south, and so on — see `PIECE_BY_MASK`.
 * - Straight runs merge into 32-px pieces. Vertical pieces anchor ONE ROW
 *   ABOVE their footprint (`v_32`'s collision is `0 16 16 32`).
 *
 * Reserved cells are part of the wall line — their neighbours connect to them
 * — but get no piece: an exit's doorway, whose art (`exit_up`/`exit_dn`)
 * supplies its own collision one row higher.
 *
 * Pure: no RNG, no I/O. The piece-availability lookup is passed in so this
 * module needs no asset snapshot.
 */

export interface WallGrid {
  width: number
  height: number
  /** solid rock/wall; out-of-bounds counts as solid */
  solid(x: number, y: number): boolean
  /** a wall-line cell that gets no piece (exit doorways) */
  reserved(x: number, y: number): boolean
}

export interface WallUnit {
  path: string
  /** AE pixels */
  x: number
  y: number
  /** the footprint cell this unit was placed for (top-left cell of a 32-px run piece) */
  cellX: number
  cellY: number
  piece: string
}

export const N = 1
export const E = 2
export const S = 4
export const W = 8

/** Logical piece per connection mask (runs are handled separately). */
const PIECE_BY_MASK: Record<number, string> = {
  0: 'single',
  [E]: 'cap_h_w',
  [W]: 'cap_h_e',
  [S]: 'cap_v_n',
  [N]: 'cap_v_s',
  [E | S]: 'crn_nw',
  [W | S]: 'crn_ne',
  [E | N]: 'crn_sw',
  [W | N]: 'crn_se',
  [W | E | S]: 'x_n',
  [W | E | N]: 'x_s',
  [W | N | S]: 'x_e',
  [E | N | S]: 'x_w',
  [N | E | S | W]: 'x_x'
}

/**
 * Unit candidates per logical piece, best first, with a cell offset for the
 * anchor. New-style sets ship `h_32`/`cap_h_*`; legacy sets (archives,
 * chambers, battlement, mines…) ship `h`/`cap_*`/`single`; the bonus sets have
 * no corners or junctions at all and fall back to `x_x`.
 */
const CANDIDATES: Record<string, Array<{ unit: string; dy: number }>> = {
  h_32: [
    { unit: 'h_32', dy: 0 },
    { unit: 'h', dy: 0 }
  ],
  h_16: [{ unit: 'h_16', dy: 0 }],
  v_32: [
    { unit: 'v_32', dy: -1 },
    { unit: 'v', dy: -1 }
  ],
  v_16: [{ unit: 'v_16', dy: -1 }],
  single: [
    { unit: 'h_single', dy: 0 },
    { unit: 'single', dy: 0 },
    { unit: 'x_x', dy: 0 }
  ],
  cap_h_w: [
    { unit: 'cap_h_w', dy: 0 },
    { unit: 'cap_w', dy: 0 },
    { unit: 'h_16', dy: 0 }
  ],
  cap_h_e: [
    { unit: 'cap_h_e', dy: 0 },
    { unit: 'cap_e', dy: 0 },
    { unit: 'h_16', dy: 0 }
  ],
  cap_v_n: [
    { unit: 'cap_v_n', dy: 0 },
    { unit: 'cap_n', dy: 0 },
    { unit: 'x_x', dy: 0 }
  ],
  cap_v_s: [
    { unit: 'cap_v_s', dy: 0 },
    { unit: 'cap_s', dy: 0 },
    { unit: 'single', dy: 0 },
    { unit: 'x_x', dy: 0 }
  ]
}
for (const p of ['crn_nw', 'crn_ne', 'crn_sw', 'crn_se', 'x_n', 'x_s', 'x_e', 'x_w']) {
  CANDIDATES[p] = [
    { unit: p, dy: 0 },
    { unit: 'x_x', dy: 0 }
  ]
}
CANDIDATES.x_x = [{ unit: 'x_x', dy: 0 }]

export function wallUnitPath(walls: string, unit: string): string {
  return `doodads/walls/${walls}/${unit}.unit`
}

/** The unit (and anchor offset) a logical piece resolves to for this wall set, or null. */
export function resolvePiece(
  walls: string,
  piece: string,
  exists: (path: string) => boolean
): { path: string; dy: number; unit: string } | null {
  for (const c of CANDIDATES[piece] ?? []) {
    const path = wallUnitPath(walls, c.unit)
    if (exists(path)) return { path, dy: c.dy, unit: c.unit }
  }
  return null
}

function isFloor(g: WallGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false
  return !g.solid(x, y)
}

function isSolid(g: WallGrid, x: number, y: number): boolean {
  return !isFloor(g, x, y)
}

/** A wall-line cell: solid and touching floor on any of its 8 sides, or reserved. */
export function isLineCell(g: WallGrid, x: number, y: number): boolean {
  if (!isSolid(g, x, y)) return false
  if (x >= 0 && y >= 0 && x < g.width && y < g.height && g.reserved(x, y)) return true
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx !== 0 || dy !== 0) && isFloor(g, x + dx, y + dy)) return true
    }
  }
  return false
}

/**
 * Which orthogonal neighbours a line cell connects to. Two adjacent line cells
 * connect only if floor flanks the pair — so two parallel wall lines one cell
 * apart (a two-thick wall between rooms) do not fuse into a ladder of
 * junctions.
 */
export function connectionMask(g: WallGrid, x: number, y: number): number {
  let mask = 0
  const linked = (bx: number, by: number, flanks: Array<[number, number]>) =>
    isLineCell(g, bx, by) && flanks.some(([fx, fy]) => isFloor(g, fx, fy))
  if (linked(x + 1, y, [[x, y - 1], [x + 1, y - 1], [x, y + 1], [x + 1, y + 1]])) mask |= E
  if (linked(x - 1, y, [[x, y - 1], [x - 1, y - 1], [x, y + 1], [x - 1, y + 1]])) mask |= W
  if (linked(x, y + 1, [[x - 1, y], [x - 1, y + 1], [x + 1, y], [x + 1, y + 1]])) mask |= S
  if (linked(x, y - 1, [[x - 1, y], [x - 1, y - 1], [x + 1, y], [x + 1, y - 1]])) mask |= N
  return mask
}

/**
 * Every wall unit for the grid. Deterministic: scans row-major and emits in
 * that order. Cells whose piece the set cannot supply are skipped and
 * reported through `missing` so the caller can fail validation rather than
 * ship a hole.
 */
export function placeWalls(
  g: WallGrid,
  theme: ThemeDef,
  exists: (path: string) => boolean,
  missing?: (piece: string, x: number, y: number) => void
): WallUnit[] {
  const out: WallUnit[] = []
  const masks = new Int8Array(g.width * g.height).fill(-1)
  // Line cells can sit one cell outside the map (the map border is solid), so
  // scan a one-cell margin too; masks only index in-bounds cells.
  const maskAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return isLineCell(g, x, y) ? connectionMask(g, x, y) : -1
    const i = x + y * g.width
    if (masks[i] === -1 && isLineCell(g, x, y)) masks[i] = connectionMask(g, x, y)
    return isLineCell(g, x, y) ? masks[i] : -1
  }
  const reserved = (x: number, y: number) => x >= 0 && y >= 0 && x < g.width && y < g.height && g.reserved(x, y)
  const emit = (piece: string, cx: number, cy: number, x = cx, y = cy) => {
    const r = resolvePiece(theme.walls, piece, exists)
    if (r === null) {
      missing?.(piece, cx, cy)
      return
    }
    out.push({ path: r.path, x: x * 16, y: (y + r.dy) * 16, cellX: cx, cellY: cy, piece: r.unit })
  }

  const done = new Set<string>()
  for (let y = -1; y <= g.height; y++) {
    for (let x = -1; x <= g.width; x++) {
      const key = `${x},${y}`
      if (done.has(key)) continue
      const m = maskAt(x, y)
      if (m < 0 || reserved(x, y)) continue

      if (m === (E | W)) {
        // horizontal run: pair cells into 32-px pieces from the left
        let len = 0
        while (maskAt(x + len, y) === (E | W) && !reserved(x + len, y)) len++
        let i = 0
        const has32 = resolvePiece(theme.walls, 'h_32', exists) !== null
        while (i < len) {
          if (has32 && i + 1 < len) {
            emit('h_32', x + i, y)
            i += 2
          } else {
            emit('h_16', x + i, y)
            i += 1
          }
        }
        for (let k = 0; k < len; k++) done.add(`${x + k},${y}`)
        continue
      }

      if (m === (N | S)) {
        // vertical run: pair downward; only start at the top of a run
        if (maskAt(x, y - 1) === (N | S) && !reserved(x, y - 1)) continue
        let len = 0
        while (maskAt(x, y + len) === (N | S) && !reserved(x, y + len)) len++
        let i = 0
        const has32 = resolvePiece(theme.walls, 'v_32', exists) !== null
        while (i < len) {
          if (has32 && i + 1 < len) {
            emit('v_32', x, y + i)
            i += 2
          } else {
            emit('v_16', x, y + i)
            i += 1
          }
        }
        for (let k = 0; k < len; k++) done.add(`${x},${y + k}`)
        continue
      }

      emit(PIECE_BY_MASK[m], x, y)
    }
  }
  return out
}
