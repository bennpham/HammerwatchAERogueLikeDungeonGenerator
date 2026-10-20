/**
 * Castle Hammerwatch's opening bridge (`castle_hammerwatch/levels/level_1.lvl`)
 * as a lobby, after the HW1 remake's `castle-bridge` room
 * (docs/discovery/castle-bridge-lobby.md).
 *
 * In AE the bridge is a row of `hw_bridge` pieces over a void, the piece by
 * the walkway shown broken (scene `2`); the party arrives on the walkway east
 * of the gap. The level is also the campaign's last: cutscene heroes, a
 * campfire, the plank puzzle that spans the gap at the end, and invisible
 * fences (`:Physics_Rectangle`) that keep the party on the walkway until then.
 *
 * The cleanup crops the room, mends the bridge and turns it into a shop:
 *
 * - **crop:** the bridge and the walkway, every tile outside a margin and
 *   every unit outside the visible room dropped, with every script but the
 *   arrival, every prefab, actor, pickup, hidden unit, puzzle prop and floor
 *   sign, and every `:Physics_*` shape (the cutscene's fences and triggers);
 * - **repair:** the broken piece shown whole (scene `1`) and a whole piece
 *   (scene `3`) laid over the stub east of it;
 * - **closure:** AE takes collision from units alone, so the void beside the
 *   deck is walkable: a solid rail along the deck's south edge, a stop past
 *   its west end, and stone blocks (each backed by a solid rectangle that
 *   closes the gap exactly) in the corridor north of the gap and across the
 *   walkway's east end;
 * - **stalls:** six along the deck's north rail, east to west combo,
 *   offense, defense, misc, power (HW1's five) and items, each with its use
 *   circle on the deck;
 * - **way out:** a teleporter at the deck's west end, under a blue light, that
 *   the lobby builder wires as the press-F exit (red before a fight);
 * - **payout:** diamond and upgrade spots on the walkway, never the deck;
 * - **music:** the act-1 track (`PlayMusic` 2) on load, labelled
 *   `lobby:music` so a lobby's own music choice replaces it;
 * - **roof:** the castle's own wall colour (`doodads/walls/prison/__color_N`)
 *   over everything in the crop outside the visible room.
 *
 * Every anchor is found by unit path and position; a missing one throws, so a
 * changed stock level can't misplace a seal.
 */
import type { AeLevel, AeUnit, StateValue } from '../ae/model'
import { P } from '../ae/model'
import { CELL, decodeRle, encodeRle, rleLength } from '../ae/tiles'
import { ICON_SHOP, SHOP_ITEMS, SHOP_SKILLS } from '../objects/nodes'
import { SHOP_KINDS, itemStandBadge } from '../objects/objectSet'
import { DIAMOND_UNIT, UPGRADE_KINDS, upgradeItemPath } from './payout'

/** A px rectangle, `x1`/`y1` exclusive. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * What the party sees: the bridge from just under the north wall's cap row
 * (the roof hides the caps and the arch tops, so wall meets roof in one
 * straight line) down to the south rail, and the walkway with two tiles of
 * chasm under its ledge.
 */
export const CASTLE_BRIDGE_VISIBLE: readonly Box[] = [
  { x0: -896, y0: 120, x1: -448, y1: 256 },
  { x0: -448, y0: 120, x1: -32, y1: 224 }
]

/** Everything kept: the visible room and two tiles of roof around it. */
export const CASTLE_BRIDGE_CROP: Box = { x0: -928, y0: 56, x1: 0, y1: 288 }

const BRIDGE = 'doodads/walls/prison/hw_bridge.unit'
const BLOCK = 'doodads/generic/deco_block.unit'
const PORTAL = 'doodads/generic/teleport_mt.unit'
const LIGHT = 'effects/lights/light_L.png'
const ROOF = (n: number): string => `doodads/walls/prison/__color_${n}.unit`
const ROOF_SIZES = [256, 128, 64, 32, 16, 8]
/** The roof's grid: half a tile, for the cap-row line. */
const ROOF_GRID = 8
const GRID = 16
/** How far outside the visible room a unit may stand and still be kept: a wall anchored there draws into it. */
const UNIT_MARGIN = 32

