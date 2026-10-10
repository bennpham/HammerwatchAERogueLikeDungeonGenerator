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
import { allIds, badIntArray, nodesOfType } from './xmlHelpers'
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

function fileAt(result: DungeonResult, path: string): string {
  const file = result.files.find((f) => f.path === path)
  expect(file, `${path} missing`).toBeDefined()
  return (file as { content: string }).content
}

const arenaXml = (result: DungeonResult, i: number): string => fileAt(result, `levels/boss${i}.xml`)
const floorXml = (result: DungeonResult, i: number): string => fileAt(result, `levels/level${i}.xml`)

/** The ids `<int-arr name="{name}">` holds inside `body`, or null if absent. */
function intArr(body: string, name: string): number[] | null {
  const found = new RegExp(`<int-arr name="${name}">([^<]*)</int-arr>`).exec(body)
  return found === null ? null : found[1].split(' ').map(Number)
}

function intParam(body: string, name: string): number | null {
  const found = new RegExp(`<int name="${name}">(-?\\d+)</int>`).exec(body)
  return found === null ? null : Number(found[1])
}

function stringParam(body: string, name: string): string | null {
  const found = new RegExp(`<string name="${name}">([^<]*)</string>`).exec(body)
  return found === null ? null : found[1]
}

/** Every scripting node's id, in document order. */
function scriptNodeIds(xml: string): number[] {
  const scripting = /<array name="scripting">([\s\S]*?)<\/array>/.exec(xml)
  return scripting === null ? [] : allIds(scripting[1])
}

/** The survival arena's one LevelLoaded trigger, as `{id, body}`. */
function clockOf(xml: string): { id: number; body: string } {
  const clocks = nodesOfType(xml, 'GlobalEventTrigger').filter(
    (n) => stringParam(n.body, 'parameters') === 'LevelLoaded'
  )
  expect(clocks, 'expected exactly one LevelLoaded trigger').toHaveLength(1)
  return clocks[0]
}

/** The delay, in ms, the clock fires node `id` at — or null when it never does. */
function delayTo(clock: { body: string }, id: number): number | null {
  const connections = intArr(clock.body, 'connections') ?? []
  const delays = intArr(clock.body, 'connection-delays') ?? []
  const at = connections.indexOf(id)
  return at === -1 ? null : (delays[at] ?? null)
}

describe('survival — the boss mode is untouched (invariant 8)', () => {
  it('an all-boss campaign is byte-identical to one generated without the feature', () => {
    // `mode` absent and `mode: 'boss'` must produce the same bytes as each
    // other AND as the pre-feature generator — the first two are what this can
    // assert directly; the third is what every other suite's unchanged
    // expectations already prove.
    const absent = generateOk(twoFightParams(), SEED)

    const explicit = twoFightParams()
    explicit.boss.fights = explicit.boss.fights.map((f) => ({ ...f, mode: 'boss' as const }))
    const stated = generateOk(explicit, SEED)

    expect(stated.files.map((f) => f.path)).toEqual(absent.files.map((f) => f.path))
    for (const file of absent.files) {
      expect(fileAt(stated, file.path), file.path).toBe(file.content)
    }
  }, 60_000)

  it('flipping a fight to survival leaves every dungeon floor byte-identical', () => {
    // The arenas draw from ctx.bossRand and the floors from ctx.rand, so no
    // arena change can reach a floor however many draws it does or does not make.
    const boss = generateOk(twoFightParams(), SEED)
    const survival = generateOk(withSurvival(0), SEED)

    for (let i = 0; i < 3; i++) {
      expect(floorXml(survival, i), `floor ${i}`).toBe(floorXml(boss, i))
    }
  }, 60_000)

  it('flipping the SECOND fight leaves the first arena byte-identical', () => {
    // Fights share ctx.bossRand in list order, so fight 0 draws what it always
    // drew whatever fight 1 turns into. The converse is deliberately NOT
    // asserted: flipping fight 0 changes how many values it takes, which moves
    // fight 1 — exactly as adding or removing a fight does.
    const boss = generateOk(twoFightParams(), SEED)
    const survival = generateOk(withSurvival(1), SEED)

    expect(arenaXml(survival, 0)).toBe(arenaXml(boss, 0))
  }, 60_000)

  it('is deterministic', () => {
    const params = withSurvival(0, {
      waves: [{ monster: 'bat1', count: 12, atSeconds: 0, intervalMs: 1000 }],
      traps: [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 4, startSeconds: 10, endSeconds: 50 }
      ]
    })
    expect(arenaXml(generateOk(params, SEED), 0)).toBe(arenaXml(generateOk(params, SEED), 0))
  }, 60_000)
})

