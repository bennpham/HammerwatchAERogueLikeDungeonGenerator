import { describe, expect, it } from 'vitest'
import { COVER_MARGIN, placeCover } from '../src/generator/map/aeCover'
import type { CoverUnit } from '../src/generator/map/aeCover'
import type { WallGrid } from '../src/generator/map/aeWalls'
import { AE_UNIT_SET, aeAssetExists } from '../src/generator/catalog/assets'
import { stairArtRect } from '../src/generator/objects/doodad'
import { TORCH_UNIT } from '../src/generator/lighting'
import { generateOk, levelsOf } from './ae'
import { plainParameters } from './params'

/** A grid from rows of '#' (solid) and '.' (floor); out of bounds is solid. */
function gridOf(rows: string[]): WallGrid {
  const h = rows.length
  const w = rows[0].length
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : rows[y][x])
  return { width: w, height: h, solid: (x, y) => at(x, y) !== '.', reserved: () => false }
}

const exists = (p: string) => AE_UNIT_SET.has(p)

/** The 8-px subcells (keyed by their top-left px) the placed squares paint. */
function painted(units: CoverUnit[]): Set<string> {
  const out = new Set<string>()
  for (const u of units) {
    for (let y = u.y - u.size; y < u.y; y += 8) for (let x = u.x; x < u.x + u.size; x += 8) out.add(`${x},${y}`)
  }
  return out
}

/**
 * The stock rule, written independently of the module: a drawn subcell is
 * coloured when the cells 8 px either side of its centre, 32 px lower, are all
 * solid.
 */
function reference(g: WallGrid, x: number, y: number): boolean {
  const cx = x + 4
  const cy = y + 4 + 32
  const xs = [Math.floor((cx - 8) / 16), Math.floor((cx + 8) / 16)]
  const ys = [Math.floor((cy - 8) / 16), Math.floor((cy + 8) / 16)]
  return xs.every((gx) => ys.every((gy) => g.solid(gx, gy)))
}

const room = gridOf([
  '##########',
  '##########',
  '##########',
  '#........#',
  '#........#',
  '##########',
  '##########',
  '##########'
])

describe('wall-top cover placement', () => {
  const units = placeCover(room, 'prison', exists, { marginCells: 2 })
  const cov = painted(units)
  const at = (x: number, y: number) => cov.has(`${x},${y}`)

  it('starts 24 px above a south wall line and ends 24 px above a north one, as stock does', () => {
    // north wall line row 2 (32 px), south wall line row 5 (80 px), column x 80
    expect(at(80, 0)).toBe(true)
    expect(at(80, 8)).toBe(false)
    expect(at(80, 48)).toBe(false)
    expect(at(80, 56)).toBe(true)
    expect(at(80, 72)).toBe(true)
  })

  it('covers half a vertical wall strip, on the mass side', () => {
    // west wall line column 0; the room's floor rows 3-4 draw at 16..48
    expect(at(0, 24)).toBe(true)
    expect(at(8, 24)).toBe(false)
    // east wall line column 9 (144 px)
    expect(at(144, 24)).toBe(false)
    expect(at(152, 24)).toBe(true)
  })

  it('paints exactly the reference region, and nothing outside it', () => {
    for (const k of cov) {
      const [x, y] = k.split(',').map(Number)
      expect(reference(room, x, y), k).toBe(true)
    }
    // inside the lattice (half a cell in from its edge) the two agree exactly
    for (let y = -48; y < 7 * 16; y += 8) {
      for (let x = -16; x < 10 * 16 + 16; x += 8) expect(at(x, y), `${x},${y}`).toBe(reference(room, x, y))
    }
  })

  it('anchors every square on the stock (8, 8) phase with sizes of 16 px and up', () => {
    for (const u of units) {
      expect(((u.x % 16) + 16) % 16).toBe(8)
      expect(((u.y % 16) + 16) % 16).toBe(8)
      expect(u.size).toBeGreaterThanOrEqual(16)
      expect(aeAssetExists(u.path)).toBe(true)
    }
  })

  it('leaves an exclusion clear, rounded out to 8 px', () => {
    const cut = painted(placeCover(room, 'prison', exists, { marginCells: 2, exclude: [{ x: 20, y: -40, w: 30, h: 20 }] }))
    for (let y = -40; y < -16; y += 8) for (let x = 16; x < 56; x += 8) expect(cut.has(`${x},${y}`)).toBe(false)
    expect(cut.has('8,-40')).toBe(true)
    expect(cut.has('56,-40')).toBe(true)
    expect(cut.has('16,-16')).toBe(true)
  })

  it('reaches past the map by the margin', () => {
    const wide = painted(placeCover(room, 'prison', exists))
    const edge = COVER_MARGIN * 16 - 16
    expect(wide.has(`${-edge},${-edge}`)).toBe(true)
    expect(wide.has(`${10 * 16 + edge - 8},${8 * 16 + edge - 48}`)).toBe(true)
  })

  it('places nothing for a set without colour pieces (the flat bonus sets)', () => {
    expect(placeCover(room, 'bonus1', exists)).toEqual([])
  })

  it('is deterministic', () => {
    expect(placeCover(room, 'prison', exists, { marginCells: 2 })).toEqual(units)
  })
})

