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
  /** a `coast.ts` `EDGE_SETS` id: the cliff pieces round the coast */
  edgeSet: string
  /**
   * The cliff pieces round a plateau, one of `PLATEAU_EDGE_SETS`. Absent
   * means `edgeSet`; a granite coast needs one, as granite's stairs are broken.
   */
  plateauEdgeSet?: string
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
    plateauEdgeSet: 'granite2',
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
  },
  {
    id: 'coast',
    label: 'Beach',
    ground: 'tilesets/beach.tileset',
    patches: ['tilesets/beach_spots.tileset', 'tilesets/outlook_grass_16.tileset'],
    trail: 'tilesets/stones_river.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'silt',
    environment: 'effects/env/_morning.env',
    clumpDensity: 0.7,
    clumps: [
      { path: 'doodads/terrain/tree_palm.unit', weight: 4, solid: 1 },
      { path: 'doodads/terrain/rock.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/stone_desert_large.unit', weight: 2, solid: 2 },
      { path: 'doodads/generic/boat_small_wreck.unit', weight: 1, solid: 2 },
      { path: 'doodads/terrain/castle_debris_pile_water.unit', weight: 1, solid: 2 }
    ],
    cover: [
      { path: 'doodads/terrain/beach_shells.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/beach_stars.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/beach_holes_small.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/stone_desert_small_light.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/grass_switch.unit', weight: 2, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_desert.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/generic/boat_small.unit', 'doodads/generic/containers/barrel_wood.unit']
    },
    village: {
      centre: { path: 'doodads/generic/well_desert.unit', weight: 1, solid: 1 },
      tents: [
        { path: 'doodads/generic/tent_desert.unit', weight: 1, solid: 2 },
        { path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }
      ],
      props: [...MARKET, { path: 'doodads/generic/containers/sack_big.unit', weight: 2, solid: 1 }]
    }
  },
  {
    id: 'autumn',
    label: 'Autumn forest',
    ground: 'tilesets/grass_2_default.tileset',
    patches: ['tilesets/leaf_dry.tileset', 'tilesets/coniferneedle.tileset'],
    trail: 'tilesets/outlook_dirt.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'granite',
    plateauEdgeSet: 'granite2',
    environment: 'effects/env/_evening.env',
    clumpDensity: 2,
    clumps: [
      { path: 'doodads/terrain/tree_oak_red.unit', weight: 4, solid: 1 },
      { path: 'doodads/terrain/tree_ash_red.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/tree_oak_shadowed.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_oak_stump.unit', weight: 1, solid: 1 },
      { path: 'doodads/terrain/bush_rough.unit', weight: 2, solid: 2 }
    ],
    cover: [
      { path: 'doodads/terrain/clover_orange.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/mushroom_brown.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/flower_calluna.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/grass_2_thin.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/grass_foxtail.unit', weight: 2, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit', 'doodads/generic/fire_wood.unit']
    },
    village: {
      centre: { path: 'doodads/generic/outlook_fountain.unit', weight: 1, solid: 2 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: [
        ...MARKET,
        { path: 'doodads/generic/scarecrow.unit', weight: 1, solid: 1 },
        { path: 'doodads/generic/pitchfork.unit', weight: 1, solid: 0 },
        { path: 'doodads/terrain/crop_wheat.unit', weight: 2, solid: 0 },
        { path: 'doodads/terrain/crop_cabbage.unit', weight: 1, solid: 0 },
        { path: 'doodads/generic/containers/sack_big.unit', weight: 1, solid: 1 }
      ]
    }
  },
  {
    id: 'ashland',
    label: 'Ashland',
    ground: 'tilesets/cave_basalt.tileset',
    patches: ['tilesets/cave_dark_stone.tileset', 'tilesets/corrupted.tileset', 'tilesets/stones_basalt.tileset'],
    trail: 'tilesets/mud_6.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'basalt',
    environment: 'effects/env/obsidian_spire.env',
    clumpDensity: 1,
    clumps: [
      { path: 'doodads/terrain/rock_cave_dark.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/rock_cave_dark_small.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/boulder_cave.unit', weight: 2, solid: 2 },
      { path: 'doodads/terrain/troll_cave_boulder.unit', weight: 1, solid: 2 },
      { path: 'doodads/terrain/stalagmite_cave_dark_big.unit', weight: 2, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/stone_cave_basalt_small.unit', weight: 4, solid: 0 },
      { path: 'doodads/terrain/skulls.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/castle_debris.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/mushroom_poison.unit', weight: 1, solid: 0 },
      { path: 'doodads/generic/skeleton.unit', weight: 1, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/troll_bonfire.unit',
      extras: ['doodads/generic/troll_kettle.unit', 'doodads/troll/troll_drum.unit']
    },
    village: {
      centre: { path: 'doodads/generic/troll_rock_table.unit', weight: 1, solid: 3 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: [
        { path: 'doodads/generic/troll_kettle.unit', weight: 2, solid: 2 },
        { path: 'doodads/troll/troll_drum.unit', weight: 2, solid: 1 },
        { path: 'doodads/generic/troll_meat.unit', weight: 1, solid: 0 },
        { path: 'doodads/generic/troll_bed.unit', weight: 1, solid: 0 },
        { path: 'doodads/generic/lamp_brazier_red.unit', weight: 2, solid: 1 },
        { path: 'doodads/generic/instrument_drum_skull.unit', weight: 1, solid: 1 }
      ]
    }
  },
  {
    id: 'marsh',
    label: 'Marsh',
    ground: 'tilesets/mud_4.tileset',
    patches: ['tilesets/mud_2.tileset', 'tilesets/moss.tileset'],
    trail: 'tilesets/stones_river.tileset',
    water: 'tilesets/water_river_clear.tileset',
    edgeSet: 'granite',
    plateauEdgeSet: 'granite2',
    environment: 'effects/env/rain.env',
    clumpDensity: 1.3,
    clumps: [
      { path: 'doodads/terrain/tree_oak_shadowed.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/tree_ash.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/tree_fir_stump.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/bush_rough.unit', weight: 3, solid: 2 },
      { path: 'doodads/terrain/rock_cave_dark_small.unit', weight: 1, solid: 1 }
    ],
    cover: [
      { path: 'doodads/terrain/grass_reed.unit', weight: 4, solid: 0 },
      { path: 'doodads/terrain/fern.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/mushroom_poison.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/moss_bits.unit', weight: 3, solid: 0 },
      { path: 'doodads/terrain/grass_cotton.unit', weight: 2, solid: 0 },
      { path: 'doodads/terrain/flower_small.unit', weight: 1, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/terrain/log.unit', 'doodads/generic/cauldron.unit']
    },
    village: {
      centre: { path: 'doodads/generic/cauldron.unit', weight: 1, solid: 1 },
      tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
      props: MARKET
    }
  },
  {
    id: 'crystal',
    label: 'Crystal frost',
    ground: 'tilesets/cave_crystal_fine.tileset',
    patches: ['tilesets/cave_crystal.tileset', 'tilesets/cave_crystal_frozen.tileset', 'tilesets/outlook_snow_16.tileset'],
    trail: 'tilesets/cave_crystal_path.tileset',
    water: 'tilesets/water_clear.tileset',
    edgeSet: 'granite2',
    environment: 'effects/env/night2.env',
    clumpDensity: 1,
    clumps: [
      { path: 'doodads/terrain/rock_cave.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/rock_cave_small.unit', weight: 3, solid: 1 },
      { path: 'doodads/terrain/stalagmite_big.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/ice_rock.unit', weight: 2, solid: 1 },
      { path: 'doodads/terrain/tree_fir.unit', weight: 2, solid: 1 }
    ],
    cover: [
      // each crystal is a light, so they stay rare against the stones
      { path: 'doodads/generic/deco_crystal_small.unit', weight: 1, solid: 0 },
      { path: 'doodads/generic/deco_crystal_small_v2.unit', weight: 1, solid: 0 },
      { path: 'doodads/terrain/stone_cave_small.unit', weight: 6, solid: 0 },
      { path: 'doodads/terrain/snow_chunk.unit', weight: 4, solid: 0 }
    ],
    camp: {
      tent: 'doodads/generic/tent_snow.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['doodads/generic/lamps/brazier_big.unit']
    },
    village: {
      centre: { path: 'doodads/generic/lamps/brazier_big.unit', weight: 1, solid: 2 },
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

/** The cliff set round `biome`'s plateaus. */
export function plateauEdgeSet(biome: BiomeDef): string {
  return biome.plateauEdgeSet ?? biome.edgeSet
}
