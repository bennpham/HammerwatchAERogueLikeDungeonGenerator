/**
 * Mystery buttons (issue #67) — src/generator/mystery/.
 *
 * Proved here:
 *
 *   - off means off: no pool, no floor, a zero count or a pool of dangling
 *     indices all emit byte-identical output and touch no stream;
 *   - the sixth stream keeps them additive: arming a floor moves no other
 *     floor, and on the armed floor only appends ids;
 *   - the rig's shape, transcribed from the owner's hand-built
 *     `test_mystery_button_simple.xml`: a need-sync `trigger_button_floor`, a
 *     one-shot AreaTrigger, `pressed`, the announcement only when there is text,
 *     one SpawnObject per copy, disabled spewers switched on by the press and
 *     optionally off again after a delay;
 *   - placement: plate rooms, spacing, clear of the floor's own items, every
 *     spawn inside the plate's room.
 */

import { describe, expect, it } from 'vitest'
import {
  defaultDungeonBoss,
  defaultFloorTraps,
  floorMystery,
  MYSTERY_PARSE_LIMIT,
  MYSTERY_STARTER_TRAP_SECONDS,
  mysteryStarterPool
} from '../src/generator/config/parameters'
import type { FloorMystery, MysteryButton } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { Level } from '../src/generator/map/level'
import { Doodad } from '../src/generator/objects/doodad'
import { NodeSpawnObject } from '../src/generator/objects/nodes'
import { buildMysteryButtonRig } from '../src/generator/mystery/rig'
import { MYSTERY_BUTTON_SPACING, mysteryButtonSlots } from '../src/generator/mystery/placement'
import { sealHolds } from '../src/generator/map/sealCheck'
import { MYSTERY_LOOT_DEFS, MYSTERY_LOOT_GROUPS, mysteryLootById } from '../src/generator/objects/mysteryLoot'
import { isKnownMonsterKey } from '../src/generator/objects/monsterTypes'
import { projectileById } from '../src/generator/objects/projectileTypes'
import { allIds, badIntArray, nodesOfType } from './xmlHelpers'
import { plainParameters } from './params'
import { samplePool } from './mysterySample'

