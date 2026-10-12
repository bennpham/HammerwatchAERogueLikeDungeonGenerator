/**
 * Dungeon → Boss (issue #61) — a mobile boss standing on an ordinary generated
 * dungeon floor, with the floor's way out sealed until it dies.
 *
 * Four things are being proved.
 *
 * First, the identity contract, which is subtler here than for any other
 * per-floor layer: a boss floor is NOT purely additive. It takes a different
 * branch of `map/level.ts` — a sealed portal room instead of a stairs room — so
 * enabling a boss moves that floor and every floor after it. What must hold is
 * that a floor with NO boss draws exactly what it always drew, and that the
 * boss arenas, on their own stream, never move at all.
 *
 * Second, the boss actor on an ordinary floor: AE fires its health and death
 * triggers on that unit, so every tier-keyed rig from `boss/` is reused.
 *
 * Third, that the floor stays FINISHABLE. The way out is sealed and only the
 * boss's death opens it, so an unreachable boss is an unwinnable floor — hence
 * the boss tile being a `ctx.reachTargets` entry, which this pins directly.
 *
 * Fourth, placement: wave monsters on real interior floor, never in a wall or
 * on a prefab.
 */

import { describe, expect, it } from 'vitest'
import { generateDungeon, withGatewayLocks } from '../src/generator'
import type { DungeonParameters, DungeonResult, DungeonBoss } from '../src/generator'
import { defaultDungeonBoss, MOBILE_BOSS_IDS, MAX_BOSS_COUNT, BOSS_COUNT_WARN } from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { BOSS_DEFS, BOSS_DEF_LIST } from '../src/generator/boss/bosses'
import { roomSpawnBox } from '../src/generator/map/room'
import { arenaActorPath, resolveActorPath } from '../src/generator/objects/monsterTypes'
import type { AeLevel, AeScript, AeUnit } from '../src/generator/ae/model'
import {
  allIds,
  changedScriptsBeyondAppends,
  idsParam,
  intParam,
  levelsOf,
  placements,
  scriptById,
  scriptsOf,
  strParam,
  withStemPaths
} from './ae'
import { plainParameters } from './params'

const SEED = 31337
/** The floor the suite arms. Middle of the campaign, so its way out is stairs. */
const BOSS_FLOOR = 1
const TILE = 16

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/** Four floors, one arena, no optional layers — a neutral campaign to arm. */
function bareParams(): DungeonParameters {
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
  // locks the last floor, the one leading into the arena — what the old
  // campaign-wide lockFinalRoom default sealed
  return withGatewayLocks(params)
}

/** `bareParams()` with floor `BOSS_FLOOR` given a boss, patched. */
function withBoss(patch: Partial<DungeonBoss> = {}): DungeonParameters {
  const params = bareParams()
  const bosses = Array.from({ length: params.levels }, () => defaultDungeonBoss())
  bosses[BOSS_FLOOR] = { ...defaultDungeonBoss(), enabled: true, ...patch }
  params.levelBoss = bosses
  return params
}

/** A wave table with `monsters` on `tier` and nothing anywhere else. */
function waveOn(tier: number, monsters: Record<string, number>): DungeonBoss['waves'] {
  const waves: DungeonBoss['waves'] = defaultDungeonBoss().waves.map((w) => ({
    ...w,
    monsters: [] as string[],
    monsterMax: {} as Record<string, number>
  }))
  waves[tier] = { ...waves[tier], monsters: Object.keys(monsters), monsterMax: { ...monsters } }
  return waves
}

function levelAt(result: DungeonResult, stem: string): AeLevel {
  const l = levelsOf(result).get(stem)
  expect(l, `${stem} missing`).toBeDefined()
  return l!
}

const floorOf = (r: DungeonResult, i: number): AeLevel => levelAt(r, `floor${i}`)
const arenaOf = (r: DungeonResult, i: number): AeLevel => levelAt(r, `boss${i}`)

const BOSS_PATHS = new Set(BOSS_DEF_LIST.map((d) => d.actorPath))

/** The boss actors standing on a level (not their adds). */
const bossUnits = (l: AeLevel): AeUnit[] => l.units.filter((u) => BOSS_PATHS.has(u.path))

/** A unit or script position in tiles. */
const tilePos = (p: { x: number; y: number }) => ({ x: p.x / TILE, y: p.y / TILE })

/** The death triggers watching a boss on the level. */
function bossDiedTriggers(l: AeLevel): AeScript[] {
  const bosses = new Set(bossUnits(l).map((u) => u.id))
  return scriptsOf(l, 'UnitDestroyedTrigger').filter((t) => idsParam(t, 'Units').some((id) => bosses.has(id)))
}

/** The tier trigger for a health threshold ("Boss 50%" -> 0.5). */
function healthTrigger(l: AeLevel, percent: number): AeScript | undefined {
  return scriptsOf(l, 'ActorHealthTrigger').find((t) => Math.abs((intParam(t, 'Value') ?? -1) - percent / 100) < 1e-9)
}

