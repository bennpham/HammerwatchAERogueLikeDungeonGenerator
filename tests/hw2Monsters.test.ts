import { describe, expect, it } from 'vitest'
import { defaultParameters } from '../src/generator/config/parameters'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { MONSTER_TYPES, monsterCap } from '../src/generator/objects/monsterTypes'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { AE_ROOT } from './aeInstall'
import { levelsOf } from './ae'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT, danglingPaths } from './hw2Install'
import { plainParameters } from './params'

const HW2 = MONSTER_TYPES.filter((t) => t.source === 'hw2')

describe('Hammerwatch 2 monster caps', () => {
  it('keep stock caps as they were and give custom ones their defaults', () => {
    expect(monsterCap({}, 'skeleton_warrior')).toBe(0)
    expect(monsterCap({ skeleton_warrior: 7 }, 'skeleton_warrior')).toBe(7)
    expect(monsterCap({}, 'hw2_troll_brute')).toBe(HW2.find((t) => t.id === 'hw2_troll_brute')!.defaultMax)
    expect(monsterCap({ hw2_troll_brute: 0 }, 'hw2_troll_brute')).toBe(0)
  })

  it("leave the defaults and a stock campaign's parameters.txt free of HW2 keys", () => {
    const p = defaultParameters()
    expect(Object.keys(p.monsterMax).some((k) => k.startsWith('hw2_'))).toBe(false)
    expect(serializeParametersTxt(p)).not.toMatch(/hw2_/)
  })

  it('write an HW2 cap once it is set off its default, and read it back', () => {
    const p = defaultParameters()
    p.monsterMax = { ...p.monsterMax, hw2_tick: 3 }
    const txt = serializeParametersTxt(p)
    expect(txt).toMatch(/^max_hw2_tick=3$/m)
    expect(txt).not.toMatch(/max_hw2_crab/)
    expect(parseParametersTxt(txt).params.monsterMax.hw2_tick).toBe(3)
  })
})

describe('Hammerwatch 2 monsters on a floor', () => {
  function withPool(pool: string[]) {
    const p = plainParameters()
    p.levels = 1
    p.themes = p.themes.slice(0, 1)
    p.levelMonsters = [pool]
    p.lobbies = []
    p.boss = { ...p.boss, enabled: false }
    return p
  }

  it('spawn at their default caps and list their units for the install', () => {
    const gen = generateDungeon(withPool(['hw2_troll_brute', 'hw2_tick']), 21, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    const units = levelsOf(r).get('floor0')!.units.map((u) => u.path)
    expect(units.some((p) => p.startsWith('hw2/actors/beasts/trolls/'))).toBe(true)
    expect(units.some((p) => p.startsWith('hw2/actors/beasts/ticks/'))).toBe(true)
    expect(r.customAssets.some((p) => p.startsWith('hw2/actors/'))).toBe(true)
  })

  it('need Hammerwatch 2 loaded', () => {
    expect(generateDungeon(withPool(['hw2_crab']), 21).ok).toBe(false)
  })
})

describe.skipIf(!HAS_HW2)('copying Hammerwatch 2 monsters', () => {
  it('copies every curated monster whole, with no script class AE lacks', () => {
    const roots = HW2.flatMap((t) => t.tiers)
    const plan = hw2CopyPlan(HW2_ROOT, AE_ROOT, roots)!
    expect(plan.errors).toEqual([])
    const shipped = new Set(plan.files.map((f) => f.path))
    for (const r of roots) expect(shipped.has(r), r).toBe(true)
    expect(danglingPaths(plan, AE_ROOT)).toEqual([])
    // HW2's own tables are stripped from what ships
    const dec = new TextDecoder()
    for (const f of plan.files.filter((x) => x.path.endsWith('.unit') || x.path.endsWith('.inc'))) {
      expect(dec.decode(f.data), f.path).not.toMatch(/<string name="(team|loot|gore)">/)
    }
  }, 300_000)
})
