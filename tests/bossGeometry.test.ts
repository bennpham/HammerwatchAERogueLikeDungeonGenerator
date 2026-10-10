import { describe, expect, it } from 'vitest'
import {
  ARENA_MIN_HEIGHT,
  ARENA_MIN_WIDTH,
  coverPillarCount,
  freeFloorArea,
  pillarFootprint
} from '../src/generator/boss/geometry'

describe('boss arena geometry', () => {
  it('never reports a negative free floor, even below the validation minimums', () => {
    expect(freeFloorArea(1, 1)).toBe(0)
    expect(freeFloorArea(0, 0)).toBe(0)
  })

  it('grows with arena size', () => {
    const small = freeFloorArea(ARENA_MIN_WIDTH, ARENA_MIN_HEIGHT)
    const large = freeFloorArea(ARENA_MIN_WIDTH * 2, ARENA_MIN_HEIGHT * 2)
    expect(large).toBeGreaterThan(small)
  })

  it('coverPillarCount is 0 at density 0', () => {
    expect(coverPillarCount(0, 40, 50, 'a')).toBe(0)
  })

  it('coverPillarCount is monotonic in density', () => {
    const width = 40
    const height = 50
    let previous = coverPillarCount(0, width, height, 'a')
    for (const density of [0.1, 0.25, 0.5, 0.75, 1]) {
      const count = coverPillarCount(density, width, height, 'a')
      expect(count).toBeGreaterThanOrEqual(previous)
      previous = count
    }
  })

  it('coverPillarCount never goes negative for a degenerate (too-small) arena', () => {
    expect(coverPillarCount(1, 1, 1, 'a')).toBe(0)
  })
})

describe('boss geometry — pillar footprints are per theme', () => {
  // The three pillar assets differ by a factor of five in area, so a single
  // averaged constant would make `density` mean something different in every
  // theme. Measured off the install: classic 1 x 2.5, h 2.25 x 2.25 (circle
  // r=18), bonus 1 x 1. See DISCOVERY-LOG.md.
  it('resolves the real measured footprint for each theme family', () => {
    expect(pillarFootprint('a')).toEqual({ width: 1, height: 2.5 })
    expect(pillarFootprint('i')).toEqual({ width: 1, height: 2.5 })
    expect(pillarFootprint('h')).toEqual({ width: 2.25, height: 2.25 })
    expect(pillarFootprint('bonus1')).toEqual({ width: 1, height: 1 })
    expect(pillarFootprint('bonus5')).toEqual({ width: 1, height: 1 })
  })

  it('gives a bigger pillar fewer slots at the same density and arena size', () => {
    const at = (theme: string) => coverPillarCount(0.5, 30, 40, theme)
    // h's pillar covers 5.0625 tiles to a bonus pillar's 1, so the same
    // density must not resolve to the same count in both
    expect(at('h')).toBeLessThan(at('a'))
    expect(at('a')).toBeLessThan(at('bonus1'))
  })
})