/** Level-load links (tier 0 on a floor, music, timers). */
const loadLinks = (l: AeLevel): AeScript[] => scriptsOf(l, 'ScriptLink').filter((s) => s.executeOnStart)

const firedIds = (s: AeScript): number[] => s.connections.map(([id]) => id)

interface RoomRect {
  x: number
  y: number
  width: number
  height: number
}

describe('dungeon boss — what must not move', () => {
  it('a campaign with no boss is identical to one without the field', () => {
    // `levelBoss` absent and `levelBoss` present-but-every-floor-disabled must
    // produce the same bytes, which is what makes the feature opt-in.
    const absent = generateOk(bareParams(), SEED)

    const disabled = bareParams()
    disabled.levelBoss = Array.from({ length: disabled.levels }, () => defaultDungeonBoss())
    const off = generateOk(disabled, SEED)

    expect(off.files).toEqual(absent.files)
  }, 60_000)

  it('arming floor 1 leaves floor 0 identical', () => {
    // Floors are built in numeric order off one stream, so a change on floor 1
    // cannot reach backwards. Floors AFTER it are expected to move — a boss
    // floor takes the portal branch, which draws differently — and that is the
    // documented cost, not a bug.
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBoss(), SEED)
    // floor 0's exit now names floor 1's `_boss` file; the level itself is unchanged
    expect(withStemPaths(floorOf(on, 0))).toEqual(withStemPaths(floorOf(off, 0)))
  }, 60_000)

  it('arming a floor leaves every boss arena identical', () => {
    // Arenas draw from ctx.bossRand and the boss rig from ctx.floorBossRand, so
    // the two cannot reach each other however much either one draws.
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBoss({ waves: waveOn(0, { bat: 12 }) }), SEED)
    expect(arenaOf(on, 0)).toEqual(arenaOf(off, 0))
  }, 60_000)

  it('is deterministic', () => {
    const params = withBoss({ waves: waveOn(1, { bat: 18 }) })
    expect(floorOf(generateOk(params, SEED), BOSS_FLOOR)).toEqual(floorOf(generateOk(params, SEED), BOSS_FLOOR))
  }, 60_000)
})

describe('dungeon boss — the floor itself', () => {
  it('places exactly one boss actor, and it is a mobile one', () => {
    const bosses = bossUnits(floorOf(generateOk(withBoss(), SEED), BOSS_FLOOR))
    expect(bosses, 'exactly one boss on the floor').toHaveLength(1)
    const mobilePaths = MOBILE_BOSS_IDS.map((id) => BOSS_DEFS[id as keyof typeof BOSS_DEFS].actorPath)
    expect(mobilePaths).toContain(bosses[0].path)
  }, 60_000)

  it('stands the boss inside a room the party can reach', () => {
    // Its tile is a ctx.reachTargets entry, so a floor that generated at all
    // has already had reachability prove the walk to it. What this adds is
    // that the tile is real room floor, not a wall or a corridor tail.
    const result = generateOk(withBoss(), SEED)
    const [boss] = bossUnits(floorOf(result, BOSS_FLOOR)).map(tilePos)

    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    const rooms = (preview as { rooms: { x: number; y: number; width: number; height: number; type: string; sealed: boolean }[] }).rooms
    const host = rooms.find((r) => boss.x >= r.x && boss.x <= r.x + r.width && boss.y >= r.y && boss.y <= r.y + r.height)
    expect(host, `boss at (${boss.x},${boss.y}) is in no room`).toBeDefined()
    // Never behind the wall it is supposed to open, and never where the party
    // arrives.
    expect(host?.sealed, 'the boss must not be inside the room it unlocks').toBe(false)
    expect(host?.type).not.toBe('Entrance')
  }, 60_000)

  it('turns the way out into a sealed portal room instead of stairs', () => {
    const off = floorOf(generateOk(bareParams(), SEED), BOSS_FLOOR)
    const on = floorOf(generateOk(withBoss(), SEED), BOSS_FLOOR)
    const stairs = (l: AeLevel) => l.units.some((u) => u.path.endsWith('/exit_dn.unit'))

    expect(stairs(off), 'an ordinary floor keeps its stairs').toBe(true)
    expect(stairs(on), 'a boss floor has no stairs at all').toBe(false)
    expect(on.units.some((u) => u.path === 'doodads/generic/teleport_red.unit')).toBe(true)
    expect(scriptsOf(on, 'LevelExit'), 'the portal still leads somewhere').not.toHaveLength(0)
  }, 60_000)

  it('opens the seal on the boss death, and nothing else', () => {
    const level = floorOf(generateOk(withBoss(), SEED), BOSS_FLOOR)

    const died = bossDiedTriggers(level)
    expect(died, 'one death trigger on the boss').toHaveLength(1)

    const destroys = scriptsOf(level, 'DestroyUnits')
    expect(destroys, 'one DestroyUnits, the seal').toHaveLength(1)
    expect(firedIds(died[0])).toContain(destroys[0].id)
    expect(idsParam(destroys[0], 'Units').length).toBeGreaterThan(0)

    // A boss floor has no button: the boss's death is the key.
    expect(scriptsOf(level, 'SetUnitScene'), 'no button plate').toHaveLength(0)
  }, 60_000)

  it('is sealed by the boss alone when the floor is not locked', () => {
    const params = withBoss()
    params.levelLock = undefined
    const level = floorOf(generateOk(params, SEED), BOSS_FLOOR)
    expect(scriptsOf(level, 'DestroyUnits'), 'still sealed').toHaveLength(1)
    expect(scriptsOf(level, 'Variable'), 'no countdown').toHaveLength(0)
  }, 60_000)

  it('gives every unit and script a unique id', () => {
    const level = floorOf(generateOk(withBoss({ waves: waveOn(0, { bat: 9 }) }), SEED), BOSS_FLOOR)
    const ids = allIds(level)
    expect(new Set(ids).size, 'ids must be unique').toBe(ids.length)
  }, 60_000)
})

