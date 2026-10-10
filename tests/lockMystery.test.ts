/**
 * Enhanced lock buttons — up to N of a locked floor's own `BossDoorButton`
 * plates ALSO fire a mystery payload, drawn from the same campaign-wide pool
 * `mystery/` uses, on top of counting toward the lock as they always have.
 * Plus the optional per-floor disguise: draw the lock buttons with the
 * mystery plate's own art and state.
 *
 * Proved here:
 *
 *   - the accessors (`floorLockMystery`, `floorLockDisguised`) return the
 *     documented undefined/clamped/pass-through shapes;
 *   - off means off: absent config, or config on an unlocked floor, is
 *     byte-identical to no enhancement at all;
 *   - the draw order: Phase C/D (the enhancement) run strictly after every
 *     ordinary mystery draw on the floor, so arming it moves no earlier
 *     floor and none of this floor's own ordinary plates — only a LATER
 *     floor's mysteryRand draws;
 *   - the rig: an enhanced button's trigger gains the payload's nodes while
 *     keeping its ChangeVariable/CheckVariable lock wiring; an unenhanced
 *     button (beyond `count`) gains nothing;
 *   - the disguise swaps only the plate unit (and its anchor) and the
 *     SetUnitScene state — nothing else in the floor moves.
 */

import { describe, expect, it } from 'vitest'
import {
  defaultFloorLock,
  defaultFloorLockMystery,
  defaultFloorTraps,
  floorLockButtons,
  floorLockDisguised,
  floorLockMystery,
  MAX_LOCK_BUTTONS
} from '../src/generator/config/parameters'
import type { DungeonParameters, FloorLockMystery } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { Level } from '../src/generator/map/level'
import { LOCK_PAYLOAD_ANNOUNCE_TYPE, buildMysteryButtonRig } from '../src/generator/mystery/rig'
import type { NodeAnnounceText } from '../src/generator/objects/nodes'
import type { AeLevel } from '../src/generator/ae/model'
import { changedScriptsBeyondAppends, levelsOf, placements, scriptsOf, textsOf } from './ae'
import { plainParameters } from './params'
import { samplePool } from './mysterySample'

const SEED = 4242

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

function floor(result: DungeonResult, index: number): AeLevel {
  const l = levelsOf(result).get(`floor${index}`)
  expect(l, `floor${index} missing`).toBeDefined()
  return l!
}

/** Plain floors, boss off, lock array present-but-empty — a neutral base to lock and arm. */
function bareParams(floors = 4): DungeonParameters {
  const params = plainParameters()
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelTimers = undefined
  params.levelTraps = Array.from({ length: floors }, () => defaultFloorTraps())
  params.levelLock = Array.from({ length: floors }, () => defaultFloorLock())
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

function lock(params: DungeonParameters, index: number, buttons: number): void {
  params.levelLock![index] = { enabled: true, buttons }
}

function enhance(params: DungeonParameters, index: number, entry: FloorLockMystery): void {
  const floors = params.levelLockMystery ?? Array.from({ length: params.levels }, () => defaultFloorLockMystery())
  floors[index] = entry
  params.levelLockMystery = floors
}

/** One accepted floor in isolation, built the way the floor loop builds it. */
function buildFloor(params: DungeonParameters, seed: number, levelIndex: number): { ctx: GenerationContext; level: Level } {
  const ctx = new GenerationContext(params, seed)
  ctx.gateway = { kind: 'orb' }
  ctx.floorLockButtons = floorLockButtons(params, levelIndex)
  ctx.floorLocked = ctx.floorLockButtons > 0
  ctx.floorLockDisguise = floorLockDisguised(params, levelIndex)
  let level: Level | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new Level(ctx, levelIndex)
    if (candidate.levelValid) {
      level = candidate
      break
    }
    ctx.clearLevel()
  }
  expect(level, `no valid level at seed ${seed}`).not.toBeNull()
  return { ctx, level: level as Level }
}

