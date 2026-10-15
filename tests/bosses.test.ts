import { describe, expect, it } from 'vitest'
import { BOSS_IDS } from '../src/generator/config/parameters'
import {
  BOSS_DEF_LIST,
  BOSS_DEFS,
  UNIQUE_BOSS_IDS,
  expandLineup,
  largestBossFootprintArea,
  pickBosses,
  topWallBossClearance,
  topWallBossY
} from '../src/generator/boss/bosses'
import { ARENA_MIN_HEIGHT } from '../src/generator/boss/geometry'
import { Rand } from '../src/generator/core/rand'

/** The two static dragons — the only bosses pinned to the arena's top wall. */
const TOP_WALL = ['boss_dragon', 'boss_dragon_hwr']

describe('boss defs', () => {
  it('has exactly one entry per BOSS_IDS id, in order', () => {
    expect(BOSS_DEF_LIST.map((d) => d.id)).toEqual([...BOSS_IDS])
    for (const id of BOSS_IDS) {
      expect(BOSS_DEFS[id].id).toBe(id)
    }
  })

  it('every def has an AE actor unit and a positive footprint', () => {
    for (const def of BOSS_DEF_LIST) {
      expect(def.actorPath).toMatch(/^actors\/.+\.unit$/)
      expect(def.footprintWidth).toBeGreaterThan(0)
      expect(def.footprintHeight).toBeGreaterThan(0)
      expect(def.barName).toMatch(/^\.(d\.)?ig\./)
    }
  })


  it('places exactly the two dragons in the top wall; everything else is centred', () => {
    for (const def of BOSS_DEF_LIST) expect(def.placement).toBe(TOP_WALL.includes(def.id) ? 'topWall' : 'centre')
  })

  it('has only the dragons forbid an alcove wall, and they forbid N', () => {
    for (const def of BOSS_DEF_LIST) expect(def.forbiddenAlcoveWalls).toEqual(TOP_WALL.includes(def.id) ? ['N'] : [])
  })

  it('queen has the largest footprint, and that is what largestBossFootprintArea reports', () => {
    const queen = BOSS_DEFS.boss_queen
    const queenArea = queen.footprintWidth * queen.footprintHeight
    for (const def of BOSS_DEF_LIST) {
      expect(def.footprintWidth * def.footprintHeight).toBeLessThanOrEqual(queenArea)
    }
    expect(largestBossFootprintArea()).toBeCloseTo(queenArea, 9)
  })
})

describe('topWall boss placement', () => {
  // A static collider overlapping the north wall band leaves the boss
  // unreachable and unable to fire (HW1 playtest, same engine family), so a
  // top-wall boss sits at the shallowest row its whole collider fits on.
  it('honours each dragon collider offset, not just its footprint', () => {
    const dragon = BOSS_DEFS.boss_dragon
    // AE <circle offset="0 -32" radius="40">
    expect(dragon.collisionOffsetY).toBeCloseTo(-2, 9)
    expect(topWallBossY(dragon)).toBe(Math.ceil(dragon.footprintHeight / 2 + 2))
  })

  it('leaves every topWall boss collider entirely on interior floor', () => {
    for (const def of BOSS_DEF_LIST) {
      if (def.placement !== 'topWall') continue
      const y = topWallBossY(def)
      const offset = def.collisionOffsetY ?? 0
      expect(y + offset - def.footprintHeight / 2).toBeGreaterThanOrEqual(0)
      // and it must still fit in the smallest arena validation.ts will allow
      expect(y + offset + def.footprintHeight / 2).toBeLessThan(ARENA_MIN_HEIGHT)
    }
  })

  it('reports a spawn clearance strictly below the collider bottom', () => {
    for (const id of TOP_WALL) {
      const def = BOSS_DEFS[id as keyof typeof BOSS_DEFS]
      const y = topWallBossY(def)
      const colliderBottom = y + (def.collisionOffsetY ?? 0) + def.footprintHeight / 2
      expect(topWallBossClearance(def, y)).toBeGreaterThan(colliderBottom)
    }
  })

  it('is unique for exactly the two dragons and the queen', () => {
    for (const def of BOSS_DEF_LIST) {
      expect(def.unique).toBe((UNIQUE_BOSS_IDS as readonly string[]).includes(def.id))
    }
    expect([...UNIQUE_BOSS_IDS].sort()).toEqual(['boss_dragon', 'boss_dragon_hwr', 'boss_queen'])
  })
})

