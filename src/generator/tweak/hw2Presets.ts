import { TWEAK_BASELINE } from './baseline'
import { effectKey, paramKey, removeKey } from './chains'
import { pruneTweaks } from './overrides'
import type { PlayerPreset } from './presets'
import type { PlayerTweaks, TweakUnitFile } from './types'

/**
 * Hammerwatch 2 player presets — the original game's characters given HW2
 * bodies at a chosen HW2 level, plus the few HW2 skill values that mean the
 * same thing in the original. The research is in
 * `reference/hammerwatch-2-comparison.md`.
 *
 * HW2 is an RPG (attributes, levels to 50, weapon-based damage, stamina,
 * cooldowns, percentage armor), so most of it has no tweak key here. What does
 * carry over is a class's health, mana and mana regen, which HW2 derives from
 * its level and attributes. Priest and sorcerer are not playable in HW2, so
 * they are scaled off HW2's wizard — see `HW2_ANCHORED`.
 */

/** One HW2 class, from `players/classes.inc`, mapped onto the original's unit id. */
interface Hw2Class {
  /** the original game's tweak unit this HW2 class plays as */
  unit: 'knight' | 'ranger' | 'thief' | 'wizard' | 'warlock'
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
  // paladin
  { unit: 'knight', attributes: [18, 12, 10], baseHealth: 55, baseMana: 40, healthPerLevel: 4, manaPerLevel: 2, baseManaRegen: 0.5 },
  // ranger
  { unit: 'ranger', attributes: [12, 16, 12], baseHealth: 45, baseMana: 40, healthPerLevel: 3, manaPerLevel: 3, baseManaRegen: 0.5 },
  // rogue
  { unit: 'thief', attributes: [12, 18, 10], baseHealth: 45, baseMana: 40, healthPerLevel: 3, manaPerLevel: 2, baseManaRegen: 0.5 },
  // wizard
  { unit: 'wizard', attributes: [10, 10, 20], baseHealth: 40, baseMana: 60, healthPerLevel: 2, manaPerLevel: 5, baseManaRegen: 1.0 },
  // warlock
  { unit: 'warlock', attributes: [12, 10, 18], baseHealth: 50, baseMana: 50, healthPerLevel: 3, manaPerLevel: 3, baseManaRegen: 1.0 }
]

// HW2's own constants: scripts/Data/Player.as (HealthPerStr, ManaPerInt, the
// per-Int mana regen) and PlayerRecord.as (StatsPerLevel); every class's
// level-mana-regen in classes.inc is 0.1
const HEALTH_PER_STR = 2
const MANA_PER_INT = 2
const MANA_REGEN_PER_INT = 0.03
const MANA_REGEN_PER_LEVEL = 0.1
const ATTRIBUTE_POINTS_PER_LEVEL = 5

/**
 * The attribute points a character has placed by `level`, split in proportion
 * to the class's base attributes by largest remainder (ties to the lower
 * index). HW2 leaves the split to the player; this keeps each class's shape —
 * a paladin stays a strength class — and is deterministic.
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
  /** the original's unit: milliseconds per point of mana */
  manaRegenMs: number
}

/** A class's health, mana and mana regen at an HW2 level, before gear. */
export function hw2Body(cls: Hw2Class, level: number): Hw2Body {
  const placed = hw2AttributePoints(cls.attributes, level)
  const str = cls.attributes[0] + placed[0]
  const int = cls.attributes[2] + placed[2]
  const levelsGained = Math.max(0, level - 1)
  const regenPerSecond = cls.baseManaRegen + levelsGained * MANA_REGEN_PER_LEVEL + int * MANA_REGEN_PER_INT
  return {
    maxHealth: cls.baseHealth + levelsGained * cls.healthPerLevel + HEALTH_PER_STR * str,
    maxMana: cls.baseMana + levelsGained * cls.manaPerLevel + MANA_PER_INT * int,
    manaRegenMs: Math.round(1000 / regenPerSecond)
  }
}

function unitFile(id: string): TweakUnitFile {
  const file = TWEAK_BASELINE.find((candidate) => candidate.id === id)
  if (file === undefined || file.kind !== 'unit') throw new Error(`no tweak unit file "${id}"`)
  return file
}

