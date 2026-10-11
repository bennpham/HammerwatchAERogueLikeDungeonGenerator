import { PLAYER_FIELD_MAP, prunePlayerTweaks, skillKey, statKey } from './fields'
import type { PlayerTweaks } from './fields'
import { setEveryoneSpeed } from './speed'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Named player builds for the preset dialog's Player tab. Loading one replaces
 * `playerTweaks` and nothing else, so it layers onto whatever campaign is
 * loaded. `build()` returns a fresh, pruned record and draws nothing random;
 * every key is a `PLAYER_FIELD_MAP` key (tests hold each preset to that and to
 * validating cleanly).
 *
 * Stock is Anniversary Edition's own balance, so there is no "AE" preset; the
 * original game is one of the presets instead.
 */
export type PlayerPresetGroupId = 'generic' | 'original' | 'hw2'

export const PLAYER_PRESET_GROUPS: readonly { id: PlayerPresetGroupId; label: string }[] = [
  { id: 'generic', label: 'Generic' },
  { id: 'original', label: 'Original Hammerwatch' },
  { id: 'hw2', label: 'Hammerwatch 2' }
]

export interface PlayerPreset {
  /** stable id the preset dialog loads by; never shown to the user */
  id: string
  label: string
  description: string
  group: PlayerPresetGroupId
  build(): PlayerTweaks
}

/** `{ tier: value }` for one field of a chain. */
function tiers(chain: string, field: string, values: Record<number, number>): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [tier, value] of Object.entries(values)) out[skillKey(chain, Number(tier), field)] = value
  return out
}

/**
 * The original Hammerwatch's player balance on AE. Source: the original's
 * stock tweak/*.xml, compared value by value with AE's players/ files when the
 * HW1 generator modelled AE the other way round. Only values that mean the
 * same thing in both are set; the original's lightning and comet mana costs
 * have no AE bind and stay AE's.
 *
 * - one move speed for everyone: 0.9, then 1.0/1.1/1.2 in the shop;
 * - the combo window 0.25 s shorter at every tier (AE writes it in ms);
 * - weaker sword, fireball and stronger knives ladders;
 * - the paladin's mana regen ladder and armor tiers 4–5;
 * - the original's prices where AE changed them.
 */
function originalHammerwatch(): PlayerTweaks {
  return prunePlayerTweaks({
    ...setEveryoneSpeed({}, 0.9),
    ...tiers('shared_combo', 'combo-timer', { 1: 750 }),
    ...tiers('shared_combo:shared_combo_timer', 'combo-timer', { 1: 1000, 2: 1250, 3: 1500, 4: 1750, 5: 2000 }),

    // paladin = the original's knight
    ...tiers('pal_sword', 'sword-dmg', { 1: 9 }),
    ...tiers('pal_sword:pal_sword_dmg', 'sword-dmg', { 1: 14, 2: 20, 3: 26, 4: 32, 5: 38 }),
    ...tiers('pal_sword:pal_sword_dmg', 'cost', { 1: 800 }),
    ...tiers('pal_sword:pal_sword_arc', 'cost', { 1: 250 }),
    ...tiers('pal_misc_health', 'cost', { 2: 1200, 3: 1800, 4: 2400, 5: 3000 }),
    ...tiers('pal_misc_armor:1', 'player-armor-set', { 4: 9, 5: 10 }),
    // the original's 900/800/700/600 ms per point, as points per second
    ...tiers('pal_misc_mana', 'player-mana-regen-set', { 2: 1.111, 3: 1.25, 4: 1.429, 5: 1.667 }),

    ...tiers('priest_smite:priest_smite_damage', 'cost', { 1: 600 }),
    ...tiers('priest_smite:priest_smite_speed', 'cost', { 1: 250 }),

    ...tiers('ran_bow:ran_bow_damage', 'cost', { 1: 800 }),
    ...tiers('ran_bow:ran_bow_penetration', 'cost', { 1: 700 }),
    ...tiers('ran_misc_armor:1', 'cost', { 3: 2000, 4: 2700 }),

    ...tiers('thief_knives:thief_knives_dmg', 'knives-dmg', { 1: 8, 2: 12, 3: 16 }),
    ...tiers('thief_knives:thief_knives_dmg', 'cost', { 1: 800 }),
    ...tiers('thief_knives:thief_knives_speed', 'cost', { 1: 250 }),

    // AE's fireball has no separate splash; its damage is the original's fireball-dmg
    ...tiers('wiz_fireball', 'proj-damage', { 1: 10 }),
    ...tiers('wiz_fireball:wiz_fireball_damage', 'proj-damage', { 1: 14, 2: 18, 3: 22, 4: 25, 5: 28 }),
    ...tiers('wiz_fireball:wiz_fireball_damage', 'cost', { 1: 800 }),
    ...tiers('wiz_fireball:wiz_fireball_range', 'cost', { 1: 500 }),
    ...tiers('wiz_misc_health', 'cost', { 2: 1500 }),

    ...tiers('sorc_shard:sorc_shard_damage', 'cost', { 1: 800 }),
    ...tiers('sorc_shard:sorc_shard_range', 'cost', { 1: 500 }),
    ...tiers('sorc_misc_health', 'cost', { 2: 1500 }),

    ...tiers('warlock_dagger:warlock_dagger_dmg', 'cost', { 1: 800, 4: 3800, 5: 4800 }),
    ...tiers('warlock_dagger:warlock_dagger_poison', 'cost', { 1: 250 })
  })
}

