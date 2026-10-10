/**
 * Every lobby preset, one table-driven suite.
 *
 * Before issue #48 this file covered only the campaign's single starting
 * lobby, and `bossprep.test.ts` separately covered the near-identical shop
 * room welded to the front of every boss fight — a name-normalised diff of
 * the two `build.ts` files showed every executable line identical apart from
 * an import path and a default argument. Both rooms are `LOBBY_PRESETS`
 * entries now, edited by the same `buildLobby()`, so this file loops over
 * `LOBBY_PRESETS` instead of hand-duplicating each suite. `bossprep.test.ts`
 * is gone; everything it asserted lives here.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_LOBBY_CATEGORIES,
  DEFAULT_LOBBY_PRESET_ID,
  LOBBY_DIAMOND_VALUE,
  LOBBY_PRESETS,
  LOBBY_VENDORS,
  buildLobby,
  defaultLobby,
  diamondCount,
  generateDungeon,
  lobbyCategoryCounts,
  lobbyId,
  lobbyPath,
  lobbyPresetById,
  parseParametersTxt,
  serializeParametersTxt,
  vendorOfCategory
} from '../src/generator'
import type { DungeonParameters, DungeonResult, LobbyOptions, LobbyPresetDef } from '../src/generator'
import { GOLD_SAFETY_MAX } from '../src/generator/config/validation'
import {
  UPGRADE_KINDS,
  noUpgrades,
  oneOfEachUpgrade,
  upgradeItemPath
} from '../src/generator/levelTemplate/surgery'
import { allIds, badIntArray, nodesOfType, oneShotRespawn } from './xmlHelpers'
import { plainParameters } from './params'

/**
 * A generic, arbitrary exit target. Most of these tests are about a room's
 * own structure — which columns it sells, how it pays out gold — not about
 * which level its teleport happens to point at; the dedicated 'exit' suite
 * below is what proves the target string itself is wired through correctly.
 */
const EXIT_TARGET = 'some-level'

/**
 * The two warm lights every stock room carries, unconditional — position is
 * fixed data read off the source level the same way the diamond and upgrade
 * slots are, but `LobbyPresetDef` has no field for it (nothing downstream
 * needs to know), so it is spelled out here instead, the same way each half
 * of the pre-#48 test files independently hardcoded its own.
 */
const LIGHT_POSITIONS: Record<string, readonly [string, string]> = {
  'BETA-dungeon-prep': ['-7.75 -4', '8 -3.75'],
  'BETA-boss-prep': ['9 -5', '-9 -5']
}

function optionsFor(preset: LobbyPresetDef, patch: Partial<LobbyOptions> = {}): LobbyOptions {
  return { ...defaultLobby(preset.id), ...patch }
}

function xmlFor(
  preset: LobbyPresetDef,
  patch: Partial<LobbyOptions> = {},
  exitTarget = EXIT_TARGET,
  saves = false
): string {
  return buildLobby(preset, optionsFor(preset, patch), exitTarget, saves)
}

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/** `plainParameters()` (no lobbies) with exactly one, on `preset`, as the only slot in front of the dungeon. */
function withOneLobby(preset: LobbyPresetDef, patch: Partial<LobbyOptions> = {}): DungeonParameters {
  const params = plainParameters()
  params.lobbies = [optionsFor(preset, patch)]
  return params
}

describe('lobby — presets', () => {
  it('has unique ids, and the dungeon-prep room is the default', () => {
    const ids = LOBBY_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('BETA-dungeon-prep')
    expect(ids).toContain('BETA-boss-prep')
    expect(DEFAULT_LOBBY_PRESET_ID).toBe('BETA-dungeon-prep')
  })

  it('resolves by id, and reports an unknown id as undefined rather than guessing', () => {
    for (const preset of LOBBY_PRESETS) {
      expect(lobbyPresetById(preset.id)).toBe(preset)
    }
    expect(lobbyPresetById('nope')).toBeUndefined()
  })
})

