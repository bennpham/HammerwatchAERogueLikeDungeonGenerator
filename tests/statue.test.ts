/**
 * The wraith's statue (`boss/statue.ts`). `wraith.inc` sets `immortal` true,
 * so a wraith placed alone can never be hurt and its floor never opens
 * (dungeon_1878922481, Shaftlocke Siege floor 2). Stock pairs each wraith with
 * a statue whose death clears the immortality; so do we.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { campaignPresetById, defaultDungeonBoss, generateDungeon, withGatewayLocks } from '../src/generator'
import type { DungeonBoss, DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { buildBossArena } from '../src/generator/boss/arena'
import { BOSS_DEFS, BOSS_DEF_LIST } from '../src/generator/boss/bosses'
import { STATUE_MAX_GAP, STATUE_RETOGGLE_MS, STATUE_RETOGGLE_UNTIL } from '../src/generator/boss/statue'
import type { AeLevel, AeScript, AeUnit } from '../src/generator/ae/model'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { idsParam, intParam, levelsOf, param, scriptById, scriptsOf } from './ae'
import { plainParameters } from './params'
import { passabilityOf } from './sealProbe'
import { aeAssetsDir } from './aeInstall'

const TILE = 16
const STATUE = BOSS_DEFS.boss_wraith.statue!.actorPath
const WRAITH = BOSS_DEFS.boss_wraith.actorPath

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

const units = (l: AeLevel, path: string): AeUnit[] => l.units.filter((u) => u.path === path)

/** The one-shot UnitDestroyedTrigger over `unitId` alone. */
function deathTrigger(level: AeLevel, unitId: number): AeScript {
  const triggers = scriptsOf(level, 'UnitDestroyedTrigger').filter((t) => {
    const ids = idsParam(t, 'Units')
    return ids.length === 1 && ids[0] === unitId
  })
  expect(triggers, `unit ${unitId}'s death trigger`).toHaveLength(1)
  expect(triggers[0].triggerTimes).toBe(1)
  return triggers[0]
}

/** The wraith a ToggleImmortality(State 2) clears. */
function clears(level: AeLevel, node: AeScript): number {
  expect(node.cls).toBe('ToggleImmortality')
  expect(intParam(node, 'State'), 'State 2 clears immortality').toBe(2)
  const ids = idsParam(node, 'Units')
  expect(ids).toHaveLength(1)
  expect(level.units.find((u) => u.id === ids[0])?.path).toBe(WRAITH)
  return ids[0]
}

/**
 * Each statue's rig (boss/statue.ts): its death clears its wraith's
 * immortality and enables a disabled 1000 ms timer that keeps clearing it;
 * the wraith dropping below 90% or dying disables the timer. Returns the
 * wraith id each statue frees, in statue order.
 */
function freedBy(level: AeLevel): number[] {
  return units(level, STATUE).map((statue) => {
    const fired = deathTrigger(level, statue.id).connections.map(([id, delayMs]) => {
      expect(delayMs).toBe(0)
      return scriptById(level, id)!
    })
    expect(fired.map((s) => s.cls)).toEqual(['ToggleImmortality', 'ToggleScripts'])
    const wraith = clears(level, fired[0])

    const [start] = fired.slice(1)
    expect(intParam(start, 'State'), 'enable').toBe(1)
    const [timerId] = idsParam(start, 'Scripts')
    const timer = scriptById(level, timerId)!
    expect(timer.cls).toBe('TimerTrigger')
    expect(timer.enabled, 'the timer waits for the statue').toBe(false)
    expect(intParam(timer, 'Frequency')).toBe(STATUE_RETOGGLE_MS)
    expect(timer.connections).toHaveLength(1)
    expect(clears(level, scriptById(level, timer.connections[0][0])!)).toBe(wraith)

    // what stops the timer: the wraith below 90%, and its death
    const stop = scriptsOf(level, 'ToggleScripts').filter((s) => intParam(s, 'State') === 2 && idsParam(s, 'Scripts').includes(timerId))
    expect(stop).toHaveLength(1)
    const stoppers = level.scripts.filter((s) => s.connections.some(([id]) => id === stop[0].id))
    const health = stoppers.find((s) => s.cls === 'ActorHealthTrigger')!
    expect(idsParam(health, 'Units')).toEqual([wraith])
    expect(param(health, 'Value')?.value).toBeCloseTo(STATUE_RETOGGLE_UNTIL)
    expect(health.triggerTimes).toBe(1)
    const died = stoppers.find((s) => s.cls === 'UnitDestroyedTrigger')!
    expect(idsParam(died, 'Units')).toEqual([wraith])
    expect(died.triggerTimes).toBe(1)
    return wraith
  })
}

