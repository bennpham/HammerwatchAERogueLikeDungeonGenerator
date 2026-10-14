/**
 * Anniversary Edition themes. A theme is the visual set a level is built from:
 * a wall set (`doodads/walls/<walls>/`), a stack of floor tilesets, a lighting
 * environment, and the door art its locked rooms use.
 *
 * Ids are AE's own wall-set names — `prison`, `crypt`, `mine_granite` — never
 * the HW1 letters. Every pairing below was read off the stock levels that use
 * that wall set (Castle Hammerwatch, Shaftlocke Tower, Temple of the Sun): the
 * environment and the floor tilesets those levels paint with it. See the
 * DISCOVERY-LOG entry "Themes (AE ids)".
 *
 * Wall pieces come in three families, and `walls.ts` resolves a logical piece
 * to whichever unit the set ships:
 *
 * - new style (`h_32`, `v_32`, `cap_h_*`, `cap_v_*`, `h_single`): prison,
 *   prison2, armory, armory2, crypt, caves, pyramids;
 * - legacy style (`h`, `v`, `cap_e/w/n/s`, `single`): archives, chambers,
 *   battlement, challenge, mine_granite;
 * - the flat bonus sets, flat 16-px tiles with their own piece names and
 *   anchors (`crn_l_up`, `x_t_dn`, `h_cap_l`…; `FLAT_CANDIDATES` in aeWalls.ts).
 */

export type ThemeGroup = 'Castle Hammerwatch' | 'Shaftlocke Tower' | 'Temple of the Sun' | 'Caves' | 'Bonus'

export const THEME_GROUPS: readonly ThemeGroup[] = [
  'Castle Hammerwatch',
  'Shaftlocke Tower',
  'Temple of the Sun',
  'Caves',
  'Bonus'
]

/** Door art families AE ships (`doodads/doors/door_{h|v}_mid_<metal>_<style>.unit`). */
export type DoorStyle = 'prison' | 'armory' | 'archives' | 'chambers' | 'desert' | 'mine'

export interface ThemeDef {
  /** key used in `params.themes` — AE's wall-set name */
  id: string
  /** dropdown text */
  label: string
  group: ThemeGroup
  /** wall set folder under `doodads/walls/` */
  walls: string
  /** wall set whose `exit_up.unit` / `exit_dn.unit` the stairs use (sets without exit art borrow one) */
  exitUpSet: string
  exitDnSet: string
  /**
   * The way in and out is a floor pad inside the room (`doodads/special/bonus_entrance`
   * / `bonus_exit`, as stock bonus levels have) rather than stairs set in the wall
   */
  exitPads?: boolean
  /**
   * Floor tilesets, bottom layer first. The bottom layer is painted grown under
   * the walls (AE's own levels do the same, so no void shows at wall edges);
   * the rest cover walkable floor only.
   */
  floor: string[]
  /**
   * Optional alternate top layers. On a dungeon floor each room and corridor
   * draws one slot (slot 0 = none) from the cosmetic stream, so a level reads
   * as several related surfaces.
   */
  mixed?: string[]
  /** lighting environments the theme's stock levels use; a floor takes one by its index */
  environments: string[]
  doors: DoorStyle
  /** flat wall art (the bonus sets), whose doors are not keyed; see `cosmeticWarning` */
  sparsePieces?: boolean
  /** advisory note the validator surfaces once when the theme is used */
  cosmeticWarning?: string
}

const TS = (name: string) => `tilesets/${name}.tileset`
const LIGHT = (name: string) => `effects/lighting/${name}.env`
const ENV = (name: string) => `effects/env/${name}.env`

