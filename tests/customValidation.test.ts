import { describe, expect, it } from 'vitest'
import { defaultParameters } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { AE_ONLY } from '../src/generator/custom/sources'
import { validateContentSources } from '../src/generator/custom/validate'
import type { ValidationIssue } from '../src/generator/config/validation'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'

const HW2 = { sources: ['hw2' as const] }
const HW2_MSG = /is Hammerwatch 2 content\. Load your Hammerwatch 2 folder with Load custom/

function sourceErrors(p: unknown, ctx = AE_ONLY): ValidationIssue[] {
  const errors: ValidationIssue[] = []
  validateContentSources(p, ctx, errors)
  return errors
}

describe('custom content needs its source loaded', () => {
  it('passes the defaults and every stock id', () => {
    expect(sourceErrors(defaultParameters())).toEqual([])
    expect(validateParameters(defaultParameters()).valid).toBe(true)
  })

  it('reports each kind of field where the GUI shows it', () => {
    const p = {
      themes: ['prison', 'hw2_crypt'],
      levelMonsters: [['ghoul'], ['hw2_troll_brute#1', 'hw2_troll_brute#1']],
      monsterMax: { hw2_troll_brute: 3, ghoul: 2 },
      floorMusic: ['default', 'default', 'hw2_crypt'],
      world: { worlds: [{ biome: 'hw2_swamp', monsters: ['hw2_wolf_grey'] }] },
      boss: { fights: [{ arena: { theme: 'hw2_obsidian', music: 'hw2_boss' } }] },
      name: 'My hw2_ campaign'
    }
    const got = sourceErrors(p).map((e) => [e.field, e.message.slice(0, e.message.indexOf(' is '))])
    expect(got).toEqual([
      ['themes', '"hw2_crypt"'],
      ['levelMonsters', '"hw2_troll_brute#1"'],
      ['monsterMax.hw2_troll_brute', '"hw2_troll_brute"'],
      ['floorMusic.2', '"hw2_crypt"'],
      ['world.worlds.0.biome', '"hw2_swamp"'],
      ['world.worlds.0.monsters', '"hw2_wolf_grey"'],
      ['boss.fights.0.arena.theme', '"hw2_obsidian"'],
      ['boss.fights.0.arena.music', '"hw2_boss"']
    ])
    for (const e of sourceErrors(p)) expect(e.message).toMatch(HW2_MSG)
    expect(sourceErrors(p)[0].message).toMatch(/pick another theme\.$/)
    expect(sourceErrors(p)[2].message).toMatch(/pick another monster\.$/)
    expect(sourceErrors(p)[3].message).toMatch(/pick another track\.$/)
    expect(sourceErrors(p)[4].message).toMatch(/pick another biome\.$/)
  })

  it('says nothing once the source is loaded', () => {
    expect(sourceErrors({ themes: ['hw2_crypt'], monsterMax: { hw2_x: 1 } }, HW2)).toEqual([])
  })

  it('blocks validation and generation without the source', () => {
    const p = defaultParameters()
    p.monsterMax = { ...p.monsterMax, hw2_troll_brute: 3 }
    const v = validateParameters(p)
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.field === 'monsterMax.hw2_troll_brute' && HW2_MSG.test(e.message))).toBe(true)
    // a loaded source clears that error (an unknown id is left to the usual rules)
    expect(validateParameters(p, HW2).errors.some((e) => HW2_MSG.test(e.message))).toBe(false)
    const r = generateDungeon(p, 7)
    expect(r.ok).toBe(false)
  })

  it('never changes what valid parameters generate', () => {
    const a = generateDungeon(defaultParameters(), 4242) as DungeonResult
    const b = generateDungeon(defaultParameters(), 4242, HW2) as DungeonResult
    expect(a.ok && b.ok).toBe(true)
    expect(b.files).toEqual(a.files)
  }, 120_000)
})
