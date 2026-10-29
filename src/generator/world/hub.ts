/**
 * The start of a world. `bare` is the portal frame and nothing else; `camp`
 * pitches the biome's tent, campfire and a few props round it; `village`
 * rings the portal with tents round a fountain or well, market props between
 * (the biome's `village`). `random` picks one of the three from the world's
 * layout stream (one draw, made either way so the hub never moves the sites),
 * and leaves the village out on an island too small for one.
 *
 * Everything stands clear of the portal, the arrival three tiles south of it,
 * and the trails, which all leave from the center. Each prop marks its
 * footprint solid.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import type { BiomeDef, ScatterEntry } from './biomes'
import type { WorldHub } from './options'
import type { Tile } from './grid'
import { WorldGrid, dist2 } from './grid'
import { pick } from './scatter'

/** Tiles kept clear round the start before anything else is placed. */
export const HUB_RADIUS = 7
/** A village's clear radius: room for its ring of tents and its market. */
export const VILLAGE_RADIUS = 22
/** The smallest island side a village fits on; `random` doesn't pick one below it. */
export const VILLAGE_MIN_SIZE = 128

export type HubKind = 'camp' | 'bare' | 'village'

/** Where the camp's props stand, in tiles from the portal: tent, fire, then the extras. */
const CAMP_SPOTS: ReadonlyArray<{ dx: number; dy: number; solid: number }> = [
  { dx: -5, dy: -3, solid: 2 },
  { dx: 4, dy: 3, solid: 1 },
  { dx: 5, dy: -4, solid: 1 },
  { dx: -5, dy: 4, solid: 1 }
]

/** The village: the centrepiece's spot, the tent ring, and how many market props. */
const VILLAGE_CENTRE: Tile = { x: 0, y: -7 }
const TENT_RING = 15
const TENTS = 8
const MARKET_PROPS = 18
/** Market props stand between these distances from the portal, off the arrival's way in. */
const MARKET_MIN = 6
const MARKET_MAX = 19

export function resolveHub(rand: Rand, hub: WorldHub, villageFits: boolean): HubKind {
  const roll = rand.nextInt(3)
  if (hub === 'random') return roll === 0 ? 'camp' : roll === 1 ? 'bare' : villageFits ? 'village' : 'camp'
  return hub
}

/** The radius `kind` keeps clear round the start. */
export function hubRadius(kind: HubKind): number {
  return kind === 'village' ? VILLAGE_RADIUS : HUB_RADIUS
}

export function buildHub(ctx: GenerationContext, rand: Rand, grid: WorldGrid, biome: BiomeDef, kind: HubKind, at: Tile): void {
  if (kind === 'bare') return
  if (kind === 'village') {
    buildVillage(ctx, rand, grid, biome, at)
    return
  }
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

/**
 * The centrepiece, then a tent on each of eight bearings of the ring (a
 * random turn of the ring), then the market: props at random spots between
 * the portal and the tents. A spot the coast or another prop takes is
 * skipped. Draws from `rand`, the world's layout stream.
 */
function buildVillage(ctx: GenerationContext, rand: Rand, grid: WorldGrid, biome: BiomeDef, at: Tile): void {
  const { centre, tents, props } = biome.village
  const place = (entry: ScatterEntry, t: Tile): boolean => {
    if (!grid.discAll(t, entry.solid + 1, (x, y) => grid.walkable(x, y))) return false
    Doodad.prop(ctx, t.x + 0.5, t.y + 0.5, entry.path)
    grid.markDisc(t, Math.max(1, entry.solid), WorldGrid.SOLID)
    return true
  }
  place(centre, { x: at.x + VILLAGE_CENTRE.x, y: at.y + VILLAGE_CENTRE.y })

  const turn = rand.nextFloat() * Math.PI * 2
  for (let i = 0; i < TENTS; i++) {
    const angle = turn + (i / TENTS) * Math.PI * 2
    const t = { x: Math.round(at.x + Math.cos(angle) * TENT_RING), y: Math.round(at.y + Math.sin(angle) * TENT_RING) }
    place(pick(rand, tents), t)
  }

  // the arrival's way in, kept open: a lane from the portal south past the ring
  const lane = (t: Tile) => Math.abs(t.x - at.x) <= 2 && t.y > at.y
  for (let i = 0; i < MARKET_PROPS; i++) {
    const angle = rand.nextFloat() * Math.PI * 2
    const r = MARKET_MIN + rand.nextFloat() * (MARKET_MAX - MARKET_MIN)
    const t = { x: Math.round(at.x + Math.cos(angle) * r), y: Math.round(at.y + Math.sin(angle) * r) }
    const entry = pick(rand, props)
    if (lane(t) || dist2(t, at) < MARKET_MIN * MARKET_MIN) continue
    place(entry, t)
  }
}
