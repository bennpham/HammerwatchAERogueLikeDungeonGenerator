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

  it('resolves spawner and elite variants to their AE units', () => {
    expect(resolveActorPath('bat')).toBe('actors/beasts/bats/bat_black.unit')
    expect(resolveActorPath('bat#0')).toBe('actors/spawners/hammerwatch/spawner_bats.unit')
    expect(resolveActorPath('bat#2')).toBe('actors/beasts/bats/bat_fast.unit')
    expect(resolveActorPath('skeleton_archer#2')).toBe('actors/undead/skeletons/hammerwatch/skeleton_archer_elite.unit')
    expect(resolveActorPath('skeleton_warrior#0')).toBe('actors/spawners/hammerwatch/spawner_skeleton_warrior.unit')
    expect(resolveActorPath('skeleton_warrior#3')).toBe('actors/undead/skeletons/hammerwatch/skeleton_warrior_elite.unit')
    expect(resolveActorPath('skeleton_lich#3')).toBe('actors/undead/skeletons/hammerwatch/skeleton_necromancer.unit')
    expect(resolveActorPath('slime#0')).toBe('actors/aberrations/slimes/slime_blob.unit')
  })

  it('leaves single-tier types alone — they have exactly one variant, the bare id', () => {
    const runner = monsterTypeById('skeleton_runner')
    expect(monsterVariants(runner).map((v) => v.key)).toEqual(['skeleton_runner'])
    expect(resolveActorPath('skeleton_runner')).toBe('actors/undead/skeletons/hammerwatch/skeleton_runner.unit')
    expect(resolveActorPath('tower_nova_ice')).toBe('actors/towers/tower_nova_ice.unit')
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
    expect(parseMonsterKey('bat')).toEqual({ id: 'bat' })
    expect(parseMonsterKey('bat#0')).toEqual({ id: 'bat', tier: 0 })
    expect(parseMonsterKey('bat#12')).toEqual({ id: 'bat', tier: 12 })
  })

  it('reports a malformed suffix as NaN instead of throwing', () => {
    expect(parseMonsterKey('bat#')).toEqual({ id: 'bat', tier: NaN })
    expect(parseMonsterKey('bat#x')).toEqual({ id: 'bat', tier: NaN })
    expect(parseMonsterKey('bat#-1')).toEqual({ id: 'bat', tier: NaN })
    expect(parseMonsterKey('bat#1.5')).toEqual({ id: 'bat', tier: NaN })
  })
})

describe('isKnownMonsterKey', () => {
  it('accepts bare ids, including deprecated ones a saved pool may still hold', () => {
    expect(isKnownMonsterKey('bat')).toBe(true)
    expect(isKnownMonsterKey('tower_battlement_empty')).toBe(true)
  })

  it('accepts in-range non-default variants', () => {
    expect(isKnownMonsterKey('bat#0')).toBe(true)
    expect(isKnownMonsterKey('bat#2')).toBe(true)
  })

  it('rejects a non-canonical spelling of the default tier', () => {
    // bat#1 and bat are the same actor; allowing both would let one actor
    // occupy two pool slots with two different max counts.
    expect(isKnownMonsterKey('bat#1')).toBe(false)
    expect(isKnownMonsterKey('skeleton_runner#0')).toBe(false)
  })

  it('rejects out-of-range, malformed and unknown keys', () => {
    expect(isKnownMonsterKey('bat#99')).toBe(false)
    expect(isKnownMonsterKey('bat#x')).toBe(false)
    expect(isKnownMonsterKey('bat#')).toBe(false)
    expect(isKnownMonsterKey('bogus')).toBe(false)
    expect(isKnownMonsterKey('bogus#0')).toBe(false)
  })
})

describe('resolveActorPath is total', () => {
  it('falls back rather than crashing on bad input (invariant 4)', () => {
    // unknown id -> monsterTypeById's fallback, the first roster entry
    const fallback = MONSTER_TYPES[0].tiers[1]
    expect(resolveActorPath('bogus')).toBe(fallback)
    expect(resolveActorPath('')).toBe(fallback)
    // out-of-range / malformed variant -> that type's default tier
    expect(resolveActorPath('bat#99')).toBe('actors/beasts/bats/bat_black.unit')
    expect(resolveActorPath('bat#x')).toBe('actors/beasts/bats/bat_black.unit')
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

  it('puts only stock AE spawners and slime blobs in the Spawners group', () => {
    const paths = monsterVariantsInGroup('Spawners').map((v) => v.actorPath)
    expect(paths.length).toBeGreaterThanOrEqual(20)
    for (const p of paths) expect(p).toMatch(/^actors\/(spawners\/(hammerwatch|shaftlocke|suntemple)\/|aberrations\/slimes\/(blood\/)?slime_blob)/)
    // all three campaigns contribute spawners
    for (const c of ['hammerwatch', 'shaftlocke', 'suntemple']) expect(paths.some((p) => p.includes(`/spawners/${c}/`)), c).toBe(true)
  })

  it('splits the slime host off from the slime it spawns', () => {
    const [host, spawn] = monsterVariants(monsterTypeById('slime'))
    expect(host.key).toBe('slime#0')
    expect(host.role).toBe('spawner')
    expect(variantGroup(host)).toBe('Spawners')
    // The bare id is still the walker, so no saved pool changes meaning.
    expect(spawn.key).toBe('slime')
    expect(spawn.actorPath).toBe('actors/aberrations/slimes/slime_small.unit')
    expect(variantGroup(spawn)).toBe('Aberrations')
  })
})
