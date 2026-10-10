import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters, waveSpawnMode } from '../src/generator/config/parameters'
import type { BossWave } from '../src/generator/config/parameters'
import { anchors } from '../src/generator/boss/anchors'
import { buildWaveRig, scatterRequests } from '../src/generator/boss/waves'
import { spawnPointKey } from '../src/generator/boss/spawnPoints'
import type { SpawnPoint, SpawnPointMap } from '../src/generator/boss/spawnPoints'
import { NodeRectangleShape } from '../src/generator/objects/nodes'
import type { NodeSpawnObject, NodeTimerTrigger } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function buildRig(
  ctx: GenerationContext,
  waves: BossWave[],
  monsterMultiplier = 1.0,
  spawnPoints?: SpawnPointMap,
  batchIntervalMs?: number,
  useBodyguardTwins?: boolean
) {
  const anchorList = anchors(30, 40)
  const entranceShape = new NodeRectangleShape(ctx, 15, 38)
  buildWaveRig(
    ctx,
    waves,
    monsterMultiplier,
    anchorList,
    entranceShape,
    spawnPoints,
    batchIntervalMs,
    undefined,
    useBodyguardTwins
  )
  return { anchorList, entranceShape }
}

/** `count` distinct dummy points for one monster of one tier, as placeSpawnPoints would return them. */
function points(count: number, startX = 5, y = 5): SpawnPoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: startX + i, y }))
}

function spawnMap(entries: Array<[number, string, SpawnPoint[]]>): SpawnPointMap {
  return new Map(entries.map(([tier, key, pts]) => [spawnPointKey(tier, key), pts]))
}

function wave(monsters: string[], monsterMax: Record<string, number>, defaultIntervalMs = 3000, intervalMs?: Record<string, number>): BossWave {
  return { monsters, monsterMax, defaultIntervalMs, intervalMs }
}

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

/** Every node id that appears anywhere in `connections` actually exists among ctx.scriptNodes. */
function connectionsResolve(ctx: GenerationContext): boolean {
  const ids = new Set(ctx.scriptNodes.map((n) => n.id))
  return ctx.scriptNodes.every((n) => n.connections.every((c) => ids.has(c.id)))
}

describe('boss wave rig — basic shape', () => {
  it('each tier gets a trigger -> ToggleElement{state:0} -> TimerTrigger(enabled=False) chain', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    const timers = nodesOfType(ctx, 'TimerTrigger')
    expect(timers.length).toBeGreaterThanOrEqual(4) // one per tier, at least

    for (const timer of timers) {
      expect(timer.enabled).toBe(false)

      // reached from exactly one ToggleElement
      const toggles = ctx.scriptNodes.filter(
        (n) => n.type === 'ToggleElement' && (n as unknown as { element: number }).element === timer.id
      )
      expect(toggles).toHaveLength(1)
      const toggle = toggles[0] as unknown as { state: number }
      expect(toggle.state).toBe(0)

      // that toggle is reached from exactly one trigger (AreaTrigger or GlobalEventTrigger)
      const triggers = ctx.scriptNodes.filter(
        (n) =>
          (n.type === 'AreaTrigger' || n.type === 'GlobalEventTrigger') &&
          n.connections.some((c) => c.id === toggles[0].id)
      )
      expect(triggers).toHaveLength(1)
    }
  })

  it('tier 0 is triggered by an AreaTrigger connected to the entrance shape; tiers 1-3 by named GlobalEventTriggers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    const { entranceShape } = buildRig(ctx, waves)

    const areaTriggers = nodesOfType(ctx, 'AreaTrigger')
    expect(areaTriggers).toHaveLength(1)
    expect((areaTriggers[0] as unknown as { shapeId: number }).shapeId).toBe(entranceShape.id)

    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%', 'Boss 75%'])
  })

  it('every SpawnObject is downstream of some TimerTrigger', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    const spawns = new Set(nodesOfType(ctx, 'SpawnObject').map((n) => n.id))
    expect(spawns.size).toBeGreaterThan(0)

    const reached = new Set<number>()
    for (const timer of nodesOfType(ctx, 'TimerTrigger')) {
      for (const c of timer.connections) reached.add(c.id)
    }
    for (const id of spawns) {
      expect(reached.has(id)).toBe(true)
    }
  })
})

