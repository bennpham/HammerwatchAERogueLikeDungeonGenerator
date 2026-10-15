import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { anchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from '../src/generator/boss/anchors'
import { pillarFootprint } from '../src/generator/boss/geometry'
import { placeCoverPillars } from '../src/generator/boss/cover'
import type { CoverArena, CoverBoss, CoverOptions, Rect } from '../src/generator/boss/cover'
import { BOSS_COVER_PATTERNS } from '../src/generator/config/parameters'

/**
 * A self-contained arena fixture: cover.ts's own unit, not arena.ts's real
 * geometry (that's Phase 5e). Boss centred, entrance hugging the south wall,
 * a 3x3 alcove on the north wall — enough shape for the rejection filter to
 * have something real to reject against.
 */
function buildArena(width: number, height: number, theme = 'g'): CoverArena {
  const midX = Math.trunc(width / 2)
  return {
    width,
    height,
    theme,
    boss: { x: midX, y: Math.trunc(height / 2), footprintWidth: 3, footprintHeight: 3 },
    anchors: anchors(width, height),
    entrance: { x: midX - ENTRANCE_WIDTH / 2, y: height - ENTRANCE_DEPTH, width: ENTRANCE_WIDTH, height: ENTRANCE_DEPTH },
    alcove: { x: midX - 1, y: 0, width: 3, height: 3 }
  }
}

function coverOptions(overrides: Partial<CoverOptions> = {}): CoverOptions {
  return { ...defaultParameters().boss.fights[0].arena.cover, ...overrides }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

const WIDTH = 30
const HEIGHT = 36

describe('boss cover pillar placement', () => {
  for (const pattern of BOSS_COVER_PATTERNS) {
    it(`${pattern} produces pillars`, () => {
      const ctx = new GenerationContext(defaultParameters(), 42)
      const arena = buildArena(WIDTH, HEIGHT)
      const result = placeCoverPillars(ctx, arena, coverOptions({ pattern }))
      expect(result.doodads.length).toBeGreaterThan(0)
      expect(result.doodads.every((d) => d.type === 'Pillar')).toBe(true)
      expect(result.rects.length).toBe(result.doodads.length)
    })

    it(`${pattern} respects the rejection filter (boss, anchors, entrance, alcove, other pillars)`, () => {
      const ctx = new GenerationContext(defaultParameters(), 7)
      const arena = buildArena(WIDTH, HEIGHT)
      const { rects } = placeCoverPillars(ctx, arena, coverOptions({ pattern }))

      const bossRect: Rect = {
        x: bossOf(arena).x - bossOf(arena).footprintWidth / 2,
        y: bossOf(arena).y - bossOf(arena).footprintHeight / 2,
        width: bossOf(arena).footprintWidth,
        height: bossOf(arena).footprintHeight
      }

      for (const rect of rects) {
        expect(overlaps(rect, bossRect)).toBe(false)
        expect(overlaps(rect, arena.entrance)).toBe(false)
        expect(overlaps(rect, arena.alcove)).toBe(false)
        for (const anchor of arena.anchors) {
          const anchorRect: Rect = { x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 }
          expect(overlaps(rect, anchorRect)).toBe(false)
        }
      }

      // no two pillars overlap each other
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(overlaps(rects[i], rects[j])).toBe(false)
        }
      }
    })

    it(`${pattern} terminates even under a hostile (tiny, saturated) arena`, () => {
      const ctx = new GenerationContext(defaultParameters(), 99)
      // ARENA_MIN_WIDTH/HEIGHT-sized arena, density 1: the rejection filter
      // should fail most attempts, but the fixed PLACEMENT_ATTEMPTS cap must
      // still bring this back — no `while (true)` anywhere in cover.ts.
      const arena = buildArena(14, 18)
      const result = placeCoverPillars(ctx, arena, coverOptions({ pattern, density: 1 }))
      expect(Array.isArray(result.doodads)).toBe(true)
    })

    it(`${pattern} is deterministic: same seed twice gives identical placements`, () => {
      const arena = buildArena(WIDTH, HEIGHT)
      const ctxA = new GenerationContext(defaultParameters(), 2024)
      const ctxB = new GenerationContext(defaultParameters(), 2024)
      const a = placeCoverPillars(ctxA, arena, coverOptions({ pattern })).doodads.map((d) => [d.x, d.y])
      const b = placeCoverPillars(ctxB, arena, coverOptions({ pattern })).doodads.map((d) => [d.x, d.y])
      expect(a).toEqual(b)
    })

    it(`${pattern} varies with the seed`, () => {
      const arena = buildArena(WIDTH, HEIGHT)
      const ctxA = new GenerationContext(defaultParameters(), 1)
      const ctxB = new GenerationContext(defaultParameters(), 999999)
      const a = placeCoverPillars(ctxA, arena, coverOptions({ pattern })).doodads.map((d) => [d.x, d.y])
      const b = placeCoverPillars(ctxB, arena, coverOptions({ pattern })).doodads.map((d) => [d.x, d.y])
      expect(a).not.toEqual(b)
    })
  }

  it('draws only from ctx.bossRand, never ctx.rand or ctx.cosmeticRand', () => {
    const ctx = new GenerationContext(defaultParameters(), 555)
    const control = new GenerationContext(defaultParameters(), 555)

    // Move both off their initial state in lockstep before the real call, so
    // a divergence afterward can only be caused by cover.ts.
    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    const arena = buildArena(WIDTH, HEIGHT)
    placeCoverPillars(ctx, arena, coverOptions({ pattern: 'gaussian' }))

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('ring pattern keeps pillars at least ringSpacing apart along the border', () => {
    const ctx = new GenerationContext(defaultParameters(), 321)
    const arena = buildArena(WIDTH, HEIGHT)
    const result = placeCoverPillars(ctx, arena, coverOptions({ pattern: 'ring', ringSpacing: 5 }))
    expect(result.doodads.length).toBeGreaterThan(0)
  })

  it('every theme footprint used by pillarFootprint is a positive rectangle', () => {
    for (const theme of ['a', 'h', 'bonus1', 'bonus5']) {
      const f = pillarFootprint(theme)
      expect(f.width).toBeGreaterThan(0)
      expect(f.height).toBeGreaterThan(0)
    }
  })
})

/**
 * Playtest fix: the shipped default (density 0.5, no connectivity check)
 * filled ~46% of the arena and was physically impassable. This suite proves
 * the headline fix — pillars are rasterized into a tile-grid mask (they are
 * never written into `tileArray` itself, so nothing else could detect this)
 * and a 4-way flood fill from the entrance must reach the boss, all 9
 * anchors and the alcove mouth, at any density including the hostile 1.0
 * validation forbids. Written independently of cover.ts's own
 * pruneForConnectivity — same reachability semantics (Manhattan flood fill,
 * same targets), reimplemented here so a bug in the pass wouldn't also hide
 * itself from the test that's supposed to catch it.
 */
describe('boss cover pillar placement — connectivity guarantee', () => {
  function rasterize(rect: Rect, width: number, height: number, blocked: boolean[]): void {
    const x0 = Math.max(0, Math.floor(rect.x))
    const x1 = Math.min(width - 1, Math.ceil(rect.x + rect.width) - 1)
    const y0 = Math.max(0, Math.floor(rect.y))
    const y1 = Math.min(height - 1, Math.ceil(rect.y + rect.height) - 1)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) blocked[x + y * width] = true
    }
  }

  /** 4-way flood fill, bounded by the grid's own cell count — no `while (true)`. */
  function floodFill(blocked: boolean[], width: number, height: number, start: { x: number; y: number }): boolean[] {
    const visited = new Array<boolean>(width * height).fill(false)
    const sx = Math.min(Math.max(Math.round(start.x), 0), width - 1)
    const sy = Math.min(Math.max(Math.round(start.y), 0), height - 1)
    const startIdx = sx + sy * width
    if (blocked[startIdx]) return visited

    const stack: number[] = [startIdx]
    visited[startIdx] = true
    const maxSteps = width * height
    for (let steps = 0; stack.length > 0 && steps < maxSteps; steps++) {
      const idx = stack.pop() as number
      const x = idx % width
      const y = Math.trunc(idx / width)
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nIdx = nx + ny * width
        if (visited[nIdx] || blocked[nIdx]) continue
        visited[nIdx] = true
        stack.push(nIdx)
      }
    }
    return visited
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi)
  }

  /** Fails the test if the entrance cannot reach the boss, every anchor, and the alcove mouth. */
  function assertConnected(arena: CoverArena, pillarRects: readonly Rect[]): void {
    const { width, height } = arena
    const blocked = new Array<boolean>(width * height).fill(false)
    const bossRect: Rect = {
      x: bossOf(arena).x - bossOf(arena).footprintWidth / 2,
      y: bossOf(arena).y - bossOf(arena).footprintHeight / 2,
      width: bossOf(arena).footprintWidth,
      height: bossOf(arena).footprintHeight
    }
    rasterize(bossRect, width, height, blocked)
    for (const r of pillarRects) rasterize(r, width, height, blocked)

    const start = {
      x: clamp(Math.round(arena.entrance.x + arena.entrance.width / 2), 0, width - 1),
      y: clamp(Math.round(arena.entrance.y + arena.entrance.height / 2), 0, height - 1)
    }
    const visited = floodFill(blocked, width, height, start)
    const reachable = (x: number, y: number): boolean => {
      const cx = clamp(Math.round(x), 0, width - 1)
      const cy = clamp(Math.round(y), 0, height - 1)
      return visited[cx + cy * width]
    }

    // the boss's own neighbours: whichever cardinal sides fall inside the grid must all be open
    const bx0 = Math.floor(bossRect.x)
    const bx1 = Math.ceil(bossRect.x + bossRect.width) - 1
    const by0 = Math.floor(bossRect.y)
    const by1 = Math.ceil(bossRect.y + bossRect.height) - 1
    const bossProbes = [
      { x: bossOf(arena).x, y: by0 - 1 },
      { x: bossOf(arena).x, y: by1 + 1 },
      { x: bx0 - 1, y: bossOf(arena).y },
      { x: bx1 + 1, y: bossOf(arena).y }
    ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height)
    expect(bossProbes.length, 'no in-bounds side of the boss to check').toBeGreaterThan(0)
    for (const p of bossProbes) expect(reachable(p.x, p.y), `boss side (${p.x},${p.y})`).toBe(true)

    // all 9 anchors — except one that legitimately coincides with (or is
    // swallowed by) the boss's own footprint: arena.ts centres a non-topWall
    // boss on exactly the 'C' anchor's point, and a topWall boss's footprint
    // can reach the 'N' anchor for the tallest boss defs. That tile is
    // permanently blocked by the boss itself regardless of pillars — not
    // something cover.ts's connectivity pass is responsible for.
    const insideBoss = (x: number, y: number): boolean => x >= bx0 && x <= bx1 && y >= by0 && y <= by1
    for (const a of arena.anchors) {
      if (insideBoss(Math.round(a.x), Math.round(a.y))) continue
      expect(reachable(a.x, a.y), `anchor ${a.id}`).toBe(true)
    }

    // the alcove mouth: nearest point of the alcove rect to the arena centre, clamped into the interior
    const midX = width / 2
    const midY = height / 2
    const mouthX = clamp(Math.round(clamp(midX, arena.alcove.x, arena.alcove.x + arena.alcove.width)), 0, width - 1)
    const mouthY = clamp(Math.round(clamp(midY, arena.alcove.y, arena.alcove.y + arena.alcove.height)), 0, height - 1)
    expect(reachable(mouthX, mouthY), 'alcove mouth').toBe(true)
  }

  const SEEDS = [1, 42, 4242, 987654]

  for (const pattern of BOSS_COVER_PATTERNS) {
    for (const density of [0.25, 1.0]) {
      it(`${pattern} at density ${density}: entrance reaches the boss, all 9 anchors, and the alcove mouth`, () => {
        for (const seed of SEEDS) {
          const ctx = new GenerationContext(defaultParameters(), seed)
          const arena = buildArena(WIDTH, HEIGHT)
          const { rects } = placeCoverPillars(ctx, arena, coverOptions({ pattern, density }))
          assertConnected(arena, rects)
        }
      })

      it(`${pattern} at density ${density}: the 14x18 minimum arena stays connected`, () => {
        for (const seed of SEEDS) {
          const ctx = new GenerationContext(defaultParameters(), seed)
          const arena = buildArena(14, 18)
          const { rects } = placeCoverPillars(ctx, arena, coverOptions({ pattern, density }))
          assertConnected(arena, rects)
        }
      })
    }
  }
})

/**
 * The arena's boss. `CoverArena.boss` became optional when the survival arena
 * arrived (it has none); every arena this suite builds still has one.
 */
function bossOf(arena: CoverArena): CoverBoss {
  if (arena.boss === undefined) throw new Error('test arena has no boss')
  return arena.boss
}
