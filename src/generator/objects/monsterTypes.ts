/**
 * Monster roster ported from the user's modified Monster.java / Parameters.java.
 * Pure data — actor XML paths per tier (index 0 is usually the spawner),
 * the plain-text id used in parameters.txt monster pools, the parameters.txt
 * key for its max count, and the default max count.
 */
import { corpseCollision } from './actorCollision'
import type { CorpseCollision } from './actorCollision'

/**
 * Display groups, in render order. The GUI iterates this list, so the union and
 * the thing the UI draws are the same list — a monster can't be defined into a
 * group that renders nowhere.
 */
export const MONSTER_GROUPS = ['Classic', 'Desert', 'Towers', 'Special', 'Bosses', 'Bodyguards', 'Bonus'] as const

export type MonsterGroup = (typeof MONSTER_GROUPS)[number]

/**
 * The taxonomy a Hammerwatch player already has in their head, used to filter
 * the monster lists in the GUI. Derived from `group` + `acts` by
 * `monsterCategories` — nothing is stored per-monster under this name, so the
 * two taxonomies can't drift apart.
 */
export const MONSTER_CATEGORIES = [
  'Act 1',
  'Act 2',
  'Act 3',
  'Act 4',
  'Temple of the Sun',
  'Bonus',
  'Other'
] as const

export type MonsterCategory = (typeof MONSTER_CATEGORIES)[number]

/** A Castle Hammerwatch act, 1-4. */
export type MonsterAct = 1 | 2 | 3 | 4

export interface MonsterTypeDef {
  /** plain string used in parameters.txt monster pools (e.g. "bat1") */
  id: string
  /** parameters.txt key for the max count (e.g. "maxBats1") */
  configKey: string
  /** actor XML per tier; Monster.Create rolls tiers upward with upgradeChance */
  tiers: string[]
  /**
   * Chance the tier roll climbs one more rung — see Monster.createRolled. These
   * are the ORIGINAL tool's per-type values, transcribed from the commented-out
   * table at reference/original-java/modified-monsters/Monster.java:235-282 (the
   * same numbers the un-modified reference/original-java/src/hammerwatchgen/
   * Monster.java:81-93 carries for the types it has).
   *
   * The modified Java this roster was ported from had commented that table out
   * and put a blanket 1.0f on every live entry, which the port transcribed
   * faithfully. That is a bug, not a tuning choice: `Rand.fRand(0, 1)` returns
   * [0, 1), so `fRand(0, 1) < 1.0` is a tautology and the roll could only ever
   * stop at the TOP tier — `skeleton_1_small` and `skeleton_1` had never once
   * been emitted by this tool (issue #58).
   *
   * Only types with 3+ tiers are affected either way. The loop evaluates fRand
   * before testing `tier < tiers.length - 1`, so a 1- or 2-tier type burns
   * exactly one draw and lands on the same tier whatever this value is.
   *
   * NOT a difficulty dial: a tiers array is an actor list in authoring order,
   * not a ladder sorted by threat. `lich`'s top tier is the necromancer, which
   * plays softer than the tiers below it. Pin a variant key (`lich#2`) when a
   * floor needs a specific monster.
   */
  upgradeChance: number
  defaultMax: number
  /** display grouping for the GUI */
  group: MonsterGroup
  /**
   * Which Castle Hammerwatch acts this type shows up in, ascending. Purely a
   * GUI filter hint — the generator never reads it, and a type can appear in
   * several acts (skeletons are in 2 and 4). Only meaningful for the castle
   * groups: the Desert and Bonus groups are their own categories and must not
   * set this. Leave it off for anything the wiki does not place in an act;
   * those land in "Other".
   */
  acts?: MonsterAct[]
  /**
   * Hidden from the GUI but still parsed and emitted by configFile.ts, so an
   * existing parameters.txt keeps round-tripping. Never delete a deprecated id —
   * validation.ts rejects unknown ids in a saved pool.
   */
  deprecated?: boolean
}