describe('boss wave rig — interval grouping', () => {
  it('a tier whose monsters all use the wave default emits exactly one timer', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000)
    ]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(1)
  })

  it('a tier with two distinct intervals emits two timers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000, { maggot: 1000 })
    ]
    buildRig(ctx, waves)
    const timers = nodesOfType(ctx, 'TimerTrigger') as unknown as { intervalMs: number }[]
    expect(timers).toHaveLength(2)
    expect(timers.map((t) => t.intervalMs).sort((a, b) => a - b)).toEqual([1000, 4000])
  })

  it('a tier with three distinct intervals (all different) emits three timers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000, { bat1: 5000, tick1: 3000 })
    ]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(3)
  })
})

describe('boss wave rig — round-robin budget split', () => {
  it('splits monsterMax round-robin across the 9 anchors', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 10 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { x: number; y: number; triggerTimes: number }[]
    // 10 split across 9 anchors round-robin: first anchor gets 2, the rest get 1
    expect(spawns).toHaveLength(9)
    const shares = spawns.map((s) => s.triggerTimes).sort((a, b) => b - a)
    expect(shares).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('a monster max smaller than 9 only reaches that many anchors, each with share 1', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 3 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    expect(spawns).toHaveLength(3)
    for (const s of spawns) expect(s.triggerTimes).toBe(1)
  })

  it('a monster max of 0 spawns nothing', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 0 })]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
  })

  it('-1 (endless) reaches every one of the 9 anchors, unchanged (default triggerTimes -1)', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: -1 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    expect(spawns).toHaveLength(9)
    for (const s of spawns) expect(s.triggerTimes).toBe(-1)
  })
})

describe('boss wave rig — monsterMultiplier scales the spawn budget', () => {
  it('scales a finite monsterMax before the round-robin split', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 10 })]
    buildRig(ctx, waves, 2.0)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    const total = spawns.reduce((sum, s) => sum + s.triggerTimes, 0)
    expect(total).toBe(20) // trunc(10 * 2.0)
  })

  it('a multiplier of 0 yields no spawns', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 10 })]
    buildRig(ctx, waves, 0)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
  })

  it('-1 (endless) stays -1 regardless of the multiplier', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: -1 })]
    buildRig(ctx, waves, 3.5)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    expect(spawns).toHaveLength(9)
    for (const s of spawns) expect(s.triggerTimes).toBe(-1)
  })

  it('truncates rather than rounds, and never goes negative', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 3 })]
    buildRig(ctx, waves, 0.4) // trunc(3 * 0.4) = 1

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    const total = spawns.reduce((sum, s) => sum + s.triggerTimes, 0)
    expect(total).toBe(1)
  })
})

describe('boss wave rig — empty pool degrades safely', () => {
  it('a tier with no monsters emits no trigger, toggle, or timer for that tier', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave([], {}),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    // tier 1 (75%) never fires, so its GlobalEventTrigger never gets built
    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%'])

    // 3 real tiers -> 3 timers (each tier's single monster uses the wave default)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(3)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(3)
  })

  it('all four tiers empty produces no wave-rig nodes at all', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave([], {}), wave([], {}), wave([], {}), wave([], {})]
    const before = ctx.scriptNodes.length
    buildRig(ctx, waves)
    // only the entrance RectangleShape itself was added by the test helper
    expect(ctx.scriptNodes.length).toBe(before + 1)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
  })
})

describe('boss wave rig — id integrity', () => {
  it('every id referenced in a connections array resolves to a real node, in-memory and in the rendered XML', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1'], { bat1: 10, tick1: -1 }, 4000, { tick1: 1000 }),
      wave(['maggot'], { maggot: 10 }),
      wave([], {}),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    expect(connectionsResolve(ctx)).toBe(true)

    const xml = ctx.scriptNodes.map((n) => n.getXML()).join('')
    const renderedIds = new Set([...xml.matchAll(/<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1])))
    const connectionIds = [...xml.matchAll(/<int-arr name="connections">([^<]*)<\/int-arr>/g)].flatMap((m) =>
      m[1].split(' ').filter((t) => t !== '').map(Number)
    )
    for (const id of connectionIds) {
      expect(renderedIds.has(id)).toBe(true)
    }
  })
})