describe('enhanced lock buttons — accessors', () => {
  it('floorLockMystery is undefined off an unlocked floor, however it is configured', () => {
    const params = bareParams()
    params.mysteryButtons = samplePool()
    enhance(params, 0, { count: 3, pool: [0, 1] })
    expect(floorLockButtons(params, 0)).toBe(0)
    expect(floorLockMystery(params, 0)).toBeUndefined()
  })

  it('is undefined with no entry, a zero count, or only dangling pool indices', () => {
    const params = bareParams()
    lock(params, 0, 3)
    params.mysteryButtons = samplePool()
    expect(floorLockMystery(params, 0)).toBeUndefined() // no levelLockMystery at all

    enhance(params, 0, { count: 0, pool: [0, 1] })
    expect(floorLockMystery(params, 0)).toBeUndefined()

    enhance(params, 0, { count: 2, pool: [] })
    expect(floorLockMystery(params, 0)).toBeUndefined()

    enhance(params, 0, { count: 2, pool: [99] }) // past the 4-entry sample pool
    expect(floorLockMystery(params, 0)).toBeUndefined()
  })

  it('clamps count to the floor\'s own button count and keeps disguise as given', () => {
    const params = bareParams()
    lock(params, 0, 2)
    params.mysteryButtons = samplePool()
    enhance(params, 0, { count: 15, pool: [0, 2], disguise: true })
    expect(floorLockMystery(params, 0)).toEqual({ count: 2, pool: [0, 2], disguise: true })
  })

  it('floorLockDisguised is true only when the floor is locked AND disguise is set', () => {
    const params = bareParams()
    enhance(params, 0, { count: 0, pool: [], disguise: true })
    expect(floorLockDisguised(params, 0)).toBe(false) // not locked

    lock(params, 0, 1)
    expect(floorLockDisguised(params, 0)).toBe(true)

    enhance(params, 0, { count: 0, pool: [] }) // disguise absent
    expect(floorLockDisguised(params, 0)).toBe(false)
  })
})

describe('enhanced lock buttons — off means off', () => {
  it('an absent levelLockMystery and an all-empty one generate byte-identical output', () => {
    for (const seed of [1, SEED, 987654]) {
      const params = bareParams()
      lock(params, 2, 3)
      params.mysteryButtons = samplePool()
      const off = generateOk(params, seed)

      const zeroed = { ...params }
      zeroed.levelLockMystery = Array.from({ length: params.levels }, () => defaultFloorLockMystery())
      expect(generateOk(zeroed, seed).files).toEqual(off.files)
    }
  })

  it('configuring enhancements on an unlocked floor changes nothing', () => {
    const params = bareParams()
    params.mysteryButtons = samplePool()
    const off = generateOk(params, SEED)

    const withConfig = bareParams()
    withConfig.mysteryButtons = samplePool()
    enhance(withConfig, 1, { count: 5, pool: [0, 1, 2] })
    expect(generateOk(withConfig, SEED).files).toEqual(off.files)
  })

  it('draws from no stream and allocates no id when unconfigured', () => {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    const control = buildFloor(params, SEED, 1)
    const subject = buildFloor(params, SEED, 1)
    buildMysteryButtonRig(subject.ctx, params, subject.level, 1)
    expect(subject.ctx.idCounter).toBe(control.ctx.idCounter)
    for (const stream of ['rand', 'cosmeticRand', 'bossRand', 'trapRand', 'floorBossRand', 'mysteryRand'] as const) {
      const a = Array.from({ length: 8 }, () => control.ctx[stream].iRand(0, 1_000_000))
      const b = Array.from({ length: 8 }, () => subject.ctx[stream].iRand(0, 1_000_000))
      expect(b, `${stream} moved`).toEqual(a)
    }
  })
})