const tileOf = (u: { x: number; y: number }) => ({ x: Math.floor(u.x / TILE), y: Math.floor(u.y / TILE) })
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/** Each statue's distance in tiles from the wraith it frees, in statue order. */
function ownGaps(level: AeLevel): number[] {
  const freed = freedBy(level)
  return units(level, STATUE).map((statue, i) => chebyshev(tileOf(statue), tileOf(level.units.find((u) => u.id === freed[i])!)))
}

/** Whether the party can walk from the floor's LevelStart to a tile beside `u`. */
function walkable(result: DungeonResult, stem: string, level: AeLevel, u: AeUnit): boolean {
  const preview = result.levels.find((l) => l.level === Number(stem.replace('floor', '')) && !l.label.startsWith('A'))!
  const pass = passabilityOf(preview, level as never)
  const start = level.scripts.find((s) => s.cls === 'LevelStart')!
  const from = tileOf(start)
  const seen = new Uint8Array(pass.width * pass.height)
  const stack = [from.x + from.y * pass.width]
  seen[stack[0]] = 1
  for (let guard = 0; stack.length > 0 && guard < pass.width * pass.height; guard++) {
    const idx = stack.pop()!
    const x = idx % pass.width
    const y = Math.trunc(idx / pass.width)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (pass.isSolid(x + dx, y + dy)) continue
      const n = x + dx + (y + dy) * pass.width
      if (seen[n]) continue
      seen[n] = 1
      stack.push(n)
    }
  }
  const t = tileOf(u)
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[t.x + dx + (t.y + dy) * pass.width] === 1)
}

/** Four floors, a wraith lineup on floor 1, no optional layers. */
function wraithFloor(patch: Partial<DungeonBoss>): DungeonParameters {
  const params = plainParameters()
  const floors = 4
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelBuffs = params.levelBuffs?.slice(0, floors)
  params.levelTraps = params.levelTraps?.slice(0, floors)
  params.levelTimers = params.levelTimers?.slice(0, floors)
  params.floorMusic = params.floorMusic?.slice(0, floors)
  params.playerTweaks = {}
  const bosses = Array.from({ length: floors }, () => defaultDungeonBoss())
  bosses[1] = { ...defaultDungeonBoss(), enabled: true, bossSelection: 'lineup', ...patch }
  params.levelBoss = bosses
  return withGatewayLocks(params)
}

describe('wraith statue — Shaftlocke Siege, the reported seed', () => {
  const params = campaignPresetById('claude-shaftlocke-siege')!.build()
  const result = generateOk(params, 1878922481)
  const levels = levelsOf(result)
  const floor = levels.get('floor1')!

  it('stands one statue beside the floor-2 wraith, and its death frees that wraith', () => {
    const wraiths = units(floor, WRAITH)
    expect(wraiths).toHaveLength(1)
    expect(units(floor, STATUE)).toHaveLength(1)
    expect(freedBy(floor)).toEqual([wraiths[0].id])
  })

  it('puts the statue off the wraith, where the party can walk to it', () => {
    const [statue] = units(floor, STATUE)
    const [wraith] = units(floor, WRAITH)
    expect(chebyshev(tileOf(statue), tileOf(wraith))).toBeGreaterThanOrEqual(2)
    expect(walkable(result, 'floor1', floor, statue)).toBe(true)
  })

  // Played for checklist #81 with the statue 6 tiles west of the wraith at
  // (5, 37). That floor was the second attempt: the seal check read a vertical
  // seal piece one row off and threw out the first, which was sound. Since
  // that fix (2026-10-23) the first attempt stands, so the floor and its
  // statue moved; this pins the layout the seed builds now.
  it('keeps the statue where this seed puts it: 2 tiles from the wraith', () => {
    expect(tileOf(units(floor, STATUE)[0])).toEqual({ x: 58, y: 6 })
    expect(ownGaps(floor)).toEqual([2])
  })

  it('puts no statue anywhere else in the campaign', () => {
    for (const [stem, level] of levels) {
      if (stem !== 'floor1') expect(units(level, STATUE), stem).toHaveLength(0)
    }
  })
})

