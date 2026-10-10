/**
 * Buffs a `DangerArea` can apply — Anniversary Edition's named buffs in
 * `actors/buffs.sval`, referenced as `actors/buffs.sval:<name>` from the
 * area's `Buff` parameter. [VERIFIED] the reference form against stock
 * DangerAreas (`actors/buffs.sval:vampire-rage`).
 *
 * Numbers in the descriptions were read off buffs.sval with
 * `scripts/dev/buff-survey.ts` (2026-10-09): duration in ms, speed and damage
 * multipliers, tick frequency for damage-over-time.
 *
 * Ids are kept from the HW1 remake where AE has the same buff; a retired HW1
 * buff keeps its id and stands in with the closest AE one (`substitutes`), so
 * saved floors keep loading.
 */

export interface BuffDef {
  /** Stable id used in parameters. */
  id: string
  /** What NodeDangerArea.buff carries: `actors/buffs.sval:<name>`. */
  path: string
  label: string
  group: string
  description: string
  /** the HW1 buff this stands in for */
  substitutes?: string
}

/**
 * Buffs that make the target STRONGER — aimed at monsters they make a floor
 * harder; aimed at players, easier. Validation warns on a mismatched target.
 */
export const BUFF_HELPFUL_IDS: readonly string[] = [
  'bloodlust',
  'banner_bloodlust',
  'bloodlust_shaman',
  'banner_healing',
  'test',
  'protection',
  'anti_protection_2'
]

function b(id: string, name: string, label: string, group: string, description: string, substitutes?: string): BuffDef {
  const def: BuffDef = { id, path: `actors/buffs.sval:${name}`, label, group, description }
  if (substitutes !== undefined) def.substitutes = substitutes
  return def
}

const OFFENSIVE = 'Offensive'
const RESTORATIVE = 'Restorative'
const SLOW = 'Slow & freeze'
const DOT = 'Damage over time'
const CONTROL = 'Control'