describe('enhanced lock buttons — draw order', () => {
  it('moves no earlier floor, and none of this floor\'s own plates, only a later floor\'s mystery draws', () => {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    params.levelMystery = Array.from({ length: params.levels }, () => ({ count: 0, pool: [] }))
    params.levelMystery[2] = { count: 4, pool: [0] } // a later floor's ordinary plates

    const off = generateOk(params, SEED)

    const on = { ...params }
    enhance(on, 1, { count: 1, pool: [0] })
    const onResult = generateOk(on, SEED)

    // Floor 0, before the locked floor: untouched.
    expect(floor(onResult, 0)).toEqual(floor(off, 0))
    // Floor 3, after everything and unconfigured itself: untouched.
    expect(floor(onResult, 3)).toEqual(floor(off, 3))
    // Floor 2's mystery plates come after floor 1 in the floor loop, so
    // arming floor 1's enhancement moves floor 2's own mysteryRand draws.
    expect(floor(onResult, 2)).not.toEqual(floor(off, 2))

    // Floor 1 itself only gained things — its own lock buttons kept their tiles.
    const before = floor(off, 1)
    const after = floor(onResult, 1)
    expect(changedScriptsBeyondAppends(before, after)).toEqual([])
    const kept = placements(after)
    for (const pl of placements(before)) {
      const at = kept.indexOf(pl)
      expect(at, pl).toBeGreaterThanOrEqual(0)
      kept.splice(at, 1)
    }
  })

  it('is deterministic', () => {
    const params = bareParams()
    lock(params, 1, 3)
    params.mysteryButtons = samplePool()
    enhance(params, 1, { count: 2, pool: [0, 1, 2, 3] })
    expect(generateOk(params, SEED).files).toEqual(generateOk(params, SEED).files)
  })

  it('a count above the floor\'s buttons enhances all of them and still generates', () => {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    enhance(params, 1, { count: MAX_LOCK_BUTTONS - 1, pool: [0] })
    expect(validateParameters(params).warnings.map((w) => w.field)).toContain('levelLockMystery.1.count')
    // Both buttons enhanced: two "You got treasure" announces (button 0 is
    // the sample pool's Treasure entry).
    expect(textsOf(floor(generateOk(params, SEED), 1)).filter((t) => t === 'You got treasure')).toHaveLength(2)
  })
})

describe('enhanced lock buttons — the rig', () => {
  it('adds the payload to the first N buttons\' triggers and leaves the rest alone', () => {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    enhance(params, 1, { count: 1, pool: [0] }) // sample pool 0: Treasure — loot + text, no traps

    const { ctx, level } = buildFloor(params, SEED, 1)
    expect(level.lockButtons).toHaveLength(2)
    const [enhancedButton, otherButton] = level.lockButtons
    const classes = (t: typeof enhancedButton.trigger) => t.connections.map((c) => c.node.cls)
    const beforeTypes = { a: classes(enhancedButton.trigger), b: classes(otherButton.trigger) }
    // Before the rig runs, both buttons already carry the lock's own wiring:
    // PlaySound, the press, and the countdown's ChangeVariables/CheckVariables.
    expect(beforeTypes.a).toEqual(expect.arrayContaining(['PlaySound', 'SetUnitScene', 'ChangeVariables', 'CheckVariables']))
    expect(beforeTypes.b).toEqual(beforeTypes.a)

    buildMysteryButtonRig(ctx, params, level, 1)

    const afterA = classes(enhancedButton.trigger)
    const afterB = classes(otherButton.trigger)

    // The enhanced button kept every original connection, in order, and
    // gained the payload's nodes after them.
    expect(afterA.slice(0, beforeTypes.a.length)).toEqual(beforeTypes.a)
    expect(afterA.filter((t) => t === 'AnnounceText')).toHaveLength(1)
    expect(afterA.filter((t) => t === 'SpawnUnit')).toHaveLength(5) // 3 chests + 2 upgrades

    // Its text is a Pickup line on the plate, local to whoever pressed it.
    const announce = enhancedButton.trigger.connections.find((c) => c.node.cls === 'AnnounceText')!.node as NodeAnnounceText
    expect(announce.textType).toBe(LOCK_PAYLOAD_ANNOUNCE_TYPE)
    expect(LOCK_PAYLOAD_ANNOUNCE_TYPE).toBe(3)
    expect([announce.x, announce.y]).toEqual([enhancedButton.trigger.x, enhancedButton.trigger.y])

    // The un-enhanced button is untouched.
    expect(afterB).toEqual(beforeTypes.b)
  })

  it('an enhanced button\'s traps place spewers and count toward the lock unchanged', () => {
    // The button's room may occasionally have no wall slot for the trap's
    // directions; try a few seeds and require at least one to place spewers,
    // the same tolerance mystery.test.ts's own seal check uses.
    let checked = false
    for (let seed = 1; seed <= 20 && !checked; seed++) {
      const params = bareParams()
      lock(params, 1, 1)
      params.mysteryButtons = samplePool()
      enhance(params, 1, { count: 1, pool: [3] }) // sample pool 3: Trap room

      const level = floor(generateOk(params, seed), 1)
      // Single-button lock: the press still opens the wall directly.
      expect(textsOf(level)).toContain('The way to the final room has opened!')
      if (scriptsOf(level, 'ProjectileSpewer').length > 0) checked = true
    }
    expect(checked).toBe(true)
  })

  it('a lock button\'s tile is still avoided by ordinary mystery plates, disguised or not', () => {
    for (const disguise of [false, true]) {
      const params = bareParams()
      lock(params, 0, 1)
      if (disguise) enhance(params, 0, { count: 0, pool: [], disguise: true })
      params.mysteryButtons = samplePool()
      params.levelMystery = Array.from({ length: params.levels }, () => ({ count: 0, pool: [] }))
      params.levelMystery[0] = { count: 30, pool: [1] } // dud button, spam plates to force proximity checks

      const { ctx, level } = buildFloor(params, SEED, 0)
      const before = ctx.doodads.length // exclude any disguised lock button already placed
      buildMysteryButtonRig(ctx, params, level, 0)
      const plates = ctx.doodads.slice(before).filter((d) => d.type === 'TriggerButton')
      for (const button of level.lockButtons) {
        for (const p of plates) {
          const gap = Math.max(Math.abs(p.x - button.x), Math.abs(p.y - button.y))
          expect(gap).toBeGreaterThan(3)
        }
      }
    }
  })
})

