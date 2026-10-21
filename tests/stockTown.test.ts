/**
 * The stock rooms as lobbies (src/generator/lobby/stockTown.ts): Shaftlocke's
 * town, the Temple of the Sun bazaar and the Castle Hammerwatch bridge. The
 * per-preset contract (exit, arrival, vendors, payout, ids, assets) runs in
 * lobby.test.ts like every other lobby; this file checks what the cleanup
 * removes and keeps, against the stock levels when the install is present.
 */
import { describe, expect, it } from 'vitest'
import { bossFights, defaultLobby, generateDungeon, oneOfEachUpgrade, slotEntryId, upgradeItemPath } from '../src/generator'
import type { DungeonParameters, DungeonResult, LobbyOptions } from '../src/generator'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import type { AeLevel } from '../src/generator/ae/model'
import type { CampaignSlot } from '../src/generator/campaign'
import { LOBBY_TEMPLATES } from '../src/generator/lobby/templates.generated'
import { CASTLE_BRIDGE_CROP, CASTLE_BRIDGE_ROOF, CASTLE_BRIDGE_VISIBLE } from '../src/generator/lobby/castleBridge'
import type { Box } from '../src/generator/lobby/castleBridge'
import { DIAMOND_UNIT, UPGRADE_KINDS } from '../src/generator/lobby/payout'
import { CASTLE_BRIDGE, SHAFTLOCKE_TOWN, STOCK_TOWNS, SUN_BAZAAR } from '../src/generator/lobby/stockTown'
import type { StockTown } from '../src/generator/lobby/stockTown'
import { HAS_AE, aeAssetsDir, readStockLevel } from './aeInstall'
import { idsParam, intParam, levelsOf, scriptsOf, strParam } from './ae'
import { closureOf } from './closure'
import { plainParameters } from './params'

const embedded = (town: StockTown): AeLevel => readLevel(LOBBY_TEMPLATES.find((t) => t.id === town.id)!.lvl).level
const stock = (town: StockTown): AeLevel => readLevel(readStockLevel(town.source)).level
const unit = (level: AeLevel, path: string) => level.units.find((u) => u.path === path)
const units = (level: AeLevel, path: string) => level.units.filter((u) => u.path === path)
const generate = (params: DungeonParameters): AeLevel => {
  const result = generateDungeon(params, 555)
  expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
  return levelsOf(result as DungeonResult).get('lobby0')!
}
const withLobby = (town: StockTown, patch: Partial<LobbyOptions> = {}): DungeonParameters => {
  const params = plainParameters()
  params.lobbies = [{ ...defaultLobby(town.id), ...patch }]
  return params
}
const lobbyOf = (town: StockTown, shopCategories?: string[]): AeLevel =>
  generate(withLobby(town, shopCategories === undefined ? {} : { shopCategories }))
/** the lobby first, then the first fight, then the rest of the campaign: the lobby leads into a fight */
const beforeAFight = (town: StockTown): DungeonParameters => {
  const params = withLobby(town)
  const fights = bossFights(params.boss).length
  expect(fights).toBeGreaterThan(0)
  const order: CampaignSlot[] = [{ kind: 'lobby', index: 0 }, { kind: 'boss', index: 0 }]
  for (let i = 0; i < params.levels; i++) order.push({ kind: 'floor', index: i })
  for (let i = 1; i < fights; i++) order.push({ kind: 'boss', index: i })
  params.levelOrder = order
  return params
}
/** what the stock campaign's own exits name: `levels/hwr/`, `levels/sun_temple/`, Castle's `levels/level_2.lvl` */
const stockLevelsDir = (town: StockTown): string => {
  const rest = town.source.split('/levels/')[1]
  return rest.includes('/') ? `levels/${rest.split('/')[0]}/` : 'levels/level_'
}
const PAYOUT_PATHS = new Set([DIAMOND_UNIT, ...UPGRADE_KINDS.map(upgradeItemPath)])
const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1

