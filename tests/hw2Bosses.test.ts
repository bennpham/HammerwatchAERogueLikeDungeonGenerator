import { describe, expect, it } from 'vitest'
import { defaultDungeonBoss, generateDungeon, validateParameters } from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import { BOSS_DEFS, BOSS_DEF_LIST } from '../src/generator/boss/bosses'
import { AE_ONLY } from '../src/generator/custom/sources'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { AE_ROOT } from './aeInstall'
import { generateOk, levelsOf, scriptsOf, strParam, unitsOf } from './ae'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT, danglingPaths } from './hw2Install'
import { plainParameters } from './params'

const SINKAGE = BOSS_DEFS.hw2_sinkage
const HW2_BOSSES = BOSS_DEF_LIST.filter((d) => d.source === 'hw2')

/** The stock parameters, the first arena on `pool` (random mode). */
function arenaOn(pool: string[]): DungeonParameters {
  const p = plainParameters()
  p.boss = {
    ...p.boss,
    enabled: true,
    fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, bossSelection: 'random', bossPool: pool, bossCount: 1 } } : f))
  }
  return p
}

describe('Hammerwatch 2 bosses', () => {
  it('need Hammerwatch 2 loaded, as a boss, in a pool or a lineup', () => {
    const pool = validateParameters(arenaOn(['hw2_sinkage']), AE_ONLY).errors
    expect(pool.some((e) => e.field === 'boss.fights.0.arena.bossPool' && /hw2_sinkage/.test(e.message) && /boss/.test(e.message))).toBe(true)
    const lined = arenaOn([])
    lined.boss.fights[0].arena = { ...lined.boss.fights[0].arena, bossSelection: 'lineup', bossLineup: { hw2_sinkage: 1 } }
    expect(validateParameters(lined, AE_ONLY).errors.some((e) => /hw2_sinkage/.test(e.message))).toBe(true)
    expect(validateParameters(arenaOn(['hw2_sinkage']), HW2_CONTENT).errors).toEqual([])
  })

  it('stay off dungeon floors: they need an arena', () => {
    expect(SINKAGE.mobile).toBe(false)
    const p = plainParameters()
    p.levelBoss = Array.from({ length: p.levels }, (_, i) => ({ ...defaultDungeonBoss(), enabled: i === 0, bossPool: ['hw2_sinkage'] }))
    expect(validateParameters(p, HW2_CONTENT).errors.some((e) => e.field.startsWith('levelBoss.0'))).toBe(true)
  })

  it('are the nine HW2 bosses, all arena-only', () => {
    expect(HW2_BOSSES.map((d) => d.id)).toEqual([
      'hw2_sinkage', 'hw2_shock_widow', 'hw2_malgar', 'hw2_blight', 'hw2_doombringer',
      'hw2_dace_arden', 'hw2_judge_supreme', 'hw2_barrington', 'hw2_archibald'
    ])
    for (const d of HW2_BOSSES) expect(d.arenaOnly && !d.mobile, d.id).toBe(true)
  })

  it.each(HW2_BOSSES.map((d) => [d.id, d] as const))('%s fights in the generated arena with our boss bar, and its unit is carried', (id, def) => {
    const r = generateOk(arenaOn([id]), 7)
    expect(r.customAssets).toContain(def.actorPath)
    const holding = [...levelsOf(r).values()].filter((l) => unitsOf(l, (u) => u.path === def.actorPath).length > 0)
    expect(holding).toHaveLength(1)
    const bars = scriptsOf(holding[0], 'CreateBossBar')
    expect(bars).toHaveLength(1)
    expect(strParam(bars[0], 'Name')).toBe(def.barName)
  })

  it("send what their own arena would as the fight starts, and nothing for a boss that needs none", () => {
    const signals = (id: string) => {
      const r = generateOk(arenaOn([id]), 7)
      const level = [...levelsOf(r).values()].find((l) => unitsOf(l, (u) => u.path === BOSS_DEFS[id as keyof typeof BOSS_DEFS].actorPath).length > 0)!
      return {
        events: scriptsOf(level, 'GlobalEventRanged').map((s) => [strParam(s, 'EventName'), s.params.find((p) => p.name === 'AlertUnits')?.value]),
        flags: scriptsOf(level, 'SetFlag').map((s) => [strParam(s, 'Flag'), s.params.find((p) => p.name === 'State')?.value])
      }
    }
    // Blight waits, immortal, on his arena's "event_intro"; Doombringer on its flag
    expect(signals('hw2_blight')).toEqual({ events: [['event_intro', true]], flags: [] })
    // and his side of the arena: every attack of his needs one
    expect(signals('hw2_doombringer')).toEqual({ events: [], flags: [['doombringer_introduced', 1], ['west_side', 1]] })
    expect(signals('hw2_sinkage')).toEqual({ events: [], flags: [] })
  })

  it("aren't offered while they can't be fought, and a campaign naming one is warned, not refused", () => {
    const hidden = HW2_BOSSES.filter((d) => d.hidden !== undefined).map((d) => d.id)
    expect(hidden).toEqual(['hw2_blight', 'hw2_doombringer', 'hw2_archibald'])
    const v = validateParameters(arenaOn(['hw2_archibald']), HW2_CONTENT)
    expect(v.errors).toEqual([])
    expect(v.warnings.some((w) => w.field === 'boss.fights.0.arena.bossPool' && /Archibald Steelwill: can't be fought yet/.test(w.message))).toBe(true)
  })

  it('never reach an AE-only campaign: the same parameters without them generate the same bytes either way', () => {
    const stock = arenaOn(['boss_knight'])
    const a = generateDungeon(stock, 3, AE_ONLY)
    const b = generateDungeon(stock, 3, HW2_CONTENT)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(b.files).toEqual(a.files)
  })
})

describe.skipIf(!HAS_HW2)('copying Hammerwatch 2 bosses', () => {
  it.each(HW2_BOSSES.map((d) => [d.id, d] as const))("carries %s whole, with its scripts, and none of HW2's loot actions", (id, def) => {
    const plan = hw2CopyPlan(HW2_ROOT, AE_ROOT, [def.actorPath])!
    expect(plan.errors).toEqual([])
    expect(danglingPaths(plan, AE_ROOT)).toEqual([])
    const dec = new TextDecoder()
    const paths = plan.files.map((f) => f.path)
    if (id === 'hw2_sinkage') {
      expect(paths).toContain('scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as')
      expect(paths).toContain('scripts/Behaviors/Actors/Enemies/Skills/CompositeActorUtilitySkill.as')
    }
    for (const f of plan.files.filter((x) => /\.(unit|inc)$/.test(x.path))) {
      // AE has none of HW2's loot tables: a SpawnLoot left behind, its table stripped, crashes on death
      expect(dec.decode(f.data), f.path).not.toMatch(/<string name="class">SpawnLoot<\/string>/)
    }
  }, 300_000)
})
