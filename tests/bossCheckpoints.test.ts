import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { BOSS_CHECKPOINT_EVENTS, defaultParameters } from '../src/generator/config/parameters'
import type { BossArenaOptions } from '../src/generator/config/parameters'
import { buildCheckpointRig } from '../src/generator/boss/checkpoints'
import type { NodeCheckpoint } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

type Checkpoints = BossArenaOptions['checkpoints']

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function checkpoints(overrides: Partial<Checkpoints> = {}): Checkpoints {
  return { ...defaultParameters().boss.fights[0].arena.checkpoints, ...overrides }
}

function build(ctx: GenerationContext, options: Checkpoints): void {
  buildCheckpointRig(ctx, options, 10, 20)
}

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

describe('boss checkpoints — rig shape', () => {
  it('builds one GlobalEventTrigger per milestone in the respawn preset', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: 'never' }))
    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(4)
    expect(triggers.map((t) => (t as { eventName: string } & ScriptNode).eventName)).toEqual([
      ...BOSS_CHECKPOINT_EVENTS
    ])
    // respawn only — no Checkpoint node at all
    expect(nodesOfType(ctx, 'Checkpoint')).toHaveLength(0)
    expect(nodesOfType(ctx, 'RespawnPlayers')).toHaveLength(4)
  })

  it('respects the "50% only" preset', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: 'never', saveGame: '50' }))
    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers.map((t) => (t as { eventName: string } & ScriptNode).eventName)).toEqual(['Boss 50%'])
  })

  it('the two presets are independently scheduled', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '75-50-25-dead', saveGame: '50' }))
    // four milestones total (union of both presets)
    const triggers = nodesOfType(ctx, 'GlobalEventTrigger') as ({ eventName: string } & ScriptNode)[]
    expect(triggers.map((t) => t.eventName)).toEqual([...BOSS_CHECKPOINT_EVENTS])
    // only Boss 50% carries a Checkpoint
    expect(nodesOfType(ctx, 'Checkpoint')).toHaveLength(1)
    const fiftyTrigger = triggers.find((t) => t.eventName === 'Boss 50%')!
    expect(fiftyTrigger.connections.map((n) => n.type).sort()).toEqual(['Checkpoint', 'RespawnPlayers'])
    // every other milestone gets a RespawnPlayers only
    for (const t of triggers.filter((t) => t.eventName !== 'Boss 50%')) {
      expect(t.connections.map((n) => n.type)).toEqual(['RespawnPlayers'])
    }
  })

  it('a milestone picked by both presets shares ONE trigger, not two', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: '50', saveGame: '50' }))
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(1)
    const [trigger] = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(trigger.connections.map((n) => n.type)).toEqual(['Checkpoint', 'RespawnPlayers'])
  })

  it('the Checkpoint node always carries saveGame true', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: 'never', saveGame: '75-50-25' }))
    const cps = nodesOfType(ctx, 'Checkpoint') as (NodeCheckpoint & ScriptNode)[]
    expect(cps).toHaveLength(3)
    for (const cp of cps) expect(cp.saveGame).toBe(true)
    expect(cps[0].getXML()).toContain('<bool name="parameters">True</bool>')
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