describe('boss wave rig — uses the default boss options end to end', () => {
  it('builds a full rig for defaultBossOptions().arena.waves without throwing', () => {
    const ctx = freshCtx()
    const waves = defaultParameters().boss.fights[0].arena.waves
    expect(() => buildRig(ctx, waves)).not.toThrow()
    expect(nodesOfType(ctx, 'TimerTrigger').length).toBeGreaterThan(0)
    expect(nodesOfType(ctx, 'SpawnObject').length).toBeGreaterThan(0)
  })
})

describe('boss wave rig — variant keys (issue #20)', () => {
  const spawnPaths = (ctx: GenerationContext) =>
    (nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]).map((n) => n.actorPath)

  it('a bare id still spawns the pre-variant actor', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['bat1'], { bat1: 9 })])
    expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/bat_1.xml']))
  })

  it('a single-tier id still spawns its only actor', () => {
    const ctx = freshCtx()
    // actors/skeleton_3.xml has an arena bodyguard twin (issue #64 part 2),
    // and the default is twins ON — see 'the bodyguard-twin toggle' below for
    // the off case that gets the plain actor.
    buildRig(ctx, [wave(['skeleton3'], { skeleton3: 9 })])
    expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/boss_lich/lich_guard_skeleton.xml']))
  })

  it('#0 spawns the spawner prop the arena could not reach before', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['bat1#0'], { 'bat1#0': 9 })])
    expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/spawners/bats.xml']))
  })

  it('#2 spawns the elite the arena could not reach before', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['archer1#2'], { 'archer1#2': 9 })])
    expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/archer_1_elite.xml']))
  })

  it('mixes a spawner, an ordinary creature and an elite in one tier', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['skeleton1#0', 'skeleton1', 'skeleton1#3'], { 'skeleton1#0': 9, skeleton1: 9, 'skeleton1#3': 9 })])
    const paths = spawnPaths(ctx)
    // three keys x nine anchors, one SpawnObject each
    expect(paths).toHaveLength(27)
    // bare `skeleton1` is tiers[1], the SMALL skeleton — the full-size
    // skeleton_1 is tiers[2] and needs its own key, which is exactly the gap
    // issue #20 is about. actors/skeleton_1_small.xml has an arena twin
    // (issue #64 part 2), on by default; the spawner and the elite do not.
    expect(new Set(paths)).toEqual(
      new Set(['actors/spawners/skeleton_1.xml', 'actors/boss_knight/skeleton_1_small.xml', 'actors/skeleton_1_elite.xml'])
    )
  })

  describe('the bodyguard-twin toggle (issue #64 part 2)', () => {
    it('substitutes the arena twin by default', () => {
      const ctx = freshCtx()
      buildRig(ctx, [wave(['skeleton3'], { skeleton3: 9 })])
      expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/boss_lich/lich_guard_skeleton.xml']))
    })

    it('emits the plain actor when the toggle is explicitly off', () => {
      const ctx = freshCtx()
      buildRig(ctx, [wave(['skeleton3'], { skeleton3: 9 })], 1.0, undefined, undefined, false)
      expect(new Set(spawnPaths(ctx))).toEqual(new Set(['actors/skeleton_3.xml']))
    })

    it('leaves a key with no twin unchanged either way', () => {
      const on = freshCtx()
      buildRig(on, [wave(['bat1'], { bat1: 9 })], 1.0, undefined, undefined, true)
      const off = freshCtx()
      buildRig(off, [wave(['bat1'], { bat1: 9 })], 1.0, undefined, undefined, false)
      expect(new Set(spawnPaths(on))).toEqual(new Set(['actors/bat_1.xml']))
      expect(new Set(spawnPaths(off))).toEqual(new Set(['actors/bat_1.xml']))
    })
  })

  it('treats a variant key as its own pool slot, with its own max and interval', () => {
    const ctx = freshCtx()
    buildRig(ctx, [
      wave(['bat1', 'bat1#0'], { bat1: 9, 'bat1#0': 3 }, 3000, { 'bat1#0': 5000 })
    ])
    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    const bats = spawns.filter((s) => s.actorPath === 'actors/bat_1.xml')
    const spawners = spawns.filter((s) => s.actorPath === 'actors/spawners/bats.xml')
    expect(bats).toHaveLength(9) // 9 across 9 anchors
    expect(spawners).toHaveLength(3) // 3 across the first 3 anchors
    // the differing interval forces a second TimerTrigger for the same tier
    const timers = nodesOfType(ctx, 'TimerTrigger') as NodeTimerTrigger[]
    expect(timers.map((t) => t.intervalMs).sort()).toEqual([3000, 5000])
  })

  it('never draws from any RNG stream, whatever variants a wave holds', () => {
    // Variant resolution must stay a pure lookup: if it ever drew, every
    // layout stream downstream of it would shift and every saved seed would
    // change (invariant 2).
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000)),
      boss: Array.from({ length: 10 }, () => c.bossRand.iRand(0, 1000))
    })

    const ctx = freshCtx()
    buildRig(ctx, [wave(['bat1#0', 'archer1#2', 'tower_nova1'], { 'bat1#0': 4, 'archer1#2': 4, tower_nova1: 4 })])

    expect(nextTen(ctx)).toEqual(nextTen(freshCtx()))
  })
})

