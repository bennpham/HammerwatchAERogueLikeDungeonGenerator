import type { DoodadTypeName } from '../objects/doodad'

/**
 * How one theme differs from the default for a single doodad piece.
 *
 * `path` replaces the whole asset path verbatim (no `%s` substitution) for a
 * piece the theme's own folder does not ship. `xOffset`/`yOffset` replace the
 * defaults in `DoodadType`, which exist only to compensate for where the art is
 * anchored — see the offset rule on `THEMED_WALL_PIECES` below.
 */
export interface DoodadOverride {
  path?: string
  xOffset?: number
  yOffset?: number
}

/**
 * A theme is the visual set a level is built from: one tileset for the floors
 * plus one folder of wall-piece doodads.
 *
 * The two halves are declared separately because the game's asset names do not
 * agree. The classic themes are a single letter used for both
 * (`tilemaps/a_default.xml` + `doodads/theme_a/a_h_8.xml`), but the bonus sets
 * are `tilemaps/bonus_1.xml` + `doodads/theme_bonus1/bonus1_h_8.xml` — the
 * digit moves and an underscore appears, so no single token derives both.
 */
/** A floor tileset stacked over a theme's base: the path plus its sprite count. */
export interface ThemeOverlay {
  tilemap: string
  tiles: number
}

export interface ThemeDef {
  /** key used in `params.themes` and in parameters.txt */
  id: string
  /** dropdown text */
  label: string
  /** dropdown grouping */
  group: string
  /** full tileset path — deliberately not derived from `id` */
  tilemap: string
  /** floor variants the tileset has; emitted `data-t` values are 1..tiles */
  tiles: number
  /**
   * A second tileset stacked over `tilemap` on every floor tile, for the paired
   * dropdown entries (`c` and `c - tiles` are the same theme with and without
   * one). The base still covers the floor; this only adds art on top, so the
   * pair share every doodad, wall piece and grouping — see `overlayOf`.
   *
   * Draw order is *not* the order datasets appear in the block. The engine sorts
   * by the `level` attribute the tileset's own XML declares, so an overlay whose
   * `level` is below its base's silently renders underneath and the pairing does
   * nothing. Every entry in `THEME_OVERLAYS` was checked against
   * `editor/assetsExtract/tilemaps/*.xml` on that point.
   */
  overlay?: ThemeOverlay
  /**
   * A `x - mixed` entry's palette: slot 0 is `null`, meaning the plain base
   * floor, and every other slot is one of that base's curated overlays.
   *
   * On a dungeon floor each room and each corridor draws one slot, so a level
   * reads as several related surfaces — a carpeted hall into a dirt-floored
   * vault — instead of one uniform sheet. The boss arena is a single open
   * rectangle with no rooms to divide, so it lays the same palette out in a
   * geometric pattern instead; see `boss/arenaPattern.ts`.
   *
   * Mutually exclusive with `overlay`: a mixed def must leave `overlay` unset,
   * or `overlayDataset` would also fire and paint one variant over everything.
   */
  mixed?: ReadonlyArray<ThemeOverlay | null>
  /** substituted for `%s` in themed doodad paths */
  doodadToken: string
  /** per-piece deviations from the `DoodadType` defaults */
  doodadOverrides?: Partial<Record<DoodadTypeName, DoodadOverride>>
  /**
   * Wall piece used to close the gap the stair alcove leaves in the room's wall
   * band, for themes whose stair doodad has no collision polygon of its own.
   *
   * The lettered themes need nothing here: `a_exit_h_up.xml` declares a solid
   * `0..32 x -24..16` collider, so the stair sprite *is* the wall. The shared
   * `bonus_entrance.xml` / `bonus_exit.xml` declare no polygon at all, so without
   * this the player walks straight through the stairs and out of the level.
   */
  stairBacking?: DoodadTypeName
  /**
   * Skip the `Cover` overlay entirely.
   *
   * `Cover` hides the character behind wall *tops*, which assumes walls are
   * tall solid blocks seen from the front — true indoors, false for an outdoor
   * set whose "walls" are low cliff edges with open ground behind them. There
   * the overlay just paints someone else's stone over the terrain, since no
   * theme outside `a`–`g`/`i` ships a `color_theme_*` of its own.
   */
  omitCover?: boolean
  /**
   * This theme's wall pieces barricade a single *edge* of their tile instead of
   * filling it, so no single tile is ever solid.
   *
   * Measured coverage of theme h's collision polygons, sampled over the tile
   * rather than taken from their bounding boxes: 25% for `h_v_8_l`, 28% for
   * `h_h_8_dn`, 9% for `h_h_8_up`, at best 56% for any piece in the folder. A
   * room seals because those fences join into a closed loop *around a wall mass
   * several tiles thick*, not because the tiles block.
   *
   * The boss arena therefore gives such a theme a thicker wall band — one tile
   * is a geometry its art cannot seal, and three attempts to fix it by swapping
   * pieces all failed because there is no whole-tile piece to swap to.
   */
  directionalFences?: boolean
  /**
   * This theme's wall art is anchored on its own tile and overhangs nothing, so
   * the rows below a wall are open floor rather than dead space.
   *
   * The lettered art is three tiles tall anchored low (`a_h_8.xml` is
   * `<origin>0 32</origin>`, hence `DoodadType`'s `yOffset: 2`), so a wall at
   * tile T also fills T+1 and T+2 — see `OVERHANG_ROWS` in map/reachability.ts.
   * A flat theme fills T alone. Anything positioned to clear a doorway's own art
   * has to know which it is dealing with, or it lands two rows too far and, on a
   * short corridor, inside the next room entirely (see `overhangRows`).
   *
   * Not the same claim as `directionalFences`, which is about a piece fencing one
   * *edge* of its tile rather than filling it. A theme can be flat without being
   * fenced — every bonus theme is — but theme h is both. The evidence for the
   * flag is the `yOffset: 0` loop over `THEMED_WALL_PIECES` that each such theme
   * runs below.
   */
  flatWalls?: boolean
  /**
   * Advisory note surfaced once by `validateParameters` when the theme is used.
   *
   * For cosmetic quirks a theme cannot avoid — not for anything that blocks
   * generation, which belongs in `validation.ts` as an error. Keep it to one
   * sentence; the form renders it inline against the theme field.
   */
  cosmeticWarning?: string
}

