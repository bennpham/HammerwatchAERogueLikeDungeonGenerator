/**
 * Dungeon → Boss (issue #61) — a mobile boss standing on an ordinary generated
 * dungeon floor, with the floor's way out sealed until it dies.
 *
 * Four things are being proved.
 *
 * First, the byte-identity contract, which is subtler here than for any other
 * per-floor layer: a boss floor is NOT purely additive. It takes a different
 * branch of `map/level.ts` — a sealed portal room instead of a stairs room — so
 * enabling a boss moves that floor and every floor after it. What must hold is
 * that a floor with NO boss draws exactly what it always drew, and that the
 * boss arenas, on their own stream, never move at all.
 *
 * Second, the thing that makes the whole feature possible: a boss actor on an
 * ordinary floor, so the engine fires the `Boss ...` events there and every
 * tier-keyed rig from `boss/` can be reused unchanged.
 *
 * Third, that the floor stays FINISHABLE. The way out is sealed and only the
 * boss's death opens it, so an unreachable boss is an unwinnable floor — hence
 * the boss tile being a `ctx.reachTargets` entry, which this pins directly.
 *
 * Fourth, placement: wave monsters on real interior floor, never in a wall,
 * under the north-wall overhang, or on a prefab.
 */

import { describe, expect, it } from 'vitest'
import { generateDungeon, withGatewayLocks } from '../src/generator'
import type { DungeonParameters, DungeonResult, DungeonBoss } from '../src/generator'
import { defaultDungeonBoss, MOBILE_BOSS_IDS, MAX_BOSS_COUNT, BOSS_COUNT_WARN } from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { BOSS_DEFS, BOSS_DEF_LIST } from '../src/generator/boss/bosses'
import { roomSpawnBox } from '../src/generator/map/room'
import { allIds, badIntArray, nodesOfType } from './xmlHelpers'
import { plainParameters } from './params'

const SEED = 31337
/** The floor the suite arms. Middle of the campaign, so its way out is stairs. */
const BOSS_FLOOR = 1

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

function fileAt(result: DungeonResult, path: string): string {
  const file = result.files.find((f) => f.path === path)
  expect(file, `${path} missing`).toBeDefined()
  return (file as { content: string }).content
}

const floorXml = (r: DungeonResult, i: number): string => fileAt(r, `levels/level${i}.xml`)
const arenaXml = (r: DungeonResult, i: number): string => fileAt(r, `levels/boss${i}.xml`)

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

interface RoomRect {
  x: number
  y: number
  width: number
  height: number
}

/** A script node's position — the generator writes `<float name="x">`/`"y"`. */
function nodePos(body: string): { x: number; y: number } {
  return {
    x: Number(/<float name="x">(-?[\d.]+)<\/float>/.exec(body)?.[1]),
    y: Number(/<float name="y">(-?[\d.]+)<\/float>/.exec(body)?.[1])
  }
}

/** Every `<dictionary>` in the actors section, as its `type` string. */
function actorTypes(xml: string): string[] {
  const section = /<array name="actors">([\s\S]*?)<\/array>/.exec(xml)
  if (section === null) return []
  return [...section[1].matchAll(/<string name="type">([^<]*)<\/string>/g)].map((m) => m[1])
}

describe('dungeon boss — what must not move', () => {
  it('a campaign with no boss is byte-identical to one without the field', () => {
    // `levelBoss` absent and `levelBoss` present-but-every-floor-disabled must
    // produce the same bytes, which is what makes the feature opt-in.
    const absent = generateOk(bareParams(), SEED)

    const disabled = bareParams()
    disabled.levelBoss = Array.from({ length: disabled.levels }, () => defaultDungeonBoss())
    const off = generateOk(disabled, SEED)

    expect(off.files.map((f) => f.path)).toEqual(absent.files.map((f) => f.path))
    for (const file of absent.files) {
      expect(fileAt(off, file.path), file.path).toBe(file.content)
    }
  }, 60_000)

  it('arming floor 1 leaves floor 0 byte-identical', () => {
    // Floors are built in numeric order off one stream, so a change on floor 1
    // cannot reach backwards. Floors AFTER it are expected to move — a boss
    // floor takes the portal branch, which draws differently — and that is the
    // documented cost, not a bug.
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBoss(), SEED)

    expect(floorXml(on, 0)).toBe(floorXml(off, 0))
  }, 60_000)

  it('arming a floor leaves every boss arena byte-identical', () => {
    // Arenas draw from ctx.bossRand and the boss rig from ctx.floorBossRand, so
    // the two cannot reach each other however much either one draws.
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withBoss({ waves: waveOn(0, { bat1: 12 }) }), SEED)

    expect(arenaXml(on, 0)).toBe(arenaXml(off, 0))
  }, 60_000)

  it('is deterministic', () => {
    const params = withBoss({ waves: waveOn(1, { bat1: 18 }) })
    expect(floorXml(generateOk(params, SEED), BOSS_FLOOR)).toBe(
      floorXml(generateOk(params, SEED), BOSS_FLOOR)
    )
  }, 60_000)
})

