/**
 * Hammerwatch 2 World biomes (experimental "Load custom" content;
 * custom/sources.ts): HW2 ground, trail, patch and water tilesets, HW2 terrain
 * scatter and HW2 lighting.
 *
 * Tile layers, from HW2's `tilesets/layers.inc` (higher draws over): every
 * trail and patch sits above its ground, as world/biomes.ts requires.
 *   highlands: grass_2_default -148, grass_3_default -156, grass_2_sparse -46,
 *     leaf_dry_highland -67, desert_cobble -128, water_clear -36;
 *   coast: beach -241, grass_1_default -140, beach_spots -58, beach_noise_8 -120,
 *     desert_cobble -128;
 *   night woods: mud_2 -174, mud_1 -171, moss -54, coniferneedle -73,
 *     stones_river -72, water_corrupt -35.
 *
 * The cliffs round the coast and plateaus are AE's own sets (AE ships the same
 * basalt, granite and silt pieces HW2 does), and the camp and village props
 * are AE's. Scatter `solid` radii are each unit's own collision, measured with
 * `node scripts/dev/hw2-scatter-survey.mjs` (2026-11-26).
 */

import type { BiomeDef, ScatterEntry } from '../../world/biomes'

const TS = (name: string): string => `hw2/tilesets/${name}.tileset`
const ENV = (name: string): string => `hw2/effects/env/${name}.env`
const T = (name: string, weight: number, solid: number): ScatterEntry => ({ path: `hw2/doodads/terrain/${name}.unit`, weight, solid })

/** AE's own village market (world/biomes.ts), so a village reads the same in any biome. */
const MARKET: ScatterEntry[] = [
  { path: 'doodads/generic/deco_vendor_cart.unit', weight: 2, solid: 1 },
  { path: 'doodads/generic/containers/barrel_wood.unit', weight: 3, solid: 1 },
  { path: 'doodads/generic/containers/crate_wood_16x16.unit', weight: 3, solid: 1 },
  { path: 'doodads/generic/lamps/lantern.unit', weight: 2, solid: 1 },
  { path: 'doodads/signs/sign_pole.unit', weight: 1, solid: 1 }
]

const VILLAGE = {
  centre: { path: 'doodads/generic/outlook_fountain.unit', weight: 1, solid: 2 },
  tents: [{ path: 'doodads/generic/tent_shaman.unit', weight: 1, solid: 2 }],
  props: MARKET
}

export const HW2_BIOMES: readonly BiomeDef[] = [
  {
    id: 'hw2_highlands',
    label: 'Highlands (HW2)',
    source: 'hw2',
    ground: TS('grass_2_default'),
    highGround: TS('grass_3_default'),
    patches: [TS('grass_2_sparse'), TS('leaf_dry_highland')],
    trail: TS('desert_cobble'),
    water: TS('water_clear'),
    edgeSet: 'granite2',
    environment: ENV('_day'),
    clumpDensity: 1.2,
    clumps: [T('tree_oak_red', 3, 1), T('tree_oak_shadowed', 2, 1), T('tree_ash', 3, 1), T('bush_rough', 2, 2), T('rock_silt_cliff', 1, 2)],
    cover: [T('grass_cotton', 3, 0), T('grass_foxtail', 3, 0), T('grass_switch', 2, 0), T('flower_lupine', 2, 0), T('flower_poppy', 1, 0), T('flower_calluna', 1, 0)],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['hw2/doodads/terrain/log.unit', 'hw2/doodads/terrain/tree_oak_stump.unit']
    },
    village: VILLAGE
  },
  {
    id: 'hw2_coast',
    label: 'Palm coast (HW2)',
    source: 'hw2',
    ground: TS('beach'),
    highGround: TS('grass_1_default'),
    patches: [TS('beach_spots'), TS('beach_noise_8')],
    trail: TS('desert_cobble'),
    water: TS('water_clear'),
    edgeSet: 'silt',
    environment: ENV('_day'),
    clumpDensity: 0.7,
    clumps: [T('tree_palm', 4, 1), T('rock_silt_cliff', 2, 2), T('rock_silt_cliff_small', 2, 1), T('bush_trimmed', 1, 1)],
    cover: [T('beach_shells', 3, 0), T('beach_stars', 2, 0), T('beach_holes_small', 2, 0), T('grass_reed', 2, 0), T('flower_sun', 1, 0)],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['hw2/doodads/terrain/log.unit']
    },
    village: VILLAGE
  },
  {
    id: 'hw2_night_woods',
    label: 'Night woods (HW2)',
    source: 'hw2',
    ground: TS('mud_2'),
    highGround: TS('mud_1'),
    patches: [TS('moss'), TS('coniferneedle')],
    trail: TS('stones_river'),
    water: TS('water_corrupt'),
    edgeSet: 'basalt',
    environment: ENV('_night_bright'),
    clumpDensity: 2.5,
    clumps: [T('tree_fir', 4, 2), T('tree_pine', 3, 1), T('tree_fir_stump', 1, 1), T('rock_cave_dark', 1, 2), T('stalagmite_big', 1, 1)],
    // HW2's mushrooms are pickups (GiveItem, a class AE lacks), so none here
    cover: [T('fern', 4, 0), T('moss_bits', 3, 0), T('skulls', 1, 0), T('stone_mud_7', 2, 0), T('petal', 1, 0)],
    camp: {
      tent: 'doodads/generic/tent_shaman.unit',
      fire: 'doodads/generic/campfire.unit',
      extras: ['hw2/doodads/terrain/log.unit', 'hw2/doodads/terrain/tree_fir_stump.unit']
    },
    village: VILLAGE
  }
]