export const MONSTER_TYPES: MonsterTypeDef[] = [
  { id: 'archer1', configKey: 'maxArchers1', upgradeChance: 0.2, defaultMax: 40, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/archer_1.xml', 'actors/archer_1.xml', 'actors/archer_1_elite.xml'] },
  { id: 'archer2', configKey: 'maxArchers2', upgradeChance: 0.2, defaultMax: 30, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/archer_2.xml', 'actors/archer_2.xml'] },
  { id: 'archer3', configKey: 'maxArchers3', upgradeChance: 0.2, defaultMax: 20, group: 'Classic', acts: [2, 4], tiers: ['actors/archer_3.xml'] },
  { id: 'bat1', configKey: 'maxBats1', upgradeChance: 0.3, defaultMax: 200, group: 'Classic', acts: [1], tiers: ['actors/spawners/bats.xml', 'actors/bat_1.xml', 'actors/bat_2.xml'] },
  { id: 'bat2', configKey: 'maxBats2', upgradeChance: 0.3, defaultMax: 100, group: 'Classic', acts: [1], tiers: ['actors/spawners/bats.xml', 'actors/bat_2.xml', 'actors/bat_3.xml'] },
  { id: 'eye', configKey: 'maxEyes', upgradeChance: 0.4, defaultMax: 50, group: 'Classic', acts: [3, 4], tiers: ['actors/spawners/eye_1.xml', 'actors/eye_1_small.xml', 'actors/eye_1.xml'] },
  { id: 'floater_fire', configKey: 'maxFloater_Fires', upgradeChance: 0.4, defaultMax: 40, group: 'Special', tiers: ['actors/floater_fire.xml'] },
  // The desert guards swarm without really threatening the party, so they carry
  // much larger caps than their damage would suggest — they are the opening
  // floors' crowd, where the mummies are the opening floors' threat.
  { id: 'guard_desert', configKey: 'maxGuards_Desert', upgradeChance: 0.3, defaultMax: 60, group: 'Desert', tiers: ['actors/npc_guard_desert_1.xml'] },
  { id: 'guard_desert_range', configKey: 'maxGuards_Desert_Range', upgradeChance: 0.2, defaultMax: 40, group: 'Desert', tiers: ['actors/guard_desert_1.xml'] },
  { id: 'lich', configKey: 'maxLiches', upgradeChance: 0.2, defaultMax: 30, group: 'Classic', acts: [3, 4], tiers: ['actors/lich_1.xml', 'actors/lich_1_elite.xml', 'actors/lich_2.xml', 'actors/lich_3.xml'] },
  { id: 'lich_desert', configKey: 'maxLiches_Desert', upgradeChance: 0.2, defaultMax: 20, group: 'Desert', tiers: ['actors/lich_desert_1.xml', 'actors/lich_desert_2.xml', 'actors/lich_desert_3.xml'] },
  { id: 'maggot', configKey: 'maxMaggots', upgradeChance: 0.2, defaultMax: 80, group: 'Classic', acts: [1, 2], tiers: ['actors/spawners/maggot_1.xml', 'actors/maggot_1_small.xml', 'actors/maggot_1.xml', 'actors/maggot_1_elite.xml'] },
  { id: 'mummy_desert', configKey: 'maxMummies', upgradeChance: 0.3, defaultMax: 80, group: 'Desert', tiers: ['actors/spawners/mummy_1.xml', 'actors/mummy_1.xml', 'actors/mummy_1_small.xml', 'actors/mummy_1_elite.xml'] },
  { id: 'mummy_ranged', configKey: 'maxMummies_Ranged', upgradeChance: 0.2, defaultMax: 20, group: 'Desert', tiers: ['actors/spawners/mummy_ranged_1.xml', 'actors/mummy_ranged_1.xml', 'actors/mummy_ranged_2.xml'] },
  { id: 'pillar_fire', configKey: 'maxPillar_Fires', upgradeChance: 0.4, defaultMax: 20, group: 'Special', tiers: ['actors/pillar_fire.xml'] },
  { id: 'skeleton1', configKey: 'maxSkeletons1', upgradeChance: 0.3, defaultMax: 100, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/skeleton_1.xml', 'actors/skeleton_1_small.xml', 'actors/skeleton_1.xml', 'actors/skeleton_1_elite.xml'] },
  { id: 'skeleton2', configKey: 'maxSkeletons2', upgradeChance: 0.3, defaultMax: 80, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/skeleton_2.xml', 'actors/skeleton_2_small.xml', 'actors/skeleton_2.xml', 'actors/skeleton_2_elite.xml'] },
  { id: 'skeleton3', configKey: 'maxSkeletons3', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', acts: [2, 4], tiers: ['actors/skeleton_3.xml'] },
  { id: 'slime', configKey: 'maxSlimes', upgradeChance: 0.3, defaultMax: 300, group: 'Classic', acts: [2], tiers: ['actors/slime_1_host.xml', 'actors/slime_1_spawn.xml'] },
  { id: 'special_beheaded_kamikaze', configKey: 'maxSpecial_Beheaded_Kamikazes', upgradeChance: 0.4, defaultMax: 1, group: 'Special', tiers: ['actors/special_beheaded_kamikaze.xml'] },
  { id: 'spider', configKey: 'maxSpiders', upgradeChance: 1.0, defaultMax: 15, group: 'Special', tiers: ['actors/spider_1.xml'] },
  { id: 'tick1', configKey: 'maxTicks1', upgradeChance: 0.3, defaultMax: 100, group: 'Classic', acts: [1], tiers: ['actors/spawners/tick_1.xml', 'actors/tick_1_small.xml', 'actors/tick_1.xml', 'actors/tick_1_elite.xml'] },
  { id: 'tick2', configKey: 'maxTicks2', upgradeChance: 0.3, defaultMax: 20, group: 'Classic', acts: [1], tiers: ['actors/tick_2_small.xml', 'actors/tick_2.xml'] },
  { id: 'tower_banner1', configKey: 'maxTowers_Banner1', upgradeChance: 0.3, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_1.xml'] },
  { id: 'tower_banner2', configKey: 'maxTowers_Banner2', upgradeChance: 0.3, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_2.xml'] },
  { id: 'tower_banner3', configKey: 'maxTowers_Banner3', upgradeChance: 0.3, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_3.xml'] },
  { id: 'tower_archer1', configKey: 'maxTowers_Archer1', upgradeChance: 0.2, defaultMax: 6, group: 'Towers', tiers: ['actors/tower_battlement_archer_1.xml'] },
  { id: 'tower_archer3', configKey: 'maxTowers_Archer3', upgradeChance: 0.2, defaultMax: 6, group: 'Towers', tiers: ['actors/tower_battlement_archer_3.xml'] },
  // 450 HP, no skills, full 32x32 blocking collision. An obstacle, not an
  // attacker. The cap is only a ceiling — it is in no default pool, so raising
  // it to 24 arms it for a pool that opts in without touching any saved seed.
  { id: 'tower_empty', configKey: 'maxTowers_Empty', upgradeChance: 1.0, defaultMax: 24, group: 'Towers', tiers: ['actors/tower_battlement_empty.xml'] },
  { id: 'tower_flower1', configKey: 'maxTowers_Flower1', upgradeChance: 0.2, defaultMax: 0, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_1.xml'] },
  { id: 'tower_flower1_small', configKey: 'maxTowers_Flower1_Small', upgradeChance: 0.2, defaultMax: 12, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_1_small.xml'] },
  { id: 'tower_flower2', configKey: 'maxTowers_Flower2', upgradeChance: 0.2, defaultMax: 6, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_2.xml'] },
  { id: 'tower_flower3', configKey: 'maxTowers_Flower3', upgradeChance: 0.2, defaultMax: 4, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_3.xml'] },
  { id: 'tower_nova1', configKey: 'maxTowers_Nova1', upgradeChance: 0.2, defaultMax: 4, group: 'Towers', acts: [2, 3, 4], tiers: ['actors/tower_nova_1.xml'] },
  { id: 'tower_nova2', configKey: 'maxTowers_Nova2', upgradeChance: 0.2, defaultMax: 2, group: 'Towers', acts: [2, 3, 4], tiers: ['actors/tower_nova_2.xml'] },
  { id: 'tower_static_frost', configKey: 'maxTowers_Static_Frost', upgradeChance: 0.2, defaultMax: 1, group: 'Towers', tiers: ['actors/tower_static_frost.xml'] },
  { id: 'tower_tracking1', configKey: 'maxTowers_Tracking1', upgradeChance: 0.2, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_1.xml'] },
  { id: 'tower_tracking2', configKey: 'maxTowers_Tracking2', upgradeChance: 0.2, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_2.xml'] },
  { id: 'tower_tracking3', configKey: 'maxTowers_Tracking3', upgradeChance: 0.2, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_3.xml'] },
  { id: 'wisp1', configKey: 'maxWisps1', upgradeChance: 0.5, defaultMax: 25, group: 'Classic', acts: [3, 4], tiers: ['actors/spawners/wisp_1.xml', 'actors/wisp_1_small.xml', 'actors/wisp_1.xml'] },
  { id: 'wisp2', configKey: 'maxWisps2', upgradeChance: 0.5, defaultMax: 20, group: 'Classic', acts: [3, 4], tiers: ['actors/wisp_2.xml'] },
  { id: 'mb_doomspawn', configKey: 'maxMB_Doomspawns', upgradeChance: 1.0, defaultMax: 2, group: 'Bosses', acts: [4], tiers: ['actors/spawners/doomspawn_1.xml'] },
  { id: 'mb_eye', configKey: 'maxMB_Eyes', upgradeChance: 1.0, defaultMax: 4, group: 'Bosses', acts: [3, 4], tiers: ['actors/eye_1_mb.xml'] },
  { id: 'mb_lich', configKey: 'maxMB_Liches', upgradeChance: 1.0, defaultMax: 2, group: 'Bosses', acts: [3, 4], tiers: ['actors/lich_1_mb.xml'] },
  { id: 'mb_maggot', configKey: 'maxMB_Maggots', upgradeChance: 1.0, defaultMax: 4, group: 'Bosses', acts: [1, 2], tiers: ['actors/maggot_1_mb.xml'] },
  { id: 'mb_mummy', configKey: 'maxMB_Mummies', upgradeChance: 1.0, defaultMax: 8, group: 'Bosses', tiers: ['actors/mummy_1_mb.xml'] },
  { id: 'mb_skeleton', configKey: 'maxMB_Skeletons', upgradeChance: 1.0, defaultMax: 12, group: 'Bosses', acts: [2, 4], tiers: ['actors/skeleton_1_mb.xml'] },
  { id: 'mb_tick', configKey: 'maxMB_Ticks', upgradeChance: 1.0, defaultMax: 16, group: 'Bosses', acts: [1], tiers: ['actors/tick_1_mb.xml'] },

  // Bonus-campaign actors. Weaker than their vanilla counterparts (archer 15 HP
  // vs 20, skeleton 10 HP vs 40), so the maxes are the vanilla defaults scaled up
  // to compensate. The skeleton is capped at 300 rather than the 4× its HP would
  // suggest — 400 per lair was measurably laggy in game.
  // Append only — monsterTypeById falls back to MONSTER_TYPES[3].
  { id: 'bonus_skeleton1', configKey: 'maxBonus_Skeletons1', upgradeChance: 1.0, defaultMax: 300, group: 'Bonus', tiers: ['actors/spawners/bonus/skeleton_1.xml', 'actors/bonus/skeleton_1.xml'] },
  { id: 'bonus_archer1', configKey: 'maxBonus_Archers1', upgradeChance: 1.0, defaultMax: 60, group: 'Bonus', tiers: ['actors/bonus/archer_1.xml'] },

  // Bodyguards — issue #64 part 2. Actors that live under `actors/boss_*`
  // folders, sorted into "add to the roster" by the audit in
  // https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/64#issuecomment-5786124801.
  // Every one of them is a guard/summon that patrols a boss's own room, and
  // none of them carries `boss-hp` — only the seven end bosses and the worm
  // variants do, and killing one does not fire the engine's `Boss ...` events
  // ([VERIFIED] 2026-09-24 playtest; the worm decoy, which has `boss-hp`, does).
  // Single-tier, upgradeChance 1.0 like every other one-actor type — the
  // value is inert for a one-element `tiers` array (see the field comment).
  { id: 'knight_guard', configKey: 'maxKnight_Guards', upgradeChance: 1.0, defaultMax: 60, group: 'Bodyguards', acts: [2], tiers: ['actors/boss_knight/knight_guard.xml'] },
  { id: 'lich_guard_lich', configKey: 'maxLich_Guard_Liches', upgradeChance: 1.0, defaultMax: 30, group: 'Bodyguards', acts: [3], tiers: ['actors/boss_lich/lich_guard_lich.xml'] },
  { id: 'lich_mirror', configKey: 'maxLich_Mirrors', upgradeChance: 1.0, defaultMax: 4, group: 'Bodyguards', acts: [3], tiers: ['actors/boss_lich/boss_lich_mirror.xml'] },
  // No `acts` — Krilith is not a castle-act boss (the stock arena pool files
  // her under the ice caves, see defaultBossFight), so it lands in "Other" (like
  // `spider`/`tower_empty`), the same way monsterCategories works for every
  // untagged type.
  { id: 'krilith_mb_skeleton', configKey: 'maxKrilith_MB_Skeletons', upgradeChance: 1.0, defaultMax: 12, group: 'Bodyguards', tiers: ['actors/boss_krilith/skeleton_1_mb.xml'] },

  //==============================================
  // Deprecated
  //==============================================

  // The game never shipped a battlement archer 2 — this entry was always a
  // phantom pointing at a file that does not exist, and enabling it emitted an
  // actor path the game cannot resolve. Kept so existing parameters.txt files
  // and saved pools keep loading; repointed at the empty battlement and hidden
  // from the GUI in favour of tower_empty.
  // Do not delete: removing the id turns a saved pool entry into a hard
  // validation error.
  { id: 'tower_archer2', configKey: 'maxTowers_Archer2', upgradeChance: 0.2, defaultMax: 0, group: 'Towers', deprecated: true, tiers: ['actors/tower_battlement_empty.xml'] },
]

/**
 * The members of `group` as the GUI should list them: deprecated types dropped,
 * the rest sorted by id.
 *
 * MONSTER_TYPES itself is append-only — monsterTypeById falls back to the
 * positional MONSTER_TYPES[3] — so a new type always lands at the end of the
 * array no matter where it belongs alphabetically. Sorting here is what keeps
 * the checkbox lists readable without touching that order. Both
 * MonsterPoolsEditor and MonsterMaxTable go through this, so the pool editor
 * and the max table can never disagree about what exists or in what order.
 */
export function monsterTypesInGroup(group: MonsterGroup): MonsterTypeDef[] {
  return MONSTER_TYPES.filter((t) => t.group === group && !t.deprecated).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )
}

/**
 * Mini-bosses live in the Bosses group rather than beside the monster they are
 * a big version of, so the desert ones need saying out loud. Everything else in
 * Bosses is a castle mini-boss and carries `acts`.
 */
const TEMPLE_OF_THE_SUN_OVERRIDES = new Set(['mb_mummy'])

/**
 * Which filter categories a type belongs to, in MONSTER_CATEGORIES order.
 * Never empty — anything the wiki does not place lands in "Other" so no type
 * can become unreachable when a filter is narrowed.
 */
export function monsterCategories(type: MonsterTypeDef): MonsterCategory[] {
  if (type.group === 'Desert' || TEMPLE_OF_THE_SUN_OVERRIDES.has(type.id)) return ['Temple of the Sun']
  if (type.group === 'Bonus') return ['Bonus']
  if (type.acts && type.acts.length > 0) return type.acts.map((act) => `Act ${act}` as MonsterCategory)
  return ['Other']
}

const byId = new Map(MONSTER_TYPES.map((t) => [t.id, t]))

/** Look up a monster by its plain id; falls back to bat1 like Monster.parseString did. */
export function monsterTypeById(id: string): MonsterTypeDef {
  return byId.get(id) ?? MONSTER_TYPES[3] // bat1
}

export function isKnownMonsterId(id: string): boolean {
  return byId.has(id)
}

//==============================================
// Variants — one selectable entry per actor path
//==============================================

/**
 * Separates a monster id from an explicit tier index in a boss-wave pool key:
 * `bat1#0` is the bats spawner, `archer1#2` is the elite archer. Chosen because
 * it collides with nothing in the parameters.txt wave grammar, which already
 * uses `|`, `,` and `:` as separators (see configFile.ts).
 */
const VARIANT_SEPARATOR = '#'

/**
 * The tier a BARE monster id has always resolved to in a boss wave: index 1,
 * the ordinary creature, clamped down for single-tier types. Keeping the bare
 * id pinned to this tier is what makes every pre-variant parameters.txt, preset
 * and seed keep producing byte-identical output.
 */
export function defaultTier(type: MonsterTypeDef): number {
  return Math.min(1, type.tiers.length - 1)
}

/** One selectable actor: a monster type at a specific tier. */
export interface MonsterVariant {
  /**
   * Canonical pool key. The bare id for `defaultTier`, `id#tier` otherwise —
   * so exactly one key exists per actor path and the picker can never offer two
   * checkboxes that spawn the same thing.
   */
  key: string
  type: MonsterTypeDef
  tier: number
  actorPath: string
  /** A spawner prop rather than a creature — `actors/spawners/**`. */
  role: 'spawner' | 'creature'
  /** What it leaves behind when killed; undefined for anything that leaves gibs. */
  corpse?: CorpseCollision
}

/** The canonical pool key for `type` at `tier`. */
export function variantKey(type: MonsterTypeDef, tier: number): string {
  return tier === defaultTier(type) ? type.id : `${type.id}${VARIANT_SEPARATOR}${tier}`
}

/**
 * Spawners that do not live under `actors/spawners/`, so the path prefix alone
 * cannot classify them. The slime host is a static hive that produces
 * `slime_1_spawn` and leaves a razed doodad on death like every spawner does —
 * see the corpse table in actorCollision.ts, which already treats it as one.
 */
const NON_PREFIXED_SPAWNERS = new Set(['actors/slime_1_host.xml'])

/** Every actor `type` can spawn, one variant per tier, in tier order. */
export function monsterVariants(type: MonsterTypeDef): MonsterVariant[] {
  return type.tiers.map((actorPath, tier) => ({
    key: variantKey(type, tier),
    type,
    tier,
    actorPath,
    role:
      actorPath.startsWith('actors/spawners/') || NON_PREFIXED_SPAWNERS.has(actorPath)
        ? 'spawner'
        : 'creature',
    corpse: corpseCollision(actorPath)
  }))
}

/**
 * Splits a pool key into its id and explicit tier. `tier` is undefined for a
 * bare id (meaning `defaultTier`) and NaN for a malformed suffix, which
 * validation rejects — parsing never throws, so the generator stays total on
 * bad input (invariant 4: reject, don't crash).
 */
export function parseMonsterKey(key: string): { id: string; tier?: number } {
  const at = key.indexOf(VARIANT_SEPARATOR)
  if (at === -1) return { id: key }
  const raw = key.slice(at + 1)
  return { id: key.slice(0, at), tier: /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN }
}

/**
 * The actor XML a pool key spawns. Unknown ids fall through
 * monsterTypeById's bat1 fallback and an out-of-range tier falls back to
 * `defaultTier`, so this always returns a real actor path.
 */
export function resolveActorPath(key: string): string {
  const { id, tier } = parseMonsterKey(key)
  const type = monsterTypeById(id)
  if (tier === undefined || !Number.isInteger(tier) || tier < 0 || tier >= type.tiers.length) {
    return type.tiers[defaultTier(type)]
  }
  return type.tiers[tier]
}

/**
 * True for a canonical pool key only. A non-canonical spelling of the default
 * tier (`bat1#1`) is rejected on purpose: allowing both would let the same
 * actor occupy two pool slots with two different max counts.
 */
export function isKnownMonsterKey(key: string): boolean {
  const { id, tier } = parseMonsterKey(key)
  if (!isKnownMonsterId(id)) return false
  if (tier === undefined) return true
  const type = byId.get(id)!
  return Number.isInteger(tier) && tier >= 0 && tier < type.tiers.length && tier !== defaultTier(type)
}

//==============================================
// Families
//==============================================

/**
 * A group of SEPARATE monster types a dungeon floor can pool as one entry: a
 * `tower_banner` pool key spawns a mix of `tower_banner1`, `tower_banner2` and
 * `tower_banner3`.
 *
 * Deliberately its own registry rather than a `MONSTER_TYPES` row whose `tiers`
 * are the member actors. Three reasons, each on its own decisive:
 *
 * 1. `Monster.createRolled` starts at tier 1 and only climbs, so index 0 is
 *    unreachable by rolling. A two-member family expressed as tiers would emit
 *    its SECOND member every time and its first never — the issue #58 bug from
 *    the other direction.
 * 2. `monsterVariantsInGroup` flat-maps every MONSTER_TYPES row over every tier
 *    to build the ARENA wave picker, so a family in that list would offer
 *    `tower_banner#0..#2` beside `tower_banner1..3` — six checkboxes spawning
 *    three actors, exactly what MonsterVariant.key's contract forbids. Living
 *    outside MONSTER_TYPES keeps families off the arena with no new flag.
 * 3. A family's members are whole types with their own caps and actor paths;
 *    `tiers` means "one type's actors", which is a different relationship.
 *
 * Members keep working as ordinary pool keys, in the arena, and in an existing
 * `parameters.txt` — a family is an ADDITIONAL way to name them, never a
 * replacement.
 */
export interface MonsterFamilyDef {
  /** Pool key AND `monsterMax` key, e.g. `tower_banner`. */
  id: string
  /** parameters.txt key for its cap, e.g. `maxTowers_Banner`. */
  configKey: string
  /** Member type ids, in the order the picker lists them. */
  members: string[]
  defaultMax: number
  group: MonsterGroup
}

/**
 * The shipped families. Towers were the first group where the roster split
 * one concept across many ids, so picking "some banners" meant finding three
 * separate checkboxes.
 *
 * `tower_empty` and `tower_static_frost` are deliberately absent — each is a
 * lone inert barrier rather than one of a set (see MONSTER_NOTES). So is
 * `tower_archer2`, the deprecated phantom that now points at the same actor
 * `tower_empty` owns.
 *
 * Caps are a tuning call, set in line with the members' own: a family's cap is
 * the one that governs when the family is pooled (see Monster.capId), so a
 * member's own cap is NOT consulted on that path. One consequence worth
 * knowing: `tower_flower1` ships capped at 0, but pooling `tower_flower` still
 * spawns it.
 */
export const MONSTER_FAMILIES: MonsterFamilyDef[] = [
  { id: 'tower_archer', configKey: 'maxTowers_Archer', defaultMax: 6, group: 'Towers', members: ['tower_archer1', 'tower_archer3'] },
  { id: 'tower_banner', configKey: 'maxTowers_Banner', defaultMax: 4, group: 'Towers', members: ['tower_banner1', 'tower_banner2', 'tower_banner3'] },
  { id: 'tower_flower', configKey: 'maxTowers_Flower', defaultMax: 6, group: 'Towers', members: ['tower_flower1', 'tower_flower1_small', 'tower_flower2', 'tower_flower3'] },
  { id: 'tower_nova', configKey: 'maxTowers_Nova', defaultMax: 4, group: 'Towers', members: ['tower_nova1', 'tower_nova2'] },
  { id: 'tower_tracking', configKey: 'maxTowers_Tracking', defaultMax: 2, group: 'Towers', members: ['tower_tracking1', 'tower_tracking2', 'tower_tracking3'] }
]

const familyById = new Map(MONSTER_FAMILIES.map((f) => [f.id, f]))

/** Which family a member type belongs to, if any. Built once, from `members`. */
const familyByMember = new Map(
  MONSTER_FAMILIES.flatMap((f) => f.members.map((m) => [m, f] as const))
)

/** The family `id` names, or undefined when it is not a family id. */
export function monsterFamilyById(id: string): MonsterFamilyDef | undefined {
  return familyById.get(id)
}

export function isKnownFamilyId(id: string): boolean {
  return familyById.has(id)
}

/** The family `typeId` is a member of, or undefined for a standalone type. */
export function familyOfMember(typeId: string): MonsterFamilyDef | undefined {
  return familyByMember.get(typeId)
}

/**
 * A family's member types, in `members` order. Unknown ids are dropped rather
 * than thrown on — a family naming a type that does not exist is a registry bug
 * a test catches, not a reason to crash generation (invariant 4).
 */
export function familyMembers(family: MonsterFamilyDef): MonsterTypeDef[] {
  return family.members.map((id) => byId.get(id)).filter((t): t is MonsterTypeDef => t !== undefined)
}

//==============================================
// Floor pool keys
//==============================================

/**
 * A dungeon floor's pool entry. Deliberately a DIFFERENT grammar from the
 * arena's canonical variant key, because a bare id means a different thing on
 * each side:
 *
 * - In an arena wave a bare `skeleton1` IS a pin, at `defaultTier`. Two
 *   spellings of one actor would let it occupy two pool slots with two max
 *   counts, so `isKnownMonsterKey` rejects the non-canonical `skeleton1#1`.
 * - On a dungeon floor a bare `skeleton1` means "roll the ladder"
 *   (Monster.createRolled). That is genuinely not the same thing as pinning the
 *   small skeleton, so `skeleton1` and `skeleton1#1` must BOTH be legal here.
 *
 * Hence a sibling predicate rather than a relaxation of `isKnownMonsterKey` —
 * the arena's stricter rule is correct for the arena and must stay.
 */
export function isKnownFloorPoolKey(key: string): boolean {
  const { id, tier } = parseMonsterKey(key)
  // A family is a bare id only. `tower_banner#1` is rejected on purpose: a
  // family has no tiers to index, and its members already have their own ids —
  // `tower_banner1` is how you name one. validation.ts says so in words.
  if (isKnownFamilyId(id)) return tier === undefined
  if (!isKnownMonsterId(id)) return false
  if (tier === undefined) return true
  const type = byId.get(id)!
  return Number.isInteger(tier) && tier >= 0 && tier < type.tiers.length
}

/**
 * The tier a floor pool entry pins, or undefined when it rolls. Undefined is
 * the load-bearing case: it is what sends the horde down createRolled, and a
 * pinned entry must draw nothing at all (see Monster.createRolled's comment).
 *
 * Total on bad input, like parseMonsterKey — an out-of-range or malformed tier
 * reads as "roll" here and is rejected by validation.ts, never thrown on
 * (invariant 4).
 */
export function floorPoolTier(key: string): number | undefined {
  const { id, tier } = parseMonsterKey(key)
  if (tier === undefined || !Number.isInteger(tier) || tier < 0) return undefined
  const type = byId.get(id)
  if (!type || tier >= type.tiers.length) return undefined
  return tier
}

/**
 * One entry a dungeon floor's pool picker can offer. Deliberately NOT
 * MonsterVariant: `variantKey(skeleton1, 1)` is the bare `skeleton1`, and on a
 * floor the bare id means "roll the ladder", not "pin tier 1" — so a variant
 * list has no way to spell the small skeleton. These keys do.
 */
export interface FloorPoolEntry {
  /** What goes in `levelMonsters`: a family id, a bare type id, or `id#tier`. */
  key: string
  /**
   * The type this entry spawns. For a FAMILY entry this is its first member —
   * the picker needs a real type for the act/category filter and the search,
   * and a family's members share `group` and `acts`, so any of them answers
   * those questions identically. Read `family` to tell the two apart, never
   * `type`.
   */
  type: MonsterTypeDef
  /** Set only on a family entry, which spans several whole types. */
  family?: MonsterFamilyDef
  /** The pinned tier; undefined for a rolled or family entry. */
  tier?: number
  /** The exact actor a pin spawns; undefined for rolled and family entries, which span several. */
  actorPath?: string
  /** `rolled` is the "any tier" entry and `family` the "any member" one; the rest follow MonsterVariant.role. */
  role: 'spawner' | 'creature' | 'rolled' | 'family'
  corpse?: CorpseCollision
}

/**
 * What a floor pool picker offers for `family`: one entry, keyed by the family
 * id. Its members are listed separately (they are ordinary types) and the
 * picker nests them under this entry — see floorPoolBucketId.
 */
export function floorPoolFamilyEntry(family: MonsterFamilyDef): FloorPoolEntry | undefined {
  const members = familyMembers(family)
  if (members.length === 0) return undefined
  return { key: family.id, type: members[0], family, role: 'family' }
}

/**
 * Which row group an entry belongs to in the picker — a family id for a family
 * entry and for every member of that family, otherwise the type's own id.
 *
 * Explicit rather than inferred from sort order: `floorPoolEntriesInGroup`
 * sorts by key and a family id happens to sort immediately before its members
 * (`tower_banner` < `tower_banner1` < … < `tower_empty`), but the picker should
 * not silently depend on that holding for a future family whose members are not
 * named after it.
 */
export function floorPoolBucketId(entry: FloorPoolEntry): string {
  if (entry.family) return entry.family.id
  return familyOfMember(entry.type.id)?.id ?? entry.type.id
}

/**
 * What a floor pool picker offers for `type`: the rolled entry first, then one
 * pinned entry per tier.
 *
 * A single-tier type gets ONLY the rolled entry. `spider#0` would be legal (see
 * isKnownFloorPoolKey) but it names the same actor the bare id does, and two
 * checkboxes that spawn the same thing is the confusion the arena's canonical
 * key rule exists to prevent.
 */
export function floorPoolEntries(type: MonsterTypeDef): FloorPoolEntry[] {
  const rolled: FloorPoolEntry = { key: type.id, type, role: 'rolled' }
  if (type.tiers.length < 2) return [rolled]
  return [
    rolled,
    ...monsterVariants(type).map((v) => ({
      // Always `id#tier`, never variantKey — the bare spelling is taken by the
      // rolled entry above.
      key: `${type.id}${VARIANT_SEPARATOR}${v.tier}`,
      type,
      tier: v.tier,
      actorPath: v.actorPath,
      role: v.role,
      corpse: v.corpse
    }))
  ]
}

/**
 * Which picker group a floor pool entry belongs in. Pinned spawners go to
 * `Spawners` exactly as the arena's do; the rolled entry stays with its type,
 * because a roll can land on a spawner tier or a creature tier.
 */
export function floorPoolGroup(entry: FloorPoolEntry): MonsterVariantGroup {
  if (entry.family) return entry.family.group
  return entry.role === 'spawner' ? 'Spawners' : entry.type.group
}

/**
 * The members of `group` a floor pool picker should list, deprecated types
 * dropped and family entries folded in.
 *
 * A family's member types are still here — they are ordinary types with their
 * own keys and caps — but they share a bucket id with their family, so the
 * picker nests them under it instead of listing them at top level.
 */
export function floorPoolEntriesInGroup(group: MonsterVariantGroup): FloorPoolEntry[] {
  const families = MONSTER_FAMILIES.map(floorPoolFamilyEntry).filter(
    (e): e is FloorPoolEntry => e !== undefined
  )
  return [...MONSTER_TYPES.filter((t) => !t.deprecated).flatMap(floorPoolEntries), ...families]
    .filter((e) => floorPoolGroup(e) === group)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/**
 * What a variant actually does in game, for the pool pickers' tooltips. Keyed
 * by canonical variant key; `monsterNote` falls back to the bare id, so a note
 * written once on `tick2` covers `tick2#0` as well.
 *
 * Only the ones whose name gives nothing away are listed — the four liches all
 * read as "lich" in the picker, and nothing about `tick2` says "gold". Anything
 * missing here simply has no note.
 */
export const MONSTER_NOTES: Record<string, string> = {
  // lich tiers are [lich_1, lich_1_elite, lich_2, lich_3], defaultTier 1 —
  // so the bare key is the elite, not the plain one.
  lich: 'elite heat-seeking orb shooter',
  'lich#0': 'heat-seeking orb shooter',
  'lich#2': 'frost spitter',
  'lich#3': 'necromancer',
  // lich_desert tiers are [lich_desert_1, lich_desert_2, lich_desert_3].
  lich_desert: 'lich_desert_2 — fire and daze; the daze inverts your controls, the worst of the three',
  'lich_desert#0': 'lich_desert_1 — ice spammer',
  'lich_desert#2': 'lich_desert_3 — healer',
  tick2: 'golden tick — drops a lot of gold',
  // Both are obstacles rather than attackers, but they differ on what they
  // leave behind, and the arena's scatter rules turn on exactly that: the
  // battlement's rubble is walkable, the frost tower's wreck is not
  // (actorCollision.ts — tower_battlement_empty 'passable',
  // tower_static_frost 'blocking', circle r=10).
  tower_empty: '450 HP battlement — blocks your way, never attacks',
  tower_static_frost: 'inert barrier — blocks your way and does nothing else, like tower_empty, except its wreck stays solid',

  // Bodyguards (issue #64 part 2) — none of these names says what it does.
  knight_guard: '150 HP melee guard, 35 damage — 50% chance to drop a health potion',
  lich_guard_lich: 'necromancer guard — summons 2 lich-guard skeletons every 3.25s',
  lich_mirror: "the Lich's 50 HP mirror image — summons small eyes and seekers, releases 7 bat_3 on death",
  krilith_mb_skeleton: "Krilith's 400 HP mini-boss skeleton (the root mb_skeleton is 800) — its hits apply Krilith's wave debuff and it ignores traps"
}

/**
 * The note for a pool key, falling back to the bare id's note so a type-wide
 * note covers every tier. Undefined when nothing is written for it.
 */
export function monsterNote(key: string): string | undefined {
  const note = MONSTER_NOTES[key]
  if (note !== undefined) return note
  return MONSTER_NOTES[parseMonsterKey(key).id]
}

/**
 * Display groups for a variant picker. Spawners get their own group rather than
 * sitting inside the group of the monster they spit out — they are static
 * buildings, like the towers they sit next to (issue #20). Membership follows
 * `MonsterVariant.role`, not the actor folder: `slime#0` is a hive that lives
 * outside `actors/spawners/` and still belongs here. MONSTER_GROUPS itself is
 * left alone because the dungeon pool editor iterates it and has no variant
 * concept.
 */
export const MONSTER_VARIANT_GROUPS = [...MONSTER_GROUPS, 'Spawners'] as const

export type MonsterVariantGroup = (typeof MONSTER_VARIANT_GROUPS)[number]

export function variantGroup(variant: MonsterVariant): MonsterVariantGroup {
  return variant.role === 'spawner' ? 'Spawners' : variant.type.group
}

/**
 * The members of `group` as a variant picker should list them: deprecated types
 * dropped, the rest sorted by key. Mirrors monsterTypesInGroup — see its
 * comment for why sorting happens here and not in MONSTER_TYPES.
 */
export function monsterVariantsInGroup(group: MonsterVariantGroup): MonsterVariant[] {
  return MONSTER_TYPES.filter((t) => !t.deprecated)
    .flatMap(monsterVariants)
    .filter((v) => variantGroup(v) === group)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

//==============================================
// Arena bodyguard twins (issue #64 part 2)
//==============================================

/**
 * Near-duplicate actors that live under `actors/boss_*` folders and stand in
 * for an ordinary roster actor when it is used INSIDE that boss's arena — an arena
 * uses the boss-folder twin, a dungeon floor uses the regular actor. Keyed
 * and valued by actor path, not by monster id, because the substitution
 * happens after `resolveActorPath`/`resolveArenaActorPath` has already turned
 * a pool key into one path — see `resolveArenaActorPath`.
 *
 * Diffed on disk (2026-09-23, see the modding skill's DISCOVERY-LOG):
 *
 * - `archer_1` / `skeleton_1` / `skeleton_1_small`: the knight's twins raise
 *   aggro range from 10-12 to 30 (the archer's max-range goes 20 -> 30 too),
 *   and drop no loot.
 * - `skeleton_3` -> `lich_guard_skeleton`: same aggro as the root, but HP
 *   20 -> 25, speed 1.1 -> 0.65, no loot, no gib.
 * - `mummy_ranged_2` -> `mummy_ranged_2_noloot`: only loses the 20% health
 *   drop — otherwise identical.
 *
 * None of the five twins drops loot, which matches every other bodyguard
 * added alongside this table.
 */
export const ARENA_BODYGUARD_TWINS: Readonly<Record<string, string>> = {
  'actors/archer_1.xml': 'actors/boss_knight/archer_1.xml',
  'actors/skeleton_1.xml': 'actors/boss_knight/skeleton_1.xml',
  'actors/skeleton_1_small.xml': 'actors/boss_knight/skeleton_1_small.xml',
  'actors/skeleton_3.xml': 'actors/boss_lich/lich_guard_skeleton.xml',
  'actors/mummy_ranged_2.xml': 'actors/boss_anubis/mummy_ranged_2_noloot.xml'
}

/**
 * `actorPath`'s arena twin, or `actorPath` unchanged when it has none. A pure
 * lookup — draws nothing from any stream. Uses `hasOwnProperty` rather than
 * bracket-testing so no `Object.prototype` key (`toString`, `__proto__`, …)
 * can leak through for a pathological input.
 */
export function arenaActorPath(actorPath: string): string {
  return Object.prototype.hasOwnProperty.call(ARENA_BODYGUARD_TWINS, actorPath)
    ? ARENA_BODYGUARD_TWINS[actorPath]
    : actorPath
}

/**
 * `resolveActorPath(key)`, substituted through the arena's bodyguard-twin
 * table when `useTwins` is true (the default everywhere an arena calls this).
 * A pure lookup on top of an already-pure lookup — still no RNG draw, so the
 * toggle can never move an arena's or a floor's layout, only which actor path
 * a wave/row names. `useTwins: false` (or a key with no twin) returns exactly
 * what `resolveActorPath` would have.
 */
export function resolveArenaActorPath(key: string, useTwins: boolean): string {
  const path = resolveActorPath(key)
  return useTwins ? arenaActorPath(path) : path
}
