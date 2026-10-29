/**
 * The stock biomes a world is built from: one per world, picked on the World
 * tab. Plain data, keyed by id (docs/plans/world-mode.md). Every path here
 * is checked against the asset snapshot by `tests/world.test.ts`.
 *
 * Tile layers: a tileset with a higher `layer` draws over a lower one where
 * both are painted (`tilesets/layers.inc`). Each biome's `trail` sits above its
 * `ground`, and `patches` are never painted under a trail, so a trail always
 * shows. Layers, from the tileset files: grass_1_default -159,
 * grass_4_default -146, outlook_dirt -151, mud_3 -196, moss -41, cold_dirt
 * -151, desert -149, desert_rough -115, desert_cobble -120, mud_7 -208,
 * snow -75, snow_grass_tall -15, temple_snow -25, water_clear -40.
 *
 * Scatter footprints are each unit's own collision, measured with
 * `scripts/lib/aeunit.mjs` (2026-10-28): `solid` is the radius in tiles the
 * blocking grid marks around the anchor, 0 for a unit nothing collides with.
 */

export interface ScatterEntry {
  /** the doodad unit */
  path: string
  /** relative frequency within its layer */
  weight: number
  /** collision radius in tiles around the anchor; 0 = walk-through */
  solid: number
}

export interface BiomeDef {
  id: string
  label: string
  /** the land's base tileset */
  ground: string
  /** tilesets painted in noise patches over the ground (never under a trail) */
  patches: string[]
  /** the trails from the start to each site */
  trail: string
  /** everything off the island, out to the map edge */
  water: string
  /** a `world/edgeSets.ts` id: the cliff pieces round the coast */
  edgeSet: string
  /** the level's lighting environment */
  environment: string
  /** clumped, mostly solid: trees, rocks */
  clumps: ScatterEntry[]
  /** how many clumps, against grassland's 1: woods grow thick, the desert thin */
  clumpDensity: number
  /** sparse and walk-through: tufts, flowers, pebbles */
  cover: ScatterEntry[]
  /** the camp hub's props, laid round the portal */
  camp: { tent: string; fire: string; extras: string[] }
  /**
   * The village hub: a centrepiece north of the portal, a ring of tents, and
   * market props between. Base-game units only: the stock town's houses live
   * in Shaftlocke Tower's own scenario, which a generated campaign can't use.
   */
  village: { centre: ScatterEntry; tents: ScatterEntry[]; props: ScatterEntry[] }
}

/** A village's market props, shared by the biomes that don't swap any out. */
const MARKET: ScatterEntry[] = [
  { path: 'doodads/generic/deco_vendor_cart.unit', weight: 2, solid: 1 },
  { path: 'doodads/generic/containers/barrel_wood.unit', weight: 3, solid: 1 },
  { path: 'doodads/generic/containers/crate_wood_16x16.unit', weight: 3, solid: 1 },
  { path: 'doodads/generic/lamps/lantern.unit', weight: 2, solid: 1 },
  { path: 'doodads/signs/sign_pole.unit', weight: 1, solid: 1 }
]

