import { BOSS_IDS, MOBILE_BOSS_IDS } from '../config/parameters'
import type { Rand } from '../core/rand'

/**
 * Which walls of the arena's sealed reward alcove a boss's presence rules out.
 * The alcove is always picked from N/E/W (S is the entrance) — see anchors.ts
 * for the entrance/anchor geometry this interacts with. 'S' can never appear
 * here; it is already excluded upstream by the alcove picker.
 */
export type AlcoveWall = 'N' | 'E' | 'W'

export type BossId = (typeof BOSS_IDS)[number]

export interface BossDef {
  id: BossId
  /** in-level actor path, e.g. actors/boss_queen/boss_queen.xml */
  actorPath: string
  /** footprint in tiles, derived from the actor's <collision> shape — see below */
  footprintWidth: number
  footprintHeight: number
  /**
   * The collision shape's own vertical offset, in tiles, negative = up.
   * Optional; omit it (treated as 0) for a shape centred on the actor's own
   * position. Only matters for a boss placed against a wall — see
   * `topWallBossY` and the comment block below.
   */
  collisionOffsetY?: number
  /** where the arena places this boss */
  placement: 'centre' | 'topWall'
  /**
   * Alcove walls this boss must never be assigned, expressed as data rather
   * than a special case in the (later) alcove picker. Only the dragon forbids
   * one: it sits static in the top (N) wall and would otherwise be able to
   * body-block the reward the alcove opens onto.
   */
  forbiddenAlcoveWalls: AlcoveWall[]
  /**
   * Whether this boss can chase the party around a level — what decides if it
   * may stand on a DUNGEON FLOOR (issue #61), where there is no arena to
   * confine the fight and a boss that cannot close the distance is simply
   * never fought.
   *
   * AUTHORED, not derived, because nothing in the actor files answers it.
   * `<collision static="...">` is about the collider, not about locomotion: it
   * is `true` for the worm, which burrows across the whole arena, and anubis
   * and krilith carry no `<collision>` child at all so they state nothing
   * either way. Reading `static` as "immobile" would wrongly exclude the worm
   * and wrongly include the other two.
   *
   * False for exactly the dragon (no upward-facing art, pinned to the top
   * wall) and the queen (static collider, no `movement` dict) — the two the
   * issue names. Everything else chases.
   */
  mobile: boolean
  /**
   * Whether a campaign may only ever roll ONE of this boss — issue #64 part 1.
   * True for exactly the dragon and the queen (`UNIQUE_BOSS_IDS`): both are
   * one-of-a-kind set pieces (the dragon is welded to the top wall, the queen
   * is the largest footprint by far), so a fight or a floor asking for several
   * bosses may still only ever draw one of either. Every other boss may repeat
   * — two liches guarding one arena is exactly what a dungeon master might
   * want. AUTHORED, like `mobile`: nothing in the actor files answers this,
   * it is a design call about how many of a kind belongs in one fight.
   */
  unique: boolean
}

/** `BossDef.unique` — see that field's comment. */
export const UNIQUE_BOSS_IDS: readonly BossId[] = ['boss_dragon', 'boss_queen']

/**
 * The seven end-boss actors and their real footprints.
 *
 * Footprints are measured from each actor's own `<collision>` shape in
 * `editor/assetsExtract/actors/boss_<name>/boss_<name>.xml` on a real
 * Hammerwatch install (verified 2026-08-08, `DISCOVERY-LOG.md`), converted
 * from pixels to tiles at the game's fixed 16px/tile scale:
 *
 * - anubis, krilith carry no `<collision>` child at all — the actor falls
 *   back to the radius on the `<actor collision="N">` attribute itself
 *   (anubis 7px, krilith 3.5px), so footprint = that radius doubled / 16.
 * - dragon, knight, lich, worm each have `<collision><circle radius="R" .../>`
 *   — footprint = 2R / 16 (a circle, so width == height).
 * - queen has two `<polygon>` children with no single circle; footprint is the
 *   axis-aligned bounding box of every `<point>` in both polygons, in tiles:
 *   x spans -43..38 (81px = 5.0625 tiles), y spans -33..50 (83px = 5.1875
 *   tiles). This is the largest footprint of the seven and is what
 *   `geometry.ts`'s `BOSS_FOOTPRINT_AREA` reserves against.
 *
 * `boss_dragon` has no upward-facing art (its 9-slot aim arc and every walk
 * frame face down/down-diagonal) and `<collision static="true">` — it cannot
 * move, so it goes against the top wall. `boss_queen` is also `static="true"`
 * with no `movement` dict at all, but its skill list attacks in every
 * direction, so centre is correct for it same as the movers.
 *
 * A wall-placed boss also needs its collision `offset`, not just its footprint.
 * The dragon's is `<circle offset="0 -8" radius="34" />`: the collider centre
 * sits half a tile ABOVE the actor position and reaches 2.125 tiles out, so an
 * actor flush against the top wall carries 2.625 tiles of *static* collider
 * into the wall band. [VERIFIED] in game (DISCOVERY-LOG.md, 2026-08-16): at
 * interior row 0 the dragon was unreachable, unhittable and could not fire —
 * it read as being off the map to the north. `topWallBossY` below derives the
 * shallowest row whose collider clears the band; for the dragon that is row 3,
 * which is the hand-patched arena the fix was confirmed on.
 */
