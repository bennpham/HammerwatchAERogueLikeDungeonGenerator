/**
 * The 9 spawn anchors every boss arena carries: the four cardinal wall
 * midpoints, the four corners, and the centre. Pure geometry — no RNG, no
 * context — so cover.ts's rejection filter and any test can compute the same
 * 9 points from just the arena's interior size.
 *
 * Coordinate convention matches the rest of the generator (see map/room.ts):
 * `width`/`height` are the arena's *interior* floor size in tiles, the wall
 * band sits just outside it, and (0, 0) is the interior's top-left tile. So
 * the valid interior tile range is x in [0, width - 1], y in [0, height - 1].
 *
 * The inset is NOT uniform: the north edge uses NORTH_ANCHOR_INSET, the other
 * three use ANCHOR_INSET. See NORTH_ANCHOR_INSET for why.
 */

export type AnchorId = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'C'

export interface Anchor {
  id: AnchorId
  x: number
  y: number
}

/**
 * Distance, in tiles, kept between an anchor and the interior wall edge (the
 * tiles at x/y == 0 or width/height - 1) on the west, east and south edges.
 * Chosen so a boss or a monster spawned on an anchor has room to act without
 * immediately touching the wall band, and so the S anchor sits clear of the
 * entrance mouth (see ENTRANCE_DEPTH below) rather than on top of it.
 *
 * The north edge needs more than this — see NORTH_ANCHOR_INSET.
 *
 * `geometry.ts`'s ANCHOR_CLEARANCE_AREA is derived from this constant so the
 * two files can never disagree about how much floor an anchor reserves.
 */
export const ANCHOR_INSET = 2

/**
 * The north edge's own, deeper inset, used by the N, NE and NW anchors.
 *
 * A projectile-firing monster fires from an origin above its own tile, so a
 * tower spawned at ANCHOR_INSET from the north wall shoots straight into the
 * wall band: every projectile is absorbed on spawn while players can still
 * hit the tower. The other three edges have no equivalent problem — the
 * firing origin moves *away* from a south wall and along an east/west one.
 *
 * [VERIFIED] in game (see DISCOVERY-LOG.md, 2026-08-16): on a 32x42 arena the
 * northern spawns at y = 2 were dead, and the same arena hand-patched to y = 4
 * fired cleanly. A flat constant rather than a function of the wall band's
 * thickness: the interior floor starts at y = 0 on every theme, so the
 * clearance the firing origin needs does not vary with the band.
 */
export const NORTH_ANCHOR_INSET = 4

/**
 * The south-wall entrance mouth (LevelStart + its AreaTrigger), centred on
 * the S anchor's x but hugging the south wall rather than sitting at the S
 * anchor's inset — the entrance is a doorway in the wall, the S anchor is a
 * spawn point a couple of tiles in from it. The entrance occupies interior
 * rows `[height - ENTRANCE_DEPTH, height - 1]` (hugging the wall); the S
 * anchor sits at row `height - 1 - ANCHOR_INSET`. Requiring
 * `ENTRANCE_DEPTH <= ANCHOR_INSET` keeps that row strictly above the
 * entrance's rows, so the two never share a tile.
 *
 * `geometry.ts`'s ENTRANCE_AREA is `ENTRANCE_WIDTH * ENTRANCE_DEPTH`.
 */
export const ENTRANCE_WIDTH = 3
export const ENTRANCE_DEPTH = 2

/**
 * How `anchors()` is displaced by the boss that shares the arena with it.
 *
 * Both fields are optional and independent: a `topWall` boss supplies
 * `northClearance`, a `centre` boss supplies `centreBoss`, and an arena that
 * somehow had neither gets the historical anchor layout unchanged.
 */
export interface AnchorClearance {
  /**
   * The first interior row free of a wall-mounted (`topWall`) boss's collider —
   * see bosses.ts's `topWallBossClearance`.
   */
  northClearance?: number
  /**
   * A `centre`-placed boss's collider footprint, in tiles. Only its height and
   * width matter; its position is `(midX, midY)` by construction.
   */
  centreBoss?: { width: number; height: number }
}