describe('wall-top cover on generated floors', () => {
  const params = () => {
    const p = plainParameters()
    p.levels = 3
    p.themes = ['prison', 'cave_desert', 'bonus1']
    p.levelMonsters = p.levelMonsters.slice(0, 3)
    p.levelBuffs = p.levelBuffs?.slice(0, 3)
    p.levelTraps = p.levelTraps?.slice(0, 3)
    p.levelTimers = p.levelTimers?.slice(0, 3)
    return p
  }
  const levels = [...levelsOf(generateOk(params(), 7))].filter(([stem]) => /floor\d/.test(stem))
  const isCover = (path: string) => /\/__color_\d+\.unit$/.test(path)

  it('covers each coloured floor with its own set, after every id but the torches', () => {
    expect(levels.length).toBe(3)
    for (const [stem, level] of levels) {
      const cover = level.units.filter((u) => isCover(u.path))
      // stems are 0-based: floor0 prison, floor1 cave_desert, floor2 bonus1
      if (stem === 'floor2') {
        expect(cover, stem).toEqual([])
        continue
      }
      expect(cover.length, stem).toBeGreaterThan(0)
      const set = stem === 'floor0' ? 'prison' : 'cave_desert'
      for (const u of cover) {
        expect(u.path.startsWith(`doodads/walls/${set}/`), u.path).toBe(true)
        expect(aeAssetExists(u.path)).toBe(true)
      }
      // torches are optional, so they take theirs after the cover
      const others = [
        ...level.units.filter((u) => !isCover(u.path) && u.path !== TORCH_UNIT).map((u) => u.id),
        ...level.scripts.map((s) => s.id)
      ]
      const minCover = Math.min(...cover.map((u) => u.id))
      expect(Math.max(...others), stem).toBeLessThan(minCover)
      expect(new Set(cover.map((u) => u.id)).size).toBe(cover.length)
    }
  })

  it('never paints over a stair', () => {
    for (const [stem, level] of levels) {
      const cover = level.units.filter((u) => isCover(u.path))
      for (const s of level.units) {
        const art = stairArtRect({ path: s.path, x: s.x / 16, y: s.y / 16 })
        if (art === null) continue
        for (const c of cover) {
          const n = Number(/__color_(\d+)/.exec(c.path)?.[1])
          const overlaps = c.x < art.x + art.w && c.x + n > art.x && c.y - n < art.y + art.h && c.y > art.y
          expect(overlaps, `${stem} ${c.path}@${c.x},${c.y} over ${s.path}`).toBe(false)
        }
      }
    }
  })
})