describe('boss wave rig — scattered spawn modes (issue #21)', () => {
  const scatterWave = (
    monsters: string[],
    monsterMax: Record<string, number>,
    spawnMode: BossWave['spawnMode'],
    defaultIntervalMs = 3000
  ): BossWave => ({ monsters, monsterMax, defaultIntervalMs, spawnMode })

  it('emits one one-shot SpawnObject per point, hanging straight off the tier trigger', () => {
    const ctx = freshCtx()
    buildRig(
      ctx,
      [scatterWave(['bat1'], { bat1: 4 }, { bat1: 'random' })],
      1.0,
      spawnMap([[0, 'bat1', points(4)]])
    )

    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns).toHaveLength(4)
    expect(spawns.map((s) => s.triggerTimes)).toEqual([1, 1, 1, 1])
    expect(spawns.map((s) => [s.x, s.y])).toEqual([
      [5, 5],
      [6, 5],
      [7, 5],
      [8, 5]
    ])

    // no timer rig at all for a tier of nothing but scattered monsters
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)

    const areaTriggers = nodesOfType(ctx, 'AreaTrigger')
    expect(areaTriggers).toHaveLength(1)
    expect(areaTriggers[0].connections.map((c) => c.id).sort()).toEqual(spawns.map((s) => s.id).sort())
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('mixes a scattered monster and a timed one in the same tier', () => {
    const ctx = freshCtx()
    buildRig(
      ctx,
      [scatterWave(['bat1', 'tick1'], { bat1: 3, tick1: 9 }, { bat1: 'gaussian' })],
      1.0,
      spawnMap([[0, 'bat1', points(3)]])
    )

    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    const bats = spawns.filter((s) => s.actorPath === 'actors/bat_1.xml')
    const ticks = spawns.filter((s) => s.actorPath === 'actors/tick_1_small.xml')
    expect(bats).toHaveLength(3) // one per scattered point
    expect(ticks).toHaveLength(9) // one per anchor, unchanged

    // exactly one timer, and only the timed monster hangs off it
    const timers = nodesOfType(ctx, 'TimerTrigger')
    expect(timers).toHaveLength(1)
    expect(timers[0].connections.map((c) => c.id).sort()).toEqual(ticks.map((s) => s.id).sort())

    const trigger = nodesOfType(ctx, 'AreaTrigger')[0]
    const toggle = nodesOfType(ctx, 'ToggleElement')[0]
    expect(trigger.connections.map((c) => c.id).sort()).toEqual([toggle.id, ...bats.map((b) => b.id)].sort())
  })

  it('a scattered monster ignores its interval override instead of forcing a second timer', () => {
    const ctx = freshCtx()
    buildRig(
      ctx,
      [
        {
          monsters: ['bat1', 'tick1'],
          monsterMax: { bat1: 2, tick1: 9 },
          defaultIntervalMs: 3000,
          intervalMs: { bat1: 5000 },
          spawnMode: { bat1: 'ring' }
        }
      ],
      1.0,
      spawnMap([[0, 'bat1', points(2)]])
    )

    const timers = nodesOfType(ctx, 'TimerTrigger') as NodeTimerTrigger[]
    expect(timers.map((t) => t.intervalMs)).toEqual([3000])
  })

  it('a tier whose scattered monsters got no points emits no trigger at all', () => {
    const ctx = freshCtx()
    buildRig(ctx, [scatterWave(['bat1'], { bat1: 0 }, { bat1: 'random' })], 1.0, new Map())

    expect(nodesOfType(ctx, 'AreaTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
    // no node may ever ship an empty connections array
    expect(ctx.scriptNodes.every((n) => n.type === 'RectangleShape' || n.connections.length > 0)).toBe(true)
  })

  it('leaves the anchor rig byte-identical when no monster is scattered', () => {
    const plain = freshCtx()
    buildRig(plain, [wave(['bat1', 'tick1'], { bat1: 10, tick1: 10 })])

    const withEmptyMap = freshCtx()
    buildRig(withEmptyMap, [wave(['bat1', 'tick1'], { bat1: 10, tick1: 10 })], 1.0, new Map())

    expect(withEmptyMap.scriptNodes.map((n) => n.getXML())).toEqual(plain.scriptNodes.map((n) => n.getXML()))
  })

  it('still draws from no RNG stream, points or not', () => {
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000)),
      boss: Array.from({ length: 10 }, () => c.bossRand.iRand(0, 1000))
    })

    const ctx = freshCtx()
    buildRig(
      ctx,
      [scatterWave(['bat1'], { bat1: 6 }, { bat1: 'symmetric' })],
      1.0,
      spawnMap([[0, 'bat1', points(6)]])
    )

    expect(nextTen(ctx)).toEqual(nextTen(freshCtx()))
  })
})

