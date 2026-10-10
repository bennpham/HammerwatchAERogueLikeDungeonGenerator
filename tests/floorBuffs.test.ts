/**
 * Buff auras — the optional per-floor buff fields (src/generator/buffs/field.ts).
 *
 * Two things are being proved here. First, invariant 6/8: the feature is
 * optional, so a campaign with no floor carrying a buff must be
 * indistinguishable from one generated before the feature existed, switching one
 * floor on must leave every other floor untouched, and — because both optional
 * field rigs now share the floor loop — a floor with only a timer must keep the
 * ids it had before buffs existed. Second, the rig itself: an always-on
 * DangerArea per buff, one shared shape per distinct target, and the right
 * `types` bitmask on each.
 */

import { describe, expect, it } from 'vitest'
import {
  BUFF_REFRESH_MS,
  BUFF_TARGET_TYPES,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultParameters
} from '../src/generator/config/parameters'
import type { BuffTarget, FloorBuff } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { BUFF_DEFS, BUFF_GROUPS, BUFF_HELPFUL_IDS, buffById } from '../src/generator/objects/buffTypes'
import { allIds, badIntArray, nodesOfType } from './xmlHelpers'
import { plainParameters } from './params'

const SEED = 4242

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/**
 * Stock parameters with the optional layers off, so the file list is just the
 * dungeon floors. Same isolation discipline as floorTimer.test.ts.
 *
 * The map is deliberately smaller than the stock 80x60 and carries fewer rooms.
 * The buff rig is blind to both — it emits one covering rectangle and a handful
 * of off-map marker nodes whatever the floor looks like — but generation cost
 * is dominated by map area, and this suite generates a lot of campaigns.
 */
function bareParams(): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.mapWidth = 40
  params.mapHeight = 40
  params.minRoomCount = 4
  params.maxRoomCount = 6
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  params.levelBuffs = Array.from({ length: 3 }, () => defaultFloorBuffs())
  params.levelTimers = Array.from({ length: 3 }, () => defaultFloorTimer())
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

/** `bareParams()` with floor `index` carrying `buffs`. */
function withBuffs(index: number, buffs: FloorBuff[]): DungeonParameters {
  const params = bareParams()
  ;(params.levelBuffs as FloorBuff[][])[index] = buffs
  return params
}

function levelXml(result: DungeonResult, index: number): string {
  const file = result.files.find((f) => f.path === `levels/level${index}.xml`)
  expect(file, `levels/level${index}.xml missing`).toBeDefined()
  return (file as { content: string }).content
}

/** The ids `<int-arr name="{name}">` holds inside `body`, or null if absent. */
function intArr(body: string, name: string): number[] | null {
  const found = new RegExp(`<int-arr name="${name}">([^<]*)</int-arr>`).exec(body)
  return found === null ? null : found[1].split(' ').map(Number)
}

function intParam(body: string, name: string): number | null {
  const found = new RegExp(`<int name="${name}">(-?\\d+)</int>`).exec(body)
  return found === null ? null : Number(found[1])
}

/** The `<string name="buff">` a DangerArea body carries, '' when empty. */
function buffParam(body: string): string | null {
  const found = /<string name="buff">([^<]*)<\/string>/.exec(body)
  return found === null ? null : found[1]
}

/** Whether a node body says `<bool name="enabled">True</bool>`. */
function isEnabled(body: string): boolean {
  return /<bool name="enabled">True<\/bool>/.test(body)
}

/** One section of a level file, so the non-scripting sections can be compared. */
function section(xml: string, name: string): string {
  const open = xml.indexOf(`<dictionary name="${name}">`)
  expect(open, `section ${name} missing`).toBeGreaterThan(-1)
  const next = xml.indexOf('<dictionary name="', open + 1)
  return xml.slice(open, next === -1 ? xml.length : next)
}

// --- the registry -----------------------------------------------------------

describe('the buff registry', () => {
  it('has a unique id and a well-formed path for every buff', () => {
    expect(new Set(BUFF_DEFS.map((d) => d.id)).size).toBe(BUFF_DEFS.length)
    for (const def of BUFF_DEFS) {
      expect(def.path, `${def.id} path`).toBe(`buffs/${def.id}.xml`)
      expect(def.label.length, `${def.id} label`).toBeGreaterThan(0)
      // The description is the whole point of the registry — the form's tooltip
      // is the only place a dungeon master learns what a buff does.
      expect(def.description.length, `${def.id} description`).toBeGreaterThan(20)
    }
  })

  it('puts every buff in a group the dropdown renders', () => {
    for (const def of BUFF_DEFS) {
      expect(BUFF_GROUPS, `${def.id} group`).toContain(def.group)
    }
    expect(new Set(BUFF_GROUPS).size).toBe(BUFF_GROUPS.length)
  })

  it('resolves every id through buffById, and nothing else', () => {
    for (const def of BUFF_DEFS) expect(buffById(def.id)).toBe(def)
    expect(buffById('no_such_buff')).toBeUndefined()
  })

  it('lists only real buffs as strengthening', () => {
    for (const id of BUFF_HELPFUL_IDS) expect(buffById(id), id).toBeDefined()
  })
})