function stockParam(file: TweakUnitFile, name: string): number {
  const value = file.params.find((param) => param.name === name)?.value
  if (typeof value !== 'number') throw new Error(`${file.id} has no numeric param "${name}"`)
  return value
}

/**
 * Sets a class's starting health, mana and mana regen to `body` and moves its
 * own upgrade ladders with them, read off the baseline, so every upgrade still
 * improves on the new start: health and mana tiers shift by the same amount
 * the start moved; mana-regen tiers (a period — lower is better) scale by the
 * same ratio. `regenLadder`, when given, replaces the mana-regen tiers outright,
 * in tier order (see `HW2_ANCHORED`).
 */
function bodyOverrides(unit: string, body: Hw2Body, regenLadder?: readonly number[]): PlayerTweaks {
  const file = unitFile(unit)
  const healthDelta = body.maxHealth - stockParam(file, 'max-health')
  const manaDelta = body.maxMana - stockParam(file, 'max-mana')
  const regenRatio = body.manaRegenMs / stockParam(file, 'mana-regen')
  const out: PlayerTweaks = {
    [paramKey(unit, 'max-health')]: body.maxHealth,
    [paramKey(unit, 'max-mana')]: body.maxMana,
    [paramKey(unit, 'mana-regen')]: body.manaRegenMs
  }
  let regenTier = 0
  for (const upgrade of file.upgrades) {
    for (const child of upgrade.children) {
      if (typeof child.value !== 'number') continue
      const key = effectKey(unit, upgrade.id, child.name)
      if (child.name === 'max-health') out[key] = child.value + healthDelta
      else if (child.name === 'max-mana') out[key] = child.value + manaDelta
      else if (child.name === 'mana-regen') {
        out[key] = regenLadder?.[regenTier] ?? Math.round(child.value * regenRatio)
        regenTier++
      }
    }
  }
  return out
}

/** A class's stock mana-regen tiers, in upgrade order. */
function stockRegenLadder(file: TweakUnitFile): number[] {
  const tiers: number[] = []
  for (const upgrade of file.upgrades) {
    for (const child of upgrade.children) {
      if (child.name === 'mana-regen' && typeof child.value === 'number') tiers.push(child.value)
    }
  }
  return tiers
}

/**
 * The original classes HW2 has no playable counterpart for. Each is anchored on
 * its nearest HW2 sibling — the wizard, a fellow caster — and keeps the stock
 * relationship it has to that sibling in the original game:
 * - the sorcerer starts with exactly the wizard's body (35 / 75 / 600), so it
 *   stays the wizard's twin, the other offensive caster;
 * - the priest is the wizard × 30/35 health, × 70/75 mana and × 570/600 regen
 *   period, so it stays the frailest class with the fastest regen.
 * The mana-regen LADDER also comes from the anchor, tier by tier, × the same
 * regen ratio: in the original the priest's ladder (→ 285 ms) tops out slower
 * than the wizard's (→ 250 ms), and the owner wants the priest to stay the
 * regen class even fully upgraded (2026-10-08). Health and mana ladders are the
 * class's own, shifted — so the priest keeps its larger mana pool.
 */
const HW2_ANCHORED: readonly { unit: 'sorcerer' | 'priest'; anchor: Hw2Class['unit'] }[] = [
  { unit: 'sorcerer', anchor: 'wizard' },
  { unit: 'priest', anchor: 'wizard' }
]

/** Body and regen ladder for an anchored class at `level`. */
function anchoredOverrides(unit: string, anchorUnit: Hw2Class['unit'], level: number): PlayerTweaks {
  const anchorClass = HW2_CLASSES.find((cls) => cls.unit === anchorUnit)
  if (anchorClass === undefined) throw new Error(`no HW2 class for ${anchorUnit}`)
  const anchorBody = hw2Body(anchorClass, level)
  const own = unitFile(unit)
  const anchor = unitFile(anchorUnit)
  const ratio = (stat: string) => stockParam(own, stat) / stockParam(anchor, stat)
  const body: Hw2Body = {
    maxHealth: Math.round(anchorBody.maxHealth * ratio('max-health')),
    maxMana: Math.round(anchorBody.maxMana * ratio('max-mana')),
    manaRegenMs: Math.round(anchorBody.manaRegenMs * ratio('mana-regen'))
  }
  // the anchor's own ladder as the anchor's preset shifts it, then × the ratio
  const anchorRegenRatio = anchorBody.manaRegenMs / stockParam(anchor, 'mana-regen')
  const regenLadder = stockRegenLadder(anchor).map((tier) =>
    Math.round(tier * anchorRegenRatio * ratio('mana-regen'))
  )
  return bodyOverrides(unit, body, regenLadder)
}

