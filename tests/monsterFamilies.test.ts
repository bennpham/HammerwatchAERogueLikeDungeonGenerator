import { describe, expect, it } from 'vitest'
import {
  MONSTER_FAMILIES,
  MONSTER_TYPES,
  MONSTER_VARIANT_GROUPS,
  defaultParameters,
  familyMembers,
  familyOfMember,
  floorPoolBucketId,
  floorPoolEntriesInGroup,
  generateDungeon,
  isKnownFamilyId,
  isKnownFloorPoolKey,
  monsterFamilyById,
  monsterTypeById,
  monsterVariantsInGroup,
  parseParametersTxt,
  serializeParametersTxt
} from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { lvlText } from './ae'
import { readLevel } from '../src/generator/ae/levelReader'

/** One floor pooling exactly `pool`, with `max` applied to every key in it. */
function floorWith(pool: string[], seed: number, max = 40): DungeonResult {
  const params = plainParameters()
  params.levels = 1
  params.themes = ['prison']
  params.levelMonsters = [pool]
  const monsterMax = { ...params.monsterMax }
  for (const key of pool) monsterMax[key] = max
  params.monsterMax = monsterMax
  const result = generateDungeon(params, seed)
  expect(result.ok, `pool ${pool.join(',')} seed ${seed}`).toBe(true)
  return result as DungeonResult
}

const levelXML = (r: DungeonResult): string => lvlText(r, 'floor0')

function actorCount(lvl: string, path: string): number {
  return readLevel(lvl).level.units.filter((u) => u.path === path).length
}

/** The single actor a single-tier member spawns. */
const actorOf = (id: string): string => monsterTypeById(id).tiers[0]

describe('the family registry', () => {
  it('names only real, non-deprecated types, and never the same type twice', () => {
    const seen = new Set<string>()
    for (const family of MONSTER_FAMILIES) {
      expect(family.members.length, `${family.id} needs members`).toBeGreaterThan(1)
      for (const id of family.members) {
        const type = MONSTER_TYPES.find((t) => t.id === id)
        expect(type, `${family.id} names unknown type ${id}`).toBeDefined()
        expect(type!.deprecated, `${family.id} names deprecated ${id}`).toBeFalsy()
        expect(seen.has(id), `${id} is in two families`).toBe(false)
        seen.add(id)
        // A family's members must agree on the group its entry is filed under.
        expect(type!.group).toBe(family.group)
      }
      expect(familyMembers(family).map((t) => t.id)).toEqual(family.members)
    }
  })

  it('leaves tower_empty, tower_static_frost and the deprecated phantom out', () => {
    const claimed = MONSTER_FAMILIES.flatMap((f) => f.members)
    // Both are lone barriers rather than one of a set — see MONSTER_NOTES.
    expect(claimed).not.toContain('tower_battlement_empty')
    expect(claimed).not.toContain('tower_static_frost')
    // tower_archer2 points at the same actor tower_empty owns.
    expect(claimed).not.toContain('tower_battlement_empty')
  })

  it('never collides with a type on id or config key', () => {
    const typeIds = new Set(MONSTER_TYPES.map((t) => t.id))
    const keys = new Map<string, string>()
    for (const t of MONSTER_TYPES) keys.set(t.configKey.toLowerCase(), t.id)
    for (const family of MONSTER_FAMILIES) {
      expect(typeIds.has(family.id), `${family.id} shadows a type id`).toBe(false)
      const key = family.configKey.toLowerCase()
      expect(keys.has(key), `${family.configKey} collides with ${keys.get(key)}`).toBe(false)
      keys.set(key, family.id)
    }
  })

  it('maps a member back to its family', () => {
    expect(familyOfMember('banner_drain')?.id).toBe('banner')
    expect(familyOfMember('tower_battlement_empty')).toBeUndefined()
    expect(isKnownFamilyId('banner')).toBe(true)
    expect(isKnownFamilyId('banner_bloodlust')).toBe(false)
    expect(monsterFamilyById('nope')).toBeUndefined()
  })
})

