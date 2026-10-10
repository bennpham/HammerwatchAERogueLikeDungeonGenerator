import { describe, expect, it } from 'vitest'
import {
  MONSTER_TYPES,
  floorPoolEntries,
  floorPoolTier,
  generateDungeon,
  isKnownFloorPoolKey,
  isKnownMonsterKey,
  monsterTypeById,
  parseMonsterKey,
  parseParametersTxt,
  serializeParametersTxt
} from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'

/**
 * One floor whose pool is exactly `pool`. The cap is keyed by TYPE id, which is
 * the point: `monsterMax` is one number per type however many of its tiers the
 * pool pins.
 */
function floorWith(pool: string[], seed: number, max = 60): DungeonResult {
  const params = plainParameters()
  params.levels = 1
  params.themes = ['a']
  params.levelMonsters = [pool]
  const monsterMax = { ...params.monsterMax }
  for (const key of pool) monsterMax[parseMonsterKey(key).id] = max
  params.monsterMax = monsterMax
  const result = generateDungeon(params, seed)
  expect(result.ok, `pool ${pool.join(',')} seed ${seed}`).toBe(true)
  return result as DungeonResult
}

const levelXML = (r: DungeonResult): string =>
  r.files.find((f) => f.path === 'levels/level0.xml')!.content

/** How many actors of `path` the level places. */
function actorCount(xml: string, path: string): number {
  return xml.split(`<string name="type">${path}</string>`).length - 1
}

const SKELETON1 = ['actors/spawners/skeleton_1.xml', 'actors/skeleton_1_small.xml', 'actors/skeleton_1.xml', 'actors/skeleton_1_elite.xml']

describe('the tier roll actually rolls (issue #58)', () => {
  // THE REGRESSION. Every type shipped upgradeChance 1.0 and fRand(0, 1)
  // returns [0, 1), so `fRand(0, 1) < 1.0` never failed and the roll could only
  // stop at the top tier: picking skeleton1 gave an army of skeleton_1_elite
  // and `skeleton_1_small` was unreachable. This fails on the pre-#58 roster.
  it('spreads a bare id across its tiers instead of pinning the top one', () => {
    const xml = levelXML(floorWith(['skeleton1'], 4242))
    const small = actorCount(xml, SKELETON1[1])
    const plain = actorCount(xml, SKELETON1[2])
    const elite = actorCount(xml, SKELETON1[3])

    expect(small, 'the small skeleton must actually spawn').toBeGreaterThan(0)
    expect(plain).toBeGreaterThan(0)
    expect(elite).toBeGreaterThan(0)
    // 0.3 upgrade chance: the weakest tier is the common one, not the rarest.
    expect(small).toBeGreaterThan(elite)
  })

  it('leaves the weakest tier the most common one across many seeds', () => {
    let small = 0
    let elite = 0
    for (let seed = 1; seed <= 12; seed++) {
      const xml = levelXML(floorWith(['skeleton1'], seed))
      small += actorCount(xml, SKELETON1[1])
      elite += actorCount(xml, SKELETON1[3])
    }
    expect(small).toBeGreaterThan(0)
    expect(elite).toBeGreaterThan(0)
    // Deliberately a loose bound rather than a ratio: this asserts the SHAPE of
    // the distribution, so it must not start failing because a tuning change
    // moved 0.3 a little.
    expect(elite).toBeLessThan(small)
  })

  it('still lands a 1- or 2-tier type on the same actor it always did', () => {
    // The loop evaluates fRand BEFORE testing `tier < tiers.length - 1`, so a
    // short type burns exactly one draw whatever its chance is. Restoring the
    // chances therefore cannot have moved these.
    for (const id of ['spider', 'archer3', 'tower_empty']) {
      const type = MONSTER_TYPES.find((t) => t.id === id)!
      expect(type.tiers).toHaveLength(1)
      const xml = levelXML(floorWith([id], 4242))
      expect(xml).toContain(type.tiers[0])
      expect(xml).not.toContain('>undefined<')
    }
  })
})