/** The bridge pieces' row and their width in scene `1`/`3`. */
const DECK_Y = 162
const PIECE = 64
/** The deck's walkable lane: under the north ledge row, above the south rail. */
const LANE_TOP = 168
const RAIL_TOP = 194
const RAIL_BOTTOM = 210

/**
 * The stalls, east to west, one every three tiles from the gap: HW1's five,
 * then the equipment stand every AE lobby has.
 */
const STALLS: ReadonlyArray<{ id: string; path: string; x: number }> = [
  { id: 'combo', path: 'doodads/generic/shop_combo.unit', x: -472 },
  { id: 'offense', path: 'doodads/generic/shop_offense.unit', x: -520 },
  { id: 'defense', path: 'doodads/generic/shop_defense.unit', x: -568 },
  { id: 'misc', path: 'doodads/generic/shop_health.unit', x: -616 },
  { id: 'power', path: 'doodads/generic/shop_potion.unit', x: -664 },
  { id: 'item', path: 'doodads/generic/shop_item.unit', x: -712 }
]
/** A stand's y: against the north rail, its 4-px collider on the ledge row. */
const STALL_Y = 170
/** Its use circle: on the deck below the stand. */
const USE_Y = 184
const USE_RADIUS = 16

/**
 * Payout spots on the walkway, two rows each: the diamonds east of the
 * arrival, then the upgrades past the barrels by the second alcove.
 */
const PAYOUT_ROWS = [172, 188]
const DIAMOND_X0 = -288
const UPGRADE_X0 = -144

/** `PlayMusic.Music` for Castle's act 1 (music/tracks.ts). */
const ACT1_MUSIC = 2

/** The castle's own blue, as level_1's bridge lights wear it. */
const PORTAL_LIGHT: Record<string, StateValue> = {
  'cast-shadows': { kind: 'int', value: 0 },
  size: { kind: 'float', value: 220 },
  color: { kind: 'string', value: '0.0144438 0.287441 0.55834 0' },
  overlay: { kind: 'bool', value: false },
  overbright: { kind: 'float', value: 1 }
}

const DROPPED_UNIT = [
  /^actors\//,
  /^items\//,
  /^gui\//,
  /^:/,
  // level_1's own roof, which the cleanup lays afresh
  /\/__color_\d+\.unit$/,
  // the end-game puzzle's buttons and the floor signs
  /^doodads\/generic\/button_/,
  /\/floorsign/
]