describe('wraith statue — on a floor', () => {
  it('gives every wraith its own statue, each freeing only its own wraith', () => {
    for (const seed of [1, 42, 777]) {
      const result = generateOk(wraithFloor({ bossLineup: { boss_wraith: 2 } }), seed)
      const floor = levelsOf(result).get('floor1')!
      const wraiths = units(floor, WRAITH).map((u) => u.id)
      expect(wraiths, `seed ${seed}`).toHaveLength(2)
      expect(units(floor, STATUE), `seed ${seed}`).toHaveLength(2)
      expect(new Set(freedBy(floor)), `seed ${seed}`).toEqual(new Set(wraiths))
      const [a, b] = units(floor, STATUE).map(tileOf)
      expect(chebyshev(a, b), `seed ${seed}: statues apart`).toBeGreaterThan(2)
      for (const gap of ownGaps(floor)) expect(gap, `seed ${seed}`).toBeLessThanOrEqual(STATUE_MAX_GAP)
    }
  }, 120_000)

  it('always finds a reachable statue tile across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const result = generateOk(wraithFloor({ bossLineup: { boss_wraith: 1 } }), seed)
      const floor = levelsOf(result).get('floor1')!
      const statues = units(floor, STATUE)
      expect(statues, `seed ${seed}`).toHaveLength(1)
      expect(walkable(result, 'floor1', floor, statues[0]), `seed ${seed}`).toBe(true)
      expect(ownGaps(floor)[0], `seed ${seed}: in the wraith's range`).toBeLessThanOrEqual(STATUE_MAX_GAP)
    }
  }, 180_000)

  it('emits no statue for a boss without one', () => {
    const result = generateOk(wraithFloor({ bossLineup: { boss_golem: 1 } }), 7)
    for (const [stem, level] of levelsOf(result)) expect(units(level, STATUE), stem).toHaveLength(0)
  }, 60_000)
})

describe('wraith statue — in an arena', () => {
  function arena(lineup: Record<string, number>, seed: number): AeLevel {
    const ctx = new GenerationContext(plainParameters(), seed)
    const options = { ...plainParameters().boss.fights[0].arena, bossSelection: 'lineup' as const, bossLineup: lineup }
    return buildBossArena(ctx, options, 0).level
  }

  it('gives each wraith its own statue, inside the arena, off the wraiths and in their range', () => {
    for (const [lineup, n] of [[{ boss_wraith: 1 }, 1], [{ boss_wraith: 2 }, 2], [{ boss_wraith: 1, boss_knight: 2 }, 1]] as const) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const level = arena(lineup, seed)
        const wraiths = units(level, WRAITH)
        expect(wraiths, `seed ${seed}`).toHaveLength(n)
        expect(units(level, STATUE), `seed ${seed}`).toHaveLength(n)
        expect(new Set(freedBy(level))).toEqual(new Set(wraiths.map((u) => u.id)))
        for (const gap of ownGaps(level)) expect(gap, `seed ${seed}`).toBeLessThanOrEqual(STATUE_MAX_GAP)
        for (const statue of units(level, STATUE)) {
          const t = tileOf(statue)
          expect(t.x, `seed ${seed}`).toBeGreaterThanOrEqual(0)
          expect(t.y, `seed ${seed}`).toBeGreaterThanOrEqual(0)
          for (const w of wraiths) expect(chebyshev(t, tileOf(w)), `seed ${seed}`).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })
})

describe('boss statues — the data', () => {
  it('names a statue that exists in the asset snapshot', () => {
    for (const def of BOSS_DEF_LIST) if (def.statue !== undefined) expect(aeAssetExists(def.statue.actorPath), def.id).toBe(true)
  })

  /** A unit file with its `%include` chain, as one text. */
  function unitText(root: string, rel: string, depth = 0): string {
    const path = join(root, rel)
    if (depth > 8 || !existsSync(path)) return ''
    const text = readFileSync(path, 'utf8')
    const includes = [...text.matchAll(/%include "([^"]+)"/g)].map((m) => unitText(root, m[1], depth + 1))
    return [text, ...includes].join('\n')
  }

  const root = aeAssetsDir()
  it.skipIf(root === null)('gives every immortal boss a statue (install)', () => {
    for (const def of BOSS_DEF_LIST) {
      const immortal = /<bool name="immortal">true<\/bool>/.test(unitText(root!, def.actorPath))
      expect(def.statue !== undefined, `${def.id} immortal=${immortal}`).toBe(immortal)
    }
  })
})
