/**
 * Landmarks: a small composition round each objective site, so the party can
 * tell one site from another at a glance: a pyramid, a shrine, a graveyard, a
 * grove. Plain data, base-game units only; each landmark lists the biomes it
 * suits.
 *
 * A piece is placed at its offset from the site's center, in tiles. Every
 * offset sits outside the site's clear disc (`SITE_RADIUS`), and a piece whose
 * footprint would touch the path to the site, another prop or the coast is
 * left out, so a landmark never cuts a site off. A `ring` landmark stands the
 * biome's own trees or rocks evenly round the site instead.
 *
 * Placed after the trails, from the world's layout stream, which nothing after
 * them draws from: landmarks move no site, trail, monster or prop.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import type { BiomeDef } from './biomes'
import type { Tile } from './grid'
import { WorldGrid } from './grid'
import { pick } from './scatter'

export interface LandmarkPiece {
  path: string
  dx: number
  dy: number
  /** collision radius in tiles; 0 = walk-through */
  solid: number
  /** the unit's start scene, for one with no default (the armour statue faces a way) */
  scene?: string
}

export interface LandmarkDef {
  id: string
  label: string
  /** the biome ids it suits */
  biomes: readonly string[]
  pieces: readonly LandmarkPiece[]
  /** stand `count` of the biome's clumps (trees, rocks) evenly round the site at `radius` */
  ring?: { radius: number; count: number }
}

const G = 'doodads/generic'
const T = 'doodads/terrain'

export const LANDMARK_DEFS: readonly LandmarkDef[] = [
  {
    id: 'pyramid',
    label: 'Pyramid',
    biomes: ['desert'],
    pieces: [
      { path: `${G}/pyramid_small.unit`, dx: 0, dy: -12, solid: 6 },
      { path: `${T}/stone_desert_large.unit`, dx: -7, dy: -3, solid: 2 },
      { path: `${T}/stone_desert_small.unit`, dx: 6, dy: -4, solid: 0 }
    ]
  },
  {
    id: 'oasis',
    label: 'Oasis',
    biomes: ['desert'],
    pieces: [
      { path: `${T}/water_patch.unit`, dx: 0, dy: -9, solid: 0 },
      { path: `${T}/tree_palm.unit`, dx: -6, dy: -6, solid: 1 },
      { path: `${T}/tree_palm.unit`, dx: 6, dy: -6, solid: 1 },
      { path: `${T}/tree_palm.unit`, dx: -7, dy: 2, solid: 1 },
      { path: `${T}/tree_palm.unit`, dx: 7, dy: 2, solid: 1 }
    ]
  },
  {
    id: 'shrine',
    label: 'Shrine',
    biomes: ['grass', 'woods', 'desert', 'mud', 'snow'],
    pieces: [
      { path: `${G}/statue_angel.unit`, dx: 0, dy: -6, solid: 1 },
      { path: `${G}/lamp_brazier.unit`, dx: -3, dy: -5, solid: 1 },
      { path: `${G}/lamp_brazier.unit`, dx: 3, dy: -5, solid: 1 }
    ]
  },
  {
    id: 'ruins',
    label: 'Ruins',
    biomes: ['grass', 'desert', 'mud', 'snow'],
    pieces: [
      { path: `${T}/castle_debris_pile_rock.unit`, dx: -6, dy: -3, solid: 2 },
      { path: `${T}/castle_debris_pile_rock.unit`, dx: 6, dy: 2, solid: 2 },
      { path: `${G}/statue_armor.unit`, dx: 5, dy: -5, solid: 1, scene: 's' },
      { path: `${G}/fence_stone_single.unit`, dx: -4, dy: 6, solid: 1 },
      { path: `${G}/fence_stone_single.unit`, dx: -2, dy: 6, solid: 1 }
    ]
  },
  {
    id: 'graveyard',
    label: 'Graveyard',
    biomes: ['grass', 'woods', 'mud'],
    pieces: [
      { path: `${G}/graveyard_dirt_patch.unit`, dx: -1, dy: -7, solid: 0 },
      { path: `${G}/gravestone.unit`, dx: -5, dy: -5, solid: 1 },
      { path: `${G}/graveyard_gravestone.unit`, dx: -2, dy: -6, solid: 1 },
      { path: `${G}/grave_cross.unit`, dx: 2, dy: -6, solid: 1 },
      { path: `${G}/gravestone.unit`, dx: 5, dy: -5, solid: 1 },
      { path: `${G}/grave_mercenary.unit`, dx: 6, dy: -1, solid: 1 },
      { path: `${T}/skulls.unit`, dx: -6, dy: 0, solid: 0 }
    ]
  },
  {
    id: 'grove',
    label: 'Grove',
    biomes: ['grass', 'woods', 'snow'],
    pieces: [],
    ring: { radius: 7, count: 9 }
  },
  {
    id: 'stone_circle',
    label: 'Stone circle',
    biomes: ['snow'],
    pieces: [
      { path: `${T}/ice_rock.unit`, dx: 0, dy: -7, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: 5, dy: -5, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: 7, dy: 0, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: 5, dy: 5, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: -5, dy: 5, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: -7, dy: 0, solid: 1 },
      { path: `${T}/ice_rock.unit`, dx: -5, dy: -5, solid: 1 }
    ]
  },
  {
    id: 'pond',
    label: 'Pond',
    biomes: ['mud'],
    pieces: [
      { path: `${T}/water_patch.unit`, dx: 0, dy: -9, solid: 0 },
      { path: `${T}/grass_reed.unit`, dx: -5, dy: -6, solid: 0 },
      { path: `${T}/grass_reed.unit`, dx: 5, dy: -6, solid: 0 },
      { path: `${T}/flower_lily_pad.unit`, dx: 1, dy: -9, solid: 0 },
      { path: `${T}/tree_oak_stump.unit`, dx: 6, dy: 1, solid: 1 }
    ]
  }
]

