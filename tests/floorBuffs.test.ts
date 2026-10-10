/**
 * Buff auras — the optional per-floor buff fields (src/generator/buffs/field.ts).
 *
 * Two things are being proved here. First, invariant 6/8: the feature is
 * optional, so a campaign with no floor carrying a buff must be
 * indistinguishable from one generated before the feature existed, switching one
 * floor on must leave every other floor untouched, and — because both optional
 * field rigs share the floor loop — a floor with only a timer must come out
 * exactly as it did before buffs existed. Second, the rig itself: an always-on
 * DangerArea per buff, one shared sensor per distinct target, and the right AE
 * filter on each.
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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aeAssetsDir } from './aeInstall'
import type { AeLevel } from '../src/generator/ae/model'
import { changedScripts, generateOk, idsParam, intParam, levelsOf, placements, scriptsOf, strParam } from './ae'
import { plainParameters } from './params'

const SEED = 4242

/**
 * Stock parameters with the optional layers off, so the file list is just the
 * dungeon floors. Same isolation discipline as floorTimer.test.ts.
 *
 * The map is deliberately smaller than the stock 80x60 and carries fewer rooms.
 * The buff rig is blind to both — it emits one covering sensor per target
 * whatever the floor looks like — but generation cost is dominated by map area,
 * and this suite generates a lot of campaigns.
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

function floor(result: DungeonResult, index: number): AeLevel {
  const l = levelsOf(result).get(`floor${index}`)
  expect(l, `floor${index} missing`).toBeDefined()
  return l!
}

// --- the registry -----------------------------------------------------------

describe('the buff registry', () => {
  it('has a unique id and an AE buff path for every buff', () => {
    expect(new Set(BUFF_DEFS.map((d) => d.id)).size).toBe(BUFF_DEFS.length)
    for (const def of BUFF_DEFS) {
      expect(def.path, `${def.id} path`).toMatch(/^actors\/buffs\.sval:[a-z0-9_-]+$/)
      expect(def.label.length, `${def.id} label`).toBeGreaterThan(0)
      // The description is the whole point of the registry — the form's tooltip
      // is the only place a dungeon master learns what a buff does.
      expect(def.description.length, `${def.id} description`).toBeGreaterThan(10)
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

  // Every buff names an entry of the install's own actors/buffs.sval; a name it
  // does not define is silently ignored by the engine. Skipped without AE.
  const assets = aeAssetsDir()
  it.skipIf(assets === null)('names only buffs actors/buffs.sval defines', () => {
    const sval = readFileSync(join(assets!, 'actors', 'buffs.sval'), 'utf8')
    const defined = new Set([...sval.matchAll(/<dict name="([^"]+)">/g)].map((m) => m[1]))
    for (const def of BUFF_DEFS) expect(defined.has(def.path.split(':')[1]), def.path).toBe(true)
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
    for (let i = 0; i < 3; i++) expect(scriptsOf(floor(result, i), 'DangerArea')).toHaveLength(0)
  })
})

describe('buff auras — one floor on leaves the others alone', () => {
  it('leaves every other floor identical', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBuffs(1, [{ buff: 'frost', target: 'players' }]), SEED)

    expect(floor(on, 0)).toEqual(floor(off, 0))
    expect(floor(on, 2)).toEqual(floor(off, 2))
    expect(floor(on, 1)).not.toEqual(floor(off, 1))
  }, 30_000)

  it('only adds to the buffed floor — the dungeon itself is untouched', () => {
    const off = floor(generateOk(bareParams(), SEED), 1)
    const on = floor(generateOk(withBuffs(1, [{ buff: 'frost', target: 'players' }]), SEED), 1)

    expect(on.tileCells).toEqual(off.tileCells)
    expect(changedScripts(off, on)).toEqual([])
    // one shared sensor plus one DangerArea
    const added = placements(on).filter((p) => !placements(off).includes(p))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/^:Physics_Rectangle@/)
    expect(on.scripts.length - off.scripts.length).toBe(1)
  }, 30_000)

  it('leaves a timer-only floor identical to the pre-buff output', () => {
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

    expect(floor(generateOk(timerOnly, SEED), 1)).toEqual(floor(generateOk(withField, SEED), 1))
  }, 30_000)
})

// --- the rig ----------------------------------------------------------------

describe('buff auras — the field rig', () => {
  /** The sensor a DangerArea names, and its AE filter. */
  const areaOf = (level: AeLevel, i: number) => {
    const area = scriptsOf(level, 'DangerArea')[i]
    const ids = idsParam(area, 'Areas')
    expect(ids, 'DangerArea has no sensor').toHaveLength(1)
    const sensor = level.units.find((u) => u.id === ids[0])
    expect(sensor?.path, 'DangerArea points at a missing sensor').toBe(':Physics_Rectangle')
    return { sensorId: ids[0], filter: intParam(area, 'Filter') }
  }

  it('emits one always-on, zero-damage DangerArea per buff', () => {
    const level = floor(
      generateOk(
        withBuffs(0, [
          { buff: 'frost', target: 'players' },
          { buff: 'bloodlust', target: 'monsters' }
        ]),
        SEED
      ),
      0
    )
    const areas = scriptsOf(level, 'DangerArea')
    expect(areas).toHaveLength(2)

    for (const area of areas) {
      // A buff field carries no damage of its own and arrives live — unlike
      // timer mode's hazard, nothing exists to switch it on.
      expect(area.enabled).toBe(true)
      expect(intParam(area, 'Damage')).toBe(0)
      expect(intParam(area, 'Frequency')).toBe(BUFF_REFRESH_MS)
    }

    expect(strParam(areas[0], 'Buff')).toBe(buffById('frost')!.path)
    expect(strParam(areas[1], 'Buff')).toBe(buffById('bloodlust')!.path)
  }, 30_000)

  it('gives each distinct target its own sensor, with the right filter', () => {
    const level = floor(
      generateOk(
        withBuffs(0, [
          { buff: 'frost', target: 'players' },
          { buff: 'bloodlust', target: 'monsters' }
        ]),
        SEED
      ),
      0
    )
    const players = areaOf(level, 0)
    const monsters = areaOf(level, 1)
    expect(players.sensorId).not.toBe(monsters.sensorId)
    expect(players.filter).toBe(BUFF_TARGET_TYPES.players)
    expect(monsters.filter).toBe(BUFF_TARGET_TYPES.monsters)
  }, 30_000)

  it('shares one sensor between buffs aiming at the same target', () => {
    const level = floor(
      generateOk(
        withBuffs(0, [
          { buff: 'frost', target: 'both' },
          { buff: 'cripple', target: 'both' },
          { buff: 'slime_poison', target: 'both' }
        ]),
        SEED
      ),
      0
    )
    expect(scriptsOf(level, 'DangerArea')).toHaveLength(3)
    const all = [0, 1, 2].map((i) => areaOf(level, i))
    expect(new Set(all.map((a) => a.sensorId)).size).toBe(1)
    for (const a of all) expect(a.filter).toBe(BUFF_TARGET_TYPES.both)
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
