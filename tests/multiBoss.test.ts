/**
 * Multiple bosses in one arena or on one dungeon floor (issue #64 part 1, and
 * the follow-up that added exact lineups, stacking and the raised cap).
 *
 * `boss.test.ts` and `dungeonBoss.test.ts` already prove count = 1 is
 * byte-identical to the pre-feature output (their existing snapshots did not
 * change when this feature landed — see the suite run in the handback). This
 * file is about count > 1 only.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { plainParameters } from './params'
import type { BossArenaOptions, DungeonBoss } from '../src/generator/config/parameters'
import { buildBossArena } from '../src/generator/boss/arena'
import { BOSS_DEFS, BOSS_DEF_LIST, expandLineup } from '../src/generator/boss/bosses'
import type { BossDef } from '../src/generator/boss/bosses'
import { ARENA_LAYOUT_SLOTS, arenaBossLayout } from '../src/generator/boss/geometry'
import { anchors } from '../src/generator/boss/anchors'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { OPENED_TEXT_MULTI } from '../src/generator/dungeonBoss/opener'
import type { AeLevel, AeScript } from '../src/generator/ae/model'
import { idsParam, intParam, levelsOf, scriptById, scriptsOf, textsOf } from './ae'

function freshCtx(seed: number): GenerationContext {
  return new GenerationContext(plainParameters(), seed)
}

function arenaOptions(overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return { ...plainParameters().boss.fights[0].arena, ...overrides }
}

const MULTI_POOL = ['boss_knight', 'boss_lich', 'boss_worm', 'boss_anubis']

function multiArena(count: number, overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return arenaOptions({
    minWidth: 50,
    maxWidth: 50,
    minHeight: 50,
    maxHeight: 50,
    bossPool: MULTI_POOL,
    bossCount: count,
    invulnerability: { enabled: true, seconds: [30, 30, 30], countdown: true },
    ...overrides
  })
}

/** How many of the level's units are `id`'s own boss actor (not a bodyguard from the same folder). */
function bossActors(level: AeLevel, id: string): number {
  return level.units.filter((u) => u.path === BOSS_DEFS[id as keyof typeof BOSS_DEFS].actorPath).length
}

/**
 * Asserts the "all bosses died" rig matches the user's playtested
 * `level0_fixed.xml` (2026-09-23 DISCOVERY-LOG), in AE terms: one Variable
 * holding the boss count; per boss, a one-shot `UnitDestroyedTrigger` whose
 * connections are its own ChangeVariables (subtract 1) THEN its own
 * CheckVariables (== 0); every CheckVariables with the same `OnTrue` list.
 * Returns the death triggers and that shared `OnTrue` list.
 */
function allBossesDiedRig(level: AeLevel): { deathTriggers: AeScript[]; onTrue: number[] } {
  const changes = scriptsOf(level, 'ChangeVariables')
  const checks = scriptsOf(level, 'CheckVariables')
  const changeIds = new Set(changes.map((c) => c.id))
  // the rig's signature: a one-shot death trigger whose first link is a ChangeVariables
  const deathTriggers = scriptsOf(level, 'UnitDestroyedTrigger').filter(
    (t) => t.triggerTimes === 1 && changeIds.has(t.connections[0]?.[0])
  )
  const n = deathTriggers.length
  const mine = (ids: number[]) => ids.map((id) => scriptById(level, id)!)

  const ownChanges = mine(deathTriggers.map((t) => t.connections[0][0]))
  const ownChecks = mine(deathTriggers.map((t) => t.connections[1][0]))
  const varIds = new Set(ownChanges.flatMap((c) => idsParam(c, 'Variables')))
  expect(varIds.size).toBe(1)
  const [varId] = varIds
  const variable = scriptById(level, varId)!
  expect(variable.cls).toBe('Variable')
  expect(intParam(variable, 'Value')).toBe(n)

  for (const c of ownChanges) {
    expect(c.cls).toBe('ChangeVariables')
    expect(intParam(c, 'Function')).toBe(3) // AE ChangeFunc.Subtract
    expect(intParam(c, 'Value')).toBe(1)
  }
  const onTrue = idsParam(ownChecks[0], 'OnTrue')
  expect(onTrue.length).toBeGreaterThan(0)
  for (const c of ownChecks) {
    expect(c.cls).toBe('CheckVariables')
    expect(idsParam(c, 'Variable')).toEqual([varId])
    // AE CompareFunc.Equal is the default, so it is left out
    expect(intParam(c, 'Function') ?? 1).toBe(1)
    expect(intParam(c, 'Value')).toBe(0)
    expect(idsParam(c, 'OnTrue')).toEqual(onTrue)
    // A CheckVariables fires through OnTrue only.
    expect(c.connections).toEqual([])
  }
  expect(checks.length).toBeGreaterThanOrEqual(n)

  // Each boss has its own pair — none shared.
  expect(new Set([...ownChanges, ...ownChecks].map((c) => c.id)).size).toBe(2 * n)
  return { deathTriggers, onTrue }
}

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