/**
 * Every `themeSubs: 2` entry in `DoodadType` — the wall band pieces the pattern
 * matcher places, plus `Pillar`, a free-standing arena cover piece that merely
 * *shares* the two-substitution path template (`doodads/theme_<t>/<t>_*.xml`).
 * Listed literally rather than filtered off `DoodadType` to avoid a runtime
 * import cycle with doodad.ts; `themes.test.ts` asserts the two stay in sync,
 * so adding a themeSubs:2 piece without listing it here fails the suite.
 */
const THEMED_WALL_PIECES: readonly DoodadTypeName[] = [
  'CornerLD',
  'CornerLU',
  'CornerRD',
  'CornerRU',
  'ExitDn',
  'ExitUp',
  'Horizontal',
  'Vertical',
  'CrossWall',
  'VCapDown',
  'VCapUp',
  'HCapLeft',
  'HCapRight',
  'TDown',
  'TUp',
  'TLeft',
  'TRight',
  'Pillar'
]

function classic(id: string, tiles: number, group: string): ThemeDef {
  return { id, label: id, group, tilemap: `tilemaps/${id}_default.xml`, tiles, doodadToken: id }
}

/**
 * A bonus theme.
 *
 * Two things differ from the lettered themes, both read out of the game's asset
 * XML rather than guessed:
 *
 * 1. **Anchoring.** The lettered wall art is anchored low — `a_h_8.xml` declares
 *    `<origin>0 32</origin>` and `a_v_8.xml` `<origin>0 16</origin>`, which is
 *    exactly why `DoodadType` carries `yOffset` 2 and 1 for them (offset =
 *    origin_y / 16). Every piece in every bonus folder is anchored at `0 0`
 *    instead, so it needs `yOffset: 0`. Getting this wrong displaces the
 *    collision polygon along with the art, and the player walks through walls.
 * 2. **Missing pieces.** The bonus folders ship no `_exit_h_dn` / `_exit_h_up`
 *    stair frames; the game provides one shared pair. `ExitUp` is the
 *    level-start alcove, `ExitDn` the one carrying the level-exit node (see
 *    ObjectSet). There is no `color_theme_bonus<n>_16` either, so `Cover` — a
 *    pure character-occlusion overlay with no collider — borrows a lettered one.
 */
