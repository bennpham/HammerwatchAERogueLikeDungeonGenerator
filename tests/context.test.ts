import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'

/**
 * bossRand (seed + 2) is a third stream, added alongside rand (seed) and
 * cosmeticRand (seed + 1) for the boss arena. It must be fully isolated from
 * both — any leak into `rand` would move every existing seed's dungeon the
 * moment the boss feature draws from it.
 */
describe('GenerationContext — bossRand isolation', () => {
  it('constructs bossRand as a distinct stream from rand and cosmeticRand', () => {
    const ctx = new GenerationContext(defaultParameters(), 42)
    const rand = Array.from({ length: 10 }, () => ctx.rand.iRand(0, 1_000_000))

    const cosmetic = new GenerationContext(defaultParameters(), 42)
    const cosmeticValues = Array.from({ length: 10 }, () => cosmetic.cosmeticRand.iRand(0, 1_000_000))

    const boss = new GenerationContext(defaultParameters(), 42)
    const bossValues = Array.from({ length: 10 }, () => boss.bossRand.iRand(0, 1_000_000))

    // seed, seed+1 and seed+2 are different LCG seeds, so the three streams
    // diverge immediately (astronomically unlikely to collide by chance)
    expect(bossValues).not.toEqual(rand)
    expect(bossValues).not.toEqual(cosmeticValues)
  })

  it('draining bossRand 1000 times leaves the next 20 rand values identical to an untouched context', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) drained.bossRand.iRand(0, 1_000_000)

    const untouchedValues = Array.from({ length: 20 }, () => untouched.rand.iRand(0, 1_000_000))
    const drainedValues = Array.from({ length: 20 }, () => drained.rand.iRand(0, 1_000_000))
    expect(drainedValues).toEqual(untouchedValues)
  })

  it('draining bossRand 1000 times leaves the next 20 cosmeticRand values identical to an untouched context', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) drained.bossRand.iRand(0, 1_000_000)

    const untouchedValues = Array.from({ length: 20 }, () => untouched.cosmeticRand.iRand(0, 1_000_000))
    const drainedValues = Array.from({ length: 20 }, () => drained.cosmeticRand.iRand(0, 1_000_000))
    expect(drainedValues).toEqual(untouchedValues)
  })
})

/**
 * trapRand (seed + 3) is the fourth stream, added for the per-floor wall traps
 * (src/generator/traps/floor.ts). Same contract as bossRand and for the same
 * reason: a floor's traps are placed onto a finished floor, and drawing them
 * from `rand` would shift every LATER floor's whole layout the moment any
 * earlier floor were trapped.
 */
describe('GenerationContext — trapRand isolation', () => {
  it('constructs trapRand as a distinct stream from the other three', () => {
    const seed = 42
    const take = (pick: (c: GenerationContext) => { iRand: (a: number, b: number) => number }): number[] => {
      const ctx = new GenerationContext(defaultParameters(), seed)
      return Array.from({ length: 10 }, () => pick(ctx).iRand(0, 1_000_000))
    }

    const trap = take((c) => c.trapRand)
    expect(trap).not.toEqual(take((c) => c.rand))
    expect(trap).not.toEqual(take((c) => c.cosmeticRand))
    expect(trap).not.toEqual(take((c) => c.bossRand))
  })

  it('draining trapRand 1000 times leaves the other three streams untouched', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) drained.trapRand.iRand(0, 1_000_000)

    for (const stream of ['rand', 'cosmeticRand', 'bossRand'] as const) {
      const a = Array.from({ length: 20 }, () => untouched[stream].iRand(0, 1_000_000))
      const b = Array.from({ length: 20 }, () => drained[stream].iRand(0, 1_000_000))
      expect(b, `${stream} moved`).toEqual(a)
    }
  })

  it('draining the other three streams leaves trapRand untouched', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) {
      drained.rand.iRand(0, 1_000_000)
      drained.cosmeticRand.iRand(0, 1_000_000)
      drained.bossRand.iRand(0, 1_000_000)
    }

    const a = Array.from({ length: 20 }, () => untouched.trapRand.iRand(0, 1_000_000))
    const b = Array.from({ length: 20 }, () => drained.trapRand.iRand(0, 1_000_000))
    expect(b).toEqual(a)
  })
})
