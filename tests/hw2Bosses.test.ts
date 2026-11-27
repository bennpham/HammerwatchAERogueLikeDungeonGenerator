import { describe, expect, it } from 'vitest'
import { defaultDungeonBoss, generateDungeon, validateParameters } from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import { BOSS_DEFS } from '../src/generator/boss/bosses'
import { AE_ONLY } from '../src/generator/custom/sources'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { AE_ROOT } from './aeInstall'
import { generateOk, levelsOf, scriptsOf, strParam, unitsOf } from './ae'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT, danglingPaths } from './hw2Install'
import { plainParameters } from './params'

const SINKAGE = BOSS_DEFS.hw2_sinkage

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

  it('fight in the generated arena with our boss bar, and their unit is carried', () => {
    const r = generateOk(arenaOn(['hw2_sinkage']), 7)
    expect(r.customAssets).toContain(SINKAGE.actorPath)
    const holding = [...levelsOf(r).values()].filter((l) => unitsOf(l, (u) => u.path === SINKAGE.actorPath).length > 0)
    expect(holding).toHaveLength(1)
    const level = holding[0]
    expect(unitsOf(level, (u) => u.path === SINKAGE.actorPath)).toHaveLength(1)
    const bars = scriptsOf(level, 'CreateBossBar')
    expect(bars).toHaveLength(1)
    expect(strParam(bars[0], 'Name')).toBe('Commodore Sinkage')
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
  it("carries Sinkage whole, with his scripts, and none of HW2's loot actions", () => {
    const plan = hw2CopyPlan(HW2_ROOT, AE_ROOT, [SINKAGE.actorPath])!
    expect(plan.errors).toEqual([])
    expect(danglingPaths(plan, AE_ROOT)).toEqual([])
    const dec = new TextDecoder()
    const paths = plan.files.map((f) => f.path)
    expect(paths).toContain('scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as')
    expect(paths).toContain('scripts/Behaviors/Actors/Enemies/Skills/CompositeActorUtilitySkill.as')
    for (const f of plan.files.filter((x) => /\.(unit|inc)$/.test(x.path))) {
      // AE has none of HW2's loot tables: a SpawnLoot left behind, its table stripped, crashes on death
      expect(dec.decode(f.data), f.path).not.toMatch(/<string name="class">SpawnLoot<\/string>/)
    }
  }, 300_000)
})
