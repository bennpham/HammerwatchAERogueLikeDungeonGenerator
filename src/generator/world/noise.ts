import type { Rand } from '../core/rand'

/**
 * Smooth 2D value noise for the island's coast and the ground patches.
 *
 * A lattice of random values every `spacing` tiles, blended with smoothstep,
 * summed over `octaves` (each half the spacing and half the weight). The
 * lattice is drawn from `rand` once, up front, in a fixed order, so the same
 * stream state always gives the same field. Values are in [0, 1].
 */
export class ValueNoise {
  private readonly layers: Array<{ spacing: number; cols: number; values: Float64Array; weight: number }> = []
  private readonly total: number

  constructor(rand: Rand, width: number, height: number, spacing: number, octaves = 2) {
    let s = Math.max(2, spacing)
    let weight = 1
    let total = 0
    for (let o = 0; o < octaves; o++) {
      const cols = Math.ceil(width / s) + 2
      const rows = Math.ceil(height / s) + 2
      const values = new Float64Array(cols * rows)
      for (let i = 0; i < values.length; i++) values[i] = rand.nextFloat()
      this.layers.push({ spacing: s, cols, values, weight })
      total += weight
      s = Math.max(2, s / 2)
      weight /= 2
    }
    this.total = total
  }

  at(x: number, y: number): number {
    let sum = 0
    for (const { spacing, cols, values, weight } of this.layers) {
      const fx = x / spacing
      const fy = y / spacing
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      const tx = smooth(fx - ix)
      const ty = smooth(fy - iy)
      const v = (cx: number, cy: number) => values[cy * cols + cx]
      const top = v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx
      const bottom = v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx
      sum += (top * (1 - ty) + bottom * ty) * weight
    }
    return sum / this.total
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}