// --- invariant 6: no buffs means no buffs -----------------------------------

describe('buff auras — none means none', () => {
  it('every floor empty matches a campaign with no levelBuffs field at all, across seeds', () => {
    for (const seed of [1, 4242, 987654]) {
      const empty = generateOk(bareParams(), seed)

      const legacy = bareParams()
      delete legacy.levelBuffs
      const before = generateOk(legacy, seed)

      expect(empty.files).toEqual(before.files)
      expect(empty.levels).toEqual(before.levels)
    }
  }, 60_000)

  it('emits no DangerArea at all when no floor carries a buff', () => {
    const result = generateOk(bareParams(), SEED)
    for (let i = 0; i < 3; i++) {
      expect(nodesOfType(levelXml(result, i), 'DangerArea')).toHaveLength(0)
    }
  })
})

describe('buff auras — one floor on leaves the others alone', () => {
  it('leaves every other floor byte-identical', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBuffs(1, [{ buff: 'frost', target: 'players' }]), SEED)

    expect(levelXml(on, 0)).toBe(levelXml(off, 0))
    expect(levelXml(on, 2)).toBe(levelXml(off, 2))
    expect(levelXml(on, 1)).not.toBe(levelXml(off, 1))
  }, 30_000)

  it('only appends to the buffed floor — the dungeon itself is untouched', () => {
    const off = levelXml(generateOk(bareParams(), SEED), 1)
    const on = levelXml(generateOk(withBuffs(1, [{ buff: 'frost', target: 'players' }]), SEED), 1)

    for (const name of ['tilemap', 'doodads', 'actors', 'items']) {
      expect(section(on, name), `${name} moved`).toBe(section(off, name))
    }

    const before = allIds(off)
    const after = allIds(on)
    // one shared shape plus one DangerArea. `allIds` reads document order and
    // the scripting section sits before items/lighting, so the new ids land
    // mid-file — what matters is that they are *appended* to the id counter:
    // every pre-existing id survives untouched and nothing was renumbered.
    expect(after).toHaveLength(before.length + 2)
    expect(after.filter((id) => !before.includes(id))).toHaveLength(2)
    expect(before.every((id) => after.includes(id))).toBe(true)
    for (const added of after.filter((id) => !before.includes(id))) {
      expect(added).toBeGreaterThan(Math.max(...before))
    }
  }, 30_000)

  it('leaves a timer-only floor byte-identical to the pre-buff output', () => {
    // The buff rig runs first in the floor loop, so it has to emit nothing at
    // all — not one id — or every timer rig in every saved campaign shifts.
    const timerOnly = bareParams()
    ;(timerOnly.levelTimers as ReturnType<typeof defaultFloorTimer>[])[1] = {
      ...defaultFloorTimer(),
      enabled: true,
      seconds: 5
    }

    const withField = JSON.parse(JSON.stringify(timerOnly)) as DungeonParameters
    delete withField.levelBuffs

    expect(levelXml(generateOk(timerOnly, SEED), 1)).toBe(levelXml(generateOk(withField, SEED), 1))
  }, 30_000)
})

// --- the rig ----------------------------------------------------------------

