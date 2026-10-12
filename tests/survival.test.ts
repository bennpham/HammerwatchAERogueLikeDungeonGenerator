/**
 * Arena → Survival (issue #61) — an arena cleared by outlasting a clock instead
 * of by killing a boss.
 *
 * Four things are being proved.
 *
 * First, invariant 8's byte-identity contract, twice over: an arena left in
 * boss mode must be indistinguishable from one generated before survival mode
 * existed, and flipping ANY fight to survival must leave every dungeon floor —
 * and every EARLIER arena — byte-identical. Only the arenas after it may move,
 * which is the same thing adding or removing a fight already does.
 *
 * Second, the reason the feature exists at all: the engine fires
 * `Boss 75%/50%/25%/Died` only for an actor in the `actors/boss_*` folders, so
 * a survival arena — which places none — must emit no boss actor, no
 * `Boss Died` trigger, no invulnerability rig and no checkpoint rig, and must
 * open its alcove from the clock instead.
 *
 * Third, the rig's own wiring: each list keyed to its own timestamps, with the
 * on/off pairs landing on the right millisecond.
 *
 * Fourth, invariant 2: the trap windows are the ONLY part of the rig that
 * draws, they draw one value per PLACED spewer, and they draw nothing at all
 * when no window is usable.
 *
 * Reads the emitted XML rather than ctx, because what matters here is the
 * per-connection `connection-delays` the engine actually sees — the one thing
 * an in-memory node assertion cannot see (`ScriptNode.delaysMs` is private).
 */

import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult, SurvivalOptions } from '../src/generator'
import { defaultSurvivalOptions } from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import { serializeParametersTxt, parseParametersTxt } from '../src/generator/config/configFile'
import { countdownMarks, everySecond, milestoneSeconds } from '../src/generator/survival/clock'
import type { AeLevel, AeScript } from '../src/generator/ae/model'
import { allIds, idsParam, intParam, levelsOf, lvlText, scriptsOf, strParam, withStemPaths } from './ae'
import { arenaActorPath, resolveActorPath } from '../src/generator/objects/monsterTypes'
import { plainParameters } from './params'

const SEED = 90210

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/**
 * A small campaign with TWO arenas, so "an earlier arena never moves and a
 * later one may" is actually testable. Three floors keeps generation quick.
 */
function twoFightParams(): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  params.levelBuffs = params.levelBuffs?.slice(0, 3)
  params.levelTraps = params.levelTraps?.slice(0, 3)
  params.levelTimers = params.levelTimers?.slice(0, 3)
  params.floorMusic = params.floorMusic?.slice(0, 3)
  params.playerTweaks = {}
  const fight = params.boss.fights[0]
  params.boss = {
    ...params.boss,
    fights: [JSON.parse(JSON.stringify(fight)), JSON.parse(JSON.stringify(fight))]
  }
  return params
}

/** `twoFightParams()` with fight `index` flipped to survival and patched. */
function withSurvival(index: number, patch: Partial<SurvivalOptions> = {}): DungeonParameters {
  const params = twoFightParams()
  params.boss.fights[index] = {
    ...params.boss.fights[index],
    mode: 'survival',
    survival: { ...defaultSurvivalOptions(), seconds: 60, ...patch }
  }
  return params
}

const arenaOf = (result: DungeonResult, i: number): AeLevel => {
  const l = levelsOf(result).get(`boss${i}`)
  expect(l, `boss${i} missing`).toBeDefined()
  return l!
}
const floorOf = (result: DungeonResult, i: number): AeLevel => {
  const l = levelsOf(result).get(`floor${i}`)
  expect(l, `floor${i} missing`).toBeDefined()
  return l!
}

const firedIds = (s: AeScript): number[] => s.connections.map(([id]) => id)