describe('dungeon boss — on a locked floor (issue #69)', () => {
  /** `withBoss(patch)` with `BOSS_FLOOR` locked too. */
  const lockedBoss = (patch: Partial<DungeonBoss> = {}): DungeonParameters => {
    const params = withBoss(patch)
    params.levelLock = Array.from({ length: params.levels }, (_, i) => ({ enabled: i === BOSS_FLOOR }))
    return params
  }

  const varOf = (s: AeScript): number => idsParam(s, s.cls === 'CheckVariables' ? 'Variable' : 'Variables')[0]

  it('opens the wall only once the boss is dead AND the button is pressed', () => {
    const level = floorOf(generateOk(lockedBoss(), SEED), BOSS_FLOOR)

    // one countdown of two: the boss's death and the one button
    const variables = scriptsOf(level, 'Variable')
    expect(variables).toHaveLength(1)
    expect(intParam(variables[0], 'Value')).toBe(2)
    const changes = scriptsOf(level, 'ChangeVariables')
    const checks = scriptsOf(level, 'CheckVariables')
    expect(changes).toHaveLength(2)
    expect(checks).toHaveLength(2)

    const destroys = scriptsOf(level, 'DestroyUnits')
    expect(destroys, 'one DestroyUnits, the seal').toHaveLength(1)
    for (const check of checks) expect(idsParam(check, 'OnTrue')).toContain(destroys[0].id)

    // the death counts down; it no longer opens the wall directly
    const died = bossDiedTriggers(level)
    expect(died).toHaveLength(1)
    expect(firedIds(died[0])).not.toContain(destroys[0].id)
    expect(firedIds(died[0])).toEqual([changes[0].id, checks[0].id])

    // the button: counts down, plays its cue and animates — but opens nothing itself
    expect(level.units.some((u) => u.path === 'doodads/doors/boss_door_button.unit')).toBe(true)
    const button = scriptsOf(level, 'AreaTrigger').find((t) => firedIds(t).includes(changes[1].id))
    expect(button, 'the button trigger feeds the countdown').toBeDefined()
    const buttonTo = firedIds(button!)
    expect(buttonTo).toContain(checks[1].id)
    expect(buttonTo).not.toContain(destroys[0].id)
    expect(buttonTo).toContain(scriptsOf(level, 'PlaySound')[0].id)
    expect(buttonTo).toContain(scriptsOf(level, 'SetUnitScene')[0].id)

    // and a boss floor keeps the red portal
    expect(level.units.some((u) => u.path === 'doodads/generic/teleport_red.unit')).toBe(true)
  }, 60_000)

  it('feeds a multi-boss floor\'s all-died check into the seal countdown, leaving the death tier on the bosses alone', () => {
    const level = floorOf(generateOk(lockedBoss({ bossCount: 2 }), SEED), BOSS_FLOOR)

    // the all-died Variable(2) plus the seal's Variable(2)
    const variables = scriptsOf(level, 'Variable')
    expect(variables.map((v) => intParam(v, 'Value'))).toEqual([2, 2])
    const [bosses, seal] = variables

    const checks = scriptsOf(level, 'CheckVariables')
    const bossChecks = checks.filter((c) => varOf(c) === bosses.id)
    const sealChecks = checks.filter((c) => varOf(c) === seal.id)
    expect(bossChecks).toHaveLength(2)
    expect(sealChecks).toHaveLength(2)

    const destroy = scriptsOf(level, 'DestroyUnits')[0]
    const sealChanges = scriptsOf(level, 'ChangeVariables').filter((c) => varOf(c) === seal.id)
    // all bosses dead -> one seal step; the wall hangs off the seal only
    expect(idsParam(bossChecks[0], 'OnTrue')).toContain(sealChanges[0].id)
    expect(idsParam(bossChecks[0], 'OnTrue')).not.toContain(destroy.id)
    expect(idsParam(sealChecks[0], 'OnTrue')).toContain(destroy.id)
  }, 60_000)

  it('with several buttons, feeds the button countdown\'s == 0 check into the seal countdown', () => {
    const params = lockedBoss()
    params.levelLock![BOSS_FLOOR] = { enabled: true, buttons: 3 }
    const level = floorOf(generateOk(params, SEED), BOSS_FLOOR)

    expect(level.units.filter((u) => u.path === 'doodads/doors/boss_door_button.unit')).toHaveLength(3)
    // the buttons' Variable(3), then the seal's Variable(2): buttons done + boss dead
    const variables = scriptsOf(level, 'Variable')
    expect(variables.map((v) => intParam(v, 'Value'))).toEqual([3, 2])
    const [buttons, seal] = variables

    const checks = scriptsOf(level, 'CheckVariables')
    const buttonsDone = checks.find((c) => varOf(c) === buttons.id && intParam(c, 'Value') === 0)!
    const sealChanges = scriptsOf(level, 'ChangeVariables').filter((c) => varOf(c) === seal.id)
    const sealChecks = checks.filter((c) => varOf(c) === seal.id)
    const destroy = scriptsOf(level, 'DestroyUnits')
    expect(destroy).toHaveLength(1)
    expect(idsParam(buttonsDone, 'OnTrue')).toEqual([sealChanges[1].id, sealChecks[1].id])
    expect(idsParam(sealChecks[0], 'OnTrue')).toContain(destroy[0].id)
  }, 60_000)

  it('with 0 buttons, is the boss-only floor', () => {
    const zero = lockedBoss()
    zero.levelLock![BOSS_FLOOR] = { enabled: true, buttons: 0 }
    const unlocked = withBoss()
    unlocked.levelLock = undefined
    expect(floorOf(generateOk(zero, SEED), BOSS_FLOOR)).toEqual(floorOf(generateOk(unlocked, SEED), BOSS_FLOOR))
  }, 60_000)

  it('stays finishable across seeds', () => {
    for (const seed of [1, 42, 777, 4242]) {
      const result = generateDungeon(lockedBoss(), seed)
      expect(result.ok, `seed ${seed}`).toBe(true)
    }
  }, 120_000)
})

