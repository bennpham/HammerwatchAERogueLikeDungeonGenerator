/**
 * HW1 → Anniversary Edition substitutions: every id the HW1 remake used for a
 * monster, theme or music cue, and what it means in this AE tool.
 *
 * Two uses: the one-off migration of the remake's presets onto AE ids, and
 * translating an old HW1-remake parameters file when one is imported. The
 * user's rule applies throughout: a monster, projectile or track AE does not
 * have is REPLACED with the nearest AE one, never dropped — `reason` says why
 * where the pairing is not an exact AE counterpart.
 *
 * Exact counterparts follow hw2ae's table, which matched HW1 actors to AE
 * units on identical hp.
 */
import { DEFAULT_LOBBY_PRESET_ID } from '../lobby/presets'

export interface Substitution {
  ae: string
  reason?: string
}

/** HW1 monster pool key (bare id or `id#tier`) → AE pool key. */
export const MONSTER_SUBSTITUTIONS: Readonly<Record<string, Substitution>> = {
  // exact ladders (same tier order): the suffix carries over unchanged
  archer1: { ae: 'skeleton_archer' },
  archer2: { ae: 'skeleton_ranger' },
  archer3: { ae: 'temple_archer' },
  bat1: { ae: 'bat' },
  eye: { ae: 'eye' },
  lich: { ae: 'skeleton_lich' },
  lich_desert: { ae: 'mummy_lich' },
  maggot: { ae: 'maggot' },
  mummy_ranged: { ae: 'mummy_mage' },
  skeleton1: { ae: 'skeleton_warrior' },
  skeleton2: { ae: 'skeleton_soldier' },
  skeleton3: { ae: 'skeleton_runner' },
  slime: { ae: 'slime' },
  tick1: { ae: 'tick' },
  tick2: { ae: 'tick_gold' },
  tower_static_frost: { ae: 'tower_static_frost' },
  pillar_fire: { ae: 'pillar_fire' },
  special_beheaded_kamikaze: { ae: 'beheaded_kamikaze' },
  mb_eye: { ae: 'mb_eye' },
  mb_maggot: { ae: 'mb_maggot' },
  mb_mummy: { ae: 'mb_mummy' },
  mb_tick: { ae: 'mb_tick' },
  knight_guard: { ae: 'knight_guard' },
  lich_guard_lich: { ae: 'lich_guard_lich' },
  lich_mirror: { ae: 'lich_mirror' },
  // renamed single actors
  mb_doomspawn: { ae: 'mb_doomspawner' },
  mb_lich: { ae: 'mb_wizard', reason: "HW1 lich_1_mb is AE's skeleton_wizard (same bestiary entry)" },
  mb_skeleton: { ae: 'mb_skeleton_guard#0', reason: "HW1 skeleton_1_mb is AE's skeleton_guard (bestiary .enemy.skeleton_1_mb)" },
  krilith_mb_skeleton: { ae: 'krilith_frost_guard' },
  bonus_skeleton1: { ae: 'bonus_ghost' },
  bonus_archer1: { ae: 'bonus_demon' },
  tower_empty: { ae: 'tower_battlement_empty' },
  tower_archer2: { ae: 'tower_battlement_empty', reason: 'HW1 phantom entry, already pointed at the empty battlement' },
  tower_archer1: { ae: 'tower_battlement_archer' },
  tower_archer3: { ae: 'tower_battlement_archer_elite' },
  tower_archer: { ae: 'tower_battlement' },
  tower_banner1: { ae: 'banner_bloodlust' },
  tower_banner2: { ae: 'banner_drain' },
  tower_banner3: { ae: 'banner_healing' },
  tower_banner: { ae: 'banner' },
  tower_flower1: { ae: 'flower_eater' },
  tower_flower1_small: { ae: 'flower_small' },
  tower_flower2: { ae: 'flower_blood' },
  tower_flower3: { ae: 'flower_bloodrose' },
  tower_flower: { ae: 'flower' },
  tower_nova1: { ae: 'tower_nova_ice' },
  tower_nova2: { ae: 'tower_nova_frost' },
  tower_nova: { ae: 'tower_nova' },
  tower_tracking1: { ae: 'tower_laser_fire' },
  tower_tracking2: { ae: 'tower_laser_ice' },
  tower_tracking3: { ae: 'tower_laser_drain' },
  tower_tracking: { ae: 'tower_laser' },
  // ladders whose AE order differs: every tier spelled out
  bat2: { ae: 'bat', reason: 'HW1 bat2 rolled bat_2/bat_3, which are AE bat_fast/bat_white (bat#2, bat#3)' },
  'bat2#0': { ae: 'bat#0' },
  'bat2#1': { ae: 'bat#2' },
  'bat2#2': { ae: 'bat#3' },
  mummy_desert: { ae: 'mummy' },
  'mummy_desert#0': { ae: 'mummy#0' },
  'mummy_desert#1': { ae: 'mummy#2', reason: 'HW1 mummy_1 (tier 1) is AE mummy_soldier, tier 2 of the AE ladder' },
  'mummy_desert#2': { ae: 'mummy#1', reason: 'HW1 mummy_1_small (tier 2) is AE mummy_servant, tier 1' },
  'mummy_desert#3': { ae: 'mummy#3' },
  wisp1: { ae: 'wisp' },
  'wisp1#0': { ae: 'wisp#0' },
  'wisp1#1': { ae: 'wisp#1' },
  'wisp1#2': { ae: 'wisp#2' },
  wisp2: { ae: 'wisp#3', reason: 'HW1 wisp_2 is AE wisp_red' },
  spider: { ae: 'spider#0' },
  guard_desert: { ae: 'mummy_guard', reason: 'AE has no desert guard NPC enemy; the mummy guard is the Temple melee guard' },
  guard_desert_range: { ae: 'mummy_guard', reason: "HW1 guard_desert_1 is AE's mummy_guard" },
  floater_fire: { ae: 'wisp#3', reason: 'AE has no fire floater; the red wisp is the nearest fire-flavoured flyer' }
}

