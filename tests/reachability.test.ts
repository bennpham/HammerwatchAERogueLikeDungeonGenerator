import { describe, expect, it } from 'vitest'
import { defaultParameters } from '../src/generator/config/parameters'
import { GenerationContext } from '../src/generator/core/context'
import { Level } from '../src/generator/map/level'
import { OVERHANG_ROWS, blockedGrid, exitReachable, floodFill } from '../src/generator/map/reachability'
import { Tile } from '../src/generator/map/tile'

/**
 * A tile grid drawn as ASCII, newest row last: `#` is wall, anything else is
 * floor. Only the fields blockedGrid reads are filled in, which is the whole
 * point — the overhang rule is a property of the tile grid, not of a level's
 * rooms, monsters or prefabs.
 */
function gridLevel(rows: string[]): Level {
  const height = rows.length
  const width = rows[0].length
  const tileArray = rows.flatMap((row) => [...row].map((c) => new Tile(c === '#')))
  return { width, height, tileArray } as unknown as Level
}

function walkable(level: Level, x: number, y: number): boolean {
  return blockedGrid(level)[x + y * level.width] === 0
}

describe('AE walkability: walls bury nothing below them', () => {
  // An AE wall piece's collision is its own footprint cell; its art rises
  // above the footprint, never over the floor below (DISCOVERY-LOG "Walls").
  it('leaves the rows under a wall walkable', () => {
    const level = gridLevel(['###', '...', '...'])
    expect(OVERHANG_ROWS).toBe(0)
    expect(walkable(level, 1, 0)).toBe(false)
    expect(walkable(level, 1, 1)).toBe(true)
    expect(walkable(level, 1, 2)).toBe(true)
  })

  it('passes a one-row neck running under a wall mass', () => {
    const neck = gridLevel([
      '....###....',
      '....###....',
      '....###....',
      '...........',
      '....###....',
      '....###....'
    ])
    const visited = floodFill(blockedGrid(neck), neck.width, neck.height, { x: 1, y: 3 })
    expect(visited[9 + 3 * neck.width], 'right side reached through the neck').toBe(1)
  })

  it('treats an exit doorway (a reserved wall-line cell) as floor', () => {
    const level = gridLevel(['#####', '#####', '.....'])
    level.tileArray[2 + 1 * level.width].reserved = true
    expect(walkable(level, 2, 1)).toBe(true)
    expect(walkable(level, 1, 1)).toBe(false)
  })
})

describe('every shipped floor is walkable end to end', () => {
  // Rebuilds each floor exactly as generateDungeon does — same context, same
  // retry budget — and asserts the floor it would have kept passes the check.
  // This is the regression: seed 431297690's floor 6 shipped sealed.
  const SEEDS = [431297690, 1065617291, 219785121, 1, 2, 3, 42, 777, 12345]

  for (const seed of SEEDS) {
    it(`seed ${seed}`, () => {
      const params = defaultParameters()
      const ctx = new GenerationContext(params, seed)

      for (let i = 0; i < params.levels; i++) {
        let kept: Level | null = null
        for (let attempt = 0; attempt < 60 && kept === null; attempt++) {
          const candidate = new Level(ctx, i)
          if (candidate.levelValid) kept = candidate
          else ctx.clearLevel()
        }
        expect(kept, `floor ${i + 1} generated`).not.toBeNull()
        expect(exitReachable(kept as Level, ctx), `floor ${i + 1} walkable`).toBe(true)
        ctx.clearLevel()
      }
    })
  }
})