describe('pinning one actor', () => {
  it('spawns only the pinned tier', () => {
    const small = levelXML(floorWith(['skeleton1#1'], 4242))
    expect(actorCount(small, SKELETON1[1])).toBeGreaterThan(0)
    expect(actorCount(small, SKELETON1[2])).toBe(0)
    expect(actorCount(small, SKELETON1[3])).toBe(0)

    const elite = levelXML(floorWith(['skeleton1#3'], 4242))
    expect(actorCount(elite, SKELETON1[3])).toBeGreaterThan(0)
    expect(actorCount(elite, SKELETON1[1])).toBe(0)
    expect(actorCount(elite, SKELETON1[2])).toBe(0)
  })

  it('draws nothing for the tier, so which tier is pinned changes only the actor', () => {
    // The load-bearing property: a pin is a statement about what spawns, not a
    // roll. If it ever consumed a draw, swapping #1 for #3 would move the whole
    // floor — so compare the parts a monster's identity must not touch.
    const a = levelXML(floorWith(['skeleton1#1'], 909))
    const b = levelXML(floorWith(['skeleton1#3'], 909))

    const tilemap = (xml: string) => xml.slice(0, xml.indexOf('<array name="doodads"'))
    expect(tilemap(a)).toBe(tilemap(b))
    expect(actorCount(a, SKELETON1[1])).toBe(actorCount(b, SKELETON1[3]))
    // and the whole file differs only where the actor path does
    expect(a.split(SKELETON1[1]).join('X')).toBe(b.split(SKELETON1[3]).join('X'))
  })

  it('still places the type\'s tier-0 spawners, which belong to the type not the pin', () => {
    const xml = levelXML(floorWith(['skeleton1#3'], 4242, 200))
    expect(actorCount(xml, SKELETON1[0])).toBeGreaterThan(0)
  })

  it('reads its cap from the type, so one monsterMax covers every tier', () => {
    const lean = levelXML(floorWith(['skeleton1#1'], 909, 20))
    const fat = levelXML(floorWith(['skeleton1#1'], 909, 200))
    expect(actorCount(fat, SKELETON1[1])).toBeGreaterThan(actorCount(lean, SKELETON1[1]))
  })
})

describe('floor pool keys', () => {
  it('accepts a bare id and any in-range tier, including the arena\'s default tier', () => {
    expect(isKnownFloorPoolKey('skeleton1')).toBe(true)
    for (let tier = 0; tier < 4; tier++) {
      expect(isKnownFloorPoolKey(`skeleton1#${tier}`), `tier ${tier}`).toBe(true)
    }
    expect(isKnownFloorPoolKey('skeleton1#4')).toBe(false)
    expect(isKnownFloorPoolKey('skeleton1#x')).toBe(false)
    expect(isKnownFloorPoolKey('nosuchmonster')).toBe(false)
  })

  it('does NOT relax the arena\'s canonical key rule', () => {
    // In a wave a bare `skeleton1` IS a pin at defaultTier, so the second
    // spelling of that one actor must stay rejected there — two keys for one
    // actor would give it two max counts. On a floor the bare id means "roll",
    // so both are legal. Different grammars on purpose.
    expect(isKnownMonsterKey('skeleton1#1')).toBe(false)
    expect(isKnownFloorPoolKey('skeleton1#1')).toBe(true)
  })

  it('reads a pinned tier and treats everything else as a roll', () => {
    expect(floorPoolTier('skeleton1')).toBeUndefined()
    expect(floorPoolTier('skeleton1#0')).toBe(0)
    expect(floorPoolTier('skeleton1#3')).toBe(3)
    // total on bad input — validation rejects these, the generator never throws
    expect(floorPoolTier('skeleton1#9')).toBeUndefined()
    expect(floorPoolTier('skeleton1#x')).toBeUndefined()
  })

  it('offers a rolled entry plus one per tier, and nothing duplicated', () => {
    const entries = floorPoolEntries(monsterTypeById('skeleton1'))
    expect(entries.map((e) => e.key)).toEqual([
      'skeleton1',
      'skeleton1#0',
      'skeleton1#1',
      'skeleton1#2',
      'skeleton1#3'
    ])
    expect(entries[0].tier).toBeUndefined()
    expect(entries[0].role).toBe('rolled')
    expect(entries[1].role).toBe('spawner')

    // A single-tier type gets ONLY the rolled entry: `spider#0` is legal but
    // names the same actor, and two checkboxes for one monster is the confusion
    // the canonical key rule exists to prevent.
    expect(floorPoolEntries(monsterTypeById('spider')).map((e) => e.key)).toEqual(['spider'])

    // every key a picker can offer must be a legal pool key
    for (const type of MONSTER_TYPES) {
      for (const entry of floorPoolEntries(type)) {
        expect(isKnownFloorPoolKey(entry.key), entry.key).toBe(true)
      }
    }
  })
})