describe('pickBosses (issue #64 part 1)', () => {
  it('draws exactly count values, in order, for count = 1', () => {
    // The single-draw contract every existing single-boss call site relies
    // on: pickBosses(rand, pool, 1) must be indistinguishable from
    // pool[rand.iRand(0, pool.length)].
    const pool = [...BOSS_IDS]
    const a = new Rand(42)
    const b = new Rand(42)
    const picked = pickBosses(a, pool, 1)
    const expected = pool[b.iRand(0, pool.length)]
    expect(picked).toEqual([expected])
  })

  it('draws exactly count values for count > 1', () => {
    const rand = new Rand(7)
    const picked = pickBosses(rand, [...BOSS_IDS], 4)
    expect(picked).toHaveLength(4)
    for (const id of picked) expect(BOSS_IDS).toContain(id)
  })

  it('never repeats a unique boss (dragon, queen) within one pick', () => {
    // Every seed in a wide sweep, over the full pool, at the max count.
    for (let seed = 0; seed < 500; seed++) {
      const rand = new Rand(seed)
      const picked = pickBosses(rand, [...BOSS_IDS], 4)
      for (const uniqueId of UNIQUE_BOSS_IDS) {
        expect(picked.filter((id) => id === uniqueId).length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('allows a non-unique boss to repeat', () => {
    // A pool of one non-unique boss, asked for several — every pick must
    // succeed (no unique-removal shrinks the candidate list).
    const rand = new Rand(3)
    const picked = pickBosses(rand, ['boss_knight'], 4)
    expect(picked).toEqual(['boss_knight', 'boss_knight', 'boss_knight', 'boss_knight'])
  })

  it('stops early rather than looping when the pool of unique bosses runs out', () => {
    const rand = new Rand(1)
    const picked = pickBosses(rand, ['boss_dragon', 'boss_queen'], 4)
    expect(picked.length).toBeLessThanOrEqual(2)
    expect(new Set(picked).size).toBe(picked.length)
  })
})

describe('expandLineup (issue #64 follow-up)', () => {
  it('expands each count in BOSS_IDS order, never Object.keys order', () => {
    // Inserted deliberately out of BOSS_IDS order (boss_worm, then boss_anubis,
    // then boss_knight) — the result must still read anubis, knight, worm.
    const lineup = { boss_worm: 1, boss_anubis: 2, boss_knight: 3 }
    expect(expandLineup(lineup)).toEqual([
      'boss_anubis', 'boss_anubis',
      'boss_knight', 'boss_knight', 'boss_knight',
      'boss_worm'
    ])
  })

  it('repeats an id exactly its count, including a unique boss at count 1', () => {
    // BOSS_IDS order is anubis, dragon, knight, krilith, lich, queen, worm —
    // so dragon comes before lich, and lich before queen, in the result.
    expect(expandLineup({ boss_dragon: 1, boss_queen: 1, boss_lich: 4 })).toEqual([
      'boss_dragon',
      'boss_lich', 'boss_lich', 'boss_lich', 'boss_lich',
      'boss_queen'
    ])
  })

  it('skips an id at 0, undefined, negative or non-integer — draws nothing to validate that', () => {
    expect(expandLineup({ boss_knight: 0, boss_lich: undefined, boss_worm: -1, boss_anubis: 2.5, boss_krilith: 2 })).toEqual([
      'boss_krilith', 'boss_krilith'
    ])
  })

  it('returns an empty list for an undefined or empty lineup', () => {
    expect(expandLineup(undefined)).toEqual([])
    expect(expandLineup({})).toEqual([])
  })
})