/** Every buff, in dropdown order (grouped). */
export const BUFF_DEFS: readonly BuffDef[] = [
  // --- Offensive ---------------------------------------------------------------
  b('bloodlust', 'bloodlust', 'Bloodlust', OFFENSIVE, '+50% damage and +50% speed for 2s.'),
  b('banner_bloodlust', 'banner_bloodlust', 'Bloodlust banner', OFFENSIVE, '+50% damage and +50% speed for 0.5s — lasts as long as the target stands in the field.'),
  b('bloodlust_shaman', 'bloodlust-shaman', 'Shaman bloodlust', OFFENSIVE, '+50% damage and +50% speed for 5s.'),
  b('anti_protection_2', 'anti-protection-2', 'Double damage', OFFENSIVE, 'x2 damage dealt for 2s.'),
  b('protection', 'protection', 'Protection', OFFENSIVE, '40% less damage taken, double armor and resistance, 0.5s.'),
  b('anti_protection', 'anti-protection', 'Vulnerable', OFFENSIVE, 'x2 damage taken for 2s.'),

  // --- Restorative -------------------------------------------------------------
  b('banner_healing', 'banner_healing', 'Healing banner', RESTORATIVE, 'Heals every second for 1.5s.'),
  b('test', 'banner_healing', 'Healing', RESTORATIVE, 'Heals every second — the healing banner.', 'HW1 buffs/test.xml (the only HW1 buff that healed)'),

  // --- Slow & freeze -----------------------------------------------------------
  b('frost', 'frost', 'Frost', SLOW, 'Half speed for 5s.'),
  b('trap_frost', 'trap_frost', 'Frost trap', SLOW, '90% slower for 5s.'),
  b('freezing', 'freezing', 'Freezing', SLOW, '34% slower for 2.5s.'),
  b('freezing_strong', 'freezing_strong', 'Deep freeze', SLOW, 'Half speed for 2.5s.'),
  b('enemy_tower_icebeam', 'enemy_tower_icebeam', 'Ice beam chill', SLOW, '60% slower for 5s.'),
  b('enemy_boss_krilith_v2', 'enemy_boss_krilith_v2', "Krilith's chill", SLOW, '25% slower for 1.5s.'),
  b('enemy_boss_krilith_v1', 'enemy_boss_krilith_v2', "Krilith's chill", SLOW, '25% slower for 1.5s.', 'HW1 enemy_boss_krilith_v1'),
  b('enemy_boss_krilith_wave', 'enemy_boss_krilith_wave', 'Krilith wave', SLOW, '80% slower for 2s.'),
  b('bomb_boss_krilith', 'bomb_boss_krilith', 'Krilith bomb', SLOW, '20% slower for 3s.'),
  b('bomb_lich_desert_1', 'bomb_lich_desert_1', 'Ice lich bomb', SLOW, '20% slower for 3s.'),
  b('spider_1', 'spider_1', 'Spider bite', SLOW, 'Half speed for 2.5s.'),
  b('trap_quicksand', 'quicksand', 'Quicksand', SLOW, '40% slower while standing in it.', 'HW1 trap_quicksand'),
  b('trapper_net', 'trapper_net', 'Trapper net', SLOW, 'Half speed for 2.5s.'),
  b('cripple', 'trapper_net', 'Cripple', SLOW, 'Half speed for 2.5s — the trapper net.', 'HW1 cripple'),
  b('priest_cripple_1', 'freezing', 'Cripple (light)', SLOW, '34% slower for 2.5s.', 'HW1 priest_cripple_1'),
  b('priest_cripple_2', 'frost', 'Cripple (medium)', SLOW, 'Half speed for 5s.', 'HW1 priest_cripple_2'),
  b('priest_cripple_3', 'trap_frost', 'Cripple (heavy)', SLOW, '90% slower for 5s.', 'HW1 priest_cripple_3'),

  // --- Damage over time ----------------------------------------------------------
  b('burning', 'burning', 'Burning', DOT, 'Fire damage every second for 5s.'),
  b('burning_strong', 'burning_strong', 'Burning (strong)', DOT, 'Heavy fire damage every second for 5s.'),
  b('shooter_fireball_burn', 'burning', 'Burning', DOT, 'Fire damage every second for 5s.', 'HW1 shooter_fireball_burn'),
  b('shooter_fireball_2', 'burning_strong', 'Burning (strong)', DOT, 'Heavy fire damage every second for 5s.', 'HW1 shooter_fireball_2 burn'),
  b('wisp_1_burn', 'burning', 'Burning', DOT, 'Fire damage every second for 5s.', 'HW1 wisp_1_burn'),
  b('lich_1_mb_burn', 'lich_1_mb_burn', 'Wizard burn', DOT, 'Fire damage every second for 5s.'),
  b('enemy_tower_firebeam', 'enemy_tower_firebeam', 'Fire beam burn', DOT, 'Fire damage every second for 5s.'),
  b('enemy_pillar_fire', 'enemy_pillar_fire', 'Fire pillar', DOT, 'Fire damage every second for 10s.'),
  b('enemy_pillar_fire_self', 'enemy_pillar_fire', 'Fire pillar', DOT, 'Fire damage every second for 10s.', 'HW1 enemy_pillar_fire_self'),
  b('trap_firespray', 'trap_firespray', 'Fire spray', DOT, 'Fire damage every second for 5s.'),
  b('trap_floor_fire_burn', 'trap_floor_fire_burn', 'Floor fire', DOT, 'Fire damage every second for 5s.'),
  b('poison', 'poison', 'Poison', DOT, 'Poison damage every second and 30% slower, 4s.'),
  b('poison_strong', 'poison_strong', 'Poison (strong)', DOT, 'Heavy poison every second and 30% slower, 4s.'),
  b('slime_poison', 'slime_poison', 'Slime poison', DOT, 'Poison every 1.5s, 34% slower, 25% less damage dealt, 4.5s.'),
  b('maggot_poison', 'maggot_poison', 'Maggot poison', DOT, 'Poison every 1.5s, 34% slower, 25% less damage dealt, 4.5s.'),
  b('boss_maggot_poison', 'boss_maggot_poison', 'Queen poison', DOT, 'Poison every second, 34% slower, 25% less damage dealt, 5s.'),
  b('enemy_mummy_ranged_1', 'enemy_mummy_ranged_1', 'Mummy curse', DOT, 'Damage every second, 34% slower, 25% less damage dealt, 5s.'),
  b('enemy_spider_1', 'enemy_spider_1', 'Spider venom', DOT, 'Reversed movement for 1.5s.'),
  b('trap_flies', 'trap_flies', 'Flies', DOT, 'Damage every 0.5s for 2.5s.'),
  b('bomb_lich_desert_2', 'bomb_lich_desert_2', 'Fire lich bomb', DOT, 'Damage every second for 5s.'),
  b('banner_drain', 'banner_drain', 'Drain banner', DOT, 'Drains every 0.5s while in the field.'),
  b('bomb_drain', 'bomb_drain', 'Drain bomb', DOT, 'Drains every 0.1s for 2s.'),
  b('enemy_tower_drainbeam', 'enemy_tower_drainbeam', 'Drain beam', DOT, 'Drains every 0.1s for 2s.'),
  b('trap_drain', 'trap_drain', 'Drain trap', DOT, 'Drains every 0.1s for 5s.'),

  // --- Control -------------------------------------------------------------------
  b('enemy_lich_desert_2', 'enemy_lich_desert_2', 'Daze', CONTROL, 'Reversed movement for 3s — the worst of the lich debuffs.'),
  b('confusion', 'confusion', 'Confusion', CONTROL, 'Inverted controls for 2.5s.'),
  b('trap_confusion', 'trap_confusion', 'Confusion trap', CONTROL, 'Inverted controls for 1s.'),
  b('darkness', 'darkness', 'Darkness', CONTROL, 'Blinds for 2.5s.'),
  b('netted', 'netted', 'Netted', CONTROL, 'Rooted for 1s.'),
  b('spider_web', 'spider-web', 'Spider web', CONTROL, 'Rooted while in the web.'),
  b('thief_smoke', 'darkness', 'Smoke', CONTROL, 'Blinds for 2.5s.', 'HW1 thief_smoke'),
  b('thief_stun_1', 'netted_ballista', 'Stun (short)', CONTROL, 'Rooted for 0.6s.', 'HW1 thief_stun_1'),
  b('thief_stun_2', 'netted', 'Stun', CONTROL, 'Rooted for 1s.', 'HW1 thief_stun_2'),
  b('thief_stun_3', 'trap_confusion', 'Stun (confusing)', CONTROL, 'Inverted controls for 1s.', 'HW1 thief_stun_3')
]

/** The dropdown groups, in first-seen order. */
export const BUFF_GROUPS: readonly string[] = BUFF_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const BY_ID = new Map(BUFF_DEFS.map((d) => [d.id, d]))

export function buffById(id: string): BuffDef | undefined {
  return BY_ID.get(id)
}