describe('enhanced lock buttons — disguise', () => {
  it('swaps only the doodad path and the pressed state; the tilemap and every id stay put', () => {
    const params = bareParams()
    lock(params, 1, 2)
    const off = generateOk(params, SEED)

    const disguised = bareParams()
    lock(disguised, 1, 2)
    enhance(disguised, 1, { count: 0, pool: [], disguise: true })
    const on = generateOk(disguised, SEED)

    const offLevel = floor(off, 1)
    const onLevel = floor(on, 1)
    const BOSS_PLATE = 'doodads/doors/boss_door_button.unit'
    const ROUND_PLATE = 'doodads/generic/button_round.unit'
    const has = (l: AeLevel, path: string) => l.units.some((u) => u.path === path)

    expect(has(offLevel, BOSS_PLATE)).toBe(true)
    expect(has(offLevel, ROUND_PLATE)).toBe(false)
    expect(has(onLevel, ROUND_PLATE)).toBe(true)
    expect(has(onLevel, BOSS_PLATE)).toBe(false)

    // the same ids, the same tiles, the same scripts — only the plate's art,
    // its anchor (button_round is centred, boss_door_button top-left) and the
    // scene it is driven to differ
    const normalize = (l: AeLevel) =>
      JSON.stringify({
        tiles: l.tileCells,
        // AE groups units by path, so a renamed plate moves in the list: sort by id
        units: l.units
          .map((u) =>
            u.path === BOSS_PLATE || u.path === ROUND_PLATE
              ? // button_round is anchored on its centre, 8 px in from boss_door_button's corner
                { id: u.id, path: 'PLATE', x: (u.x - (u.path === ROUND_PLATE ? 8 : 0)).toFixed(2), y: (u.y - (u.path === ROUND_PLATE ? 8 : 0)).toFixed(2) }
              : u
          )
          .sort((a, b) => a.id - b.id),
        scripts: l.scripts.map((sc) =>
          sc.cls === 'SetUnitScene' ? { ...sc, params: sc.params.map((pr) => (pr.name === 'State' ? { ...pr, value: 'STATE' } : pr)) } : sc
        )
      })
    expect(normalize(onLevel)).toBe(normalize(offLevel))
  })
})

