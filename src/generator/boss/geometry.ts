/**
 * Pure arena-sizing math shared by boss validation and (once Phase 5 lands)
 * boss/cover.ts. No context, no XML, no RNG — just constants and functions of
 * width/height, so the two callers can never disagree about what "free floor"
 * means.
 */

import { largestBossFootprintArea, topWallBossY } from './bosses'
import type { BossDef } from './bosses'
import { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from './anchors'
import type { Anchor } from './anchors'

/** Arena floor needs room for the boss, the 3x3 alcove and the 9 spawn anchors. */
export const ARENA_MIN_WIDTH = 14
export const ARENA_MIN_HEIGHT = 18

/**
 * The largest of the seven boss footprints — boss_queen, whose collision
 * polygons bound to ~5.06 x 5.19 tiles (see bosses.ts's BOSS_DEFS comment for
 * how that was measured off the real actor XML). Read from bosses.ts rather
 * than hardcoded so the two files can never drift apart.
 */
const BOSS_FOOTPRINT_AREA = largestBossFootprintArea()

/** The 3x3 alcove sealed behind the wall doodads until "Boss Died". */
const ALCOVE_AREA = 3 * 3

/**
 * Clearance kept clear around each of the 9 spawn anchors (N/S/E/W/corners/
 * centre): a square whose side is anchors.ts's ANCHOR_INSET, the same margin
 * anchors() keeps between an anchor and the wall band. Sourced from
 * anchors.ts so the two files can't disagree about how much floor an anchor
 * needs.
 *
 * The three northern anchors sit deeper in (NORTH_ANCHOR_INSET) so their
 * towers can shoot past the north wall, but the clearance they reserve is
 * unchanged — this is a reserved-area budget, not a position.
 */
const ANCHOR_CLEARANCE_AREA = ANCHOR_INSET * ANCHOR_INSET
const ANCHOR_COUNT = 9

/**
 * The entrance strip at the south wall (LevelStart + its AreaTrigger), sized
 * from anchors.ts's ENTRANCE_WIDTH/ENTRANCE_DEPTH — the same rectangle
 * anchors.ts reasons about when it keeps the S anchor clear of the entrance.
 */
const ENTRANCE_AREA = ENTRANCE_WIDTH * ENTRANCE_DEPTH

/**
 * Real per-theme pillar footprint, in tiles, measured off the actual doodad
 * collision shapes in `editor/assetsExtract/doodads/` on a real Hammerwatch
 * install (verified 2026-08-11, DISCOVERY-LOG.md):
 *
 * - classic themes a,b,c,d,e,f,g,i — `<t>_special_pillar.xml`, a single
 *   `<polygon collision="true">` spanning x 0..16, y -24..16 (px). All eight
 *   are byte-identical here. 16px/tile => 1.0 wide x 2.5 tall in tiles: 1
 *   tile wide but noticeably taller than it is wide (a perspective artifact
 *   of the art, not a 2.5-tile ground footprint).
 * - theme h — `h_deco_rock.xml` (the only cover asset theme H ships),
 *   `<collision><circle offset="-1 0" radius="18"/></collision>` => a 2.25 x
 *   2.25 tile square (36px / 16).
 * - bonus1-5 — `bonusN_pillar.xml`, polygon x 0..16, y 0..16 => 1.0 x 1.0.
 *
 * cover.ts's rejection filter uses this directly, per placement, for exact
 * overlap tests against the arena's actual theme.
 */
export function pillarFootprint(theme: string): { width: number; height: number } {
  if (theme === 'h') return { width: 2.25, height: 2.25 }
  if (theme.startsWith('bonus')) return { width: 1, height: 1 }
  return { width: 1, height: 2.5 }
}

/**
 * Tiles reserved per placed cover pillar, so pillars do not crowd each other.
 * Theme-dependent, because the three pillar shapes differ by a factor of five
 * in area: a theme-averaged constant would make `density` mean something
 * different in every theme, asking for ~5x too much cover in theme h and far
 * too little in the bonus themes.
 */
function pillarFootprintArea(theme: string): number {
  const { width, height } = pillarFootprint(theme)
  return width * height
}

/**
 * Floor area actually free for cover once the boss, the 9 spawn anchors, the
 * alcove and the entrance are excluded from the interior. Floored at 0 so a
 * degenerate arena (below ARENA_MIN_WIDTH/HEIGHT) can never report a negative
 * area.
 */
export function freeFloorArea(width: number, height: number): number {
  const interior = width * height
  const reserved = BOSS_FOOTPRINT_AREA + ANCHOR_CLEARANCE_AREA * ANCHOR_COUNT + ALCOVE_AREA + ENTRANCE_AREA
  return Math.max(0, interior - reserved)
}

/**
 * How many cover pillars a density (0..1, a fraction of the free floor) resolves
 * to for an arena this size. Monotonic in density and 0 at density 0, which is
 * what Phase 5's cover.ts needs to know how many placement attempts to budget
 * before the overlap-rejection filter runs (bounded, never a `while (true)`).
 */
export function coverPillarCount(density: number, width: number, height: number, theme: string): number {
  const free = freeFloorArea(width, height)
  return Math.max(0, Math.floor((free * density) / pillarFootprintArea(theme)))
}

/**
 * Positions every boss of a multi-boss arena (issue #64, and the follow-up
 * that removed the old 4-boss ceiling). Pure and draw-free — every call
 * site's `ctx.bossRand` order is untouched by how many bosses are placed.
 *
 * One `topWall` boss (the dragon, unique — see `bosses.ts`) keeps its
 * historical spot: `(midX, topWallBossY(def))`. The centre-placed bosses are
 * headed by a PRIMARY — the queen if one was picked, else the first centre
 * boss in pick order — at exactly `(midX, midY)`, the same tile a single
 * centre boss has always used. Every other centre boss goes at a fixed,
 * draw-free offset from the primary: west, then east, then south (or north
 * when there is no `topWall` boss to occupy the north side), each spaced by
 * the sum of the two footprints' half-widths/heights plus `BOSS_LAYOUT_GAP`.
 *
 * `ARENA_LAYOUT_SLOTS` (5: topWall + primary + the three offsets) is the
 * number of DISTINCT positions this function ever computes. A centre boss
 * beyond the three offsets does not get a sixth position — it STACKS,
 * round-robin, onto the offset slot its index cycles back to (`i %
 * offsets.length`). That is deliberate, not a bug: the engine pushes
 * overlapping mobile actors apart at runtime, and the dragon/queen (the only
 * bosses that could ever collide with themselves) are unique, so a stacked
 * slot only ever holds ordinary, repeatable bosses. The mutual-overlap check
 * below reflects this — two EXTRA (offset) placements are allowed to
 * overlap each other; only a fixed placement (topWall, the primary) may
 * never overlap anything.
 *
 * Returns `null` only when the FIXED placements — topWall and/or the primary
 * centre boss — do not fit: outside the interior, overlapping the entrance,
 * or overlapping each other. `config/validation.ts` is the gate that checks
 * this for a validated parameter set, bounded by `ARENA_LAYOUT_SLOTS` rather
 * than by how many bosses were actually asked for.
 */
export const BOSS_LAYOUT_GAP = 3

/** The number of distinct boss positions this function ever computes. */
export const ARENA_LAYOUT_SLOTS = 5

export interface BossPlacement {
  def: BossDef
  x: number
  y: number
}

interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

function centredRect(x: number, y: number, width: number, height: number): LayoutRect {
  return { x: x - width / 2, y: y - height / 2, width, height }
}

/**
 * A placement's footprint rect, INCLUDING its collision shape's own vertical
 * offset (`collisionOffsetY` — only ever set for the `topWall` boss; see
 * `bosses.ts`). Omitting it here undercounts a topWall boss's true collider by
 * up to half a tile and can make a legitimate layout look like it clips a
 * nearby anchor's clearance box, when `anchors.ts`'s own
 * `topWallBossClearance` already accounts for the same offset.
 */
function placementRect(p: BossPlacement): LayoutRect {
  return centredRect(p.x, p.y + (p.def.collisionOffsetY ?? 0), p.def.footprintWidth, p.def.footprintHeight)
}

function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function arenaBossLayout(
  width: number,
  height: number,
  entrance: LayoutRect,
  anchors: readonly Anchor[],
  bosses: readonly BossDef[]
): BossPlacement[] | null {
  const midX = Math.trunc(width / 2)
  const midY = Math.trunc(height / 2)

  const topWall = bosses.find((b) => b.placement === 'topWall')
  const centreBosses = bosses.filter((b) => b.placement !== 'topWall')

  const placements: BossPlacement[] = []
  // The "fixed" placements — the topWall boss and the primary centre boss —
  // sit at spots `anchors()` has ALREADY been asked to clear (via
  // `topWallBossClearance` and `centreAnchor`'s own push), so they are
  // exempted from the anchor-clearance check below: re-checking them against
  // a flat, offset-unaware clearance box would reject layouts the real anchor
  // math already made safe (see `placementRect`'s comment). Only the EXTRA
  // (offset) bosses — the ones nothing has reasoned about yet — are checked
  // against the anchors, matching this function's own doc comment ("clear of
  // the entrance rect and anchors" applies to the fixed offsets).
  const extraPlacements: BossPlacement[] = []

  if (topWall !== undefined) {
    placements.push({ def: topWall, x: midX, y: topWallBossY(topWall) })
  }

  if (centreBosses.length > 0) {
    // Index-based, not reference-based: two picked bosses of the SAME kind
    // (e.g. two liches) are the same `BossDef` object, so filtering by
    // `!==` would drop both instead of just the primary.
    const queenIndex = centreBosses.findIndex((b) => b.id === 'boss_queen')
    const primaryIndex = queenIndex >= 0 ? queenIndex : 0
    const primary = centreBosses[primaryIndex]
    placements.push({ def: primary, x: midX, y: midY })

    const rest = centreBosses.filter((_, i) => i !== primaryIndex)
    const offsets: Array<'W' | 'E' | 'S' | 'N'> = topWall !== undefined ? ['W', 'E', 'S'] : ['W', 'E', 'N']

    // Bosses beyond the three fixed offsets cycle back and STACK onto a slot
    // already in use, rather than being rejected — see the doc comment above.
    for (let i = 0; i < rest.length; i++) {
      const other = rest[i]
      const gapX = Math.ceil(primary.footprintWidth / 2 + other.footprintWidth / 2) + BOSS_LAYOUT_GAP
      const gapY = Math.ceil(primary.footprintHeight / 2 + other.footprintHeight / 2) + BOSS_LAYOUT_GAP
      let x = midX
      let y = midY
      switch (offsets[i % offsets.length]) {
        case 'W':
          x = midX - gapX
          break
        case 'E':
          x = midX + gapX
          break
        case 'S':
          y = midY + gapY
          break
        case 'N':
          y = midY - gapY
          break
      }
      const placement = { def: other, x, y }
      placements.push(placement)
      extraPlacements.push(placement)
    }
  }

  // Bounds and entrance checks apply to every placement; anchor clearance
  // only to the extras (see above); mutual overlap to every pair.
  for (const p of placements) {
    const rect = placementRect(p)
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) return null
    if (rectsOverlap(rect, entrance)) return null
  }
  const anchorClearance = 1
  for (const p of extraPlacements) {
    const rect = placementRect(p)
    for (const a of anchors) {
      const anchorRect: LayoutRect = { x: a.x - anchorClearance, y: a.y - anchorClearance, width: anchorClearance * 2, height: anchorClearance * 2 }
      if (rectsOverlap(rect, anchorRect)) return null
    }
  }
  for (let i = 0; i < placements.length; i++) {
    const ri = placementRect(placements[i])
    for (let j = i + 1; j < placements.length; j++) {
      // Two EXTRA (offset) placements are allowed to overlap — intentional
      // stacking for bosses beyond the three fixed offsets (see the doc
      // comment above). Only a fixed placement (topWall, the primary centre
      // boss) may never overlap anything, and an extra must still clear both
      // of those.
      if (extraPlacements.includes(placements[i]) && extraPlacements.includes(placements[j])) continue
      const rj = placementRect(placements[j])
      if (rectsOverlap(ri, rj)) return null
    }
  }

  return placements
}
