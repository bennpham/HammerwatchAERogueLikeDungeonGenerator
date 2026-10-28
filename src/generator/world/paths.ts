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
 * Bounded by the grid: every cell is settled at most once.
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
  while (heap.size > 0) {
    const [i, d] = heap.pop()
    if (d > dist[i]) continue
    const x = i % width
    const y = (i - x) / width
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ]) {
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
  for (const site of sites) {
    let i = site.y * width + site.x
    if (prev[i] === -1 && i !== start) return false
    for (let steps = 0; i !== -1 && steps < width * height; steps++) {
      const x = i % width
      const y = (i - x) / width
      grid.set(x, y, flag)
      // two wide: the trail's second column, where the land allows
      if (grid.walkable(x + 1, y)) grid.set(x + 1, y, flag)
      i = prev[i]
    }
  }
  return true
}

/** A binary min-heap of (index, priority). */
class MinHeap {
  private items: Array<[number, number]> = []

  get size(): number {
    return this.items.length
  }

  push(index: number, priority: number): void {
    const a = this.items
    a.push([index, priority])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][1] <= a[i][1]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }

  pop(): [number, number] {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][1] < a[m][1]) m = l
        if (r < a.length && a[r][1] < a[m][1]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}
