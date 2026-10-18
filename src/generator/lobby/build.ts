import { LOBBY_VENDORS, categoriesFor, vendorIdOfShopArea } from './shops'
import type { LobbyPresetDef } from './presets'
import { DIAMOND_UNIT, UPGRADE_KINDS, diamondCount, upgradeItemPath } from './payout'
import type { LobbyOptions } from '../config/parameters'
import type { GenerationContext } from '../core/context'
import { getTheme, themeEnvironment, THEME_DEFS } from '../config/themes'
import { AeLevel, P } from '../ae/model'
import type { AeUnit } from '../ae/model'
import { readLevel } from '../ae/levelReader'
import { TileLayers } from '../ae/tiles'
import { emitObjects, emitWalls } from '../ae/emit'
import { isLineCell } from '../map/aeWalls'
import type { WallGrid } from '../map/aeWalls'
import { tilesetSize } from '../catalog/assets'
import { ObjectSet, SHOP_KINDS, addArrival, buildExitRig, itemStandBadge } from '../objects/objectSet'
import type { ShopKind } from '../objects/objectSet'
import { SensorShape } from '../objects/nodes'
import { buildMusicRig } from '../music/rig'
import { STANDIN_GOLD_ORIGIN, STANDIN_MAP, STANDIN_ROOM, STANDIN_UPGRADE_ORIGIN, diamondSlot, upgradeSlot } from './layout'

export { diamondCount }

/** The lobby's own name for the per-diamond value. */
export { DIAMOND_VALUE as LOBBY_DIAMOND_VALUE } from './payout'

const MAP_W = STANDIN_MAP.width
const MAP_H = STANDIN_MAP.height
const ROOM = STANDIN_ROOM
const STANDIN_THEME = 'chambers'

/**
 * Build a lobby level.
 *
 * `exitTarget` is the stem of whatever slot follows this lobby in the
 * campaign order; the exit is the same press-F, whole-party rig every floor
 * uses. No save point: AE saves on arriving at a level.
 *
 * No RNG of any stream is read: a lobby's layout is a pure function of its
 * options, so adding or removing one never moves a dungeon seed.
 */
export function buildLobby(
  ctx: GenerationContext,
  preset: LobbyPresetDef,
  options: LobbyOptions,
  exitTarget: string,
  levelIndex: number
): AeLevel {
  return preset.lvl === undefined
    ? buildStandIn(ctx, options, exitTarget, levelIndex)
    : buildFromTemplate(ctx, preset, options, exitTarget)
}

/** One shop kind per vendor stall the options switch on, selling only the selected columns. */
function vendorKinds(options: LobbyOptions): ShopKind[] {
  const kinds: ShopKind[] = []
  for (const vendor of LOBBY_VENDORS) {
    const selected = categoriesFor(vendor, options.shopCategories)
    if (selected.length === 0) continue
    const base = SHOP_KINDS.find((k) => k.id === vendor.id)
    if (base === undefined) continue
    kinds.push({ ...base, categories: selected.join(' ') })
  }
  return kinds
}