/**
 * The HW2 skill values that mean the same thing in the original, copied
 * faithfully even where HW2 is weaker. Where HW2 has fewer ranks the extra
 * original tiers are removed from the shop; where the new start overtakes a
 * ladder, the ladder shifts by the same amount. Same in every HW2 preset —
 * a skill's numbers don't depend on character level.
 */
function hw2SkillOverrides(): PlayerTweaks {
  return {
    // paladin mace stun 5/10/15% (pal_mace.sval)
    [effectKey('knight', 'bash1', 'bash-chance')]: 5,
    [effectKey('knight', 'bash2', 'bash-chance')]: 10,
    [effectKey('knight', 'bash3', 'bash-chance')]: 15,
    // shield-charge dash, 80 px = 5 tiles (pal_shield_charge.sval); ladder +2
    [paramKey('knight', 'charge-dist')]: 5,
    [effectKey('knight', 'chrgrng1', 'charge-dist')]: 6,
    [effectKey('knight', 'chrgrng2', 'charge-dist')]: 7,
    [effectKey('knight', 'chrgrng3', 'charge-dist')]: 8,

    // rogue evasion 5/10/15/20%, four ranks (rog_evasion.sval)
    [effectKey('thief', 'dodge1', 'dodge-chance')]: 5,
    [effectKey('thief', 'dodge2', 'dodge-chance')]: 10,
    [effectKey('thief', 'dodge3', 'dodge-chance')]: 15,
    [effectKey('thief', 'dodge4', 'dodge-chance')]: 20,
    [removeKey('thief', 'dodge5')]: 1,
    // twin daggers move at ×0.5 while attacking (rog_twin_daggers.sval); ladder +0.1
    [paramKey('thief', 'knives-speed-mod')]: -0.5,
    [effectKey('thief', 'aspeed1', 'knives-speed-mod')]: -0.4,
    [effectKey('thief', 'aspeed2', 'knives-speed-mod')]: -0.3,
    [effectKey('thief', 'aspeed3', 'knives-speed-mod')]: -0.2,
    [effectKey('thief', 'aspeed4', 'knives-speed-mod')]: -0.1,
    // throwing-knife fan 3/5/7 (rog_throwing_knives.sval)
    [paramKey('thief', 'kfan-projs')]: 3,
    [effectKey('thief', 'kfanprojs1', 'kfan-projs')]: 5,
    [effectKey('thief', 'kfanprojs2', 'kfan-projs')]: 7,
    [removeKey('thief', 'kfanprojs3')]: 1,

    // marksman aim crit 10/20/30%, three ranks (ran_marksman.sval)
    [effectKey('ranger', 'crit1', 'crit-chance')]: 10,
    [effectKey('ranger', 'crit2', 'crit-chance')]: 20,
    [effectKey('ranger', 'crit3', 'crit-chance')]: 30,
    [removeKey('ranger', 'crit4')]: 1,
    // entangle roots 4 → 6 s (ran_entangle.sval)
    [effectKey('ranger', 'growth', 'growth-duration')]: 4,
    [effectKey('ranger', 'growthdur-1', 'growth-duration')]: 5,
    [effectKey('ranger', 'growthdur-2', 'growth-duration')]: 6,

    // arcane bolt: the starting wand's 14 × 1.0…2.0 (wiz_arcane_bolt.sval)
    [paramKey('wizard', 'fireball-dmg')]: 14,
    [effectKey('wizard', 'dmg1', 'fireball-dmg')]: 17,
    [effectKey('wizard', 'dmg2', 'fireball-dmg')]: 20,
    [effectKey('wizard', 'dmg3', 'fireball-dmg')]: 22,
    [effectKey('wizard', 'dmg4', 'fireball-dmg')]: 25,
    [effectKey('wizard', 'dmg5', 'fireball-dmg')]: 28,
    // frost nova's 12 shards (wiz_frost_nova.sval); ladder +2
    [effectKey('wizard', 'fnova', 'fnova-flames')]: 12,
    [effectKey('wizard', 'fnovanum-1', 'fnova-flames')]: 15,
    [effectKey('wizard', 'fnovanum-2', 'fnova-flames')]: 18,
    [effectKey('wizard', 'fnovanum-3', 'fnova-flames')]: 20,
    // ...and the same ice ring is the sorcerer's own nova; ladder +3
    [effectKey('sorcerer', 'nova', 'nova-shards')]: 12,
    [effectKey('sorcerer', 'novanum-1', 'nova-shards')]: 16,
    [effectKey('sorcerer', 'novanum-2', 'nova-shards')]: 20,
    // meteor shower tops out at 5 meteors (wiz_meteor.sval)
    [removeKey('wizard', 'meteornum-2')]: 1,
    [removeKey('wizard', 'meteornum-3')]: 1,

    // soul vortex lasts 8/10/12 s (war_soul_vortex.sval)
    [effectKey('warlock', 'storm', 'storm-dur')]: 8,
    [effectKey('warlock', 'stormdur-1', 'storm-dur')]: 10,
    [effectKey('warlock', 'stormdur-2', 'storm-dur')]: 12,
    // arc lightning hits 3–6 targets (wiz_arc_lightning.sval)
    [paramKey('warlock', 'lightning-bounces')]: 3,
    [effectKey('warlock', 'lightningtrg1', 'lightning-bounces')]: 4,
    [effectKey('warlock', 'lightningtrg2', 'lightning-bounces')]: 5,
    [effectKey('warlock', 'lightningtrg3', 'lightning-bounces')]: 6,
    [removeKey('warlock', 'lightningtrg4')]: 1,

    // HW2 has no lives to buy, and this generator never sells them either
    [removeKey('shared', 'life')]: 1
  }
}