function bonus(n: number, tiles: number, coverLetter: string): ThemeDef {
  const doodadOverrides: Partial<Record<DoodadTypeName, DoodadOverride>> = {}
  for (const piece of THEMED_WALL_PIECES) {
    doodadOverrides[piece] = { yOffset: 0 }
  }

  // the shared stair art is 24x24 anchored at 0 0, where the lettered frames are
  // 32x48 anchored at 0 32 — these centre the smaller sprite in the same alcove
  doodadOverrides.ExitUp = { path: 'doodads/special/bonus_entrance.xml', xOffset: 0.25, yOffset: -1.25 }
  doodadOverrides.ExitDn = { path: 'doodads/special/bonus_exit.xml', xOffset: 0.25, yOffset: -1.25 }
  doodadOverrides.Cover = { path: `doodads/special/color_theme_${coverLetter}_16.xml` }
  // the folder's pillar is `<t>_pillar.xml`, not `<t>_special_pillar.xml` — the
  // classic themes' suffix, which the default DoodadType.Pillar template assumes
  doodadOverrides.Pillar = { path: `doodads/theme_bonus${n}/bonus${n}_pillar.xml`, yOffset: 0 }

  return {
    id: `bonus${n}`,
    label: `bonus ${n}`,
    group: 'Bonus',
    tilemap: `tilemaps/bonus_${n}.xml`,
    tiles,
    doodadToken: `bonus${n}`,
    doodadOverrides,
    // every piece above was forced to yOffset 0 — nothing overhangs
    flatWalls: true,
    // bonus_entrance/bonus_exit are pure sprites with no collision polygon, so
    // the wall band has to be closed with an ordinary wall segment
    stairBacking: 'Horizontal'
  }
}

/**
 * Theme "h" — the desert *outdoors* set, where "i" is desert indoors.
 *
 * It is a cliff/ledge set rather than a wall set, so it deviates from the
 * lettered themes in four ways, all read out of the supplied asset XML:
 *
 * 1. **Its colliders are edge fences, not solid tiles.** This is the fact the
 *    rest of the theme hangs off, and the one that has bitten twice. Each piece
 *    barricades a single edge of its tile — `h_h_8_dn` the top (y -0.13..0.38),
 *    `h_v_8_l` the right (x 0.63..1.13), `h_v_8_r` the left — and a room is
 *    sealed because those fences join into a closed loop around its wall band,
 *    not because the band is solid. The player can stand *inside* a boundary
 *    tile; that is by design. Two consequences: swapping one piece for another
 *    is only safe when the replacement fences the *same* edge, and wherever two
 *    perpendicular fences meet, something must close the joint (see 4).
 * 2. **Anchoring.** Every piece is `<origin>0 0</origin>`, like the bonus art and
 *    unlike the lettered art, so the 16x16 pieces take `yOffset: 0`. That is
 *    *not* a blanket rule: the folder's 16x32 pieces hold their polygon in the
 *    lower half and need `yOffset: -1` — `h_h_8_up`, both *up* corners, and both
 *    `h_h_cap_up_*`. Read the `<frame>` height and the polygon's y range before
 *    assuming a piece is flat; a 16x32 left at 0 fences the tile *below* the
 *    wall, which is a hole the player walks out of the level through.
 * 3. **Facing instead of junctions.** It ships no tees or cross, but it does ship
 *    a cliff face per direction (`h_h_8_dn`/`h_h_8_up`, `h_v_8_l`/`h_v_8_r`), and
 *    a `T*` pattern is precisely "wall mass with the opening on one side". So the
 *    tees map onto the faces by direction rather than borrowing junction art —
 *    which matters, because the tees are ~84% of a level's wall doodads.
 * 4. **Missing pieces.** No `x_x` and no `v_cap_*`. These take cliff faces too,
 *    so theme h borrows nothing from theme i and never mixes indoor stone into
 *    an outdoor level — but `CrossWall` is the corner joint from 1 and must be
 *    given a piece that covers the *whole* tile, not a fence. An absent wall
 *    doodad is an absent collider, so dropping any of them is not an option.
 *    `Cover` is the exception — see `omitCover`, which this theme sets.
 */
