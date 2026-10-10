/**
 * Boss wave pickups — the item drops per health tier
 * (src/generator/boss/wavePickups.ts).
 *
 * Three things are being proved. First the emission shape: a count is COPIES,
 * so N copies means N SpawnObject nodes each with `trigger-times: 1`, and they
 * land on the entrance drop pad, in the lane their item kind belongs to. Second the
 * wiring: tier 0 hangs off an AreaTrigger on the entrance, every later tier off
 * a GlobalEventTrigger naming its own threshold, and no tier ever switches
 * another's drops off — items are objects on the floor, not live effects.
 * Third, invariant 6: no tier carrying a drop emits nothing at all, and turning
 * the feature on never moves a floor or an RNG stream.
 *
 * Uses bossWaveBuffs.test.ts's in-memory pattern — build the rig against a bare
 * context and read `ctx.scriptNodes` — rather than parsing XML, because what
 * matters here is which node points at which.
 */

import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import type { BossWave, WavePickup } from '../src/generator/config/parameters'
import { BOSS_DEATH_WAVE, wavePickups } from '../src/generator/config/parameters'
import { CAMPAIGN_PRESETS } from '../src/generator/config/presets'
import { validateParameters } from '../src/generator/config/validation'
import { MAX_PICKUP_COUNT, PICKUP_DEFS, pickupById } from '../src/generator/objects/pickupTypes'
import { buildBossArena } from '../src/generator/boss/arena'
import { PAD_ROWS, pickupPad } from '../src/generator/boss/pickupPad'
import { buildWavePickupRig } from '../src/generator/boss/wavePickups'
import { TIER_EVENT_NAMES } from '../src/generator/boss/waves'
import { NodeRectangleShape } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'

const ARENA_W = 30
const ARENA_H = 40
/** The entrance mouth arena.ts would build for an ARENA_W x ARENA_H arena. */
const ENTRANCE_CX = 15
const ENTRANCE_TOP = ARENA_H - 2
const PAD = pickupPad(ENTRANCE_CX, ENTRANCE_TOP, ARENA_W, ARENA_H)

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

/** A bare tier carrying any number of drop rows. */
function wave(...pickups: [string, number][]): BossWave {
  const w: BossWave = { monsters: [], monsterMax: {}, defaultIntervalMs: 3000 }
  if (pickups.length > 0) w.pickups = pickups.map(([item, count]) => ({ item, count }))
  return w
}

/**
 * Builds the rig the way arena.ts does, against a fresh entrance shape. The
 * shape is created first, so its id is stable across the cases that compare
 * node counts.
 */
function buildRig(ctx: GenerationContext, waves: BossWave[], walkable?: Uint8Array) {
  const shape = new NodeRectangleShape(ctx, ENTRANCE_CX, ENTRANCE_TOP)
  buildWavePickupRig(
    ctx,
    waves,
    { width: ARENA_W, height: ARENA_H, entranceCx: ENTRANCE_CX, entranceTop: ENTRANCE_TOP, walkable },
    shape
  )
  return shape
}

/** A mask where every interior tile is walkable — no cover pillars anywhere. */
function openFloor(): Uint8Array {
  return new Uint8Array(ARENA_W * ARENA_H).fill(1)
}

const tileOf = (s: { x: number; y: number }) => `${s.x},${s.y}`

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

/** Every id in every `connections` array actually exists among ctx.scriptNodes. */
function connectionsResolve(ctx: GenerationContext): boolean {
  const ids = new Set(ctx.scriptNodes.map((n) => n.id))
  return ctx.scriptNodes.every((n) => n.connections.every((c) => ids.has(c.id)))
}

/** The engine event a GlobalEventTrigger fires on. */
function eventOf(node: ScriptNode): string {
  return (node as unknown as { eventName: string }).eventName
}

function spawns(ctx: GenerationContext) {
  return nodesOfType(ctx, 'SpawnObject') as unknown as {
    id: number
    x: number
    y: number
    actorPath: string
    triggerTimes: number
  }[]
}

/** The SpawnObjects hanging directly off `trigger`. */
function spawnsFrom(trigger: ScriptNode) {
  return trigger.connections
    .filter((n) => n.type === 'SpawnObject')
    .map((n) => n as unknown as { x: number; y: number; actorPath: string; triggerTimes: number })
}

