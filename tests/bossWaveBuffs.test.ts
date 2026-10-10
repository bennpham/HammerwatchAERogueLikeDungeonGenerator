/**
 * Boss wave buffs — the arena-wide buff field per health tier
 * (src/generator/boss/waveBuffs.ts).
 *
 * Two things are being proved. First, the replacement semantics: exactly one
 * arena buff is ever live, the 100% tier's arrives already on, and each later
 * tier switches off the nearest EARLIER tier that carries one — not `tier - 1`,
 * which may carry nothing. Second, invariant 6/8 for the arena: no tier
 * carrying a buff emits nothing at all, so an arena without them is
 * byte-identical and no seed moves.
 *
 * Uses bossWaves.test.ts's in-memory pattern — build the rig against a bare
 * context and read `ctx.scriptNodes` — rather than parsing XML, because what
 * matters here is which node points at which.
 */

import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import {
  BUFF_REFRESH_MS,
  BUFF_TARGET_TYPES,
  defaultParameters
} from '../src/generator/config/parameters'
import type { BossWave, BuffTarget } from '../src/generator/config/parameters'
import { waveBuffs } from '../src/generator/config/parameters'
import { CAMPAIGN_PRESETS } from '../src/generator/config/presets'
import { validateParameters } from '../src/generator/config/validation'
import { BUFF_DEFS } from '../src/generator/objects/buffTypes'
import { buildBossArena } from '../src/generator/boss/arena'
import { buildWaveBuffRig } from '../src/generator/boss/waveBuffs'
import { TIER_EVENT_NAMES } from '../src/generator/boss/waves'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

const ARENA_W = 30
const ARENA_H = 40

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

/**
 * A bare tier, optionally carrying a buff in the LEGACY single-buff form —
 * which is also what proves configs written before tiers took lists still
 * build the same rig.
 */
function wave(buff?: string, buffTarget?: BuffTarget): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 3000, buff, buffTarget }
}

/** A bare tier carrying any number of buffs, in the current list form. */
function waveWith(...buffs: [string, BuffTarget][]): BossWave {
  return {
    monsters: [],
    monsterMax: {},
    defaultIntervalMs: 3000,
    buffs: buffs.map(([buff, target]) => ({ buff, target }))
  }
}

function buildRig(ctx: GenerationContext, waves: BossWave[]) {
  buildWaveBuffRig(ctx, waves, ARENA_W, ARENA_H, 15, 38)
}

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

/** The ToggleElements reachable from `trigger`, as {state, element} pairs. */
function togglesFrom(trigger: ScriptNode): { state: number; element: number }[] {
  return trigger.connections
    .filter((n) => n.type === 'ToggleElement')
    .map((n) => n as unknown as { state: number; element: number })
    .map(({ state, element }) => ({ state, element }))
}

function fields(ctx: GenerationContext) {
  return nodesOfType(ctx, 'DangerArea') as unknown as {
    id: number
    enabled: boolean
    damage: number
    freqMs: number
    buff: string
    shapeId: number
  }[]
}