describe('dungeon boss — the tier rigs', () => {
  const spawnUnits = (l: AeLevel) => scriptsOf(l, 'SpawnUnit')
  const unitType = (s: AeScript) => strParam(s, 'UnitType') ?? ''

  it('arms tier 0 on level load and later tiers on their health triggers', () => {
    const level = floorOf(generateOk(withBoss({ waves: waveOn(0, { bat: 18 }) }), SEED), BOSS_FLOOR)

    // Tier 0 has no entrance choke point on a floor, so it arms on level load.
    expect(loadLinks(level).length).toBeGreaterThan(0)

    const spawns = spawnUnits(level)
    // 18 over 9 points is 2 each.
    expect(spawns).toHaveLength(9)
    expect(spawns.every((s) => s.triggerTimes === 2)).toBe(true)
  }, 60_000)

  it('never applies the arena bodyguard twins (issue #64 part 2) — a floor is not an arena', () => {
    const level = floorOf(generateOk(withBoss({ waves: waveOn(0, { skeleton_archer: 18 }) }), SEED), BOSS_FLOOR)
    const plain = resolveActorPath('skeleton_archer')
    expect(arenaActorPath(plain)).not.toBe(plain) // the archer does have a twin
    expect(new Set(spawnUnits(level).map(unitType))).toEqual(new Set([plain]))
  }, 60_000)

  it('keys a later tier to its health threshold', () => {
    const level = floorOf(generateOk(withBoss({ waves: waveOn(2, { bat: 9 }) }), SEED), BOSS_FLOOR)
    const trigger = healthTrigger(level, 50)
    expect(trigger).toBeDefined()
    // it watches the boss itself — an empty Units list never fires
    expect(idsParam(trigger!, 'Units')).toEqual(bossUnits(level).map((u) => u.id))
    // and the boss gets its health bar
    expect(scriptsOf(level, 'CreateBossBar')).toHaveLength(1)
  }, 60_000)

  it('spawns wave monsters on real interior floor, spread over rooms', () => {
    const result = generateOk(withBoss({ waves: waveOn(0, { bat: 18 }) }), SEED)
    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    expect(preview, 'preview for the boss floor').toBeDefined()

    const spawns = spawnUnits(floorOf(result, BOSS_FLOOR)).map(tilePos)
    expect(spawns.length).toBeGreaterThan(0)

    const rooms = (preview as { rooms: RoomRect[] }).rooms
    for (const p of spawns) {
      const inside = rooms.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)
      expect(inside, `spawn (${p.x},${p.y}) is not in any room`).toBe(true)
    }
    // And they must not all be piled in one place.
    expect(new Set(spawns.map((p) => `${p.x},${p.y}`)).size, 'points must be distinct').toBe(spawns.length)
  }, 60_000)

  it('keeps every wave spawn and the boss off the walls, across seeds', () => {
    // A tile can be open floor and still inside a wall's collision: the
    // 2026-09-22 playtest found every spawn flush against a wall stuck. The
    // rule is the original's own Lair-spawner box, so pin exactly that.
    const params = withBoss({ waves: waveOn(0, { bat: 40 }) })
    for (const seed of [SEED, 1, 4242, 987654, 20260922]) {
      const result = generateOk(params, seed)
      const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
      const rooms = (preview as { rooms: RoomRect[] }).rooms
      const level = floorOf(result, BOSS_FLOOR)

      const points = spawnUnits(level).map(tilePos)
      expect(points.length, `seed ${seed}: some spawns`).toBeGreaterThan(0)
      const bosses = bossUnits(level)
      expect(bosses, `seed ${seed}: the boss actor`).toHaveLength(1)
      points.push(tilePos(bosses[0]))

      for (const p of points) {
        const boxed = rooms.some((r) => {
          const b = roomSpawnBox(r)
          return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
        })
        expect(boxed, `seed ${seed}: (${p.x},${p.y}) is within a wall's reach of its room edge`).toBe(true)
      }
    }
  }, 120_000)

  it('scatters wave pickups over the floor, one tile per copy, off each tier trigger', () => {
    const waves = defaultDungeonBoss().waves
    waves[0] = { ...waves[0], pickups: [{ item: 'health_4', count: 2 }] }
    waves[2] = { ...waves[2], pickups: [{ item: 'mana_2', count: 3 }, { item: 'health_2', count: 1 }] }
    const result = generateOk(withBoss({ waves }), SEED)
    const level = floorOf(result, BOSS_FLOOR)

    const items = spawnUnits(level).filter((s) => unitType(s).startsWith('items/'))
    expect(items, 'one SpawnUnit per copy').toHaveLength(6)
    for (const n of items) expect(n.triggerTimes, 'a drop fires once').toBe(1)

    // Each copy hangs off its tier's trigger: tier 0 on level load, tier 2 at 50%.
    const itemIds = new Set(items.map((n) => n.id))
    const fromLoad = loadLinks(level).flatMap(firedIds).filter((id) => itemIds.has(id))
    expect(fromLoad).toHaveLength(2)
    expect(firedIds(healthTrigger(level, 50)!).filter((id) => itemIds.has(id))).toHaveLength(4)

    // Scattered, not stacked, and never against a wall.
    const points = items.map(tilePos)
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size, 'every copy on its own tile').toBe(6)
    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    const rooms = (preview as { rooms: RoomRect[] }).rooms
    for (const p of points) {
      const boxed = rooms.some((r) => {
        const b = roomSpawnBox(r)
        return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
      })
      expect(boxed, `drop at (${p.x},${p.y}) is within a wall's reach of its room edge`).toBe(true)
    }
  }, 60_000)

  it('turning pickups on moves nothing already on the floor', () => {
    // Built last, drawing last: every existing script keeps its id, position
    // and wiring (a tier trigger only gains connections), and no unit moves.
    const base = withBoss({ waves: waveOn(1, { bat: 12 }) })
    const withDrops = withBoss({ waves: waveOn(1, { bat: 12 }) })
    withDrops.levelBoss![BOSS_FLOOR].waves[3].pickups = [{ item: 'health_4', count: 5 }]

    const before = floorOf(generateOk(base, SEED), BOSS_FLOOR)
    const after = floorOf(generateOk(withDrops, SEED), BOSS_FLOOR)

    expect(changedScriptsBeyondAppends(before, after)).toEqual([])
    expect(after.scripts.length).toBeGreaterThan(before.scripts.length)
    expect(placements(after)).toEqual(placements(before))
  }, 60_000)

  it('ships per-tier traps disabled behind their trigger, and draws nothing without them', () => {
    const untrapped = generateOk(withBoss(), SEED)

    const trapped = withBoss({
      waves: defaultDungeonBoss().waves.map((w, i) =>
        i === 1
          ? { ...w, traps: [{ projectile: 'shooter_arrow', direction: 'up' as const, spread: 0.5, spawnRateMs: 900, count: 3 }] }
          : w
      )
    })
    const level = floorOf(generateOk(trapped, SEED), BOSS_FLOOR)

    const spewers = scriptsOf(level, 'ProjectileSpewer')
    expect(spewers).toHaveLength(3)
    // Tier 1 is not the opening tier, so they wait for their trigger.
    expect(spewers.every((s) => !s.enabled)).toBe(true)

    // And with no trap configured the rig must not touch its stream at all.
    expect(scriptsOf(floorOf(untrapped, BOSS_FLOOR), 'ProjectileSpewer')).toHaveLength(0)
  }, 60_000)

  it('builds invulnerability against the boss actor', () => {
    const level = floorOf(
      generateOk(withBoss({ invulnerability: { enabled: true, seconds: [10, 10, 10], countdown: false } }), SEED),
      BOSS_FLOOR
    )
    const toggles = scriptsOf(level, 'ToggleImmortality')
    expect(toggles.length, 'one on and one off per threshold').toBe(6)
    const boss = bossUnits(level)[0]
    for (const t of toggles) expect(idsParam(t, 'Units')).toEqual([boss.id])
  }, 60_000)
})