describe('boss wave pickups — none means none', () => {
  it('emits nothing at all when no tier drops anything', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave(), wave(), wave()])
    const beforeId = ctx.idCounter

    // only the entrance shape buildRig itself made
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
    expect(nodesOfType(ctx, 'AreaTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('emits nothing when every tier names an unknown item', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['no_such_item', 3]), wave(['also_not_real', 1])])
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
  })

  it('emits nothing for a row asking for no copies', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 0])])
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
    expect(nodesOfType(ctx, 'AreaTrigger')).toHaveLength(0)
  })

  it('leaves a whole generated arena byte-identical with no tier dropping', () => {
    const params = defaultParameters()
    const cleared = {
      ...params.boss.fights[0].arena,
      waves: params.boss.fights[0].arena.waves.map((w) => {
        const next = { ...w }
        delete next.pickups
        return next
      })
    }
    const absent = buildBossArena(freshCtx(4242), cleared, 0)

    // the same arena with the lists explicitly empty rather than absent
    const explicit = {
      ...params.boss.fights[0].arena,
      waves: params.boss.fights[0].arena.waves.map((w) => ({ ...w, pickups: [] as WavePickup[] }))
    }
    expect(buildBossArena(freshCtx(4242), explicit, 0).xml).toBe(absent.xml)
  })
})

