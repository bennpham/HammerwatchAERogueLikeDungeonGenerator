/**
 * Scatter placement for boss-wave monsters on a non-anchor spawn mode
 * (issue #21). Where `anchors` trickles a monster's budget out of the 9 fixed
 * points on a timer, a scatter mode spreads its own points across the arena —
 * so this module's job is to turn "40 bats, gaussian" into concrete interior
 * tiles.
 *
 * How many tiles is `request.points`, not `request.count`: up to the arena's
 * `spawn.batchSize` a monster still gets a point each and the whole group fires
 * at once, but a bigger count is spread over `batchSize` points and trickled in
 * by waves.ts on a timer. 480 actors materialising on one frame is what made the
 * stock Castle arena unplayable (playtest 2026-08-27).
 *
 * It is the sibling of cover.ts and deliberately mirrors it: the same four
 * pattern names, the same `ctx.bossRand`-only rule, the same bounded attempt
 * loops, and (nearly) the same rejection filter (`cover.ts`'s exported
 * `isFree`), so a spawn point can never land on the boss, the entrance, the
 * alcove, one of the 9 anchors, a cover pillar, or another spawn point. The
 * shared geometry helpers live in placement.ts.
 *
 * On top of that filter a spawn point must sit on floor the player can actually
 * reach (`cover.ts`'s `reachableMask`). The connectivity prune only guarantees
 * the boss, the anchors and the alcove stay connected — a pocket sealed off
 * behind pillars is a legal pillar layout and an illegal place for a monster.
 *
 * The one deliberate difference from cover.ts: a spawn point also has to clear
 * the north wall band (`isFreeSpawn` below). A pillar in the top rows is
 * decoration; a *monster* there is the #22 bug, and cover.ts has no reason to
 * care.
 *
 * Two things it does that cover.ts does not:
 *
 *   1. **The count is a promise, not a budget.** Cover skips a pillar it
 *      cannot fit; a wave's monster count is something the user typed, so when
 *      the floor runs out the leftovers land on other reachable floor, then on
 *      the points that *were* placed, and only then on the 9 anchors. See
 *      `padToCount`. The requested count is always the count that spawns.
 *   2. **It runs last.** `arena.ts` calls it after `placeCoverPillars` and
 *      `placeFood`, so every draw it makes is appended to the end of the
 *      `ctx.bossRand` stream. With no scatter monster in any wave there are no
 *      requests and therefore no draws at all, which is what keeps every arena
 *      generated before this feature byte-identical.
 */

import type { GenerationContext } from '../core/context'
import type { BossSpawnMode } from '../config/parameters'
import type { Anchor } from './anchors'
import { NORTH_ANCHOR_INSET } from './anchors'
import type { CoverArena } from './cover'
import { ANCHOR_PILLAR_CLEARANCE, isFree, rectReachable, reachableTiles } from './cover'
import type { Rect } from './placement'
import { PLACEMENT_ATTEMPTS, footprintRect, nextGaussian, pointOnPerimeter } from './placement'

/** One monster of one wave tier that wants `count` scattered spawn points. */
export interface SpawnRequest {
  /** wave tier index — 0 is the 100% tier */
  tier: number
  /** monster variant key, as it appears in `wave.monsters` */
  key: string
  mode: BossSpawnMode
  /** how many monsters to spawn, already scaled by monsterMultiplier */
  count: number
  /**
   * How many spawn *points* to place for those monsters — `min(count,
   * batchSize)`. Above the batch budget a monster no longer gets a point each:
   * it gets `points` of them, and `waves.ts` splits `count` over them on a timer
   * so the group trickles in instead of landing on one frame. See
   * `BossArenaOptions['spawn']['batchSize']`.
   */
  points: number
}

export interface SpawnPointOptions {
  /** minimum gap, in tiles, between two scattered points */
  spacing: number
  /** minimum gap between adjacent points on the `ring` mode */
  ringSpacing: number
  /** seeded cluster centres for the `gaussian` mode */
  clusters: number
}

export interface SpawnPoint {
  x: number
  y: number
}

/** Placed points, keyed by `spawnPointKey(tier, monsterKey)`. */
export type SpawnPointMap = Map<string, SpawnPoint[]>

/** The `SpawnPointMap` key for one monster of one tier. */
export function spawnPointKey(tier: number, monsterKey: string): string {
  return `${tier}:${monsterKey}`
}


/** The square kept clear around a scattered spawn point. */
function spawnFootprint(options: SpawnPointOptions): { width: number; height: number } {
  const size = Math.max(1, Math.trunc(options.spacing))
  return { width: size, height: size }
}

