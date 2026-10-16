/**
 * The Hammerwatch Anniversary Edition monster roster.
 *
 * Pure data: actor unit paths per tier (index 0 is usually the spawner), the
 * plain id used in monster pools and the parameters file, the parameters key
 * for its max count, and the default max count.
 *
 * Built from a survey of every actor under `unpacked_assets_66/actors`
 * (scripts/dev/actor-survey.mjs: behaviour class, hp, bestiary name). Every
 * enemy, spawner, tower, mini-boss and boss-room guard the game ships is here
 * except:
 *
 * - the `challenge/` copies — identical hp and bestiary names, made for AE's
 *   challenge rooms, so they would only duplicate the entries below;
 * - projectiles and effect actors (`RayProjectile`, fire areas, wisps of the
 *   eye boss, worm damage dummies), summons, critters and NPCs;
 * - hellcubes (puzzle blocks) and the ore deposit.
 *
 * The end bosses themselves live in `boss/bosses.ts`, not here.
 *
 * Classic tiers follow the HW1 ladders they replace (hw2ae matched each HW1
 * actor to its AE counterpart on identical hp), so `skeleton_warrior` climbs
 * spawner → weak → warrior → elite exactly like HW1's skeleton_1 did.
 */
import { corpseCollision } from './actorCollision'
import type { CorpseCollision } from './actorCollision'

/**
 * Display groups, in render order. The GUI iterates this list, so the union and
 * the thing the UI draws are the same list — a monster can't be defined into a
 * group that renders nowhere.
 */
export const MONSTER_GROUPS = [
  'Undead',
  'Beasts',
  'Aberrations',
  'Shaftlocke',
  'Temple of the Sun',
  'Towers',
  'Mini-bosses',
  'Bodyguards',
  'Bonus'
] as const

export type MonsterGroup = (typeof MONSTER_GROUPS)[number]

/**
 * Which campaign a monster comes from, for the GUI filter. Derived from
 * `campaigns` by `monsterCategories` — never empty, anything unplaced lands in
 * "Other".
 */
export const MONSTER_CATEGORIES = ['Castle Hammerwatch', 'Shaftlocke Tower', 'Temple of the Sun', 'Other'] as const

export type MonsterCategory = (typeof MONSTER_CATEGORIES)[number]

/** A stock AE campaign a monster appears in. */
export type MonsterCampaign = 'castle' | 'shaftlocke' | 'temple'

const CAMPAIGN_CATEGORY: Record<MonsterCampaign, MonsterCategory> = {
  castle: 'Castle Hammerwatch',
  shaftlocke: 'Shaftlocke Tower',
  temple: 'Temple of the Sun'
}

export interface MonsterTypeDef {
  /** plain id used in monster pools (e.g. "skeleton_warrior") */
  id: string
  /** parameters-file key for the max count (e.g. "max_skeleton_warrior") */
  configKey: string
  /** actor unit per tier; Monster.createRolled rolls tiers upward with upgradeChance */
  tiers: string[]
  /**
   * Chance the tier roll climbs one more rung — see Monster.createRolled. Only
   * types with 3+ tiers are affected: the roll starts at tier 1 and evaluates
   * fRand before testing the top, so a 1- or 2-tier type always lands on its
   * last tier. NOT a difficulty dial — a tiers array is an actor list, not a
   * threat ladder; pin a variant key (`skeleton_lich#3`) for a specific actor.
   */
  upgradeChance: number
  defaultMax: number
  group: MonsterGroup
  /** campaigns this type appears in — a GUI filter hint only */
  campaigns?: MonsterCampaign[]
  /** hidden from the GUI but still parsed, so a saved pool keeps loading */
  deprecated?: boolean
}

const SK = 'actors/undead/skeletons'
const SP = 'actors/spawners'

function t(
  id: string,
  group: MonsterGroup,
  defaultMax: number,
  upgradeChance: number,
  tiers: string[],
  campaigns?: MonsterCampaign[]
): MonsterTypeDef {
  const def: MonsterTypeDef = { id, configKey: `max_${id}`, upgradeChance, defaultMax, group, tiers }
  if (campaigns !== undefined) def.campaigns = campaigns
  return def
}

/**
 * Append-only: `monsterTypeById` falls back to `MONSTER_TYPES[0]`, and
 * defaults/presets name these ids.
 */