function desertOutdoor(): ThemeDef {
  const doodadOverrides: Partial<Record<DoodadTypeName, DoodadOverride>> = {}
  for (const piece of THEMED_WALL_PIECES) {
    doodadOverrides[piece] = { yOffset: 0 }
  }

  // The tees are ~84% of every level's wall doodads, and theme h ships none —
  // but it does not need them. A `T*` pattern is a wall mass with the opening on
  // exactly one side, which is what a directional cliff edge *is*, and the piece
  // names line up with the pattern names one for one. That is almost certainly
  // why this folder has facing variants and no junctions at all.
  //
  // The straights ride along: a one-tile-thick wall and the bottom edge of a
  // thick mass are the same cliff face, so they share a piece with their tee.
  doodadOverrides.TDown = { path: 'doodads/theme_h/h_h_8_dn.xml', yOffset: 0 } // open below
  doodadOverrides.TLeft = { path: 'doodads/theme_h/h_v_8_l.xml', yOffset: 0 } // open left
  doodadOverrides.TRight = { path: 'doodads/theme_h/h_v_8_r.xml', yOffset: 0 } // open right
  doodadOverrides.Horizontal = { path: 'doodads/theme_h/h_h_8_dn.xml', yOffset: 0 }
  doodadOverrides.Vertical = { path: 'doodads/theme_h/h_v_8_l.xml', yOffset: 0 }
  // 16x32 like h_h_8_up, and mis-anchored the same way until now: h_h_cap_up_l
  // holds its polygon at y 6..32 and h_h_cap_up_r at y 4..32, so flat they fenced
  // the tile below the stub's end instead of the end itself.
  doodadOverrides.HCapLeft = { path: 'doodads/theme_h/h_h_cap_up_l.xml', yOffset: -1 }
  doodadOverrides.HCapRight = { path: 'doodads/theme_h/h_h_cap_up_r.xml', yOffset: -1 }

  // open above — and the one piece whose anchor is not simply 0. The other three
  // faces are 16x16 and sit inside their own tile; h_h_8_up is 16x32 with its
  // collider in the lower half (y 13..32), so at yOffset 0 the barrier would land
  // a tile inside the wall mass instead of on its edge. -1 puts the collider back
  // on the wall tile with the cliff face rising into the tile above.
  doodadOverrides.TUp = { path: 'doodads/theme_h/h_h_8_up.xml', yOffset: -1 }

  // The two *up* corners are the same tall-sprite case as h_h_8_up, and need the
  // same lift. h_crn_l_up.xml / h_crn_r_up.xml are 16x32 with their collision
  // polygon in the lower half (y 16..32), where the 16x16 down corners carry
  // theirs at y -5..3. Flattened to yOffset 0 the up corners put their barrier a
  // full tile *below* the wall and draw their cliff a tile low with it, so the
  // top corners of every room were both misdrawn and walk-through. -1 puts the
  // collider back on the corner tile with the face rising into the tile above.
  doodadOverrides.CornerLU = { yOffset: -1 }
  doodadOverrides.CornerRU = { yOffset: -1 }

  // No 4-way junction and no vertical caps in this folder. They used to borrow
  // theme i, but grey indoor stone among sand cliffs read as someone else's wall
  // dropped into the desert, so they take the cliff faces instead.
  //
  // VCapUp caps a stub from above. VCapDown fences its own *top* edge, which is
  // exactly the stub-to-tile-below boundary — the player can stand in the end
  // tile but cannot travel up inside the wall, so the open-bottom face is right
  // here despite fencing only one edge. Do not "fix" it to a solid piece.
  doodadOverrides.VCapUp = { path: 'doodads/theme_h/h_h_8_up.xml', yOffset: -1 }
  doodadOverrides.VCapDown = { path: 'doodads/theme_h/h_h_8_dn.xml', yOffset: 0 }

  // CrossWall is the one tile that needs a *solid* piece, not a fence.
  //
  // It matches a wall tile whose four orthogonal neighbours are all wall and one
  // diagonal is floor — i.e. the outer corner of a room's wall band, where the
  // top row's fence (its top edge) and the side column's fence (its outer edge)
  // meet at right angles without touching. Only a collider covering the whole
  // tile closes that joint; anything else leaves a gap the player walks through
  // into the doodad-free void, which has no collision at all.
  //
  // h_h_8_up is the only piece in doodads/theme_h/ that qualifies: polygon
  // (0,32)(0,16)(8,13)(16,16)(16,32) is x 0..16, y 13..32, so at yOffset -1 it
  // covers x 0..1, y -0.19..1.0. That is the job theme i's i_x_x used to do
  // (x 0..1, y -0.5..1.0) before this theme stopped borrowing it. Swapping in a
  // better-facing cliff here reopens the hole — the seal is the requirement.
  doodadOverrides.CrossWall = { path: 'doodads/theme_h/h_h_8_up.xml', yOffset: -1 }

  // theme h ships no stair frames, so the alcove borrows the pyramid entrance —
  // a whole doorway structure rather than `h_pyramid_exit_door`, which is only
  // the door leaf and reads as a couple of loose planks at this size.
  //
  // It is a 55x59 sprite at <origin>31 59</origin>, so 3.44 x 3.69 tiles against
  // a 2-tile alcove: wider than the opening on purpose, the way a doorway is
  // wider than its door. The prefab places the piece at (x+2, y+3) and the alcove
  // opens on wall row y+1 across x+2..x+4, so these offsets centre the structure
  // on x+3 and rest its base on y+3.25 — the same base the door sat on.
  const entrance = { path: 'doodads/theme_h/h_pyramid_exit.xml', xOffset: 1.21875, yOffset: 0.25 }
  doodadOverrides.ExitUp = entrance
  doodadOverrides.ExitDn = entrance

  // theme h ships no `h_special_pillar` — the only solid free-standing prop in
  // the folder is this boulder, confirmed to carry a `<circle radius="18"/>`
  doodadOverrides.Pillar = { path: 'doodads/theme_h/h_deco_rock.xml', yOffset: 0 }

  return {
    id: 'h',
    label: 'h',
    group: 'Desert',
    tilemap: 'tilemaps/h_default.xml',
    // h_default.xml declares 2 floor sprites; its other 12 <sprite> tags live
    // inside <borders> and are picked by the engine, not by `data-t`
    tiles: 2,
    doodadToken: 'h',
    doodadOverrides,
    // h_pyramid_exit declares no collision polygon, so the wall band it sits in
    // has to be closed behind it — same as the bonus stair art
    stairBacking: 'Horizontal',
    // low cliff edges with open desert behind them: there is no wall top for an
    // occlusion overlay to sit on, and theme i's stone reads as grey slabs on sand
    omitCover: true,
    // its pieces fence one edge each and never fill a tile — see the flag's note
    directionalFences: true,
    // and, like the bonus art, every piece is anchored on its own tile
    flatWalls: true,
    // Verified in game: the level is sealed and reads correctly, but the folder
    // has no 4-way junction art, so corners borrow the 16x32 `h_h_8_up` face —
    // which is the only piece that seals a whole tile. Being a tile taller than
    // its neighbours, it overlaps them and can z-fight. Cosmetic and accepted;
    // the alternative is either grey indoor stone or a hole in every room.
    cosmeticWarning:
      'Theme h is an outdoor cliff set with no junction art, so wall pieces at ' +
      'room corners overlap and may flicker. In the boss arena the corners look ' +
      'especially odd: its pieces fence one edge each and never fill a tile, so ' +
      'the arena plugs every joint deliberately rather than leave a hole the ' +
      'player walks out through. Cosmetic only — the level is sealed.'
  }
}