export const BIOME_DEFS: readonly BiomeDef[] = [
  {
    id: 'grass',
    label: 'Grassland',
    ground: 'tilesets/grass_1_default.tileset',
    patches: ['tilesets/grass_4_default.tileset'],
    trail: 'tilesets/outlook_dirt.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'granite2',
    environment: 'effects/env/day.env',
    clumpDensity: 1,
    clumps: [
      { path: 'doodads/terrain/tree_oak_apple.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/tree_oak_red.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_ash.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/bush_trimmed.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/rock.unit', weight: 1, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/grass_1_thin.unit', weight: 4, solid: 0 },
      { path: 'doodads/terrain/grass_2_medium.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/clover.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/flower_daisy.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/flower_dandelion.unit', weight: 1, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit', 'doodads/terrain/stump.unit']
    },
    village: {
      centre: { path: 'doodads/generic/outlook_fountain.unit', weight: 1, solid: 2 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: MARKET
    }
  },
  {
    id: 'woods',
    label: 'Woods',
    ground: 'tilesets/mud_3.tileset',
    patches: ['tilesets/moss.tileset', 'tilesets/leaf_dry.tileset'],
    trail: 'tilesets/cold_dirt.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'granite',
    environment: 'effects/env/dusk.env',
    clumpDensity: 3,
    clumps: [
      { path: 'doodads/terrain/tree_fir.unit', weight: 4, solid: 1 },
      { path: 'doodads/terrain/tree_pine.unit', weight: 3, solid: 2 },
      { path: 'doodads/terrain/tree_ash_red.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_fir_stump.unit', weight: 1, solid: 1 },
      { path: 'doodads/terrain/bush_rough.unit', weight: 2, solid: 2 }
    ],
    cover: [
      { path: 'doodads/terrain/fern.unit', weight: 4, solid: 0 },
      { path: 'doodads/terrain/mushroom_brown.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/mushroom_red.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/moss_bits.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/clover_orange.unit', weight: 2, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit', 'doodads/terrain/tree_oak_stump.unit']
    },
    village: {
      centre: { path: 'doodads/generic/well.unit', weight: 1, solid: 1 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: MARKET
    }
  },
  {
    id: 'desert',
    label: 'Desert',
    ground: 'tilesets/desert.tileset',
    patches: ['tilesets/desert_rough.tileset'],
    trail: 'tilesets/desert_cobble.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'silt',
    environment: 'effects/env/egypt_outside.env',
    clumpDensity: 0.6,
    clumps: [
      { path: 'doodads/terrain/tree_palm.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/cactus.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/stone_desert_large.unit', weight: 2, solid: 2 },
      { path: 'doodads/terrain/rock.unit', weight: 1, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/stone_desert_small.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/stone_desert_small_dark.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/desert_grass_patch.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/stone_desert_minor.unit', weight: 2, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_desert.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/generic/well_desert.unit']
    },
    village: {
      centre: { path: 'doodads/generic/well_desert.unit', weight: 1, solid: 1 },
      tents: [{ path: 'doodads/generic/tent_desert.unit', weight: 1, solid: 2 }],
      props: [
        ...MARKET.filter((p) => !p.path.includes('lantern')),
        { path: 'doodads/generic/lamp_brazier.unit', weight: 2, solid: 1 }
      ]
    }
  },
  {
    id: 'mud',
    label: 'Mudlands',
    ground: 'tilesets/mud_7.tileset',
    patches: ['tilesets/mud_3.tileset', 'tilesets/moss.tileset'],
    trail: 'tilesets/outlook_dirt.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'basalt',
    environment: 'effects/env/outside.env',
    clumpDensity: 1.2,
    clumps: [
      { path: 'doodads/terrain/tree_ash.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_oak_stump.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/stump.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/bush_rough.unit', weight: 3, solid: 2 },
      { path: 'doodads/terrain/rock_small.unit', weight: 2, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/grass_reed.unit', weight: 4, solid: 0 },
      { path: 'doodads/terrain/stone_mud_7.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/mushroom_poison.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/moss_bits.unit', weight: 2, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit', 'doodads/generic/well.unit']
    },
    village: {
      centre: { path: 'doodads/generic/well.unit', weight: 1, solid: 1 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: MARKET
    }
  },
  {
    id: 'snow',
    label: 'Snowfield',
    ground: 'tilesets/snow.tileset',
    patches: ['tilesets/snow_grass_tall.tileset'],
    trail: 'tilesets/temple_snow.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'granite2',
    environment: 'effects/lighting/outlook.env',
    clumpDensity: 1.5,
    clumps: [
      { path: 'doodads/terrain/tree_fir.unit', weight: 4, solid: 1 },
      { path: 'doodads/terrain/tree_pine.unit', weight: 2, solid: 2 },
      { path: 'doodads/terrain/ice_rock.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_fir_stump.unit', weight: 1, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/snow_chunk.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/stone_granite_small.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/grass_1_thin.unit', weight: 1, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_snow.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit']
    },
    village: {
      centre: { path: 'doodads/generic/outlook_fountain.unit', weight: 1, solid: 2 },
      tents: [
        { path: 'doodads/generic/tent_snow.unit', weight: 1, solid: 2 },
        { path: 'doodads/generic/tent_snow_round.unit', weight: 1, solid: 2 }
      ],
      props: MARKET
    }
  }
]

const BY_ID = new Map(BIOME_DEFS.map((b) => [b.id, b]))

/** The biome with this id, or undefined. */
export function biomeById(id: string): BiomeDef | undefined {
  return BY_ID.get(id)
}

/** Every biome id, in table order. */
export const BIOME_IDS: readonly string[] = BIOME_DEFS.map((b) => b.id)
