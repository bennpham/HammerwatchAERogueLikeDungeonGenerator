/**
 * Lobbies: the generated stand-in room and every imported AE lobby (the
 * user's `hall` is the default). Each preset runs the same contract — exit,
 * arrival, vendors, payout, ids, assets — read back from the emitted level.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_LOBBY_CATEGORIES,
  DEFAULT_LOBBY_PRESET_ID,
  LOBBY_DIAMOND_VALUE,
  LOBBY_PRESETS,
  LOBBY_VENDORS,
  defaultLobby,
  generateDungeon,
  lobbyCategoryCounts,
  lobbyPresetById,
  parseParametersTxt,
  serializeParametersTxt,
  vendorOfCategory
} from '../src/generator'
import type { DungeonParameters, DungeonResult, LobbyOptions, LobbyPresetDef } from '../src/generator'
import { UPGRADE_KINDS, noUpgrades, oneOfEachUpgrade, upgradeItemPath } from '../src/generator/lobby/payout'
import { DIAMOND_UNIT } from '../src/generator/lobby/payout'
import { HALL_LOBBY_ID, STANDIN_LOBBY_ID } from '../src/generator/lobby/presets'
import { aeAssetExists } from '../src/generator/catalog/assets'
import type { AeLevel } from '../src/generator/ae/model'
import { allIds, idsParam, levelsOf, placements, scriptById, scriptsOf, stemsOf, strParam, unitById } from './ae'
import { plainParameters } from './params'

const SEED = 555

function optionsFor(preset: LobbyPresetDef, patch: Partial<LobbyOptions> = {}): LobbyOptions {
  return { ...defaultLobby(preset.id), ...patch }
}

function generateOk(params: DungeonParameters, seed = SEED): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/** `plainParameters()` with exactly one lobby, on `preset`, in front of the dungeon. */
function withOneLobby(preset: LobbyPresetDef, patch: Partial<LobbyOptions> = {}): DungeonParameters {
  const params = plainParameters()
  params.lobbies = [optionsFor(preset, patch)]
  return params
}

function lobbyOf(preset: LobbyPresetDef, patch: Partial<LobbyOptions> = {}, mutate?: (p: DungeonParameters) => void): AeLevel {
  const params = withOneLobby(preset, patch)
  mutate?.(params)
  const l = levelsOf(generateOk(params)).get('lobby0')
  expect(l, 'lobby0 missing').toBeDefined()
  return l!
}

/** The shop stalls a lobby opens: each enabled ShopArea with its categories. */
function stalls(level: AeLevel): Array<{ categories: string; type?: number }> {
  return scriptsOf(level, 'ShopArea')
    .filter((s) => s.enabled)
    .map((s) => {
      const type = s.params.find((p) => p.name === 'Type')
      return { categories: strParam(s, 'Categories') ?? '', ...(type?.kind === 'int' ? { type: type.value } : {}) }
    })
}

const count = (l: AeLevel, path: string) => l.units.filter((u) => u.path === path).length

describe('lobby — presets', () => {
  it('has unique ids, and the user\'s hall is the default', () => {
    const ids = LOBBY_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(STANDIN_LOBBY_ID)
    expect(ids).toContain(HALL_LOBBY_ID)
    expect(DEFAULT_LOBBY_PRESET_ID).toBe(HALL_LOBBY_ID)
    expect(defaultLobby().preset).toBe(HALL_LOBBY_ID)
  })

  it('maps the retired HW1 placeholder ids onto the default, keeping the boss-prep purse', () => {
    expect(defaultLobby('BETA-dungeon-prep').preset).toBe(DEFAULT_LOBBY_PRESET_ID)
    expect(defaultLobby('BETA-boss-prep').preset).toBe(DEFAULT_LOBBY_PRESET_ID)
    expect(defaultLobby('BETA-boss-prep').startingGold).toBe(20000)
  })

  it('resolves by id, and reports an unknown id as undefined rather than guessing', () => {
    for (const preset of LOBBY_PRESETS) expect(lobbyPresetById(preset.id)).toBe(preset)
    expect(lobbyPresetById('nope')).toBeUndefined()
  })
})

describe('lobby — none configured', () => {
  it('emits only the floors, the scenario info and the logo', () => {
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    params.playerTweaks = {}
    const off = generateOk(params)
    expect(stemsOf(off)).toEqual(Array.from({ length: params.levels }, (_, i) => `floor${i}`))
    expect(off.files.map((f) => f.path).filter((p) => !p.endsWith('.lvl'))).toEqual(['info.xml', 'logos.png'])
  })
})