/** The survival arena's one level-load link — the round's clock. */
function clockOf(level: AeLevel): AeScript {
  const clocks = scriptsOf(level, 'ScriptLink').filter((s) => s.executeOnStart)
  expect(clocks, 'expected exactly one level-load clock').toHaveLength(1)
  return clocks[0]
}

/** The delay, in ms, the clock fires script `id` at — or null when it never does. */
function delayTo(clock: AeScript, id: number): number | null {
  return clock.connections.find(([to]) => to === id)?.[1] ?? null
}

/** The ToggleScripts aimed at `id`, with their AE State (1 enable, 2 disable). */
function togglesOf(level: AeLevel, id: number): AeScript[] {
  return scriptsOf(level, 'ToggleScripts').filter((t) => idsParam(t, 'Scripts').includes(id))
}
const ENABLE = 1
const DISABLE = 2

describe('survival — the boss mode is untouched (invariant 8)', () => {
  it('an all-boss campaign is identical to one generated without the feature', () => {
    // `mode` absent and `mode: 'boss'` must produce the same bytes.
    const absent = generateOk(twoFightParams(), SEED)
    const explicit = twoFightParams()
    explicit.boss.fights = explicit.boss.fights.map((f) => ({ ...f, mode: 'boss' as const }))
    const stated = generateOk(explicit, SEED)
    expect(stated.files).toEqual(absent.files)
  }, 60_000)

  it('flipping a fight to survival leaves every dungeon floor identical', () => {
    // The arenas draw from ctx.bossRand and the floors from ctx.rand, so no
    // arena change can reach a floor however many draws it does or does not make.
    const boss = generateOk(twoFightParams(), SEED)
    const survival = generateOk(withSurvival(0), SEED)
    // a floor's exit names the arena's file, `arena_boss1` or `arena_survival1`; the floor itself is unchanged
    for (let i = 0; i < 3; i++) expect(withStemPaths(floorOf(survival, i)), `floor ${i}`).toEqual(withStemPaths(floorOf(boss, i)))
  }, 60_000)

  it('flipping the SECOND fight leaves the first arena identical', () => {
    // Fights share ctx.bossRand in list order, so fight 0 draws what it always
    // drew whatever fight 1 turns into.
    const boss = generateOk(twoFightParams(), SEED)
    const survival = generateOk(withSurvival(1), SEED)
    expect(withStemPaths(arenaOf(survival, 0))).toEqual(withStemPaths(arenaOf(boss, 0)))
  }, 60_000)

  it('is deterministic', () => {
    const params = withSurvival(0, {
      waves: [{ monster: 'bat', count: 12, atSeconds: 0, intervalMs: 1000 }],
      traps: [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 4, startSeconds: 10, endSeconds: 50 }
      ]
    })
    expect(arenaOf(generateOk(params, SEED), 0)).toEqual(arenaOf(generateOk(params, SEED), 0))
  }, 60_000)
})

describe('survival — no boss, so no boss events', () => {
  const result = () => generateOk(withSurvival(0), SEED)

  it('places no boss actor', () => {
    expect(arenaOf(result(), 0).units.some((u) => u.path.startsWith('actors/bosses/'))).toBe(false)
  }, 60_000)

  it('emits no boss trigger, no invulnerability and no save point', () => {
    const level = arenaOf(result(), 0)
    expect(scriptsOf(level, 'ActorHealthTrigger'), 'a survival arena watches no boss').toHaveLength(0)
    expect(scriptsOf(level, 'CreateBossBar')).toHaveLength(0)
    expect(scriptsOf(level, 'ToggleImmortality')).toHaveLength(0)
    expect(scriptsOf(level, 'SuperCheckPoint')).toHaveLength(0)
  }, 60_000)

  it('opens the alcove from the clock, at the round length', () => {
    const level = arenaOf(result(), 0)
    const clock = clockOf(level)
    const destroys = scriptsOf(level, 'DestroyUnits')
    expect(destroys, 'exactly one DestroyUnits opens the alcove').toHaveLength(1)
    // The same three seals the boss-death chain destroys in boss mode.
    expect(idsParam(destroys[0], 'Units')).toHaveLength(3)
    expect(delayTo(clock, destroys[0].id)).toBe(60_000)
  }, 60_000)

  it('still emits the gateway and the arrival point, with unique ids', () => {
    // Everything about the ROOM is shared with boss mode; only what opens the
    // alcove changed.
    const level = arenaOf(result(), 0)
    expect(scriptsOf(level, 'LevelStart').filter((s) => strParam(s, 'StartID') === 'boss0')).toHaveLength(1)
    expect(scriptsOf(level, 'LevelExit').length + scriptsOf(level, 'ShowGameOver').length).toBeGreaterThan(0)
    const ids = allIds(level)
    expect(new Set(ids).size, 'ids must be unique').toBe(ids.length)
  }, 60_000)
})