/** Every HW2 class at `level`, plus the shared skill values. */
function hw2Build(level: number): PlayerTweaks {
  const tweaks: PlayerTweaks = { ...hw2SkillOverrides() }
  for (const cls of HW2_CLASSES) Object.assign(tweaks, bodyOverrides(cls.unit, hw2Body(cls, level)))
  for (const { unit, anchor } of HW2_ANCHORED) Object.assign(tweaks, anchoredOverrides(unit, anchor, level))
  return pruneTweaks(tweaks)
}

const SKILLS_NOTE =
  'HW2’s skill values where they carry over. Priest and sorcerer, not in HW2, are scaled off the wizard (the priest stays frailest with the fastest mana regen).'

export const HW2_PRESETS: readonly PlayerPreset[] = [
  {
    id: 'hw2-level-1',
    label: 'Starting characters (level 1)',
    group: 'hw2',
    description: `HW2’s level-1 bodies: tankier starts (knight 91 HP, thief 69, wizard 60) with a little more mana. ${SKILLS_NOTE}`,
    build: () => hw2Build(1)
  },
  {
    id: 'hw2-level-10',
    label: 'Tier 1 (level 10)',
    group: 'hw2',
    description: `HW2’s level-10 bodies, like a character a few upgrades in (knight 167 HP, wizard 191 mana), with about twice the mana regen. ${SKILLS_NOTE}`,
    build: () => hw2Build(10)
  },
  {
    id: 'hw2-level-25',
    label: 'Halfway (level 25)',
    group: 'hw2',
    description: `HW2’s level-25 bodies: starts about as tough as the original’s fully upgraded characters (knight 295 HP), and the shop goes past them. ${SKILLS_NOTE}`,
    build: () => hw2Build(25)
  },
  {
    id: 'hw2-level-50',
    label: 'Endgame (level 50)',
    group: 'hw2',
    description: `HW2’s level-50 bodies, 2–3× past the original’s maxed characters (knight 507 HP, wizard 591 mana and ~10 mana/s). A power fantasy, or for very hard custom dungeons. ${SKILLS_NOTE}`,
    build: () => hw2Build(50)
  }
]
