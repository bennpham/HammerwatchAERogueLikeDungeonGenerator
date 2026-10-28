/**
 * The cliff ring round a world's island, and the invisible fence behind it.
 *
 * The stock cliff sets (`doodads/cliffs/<set>/`) are edge pieces for a raised
 * plateau, as Shaftlocke's town rims its own. Read from the unit files
 * (`scripts/lib/aeunit.mjs`, 2026-10-28), every piece is drawn up from its
 * anchor at its bottom-left:
 *
 * - `s_16`/`s_32`, `se`, `sw`: a 16-px lip over the last land row and a 32-px
 *   face hanging two rows below it; collision 40 px up from the anchor (the
 *   corners 48). So the anchor is three rows below the land cell's top.
 * - `n_16`/`n_32`, `ne`, `nw`: a 16-px lip over the first land row; collision
 *   its top 8 px. Anchor one row below the cell's top.
 * - `e_16`/`e_32`, `w_16`/`w_32`: a 16-px-wide lip down the edge column;
 *   collision its outer 8 px. `_32` spans two rows, anchored at the lower one's
 *   bottom.
 * - `*_i`: an inner corner, a lip in the one land cell whose only water
 *   neighbour is diagonal; collision a triangle in that corner.
 *
 * So each piece sits ON the land cell at the coast, and only the outer half
 * of that cell (more for a south face) is blocked. Straight runs pair up into
 * the 32-px pieces. `island.ts` cleans the mask until every coast cell has a
 * piece here, and leaves room under every south face.
 *
 * Stock fences its plateaus with physics shapes as well as the pieces' own
 * collision (121 `:Physics_Freeform`s in town.lvl), so this does too: solid,
 * invisible `:Physics_Rectangle`s cover every water tile next to land,
 * one per horizontal run. They let shots through, as stock's fences do.
 *
 * Pure: no RNG.
 */

import type { AeUnit, StateValue } from '../ae/model'

export type CoastPiece = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'ne_i' | 'nw_i' | 'se_i' | 'sw_i'

/**
 * The piece a land cell takes: a `CoastPiece` on the coast, `'inland'` with no
 * water round it, or null when no piece fits (water on two opposite sides, or
 * on more than one diagonal only) — `island.ts` removes such a cell.
 */
export function coastPiece(isLand: (x: number, y: number) => boolean, x: number, y: number): CoastPiece | 'inland' | null {
  const n = !isLand(x, y - 1)
  const s = !isLand(x, y + 1)
  const e = !isLand(x + 1, y)
  const w = !isLand(x - 1, y)
  if ((n && s) || (e && w)) return null
  if (s && e) return 'se'
  if (s && w) return 'sw'
  if (n && e) return 'ne'
  if (n && w) return 'nw'
  if (s) return 's'
  if (n) return 'n'
  if (e) return 'e'
  if (w) return 'w'
  const diagonals = [
    !isLand(x + 1, y + 1) ? 'se_i' : null,
    !isLand(x - 1, y + 1) ? 'sw_i' : null,
    !isLand(x + 1, y - 1) ? 'ne_i' : null,
    !isLand(x - 1, y - 1) ? 'nw_i' : null
  ].filter((p): p is CoastPiece => p !== null)
  if (diagonals.length === 0) return 'inland'
  return diagonals.length === 1 ? diagonals[0] : null
}

/** A cliff unit to emit, in AE pixels. */
export interface CoastUnit {
  path: string
  x: number
  y: number
}

/** Rows below the land cell's top at which each kind of piece is anchored. */
function anchorRows(piece: string): number {
  if (piece.startsWith('s')) return 3
  if (piece === 'e_32' || piece === 'w_32') return 2
  return 1
}

/**
 * Every cliff piece for `land`, from the `set` folder. Horizontal runs of
 * `s`/`n` and vertical runs of `e`/`w` pair into `_32` pieces left to right
 * and top to bottom; an odd cell out takes the `_16`.
 */
export function coastUnits(set: string, width: number, height: number, land: Uint8Array): CoastUnit[] {
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
  const kind: Array<CoastPiece | 'inland' | null> = new Array(width * height).fill('inland')
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (isLand(x, y)) kind[y * width + x] = coastPiece(isLand, x, y)
  }
  const out: CoastUnit[] = []
  const done = new Uint8Array(width * height)
  const emit = (piece: string, x: number, y: number) =>
    out.push({ path: `doodads/cliffs/${set}/${piece}.unit`, x: x * 16, y: (y + anchorRows(piece)) * 16 })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!isLand(x, y) || done[i] === 1) continue
      const k = kind[i]
      if (k === 'inland' || k === null) continue
      done[i] = 1
      if (k === 's' || k === 'n') {
        const pair = x + 1 < width && kind[i + 1] === k && done[i + 1] === 0
        if (pair) done[i + 1] = 1
        emit(`${k}_${pair ? 32 : 16}`, x, y)
      } else if (k === 'e' || k === 'w') {
        const pair = y + 1 < height && kind[i + width] === k && done[i + width] === 0
        if (pair) done[i + width] = 1
        emit(`${k}_${pair ? 32 : 16}`, x, y)
      } else {
        emit(k, x, y)
      }
    }
  }
  return out
}

/** The piece names `coastUnits` can emit — every set must ship all of them. */
export const COAST_PIECE_NAMES: readonly string[] = [
  'n_16',
  'n_32',
  's_16',
  's_32',
  'e_16',
  'e_32',
  'w_16',
  'w_32',
  'ne',
  'nw',
  'se',
  'sw',
  'ne_i',
  'nw_i',
  'se_i',
  'sw_i'
]

/** The cliff sets a biome may name. */
export const EDGE_SETS: readonly string[] = ['granite', 'granite2', 'basalt', 'silt']

/** The fence's state: solid, invisible, shots and aim pass, as `lobby/crystalShop.ts`'s fences. */
function fenceState(w: number, h: number): Record<string, StateValue> {
  return {
    active: { kind: 'bool', value: true },
    sensor: { kind: 'bool', value: false },
    'jam-through': { kind: 'bool', value: true },
    'shot-through': { kind: 'bool', value: true },
    'aim-through': { kind: 'bool', value: true },
    size: { kind: 'vec2', value: [w, h] }
  }
}

/**
 * The fence: one solid rectangle per horizontal run of water tiles that touch
 * land (8-neighbourhood), centred on the run. Ids are given by the caller.
 */
export function coastFence(width: number, height: number, land: Uint8Array): Array<Omit<AeUnit, 'id'>> {
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
  const touches = (x: number, y: number) => {
    if (isLand(x, y)) return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isLand(x + dx, y + dy)) return true
    return false
  }
  const out: Array<Omit<AeUnit, 'id'>> = []
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      if (!touches(x, y)) {
        x++
        continue
      }
      let end = x
      while (end < width && touches(end, y)) end++
      const w = (end - x) * 16
      out.push({ path: ':Physics_Rectangle', x: x * 16 + w / 2, y: y * 16 + 8, state: fenceState(w, 16) })
      x = end
    }
  }
  return out
}