for (const town of STOCK_TOWNS) {
  describe(`${town.label}: the embedded template`, () => {
    it('is imported', () => {
      expect(LOBBY_TEMPLATES.some((t) => t.id === town.id)).toBe(true)
    })

    it('opens one labelled ShopArea per stall, none of them the town-upgrade shop', () => {
      const shops = scriptsOf(embedded(town), 'ShopArea')
      expect(shops.map((s) => s.label).sort()).toEqual(
        ['combo', 'defense', 'item', 'misc', 'offense', 'power'].map((v) => `lobby:vendor:${v}`)
      )
      expect(shops.every((s) => s.enabled)).toBe(true)
      expect(shops.some((s) => s.params.some((p) => p.name === 'Type' && p.value === 3))).toBe(false)
    })

    it('wires every stall trigger straight to its shop', () => {
      const level = embedded(town)
      for (const shop of scriptsOf(level, 'ShopArea')) {
        const target = shop.params.find((p) => p.name === '#PlayerTarget')
        const use = level.scripts.find((s) => target?.kind === 'target' && s.id === target.value[0])
        expect(use?.cls, shop.label).toBe('UseTrigger')
        expect(use?.enabled, shop.label).toBe(true)
        expect(use?.connections.map(([id]) => id), shop.label).toContain(shop.id)
      }
    })

    it('loses no unit scene', () => {
      const empty = embedded(town).units.filter((u) => u.state?.start?.kind === 'string' && u.state.start.value === '')
      expect(empty.map((u) => `${u.id} ${u.path}`)).toEqual([])
    })

    it('carries no townsfolk, portal selectors, pickups or editor labels', () => {
      const paths = embedded(town).units.map((u) => u.path)
      for (const re of [/^actors\//, /exit_teleport_switch/, /^gui\//]) {
        expect(paths.filter((p) => re.test(p)), String(re)).toEqual([])
      }
      // a room that lays its own payout spots keeps those pickups, and only those
      const laysPayout = town.closedWithin !== undefined || town.payout !== undefined
      const pickups = paths.filter((p) => /^items\//.test(p))
      expect(pickups.filter((p) => !laysPayout || !PAYOUT_PATHS.has(p))).toEqual([])
    })

    it.runIf(town.payout !== undefined)('carries its payout spots as pickups, exactly', () => {
      const level = embedded(town)
      const at = (u: { x: number; y: number }) => `${u.x / 16},${u.y / 16}`
      const want = town.payout!
      expect(units(level, DIAMOND_UNIT).map(at).sort()).toEqual(want.diamonds.map(([x, y]) => `${x},${y}`).sort())
      for (const kind of UPGRADE_KINDS) {
        expect(units(level, upgradeItemPath(kind)).map(at), kind).toEqual([`${want.upgrades[kind][0]},${want.upgrades[kind][1]}`])
      }
    })

    it('opens its one teleporter, where the lobby lays the exit', () => {
      const pads = embedded(town).units.filter((u) => u.path.startsWith('doodads/generic/teleport'))
      expect(pads.map((u) => [u.path, u.state?.start?.value])).toEqual([['doodads/generic/teleport_mt.unit', 'open']])
    })

    it('names only units and scripts that exist', () => {
      const level = embedded(town)
      const known = new Set([...level.units.map((u) => u.id), ...level.scripts.map((s) => s.id)])
      for (const s of level.scripts) {
        for (const [id] of s.connections) expect(known.has(id), `${s.cls} ${s.id} -> ${id}`).toBe(true)
        for (const p of s.params) {
          const ids = p.kind === 'ids' ? p.value : p.kind === 'target' ? [p.value[0]] : p.kind === 'sources' ? p.value.map(([id]) => id) : []
          for (const id of ids) expect(known.has(id), `${s.cls}.${p.name} -> ${id}`).toBe(true)
        }
      }
    })

    it('leads nowhere in its own campaign once it is a lobby: one exit, to the first floor', () => {
      const lobby = lobbyOf(town)
      expect(scriptsOf(lobby, 'LevelExit').map((s) => strParam(s, 'StartID'))).toEqual(['floor0'])
      expect(renderLevel(lobby)).not.toContain(stockLevelsDir(town))
    }, 60_000)
  })

  describe.skipIf(!HAS_AE)(`${town.label}: against the stock level`, () => {
    it('is what the importer writes today (re-run scripts/import-stock-towns.ts)', () => {
      expect(LOBBY_TEMPLATES.find((t) => t.id === town.id)!.lvl).toBe(renderLevel(town.clean(stock(town))))
    })

    // a room cut out of a bigger level keeps only its piece (see below)
    it.runIf(town.closedWithin === undefined)('keeps the whole map: every tile, wall, cliff and prop', () => {
      const before = stock(town)
      const after = town.clean(stock(town))
      expect(after.tileCells).toEqual(before.tileCells)
      expect(after.prefabs).toEqual(before.prefabs)
      const props = (l: AeLevel) => l.units.filter((u) => /^doodads\/(walls|cliffs|terrain|doors)\//.test(u.path)).length
      expect(props(after)).toBe(props(before))
    })

    it("drops the campaign's own exits and the story", () => {
      const before = stock(town)
      expect(scriptsOf(before, 'LevelExit').length).toBeGreaterThan(5)
      const after = town.clean(before)
      for (const cls of [
        'LevelExit',
        'SetRespawnPoint',
        'StartDialog',
        'ShowTutorial',
        'PlatformStat',
        'SetFlag',
        'CheckFlag',
        'SpawnEquipment',
        'SpawnUnit',
        'PlayPlayerVoice'
      ]) {
        expect(scriptsOf(after, cls), cls).toHaveLength(0)
      }
    })
  })
}

describe('Shaftlocke town: its own stalls', () => {
  it('keeps the arrival, the vendors and their greetings, the minimap and the region', () => {
    const town = embedded(SHAFTLOCKE_TOWN)
    const classes = new Set(town.scripts.map((s) => s.cls))
    expect([...classes].sort()).toEqual(['ExploreMinimap', 'LevelStart', 'PlaySound', 'RegionArea', 'ShopArea', 'UseTrigger'])
    expect(scriptsOf(town, 'LevelStart').map((s) => strParam(s, 'StartID'))).toEqual([undefined])
  })

  it('shows every stall fully upgraded and stands the power vendor up', () => {
    const town = embedded(SHAFTLOCKE_TOWN)
    const start = (path: string) => unit(town, `doodads/generic/${path}.unit`)?.state?.start?.value
    expect(start('shop_offense')).toBe('5')
    expect(start('shop_health')).toBe('5')
    expect(start('shop_combo')).toBe('5')
    expect(start('shop_item_hwr')).toBe('5')
    expect(start('shop_defense')).toBe('hwr5')
    expect(unit(town, 'doodads/generic/shop_potion.unit')).toBeDefined()
  })

  it('keeps the windowed walls in their window scenes', () => {
    const windows = embedded(SHAFTLOCKE_TOWN).units.filter((u) => u.state?.start?.kind === 'strings')
    expect(windows).toHaveLength(13)
    expect(windows.every((u) => (u.state?.start?.value as string[])[0].startsWith('window_'))).toBe(true)
  })
})

describe('Temple of the Sun bazaar: its shopkeepers', () => {
  const KEEPER = 'doodads/generic/npc_dungeonvendor_desert.unit'
  /** the shopkeeper a stall's use area stands on */
  const keeperOf = (level: AeLevel, vendor: string) => {
    const shop = scriptsOf(level, 'ShopArea').find((s) => s.label === `lobby:vendor:${vendor}`)!
    return units(level, KEEPER).find((u) => u.x === shop.x && u.y === shop.y)?.state?.start?.value
  }

  it('keeps the arrival at the gate, the vendors and the region, and nothing else', () => {
    const bazaar = embedded(SUN_BAZAAR)
    const classes = new Set(bazaar.scripts.map((s) => s.cls))
    expect([...classes].sort()).toEqual(['LevelStart', 'RegionArea', 'ShopArea', 'UseTrigger'])
    expect(scriptsOf(bazaar, 'LevelStart').map((s) => strParam(s, 'StartID'))).toEqual([undefined])
  })

  it('shows every shopkeeper with its body and icon, fully supplied', () => {
    const bazaar = embedded(SUN_BAZAAR)
    expect(keeperOf(bazaar, 'offense')).toEqual(['vendor3', 'icon-off', '5'])
    expect(keeperOf(bazaar, 'misc')).toEqual(['vendor4', 'icon-vit', '5'])
    expect(keeperOf(bazaar, 'defense')).toEqual(['vendor1', 'icon-def', '5'])
    expect(keeperOf(bazaar, 'combo')).toEqual(['vendor7', 'icon-combo', '5'])
    expect(keeperOf(bazaar, 'item')).toEqual(['vendor5', 'icon-item', '3'])
    // the quest marker becomes the power icon the quest would have given it
    expect(keeperOf(bazaar, 'power')).toEqual(['vendor6', 'icon-pow', 'none3'])
  })

  it("drops the guard-boss courtyard's red pad, so the square's teleporter is the only way on", () => {
    expect(unit(embedded(SUN_BAZAAR), 'doodads/generic/teleport_red.unit')).toBeUndefined()
  })

  it("wears each open stall's highest column as its tier numeral, and takes down a stall that sells nothing", () => {
    const lobby = lobbyOf(SUN_BAZAAR, ['def1', 'def2', 'off1', 'power', 'equipment_1', 'equipment_2'])
    expect(keeperOf(lobby, 'defense')).toEqual(['vendor1', 'icon-def', '2'])
    expect(keeperOf(lobby, 'offense')).toEqual(['vendor3', 'icon-off', '1'])
    expect(keeperOf(lobby, 'item')).toEqual(['vendor5', 'icon-item', '2'])
    expect(keeperOf(lobby, 'power')).toEqual(['vendor6', 'icon-pow', 'none3'])
    // misc and combo sell nothing: their stalls close and their shopkeepers leave
    for (const vendor of ['misc', 'combo']) {
      const shop = scriptsOf(lobby, 'ShopArea').find((s) => s.label === `lobby:vendor:${vendor}`)!
      expect(shop.enabled, vendor).toBe(false)
      expect(keeperOf(lobby, vendor), vendor).toBeUndefined()
    }
  }, 60_000)

  it('keeps its blue teleporter before a fight: the red swap is opt-in', () => {
    const lobby = generate(beforeAFight(SUN_BAZAAR))
    expect(units(lobby, 'doodads/generic/teleport_mt.unit')).toHaveLength(1)
    expect(units(lobby, 'doodads/generic/teleport_red.unit')).toHaveLength(0)
  }, 60_000)
})

describe('Castle Hammerwatch bridge: the room', () => {
  const BRIDGE = 'doodads/walls/prison/hw_bridge.unit'
  const PORTAL = 'doodads/generic/teleport_mt.unit'
  const ROOF = /^doodads\/walls\/prison\/__color_(\d+)\.unit$/
  const WALKWAY: Box = { x0: -336, y0: 160, x1: -32, y1: 198 }

  it('keeps the arrival, the vendors and its music, and nothing else', () => {
    const room = embedded(CASTLE_BRIDGE)
    expect([...new Set(room.scripts.map((s) => s.cls))].sort()).toEqual(['LevelStart', 'PlayMusic', 'ScriptLink', 'ShopArea', 'UseTrigger'])
    expect(scriptsOf(room, 'LevelStart').map((s) => [strParam(s, 'StartID'), s.x, s.y])).toEqual([[undefined, -320, 176]])
  })

  it('mends the bridge: no broken piece, one whole piece every 64 px from the west end to the walkway', () => {
    const pieces = units(embedded(CASTLE_BRIDGE), BRIDGE)
    expect(pieces.filter((u) => u.state?.start?.value === '2')).toEqual([])
    expect(pieces.map((u) => u.x).sort((a, b) => a - b)).toEqual(Array.from({ length: 9 }, (_, i) => -896 + 64 * i))
  })

  it('stands the six stalls along the north rail, east to west, each use circle on the deck', () => {
    const room = embedded(CASTLE_BRIDGE)
    const shops = scriptsOf(room, 'ShopArea').sort((a, b) => b.x - a.x)
    expect(shops.map((s) => s.label)).toEqual(['combo', 'offense', 'defense', 'misc', 'power', 'item'].map((v) => `lobby:vendor:${v}`))
    for (const shop of shops) {
      const use = room.scripts.find((s) => s.id === (shop.params.find((p) => p.name === '#PlayerTarget')?.value as [number, string])[0])!
      const circle = room.units.find((u) => u.id === idsParam(use, 'Areas')[0])!
      expect(circle.path, shop.label).toBe(':Physics_Circle')
      expect([circle.x, circle.y], shop.label).toEqual([shop.x, 184])
    }
  })

  it('lights the way out: one blue light on the teleporter', () => {
    const room = embedded(CASTLE_BRIDGE)
    const portal = unit(room, PORTAL)!
    const lights = units(room, 'effects/lights/light_L.png').filter((u) => Math.hypot(u.x - portal.x, u.y - portal.y) <= 16)
    expect(lights).toHaveLength(1)
    expect(lights[0].state?.color).toEqual({ kind: 'raw', tag: 'vec4', value: '0.0144438 0.287441 0.55834 0' })
  })

  it("writes every light's colour as AE does, a vec4 (as a string the editor and game read it as white)", () => {
    const text = renderLevel(lobbyOf(CASTLE_BRIDGE))
    expect(text.match(/<vec4 name="color">0\.0144438 0\.287441 0\.55834 0<\/vec4>/g)).toHaveLength(3)
    expect(text).not.toContain('<string name="color">')
  }, 60_000)

  it('roofs the whole roof box but the visible room, and nothing past it', () => {
    const room = embedded(CASTLE_BRIDGE)
    const squares = room.units.flatMap((u) => {
      const n = ROOF.exec(u.path)?.[1]
      return n === undefined ? [] : [{ x0: u.x, y0: u.y - Number(n), x1: u.x + Number(n), y1: u.y }]
    })
    const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
    const R = CASTLE_BRIDGE_ROOF
    for (const sq of squares) {
      expect(sq.x0 >= R.x0 && sq.x1 <= R.x1 && sq.y0 >= R.y0 && sq.y1 <= R.y1, JSON.stringify(sq)).toBe(true)
      expect(overlaps(CASTLE_BRIDGE_VISIBLE, sq), JSON.stringify(sq)).toBe(false)
    }
    // every 8-px cell of the box outside the room is under some square
    const bare: string[] = []
    for (let y = R.y0; y < R.y1; y += 8) {
      for (let x = R.x0; x < R.x1; x += 8) {
        if (inBox(CASTLE_BRIDGE_VISIBLE, x, y)) continue
        if (!squares.some((sq) => inBox(sq, x, y))) bare.push(`${x},${y}`)
      }
    }
    expect(bare).toEqual([])
    // a few big squares, not a mosaic
    expect(squares.length).toBeLessThan(80)
  })

  it('pays out on the walkway, never on the deck', () => {
    const lobby = generate(withLobby(CASTLE_BRIDGE, { startingGold: 10_000, upgrades: oneOfEachUpgrade() }))
    const payout = lobby.units.filter((u) => PAYOUT_PATHS.has(u.path))
    expect(payout.filter((u) => u.path === DIAMOND_UNIT)).toHaveLength(20)
    expect(payout).toHaveLength(20 + UPGRADE_KINDS.length)
    expect(payout.filter((u) => !inBox(WALKWAY, u.x, u.y)).map((u) => `${u.path} ${u.x},${u.y}`)).toEqual([])
  }, 60_000)

  it("plays Castle's act-1 track, or the lobby's own choice in its place", () => {
    const music = (l: AeLevel) => scriptsOf(l, 'PlayMusic').map((s) => [s.label, intParam(s, 'Music')])
    expect(music(lobbyOf(CASTLE_BRIDGE))).toEqual([['lobby:music', 2]])
    expect(music(generate(withLobby(CASTLE_BRIDGE, { music: 'boss_1' })))).toEqual([['lobby:music', 6]])
  }, 60_000)

  it('leaves through the blue teleporter before a floor, the red one before a fight', () => {
    const toFloor = lobbyOf(CASTLE_BRIDGE)
    expect(units(toFloor, PORTAL)).toHaveLength(1)
    expect(units(toFloor, 'doodads/generic/teleport_red.unit')).toHaveLength(0)

    const toFight = generate(beforeAFight(CASTLE_BRIDGE))
    expect(units(toFight, PORTAL)).toHaveLength(0)
    const red = units(toFight, 'doodads/generic/teleport_red.unit')
    expect(red.map((u) => [u.x, u.y, u.state?.start?.value])).toEqual([[unit(embedded(CASTLE_BRIDGE), PORTAL)!.x, unit(embedded(CASTLE_BRIDGE), PORTAL)!.y, 'open']])
    expect(scriptsOf(toFight, 'LevelExit').map((s) => strParam(s, 'StartID'))).toEqual([slotEntryId({ kind: 'boss', index: 0 })])
  }, 60_000)
})

/** 3 of every upgrade kind. */
const threeOfEach = () => Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 3])) as LobbyOptions['upgrades']