function buildStandIn(
  ctx: GenerationContext,
  options: LobbyOptions,
  exitTarget: string,
  levelIndex: number
): AeLevel {
  const themeId = options.theme !== undefined && getTheme(options.theme) !== undefined ? options.theme : STANDIN_THEME
  const theme = getTheme(themeId) ?? THEME_DEFS[0]
  ctx.currentTheme = themeId

  const solid = new Uint8Array(MAP_W * MAP_H).fill(1)
  for (let y = ROOM.y; y < ROOM.y + ROOM.height; y++) {
    for (let x = ROOM.x; x < ROOM.x + ROOM.width; x++) solid[x + y * MAP_W] = 0
  }

  // the way on: exit stairs in the top wall, centred
  const exitX = ROOM.x + Math.trunc(ROOM.width / 2) - 3
  const exit = ObjectSet.create(ctx, exitX, ROOM.y - 2, 'ExitDn', themeId, exitTarget)
  const reserved = new Set(exit.reserved.map(([x, y]) => `${x},${y}`))

  // vendors in a row across the middle of the room
  const kinds = vendorKinds(options)
  const spacing = Math.trunc(ROOM.width / (kinds.length + 1))
  kinds.forEach((kind, i) => {
    ObjectSet.create(ctx, ROOM.x + spacing * (i + 1), ROOM.y + 4, 'Shop', themeId, undefined, kind)
  })

  // arrival at the bottom, centred
  const arriveX = ROOM.x + Math.trunc(ROOM.width / 2)
  const arriveY = ROOM.y + ROOM.height - 2
  addArrival(ctx, arriveX, arriveY)

  // the payout: diamonds bottom-left, upgrades bottom-right
  placePayout(ctx, options, STANDIN_GOLD_ORIGIN, STANDIN_UPGRADE_ORIGIN)

  buildMusicRig(ctx, options.music, arriveX, arriveY + 1)

  const level = new AeLevel(themeEnvironment(theme, levelIndex))
  const grid: WallGrid = {
    width: MAP_W,
    height: MAP_H,
    solid: (x, y) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || solid[x + y * MAP_W] === 1,
    reserved: (x, y) => reserved.has(`${x},${y}`)
  }
  const floor: Array<[number, number]> = []
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!grid.solid(x, y)) floor.push([x, y])
  const layers = new TileLayers(tilesetSize)
  layers.paint16(theme.floor[0], floor, [1, 1, 1, 1])
  for (const ts of theme.floor.slice(1)) layers.paint16(ts, [...floor, ...exit.reserved])
  const mask: Array<[number, number]> = []
  for (let y = -2; y < MAP_H + 2; y++) {
    for (let x = -2; x < MAP_W + 2; x++) if (grid.solid(x, y) && !grid.reserved(x, y) && !isLineCell(grid, x, y)) mask.push([x, y])
  }
  layers.paint16('tilesets/__black.tileset', mask)
  level.tileCells = layers.cells()
  emitObjects(level, ctx)
  emitWalls(level, ctx, grid, theme)
  return level
}

/**
 * Diamonds in rows of six from `gold`; each upgrade kind on its own slot from
 * `upgrades`, a count above one stacking on that slot.
 */
function placePayout(
  ctx: GenerationContext,
  options: LobbyOptions,
  gold: { x: number; y: number },
  upgrades: { x: number; y: number }
): void {
  const diamonds = diamondCount(options.startingGold)
  for (let i = 0; i < diamonds; i++) {
    const [x, y] = diamondSlot(gold, i)
    ctx.extraUnits.push({ path: DIAMOND_UNIT, x, y })
  }
  for (const kind of UPGRADE_KINDS) {
    const [x, y] = upgradeSlot(upgrades, kind)
    for (let n = 0; n < (options.upgrades[kind] ?? 0); n++) ctx.extraUnits.push({ path: upgradeItemPath(kind), x, y })
  }
}

/**
 * A hand-made lobby: the imported AE editor level, rewritten for its slot.
 * Each part is found by script LABEL first and by structure when the author
 * did not label it (docs/LOBBY-AUTHORING.md):
 *
 * - spawn: `lobby:spawn`, else the LevelStart with no StartID;
 * - exit: `lobby:exit` scripts, else a press-F exit rig built around the
 *   level's teleporter (`doodads/generic/teleport_*`);
 * - vendors: `lobby:vendor:<id>`, else the vendor its ShopArea's categories
 *   name (def* -> defense, off* -> offense, item -> item...). A stand whose
 *   UseTrigger has no use area gets one, on the stand. A stall with nothing
 *   selected is switched off and its sign removed;
 * - payout: the diamonds and upgrade pickups the author placed (their spots are
 *   the payout slots, the placed units themselves removed), else a
 *   `lobby:payout` marker, else the free floor around the spawn.
 *
 * Units and scripts the generator adds continue the template's own id
 * numbering, so nothing collides.
 */