/** Translate one HW1 pool key; unknown keys are returned unchanged (validation reports them). */
export function translateMonsterKey(key: string): string {
  const exact = MONSTER_SUBSTITUTIONS[key]
  if (exact !== undefined) return exact.ae
  const at = key.indexOf('#')
  if (at === -1) return key
  const base = MONSTER_SUBSTITUTIONS[key.slice(0, at)]
  if (base === undefined || base.ae.includes('#')) return key
  return `${base.ae}${key.slice(at)}`
}

/** HW1 theme id (letter, overlay or `_mixed` entry) → AE theme id. */
export const THEME_SUBSTITUTIONS: Readonly<Record<string, Substitution>> = {
  a: { ae: 'prison' },
  b: { ae: 'armory' },
  c: { ae: 'archives' },
  d: { ae: 'chambers' },
  e: { ae: 'cave_desert', reason: "hw2ae's theme table: HW1 e walls are AE cave_desert" },
  f: { ae: 'cave_crystal' },
  g: { ae: 'pyramid_inside' },
  h: { ae: 'cave_desert', reason: 'AE ships no outdoor desert cliff set as walls; the desert cave is the nearest' },
  i: { ae: 'pyramid_fancy' },
  bonus1: { ae: 'bonus1' },
  bonus2: { ae: 'bonus2' },
  bonus3: { ae: 'bonus3' },
  bonus4: { ae: 'bonus4' },
  bonus5: { ae: 'bonus5' }
}

/** Translate an HW1 theme id: `c_tiles`, `d_mixed` and `c` all become `archives`. */
export function translateTheme(id: string): string {
  const base = /^bonus\d$/.test(id) ? id : id.split('_')[0]
  return THEME_SUBSTITUTIONS[base]?.ae ?? id
}

/** HW1 music cue id → AE music track id (music/tracks.ts). */
export const MUSIC_SUBSTITUTIONS: Readonly<Record<string, Substitution>> = {
  bonus_1: { ae: 'bonus' },
  bonus_2: { ae: 'bonus' },
  boss_killed: { ae: 'boss_1', reason: "AE's boss-killed stinger is an FMOD event, not a music mode" },
  custom_1: { ae: 'main', reason: 'HW1 custom tracks have no AE music mode' },
  custom_2: { ae: 'main', reason: 'HW1 custom tracks have no AE music mode' },
  desert_cavern: { ae: 'temple_boss' },
  desert_temple: { ae: 'temple_hub' },
  desert_village: { ae: 'temple_hub' }
}

export function translateMusic(id: string): string {
  return MUSIC_SUBSTITUTIONS[id]?.ae ?? id
}

