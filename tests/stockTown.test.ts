/**
 * Shaftlocke's town as a lobby (src/generator/lobby/stockTown.ts). The
 * per-preset contract (exit, arrival, vendors, payout, ids, assets) runs in
 * lobby.test.ts like every other lobby; this file checks what the cleanup
 * removes and keeps, against the stock level when the install is present.
 */
import { describe, expect, it } from 'vitest'
import { defaultLobby, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import type { AeLevel } from '../src/generator/ae/model'
import { LOBBY_TEMPLATES } from '../src/generator/lobby/templates.generated'
import { SHAFTLOCKE_TOWN_ID, SHAFTLOCKE_TOWN_SOURCE, cleanShaftlockeTown } from '../src/generator/lobby/stockTown'
import { HAS_AE, readStockLevel } from './aeInstall'
import { levelsOf, scriptsOf, strParam } from './ae'
import { plainParameters } from './params'

const embedded = (): AeLevel => readLevel(LOBBY_TEMPLATES.find((t) => t.id === SHAFTLOCKE_TOWN_ID)!.lvl).level
const stock = (): AeLevel => readLevel(readStockLevel(SHAFTLOCKE_TOWN_SOURCE)).level
const unit = (level: AeLevel, path: string) => level.units.find((u) => u.path === path)

describe('Shaftlocke town — the embedded template', () => {
  it('is imported', () => {
    expect(LOBBY_TEMPLATES.some((t) => t.id === SHAFTLOCKE_TOWN_ID)).toBe(true)
  })

  it('keeps only the arrival, the vendors and their greetings, the minimap and the region', () => {
    const town = embedded()
    const classes = new Set(town.scripts.map((s) => s.cls))
    expect([...classes].sort()).toEqual(['ExploreMinimap', 'LevelStart', 'PlaySound', 'RegionArea', 'ShopArea', 'UseTrigger'])
    expect(scriptsOf(town, 'LevelStart').map((s) => strParam(s, 'StartID'))).toEqual([undefined])
  })

  it('opens one labelled ShopArea per stall, none of them the town-upgrade shop', () => {
    const shops = scriptsOf(embedded(), 'ShopArea')
    expect(shops.map((s) => s.label).sort()).toEqual(
      ['combo', 'defense', 'item', 'misc', 'offense', 'power'].map((v) => `lobby:vendor:${v}`)
    )
    expect(shops.every((s) => s.enabled)).toBe(true)
    expect(shops.some((s) => s.params.some((p) => p.name === 'Type' && p.value === 3))).toBe(false)
  })

  it('shows every stall fully upgraded, the teleporter open, and stands the power vendor up', () => {
    const town = embedded()
    const start = (path: string) => unit(town, `doodads/generic/${path}.unit`)?.state?.start?.value
    expect(start('shop_offense')).toBe('5')
    expect(start('shop_health')).toBe('5')
    expect(start('shop_combo')).toBe('5')
    expect(start('shop_item_hwr')).toBe('5')
    expect(start('shop_defense')).toBe('hwr5')
    expect(start('teleport_mt')).toBe('open')
    expect(unit(town, 'doodads/generic/shop_potion.unit')).toBeDefined()
  })

  it('loses no unit scene: the windowed walls keep their start-scene lists', () => {
    const town = embedded()
    const empty = town.units.filter((u) => u.state?.start?.kind === 'string' && u.state.start.value === '')
    expect(empty.map((u) => `${u.id} ${u.path}`)).toEqual([])
    const windows = town.units.filter((u) => u.state?.start?.kind === 'strings')
    expect(windows.length).toBe(13)
  })

  it('carries no townsfolk, portal selectors, pickups or editor labels', () => {
    const paths = embedded().units.map((u) => u.path)
    for (const re of [/^actors\//, /exit_teleport_switch/, /^items\//, /^gui\//]) {
      expect(paths.filter((p) => re.test(p)), String(re)).toEqual([])
    }
  })

  it('names only units and scripts that exist', () => {
    const town = embedded()
    const known = new Set([...town.units.map((u) => u.id), ...town.scripts.map((s) => s.id)])
    for (const s of town.scripts) {
      for (const [id] of s.connections) expect(known.has(id), `${s.cls} ${s.id} -> ${id}`).toBe(true)
      for (const p of s.params) {
        const ids = p.kind === 'ids' ? p.value : p.kind === 'target' ? [p.value[0]] : p.kind === 'sources' ? p.value.map(([id]) => id) : []
        for (const id of ids) expect(known.has(id), `${s.cls}.${p.name} -> ${id}`).toBe(true)
      }
    }
  })

  it('leads nowhere in Shaftlocke once it is a lobby: one exit, to the first floor', () => {
    const params = plainParameters()
    params.lobbies = [defaultLobby(SHAFTLOCKE_TOWN_ID)]
    const result = generateDungeon(params, 555)
    expect(result.ok).toBe(true)
    const lobby = levelsOf(result as DungeonResult).get('lobby0')!
    expect(scriptsOf(lobby, 'LevelExit').map((s) => strParam(s, 'StartID'))).toEqual(['floor0'])
    expect(renderLevel(lobby)).not.toContain('levels/hwr/')
  }, 60_000)
})

describe.skipIf(!HAS_AE)('Shaftlocke town — against the stock level', () => {
  it('is what the importer writes today (re-run scripts/import-shaftlocke-town.ts)', () => {
    expect(LOBBY_TEMPLATES.find((t) => t.id === SHAFTLOCKE_TOWN_ID)!.lvl).toBe(renderLevel(cleanShaftlockeTown(stock())))
  })

  it('keeps the whole map: every tile, wall, cliff and prop', () => {
    const before = stock()
    const after = cleanShaftlockeTown(stock())
    expect(after.tileCells).toEqual(before.tileCells)
    expect(after.prefabs).toEqual(before.prefabs)
    const props = (l: AeLevel) => l.units.filter((u) => /^doodads\/(walls|cliffs|terrain|doors)\//.test(u.path)).length
    expect(props(after)).toBe(props(before))
  })

  it('drops the thirteen Shaftlocke portals and the story', () => {
    const before = stock()
    expect(scriptsOf(before, 'LevelExit')).toHaveLength(13)
    const after = cleanShaftlockeTown(before)
    for (const cls of ['LevelExit', 'SetRespawnPoint', 'StartDialog', 'ShowTutorial', 'PlatformStat', 'SetFlag', 'SpawnEquipment']) {
      expect(scriptsOf(after, cls), cls).toHaveLength(0)
    }
  })
})