describe('survival — no boss, so no boss events', () => {
  const result = () => generateOk(withSurvival(0), SEED)

  it('places no boss actor', () => {
    // The engine fires the `Boss ...` events for an actor in actors/boss_*/ and
    // for nothing else. No actor is the whole reason the clock rig exists.
    expect(arenaXml(result(), 0)).not.toMatch(/actors\/boss_/)
  }, 60_000)

  it('emits no Boss Died trigger, no invulnerability and no checkpoint', () => {
    const xml = arenaXml(result(), 0)
    const bossEvents = nodesOfType(xml, 'GlobalEventTrigger').filter((n) =>
      (stringParam(n.body, 'parameters') ?? '').startsWith('Boss')
    )
    expect(bossEvents, 'a survival arena must listen for no Boss event').toHaveLength(0)
    expect(nodesOfType(xml, 'ToggleImmortality')).toHaveLength(0)
    expect(nodesOfType(xml, 'Checkpoint')).toHaveLength(0)
  }, 60_000)

  it('opens the alcove from the clock, at the round length', () => {
    const xml = arenaXml(result(), 0)
    const clock = clockOf(xml)

    const destroys = nodesOfType(xml, 'DestroyObject')
    expect(destroys, 'exactly one DestroyObject opens the alcove').toHaveLength(1)
    // The same three need-sync seals the Boss Died chain destroys in boss mode.
    expect(intArr(destroys[0].body, 'static')).toHaveLength(3)
    expect(delayTo(clock, destroys[0].id)).toBe(60_000)
  }, 60_000)

  it('still emits the gateway prefab and the arrival respawn', () => {
    // Everything about the ROOM is shared with boss mode; only what opens the
    // alcove changed.
    const xml = arenaXml(result(), 0)
    expect(nodesOfType(xml, 'LevelStart')).toHaveLength(1)
    expect(nodesOfType(xml, 'RespawnPlayers')).toHaveLength(1)
    expect(badIntArray(xml)).toBeNull()

    // Script-node ids must be unique, because that is what every `connections`
    // and `static` array points at. Deliberately NOT every `<int name="id">` in
    // the file: doodads, items and actors are numbered from the same counter
    // but a stock BOSS arena repeats id 0 across sections too (702 ids, 701
    // distinct), so a whole-file uniqueness assertion would be asserting
    // something the generator has never done — in either mode.
    const nodeIds = scriptNodeIds(xml)
    expect(new Set(nodeIds).size, 'script node ids must be unique').toBe(nodeIds.length)
  }, 60_000)
})