/**
 * A batch budget high enough that every count below stays one point per monster
 * — the shape these cases were written for. The batched shape gets its own
 * describe block below.
 */
const NO_BATCHING = 100000

describe('scatterRequests', () => {
  it('lists only scattered monsters, in tier then pool order, with counts scaled', () => {
    const waves: BossWave[] = [
      { monsters: ['bat1', 'tick1'], monsterMax: { bat1: 10, tick1: 10 }, defaultIntervalMs: 3000, spawnMode: { tick1: 'ring' } },
      { monsters: ['maggot'], monsterMax: { maggot: 10 }, defaultIntervalMs: 3000 },
      { monsters: ['slime', 'eye'], monsterMax: { slime: 5, eye: 7 }, defaultIntervalMs: 3000, spawnMode: { eye: 'gaussian', slime: 'random' } },
      { monsters: [], monsterMax: {}, defaultIntervalMs: 3000 }
    ]

    expect(scatterRequests(waves, 2.0, NO_BATCHING)).toEqual([
      { tier: 0, key: 'tick1', mode: 'ring', count: 20, points: 20 },
      { tier: 2, key: 'slime', mode: 'random', count: 10, points: 10 },
      { tier: 2, key: 'eye', mode: 'gaussian', count: 14, points: 14 }
    ])
  })

  it('skips endless and zeroed monsters — neither has a one-shot meaning', () => {
    const waves: BossWave[] = [
      {
        monsters: ['bat1', 'tick1', 'maggot'],
        monsterMax: { bat1: -1, tick1: 0, maggot: 4 },
        defaultIntervalMs: 3000,
        spawnMode: { bat1: 'random', tick1: 'random', maggot: 'random' }
      }
    ]

    expect(scatterRequests(waves, 1.0, NO_BATCHING)).toEqual([{ tier: 0, key: 'maggot', mode: 'random', count: 4, points: 4 }])
  })

  it('covers the stock waves except their anchored tail', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    const requests = scatterRequests(waves, 1.0, NO_BATCHING)

    // every stock entry is scattered except the blocking-wreck towers, which
    // validation forbids scattering
    expect(requests.every((r) => r.mode === 'random')).toBe(true)
    expect(requests.map((r) => r.key)).not.toContain('tower_nova1')
    expect(requests.map((r) => r.key)).not.toContain('tower_nova2')
    const anchored = waves.reduce(
      (n, w) => n + w.monsters.filter((key) => waveSpawnMode(w, key) === 'anchors').length,
      0
    )
    expect(requests).toHaveLength(waves.reduce((n, w) => n + w.monsters.length, 0) - anchored)
  })

  it('is empty once every monster is back on the anchors mode', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves.map((w) => ({ ...w, spawnMode: undefined }))
    expect(scatterRequests(waves, 1.0, NO_BATCHING)).toEqual([])
  })
})

