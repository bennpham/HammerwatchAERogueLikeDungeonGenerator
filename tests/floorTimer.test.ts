/**
 * Timer mode — the per-floor timed hazard (src/generator/timer/hazard.ts).
 *
 * Two things are being proved here. First, invariant 6: the feature is optional,
 * so a campaign with every floor's timer off must be indistinguishable from one
 * generated before the feature existed, and switching one floor on must leave
 * every other floor untouched. Second, the rig itself: the right scripts, wired
 * the right way round, with the countdown landing on the same millisecond the
 * hazard arms.
 */

import { describe, expect, it } from 'vitest'
import { defaultFloorTimer } from '../src/generator/config/parameters'
import type { FloorTimer } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import type { AeLevel } from '../src/generator/ae/model'
import {
  changedScripts,
  firedBy,
  generateOk,
  idsParam,
  intParam,
  levelsOf,
  placements,
  scriptsOf,
  sensorSizePx,
  strParam,
  textsOf,
  unitById
} from './ae'
import { plainParameters } from './params'

const SEED = 4242

/**
 * Stock parameters with the optional layers off, so the file list is just the
 * dungeon floors.
 */
function bareParams(): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  params.levelTimers = Array.from({ length: 3 }, () => defaultFloorTimer())
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

/** `bareParams()` with floor `index`'s timer switched on and patched. */
function withTimerOn(index: number, patch: Partial<FloorTimer> = {}): DungeonParameters {
  const params = bareParams()
  const timers = params.levelTimers as FloorTimer[]
  timers[index] = { ...defaultFloorTimer(), enabled: true, seconds: 5, ...patch }
  return params
}

function floor(result: DungeonResult, index: number): AeLevel {
  const l = levelsOf(result).get(`floor${index}`)
  expect(l, `floor${index} missing`).toBeDefined()
  return l!
}

const COUNTDOWN = /^\d+:\d\d$/

describe('timer mode — off means off', () => {
  it('every floor off matches a campaign with no levelTimers field at all, across seeds', () => {
    for (const seed of [1, 4242, 987654]) {
      const off = generateOk(bareParams(), seed)
      const legacy = bareParams()
      delete legacy.levelTimers
      const before = generateOk(legacy, seed)
      expect(off.files).toEqual(before.files)
      expect(off.levels).toEqual(before.levels)
    }
  }, 60_000)

  it('a floor whose timer is off emits no DangerArea', () => {
    expect(scriptsOf(floor(generateOk(bareParams(), SEED), 0), 'DangerArea')).toHaveLength(0)
  }, 30_000)
})

describe('timer mode — one floor on leaves the others alone', () => {
  it('moves no other floor, and no floor walls or rooms at all', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withTimerOn(1), SEED)
    for (const i of [0, 2]) expect(floor(on, i)).toEqual(floor(off, i))
    expect(on.levels).toEqual(off.levels)
  }, 30_000)

  it('adds to the armed floor without changing one existing script or moving any unit', () => {
    const off = floor(generateOk(bareParams(), SEED), 1)
    const on = floor(generateOk(withTimerOn(1), SEED), 1)
    expect(on.tileCells).toEqual(off.tileCells)
    expect(changedScripts(off, on)).toEqual([])
    // the covering sensor is the one new unit
    const added = placements(on).filter((p) => !placements(off).includes(p))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/^:Physics_Rectangle@/)
    // DangerArea + LevelLoaded link + 6 ticks (0:05..0:00) + the arming toggle
    expect(on.scripts.length - off.scripts.length).toBe(9)
  }, 30_000)
})