/**
 * Dungeon Rebalanced: buffs the classes that are weak or unfun early — the
 * priest most, then the warlock, thief and sorcerer — and nerfs nothing.
 * Paladin, ranger and wizard are left alone. (AE's own faster movement and
 * longer combo window are already stock here.) Every new start stays below
 * its first upgrade, so no tier becomes a downgrade.
 */
function dungeonRebalanced(): PlayerTweaks {
  return prunePlayerTweaks({
    [statKey('priest', 'base-health')]: 40,
    ...tiers('priest_misc_health', 'player-max-health-set', { 1: 55, 2: 70, 3: 80, 4: 90, 5: 100 }),
    ...tiers('priest_smite', 'smite-dmg', { 1: 9 }),
    ...tiers('priest_mana_shield', 'dmg-per-mana', { 1: 0.5 }),
    ...tiers('priest_mana_shield:priest_mana_shield_dmg_per_mana', 'dmg-per-mana', { 1: 0.75, 2: 1, 3: 1.25, 4: 1.5 }),
    ...tiers('priest_beam', 'beam-heal', { 1: 4 }),
    ...tiers('priest_beam:priest_beam_damage', 'beam-heal', { 1: 5, 2: 6, 3: 7, 4: 8 }),
    ...tiers('priest_draining_field', 'cost', { 1: 1200 }),
    ...tiers('priest_misc_armor:1', 'cost', { 1: 600, 2: 1200, 3: 1800, 4: 2400, 5: 3000 }),

    ...tiers('warlock_misc_armor:1', 'cost', { 1: 600, 2: 1200, 3: 1800, 4: 2400, 5: 3000 }),

    [statKey('thief', 'base-health')]: 50,
    ...tiers('thief_knives', 'knives-dmg', { 1: 6 }),

    [statKey('sorcerer', 'base-health')]: 40
  })
}

// ---------------------------------------------------------------- HW2 bodies

/** One HW2 class (`players/classes.inc`), on the AE class it plays as. */
export interface Hw2Class {
  cls: 'paladin' | 'ranger' | 'thief' | 'wizard' | 'warlock'
  /** base str / dex / int */
  attributes: [number, number, number]
  baseHealth: number
  baseMana: number
  healthPerLevel: number
  manaPerLevel: number
  /** mana per second at level 1, before Int */
  baseManaRegen: number
}

