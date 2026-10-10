import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { BOSS_CHECKPOINT_EVENTS, defaultParameters } from '../src/generator/config/parameters'
import type { BossArenaOptions } from '../src/generator/config/parameters'
import { buildCheckpointRig } from '../src/generator/boss/checkpoints'
import type { NodeCheckpoint, NodeGlobalEventTrigger } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

type Checkpoints = BossArenaOptions['checkpoints']

/** The milestone triggers: the three health tiers, then the death. */
const MILESTONE_CLASSES = ['ActorHealthTrigger', 'UnitDestroyedTrigger']

function freshCtx(seed = 12345): GenerationContext {
  const ctx = new GenerationContext(defaultParameters(), seed)
  ctx.currentStem = 'boss0'
  ctx.bossActors = [{ id: 4242 }]
  return ctx
}

function checkpoints(overrides: Partial<Checkpoints> = {}): Checkpoints {
  return { ...defaultParameters().boss.fights[0].arena.checkpoints, ...overrides }
}

function build(ctx: GenerationContext, options: Checkpoints): void {
  buildCheckpointRig(ctx, options, 10, 20)
}

function nodesOfType(ctx: GenerationContext, cls: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.cls === cls)
}

function milestones(ctx: GenerationContext): NodeGlobalEventTrigger[] {
  return ctx.scriptNodes.filter((n) => MILESTONE_CLASSES.includes(n.cls)) as NodeGlobalEventTrigger[]
}

const firedClasses = (n: ScriptNode) => n.connections.map((c) => c.node.cls)

describe('boss checkpoints — rig shape', () => {
  it('builds one milestone trigger per event in the respawn preset, on the boss', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: 'never' }))
    const triggers = milestones(ctx)
    expect(triggers.map((t) => t.eventName)).toEqual([...BOSS_CHECKPOINT_EVENTS])
    for (const t of triggers) expect(t.params().find((p) => p.name === 'Units')?.value).toEqual([4242])
    // respawn only — no save point at all. AE has no RespawnPlayers, so a
    // respawn milestone moves the respawn point into this arena instead.
    expect(nodesOfType(ctx, 'SuperCheckPoint')).toHaveLength(0)
    expect(nodesOfType(ctx, 'SetRespawnPoint')).toHaveLength(4)
    expect(nodesOfType(ctx, 'RespawnPlayers')).toHaveLength(0)
  })

  it('respects the "50% only" preset', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: 'never', saveGame: '50' }))
    expect(milestones(ctx).map((t) => t.eventName)).toEqual(['Boss 50%'])
  })

  it('schedules the two presets independently', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: '50' }))
    const triggers = milestones(ctx)
    expect(triggers.map((t) => t.eventName)).toEqual([...BOSS_CHECKPOINT_EVENTS])
    expect(nodesOfType(ctx, 'SuperCheckPoint')).toHaveLength(1)
    const fifty = triggers.find((t) => t.eventName === 'Boss 50%')!
    expect(firedClasses(fifty).sort()).toEqual(['SetRespawnPoint', 'SuperCheckPoint'])
    for (const t of triggers.filter((t) => t.eventName !== 'Boss 50%')) {
      expect(firedClasses(t)).toEqual(['SetRespawnPoint'])
    }
  })

  it('shares ONE trigger for a milestone both presets pick', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '50', saveGame: '50' }))
    const triggers = milestones(ctx)
    expect(triggers).toHaveLength(1)
    expect(firedClasses(triggers[0])).toEqual(['SuperCheckPoint', 'SetRespawnPoint'])
  })

  it('names each save point after its level and milestone, and respawns into this level', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: '75-50-25' }))
    const names = (nodesOfType(ctx, 'SuperCheckPoint') as NodeCheckpoint[]).map((c) => c.name)
    expect(names).toEqual(['boss0_boss_75', 'boss0_boss_50', 'boss0_boss_25'])
    expect(new Set(names).size).toBe(names.length)
    for (const r of nodesOfType(ctx, 'SetRespawnPoint')) {
      expect(r.params()).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'boss0' })]))
    }
  })

  it('fires each milestone once', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: '75-50-25' }))
    for (const t of milestones(ctx)) expect(t.triggerTimes).toBe(1)
  })
})

describe('boss checkpoints — the ways it emits nothing', () => {
  it('emits no node at all when both presets are "never"', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: 'never', saveGame: 'never' }))
    expect(ctx.scriptNodes).toHaveLength(0)
  })

  it('draws no random values from any stream', () => {
    const ctx = freshCtx()
    const before = [ctx.rand.iRand(0, 1000), ctx.cosmeticRand.iRand(0, 1000), ctx.bossRand.iRand(0, 1000)]

    const other = freshCtx()
    build(other, checkpoints())
    const after = [other.rand.iRand(0, 1000), other.cosmeticRand.iRand(0, 1000), other.bossRand.iRand(0, 1000)]

    expect(after).toEqual(before)
  })
})

describe('boss checkpoints — defaults', () => {
  it('ships respawn on every tier plus death, and save at 50% only', () => {
    const { checkpoints: stock } = defaultParameters().boss.fights[0].arena
    expect(stock.respawnPlayers).toBe('75-50-25-dead')
    expect(stock.saveGame).toBe('50')
  })
})