describe('lobby — none configured', () => {
  it('emits exactly the pre-lobby campaign', () => {
    // boss defaults on and appends its own arena, and the stock player tweak
    // adds a tweak/ file — neither is what this test is about, so turn both
    // off and keep the assertion about lobbies alone
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    params.playerTweaks = {}
    const off = generateOk(params, 555)

    expect(off.files.map((f) => f.path)).toEqual([
      ...Array.from({ length: plainParameters().levels }, (_, i) => `levels/level${i}.xml`),
      'info.xml',
      'levels.xml'
    ])
    const levels = off.files.find((f) => f.path === 'levels.xml')
    expect(levels?.content).toContain('<levels start="0">')
    expect(levels?.content).not.toContain('lobby')
  })
})

describe('lobby — shop columns', () => {
  it('covers 21 columns across five stalls', () => {
    expect(ALL_LOBBY_CATEGORIES).toHaveLength(21)
    expect(LOBBY_VENDORS).toHaveLength(5)
    expect(new Set(ALL_LOBBY_CATEGORIES).size).toBe(21)
  })

  it('maps every column back to its vendor', () => {
    for (const category of ALL_LOBBY_CATEGORIES) {
      expect(vendorOfCategory(category)?.categories).toContain(category)
    }
    expect(vendorOfCategory('nope')).toBeUndefined()
  })

  it('counts the upgrades a column actually contains', () => {
    const counts = lobbyCategoryCounts({})
    for (const category of ALL_LOBBY_CATEGORIES) {
      expect(counts[category], `${category} has no upgrades in the stock baseline`).toBeGreaterThan(0)
    }
    // power is the five shared.xml upgrades: life, rejuv and the three potions
    expect(counts.power).toBe(5)
  })

  it('follows the Player tab when a ladder is removed', () => {
    const stock = lobbyCategoryCounts({})
    const removed = lobbyCategoryCounts({ 'player.shared.remove.life': 1 })
    expect(removed.power).toBeLessThan(stock.power)
  })
})