describe('dungeon boss — the floor itself', () => {
  it('places exactly one boss actor, and it is a mobile one', () => {
    const xml = floorXml(generateOk(withBoss(), SEED), BOSS_FLOOR)
    const bosses = actorTypes(xml).filter((t) => t.startsWith('actors/boss_'))
    expect(bosses, 'exactly one boss on the floor').toHaveLength(1)

    const mobilePaths = MOBILE_BOSS_IDS.map((id) => BOSS_DEFS[id as keyof typeof BOSS_DEFS].actorPath)
    expect(mobilePaths).toContain(bosses[0])
  }, 60_000)

  it('stands the boss inside a room the party can reach', () => {
    // Its tile is a ctx.reachTargets entry, so a floor that generated at all
    // has already had reachability prove the walk to it — the way out opens
    // only on its death, so an unreachable boss is an unfinishable floor.
    // What this adds is that the tile is real room floor, not a wall or a
    // corridor tail.
    const result = generateOk(withBoss(), SEED)
    const xml = floorXml(result, BOSS_FLOOR)

    const section = /<array name="actors">([\s\S]*?)<\/array>/.exec(xml)
    const boss = [...(section?.[1] ?? '').matchAll(
      /<int name="id">[^<]*<\/int>\s*<string name="type">(actors\/boss_[^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
    )].map((m) => ({ x: Number(m[2]), y: Number(m[3]) }))
    expect(boss, 'the boss actor, with a position').toHaveLength(1)

    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    const rooms = (preview as { rooms: { x: number; y: number; width: number; height: number; type: string; sealed: boolean }[] }).rooms
    const host = rooms.find(
      (r) => boss[0].x >= r.x && boss[0].x <= r.x + r.width && boss[0].y >= r.y && boss[0].y <= r.y + r.height
    )
    expect(host, `boss at (${boss[0].x},${boss[0].y}) is in no room`).toBeDefined()
    // Never behind the wall it is supposed to open, and never where the party
    // materialises blind.
    expect(host?.sealed, 'the boss must not be inside the room it unlocks').toBe(false)
    expect(host?.type).not.toBe('Entrance')
  }, 60_000)

  it('turns the way out into a sealed portal room instead of stairs', () => {
    // The floor's next slot is another dungeon floor, so without a boss it gets
    // the stairs prefab; with one it must get the red portal, in a dead-end
    // room barred by a destructible wall.
    const off = floorXml(generateOk(bareParams(), SEED), BOSS_FLOOR)
    const on = floorXml(generateOk(withBoss(), SEED), BOSS_FLOOR)

    // `_exit_h_dn` is the stairs-down doodad art; the portal uses its own.
    expect(off, 'an ordinary floor keeps its stairs').toMatch(/_exit_h_dn/)
    expect(on, 'a boss floor has no stairs at all').not.toMatch(/_exit_h_dn/)
    expect(nodesOfType(on, 'LevelExitArea'), 'the portal still leads somewhere').not.toHaveLength(0)
  }, 60_000)

  it('opens the seal on Boss Died, and nothing else', () => {
    const xml = floorXml(generateOk(withBoss(), SEED), BOSS_FLOOR)

    const died = nodesOfType(xml, 'GlobalEventTrigger').filter(
      (n) => stringParam(n.body, 'parameters') === 'Boss Died'
    )
    expect(died, 'one Boss Died trigger').toHaveLength(1)

    const destroys = nodesOfType(xml, 'DestroyObject')
    expect(destroys, 'one DestroyObject, the seal').toHaveLength(1)
    expect((intArr(died[0].body, 'connections') ?? [])).toContain(destroys[0].id)
    expect(intArr(destroys[0].body, 'static')?.length ?? 0).toBeGreaterThan(0)

    // A boss floor has no button: the boss's death is the key.
    expect(nodesOfType(xml, 'ChangeDoodadState'), 'no button plate').toHaveLength(0)
  }, 60_000)

  it('is sealed by the boss alone when the floor is not locked', () => {
    const params = withBoss()
    params.levelLock = undefined
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)

    expect(nodesOfType(xml, 'DestroyObject'), 'still sealed').toHaveLength(1)
    expect(nodesOfType(xml, 'Variable'), 'no countdown').toHaveLength(0)
  }, 60_000)

  it('emits clean XML with unique script ids', () => {
    const xml = floorXml(generateOk(withBoss({ waves: waveOn(0, { bat1: 9 }) }), SEED), BOSS_FLOOR)
    expect(badIntArray(xml)).toBeNull()

    const scripting = /<array name="scripting">([\s\S]*?)<\/array>/.exec(xml)
    const ids = scripting === null ? [] : allIds(scripting[1])
    expect(new Set(ids).size, 'script node ids must be unique').toBe(ids.length)
  }, 60_000)
})

describe('dungeon boss — on a locked floor (issue #69)', () => {
  /** `withBoss(patch)` with `BOSS_FLOOR` locked too. */
  const lockedBoss = (patch: Partial<DungeonBoss> = {}): DungeonParameters => {
    const params = withBoss(patch)
    params.levelLock = Array.from({ length: params.levels }, (_, i) => ({ enabled: i === BOSS_FLOOR }))
    return params
  }

  const staticIn = (body: string, dict: string): number[] => {
    const m = new RegExp(`<dictionary name="${dict}">\\s*(?:<int-arr name="static">([^<]*)</int-arr>)?`).exec(body)
    return m?.[1] === undefined ? [] : m[1].split(' ').map(Number)
  }

  it('opens the wall only once the boss is dead AND the button is pressed', () => {
    const xml = floorXml(generateOk(lockedBoss(), SEED), BOSS_FLOOR)

    // one countdown of two: the boss's death and the one button
    const variables = nodesOfType(xml, 'Variable')
    expect(variables).toHaveLength(1)
    expect(variables[0].body).toContain('<int name="parameters">2</int>')
    const changes = nodesOfType(xml, 'ChangeVariable')
    const checks = nodesOfType(xml, 'CheckVariable')
    expect(changes).toHaveLength(2)
    expect(checks).toHaveLength(2)

    const destroys = nodesOfType(xml, 'DestroyObject')
    expect(destroys, 'one DestroyObject, the seal').toHaveLength(1)
    for (const check of checks) expect(staticIn(check.body, 'on-true')).toContain(destroys[0].id)

    // Boss Died counts down; it no longer opens the wall directly
    const died = nodesOfType(xml, 'GlobalEventTrigger').filter((n) => stringParam(n.body, 'parameters') === 'Boss Died')
    expect(died).toHaveLength(1)
    const diedTo = intArr(died[0].body, 'connections') ?? []
    expect(diedTo).not.toContain(destroys[0].id)
    expect(diedTo).toEqual([changes[0].id, checks[0].id])

    // the button: counts down, plays its cue and animates — but opens nothing itself
    expect(xml).toContain('doodads/special/boss_door_button.xml')
    const button = nodesOfType(xml, 'AreaTrigger').find((t) =>
      (intArr(t.body, 'connections') ?? []).includes(changes[1].id)
    )
    expect(button, 'the button trigger feeds the countdown').toBeDefined()
    const buttonTo = intArr(button!.body, 'connections') ?? []
    expect(buttonTo).toContain(checks[1].id)
    expect(buttonTo).not.toContain(destroys[0].id)
    expect(buttonTo).toContain(nodesOfType(xml, 'PlaySound')[0].id)
    expect(buttonTo).toContain(nodesOfType(xml, 'ChangeDoodadState')[0].id)

    // and a boss floor keeps the red portal
    expect(xml).toContain('exit_teleport_boss.xml')
    expect(badIntArray(xml)).toBeNull()
  }, 60_000)

  it('feeds a multi-boss floor\'s all-died check into the seal countdown, leaving the death tier on the bosses alone', () => {
    const xml = floorXml(generateOk(lockedBoss({ bossCount: 2 }), SEED), BOSS_FLOOR)

    // the all-died Variable(2) plus the seal's Variable(2)
    const variables = nodesOfType(xml, 'Variable')
    expect(variables.map((v) => /<int name="parameters">(\d+)<\/int>/.exec(v.body)?.[1])).toEqual(['2', '2'])
    const [bosses, seal] = variables

    const checks = nodesOfType(xml, 'CheckVariable')
    const bossChecks = checks.filter((c) => staticIn(c.body, 'vars')[0] === bosses.id)
    const sealChecks = checks.filter((c) => staticIn(c.body, 'vars')[0] === seal.id)
    expect(bossChecks).toHaveLength(2)
    expect(sealChecks).toHaveLength(2)

    const destroy = nodesOfType(xml, 'DestroyObject')[0]
    const sealChanges = nodesOfType(xml, 'ChangeVariable').filter((c) => staticIn(c.body, 'vars')[0] === seal.id)
    // all bosses dead -> one seal step; the wall hangs off the seal only
    expect(staticIn(bossChecks[0].body, 'on-true')).toContain(sealChanges[0].id)
    expect(staticIn(bossChecks[0].body, 'on-true')).not.toContain(destroy.id)
    expect(staticIn(sealChecks[0].body, 'on-true')).toContain(destroy.id)
  }, 60_000)

  it('with several buttons, feeds the button countdown\'s == 0 check into the seal countdown', () => {
    const params = lockedBoss()
    params.levelLock![BOSS_FLOOR] = { enabled: true, buttons: 3 }
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)

    expect(xml.match(/doodads\/special\/boss_door_button\.xml/g) ?? []).toHaveLength(3)
    // the buttons' Variable(3), then the seal's Variable(2): buttons done + boss dead
    const variables = nodesOfType(xml, 'Variable')
    expect(variables.map((v) => /<int name="parameters">(\d+)<\/int>/.exec(v.body)?.[1])).toEqual(['3', '2'])
    const [buttons, seal] = variables

    const checks = nodesOfType(xml, 'CheckVariable')
    const buttonsDone = checks.find(
      (c) => staticIn(c.body, 'vars')[0] === buttons.id && c.body.includes('<int name="cmp-val">0</int>')
    )!
    const sealChanges = nodesOfType(xml, 'ChangeVariable').filter((c) => staticIn(c.body, 'vars')[0] === seal.id)
    const sealChecks = checks.filter((c) => staticIn(c.body, 'vars')[0] === seal.id)
    const destroy = nodesOfType(xml, 'DestroyObject')
    expect(destroy).toHaveLength(1)
    expect(staticIn(buttonsDone.body, 'on-true')).toEqual([sealChanges[1].id, sealChecks[1].id])
    expect(staticIn(sealChecks[0].body, 'on-true')).toContain(destroy[0].id)
    expect(badIntArray(xml)).toBeNull()
  }, 60_000)

  it('with 0 buttons, is the boss-only floor', () => {
    const zero = lockedBoss()
    zero.levelLock![BOSS_FLOOR] = { enabled: true, buttons: 0 }
    const unlocked = withBoss()
    unlocked.levelLock = undefined
    expect(floorXml(generateOk(zero, SEED), BOSS_FLOOR)).toEqual(floorXml(generateOk(unlocked, SEED), BOSS_FLOOR))
  }, 60_000)

  it('stays finishable across seeds', () => {
    for (const seed of [1, 42, 777, 4242]) {
      const result = generateDungeon(lockedBoss(), seed)
      expect(result.ok, `seed ${seed}`).toBe(true)
    }
  }, 120_000)
})

