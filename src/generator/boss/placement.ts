/**
 * The geometry and RNG primitives the arena's two scatter passes share:
 * `cover.ts` (pillars) and `spawnPoints.ts` (wave monsters on a non-anchor
 * spawn mode). Both offer the same four patterns — `random`, `ring`,
 * `gaussian`, `symmetric` — so the rect maths, the perimeter walk and the
 * Box-Muller draw live here rather than being written twice.
 *
 * Everything in this file is pure or draws exclusively from `ctx.bossRand`.
 * These helpers were lifted out of cover.ts unchanged: cover's draw order is
 * what every existing seed's pillar layout depends on, so nothing here may be
 * "improved" without moving arenas that already exist.
 */

import type { GenerationContext } from '../core/context'

/** Axis-aligned box in interior tile coordinates — same convention as anchors.ts. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Placement attempts per item before giving up on that one slot. Bounded per
 * invariant #3 — never a `while (true)`. 40 is generous for an interior that,
 * per validation, always has *some* free floor once the boss, anchors,
 * entrance and alcove are excluded; a slot that fails 40 random draws is
 * handled by the caller (cover skips it, spawnPoints stacks it) rather than
 * retried forever.
 */
export const PLACEMENT_ATTEMPTS = 40

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** A footprint centred on (cx, cy). */
export function footprintRect(cx: number, cy: number, footprint: { width: number; height: number }): Rect {
  return { x: cx - footprint.width / 2, y: cy - footprint.height / 2, width: footprint.width, height: footprint.height }
}

/** A point at `distance` tiles along the perimeter of `rect`, clockwise from its top-left corner. */
export function pointOnPerimeter(
  rect: { left: number; top: number; right: number; bottom: number },
  distance: number
): { x: number; y: number } {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  const perimeter = 2 * (w + h)
  if (perimeter <= 0) return { x: rect.left, y: rect.top }

  let d = ((distance % perimeter) + perimeter) % perimeter
  if (d <= w) return { x: rect.left + d, y: rect.top }
  d -= w
  if (d <= h) return { x: rect.right, y: rect.top + d }
  d -= h
  if (d <= w) return { x: rect.right - d, y: rect.bottom }
  d -= w
  return { x: rect.left, y: rect.bottom - d }
}

/**
 * Box-Muller transform over two `ctx.bossRand.fRand(0, 1)` draws. No Java
 * original to stay parallel with here (context.ts: bossRand is free to draw
 * however it likes without perturbing the layout/cosmetic streams), so this
 * does not need to reproduce java.util.Random.nextGaussian's polar method.
 */
export function nextGaussian(ctx: GenerationContext): number {
  const u1 = Math.max(ctx.bossRand.fRand(0, 1), 1e-9) // guard log(0)
  const u2 = ctx.bossRand.fRand(0, 1)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
