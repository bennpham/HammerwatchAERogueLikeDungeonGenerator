/**
 * What grows on a world's island: clumps of the biome's trees and rocks, and
 * a sprinkling of walk-through ground cover. Drawn only from the world's own
 * scatter stream, after the objectives are fixed, so the density never moves
 * a site, a trail or a monster.
 *
 * A clump prop takes a free tile (`WorldGrid.free`: walkable, off the trails,
 * off everything reserved) whose whole footprint is free too and at least a
 * tile from the coast, then marks that footprint `SOLID`. Ground cover only
 * needs a free tile and marks nothing.
 *
 * `density` is 0–100. At 50 a 192-tile island gets roughly 50 clumps of 3–8
 * props and a few hundred tufts.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import type { BiomeDef, ScatterEntry } from './biomes'
import { WorldGrid } from './grid'

const TILES_PER_CLUMP = 150
const TILES_PER_TUFT = 25
const CLUMP_SPREAD = 4

export function scatterProps(ctx: GenerationContext, rand: Rand, grid: WorldGrid, biome: BiomeDef, density: number): void {
  let land = 0
  for (let i = 0; i < grid.flags.length; i++) if ((grid.flags[i] & WorldGrid.LAND) !== 0) land++
  const share = Math.max(0, Math.min(100, density)) / 100

  const fits = (x: number, y: number, radius: number) =>
    grid.discAll({ x, y }, radius + 1, (cx, cy) => !grid.has(cx, cy, WorldGrid.CLIFF) && grid.has(cx, cy, WorldGrid.LAND)) &&
    grid.discAll({ x, y }, radius, (cx, cy) => grid.free(cx, cy))

  const clumps = Math.round((land * share * biome.clumpDensity) / TILES_PER_CLUMP)
  for (let c = 0; c < clumps && biome.clumps.length > 0; c++) {
    const cx = rand.iRand(0, grid.width)
    const cy = rand.iRand(0, grid.height)
    if (!grid.free(cx, cy)) continue
    const count = rand.iRand(3, 9)
    for (let k = 0; k < count; k++) {
      const entry = pick(rand, biome.clumps)
      const x = cx + rand.iRand(-CLUMP_SPREAD, CLUMP_SPREAD + 1)
      const y = cy + rand.iRand(-CLUMP_SPREAD, CLUMP_SPREAD + 1)
      if (!fits(x, y, entry.solid)) continue
      Doodad.prop(ctx, x + 0.5, y + 0.5, entry.path)
      if (entry.solid > 0) grid.markDisc({ x, y }, entry.solid, WorldGrid.SOLID)
      else grid.set(x, y, WorldGrid.SOLID)
    }
  }

  const tufts = Math.round((land * share) / TILES_PER_TUFT)
  for (let t = 0; t < tufts && biome.cover.length > 0; t++) {
    const entry = pick(rand, biome.cover)
    const x = rand.iRand(0, grid.width)
    const y = rand.iRand(0, grid.height)
    if (!grid.free(x, y) || grid.has(x + 1, y, WorldGrid.CLIFF) || grid.has(x, y + 1, WorldGrid.CLIFF)) continue
    Doodad.prop(ctx, x + rand.nextFloat(), y + rand.nextFloat(), entry.path)
  }
}

/** A weighted pick: one draw. */
export function pick<T extends { weight: number }>(rand: Rand, entries: readonly T[]): T {
  const total = entries.reduce((s, e) => s + e.weight, 0)
  let r = rand.nextFloat() * total
  for (const e of entries) {
    r -= e.weight
    if (r < 0) return e
  }
  return entries[entries.length - 1]
}

export type { ScatterEntry }
