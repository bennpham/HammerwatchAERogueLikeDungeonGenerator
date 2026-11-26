/**
 * Hammerwatch 2 themes (experimental "Load custom" content; custom/sources.ts).
 *
 * Each is an HW2 wall set with the floor tilesets HW2's own level prefabs paint
 * beside it, and an HW2 lighting environment. They are read off
 * `<HW2>/unpacked_assets_137/prefabs/__levels` (docs/discovery/hammerwatch-2-assets.md).
 * Only sets with every piece the wall emitter needs are here: crypt, sewer,
 * prison, obsidian, cave_dark, cave_light, stone_6 and throne_room. (corrupted,
 * the hedges, ruins, stone_3/5/7 lack the `__color_64` cover piece, and jade has
 * no runs at all.)
 *
 * HW2 wall sets have no `exit_up`/`exit_dn` stair art (only `_exit_n/e/s/w`
 * openings), and AE's door art is the one the locked-room rig knows, so these
 * themes borrow AE stairs and doors. Floors are HW2 tilesets only: HW2's
 * `tilesets/layers.inc` draw order isn't ranked against AE's.
 */

import type { ThemeDef } from '../../config/themes'

const TS = (name: string): string => `hw2/tilesets/${name}.tileset`
const ENV = (name: string): string => `hw2/effects/env/${name}.env`

function hw2Theme(
  name: string,
  label: string,
  opts: { walls?: string; exit: string; floor: string[]; mixed?: string[]; environments: string[]; doors: ThemeDef['doors'] }
): ThemeDef {
  const def: ThemeDef = {
    id: `hw2_${name}`,
    label,
    group: 'Hammerwatch 2',
    source: 'hw2',
    walls: `hw2:${opts.walls ?? name}`,
    exitUpSet: opts.exit,
    exitDnSet: opts.exit,
    floor: opts.floor.map(TS),
    environments: opts.environments.map(ENV),
    doors: opts.doors
  }
  if (opts.mixed !== undefined) def.mixed = opts.mixed.map(TS)
  return def
}

export const HW2_THEMES: readonly ThemeDef[] = [
  hw2Theme('crypt', 'Crypt (HW2)', {
    exit: 'armory2',
    floor: ['crypt_default'],
    mixed: ['crypt_mosaik_black_8', 'crypt_skulls_16', 'crypt_tile_white_16'],
    environments: ['crypt_boss', 'grotto'],
    doors: 'armory'
  }),
  hw2Theme('sewer', 'Sewers (HW2)', {
    exit: 'prison2',
    floor: ['sewer_16'],
    mixed: ['slime_16', 'sewer_8', 'sewer_grass'],
    environments: ['sewers'],
    doors: 'prison'
  }),
  hw2Theme('prison', 'Prison (HW2)', {
    exit: 'prison',
    floor: ['prison_dirt', 'prison_tiles'],
    mixed: ['prison_grass_sparse'],
    environments: ['prison'],
    doors: 'prison'
  }),
  hw2Theme('obsidian', 'Obsidian Spire (HW2)', {
    exit: 'chambers2',
    floor: ['obsidian_32'],
    mixed: ['obsidian_16', 'obsidian_gold_16'],
    environments: ['obsidian_spire'],
    doors: 'chambers'
  }),
  hw2Theme('cave_dark', 'Wolf caves (HW2)', {
    exit: 'cave_desert',
    floor: ['cave_dark'],
    mixed: ['cave_dark_stone', 'mud_6', 'moss'],
    environments: ['wolfcave', 'spidercave'],
    doors: 'mine'
  }),
  hw2Theme('cave_light', 'Grotto (HW2)', {
    exit: 'cave_desert',
    floor: ['cave_light'],
    mixed: ['cave_light_stone', 'cave_light_grain', 'mud_2'],
    environments: ['grotto'],
    doors: 'mine'
  }),
  hw2Theme('thieves_tower', 'Thieves tower (HW2)', {
    walls: 'stone_6',
    exit: 'archives2',
    floor: ['stone_1_default'],
    mixed: ['stone_1_default_16', 'wood_3_16'],
    environments: ['thievestower'],
    doors: 'archives'
  }),
  hw2Theme('throne_room', 'Throne room (HW2)', {
    exit: 'chambers',
    floor: ['superbia_tower_32_a'],
    mixed: ['marble_2', 'marble_3'],
    environments: ['grotto'],
    doors: 'chambers'
  })
]