describe('multi-boss arena (issue #64 part 1)', () => {
  it('places exactly bossCount boss actors', () => {
    const arena = multiArena(3)
    const ctx = freshCtx(1)
    const { level } = buildBossArena(ctx, arena, 0)
    // Count each boss's own actor unit — a bodyguard shares its boss's folder
    // (issue #64 part 2), so match the exact unit, not the folder.
    expect(MULTI_POOL.reduce((n, id) => n + bossActors(level, id), 0)).toBe(3)
  })

  it('emits no health tier trigger, no ToggleImmortality and no save point', () => {
    const arena = multiArena(3)
    const { level } = buildBossArena(freshCtx(2), arena, 0)
    // the 75/50/25% tiers are ActorHealthTriggers in AE; a multi-boss fight
    // has no single boss to watch, so it carries none
    expect(scriptsOf(level, 'ActorHealthTrigger')).toHaveLength(0)
    expect(scriptsOf(level, 'ToggleImmortality')).toHaveLength(0)
    expect(scriptsOf(level, 'SuperCheckPoint')).toHaveLength(0)
  })

  it('wires the playtested Variable / ChangeVariables / CheckVariables rig, one per boss', () => {
    const arena = multiArena(4)
    const ctx = freshCtx(3)
    const { level } = buildBossArena(ctx, arena, 0)

    const rig = allBossesDiedRig(level)
    expect(rig.deathTriggers).toHaveLength(4)
    expect(scriptsOf(level, 'Counter')).toHaveLength(0)
  })

  it('every CheckVariables fires the seal-destroying DestroyUnits from OnTrue', () => {
    const arena = multiArena(2)
    const ctx = freshCtx(4)
    const { level } = buildBossArena(ctx, arena, 0)

    const { onTrue } = allBossesDiedRig(level)
    expect(scriptsOf(level, 'DestroyUnits').some((d) => onTrue.includes(d.id))).toBe(true)
  })

  it('layout has no boss/boss, boss/anchor or boss/entrance overlap for every pool combination', () => {
    const width = 50
    const height = 50
    const entrance = { x: 24, y: 48, width: 3, height: 2 }
    const defs = BOSS_DEF_LIST.filter((d) => MULTI_POOL.includes(d.id))

    function combos(n: number): BossDef[][] {
      if (n === 0) return [[]]
      const smaller = combos(n - 1)
      const out: BossDef[][] = []
      for (const c of smaller) for (const d of defs) out.push([...c, d])
      return out
    }

    for (let count = 1; count <= 4; count++) {
      for (const combo of combos(count)) {
        // Mirrors arena.ts: the anchor list is computed WITH the primary
        // centre boss's clearance before the layout ever runs, so the C
        // anchor is already pushed clear of it.
        const primary = combo[0]
        const anchorList = anchors(width, height, primary === undefined ? {} : { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } })
        const placements = arenaBossLayout(width, height, entrance, anchorList, combo)
        expect(placements, `combo ${combo.map((d) => d.id).join(',')} at count ${count}`).not.toBeNull()
        if (placements === null) continue
        // no two placements overlap
        for (let i = 0; i < placements.length; i++) {
          for (let j = i + 1; j < placements.length; j++) {
            const a = placements[i]
            const b = placements[j]
            const overlapX = Math.abs(a.x - b.x) < (a.def.footprintWidth + b.def.footprintWidth) / 2
            const overlapY = Math.abs(a.y - b.y) < (a.def.footprintHeight + b.def.footprintHeight) / 2
            expect(overlapX && overlapY).toBe(false)
          }
        }
        // every boss stays inside the interior
        for (const p of placements) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThan(width)
          expect(p.y).toBeLessThan(height)
        }
      }
    }
  })

  it('is deterministic: same seed and params produce an identical level', () => {
    const arena = multiArena(3)
    expect(buildBossArena(freshCtx(99), arena, 0).level).toEqual(buildBossArena(freshCtx(99), arena, 0).level)
  })

  it('count = 1 through the multi-boss code path matches the historical single-boss shape', () => {
    // bossCount = 1 must take the SAME branch as an arena that never set
    // bossCount at all — asserted structurally: exactly one boss actor, and
    // the ordinary single-boss death trigger on the boss itself is present
    // (not the all-bosses-died Variable rig).
    const arena = multiArena(1)
    const ctx = freshCtx(5)
    const { level } = buildBossArena(ctx, arena, 0)
    for (const cls of ['Variable', 'ChangeVariables', 'CheckVariables']) {
      expect(scriptsOf(level, cls)).toHaveLength(0)
    }
    const bossIds = new Set(level.units.filter((u) => MULTI_POOL.some((id) => u.path === BOSS_DEFS[id as keyof typeof BOSS_DEFS].actorPath)).map((u) => u.id))
    expect(bossIds.size).toBe(1)
    expect(scriptsOf(level, 'UnitDestroyedTrigger').some((t) => idsParam(t, 'Units').some((id) => bossIds.has(id)))).toBe(true)
  })
})

