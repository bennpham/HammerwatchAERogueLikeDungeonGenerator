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
  /**
   * A stationary boss's every hittable circle, `[offsetX, offsetY, radius]` in
   * px from the actor: the union over all its scenes of the `<collision>`
   * circles a projectile stops on (any not `shoot-through="true"`), body and
   * the head sensors that move between animations. Read only by the trap rig,
   * which keeps every trap lane off all of them; a test holds the list to the
   * unit file. The dragon's head reaches 53 px below it and the frost dragon's
   * body 121 px, far past the one circle `footprint` describes.
   */
  hitCircles?: ReadonlyArray<readonly [number, number, number]>
  /** where the arena places this boss */
  placement: 'centre' | 'topWall'
  /**
   * For a `topWall` boss, tiles to move the emitted actor past the spot
   * `topWallBossY` computes (negative = up). Art only: the layout and the
   * spawn clearance keep using the collider. The dragon's art leaves a gap
   * under the wall at the collider-safe spot; the user seated it 24 px
   * higher by hand (2026-10-11, boss0_edited.lvl) and the generator follows.
   * The frost dragon likewise, 16 px (2026-10-14, 04_arena_boss3.lvl: y 32
   * against the generator's 48).
   */
  artNudgeY?: number
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
  /**
   * The boss bar title (`CreateBossBar.Name`) — the actor's own
   * `beastiary-name` key, so the bar reads exactly as in the stock campaign.
   */
  barName: string
  /**
   * The statue an `immortal` boss must lose before it can be hurt. Only the
   * wraith has one: `wraith.inc` sets `immortal` true, and in stock
   * (`hwr/boss_armory.lvl`) the statue's death fires `ToggleImmortality` off
   * on it. `boss/statue.ts` places it and wires that. `footprint` is the
   * statue's static collision rect, in tiles.
   */
  statue?: { actorPath: string; footprint: number }
}

/**
 * Bosses a campaign may only roll ONE of: the two dragons (static, welded to
 * the top wall) and the queen (static, by far the largest footprint).
 */
export const UNIQUE_BOSS_IDS: readonly BossId[] = ['boss_dragon', 'boss_dragon_hwr', 'boss_queen']

/**
 * Every AE end boss and its real footprint, measured from the actor's own
 * `<collision>` circle (scripts/dev/boss-survey.mjs, 2026-10-09) at 16 px per
 * tile: footprint = 2r / 16, collisionOffsetY = offset.y / 16.
 *
 * The two dragons are `static` with PassiveMovement and no upward-facing art,
 * so they go against the top wall; the queen is static too but attacks in
 * every direction, so she stands in the centre. The worm and the wraith are
 * `TransferDamageActor`s, which take damage themselves and only forward it
 * when a transfer target is set. The worm alone fights like any other boss;
 * the wraith is also `immortal` until its statue breaks (`statue` below).
 */