describe('validation of floor pools', () => {
  const withPool = (pool: string[]): DungeonParameters => {
    const params = plainParameters()
    params.levelMonsters = params.levelMonsters.map((p, i) => (i === 0 ? pool : p))
    return params
  }
  const errorsFor = (pool: string[]) =>
    validateParameters(withPool(pool)).errors.filter((e) => e.field === 'levelMonsters')

  it('accepts a pinned tier', () => {
    expect(errorsFor(['skeleton1#1'])).toHaveLength(0)
  })

  it('rejects an out-of-range tier and says what the range is', () => {
    const errors = errorsFor(['skeleton1#9'])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('tier 9')
    expect(errors[0].message).toContain('tiers 0-3')
  })

  it('rejects a non-numeric tier without calling the monster unknown', () => {
    const errors = errorsFor(['skeleton1#x'])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('non-numeric')
    expect(errors[0].message).not.toContain('unknown monster')
  })

  it('still rejects an unknown id', () => {
    expect(errorsFor(['nosuchmonster'])[0].message).toContain('unknown monster')
  })

  it('warns, without blocking, when a pooled type is capped at 0', () => {
    // Force the cap explicitly rather than relying on a type that happens to
    // ship at 0 by default — tower_flower1 no longer does (the castle preset
    // now arms it), and this test's point is the warning mechanism, not any
    // particular type's shipped cap.
    const params = withPool(['tower_flower1'])
    params.monsterMax = { ...params.monsterMax, tower_flower1: 0 }
    const result = validateParameters(params)
    expect(result.errors.filter((e) => e.field === 'levelMonsters')).toHaveLength(0)
    const warning = result.warnings.find(
      (w) => w.field === 'levelMonsters' && w.message.includes('tower_flower1')
    )
    expect(warning).toBeDefined()
    expect(warning!.message).toContain('spawn nothing')
  })
})

describe('parameters.txt round-trip', () => {
  it('carries variant keys and their weights through unchanged', () => {
    const params = plainParameters()
    params.levelMonsters = params.levelMonsters.map((p, i) =>
      i === 0 ? ['skeleton1#1', 'skeleton1#1', 'bat1'] : p
    )
    const text = serializeParametersTxt(params)
    expect(text).toContain('monsters0=skeleton1#1,skeleton1#1,bat1')

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toHaveLength(0)
    expect(parsed.params.levelMonsters[0]).toEqual(['skeleton1#1', 'skeleton1#1', 'bat1'])
  })

  it('weights a pinned entry by repetition, like the original tool did', () => {
    // Weight is how many slots an entry takes, because a lair picks with
    // iRand(0, pool.length). Three copies of one key means three slots.
    const one = levelXML(floorWith(['skeleton1#1', 'bat1'], 77, 40))
    const three = levelXML(
      floorWith(['skeleton1#1', 'skeleton1#1', 'skeleton1#1', 'bat1'], 77, 40)
    )
    expect(actorCount(three, SKELETON1[1])).toBeGreaterThan(actorCount(one, SKELETON1[1]))
  })
})