for (const preset of LOBBY_PRESETS) {
  describe(`lobby — ${preset.id}`, () => {
    /** Five diamonds deep on every authored slot — well past what the old cap allowed. */
    const DEEP_GOLD = LOBBY_DIAMOND_VALUE * preset.diamondSlots.length * 5

    describe('determinism (invariant #6)', () => {
      it('produces the same room for the same options', () => {
        expect(xmlFor(preset, { startingGold: 2500 })).toBe(xmlFor(preset, { startingGold: 2500 }))
      })

      it('ignores the order shop columns were selected in', () => {
        const forwards = xmlFor(preset, { shopCategories: ['misc1', 'misc3', 'off2'] })
        const backwards = xmlFor(preset, { shopCategories: ['off2', 'misc3', 'misc1'] })
        expect(forwards).toBe(backwards)
      })

      // The single most important pair in this file: a lobby must not touch
      // either RNG stream, or every seed users have saved changes meaning.
      it('leaves every dungeon level byte-identical whether this lobby is present or not', () => {
        for (const seed of [1, 4242, 987654]) {
          const on = generateOk(withOneLobby(preset, { startingGold: 3000 }), seed)
          const off = generateOk(plainParameters(), seed)

          const levelsOf = (r: DungeonResult) => r.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))
          expect(levelsOf(on)).toEqual(levelsOf(off))
          expect(on.levels).toEqual(off.levels)
        }
      }, 60_000)

      // invariant 6 again, one level down: the free upgrades are an item
      // list, and an item list must not be able to reach the dungeon either
      it('leaves every dungeon level byte-identical however many free upgrades it hands out', () => {
        for (const seed of [1, 4242]) {
          const none = generateOk(withOneLobby(preset, { upgrades: noUpgrades() }), seed)
          const many = generateOk(
            withOneLobby(preset, { upgrades: Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 9])) as never }),
            seed
          )

          const levelsOf = (r: DungeonResult) => r.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))
          expect(levelsOf(none)).toEqual(levelsOf(many))
          expect(none.levels).toEqual(many.levels)
          // only the lobby itself moved
          expect(fileAt(none, lobbyPath(0))).not.toBe(fileAt(many, lobbyPath(0)))
        }
      }, 60_000)
    })

    describe('campaign wiring', () => {
      it('ships the lobby level and lists it ahead of the rest of the campaign', () => {
        const on = generateOk(withOneLobby(preset), 555)
        const paths = on.files.map((f) => f.path)
        expect(paths).toContain(lobbyPath(0))

        const levels = on.files.find((f) => f.path === 'levels.xml')?.content ?? ''
        expect(levels).toContain(`<levels start="${lobbyId(0)}">`)
        expect(levels).toContain(`<level id="${lobbyId(0)}" res="${lobbyPath(0)}"`)
        // the lobby entry comes first, and the dungeon's own ids are untouched
        expect(levels.indexOf(lobbyPath(0))).toBeLessThan(levels.indexOf('levels/level0.xml'))
        expect(levels).toContain('<level id="0" res="levels/level0.xml"')
      })

      it('is not added to the preview, which only describes generated geometry', () => {
        // boss defaults on and pushes its own arena preview — turn it off so
        // this stays a test of the lobby's own effect on `previews`
        const params = withOneLobby(preset)
        params.boss = { ...params.boss, enabled: false }
        const on = generateOk(params, 555)
        const levels = plainParameters().levels
        expect(on.levels).toHaveLength(levels)
        expect(on.levels.map((l) => l.level)).toEqual(Array.from({ length: levels }, (_, i) => i))
      })
    })

    describe('exit', () => {
      it('points the exit at whatever target it is built with', () => {
        const xml = xmlFor(preset, {}, 'boss7')
        expect(xml).toContain('<string name="type">LevelExitArea</string>')
        expect(xml).toContain('<string name="level">boss7</string>')
        expect(xml).not.toContain('<string name="level">1</string>')
      })
    })

    describe('vendor stalls', () => {
      it('sells exactly the selected columns and badges the count', () => {
        const xml = xmlFor(preset, { shopCategories: ['misc1'] })
        expect(xml).toContain('<string name="cats">misc1</string>')
        expect(xml).toContain('doodads/special/vendor_speech_level1.xml')
        expect(xml).not.toContain('doodads/special/vendor_speech_level5.xml')
      })

      it('writes columns in canonical order regardless of selection order', () => {
        const xml = xmlFor(preset, { shopCategories: ['misc4', 'misc1', 'misc3'] })
        expect(xml).toContain('<string name="cats">misc1 misc3 misc4</string>')
        expect(xml).toContain('doodads/special/vendor_speech_level3.xml')
      })

      it('sells all five stalls by default, power included', () => {
        const xml = xmlFor(preset)
        expect(xml).toContain('<string name="cats">combo1 combo2 combo3 combo4 combo5</string>')
        expect(xml).toContain('<string name="cats">def1 def2 def3 def4 def5</string>')
        expect(xml).toContain('<string name="cats">misc1 misc2 misc3 misc4 misc5</string>')
        expect(xml).toContain('<string name="cats">off1 off2 off3 off4 off5</string>')
        expect(xml).toContain('<string name="cats">power</string>')
      })

      it('removes a deselected stall entirely, leaving no dangling shape reference', () => {
        const xml = xmlFor(preset, { shopCategories: ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc')) })

        expect(xml).not.toContain('vendor_misc.xml')
        expect(xml).not.toContain('vendor_speech_misc.xml')
        expect(xml).not.toContain('<string name="cats">misc')
        // the other four stalls survive
        expect(xml).toContain('vendor_offense.xml')

        // every shape a node points at still exists in the file
        const ids = new Set(allIds(xml))
        for (const match of xml.matchAll(/<dictionary name="shape">\s*<int-arr name="static">([^<]*)<\/int-arr>/g)) {
          for (const ref of match[1].split(' ').filter((r) => r !== '')) {
            expect(ids.has(Number(ref)), `shape reference ${ref} points at a removed element`).toBe(true)
          }
        }
      })

      it('removes every stall when nothing is selected', () => {
        const xml = xmlFor(preset, { shopCategories: [] })
        expect(xml).not.toContain('<string name="cats">')
        for (const vendor of LOBBY_VENDORS) {
          expect(xml).not.toContain(`vendor_${vendor.id}.xml`)
        }
        // the teleport out is still there, so the room is never a dead end
        expect(xml).toContain('<string name="type">LevelExitArea</string>')
      })

      it('gives the single-column power stall no badge', () => {
        const xml = xmlFor(preset, { shopCategories: ['power'] })
        expect(xml).toContain('<string name="cats">power</string>')
        expect(xml).not.toContain('vendor_speech_level')
      })
    })

    describe('starting gold', () => {
      it('emits one diamond per 500 gold', () => {
        for (const gold of [0, 500, 3000, 6000]) {
          // the free upgrades share this section, so they are switched off
          // here to leave the diamonds as the only placements in the file
          const xml = xmlFor(preset, { startingGold: gold, upgrades: noUpgrades() })
          const diamonds = [...xml.matchAll(/<array><int>\d+<\/int><vec2>[^<]*<\/vec2><\/array>/g)]
          expect(diamonds).toHaveLength(gold / LOBBY_DIAMOND_VALUE)
          expect(diamondCount(gold)).toBe(gold / LOBBY_DIAMOND_VALUE)
          expect(xml.includes('items/valuable_diamond_red.xml')).toBe(gold > 0)
        }
      })

      it('leaves the items section empty at 0 gold rather than emitting an empty array', () => {
        const xml = xmlFor(preset, { startingGold: 0, upgrades: noUpgrades() })
        expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
        expect(xml).not.toContain('items/valuable_diamond_red.xml')
      })

      it('stacks past the authored slots rather than spilling outside the room', () => {
        const xml = xmlFor(preset, { startingGold: DEEP_GOLD, upgrades: noUpgrades() })
        const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)].map(
          (m) => `${Number(m[1])},${Number(m[2])}`
        )

        const counts = new Map<string, number>()
        for (const [x, y] of preset.diamondSlots) counts.set(`${x},${y}`, 0)
        for (const slot of placed) {
          if (counts.has(slot)) counts.set(slot, (counts.get(slot) ?? 0) + 1)
        }
        expect([...counts.values()]).toEqual(preset.diamondSlots.map(() => 5))
        // nothing landed anywhere but an authored slot
        expect(placed).toHaveLength(DEEP_GOLD / LOBBY_DIAMOND_VALUE)
      })

      // the interesting case is a count that is not a whole multiple of the
      // slots: the round-robin has to leave the first few spots one deeper
      it('spreads a partial extra round over the first slots', () => {
        const slots = preset.diamondSlots.length
        const xml = xmlFor(preset, { startingGold: LOBBY_DIAMOND_VALUE * (slots + 2) })
        const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)].map(
          (m) => `${Number(m[1])},${Number(m[2])}`
        )
        const counts = preset.diamondSlots.map(
          ([x, y]) => placed.filter((slot) => slot === `${x},${y}`).length
        )
        expect(counts).toEqual(preset.diamondSlots.map((_, i) => (i < 2 ? 2 : 1)))
      })

      it('keeps every id in the file unique across doodads / actors / items / scripting', () => {
        // every free upgrade turned on alongside the deepest payout: the
        // diamonds and the upgrades number from two different bases, and this
        // is what proves those ranges cannot meet however deep gold piles up
        const xml = xmlFor(preset, { startingGold: DEEP_GOLD, upgrades: oneOfEachUpgrade() })
        // ids appear once as an element id and, for LevelStart, once more
        // inside its parameters — so compare against the element ids only.
        // buildLobby finds an element by exactly this pattern, so a duplicate
        // would not just be untidy, it would make the surgery ambiguous.
        const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) =>
          Number(m[1])
        )
        const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
        const all = [...elementIds, ...itemIds]
        expect(new Set(all).size).toBe(all.length)
        expect(itemIds).toHaveLength(DEEP_GOLD / LOBBY_DIAMOND_VALUE + UPGRADE_KINDS.length)
      })

      it('numbers from a base no diamond payout can reach', () => {
        // the deepest pile the validator will accept, against the largest counts
        const xml = xmlFor(preset, {
          startingGold: GOLD_SAFETY_MAX,
          upgrades: { ...oneOfEachUpgrade(), damage: 3 }
        })
        const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
        expect(new Set(itemIds).size).toBe(itemIds.length)
        expect(Math.min(...itemIds)).toBe(preset.itemIdBase)
        expect(Math.max(...itemIds)).toBeLessThan(preset.upgradeIdBase + UPGRADE_KINDS.length + 3)
      })
    })

    describe('free upgrades', () => {
      it('lays none at all by default', () => {
        const xml = xmlFor(preset)
        for (const kind of UPGRADE_KINDS) {
          expect(xml, kind).not.toContain(upgradeItemPath(kind))
        }
      })

      it('lays each kind on its authored slot when asked for', () => {
        const xml = xmlFor(preset, { upgrades: oneOfEachUpgrade() })
        for (const kind of UPGRADE_KINDS) {
          const [x, y] = preset.upgradeSlots[kind]
          const section = itemSection(xml, upgradeItemPath(kind))
          expect(section, kind).not.toBeNull()
          expect(placementsIn(section ?? ''), kind).toEqual([`${x},${y}`])
        }
      })

      it('omits a kind left at zero rather than emitting an empty array', () => {
        const xml = xmlFor(preset, { upgrades: { ...oneOfEachUpgrade(), mana2: 0 } })
        expect(xml).not.toContain(upgradeItemPath('mana2'))
        expect(xml).toContain(upgradeItemPath('mana'))
        expect(badIntArray(xml)).toBeNull()
      })

      it('emits nothing at all with every kind at zero and no gold', () => {
        const xml = xmlFor(preset, { startingGold: 0, upgrades: noUpgrades() })
        expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
      })

      it('stacks multiples on the one slot instead of spreading them', () => {
        const xml = xmlFor(preset, { startingGold: 0, upgrades: { ...noUpgrades(), health: 4 } })
        const [x, y] = preset.upgradeSlots.health
        const section = itemSection(xml, upgradeItemPath('health'))
        // four pickups, one spot: the count is the dungeon master's dial and
        // is deliberately not bounded by how many slots the room was authored
        // with
        expect(placementsIn(section ?? '')).toEqual([`${x},${y}`, `${x},${y}`, `${x},${y}`, `${x},${y}`])
      })

      it('leaves the ids of the kinds after a zeroed one where they were', () => {
        // ids advance with the items placed, not with the kind's position, so
        // switching one kind off must not shift the rest of the numbering
        const off = xmlFor(preset, { startingGold: 0, upgrades: { ...noUpgrades(), mana2: 1 } })
        const only = [...off.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
        expect(only).toEqual([preset.upgradeIdBase])
      })

      it('is a pure function of the counts', () => {
        const a = xmlFor(preset, { upgrades: { ...noUpgrades(), defense: 2, mana: 7 } })
        const b = xmlFor(preset, { upgrades: { ...noUpgrades(), defense: 2, mana: 7 } })
        expect(a).toBe(b)
      })
    })

    describe('lighting', () => {
      it('carries the two warm lights, always', () => {
        const [posA, posB] = LIGHT_POSITIONS[preset.id]
        for (const patch of [{}, { shopCategories: [] }, { startingGold: 0, upgrades: noUpgrades() }]) {
          const xml = xmlFor(preset, patch)
          for (const pos of [posA, posB]) {
            expect(xml, JSON.stringify(patch)).toContain(`<vec2 name="pos">${pos}</vec2>`)
          }
          // the torch colour block, so a re-import cannot quietly change the mood
          expect(xml).toContain('<int-arr name="mulColor3">255 165 0 255</int-arr>')
        }
      })
    })

    describe('int-arr safety', () => {
      // LevelPacker.exe parses every <int-arr> body with Int32.Parse and dies
      // on an empty one — `System.FormatException: Input string was not in a
      // correct format` out of TiltedEngine.SValue.ParseXMLNode, no .hwm
      // written. The lobby's LevelExitArea shipped exactly that and broke
      // every install ([VERIFIED] 2026-07-31). This is the general form: any
      // empty or non-integer int-arr, in any stall configuration, at gold 0
      // and stacked deep.
      it('never emits an empty or non-integer int-arr, which LevelPacker cannot parse', () => {
        for (const gold of [0, DEEP_GOLD]) {
          expect(badIntArray(xmlFor(preset, { startingGold: gold })), `${preset.id} gold ${gold}`).toBeNull()
        }
        for (const shopCategories of [[], ['power'], ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc'))]) {
          const label = `${preset.id} with shops [${shopCategories.join(' ')}]`
          expect(badIntArray(xmlFor(preset, { shopCategories })), label).toBeNull()
        }
      })
    })

    describe('arrival respawn', () => {
      // Same one-shot rig every dungeon floor's ExitUp prefab carries: nobody
      // should be stuck dead in a room whose whole point is shopping.
      it('revives whoever arrived dead, exactly once', () => {
        const rig = oneShotRespawn(xmlFor(preset))
        expect(rig, typeof rig === 'string' ? rig : '').not.toBeTypeOf('string')
        expect(rig).toEqual({
          shape: preset.respawnIdBase,
          trigger: preset.respawnIdBase + 1,
          respawn: preset.respawnIdBase + 2,
          disable: preset.respawnIdBase + 3
        })
      })

      it('watches the spot the players actually land in', () => {
        const xml = xmlFor(preset)
        const [start] = nodesOfType(xml, 'LevelStart')
        const pos = /<vec2 name="pos">(-?[\d.]+ -?[\d.]+)<\/vec2>/.exec(start.body)?.[1]
        expect(pos).toBeDefined()
        const shape = nodesOfType(xml, 'RectangleShape').find((n) => n.id === preset.respawnIdBase)
        expect(shape?.body).toContain(`<vec2 name="pos">${pos}</vec2>`)
        expect(shape?.body).toContain('<float name="w">3</float>')
      })

      it('survives every shop configuration', () => {
        for (const shopCategories of [[], ['power'], [...ALL_LOBBY_CATEGORIES]]) {
          const label = `${preset.id} with shops [${shopCategories.join(' ')}]`
          expect(oneShotRespawn(xmlFor(preset, { shopCategories })), label).not.toBeTypeOf('string')
        }
      })
    })

    describe('shipped assets', () => {
      it('ships its assets alongside the level, and only when a lobby uses this preset', () => {
        const on = generateOk(withOneLobby(preset), 99)
        const off = generateOk(plainParameters(), 99)
        for (const asset of preset.assets) {
          expect(on.files).toContainEqual(asset)
          expect(off.files.map((f) => f.path)).not.toContain(asset.path)
        }
      })

      it('declares an encoding the packer understands, and base64 round-trips', () => {
        for (const asset of preset.assets) {
          expect(['utf-8', 'base64', undefined]).toContain(asset.encoding)
          if (asset.encoding === 'base64') {
            // the bytes the packer will write must survive the trip through
            // the pure generator, which can only carry strings
            const bytes = Buffer.from(asset.content, 'base64')
            expect(bytes.toString('base64')).toBe(asset.content)
            expect(bytes.byteLength).toBeGreaterThan(0)
          }
        }
      })

      it('leaves the lobby level file itself as utf-8', () => {
        const on = generateOk(withOneLobby(preset), 99)
        const file = on.files.find((f) => f.path === lobbyPath(0))
        expect(file?.encoding).toBeUndefined()
      })

      // The template is a level saved out of the game's editor, so it can
      // reference files that only exist inside the campaign it was authored
      // in. Those have to ride along in the preset's own `assets` or the
      // packed campaign loads a room with holes in its walls. This is what
      // catches a re-import that forgot an --asset.
      it('references nothing that is neither stock nor shipped', () => {
        // `doodads/theme_*` covers any theme's folder generically — the
        // dungeon-prep room decorates with theme c, the boss-prep room with
        // bonus4, and neither needs bundling since both are stock game
        // assets. `actors/` is the boss-prep room's decorative statues.
        const stock = ['doodads/generic/', 'doodads/special/', 'doodads/theme_', 'items/', 'tilemaps/', 'sound/', 'actors/']
        const shipped = new Set(preset.assets.map((a) => a.path))
        const xml = xmlFor(preset)

        const referenced = [...xml.matchAll(/<string name="(?:type|tileset)">([^<]*)<\/string>/g)]
          .map((m) => m[1])
          .filter((path) => path.includes('/'))
        expect(referenced.length).toBeGreaterThan(0)

        for (const path of new Set(referenced)) {
          const known = shipped.has(path) || stock.some((prefix) => path.startsWith(prefix))
          expect(known, `${path} is neither a stock asset nor shipped in ${preset.id}'s assets`).toBe(true)
        }
      })

      it('ships every file its shipped assets themselves reference', () => {
        const shipped = new Set(preset.assets.map((a) => a.path))
        for (const asset of preset.assets) {
          if (asset.encoding !== 'utf-8') continue
          for (const [, texture] of asset.content.matchAll(/<texture>([^<]*)<\/texture>/g)) {
            expect(shipped.has(texture), `${asset.path} needs ${texture}`).toBe(true)
          }
        }
      })
    })

    describe('save checkpoint (lobbySaves)', () => {
      it('places one trigger_button_save.xml on the preset slot when on', () => {
        const xml = xmlFor(preset, { startingGold: 0, upgrades: noUpgrades() }, EXIT_TARGET, true)
        const section = itemSection(xml, 'items/trigger_button_save.xml')
        expect(section).not.toBeNull()
        const [x, y] = preset.saveButtonSlot
        expect(placementsIn(section ?? '')).toEqual([`${x},${y}`])
        expect(section).toContain(`<int>${preset.saveButtonId}</int>`)
      })

      it('places nothing when off', () => {
        const xml = xmlFor(preset, {}, EXIT_TARGET, false)
        expect(xml).not.toContain('items/trigger_button_save.xml')
      })

      it('adds only the one item array — the rest of the file is untouched', () => {
        const on = xmlFor(preset, {}, EXIT_TARGET, true)
        const off = xmlFor(preset, {}, EXIT_TARGET, false)
        const [x, y] = preset.saveButtonSlot
        const added = `\t\t<array name="items/trigger_button_save.xml">\n\t\t\t<array><int>${preset.saveButtonId}</int><vec2>${x} ${y}</vec2></array>\n\t\t</array>\n`
        expect(on.replace(added, '')).toBe(off)
        expect(badIntArray(on)).toBeNull()
      })

      it('keeps its id clear of the diamond and upgrade payout however deep', () => {
        const xml = xmlFor(
          preset,
          { startingGold: GOLD_SAFETY_MAX, upgrades: oneOfEachUpgrade() },
          EXIT_TARGET,
          true
        )
        const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
        expect(new Set(itemIds).size).toBe(itemIds.length)
        expect(itemIds).toContain(preset.saveButtonId)
        expect(preset.saveButtonId).toBeLessThan(preset.itemIdBase)
        expect(preset.saveButtonId).toBeGreaterThan(preset.respawnIdBase + 3)
      })

      it('moves no dungeon level, on or off, for the same seed', () => {
        const levelsOf = (r: DungeonResult) => r.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))
        for (const seed of [7, 55555]) {
          const on = withOneLobby(preset)
          on.lobbySaves = true
          const off = withOneLobby(preset)
          off.lobbySaves = false
          const ron = generateOk(on, seed)
          const roff = generateOk(off, seed)
          expect(levelsOf(ron)).toEqual(levelsOf(roff))
          expect(fileAt(ron, lobbyPath(0))).toContain('items/trigger_button_save.xml')
          expect(fileAt(roff, lobbyPath(0))).not.toContain('items/trigger_button_save.xml')
        }
      }, 60_000)
    })

    describe('parameters.txt round trip', () => {
      it('round-trips preset, gold, shops and upgrades', () => {
        const params = plainParameters()
        params.lobbies = [
          optionsFor(preset, {
            startingGold: 2500,
            shopCategories: ['misc1', 'misc2', 'off1', 'def1', 'power'],
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

/**
 * The body of one `<array name="items/…">`, or null when the file has none.
 *
 * The close is found at the section's own indentation, not by the first
 * `</array>` — each placement inside is itself an `<array>…</array>`.
 */
function itemSection(xml: string, item: string): string | null {
  const open = `\t\t<array name="${item}">\n`
  const start = xml.indexOf(open)
  if (start === -1) return null
  const body = start + open.length
  return xml.slice(body, xml.indexOf('\t\t</array>', body))
}

/** Every `x,y` an item section places something at, in order. */
function placementsIn(section: string): string[] {
  return [...section.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)].map(
    (m) => `${Number(m[1])},${Number(m[2])}`
  )
}

/** One generated file's contents by path. */
function fileAt(result: DungeonResult, path: string): string {
  const file = result.files.find((f) => f.path === path)
  expect(file, `no ${path} in the result`).toBeDefined()
  return file?.content ?? ''
}