export const HW2_CLASSES: readonly Hw2Class[] = [
  { cls: 'paladin', attributes: [18, 12, 10], baseHealth: 55, baseMana: 40, healthPerLevel: 4, manaPerLevel: 2, baseManaRegen: 0.5 },
  { cls: 'ranger', attributes: [12, 16, 12], baseHealth: 45, baseMana: 40, healthPerLevel: 3, manaPerLevel: 3, baseManaRegen: 0.5 },
  // HW2's rogue
  { cls: 'thief', attributes: [12, 18, 10], baseHealth: 45, baseMana: 40, healthPerLevel: 3, manaPerLevel: 2, baseManaRegen: 0.5 },
  { cls: 'wizard', attributes: [10, 10, 20], baseHealth: 40, baseMana: 60, healthPerLevel: 2, manaPerLevel: 5, baseManaRegen: 1.0 },
  { cls: 'warlock', attributes: [12, 10, 18], baseHealth: 50, baseMana: 50, healthPerLevel: 3, manaPerLevel: 3, baseManaRegen: 1.0 }
]

// HW2's own constants (scripts/Data/Player.as, PlayerRecord.as)
const HEALTH_PER_STR = 2
const MANA_PER_INT = 2
const MANA_REGEN_PER_INT = 0.03
const MANA_REGEN_PER_LEVEL = 0.1
const ATTRIBUTE_POINTS_PER_LEVEL = 5

/**
 * The attribute points placed by `level`, split in proportion to the class's
 * base attributes by largest remainder (ties to the lower index), so a
 * paladin stays a strength class. Deterministic.
 */