describe('timer mode — the hazard rig', () => {
  const armed = (): AeLevel => floor(generateOk(withTimerOn(0, { seconds: 5, damage: 7, freqMs: 250 }), SEED), 0)

  it('emits one DangerArea, disabled, with the damage and frequency asked for', () => {
    const areas = scriptsOf(armed(), 'DangerArea')
    expect(areas).toHaveLength(1)
    expect(areas[0].enabled).toBe(false)
    expect(intParam(areas[0], 'Damage')).toBe(7)
    expect(intParam(areas[0], 'Frequency')).toBe(250)
    expect(strParam(areas[0], 'Buff')).toBeUndefined()
  }, 30_000)

  it('covers the whole map and admits players only', () => {
    const params = withTimerOn(0)
    const level = floor(generateOk(params, SEED), 0)
    const [area] = scriptsOf(level, 'DangerArea')
    expect(intParam(area, 'Filter')).toBe(2)
    const [sensorId] = idsParam(area, 'Areas')
    const size = sensorSizePx(unitById(level, sensorId)!)!
    expect(size[0]).toBeGreaterThanOrEqual(params.mapWidth * 16)
    expect(size[1]).toBeGreaterThanOrEqual(params.mapHeight * 16)
  }, 30_000)

  it('arms the hazard from a level-load link, enabling it when the clock runs out', () => {
    const level = armed()
    const [hazard] = scriptsOf(level, 'DangerArea')
    const links = scriptsOf(level, 'ScriptLink').filter((s) => s.executeOnStart)
    const fired = links.flatMap((l) => firedBy(level, l))
    const arm = fired.find(({ script }) => script.cls === 'ToggleScripts' && idsParam(script, 'Scripts').includes(hazard.id))
    expect(arm, 'no ToggleScripts enables the DangerArea').toBeDefined()
    // AE ToggleScripts: State 1 enables
    expect(intParam(arm!.script, 'State')).toBe(1)
    expect(arm!.delayMs).toBe(5000)
  }, 30_000)

  it('ticks the countdown down one script per second, inclusive of 0:00', () => {
    const level = floor(generateOk(withTimerOn(0, { seconds: 65 }), SEED), 0)
    expect(textsOf(level).filter((t) => COUNTDOWN.test(t))).toEqual(
      Array.from({ length: 66 }, (_, i) => {
        const remaining = 65 - i
        return `${Math.trunc(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      })
    )
  }, 30_000)

  it('emits no countdown when it is off, but still arms', () => {
    const level = floor(generateOk(withTimerOn(0, { countdown: false }), SEED), 0)
    expect(textsOf(level).filter((t) => COUNTDOWN.test(t))).toHaveLength(0)
    expect(scriptsOf(level, 'DangerArea')).toHaveLength(1)
    const [hazard] = scriptsOf(level, 'DangerArea')
    const arms = scriptsOf(level, 'ToggleScripts').filter((s) => idsParam(s, 'Scripts').includes(hazard.id))
    expect(arms).toHaveLength(1)
  }, 30_000)

  it('round-trips a negative damage — the healing case', () => {
    const level = floor(generateOk(withTimerOn(0, { damage: -5 }), SEED), 0)
    expect(intParam(scriptsOf(level, 'DangerArea')[0], 'Damage')).toBe(-5)
  }, 30_000)

  it('is deterministic — the same seed twice is byte-identical', () => {
    const params = withTimerOn(1, { seconds: 30, damage: -2, freqMs: 750 })
    expect(generateOk(params, SEED).files).toEqual(generateOk(params, SEED).files)
  }, 30_000)

  it('arms every floor that asks for it, and only those', () => {
    const params = bareParams()
    const timers = params.levelTimers as FloorTimer[]
    timers[0] = { ...defaultFloorTimer(), enabled: true, seconds: 3 }
    timers[2] = { ...defaultFloorTimer(), enabled: true, seconds: 4, damage: -1 }
    const result = generateOk(params, SEED)
    expect(scriptsOf(floor(result, 0), 'DangerArea')).toHaveLength(1)
    expect(scriptsOf(floor(result, 1), 'DangerArea')).toHaveLength(0)
    expect(scriptsOf(floor(result, 2), 'DangerArea')).toHaveLength(1)
  }, 30_000)
})

describe('timer mode — validation', () => {
  const check = (patch: Partial<FloorTimer>) => validateParameters(withTimerOn(0, patch))

  it('accepts the stock enabled timer', () => {
    expect(check({}).errors).toEqual([])
  })

  it('rejects a zero, fractional or over-long countdown', () => {
    for (const seconds of [0, -30, 1.5, 3601]) {
      expect(check({ seconds }).errors.map((e) => e.field)).toContain('levelTimers.0.seconds')
    }
  })

  it('rejects a frequency outside 50..600000ms', () => {
    for (const freqMs of [0, 49, 600_001, 100.5]) {
      expect(check({ freqMs }).errors.map((e) => e.field)).toContain('levelTimers.0.freqMs')
    }
  })

  it('rejects fractional or absurd damage but allows the negative half of the range', () => {
    for (const damage of [1.5, 10_001, -10_001]) {
      expect(check({ damage }).errors.map((e) => e.field)).toContain('levelTimers.0.damage')
    }
    expect(check({ damage: -10_000 }).errors).toEqual([])
  })

  it('leaves a disabled floor nonsense values alone', () => {
    const params = bareParams()
    ;(params.levelTimers as FloorTimer[])[0] = {
      enabled: false,
      seconds: -1,
      damage: 1.5,
      freqMs: 0,
      countdown: true
    }
    expect(validateParameters(params).errors).toEqual([])
  })

  it('warns about a timer that does nothing', () => {
    const result = check({ damage: 0 })
    expect(result.errors).toEqual([])
    expect(result.warnings.map((w) => w.field)).toContain('levelTimers.0.damage')
  })

  it('warns about a countdown long enough to bloat the level file', () => {
    // five minutes is the clock presets' hunt and stays quiet; a second more warns
    expect(check({ seconds: 300 }).warnings.map((w) => w.field)).not.toContain('levelTimers.0.countdown')
    expect(check({ seconds: 301 }).warnings.map((w) => w.field)).toContain('levelTimers.0.countdown')
    expect(check({ seconds: 301, countdown: false }).warnings.map((w) => w.field)).not.toContain(
      'levelTimers.0.countdown'
    )
  })

  it('warns about entries past the floor count', () => {
    const params = withTimerOn(0)
    ;(params.levelTimers as FloorTimer[]).push(defaultFloorTimer())
    expect(validateParameters(params).warnings.map((w) => w.field)).toContain('levelTimers')
  })

  it('stays quiet when every floor is off, however long the array', () => {
    const params = bareParams()
    ;(params.levelTimers as FloorTimer[]).push(defaultFloorTimer(), defaultFloorTimer())
    const result = validateParameters(params)
    expect(result.errors).toEqual([])
    expect(result.warnings.filter((w) => w.field.startsWith('levelTimers'))).toEqual([])
  })
})