describe('dungeon boss — the tier rigs', () => {
  it('arms tier 0 on LevelLoaded and later tiers on their health events', () => {
    const params = withBoss({ waves: waveOn(0, { bat1: 18 }) })
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)

    const events = nodesOfType(xml, 'GlobalEventTrigger').map((n) => stringParam(n.body, 'parameters'))
    // Tier 0 has no entrance choke point on a floor, so it arms on level load.
    expect(events).toContain('LevelLoaded')

    const spawns = nodesOfType(xml, 'SpawnObject')
    // 18 over 9 points is 2 each.
    expect(spawns).toHaveLength(9)
    expect(spawns.every((s) => intParam(s.body, 'trigger-times') === 2)).toBe(true)
  }, 60_000)

  it('never applies the arena bodyguard twins (issue #64 part 2) — a floor is not an arena', () => {
    const params = withBoss({ waves: waveOn(0, { archer1: 18 }) })
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)
    const paths = nodesOfType(xml, 'SpawnObject').map((n) => stringParam(n.body, 'parameters'))
    expect(new Set(paths)).toEqual(new Set(['actors/archer_1.xml']))
    expect(xml).not.toContain('actors/boss_knight/archer_1.xml')
  }, 60_000)

  it('keys a later tier to its Boss xx% event', () => {
    const params = withBoss({ waves: waveOn(2, { bat1: 9 }) })
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)

    const events = nodesOfType(xml, 'GlobalEventTrigger').map((n) => stringParam(n.body, 'parameters'))
    expect(events).toContain('Boss 50%')
  }, 60_000)

  it('spawns wave monsters on real interior floor, spread over rooms', () => {
    const params = withBoss({ waves: waveOn(0, { bat1: 18 }) })
    const result = generateOk(params, SEED)
    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    expect(preview, 'preview for the boss floor').toBeDefined()

    const xml = floorXml(result, BOSS_FLOOR)
    const spawns = nodesOfType(xml, 'SpawnObject').map((n) => ({
      x: Number(/<float name="x">(-?[\d.]+)<\/float>/.exec(n.body)?.[1]),
      y: Number(/<float name="y">(-?[\d.]+)<\/float>/.exec(n.body)?.[1])
    }))
    expect(spawns.length).toBeGreaterThan(0)

    // Every point must sit inside some room, below that room's overhang band.
    const rooms = (preview as { rooms: { x: number; y: number; width: number; height: number }[] }).rooms
    for (const p of spawns) {
      const inside = rooms.some(
        (r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
      )
      expect(inside, `spawn (${p.x},${p.y}) is not in any room`).toBe(true)
    }

    // And they must not all be piled in one place.
    expect(new Set(spawns.map((p) => `${p.x},${p.y}`)).size, 'points must be distinct').toBe(spawns.length)
  }, 60_000)

  it('keeps every wave spawn and the boss off the walls, across seeds', () => {
    // A tile can be open floor and still inside a wall's collision: the
    // 2026-09-22 playtest found every spawn flush against a wall stuck. The
    // rule is the original's own Lair-spawner box, so pin exactly that.
    const params = withBoss({ waves: waveOn(0, { bat1: 40 }) })
    for (const seed of [SEED, 1, 4242, 987654, 20260922]) {
      const result = generateOk(params, seed)
      const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
      const rooms = (preview as { rooms: RoomRect[] }).rooms
      const xml = floorXml(result, BOSS_FLOOR)

      const points = nodesOfType(xml, 'SpawnObject').map((n) => nodePos(n.body))
      expect(points.length, `seed ${seed}: some spawns`).toBeGreaterThan(0)

      const section = /<array name="actors">([\s\S]*?)<\/array>/.exec(xml)?.[1] ?? ''
      const boss = /<string name="type">actors\/boss_[^<]*<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/.exec(section)
      expect(boss, `seed ${seed}: the boss actor`).not.toBeNull()
      points.push({ x: Number(boss?.[1]), y: Number(boss?.[2]) })

      for (const p of points) {
        const boxed = rooms.some((r) => {
          const b = roomSpawnBox(r)
          return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
        })
        expect(boxed, `seed ${seed}: (${p.x},${p.y}) is within a wall's reach of its room edge`).toBe(true)
      }
    }
  }, 120_000)

  it('respawns and checkpoints the party on LevelStart, never off the map', () => {
    // RespawnPlayers and Checkpoint teleport the party to THEIR OWN position.
    // The rig used to put them in the editor marker column past the map's
    // east edge, and the party was stranded outside the dungeon.
    const params = withBoss({ checkpoints: { respawnPlayers: '75-50-25-dead', saveGame: '50' } })
    const result = generateOk(params, SEED)
    const xml = floorXml(result, BOSS_FLOOR)

    const starts = nodesOfType(xml, 'LevelStart').map((n) => nodePos(n.body))
    expect(starts).toHaveLength(1)
    const at = (p: { x: number; y: number }): boolean => p.x === starts[0].x && p.y === starts[0].y

    // One per milestone from the rig, plus the floor's own arrival respawn in
    // the Entrance prefab, which is left where the original put it.
    const respawns = nodesOfType(xml, 'RespawnPlayers').map((n) => nodePos(n.body))
    expect(respawns).toHaveLength(5)
    expect(respawns.filter(at), 'the rig respawns, stacked on LevelStart').toHaveLength(4)

    const checkpoints = nodesOfType(xml, 'Checkpoint').map((n) => nodePos(n.body))
    expect(checkpoints).toHaveLength(1)
    expect(at(checkpoints[0]), 'the save checkpoint sits on LevelStart').toBe(true)

    const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
    const rooms = (preview as { rooms: RoomRect[] }).rooms
    for (const p of [...respawns, ...checkpoints]) {
      const inside = rooms.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)
      expect(inside, `teleport target (${p.x},${p.y}) is outside every room`).toBe(true)
    }
  }, 60_000)

  it('scatters wave pickups over the floor, one tile per copy, off each tier trigger', () => {
    const waves = defaultDungeonBoss().waves
    waves[0] = { ...waves[0], pickups: [{ item: 'health_4', count: 2 }] }
    waves[2] = { ...waves[2], pickups: [{ item: 'mana_2', count: 3 }, { item: 'health_2', count: 1 }] }
    const result = generateOk(withBoss({ waves }), SEED)
    const xml = floorXml(result, BOSS_FLOOR)

    const items = nodesOfType(xml, 'SpawnObject').filter((n) => /items\//.test(n.body))
    expect(items, 'one SpawnObject per copy').toHaveLength(6)
    for (const n of items) expect(intParam(n.body, 'trigger-times'), 'a drop fires once').toBe(1)

    // Each copy hangs off its tier's trigger: tier 0 on LevelLoaded, tier 2 on Boss 50%.
    const triggers = nodesOfType(xml, 'GlobalEventTrigger')
    const feeding = (event: string): number[] =>
      triggers.filter((t) => stringParam(t.body, 'parameters') === event).flatMap((t) => intArr(t.body, 'connections') ?? [])
    const itemIds = new Set(items.map((n) => n.id))
    expect(feeding('LevelLoaded').filter((id) => itemIds.has(id))).toHaveLength(2)
    expect(feeding('Boss 50%').filter((id) => itemIds.has(id))).toHaveLength(4)

    // Scattered, not stacked, and never against a wall.
    const points = items.map((n) => nodePos(n.body))
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
    // Built last, drawing last: every existing node keeps its id, position and
    // wiring, and the actors and items are untouched.
    const base = withBoss({ waves: waveOn(1, { bat1: 12 }) })
    const withDrops = withBoss({ waves: waveOn(1, { bat1: 12 }) })
    withDrops.levelBoss![BOSS_FLOOR].waves[3].pickups = [{ item: 'health_4', count: 5 }]

    const before = floorXml(generateOk(base, SEED), BOSS_FLOOR)
    const after = floorXml(generateOk(withDrops, SEED), BOSS_FLOOR)

    const nodes = (xml: string): Map<number, string> => {
      const out = new Map<number, string>()
      for (const m of xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>/g)) {
        const body = xml.slice(m.index, xml.indexOf('</dictionary>', m.index))
        out.set(Number(m[1]), `${m[2]}@${nodePos(body).x},${nodePos(body).y}|${(intArr(body, 'connections') ?? []).join(' ')}`)
      }
      return out
    }
    const was = nodes(before)
    const now = nodes(after)
    for (const [id, sig] of was) expect(now.get(id), `node ${id} changed`).toBe(sig)
    expect(now.size).toBeGreaterThan(was.size)

    const section = (xml: string, name: string): string => new RegExp(`<array name="${name}">[\\s\\S]*?</array>`).exec(xml)?.[0] ?? ''
    expect(section(after, 'actors')).toBe(section(before, 'actors'))
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
    const xml = floorXml(generateOk(trapped, SEED), BOSS_FLOOR)

    const spewers = nodesOfType(xml, 'ProjectileSpewer')
    expect(spewers).toHaveLength(3)
    // Tier 1 is not the opening tier, so they wait for their event.
    expect(spewers.every((s) => intParam(s.body, 'enabled') !== 1)).toBe(true)

    // And with no trap configured the rig must not touch its stream at all.
    expect(nodesOfType(floorXml(untrapped, BOSS_FLOOR), 'ProjectileSpewer')).toHaveLength(0)
  }, 60_000)

  it('builds invulnerability against the boss actor', () => {
    const params = withBoss({
      invulnerability: { enabled: true, seconds: [10, 10, 10], countdown: false }
    })
    const xml = floorXml(generateOk(params, SEED), BOSS_FLOOR)

    const toggles = nodesOfType(xml, 'ToggleImmortality')
    expect(toggles.length, 'one on and one off per threshold').toBe(6)
  }, 60_000)
})

