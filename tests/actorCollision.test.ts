import { describe, expect, it } from 'vitest'
import { MONSTER_TYPES, corpseCollision, corpseCollisionPaths, monsterVariants } from '../src/generator'

/**
 * The verified corpse-collision table, transcribed independently of
 * actorCollision.ts from the razed XML in a stock install
 * (Hammerwatch/editor/assetsExtract/actors/**). Duplicated on purpose: if
 * someone flips a value in the registry, this table is what disagrees.
 */
const PASSABLE = [
  'actors/tower_banner_1.xml',
  'actors/tower_banner_2.xml',
  'actors/tower_banner_3.xml',
  'actors/tower_battlement_archer_1.xml',
  'actors/tower_battlement_archer_3.xml',
  'actors/tower_battlement_empty.xml',
  'actors/tower_flower_1.xml',
  'actors/tower_flower_1_small.xml',
  'actors/tower_flower_2.xml',
  'actors/tower_flower_3.xml',
  'actors/spawners/archer_1.xml',
  'actors/spawners/archer_2.xml',
  'actors/spawners/doomspawn_1.xml',
  'actors/spawners/eye_1.xml',
  'actors/spawners/mummy_1.xml',
  'actors/spawners/mummy_ranged_1.xml',
  'actors/spawners/skeleton_1.xml',
  'actors/spawners/skeleton_2.xml',
  'actors/spawners/tick_1.xml',
  'actors/spawners/bonus/skeleton_1.xml',
  'actors/slime_1_host.xml'
]

const BLOCKING = [
  'actors/tower_nova_1.xml',
  'actors/tower_nova_2.xml',
  'actors/tower_static_frost.xml',
  'actors/tower_tracking_1.xml',
  'actors/tower_tracking_2.xml',
  'actors/tower_tracking_3.xml',
  'actors/spawners/bats.xml',
  'actors/spawners/maggot_1.xml',
  'actors/spawners/wisp_1.xml'
]

describe('corpse collision registry', () => {
  it.each(PASSABLE)('%s leaves a walkable wreck', (path) => {
    expect(corpseCollision(path)).toBe('passable')
  })

  it.each(BLOCKING)('%s leaves a wreck that still blocks', (path) => {
    expect(corpseCollision(path)).toBe('blocking')
  })

  it('holds exactly the paths in the two tables and nothing else', () => {
    expect([...corpseCollisionPaths()].sort()).toEqual([...PASSABLE, ...BLOCKING].sort())
  })

  it('reports undefined for an ordinary monster, which leaves only gibs', () => {
    expect(corpseCollision('actors/bat_1.xml')).toBeUndefined()
    expect(corpseCollision('actors/skeleton_3.xml')).toBeUndefined()
  })

  it('reports undefined rather than throwing for an unknown path', () => {
    expect(corpseCollision('actors/does_not_exist.xml')).toBeUndefined()
  })

  /**
   * The point of the registry: nothing that leaves a permanent doodad may be
   * missing from it, or the arena picker silently shows no passability badge
   * and the future placement pass has no data. Every tower and spawner in the
   * roster is such an actor.
   */
  it('covers every tower and spawner actor in the roster', () => {
    const missing = MONSTER_TYPES.flatMap((t) => t.tiers).filter(
      (p) => (p.startsWith('actors/spawners/') || p.startsWith('actors/tower_')) && corpseCollision(p) === undefined
    )
    expect(missing).toEqual([])
  })

  it('gives every spawner variant a corpse value', () => {
    const spawners = MONSTER_TYPES.flatMap(monsterVariants).filter((v) => v.role === 'spawner')
    expect(spawners.length).toBeGreaterThan(0)
    for (const v of spawners) {
      expect(v.corpse, v.actorPath).toBeDefined()
    }
  })

  /**
   * The converse of the rule above: role is not derivable from the folder, so a
   * spawner outside actors/spawners/ has to be listed by hand in monsterTypes.
   * Pinning the exception list keeps that opt-in visible — a new hive-shaped
   * actor that nobody registers shows up here rather than silently landing
   * among the creatures.
   */
  it('keeps slime_1_host as the only spawner outside actors/spawners/', () => {
    const odd = MONSTER_TYPES.flatMap(monsterVariants)
      .filter((v) => v.role === 'spawner' && !v.actorPath.startsWith('actors/spawners/'))
      .map((v) => v.actorPath)
    expect(odd).toEqual(['actors/slime_1_host.xml'])
  })
})