/**
 * `cover.ts`'s filter plus the north band: a scattered monster is subject to
 * exactly the same wall-band problem as a monster on an anchor (#22) — a
 * projectile fired from the top rows is absorbed by the band on spawn — so the
 * whole footprint has to sit at or below `NORTH_ANCHOR_INSET`. Every pattern
 * below goes through this rather than `isFree` directly.
 *
 * The patterns also *draw* from the legal range where they can, so the band
 * costs no placement attempts; this is the guarantee, that is the optimisation.
 */
function isFreeSpawn(
  rect: Rect,
  arena: CoverArena,
  placed: readonly Rect[],
  reachable: Uint8Array
): boolean {
  return rect.y >= NORTH_ANCHOR_INSET && isFree(rect, arena, placed) && rectReachable(rect, arena, reachable)
}

function placeRandom(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions,
  reachable: Uint8Array
): SpawnPoint[] {
  const footprint = spawnFootprint(options)
  const points: SpawnPoint[] = []

  for (let i = 0; i < target; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, arena.width)
      const y = ctx.bossRand.iRand(NORTH_ANCHOR_INSET, Math.max(NORTH_ANCHOR_INSET + 1, arena.height))
      const rect = footprintRect(x, y, footprint)
      if (isFreeSpawn(rect, arena, placed, reachable)) {
        placed.push(rect)
        points.push({ x, y })
        break
      }
    }
  }

  return points
}

function placeRing(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions,
  reachable: Uint8Array
): SpawnPoint[] {
  const points: SpawnPoint[] = []

  // Same band cover.ts's ring uses: one tile inside the spawn anchors, so the
  // ring reads as its own circle rather than sitting on the anchor points —
  // except on the north edge, where the ring is pushed down to the same band
  // the anchors keep clear (#22). The ring is no longer perfectly centred as a
  // result; a monster that can actually shoot is worth more than symmetry.
  const inset = ANCHOR_PILLAR_CLEARANCE + 2
  const bounds = {
    left: inset,
    top: Math.max(inset, NORTH_ANCHOR_INSET),
    right: arena.width - 1 - inset,
    bottom: arena.height - 1 - inset
  }
  const w = bounds.right - bounds.left
  const h = bounds.bottom - bounds.top
  if (w <= 0 || h <= 0) return points
  const perimeter = 2 * (w + h)

  // ringSpacing is a minimum gap between neighbours on the ring, so it caps
  // how many distinct points the ring can hold. Anything past that is left to
  // the caller's stacking pass rather than crammed in.
  const ringSpacing = Math.max(1, Math.trunc(options.ringSpacing))
  const count = Math.max(0, Math.min(target, Math.floor(perimeter / ringSpacing)))
  if (count === 0) return points

  const footprint = spawnFootprint(options)
  const step = perimeter / count
  const rotation = ctx.bossRand.iRand(0, Math.max(1, Math.round(perimeter)))

  for (let i = 0; i < count; i++) {
    const base = rotation + i * step
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const jitter = attempt === 0 ? 0 : ctx.bossRand.iRand(-ringSpacing, ringSpacing + 1)
      const point = pointOnPerimeter(bounds, base + jitter)
      const x = Math.round(point.x)
      const y = Math.round(point.y)
      const rect = footprintRect(x, y, footprint)
      if (isFreeSpawn(rect, arena, placed, reachable)) {
        placed.push(rect)
        points.push({ x, y })
        break
      }
    }
  }

  return points
}

function placeGaussian(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions,
  reachable: Uint8Array
): SpawnPoint[] {
  const points: SpawnPoint[] = []
  if (target <= 0) return points

  const footprint = spawnFootprint(options)
  const clusters = Math.max(1, Math.trunc(options.clusters))
  // Same spread rule as cover's gaussian: proportional to the smaller axis, so
  // a cluster reads as a pocket on any arena size.
  const sigma = Math.max(1, Math.min(arena.width, arena.height) / 8)
  const margin = 2
  // A cluster centred in the north band would throw most of its members at
  // tiles isFreeSpawn rejects, so the centre itself starts below the band. The
  // Box-Muller offsets can still stray north from a legal centre; those land
  // on the filter.
  const northMargin = Math.max(margin, NORTH_ANCHOR_INSET)

  const perCluster = Math.trunc(target / clusters)
  const remainder = target - perCluster * clusters

  for (let c = 0; c < clusters; c++) {
    const centreX = ctx.bossRand.iRand(margin, Math.max(margin + 1, arena.width - margin))
    const centreY = ctx.bossRand.iRand(northMargin, Math.max(northMargin + 1, arena.height - margin))
    const countThisCluster = perCluster + (c < remainder ? 1 : 0)

    for (let i = 0; i < countThisCluster; i++) {
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const x = Math.round(centreX + nextGaussian(ctx) * sigma)
        const y = Math.round(centreY + nextGaussian(ctx) * sigma)
        const rect = footprintRect(x, y, footprint)
        if (isFreeSpawn(rect, arena, placed, reachable)) {
          placed.push(rect)
          points.push({ x, y })
          break
        }
      }
    }
  }

  return points
}

