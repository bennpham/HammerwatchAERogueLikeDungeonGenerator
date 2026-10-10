const MULTIPLIER = 0x5deece66dn
const ADDEND = 0xbn
const MASK = (1n << 48n) - 1n

/**
 * Seeded RNG reproducing java.util.Random's 48-bit LCG exactly, so a seed
 * always produces the same dungeon (ported from Rand.java, which wrapped
 * java.util.Random). fRand mirrors Java's 32-bit float arithmetic via
 * Math.fround to keep the random stream aligned with the original tool.
 */
export class Rand {
  private state: bigint

  constructor(seed: number | bigint) {
    this.state = (BigInt(Math.trunc(Number(seed))) ^ MULTIPLIER) & MASK
  }

  private next(bits: number): number {
    this.state = (this.state * MULTIPLIER + ADDEND) & MASK
    return Number(this.state >> BigInt(48 - bits))
  }

  /** java.util.Random.nextInt(bound) for bound > 0 */
  nextInt(bound: number): number {
    if ((bound & -bound) === bound) {
      // power of two
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n)
    }
    let bits: number
    let val: number
    do {
      bits = this.next(31)
      val = bits % bound
    } while (((bits - val + (bound - 1)) | 0) < 0)
    return val
  }

  /** java.util.Random.nextFloat() */
  nextFloat(): number {
    return this.next(24) / (1 << 24)
  }

  /** Rand.iRand: integer in [min, max), or min when max <= min */
  iRand(min: number, max: number): number {
    if (max <= min) return min
    return this.nextInt(max - min) + min
  }

  /** Rand.fRand: float in [min, max), or min when max <= min */
  fRand(min: number, max: number): number {
    if (max <= min) return min
    return Math.fround(Math.fround(this.nextFloat() * Math.fround(max - min)) + min)
  }
}
