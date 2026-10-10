import { describe, expect, it } from 'vitest'
import {
  MONSTER_TYPES,
  MONSTER_VARIANT_GROUPS,
  defaultTier,
  isKnownMonsterKey,
  monsterTypeById,
  monsterVariants,
  monsterVariantsInGroup,
  parseMonsterKey,
  resolveActorPath,
  variantGroup,
  variantKey
} from '../src/generator'

describe('monster variant keys', () => {
  /**
   * The compatibility contract. A bare id resolved to tiers[min(1, len-1)]
   * before variants existed, and must keep doing so or every saved
   * parameters.txt and every seed's arena changes.
   */
  it('a bare id still resolves to the pre-variant tier for every roster entry', () => {
    for (const t of MONSTER_TYPES) {
      expect(resolveActorPath(t.id)).toBe(t.tiers[Math.min(1, t.tiers.length - 1)])
    }
  })

  it('resolves the spawner and elite variants the arena used to be unable to reach', () => {
    expect(resolveActorPath('bat1')).toBe('actors/bat_1.xml')
    expect(resolveActorPath('bat1#0')).toBe('actors/spawners/bats.xml')
    expect(resolveActorPath('bat1#2')).toBe('actors/bat_2.xml')
    expect(resolveActorPath('archer1#2')).toBe('actors/archer_1_elite.xml')
    expect(resolveActorPath('skeleton1#0')).toBe('actors/spawners/skeleton_1.xml')
    expect(resolveActorPath('skeleton1#3')).toBe('actors/skeleton_1_elite.xml')
    expect(resolveActorPath('lich#3')).toBe('actors/lich_3.xml')
    expect(resolveActorPath('slime#0')).toBe('actors/slime_1_host.xml')
  })

  it('leaves single-tier types alone — they have exactly one variant, the bare id', () => {
    const skeleton3 = monsterTypeById('skeleton3')
    expect(monsterVariants(skeleton3).map((v) => v.key)).toEqual(['skeleton3'])
    expect(resolveActorPath('skeleton3')).toBe('actors/skeleton_3.xml')
    expect(resolveActorPath('tower_nova1')).toBe('actors/tower_nova_1.xml')
  })

  it('gives every actor path in the roster exactly one canonical key', () => {
    const byPath = new Map<string, string[]>()
    for (const t of MONSTER_TYPES) {
      for (const v of monsterVariants(t)) {
        const key = `${t.id}::${v.actorPath}`
        byPath.set(key, [...(byPath.get(key) ?? []), v.key])
      }
    }
    for (const [path, keys] of byPath) expect(keys, path).toHaveLength(1)
  })

  it('round-trips every canonical key back to its own actor path', () => {
    for (const t of MONSTER_TYPES) {
      for (const v of monsterVariants(t)) {
        expect(resolveActorPath(v.key), v.key).toBe(v.actorPath)
      }
    }
  })

  it('spells the default tier as the bare id, never as id#n', () => {
    for (const t of MONSTER_TYPES) {
      expect(variantKey(t, defaultTier(t))).toBe(t.id)
      expect(t.id).not.toContain('#')
    }
  })
})

describe('parseMonsterKey', () => {
  it('splits a bare id and a variant key', () => {
    expect(parseMonsterKey('bat1')).toEqual({ id: 'bat1' })
    expect(parseMonsterKey('bat1#0')).toEqual({ id: 'bat1', tier: 0 })
    expect(parseMonsterKey('bat1#12')).toEqual({ id: 'bat1', tier: 12 })
  })

  it('reports a malformed suffix as NaN instead of throwing', () => {
    expect(parseMonsterKey('bat1#')).toEqual({ id: 'bat1', tier: NaN })
    expect(parseMonsterKey('bat1#x')).toEqual({ id: 'bat1', tier: NaN })
    expect(parseMonsterKey('bat1#-1')).toEqual({ id: 'bat1', tier: NaN })
    expect(parseMonsterKey('bat1#1.5')).toEqual({ id: 'bat1', tier: NaN })
  })
})