function placeSymmetric(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions,
  reachable: Uint8Array
): SpawnPoint[] {
  const points: SpawnPoint[] = []
  if (target <= 0) return points

  const footprint = spawnFootprint(options)
  const halfWidth = Math.max(1, Math.trunc(arena.width / 2))
  const halfHeight = Math.max(1, Math.trunc(arena.height / 2))
  // Four mirrors per group, so this many groups covers the request. A group
  // that lands on a mirror line yields fewer than four points; the shortfall
  // is left to the caller's stacking pass rather than chased with extra groups.
  const groups = Math.ceil(target / 4)

  for (let g = 0; g < groups; g++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, halfWidth)
      // North half only down to the band (#22); the southern mirror of a legal
      // y is `height - 1 - y`, which is in the bottom half and never affected.
      const y = ctx.bossRand.iRand(NORTH_ANCHOR_INSET, Math.max(NORTH_ANCHOR_INSET + 1, halfHeight))
      const mirrorX = arena.width - 1 - x
      const mirrorY = arena.height - 1 - y

      // Dedupe points that land exactly on a mirror line, so a centred arena
      // dimension does not emit two spawns on the same tile.
      const candidates = Array.from(
        new Map([
          [`${x},${y}`, { x, y }],
          [`${mirrorX},${y}`, { x: mirrorX, y }],
          [`${x},${mirrorY}`, { x, y: mirrorY }],
          [`${mirrorX},${mirrorY}`, { x: mirrorX, y: mirrorY }]
        ]).values()
      )

      // Unlike cover's pillars, a spawn group is not atomic: a mirror that
      // happens to land on the boss or a pillar just does not get a point,
      // which keeps a symmetric scatter usable on an arena whose boss sits on
      // the centre line.
      let anyPlaced = false
      for (const candidate of candidates) {
        const rect = footprintRect(candidate.x, candidate.y, footprint)
        if (!isFreeSpawn(rect, arena, placed, reachable)) continue
        placed.push(rect)
        points.push(candidate)
        anyPlaced = true
      }
      if (anyPlaced) break
    }
  }

  return points.slice(0, target)
}

/**
 * Pads `points` up to `count` when a pattern could not place them all.
 *
 * The count is a promise, not a budget — cover skips a pillar it cannot fit, but
 * a wave's monster count is something the user typed, so the shortfall has to go
 * somewhere. In preference order:
 *
 *   1. **Real, reachable floor** the pattern did not use, strided so the pad
 *    points spread across the arena instead of bunching into one corner.
 *    Deterministic (row-major order, fixed stride) — no `ctx.bossRand` draw, so
 *    padding never moves the stream.
 *   2. **The points already placed**, round-robin — two monsters on one tile is
 *    a far smaller problem than a horde silently shrinking.
 *   3. **The 9 spawn anchors**, the historical fallback, for a pathological
 *    arena with no reachable floor left at all.
 *
 * Order 1 before 2 is the fix for the 2026-08-27 playtest report that `random`
 * "only places things on the corners and NWES": the old version went straight to
 * the anchors whenever a pattern placed *nothing*, and a saturated arena made
 * that the common case rather than the pathological one. The anchors are still
 * the last resort, so the guarantee that a count always spawns is unchanged.
 *
 * No north-band check is needed on any source: `anchors()` puts N/NE/NW at
 * `NORTH_ANCHOR_INSET` or deeper, the placed points cleared the band already,
 * and the reachable-tile source is filtered for it below.
 */
