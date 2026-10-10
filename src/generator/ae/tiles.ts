import type { AeTileCell } from './model'

/**
 * AE tile layers. Ported from hw2ae's `ae/tiles.py`.
 *
 * A level's floor is a list of 512-px cells. A cell's `pos` is its CENTRE, so
 * it covers `pos - 256 .. pos + 256`, and must be a multiple of 512 — AE floors
 * any other `pos` onto that grid, shifting the whole cell. Each cell holds one
 * dataset per tileset; a dataset is a presence grid of `(512 / size)²` tiles,
 * `size` coming from the `.tileset` file. AE picks tile variants and borders
 * itself, so the grid only says WHERE a tileset is painted.
 *
 * `data-rle` stores that grid row by row as signed bytes: `n > 0` is a run of
 * `n` painted tiles, `n < 0` a run of `-n` empty ones, capped at 126 either way
 * (`0x7e` / `0x82`). [VERIFIED] decoding every chunk of Castle level_1 sums to
 * exactly `(512/size)²`.
 */

export const CELL = 512
const HALF = CELL / 2
const MAX_RUN = 126

export function decodeRle(hex: string, side: number): boolean[] {
  const out: boolean[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const b = Number.parseInt(hex.slice(i, i + 2), 16)
    const n = b >= 128 ? b - 256 : b
    for (let k = 0; k < Math.abs(n); k++) out.push(n > 0)
  }
  const total = side * side
  while (out.length < total) out.push(false)
  return out.slice(0, total)
}

/** Sum of run lengths — what a well-formed dataset's grid size must equal. */
export function rleLength(hex: string): number {
  let total = 0
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const b = Number.parseInt(hex.slice(i, i + 2), 16)
    total += Math.abs(b >= 128 ? b - 256 : b)
  }
  return total
}

export function encodeRle(grid: boolean[]): string {
  let out = ''
  let i = 0
  while (i < grid.length) {
    const v = grid[i]
    let j = i
    while (j < grid.length && grid[j] === v && j - i < MAX_RUN) j++
    const n = j - i
    const byte = v ? n : 256 - n
    out += byte.toString(16).padStart(2, '0')
    i = j
  }
  return out
}

/** (left, up, right, down) growth in 16-px tiles */
export type Grow = [number, number, number, number]

/**
 * Collects painted tiles per tileset and emits cells.
 *
 * Input is always in 16-px tiles (the generator's grid, origin at AE pixel
 * 0,0). A finer tileset gets every sub-tile; a coarser one is painted where at
 * least half of it is covered — or, when `grow` is given, wherever it touches
 * at all, since a grown bottom layer only has to reach under the walls.
 */
export class TileLayers {
  private layers = new Map<string, Set<string>>()
  private order: string[] = []

  constructor(private sizeOf: (tileset: string) => number) {}

  paint16(tileset: string, tiles: Iterable<[number, number]>, grow?: Grow): void {
    let cells: Array<[number, number]> = [...tiles]
    if (grow !== undefined) {
      const [l, u, r, d] = grow
      const seen = new Set<string>()
      const grown: Array<[number, number]> = []
      for (const [x, y] of cells) {
        for (let dx = -l; dx <= r; dx++) {
          for (let dy = -u; dy <= d; dy++) {
            const k = `${x + dx},${y + dy}`
            if (seen.has(k)) continue
            seen.add(k)
            grown.push([x + dx, y + dy])
          }
        }
      }
      cells = grown
    }

    const s = this.sizeOf(tileset)
    let layer = this.layers.get(tileset)
    if (layer === undefined) {
      layer = new Set()
      this.layers.set(tileset, layer)
      this.order.push(tileset)
    }
    if (s <= 16) {
      const k = 16 / s
      for (const [tx, ty] of cells) {
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) layer.add(`${tx * k + a},${ty * k + b}`)
      }
    } else {
      const k = s / 16
      const need = grow !== undefined ? 1 : Math.floor((k * k + 1) / 2)
      const counts = new Map<string, number>()
      for (const [tx, ty] of cells) {
        const key = `${Math.floor(tx / k)},${Math.floor(ty / k)}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      for (const [key, c] of counts) if (c >= need) layer.add(key)
    }
  }

  /** Cells in paint order per cell; sorted by row then column. */
  cells(): AeTileCell[] {
    const out = new Map<string, AeTileCell>()
    for (const ts of this.order) {
      const s = this.sizeOf(ts)
      const side = CELL / s
      const byCell = new Map<string, Array<[number, number]>>()
      for (const key of this.layers.get(ts)!) {
        const [tx, ty] = key.split(',').map(Number)
        const cx = Math.floor((tx * s + HALF) / CELL)
        const cy = Math.floor((ty * s + HALF) / CELL)
        const x0 = (cx * CELL - HALF) / s
        const y0 = (cy * CELL - HALF) / s
        const ck = `${cx},${cy}`
        let list = byCell.get(ck)
        if (list === undefined) {
          list = []
          byCell.set(ck, list)
        }
        list.push([tx - x0, ty - y0])
      }
      for (const [ck, local] of byCell) {
        const [cx, cy] = ck.split(',').map(Number)
        const grid = new Array<boolean>(side * side).fill(false)
        for (const [lx, ly] of local) grid[ly * side + lx] = true
        let cell = out.get(ck)
        if (cell === undefined) {
          cell = { x: cx * CELL, y: cy * CELL, datasets: [] }
          out.set(ck, cell)
        }
        cell.datasets.push({ tileset: ts, rle: encodeRle(grid) })
      }
    }
    return [...out.values()].sort((a, b) => a.y - b.y || a.x - b.x)
  }
}