describe('a family rolls between whole types', () => {
  it('spawns a mix rather than one member', () => {
    const family = monsterFamilyById('banner')!
    const xml = levelXML(floorWith(['banner'], 4242))
    const present = family.members.filter((id) => actorCount(xml, actorOf(id)) > 0)
    expect(present.length, 'a family lair should be mixed').toBeGreaterThan(1)
  })

  it('can roll its FIRST member — the trap a tiers array would have fallen into', () => {
    // createRolled starts at tier 1 and only climbs, so a family expressed as a
    // tiers array could never emit members[0]: tower_archer would be archer3
    // every time. This is the regression guard for that.
    let first = 0
    for (let seed = 1; seed <= 6; seed++) {
      first += actorCount(levelXML(floorWith(['tower_battlement'], seed)), actorOf('tower_battlement_archer'))
    }
    expect(first, 'tower_archer1 must be reachable').toBeGreaterThan(0)
  })

  it('gives every member a share across seeds', () => {
    for (const family of MONSTER_FAMILIES) {
      const tally = new Map(family.members.map((id) => [id, 0]))
      for (let seed = 1; seed <= 6; seed++) {
        const xml = levelXML(floorWith([family.id], seed))
        for (const id of family.members) {
          tally.set(id, tally.get(id)! + actorCount(xml, actorOf(id)))
        }
      }
      for (const [id, n] of tally) {
        expect(n, `${family.id} never rolled ${id}`).toBeGreaterThan(0)
      }
      // Even, not weighted: no member should dominate. A loose bound — this
      // asserts the SHAPE of a uniform draw, not an exact ratio.
      const counts = [...tally.values()]
      expect(Math.max(...counts)).toBeLessThan(Math.min(...counts) * 3)
    }
  })

  it('reads its own cap, not its members\'', () => {
    const lean = levelXML(floorWith(['banner'], 909, 8))
    const fat = levelXML(floorWith(['banner'], 909, 200))
    const total = (xml: string) =>
      monsterFamilyById('banner')!.members.reduce(
        (n, id) => n + actorCount(xml, actorOf(id)),
        0
      )
    expect(total(fat)).toBeGreaterThan(total(lean))

    // A member's own cap is not consulted on the family path — force
    // tower_flower1's cap to 0 explicitly (rather than relying on whatever
    // the shipped default happens to ship, which moved when the castle
    // preset armed tower_flower1 in its own pool) and confirm it still
    // spawns through the family.
    const params = plainParameters()
    params.levels = 1
    params.themes = ['prison']
    params.levelMonsters = [['flower']]
    params.monsterMax = { ...params.monsterMax, flower: 40, flower_eater: 0 }
    const result = generateDungeon(params, 77)
    expect(result.ok).toBe(true)
    const xml = levelXML(result as DungeonResult)
    expect(actorCount(xml, actorOf('flower_eater'))).toBeGreaterThan(0)
  })

  it('leaves members working as ordinary pool keys', () => {
    const xml = levelXML(floorWith(['banner_drain'], 4242))
    expect(actorCount(xml, actorOf('banner_drain'))).toBeGreaterThan(0)
    expect(actorCount(xml, actorOf('banner_bloodlust'))).toBe(0)
    expect(actorCount(xml, actorOf('banner_healing'))).toBe(0)
  })
})

