import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { BOSS_SPAWN_MODES } from '../src/generator/config/parameters'
import { anchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH, NORTH_ANCHOR_INSET } from '../src/generator/boss/anchors'
import { placeSpawnPoints, spawnPointKey } from '../src/generator/boss/spawnPoints'
import type { SpawnPointOptions, SpawnRequest } from '../src/generator/boss/spawnPoints'
import { reachableMask } from '../src/generator/boss/cover'
import type { CoverArena, CoverBoss, Rect } from '../src/generator/boss/cover'

/** The same self-contained fixture boss0Cover.test.ts uses — cover.ts's unit shape, not arena.ts's real geometry. */
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

function options(overrides: Partial<SpawnPointOptions> = {}): SpawnPointOptions {
  return { ...defaultParameters().boss.fights[0].arena.spawn, ...overrides }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

const WIDTH = 30
const HEIGHT = 36
const SCATTER_MODES = BOSS_SPAWN_MODES.filter((m) => m !== 'anchors')

/**
 * A request that wants one point per monster — the shape every case below used
 * before batching existed, and still the shape of any entry inside the arena's
 * `spawn.batchSize`. The batched shape (`points` < `count`) gets its own
 * describe block at the bottom.
 */
function req(r: Omit<SpawnRequest, 'points'>): SpawnRequest {
  return { ...r, points: r.count }
}

function place(requests: SpawnRequest[], seed = 42, pillars: Rect[] = [], opts = options(), width = WIDTH, height = HEIGHT) {
  const ctx = new GenerationContext(defaultParameters(), seed)
  const arena = buildArena(width, height)
  const map = placeSpawnPoints(ctx, arena, pillars, requests, opts, arena.anchors, reachableMask(arena, pillars))
  return { ctx, arena, map }
}

describe('boss scatter spawn points', () => {
  for (const mode of SCATTER_MODES) {
    it(`${mode} places exactly the requested count`, () => {
      const { map } = place([req({ tier: 0, key: 'bat1', mode, count: 12 })])
      expect(map.get(spawnPointKey(0, 'bat1'))).toHaveLength(12)
    })

    it(`${mode} keeps every point inside the interior`, () => {
      const { arena, map } = place([req({ tier: 1, key: 'bat1', mode, count: 20 })])
      for (const point of map.get(spawnPointKey(1, 'bat1'))!) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThan(arena.width)
        expect(point.y).toBeLessThan(arena.height)
      }
    })

    it(`${mode} never places a point in the north wall band`, () => {
      // Same reason the N/NE/NW anchors sit at NORTH_ANCHOR_INSET (#22): a
      // projectile monster in the top rows fires straight into the wall band
      // and every shot is absorbed on spawn. Padded duplicates are included
      // deliberately — a stacked point is a real spawn too.
      for (const seed of [1, 42, 777, 20260817]) {
        const { map } = place([req({ tier: 0, key: 'bat1', mode, count: 60 })], seed)
        for (const point of map.get(spawnPointKey(0, 'bat1'))!) {
          expect(point.y).toBeGreaterThanOrEqual(NORTH_ANCHOR_INSET)
        }
      }
    })

    it(`${mode} still returns the full count on an arena the north band eats into`, () => {
      // A short arena loses a bigger fraction of its floor to the band, which
      // is exactly where a band that silently shrank a horde would show up.
      const { map } = place([req({ tier: 0, key: 'bat1', mode, count: 30 })], 7, [], options(), 16, 20)
      const points = map.get(spawnPointKey(0, 'bat1'))!
      expect(points).toHaveLength(30)
      for (const point of points) {
        expect(point.y).toBeGreaterThanOrEqual(NORTH_ANCHOR_INSET)
      }
    })

    it(`${mode} never places a point on the boss, the entrance, the alcove or an anchor`, () => {
      const { arena, map } = place([req({ tier: 0, key: 'bat1', mode, count: 20 })])
      const spacing = options().spacing
      const bossRect: Rect = {
        x: bossOf(arena).x - bossOf(arena).footprintWidth / 2,
        y: bossOf(arena).y - bossOf(arena).footprintHeight / 2,
        width: bossOf(arena).footprintWidth,
        height: bossOf(arena).footprintHeight
      }

      // A padded duplicate sits on an already-valid point, so dedupe before
      // checking — the rejection filter's promise is about the placed points.
      const distinct = new Map(map.get(spawnPointKey(0, 'bat1'))!.map((p) => [`${p.x},${p.y}`, p])).values()
      for (const point of distinct) {
        const rect: Rect = { x: point.x - spacing / 2, y: point.y - spacing / 2, width: spacing, height: spacing }
        expect(overlaps(rect, bossRect)).toBe(false)
        expect(overlaps(rect, arena.entrance)).toBe(false)
        expect(overlaps(rect, arena.alcove)).toBe(false)
        for (const anchor of arena.anchors) {
          expect(overlaps(rect, { x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 })).toBe(false)
        }
      }
    })

    it(`${mode} never places a point inside a cover pillar`, () => {
      const pillars: Rect[] = [
        { x: 4, y: 8, width: 2, height: 2 },
        { x: 20, y: 20, width: 2, height: 2 },
        { x: 10, y: 28, width: 2, height: 2 }
      ]
      const { map } = place([req({ tier: 0, key: 'bat1', mode, count: 25 })], 3, pillars)
      const spacing = options().spacing
      const distinct = new Map(map.get(spawnPointKey(0, 'bat1'))!.map((p) => [`${p.x},${p.y}`, p])).values()
      for (const point of distinct) {
        const rect: Rect = { x: point.x - spacing / 2, y: point.y - spacing / 2, width: spacing, height: spacing }
        for (const pillar of pillars) {
          expect(overlaps(rect, pillar)).toBe(false)
        }
      }
    })

    it(`${mode} is deterministic for a seed and moves with the seed`, () => {
      const request: SpawnRequest[] = [req({ tier: 0, key: 'bat1', mode, count: 15 })]
      const a = place(request, 99).map.get(spawnPointKey(0, 'bat1'))
      const b = place(request, 99).map.get(spawnPointKey(0, 'bat1'))
      const c = place(request, 100).map.get(spawnPointKey(0, 'bat1'))
      expect(a).toEqual(b)
      expect(a).not.toEqual(c)
    })
  }

  it('gives two monsters of the same tier distinct points', () => {
    const { map } = place([
      req({ tier: 0, key: 'bat1', mode: 'random', count: 8 }),
      req({ tier: 0, key: 'tick1', mode: 'random', count: 8 })
    ])
    const bats = map.get(spawnPointKey(0, 'bat1'))!.map((p) => `${p.x},${p.y}`)
    const ticks = map.get(spawnPointKey(0, 'tick1'))!.map((p) => `${p.x},${p.y}`)
    expect(new Set(bats).size).toBe(8)
    expect(bats.some((b) => ticks.includes(b))).toBe(false)
  })

  it('still returns the full count on an arena too cramped to fit it', () => {
    // Wide spacing on a small arena: the pattern runs out of floor long before
    // the count is met, and the shortfall lands on spare reachable tiles.
    const { arena, map } = place(
      [req({ tier: 0, key: 'bat1', mode: 'random', count: 40 })],
      5,
      [],
      options({ spacing: 6 }),
      22,
      26
    )
    const points = map.get(spawnPointKey(0, 'bat1'))!
    expect(points).toHaveLength(40)
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThan(arena.width)
      expect(point.y).toBeGreaterThanOrEqual(NORTH_ANCHOR_INSET)
      expect(point.y).toBeLessThan(arena.height)
    }
  })

  // The 2026-08-27 playtest report: "random seems to only place things on the
  // corners and NWES rather than find an actual suitable walkable path". The
  // cause was padToCount going straight to the 9 anchors whenever a pattern
  // placed nothing, on an arena the accumulated `placed` list had saturated.
  it('pads onto real spare floor, not the 9 anchors, when a pattern places nothing', () => {
    // ringSpacing far past the ring's own perimeter leaves it no room for a
    // single point — the case that used to go straight to the anchors.
    const { arena, map } = place([req({ tier: 0, key: 'bat1', mode: 'ring', count: 5 })], 11, [], options({ ringSpacing: 500 }))
    const points = map.get(spawnPointKey(0, 'bat1'))!
    expect(points).toHaveLength(5)
    const anchorKeys = new Set(arena.anchors.map((a) => `${a.x},${a.y}`))
    expect(points.every((p) => anchorKeys.has(`${p.x},${p.y}`))).toBe(false)
    // and they are spread, not all one tile
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(1)
  })

  it('does not let one tier eat the next tier\'s floor', () => {
    // The old placed list ran across every tier, so a big tier 0 left tier 2
    // with nothing placeable. Tiers fire at different points in the fight;
    // sharing the floor between them was never right.
    const big = 200
    const { arena, map } = place([
      req({ tier: 0, key: 'bat1', mode: 'random', count: big }),
      req({ tier: 2, key: 'eye', mode: 'random', count: 20 })
    ])
    const late = map.get(spawnPointKey(2, 'eye'))!
    expect(late).toHaveLength(20)
    const anchorKeys = new Set(arena.anchors.map((a) => `${a.x},${a.y}`))
    expect(late.every((p) => anchorKeys.has(`${p.x},${p.y}`))).toBe(false)
    // the late tier gets genuinely distinct tiles, not a stack
    expect(new Set(late.map((p) => `${p.x},${p.y}`)).size).toBe(20)
  })

  it('never places a point a player cannot walk to', () => {
    // A pillar wall sealing off the top-left corner: legal cover, illegal
    // place to leave a monster. cover.ts's connectivity prune only promises the
    // boss, the anchors and the alcove stay connected, not every tile.
    const pillars: Rect[] = []
    for (let y = 0; y <= 12; y++) pillars.push({ x: 8, y, width: 2, height: 1 })
    for (let x = 0; x <= 8; x++) pillars.push({ x, y: 12, width: 1, height: 2 })

    const { arena, map } = place([req({ tier: 0, key: 'bat1', mode: 'random', count: 60 })], 4, pillars)
    const walkable = reachableMask(arena, pillars)
    for (const point of map.get(spawnPointKey(0, 'bat1'))!) {
      expect(walkable[point.x + point.y * arena.width], `(${point.x},${point.y}) is sealed off`).toBeTruthy()
    }
  })

  it('places a huge count in full, uncapped', () => {
    const { map } = place([req({ tier: 0, key: 'bat1', mode: 'random', count: 5000 })])
    expect(map.get(spawnPointKey(0, 'bat1'))).toHaveLength(5000)
  })

  it('skips a zero count and the anchors mode entirely', () => {
    const { map } = place([
      req({ tier: 0, key: 'bat1', mode: 'random', count: 0 }),
      req({ tier: 0, key: 'tick1', mode: 'anchors', count: 10 })
    ])
    expect(map.size).toBe(0)
  })

  it('draws nothing from any RNG stream when no request is scattered', () => {
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000)),
      boss: Array.from({ length: 10 }, () => c.bossRand.iRand(0, 1000))
    })

    const { ctx } = place([])
    expect(nextTen(ctx)).toEqual(nextTen(new GenerationContext(defaultParameters(), 42)))
  })

  // Batching: `points` below `count` is a monster whose horde is spread over
  // fewer points and trickled in by waves.ts on a timer. Placement's whole job
  // there is to place `points` tiles — the count is the rig's problem.
  it('places `points` tiles for a batched request, not `count`', () => {
    const { map } = place([{ tier: 0, key: 'bat1', mode: 'random', count: 120, points: 8 }])
    const points = map.get(spawnPointKey(0, 'bat1'))!
    expect(points).toHaveLength(8)
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(8)
  })

  it('batching leaves plenty of floor for the rest of the tier', () => {
    // The point of the budget: a whole stock-sized tier now fits comfortably,
    // where one unbatched entry used to saturate the arena on its own.
    const requests: SpawnRequest[] = ['bat1', 'bat2', 'maggot', 'tick1', 'tower_flower1_small'].map((key) => ({
      tier: 0,
      key,
      mode: 'random' as const,
      count: 40,
      points: 8
    }))
    const { arena, map } = place(requests)
    const anchorKeys = new Set(arena.anchors.map((a) => `${a.x},${a.y}`))
    const all = requests.flatMap((r) => map.get(spawnPointKey(0, r.key))!)
    expect(all).toHaveLength(40)
    expect(new Set(all.map((p) => `${p.x},${p.y}`)).size).toBe(40)
    expect(all.some((p) => anchorKeys.has(`${p.x},${p.y}`))).toBe(false)
  })

  it('draws only from ctx.bossRand', () => {
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000))
    })

    const { ctx } = place([req({ tier: 0, key: 'bat1', mode: 'gaussian', count: 20 })])
    const fresh = new GenerationContext(defaultParameters(), 42)
    expect(nextTen(ctx)).toEqual(nextTen(fresh))
  })
})

/**
 * The arena's boss. `CoverArena.boss` became optional when the survival arena
 * arrived (it has none); every arena this suite builds still has one.
 */
function bossOf(arena: CoverArena): CoverBoss {
  if (arena.boss === undefined) throw new Error('test arena has no boss')
  return arena.boss
}