export const MONSTER_TYPES: MonsterTypeDef[] = [
  // --- Undead: Castle Hammerwatch ------------------------------------------
  t('skeleton_warrior', 'Undead', 100, 0.3, [`${SP}/hammerwatch/spawner_skeleton_warrior.unit`, `${SK}/hammerwatch/skeleton_warrior_weak.unit`, `${SK}/hammerwatch/skeleton_warrior.unit`, `${SK}/hammerwatch/skeleton_warrior_elite.unit`], ['castle']),
  t('skeleton_soldier', 'Undead', 80, 0.3, [`${SP}/hammerwatch/spawner_skeleton_soldier.unit`, `${SK}/hammerwatch/skeleton_soldier_weak.unit`, `${SK}/hammerwatch/skeleton_soldier.unit`, `${SK}/hammerwatch/skeleton_soldier_elite.unit`], ['castle']),
  t('skeleton_archer', 'Undead', 40, 0.2, [`${SP}/hammerwatch/spawner_skeleton_archer.unit`, `${SK}/hammerwatch/skeleton_archer.unit`, `${SK}/hammerwatch/skeleton_archer_elite.unit`], ['castle']),
  t('skeleton_ranger', 'Undead', 30, 0.2, [`${SP}/hammerwatch/spawner_skeleton_ranger.unit`, `${SK}/hammerwatch/skeleton_ranger.unit`], ['castle']),
  t('skeleton_runner', 'Undead', 100, 1.0, [`${SK}/hammerwatch/skeleton_runner.unit`], ['castle']),
  // lich ladder as HW1's: lich_1, lich_1_elite, lich_2 (sorcerer), lich_3 (necromancer)
  t('skeleton_lich', 'Undead', 30, 0.2, [`${SK}/hammerwatch/skeleton_lich.unit`, `${SK}/hammerwatch/skeleton_lich_elite.unit`, `${SK}/hammerwatch/skeleton_sorcerer.unit`, `${SK}/hammerwatch/skeleton_necromancer.unit`], ['castle']),
  t('ghost', 'Undead', 25, 0.3, [`actors/undead/ghosts/ghost_paladin.unit`, `actors/undead/ghosts/ghost_priest.unit`, `actors/undead/ghosts/ghost_ranger.unit`, `actors/undead/ghosts/ghost_sorcerer.unit`, `actors/undead/ghosts/ghost_thief.unit`]),
  t('ancient_ghost', 'Undead', 8, 1.0, ['actors/undead/ghosts/ancient_ghost.unit']),
  t('skull', 'Undead', 30, 0.3, ['actors/undead/ghosts/skull_small.unit', 'actors/undead/ghosts/skull_large.unit']),

  // --- Beasts ----------------------------------------------------------------
  t('bat', 'Beasts', 200, 0.3, [`${SP}/hammerwatch/spawner_bats.unit`, 'actors/beasts/bats/bat_black.unit', 'actors/beasts/bats/bat_fast.unit', 'actors/beasts/bats/bat_white.unit'], ['castle']),
  t('tick', 'Beasts', 100, 0.3, [`${SP}/hammerwatch/spawner_tick.unit`, 'actors/beasts/ticks/tick_small.unit', 'actors/beasts/ticks/tick.unit', 'actors/beasts/ticks/tick_elite.unit'], ['castle']),
  t('tick_gold', 'Beasts', 20, 0.3, ['actors/beasts/ticks/tick_gold_small.unit', 'actors/beasts/ticks/tick_gold.unit'], ['castle']),
  t('tick_exploding', 'Beasts', 40, 0.5, ['actors/beasts/ticks/tick_exploding_fire.unit', 'actors/beasts/ticks/tick_exploding_poison.unit']),
  t('maggot', 'Beasts', 80, 0.2, [`${SP}/hammerwatch/spawner_maggot.unit`, 'actors/beasts/maggots/maggot_grub.unit', 'actors/beasts/maggots/maggot_giant.unit', 'actors/beasts/maggots/maggot_devour.unit'], ['castle']),
  t('maggot_spiky', 'Beasts', 20, 1.0, ['actors/beasts/maggots/maggot_spiky.unit'], ['castle']),
  t('spider', 'Beasts', 15, 0.3, ['actors/beasts/spiders/spider_poison.unit', 'actors/beasts/spiders/spider_white.unit']),
  t('scorpion', 'Beasts', 20, 1.0, ['actors/beasts/spiders/scorpion.unit'], ['temple']),
  t('troll_cave', 'Beasts', 8, 0.4, ['actors/beasts/trolls/cave_troll_melee.unit', 'actors/beasts/trolls/cave_troll_shaman.unit']),
  t('troll_ice', 'Beasts', 6, 0.4, ['actors/beasts/trolls/ice_troll_melee.unit', 'actors/beasts/trolls/ice_troll_shaman.unit']),

  // --- Aberrations -------------------------------------------------------------
  t('eye', 'Aberrations', 50, 0.4, [`${SP}/hammerwatch/spawner_eye.unit`, 'actors/aberrations/eyes/eye_small.unit', 'actors/aberrations/eyes/eye.unit'], ['castle']),
  t('wisp', 'Aberrations', 25, 0.5, [`${SP}/hammerwatch/spawner_wisp.unit`, 'actors/aberrations/wisps/wisp_green.unit', 'actors/aberrations/wisps/wisp_blue.unit', 'actors/aberrations/wisps/wisp_red.unit', 'actors/aberrations/wisps/wisp_purple.unit'], ['castle']),
  // slime_blob is a static hive that bursts into slime_small, like HW1's host/spawn pair
  t('slime', 'Aberrations', 300, 0.3, ['actors/aberrations/slimes/slime_blob.unit', 'actors/aberrations/slimes/slime_small.unit'], ['castle']),
  t('slime_blood', 'Aberrations', 300, 0.3, ['actors/aberrations/slimes/blood/slime_blob.unit', 'actors/aberrations/slimes/blood/slime_small.unit']),
  t('gargoyle', 'Aberrations', 8, 0.4, ['actors/aberrations/gargoyles/gargoyle_imp.unit', 'actors/aberrations/gargoyles/gargoyle_stone.unit']),
  t('elemental_ice', 'Aberrations', 12, 0.4, ['actors/aberrations/elementals/elemental_ice_ranged.unit', 'actors/aberrations/elementals/elemental_ice_sword.unit']),
  t('flower_small', 'Towers', 12, 1.0, ['actors/aberrations/flowers/flower_small.unit'], ['castle']),
  t('flower_eater', 'Towers', 6, 1.0, ['actors/aberrations/flowers/flower_eater.unit'], ['castle']),
  t('flower_blood', 'Towers', 6, 1.0, ['actors/aberrations/flowers/flower_blood.unit'], ['castle']),
  t('flower_bloodrose', 'Towers', 4, 1.0, ['actors/aberrations/flowers/flower_bloodrose.unit'], ['castle']),

  // --- Shaftlocke Tower --------------------------------------------------------
  // Caps follow the castle twin's where the stats match (warriors, archers,
  // maggots; the footman is the soldier and takes Castle's tuned 100). Lower
  // where a unit hits harder than its twin: the sentry is the ranger firing
  // every 450ms instead of 750, the lancer hits twice as hard as a warrior,
  // the defender is a 210 hp elite, and the lich ladder's sorcerer has 250 hp
  // to the castle's 75 (Castle tunes its liches to 20).
  t('prison_warrior', 'Shaftlocke', 100, 0.3, [`${SP}/shaftlocke/spawner_skeleton_prison_warrior.unit`, `${SK}/shaftlocke/skeleton_prison_warrior_weak.unit`, `${SK}/shaftlocke/skeleton_prison_warrior.unit`, `${SK}/shaftlocke/skeleton_prison_warrior_elite.unit`], ['shaftlocke']),
  t('prison_archer', 'Shaftlocke', 40, 0.2, [`${SP}/shaftlocke/spawner_skeleton_prison_archer.unit`, `${SK}/shaftlocke/skeleton_prison_archer.unit`], ['shaftlocke']),
  t('armory_warrior', 'Shaftlocke', 100, 0.3, [`${SP}/shaftlocke/spawner_skeleton_armory_warrior.unit`, `${SK}/shaftlocke/skeleton_armory_warrior_weak.unit`, `${SK}/shaftlocke/skeleton_armory_warrior.unit`, `${SK}/shaftlocke/skeleton_armory_warrior_elite.unit`], ['shaftlocke']),
  t('armory_archer', 'Shaftlocke', 40, 0.2, [`${SP}/shaftlocke/spawner_skeleton_armory_archer.unit`, `${SK}/shaftlocke/skeleton_armory_archer.unit`], ['shaftlocke']),
  t('skeleton_footman', 'Shaftlocke', 100, 0.3, [`${SP}/shaftlocke/spawner_skeleton_footman.unit`, `${SK}/shaftlocke/skeleton_footman_weak.unit`, `${SK}/shaftlocke/skeleton_footman.unit`, `${SK}/shaftlocke/skeleton_footman_elite.unit`], ['shaftlocke']),
  t('skeleton_sentry', 'Shaftlocke', 20, 0.2, [`${SP}/shaftlocke/spawner_skeleton_sentry.unit`, `${SK}/shaftlocke/skeleton_sentry.unit`], ['shaftlocke']),
  t('skeleton_lancer', 'Shaftlocke', 30, 1.0, [`${SK}/shaftlocke/skeleton_lancer.unit`], ['shaftlocke']),
  t('skeleton_defender', 'Shaftlocke', 12, 1.0, [`${SK}/shaftlocke/skeleton_defender.unit`], ['shaftlocke']),
  t('shaftlocke_lich', 'Shaftlocke', 20, 0.2, [`${SP}/shaftlocke/spawner_lich.unit`, `${SK}/shaftlocke/skeleton_lich.unit`, `${SK}/shaftlocke/skeleton_lich_elite.unit`, `${SK}/shaftlocke/skeleton_sorcerer.unit`, `${SK}/shaftlocke/skeleton_necromancer.unit`], ['shaftlocke']),
  t('battlemage', 'Shaftlocke', 6, 1.0, [`${SK}/shaftlocke/battlemage.unit`], ['shaftlocke']),
  t('trapper', 'Shaftlocke', 10, 1.0, [`${SK}/shaftlocke/trapper.unit`], ['shaftlocke']),
  t('crawler', 'Shaftlocke', 40, 1.0, [`${SK}/shaftlocke/crawler.unit`], ['shaftlocke']),
  t('guardian', 'Shaftlocke', 20, 1.0, [`${SK}/shaftlocke/guardian.unit`], ['shaftlocke']),
  t('bannerman_bloodlust', 'Shaftlocke', 6, 1.0, [`${SK}/shaftlocke/bannerman_bloodlust.unit`], ['shaftlocke']),
  t('bannerman_drain', 'Shaftlocke', 6, 1.0, [`${SK}/shaftlocke/bannerman_drain.unit`], ['shaftlocke']),
  t('bannerman_healing', 'Shaftlocke', 6, 1.0, [`${SK}/shaftlocke/bannerman_healing.unit`], ['shaftlocke']),
  t('bannerman_protection', 'Shaftlocke', 6, 1.0, [`${SK}/shaftlocke/bannerman_protection.unit`], ['shaftlocke']),
  t('shaftlocke_maggot', 'Shaftlocke', 80, 0.2, [`${SP}/shaftlocke/spawner_maggot.unit`, 'actors/beasts/maggots/shaftlocke/maggot_grub.unit', 'actors/beasts/maggots/shaftlocke/maggot_giant.unit', 'actors/beasts/maggots/shaftlocke/maggot_devour.unit'], ['shaftlocke']),
  t('shaftlocke_maggot_spiky', 'Shaftlocke', 20, 1.0, ['actors/beasts/maggots/shaftlocke/maggot_spiky.unit'], ['shaftlocke']),
  // a spawner-only type: the cyst is the only actor, so a roll always lands on it
  t('maggot_cyst', 'Shaftlocke', 4, 1.0, [`${SP}/shaftlocke/spawner_maggot_cyst.unit`], ['shaftlocke']),

  // --- Temple of the Sun -------------------------------------------------------
  t('temple_warrior', 'Temple of the Sun', 100, 0.3, [`${SP}/suntemple/spawner_skeleton_warrior.unit`, `${SK}/suntemple/skeleton_warrior_weak.unit`, `${SK}/suntemple/skeleton_warrior.unit`, `${SK}/suntemple/skeleton_warrior_elite.unit`], ['temple']),
  t('temple_soldier', 'Temple of the Sun', 80, 0.3, [`${SP}/suntemple/spawner_skeleton_soldier.unit`, `${SK}/suntemple/skeleton_soldier_weak.unit`, `${SK}/suntemple/skeleton_soldier.unit`, `${SK}/suntemple/skeleton_soldier_elite.unit`], ['temple']),
  t('temple_archer', 'Temple of the Sun', 20, 1.0, [`${SK}/suntemple/skeleton_archer.unit`], ['temple']),
  t('mummy', 'Temple of the Sun', 80, 0.3, [`${SP}/suntemple/spawner_mummy_soldier.unit`, 'actors/undead/mummies/mummy_servant.unit', 'actors/undead/mummies/mummy_soldier.unit', 'actors/undead/mummies/mummy_captain.unit'], ['temple']),
  t('mummy_guard', 'Temple of the Sun', 40, 1.0, ['actors/undead/mummies/mummy_guard.unit'], ['temple']),
  t('mummy_mage', 'Temple of the Sun', 20, 0.2, [`${SP}/suntemple/spawner_mummy_mage.unit`, 'actors/undead/mummies/mummy_mage.unit', 'actors/undead/mummies/mummy_wizard.unit'], ['temple']),
  t('mummy_lich', 'Temple of the Sun', 20, 0.3, ['actors/undead/mummies/mummy_lich_ice.unit', 'actors/undead/mummies/mummy_lich_fire.unit', 'actors/undead/mummies/mummy_lich_healer.unit', 'actors/undead/mummies/mummy_lich_beam.unit'], ['temple']),
  t('beheaded_kamikaze', 'Temple of the Sun', 6, 1.0, ['actors/undead/mummies/special_beheaded_kamikaze.unit'], ['temple']),

  // --- Towers --------------------------------------------------------------
  t('tower_nova_ice', 'Towers', 4, 1.0, ['actors/towers/tower_nova_ice.unit'], ['castle']),
  t('tower_nova_frost', 'Towers', 2, 1.0, ['actors/towers/tower_nova_frost.unit'], ['castle']),
  t('tower_nova_fire', 'Towers', 2, 1.0, ['actors/towers/tower_nova_fire.unit'], ['castle']),
  t('tower_laser_fire', 'Towers', 2, 1.0, ['actors/towers/tower_laser_fire.unit'], ['castle']),
  t('tower_laser_ice', 'Towers', 2, 1.0, ['actors/towers/tower_laser_ice.unit'], ['castle']),
  t('tower_laser_drain', 'Towers', 2, 1.0, ['actors/towers/tower_laser_drain.unit'], ['castle']),
  t('tower_battlement_archer', 'Towers', 6, 1.0, ['actors/towers/tower_battlement_archer.unit'], ['castle']),
  t('tower_battlement_archer_elite', 'Towers', 6, 1.0, ['actors/towers/tower_battlement_archer_elite.unit'], ['castle']),
  t('tower_battlement_archer_desert', 'Towers', 6, 1.0, ['actors/towers/tower_battlement_archer_desert.unit'], ['temple']),
  // 350 hp, never attacks — an obstacle; in no default pool
  t('tower_battlement_empty', 'Towers', 24, 1.0, ['actors/towers/tower_battlement_empty.unit']),
  t('tower_static_frost', 'Towers', 1, 1.0, ['actors/towers/tower_static_frost.unit']),
  t('tower_ballista_javelin', 'Towers', 3, 1.0, ['actors/towers/tower_ballista_javelin.unit'], ['shaftlocke']),
  t('tower_ballista_splitshot', 'Towers', 3, 1.0, ['actors/towers/tower_ballista_splitshot.unit'], ['shaftlocke']),
  t('tower_ballista_trapper', 'Towers', 3, 1.0, ['actors/towers/tower_ballista_trapper.unit'], ['shaftlocke']),
  t('tower_beamo', 'Towers', 3, 1.0, ['actors/towers/tower_beamo.unit'], ['shaftlocke']),
  t('banner_bloodlust', 'Towers', 4, 1.0, ['actors/banners/banner_bloodlust.unit'], ['castle']),
  t('banner_drain', 'Towers', 4, 1.0, ['actors/banners/banner_drain.unit'], ['castle']),
  t('banner_healing', 'Towers', 4, 1.0, ['actors/banners/banner_healing.unit'], ['castle']),
  t('banner_protection', 'Towers', 4, 1.0, ['actors/banners/banner_protection.unit']),

  // --- Mini-bosses -----------------------------------------------------------
  t('mb_tick', 'Mini-bosses', 16, 1.0, ['actors/beasts/ticks/tick_giant.unit'], ['castle']),
  t('mb_maggot', 'Mini-bosses', 4, 1.0, ['actors/beasts/maggots/maggot_mb.unit'], ['castle']),
  t('mb_bat', 'Mini-bosses', 4, 1.0, ['actors/beasts/bats/bat_mb.unit'], ['shaftlocke']),
  t('mb_eye', 'Mini-bosses', 4, 1.0, ['actors/aberrations/eyes/eye_beholder.unit'], ['castle']),
  t('mb_skeleton_guard', 'Mini-bosses', 12, 0.3, [`${SK}/hammerwatch/skeleton_guard.unit`, `${SK}/hammerwatch/skeleton_guard_t2.unit`], ['castle']),
  t('mb_sharpshooter', 'Mini-bosses', 6, 0.3, [`${SK}/hammerwatch/skeleton_sharpshooter.unit`, `${SK}/hammerwatch/skeleton_sharpshooter_t2.unit`], ['castle']),
  t('mb_wizard', 'Mini-bosses', 2, 1.0, [`${SK}/hammerwatch/skeleton_wizard.unit`], ['castle']),
  t('mb_templar', 'Mini-bosses', 2, 1.0, [`${SK}/shaftlocke/skeleton_templar.unit`], ['shaftlocke']),
  t('mb_mummy', 'Mini-bosses', 8, 1.0, ['actors/undead/mummies/mummy_royal.unit'], ['temple']),
  t('mb_ice_troll', 'Mini-bosses', 1, 1.0, ['actors/beasts/trolls/ice_troll_mb.unit']),
  t('mb_doomspawner', 'Mini-bosses', 2, 1.0, [`${SP}/hammerwatch/doomspawner.unit`], ['castle']),

  // --- Bodyguards: guards from the boss rooms (no boss bar, no boss loot) ----
  t('knight_guard', 'Bodyguards', 60, 1.0, ['actors/bosses/boss_knight/boss_guard.unit'], ['castle']),
  t('knight_guard_skeleton', 'Bodyguards', 60, 0.3, ['actors/bosses/boss_knight/boss_guard_skeleton_1_small.unit', 'actors/bosses/boss_knight/boss_guard_skeleton_1.unit'], ['castle']),
  t('knight_guard_archer', 'Bodyguards', 30, 1.0, ['actors/bosses/boss_knight/boss_guard_archer_1.unit'], ['castle']),
  t('knight_guard_lich', 'Bodyguards', 10, 0.3, ['actors/bosses/boss_knight/boss_guard_lich_1.unit', 'actors/bosses/boss_knight/boss_guard_lich_2.unit', 'actors/bosses/boss_knight/boss_guard_lich_3.unit'], ['castle']),
  t('lich_guard_lich', 'Bodyguards', 30, 1.0, ['actors/bosses/boss_lich/boss_guard_lich_1.unit'], ['castle']),
  t('lich_guard_skeleton', 'Bodyguards', 60, 1.0, ['actors/bosses/boss_lich/boss_guard_skeleton_1.unit'], ['castle']),
  t('lich_mirror', 'Bodyguards', 4, 1.0, ['actors/bosses/boss_lich/boss_lich_mirror.unit'], ['castle']),
  t('krilith_frost_guard', 'Bodyguards', 12, 1.0, ['actors/bosses/boss_krilith/frost_guard.unit'], ['temple']),
  t('anubis_mummy_wizard', 'Bodyguards', 20, 1.0, ['actors/bosses/boss_anubis/mummy_wizard_noloot.unit'], ['temple']),
  // Anubis's static fire pillar (HW1's actors/pillar_fire.xml)
  t('pillar_fire', 'Bodyguards', 20, 1.0, ['actors/bosses/boss_anubis/pillar_fire.unit'], ['temple']),
  t('vampire_thrall', 'Bodyguards', 8, 0.5, ['actors/bosses/boss_vampire/thrall.unit', 'actors/bosses/boss_vampire/thrall_leaper.unit'], ['shaftlocke']),
  t('vampire_bat', 'Bodyguards', 40, 1.0, ['actors/bosses/boss_vampire/bat_vampire.unit'], ['shaftlocke']),
  t('eye_add', 'Bodyguards', 20, 0.3, ['actors/bosses/boss_eye/add_eye_yellow.unit', 'actors/bosses/boss_eye/add_eye_green.unit', 'actors/bosses/boss_eye/add_eye_blue.unit', 'actors/bosses/boss_eye/add_eye_red.unit'], ['shaftlocke']),

  // --- Bonus levels ------------------------------------------------------------
  t('bonus_ghost', 'Bonus', 300, 1.0, [`${SP}/hammerwatch/spawner_bonus_ghost.unit`, 'actors/special/bonus/bonus_ghost.unit']),
  t('bonus_demon', 'Bonus', 60, 1.0, [`${SP}/hammerwatch/spawner_bonus_demon.unit`, 'actors/special/bonus/bonus_demon.unit']),

  // --- Mini-bosses: Shaftlocke's own copies (appended) -------------------------
  // Shaftlocke's wizard is its own fight, not the castle one: 1750 hp, 25%
  // magic evade, fireball bursts, glyph traps and a blink.
  t('mb_shaftlocke_wizard', 'Mini-bosses', 2, 1.0, [`${SK}/shaftlocke/skeleton_wizard.unit`], ['shaftlocke']),
  // the castle guard in a blue coat — identical otherwise
  t('mb_shaftlocke_guard', 'Mini-bosses', 12, 1.0, [`${SK}/shaftlocke/skeleton_guard.unit`], ['shaftlocke']),
  // the castle maggot mini-boss, spawning Shaftlocke grubs
  t('mb_shaftlocke_maggot', 'Mini-bosses', 4, 1.0, ['actors/beasts/maggots/shaftlocke/maggot_mb.unit'], ['shaftlocke'])
]

