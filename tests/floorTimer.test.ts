/**
 * Timer mode — the per-floor timed hazard (src/generator/timer/hazard.ts).
 *
 * Two things are being proved here. First, invariant 6: the feature is optional,
 * so a campaign with every floor's timer off must be indistinguishable from one
 * generated before the feature existed, and switching one floor on must leave
 * every other floor untouched. Second, the rig itself: the right nodes, wired
 * the right way round, with the countdown landing on the same millisecond the
 * hazard arms.
 */

import { describe, expect, it } from 'vitest'
import { defaultFloorTimer, defaultParameters } from '../src/generator/config/parameters'
import type { FloorTimer } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
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
 * dungeon floors. Same isolation discipline as lobby.test.ts — `plainParameters()`
 * ships no lobbies, but the boss and one tweak default on and are switched off
 * here too.
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

// --- invariant 6: off means off --------------------------------------------

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
    const xml = levelXml(generateOk(bareParams(), SEED), 0)
    expect(nodesOfType(xml, 'DangerArea')).toHaveLength(0)
  }, 30_000)
})

describe('timer mode — one floor on leaves the others alone', () => {
  it('moves no other floor, and no floor walls or rooms at all', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withTimerOn(1), SEED)

    for (const i of [0, 2]) {
      expect(levelXml(on, i)).toBe(levelXml(off, i))
    }
    // the geometry of every floor, including the one that got the rig
    expect(on.levels).toEqual(off.levels)
  }, 30_000)

  it('appends to the armed floor without moving one existing id or tile', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withTimerOn(1), SEED)
    const offXml = levelXml(off, 1)
    const onXml = levelXml(on, 1)

    const sectionOf = (xml: string, name: string): string | undefined =>
      new RegExp(`<dictionary name="${name}">[\\s\\S]*?\\n\\t</dictionary>`).exec(xml)?.[0]
    for (const section of ['tilemap', 'doodads', 'actors', 'items']) {
      expect(sectionOf(onXml, section), section).toBe(sectionOf(offXml, section))
    }

    // ids are one monotonic counter per level, so the rig may only extend it —
    // but the scripting section sits mid-document, so the new ids appear before
    // the items and lighting sections rather than at the tail.
    const offIds = allIds(offXml)
    const onIds = allIds(onXml)
    const highest = Math.max(...offIds)
    expect(onIds.filter((id) => id <= highest)).toEqual(offIds)
    // shape + hazard + trigger + 6 countdown ticks (0:05..0:00) + the arm
    expect(onIds.filter((id) => id > highest)).toHaveLength(10)
  }, 30_000)
})

// --- the rig ----------------------------------------------------------------

describe('timer mode — the hazard rig', () => {
  const xml = (): string =>
    levelXml(generateOk(withTimerOn(0, { seconds: 5, damage: 7, freqMs: 250 }), SEED), 0)

  it('emits one DangerArea, disabled, with the damage and frequency asked for', () => {
    const areas = nodesOfType(xml(), 'DangerArea')
    expect(areas).toHaveLength(1)
    expect(areas[0].body).toContain('<bool name="enabled">False</bool>')
    expect(intParam(areas[0].body, 'damage')).toBe(7)
    expect(intParam(areas[0].body, 'freq')).toBe(250)
    // empty, not absent: the shipped campaign/levels/level_2.xml writes it this
    // way for a pure-damage field, and buff choice is a later feature
    expect(areas[0].body).toContain('<string name="buff"></string>')
  }, 30_000)

  it('covers the whole map and admits players only', () => {
    const params = withTimerOn(0)
    const shapes = nodesOfType(levelXml(generateOk(params, SEED), 0), 'RectangleShape')
    const covering = shapes.filter((s) => intParam(s.body, 'types') === 1)
    expect(covering).toHaveLength(1)
    const wide = /<float name="w">([\d.]+)<\/float>/.exec(covering[0].body)
    const tall = /<float name="h">([\d.]+)<\/float>/.exec(covering[0].body)
    expect(Number(wide?.[1])).toBeGreaterThanOrEqual(params.mapWidth)
    expect(Number(tall?.[1])).toBeGreaterThanOrEqual(params.mapHeight)
  }, 30_000)

  it('arms the hazard from a LevelLoaded trigger with a state-0 ToggleElement', () => {
    const level = xml()
    const hazard = nodesOfType(level, 'DangerArea')[0]

    const arm = nodesOfType(level, 'ToggleElement').find(
      (n) => (intArr(n.body, 'static') ?? []).includes(hazard.id) && intParam(n.body, 'state') === 0
    )
    expect(arm, 'no ToggleElement{state:0} points at the DangerArea').toBeDefined()

    const triggers = nodesOfType(level, 'GlobalEventTrigger').filter((n) =>
      n.body.includes('<string name="parameters">LevelLoaded</string>')
    )
    expect(triggers).toHaveLength(1)

    // the arm fires at the end of the countdown, not at delay 0
    const connections = intArr(triggers[0].body, 'connections') ?? []
    const delays = intArr(triggers[0].body, 'connection-delays') ?? []
    expect(delays[connections.indexOf((arm as { id: number }).id)]).toBe(5000)
  }, 30_000)

  it('ticks the countdown down one node per second, inclusive of 0:00', () => {
    const level = levelXml(generateOk(withTimerOn(0, { seconds: 65 }), SEED), 0)
    const texts = nodesOfType(level, 'AnnounceText')
      .map((n) => /<string name="text">([^<]*)<\/string>/.exec(n.body)?.[1])
      .filter((t) => t !== undefined && /^\d+:\d\d$/.test(t))
    expect(texts).toEqual(
      Array.from({ length: 66 }, (_, i) => {
        const remaining = 65 - i
        return `${Math.trunc(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      })
    )
  }, 30_000)

  it('emits no announce nodes when the countdown is off, but still arms', () => {
    const level = levelXml(generateOk(withTimerOn(0, { countdown: false }), SEED), 0)
    const ticks = nodesOfType(level, 'AnnounceText').filter((n) =>
      /<string name="text">\d+:\d\d<\/string>/.test(n.body)
    )
    expect(ticks).toHaveLength(0)
    expect(nodesOfType(level, 'DangerArea')).toHaveLength(1)
    const trigger = nodesOfType(level, 'GlobalEventTrigger')[0]
    expect(intArr(trigger.body, 'connection-delays')).toEqual([5000])
  }, 30_000)

  it('round-trips a negative damage — the healing case', () => {
    const level = levelXml(generateOk(withTimerOn(0, { damage: -5 }), SEED), 0)
    expect(intParam(nodesOfType(level, 'DangerArea')[0].body, 'damage')).toBe(-5)
  }, 30_000)

  it('ships no empty int-arr for LevelPacker to choke on', () => {
    expect(badIntArray(xml())).toBeNull()
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
    expect(nodesOfType(levelXml(result, 0), 'DangerArea')).toHaveLength(1)
    expect(nodesOfType(levelXml(result, 1), 'DangerArea')).toHaveLength(0)
    expect(nodesOfType(levelXml(result, 2), 'DangerArea')).toHaveLength(1)
  }, 30_000)
})

// --- validation -------------------------------------------------------------

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
    expect(check({ seconds: 300 }).warnings.map((w) => w.field)).toContain('levelTimers.0.countdown')
    expect(check({ seconds: 300, countdown: false }).warnings.map((w) => w.field)).not.toContain(
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