/**
 * The 9 spawn anchors for an arena of this interior size, inset from the wall
 * band by ANCHOR_INSET — except on the north edge, which uses the deeper
 * NORTH_ANCHOR_INSET. Order is fixed (N, S, E, W, NE, NW, SE, SW, C) so
 * callers that zip this against another fixed-order-9 list (round-robin
 * horde splitting in waves.ts) get a stable pairing.
 *
 * `clearance.northClearance`, when given, is the first interior row free of a
 * wall-mounted (`topWall`) boss's collider — see bosses.ts's
 * `topWallBossClearance`. Only the N anchor can collide with such a boss: it
 * shares the boss's midX, while NE/NW sit at ANCHOR_INSET from the side walls,
 * far outside the widest boss footprint. So only N is pushed south, and only far
 * enough to clear; it is clamped above midY so a minimum-height arena cannot
 * fold N onto C.
 *
 * Pushing N further from the north wall never conflicts with
 * NORTH_ANCHOR_INSET's own reason for existing (projectiles absorbed by the
 * wall band) — that is a lower bound, and this only ever raises it.
 *
 * `clearance.centreBoss` is the other half of the same problem, and the one the
 * 2026-08-27 playtest found the hard way: `arena.ts` puts a `centre` boss at
 * exactly `(midX, midY)`, which is exactly the C anchor, so every monster the
 * anchor rig sent to C spawned *inside* the boss — visibly so with the queen,
 * whose collider is 5.06 x 5.19 tiles. C is pushed clear along whichever axis
 * has room; see `centreAnchor` below. N/S/E/W and the corners sit at their
 * insets from the walls, far outside even the queen's footprint, so C is the
 * only anchor a centre boss can swallow.
 */
export function anchors(width: number, height: number, clearance: AnchorClearance = {}): Anchor[] {
  const left = ANCHOR_INSET
  const right = width - 1 - ANCHOR_INSET
  const top = NORTH_ANCHOR_INSET
  const bottom = height - 1 - ANCHOR_INSET
  const midX = Math.trunc(width / 2)
  const midY = Math.trunc(height / 2)

  const northMid =
    clearance.northClearance === undefined ? top : Math.min(Math.max(top, clearance.northClearance), midY)

  const centre = centreAnchor(midX, midY, right, bottom, clearance.centreBoss)

  return [
    { id: 'N', x: midX, y: northMid },
    { id: 'S', x: midX, y: bottom },
    { id: 'E', x: right, y: midY },
    { id: 'W', x: left, y: midY },
    { id: 'NE', x: right, y: top },
    { id: 'NW', x: left, y: top },
    { id: 'SE', x: right, y: bottom },
    { id: 'SW', x: left, y: bottom },
    centre
  ]
}

/**
 * Where the C anchor goes once a `centre` boss's collider is taken into account.
 *
 * With no boss C stays at `(midX, midY)`, which is where it has always been —
 * that is what every `topWall` boss's arena passes. Every `centre` boss moves
 * it, even the small ones: krilith's collider is under half a tile, but a
 * monster sharing a tile with any boss is a monster the party cannot hit, so the
 * push is at least a tile in every case rather than scaled down to nothing.
 *
 * Otherwise it moves **south** by half the footprint plus one tile — south
 * because that is the direction the party arrives from, so a monster pushed
 * there lands between the boss and the players rather than behind it. The push
 * is clamped to `bottom - 1`: `bottom` is the S anchor's own row, and two
 * anchors on one tile would hand the round-robin split a duplicate. If the arena
 * is too short for even that (C would land on or past S) the push goes **east**
 * instead, on the same half-footprint-plus-one and clamped to `right - 1` short
 * of the E anchor. An arena too small for either is already below
 * ARENA_MIN_WIDTH/HEIGHT and rejected by validation, but the final clamp still
 * leaves C somewhere legal rather than off the floor.
 */
function centreAnchor(
  midX: number,
  midY: number,
  right: number,
  bottom: number,
  boss?: { width: number; height: number }
): Anchor {
  if (!boss) return { id: 'C', x: midX, y: midY }

  const southPush = Math.ceil(boss.height / 2) + 1
  const eastPush = Math.ceil(boss.width / 2) + 1

  const southY = midY + southPush
  if (southY <= bottom - 1) return { id: 'C', x: midX, y: southY }

  const eastX = midX + eastPush
  if (eastX <= right - 1) return { id: 'C', x: eastX, y: midY }

  // Degenerate arena: take whatever room is left rather than leaving C inside
  // the boss. Never below 0, never on top of S or E.
  return { id: 'C', x: midX, y: Math.max(midY, bottom - 1) }
}