export function cleanCastleBridge(level: AeLevel): AeLevel {
  // --- anchors ---------------------------------------------------------------
  const pieces = level.units.filter((u) => u.path === BRIDGE && u.y === DECK_Y)
  const broken = pieces.filter((u) => sceneOf(u) === '2')
  if (broken.length !== 1) throw new Error(`castle bridge: expected one broken bridge piece, found ${broken.length}`)
  const westEnd = Math.min(...pieces.map((u) => u.x))
  if (westEnd !== CASTLE_BRIDGE_VISIBLE[0].x0) throw new Error(`castle bridge: the deck starts at x ${westEnd}, not ${CASTLE_BRIDGE_VISIBLE[0].x0}`)
  const spawn = level.scripts.find((s) => s.cls === 'LevelStart' && !s.params.some((p) => p.name === 'StartID'))
  if (spawn === undefined) throw new Error('castle bridge: no default LevelStart')
  // the corridor north of the gap, between its two wall junctions
  const mouthW = need(level, 'doodads/walls/prison/x_w.unit', -448, 128)
  const mouthE = need(level, 'doodads/walls/prison/x_e.unit', -400, 128)
  // the narrow one between the tower's two walls west of it
  const towerW = need(level, 'doodads/walls/prison/v_32.unit', -560, 96)
  const towerE = need(level, 'doodads/walls/prison/v_32.unit', -528, 96)
  // the walkway's east end, where its north wall turns away
  const eastEnd = need(level, 'doodads/walls/prison/crn_se.unit', -64, 144)

  // --- crop ------------------------------------------------------------------
  // the cutscene's cast and props: every unit a HideUnit shows or hides
  const cast = new Set<number>()
  for (const s of level.scripts) {
    if (s.cls !== 'HideUnit') continue
    for (const p of s.params) if (p.kind === 'ids' && p.name === 'Units') p.value.forEach((id) => cast.add(id))
  }
  level.scripts = [spawn]
  spawn.connections = []
  level.prefabs = []
  const shown = CASTLE_BRIDGE_VISIBLE.map((b) => grow(b, UNIT_MARGIN))
  const kept = (u: { path: string; x: number; y: number; state?: Record<string, StateValue> }) =>
    shown.some((b) => inside(b, u.x, u.y)) && !DROPPED_UNIT.some((re) => re.test(u.path)) && u.state?.hidden?.value !== true
  level.units = level.units.filter((u) => kept(u) && !cast.has(u.id))
  level.statics = level.statics.filter(kept)
  cropTiles(level, CASTLE_BRIDGE_CROP)

  // --- repair ----------------------------------------------------------------
  setScene(broken[0], '1')
  level.addUnit(BRIDGE, broken[0].x + PIECE, DECK_Y, { start: { kind: 'string', value: '3' } })

  // --- closure ---------------------------------------------------------------
  // the south rail, from past the deck's west end to the walkway's ledge
  solid(level, { x0: westEnd - GRID, y0: RAIL_TOP, x1: -336, y1: RAIL_BOTTOM })
  // the stop past the west end, up to the north rail
  solid(level, { x0: westEnd - GRID, y0: 144, x1: westEnd, y1: RAIL_BOTTOM })
  // the two corridors north off the deck: by the gap, and between the tower walls west of it
  plugDoorway(level, mouthW.x + GRID, mouthE.x)
  plugDoorway(level, towerW.x + GRID, towerE.x)
  // the walkway's east end: a block across it, wall to ledge
  level.addUnit(BLOCK, eastEnd.x + 8, 182)
  solid(level, { x0: eastEnd.x + 8, y0: 160, x1: eastEnd.x + 32, y1: 198 })

  // --- stalls ----------------------------------------------------------------
  for (const stall of STALLS) {
    const kind = SHOP_KINDS.find((k) => k.id === stall.id)
    if (kind === undefined) throw new Error(`castle bridge: no shop kind ${stall.id}`)
    // the item stand wears its tier badge, as a floor's does
    const badge = kind.type === SHOP_ITEMS ? itemStandBadge(kind.categories) : undefined
    level.addUnit(stall.path, stall.x, STALL_Y, badge === undefined ? undefined : { start: { kind: 'string', value: badge } })
    const circle = level.addCircleSensor(stall.x, USE_Y, USE_RADIUS)
    // on the stand, where the lobby builder looks for a stall's sign
    const use = level.addScript('UseTrigger', stall.x, STALL_Y, [P.int('Icon', ICON_SHOP), P.ids('Areas', [circle.id])])
    const params = [P.target('#PlayerTarget', use.id, 'User'), P.str('Categories', kind.categories)]
    if (kind.type !== SHOP_SKILLS) params.push(P.int('Type', kind.type))
    const area = level.addScript('ShopArea', stall.x, STALL_Y, params, { label: `lobby:vendor:${stall.id}` })
    level.link(use, area)
  }

  // --- way out ---------------------------------------------------------------
  const portalX = westEnd + 24
  const portalY = Math.round((LANE_TOP + RAIL_TOP) / 2)
  level.addUnit(PORTAL, portalX, portalY, { start: { kind: 'string', value: 'open' } })
  level.addUnit(LIGHT, portalX, portalY - 8, PORTAL_LIGHT)

  // --- payout ----------------------------------------------------------------
  PAYOUT_ROWS.forEach((y, row) => {
    for (let i = 0; i < 6; i++) level.addUnit(DIAMOND_UNIT, DIAMOND_X0 + i * GRID, y)
    for (let i = 0; i < 6; i++) level.addUnit(upgradeItemPath(UPGRADE_KINDS[row * 6 + i]), UPGRADE_X0 + i * GRID, y)
  })

  // --- music -----------------------------------------------------------------
  const onLoad = level.addScript('ScriptLink', spawn.x, spawn.y + GRID, [], { executeOnStart: true, triggerTimes: 1 })
  const music = level.addScript('PlayMusic', spawn.x + GRID, spawn.y + GRID, [P.int('Music', ACT1_MUSIC)], { label: 'lobby:music' })
  level.link(onLoad, music)

  // --- roof ------------------------------------------------------------------
  roof(level)
  return level
}