describe('survival — the timed rigs', () => {
  it('arms each wave row at its own timestamp, split over the nine anchors', () => {
    const params = withSurvival(0, {
      waves: [
        { monster: 'bat1', count: 18, atSeconds: 0, intervalMs: 1000 },
        { monster: 'bat1', count: 9, atSeconds: 30, intervalMs: 2000 }
      ]
    })
    const xml = arenaXml(generateOk(params, SEED), 0)
    const clock = clockOf(xml)

    const timers = nodesOfType(xml, 'TimerTrigger')
    expect(timers, 'one timer per row').toHaveLength(2)
    // A TimerTrigger's interval goes out as its `parameters` int — see
    // NodeTimerTrigger. Every node in this dialect names its payload that,
    // whatever the payload happens to mean.
    expect(timers.map((t) => intParam(t.body, 'parameters'))).toEqual([1000, 2000])

    // Each row's toggle is what the clock fires; the toggle arms the timer.
    const armDelays = timers.map((timer) => {
      const arm = nodesOfType(xml, 'ToggleElement').find(
        (n) => intParam(n.body, 'state') === 0 && (intArr(n.body, 'static') ?? []).includes(timer.id)
      )
      expect(arm, `nothing arms timer ${timer.id}`).toBeDefined()
      return delayTo(clock, (arm as { id: number }).id)
    })
    expect(armDelays).toEqual([0, 30_000])

    // 18 over 9 anchors is 2 each; 9 over 9 is 1 each. Two rows naming the same
    // monster stay independent — neither replaces the other.
    const spawns = nodesOfType(xml, 'SpawnObject')
    const shares = spawns.map((s) => intParam(s.body, 'trigger-times'))
    expect(shares.filter((n) => n === 2)).toHaveLength(9)
    expect(shares.filter((n) => n === 1)).toHaveLength(9)
  }, 60_000)

  it('gives an endless row an unbounded spawner per anchor, stopped at the end', () => {
    // -1 means "keep coming until the clock runs out". Paired here with a
    // finite row so the two shapes are compared in one arena: only the endless
    // one gets a stop toggle, and only the finite one splits a count.
    const params = withSurvival(0, {
      waves: [
        { monster: 'bat1', count: -1, atSeconds: 10, intervalMs: 1000 },
        { monster: 'bat1', count: 9, atSeconds: 20, intervalMs: 2000 }
      ]
    })
    const xml = arenaXml(generateOk(params, SEED), 0)
    const clock = clockOf(xml)

    const timers = nodesOfType(xml, 'TimerTrigger')
    expect(timers, 'one timer per row').toHaveLength(2)
    const [endlessTimer, finiteTimer] = timers

    // The endless row: one spawner per anchor, each unbounded.
    const spawns = nodesOfType(xml, 'SpawnObject')
    const endlessSpawns = spawns.filter((s) =>
      (intArr(endlessTimer.body, 'connections') ?? []).includes(s.id)
    )
    expect(endlessSpawns).toHaveLength(9)
    for (const spawn of endlessSpawns) {
      expect(intParam(spawn.body, 'trigger-times'), 'endless spawners must be unbounded').toBe(-1)
    }

    // The finite row is untouched — 9 over 9 anchors is 1 each.
    const finiteSpawns = spawns.filter((s) =>
      (intArr(finiteTimer.body, 'connections') ?? []).includes(s.id)
    )
    expect(finiteSpawns).toHaveLength(9)
    expect(finiteSpawns.every((s) => intParam(s.body, 'trigger-times') === 1)).toBe(true)

    // Only the endless row is stopped, and on the same tick that opens the door.
    const stopOf = (timerId: number) =>
      nodesOfType(xml, 'ToggleElement').find(
        (n) => intParam(n.body, 'state') === 1 && (intArr(n.body, 'static') ?? []).includes(timerId)
      )
    const stop = stopOf(endlessTimer.id)
    expect(stop, 'an endless row must be switched off at the end').toBeDefined()
    expect(delayTo(clock, (stop as { id: number }).id)).toBe(60_000)
    expect(stopOf(finiteTimer.id), 'a finite row needs no stop — trigger-times bounds it').toBeUndefined()
  }, 60_000)

  it('never scales an endless row by the arena monsterMultiplier', () => {
    // -1 is a sentinel, not a quantity. scaledMax is what enforces that, and
    // reusing it is what keeps this rig and the boss one from drifting.
    const params = withSurvival(0, { waves: [{ monster: 'bat1', count: -1, atSeconds: 0, intervalMs: 1000 }] })
    params.boss.fights[0].arena.monsterMultiplier = 3
    const xml = arenaXml(generateOk(params, SEED), 0)

    const spawns = nodesOfType(xml, 'SpawnObject')
    expect(spawns).toHaveLength(9)
    expect(spawns.every((s) => intParam(s.body, 'trigger-times') === -1)).toBe(true)
  }, 60_000)

  it('gives each buff window its own field and an on/off pair', () => {
    const params = withSurvival(0, {
      buffs: [{ buff: 'bloodlust', target: 'monsters', startSeconds: 10, endSeconds: 40 }]
    })
    const xml = arenaXml(generateOk(params, SEED), 0)
    const clock = clockOf(xml)

    const fields = nodesOfType(xml, 'DangerArea')
    expect(fields).toHaveLength(1)
    // An aura is a buff field, not damage — timer mode's hazard is the rig that
    // deals damage, and it is deliberately a different one.
    expect(intParam(fields[0].body, 'damage')).toBe(0)
    // Ships disabled: its own ToggleElement switches it on, even at 0 seconds.
    expect(intParam(fields[0].body, 'enabled')).not.toBe(1)

    const toggles = nodesOfType(xml, 'ToggleElement').filter((n) =>
      (intArr(n.body, 'static') ?? []).includes(fields[0].id)
    )
    expect(toggles, 'one on, one off').toHaveLength(2)
    const on = toggles.find((t) => intParam(t.body, 'state') === 0)
    const off = toggles.find((t) => intParam(t.body, 'state') === 1)
    expect(delayTo(clock, (on as { id: number }).id)).toBe(10_000)
    expect(delayTo(clock, (off as { id: number }).id)).toBe(40_000)
  }, 60_000)

  it('drops one SpawnObject per pickup copy, all at the same timestamp', () => {
    const params = withSurvival(0, {
      pickups: [{ item: 'powerup_health', count: 3, atSeconds: 20 }]
    })
    const xml = arenaXml(generateOk(params, SEED), 0)
    const clock = clockOf(xml)

    // A count is COPIES, not trigger-times: a SpawnObject spawns one actor per
    // incoming trigger and the clock fires once, so N copies means N nodes.
    const spawns = nodesOfType(xml, 'SpawnObject')
    expect(spawns).toHaveLength(3)
    for (const spawn of spawns) {
      expect(intParam(spawn.body, 'trigger-times')).toBe(1)
      expect(delayTo(clock, spawn.id)).toBe(20_000)
    }
  }, 60_000)

  it('switches each trap window on and off at its own timestamps', () => {
    const params = withSurvival(0, {
      traps: [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 4, startSeconds: 15, endSeconds: 45 }
      ]
    })
    const xml = arenaXml(generateOk(params, SEED), 0)
    const clock = clockOf(xml)

    const spewers = nodesOfType(xml, 'ProjectileSpewer')
    expect(spewers).toHaveLength(4)

    for (const spewer of spewers) {
      const toggles = nodesOfType(xml, 'ToggleElement').filter((n) =>
        (intArr(n.body, 'static') ?? []).includes(spewer.id)
      )
      expect(toggles, `spewer ${spewer.id} needs an on and an off`).toHaveLength(2)
      const on = toggles.find((t) => intParam(t.body, 'state') === 0)
      const off = toggles.find((t) => intParam(t.body, 'state') === 1)
      expect(delayTo(clock, (on as { id: number }).id)).toBe(15_000)
      expect(delayTo(clock, (off as { id: number }).id)).toBe(45_000)
    }
  }, 60_000)

  it('draws nothing when no window is usable — an untrapped survival arena is stable', () => {
    // The trap rig is the only part that touches ctx.bossRand, so an arena with
    // no usable window must come out identical to one with an empty list.
    const empty = generateOk(withSurvival(0, { traps: [] }), SEED)
    // The unusable case has to be one validation ALLOWS, or generation fails
    // before it can prove anything. A list left out entirely is the honest
    // comparison — and the case a hand-edited parameters.txt really produces:
    // both must reach getArenaXML having spent zero bossRand values on spewers.
    const undefinedList = withSurvival(0)
    delete (undefinedList.boss.fights[0].survival as { traps?: unknown }).traps
    expect(validateParameters(undefinedList).valid, 'a missing list must validate, not throw').toBe(true)
    expect(arenaXml(generateOk(undefinedList, SEED), 0)).toBe(arenaXml(empty, 0))
  }, 60_000)
})