/** The level's whole extent, px, with a margin: the box a town's fill runs in. */
function extentOf(level: AeLevel): Box {
  const xs = level.units.map((u) => u.x)
  const ys = level.units.map((u) => u.y)
  return { x0: Math.min(...xs) - 64, y0: Math.min(...ys) - 64, x1: Math.max(...xs) + 64, y1: Math.max(...ys) + 64 }
}

for (const town of [SHAFTLOCKE_TOWN, SUN_BAZAAR]) {
  describe(`${town.label}: the payout on its spots, however big the purse`, () => {
    const payout = town.payout!
    const lobby = () => generate(withLobby(town, { startingGold: 500_000, upgrades: threeOfEach() }))
    const at = (u: { x: number; y: number }) => `${u.x / 16},${u.y / 16}`

    it('lays all 1000 diamonds on the placed spots, stacked evenly, and each upgrade on its own', () => {
      const level = lobby()
      const spots = payout.diamonds.map(([x, y]) => `${x},${y}`)
      const diamonds = units(level, DIAMOND_UNIT).map(at)
      expect(diamonds).toHaveLength(1000)
      const per = new Map<string, number>()
      for (const d of diamonds) per.set(d, (per.get(d) ?? 0) + 1)
      expect([...per.keys()].sort()).toEqual([...spots].sort())
      const deep = Math.floor(1000 / spots.length)
      for (const [spot, n] of per) expect([deep, deep + 1], spot).toContain(n)
      for (const kind of UPGRADE_KINDS) {
        const [x, y] = payout.upgrades[kind]
        expect(units(level, upgradeItemPath(kind)).map(at), kind).toEqual([`${x},${y}`, `${x},${y}`, `${x},${y}`])
        expect(spots, kind).not.toContain(`${x},${y}`)
      }
    }, 60_000)

    it.skipIf(!HAS_AE)('puts every payout pickup where the party can walk (install colliders)', () => {
      const level = lobby()
      // Shaftlocke's spots are indoors, behind its houses' `_door_1*` doors,
      // which swing open when walked into: in play they block no one
      level.units = level.units.filter((u) => !u.path.startsWith('doodads/doors/'))
      const closure = closureOf(level, extentOf(level), aeAssetsDir() ?? '')
      expect(closure.reachesExit).toBe(true)
      for (const u of level.units.filter((v) => PAYOUT_PATHS.has(v.path))) {
        expect(closure.reaches(u.x, u.y), `${u.path} at ${at(u)}`).toBe(true)
      }
    }, 60_000)
  })
}