describe('boss wave pickups — a count is copies', () => {
  it('emits one one-shot SpawnObject per copy', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 4])])

    const all = spawns(ctx)
    expect(all).toHaveLength(4)
    for (const s of all) {
      // Not `trigger-times: 4` on one node: a SpawnObject spawns ONE actor per
      // incoming trigger and a tier trigger fires once, so folding the count in
      // would drop one item and bank three.
      expect(s.triggerTimes).toBe(1)
      expect(s.actorPath).toBe('items/health_4.xml')
    }
  })

  it("fills a lane in order, one cursor per lane carried across the rows", () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 1], ['mana_2', 2])])

    const all = spawns(ctx)
    expect(all).toHaveLength(3)
    expect(all.map((s) => s.actorPath)).toEqual([
      'items/health_4.xml',
      'items/mana_2.xml',
      'items/mana_2.xml'
    ])
    // The health copy takes the health lane's first slot; the two mana copies
    // take the mana lane's first two. Separate cursors, so the health row does
    // not push the mana row along.
    expect(all.map(tileOf)).toEqual([
      tileOf(PAD.health[0]),
      tileOf(PAD.mana[0]),
      tileOf(PAD.mana[1])
    ])
  })

  it('carries a lane cursor across tiers so later drops sit beside earlier ones', () => {
    const ctx = freshCtx()
    // 50% drops one health, boss death drops two more: three health in a column.
    buildRig(ctx, [wave(), wave(), wave(['health_4', 1]), wave(), wave(['health_4', 2])])

    const tiles = spawns(ctx).map(tileOf)
    expect(tiles).toEqual([PAD.health[0], PAD.health[1], PAD.health[2]].map(tileOf))
    expect(new Set(tiles).size).toBe(3)
  })

  it('routes each item kind to its own lane', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 1], ['mana_2', 1], ['potion_2', 1], ['upgrade_damage', 1])])

    const byPath = new Map(spawns(ctx).map((s) => [s.actorPath, tileOf(s)]))
    expect(byPath.get('items/health_4.xml')).toBe(tileOf(PAD.health[0]))
    expect(byPath.get('items/mana_2.xml')).toBe(tileOf(PAD.mana[0]))
    expect(byPath.get('items/powerup_potion2.xml')).toBe(tileOf(PAD.potion[0]))
    expect(byPath.get('items/upgrade_damage.xml')).toBe(tileOf(PAD.upgrade[0]))
  })

  it('lays the eight upgrades out as the two-wide block of the reference layout', () => {
    const ctx = freshCtx()
    const upgrades = PICKUP_DEFS.filter((d) => d.lane === 'upgrade')
    expect(upgrades).toHaveLength(8)
    buildRig(ctx, [wave(...upgrades.map((d): [string, number] => [d.id, 1]))])

    const tiles = spawns(ctx).map(tileOf)
    expect(new Set(tiles).size).toBe(8)
    expect(tiles).toEqual(PAD.upgrade.slice(0, 8).map(tileOf))
    // two columns, four rows
    expect(new Set(spawns(ctx).map((s) => s.x)).size).toBe(2)
    expect(new Set(spawns(ctx).map((s) => s.y)).size).toBe(4)
  })

  it('drops an extra life in the consumables row alongside the potions', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['powerup_1up', 1], ['powerup_7up', 1])])

    const all = spawns(ctx)
    expect(all.map((s) => s.actorPath)).toEqual([
      'items/powerup_1up.xml',
      'items/powerup_7up.xml'
    ])
    expect(all.map(tileOf)).toEqual([tileOf(PAD.potion[0]), tileOf(PAD.potion[1])])
  })

  it('puts the potions in the bottom row, nearest the door', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['potion_1', 1], ['potion_2', 1], ['potion_3', 1])])

    const all = spawns(ctx)
    // one row, and further south than any other lane's first slot
    expect(new Set(all.map((s) => s.y)).size).toBe(1)
    expect(all[0].y).toBeGreaterThan(PAD.health[0].y)
    expect(all[0].y).toBeGreaterThan(PAD.upgrade[0].y)
    // centred on the entrance
    expect(all.map((s) => s.x).sort((a, b) => a - b)).toEqual([
      ENTRANCE_CX - 1,
      ENTRANCE_CX,
      ENTRANCE_CX + 1
    ])
  })

  it('spills into the overflow column before it ever stacks', () => {
    const ctx = freshCtx()
    // One more than the visible column holds: the extra widens the lane rather
    // than landing on an occupied tile.
    buildRig(ctx, [wave(['mana_2', PAD_ROWS + 1])])

    const all = spawns(ctx)
    expect(all).toHaveLength(PAD_ROWS + 1)
    expect(new Set(all.map(tileOf)).size).toBe(PAD_ROWS + 1)
    expect(new Set(all.map((s) => s.x)).size).toBe(2)
  })

  it('wraps within the lane once a tier asks for more copies than it has slots', () => {
    const ctx = freshCtx()
    const slots = PAD.mana.length
    buildRig(ctx, [wave(['mana_2', slots + 2])])

    const all = spawns(ctx)
    expect(all).toHaveLength(slots + 2)
    expect(tileOf(all[0])).toBe(tileOf(all[slots]))
  })

  it('keeps every drop on the pad, and the pad inside the arena', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 3]), wave(), wave(['potion_2', 2]), wave(), wave(['mana_2', 5])])

    const valid = new Set(Object.values(PAD).flat().map(tileOf))
    for (const s of spawns(ctx)) {
      expect(valid.has(tileOf(s)), tileOf(s)).toBe(true)
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThan(ARENA_W)
      expect(s.y).toBeLessThan(ARENA_H)
    }
  })

  it('drops near the entrance rather than out at the arena edges', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 1], ['mana_2', 1], ['potion_2', 1], ['upgrade_mana', 1])])

    // The bug this replaced dealt drops onto the 9 spawn anchors, which put one
    // on the north wall ~36 tiles from the door. Nothing may be further than
    // the pad is deep.
    for (const s of spawns(ctx)) {
      expect(ENTRANCE_TOP - s.y, tileOf(s)).toBeLessThanOrEqual(PAD_ROWS + 2)
      expect(Math.abs(s.x - ENTRANCE_CX), tileOf(s)).toBeLessThanOrEqual(4)
    }
  })

  it('skips a pad slot a cover pillar sits on', () => {
    const mask = openFloor()
    const blocked = PAD.health[0]
    mask[blocked.x + blocked.y * ARENA_W] = 0

    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 1])], mask)

    const all = spawns(ctx)
    expect(all).toHaveLength(1)
    expect(tileOf(all[0])).not.toBe(tileOf(blocked))
    expect(tileOf(all[0])).toBe(tileOf(PAD.health[1]))
  })

  it('still drops the item when its whole lane is buried', () => {
    const mask = openFloor()
    for (const slot of PAD.mana) mask[slot.x + slot.y * ARENA_W] = 0

    const ctx = freshCtx()
    buildRig(ctx, [wave(['mana_2', 2])], mask)
    expect(spawns(ctx)).toHaveLength(2)
  })

  it('resolves the path of every item in the registry', () => {
    for (const def of PICKUP_DEFS) {
      const ctx = freshCtx()
      buildRig(ctx, [wave([def.id, 1])])
      expect(spawns(ctx)[0].actorPath, def.id).toBe(def.path)
      expect(def.path.startsWith('items/'), def.id).toBe(true)
      expect(def.path.endsWith('.xml'), def.id).toBe(true)
    }
  })
})