describe('lobby — shop columns', () => {
  it('covers 22 columns across six stalls, items included', () => {
    expect(ALL_LOBBY_CATEGORIES).toHaveLength(22)
    expect(LOBBY_VENDORS.map((v) => v.id)).toEqual(['combo', 'defense', 'misc', 'offense', 'power', 'item'])
    expect(new Set(ALL_LOBBY_CATEGORIES).size).toBe(22)
  })

  it('maps every column back to its vendor', () => {
    for (const category of ALL_LOBBY_CATEGORIES) expect(vendorOfCategory(category)?.categories).toContain(category)
    expect(vendorOfCategory('nope')).toBeUndefined()
  })

  it('counts the upgrades a skill column contains', () => {
    const counts = lobbyCategoryCounts({})
    for (const category of ALL_LOBBY_CATEGORIES.filter((c) => c !== 'item')) {
      expect(counts[category], `${category} has no upgrades in the stock baseline`).toBeGreaterThan(0)
    }
    expect(counts.power).toBe(5)
  })
})

for (const preset of LOBBY_PRESETS) {
  describe(`lobby — ${preset.id}`, () => {
    describe('determinism and isolation', () => {
      it('produces the same room for the same options', () => {
        expect(lobbyOf(preset)).toEqual(lobbyOf(preset))
      }, 60_000)

      it('ignores the order shop columns were selected in', () => {
        const a = lobbyOf(preset, { shopCategories: ['off1', 'misc2', 'misc1', 'power'] })
        const b = lobbyOf(preset, { shopCategories: ['power', 'misc1', 'off1', 'misc2'] })
        expect(a).toEqual(b)
      }, 60_000)

      it('moves no dungeon floor, whatever the lobby holds', () => {
        const none = levelsOf(generateOk(plainParameters()))
        const rich = levelsOf(generateOk(withOneLobby(preset, { startingGold: 9000, upgrades: oneOfEachUpgrade() })))
        for (let i = 0; i < plainParameters().levels; i++) {
          const stem = `floor${i}`
          expect(rich.get(stem)!.tileCells, stem).toEqual(none.get(stem)!.tileCells)
          expect(placements(rich.get(stem)!), stem).toEqual(placements(none.get(stem)!))
        }
      }, 120_000)
    })

    describe('campaign wiring', () => {
      it('starts the campaign in the lobby, with a default spawn there and a named arrival', () => {
        const result = generateOk(withOneLobby(preset))
        expect(stemsOf(result)).toContain('lobby0')
        expect(/lvl="([^"]+)"/.exec(result.files.find((f) => f.path === 'info.xml')!.content)?.[1]).toBe(
          `levels/${result.campaignName}/lobby0.lvl`
        )
        const lobby = levelsOf(result).get('lobby0')!
        const starts = scriptsOf(lobby, 'LevelStart').map((s) => strParam(s, 'StartID'))
        expect(starts).toContain('lobby0')
        expect(starts).toContain(undefined)
        expect(lobby.gameMode).toBe('DungeonGameMode')
      }, 60_000)

      it('leads on to the first floor through a press-F, whole-party exit', () => {
        const lobby = lobbyOf(preset)
        const exits = scriptsOf(lobby, 'LevelExit')
        expect(exits.map((s) => strParam(s, 'StartID'))).toEqual(['floor0'])
        const use = scriptsOf(lobby, 'UseTrigger').find((u) => u.params.some((p) => p.name === 'Icon' && p.value === 6))
        expect(use, 'an exit UseTrigger').toBeDefined()
        expect(idsParam(use!, 'Areas').every((id) => unitById(lobby, id)?.path.startsWith(':Physics_'))).toBe(true)
        const gather = scriptById(lobby, use!.connections[0][0])!
        expect(gather.cls).toBe('AllPlayersArea')
        expect(idsParam(gather, 'OnTrue')).toContain(exits[0].id)
      }, 60_000)

      it('is not added to the preview, which only describes generated geometry', () => {
        const result = generateOk(withOneLobby(preset))
        expect(result.levels.map((l) => l.label)).not.toContain('L1')
        expect(result.levels).toHaveLength(generateOk(plainParameters()).levels.length)
      }, 60_000)
    })

    describe('vendor stalls', () => {
      it('sells every stall by default: the five skill and power vendors and the items', () => {
        const open = stalls(lobbyOf(preset)).map((s) => s.categories).sort()
        expect(open).toEqual(LOBBY_VENDORS.map((v) => v.categories.join(' ')).sort())
        const items = stalls(lobbyOf(preset)).find((s) => s.categories === 'item')
        expect(items?.type, 'the item vendor is ShopArea Type 2').toBe(2)
      }, 60_000)

      it('sells exactly the selected columns, in canonical order', () => {
        const open = stalls(lobbyOf(preset, { shopCategories: ['misc3', 'off1', 'misc1', 'power'] })).map((s) => s.categories).sort()
        expect(open).toEqual(['misc1 misc3', 'off1', 'power'])
      }, 60_000)

      it('opens no stall when nothing is selected', () => {
        expect(stalls(lobbyOf(preset, { shopCategories: [] }))).toEqual([])
      }, 60_000)

      it('gives every open stall a use area that exists', () => {
        const lobby = lobbyOf(preset)
        for (const shop of scriptsOf(lobby, 'ShopArea').filter((s) => s.enabled)) {
          const target = shop.params.find((p) => p.name === '#PlayerTarget')
          expect(target?.kind).toBe('target')
          const use = scriptById(lobby, (target as { value: [number, string] }).value[0])!
          expect(use.cls).toBe('UseTrigger')
          expect(use.enabled).toBe(true)
          const areas = idsParam(use, 'Areas')
          expect(areas.length, `stall ${strParam(shop, 'Categories')}`).toBeGreaterThan(0)
          for (const id of areas) expect(unitById(lobby, id)?.path).toMatch(/^:Physics_/)
        }
      }, 60_000)

      it('keeps the warlock gargoyle (def2) for sale by default', () => {
        expect(stalls(lobbyOf(preset)).some((s) => s.categories.split(' ').includes('def2'))).toBe(true)
      }, 60_000)
    })

    describe('starting gold and free upgrades', () => {
      it('lays one red diamond per 500 gold', () => {
        for (const gold of [0, LOBBY_DIAMOND_VALUE, 10000]) {
          expect(count(lobbyOf(preset, { startingGold: gold }), DIAMOND_UNIT), `${gold} gold`).toBe(gold / LOBBY_DIAMOND_VALUE)
        }
      }, 120_000)

      it('lays no upgrade by default, and each kind when asked', () => {
        const none = lobbyOf(preset)
        for (const kind of UPGRADE_KINDS) expect(count(none, upgradeItemPath(kind)), kind).toBe(0)
        const all = lobbyOf(preset, { upgrades: oneOfEachUpgrade() })
        for (const kind of UPGRADE_KINDS) expect(count(all, upgradeItemPath(kind)), kind).toBe(1)
      }, 60_000)

      it('stacks multiples on one spot', () => {
        const lobby = lobbyOf(preset, { upgrades: { ...noUpgrades(), health: 3 } })
        const at = lobby.units.filter((u) => u.path === upgradeItemPath('health')).map((u) => `${u.x},${u.y}`)
        expect(at).toHaveLength(3)
        expect(new Set(at).size).toBe(1)
      }, 60_000)

      it('gives each upgrade kind its own spot, clear of the diamonds', () => {
        // diamonds may stack once a room runs out of slots (the stand-in's
        // rows of six); an upgrade never shares a spot with anything else
        const lobby = lobbyOf(preset, { startingGold: 10000, upgrades: oneOfEachUpgrade() })
        const spot = (u: { x: number; y: number }) => `${u.x},${u.y}`
        const diamonds = new Set(lobby.units.filter((u) => u.path === DIAMOND_UNIT).map(spot))
        const upgrades = lobby.units.filter((u) => UPGRADE_KINDS.some((k) => u.path === upgradeItemPath(k))).map(spot)
        expect(new Set(upgrades).size).toBe(UPGRADE_KINDS.length)
        for (const at of upgrades) expect(diamonds.has(at), at).toBe(false)
      }, 60_000)
    })

    describe('integrity', () => {
      it('gives every unit and script a unique id, and resolves every link', () => {
        const lobby = lobbyOf(preset, { startingGold: 10000, upgrades: oneOfEachUpgrade(), music: 'main' }, (p) => {
          p.lobbySaves = true
        })
        const ids = allIds(lobby)
        expect(new Set(ids).size).toBe(ids.length)
        const known = new Set(ids)
        for (const s of lobby.scripts) {
          for (const [id] of s.connections) expect(known.has(id), `${s.cls} ${s.id} -> ${id}`).toBe(true)
          for (const p of s.params) if (p.kind === 'ids') for (const id of p.value) expect(known.has(id), `${s.cls}.${p.name} -> ${id}`).toBe(true)
        }
      }, 60_000)

      it('references only assets the install ships', () => {
        for (const u of lobbyOf(preset, { startingGold: 2000, upgrades: oneOfEachUpgrade() }).units) {
          expect(aeAssetExists(u.path), u.path).toBe(true)
        }
      }, 60_000)

      it('adds a save point on arrival when lobbySaves is on, and none when off', () => {
        expect(scriptsOf(lobbyOf(preset, {}, (p) => (p.lobbySaves = true)), 'SuperCheckPoint')).toHaveLength(1)
        expect(scriptsOf(lobbyOf(preset, {}, (p) => (p.lobbySaves = false)), 'SuperCheckPoint')).toHaveLength(0)
      }, 60_000)
    })

    describe('parameters.txt round trip', () => {
      it('round-trips preset, gold, shops and upgrades', () => {
        const params = plainParameters()
        params.lobbies = [
          optionsFor(preset, {
            startingGold: 2500,
            shopCategories: ['misc1', 'misc2', 'off1', 'def1', 'power', 'item'],
            upgrades: { ...noUpgrades(), health: 3 }
          })
        ]
        const parsed = parseParametersTxt(serializeParametersTxt(params))
        expect(parsed.params.lobbies).toEqual(params.lobbies)
        expect(parsed.unknownKeys).toEqual([])
      })
    })
  })
}