const SEED = 4242
const PLATE = 'doodads/special/trigger_button_floor.xml'

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/** Three plain floors, every optional layer off — the file list is just the dungeon. */
function bareParams(floors = 3): DungeonParameters {
  const params = plainParameters()
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelTimers = undefined
  params.levelTraps = Array.from({ length: floors }, () => defaultFloorTraps())
  params.levelLock = undefined
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

/** `bareParams()` with a pool and floor `index` placing `count` from `pool`. */
function armed(index: number, count: number, pool: number[], buttons: MysteryButton[] = samplePool()): DungeonParameters {
  const params = bareParams()
  params.mysteryButtons = buttons
  params.levelMystery = Array.from({ length: params.levels }, () => ({ count: 0, pool: [] }))
  params.levelMystery[index] = { count, pool }
  return params
}

function levelXml(result: DungeonResult, index: number): string {
  const file = result.files.find((f) => f.path === `levels/level${index}.xml`)
  expect(file, `levels/level${index}.xml missing`).toBeDefined()
  return (file as { content: string }).content
}

function strings(body: string, name: string): string[] {
  return [...body.matchAll(new RegExp(`<string name="${name}">([^<]*)</string>`, 'g'))].map((m) => m[1])
}

function intArr(body: string, name: string): number[] {
  const m = new RegExp(`<int-arr name="${name}">([^<]*)</int-arr>`).exec(body)
  return m === null ? [] : m[1].split(' ').map(Number)
}

/** One accepted floor in isolation, built the way the floor loop builds it. */
function buildFloor(params: DungeonParameters, seed: number, levelIndex = 0, locked = false): { ctx: GenerationContext; level: Level } {
  const ctx = new GenerationContext(params, seed)
  ctx.gateway = { kind: 'orb' }
  ctx.floorLocked = locked
  ctx.floorLockButtons = locked ? 1 : 0
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

function plates(ctx: GenerationContext): Doodad[] {
  return ctx.doodads.filter((d) => d.type === 'TriggerButton')
}

describe('mystery buttons — off means off', () => {
  // An armed floor with an empty or dangling pick is a validation ERROR, so it
  // never reaches generation; the rig's own tolerance of it is proved at rig
  // level below.
  it('a pool with no floor armed, or a zero count, is byte-identical to nothing', () => {
    for (const seed of [1, SEED, 987654]) {
      const none = generateOk(bareParams(), seed)
      for (const floor of [
        { count: 0, pool: [0, 1] },
        { count: 0, pool: [] }
      ] as FloorMystery[]) {
        const params = armed(1, floor.count, floor.pool)
        expect(generateOk(params, seed).files).toEqual(none.files)
      }
      const poolOnly = bareParams()
      poolOnly.mysteryButtons = samplePool()
      expect(generateOk(poolOnly, seed).files).toEqual(none.files)
    }
  })

  it('validation rejects an armed floor with nothing, or nothing real, to draw from', () => {
    expect(validateParameters(armed(1, 5, [])).errors.map((e) => e.field)).toContain('levelMystery.1.pool')
    expect(validateParameters(armed(1, 5, [9])).errors.map((e) => e.field)).toContain('levelMystery.1.pool')
  })

  it('floorMystery reads an unconfigured floor as undefined', () => {
    expect(floorMystery(bareParams(), 0)).toBeUndefined()
    expect(floorMystery(armed(0, 3, [7]), 0)).toBeUndefined()
    expect(floorMystery(armed(0, 3, [7, 1]), 0)).toEqual({ count: 3, pool: [1] })
  })

  it('draws from no stream and allocates no id when there is nothing to place', () => {
    for (const params of [bareParams(), armed(0, 0, [0]), armed(0, 4, []), armed(0, 4, [42])]) {
      const control = buildFloor(params, SEED)
      const subject = buildFloor(params, SEED)
      buildMysteryButtonRig(subject.ctx, params, subject.level, 0)
      expect(subject.ctx.idCounter).toBe(control.ctx.idCounter)
      for (const stream of ['rand', 'cosmeticRand', 'bossRand', 'trapRand', 'floorBossRand', 'mysteryRand'] as const) {
        const a = Array.from({ length: 8 }, () => control.ctx[stream].iRand(0, 1_000_000))
        const b = Array.from({ length: 8 }, () => subject.ctx[stream].iRand(0, 1_000_000))
        expect(b, `${stream} moved`).toEqual(a)
      }
    }
  })
})

describe('mystery buttons — the sixth stream keeps them additive', () => {
  it('mysteryRand is its own stream and draining it moves no other', () => {
    const params = bareParams()
    const probe = (ctx: GenerationContext, s: 'rand' | 'cosmeticRand' | 'bossRand' | 'trapRand' | 'floorBossRand' | 'mysteryRand') =>
      Array.from({ length: 12 }, () => ctx[s].iRand(0, 1_000_000))
    const base = new GenerationContext(params, SEED)
    const mystery = probe(new GenerationContext(params, SEED), 'mysteryRand')
    for (const s of ['rand', 'cosmeticRand', 'bossRand', 'trapRand', 'floorBossRand'] as const) {
      expect(probe(new GenerationContext(params, SEED), s)).not.toEqual(mystery)
    }
    const drained = new GenerationContext(params, SEED)
    for (let i = 0; i < 1000; i++) drained.mysteryRand.iRand(0, 97)
    for (const s of ['rand', 'cosmeticRand', 'bossRand', 'trapRand', 'floorBossRand'] as const) {
      expect(probe(drained, s)).toEqual(probe(base, s))
    }
  })

  it('arming one floor leaves every other floor byte-identical and only appends on its own', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(armed(1, 6, [0, 1, 2, 3]), SEED)

    expect(levelXml(on, 0)).toBe(levelXml(off, 0))
    expect(levelXml(on, 2)).toBe(levelXml(off, 2))
    expect(on.levels).toEqual(off.levels)

    const before = allIds(levelXml(off, 1))
    const after = allIds(levelXml(on, 1))
    const max = Math.max(...before)
    for (const id of before) expect(after).toContain(id)
    for (const id of after.filter((id) => !before.includes(id))) expect(id).toBeGreaterThan(max)
    expect(badIntArray(levelXml(on, 1))).toBeNull()
  })

  it('is deterministic', () => {
    const params = armed(0, 8, [0, 1, 2, 3])
    expect(generateOk(params, SEED).files).toEqual(generateOk(params, SEED).files)
  })
})

describe('mystery buttons — the rig', () => {
  it('places each plate as a need-sync trigger_button_floor pressed by a one-shot trigger', () => {
    const xml = levelXml(generateOk(armed(0, 6, [0, 1, 2, 3]), SEED), 0)
    const plateNodes = nodesOfType(xml, PLATE)
    expect(plateNodes).toHaveLength(6)
    for (const p of plateNodes) expect(p.body).toContain('<bool name="need-sync">True</bool>')

    const presses = nodesOfType(xml, 'ChangeDoodadState').filter((n) => plateNodes.some((p) => intArr(n.body, 'static')[0] === p.id))
    expect(presses).toHaveLength(6)
    for (const press of presses) expect(strings(press.body, 'state')).toEqual(['pressed'])

    // every press hangs off a one-shot AreaTrigger
    const triggers = nodesOfType(xml, 'AreaTrigger').filter((t) => presses.some((p) => intArr(t.body, 'connections').includes(p.id)))
    expect(triggers).toHaveLength(6)
    for (const t of triggers) expect(t.body).toContain('<int name="trigger-times">1</int>')
  })

  it('a dud with no text is the click and nothing else', () => {
    const dud: MysteryButton = { loot: [], monsters: [], traps: [] }
    const { ctx, level } = buildFloor(armed(0, 3, [0], [dud]), SEED)
    const before = ctx.scriptNodes.length
    buildMysteryButtonRig(ctx, armed(0, 3, [0], [dud]), level, 0)
    const added = ctx.scriptNodes.slice(before)
    expect(plates(ctx)).toHaveLength(3)
    expect(added.map((n) => n.type).sort()).toEqual(
      ['AreaTrigger', 'ChangeDoodadState', 'PlaySound', 'RectangleShape'].flatMap((t) => [t, t, t]).sort()
    )
  })

  it('spawns every loot and monster copy inside the plate room, monsters clear of the plate', () => {
    const params = armed(0, 4, [0, 2])
    const { ctx, level } = buildFloor(params, SEED)
    const before = ctx.scriptNodes.length
    buildMysteryButtonRig(ctx, params, level, 0)
    const spawns = ctx.scriptNodes.slice(before).filter((n): n is NodeSpawnObject => n instanceof NodeSpawnObject)
    const chests = spawns.filter((s) => s.actorPath === 'items/chest_red.xml')
    const upgrades = spawns.filter((s) => s.actorPath === 'items/upgrade_damage_2.xml')
    const skeletons = spawns.filter((s) => s.actorPath === 'actors/skeleton_1_mb.xml')
    expect(chests.length / 3).toBe(upgrades.length / 2)
    expect(chests.length / 3 + skeletons.length / 4).toBe(plates(ctx).length)

    for (const s of spawns) {
      expect(s.triggerTimes).toBe(1)
      const idx = Math.trunc(s.x) + Math.trunc(s.y) * level.width
      const room = level.regionMap[idx]
      expect(room, 'spawn outside every room').toBeGreaterThanOrEqual(0)
      // some plate shares the spawn's room
      expect(plates(ctx).some((p) => level.regionMap[p.x + p.y * level.width] === room)).toBe(true)
    }
    for (const s of skeletons) {
      const nearest = Math.min(...plates(ctx).map((p) => Math.max(Math.abs(Math.trunc(s.x) - p.x), Math.abs(Math.trunc(s.y) - p.y))))
      expect(nearest).toBeGreaterThanOrEqual(3)
    }
  })

  it('traps ship disabled, are switched on by the press, and never share a tile', () => {
    const xml = levelXml(generateOk(armed(0, 8, [3]), SEED), 0)
    const spewers = nodesOfType(xml, 'ProjectileSpewer')
    expect(spewers.length).toBeGreaterThan(0)
    for (const s of spewers) expect(s.body).toContain('<bool name="enabled">False</bool>')

    const toggles = nodesOfType(xml, 'ToggleElement').filter((t) => spewers.some((s) => intArr(t.body, 'static')[0] === s.id))
    expect(toggles).toHaveLength(spewers.length)
    for (const t of toggles) expect(t.body).toContain('<int name="state">0</int>')

    const tiles = spewers.map((s) => /<float name="x">([^<]+)<\/float>\s*<float name="y">([^<]+)<\/float>/.exec(s.body)?.slice(1).join(','))
    expect(new Set(tiles).size).toBe(tiles.length)

    // no switch-off: the triggers keep the legacy `delays` line
    expect(xml).not.toContain('connection-delays')
  })

  it('trapSeconds adds a delayed switch-off per spewer', () => {
    const buttons = samplePool()
    buttons[3].trapSeconds = 5
    const xml = levelXml(generateOk(armed(0, 4, [3], buttons), SEED), 0)
    const spewers = nodesOfType(xml, 'ProjectileSpewer')
    const toggles = nodesOfType(xml, 'ToggleElement').filter((t) => spewers.some((s) => intArr(t.body, 'static')[0] === s.id))
    expect(toggles.filter((t) => t.body.includes('<int name="state">1</int>'))).toHaveLength(spewers.length)
    const delayed = nodesOfType(xml, 'AreaTrigger').filter((t) => t.body.includes('connection-delays'))
    expect(delayed.length).toBeGreaterThan(0)
    for (const t of delayed) expect(intArr(t.body, 'connection-delays')).toContain(5000)
  })

  it('only ever becomes a button the floor picked', () => {
    const xml = levelXml(generateOk(armed(0, 12, [0, 0]), SEED), 0)
    expect(nodesOfType(xml, 'ProjectileSpewer')).toHaveLength(0)
    expect(xml).not.toContain('actors/skeleton_1_mb.xml')
    expect(strings(xml, 'text').filter((t) => t === 'You got treasure').length).toBe(nodesOfType(xml, PLATE).length)
  })
})

describe('mystery buttons — placement', () => {
  it('keeps plates in plate rooms, spaced, reachable and off the floor\'s own items', () => {
    for (const seed of [1, SEED, 31337]) {
      const params = armed(0, 40, [1])
      const { ctx, level } = buildFloor(params, seed)
      const items = ctx.items.map((i) => ({ x: Math.trunc(i.x), y: Math.trunc(i.y) }))
      buildMysteryButtonRig(ctx, params, level, 0)
      const placed = plates(ctx)
      expect(placed.length).toBeGreaterThan(0)
      for (const p of placed) {
        const room = level.rooms[level.regionMap[p.x + p.y * level.width]]
        expect(room).toBeDefined()
        expect(['Entrance', 'Shop']).not.toContain(room.type)
        expect(room.sealed || room.locked).toBe(false)
        for (const i of items) expect(Math.max(Math.abs(i.x - p.x), Math.abs(i.y - p.y))).toBeGreaterThan(1)
      }
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          const gap = Math.max(Math.abs(placed[a].x - placed[b].x), Math.abs(placed[a].y - placed[b].y))
          expect(gap).toBeGreaterThanOrEqual(MYSTERY_BUTTON_SPACING)
        }
      }
    }
  })

  it('a count past what the floor holds places fewer and still generates', () => {
    const params = armed(0, 200, [0, 1, 2, 3])
    const { ctx, level } = buildFloor(params, SEED)
    const capacity = mysteryButtonSlots(level, ctx).length
    buildMysteryButtonRig(ctx, params, level, 0)
    expect(plates(ctx).length).toBeLessThan(200)
    expect(plates(ctx).length).toBeLessThanOrEqual(capacity)
    generateOk(params, SEED)
  })

  it('generates with every floor armed, one floor locked and one hosting a boss', () => {
    const params = bareParams()
    params.mysteryButtons = samplePool()
    params.levelMystery = [0, 1, 2].map(() => ({ count: 6, pool: [0, 1, 2, 3] }))
    params.levelLock = [{ enabled: true }, { enabled: false }, { enabled: false }]
    params.levelBoss = [defaultDungeonBoss(), { ...defaultDungeonBoss(), enabled: true }, defaultDungeonBoss()]
    expect(validateParameters(params).errors).toEqual([])
    for (const seed of [1, SEED]) {
      const result = generateOk(params, seed)
      for (let i = 0; i < 3; i++) expect(nodesOfType(levelXml(result, i), PLATE).length).toBeGreaterThan(0)
    }
  })

  it('the seal check never reads a mystery plate as an obstacle', () => {
    // A locked floor whose seal is removed is open; putting a need-sync mystery
    // plate on every removed seal tile must leave it open.
    let checked = 0
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const { ctx, level } = buildFloor(bareParams(), seed, 0, true)
      if (!sealHolds(level, ctx)) continue
      const seals = ctx.doodads.filter((d) => d.needSync && d.type !== 'BossDoorButton')
      ctx.doodads = ctx.doodads.filter((d) => !seals.includes(d))
      if (sealHolds(level, ctx)) continue // a fence theme: the seal was not the only thing
      for (const s of seals) Doodad.create(ctx, s.x, s.y, 'TriggerButton', level.theme).needSync = true
      expect(sealHolds(level, ctx)).toBe(false)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('mystery buttons — parameters.txt', () => {
  it('round-trips the pool and the floors, case and all', () => {
    const params = armed(1, 7, [0, 0, 2, 3])
    params.mysteryButtons![3].trapSeconds = 12
    params.mysteryButtons![0].text = 'Treasure AHOY: Take It'
    const text = serializeParametersTxt(params)
    expect(text).toContain('mysteryButtons=4')
    expect(text).toContain('mysteryFloor1=7:0,0,2,3')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.mysteryButtons).toEqual(params.mysteryButtons)
    expect(parsed.params.levelMystery).toEqual(params.levelMystery)
  })

  it('reports a runaway button index or count instead of padding the pool out to it', () => {
    const parsed = parseParametersTxt(
      [`mysteryButton0Name=Real`, `mysteryButton${MYSTERY_PARSE_LIMIT}Name=Stray`, `mysteryButton999999999Text=Stray`].join('\n')
    )
    expect(parsed.params.mysteryButtons).toHaveLength(1)
    expect(parsed.unknownKeys).toEqual([`mysteryButton${MYSTERY_PARSE_LIMIT}Name`, 'mysteryButton999999999Text'])
    const counted = parseParametersTxt(`mysteryButtons=999999999\nmysteryButton0Name=Real`)
    expect(counted.params.mysteryButtons).toHaveLength(1)
    expect(counted.unknownKeys).toEqual(['mysteryButtons "999999999"'])
  })

  it('round-trips the whole starter set', () => {
    const params = armed(0, 5, [0, 1], mysteryStarterPool())
    const parsed = parseParametersTxt(serializeParametersTxt(params))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.mysteryButtons).toEqual(params.mysteryButtons)
  })

  it('writes nothing for a campaign without them, and reads nothing back', () => {
    const text = serializeParametersTxt(bareParams())
    expect(text).not.toMatch(/mystery/i)
    const parsed = parseParametersTxt(text)
    expect(parsed.params.mysteryButtons).toBeUndefined()
    expect(parsed.params.levelMystery).toBeUndefined()
  })

  it('reports unknown loot, monsters, fields and dangling indices without failing', () => {
    const parsed = parseParametersTxt(
      [
        'levels=3',
        'mysteryButtons=2',
        'mysteryButton0Loot=chest_red:2|golden_toilet:1',
        'mysteryButton0Monsters=mb_skeleton:3|dragon_of_doom:1',
        'mysteryButton1Colour=blue',
        'mysteryButton5Name=Past the end',
        'mysteryFloor0=4:0,1,9',
        'mysteryFloor7=2:0'
      ].join('\n')
    )
    expect(parsed.params.mysteryButtons).toHaveLength(2)
    expect(parsed.params.mysteryButtons![0].loot).toEqual([{ item: 'chest_red', count: 2 }])
    expect(parsed.params.mysteryButtons![0].monsters).toEqual([{ monster: 'mb_skeleton', count: 3 }])
    expect(parsed.params.levelMystery).toEqual([{ count: 4, pool: [0, 1] }, { count: 0, pool: [] }, { count: 0, pool: [] }])
    expect(parsed.unknownKeys).toEqual(
      expect.arrayContaining([
        'mysteryButton0Loot item "golden_toilet"',
        'mysteryButton0Monsters monster "dragon_of_doom"',
        'mysteryButton1Colour',
        'mysteryButton5Name',
        'mysteryFloor7',
        'mysteryFloor0 button "9"'
      ])
    )
  })
})

describe('mystery buttons — the loot registry', () => {
  it('names every coin and diamond by its asset, once each', () => {
    const paths = MYSTERY_LOOT_DEFS.map((d) => d.path)
    expect(new Set(paths).size).toBe(paths.length)
    const money = MYSTERY_LOOT_DEFS.filter((d) => d.id.startsWith('valuable_'))
    for (const d of money) expect(d.path).toBe(`items/${d.id}.xml`)
    expect(money.map((d) => d.id)).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `valuable_${i + 1}`),
      'valuable_diamond_small',
      'valuable_diamond_small_red',
      'valuable_diamond',
      'valuable_diamond_red'
    ])
    expect(MYSTERY_LOOT_GROUPS.slice(0, 3)).toEqual(['Chests', 'Coins', 'Diamonds'])
    expect(mysteryLootById('valuable_9')?.label).toBe('Gold coin pile (42 gold)')
  })

  it('round-trips a new diamond through parameters.txt', () => {
    const params = armed(0, 2, [0], [{ loot: [{ item: 'valuable_diamond_small_red', count: 3 }], monsters: [], traps: [] }])
    const parsed = parseParametersTxt(serializeParametersTxt(params))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.mysteryButtons).toEqual(params.mysteryButtons)
    expect(validateParameters(params).errors).toEqual([])
  })
})