describe('boss wave buffs — none means none', () => {
  it('emits nothing at all when no tier carries a buff', () => {
    const ctx = freshCtx()
    const before = ctx.scriptNodes.length
    const beforeId = ctx.idCounter
    buildRig(ctx, [wave(), wave(), wave(), wave(), wave()])

    expect(ctx.scriptNodes).toHaveLength(before)
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('emits nothing when every tier names an unknown buff', () => {
    const ctx = freshCtx()
    const beforeId = ctx.idCounter
    buildRig(ctx, [wave('no_such_buff'), wave('also_not_real')])
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('leaves a whole generated arena byte-identical with no tier buffed', () => {
    const params = defaultParameters()
    const plain = buildBossArena(freshCtx(4242), params.boss.fights[0].arena, 0)

    // The same arena, with the buff fields explicitly cleared rather than absent
    const cleared = {
      ...params.boss.fights[0].arena,
      waves: params.boss.fights[0].arena.waves.map((w) => ({ ...w, buff: '', buffTarget: 'players' as BuffTarget }))
    }
    const explicit = buildBossArena(freshCtx(4242), cleared, 0)

    expect(explicit.xml).toBe(plain.xml)
  })
})

describe('boss wave buffs — the field rig', () => {
  it('gives the 100% tier a live field and no trigger', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave(), wave(), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(1)
    expect(areas[0].enabled).toBe(true)
    expect(areas[0].damage).toBe(0)
    expect(areas[0].freqMs).toBe(BUFF_REFRESH_MS)
    expect(areas[0].buff).toBe('buffs/bloodlust.xml')

    // the opening state needs nothing to switch it on
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)
  })

  it('gives a later tier a disabled field switched on by its own threshold', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave('frost', 'players'), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(1)
    expect(areas[0].enabled).toBe(false)

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    // the tier array is offset by one: tier 2 fires on TIER_EVENT_NAMES[1]
    expect(eventOf(triggers[0])).toBe(TIER_EVENT_NAMES[1])
    expect(eventOf(triggers[0])).toBe('Boss 50%')

    const toggles = togglesFrom(triggers[0])
    // nothing earlier carries a buff, so there is nothing to switch off
    expect(toggles).toEqual([{ state: 0, element: areas[0].id }])
  })

  it('switches the previous tier off as it switches its own on', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost', 'players'), wave(), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    const [first, second] = areas

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)

    const toggles = togglesFrom(triggers[0])
    expect(toggles).toContainEqual({ state: 1, element: first.id }) // 1 disables
    expect(toggles).toContainEqual({ state: 0, element: second.id }) // 0 enables
    expect(toggles).toHaveLength(2)
  })

  it('the stock death tier is the only buffed tier, and it is bloodlust on monsters', () => {
    // What every preset now ships: nothing is buffed for the whole health
    // fight, and the horde that spawns on the kill fights strengthened. One
    // field, switched on by Boss Died, with no earlier field to switch off.
    // Shell Game is the one exception, enraged at 25% on purpose — below.
    for (const preset of CAMPAIGN_PRESETS) {
      if (preset.id === 'claude-shell-game') continue
      const waves = preset.build().boss.fights[0].arena.waves
      expect(waves.map(waveBuffs), preset.id).toEqual([
        [],
        [],
        [],
        [],
        [{ buff: 'bloodlust', target: 'monsters' }]
      ])

      const ctx = freshCtx()
      buildRig(ctx, waves)

      const areas = fields(ctx)
      expect(areas, preset.id).toHaveLength(1)
      expect(areas[0].enabled).toBe(false)
      expect(areas[0].buff).toBe('buffs/bloodlust.xml')
      expect(areas[0].damage).toBe(0)

      const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
      expect(triggers).toHaveLength(1)
      expect(eventOf(triggers[0])).toBe(TIER_EVENT_NAMES[TIER_EVENT_NAMES.length - 1])
      expect(togglesFrom(triggers[0])).toEqual([{ state: 0, element: areas[0].id }])
      expect(connectionsResolve(ctx)).toBe(true)
    }
  })

  it('Shell Game enrages its arena at 25%, then hands over to the stock death field', () => {
    const preset = CAMPAIGN_PRESETS.find((p) => p.id === 'claude-shell-game')!
    const waves = preset.build().boss.fights[0].arena.waves
    const bloodlust = [{ buff: 'bloodlust', target: 'monsters' }]
    expect(waves.map(waveBuffs)).toEqual([[], [], [], bloodlust, bloodlust])

    const ctx = freshCtx()
    buildRig(ctx, waves)
    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    for (const area of areas) {
      expect(area.enabled).toBe(false)
      expect(area.buff).toBe('buffs/bloodlust.xml')
    }
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(2)
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('switches off the nearest EARLIER buffed tier, skipping tiers that carry none', () => {
    const ctx = freshCtx()
    // 100% and 25% only — tier 3's trigger must clear tier 0's field, and
    // there is no tier-2 field for it to name.
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave(), wave(), wave('frost', 'players'), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    const [tier0, tier3] = areas

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    const toggles = togglesFrom(triggers[0])
    expect(toggles).toContainEqual({ state: 1, element: tier0.id })
    expect(toggles).toContainEqual({ state: 0, element: tier3.id })
  })

  it('gives each tier its own shape, with the target it asked for', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost', 'players'), wave('cripple', 'both'), wave(), wave()])

    const areas = fields(ctx)
    const shapes = nodesOfType(ctx, 'RectangleShape') as unknown as { id: number; types: number }[]
    expect(areas).toHaveLength(3)
    expect(shapes).toHaveLength(3)

    const typesOf = (index: number) => shapes.find((s) => s.id === areas[index].shapeId)?.types
    expect(typesOf(0)).toBe(BUFF_TARGET_TYPES.monsters)
    expect(typesOf(1)).toBe(BUFF_TARGET_TYPES.players)
    expect(typesOf(2)).toBe(BUFF_TARGET_TYPES.both)
  })

  it('defaults an unstated target to players', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('frost'), wave(), wave(), wave(), wave()])
    const shapes = nodesOfType(ctx, 'RectangleShape') as unknown as { types: number }[]
    expect(shapes[0].types).toBe(BUFF_TARGET_TYPES.players)
  })

  it('buffs the after-the-boss-dies tier off the Boss Died event', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave(), wave(), wave('test', 'players')])

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    expect(eventOf(triggers[0])).toBe(TIER_EVENT_NAMES[3])
    expect(TIER_EVENT_NAMES[3]).toBe('Boss Died')
    expect(fields(ctx)[0].buff).toBe('buffs/test.xml')
  })

  it('resolves every connection to a real node', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost'), wave(), wave('cripple', 'both'), wave('test')])
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('skips an unknown buff and still wires the tiers around it', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('no_such_buff'), wave('frost'), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    // tier 2 switches off tier 0, because tier 1 never produced a field
    const toggles = togglesFrom(nodesOfType(ctx, 'GlobalEventTrigger')[0])
    expect(toggles).toContainEqual({ state: 1, element: areas[0].id })
  })
})