function theme(
  id: string,
  label: string,
  group: ThemeGroup,
  opts: {
    walls?: string
    exitUp?: string
    exitDn?: string
    exitPads?: boolean
    floor: string[]
    mixed?: string[]
    environments: string[]
    doors: DoorStyle
    sparsePieces?: boolean
    cosmeticWarning?: string
  }
): ThemeDef {
  const walls = opts.walls ?? id
  const def: ThemeDef = {
    id,
    label,
    group,
    walls,
    exitUpSet: opts.exitUp ?? walls,
    exitDnSet: opts.exitDn ?? opts.exitUp ?? walls,
    floor: opts.floor.map(TS),
    environments: opts.environments,
    doors: opts.doors
  }
  if (opts.mixed !== undefined) def.mixed = opts.mixed.map(TS)
  if (opts.exitPads === true) def.exitPads = true
  if (opts.sparsePieces === true) def.sparsePieces = true
  if (opts.cosmeticWarning !== undefined) def.cosmeticWarning = opts.cosmeticWarning
  return def
}

const BONUS_WARNING =
  'The bonus sets have only button doors, no keyed ones, so locked doors use prison art. ' +
  'Cosmetic only — the level is sealed.'

export const THEME_DEFS: readonly ThemeDef[] = [
  // --- Castle Hammerwatch (the remade campaign) -------------------------------
  theme('prison', 'Prison', 'Castle Hammerwatch', {
    floor: ['prison_dirt', 'prison_tiles'],
    mixed: ['prison_dirt_red', 'prison_grass_sparse'],
    environments: [LIGHT('prison_1'), LIGHT('prison_2'), LIGHT('prison_3')],
    doors: 'prison'
  }),
  theme('armory', 'Armory', 'Castle Hammerwatch', {
    floor: ['armory_tiles_16'],
    mixed: ['armory_tiles_red_8', 'armory_moss_16', 'armory_tiles_broken_16'],
    environments: [LIGHT('armory_1'), LIGHT('armory_2'), LIGHT('armory_3')],
    doors: 'armory'
  }),
  theme('archives', 'Archives', 'Castle Hammerwatch', {
    floor: ['archives_tiles'],
    mixed: ['archives_tiles_border', 'archives_moss', 'archives_wood'],
    environments: [LIGHT('archives_1'), LIGHT('archives_2'), LIGHT('archives_3')],
    doors: 'archives'
  }),
  theme('chambers', 'Chambers', 'Castle Hammerwatch', {
    floor: ['chambers_tiles'],
    mixed: ['chambers_carpet', 'chambers_tiles_dirt', 'chambers_marble'],
    environments: [LIGHT('chambers_1')],
    doors: 'chambers'
  }),

  // --- Shaftlocke Tower ------------------------------------------------------
  theme('prison2', 'Prison (Shaftlocke)', 'Shaftlocke Tower', {
    floor: ['prison2_dirt', 'prison2_tiles'],
    mixed: ['prison2_grass_sparse', 'slime_dark_16'],
    environments: [LIGHT('prison2_1'), LIGHT('prison2_2'), LIGHT('prison2_3')],
    doors: 'prison'
  }),
  // Shaftlocke's "armory" floors are the crypt wall set on crypt tiles; crypt
  // ships no exit art, so the stairs come from armory2, its accent set there
  theme('crypt', 'Crypt (Shaftlocke armory)', 'Shaftlocke Tower', {
    exitUp: 'armory2',
    floor: ['crypt_default', 'crypt_tile_black_16'],
    mixed: ['crypt_tile_white_a_32', 'crypt_skulls_16'],
    environments: [LIGHT('armory2_1'), LIGHT('armory2_2'), LIGHT('armory2_3')],
    doors: 'armory'
  }),
  theme('armory2', 'Armory (Shaftlocke)', 'Shaftlocke Tower', {
    floor: ['armory_tiles_16'],
    mixed: ['armory2_tiles_skulls', 'armory_tiles_blue_16'],
    environments: [LIGHT('armory2_1'), LIGHT('armory2_2'), LIGHT('armory2_3')],
    doors: 'armory'
  }),
  theme('archives2', 'Archives (Shaftlocke)', 'Shaftlocke Tower', {
    floor: ['archives_tiles', 'archives_tiles_border'],
    mixed: ['archives2_wood', 'archives_tiles_dirt'],
    environments: [LIGHT('archives2_2'), LIGHT('archives2_3')],
    doors: 'archives'
  }),
  theme('chambers2', 'Chambers (Shaftlocke)', 'Shaftlocke Tower', {
    floor: ['chambers2_tiles'],
    mixed: ['chambers2_carpet', 'chambers_tiles_dirt'],
    environments: [LIGHT('chambers2_1')],
    doors: 'chambers'
  }),
  theme('battlement', 'Battlements', 'Shaftlocke Tower', {
    exitDn: 'armory2',
    floor: ['battlement_stone_16'],
    mixed: ['battlement_stone', 'outlook_snow_16'],
    environments: [LIGHT('boss_dragon_entrance')],
    doors: 'prison'
  }),
  theme('mine_granite', 'Mines', 'Shaftlocke Tower', {
    floor: ['mine_granite_light'],
    mixed: ['mine_granite_sand_rough', 'mine_granite_light_stone', 'mine_granite_grass_tall'],
    environments: [LIGHT('mine_granite_1'), LIGHT('mine_granite_2'), LIGHT('mine_granite_3')],
    doors: 'mine'
  }),
  theme('challenge', 'Challenge', 'Shaftlocke Tower', {
    floor: ['challenge_tiles_cracked'],
    environments: [LIGHT('challange')],
    doors: 'chambers'
  }),

  // --- Temple of the Sun -----------------------------------------------------
  theme('pyramid_inside', 'Pyramid', 'Temple of the Sun', {
    floor: ['pyramid_inside_16'],
    mixed: ['pyramid_inside_32', 'pyramid_inside_8'],
    environments: [LIGHT('pyramid_slum_1'), LIGHT('pyramid_slum_3')],
    doors: 'desert'
  }),
  theme('pyramid_fancy', 'Pyramid (fancy)', 'Temple of the Sun', {
    floor: ['pyramid_fancy_16'],
    mixed: ['pyramid_fancy_32', 'pyramid_fancy_8'],
    environments: [LIGHT('pyramid_fancy_2')],
    doors: 'desert'
  }),

  // --- Caves -----------------------------------------------------------------
  theme('cave_desert', 'Desert cave', 'Caves', {
    floor: ['cave_desert_fine'],
    mixed: ['cave_desert_dark', 'cave_desert_rough', 'water_clear'],
    environments: [ENV('wolfcave')],
    doors: 'desert'
  }),
  theme('cave_crystal', 'Crystal cave', 'Caves', {
    floor: ['cave_crystal_fine'],
    mixed: ['cave_crystal_frozen', 'cave_crystal_path'],
    environments: [ENV('wolfcave')],
    doors: 'desert'
  }),
  // cave_dark ships no exit art; the desert cave's is the closest match
  theme('cave_dark', 'Dark cave', 'Caves', {
    exitUp: 'cave_desert',
    floor: ['cave_dark'],
    mixed: ['cave_dark_stone'],
    environments: [ENV('grotto')],
    doors: 'mine'
  }),

  // --- Bonus -----------------------------------------------------------------
  ...[1, 2, 3, 4, 5].map((n) =>
    theme(`bonus${n}`, `Bonus ${n}`, 'Bonus', {
      exitPads: true,
      floor: [`bonus_${n}`],
      environments: [LIGHT('bonus')],
      doors: 'prison',
      sparsePieces: true,
      cosmeticWarning: BONUS_WARNING
    })
  )
]

const BY_ID = new Map(THEME_DEFS.map((t) => [t.id, t]))

export function getTheme(id: string): ThemeDef | undefined {
  return BY_ID.get(id)
}

/** The theme ids, in dropdown order. */
export const THEMES: readonly string[] = THEME_DEFS.map((t) => t.id)

/** Which environment floor `index` of a run uses for `theme` — a pure function of the index. */
export function themeEnvironment(theme: ThemeDef, index: number): string {
  return theme.environments[index % theme.environments.length]
}