/**
 * The members of `group` as the GUI should list them: deprecated types
 * dropped, the rest sorted by id (MONSTER_TYPES itself is append-only).
 */
export function monsterTypesInGroup(group: MonsterGroup): MonsterTypeDef[] {
  return MONSTER_TYPES.filter((m) => m.group === group && !m.deprecated).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )
}

/** Which filter categories a type belongs to, in MONSTER_CATEGORIES order. Never empty. */
export function monsterCategories(type: MonsterTypeDef): MonsterCategory[] {
  if (type.campaigns === undefined || type.campaigns.length === 0) return ['Other']
  const set = new Set(type.campaigns.map((c) => CAMPAIGN_CATEGORY[c]))
  return MONSTER_CATEGORIES.filter((c) => set.has(c))
}

const byId = new Map(MONSTER_TYPES.map((m) => [m.id, m]))

/** Look up a monster by its plain id; falls back to the first type. */
export function monsterTypeById(id: string): MonsterTypeDef {
  return byId.get(id) ?? MONSTER_TYPES[0]
}

export function isKnownMonsterId(id: string): boolean {
  return byId.has(id)
}

//==============================================
// Variants — one selectable entry per actor path
//==============================================

/**
 * Separates a monster id from an explicit tier index in a pool key:
 * `bat#0` is the bats spawner, `skeleton_archer#2` the elite archer.
 */