export function hw2AttributePoints(base: readonly number[], level: number): number[] {
  const points = ATTRIBUTE_POINTS_PER_LEVEL * Math.max(0, level - 1)
  const total = base.reduce((sum, value) => sum + value, 0)
  const raw = base.map((value) => (points * value) / total)
  const out = raw.map(Math.floor)
  let left = points - out.reduce((sum, value) => sum + value, 0)
  const byRemainder = raw
    .map((value, index) => ({ remainder: value - Math.floor(value), index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (left-- <= 0) break
    out[index]++
  }
  return out
}

export interface Hw2Body {
  maxHealth: number
  maxMana: number
  /** points per second, as AE writes it */
  manaRegen: number
}

/** A class's health, mana and mana regen at an HW2 level, before gear. */
export function hw2Body(cls: Hw2Class, level: number): Hw2Body {
  const placed = hw2AttributePoints(cls.attributes, level)
  const str = cls.attributes[0] + placed[0]
  const int = cls.attributes[2] + placed[2]
  const gained = Math.max(0, level - 1)
  return {
    maxHealth: cls.baseHealth + gained * cls.healthPerLevel + HEALTH_PER_STR * str,
    maxMana: cls.baseMana + gained * cls.manaPerLevel + MANA_PER_INT * int,
    manaRegen: Math.round((cls.baseManaRegen + gained * MANA_REGEN_PER_LEVEL + int * MANA_REGEN_PER_INT) * 100) / 100
  }
}

const stockStat = (cls: string, stat: string): number => PLAYER_FIELD_MAP.get(statKey(cls, stat))!.stock

/** The class's own misc health / mana file. */
function miscFile(cls: string, kind: 'health' | 'mana'): string {
  const c = PLAYER_STOCK.classes.find((x) => x.id === cls)!
  const path = c.skills.map((s) => s.path).find((p) => p.endsWith(`_misc_${kind}.sval`))!
  return PLAYER_STOCK.skills.find((f) => f.path === path)!.stem
}

/**
 * A class's base health, mana and regen set to `body`, with its own health and
 * mana upgrade ladders moved along so every tier still improves on the start:
 * health and mana tiers shift by the amount the start moved, regen tiers scale
 * by the ratio it moved.
 */
function bodyOverrides(cls: string, body: Hw2Body): PlayerTweaks {
  const out: PlayerTweaks = {
    [statKey(cls, 'base-health')]: body.maxHealth,
    [statKey(cls, 'base-mana')]: body.maxMana,
    [statKey(cls, 'base-mana-regen')]: body.manaRegen
  }
  const healthDelta = body.maxHealth - stockStat(cls, 'base-health')
  const manaDelta = body.maxMana - stockStat(cls, 'base-mana')
  const regenRatio = body.manaRegen / stockStat(cls, 'base-mana-regen')
  for (const [kind, shift] of [['health', 'player-max-health-set'], ['mana', 'player-max-mana-set']] as const) {
    const stem = miscFile(cls, kind)
    const chain = PLAYER_STOCK.skills.find((f) => f.stem === stem)!.chains[0]
    chain.tiers.forEach((t, i) => {
      const b = t.binds[shift]
      if (b !== undefined) out[skillKey(chain.key, i + 1, shift)] = b.stock + (kind === 'health' ? healthDelta : manaDelta)
      const r = t.binds['player-mana-regen-set']
      if (r !== undefined) out[skillKey(chain.key, i + 1, 'player-mana-regen-set')] = Math.round(r.stock * regenRatio * 100) / 100
    })
  }
  return out
}

/**
 * Classes HW2 has no playable counterpart for, anchored on the wizard and
 * keeping the stock relationship they have to it in AE: the sorcerer is the
 * wizard's twin, the priest the frailest with the fastest regen.
 */
const HW2_ANCHORED: readonly ('sorcerer' | 'priest')[] = ['sorcerer', 'priest']

function anchoredBody(cls: string, level: number): Hw2Body {
  const wizard = hw2Body(HW2_CLASSES.find((c) => c.cls === 'wizard')!, level)
  const ratio = (stat: string) => stockStat(cls, stat) / stockStat('wizard', stat)
  return {
    maxHealth: Math.round(wizard.maxHealth * ratio('base-health')),
    maxMana: Math.round(wizard.maxMana * ratio('base-mana')),
    manaRegen: Math.round(wizard.manaRegen * ratio('base-mana-regen') * 100) / 100
  }
}

/**
 * HW2 skill values that mean the same thing in AE. AE cannot take a tier out
 * of the shop, so where HW2 has fewer ranks the extra AE tier carries on at
 * the same step instead.
 */
function hw2Skills(): PlayerTweaks {
  return {
    // paladin mace stun 5/10/15% (pal_mace.sval)
    ...tiers('pal_bash', 'bash-chance', { 1: 0.05, 2: 0.1, 3: 0.15 }),
    // shield-charge dash 80 px; AE's ladder keeps its +20 step
    ...tiers('pal_charge', 'charge-dist', { 1: 80 }),
    ...tiers('pal_charge:pal_charge_range', 'charge-dist', { 1: 100, 2: 120, 3: 140 }),
    // rogue evasion 5/10/15/20% (rog_evasion.sval)
    ...tiers('thief_dodge', 'dodge-chance', { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2, 5: 0.25 }),
    // twin daggers move at ×0.5 while attacking (rog_twin_daggers.sval)
    ...tiers('thief_knives', 'move-speed-mul', { 1: 0.5 }),
    ...tiers('thief_knives:thief_knives_speed', 'move-speed-mul', { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.9 }),
    // throwing-knife fan 3/5/7 (rog_throwing_knives.sval)
    ...tiers('thief_fan', 'fan-projectiles', { 1: 3 }),
    ...tiers('thief_fan:thief_fan_arc', 'fan-projectiles', { 1: 5, 2: 7, 3: 9 }),
    // marksman crit 10/20/30% (ran_marksman.sval)
    ...tiers('ran_marksman', 'crit-chance', { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 }),
    // arcane bolt: the starting wand's 14 × 1.0…2.0 (wiz_arcane_bolt.sval)
    ...tiers('wiz_fireball', 'proj-damage', { 1: 14 }),
    ...tiers('wiz_fireball:wiz_fireball_damage', 'proj-damage', { 1: 17, 2: 20, 3: 22, 4: 25, 5: 28 }),
    // frost nova's 12 shards (wiz_frost_nova.sval), ladder +3/+3/+2
    ...tiers('wiz_fire_nova', 'nova-flames', { 1: 12 }),
    ...tiers('wiz_fire_nova:wiz_fire_nova_flames', 'nova-flames', { 1: 15, 2: 18, 3: 20 }),
    // ...and the same ice ring is the sorcerer's nova, ladder +4
    ...tiers('sorc_nova', 'projectiles-count', { 1: 12 }),
    ...tiers('sorc_nova:sorc_nova_count', 'projectiles-count', { 1: 16, 2: 20 }),
    // soul vortex 8/10/12 s (war_soul_vortex.sval)
    ...tiers('warlock_storm', 'cloud-duration', { 1: 8000 }),
    ...tiers('warlock_storm:warlock_storm_duration', 'cloud-duration', { 1: 10000, 2: 12000 }),
    // arc lightning hits 3–6 targets (wiz_arc_lightning.sval)
    ...tiers('warlock_lightning', 'proj-bolts', { 1: 3 }),
    ...tiers('warlock_lightning:warlock_lightning_bolts', 'proj-bolts', { 1: 4, 2: 5, 3: 6, 4: 7 })
  }
}

function hw2Build(level: number): PlayerTweaks {
  const t: PlayerTweaks = { ...hw2Skills() }
  for (const c of HW2_CLASSES) Object.assign(t, bodyOverrides(c.cls, hw2Body(c, level)))
  for (const cls of HW2_ANCHORED) Object.assign(t, bodyOverrides(cls, anchoredBody(cls, level)))
  return prunePlayerTweaks(t)
}

const SKILLS_NOTE =
  'HW2’s skill values where they carry over. Priest and sorcerer, not in HW2, are scaled off the wizard (the priest stays frailest with the fastest mana regen).'

export const PLAYER_PRESETS: readonly PlayerPreset[] = [
  {
    id: 'dungeon-rebalanced',
    label: 'Dungeon Rebalanced',
    group: 'generic',
    description:
      'Buffs the classes that are weak or unfun early — the priest most, then the warlock, thief and sorcerer — and leaves the paladin, ranger and wizard alone.',
    build: dungeonRebalanced
  },
  {
    id: 'original',
    label: 'Original Hammerwatch balance',
    group: 'original',
    description:
      'The original game’s numbers where AE changed them: one slower move speed for everyone (0.9), a shorter combo window, the original sword, knife and fireball damage, the paladin’s mana regen and armor, and the original prices.',
    build: originalHammerwatch
  },
  {
    id: 'hw2-level-1',
    label: 'Starting characters (level 1)',
    group: 'hw2',
    description: `HW2’s level-1 bodies: tankier starts (paladin 91 HP, thief 69, wizard 60) with a little more mana. ${SKILLS_NOTE}`,
    build: () => hw2Build(1)
  },
  {
    id: 'hw2-level-10',
    label: 'Tier 1 (level 10)',
    group: 'hw2',
    description: `HW2’s level-10 bodies, like a character a few upgrades in (paladin 167 HP, wizard 191 mana), with about twice the mana regen. ${SKILLS_NOTE}`,
    build: () => hw2Build(10)
  },
  {
    id: 'hw2-level-25',
    label: 'Halfway (level 25)',
    group: 'hw2',
    description: `HW2’s level-25 bodies: starts about as tough as a fully upgraded AE character (paladin 295 HP), and the shop goes past them. ${SKILLS_NOTE}`,
    build: () => hw2Build(25)
  },
  {
    id: 'hw2-level-50',
    label: 'Endgame (level 50)',
    group: 'hw2',
    description: `HW2’s level-50 bodies, 2–3× past a maxed AE character (paladin 507 HP, wizard 591 mana and ~10 mana/s). A power fantasy, or for very hard custom dungeons. ${SKILLS_NOTE}`,
    build: () => hw2Build(50)
  }
]

export function playerPresetById(id: string): PlayerPreset | undefined {
  return PLAYER_PRESETS.find((preset) => preset.id === id)
}