/** The HW1 remake's parameters-file cap keys (`maxBats1=`), by HW1 monster id. */
export const HW1_MONSTER_CONFIG_KEYS: Readonly<Record<string, string>> = {
  maxArchers1: 'archer1',
  maxArchers2: 'archer2',
  maxArchers3: 'archer3',
  maxBats1: 'bat1',
  maxBats2: 'bat2',
  maxEyes: 'eye',
  maxFloater_Fires: 'floater_fire',
  maxGuards_Desert: 'guard_desert',
  maxGuards_Desert_Range: 'guard_desert_range',
  maxLiches: 'lich',
  maxLiches_Desert: 'lich_desert',
  maxMaggots: 'maggot',
  maxMummies: 'mummy_desert',
  maxMummies_Ranged: 'mummy_ranged',
  maxPillar_Fires: 'pillar_fire',
  maxSkeletons1: 'skeleton1',
  maxSkeletons2: 'skeleton2',
  maxSkeletons3: 'skeleton3',
  maxSlimes: 'slime',
  maxSpecial_Beheaded_Kamikazes: 'special_beheaded_kamikaze',
  maxSpiders: 'spider',
  maxTicks1: 'tick1',
  maxTicks2: 'tick2',
  maxTowers_Banner1: 'tower_banner1',
  maxTowers_Banner2: 'tower_banner2',
  maxTowers_Banner3: 'tower_banner3',
  maxTowers_Archer1: 'tower_archer1',
  maxTowers_Archer3: 'tower_archer3',
  maxTowers_Empty: 'tower_empty',
  maxTowers_Flower1: 'tower_flower1',
  maxTowers_Flower1_Small: 'tower_flower1_small',
  maxTowers_Flower2: 'tower_flower2',
  maxTowers_Flower3: 'tower_flower3',
  maxTowers_Nova1: 'tower_nova1',
  maxTowers_Nova2: 'tower_nova2',
  maxTowers_Static_Frost: 'tower_static_frost',
  maxTowers_Tracking1: 'tower_tracking1',
  maxTowers_Tracking2: 'tower_tracking2',
  maxTowers_Tracking3: 'tower_tracking3',
  maxWisps1: 'wisp1',
  maxWisps2: 'wisp2',
  maxMB_Doomspawns: 'mb_doomspawn',
  maxMB_Eyes: 'mb_eye',
  maxMB_Liches: 'mb_lich',
  maxMB_Maggots: 'mb_maggot',
  maxMB_Mummies: 'mb_mummy',
  maxMB_Skeletons: 'mb_skeleton',
  maxMB_Ticks: 'mb_tick',
  maxBonus_Skeletons1: 'bonus_skeleton1',
  maxBonus_Archers1: 'bonus_archer1',
  maxKnight_Guards: 'knight_guard',
  maxLich_Guard_Liches: 'lich_guard_lich',
  maxLich_Mirrors: 'lich_mirror',
  maxKrilith_MB_Skeletons: 'krilith_mb_skeleton',
  maxTowers_Archer2: 'tower_archer2',
  maxTowers_Archer: 'tower_archer',
  maxTowers_Banner: 'tower_banner',
  maxTowers_Flower: 'tower_flower',
  maxTowers_Nova: 'tower_nova',
  maxTowers_Tracking: 'tower_tracking'
}

/** Keys whose value lists monster pool keys (pools, waves, mystery squads). */
const MONSTER_LIST_KEY = /^(monsters\d+|level\d+Monsters|boss\d*Wave\d+|bossFloor\d+Wave\d+|bosswave\d+|boss\d+SurvivalWaves|mysteryButton\d+Monsters|.*SquadMonsters)$/i
/** The HW1 remake's two placeholder lobbies both become the default lobby now. */
const LOBBY_PRESET_KEY = /^lobby\d+Preset$/i
const THEME_KEY = /^(themes|.*Theme)$/
const MUSIC_KEY = /^(music\d+|.*Music)$/
const MONSTER_TOKEN = /[a-z][a-z0-9_]*(?:#\d+)?/g

/**
 * Rewrite an HW1-remake parameters file into AE ids, line by line: theme
 * lists, music tracks, monster pools and waves, and the old `maxBats1=` cap
 * keys (which become `max_bat=`). Lines in AE form pass through unchanged, so
 * this is safe to run on every file. Only monster-bearing keys have their
 * tokens translated, so free text (a mystery button's announcement) is never
 * touched.
 */
export function translateLegacyParametersText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq <= 0 || line.trimStart().startsWith('#')) return line
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1)
      const hw1 = HW1_MONSTER_CONFIG_KEYS[key]
      if (hw1 !== undefined) return `max_${translateMonsterKey(hw1).split('#')[0]}=${value}`
      if (THEME_KEY.test(key)) return `${line.slice(0, eq + 1)}${value.split(',').map((t) => translateTheme(t.trim())).join(',')}`
      if (MUSIC_KEY.test(key)) return `${line.slice(0, eq + 1)}${translateMusic(value.trim())}`
      if (LOBBY_PRESET_KEY.test(key) && /^BETA-/.test(value.trim())) return `${line.slice(0, eq + 1)}${DEFAULT_LOBBY_PRESET_ID}`
      if (MONSTER_LIST_KEY.test(key)) {
        return `${line.slice(0, eq + 1)}${value.replace(MONSTER_TOKEN, (tok) =>
          tok.split('#')[0] in MONSTER_SUBSTITUTIONS ? translateMonsterKey(tok) : tok
        )}`
      }
      return line
    })
    .join('\n')
}