describe('dungeon boss — validation', () => {
  const fields = (issues: { field: string }[]) => issues.map((i) => i.field)

  it('accepts a well-formed boss floor', () => {
    const result = validateParameters(withBoss({ waves: waveOn(0, { bat: 10 }) }))
    expect(result.errors, JSON.stringify(result.errors)).toHaveLength(0)
  })

  it('rejects a stationary boss', () => {
    // A boss that cannot chase is one the party walks away from — and on a
    // sealed floor, walking away means never opening the way out.
    const stationary = BOSS_DEF_LIST.filter((d) => !d.mobile).map((d) => d.id)
    expect(stationary.sort(), 'the two dragons and the queen').toEqual(['boss_dragon', 'boss_dragon_hwr', 'boss_queen'])

    const result = validateParameters(withBoss({ bossPool: ['boss_queen'] }))
    expect(fields(result.errors)).toContain(`levelBoss.${BOSS_FLOOR}.bossPool`)
  })

  it('rejects a bad pickup row and warns on a duplicate one', () => {
    const waves = defaultDungeonBoss().waves
    waves[1] = { ...waves[1], pickups: [{ item: 'nonsense', count: 1 }, { item: 'health_4', count: 0 }] }
    expect(fields(validateParameters(withBoss({ waves })).errors)).toEqual(
      expect.arrayContaining([
        `levelBoss.${BOSS_FLOOR}.waves.1.pickups.0.item`,
        `levelBoss.${BOSS_FLOOR}.waves.1.pickups.1.count`
      ])
    )

    const dup = defaultDungeonBoss().waves
    dup[1] = { ...dup[1], pickups: [{ item: 'health_4', count: 1 }, { item: 'health_4', count: 2 }] }
    const result = validateParameters(withBoss({ waves: dup }))
    expect(result.errors).toHaveLength(0)
    expect(fields(result.warnings)).toContain(`levelBoss.${BOSS_FLOOR}.waves.1.pickups.1.item`)
  })

  it('rejects an empty pool', () => {
    expect(fields(validateParameters(withBoss({ bossPool: [] })).errors)).toContain(
      `levelBoss.${BOSS_FLOOR}.bossPool`
    )
  })

  it('rejects invulnerability and timer mode on the same floor', () => {
    // Both announce a countdown on the same level; the issue says enabling one
    // disables the other, and an error beats silently dropping either.
    const params = withBoss({
      invulnerability: { enabled: true, seconds: [10, 10, 10], countdown: true }
    })
    const timers = params.levelTimers as { enabled: boolean; seconds: number }[]
    timers[BOSS_FLOOR] = { ...timers[BOSS_FLOOR], enabled: true }

    expect(fields(validateParameters(params).errors)).toContain(
      `levelBoss.${BOSS_FLOOR}.invulnerability`
    )
  })

  it('accepts a multi-boss floor with both invulnerability and timer mode — the error is single-boss only (issue #64 part 1)', () => {
    const params = withBoss({
      bossCount: 2,
      bossPool: ['boss_knight', 'boss_lich'],
      invulnerability: { enabled: true, seconds: [10, 10, 10], countdown: true }
    })
    const timers = params.levelTimers as { enabled: boolean; seconds: number }[]
    timers[BOSS_FLOOR] = { ...timers[BOSS_FLOOR], enabled: true }

    expect(fields(validateParameters(params).errors)).not.toContain(`levelBoss.${BOSS_FLOOR}.invulnerability`)
  })

  it(`accepts bossCount 1..${MAX_BOSS_COUNT} and rejects out-of-range or non-integer values`, () => {
    for (const n of [1, 2, 4, MAX_BOSS_COUNT]) {
      expect(fields(validateParameters(withBoss({ bossCount: n })).errors)).not.toContain(`levelBoss.${BOSS_FLOOR}.bossCount`)
    }
    for (const bad of [0, -1, 2.5, MAX_BOSS_COUNT + 1]) {
      expect(fields(validateParameters(withBoss({ bossCount: bad })).errors)).toContain(`levelBoss.${BOSS_FLOOR}.bossCount`)
    }
  })

  it('lineup mode: does not read bossPool, restricts to MOBILE_BOSS_IDS, and totals 1..MAX_BOSS_COUNT (issue #64 follow-up)', () => {
    const ok = withBoss({ bossPool: [], bossSelection: 'lineup', bossLineup: { boss_knight: 2, boss_lich: 1 } })
    const okResult = validateParameters(ok)
    expect(fields(okResult.errors)).not.toContain(`levelBoss.${BOSS_FLOOR}.bossPool`)
    expect(fields(okResult.errors)).not.toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)

    // Dragon and queen are not mobile — the same restriction bossPool already
    // carries — so a lineup naming either is an error, not the "cannot repeat
    // a unique boss" one.
    const stationary = withBoss({ bossSelection: 'lineup', bossLineup: { boss_dragon: 1 } })
    expect(fields(validateParameters(stationary).errors)).toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)

    const empty = withBoss({ bossSelection: 'lineup', bossLineup: {} })
    expect(fields(validateParameters(empty).errors)).toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)

    const tooMany = withBoss({ bossSelection: 'lineup', bossLineup: { boss_knight: MAX_BOSS_COUNT + 1 } })
    expect(fields(validateParameters(tooMany).errors)).toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)
  })

  it('warns, but does not error, above BOSS_COUNT_WARN in floor lineup mode', () => {
    const params = withBoss({ bossSelection: 'lineup', bossLineup: { boss_knight: BOSS_COUNT_WARN + 1 } })
    const result = validateParameters(params)
    expect(fields(result.errors)).not.toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)
    expect(fields(result.warnings)).toContain(`levelBoss.${BOSS_FLOOR}.bossLineup`)
  })

  // The "ignored settings still have content" warning was removed: the
  // renderer now hides 75/50/25% content and invulnerability entirely once a
  // floor's boss count is >= 2, so a warning pointing at a hidden field would
  // be noise. Values still round-trip losslessly. See the "Validation noise"
  // section of the issue #64 UI follow-up plan.
  it('does not error when a multi-boss floor still carries 75/50/25% content or invulnerability', () => {
    const waves = waveOn(1, { bat: 5 })
    const result = validateParameters(
      withBoss({
        bossCount: 2,
        bossPool: ['boss_knight', 'boss_lich'],
        waves,
        invulnerability: { enabled: true, seconds: [10, 10, 10], countdown: true }
      })
    )
    expect(result.errors).toEqual([])
  })
})