const VARIANT_SEPARATOR = '#'

/** The tier a BARE monster id resolves to in a boss wave: index 1, clamped for single-tier types. */
export function defaultTier(type: MonsterTypeDef): number {
  return Math.min(1, type.tiers.length - 1)
}

/** One selectable actor: a monster type at a specific tier. */
export interface MonsterVariant {
  /** canonical pool key: the bare id for `defaultTier`, `id#tier` otherwise */
  key: string
  type: MonsterTypeDef
  tier: number
  actorPath: string
  /** a spawner prop rather than a creature */
  role: 'spawner' | 'creature'
  /** what it leaves behind when killed; undefined for anything that leaves gibs */
  corpse?: CorpseCollision
}

export function variantKey(type: MonsterTypeDef, tier: number): string {
  return tier === defaultTier(type) ? type.id : `${type.id}${VARIANT_SEPARATOR}${tier}`
}

/**
 * Spawners that do not live under `actors/spawners/`: the slime blobs are
 * static hives that burst into small slimes.
 */
const NON_PREFIXED_SPAWNERS = new Set([
  'actors/aberrations/slimes/slime_blob.unit',
  'actors/aberrations/slimes/blood/slime_blob.unit'
])

export function isSpawnerPath(actorPath: string): boolean {
  return actorPath.startsWith('actors/spawners/') || NON_PREFIXED_SPAWNERS.has(actorPath)
}

