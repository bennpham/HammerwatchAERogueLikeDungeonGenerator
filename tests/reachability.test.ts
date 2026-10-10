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

describe('overhang-aware walkability', () => {
  it('buries the rows under a wall, and only those', () => {
    // one wall row on top, five floor rows below it
    const level = gridLevel(['###', '...', '...', '...', '...', '...'])

    for (let y = 1; y <= OVERHANG_ROWS; y++) {
      expect(walkable(level, 1, y), `row ${y} is inside the overhang`).toBe(false)
    }
    expect(walkable(level, 1, OVERHANG_ROWS + 1), 'first row clear of the overhang').toBe(true)
  })

  it('leaves floor with open sky above it walkable', () => {
    const level = gridLevel(['...', '...', '...'])
    expect(walkable(level, 1, 0)).toBe(true)
    expect(walkable(level, 1, 2)).toBe(true)
  })

  it('seals a one-row neck running under a wall mass — the seed 431297690 shape', () => {
    // two rooms joined by a single row that passes directly beneath a wall:
    // connected in tiles, impassable in game
    const sealed = gridLevel([
      '....###....',
      '....###....',
      '....###....',
      '...........', // the neck: its only row, buried by the wall above
      '....###....',
      '....###....'
    ])
    const blocked = blockedGrid(sealed)
    const visited = floodFill(blocked, sealed.width, sealed.height, { x: 1, y: 3 })
    expect(visited[9 + 3 * sealed.width], 'right side reached through the neck').toBe(0)
  })

  it('opens the same neck once it clears the overhang', () => {
    const open = gridLevel([
      '....###....',
      '....###....',
      '....###....',
      '...........',
      '...........',
      '...........' // OVERHANG_ROWS + 1 rows of neck, so the last one is clear
    ])
    const blocked = blockedGrid(open)
    const visited = floodFill(blocked, open.width, open.height, { x: 1, y: 5 })
    expect(visited[9 + 5 * open.width], 'right side reached through the neck').toBe(1)
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