describe('dungeon boss — validation', () => {
  const fields = (issues: { field: string }[]) => issues.map((i) => i.field)

  it('accepts a well-formed boss floor', () => {
    const result = validateParameters(withBoss({ waves: waveOn(0, { bat1: 10 }) }))
    expect(result.errors, JSON.stringify(result.errors)).toHaveLength(0)
  })

  it('rejects a stationary boss', () => {
    // A boss that cannot chase is one the party walks away from — and on a
    // sealed floor, walking away means never opening the way out.
    const stationary = BOSS_DEF_LIST.filter((d) => !d.mobile).map((d) => d.id)
    expect(stationary, 'the dragon and the queen').toEqual(['boss_dragon', 'boss_queen'])

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
    const waves = waveOn(1, { bat1: 5 })
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
        const waves = waveOn(1, { bat1: 20, skeleton1: 6 })
        waves[1] = {
          ...waves[1],
          defaultIntervalMs: 900,
          intervalMs: { bat1: 400 },
          buffs: [{ buff: 'bloodlust', target: 'monsters' }],
          traps: [{ projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3 }]
        }
        return waves
      })(),
      invulnerability: { enabled: true, seconds: [20, 15, 10], countdown: false },
      checkpoints: { respawnPlayers: '75-50-25', saveGame: '50' }
    })

    const text = serializeParametersTxt(params)
    expect(text).toMatch(/^bossFloor1=1\|boss_knight,boss_lich\|1\.500000$/m)
    expect(text).toMatch(/^bossFloor1Invuln=20,15,10$/m)
    expect(text).toMatch(/^bossFloor1InvulnCountdown=0$/m)
    expect(text).toMatch(/^bossFloor1Checkpoints=75-50-25,50$/m)
    expect(text).toMatch(/^bossFloor1Wave2=bat1,skeleton1\|900\|bat1:20,skeleton1:6\|bat1:400$/m)
    expect(text).toMatch(/^bossFloor1WaveBuff2=bloodlust:monsters$/m)
    expect(text).toMatch(/^bossFloor1WaveTrap2=shooter_arrow:up:0.5:900:3$/m)

    const parsed = parseParametersTxt(text, bareParams())
    expect(parsed.unknownKeys).toEqual([])
    const back = parsed.params.levelBoss?.[BOSS_FLOOR]
    expect(back?.enabled).toBe(true)
    expect(back?.bossPool).toEqual(['boss_knight', 'boss_lich'])
    expect(back?.monsterMultiplier).toBeCloseTo(1.5)
    expect(back?.invulnerability).toEqual({ enabled: true, seconds: [20, 15, 10], countdown: false })
    expect(back?.checkpoints).toEqual({ respawnPlayers: '75-50-25', saveGame: '50' })
    expect(back?.waves[1].monsters).toEqual(['bat1', 'skeleton1'])
    expect(back?.waves[1].monsterMax).toEqual({ bat1: 20, skeleton1: 6 })
    expect(back?.waves[1].defaultIntervalMs).toBe(900)
    expect(back?.waves[1].intervalMs).toEqual({ bat1: 400 })
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
      const result = generateOk(withBoss({ waves: waveOn(0, { bat1: 9 }) }), seed)
      const xml = floorXml(result, BOSS_FLOOR)

      expect(nodesOfType(xml, 'DestroyObject'), `seed ${seed}: sealed`).toHaveLength(1)
      expect(actorTypes(xml).filter((t) => t.startsWith('actors/boss_')), `seed ${seed}: one boss`).toHaveLength(1)

      // `sealHolds` runs inside the constructor and rejects a floor whose exit
      // is reachable with the wall up, so a floor that came back at all has
      // already proved its gate. What this adds is that it came back.
      const preview = result.levels.find((l) => l.label === String(BOSS_FLOOR + 1))
      expect(preview?.rooms.some((r) => r.sealed), `seed ${seed}: a sealed room`).toBe(true)
    }
  }, 120_000)
})
