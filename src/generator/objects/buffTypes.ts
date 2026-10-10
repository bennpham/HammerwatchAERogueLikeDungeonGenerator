/**
 * The game's buff assets — everything the game ships under `assets/buffs/`.
 *
 * A buff is a standalone XML asset the engine applies to an entity: a duration
 * plus some combination of `speed-mul`, `dmg-mul`, `stun`, a `damage` block and
 * a `mana-drain` block. Nothing in this repo emits a buff file; we only
 * reference the ones the game already ships, by path, from a DangerArea node's
 * `buff` parameter (objects/nodes.ts).
 *
 * `description` is written from each asset's own numbers and is what the form's
 * tooltips show, so a dungeon master picking "banner_drain" can see it drains
 * mana without opening the game's files. Durations are the asset's `duration`
 * in milliseconds; a buff field reapplies its buff every BUFF_REFRESH_MS, so on
 * a floor or in the arena the duration only governs how long the effect lingers
 * after the target walks out of the field.
 *
 * The list is the full 41-file folder as shipped, deliberately including the
 * odd ones — `test.xml` is the only asset in the game that heals, and the
 * negative-`speed-mul` ones reverse movement rather than merely slowing it.
 */

export interface BuffDef {
  /** Stable id, the asset's filename without its extension. */
  id: string
  /** What NodeDangerArea.buff carries, e.g. 'buffs/frost.xml'. */
  path: string
  /** Human label for the dropdown. */
  label: string
  /** Dropdown <optgroup> this buff sits in. */
  group: string
  /** Tooltip text — what the buff actually does, from the asset's numbers. */
  description: string
}

/**
 * Buffs whose net effect is to make the target STRONGER. Aimed at monsters
 * these make a floor harder; aimed at players they make it easier, which is
 * what validation's mismatched-target warning is about.
 */
export const BUFF_HELPFUL_IDS: readonly string[] = ['bloodlust', 'banner_bloodlust', 'test']