describe('survival — the countdown styles', () => {
  it('off emits no announcement, seconds emits one per second', () => {
    const off = arenaXml(generateOk(withSurvival(0, { countdown: 'off' }), SEED), 0)
    expect(nodesOfType(off, 'AnnounceText'), 'only the closing banner').toHaveLength(1)

    const perSecond = arenaXml(generateOk(withSurvival(0, { seconds: 10, countdown: 'seconds' }), SEED), 0)
    // 10..0 inclusive, plus the closing banner.
    expect(nodesOfType(perSecond, 'AnnounceText')).toHaveLength(12)
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
      waves: [{ monster: 'bat1', count: 10, atSeconds: 0, intervalMs: 1000 }],
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
      fields(check({ waves: [{ monster: 'bat1', count: 0, atSeconds: 0, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.count')
    expect(
      fields(check({ waves: [{ monster: 'bat1', count: -2, atSeconds: 0, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.count')
    // A row scheduled after the door has opened never fires.
    expect(
      fields(check({ waves: [{ monster: 'bat1', count: 5, atSeconds: 90, intervalMs: 1000 }] }).errors)
    ).toContain('boss.fights.0.survival.waves.0.atSeconds')
  })

  it('accepts -1 as the endless count', () => {
    const result = check({ waves: [{ monster: 'bat1', count: -1, atSeconds: 0, intervalMs: 1000 }] })
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
    const params = withSurvival(0, { waves: [{ monster: 'bat1', count: 4, atSeconds: 0, intervalMs: 1000 }] })
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
      { monster: 'bat1', count: 50, atSeconds: 0, intervalMs: 1000 },
      { monster: 'bat1', count: 200, atSeconds: 120, intervalMs: 500 }
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
    expect(text).toMatch(/^boss1SurvivalWaves=bat1:50:0:1000\|bat1:200:120:500$/m)
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
              { monster: 'archer1', count: 9, atSeconds: 0, intervalMs: 1000 },
              { monster: 'skeleton3', count: 9, atSeconds: 0, intervalMs: 1000 }
            ]
          }
        }
      ]
    }
    return params
  }

  it('substitutes the twins by default', () => {
    const xml = arenaXml(generateOk(withTwinnedRow(undefined), SEED), 0)
    expect(xml).toContain('actors/boss_knight/archer_1.xml')
    expect(xml).toContain('actors/boss_lich/lich_guard_skeleton.xml')
    expect(xml).not.toContain('>actors/archer_1.xml<')
    expect(xml).not.toContain('>actors/skeleton_3.xml<')
  }, 60_000)

  it('emits the plain actors with the toggle off', () => {
    const xml = arenaXml(generateOk(withTwinnedRow(false), SEED), 0)
    expect(xml).toContain('actors/archer_1.xml')
    expect(xml).toContain('actors/skeleton_3.xml')
    expect(xml).not.toContain('boss_knight')
    expect(xml).not.toContain('boss_lich')
  }, 60_000)
})
