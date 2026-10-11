import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultParameters, parseParametersTxt, serializeParametersTxt, validateParameters } from '../src/generator'
import {
  TORCH_UNIT,
  environmentOverrides,
  liftedAmbient,
  torchCells
} from '../src/generator/lighting'
import { ENV_SNAPSHOT } from '../src/generator/lighting/envs.generated'
import { applyLineEdits } from '../src/generator/players'
import type { WallGrid } from '../src/generator/map/aeWalls'
import { generateOk, levelsOf } from './ae'
import { aeAssetsDir } from './aeInstall'

/** A grid from rows of '#' (solid) and '.' (floor); 'R' is a reserved wall cell. */
function gridOf(rows: string[]): WallGrid {
  const h = rows.length
  const w = rows[0].length
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : rows[y][x])
  return { width: w, height: h, solid: (x, y) => at(x, y) !== '.', reserved: (x, y) => at(x, y) === 'R' }
}

describe('torch placement', () => {
  const room = gridOf([
    '####################',
    '#..................#',
    '#..................#',
    '####################'
  ])

  it('hangs torches on the north wall only, inside the run, at the spacing', () => {
    const cells = torchCells(room, 7, () => false)
    expect(cells.every(([, y]) => y === 0)).toBe(true)
    // run x 1..18 has ends 1 and 18; torches stay within 2..17
    expect(cells.every(([x]) => x >= 2 && x <= 17)).toBe(true)
    const xs = cells.map(([x]) => x)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(7)
    expect(cells.length).toBe(3)
  })

  it('keeps clear of exits and of anything already on the wall', () => {
    const withExit = gridOf([
      '#########R##########',
      '#..................#',
      '####################'
    ])
    expect(torchCells(withExit, 1, () => false).some(([x]) => Math.abs(x - 9) <= 2)).toBe(false)
    expect(torchCells(room, 1, (x, y) => x === 10 && y === 0).some(([x]) => Math.abs(x - 10) <= 2)).toBe(false)
  })

  it('places nothing at spacing 0', () => {
    expect(torchCells(room, 0, () => false)).toEqual([])
  })
})

describe('torches on generated floors', () => {
  const params = () => {
    const p = defaultParameters()
    p.levels = 2
    p.lobbies = []
    p.boss.enabled = false
    delete p.levelOrder
    return p
  }

  it('hang 16 px below a horizontal wall piece, as Castle hangs them', () => {
    const result = generateOk(params(), 77)
    for (const [stem, level] of levelsOf(result)) {
      const torches = level.units.filter((u) => u.path === TORCH_UNIT)
      expect(torches.length, stem).toBeGreaterThan(0)
      const walls = level.units.filter((u) => /\/h_(16|32|single)\.unit$|\/h\.unit$/.test(u.path))
      for (const t of torches) {
        expect(walls.some((w) => t.y - w.y === 16 && t.x - w.x >= 0 && t.x - w.x < 32), `${stem} ${t.x},${t.y}`).toBe(true)
      }
    }
  })

  it('take ids after everything else, so turning them off moves no other id', () => {
    const on = levelsOf(generateOk(params(), 77))
    const off = levelsOf(generateOk({ ...params(), torches: 'none' }, 77))
    for (const [stem, level] of on) {
      const without = level.units.filter((u) => u.path !== TORCH_UNIT)
      expect(without).toEqual(off.get(stem)!.units)
      expect(off.get(stem)!.units.some((u) => u.path === TORCH_UNIT)).toBe(false)
    }
  })
})

describe('brightness', () => {
  it('lifts the ambient toward grey and keeps the fourth value', () => {
    expect(liftedAmbient([10, 10, 30, 0], 'stock')).toEqual([10, 10, 30, 0])
    expect(liftedAmbient([10, 10, 30, 0], 'brighter')).toEqual([67, 67, 81, 0])
    expect(liftedAmbient([10, 10, 30, 7], 'daylight')[3]).toBe(7)
  })

  it('patches every ambient line of the environments the levels use', () => {
    expect(environmentOverrides(['effects/lighting/prison_1.env'], 'stock')).toEqual([])
    const [o] = environmentOverrides(['effects/lighting/armory_1.env'], 'bright')
    expect(o.path).toBe('effects/lighting/armory_1.env')
    // armory carries two ambients, one per %if branch
    expect(o.edits).toHaveLength(2)
  })

  it('ships the environments of the generated levels', () => {
    const p = defaultParameters()
    p.levels = 2
    p.lobbies = []
    p.boss.enabled = false
    delete p.levelOrder
    const result = generateOk(p, 5)
    const envs = new Set([...levelsOf(result).values()].map((l) => l.environment))
    expect(new Set(result.assetOverrides.map((o) => o.path))).toEqual(envs)
    expect(generateOk({ ...p, brightness: 'stock' }, 5).assetOverrides).toEqual([])
  })

  it.skipIf(aeAssetsDir() === null)('patches cleanly against the install for every theme environment', () => {
    for (const o of environmentOverrides(ENV_SNAPSHOT.map((e) => e.path), 'daylight')) {
      const { missed } = applyLineEdits(readFileSync(join(aeAssetsDir()!, o.source), 'utf8'), o.edits)
      expect(missed, o.path).toEqual([])
    }
  })
})

describe('lighting parameters', () => {
  it('round-trip through parameters.txt and default to torches with a brighter ambient', () => {
    expect(defaultParameters().torches).toBe('normal')
    expect(defaultParameters().brightness).toBe('brighter')
    const p = { ...defaultParameters(), torches: 'dense' as const, brightness: 'daylight' as const }
    const parsed = parseParametersTxt(serializeParametersTxt(p))
    expect(parsed.params.torches).toBe('dense')
    expect(parsed.params.brightness).toBe('daylight')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reject unknown values', () => {
    expect(parseParametersTxt('torches=lots').unknownKeys).toEqual(['torches=lots'])
    const bad = { ...defaultParameters(), brightness: 'neon' as never }
    expect(validateParameters(bad).errors.map((e) => e.field)).toContain('brightness')
  })
})