describe('enhanced lock buttons — validation', () => {
  function base(): DungeonParameters {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    return params
  }

  it('rejects a non-integer or out-of-range count', () => {
    for (const bad of [-1, 1.5, MAX_LOCK_BUTTONS + 1]) {
      const params = base()
      enhance(params, 1, { count: bad, pool: [0] })
      expect(validateParameters(params).errors.map((e) => e.field)).toContain('levelLockMystery.1.count')
    }
  })

  it('rejects a dangling pool index', () => {
    const params = base()
    enhance(params, 1, { count: 1, pool: [99] })
    expect(validateParameters(params).errors.map((e) => e.field)).toContain('levelLockMystery.1.pool')
  })

  it('rejects a positive count with an empty pool', () => {
    const params = base()
    enhance(params, 1, { count: 1, pool: [] })
    expect(validateParameters(params).errors.map((e) => e.field)).toContain('levelLockMystery.1.pool')
  })

  it('warns when count exceeds the floor\'s own button count', () => {
    const params = base()
    enhance(params, 1, { count: 2, pool: [0] }) // floor 1 has only 1 button by default (lock(params, 1, 2) sets 2 — use a smaller lock)
    lock(params, 1, 1)
    expect(validateParameters(params).warnings.map((w) => w.field)).toContain('levelLockMystery.1.count')
  })

  it('warns when enhancements or a disguise are set on an unlocked floor', () => {
    const params = base()
    enhance(params, 2, { count: 1, pool: [0] }) // floor 2 is never locked
    expect(validateParameters(params).warnings.map((w) => w.field)).toContain('levelLockMystery.2')

    const disguiseOnly = base()
    enhance(disguiseOnly, 2, { count: 0, pool: [], disguise: true })
    expect(validateParameters(disguiseOnly).warnings.map((w) => w.field)).toContain('levelLockMystery.2')
  })

  it('warns when more floors are configured than the campaign has', () => {
    const params = base()
    params.levelLockMystery = Array.from({ length: params.levels + 2 }, () => defaultFloorLockMystery())
    params.levelLockMystery[params.levels] = { count: 1, pool: [0] }
    expect(validateParameters(params).warnings.map((w) => w.field)).toContain('levelLockMystery')
  })
})

describe('enhanced lock buttons — parameters.txt', () => {
  it('round-trips the count, pool and disguise', () => {
    const params = bareParams()
    lock(params, 1, 3)
    params.mysteryButtons = samplePool()
    enhance(params, 1, { count: 2, pool: [0, 2] })
    enhance(params, 2, { count: 0, pool: [], disguise: true })
    const text = serializeParametersTxt(params)
    expect(text).toContain('mysteryLock1=2:0,2')
    expect(text).toContain('mysteryLockDisguise2=1')
    expect(text).not.toContain('mysteryLock2=') // no count/pool to write for floor 2

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelLockMystery).toEqual(params.levelLockMystery)
  })

  it('drops a dangling pool index and reports it', () => {
    const parsed = parseParametersTxt(
      ['levels=3', 'mysteryButtons=1', 'mysteryButton0Name=Only', 'mysteryLock1=2:0,9'].join('\n')
    )
    expect(parsed.params.levelLockMystery?.[1]).toEqual({ count: 2, pool: [0] })
    expect(parsed.unknownKeys).toContain('mysteryLock1 button "9"')
  })

  it('any mysteryLockN or mysteryLockDisguiseN line rebuilds the whole array from scratch', () => {
    const base = bareParams()
    lock(base, 0, 2)
    lock(base, 1, 2)
    base.mysteryButtons = samplePool()
    enhance(base, 0, { count: 1, pool: [0] })
    enhance(base, 1, { count: 1, pool: [1] })

    const text = ['levels=4', 'mysteryButtons=4', 'mysteryLock1=2:2,3'].join('\n')
    const parsed = parseParametersTxt(text, base)
    // Floor 0's old entry is gone — the file's one mysteryLockN line rebuilds
    // the whole array, the same rule mysteryFloorN follows.
    expect(parsed.params.levelLockMystery?.[0]).toEqual({ count: 0, pool: [] })
    expect(parsed.params.levelLockMystery?.[1]).toEqual({ count: 2, pool: [2, 3] })
  })

  it('a disguise-only line is not swallowed as "empty"', () => {
    const text = ['levels=2', 'mysteryLockDisguise0=1'].join('\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.params.levelLockMystery?.[0]).toEqual({ count: 0, pool: [], disguise: true })
  })

  it('writes nothing for a campaign without them, and reads nothing back', () => {
    const params = bareParams()
    lock(params, 1, 2)
    params.mysteryButtons = samplePool()
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/mysterylock/i)
    const parsed = parseParametersTxt(text)
    expect(parsed.params.levelLockMystery).toBeUndefined()
  })
})
