/**
 * The start of a world. `bare` is the portal frame and nothing else; `camp`
 * pitches the biome's tent, campfire and a few props round it. `random` picks
 * between the two from the world's layout stream (one draw, made either way
 * so the hub never moves the sites).
 *
 * The props stand clear of the portal, the arrival two tiles south of it, and
 * the trails, which all leave from the center. Each marks its footprint solid.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import type { BiomeDef } from './biomes'
import type { WorldHub } from './options'
import type { Tile } from './grid'
import { WorldGrid } from './grid'

/** Tiles kept clear round the start before anything else is placed. */
export const HUB_RADIUS = 7

/** Where the camp's props stand, in tiles from the portal: tent, fire, then the extras. */
const CAMP_SPOTS: ReadonlyArray<{ dx: number; dy: number; solid: number }> = [
  { dx: -5, dy: -3, solid: 2 },
  { dx: 4, dy: 3, solid: 1 },
  { dx: 5, dy: -4, solid: 1 },
  { dx: -5, dy: 4, solid: 1 }
]

export function resolveHub(rand: Rand, hub: WorldHub): 'camp' | 'bare' {
  const roll = rand.nextInt(2)
  if (hub === 'random') return roll === 0 ? 'camp' : 'bare'
  return hub
}

export function buildHub(ctx: GenerationContext, grid: WorldGrid, biome: BiomeDef, kind: 'camp' | 'bare', at: Tile): void {
  if (kind === 'bare') return
  const props = [biome.camp.tent, biome.camp.fire, ...biome.camp.extras]
  props.slice(0, CAMP_SPOTS.length).forEach((path, i) => {
    const { dx, dy, solid } = CAMP_SPOTS[i]
    const x = at.x + dx
    const y = at.y + dy
    if (!grid.walkable(x, y)) return
    Doodad.prop(ctx, x + 0.5, y + 0.5, path)
    grid.markDisc({ x, y }, solid, WorldGrid.SOLID)
  })
}