describe('boss wave pickups — wiring', () => {
  it('hangs the 100% tier off an AreaTrigger on the entrance shape', () => {
    const ctx = freshCtx()
    const shape = buildRig(ctx, [wave(['health_4', 2])])

    const triggers = nodesOfType(ctx, 'AreaTrigger')
    expect(triggers).toHaveLength(1)
    expect((triggers[0] as unknown as { shapeId: number }).shapeId).toBe(shape.id)
    // bounded: the entrance trigger re-fires every time a player walks back over
    // it, so without trigger-times the 100% drop would be an item fountain
    expect(spawnsFrom(triggers[0]).map((s) => s.triggerTimes)).toEqual([1, 1])
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
  })

  it('hangs each later tier off a GlobalEventTrigger naming its own threshold', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(['health_4', 1]), wave(['mana_2', 1]), wave(['potion_2', 1]), wave(['health_1', 1])])

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers.map(eventOf)).toEqual([...TIER_EVENT_NAMES])
    // no AreaTrigger at all — the 100% tier carries nothing
    expect(nodesOfType(ctx, 'AreaTrigger')).toHaveLength(0)

    for (const trigger of triggers) {
      expect(spawnsFrom(trigger)).toHaveLength(1)
    }
  })

  it('fires a tier that drops items but spawns no monsters', () => {
    // waves.ts skips a monsterless tier outright, which is exactly why this rig
    // builds its own trigger instead of sharing that one.
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave(['health_4', 1])])

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    expect(eventOf(triggers[0])).toBe('Boss 50%')
  })

  it('never switches an earlier tier\'s drops off', () => {
    // Unlike waveBuffs.ts, which replaces the previous tier's whole set: an item
    // is an object on the floor, and the health the party skipped at 50% is
    // still lying there at 25%.
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 1]), wave(['mana_2', 1]), wave(['potion_2', 1])])
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)
  })

  it('leaves every connection resolvable and no node with an empty connection list', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(['health_4', 2]), wave(), wave(['mana_2', 3]), wave(), wave(['potion_2', 1])])

    expect(connectionsResolve(ctx)).toBe(true)
    for (const node of ctx.scriptNodes) {
      if (node.type === 'AreaTrigger' || node.type === 'GlobalEventTrigger') {
        expect(node.connections.length, `${node.type} ${node.id}`).toBeGreaterThan(0)
      }
    }
  })

})

describe('boss wave pickups — determinism and invariant 6', () => {
  it('draws no random values from any stream', () => {
    const ctx = freshCtx(4242)
    const before = [ctx.rand.nextInt(1e9), ctx.cosmeticRand.nextInt(1e9), ctx.bossRand.nextInt(1e9)]

    const after = freshCtx(4242)
    buildRig(after, [wave(['health_4', 6]), wave(['mana_2', 4]), wave(['potion_2', 2]), wave(), wave(['health_1', 9])])
    expect([after.rand.nextInt(1e9), after.cosmeticRand.nextInt(1e9), after.bossRand.nextInt(1e9)]).toEqual(before)
  })

  it('is byte-identical for the same seed and the same drop table', () => {
    const params = defaultParameters()
    const a = buildBossArena(freshCtx(777), params.boss.fights[0].arena, 0)
    const b = buildBossArena(freshCtx(777), params.boss.fights[0].arena, 0)
    expect(a.xml).toBe(b.xml)
  })

  it('moves no dungeon floor when the drop table changes', () => {
    const withDrops = defaultParameters()
    const without = defaultParameters()
    without.boss.fights[0].arena.waves = without.boss.fights[0].arena.waves.map((w) => {
      const next = { ...w }
      delete next.pickups
      return next
    })

    for (const seed of [1, 4242]) {
      const on = generateDungeon(withDrops, seed) as DungeonResult
      const off = generateDungeon(without, seed) as DungeonResult
      expect('files' in on, `seed ${seed}`).toBe(true)

      for (let i = 0; i < withDrops.levels; i++) {
        const path = `levels/level${i}.xml`
        expect(on.files.find((f) => f.path === path)!.content, `seed ${seed} floor ${i}`).toBe(
          off.files.find((f) => f.path === path)!.content
        )
      }

      // only the arena moves, and it must actually move — otherwise this test
      // would pass on a rig that emits nothing
      expect(on.files.find((f) => f.path === 'levels/boss0.xml')!.content, `seed ${seed} arena`).not.toBe(
        off.files.find((f) => f.path === 'levels/boss0.xml')!.content
      )
    }
  })
})