/** Every actor `type` can spawn, one variant per tier, in tier order. */
export function monsterVariants(type: MonsterTypeDef): MonsterVariant[] {
  return type.tiers.map((actorPath, tier) => ({
    key: variantKey(type, tier),
    type,
    tier,
    actorPath,
    role: isSpawnerPath(actorPath) ? 'spawner' : 'creature',
    corpse: corpseCollision(actorPath)
  }))
}

/** Splits a pool key into id and explicit tier (undefined = bare, NaN = malformed). Never throws. */
export function parseMonsterKey(key: string): { id: string; tier?: number } {
  const at = key.indexOf(VARIANT_SEPARATOR)
  if (at === -1) return { id: key }
  const raw = key.slice(at + 1)
  return { id: key.slice(0, at), tier: /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN }
}

/** The actor unit a pool key spawns; always a real path (falls back to defaultTier). */
export function resolveActorPath(key: string): string {
  const { id, tier } = parseMonsterKey(key)
  const type = monsterTypeById(id)
  if (tier === undefined || !Number.isInteger(tier) || tier < 0 || tier >= type.tiers.length) {
    return type.tiers[defaultTier(type)]
  }
  return type.tiers[tier]
}

/** True for a canonical pool key only (`bat#1` is the non-canonical spelling of `bat`). */
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
 * A group of SEPARATE monster types a floor can pool as one entry: a
 * `tower_nova` pool key spawns a mix of the three nova towers. Its own registry
 * rather than a type whose tiers are the members, because createRolled starts
 * at tier 1 (a family-as-tiers would never emit its first member) and the
 * arena's variant picker would offer each member twice.
 */