function buildFromTemplate(
  ctx: GenerationContext,
  preset: LobbyPresetDef,
  options: LobbyOptions,
  exitTarget: string
): AeLevel {
  const { level } = readLevel(preset.lvl ?? '')
  // the editor saves a level opened from the main menu as MainMenu
  level.gameMode = 'DungeonGameMode'
  ctx.idCounter = level.peekId()

  // --- spawn ---------------------------------------------------------------
  const spawn =
    level.scripts.find((s) => s.label === 'lobby:spawn' && s.cls === 'LevelStart') ??
    level.scripts.find((s) => s.cls === 'LevelStart' && !s.params.some((p) => p.name === 'StartID'))
  if (spawn !== undefined) {
    if (ctx.isStartLevel) level.scripts.push({ ...spawn, id: ctx.idCounter++, params: [], label: 'default spawn', connections: [] })
    spawn.params = [P.str('StartID', ctx.currentStem)]
    spawn.label = ctx.currentStem
  }

  // --- exit ------------------------------------------------------------------
  let labelledExit = false
  for (const s of level.scripts) {
    if (s.label !== 'lobby:exit') continue
    labelledExit = true
    if (s.cls === 'LevelExit') {
      s.params = [P.str('Level', ctx.levelPath(exitTarget)), P.str('StartID', exitTarget)]
      s.label = exitTarget
    } else if (s.cls === 'SetRespawnPoint') {
      s.params = [P.str('SpawnId', exitTarget)]
      s.label = exitTarget
    }
  }
  if (!labelledExit) {
    const portal = level.units.find((u) => u.path.startsWith('doodads/generic/teleport'))
    if (portal !== undefined) {
      const sensor = new SensorShape(ctx, portal.x / TILE, portal.y / TILE)
      sensor.width = 3
      sensor.height = 3
      buildExitRig(ctx, sensor, exitTarget, portal.x / TILE, portal.y / TILE + 2)
    }
  }

  // --- vendors -------------------------------------------------------------
  // stands, Castle's and Shaftlocke's (`shop_item_hwr`) alike
  const shops = level.units.filter((u) => /^doodads\/generic\/shop_[a-z_]+\.unit$/.test(u.path))
  for (const s of level.scripts) {
    if (s.cls !== 'ShopArea') continue
    const label = s.label ?? ''
    const categories = (s.params.find((p) => p.name === 'Categories')?.value as string | undefined) ?? ''
    const vendorId = label.startsWith('lobby:vendor:') ? label.slice('lobby:vendor:'.length) : vendorIdOfShopArea(categories)
    const vendor = LOBBY_VENDORS.find((v) => v.id === vendorId)
    if (vendor === undefined) continue
    const selected = categoriesFor(vendor, options.shopCategories)
    s.params = s.params.filter((p) => p.name !== 'Categories')
    s.params.unshift(P.str('Categories', selected.join(' ')))
    // a stall with nothing to sell is switched off rather than left empty
    s.enabled = selected.length > 0

    // the UseTrigger that opens this shop: the one its #PlayerTarget names
    const target = s.params.find((p) => p.name === '#PlayerTarget')
    const use = target?.kind === 'target' ? level.scripts.find((u) => u.id === target.value[0]) : undefined
    if (use === undefined) continue
    use.enabled = s.enabled
    if (!s.enabled) {
      // and its sign comes down, so no vendor stands there selling nothing
      const sign = nearest(shops, use.x, use.y)
      if (sign !== undefined && Math.abs(sign.x - use.x) <= TILE && Math.abs(sign.y - use.y) <= TILE && !isReferenced(level, sign.id)) {
        level.units = level.units.filter((u) => u !== sign)
        shops.splice(shops.indexOf(sign), 1)
      }
      continue
    }
    // the item stand wears the highest tier it sells, as the stock tiered stands do
    if (vendor.id === 'item') {
      const badge = itemStandBadge(selected.join(' '))
      const stand = nearest(shops, use.x, use.y)
      // Shaftlocke's item stand has the same `1`…`5` scenes
      if (badge !== undefined && stand !== undefined && ITEM_STANDS.has(stand.path)) {
        stand.state = { ...stand.state, start: { kind: 'string', value: badge } }
      }
    }
    if (use.params.some((p) => p.name === 'Areas')) continue
    // no use area yet: a circle on the nearest stand, as floor shops have
    const stand = nearest(shops, use.x, use.y)
    if (stand === undefined) continue
    const area = new SensorShape(ctx, stand.x / TILE, stand.y / TILE)
    area.radius = SHOP_USE_RADIUS
    use.params.push(P.ids('Areas', [area.id]))
  }

  // --- payout, save point, music --------------------------------------------
  // authored payout spots: every diamond and upgrade pickup placed in the editor
  const authored = takeAuthoredPayout(level)
  const payout = level.scripts.find((s) => s.label === 'lobby:payout')
  if (authored.diamonds.length === 0 && payout !== undefined) {
    placePayout(ctx, options, { x: payout.x / TILE, y: payout.y / TILE }, { x: payout.x / TILE + 8, y: payout.y / TILE })
  } else if (spawn !== undefined) {
    placePayoutAround(ctx, options, level, spawn.x / TILE, spawn.y / TILE, authored)
  }
  if (spawn !== undefined) buildMusicRig(ctx, options.music, spawn.x / TILE, spawn.y / TILE + 1)
  emitObjects(level, ctx)
  ctx.currentTheme = ''
  return level
}