describe('boss wave pickups — stock defaults', () => {
  it('every preset resupplies at 50%, potions at 25% and doubles after the kill', () => {
    // Only the three beta-classic presets share this exact stock table — it
    // comes from `withBoss()` spreading the same arena unchanged, a shape the
    // Claude-generated presets (config/claudePresets.ts) are not bound to.
    for (const preset of CAMPAIGN_PRESETS.filter((p) => p.group === 'classic')) {
      const waves = preset.build().boss.fights[0].arena.waves
      expect(wavePickups(waves[0]), `${preset.id} 100%`).toEqual([])
      expect(wavePickups(waves[1]), `${preset.id} 75%`).toEqual([])
      expect(wavePickups(waves[2]), `${preset.id} 50%`).toEqual([
        { item: 'powerup_health', count: 1 },
        { item: 'mana_2', count: 2 }
      ])
      expect(wavePickups(waves[3]), `${preset.id} 25%`).toEqual([{ item: 'potion_2', count: 1 }])
      expect(wavePickups(waves[BOSS_DEATH_WAVE]), `${preset.id} death`).toEqual([
        { item: 'powerup_health', count: 2 },
        { item: 'mana_2', count: 4 }
      ])
    }
  })

  it('never hands out an extra life by default', () => {
    // An extra life is opt-in: it is in the roster so a campaign CAN grant one,
    // but no preset's stock table drops one.
    const lives = new Set(PICKUP_DEFS.filter((d) => d.group === 'Lives').map((d) => d.id))
    expect(lives).toEqual(new Set(['powerup_1up', 'powerup_7up']))
    for (const preset of CAMPAIGN_PRESETS) {
      for (const w of preset.build().boss.fights[0].arena.waves) {
        for (const entry of wavePickups(w)) {
          expect(lives.has(entry.item), `${preset.id} drops ${entry.item}`).toBe(false)
        }
      }
    }
  })

  it('every stock drop names an item the registry knows', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      for (const wave of preset.build().boss.fights[0].arena.waves) {
        for (const entry of wavePickups(wave)) {
          expect(pickupById(entry.item), `${preset.id}: ${entry.item}`).toBeDefined()
        }
      }
    }
  })

  it('every preset validates clean', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const issues = validateParameters(preset.build())
      expect(issues.errors, preset.id).toEqual([])
    }
  })
})

describe('boss wave pickups — validation', () => {
  function issuesFor(pickups: WavePickup[]) {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[2].pickups = pickups
    return validateParameters(params)
  }

  it('rejects an item the game does not ship', () => {
    const { errors } = issuesFor([{ item: 'health_9', count: 1 }])
    expect(errors.some((e) => e.field === 'boss.fights.0.arena.waves.2.pickups.0.item')).toBe(true)
  })

  it('rejects a count below one, fractional, or past the bound', () => {
    for (const count of [0, -3, 1.5, MAX_PICKUP_COUNT + 1]) {
      const { errors } = issuesFor([{ item: 'health_4', count }])
      expect(
        errors.some((e) => e.field === 'boss.fights.0.arena.waves.2.pickups.0.count'),
        `count ${count}`
      ).toBe(true)
    }
  })

  it('accepts the bound itself', () => {
    const { errors } = issuesFor([{ item: 'health_4', count: MAX_PICKUP_COUNT }])
    expect(errors.filter((e) => e.field.startsWith('boss.fights.0.arena.waves.2.pickups'))).toEqual([])
  })

  it('warns about the same item listed twice on one tier', () => {
    const { warnings } = issuesFor([
      { item: 'health_4', count: 1 },
      { item: 'health_4', count: 2 }
    ])
    expect(warnings.some((w) => w.field === 'boss.fights.0.arena.waves.2.pickups.1.item')).toBe(true)
  })

  it('does not warn about the same item on two different tiers', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[1].pickups = [{ item: 'health_4', count: 1 }]
    params.boss.fights[0].arena.waves[2].pickups = [{ item: 'health_4', count: 1 }]
    const { warnings } = validateParameters(params)
    expect(warnings.filter((w) => w.field.endsWith('pickups.0.item'))).toEqual([])
  })
})