export interface MonsterFamilyDef {
  /** pool key AND `monsterMax` key, e.g. `tower_nova` */
  id: string
  configKey: string
  /** member type ids, in picker order */
  members: string[]
  defaultMax: number
  group: MonsterGroup
}

function f(id: string, group: MonsterGroup, defaultMax: number, members: string[]): MonsterFamilyDef {
  return { id, configKey: `max_${id}`, defaultMax, group, members }
}

export const MONSTER_FAMILIES: MonsterFamilyDef[] = [
  f('tower_nova', 'Towers', 4, ['tower_nova_ice', 'tower_nova_frost', 'tower_nova_fire']),
  f('tower_laser', 'Towers', 2, ['tower_laser_fire', 'tower_laser_ice', 'tower_laser_drain']),
  f('tower_battlement', 'Towers', 6, ['tower_battlement_archer', 'tower_battlement_archer_elite', 'tower_battlement_archer_desert']),
  f('tower_ballista', 'Towers', 3, ['tower_ballista_javelin', 'tower_ballista_splitshot', 'tower_ballista_trapper']),
  f('flower', 'Towers', 6, ['flower_small', 'flower_eater', 'flower_blood', 'flower_bloodrose']),
  f('banner', 'Towers', 4, ['banner_bloodlust', 'banner_drain', 'banner_healing', 'banner_protection']),
  f('bannerman', 'Shaftlocke', 6, ['bannerman_bloodlust', 'bannerman_drain', 'bannerman_healing', 'bannerman_protection'])
]