const TILE = 16
/** item stands whose scenes `1`…`5` are tier badges */
const ITEM_STANDS = new Set(['doodads/generic/shop_item.unit', 'doodads/generic/shop_item_hwr.unit'])
/** a floor shop's use radius, tiles */
const SHOP_USE_RADIUS = 1.25

/** Whether any script names `id`, by connection or in an id or target parameter. */
function isReferenced(level: AeLevel, id: number): boolean {
  return level.scripts.some(
    (s) =>
      s.connections.some(([c]) => c === id) ||
      s.params.some((p) => (p.kind === 'ids' && p.value.includes(id)) || (p.kind === 'target' && p.value[0] === id))
  )
}

function nearest<T extends { x: number; y: number }>(items: readonly T[], x: number, y: number): T | undefined {
  let best: T | undefined
  let bestD = Infinity
  for (const it of items) {
    const d = (it.x - x) ** 2 + (it.y - y) ** 2
    if (d < bestD) {
      best = it
      bestD = d
    }
  }
  return best
}

interface AuthoredPayout {
  /** spots, in tiles, where the author placed a diamond */
  diamonds: Array<{ x: number; y: number }>
  /** where the author placed each kind of upgrade pickup */
  upgrades: Partial<Record<(typeof UPGRADE_KINDS)[number], { x: number; y: number }>>
}

/** Pull the author's placed diamonds and upgrade pickups out of the level, keeping their spots. */
function takeAuthoredPayout(level: AeLevel): AuthoredPayout {
  const out: AuthoredPayout = { diamonds: [], upgrades: {} }
  const taken = new Set<AeUnit>()
  for (const u of level.units) {
    if (/^items\/pickups\/money\/diamond[a-z_]*\.unit$/.test(u.path)) {
      out.diamonds.push({ x: u.x / TILE, y: u.y / TILE })
      taken.add(u)
      continue
    }
    const kind = UPGRADE_KINDS.find((k) => upgradeItemPath(k) === u.path)
    if (kind !== undefined) {
      out.upgrades[kind] ??= { x: u.x / TILE, y: u.y / TILE }
      taken.add(u)
    }
  }
  level.units = level.units.filter((u) => !taken.has(u))
  // the editor saves hand-placed pickups no script names as statics
  const takenStatics = new Set<(typeof level.statics)[number]>()
  for (const st of level.statics) {
    if (/^items\/pickups\/money\/diamond[a-z_]*\.unit$/.test(st.path)) {
      out.diamonds.push({ x: st.x / TILE, y: st.y / TILE })
      takenStatics.add(st)
      continue
    }
    const kind = UPGRADE_KINDS.find((k) => upgradeItemPath(k) === st.path)
    if (kind !== undefined) {
      out.upgrades[kind] ??= { x: st.x / TILE, y: st.y / TILE }
      takenStatics.add(st)
    }
  }
  level.statics = level.statics.filter((st) => !takenStatics.has(st))
  // reading order, so the first diamonds land top-left whatever order the editor saved them in
  out.diamonds.sort((a, b) => a.y - b.y || a.x - b.x)
  return out
}