describe('mystery buttons — the starter set', () => {
  const starter = mysteryStarterPool()
  const everyButton = starter.map((_, i) => i)

  it('names only things the game has', () => {
    expect(new Set(starter.map((b) => b.name)).size).toBe(starter.length)
    for (const button of starter) {
      for (const row of button.loot) expect(mysteryLootById(row.item), row.item).toBeDefined()
      for (const row of button.monsters) expect(isKnownMonsterKey(row.monster), row.monster).toBe(true)
      for (const row of button.traps) expect(projectileById(row.projectile), row.projectile).toBeDefined()
    }
  })

  it('opens with a dud and holds back the richest loot', () => {
    expect(starter[0]).toMatchObject({ loot: [], monsters: [], traps: [] })
    const items = starter.flatMap((b) => b.loot.map((r) => r.item))
    for (const rich of ['chest_red', 'valuable_diamond_red', 'powerup_1up', 'powerup_7up']) expect(items).not.toContain(rich)
    // A tier-II upgrade is its own button, one copy and nothing else.
    const tierTwo = starter.filter((b) => b.loot.some((r) => /^upgrade_.*_2$/.test(r.item)))
    expect(tierTwo).toHaveLength(4)
    for (const b of tierTwo) expect(b.loot).toEqual([{ item: expect.stringMatching(/_2$/), count: 1 }])
  })

  it('arms every trap room on all four walls, switching off after the starter timer', () => {
    const trapRooms = starter.filter((b) => b.traps.length > 0)
    expect(trapRooms.length).toBeGreaterThan(0)
    for (const room of trapRooms) {
      expect(room.trapSeconds).toBe(MYSTERY_STARTER_TRAP_SECONDS)
      expect(new Set(room.traps.map((t) => t.direction))).toEqual(new Set(['up', 'down', 'left', 'right']))
    }
  })

  it('validates and generates with every button picked on every floor', () => {
    const params = bareParams()
    params.mysteryButtons = mysteryStarterPool()
    params.levelMystery = [0, 1, 2].map(() => ({ count: 12, pool: everyButton }))
    expect(validateParameters(params).errors).toEqual([])
    for (const seed of [1, SEED]) generateOk(params, seed)
  })
})
