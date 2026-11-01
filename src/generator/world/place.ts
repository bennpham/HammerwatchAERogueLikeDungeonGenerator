/**
 * Where a world's objective sites go: spread round the start, one angle sector
 * each, on solid ground a fair walk out.
 *
 * Each site needs a clear disc of land (no cliff, nothing reserved) of
 * `SITE_RADIUS`, at least `safeRadius` from the start, and
 * `WORLD_SITE_SPACING` from every other site. Site i first tries its own
 * sector of the circle, so the sites surround the island instead of bunching
 * on one shore; after that, anywhere. Bounded draws from the world's layout
 * stream; too few sites returns null and the island is re-rolled.
 */

import type { Rand } from '../core/rand'
import type { Tile } from './grid'
import { WorldGrid, dist2 } from './grid'
import { WORLD_SITE_SPACING } from './options'

/** The clear disc round a site's center: room for a boss, a plate and a fight. */
export const SITE_RADIUS = 4

const SECTOR_TRIES = 200
const ANYWHERE_TRIES = 2000

export function placeSites(rand: Rand, grid: WorldGrid, hub: Tile, count: number, safeRadius: number): Tile[] | null {
  const sites: Tile[] = []
  const ok = (t: Tile) =>
    grid.discAll(t, SITE_RADIUS, (x, y) => grid.walkable(x, y) && !grid.has(x, y, WorldGrid.RESERVED)) &&
    dist2(t, hub) >= safeRadius * safeRadius &&
    sites.every((s) => dist2(s, t) >= WORLD_SITE_SPACING * WORLD_SITE_SPACING)
  const offset = rand.nextFloat() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    let placed: Tile | null = null
    for (let t = 0; t < SECTOR_TRIES && placed === null; t++) {
      const angle = offset + ((i + rand.nextFloat()) / count) * Math.PI * 2
      // out toward the shore: 45–90% of the way to the last land on this bearing
      const extent = landExtent(grid, hub, angle)
      const r = Math.max(safeRadius, extent * (0.45 + rand.nextFloat() * 0.45))
      const tile = { x: Math.round(hub.x + Math.cos(angle) * r), y: Math.round(hub.y + Math.sin(angle) * r) }
      if (ok(tile)) placed = tile
    }
    for (let t = 0; t < ANYWHERE_TRIES && placed === null; t++) {
      const tile = { x: rand.iRand(0, grid.width), y: rand.iRand(0, grid.height) }
      if (ok(tile)) placed = tile
    }
    if (placed === null) return null
    sites.push(placed)
  }
  return sites
}

/** Tiles from `hub` to the last land along `angle`. */
function landExtent(grid: WorldGrid, hub: Tile, angle: number): number {
  const limit = Math.max(grid.width, grid.height)
  let last = 0
  for (let r = 1; r < limit; r++) {
    const x = Math.round(hub.x + Math.cos(angle) * r)
    const y = Math.round(hub.y + Math.sin(angle) * r)
    if (!grid.inside(x, y)) break
    if (grid.has(x, y, WorldGrid.LAND)) last = r
  }
  return last
}

/**
 * A free tile at least `minFromHub` from the start and `spacing` from every
 * tile in `avoid`, or null after `tries` draws.
 */
export function freeTile(
  rand: Rand,
  grid: WorldGrid,
  hub: Tile,
  minFromHub: number,
  avoid: readonly Tile[],
  spacing: number,
  tries: number,
  ok: (t: Tile) => boolean = (t) => grid.free(t.x, t.y)
): Tile | null {
  for (let i = 0; i < tries; i++) {
    const t = { x: rand.iRand(0, grid.width), y: rand.iRand(0, grid.height) }
    if (!ok(t)) continue
    if (dist2(t, hub) < minFromHub * minFromHub) continue
    if (avoid.some((a) => dist2(a, t) < spacing * spacing)) continue
    return t
  }
  return null
}
