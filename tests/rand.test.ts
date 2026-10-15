import { describe, expect, it } from 'vitest'
import { Rand } from '../src/generator/core/rand'

// Reference vectors produced by running java.util.Random on OpenJDK 21
describe('Rand (java.util.Random parity)', () => {
  it('matches nextInt(100) for seed 12345', () => {
    const r = new Rand(12345)
    const values = Array.from({ length: 10 }, () => r.nextInt(100))
    expect(values).toEqual([51, 80, 41, 28, 55, 84, 75, 2, 1, 89])
  })

  it('matches nextInt(7) for seed 12345', () => {
    const r = new Rand(12345)
    const values = Array.from({ length: 10 }, () => r.nextInt(7))
    expect(values).toEqual([5, 2, 4, 6, 2, 4, 2, 4, 6, 1])
  })

  it('matches nextInt(64) (power of two path) for seed 12345', () => {
    const r = new Rand(12345)
    const values = Array.from({ length: 10 }, () => r.nextInt(64))
    expect(values).toEqual([23, 32, 59, 58, 53, 2, 20, 7, 15, 2])
  })

  it('matches nextFloat for seed 12345', () => {
    const r = new Rand(12345)
    const values = Array.from({ length: 10 }, () => Math.fround(r.nextFloat()))
    const expected = [
      0.36180305, 0.5132095, 0.9329935, 0.9171147, 0.8330913, 0.037672937, 0.32647574, 0.12466812,
      0.23552376, 0.0353359
    ].map(Math.fround)
    expect(values).toEqual(expected)
  })

  it('matches nextInt(1000) for seed 987654321', () => {
    const r = new Rand(987654321)
    const values = Array.from({ length: 10 }, () => r.nextInt(1000))
    expect(values).toEqual([536, 927, 658, 121, 148, 801, 889, 714, 218, 182])
  })

  it('matches Java float arithmetic in fRand(2, 6) for seed 42', () => {
    const r = new Rand(42)
    const values = Array.from({ length: 10 }, () => r.fRand(2, 6))
    const expected = [
      4.9102545, 2.2186608, 4.732894, 2.1917572, 3.2348776, 5.7682943, 3.1083138, 4.830842,
      4.6621957, 2.3652983
    ].map(Math.fround)
    expect(values).toEqual(expected)
  })

  it('iRand returns min when max <= min', () => {
    const r = new Rand(1)
    expect(r.iRand(5, 5)).toBe(5)
    expect(r.iRand(5, 3)).toBe(5)
  })

  it('fRand returns min when max <= min', () => {
    const r = new Rand(1)
    expect(r.fRand(2.5, 2.5)).toBe(2.5)
    expect(r.fRand(4, 2)).toBe(4)
  })
})