describe('boss wave rig — the boss-death tier', () => {
  /** The four health tiers plus a death tier, so indices line up with the real thing. */
  function fiveTiers(death: BossWave): BossWave[] {
    return [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 }),
      death
    ]
  }

  it('wires tier 4 to a GlobalEventTrigger on "Boss Died"', () => {
    const ctx = freshCtx()
    buildRig(ctx, fiveTiers(wave(['eye'], { eye: 6 })))

    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%', 'Boss 75%', 'Boss Died'])
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('the death tier drives the same toggle -> timer -> SpawnObject chain as a health tier', () => {
    const ctx = freshCtx()
    buildRig(ctx, fiveTiers(wave(['eye'], { eye: 9 }, 2500)))

    const deathTrigger = nodesOfType(ctx, 'GlobalEventTrigger').find(
      (n) => (n as unknown as { eventName: string }).eventName === 'Boss Died'
    )
    expect(deathTrigger).toBeDefined()

    const toggle = ctx.scriptNodes.find(
      (n) => n.type === 'ToggleElement' && deathTrigger!.connections.some((c) => c.id === n.id)
    )
    expect(toggle).toBeDefined()

    const timer = ctx.scriptNodes.find(
      (n) => n.type === 'TimerTrigger' && (toggle as unknown as { element: number }).element === n.id
    ) as NodeTimerTrigger | undefined
    expect(timer).toBeDefined()
    expect(timer!.intervalMs).toBe(2500)
    expect(timer!.enabled).toBe(false)

    // 9 across 9 anchors is one each
    expect(timer!.connections).toHaveLength(9)
  })

  it('an empty death tier emits nothing at all — the shipped default costs no nodes', () => {
    const ctx = freshCtx()
    buildRig(ctx, fiveTiers(wave([], {})))

    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames).not.toContain('Boss Died')

    // and the four health tiers are untouched by its presence
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%', 'Boss 75%'])
  })

  it('scatters the death tier off its own trigger, one-shot, with no timer', () => {
    const ctx = freshCtx()
    const death: BossWave = {
      monsters: ['eye'],
      monsterMax: { eye: 3 },
      defaultIntervalMs: 3000,
      spawnMode: { eye: 'random' }
    }
    buildRig(ctx, [wave([], {}), wave([], {}), wave([], {}), wave([], {}), death], 1.0, spawnMap([[4, 'eye', points(3)]]))

    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)

    const trigger = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(trigger).toHaveLength(1)
    expect((trigger[0] as unknown as { eventName: string }).eventName).toBe('Boss Died')

    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns).toHaveLength(3)
    expect(spawns.every((s) => s.triggerTimes === 1)).toBe(true)
    expect(trigger[0].connections).toHaveLength(3)
  })

  it('scatterRequests puts the death tier last, so it cannot move the earlier tiers draws', () => {
    const scattered = (max: number): BossWave => ({
      monsters: ['bat1'],
      monsterMax: { bat1: max },
      defaultIntervalMs: 3000,
      spawnMode: { bat1: 'random' }
    })
    const withDeath = scatterRequests(
      [scattered(2), scattered(3), scattered(4), scattered(5), scattered(6)],
      1.0,
      NO_BATCHING
    )
    const withoutDeath = scatterRequests([scattered(2), scattered(3), scattered(4), scattered(5)], 1.0, NO_BATCHING)

    expect(withDeath.slice(0, 4)).toEqual(withoutDeath)
    expect(withDeath[4]).toEqual({ tier: 4, key: 'bat1', mode: 'random', count: 6, points: 6 })
  })

  it('the stock death tier is populated, and its scatters come after every other tier', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    const last = waves.length - 1
    expect(waves[last].monsters.length).toBeGreaterThan(0)

    const requests = scatterRequests(waves, 1.0, NO_BATCHING)
    const deathAt = requests.findIndex((r) => r.tier === last)
    expect(deathAt).toBeGreaterThanOrEqual(0)
    // every death-tier request sits at the end of the list, so populating the
    // tier cannot shift the draws the earlier tiers make
    expect(requests.slice(deathAt).every((r) => r.tier === last)).toBe(true)
    // the anchored tower stays out of the scatter list
    expect(requests.some((r) => r.key === 'tower_nova2')).toBe(false)
  })
})

