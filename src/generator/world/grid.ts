/**
 * Per-tile flags of a world under construction, and the flood fill that
 * proves it finishable (invariant 5).
 *
 * `CLIFF` marks a coast cell (it carries a piece whose collision covers part
 * of it); `SOLID` a cell under a solid prop's footprint; `RESERVED` a cell the
 * scatter keeps off (the start, the sites, the trails); `PATH` the corridor
 * from the start to each site, where the ambushes wait. The flood walks LAND
 * that is neither CLIFF nor SOLID, 4-way, so it is conservative: a cell
 * counted as blocked here may be partly walkable in game, never the reverse.
 */

import { floodFill } from '../map/reachability'

export interface Tile {
  x: number
  y: number
}

export class WorldGrid {
  static readonly LAND = 1
  static readonly CLIFF = 2
  static readonly TRAIL = 4
  static readonly SOLID = 8
  static readonly RESERVED = 16
  /** the corridor from the start to a site, painted as a trail or not */
  static readonly PATH = 32

  readonly flags: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.flags = new Uint8Array(width * height)
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  has(x: number, y: number, flag: number): boolean {
    return this.inside(x, y) && (this.flags[y * this.width + x] & flag) !== 0
  }

  set(x: number, y: number, flag: number): void {
    if (this.inside(x, y)) this.flags[y * this.width + x] |= flag
  }

  clear(x: number, y: number, flag: number): void {
    if (this.inside(x, y)) this.flags[y * this.width + x] &= ~flag
  }

  /** Land the party can stand on: not cliff, not under a solid prop. */
  walkable(x: number, y: number): boolean {
    return this.has(x, y, WorldGrid.LAND) && !this.has(x, y, WorldGrid.CLIFF | WorldGrid.SOLID)
  }

  /** Walkable and free of everything placed so far: where a new prop may go. */
  free(x: number, y: number): boolean {
    return this.walkable(x, y) && !this.has(x, y, WorldGrid.RESERVED | WorldGrid.TRAIL)
  }

  /** Every cell within `radius` (a disc) satisfies `ok`. */
  discAll(at: Tile, radius: number, ok: (x: number, y: number) => boolean): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius && !ok(at.x + dx, at.y + dy)) return false
      }
    }
    return true
  }

  /** Set `flag` on a disc of tiles. */
  markDisc(at: Tile, radius: number, flag: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) this.set(at.x + dx, at.y + dy, flag)
      }
    }
  }

  /** Every tile reachable on foot from `from`: 1 = reached. */
  reach(from: Tile): Uint8Array {
    const blocked = new Uint8Array(this.width * this.height)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) blocked[y * this.width + x] = this.walkable(x, y) ? 0 : 1
    }
    return floodFill(blocked, this.width, this.height, from)
  }
}

/** Squared distance between two tiles. */
export function dist2(a: Tile, b: Tile): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