/** Every buff the game ships, in dropdown order (grouped). */
export const BUFF_DEFS: readonly BuffDef[] = [
  // --- Offensive -----------------------------------------------------------
  {
    id: 'bloodlust',
    path: 'buffs/bloodlust.xml',
    label: 'Bloodlust',
    group: 'Offensive',
    description: 'Bloodlust - +50% damage and +50% move speed, lasting 2s.'
  },
  {
    id: 'banner_bloodlust',
    path: 'buffs/banner_bloodlust.xml',
    label: 'Bloodlust banner',
    group: 'Offensive',
    description:
      'Bloodlust banner - +50% damage and +50% move speed, but only 0.15s, so it lasts exactly as long as the target stands in the field.'
  },
  // --- Restorative ---------------------------------------------------------
  {
    id: 'test',
    path: 'buffs/test.xml',
    label: 'Regeneration',
    group: 'Restorative',
    description:
      'Regeneration - restores 10 health and 10 mana per second and halves move speed, lasting 10s. The only healing buff the game ships.'
  },
  // --- Slow & control ------------------------------------------------------
  {
    id: 'frost',
    path: 'buffs/frost.xml',
    label: 'Frost',
    group: 'Slow & control',
    description: 'Frost - move speed halved, lasting 5s.'
  },
  {
    id: 'cripple',
    path: 'buffs/cripple.xml',
    label: 'Cripple',
    group: 'Slow & control',
    description: 'Cripple - damage halved and move speed -25%, lasting 2s.'
  },
  {
    id: 'priest_cripple_1',
    path: 'buffs/priest_cripple_1.xml',
    label: 'Cripple aura I',
    group: 'Slow & control',
    description: 'Priest cripple aura I - damage halved and move speed -30%, lasting 1s.'
  },
  {
    id: 'priest_cripple_2',
    path: 'buffs/priest_cripple_2.xml',
    label: 'Cripple aura II',
    group: 'Slow & control',
    description: 'Priest cripple aura II - damage halved and move speed -50%, lasting 1s.'
  },
  {
    id: 'priest_cripple_3',
    path: 'buffs/priest_cripple_3.xml',
    label: 'Cripple aura III',
    group: 'Slow & control',
    description: 'Priest cripple aura III - damage halved and move speed -70%, lasting 1s.'
  },
  {
    id: 'spider_1',
    path: 'buffs/spider_1.xml',
    label: 'Spider web',
    group: 'Slow & control',
    description: 'Spider web - move speed halved, lasting 2.5s.'
  },
  {
    id: 'enemy_spider_1',
    path: 'buffs/enemy_spider_1.xml',
    label: 'Spider web (reversed)',
    group: 'Slow & control',
    description:
      'Spider web, reversed - a negative speed multiplier, so the target walks backwards for 1.5s rather than merely slowing.'
  },
  {
    id: 'enemy_tower_icebeam',
    path: 'buffs/enemy_tower_icebeam.xml',
    label: 'Ice beam chill',
    group: 'Slow & control',
    description: 'Ice beam chill - move speed -60%, lasting 5s.'
  },
  {
    id: 'thief_smoke',
    path: 'buffs/thief_smoke.xml',
    label: 'Smoke bomb (stun)',
    group: 'Slow & control',
    description: 'Smoke bomb - stunned and unable to move for 5s. The longest stun the game ships.'
  },
  {
    id: 'thief_stun_1',
    path: 'buffs/thief_stun_1.xml',
    label: 'Stun I',
    group: 'Slow & control',
    description: 'Stun I - stunned and unable to move for 1s.'
  },
  {
    id: 'thief_stun_2',
    path: 'buffs/thief_stun_2.xml',
    label: 'Stun II',
    group: 'Slow & control',
    description: 'Stun II - stunned and unable to move for 1.5s.'
  },
  {
    id: 'thief_stun_3',
    path: 'buffs/thief_stun_3.xml',
    label: 'Stun III',
    group: 'Slow & control',
    description: 'Stun III - stunned and unable to move for 2s.'
  },
  // --- Damage over time ----------------------------------------------------
  {
    id: 'slime_poison',
    path: 'buffs/slime_poison.xml',
    label: 'Slime poison',
    group: 'Damage over time',
    description:
      'Slime poison - 6 damage every 1.5s (cannot kill), move speed -34% and damage -25%, lasting 4.5s.'
  },
  {
    id: 'maggot_poison',
    path: 'buffs/maggot_poison.xml',
    label: 'Maggot poison',
    group: 'Damage over time',
    description:
      'Maggot poison - 1 damage every 1.5s (cannot kill), move speed -34% and damage -25%, lasting 4.5s.'
  },
  {
    id: 'boss_maggot_poison',
    path: 'buffs/boss_maggot_poison.xml',
    label: 'Maggot poison (boss)',
    group: 'Damage over time',
    description:
      'Boss maggot poison - 3 damage every second (cannot kill), move speed -34% and damage -25%, lasting 5s.'
  },
  {
    id: 'enemy_mummy_ranged_1',
    path: 'buffs/enemy_mummy_ranged_1.xml',
    label: 'Mummy rot',
    group: 'Damage over time',
    description:
      'Mummy rot - 4 damage every second (cannot kill), move speed -34% and damage -25%, lasting 5s.'
  },
  {
    id: 'wisp_1_burn',
    path: 'buffs/wisp_1_burn.xml',
    label: 'Wisp burn',
    group: 'Damage over time',
    description: 'Wisp burn - 6 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'shooter_fireball_burn',
    path: 'buffs/shooter_fireball_burn.xml',
    label: 'Fireball burn',
    group: 'Damage over time',
    description: 'Fireball burn - 6 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'shooter_fireball_2',
    path: 'buffs/shooter_fireball_2.xml',
    label: 'Greater fireball burn',
    group: 'Damage over time',
    description: 'Greater fireball burn - 20 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'lich_1_mb_burn',
    path: 'buffs/lich_1_mb_burn.xml',
    label: 'Lich burn',
    group: 'Damage over time',
    description: 'Lich burn - 10 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'enemy_tower_firebeam',
    path: 'buffs/enemy_tower_firebeam.xml',
    label: 'Fire beam burn',
    group: 'Damage over time',
    description: 'Fire beam burn - 6 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'enemy_pillar_fire',
    path: 'buffs/enemy_pillar_fire.xml',
    label: 'Fire pillar',
    group: 'Damage over time',
    description:
      'Fire pillar - 20 damage every second, lasting 10s. The heaviest damage-over-time the game ships.'
  },
  {
    id: 'enemy_pillar_fire_self',
    path: 'buffs/enemy_pillar_fire_self.xml',
    label: 'Fire pillar (cosmetic)',
    group: 'Damage over time',
    description:
      'Fire pillar, cosmetic only - 50s of flame particles and light, with no damage and no stat change.'
  },
  {
    id: 'bomb_lich_desert_2',
    path: 'buffs/bomb_lich_desert_2.xml',
    label: 'Lich bomb burn',
    group: 'Damage over time',
    description: 'Lich bomb burn - 6 damage every second, lasting 5s. Can kill.'
  },
  // --- Mana drain ----------------------------------------------------------
  {
    id: 'banner_drain',
    path: 'buffs/banner_drain.xml',
    label: 'Mana drain banner',
    group: 'Mana drain',
    description:
      'Mana drain banner - drains 3 mana every 0.1s. Lasts 0.15s, so it drains only while the target stands in the field.'
  },
  {
    id: 'bomb_drain',
    path: 'buffs/bomb_drain.xml',
    label: 'Mana drain bomb',
    group: 'Mana drain',
    description: 'Mana drain bomb - drains 5 mana every 0.1s, lasting 2s.'
  },
  {
    id: 'enemy_tower_drainbeam',
    path: 'buffs/enemy_tower_drainbeam.xml',
    label: 'Drain beam',
    group: 'Mana drain',
    description:
      'Drain beam - drains 10 mana every 0.1s, lasting 2s. Empties a full mana bar in seconds.'
  },
  // --- Boss & elite --------------------------------------------------------
  {
    id: 'enemy_boss_krilith_v1',
    path: 'buffs/enemy_boss_krilith_v1.xml',
    label: 'Krilith chill I',
    group: 'Boss & elite',
    description: 'Krilith chill I - move speed -10%, lasting 3s.'
  },
  {
    id: 'enemy_boss_krilith_v2',
    path: 'buffs/enemy_boss_krilith_v2.xml',
    label: 'Krilith chill II',
    group: 'Boss & elite',
    description: 'Krilith chill II - move speed -25%, lasting 1.5s.'
  },
  {
    id: 'enemy_boss_krilith_wave',
    path: 'buffs/enemy_boss_krilith_wave.xml',
    label: 'Krilith ice wave',
    group: 'Boss & elite',
    description: 'Krilith ice wave - move speed -80%, lasting 2s. Very nearly a stun.'
  },
  {
    id: 'bomb_boss_krilith',
    path: 'buffs/bomb_boss_krilith.xml',
    label: 'Krilith bomb chill',
    group: 'Boss & elite',
    description: 'Krilith bomb chill - move speed -20%, lasting 3s.'
  },
  {
    id: 'enemy_lich_desert_2',
    path: 'buffs/enemy_lich_desert_2.xml',
    label: 'Lich reversal',
    group: 'Boss & elite',
    description:
      'Lich reversal - a negative speed multiplier, so the target walks backwards for 3s rather than merely slowing.'
  },
  {
    id: 'bomb_lich_desert_1',
    path: 'buffs/bomb_lich_desert_1.xml',
    label: 'Lich bomb chill',
    group: 'Boss & elite',
    description: 'Lich bomb chill - move speed -20%, lasting 3s.'
  },
  // --- Traps ---------------------------------------------------------------
  {
    id: 'trap_frost',
    path: 'buffs/trap_frost.xml',
    label: 'Frost trap',
    group: 'Traps',
    description:
      'Frost trap - move speed -90%, but only 0.5s, so it bites only while the target stands in the field.'
  },
  {
    id: 'trap_quicksand',
    path: 'buffs/trap_quicksand.xml',
    label: 'Quicksand',
    group: 'Traps',
    description:
      'Quicksand - move speed -75%, but only 0.4s, so it bites only while the target stands in the field.'
  },
  {
    id: 'trap_flies',
    path: 'buffs/trap_flies.xml',
    label: 'Flies',
    group: 'Traps',
    description: 'Flies - 5 damage every 0.5s, lasting 5s. Can kill.'
  },
  {
    id: 'trap_firespray',
    path: 'buffs/trap_firespray.xml',
    label: 'Fire spray',
    group: 'Traps',
    description: 'Fire spray - 10 damage every second, lasting 5s. Can kill.'
  },
  {
    id: 'trap_floor_fire_burn',
    path: 'buffs/trap_floor_fire_burn.xml',
    label: 'Floor fire burn',
    group: 'Traps',
    description: 'Floor fire burn - 10 damage every second, lasting 5s. Can kill.'
  }
]

/**
 * The <optgroup> order, derived from BUFF_DEFS so a new buff cannot land in a
 * group the dropdown does not render. First-seen order, like MONSTER_GROUPS.
 */
export const BUFF_GROUPS: readonly string[] = BUFF_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const BUFF_BY_ID = new Map(BUFF_DEFS.map((def) => [def.id, def]))

/** Looks a buff up by id. Undefined for an unknown id — validation is the gate. */
export function buffById(id: string): BuffDef | undefined {
  return BUFF_BY_ID.get(id)
}