describe('family pool keys', () => {
  it('accepts a bare family id and rejects a tier on it', () => {
    expect(isKnownFloorPoolKey('banner')).toBe(true)
    // A family has no tiers to index; its members have their own ids.
    expect(isKnownFloorPoolKey('banner#0')).toBe(false)
    expect(isKnownFloorPoolKey('banner#1')).toBe(false)
  })

  it('buckets a family with its members, and nothing else', () => {
    const towers = floorPoolEntriesInGroup('Towers')
    const family = towers.find((e) => e.key === 'banner')
    expect(family?.role).toBe('family')
    expect(floorPoolBucketId(family!)).toBe('banner')
    for (const id of ['banner_bloodlust', 'banner_drain', 'banner_healing']) {
      expect(floorPoolBucketId(towers.find((e) => e.key === id)!)).toBe('banner')
    }
    // A standalone tower keeps its own bucket.
    expect(floorPoolBucketId(towers.find((e) => e.key === 'tower_battlement_empty')!)).toBe('tower_battlement_empty')
  })

  it('offers every family exactly once, in its own group', () => {
    const all = MONSTER_VARIANT_GROUPS.flatMap((g) => floorPoolEntriesInGroup(g))
    for (const family of MONSTER_FAMILIES) {
      expect(all.filter((e) => e.key === family.id)).toHaveLength(1)
      expect(floorPoolEntriesInGroup(family.group).some((e) => e.key === family.id)).toBe(true)
    }
  })

  it('stays OUT of the arena picker', () => {
    // monsterVariantsInGroup builds the boss wave picker off MONSTER_TYPES. A
    // family there would offer a second checkbox for actors its members already
    // own, which MonsterVariant.key's contract forbids. Living outside
    // MONSTER_TYPES is what prevents it — assert it stayed that way.
    const ids = new Set(MONSTER_FAMILIES.map((f) => f.id))
    for (const group of MONSTER_VARIANT_GROUPS) {
      for (const variant of monsterVariantsInGroup(group)) {
        expect(ids.has(variant.key), `${variant.key} leaked into the arena picker`).toBe(false)
      }
    }
  })
})

describe('validation of family keys', () => {
  const withPool = (pool: string[]): DungeonParameters => {
    const params = plainParameters()
    params.levelMonsters = params.levelMonsters.map((p, i) => (i === 0 ? pool : p))
    return params
  }
  const errorsFor = (pool: string[]) =>
    validateParameters(withPool(pool)).errors.filter((e) => e.field === 'levelMonsters')

  it('accepts a family id', () => {
    expect(errorsFor(['banner'])).toHaveLength(0)
  })

  it('rejects a tier on a family and points at the members instead', () => {
    const errors = errorsFor(['banner#1'])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('family')
    expect(errors[0].message).toContain('banner_bloodlust')
    // not the tier-range message a real type would get
    expect(errors[0].message).not.toContain('has tiers 0-')
  })

  it('warns on a family capped at 0 by its OWN cap', () => {
    const params = withPool(['banner'])
    params.monsterMax = { ...params.monsterMax, banner: 0 }
    const warning = validateParameters(params).warnings.find(
      (w) => w.field === 'levelMonsters' && w.message.includes('banner')
    )
    expect(warning).toBeDefined()

    // and does NOT warn just because a member ships at 0 — force it
    // explicitly, rather than relying on whatever the shipped default
    // happens to give tower_flower1 today.
    const flower = withPool(['flower'])
    flower.monsterMax = { ...flower.monsterMax, flower_eater: 0 }
    expect(flower.monsterMax.flower).toBeGreaterThan(0)
    expect(
      validateParameters(flower).warnings.filter(
        (w) => w.field === 'levelMonsters' && w.message.includes('flower')
      )
    ).toHaveLength(0)
  })
})

describe('families are opt-in', () => {
  // Families started in no default or preset pool (7f50111), which was the
  // proof that adding a family costs no draw until something actually pools
  // it — the safety property this describe block is about. The maintainer's
  // post-#58 playtest pass then deliberately DID pool several families in all
  // three presets (see parameters.ts/presets.ts), so that no-longer-holds
  // assertion is gone; the underlying property is unaffected and still
  // guarded elsewhere: monsters.test.ts's seed-digest test builds its own
  // literal pool rather than reading defaultParameters(), so it still proves
  // a family costs nothing when absent, regardless of what ships today.

  it('ship a cap that round-trips through parameters.txt', () => {
    const params = defaultParameters()
    for (const family of MONSTER_FAMILIES) {
      expect(params.monsterMax[family.id]).toBe(family.defaultMax)
    }
    const text = serializeParametersTxt(params)
    expect(text).toContain('max_banner=4')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.monsterMax).toEqual(params.monsterMax)
  })

  it('carry a family pool entry and its weight through parameters.txt', () => {
    const params = plainParameters()
    params.levelMonsters = params.levelMonsters.map((p, i) =>
      i === 0 ? ['banner', 'banner', 'bat'] : p
    )
    const text = serializeParametersTxt(params)
    expect(text).toContain('monsters0=banner,banner,bat')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelMonsters[0]).toEqual(['banner', 'banner', 'bat'])
  })
})