describe('isKnownMonsterKey', () => {
  it('accepts bare ids, including deprecated ones a saved pool may still hold', () => {
    expect(isKnownMonsterKey('bat1')).toBe(true)
    expect(isKnownMonsterKey('tower_archer2')).toBe(true)
  })

  it('accepts in-range non-default variants', () => {
    expect(isKnownMonsterKey('bat1#0')).toBe(true)
    expect(isKnownMonsterKey('bat1#2')).toBe(true)
  })

  it('rejects a non-canonical spelling of the default tier', () => {
    // bat1#1 and bat1 are the same actor; allowing both would let one actor
    // occupy two pool slots with two different max counts.
    expect(isKnownMonsterKey('bat1#1')).toBe(false)
    expect(isKnownMonsterKey('skeleton3#0')).toBe(false)
  })

  it('rejects out-of-range, malformed and unknown keys', () => {
    expect(isKnownMonsterKey('bat1#99')).toBe(false)
    expect(isKnownMonsterKey('bat1#x')).toBe(false)
    expect(isKnownMonsterKey('bat1#')).toBe(false)
    expect(isKnownMonsterKey('bogus')).toBe(false)
    expect(isKnownMonsterKey('bogus#0')).toBe(false)
  })
})

describe('resolveActorPath is total', () => {
  it('falls back rather than crashing on bad input (invariant 4)', () => {
    // unknown id -> monsterTypeById's existing bat1 fallback
    expect(resolveActorPath('bogus')).toBe('actors/bat_1.xml')
    // out-of-range / malformed variant -> that type's default tier
    expect(resolveActorPath('bat1#99')).toBe('actors/bat_1.xml')
    expect(resolveActorPath('bat1#x')).toBe('actors/bat_1.xml')
    expect(resolveActorPath('')).toBe('actors/bat_1.xml')
  })
})

describe('variant grouping for the picker', () => {
  it('routes every spawner into the Spawners group and nothing else', () => {
    for (const t of MONSTER_TYPES) {
      for (const v of monsterVariants(t)) {
        expect(variantGroup(v)).toBe(v.role === 'spawner' ? 'Spawners' : t.group)
      }
    }
  })

  it('lists every non-deprecated variant in exactly one group, sorted by key', () => {
    const listed = MONSTER_VARIANT_GROUPS.flatMap((g) => monsterVariantsInGroup(g).map((v) => v.key))
    const expected = MONSTER_TYPES.filter((t) => !t.deprecated).flatMap((t) => monsterVariants(t).map((v) => v.key))
    expect([...listed].sort()).toEqual([...expected].sort())
    expect(new Set(listed).size).toBe(listed.length)
    for (const g of MONSTER_VARIANT_GROUPS) {
      const keys = monsterVariantsInGroup(g).map((v) => v.key)
      expect(keys, g).toEqual([...keys].sort())
    }
  })

  it('gives the Spawners group the 14 spawner props the dungeon already places', () => {
    expect(monsterVariantsInGroup('Spawners').map((v) => v.actorPath)).toEqual([
      'actors/spawners/archer_1.xml',
      'actors/spawners/archer_2.xml',
      'actors/spawners/bats.xml',
      'actors/spawners/bats.xml',
      'actors/spawners/bonus/skeleton_1.xml',
      'actors/spawners/eye_1.xml',
      'actors/spawners/maggot_1.xml',
      'actors/spawners/doomspawn_1.xml',
      'actors/spawners/mummy_1.xml',
      'actors/spawners/mummy_ranged_1.xml',
      'actors/spawners/skeleton_1.xml',
      'actors/spawners/skeleton_2.xml',
      // The one spawner outside actors/spawners/ — a static hive, sorted here
      // by its variant key (slime#0), not by its path.
      'actors/slime_1_host.xml',
      'actors/spawners/tick_1.xml',
      'actors/spawners/wisp_1.xml'
    ])
  })

  it('splits the slime host off from the slime it spawns', () => {
    const [host, spawn] = monsterVariants(monsterTypeById('slime'))
    expect(host.key).toBe('slime#0')
    expect(host.role).toBe('spawner')
    expect(variantGroup(host)).toBe('Spawners')
    // The bare id is still the walker, so no saved pool changes meaning.
    expect(spawn.key).toBe('slime')
    expect(spawn.actorPath).toBe('actors/slime_1_spawn.xml')
    expect(variantGroup(spawn)).toBe('Classic')
  })
})