const BOSS_DEFS_LIST: Omit<BossDef, 'mobile' | 'unique'>[] = [
  { id: 'boss_anubis', actorPath: 'actors/bosses/boss_anubis/boss_anubis.unit', footprintWidth: 20 / 16, footprintHeight: 20 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.d.ig.boss_3' },
  // <circle offset="0 -32" radius="40"> static
  { id: 'boss_dragon', actorPath: 'actors/bosses/boss_dragon/boss_dragon.unit', footprintWidth: 80 / 16, footprintHeight: 80 / 16, collisionOffsetY: -32 / 16, placement: 'topWall', artNudgeY: -24 / 16, forbiddenAlcoveWalls: ['N'], barName: '.ig.boss4' },
  { id: 'boss_knight', actorPath: 'actors/bosses/boss_knight/boss_knight.unit', footprintWidth: 16 / 16, footprintHeight: 16 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.boss2' },
  { id: 'boss_krilith', actorPath: 'actors/bosses/boss_krilith/boss_krilith.unit', footprintWidth: 16 / 16, footprintHeight: 16 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.d.ig.boss_2' },
  { id: 'boss_lich', actorPath: 'actors/bosses/boss_lich/boss_lich.unit', footprintWidth: 24 / 16, footprintHeight: 24 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.boss3' },
  // <circle offset="-15 9" radius="58"> static — the largest by far
  { id: 'boss_queen', actorPath: 'actors/bosses/boss_queen/boss_queen.unit', footprintWidth: 116 / 16, footprintHeight: 116 / 16, collisionOffsetY: 9 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.boss1' },
  { id: 'boss_worm', actorPath: 'actors/bosses/boss_worm/boss_worm.unit', footprintWidth: 36 / 16, footprintHeight: 36 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.d.ig.boss_1' },
  { id: 'boss_golem', actorPath: 'actors/bosses/boss_golem/golem_rock.unit', footprintWidth: 30 / 16, footprintHeight: 30 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.hwr.boss1' },
  { id: 'boss_warden', actorPath: 'actors/bosses/boss_warden/warden.unit', footprintWidth: 52 / 16, footprintHeight: 52 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.hwr.boss2' },
  // the mage statue is the mage wraith's own in stock; <rect>-10 -11 20 20</rect> static
  {
    id: 'boss_wraith',
    actorPath: 'actors/bosses/boss_wraith/wraith_mage.unit',
    footprintWidth: 36 / 16,
    footprintHeight: 36 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: '.ig.hwr.boss3',
    statue: { actorPath: 'actors/bosses/boss_wraith/statue_wraith_mage.unit', footprint: 20 / 16 }
  },
  // <circle offset="0 -12" radius="24">
  { id: 'boss_eye', actorPath: 'actors/bosses/boss_eye/eye.unit', footprintWidth: 48 / 16, footprintHeight: 48 / 16, collisionOffsetY: -12 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.hwr.boss4' },
  { id: 'boss_vampire', actorPath: 'actors/bosses/boss_vampire/vampire.unit', footprintWidth: 20 / 16, footprintHeight: 20 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.hwr.boss5' },
  // <circle offset="0 -10" radius="35"> static, Shaftlocke's frost dragon
  { id: 'boss_dragon_hwr', actorPath: 'actors/bosses/boss_dragon_hwr/dragon.unit', footprintWidth: 70 / 16, footprintHeight: 70 / 16, collisionOffsetY: -10 / 16, placement: 'topWall', artNudgeY: -16 / 16, forbiddenAlcoveWalls: ['N'], barName: '.ig.hwr.boss6' },
  // the seeress is the giant bat Shaftlocke fights as a boss
  { id: 'boss_seeress', actorPath: 'actors/beasts/bats/bat_mb_boss.unit', footprintWidth: 16 / 16, footprintHeight: 16 / 16, placement: 'centre', forbiddenAlcoveWalls: [], barName: '.ig.hwr.boss_seeress' }
]

/**
 * The stationary bosses' hittable circles (see `BossDef.hitCircles`), from
 * the unit files [VERIFIED by a test against the install].
 */
const HIT_CIRCLES: Partial<Record<BossId, ReadonlyArray<readonly [number, number, number]>>> = {
  boss_dragon: [
    [-45, 2, 16], [-42, 7, 16], [-32, -25, 35], [-30, 20, 18], [-24, 0, 15], [-15, 30, 18], [-10, 0, 15],
    [-9, -20, 17], [-5, 0, 15], [0, -32, 40], [0, -20, 17], [0, 5, 15], [0, 35, 18], [5, 0, 15], [9, -20, 17],
    [10, 0, 15], [15, 30, 18], [24, 0, 15], [30, 20, 18], [32, -25, 35], [42, 7, 16], [45, 2, 16]
  ],
  boss_dragon_hwr: [
    [-37, 82, 16], [-32, 40, 35], [-25, 100, 16], [-24, 80, 15], [-15, 105, 16], [-10, 80, 15], [-9, 61, 17],
    [-5, 80, 15], [-5, 105, 16], [-2, 80, 15], [0, -10, 35], [0, 20, 35], [0, 61, 17], [0, 80, 15], [0, 105, 16],
    [2, 80, 15], [5, 80, 15], [5, 105, 16], [9, 61, 17], [10, 80, 15], [15, 105, 16], [24, 80, 15], [25, 100, 16],
    [32, 40, 35], [37, 82, 16]
  ],
  boss_queen: [
    [-15, 9, 58],
    [20, -35, 50]
  ]
}

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
      ...(HIT_CIRCLES[d.id] === undefined ? {} : { hitCircles: HIT_CIRCLES[d.id] }),
      mobile: (MOBILE_BOSS_IDS as readonly string[]).includes(d.id),
      unique: (UNIQUE_BOSS_IDS as readonly string[]).includes(d.id)
    }
  ])
) as Record<BossId, BossDef>

/**
 * The AE campaign each boss comes from, for grouping the pickers. Read off
 * the stock boss-bar keys: `.ig.boss1–4` Castle Hammerwatch, `.d.ig.*`
 * Temple of the Sun (the desert campaign), `.ig.hwr.*` Shaftlocke Tower.
 */
export const BOSS_CAMPAIGNS: readonly { id: string; label: string; bosses: readonly BossId[] }[] = [
  { id: 'castle', label: 'Castle Hammerwatch', bosses: ['boss_queen', 'boss_knight', 'boss_lich', 'boss_dragon'] },
  { id: 'temple', label: 'Temple of the Sun', bosses: ['boss_worm', 'boss_krilith', 'boss_anubis'] },
  {
    id: 'shaftlocke',
    label: 'Shaftlocke Tower',
    bosses: ['boss_golem', 'boss_warden', 'boss_wraith', 'boss_eye', 'boss_vampire', 'boss_dragon_hwr', 'boss_seeress']
  }
]

/** `BOSS_DEFS` as a `BOSS_IDS`-ordered array, for callers that want to iterate. */
export const BOSS_DEF_LIST: readonly BossDef[] = BOSS_IDS.map((id) => BOSS_DEFS[id])

/** The largest boss footprint (queen) — geometry.ts reserves against this. */
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
 * The dragons and the queen are unique: once picked, that id is removed from
 * the candidate list so it can never be rolled a second time in the same fight
 * or floor. The arena has one top-wall slot, so picking either dragon also
 * removes the other. Every other boss stays in the pool and may repeat.
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
    if (BOSS_DEFS[id].placement === 'topWall') {
      for (let j = candidates.length - 1; j >= 0; j--) if (BOSS_DEFS[candidates[j]].placement === 'topWall') candidates.splice(j, 1)
    }
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