/**
 * Lay the payout. Authored spots first: the diamonds cycle over the author's
 * diamond spots (stacking once each holds one), each upgrade kind lands on its
 * own authored spot. Anything without an authored spot goes on the free floor
 * around the spawn, nearest first: walk out
 * from the spawn tile over cells no wall, door or prop stands on, within a
 * bounded radius (an open edge in the template cannot carry it away), and
 * leave the spawn tile and its neighbours clear. Diamonds first, then one
 * cell per upgrade kind.
 */
function placePayoutAround(
  ctx: GenerationContext,
  options: LobbyOptions,
  level: AeLevel,
  sx: number,
  sy: number,
  authored: AuthoredPayout = { diamonds: [], upgrades: {} }
): void {
  const blocked = new Set<string>()
  for (const u of level.units) {
    if (u.path.startsWith(':')) continue
    for (const [x, y] of templateUnitCells(u)) blocked.add(`${x},${y}`)
  }
  const ox = Math.floor(sx)
  const oy = Math.floor(sy)
  const RADIUS = 8
  const seen = new Set<string>([`${ox},${oy}`])
  const queue: Array<[number, number]> = [[ox, oy]]
  const free: Array<[number, number]> = []
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]
    if (Math.max(Math.abs(x - ox), Math.abs(y - oy)) > 1) free.push([x, y])
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + dx
      const ny = y + dy
      const key = `${nx},${ny}`
      if (seen.has(key) || blocked.has(key) || Math.abs(nx - ox) > RADIUS || Math.abs(ny - oy) > RADIUS) continue
      seen.add(key)
      queue.push([nx, ny])
    }
  }
  let next = 0
  const take = (): [number, number] | undefined => free[next++]
  const diamonds = diamondCount(options.startingGold)
  for (let i = 0; i < diamonds; i++) {
    if (authored.diamonds.length > 0) {
      const at = authored.diamonds[i % authored.diamonds.length]
      ctx.extraUnits.push({ path: DIAMOND_UNIT, x: at.x, y: at.y })
      continue
    }
    const at = take()
    if (at === undefined) break
    ctx.extraUnits.push({ path: DIAMOND_UNIT, x: at[0] + 0.5, y: at[1] + 0.5 })
  }
  for (const kind of UPGRADE_KINDS) {
    const n = options.upgrades[kind] ?? 0
    if (n === 0) continue
    const spot = authored.upgrades[kind]
    const free1 = spot === undefined ? take() : undefined
    if (spot === undefined && free1 === undefined) continue
    const at = spot ?? { x: free1![0] + 0.5, y: free1![1] + 0.5 }
    for (let k = 0; k < n; k++) ctx.extraUnits.push({ path: upgradeItemPath(kind), x: at.x, y: at.y })
  }
}

/** The cells a template unit stands on (walls as aeWalls lays them; anything else its anchor cell). */
function templateUnitCells(u: { path: string; x: number; y: number }): Array<[number, number]> {
  const x = Math.floor(u.x / TILE)
  const y = Math.floor(u.y / TILE)
  // a door spans two cells (`_door_1*_h` collides over 32x16 from its anchor);
  // a vertical one is blocked a cell either side to be safe
  if (u.path.startsWith('doodads/doors/')) {
    return /_v\.unit$/.test(u.path) ? [[x, y - 1], [x, y], [x, y + 1]] : [[x, y], [x + 1, y]]
  }
  const piece = /^doodads\/walls\/[^/]+\/([a-z0-9_]+)\.unit$/.exec(u.path)?.[1]
  if (piece === undefined) return [[x, y]]
  if (piece === 'v_16' || piece === 'cap_n' || piece === 'cap_s') return [[x, y + 1]]
  if (piece === 'v_32' || piece === 'v') return [[x, y + 1], [x, y + 2]]
  if (piece === 'h_32' || piece === 'h') return [[x, y], [x + 1, y]]
  return [[x, y]]
}