/**
 * The plain themes — one tileset each, no overlay. `tiles` is the sprite count
 * declared by the tileset XML; emitting a `data-t` index above it is a
 * load-time error.
 */
const BASE_THEME_DEFS: readonly ThemeDef[] = [
  classic('a', 2, 'Classic dungeon'),
  classic('b', 4, 'Classic dungeon'),
  classic('c', 4, 'Classic dungeon'),
  classic('d', 8, 'Classic dungeon'),
  classic('e', 2, 'Castle'),
  classic('f', 2, 'Castle'),
  classic('g', 2, 'Castle'),
  desertOutdoor(),
  classic('i', 8, 'Desert'),
  bonus(1, 2, 'a'),
  bonus(2, 1, 'a'),
  bonus(3, 1, 'a'),
  bonus(4, 1, 'a'),
  bonus(5, 1, 'a')
]

/**
 * A base theme paired with one of the alternate tilesets its art sheet ships.
 *
 * Everything but the id, label and overlay is inherited by spread, which is the
 * whole point: `c - tiles` must resolve the same walls, stairs, pillars, cover
 * and cosmetic warning as `c`, because it *is* theme c with extra floor art. It
 * also lands in c's dropdown group automatically.
 *
 * `id` is the overlay tileset's filename so the value written to parameters.txt
 * says what it does; it carries no comma, which is what `themes=` needs.
 */
function overlayOf(baseId: string, file: string, tiles: number, suffix: string): ThemeDef {
  const base = BASE_THEME_DEFS.find((t) => t.id === baseId)
  if (base === undefined) throw new Error(`overlayOf: no base theme "${baseId}"`)
  return {
    ...base,
    id: file,
    label: `${base.label} - ${suffix}`,
    overlay: { tilemap: `tilemaps/${file}.xml`, tiles }
  }
}