describe('multi-boss dungeon floor (issue #64 part 1)', () => {
  function multiFloorParams(count: number): DungeonParameters {
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    const boss: DungeonBoss = {
      enabled: true,
      bossPool: ['boss_knight', 'boss_lich', 'boss_anubis'],
      bossCount: count,
      waves: Array.from({ length: 5 }, () => ({ monsters: [], monsterMax: {}, defaultIntervalMs: 1500 })),
      invulnerability: { enabled: false, seconds: [0, 0, 0], countdown: true },
      monsterMultiplier: 1.0
    }
    params.levelBoss = Array.from({ length: params.levels }, () => ({ ...boss, enabled: false }))
    params.levelBoss[0] = boss
    // A boss floor needs plenty of rooms for a dead-end sealed gateway room to
    // roll reliably.
    params.minRoomCount = 14
    params.maxRoomCount = 16
    return params
  }

  it('places N boss actors, all reachable, and the floor still generates', () => {
    const params = multiFloorParams(3)
    const result = generateOk(params, 12345)
    const level0 = levelsOf(result).get('floor0')!
    expect(['boss_knight', 'boss_lich', 'boss_anubis'].reduce((n, id) => n + bossActors(level0, id), 0)).toBe(3)
  })

  it('is deterministic across two runs with the same seed', () => {
    const params = multiFloorParams(3)
    const a = generateOk(params, 555)
    const b = generateOk(params, 555)
    expect(a.files).toEqual(b.files)
  })

  it('wires the seal opener off the all-bosses-died check, not a single death trigger, and no invuln/checkpoint scripts', () => {
    const params = multiFloorParams(2)
    const result = generateOk(params, 777)
    const level0 = levelsOf(result).get('floor0')!
    // The shape the user's playtested `level0_fixed.xml` uses: every boss's
    // CheckVariables destroys the seal and announces the opening.
    const { deathTriggers, onTrue } = allBossesDiedRig(level0)
    expect(deathTriggers).toHaveLength(2)
    expect(scriptsOf(level0, 'DestroyUnits').some((d) => onTrue.includes(d.id))).toBe(true)
    expect(textsOf(level0)).toContain(OPENED_TEXT_MULTI)
    const announce = scriptsOf(level0, 'AnnounceText').find((a) => a.params.some((pr) => pr.value === OPENED_TEXT_MULTI))
    expect(onTrue).toContain(announce!.id)
    expect(scriptsOf(level0, 'ToggleImmortality')).toHaveLength(0)
    expect(scriptsOf(level0, 'SuperCheckPoint')).toHaveLength(0)
    // and no single-boss death trigger outside the rig
    const rigIds = new Set(deathTriggers.map((t) => t.id))
    const bossUnits = new Set(level0.units.filter((u) => u.path.startsWith('actors/bosses/')).map((u) => u.id))
    const stray = scriptsOf(level0, 'UnitDestroyedTrigger').filter((t) => !rigIds.has(t.id) && idsParam(t, 'Units').some((id) => bossUnits.has(id)))
    expect(stray).toHaveLength(0)
  })
})

