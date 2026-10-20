/**
 * The stock towns as lobbies (src/generator/lobby/stockTown.ts): Shaftlocke's
 * town and the Temple of the Sun bazaar. The per-preset contract (exit,
 * arrival, vendors, payout, ids, assets) runs in lobby.test.ts like every
 * other lobby; this file checks what the cleanup removes and keeps, against
 * the stock levels when the install is present.
 */
import { describe, expect, it } from 'vitest'
import { defaultLobby, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import type { AeLevel } from '../src/generator/ae/model'
import { LOBBY_TEMPLATES } from '../src/generator/lobby/templates.generated'
import { SHAFTLOCKE_TOWN, STOCK_TOWNS, SUN_BAZAAR } from '../src/generator/lobby/stockTown'
import type { StockTown } from '../src/generator/lobby/stockTown'
import { HAS_AE, readStockLevel } from './aeInstall'
import { levelsOf, scriptsOf, strParam } from './ae'
import { plainParameters } from './params'

const embedded = (town: StockTown): AeLevel => readLevel(LOBBY_TEMPLATES.find((t) => t.id === town.id)!.lvl).level
const stock = (town: StockTown): AeLevel => readLevel(readStockLevel(town.source)).level
const unit = (level: AeLevel, path: string) => level.units.find((u) => u.path === path)
const units = (level: AeLevel, path: string) => level.units.filter((u) => u.path === path)
const lobbyOf = (town: StockTown, shopCategories?: string[]): AeLevel => {
  const params = plainParameters()
  params.lobbies = [{ ...defaultLobby(town.id), ...(shopCategories === undefined ? {} : { shopCategories }) }]
  const result = generateDungeon(params, 555)
  expect(result.ok).toBe(true)
  return levelsOf(result as DungeonResult).get('lobby0')!
}
/** where the stock campaign keeps its levels: `levels/hwr/`, `levels/sun_temple/` */
const stockLevelsDir = (town: StockTown): string => `levels/${town.source.split('/levels/')[1].split('/')[0]}/`

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
      for (const re of [/^actors\//, /exit_teleport_switch/, /^items\//, /^gui\//]) {
        expect(paths.filter((p) => re.test(p)), String(re)).toEqual([])
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

    it('keeps the whole map: every tile, wall, cliff and prop', () => {
      const before = stock(town)
      const after = town.clean(stock(town))
      expect(after.tileCells).toEqual(before.tileCells)
      expect(after.prefabs).toEqual(before.prefabs)
      const props = (l: AeLevel) => l.units.filter((u) => /^doodads\/(walls|cliffs|terrain|doors)\//.test(u.path)).length
      expect(props(after)).toBe(props(before))
    })

    it("drops the campaign's own exits and the story", () => {
      const before = stock(town)
      expect(scriptsOf(before, 'LevelExit').length).toBeGreaterThan(10)
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
})
