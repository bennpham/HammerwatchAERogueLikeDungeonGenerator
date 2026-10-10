import { LOBBY_VENDORS, categoriesFor } from './shops'
import type { LobbyPresetDef } from './presets'
import { DIAMOND_UNIT, UPGRADE_KINDS, diamondCount, upgradeItemPath } from './payout'
import type { LobbyOptions } from '../config/parameters'
import type { GenerationContext } from '../core/context'
import { getTheme, themeEnvironment, THEME_DEFS } from '../config/themes'
import { AeLevel, P } from '../ae/model'
import { readLevel } from '../ae/levelReader'
import { TileLayers } from '../ae/tiles'
import { emitObjects, emitWalls } from '../ae/emit'
import { isLineCell } from '../map/aeWalls'
import type { WallGrid } from '../map/aeWalls'
import { tilesetSize } from '../catalog/assets'
import { ObjectSet, SHOP_KINDS, addArrival } from '../objects/objectSet'
import type { ShopKind } from '../objects/objectSet'
import { NodeAreaTrigger, NodeCheckpoint, SensorShape } from '../objects/nodes'
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
 * uses. `saves` adds a save point on arrival (a one-shot `SuperCheckPoint`).
 *
 * No RNG of any stream is read: a lobby's layout is a pure function of its
 * options, so adding or removing one never moves a dungeon seed.
 */
export function buildLobby(
  ctx: GenerationContext,
  preset: LobbyPresetDef,
  options: LobbyOptions,
  exitTarget: string,
  saves: boolean,
  levelIndex: number
): AeLevel {
  return preset.lvl === undefined
    ? buildStandIn(ctx, options, exitTarget, saves, levelIndex)
    : buildFromTemplate(ctx, preset, options, exitTarget, saves)
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
  saves: boolean,
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

  // arrival at the bottom, centred; a save point there when asked for
  const arriveX = ROOM.x + Math.trunc(ROOM.width / 2)
  const arriveY = ROOM.y + ROOM.height - 2
  addArrival(ctx, arriveX, arriveY)
  if (saves) addSavePoint(ctx, arriveX, arriveY)

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

function addSavePoint(ctx: GenerationContext, x: number, y: number): void {
  const area = new SensorShape(ctx, x, y)
  area.width = 4
  area.height = 3
  const trigger = new NodeAreaTrigger(ctx, x, y + 1)
  trigger.connectToShape(area)
  trigger.triggerTimes = 1
  trigger.connectTo(new NodeCheckpoint(ctx, x + 1, y + 1, ctx.currentStem))
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
 * A hand-made lobby: the imported level, rewritten by script label
 * (docs/LOBBY-AUTHORING.md). Units and scripts the generator adds continue the
 * template's own id numbering, so nothing collides.
 */
function buildFromTemplate(
  ctx: GenerationContext,
  preset: LobbyPresetDef,
  options: LobbyOptions,
  exitTarget: string,
  saves: boolean
): AeLevel {
  const { level } = readLevel(preset.lvl ?? '')
  ctx.idCounter = level.peekId()

  for (const s of level.scripts) {
    const label = s.label ?? ''
    if (label === 'lobby:exit' && s.cls === 'LevelExit') {
      s.params = [P.str('Level', ctx.levelPath(exitTarget)), P.str('StartID', exitTarget)]
      s.label = exitTarget
    } else if (label === 'lobby:exit' && s.cls === 'SetRespawnPoint') {
      s.params = [P.str('SpawnId', exitTarget)]
      s.label = exitTarget
    } else if (label === 'lobby:spawn' && s.cls === 'LevelStart') {
      s.params = [P.str('StartID', ctx.currentStem)]
      s.label = ctx.currentStem
      if (ctx.isStartLevel) level.scripts.push({ ...s, id: level.newId(), params: [], label: 'default spawn', connections: [] })
    } else if (label.startsWith('lobby:vendor:') && s.cls === 'ShopArea') {
      const vendor = LOBBY_VENDORS.find((v) => v.id === label.slice('lobby:vendor:'.length))
      const selected = vendor === undefined ? [] : categoriesFor(vendor, options.shopCategories)
      s.params = s.params.filter((p) => p.name !== 'Categories')
      s.params.push(P.str('Categories', selected.join(' ')))
      // a stall with nothing to sell is switched off rather than left empty
      s.enabled = selected.length > 0
    }
  }

  const payout = level.scripts.find((s) => s.label === 'lobby:payout')
  const spawn = level.scripts.find((s) => s.label === ctx.currentStem && s.cls === 'LevelStart')
  if (payout !== undefined) {
    placePayout(ctx, options, { x: payout.x / 16, y: payout.y / 16 }, { x: payout.x / 16 + 8, y: payout.y / 16 })
  }
  if (spawn !== undefined) {
    if (saves) addSavePoint(ctx, spawn.x / 16, spawn.y / 16)
    buildMusicRig(ctx, options.music, spawn.x / 16, spawn.y / 16 + 1)
  }
  emitObjects(level, ctx)
  ctx.currentTheme = ''
  return level
}