/**
 * The curated alternate-tileset pairings, as `[baseId, overlayFile, tiles, suffix]`.
 *
 * `tiles` is the count of *top-level* `<sprite scale=…>` in the overlay's XML.
 * Sprites nested in `<borders>` do not count — the engine picks those itself and
 * they are not addressable by `data-t` (the same rule theme h's comment records).
 *
 * Curated, not exhaustive. The game ships ~25 more non-border overlays; these are
 * the ones whose art plausibly reads as a whole floor. Deliberately left out, and
 * cheap to add once someone has looked at them in game: the `*_moss` sets (draw
 * level 900+, sparse decoration meant to dapple a floor rather than be one), the
 * `*_scattered` / `*_dirt` / `*_path` sets that ship `<borders>` and so are built
 * for patches, and the theme-agnostic `grass*` / `slime_green` layers.
 *
 * Themes h and bonus 1-5 ship no non-border overlay at all, so they pair with
 * nothing and appear once each.
 */
const THEME_OVERLAYS: ReadonlyArray<readonly [string, string, number, string]> = [
  ['a', 'a_dirt', 2, 'dirt'],
  ['b', 'b_tiles_mixed', 4, 'tiles'],
  ['b', 'b_tiles_red', 1, 'red tiles'],
  ['c', 'c_tiles', 4, 'tiles'],
  ['c', 'c_tiles_dirt', 8, 'tiles dirt'],
  ['d', 'd_default_dirt', 4, 'dirt'],
  ['d', 'd_carpet', 6, 'carpet'],
  ['e', 'e_default_dark', 2, 'dark'],
  ['e', 'e_fine', 2, 'fine'],
  ['f', 'f_fine', 2, 'fine'],
  ['f', 'f_frozen', 2, 'frozen'],
  ['g', 'g_fine', 2, 'fine'],
  ['g', 'g_path_dense', 4, 'dense path'],
  ['i', 'i_symbols', 4, 'symbols']
]

/** The overlays curated for one base theme, in registry order. */
function overlaysFor(baseId: string): ThemeOverlay[] {
  return THEME_OVERLAYS.filter(([b]) => b === baseId).map(([, file, tiles]) => ({
    tilemap: `tilemaps/${file}.xml`,
    tiles
  }))
}

/**
 * A base theme whose floor varies between the plain tileset and each of its
 * curated overlays, region by region — the `x - mixed` dropdown entries.
 *
 * Built by the same spread as `overlayOf` and for the same reason: `c - mixed`
 * is theme c, with c's walls, stairs, doodads and grouping. `overlay` is cleared
 * explicitly because the spread would otherwise carry nothing useful and the two
 * fields must never both be set — `overlay` means "this tileset everywhere",
 * which is exactly what mixing is not.
 *
 * Only generated for a base with at least one curated overlay, so a mixed
 * palette always has something to mix in.
 */
function mixedOf(baseId: string): ThemeDef {
  const base = BASE_THEME_DEFS.find((t) => t.id === baseId)
  if (base === undefined) throw new Error(`mixedOf: no base theme "${baseId}"`)
  return {
    ...base,
    id: `${baseId}_mixed`,
    label: `${base.label} - mixed`,
    overlay: undefined,
    mixed: [null, ...overlaysFor(baseId)]
  }
}

/**
 * Every theme the generator can emit: each plain theme, then its overlay
 * pairings, then its mixed entry — so the dropdown reads `c`, `c - tiles`,
 * `c - tiles dirt`, `c - mixed`, `d`, … The renderer derives its `<optgroup>`s
 * from this order.
 */
export const THEME_DEFS: readonly ThemeDef[] = BASE_THEME_DEFS.flatMap((base) => {
  const overlays = THEME_OVERLAYS.filter(([baseId]) => baseId === base.id).map(
    ([baseId, file, tiles, suffix]) => overlayOf(baseId, file, tiles, suffix)
  )
  return overlays.length === 0 ? [base] : [base, ...overlays, mixedOf(base.id)]
})

const BY_ID = new Map(THEME_DEFS.map((t) => [t.id, t]))

export function getTheme(id: string): ThemeDef | undefined {
  return BY_ID.get(id)
}

export { THEMED_WALL_PIECES }