describe('boss selection mode: exact lineups (issue #64 follow-up)', () => {
  it('arena lineup mode emits exactly the lineup, not a random pick, and ignores bossPool entirely', () => {
    const arena = multiArena(0, {
      // Deliberately empty and unrelated to the lineup — lineup mode must not
      // read bossPool at all.
      bossPool: [],
      bossSelection: 'lineup',
      bossLineup: { boss_knight: 3, boss_lich: 1 }
    })
    const { level } = buildBossArena(freshCtx(10), arena, 0)
    expect(bossActors(level, 'boss_knight')).toBe(3)
    expect(bossActors(level, 'boss_lich')).toBe(1)
  })

  it('draws zero ctx.bossRand values for the pick — arena geometry is identical for two different lineups of the same size', () => {
    // Neither lineup includes the dragon, so the alcove-wall candidate pool
    // (N/E/W) is the same size for both — the only way this test could
    // otherwise legitimately diverge. If the pick drew anything at all, the
    // alcove wall (the very next draw) would land differently and the wall
    // bitmap and grid size below would differ.
    function lineupArena(lineup: Record<string, number>): BossArenaOptions {
      return multiArena(0, { minWidth: 50, maxWidth: 50, minHeight: 50, maxHeight: 50, bossSelection: 'lineup', bossLineup: lineup })
    }
    const a = buildBossArena(freshCtx(42), lineupArena({ boss_knight: 3 }), 0)
    const b = buildBossArena(freshCtx(42), lineupArena({ boss_knight: 1, boss_lich: 2, boss_worm: 5 }), 0)
    expect(a.preview.mapWidth).toBe(b.preview.mapWidth)
    expect(a.preview.mapHeight).toBe(b.preview.mapHeight)
    expect(a.preview.walls).toBe(b.preview.walls)
  })

  it('is deterministic: same seed and lineup produce an identical level', () => {
    const arena = multiArena(0, { bossSelection: 'lineup', bossLineup: { boss_knight: 2, boss_lich: 2 } })
    expect(buildBossArena(freshCtx(11), arena, 0).level).toEqual(buildBossArena(freshCtx(11), arena, 0).level)
  })

  it('floor lineup places exactly the lineup', () => {
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    const boss: DungeonBoss = {
      enabled: true,
      bossPool: [], // deliberately empty and unread in lineup mode
      bossSelection: 'lineup',
      bossLineup: { boss_knight: 2, boss_lich: 1 },
      waves: Array.from({ length: 5 }, () => ({ monsters: [], monsterMax: {}, defaultIntervalMs: 1500 })),
      invulnerability: { enabled: false, seconds: [0, 0, 0], countdown: true },
      monsterMultiplier: 1.0
    }
    params.levelBoss = Array.from({ length: params.levels }, () => ({ ...boss, enabled: false }))
    params.levelBoss[0] = boss
    params.minRoomCount = 14
    params.maxRoomCount = 16

    const result = generateOk(params, 24680)
    const level0 = levelsOf(result).get('floor0')!
    expect(bossActors(level0, 'boss_knight')).toBe(2)
    expect(bossActors(level0, 'boss_lich')).toBe(1)
  })
})

describe('bosses beyond the fixed layout slots stack instead of being rejected (issue #64 follow-up)', () => {
  it('arenaBossLayout places 20 bosses, in bounds, stacking onto at most ARENA_LAYOUT_SLOTS distinct positions', () => {
    const width = 50
    const height = 50
    const entrance = { x: 24, y: 48, width: 3, height: 2 }
    const ids = Array.from({ length: 20 }, (_, i) => MULTI_POOL[i % MULTI_POOL.length])
    const defs = ids.map((id) => BOSS_DEF_LIST.find((d) => d.id === id)!)
    const primary = defs[0]
    const anchorList = anchors(width, height, { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } })

    const placements = arenaBossLayout(width, height, entrance, anchorList, defs)
    expect(placements).not.toBeNull()
    expect(placements).toHaveLength(20)

    for (const p of placements!) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(width)
      expect(p.y).toBeLessThan(height)
    }

    // More placements than there are distinct slots means at least two share
    // a slot — the deliberate stacking this follow-up added. A slot is a
    // direction from the primary boss: each boss keeps its own footprint's
    // gap from the primary, so two stacked bosses of different sizes sit at
    // slightly different points of the same slot.
    const [first] = placements!
    const slotOf = (p: { x: number; y: number }) =>
      p === first ? 'C' : `${Math.sign(Math.round(p.x - first.x))},${Math.sign(Math.round(p.y - first.y))}`
    const distinctPositions = new Set(placements!.map(slotOf))
    expect(distinctPositions.size).toBeLessThan(placements!.length)
    expect(distinctPositions.size).toBeLessThanOrEqual(ARENA_LAYOUT_SLOTS)
  })

  it('a 20-boss random arena generates and places exactly 20 actors', () => {
    const arena = multiArena(20, { minWidth: 50, maxWidth: 50, minHeight: 50, maxHeight: 50 })
    const { level } = buildBossArena(freshCtx(13), arena, 0)
    expect(MULTI_POOL.reduce((n, id) => n + bossActors(level, id), 0)).toBe(20)
  })
})