/**
 * Batching (playtest 2026-08-27). A scattered monster whose `points` list is
 * shorter than its count no longer fires all at once: the count is split
 * round-robin over the points it got and hung off a timer, so a big entry
 * trickles in instead of putting every actor on the floor in one frame.
 */
describe('boss wave rig — batched scatter spawns', () => {
  const scattered = (key: string, max: number): BossWave => ({
    monsters: [key],
    monsterMax: { [key]: max },
    defaultIntervalMs: 3000,
    spawnMode: { [key]: 'random' }
  })

  it('one point per monster still hangs straight off the tier trigger, untimed', () => {
    const ctx = freshCtx()
    buildRig(ctx, [scattered('bat1', 6)], 1.0, spawnMap([[0, 'bat1', points(6)]]))

    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)
    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns).toHaveLength(6)
    for (const spawn of spawns) expect(spawn.triggerTimes).toBe(1)
  })

  it('a count past its points is split round-robin over them, on a timer', () => {
    const ctx = freshCtx()
    // 20 bats over 8 points: three points carry 3, five carry 2
    buildRig(ctx, [scattered('bat1', 20)], 1.0, spawnMap([[0, 'bat1', points(8)]]), 2500)

    const timers = nodesOfType(ctx, 'TimerTrigger') as NodeTimerTrigger[]
    expect(timers).toHaveLength(1)
    expect(timers[0].intervalMs).toBe(2500)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(1)

    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns).toHaveLength(8)
    expect(spawns.map((s) => s.triggerTimes).sort((a, b) => b - a)).toEqual([3, 3, 3, 3, 2, 2, 2, 2])
    // the whole horde still spawns — the budget moves it in time, not away
    expect(spawns.reduce((n, s) => n + s.triggerTimes, 0)).toBe(20)
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('every batched monster of a tier shares one toggle and one timer', () => {
    const ctx = freshCtx()
    const tier: BossWave = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 40, tick1: 30, maggot: 20 },
      defaultIntervalMs: 3000,
      spawnMode: { bat1: 'random', tick1: 'random', maggot: 'random' }
    }
    buildRig(ctx, [tier], 1.0, spawnMap([
      [0, 'bat1', points(8, 5, 5)],
      [0, 'tick1', points(8, 5, 9)],
      [0, 'maggot', points(8, 5, 13)]
    ]))

    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(1)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(1)
    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns.reduce((n, s) => n + s.triggerTimes, 0)).toBe(90)
  })

  it('a tier can mix a one-shot entry and a batched one', () => {
    const ctx = freshCtx()
    const tier: BossWave = {
      monsters: ['bat1', 'tick1'],
      monsterMax: { bat1: 3, tick1: 40 },
      defaultIntervalMs: 3000,
      spawnMode: { bat1: 'random', tick1: 'random' }
    }
    buildRig(ctx, [tier], 1.0, spawnMap([[0, 'bat1', points(3, 5, 5)], [0, 'tick1', points(8, 5, 9)]]))

    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns).toHaveLength(11)
    // the one-shot three keep trigger-times 1; the batched eight carry 5 each
    expect(spawns.filter((s) => s.triggerTimes === 1)).toHaveLength(3)
    expect(spawns.filter((s) => s.triggerTimes === 5)).toHaveLength(8)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(1)
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('the batch multiplier is applied before the split, not after', () => {
    const ctx = freshCtx()
    buildRig(ctx, [scattered('bat1', 20)], 0.5, spawnMap([[0, 'bat1', points(4)]]))
    const spawns = nodesOfType(ctx, 'SpawnObject') as NodeSpawnObject[]
    expect(spawns.reduce((n, s) => n + s.triggerTimes, 0)).toBe(10)
  })
})