const familyById = new Map(MONSTER_FAMILIES.map((fam) => [fam.id, fam]))
const familyByMember = new Map(MONSTER_FAMILIES.flatMap((fam) => fam.members.map((m) => [m, fam] as const)))

export function monsterFamilyById(id: string): MonsterFamilyDef | undefined {
  return familyById.get(id)
}

export function isKnownFamilyId(id: string): boolean {
  return familyById.has(id)
}

export function familyOfMember(typeId: string): MonsterFamilyDef | undefined {
  return familyByMember.get(typeId)
}

/** A family's member types, in `members` order; unknown ids dropped (a test catches them). */
export function familyMembers(family: MonsterFamilyDef): MonsterTypeDef[] {
  return family.members.map((id) => byId.get(id)).filter((m): m is MonsterTypeDef => m !== undefined)
}

//==============================================
// Floor pool keys
//==============================================

/**
 * A dungeon floor's pool entry. On a floor a bare id means "roll the ladder",
 * so `skeleton_warrior` and `skeleton_warrior#1` are BOTH legal here (unlike the
 * arena's canonical key, see isKnownMonsterKey).
 */
export function isKnownFloorPoolKey(key: string): boolean {
  const { id, tier } = parseMonsterKey(key)
  if (isKnownFamilyId(id)) return tier === undefined
  if (!isKnownMonsterId(id)) return false
  if (tier === undefined) return true
  const type = byId.get(id)!
  return Number.isInteger(tier) && tier >= 0 && tier < type.tiers.length
}

/** The tier a floor pool entry pins, or undefined when it rolls. Total on bad input. */
export function floorPoolTier(key: string): number | undefined {
  const { id, tier } = parseMonsterKey(key)
  if (tier === undefined || !Number.isInteger(tier) || tier < 0) return undefined
  const type = byId.get(id)
  if (!type || tier >= type.tiers.length) return undefined
  return tier
}

/** One entry a floor pool picker can offer. */
export interface FloorPoolEntry {
  /** a family id, a bare type id, or `id#tier` */
  key: string
  /** the type spawned; a family entry's first member (read `family` to tell them apart) */
  type: MonsterTypeDef
  family?: MonsterFamilyDef
  tier?: number
  actorPath?: string
  role: 'spawner' | 'creature' | 'rolled' | 'family'
  corpse?: CorpseCollision
}

export function floorPoolFamilyEntry(family: MonsterFamilyDef): FloorPoolEntry | undefined {
  const members = familyMembers(family)
  if (members.length === 0) return undefined
  return { key: family.id, type: members[0], family, role: 'family' }
}

/** Which row group an entry belongs to in the picker: its family's id, else its own. */
export function floorPoolBucketId(entry: FloorPoolEntry): string {
  if (entry.family) return entry.family.id
  return familyOfMember(entry.type.id)?.id ?? entry.type.id
}

/** The rolled entry first, then one pinned entry per tier (single-tier types: rolled only). */
export function floorPoolEntries(type: MonsterTypeDef): FloorPoolEntry[] {
  const rolled: FloorPoolEntry = { key: type.id, type, role: 'rolled' }
  if (type.tiers.length < 2) return [rolled]
  return [
    rolled,
    ...monsterVariants(type).map((v) => ({
      key: `${type.id}${VARIANT_SEPARATOR}${v.tier}`,
      type,
      tier: v.tier,
      actorPath: v.actorPath,
      role: v.role,
      corpse: v.corpse
    }))
  ]
}