function need(level: AeLevel, path: string, x: number, y: number): AeUnit {
  const u = level.units.find((v) => v.path === path && v.x === x && v.y === y)
  if (u === undefined) throw new Error(`castle bridge: no ${path} at ${x},${y}`)
  return u
}

function sceneOf(u: AeUnit): string | undefined {
  const start = u.state?.start
  return start?.kind === 'string' ? start.value : undefined
}

function setScene(u: AeUnit, scene: string): void {
  u.state = { ...u.state, start: { kind: 'string', value: scene } }
}

function inside(b: Box, x: number, y: number): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
}

function grow(b: Box, by: number): Box {
  return { x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by }
}

/**
 * Close a doorway in the north rail between `x0` and `x1`: a stone block
 * centred in it, and a solid rectangle wall to wall behind it (a block is 24
 * px wide whatever the doorway is).
 */
function plugDoorway(level: AeLevel, x0: number, x1: number): void {
  level.addUnit(BLOCK, (x0 + x1) / 2 - 12, 148)
  solid(level, { x0, y0: 140, x1, y1: 160 })
}

/** A solid, invisible rectangle, flagged as level_1's own fences are. */
function solid(level: AeLevel, b: Box): AeUnit {
  return level.addUnit(':Physics_Rectangle', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, {
    active: { kind: 'bool', value: true },
    'jam-through': { kind: 'bool', value: true },
    sensor: { kind: 'bool', value: false },
    'shot-through': { kind: 'bool', value: true },
    'aim-through': { kind: 'bool', value: true },
    size: { kind: 'vec2', value: [b.x1 - b.x0, b.y1 - b.y0] }
  })
}

/** Clear every tile not wholly inside `crop`, dropping datasets and cells left empty. */
function cropTiles(level: AeLevel, crop: Box): void {
  const half = CELL / 2
  level.tileCells = level.tileCells
    .map((cell) => {
      const datasets = cell.datasets
        .map((ds) => {
          const side = Math.round(Math.sqrt(rleLength(ds.rle)))
          const size = CELL / side
          const grid = decodeRle(ds.rle, side).map((on, i) => {
            const x = cell.x - half + (i % side) * size
            const y = cell.y - half + Math.trunc(i / side) * size
            return on && x >= crop.x0 && x + size <= crop.x1 && y >= crop.y0 && y + size <= crop.y1
          })
          return { tileset: ds.tileset, rle: encodeRle(grid), any: grid.some(Boolean) }
        })
        .filter((ds) => ds.any)
        .map(({ tileset, rle }) => ({ tileset, rle }))
      return { ...cell, datasets }
    })
    .filter((cell) => cell.datasets.length > 0)
}

/**
 * Cover the crop outside the visible room with the castle's wall colour: on a
 * 16-px grid, reading order, each uncovered cell takes the largest square that
 * fits. A `__color_N` square is drawn above-right of its anchor.
 */
function roof(level: AeLevel): void {
  const { x0, y0, x1, y1 } = CASTLE_BRIDGE_CROP
  const w = (x1 - x0) / ROOF_GRID
  const h = (y1 - y0) / ROOF_GRID
  const open = (cx: number, cy: number) => CASTLE_BRIDGE_VISIBLE.some((b) => inside(b, x0 + cx * ROOF_GRID, y0 + cy * ROOF_GRID))
  const done = new Uint8Array(w * h)
  const free = (cx: number, cy: number) => cx < w && cy < h && done[cx + cy * w] === 0 && !open(cx, cy)
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (!free(cx, cy)) continue
      const n = ROOF_SIZES.find((size) => fits(free, cx, cy, size / ROOF_GRID)) ?? ROOF_GRID
      const k = n / ROOF_GRID
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) done[cx + dx + (cy + dy) * w] = 1
      level.addUnit(ROOF(n), x0 + cx * ROOF_GRID, y0 + cy * ROOF_GRID + n)
    }
  }
}

function fits(free: (cx: number, cy: number) => boolean, cx: number, cy: number, k: number): boolean {
  for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) if (!free(cx + dx, cy + dy)) return false
  return true
}