describe.skipIf(!HAS_AE)('Castle Hammerwatch bridge: closed by its own colliders', () => {
  const assets = aeAssetsDir() ?? ''

  it('keeps the party in: the fill from the arrival reaches the exit and never the crop edge', () => {
    const closure = closureOf(embedded(CASTLE_BRIDGE), CASTLE_BRIDGE_CROP, assets)
    expect(closure.leak).toBeNull()
    expect(closure.reachesExit).toBe(true)
  })

  it('reaches every stall, every payout spot and the teleporter, in the generated lobby too', () => {
    const lobby = generate(withLobby(CASTLE_BRIDGE, { startingGold: 10_000, upgrades: oneOfEachUpgrade() }))
    const closure = closureOf(lobby, CASTLE_BRIDGE_CROP, assets)
    expect(closure.leak).toBeNull()
    for (const shop of scriptsOf(lobby, 'ShopArea')) expect(closure.reaches(shop.x, 184), shop.label).toBe(true)
    for (const u of lobby.units.filter((v) => PAYOUT_PATHS.has(v.path))) expect(closure.reaches(u.x, u.y), `${u.path} ${u.x},${u.y}`).toBe(true)
    const portal = unit(lobby, 'doodads/generic/teleport_mt.unit')!
    expect(closure.reaches(portal.x, portal.y - 6)).toBe(true)
  }, 60_000)

  it('catches a leak: without the seal across the walkway (block and rectangle) the party walks out', () => {
    const room = embedded(CASTLE_BRIDGE)
    const seal = room.units.filter(
      (u) => (u.path === ':Physics_Rectangle' && u.x === -44) || (u.path === 'doodads/generic/deco_block.unit' && u.x === -56)
    )
    expect(seal).toHaveLength(2)
    room.units = room.units.filter((u) => !seal.includes(u))
    expect(closureOf(room, CASTLE_BRIDGE_CROP, assets).leak).not.toBeNull()
  })

  it("drops the cutscene: no unit level_1's HideUnits show or hide", () => {
    const cast = new Set(scriptsOf(stock(CASTLE_BRIDGE), 'HideUnit').flatMap((s) => idsParam(s, 'Units')))
    expect(cast.size).toBeGreaterThan(5)
    expect(embedded(CASTLE_BRIDGE).units.filter((u) => cast.has(u.id)).map((u) => u.path)).toEqual([])
  })
})