describe('survival — the timed rigs', () => {
  it('arms each wave row at its own timestamp, split over the nine anchors', () => {
    const params = withSurvival(0, {
      waves: [
        { monster: 'bat', count: 18, atSeconds: 0, intervalMs: 1000 },
        { monster: 'bat', count: 9, atSeconds: 30, intervalMs: 2000 }
      ]
    })
    const level = arenaOf(generateOk(params, SEED), 0)
    const clock = clockOf(level)

    const timers = scriptsOf(level, 'TimerTrigger')
    expect(timers, 'one timer per row').toHaveLength(2)
    expect(timers.map((t) => intParam(t, 'Frequency'))).toEqual([1000, 2000])

    // Each row's toggle is what the clock fires; the toggle arms the timer.
    const armDelays = timers.map((timer) => {
      const arm = togglesOf(level, timer.id).find((t) => intParam(t, 'State') === ENABLE)
      expect(arm, `nothing arms timer ${timer.id}`).toBeDefined()
      return delayTo(clock, arm!.id)
    })
    expect(armDelays).toEqual([0, 30_000])

    // 18 over 9 anchors is 2 each; 9 over 9 is 1 each.
    const shares = scriptsOf(level, 'SpawnUnit').map((s) => s.triggerTimes)
    expect(shares.filter((n) => n === 2)).toHaveLength(9)
    expect(shares.filter((n) => n === 1)).toHaveLength(9)
  }, 60_000)

  it('gives an endless row an unbounded spawner per anchor, stopped at the end', () => {
    const params = withSurvival(0, {
      waves: [
        { monster: 'bat', count: -1, atSeconds: 10, intervalMs: 1000 },
        { monster: 'bat', count: 9, atSeconds: 20, intervalMs: 2000 }
      ]
    })
    const level = arenaOf(generateOk(params, SEED), 0)
    const clock = clockOf(level)

    const timers = scriptsOf(level, 'TimerTrigger')
    expect(timers, 'one timer per row').toHaveLength(2)
    const [endlessTimer, finiteTimer] = timers

    const spawns = scriptsOf(level, 'SpawnUnit')
    const endlessSpawns = spawns.filter((s) => firedIds(endlessTimer).includes(s.id))
    expect(endlessSpawns).toHaveLength(9)
    for (const spawn of endlessSpawns) expect(spawn.triggerTimes, 'endless spawners must be unbounded').toBe(-1)

    const finiteSpawns = spawns.filter((s) => firedIds(finiteTimer).includes(s.id))
    expect(finiteSpawns).toHaveLength(9)
    expect(finiteSpawns.every((s) => s.triggerTimes === 1)).toBe(true)

    // Only the endless row is stopped, and on the same tick that opens the door.
    const stopOf = (timerId: number) => togglesOf(level, timerId).find((t) => intParam(t, 'State') === DISABLE)
    const stop = stopOf(endlessTimer.id)
    expect(stop, 'an endless row must be switched off at the end').toBeDefined()
    expect(delayTo(clock, stop!.id)).toBe(60_000)
    expect(stopOf(finiteTimer.id), 'a finite row needs no stop — trigger-times bounds it').toBeUndefined()
  }, 60_000)

  it('never scales an endless row by the arena monsterMultiplier', () => {
    const params = withSurvival(0, { waves: [{ monster: 'bat', count: -1, atSeconds: 0, intervalMs: 1000 }] })
    params.boss.fights[0].arena.monsterMultiplier = 3
    const spawns = scriptsOf(arenaOf(generateOk(params, SEED), 0), 'SpawnUnit')
    expect(spawns).toHaveLength(9)
    expect(spawns.every((s) => s.triggerTimes === -1)).toBe(true)
  }, 60_000)

  it('gives each buff window its own field and an on/off pair', () => {
    const params = withSurvival(0, {
      buffs: [{ buff: 'bloodlust', target: 'monsters', startSeconds: 10, endSeconds: 40 }]
    })
    const level = arenaOf(generateOk(params, SEED), 0)
    const clock = clockOf(level)

    const fields = scriptsOf(level, 'DangerArea')
    expect(fields).toHaveLength(1)
    expect(intParam(fields[0], 'Damage')).toBe(0)
    // Ships disabled: its own toggle switches it on, even at 0 seconds.
    expect(fields[0].enabled).toBe(false)

    const toggles = togglesOf(level, fields[0].id)
    expect(toggles, 'one on, one off').toHaveLength(2)
    const on = toggles.find((t) => intParam(t, 'State') === ENABLE)
    const off = toggles.find((t) => intParam(t, 'State') === DISABLE)
    expect(delayTo(clock, on!.id)).toBe(10_000)
    expect(delayTo(clock, off!.id)).toBe(40_000)
  }, 60_000)

  it('drops one SpawnUnit per pickup copy, all at the same timestamp', () => {
    const params = withSurvival(0, { pickups: [{ item: 'powerup_health', count: 3, atSeconds: 20 }] })
    const level = arenaOf(generateOk(params, SEED), 0)
    const clock = clockOf(level)

    const spawns = scriptsOf(level, 'SpawnUnit')
    expect(spawns).toHaveLength(3)
    for (const spawn of spawns) {
      expect(spawn.triggerTimes).toBe(1)
      expect(delayTo(clock, spawn.id)).toBe(20_000)
    }
  }, 60_000)

  it('switches each trap window on and off at its own timestamps', () => {
    const params = withSurvival(0, {
      traps: [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 4, startSeconds: 15, endSeconds: 45 }
      ]
    })
    const level = arenaOf(generateOk(params, SEED), 0)
    const clock = clockOf(level)

    const spewers = scriptsOf(level, 'ProjectileSpewer')
    expect(spewers).toHaveLength(4)
    for (const spewer of spewers) {
      const toggles = togglesOf(level, spewer.id)
      expect(toggles, `spewer ${spewer.id} needs an on and an off`).toHaveLength(2)
      const on = toggles.find((t) => intParam(t, 'State') === ENABLE)
      const off = toggles.find((t) => intParam(t, 'State') === DISABLE)
      expect(delayTo(clock, on!.id)).toBe(15_000)
      expect(delayTo(clock, off!.id)).toBe(45_000)
    }
  }, 60_000)

  it('draws nothing when no window is usable — an untrapped survival arena is stable', () => {
    const empty = generateOk(withSurvival(0, { traps: [] }), SEED)
    const undefinedList = withSurvival(0)
    delete (undefinedList.boss.fights[0].survival as { traps?: unknown }).traps
    expect(validateParameters(undefinedList).valid, 'a missing list must validate, not throw').toBe(true)
    expect(arenaOf(generateOk(undefinedList, SEED), 0)).toEqual(arenaOf(empty, 0))
  }, 60_000)
})