function padToCount(
  points: SpawnPoint[],
  count: number,
  spare: readonly SpawnPoint[],
  anchorList: readonly Anchor[]
): SpawnPoint[] {
  if (points.length >= count) return points.slice(0, count)

  const padded = [...points]
  const shortfall = count - padded.length

  if (spare.length > 0) {
    // Stride so `shortfall` picks span the whole list rather than its first
    // `shortfall` entries, which row-major order would put in one band.
    const stride = Math.max(1, Math.floor(spare.length / shortfall))
    for (let i = 0; i < shortfall; i++) padded.push({ ...spare[(i * stride) % spare.length] })
    return padded
  }

  const source = points.length > 0 ? points : anchorList.map((a) => ({ x: a.x, y: a.y }))
  if (source.length === 0) return points

  for (let i = padded.length; i < count; i++) padded.push({ ...source[i % source.length] })
  return padded
}

/**
 * The reachable tiles no placed rect covers, clear of the north band — the pad
 * source above. Pure and deterministic; built once per tier, from that tier's
 * own `placed` list.
 */
function spareTiles(arena: CoverArena, reachable: Uint8Array, placed: readonly Rect[]): SpawnPoint[] {
  return reachableTiles(arena, reachable).filter(
    (t) => t.y >= NORTH_ANCHOR_INSET && isFree({ x: t.x, y: t.y, width: 1, height: 1 }, arena, placed)
  )
}

/**
 * Place every request's spawn points, in the order given. The draw order is
 * exactly the request order, which `scatterRequests` fixes as tier order then
 * `wave.monsters` order.
 *
 * `placed` starts from the cover pillars and accumulates **within a tier**, so
 * two monsters of the same tier never share a tile, and is reset back to the
 * pillars when the tier changes. It used to accumulate across all five tiers,
 * which was wrong on its own terms — the tiers fire at different points in the
 * fight, so tier 0's points have no claim on tier 2's floor — and in practice
 * saturated the arena by the third tier, at which point every pattern placed
 * nothing and the whole horde fell back onto the 9 anchors (playtest
 * 2026-08-27). Requests are grouped by tier by construction, so the reset is a
 * simple compare against the previous request's tier.
 *
 * `reachable` is `cover.ts`'s post-prune reachability mask: a point must sit on
 * floor a player can actually walk to, not merely on floor nothing else claimed.
 *
 * Returns an empty map, having drawn nothing, when no request is scattered.
 */
export function placeSpawnPoints(
  ctx: GenerationContext,
  arena: CoverArena,
  pillarRects: readonly Rect[],
  requests: readonly SpawnRequest[],
  options: SpawnPointOptions,
  anchorList: readonly Anchor[],
  reachable: Uint8Array
): SpawnPointMap {
  const result: SpawnPointMap = new Map()
  if (requests.length === 0) return result

  let placed: Rect[] = [...pillarRects]
  let currentTier = requests[0].tier

  for (const request of requests) {
    if (request.tier !== currentTier) {
      currentTier = request.tier
      placed = [...pillarRects]
    }
    if (request.points <= 0) continue
    const total = request.points

    let points = runPattern(ctx, arena, placed, total, options, reachable, request.mode)
    if (points === null) continue // 'anchors' — waves.ts wires these to the anchor rig

    // A crowded tier can leave a request short of its points even though there
    // is floor left: `spacing` reserves a square per point, and 40 draws is not
    // many once most squares are taken. Retry the shortfall at spacing 1 before
    // giving up on placement and handing the rest to padToCount — a point one
    // tile from its neighbour is still a real, reachable, distinct tile.
    if (points.length < total && Math.trunc(options.spacing) > 1) {
      const tight = { ...options, spacing: 1 }
      const more = runPattern(ctx, arena, placed, total - points.length, tight, reachable, request.mode)
      if (more) points = [...points, ...more]
    }

    result.set(
      spawnPointKey(request.tier, request.key),
      padToCount(points, total, points.length < total ? spareTiles(arena, reachable, placed) : [], anchorList)
    )
  }

  return result
}

/**
 * Dispatch to the pattern named by `mode`, or `null` for `anchors` — which is
 * not a scatter mode at all. Split out so `placeSpawnPoints` can run a pattern
 * twice (the spacing retry above) without duplicating the switch.
 */
function runPattern(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions,
  reachable: Uint8Array,
  mode: BossSpawnMode
): SpawnPoint[] | null {
  switch (mode) {
    case 'random':
      return placeRandom(ctx, arena, placed, target, options, reachable)
    case 'ring':
      return placeRing(ctx, arena, placed, target, options, reachable)
    case 'gaussian':
      return placeGaussian(ctx, arena, placed, target, options, reachable)
    case 'symmetric':
      return placeSymmetric(ctx, arena, placed, target, options, reachable)
    case 'anchors':
      return null
  }
}