const BOSS_DEFS_LIST: Omit<BossDef, 'mobile' | 'unique'>[] = [
  {
    id: 'boss_anubis',
    actorPath: 'actors/boss_anubis/boss_anubis.xml',
    // no <collision> child; falls back to the actor-tag radius, 7px -> 0.875 tile diameter
    footprintWidth: (2 * 7) / 16,
    footprintHeight: (2 * 7) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_dragon',
    actorPath: 'actors/boss_dragon/boss_dragon.xml',
    // <collision static="true"><circle offset="0 -8" radius="34" /></collision>
    footprintWidth: (2 * 34) / 16,
    footprintHeight: (2 * 34) / 16,
    // the collider sits half a tile ABOVE the actor position — the other half
    // of the geometry that decides where the top wall can hold it. See
    // `topWallBossY`.
    collisionOffsetY: -8 / 16,
    placement: 'topWall',
    // no upward-facing art + immobile: must never guard the alcove it can't defend from
    forbiddenAlcoveWalls: ['N']
  },
  {
    id: 'boss_knight',
    actorPath: 'actors/boss_knight/boss_knight.xml',
    // <collision static="false"><circle radius="10" .../></collision>
    footprintWidth: (2 * 10) / 16,
    footprintHeight: (2 * 10) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_krilith',
    actorPath: 'actors/boss_krilith/boss_krilith.xml',
    // no <collision> child; falls back to the actor-tag radius, 3.5px -> 0.4375 tile diameter
    footprintWidth: (2 * 3.5) / 16,
    footprintHeight: (2 * 3.5) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_lich',
    actorPath: 'actors/boss_lich/boss_lich.xml',
    // <collision static="false"><circle radius="8" .../></collision>
    footprintWidth: (2 * 8) / 16,
    footprintHeight: (2 * 8) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_queen',
    actorPath: 'actors/boss_queen/boss_queen.xml',
    // <collision static="true"> two <polygon> children, no movement dict;
    // bounding box of every <point>: x -43..38 (81px), y -33..50 (83px)
    footprintWidth: 81 / 16,
    footprintHeight: 83 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_worm',
    actorPath: 'actors/boss_worm/boss_worm.xml',
    // <collision static="true"><circle radius="19" .../></collision> (burrows, but immobile in the collision sense)
    footprintWidth: (2 * 19) / 16,
    footprintHeight: (2 * 19) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  }
]

/** One entry per `BOSS_IDS` id, in that order — enforced by a test. */
// `mobile` is derived from MOBILE_BOSS_IDS rather than written on each def
// above: that list lives in config/parameters.ts because this file imports
// from there and not the other way round, and one source of truth beats two
// that a test has to keep agreeing.
export const BOSS_DEFS: Readonly<Record<BossId, BossDef>> = Object.fromEntries(
  BOSS_DEFS_LIST.map((d) => [
    d.id,
    {
      ...d,
      mobile: (MOBILE_BOSS_IDS as readonly string[]).includes(d.id),
      unique: (UNIQUE_BOSS_IDS as readonly string[]).includes(d.id)
    }
  ])
) as Record<BossId, BossDef>

/** `BOSS_DEFS` as a `BOSS_IDS`-ordered array, for callers that want to iterate. */
export const BOSS_DEF_LIST: readonly BossDef[] = BOSS_IDS.map((id) => BOSS_DEFS[id])