describe('boss wave buffs — several buffs on one tier', () => {
  it('gives one tier a field per buff, each with its own shape and target', () => {
    const ctx = freshCtx()
    buildRig(ctx, [waveWith(['bloodlust', 'monsters'], ['frost', 'players']), wave(), wave(), wave(), wave()])

    const areas = fields(ctx)
    const shapes = nodesOfType(ctx, 'RectangleShape') as unknown as { id: number; types: number }[]
    expect(areas).toHaveLength(2)
    expect(shapes).toHaveLength(2)
    expect(areas.map((a) => a.buff)).toEqual(['buffs/bloodlust.xml', 'buffs/frost.xml'])
    // tier 0 arrives live, whichever of its fields you look at
    expect(areas.every((a) => a.enabled)).toBe(true)

    const typesOf = (index: number) => shapes.find((s) => s.id === areas[index].shapeId)?.types
    expect(typesOf(0)).toBe(BUFF_TARGET_TYPES.monsters)
    expect(typesOf(1)).toBe(BUFF_TARGET_TYPES.players)
  })

  it('switches every field of the previous tier off, and every one of its own on', () => {
    const ctx = freshCtx()
    buildRig(ctx, [
      waveWith(['bloodlust', 'monsters'], ['frost', 'players']),
      waveWith(['cripple', 'monsters'], ['test', 'both']),
      wave(),
      wave(),
      wave()
    ])

    const areas = fields(ctx)
    expect(areas).toHaveLength(4)
    const [first, second, third, fourth] = areas

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)

    const toggles = togglesFrom(triggers[0])
    expect(toggles).toHaveLength(4)
    expect(toggles).toContainEqual({ state: 1, element: first.id })
    expect(toggles).toContainEqual({ state: 1, element: second.id })
    expect(toggles).toContainEqual({ state: 0, element: third.id })
    expect(toggles).toContainEqual({ state: 0, element: fourth.id })
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('emits the same nodes for a one-entry list as for the legacy single buff', () => {
    const listed = freshCtx()
    buildRig(listed, [waveWith(['bloodlust', 'monsters']), wave(), waveWith(['frost', 'players']), wave(), wave()])

    const legacy = freshCtx()
    buildRig(legacy, [wave('bloodlust', 'monsters'), wave(), wave('frost', 'players'), wave(), wave()])

    expect(listed.scriptNodes.map((n) => n.getXML())).toEqual(legacy.scriptNodes.map((n) => n.getXML()))
    expect(listed.idCounter).toBe(legacy.idCounter)
  })
})

describe('boss wave buffs — validation', () => {
  const withWaveBuffs = (index: number, buffs: [string, BuffTarget][]) => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === index ? { ...w, buffs: buffs.map(([buff, target]) => ({ buff, target })) } : w
    )
    return validateParameters(params)
  }

  const withWaveBuff = (index: number, buff: string, buffTarget: BuffTarget = 'players') =>
    withWaveBuffs(index, [[buff, buffTarget]])

  it('accepts a stock campaign, which carries no wave buff', () => {
    expect(validateParameters(defaultParameters()).valid).toBe(true)
  })

  it('accepts a real buff on every tier', () => {
    for (let i = 0; i < 5; i++) {
      expect(withWaveBuff(i, 'frost', 'players').valid, `tier ${i}`).toBe(true)
    }
  })

  it('accepts several real buffs on one tier', () => {
    expect(withWaveBuffs(1, [['frost', 'monsters'], ['cripple', 'both']]).valid).toBe(true)
  })

  it('rejects an unknown buff id', () => {
    const result = withWaveBuff(1, 'no_such_buff')
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.fights.0.arena.waves.1.buffs.0.buff')
  })

  it('rejects an unknown target', () => {
    const result = withWaveBuff(1, 'frost', 'everyone' as BuffTarget)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.fights.0.arena.waves.1.buffs.0.target')
  })

  it('puts no upper bound on how many buffs a tier carries', () => {
    const everything = BUFF_DEFS.map((def) => [def.id, 'players'] as [string, BuffTarget])
    const result = withWaveBuffs(1, everything)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('warns about a duplicate buff/target pair on one tier', () => {
    const result = withWaveBuffs(1, [['frost', 'monsters'], ['frost', 'monsters']])
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('boss.fights.0.arena.waves.1.buffs.1.buff')
  })

  it('does not warn when a strengthening buff catches the horde', () => {
    // Unlike a per-floor buff, where a strengthener on monsters usually means a
    // mis-aimed target, the arena's five tiers are an explicit difficulty
    // ladder — the stock death tier ships bloodlusted, so warning here would put
    // a message on every stock run.
    const result = withWaveBuff(2, 'bloodlust', 'monsters')
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).not.toContain('boss.fights.0.arena.waves.2.buffs.0.target')
  })

  it('leaves the stock defaults warning-free about their own arena buffs', () => {
    const fields = validateParameters(defaultParameters()).warnings.map((w) => w.field)
    expect(fields.filter((f) => /^boss\.arena\.waves\.\d+\.buffs\./.test(f))).toEqual([])
  })

  it('still warns about a strengthener on a dungeon floor', () => {
    // The per-floor rule is untouched: a whole floor of bloodlusted monsters is
    // still far more likely to be a slip than a design.
    const params = defaultParameters()
    params.levelBuffs = params.levelBuffs?.map((b, i) =>
      i === 0 ? [{ buff: 'bloodlust', target: 'monsters' as BuffTarget }] : b
    )
    const result = validateParameters(params)
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('levelBuffs.0.0.target')
  })

  it('warns when the death tier buffs monsters it does not spawn', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 4
        ? { ...w, monsters: [], monsterMax: {}, buffs: [{ buff: 'frost', target: 'monsters' as BuffTarget }] }
        : w
    )
    const result = validateParameters(params)
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('boss.fights.0.arena.waves.4.buffs.0.target')
  })

  it('still validates a tier stored in the legacy single-buff form', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 1 ? { ...w, buff: 'no_such_buff', buffTarget: 'players' as BuffTarget } : w
    )
    const result = validateParameters(params)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.fights.0.arena.waves.1.buffs.0.buff')
  })
})
