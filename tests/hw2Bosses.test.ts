import { describe, expect, it } from 'vitest'
import { defaultDungeonBoss, defaultWorld, generateDungeon, validateParameters } from '../src/generator'
import type { AeLevel } from '../src/generator/ae/model'
import type { DungeonParameters } from '../src/generator'
import { BOSS_DEFS, BOSS_DEF_LIST, FLOOR_BOSS_IDS, WORLD_BOSS_IDS, isStationary } from '../src/generator/boss/bosses'
import { MOBILE_BOSS_IDS } from '../src/generator/config/parameters'
import { AE_ONLY } from '../src/generator/custom/sources'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { AE_ROOT } from './aeInstall'
import { generateOk, idsParam, levelsOf, scriptsOf, strParam, unitById, unitsOf } from './ae'
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

  it('are the nine HW2 bosses, all arena-only but Blight, who waits for the party anywhere', () => {
    expect(HW2_BOSSES.map((d) => d.id)).toEqual([
      'hw2_sinkage', 'hw2_shock_widow', 'hw2_malgar', 'hw2_blight', 'hw2_doombringer',
      'hw2_dace_arden', 'hw2_judge_supreme', 'hw2_barrington', 'hw2_archibald'
    ])
    for (const d of HW2_BOSSES) expect(d.mobile, d.id).toBe(false)
    for (const d of HW2_BOSSES.filter((x) => x.id !== 'hw2_blight')) expect(d.arenaOnly, d.id).toBe(true)
    expect(HW2_BOSSES.filter((d) => d.waitsForParty === true).map((d) => d.id)).toEqual(['hw2_blight'])
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
    // and the flag for the side he's perched on: every attack of his needs one
    const doom = signals('hw2_doombringer')
    expect(doom.events).toEqual([])
    expect(doom.flags[0]).toEqual(['doombringer_introduced', 1])
    expect([['west_side', 1], ['east_side', 1]]).toContainEqual(doom.flags[1])
    expect(signals('hw2_sinkage')).toEqual({ events: [], flags: [] })
  })

  it("aren't offered while they can't be fought, and a campaign naming one is warned, not refused", () => {
    const hidden = HW2_BOSSES.filter((d) => d.hidden !== undefined).map((d) => d.id)
    expect(hidden).toEqual(['hw2_archibald'])
    const v = validateParameters(arenaOn(['hw2_archibald']), HW2_CONTENT)
    expect(v.errors).toEqual([])
    expect(v.warnings.some((w) => w.field === 'boss.fights.0.arena.bossPool' && /Archibald Steelwill: can't be fought yet/.test(w.message))).toBe(true)
  })

  describe('Blight, who stands still and waits for the party', () => {
    const BLIGHT = BOSS_DEFS.hw2_blight
    const holding = (r: ReturnType<typeof generateOk>) =>
      [...levelsOf(r).values()].filter((l) => unitsOf(l, (u) => u.path === BLIGHT.actorPath).length > 0)
    const floorOn = (bossPool: string[]): DungeonParameters => {
      const p = plainParameters()
      p.levelBoss = Array.from({ length: p.levels }, (_, i) => ({ ...defaultDungeonBoss(), enabled: i === 0, bossPool }))
      return p
    }
    const intros = (level: AeLevel) => scriptsOf(level, 'GlobalEventRanged').filter((s) => strParam(s, 'EventName') === 'event_intro')

    it('is stationary, so arena traps never aim at him, and may wait on a floor or an island', () => {
      expect(isStationary(BLIGHT)).toBe(true)
      expect(FLOOR_BOSS_IDS).toContain('hw2_blight')
      expect(WORLD_BOSS_IDS).toContain('hw2_blight')
      // the only custom boss a floor may hold, and a floor's default pool stays AE's own
      expect(FLOOR_BOSS_IDS.filter((id) => id.startsWith('hw2_'))).toEqual(['hw2_blight'])
      expect(defaultDungeonBoss().bossPool).toEqual([...MOBILE_BOSS_IDS])
    })

    it('waits in a dungeon floor room with his bar, woken on load as his arena would', () => {
      expect(validateParameters(floorOn(['hw2_blight']), AE_ONLY).errors.some((e) => e.field === 'levelBoss.0.bossPool' && /hw2_blight/.test(e.message))).toBe(true)
      expect(validateParameters(floorOn(['hw2_blight']), HW2_CONTENT).errors).toEqual([])
      const r = generateOk(floorOn(['hw2_blight']), 5)
      expect(r.customAssets).toContain(BLIGHT.actorPath)
      const levels = holding(r)
      expect(levels).toHaveLength(1)
      expect(scriptsOf(levels[0], 'CreateBossBar').map((b) => strParam(b, 'Name'))).toEqual(['Blight the Horrible'])
      const intro = intros(levels[0])
      expect(intro).toHaveLength(1)
      // sent from where he stands
      const boss = unitsOf(levels[0], (u) => u.path === BLIGHT.actorPath)[0]
      expect([intro[0].x, intro[0].y]).toEqual([boss.x, boss.y])
      // two of him are fine: simple mode shares nothing between them
      const two = floorOn(['hw2_blight'])
      two.levelBoss![0] = { ...two.levelBoss![0], bossSelection: 'lineup', bossLineup: { hw2_blight: 2 } }
      expect(validateParameters(two, HW2_CONTENT).errors).toEqual([])
      expect(intros(holding(generateOk(two, 5))[0])).toHaveLength(2)
    })

    it('waits at a World site, woken on load', () => {
      const p = plainParameters()
      p.world = { enabled: true, worlds: [{ ...defaultWorld(), buttons: 1, bossCount: 1, bossPool: ['hw2_blight'] }] }
      expect(validateParameters(p, HW2_CONTENT).errors).toEqual([])
      const levels = holding(generateOk(p, 4))
      expect(levels).toHaveLength(1)
      expect(intros(levels[0])).toHaveLength(1)
    })

    it("leaves an AE floor boss's bytes alone", () => {
      const stock = floorOn(['boss_knight'])
      const a = generateDungeon(stock, 3, AE_ONLY)
      const b = generateDungeon(stock, 3, HW2_CONTENT)
      expect(a.ok && b.ok).toBe(true)
      if (a.ok && b.ok) expect(b.files).toEqual(a.files)
    })
  })

  describe('Doombringer, a dragon perched on one wall', () => {
    const DOOM = BOSS_DEFS.hw2_doombringer
    const flagsOf = (level: AeLevel) => scriptsOf(level, 'SetFlag').map((s) => strParam(s, 'Flag'))

    it('stands against the west or east wall, facing in, with the way out never behind him', () => {
      const sides = new Set<string>()
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const r = generateOk(arenaOn(['hw2_doombringer']), seed)
        const level = [...levelsOf(r).values()].find((l) => unitsOf(l, (u) => u.path === DOOM.actorPath).length > 0)!
        const boss = unitsOf(level, (u) => u.path === DOOM.actorPath)[0]
        // the bar node sits at the arena's midX; the alcove seals are what the boss's death destroys
        const midX = scriptsOf(level, 'CreateBossBar')[0].x
        const west = boss.x < midX
        sides.add(west ? 'W' : 'E')
        const flags = flagsOf(level)
        expect(flags, `seed ${seed}`).toContain(west ? 'west_side' : 'east_side')
        expect(flags, `seed ${seed}`).not.toContain(west ? 'east_side' : 'west_side')
        // his collider flush with the inside of his wall: well off the middle
        expect(Math.abs(boss.x - midX), `seed ${seed}`).toBeGreaterThan(10 * 16)
        const seals = scriptsOf(level, 'DestroyUnits').flatMap((d) => idsParam(d, 'Units')).map((id) => unitById(level, id)!)
        expect(seals.length, `seed ${seed}`).toBeGreaterThan(0)
        for (const seal of seals) {
          // north, or the far wall: never his
          const onHisWall = west ? seal.x < midX - 10 * 16 : seal.x > midX + 10 * 16
          expect(onHisWall, `seed ${seed}: the alcove opens behind him`).toBe(false)
        }
      }
      expect([...sides].sort()).toEqual(['E', 'W'])
    })

    it('fights alone, and never on a dungeon floor', () => {
      const two = arenaOn(['hw2_doombringer', 'hw2_sinkage'])
      two.boss.fights[0].arena = { ...two.boss.fights[0].arena, bossCount: 2 }
      expect(validateParameters(two, HW2_CONTENT).errors.some((e) => /Doombringer fights alone/.test(e.message))).toBe(true)
      const p = plainParameters()
      p.levelBoss = Array.from({ length: p.levels }, (_, i) => ({ ...defaultDungeonBoss(), enabled: i === 0, bossPool: ['hw2_doombringer'] }))
      expect(validateParameters(p, HW2_CONTENT).errors.some((e) => e.field.startsWith('levelBoss.0'))).toBe(true)
    })

    it('perches on the west or east end of a World island, facing in', () => {
      const sides = new Set<string>()
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const p = plainParameters()
        p.world = {
          enabled: true,
          worlds: [{ ...defaultWorld(), minWidth: 96, maxWidth: 96, minHeight: 96, maxHeight: 96, buttons: 1, bossCount: 1, bossPool: ['hw2_doombringer'] }]
        }
        expect(validateParameters(p, HW2_CONTENT).errors).toEqual([])
        const r = generateOk(p, seed)
        const level = [...levelsOf(r).values()].find((l) => unitsOf(l, (u) => u.path === DOOM.actorPath).length > 0)!
        const boss = unitsOf(level, (u) => u.path === DOOM.actorPath)[0]
        // the island's land runs between its westmost and eastmost wall pieces of cliff
        const xs = level.units.map((u) => u.x)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const west = boss.x - minX < maxX - boss.x
        sides.add(west ? 'W' : 'E')
        expect(flagsOf(level), `seed ${seed}`).toContain(west ? 'west_side' : 'east_side')
        expect(flagsOf(level), `seed ${seed}`).toContain('doombringer_introduced')
        // at that end: within a fifth of the island's span of its edge
        const edge = west ? boss.x - minX : maxX - boss.x
        expect(edge, `seed ${seed}`).toBeLessThan((maxX - minX) / 5)
      }
      expect(sides.size).toBeGreaterThan(0)
    })
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
    if (id === 'hw2_doombringer') {
      // he never takes off: landing again needs his HW2 arena's waypoints
      const unit = dec.decode(plan.files.find((f) => f.path === def.actorPath)!.data)
      expect(unit).not.toContain('SkillTakeFlight')
      expect(unit).toContain('%block SkillBeam east')
    }
    if (id === 'hw2_blight') {
      // simple mode: his opening and sphere were immortal until his HW2 arena moved him on
      const states = dec.decode(plan.files.find((f) => f.path.endsWith('/_boss_blight_states.inc'))!.data)
      expect(states).not.toContain('<bool name="immortal">true</bool>')
      expect(states.split('<bool name="immortal">false</bool>').length - 1).toBe(2)
    }
  }, 300_000)
})