/** The largest of the seven footprints (queen) — geometry.ts reserves against this. */
export function largestBossFootprintArea(): number {
  return Math.max(...BOSS_DEF_LIST.map((d) => d.footprintWidth * d.footprintHeight))
}

/**
 * The shallowest interior row a `topWall` boss can sit at with its whole
 * collider still on floor.
 *
 * The arena's interior starts at row 0 and the solid wall band sits above it,
 * so the collider's top edge — `y + collisionOffsetY - footprintHeight / 2` —
 * must not go negative. Solving for `y` and rounding up to a whole tile gives
 * the row below. A *static* collider overlapping the band is not a cosmetic
 * problem: the engine leaves the actor unreachable and its attacks blocked
 * (see the dragon note in the comment block above).
 *
 * Returns 0 for a `centre` boss's def as well, if anyone asks — it is a pure
 * function of the shape, and `arena.ts` only consults it for `topWall`.
 */
export function topWallBossY(def: BossDef): number {
  return Math.max(0, Math.ceil(def.footprintHeight / 2 - (def.collisionOffsetY ?? 0)))
}

/**
 * The interior row just past the bottom edge of a `topWall` boss's collider —
 * i.e. the first row a spawn anchor can use without landing inside the boss.
 * `anchors()` takes this as its `bossClearance` argument.
 */
export function topWallBossClearance(def: BossDef, bossY: number): number {
  return Math.ceil(bossY + def.footprintHeight / 2 + (def.collisionOffsetY ?? 0)) + 1
}

/** Whether `id` names a boss a dungeon floor may host — see MOBILE_BOSS_IDS. */
export function isMobileBoss(id: string): boolean {
  return (MOBILE_BOSS_IDS as readonly string[]).includes(id)
}

/**
 * Picks `count` bosses from `pool` (a subset of `BOSS_IDS`), one
 * `iRand(0, candidates.length)` draw per pick — issue #64 part 1.
 *
 * Dragon and queen are unique: once picked, that id is removed from the
 * candidate list so it can never be rolled a second time in the same fight or
 * floor. Every other boss stays in the pool and may repeat.
 *
 * `count = 1` draws exactly the single `iRand(0, pool.length)` this port has
 * always drawn for one boss — same call site inputs, same math — so a
 * single-boss fight or floor built through this function is byte-identical to
 * one built the old way. Callers with `count = 1` keep their historical code
 * path anyway (see `arena.ts`/`dungeonBoss/actor.ts`); this function exists
 * for `count > 1`, and is exercised at `count = 1` only by its own tests.
 *
 * Bounded: at most `count` draws, and the candidate list only ever shrinks, so
 * this returns after at most `count` iterations — it never spins looking for
 * a boss that cannot be drawn. A pool that runs out of unique candidates
 * before `count` is reached (e.g. a two-entry, all-unique pool asked for four
 * bosses) simply returns fewer than `count` ids; `config/validation.ts` is the
 * gate that stops such a pool from reaching generation at all.
 */
export function pickBosses(rand: Rand, pool: readonly string[], count: number): BossId[] {
  const candidates = [...pool] as BossId[]
  const picked: BossId[] = []
  for (let i = 0; i < count; i++) {
    if (candidates.length === 0) break
    const index = rand.iRand(0, candidates.length)
    const id = candidates[index]
    picked.push(id)
    if (BOSS_DEFS[id].unique) candidates.splice(index, 1)
  }
  return picked
}

/**
 * Every boss `lineup` describes, in `BOSS_IDS` order (never `Object.keys` —
 * determinism, invariant 2), each id repeated `count` times — the exact-count
 * sibling of `pickBosses` for `bossSelection: 'lineup'` (issue #64 follow-up).
 *
 * Draws NOTHING: no `ctx.bossRand`/`ctx.floorBossRand` value, unlike
 * `pickBosses`. A missing, non-integer or non-positive count contributes
 * nothing — `config/validation.ts` is the real gate for a malformed lineup,
 * this is only defensive.
 */
export function expandLineup(lineup: Partial<Record<BossId, number>> | undefined): BossId[] {
  if (lineup === undefined) return []
  const ids: BossId[] = []
  for (const id of BOSS_IDS) {
    const count = lineup[id]
    if (count === undefined || !Number.isInteger(count) || count <= 0) continue
    for (let i = 0; i < count; i++) ids.push(id)
  }
  return ids
}