/** The landmarks that suit `biome`. */
export function landmarksFor(biome: string): LandmarkDef[] {
  return LANDMARK_DEFS.filter((l) => l.biomes.includes(biome))
}

/**
 * A landmark for each site, picked from those suiting the biome (one draw per
 * site, made whether or not a piece fits). Returns which landmark each site got.
 */
export function placeLandmarks(ctx: GenerationContext, rand: Rand, grid: WorldGrid, biome: BiomeDef, sites: readonly Tile[]): string[] {
  const options = landmarksFor(biome.id)
  if (options.length === 0) return sites.map(() => '')
  return sites.map((site) => {
    const def = options[rand.iRand(0, options.length)]
    const pieces: LandmarkPiece[] = [...def.pieces]
    if (def.ring !== undefined && biome.clumps.length > 0) {
      const turn = rand.nextFloat() * Math.PI * 2
      for (let i = 0; i < def.ring.count; i++) {
        const angle = turn + (i / def.ring.count) * Math.PI * 2
        const entry = pick(rand, biome.clumps)
        pieces.push({
          path: entry.path,
          dx: Math.round(Math.cos(angle) * def.ring.radius),
          dy: Math.round(Math.sin(angle) * def.ring.radius),
          solid: entry.solid
        })
      }
    }
    for (const piece of pieces) {
      const at = { x: site.x + piece.dx, y: site.y + piece.dy }
      // clear of the path, the coast and every prop, a tile beyond its own footprint
      const clear = grid.discAll(at, piece.solid + 1, (x, y) => grid.walkable(x, y) && !grid.has(x, y, WorldGrid.PATH))
      if (!clear) continue
      Doodad.prop(ctx, at.x + 0.5, at.y + 0.5, piece.path, piece.scene === undefined ? undefined : { start: { kind: 'string', value: piece.scene } })
      if (piece.solid > 0) grid.markDisc(at, piece.solid, WorldGrid.SOLID)
      grid.markDisc(at, Math.max(1, piece.solid), WorldGrid.RESERVED)
    }
    return def.id
  })
}
