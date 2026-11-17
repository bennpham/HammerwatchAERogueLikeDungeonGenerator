/**
 * The trails from the start to each site: a cheapest path over walkable land,
 * with a noise field for the cost so it winds the way a worn path would
 * rather than running in stair-steps.
 *
 * One Dijkstra from `from` (the arrival) covers every site. Each trail is two tiles wide
 * and marked `TRAIL`, which keeps solid scatter off it — so every site stays
 * reachable whatever grows round it. With trails switched off the same
 * corridor is still kept clear (`RESERVED`), just not painted.
 *
 * Bounded by the grid: every cell is settled at most once, and the search
 * stops as soon as the last site is settled.
 */

import type { Rand } from '../core/rand'
import type { Tile } from './grid'
import { WorldGrid } from './grid'
import { ValueNoise } from './noise'

export function carveTrails(rand: Rand, grid: WorldGrid, from: Tile, sites: readonly Tile[], paint: boolean): boolean {
  const { width, height } = grid
  const noise = new ValueNoise(rand, width, height, 10, 2)
  const cost = (x: number, y: number) => 1 + noise.at(x, y) * 6
  const dist = new Float64Array(width * height).fill(Infinity)
  const prev = new Int32Array(width * height).fill(-1)
  const heap = new MinHeap()
  const start = from.y * width + from.x
  dist[start] = 0
  heap.push(start, 0)
  // stop once every site is settled: a settled cell's path never changes
  const pending = new Set(sites.map((s) => s.y * width + s.x))
  while (heap.size > 0 && pending.size > 0) {
    const d = heap.topPriority()
    const i = heap.pop()
    if (d > dist[i]) continue
    pending.delete(i)
    const x = i % width
    const y = (i - x) / width
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k]
      const ny = y + DY[k]
      if (!grid.walkable(nx, ny)) continue
      const j = ny * width + nx
      const nd = d + cost(nx, ny)
      if (nd < dist[j]) {
        dist[j] = nd
        prev[j] = i
        heap.push(j, nd)
      }
    }
  }

  const flag = WorldGrid.PATH | (paint ? WorldGrid.TRAIL : WorldGrid.RESERVED)
  // a trail climbs a plateau by its stairs, but its paint stops at their foot
  const mark = (x: number, y: number) =>
    grid.set(x, y, grid.has(x, y, WorldGrid.STAIR) ? WorldGrid.PATH | WorldGrid.RESERVED : flag)
  for (const site of sites) {
    let i = site.y * width + site.x
    if (prev[i] === -1 && i !== start) return false
    for (let steps = 0; i !== -1 && steps < width * height; steps++) {
      const x = i % width
      const y = (i - x) / width
      mark(x, y)
      // two wide: the trail's second column, where the land allows
      if (grid.walkable(x + 1, y)) mark(x + 1, y)
      i = prev[i]
    }
  }
  return true
}

/** The four neighbours, in the order the search has always visited them. */
const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]

/**
 * A binary min-heap of (index, priority) on typed arrays. Its sift order is
 * the same as the tuple heap it replaced, so ties pop in the same order and
 * every trail comes out unchanged.
 */
class MinHeap {
  private idx = new Int32Array(1024)
  private pri = new Float64Array(1024)
  private n = 0

  get size(): number {
    return this.n
  }

  topPriority(): number {
    return this.pri[0]
  }

  push(index: number, priority: number): void {
    if (this.n === this.idx.length) this.grow()
    const pri = this.pri
    let i = this.n++
    this.idx[i] = index
    pri[i] = priority
    while (i > 0) {
      const p = (i - 1) >> 1
      if (pri[p] <= pri[i]) break
      this.swap(p, i)
      i = p
    }
  }

  pop(): number {
    const { idx, pri } = this
    const top = idx[0]
    this.n--
    if (this.n > 0) {
      idx[0] = idx[this.n]
      pri[0] = pri[this.n]
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.n && pri[l] < pri[m]) m = l
        if (r < this.n && pri[r] < pri[m]) m = r
        if (m === i) break
        this.swap(m, i)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const { idx, pri } = this
    const ti = idx[a]
    idx[a] = idx[b]
    idx[b] = ti
    const tp = pri[a]
    pri[a] = pri[b]
    pri[b] = tp
  }

  private grow(): void {
    const idx = new Int32Array(this.idx.length * 2)
    const pri = new Float64Array(this.pri.length * 2)
    idx.set(this.idx)
    pri.set(this.pri)
    this.idx = idx
    this.pri = pri
  }
}