describe('survival — the countdown styles', () => {
  // the round's own announcements: the ones its clock fires (not the exit's
  // gather-party line or a final arena's victory banner)
  const roundTexts = (l: AeLevel) => {
    const fired = new Set(clockOf(l).connections.map(([id]) => id))
    return scriptsOf(l, 'AnnounceText').filter((t) => fired.has(t.id))
  }

  it('off emits no announcement, seconds emits one per second', () => {
    const off = arenaOf(generateOk(withSurvival(0, { countdown: 'off' }), SEED), 0)
    expect(roundTexts(off), 'only the closing banner').toHaveLength(1)

    const perSecond = arenaOf(generateOk(withSurvival(0, { seconds: 10, countdown: 'seconds' }), SEED), 0)
    // 10..0 inclusive, plus the closing banner.
    expect(roundTexts(perSecond)).toHaveLength(12)
  }, 60_000)

  it('milestones stays a handful however long the round runs', () => {
    // The whole point of the style: `seconds` on a 20-minute round is 1201
    // nodes on one level, and milestones is flat in the length.
    expect(milestoneSeconds(60)).toEqual([60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
    expect(milestoneSeconds(1200).length).toBeLessThan(40)
    expect(everySecond(10)).toHaveLength(11)
    expect(countdownMarks(600, 'off')).toEqual([])
    // Descending, in range, no duplicates — whatever the length.
    for (const seconds of [1, 7, 59, 60, 61, 125, 3600]) {
      const marks = milestoneSeconds(seconds)
      expect(new Set(marks).size, `${seconds}s has duplicates`).toBe(marks.length)
      expect(marks[0], `${seconds}s must open at its own length`).toBe(seconds)
      expect(marks[marks.length - 1], `${seconds}s must end at 0`).toBe(0)
      expect([...marks].sort((a, b) => b - a), `${seconds}s must descend`).toEqual(marks)
    }
  })
})

describe('survival — validation', () => {
  /** A params object flipped to survival, patched, and validated. */
  const check = (patch: Partial<SurvivalOptions>) => validateParameters(withSurvival(0, patch))
  const fields = (issues: { field: string }[]) => issues.map((i) => i.field)

  it('accepts a well-formed survival arena', () => {
    const result = check({
      waves: [{ monster: 'bat', count: 10, atSeconds: 0, intervalMs: 1000 }],
      buffs: [{ buff: 'bloodlust', target: 'monsters', startSeconds: 0, endSeconds: 60 }],
      pickups: [{ item: 'powerup_health', count: 2, atSeconds: 30 }],
      traps: [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 2, startSeconds: 10, endSeconds: 50 }
      ]
    })
    expect(result.errors, JSON.stringify(result.errors)).toHaveLength(0)
    expect(result.valid).toBe(true)
  })

  it('rejects an out-of-range round length and an unknown countdown style', () => {
    expect(fields(check({ seconds: 0 }).errors)).toContain('boss.fights.0.survival.seconds')
    expect(fields(check({ seconds: 99_999 }).errors)).toContain('boss.fights.0.survival.seconds')
    expect(
      fields(check({ countdown: 'every-other-tuesday' as never }).errors)
    ).toContain('boss.fights.0.survival.countdown')
  })

  it('rejects a bad wave row, field by field', () => {
    expect(
      fields(check({ waves: [{ monster: 'not_a_monster', count: 1, atSeconds: 0, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.monster')
    // 0 and -2 are nonsense; -1 is the endless sentinel and is legal (below).
    expect(
      fields(check({ waves: [{ monster: 'bat', count: 0, atSeconds: 0, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.count')
    expect(
      fields(check({ waves: [{ monster: 'bat', count: -2, atSeconds: 0, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.count')
    // A row scheduled after the door has opened never fires.
    expect(
      fields(check({ waves: [{ monster: 'bat', count: 5, atSeconds: 90, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.atSeconds')
  })

  it('accepts -1 as the endless count', () => {
    const result = check({ waves: [{ monster: 'bat', count: -1, atSeconds: 0, intervalMs: 1000 }] })
    expect(fields(result.errors), JSON.stringify(result.errors)).not.toContain('boss.fights.0.survival.waves.0.count')
    expect(result.valid).toBe(true)
  })

  it('rejects a window that ends at or before it starts', () => {
    expect(
      fields(check({ buffs: [{ buff: 'bloodlust', target: 'players', startSeconds: 30, endSeconds: 30 }] }).errors)
    ).toContain('boss.fights.0.survival.buffs.0.endSeconds')
    expect(
      fields(
        check({
          traps: [
            { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 900, count: 1, startSeconds: 40, endSeconds: 20 }
          ]
        }).errors
      )
    ).toContain('boss.fights.0.survival.traps.0.endSeconds')
  })

  it('warns about an empty arena and a per-second countdown on a long round', () => {
    expect(fields(check({}).warnings)).toContain('boss.fights.0.survival.waves')
    expect(
      fields(check({ seconds: 1200, countdown: 'seconds' }).warnings)
    ).toContain('boss.fights.0.survival.countdown')
  })

  it('does not fire the boss-only rules on a survival fight', () => {
    // bossPool, the five-wave count, the scatter rules, invulnerability and the
    // checkpoint presets are all kept on the object so flipping the mode is
    // lossless — but nothing reads them, so an empty pool must not block a
    // survival arena from generating.
    const params = withSurvival(0, { waves: [{ monster: 'bat', count: 4, atSeconds: 0, intervalMs: 1000 }] })
    params.boss.fights[0].arena.bossPool = []
    params.boss.fights[0].arena.waves = []

    const result = validateParameters(params)
    expect(fields(result.errors), JSON.stringify(result.errors)).not.toContain('boss.fights.0.arena.bossPool')
    expect(fields(result.errors)).not.toContain('boss.fights.0.arena.waves')
    expect(result.valid).toBe(true)

    // ...and the same emptiness on a BOSS fight still blocks, so the gate is
    // the mode and not a hole in the rules.
    const stillBoss = twoFightParams()
    stillBoss.boss.fights[0].arena.bossPool = []
    expect(fields(validateParameters(stillBoss).errors)).toContain('boss.fights.0.arena.bossPool')
  })
})

describe('survival — parameters.txt', () => {
  const survival: SurvivalOptions = {
    seconds: 240,
    countdown: 'seconds',
    waves: [
      { monster: 'bat', count: 50, atSeconds: 0, intervalMs: 1000 },
      { monster: 'bat', count: 200, atSeconds: 120, intervalMs: 500 }
    ],
    buffs: [{ buff: 'bloodlust', target: 'monsters', startSeconds: 60, endSeconds: 180 }],
    pickups: [{ item: 'powerup_health', count: 2, atSeconds: 90 }],
    traps: [
      { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3, startSeconds: 30, endSeconds: 210 }
    ]
  }

  it('round-trips every survival key', () => {
    const params = withSurvival(1, survival)
    const text = serializeParametersTxt(params)

    expect(text).toMatch(/^boss1Mode=survival$/m)
    expect(text).toMatch(/^boss1Survival=240,seconds$/m)
    expect(text).toMatch(/^boss1SurvivalWaves=bat:50:0:1000\|bat:200:120:500$/m)
    expect(text).toMatch(/^boss1SurvivalBuffs=bloodlust:monsters:60:180$/m)
    expect(text).toMatch(/^boss1SurvivalPickups=powerup_health:2:90$/m)
    expect(text).toMatch(/^boss1SurvivalTraps=shooter_arrow:up:0.5:900:3:30:210$/m)

    const parsed = parseParametersTxt(text, params)
    expect(parsed.params.boss.fights[1].mode).toBe('survival')
    expect(parsed.params.boss.fights[1].survival).toEqual(survival)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('writes not one survival key for a boss-mode fight', () => {
    // The byte-identity contract: an export from a stock campaign must look
    // exactly as it did before survival mode existed.
    const text = serializeParametersTxt(twoFightParams())
    expect(text).not.toMatch(/Survival/i)
    expect(text).not.toMatch(/boss\d+Mode/)
  })

  it('labels a survival arena AS in levelOrder, and still reads the old B spelling', () => {
    const params = withSurvival(0, survival)
    params.levelOrder = [
      { kind: 'boss', index: 0 },
      { kind: 'floor', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'boss', index: 1 },
      { kind: 'floor', index: 2 }
    ]
    // Prefix is the mode, number is the position in the fight list.
    expect(serializeParametersTxt(params)).toMatch(/^levelOrder=AS1,1,2,AB2,3$/m)

    // B1/AB1/AS1 all name the same slot — the prefix is informational and
    // boss<i>Mode is what decides the mode.
    for (const token of ['B1', 'AB1', 'AS1']) {
      const parsed = parseParametersTxt(`levelOrder=${token},1,2,B2,3`, twoFightParams())
      expect(parsed.params.levelOrder?.[0], token).toEqual({ kind: 'boss', index: 0 })
      expect(parsed.unknownKeys, token).toEqual([])
    }
  })

  it('reports a malformed survival value rather than throwing', () => {
    const parsed = parseParametersTxt(
      ['boss0Mode=survival', 'boss0Survival=abc,nonsense', 'boss0SurvivalWaves=not_a_monster:5:0:1000'].join('\r\n'),
      twoFightParams()
    )
    expect(parsed.unknownKeys.join(' ')).toContain('seconds')
    expect(parsed.unknownKeys.join(' ')).toContain('countdown')
    expect(parsed.unknownKeys.join(' ')).toContain('monster')
    // The mode still took, and the defaults survived the bad fields.
    expect(parsed.params.boss.fights[0].mode).toBe('survival')
    expect(parsed.params.boss.fights[0].survival?.seconds).toBe(defaultSurvivalOptions().seconds)
  })
})

describe('survival — arena bodyguard twins (issue #64 part 2)', () => {
  /** A single-fight survival campaign whose only wave row names 2 twinned actors. */
  function withTwinnedRow(bodyguardVariants?: boolean): DungeonParameters {
    const params = plainParameters()
    const fight = params.boss.fights[0]
    params.boss = {
      ...params.boss,
      fights: [
        {
          ...fight,
          mode: 'survival',
          arena: { ...fight.arena, bodyguardVariants },
          survival: {
            ...defaultSurvivalOptions(),
            seconds: 60,
            waves: [
              { monster: 'skeleton_archer', count: 9, atSeconds: 0, intervalMs: 1000 },
              { monster: 'skeleton_runner', count: 9, atSeconds: 0, intervalMs: 1000 }
            ]
          }
        }
      ]
    }
    return params
  }

  const spawned = (r: DungeonResult) => new Set(scriptsOf(arenaOf(r, 0), 'SpawnUnit').map((sp) => strParam(sp, 'UnitType')))
  const archer = resolveActorPath('skeleton_archer')
  const runner = resolveActorPath('skeleton_runner')

  it('substitutes the twins by default', () => {
    const paths = spawned(generateOk(withTwinnedRow(undefined), SEED))
    expect(paths).toEqual(new Set([arenaActorPath(archer), arenaActorPath(runner)]))
    expect(arenaActorPath(archer)).not.toBe(archer)
    expect(arenaActorPath(runner)).not.toBe(runner)
  }, 60_000)

  it('emits the plain actors with the toggle off', () => {
    const result = generateOk(withTwinnedRow(false), SEED)
    expect(spawned(result)).toEqual(new Set([archer, runner]))
    expect(lvlText(result, 'boss0')).not.toContain(arenaActorPath(archer))
  }, 60_000)
})