export function floorPoolGroup(entry: FloorPoolEntry): MonsterVariantGroup {
  if (entry.family) return entry.family.group
  return entry.role === 'spawner' ? 'Spawners' : entry.type.group
}

export function floorPoolEntriesInGroup(group: MonsterVariantGroup): FloorPoolEntry[] {
  const families = MONSTER_FAMILIES.map(floorPoolFamilyEntry).filter((e): e is FloorPoolEntry => e !== undefined)
  return [...MONSTER_TYPES.filter((m) => !m.deprecated).flatMap(floorPoolEntries), ...families]
    .filter((e) => floorPoolGroup(e) === group)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/**
 * What a variant does in game, for the picker tooltips — only where the name
 * gives nothing away. Keyed by canonical key; `monsterNote` falls back to the id.
 */
export const MONSTER_NOTES: Record<string, string> = {
  skeleton_lich: 'elite lich — heat-seeking orb shooter',
  'skeleton_lich#0': 'lich — heat-seeking orb shooter',
  'skeleton_lich#2': 'sorcerer — frost spitter',
  'skeleton_lich#3': 'necromancer — raises skeletons',
  mummy_lich: 'fire lich — fire and daze; the daze inverts your controls',
  'mummy_lich#0': 'ice lich — ice spammer',
  'mummy_lich#2': 'healer lich',
  'mummy_lich#3': 'beam lich',
  tick_gold: 'golden tick — drops a lot of gold',
  tick_exploding: 'bursts into fire or poison when it dies',
  tower_battlement_empty: '350 hp battlement — blocks your way, never attacks',
  tower_static_frost: 'inert 2000 hp barrier — its wreck stays solid',
  maggot_cyst: 'Shaftlocke maggot cyst — a 265 hp spawner',
  crawler: 'Shaftlocke crawler — fast, 15 hp',
  guardian: '150 hp shielded guard',
  trapper: 'throws nets that root you',
  battlemage: '275 hp caster — the toughest Shaftlocke regular',
  knight_guard: "the Knight's 150 hp guard",
  lich_mirror: "the Lich's 50 hp mirror image",
  krilith_frost_guard: "Krilith's 400 hp frost guard",
  vampire_thrall: "the Vampire's 400 hp thralls",
  eye_add: "the Eye's coloured adds",
  mb_doomspawner: '2500 hp spawner that pours out undead',
  mb_shaftlocke_wizard: "Shaftlocke's 1750 hp wizard — fireball bursts, glyph traps, blinks",
  mb_shaftlocke_guard: 'the castle skeleton guard in a blue coat',
  mb_shaftlocke_maggot: 'the maggot mini-boss, spawning Shaftlocke grubs'
}

export function monsterNote(key: string): string | undefined {
  return MONSTER_NOTES[key] ?? MONSTER_NOTES[parseMonsterKey(key).id]
}

/**
 * Display groups for a variant picker; spawners get their own group because
 * they are static buildings, like towers.
 */
export const MONSTER_VARIANT_GROUPS = [...MONSTER_GROUPS, 'Spawners'] as const

export type MonsterVariantGroup = (typeof MONSTER_VARIANT_GROUPS)[number]

export function variantGroup(variant: MonsterVariant): MonsterVariantGroup {
  return variant.role === 'spawner' ? 'Spawners' : variant.type.group
}

export function monsterVariantsInGroup(group: MonsterVariantGroup): MonsterVariant[] {
  return MONSTER_TYPES.filter((m) => !m.deprecated)
    .flatMap(monsterVariants)
    .filter((v) => variantGroup(v) === group)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

//==============================================
// Arena bodyguard twins
//==============================================

/**
 * Near-duplicate actors under `actors/bosses/*` that stand in for an ordinary
 * roster actor when used INSIDE a boss arena (more aggro, no loot). Keyed and
 * valued by actor path. Pairs taken from hw2ae's HW1→AE table, whose HW1 twins
 * map to these AE units.
 */
export const ARENA_BODYGUARD_TWINS: Readonly<Record<string, string>> = {
  [`${SK}/hammerwatch/skeleton_archer.unit`]: 'actors/bosses/boss_knight/boss_guard_archer_1.unit',
  [`${SK}/hammerwatch/skeleton_warrior.unit`]: 'actors/bosses/boss_knight/boss_guard_skeleton_1.unit',
  [`${SK}/hammerwatch/skeleton_warrior_weak.unit`]: 'actors/bosses/boss_knight/boss_guard_skeleton_1_small.unit',
  [`${SK}/hammerwatch/skeleton_runner.unit`]: 'actors/bosses/boss_lich/boss_guard_skeleton_1.unit',
  'actors/undead/mummies/mummy_wizard.unit': 'actors/bosses/boss_anubis/mummy_wizard_noloot.unit'
}

export function arenaActorPath(actorPath: string): string {
  return Object.prototype.hasOwnProperty.call(ARENA_BODYGUARD_TWINS, actorPath)
    ? ARENA_BODYGUARD_TWINS[actorPath]
    : actorPath
}

export function resolveArenaActorPath(key: string, useTwins: boolean): string {
  const path = resolveActorPath(key)
  return useTwins ? arenaActorPath(path) : path
}
