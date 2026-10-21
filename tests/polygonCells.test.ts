/**
 * Polygon collision as the closure check reads it (map/polygonCells.ts,
 * tests/closure.ts): non-zero winding plus every edge, so neither a polygon
 * that crosses itself nor one with no area leaves a gap.
 */
import { describe, expect, it } from 'vitest'
import { AeLevel } from '../src/generator/ae/model'
import type { StateValue } from '../src/generator/ae/model'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import { polygonCells, windingNumber } from '../src/generator/map/polygonCells'
import type { Point } from '../src/generator/map/polygonCells'
import { closureOf } from './closure'

const GRID = { x0: -64, y0: -64, cell: 4, w: 32, h: 32 }
const blocked = (pts: Point[]): Set<number> => {
  const out = new Set<number>()
  polygonCells(pts, GRID, (i) => out.add(i))
  return out
}
const cellAt = (x: number, y: number) => Math.floor((x - GRID.x0) / 4) + Math.floor((y - GRID.y0) / 4) * GRID.w

/** A five-pointed star drawn in one stroke: its middle is wound twice, so even-odd leaves it open. */
const STAR: Point[] = [0, 2, 4, 1, 3].map((k) => {
  const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5
  return [Math.round(48 * Math.cos(a)), Math.round(48 * Math.sin(a))] as const
})

const fence = (points: Point[]): Record<string, StateValue> => ({
  active: { kind: 'bool', value: true },
  sensor: { kind: 'bool', value: false },
  points: { kind: 'vec2s', value: points.map(([x, y]) => [x, y]) }
})

describe('polygon collision', () => {
  it('blocks a self-crossing polygon where it overlaps itself (even-odd would leave a hole)', () => {
    expect(windingNumber(STAR, 0, 0)).not.toBe(0)
    expect(blocked(STAR).has(cellAt(0, 0))).toBe(true)
  })

  it('blocks along the edges of a polygon with no area', () => {
    const line: Point[] = [
      [-40, 0],
      [40, 0],
      [40, 0]
    ]
    const cells = blocked(line)
    for (let x = -40; x < 40; x += 4) expect(cells.has(cellAt(x, 0)), `x ${x}`).toBe(true)
  })

  it('reads and writes a Freeform polygon as vec2 points', () => {
    const level = new AeLevel(null)
    level.addUnit(':Physics_Freeform', 8, 8, fence([[0, 0], [16, 0], [0, 16]]))
    const back = readLevel(renderLevel(level)).level.units[0]
    expect(back.state?.points).toEqual({ kind: 'vec2s', value: [[0, 0], [16, 0], [0, 16]] })
  })

  it('closes a room fenced only by edge-thin Freeforms, and leaks through a missing one', () => {
    const room = (sides: number): AeLevel => {
      const level = new AeLevel(null)
      level.addScript('LevelStart', 0, 0, [])
      const corners: Point[] = [[-32, -32], [32, -32], [32, 32], [-32, 32]]
      for (let i = 0; i < sides; i++) level.addUnit(':Physics_Freeform', 0, 0, fence([corners[i], corners[(i + 1) % 4], corners[(i + 1) % 4]]))
      return level
    }
    const box = { x0: -64, y0: -64, x1: 64, y1: 64 }
    expect(closureOf(room(4), box, '').leak).toBeNull()
    expect(closureOf(room(3), box, '').leak).not.toBeNull()
  })
})