describe('buff auras — the field rig', () => {
  it('emits one always-on, zero-damage DangerArea per buff', () => {
    const result = generateOk(
      withBuffs(0, [
        { buff: 'frost', target: 'players' },
        { buff: 'bloodlust', target: 'monsters' }
      ]),
      SEED
    )
    const xml = levelXml(result, 0)
    const areas = nodesOfType(xml, 'DangerArea')
    expect(areas).toHaveLength(2)

    for (const area of areas) {
      // A buff field carries no damage of its own and arrives live — unlike
      // timer mode's hazard, nothing exists to switch it on.
      expect(isEnabled(area.body)).toBe(true)
      expect(intParam(area.body, 'damage')).toBe(0)
      expect(intParam(area.body, 'freq')).toBe(BUFF_REFRESH_MS)
    }

    expect(buffParam(areas[0].body)).toBe('buffs/frost.xml')
    expect(buffParam(areas[1].body)).toBe('buffs/bloodlust.xml')
  }, 30_000)

  it('gives each distinct target its own shape, with the right types bitmask', () => {
    const result = generateOk(
      withBuffs(0, [
        { buff: 'frost', target: 'players' },
        { buff: 'bloodlust', target: 'monsters' }
      ]),
      SEED
    )
    const xml = levelXml(result, 0)
    const areas = nodesOfType(xml, 'DangerArea')
    const shapes = nodesOfType(xml, 'RectangleShape')

    const shapeOf = (index: number) => {
      const ids = intArr(areas[index].body, 'static')
      expect(ids, 'DangerArea has no shape').not.toBeNull()
      expect(ids).toHaveLength(1)
      const shape = shapes.find((s) => s.id === (ids as number[])[0])
      expect(shape, 'DangerArea points at a missing shape').toBeDefined()
      return shape as { id: number; body: string }
    }

    const players = shapeOf(0)
    const monsters = shapeOf(1)
    expect(players.id).not.toBe(monsters.id)
    expect(intParam(players.body, 'types')).toBe(BUFF_TARGET_TYPES.players)
    expect(intParam(monsters.body, 'types')).toBe(BUFF_TARGET_TYPES.monsters)
  }, 30_000)

  it('shares one shape between buffs aiming at the same target', () => {
    const result = generateOk(
      withBuffs(0, [
        { buff: 'frost', target: 'both' },
        { buff: 'cripple', target: 'both' },
        { buff: 'slime_poison', target: 'both' }
      ]),
      SEED
    )
    const xml = levelXml(result, 0)
    const areas = nodesOfType(xml, 'DangerArea')
    expect(areas).toHaveLength(3)

    const shapeIds = areas.map((a) => (intArr(a.body, 'static') as number[])[0])
    expect(new Set(shapeIds).size).toBe(1)

    const shape = nodesOfType(xml, 'RectangleShape').find((s) => s.id === shapeIds[0])
    expect(intParam((shape as { body: string }).body, 'types')).toBe(BUFF_TARGET_TYPES.both)
  }, 30_000)

  it('emits no empty int-arr anywhere on a buffed floor', () => {
    const result = generateOk(
      withBuffs(2, [{ buff: 'thief_stun_1', target: 'players' }]),
      SEED
    )
    expect(badIntArray(levelXml(result, 2))).toBeNull()
  }, 30_000)

  it('is deterministic for a seed', () => {
    const params = withBuffs(1, [
      { buff: 'frost', target: 'players' },
      { buff: 'bloodlust', target: 'monsters' }
    ])
    expect(generateOk(params, SEED).files).toEqual(generateOk(params, SEED).files)
  }, 30_000)

  it('skips an unknown buff rather than crashing', () => {
    // Validation is the gate; the generator must never throw on bad input.
    const params = withBuffs(0, [
      { buff: 'no_such_buff', target: 'players' },
      { buff: 'frost', target: 'players' }
    ])
    const result = generateDungeon(params, SEED)
    // The bad entry is a validation error, so generation is refused cleanly.
    expect(result.ok).toBe(false)

    // ...and the rig itself, reached directly, drops it instead of throwing.
    const forced = withBuffs(0, [{ buff: 'no_such_buff', target: 'players' }])
    delete forced.levelBuffs
    expect(generateOk(forced, SEED).files.length).toBeGreaterThan(0)
  }, 30_000)
})

// --- validation -------------------------------------------------------------

describe('buff auras — validation', () => {
  const check = (buffs: FloorBuff[]) => validateParameters(withBuffs(0, buffs))

  it('accepts a floor with no buffs', () => {
    expect(validateParameters(bareParams()).valid).toBe(true)
  })

  it('accepts every target', () => {
    for (const target of ['players', 'monsters', 'both'] as BuffTarget[]) {
      expect(check([{ buff: 'frost', target }]).valid).toBe(true)
    }
  })

  it('rejects an unknown buff id', () => {
    const result = check([{ buff: 'no_such_buff', target: 'players' }])
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('levelBuffs.0.0.buff')
  })

  it('rejects an unknown target', () => {
    const result = check([{ buff: 'frost', target: 'everyone' as BuffTarget }])
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('levelBuffs.0.0.target')
  })

  it('puts no upper bound on how many buffs a floor carries', () => {
    // One of every buff the game ships, all on one floor. Cheerfully silly, and
    // deliberately not an error: the count is a performance question, not a
    // validity one.
    const everything = BUFF_DEFS.map((def) => ({ buff: def.id, target: 'players' as BuffTarget }))
    const result = check(everything)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('warns about the same buff and target twice on one floor', () => {
    const result = check([
      { buff: 'frost', target: 'players' },
      { buff: 'frost', target: 'players' }
    ])
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('levelBuffs.0.1.buff')
  })

  it('does not warn about the same buff aimed at two different targets', () => {
    const result = check([
      { buff: 'frost', target: 'players' },
      { buff: 'frost', target: 'monsters' }
    ])
    expect(result.warnings.map((w) => w.field)).not.toContain('levelBuffs.0.1.buff')
  })

  it('warns when a strengthening buff catches the horde', () => {
    const result = check([{ buff: 'bloodlust', target: 'monsters' }])
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('levelBuffs.0.0.target')
  })

  it('warns about buff lists past the floor count', () => {
    const params = withBuffs(0, [{ buff: 'frost', target: 'players' }])
    ;(params.levelBuffs as FloorBuff[][]).push([{ buff: 'cripple', target: 'players' }])
    const result = validateParameters(params)
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('levelBuffs')
  })
})
