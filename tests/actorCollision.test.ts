import { describe, expect, it } from 'vitest'
import { MONSTER_TYPES, corpseCollision, corpseCollisionPaths, monsterVariants } from '../src/generator'
import { aeAssetsDir } from './aeInstall'
// @ts-expect-error untyped dev helper shared with scripts/dev/corpse-survey.ts
import { preprocess } from '../scripts/lib/aeunit.mjs'

/**
 * The AE wrecks that still block, transcribed independently of
 * actorCollision.ts. Duplicated on purpose: if someone flips a value in the
 * registry, this table is what disagrees.
 */
const BLOCKING = ['actors/towers/tower_static_frost.unit', 'actors/spawners/shaftlocke/spawner_lich.unit']

const PASSABLE = [
  'actors/towers/tower_nova_ice.unit',
  'actors/towers/tower_laser_fire.unit',
  'actors/towers/tower_battlement_empty.unit',
  'actors/banners/banner_healing.unit',
  'actors/aberrations/flowers/flower_eater.unit',
  'actors/spawners/hammerwatch/spawner_bats.unit',
  'actors/spawners/suntemple/spawner_mummy_soldier.unit'
]

const ASSETS = aeAssetsDir()

describe('corpse collision registry', () => {
  it.each(PASSABLE)('%s leaves a walkable wreck', (path) => {
    expect(corpseCollision(path)).toBe('passable')
  })

  it.each(BLOCKING)('%s leaves a wreck that still blocks', (path) => {
    expect(corpseCollision(path)).toBe('blocking')
  })

  it('lists exactly the blocking table', () => {
    expect([...corpseCollisionPaths()].sort()).toEqual([...BLOCKING].sort())
  })

  it('reports undefined for an ordinary monster, which leaves only gibs', () => {
    expect(corpseCollision('actors/beasts/bats/bat_black.unit')).toBeUndefined()
    expect(corpseCollision('actors/undead/skeletons/hammerwatch/skeleton_runner.unit')).toBeUndefined()
  })

  it('reports undefined rather than throwing for an unknown path', () => {
    expect(corpseCollision('actors/does_not_exist.unit')).toBeUndefined()
  })

  /**
   * Nothing that leaves a permanent doodad may be missing from the registry,
   * or the arena picker silently shows no passability badge. Every tower,
   * spawner, banner and flower in the roster is such an actor.
   */
  it('covers every tower, spawner, banner and flower in the roster', () => {
    const missing = MONSTER_TYPES.flatMap((t) => t.tiers).filter(
      (p) => /^actors\/(spawners|towers|banners|aberrations\/flowers)\//.test(p) && corpseCollision(p) === undefined
    )
    expect(missing).toEqual([])
  })

  it('gives every spawner prop under actors/spawners/ a corpse value', () => {
    const spawners = MONSTER_TYPES.flatMap(monsterVariants).filter(
      (v) => v.role === 'spawner' && v.actorPath.startsWith('actors/spawners/')
    )
    expect(spawners.length).toBeGreaterThan(20)
    for (const v of spawners) expect(v.corpse, v.actorPath).toBeDefined()
  })

  /**
   * Role is not derivable from the folder, so a spawner outside
   * actors/spawners/ has to be listed by hand in monsterTypes. Pinning the
   * exception list keeps that opt-in visible.
   */
  it('keeps the two slime blobs as the only spawners outside actors/spawners/', () => {
    const odd = MONSTER_TYPES.flatMap(monsterVariants)
      .filter((v) => v.role === 'spawner' && !v.actorPath.startsWith('actors/spawners/'))
      .map((v) => v.actorPath)
    expect(odd.sort()).toEqual(['actors/aberrations/slimes/blood/slime_blob.unit', 'actors/aberrations/slimes/slime_blob.unit'])
  })

  /**
   * The registry agrees with the install: a roster actor whose wreck (its
   * `*_razed.unit`) keeps a collision shape is listed as blocking, and one
   * whose wreck has none is not. Skipped without an AE install.
   */
  it.skipIf(ASSETS === null)('matches every razed wreck in the install', () => {
    const paths = [...new Set(MONSTER_TYPES.flatMap((t) => t.tiers))]
    let checked = 0
    for (const p of paths) {
      const unit: string = preprocess(ASSETS, p)
      const razed = /(actors\/[^<"]+_razed\.unit)/.exec(unit)?.[1]
      if (razed === undefined) continue
      checked++
      const raw: string = preprocess(ASSETS, razed)
      const solid = /<collision[^>]*>[\s\S]*?<(circle|rect|polygon)/.test(raw)
      expect(corpseCollision(p), `${p} -> ${razed}`).toBe(solid ? 'blocking' : 'passable')
    }
    expect(checked).toBeGreaterThan(10)
  })
})