describe('dungeon boss — parameters.txt', () => {
  it('round-trips a boss floor', () => {
    const params = withBoss({
      bossPool: ['boss_knight', 'boss_lich'],
      monsterMultiplier: 1.5,
      waves: (() => {
        const waves = waveOn(1, { bat: 20, skeleton_warrior: 6 })
        waves[1] = {
          ...waves[1],
          defaultIntervalMs: 900,
          intervalMs: { bat: 400 },
          buffs: [{ buff: 'bloodlust', target: 'monsters' }],
          traps: [{ projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3 }]
        }
        return waves
      })(),
      invulnerability: { enabled: true, seconds: [20, 15, 10], countdown: false }
    })

    const text = serializeParametersTxt(params)
    expect(text).toMatch(/^bossFloor1=1\|boss_knight,boss_lich\|1\.500000$/m)
    expect(text).toMatch(/^bossFloor1Invuln=20,15,10$/m)
    expect(text).toMatch(/^bossFloor1InvulnCountdown=0$/m)
    expect(text).toMatch(/^bossFloor1Wave2=bat,skeleton_warrior\|900\|bat:20,skeleton_warrior:6\|bat:400$/m)
    expect(text).toMatch(/^bossFloor1WaveBuff2=bloodlust:monsters$/m)
    expect(text).toMatch(/^bossFloor1WaveTrap2=shooter_arrow:up:0.5:900:3$/m)

    const parsed = parseParametersTxt(text, bareParams())
    expect(parsed.unknownKeys).toEqual([])
    const back = parsed.params.levelBoss?.[BOSS_FLOOR]
    expect(back?.enabled).toBe(true)
    expect(back?.bossPool).toEqual(['boss_knight', 'boss_lich'])
    expect(back?.monsterMultiplier).toBeCloseTo(1.5)
    expect(back?.invulnerability).toEqual({ enabled: true, seconds: [20, 15, 10], countdown: false })
    expect(back?.waves[1].monsters).toEqual(['bat', 'skeleton_warrior'])
    expect(back?.waves[1].monsterMax).toEqual({ bat: 20, skeleton_warrior: 6 })
    expect(back?.waves[1].defaultIntervalMs).toBe(900)
    expect(back?.waves[1].intervalMs).toEqual({ bat: 400 })
    expect(back?.waves[1].buffs).toEqual([{ buff: 'bloodlust', target: 'monsters' }])
    expect(back?.waves[1].traps).toEqual([
      { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3 }
    ])
  })

  it('writes the bossCount as a 4th field only when it differs from 1, and round-trips it (issue #64 part 1)', () => {
    const stockText = serializeParametersTxt(withBoss({}))
    expect(stockText).toMatch(/^bossFloor1=1\|[^|]*\|[^|]*$/m) // exactly 3 fields, no trailing |N

    const params = withBoss({ bossCount: 3, bossPool: ['boss_knight', 'boss_lich'] })
    const text = serializeParametersTxt(params)
    expect(text).toMatch(/^bossFloor1=1\|boss_knight,boss_lich\|1\.000000\|3$/m)

    const parsed = parseParametersTxt(text, bareParams())
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelBoss?.[BOSS_FLOOR].bossCount).toBe(3)

    // An old 3-field line parses to bossCount undefined (absent = 1).
    const legacy = text.replace('|3', '')
    const legacyParsed = parseParametersTxt(legacy, bareParams())
    expect(legacyParsed.params.levelBoss?.[BOSS_FLOOR].bossCount).toBeUndefined()
  })

  it('writes bossFloor<i>Selection/Lineup only in lineup mode, in BOSS_IDS order, and round-trips (issue #64 follow-up)', () => {
    const stockText = serializeParametersTxt(withBoss({}))
    expect(stockText).not.toMatch(/bossFloor1Selection=/)
    expect(stockText).not.toMatch(/bossFloor1Lineup=/)

    const params = withBoss({
      bossSelection: 'lineup',
      // Deliberately out of BOSS_IDS order in the source object.
      bossLineup: { boss_worm: 1, boss_knight: 2 }
    })
    const text = serializeParametersTxt(params)
    expect(text).toMatch(/^bossFloor1Selection=lineup$/m)
    expect(text).toMatch(/^bossFloor1Lineup=boss_knight:2,boss_worm:1$/m)

    const parsed = parseParametersTxt(text, bareParams())
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelBoss?.[BOSS_FLOOR].bossSelection).toBe('lineup')
    expect(parsed.params.levelBoss?.[BOSS_FLOOR].bossLineup).toEqual({ boss_knight: 2, boss_worm: 1 })

    // A legacy file with neither key parses to 'random' (absent).
    const legacyParsed = parseParametersTxt(stockText, bareParams())
    expect(legacyParsed.params.levelBoss?.[BOSS_FLOOR]?.bossSelection).toBeUndefined()
  })

  it('round-trips wave pickups, and writes none for a tier without them', () => {
    const waves = defaultDungeonBoss().waves
    waves[2] = { ...waves[2], pickups: [{ item: 'health_4', count: 2 }, { item: 'mana_2', count: 1 }] }
    const text = serializeParametersTxt(withBoss({ waves }))
    expect(text).toMatch(/^bossFloor1WavePickup3=health_4:2\|mana_2:1$/m)
    expect(text.match(/^bossFloor1WavePickup/gm), 'only the tier that drops').toHaveLength(1)

    const parsed = parseParametersTxt(text, bareParams())
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelBoss?.[BOSS_FLOOR].waves[2].pickups).toEqual([
      { item: 'health_4', count: 2 },
      { item: 'mana_2', count: 1 }
    ])
    // Not swallowed by the waveN branch, and an unknown item is reported, not fatal.
    const bad = parseParametersTxt('bossFloor1=1\nbossFloor1WavePickup1=nonsense:3|health_4', bareParams())
    expect(bad.unknownKeys.some((k) => /nonsense/.test(k))).toBe(true)
    expect(bad.params.levelBoss?.[BOSS_FLOOR].waves[0].pickups).toEqual([{ item: 'health_4', count: 1 }])
  })

  it('writes not one key for a campaign with no boss floor', () => {
    // The byte-identity contract: a stock export must look exactly as it did
    // before the feature existed.
    expect(serializeParametersTxt(bareParams())).not.toMatch(/bossFloor/i)
  })

  it('does not let a bossFloor key be swallowed by the fight dispatcher', () => {
    // `boss(\d*)` matches an empty index, so `bossfloor1` would otherwise read
    // as fight 0 with the suffix "floor1". The floor branch is tested first.
    const parsed = parseParametersTxt('bossFloor1=1|boss_knight|1.0', bareParams())
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelBoss?.[1]?.enabled).toBe(true)
    expect(parsed.params.boss.fights[0].arena.bossPool).toEqual(bareParams().boss.fights[0].arena.bossPool)
  })

  it('reports a malformed value rather than throwing', () => {
    const parsed = parseParametersTxt(
      ['bossFloor1=1|not_a_boss|abc', 'bossFloor1Wave1=not_a_monster|1500||'].join('\r\n'),
      bareParams()
    )
    expect(parsed.unknownKeys.join(' ')).toContain('boss "not_a_boss"')
    expect(parsed.unknownKeys.join(' ')).toContain('multiplier "abc"')
    expect(parsed.unknownKeys.join(' ')).toContain('monster "not_a_monster"')
    // The enabled flag still took, and the defaults survived the bad fields.
    expect(parsed.params.levelBoss?.[1]?.enabled).toBe(true)
    expect(parsed.params.levelBoss?.[1]?.monsterMultiplier).toBe(1.0)
  })
})

describe('dungeon boss — robustness', () => {
  /**
   * The gateway room of a boss floor must be a DEAD END for the seal to close
   * it, which is a shape the room placer only sometimes rolls. That is a real
   * risk of the portal decision: if dead ends were rare, boss floors would
   * burn through MAX_LEVEL_ATTEMPTS and fail. This pins that they do not, on
   * stock room counts, across a spread of seeds.
   */
  it('generates on every seed, with the seal holding each time', () => {
    for (const seed of [1, 7, 42, SEED, 20260922]) {
      const result = generateOk(withBoss({ waves: waveOn(0, { bat: 9 }) }), seed)
      const level = floorOf(result, BOSS_FLOOR)

      expect(scriptsOf(level, 'DestroyUnits'), `seed ${seed}: sealed`).toHaveLength(1)
      expect(bossUnits(level), `seed ${seed}: one boss`).toHaveLength(1)

      // `sealHolds` runs inside the constructor and rejects a floor whose exit
      // is reachable with the wall up, so a floor that came back at all has
      // already proved its gate. What this adds is that it came back.
      const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
      expect(preview?.rooms.some((r) => r.sealed), `seed ${seed}: a sealed room`).toBe(true)
    }
  }, 120_000)
})
