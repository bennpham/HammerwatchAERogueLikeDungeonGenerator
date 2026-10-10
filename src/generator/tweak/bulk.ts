import { TWEAK_BASELINE } from './baseline'
import {
  buildChains,
  editableChildren,
  improvesBy,
  isSentinel,
  isSpent,
  paramKey,
  removeKey,
  round,
  same,
  withOverride
} from './chains'
import type { TweakChain } from './chains'
import { maxedParams, maxedStrings } from './loadout'
import { TWEAK_FIELDS, TWEAK_FIELD_MAP, applyTweaks } from './overrides'
import type { TweakFieldDef } from './overrides'
import type { PlayerTweaks, TweakUnitFile } from './types'

/**
 * Bulk editing across every class at once — the "quick setup" a dungeon master
 * needs to stand up a modified roster without walking ~1,400 individual fields.
 *
 * Two rules make the whole module work:
 *
 * 1. **No new state.** Everything here returns an ordinary `PlayerTweaks` map of
 *    the same `player.*` keys the per-field form writes, so parameters.txt,
 *    validation and emission are unchanged. A knob's displayed value is
 *    *derived* back out of the overrides, exactly as `deriveCostCurve` does for
 *    a single ladder.
 * 2. **Factors are relative to stock, not to the current value.** That makes
 *    them idempotent — `×2` always means "stock doubled", never "double again" —
 *    and it is what lets the derive step recover the factor at all. A factor of
 *    exactly 1 therefore writes nothing, which keeps the "no player edits ⇒ no
 *    tweak/ folder" invariant intact.
 *
 * Pure and RNG-free, like the rest of tweak/.
 */

export type StatGroupId = 'health' | 'mana' | 'damage' | 'defense' | 'utility' | 'costs'

/**
 * Which way "better" points.
 *
 * Most stats climb, but `mana-regen` is a millisecond period and the various
 * `*-cost` stats are prices — those get *divided* by the factor, so `×2` reads
 * as "twice as strong" everywhere regardless of the underlying polarity. This
 * also keeps each ladder pointing the same direction the stock data does, which
 * is what validation's downgrade check measures against.
 */
export type StatDirection = 'higher' | 'lower'

export interface StatGroup {
  id: StatGroupId
  label: string
  hint: string
}

/** Display order of the knobs. */
export const STAT_GROUPS: StatGroup[] = [
  { id: 'health', label: 'Health', hint: 'Max health, regen and every heal' },
  { id: 'mana', label: 'Mana', hint: 'Max mana, mana regen (a faster period) and fervor' },
  { id: 'damage', label: 'Damage', hint: 'Every weapon and spell damage stat, plus damage multipliers' },
  { id: 'defense', label: 'Defense', hint: 'Damage reduction, dodge, block and the magic shield' },
  { id: 'utility', label: 'Utility', hint: 'Ranges, arcs, durations, projectile counts and movement' },
  { id: 'costs', label: 'Costs', hint: 'Mana and gold costs of using skills — higher × makes them cheaper' }
]

interface StatRule {
  group: StatGroupId
  direction: StatDirection
  match: (stat: string) => boolean
}

const exact = (...names: string[]): ((stat: string) => boolean) => {
  const set = new Set(names)
  return (stat) => set.has(stat)
}

const suffix = (...ends: string[]): ((stat: string) => boolean) => {
  return (stat) => ends.some((end) => stat.endsWith(end))
}

/**
 * First match wins, so the specific rules come before the broad ones —
 * `dmg-reduction` has to be claimed by defense before anything reaches for
 * damage, and `shield-dmg-per-mana` before the cost rule sees `-mana`.
 *
 * A stat that matches nothing is left alone by every knob, and
 * tests/tweakBulk.test.ts asserts that no such stat exists, so a future
 * baseline addition cannot silently escape the bulk editor.
 */
const STAT_RULES: StatRule[] = [
  {
    group: 'health',
    direction: 'higher',
    match: exact(
      'max-health',
      'hp-regen',
      'kill-heal',
      'heal-amount',
      'beam-heal',
      'combo-heal',
      'area-heal-mul'
    )
  },
  { group: 'mana', direction: 'lower', match: exact('mana-regen') },
  { group: 'mana', direction: 'higher', match: exact('max-mana', 'kill-mana', 'combo-mana', 'max-fervor') },
  {
    group: 'defense',
    direction: 'higher',
    match: (stat) =>
      stat === 'dmg-reduction' ||
      stat === 'dodge-chance' ||
      stat === 'bash-chance' ||
      stat.startsWith('shield-')
  },
  // a movement penalty stored as a negative modifier: dividing shrinks it
  { group: 'costs', direction: 'lower', match: exact('knives-speed-mod', 'smite-speed-pen') },
  { group: 'costs', direction: 'lower', match: suffix('-mana-cost', '-money-cost', '-mana-drain') },
  {
    group: 'damage',
    direction: 'higher',
    match: (stat) =>
      stat.endsWith('-dmg') ||
      stat === 'dmg-mul' ||
      stat.endsWith('-dmg-mul') ||
      stat.endsWith('-dmg-multiplier')
  },
  { group: 'utility', direction: 'higher', match: () => true }
]

function ruleOf(stat: string): StatRule {
  // the final rule matches everything, so this never falls through
  return STAT_RULES.find((rule) => rule.match(stat)) as StatRule
}

/** The group a stat name belongs to. */
export function groupOfStat(stat: string): StatGroupId {
  return ruleOf(stat).group
}

/**
 * Fields a factor may touch: numeric starting stats and numeric upgrade effects
 * in the class files and shared.xml. `general.xml` is enemy scaling, not a
 * character stat, and is left to its own section.
 */
const SCALABLE_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter(
  (field) =>
    field.fileId !== 'general' &&
    (field.group === 'param' || field.group === 'effect') &&
    field.type !== 'bool' &&
    // a string override is an index into `choices`; scaling it would swap the
    // projectile for an unrelated one
    field.type !== 'string' &&
    field.stat !== undefined
)

const FIELDS_BY_GROUP = ((): Map<StatGroupId, TweakFieldDef[]> => {
  const map = new Map<StatGroupId, TweakFieldDef[]>()
  for (const group of STAT_GROUPS) map.set(group.id, [])
  for (const field of SCALABLE_FIELDS) {
    map.get(groupOfStat(field.stat as string))?.push(field)
  }
  return map
})()

/** Every field one knob owns — starting stats and the upgrade tiers alike. */
export function fieldsOfGroup(group: StatGroupId): TweakFieldDef[] {
  return FIELDS_BY_GROUP.get(group) ?? []
}

/**
 * What `factor` turns this field's stock value into, or undefined when the field
 * sits this one out.
 *
 * Sentinels are skipped because `-1 × 2` is not "twice as locked", it is a
 * corrupt value the game would read as real. `0` is skipped because scaling it
 * is a no-op that would only add noise to the override map.
 */
function scaled(field: TweakFieldDef, factor: number): number | undefined {
  if (field.stock === 0 || isSentinel(field.stock)) return undefined
  const rule = ruleOf(field.stat as string)
  const value = rule.direction === 'higher' ? field.stock * factor : field.stock / factor
  return round(value, field.type === 'int')
}

function usableFactor(factor: number): boolean {
  return Number.isFinite(factor) && factor > 0
}

/** `tweaks` with every stat in `group` rewritten to `stock × factor`. */
export function applyStatFactor(
  group: StatGroupId,
  factor: number,
  tweaks: PlayerTweaks
): PlayerTweaks {
  if (!usableFactor(factor)) return tweaks

  const next: PlayerTweaks = { ...tweaks }
  for (const field of fieldsOfGroup(group)) {
    const value = scaled(field, factor)
    if (value === undefined) continue
    withOverride(next, field.key, value, field.stock)
  }
  return next
}

export interface StatFactor {
  factor: number
  /** false when the group's current values are not one clean factor of stock */
  uniform: boolean
}

/**
 * The factor the group's current overrides describe.
 *
 * Rounding makes this impossible to solve exactly — a stock 9 scaled by 1.5 is
 * stored as 14, which reads back as 1.5556 — so it anchors on the largest stock
 * value, which carries the least rounding error, then verifies the candidate by
 * re-applying it. `uniform: false` means the group has been edited by hand and
 * the factor shown is only the closest single explanation.
 */
export function deriveStatFactor(group: StatGroupId, tweaks: PlayerTweaks): StatFactor {
  const fields = fieldsOfGroup(group).filter((field) => scaled(field, 1) !== undefined)
  const touched = fields.filter((field) => tweaks[field.key] !== undefined)
  if (touched.length === 0) return { factor: 1, uniform: true }

  const anchor = touched.reduce((best, field) =>
    Math.abs(field.stock) > Math.abs(best.stock) ? field : best
  )
  const value = tweaks[anchor.key] as number
  const rule = ruleOf(anchor.stat as string)
  const candidate = round(
    rule.direction === 'higher' ? value / anchor.stock : anchor.stock / value,
    false
  )
  if (!usableFactor(candidate)) return { factor: 1, uniform: false }

  const expected = applyStatFactor(group, candidate, {})
  const uniform = fields.every((field) => {
    const mine = tweaks[field.key]
    const theirs = expected[field.key]
    if (mine === undefined || theirs === undefined) return mine === theirs
    return same(mine, theirs)
  })

  return { factor: candidate, uniform }
}

/** `tweaks` with every stat group scaled by the same factor. */
export function applyMasterFactor(factor: number, tweaks: PlayerTweaks): PlayerTweaks {
  if (!usableFactor(factor)) return tweaks
  return STAT_GROUPS.reduce(
    (acc, group) => applyStatFactor(group.id, factor, acc),
    tweaks as PlayerTweaks
  )
}

/** The one factor every group shares, if they do share one. */
export function deriveMasterFactor(tweaks: PlayerTweaks): StatFactor {
  const derived = STAT_GROUPS.map((group) => deriveStatFactor(group.id, tweaks))
  const first = derived[0]
  const uniform = derived.every((d) => d.uniform && same(d.factor, first.factor))
  if (uniform) return first

  // not one factor: surface the most-changed group's value rather than a bare 1,
  // so the knob reads as "roughly this, and mixed" instead of "untouched"
  const moved = derived.find((d) => !same(d.factor, 1))
  return { factor: moved?.factor ?? 1, uniform: false }
}

/* ------------------------------------------------------------------ shop ---- */

/**
 * What the shop sells and for how much.
 *
 * `removed` rather than a punitive price: play-testing confirmed that an upgrade
 * left out of a campaign's tweak file simply is not in the shop, which is a
 * cleaner "base stats only" than a price nobody can reach. `999999` is the
 * highest figure the shop will display, so pricing was always a ceiling hack.
 */
export type CostPolicy = 'stock' | 'free' | 'removed' | 'custom' | 'mixed'

/**
 * The largest price the shop renders. Verified in game — 999999 shows in full
 * and reads as unaffordable; the game's own `9999` idiom is affordable late.
 * Kept as the bound for a custom price rather than as a lockout mechanism.
 */
export const SHOP_PRICE_MAX = 999999

const COST_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter((field) => field.group === 'cost')

/** The one removal the cost policy does not own — see REMOVE_FIELDS below. */
const EXTRA_LIFE_KEY = removeKey('shared', 'life')

/**
 * Every remove flag *except* the extra-life one, which the targeted Quick Setup
 * checkbox owns outright.
 *
 * The coarse cost policy used to clear all of them, which quietly re-enabled
 * buyable extra lives whenever anyone picked a shop-price preset — and since
 * `defaultParameters()` now ships that removal, it undid a default nobody
 * touched. Excluding it here is what the "the per-upgrade flags stay available
 * for the targeted case (extra lives)" comment below always claimed was true.
 */
const REMOVE_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter(
  (field) => field.group === 'remove' && field.key !== EXTRA_LIFE_KEY
)

/**
 * Prices are integers and the shop pays the difference on a negative one — a
 * confirmed quirk, and a deliberately supported one: an upgrade that *gives*
 * gold lets a dungeon master build a cursed shop where you sell your own stats.
 */
export function shopPrice(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-SHOP_PRICE_MAX, Math.min(SHOP_PRICE_MAX, Math.round(value)))
}

/** Every upgrade price across the seven classes and shared.xml. */
export function applyCostPolicy(
  policy: Exclude<CostPolicy, 'mixed'>,
  price: number,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  const target = policy === 'free' ? 0 : shopPrice(price)

  for (const field of COST_FIELDS) {
    if (policy === 'stock' || policy === 'removed') delete next[field.key]
    else withOverride(next, field.key, target, field.stock)
  }

  // Removal is all-or-nothing here, which is why this clears rather than
  // merges. REMOVE_FIELDS deliberately excludes the extra-life flag, so the
  // targeted control keeps owning that one and a price preset can no longer
  // put buyable lives back on behind the user's back.
  for (const field of REMOVE_FIELDS) {
    if (policy === 'removed') next[field.key] = 1
    else delete next[field.key]
  }

  return next
}

export function deriveCostPolicy(tweaks: PlayerTweaks, price: number): CostPolicy {
  if (REMOVE_FIELDS.every((field) => tweaks[field.key] === 1)) return 'removed'

  // removals are orthogonal to prices: a shortened ladder or a removed extra life
  // says nothing about what the remaining upgrades cost
  if (COST_FIELDS.every((field) => tweaks[field.key] === undefined)) return 'stock'

  const at = (value: number): boolean =>
    COST_FIELDS.every((field) => (tweaks[field.key] ?? field.stock) === value)
  if (at(0)) return 'free'
  if (at(shopPrice(price))) return 'custom'
  return 'mixed'
}

/* ---------------------------------------------------------------- skills ---- */

export interface SkillUnlock {
  fileId: string
  /** the bool param the upgrade sets, e.g. "whirl" */
  flag: string
  /** the upgrade that grants it */
  upgradeId: string
  /** the numeric stats it fills in at the same time */
  stats: string[]
  /** the string params it fills in — projectile and buff paths */
  strings: string[]
}

/**
 * Which upgrade unlocks which skill, read straight out of the baseline.
 *
 * A skill is gated by a `bool` param that starts false, and the upgrade that
 * flips it also fills in the skill's stats — knight's whirlwind starts with
 * `whirl-dur: -1` and `whirl-dmg-multiplier: -1`, sorcerer's nova with
 * `nova-mana-cost: 9999`. Flipping the flag alone therefore yields a skill that
 * exists but does nothing, so pre-unlocking has to apply the whole upgrade.
 */
export const SKILL_UNLOCKS: SkillUnlock[] = ((): SkillUnlock[] => {
  const unlocks: SkillUnlock[] = []
  for (const file of TWEAK_BASELINE) {
    if (file.kind !== 'unit') continue
    for (const upgrade of file.upgrades) {
      for (const child of upgrade.children) {
        if (child.type !== 'bool' || child.value !== true) continue
        unlocks.push({
          fileId: file.id,
          flag: child.name,
          upgradeId: upgrade.id,
          stats: editableChildren(upgrade).map((stat) => stat.name),
          strings: upgrade.children.filter((c) => c.type === 'string').map((c) => c.name)
        })
      }
    }
  }
  return unlocks
})()

function unitFileOf(files: ReturnType<typeof applyTweaks>, id: string): TweakUnitFile | undefined {
  const file = files.find((candidate) => candidate.id === id)
  return file !== undefined && file.kind === 'unit' ? file : undefined
}

/**
 * Applies one unlock in place, against files that already have `tweaks` applied.
 *
 * Switching a skill on means applying the whole upgrade, not just its flag —
 * see SKILL_UNLOCKS above for why the flag on its own is not enough.
 */
function unlockInto(
  next: PlayerTweaks,
  files: ReturnType<typeof applyTweaks>,
  unlock: SkillUnlock,
  on: boolean
): void {
  const flagField = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, unlock.flag))
  if (flagField === undefined) return

  if (!on) {
    delete next[flagField.key]
    for (const stat of [...unlock.stats, ...unlock.strings]) {
      const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, stat))
      if (field !== undefined) delete next[field.key]
    }
    return
  }

  withOverride(next, flagField.key, 1, flagField.stock)

  const file = unitFileOf(files, unlock.fileId)
  const upgrade = file?.upgrades.find((candidate) => candidate.id === unlock.upgradeId)
  if (upgrade === undefined) return

  for (const child of editableChildren(upgrade)) {
    const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, child.name))
    if (field === undefined || field.type === 'bool') continue
    withOverride(next, field.key, round(Number(child.value), field.type === 'int'), field.stock)
  }

  // and the strings, which are not stats but still have to advance: aura-buff and
  // combo-nova-projectile start empty, and a skill pointed at an empty path
  // crashes the game the first time it fires
  for (const child of upgrade.children) {
    if (child.type !== 'string') continue
    setStringChoice(next, unlock.fileId, child.name, String(child.value))
  }
}

/**
 * Points a string param at one of its stock values, by index.
 *
 * Silently does nothing when the value isn't one the baseline offers — the index
 * only means anything relative to `choices`, so an unknown string has no
 * representation and guessing one would emit a path the game cannot load.
 */
function setStringChoice(
  tweaks: PlayerTweaks,
  fileId: string,
  name: string,
  value: string
): void {
  const field = TWEAK_FIELD_MAP.get(paramKey(fileId, name))
  if (field?.choices === undefined) return
  const index = field.choices.indexOf(value)
  if (index < 0) return
  withOverride(tweaks, field.key, index, field.stock)
}

/**
 * Start every class with its 2nd and ultimate skill available.
 *
 * Values come from the *tweaked* files rather than the baseline, so a roster
 * that has already been scaled pre-unlocks the scaled skill rather than the
 * stock one.
 */
export function applySkillUnlocks(on: boolean, tweaks: PlayerTweaks): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  const files = applyTweaks(tweaks)
  for (const unlock of SKILL_UNLOCKS) unlockInto(next, files, unlock, on)
  return next
}

/**
 * One class's one skill, for the per-class checkboxes. Same semantics as the
 * bulk toggle, so ticking a box in the Knight section and ticking the roster-wide
 * box produce the same overrides for that skill.
 */
export function applySkillUnlock(
  fileId: string,
  flag: string,
  on: boolean,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const unlock = SKILL_UNLOCKS.find(
    (candidate) => candidate.fileId === fileId && candidate.flag === flag
  )
  if (unlock === undefined) return tweaks

  const next: PlayerTweaks = { ...tweaks }
  unlockInto(next, applyTweaks(tweaks), unlock, on)
  return next
}

/** True when every class's skill flags are switched on. */
export function deriveSkillUnlocks(tweaks: PlayerTweaks): boolean {
  return SKILL_UNLOCKS.every((unlock) => {
    const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, unlock.flag))
    return field !== undefined && tweaks[field.key] === 1
  })
}

/* --------------------------------------------------------------- presets ---- */

/**
 * Bake every upgrade's result into the starting stats, so the roster begins
 * fully upgraded at whatever balance is currently set.
 *
 * A one-shot action rather than a toggle, deliberately: it reads the *tweaked*
 * files, so it composes with the factors above (scale first, then bake), and
 * modelling it as derived state would be circular — the check for "is it on?"
 * would be reading the very values it writes.
 */
export function applyFullyUpgraded(tweaks: PlayerTweaks): PlayerTweaks {
  const next: PlayerTweaks = applySkillUnlocks(true, tweaks)

  for (const file of applyTweaks(next)) {
    if (file.kind !== 'unit') continue
    for (const [stat, value] of maxedParams(file)) {
      const field = TWEAK_FIELD_MAP.get(paramKey(file.id, stat))
      if (field === undefined || field.type === 'bool' || field.type === 'string') continue
      withOverride(next, field.key, round(value, field.type === 'int'), field.stock)
    }
    // the top of each string ladder too, so a maxed character gets the projectile
    // and buff paths its upgrades would have set
    for (const [name, value] of maxedStrings(file)) {
      setStringChoice(next, file.id, name, value)
    }
  }

  // nothing in the shop can improve a maxed character, and the game will happily
  // sell a "Knives Damage 1" that drops knives-dmg from 46 to 16, so clear them
  return applyDeadUpgradeRemoval(next)
}

/* -------------------------------------------------------------- removals ---- */

export interface ShopRemoval {
  fileId: string
  upgradeId: string
}

/**
 * The extra-life purchase. `life` is repeatable and its price scales by 2.6,
 * which players farm by leaving a level and coming back, so a dungeon master
 * usually wants it gone rather than merely expensive. `rejuv` is deliberately
 * left in the shop: it is a one-off full heal, not another life.
 */
export const EXTRA_LIFE_UPGRADES: ShopRemoval[] = [{ fileId: 'shared', upgradeId: 'life' }]

/** Drop `targets` from the shop entirely, or put them back. */
export function applyShopRemovals(
  targets: ShopRemoval[],
  on: boolean,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  for (const target of targets) {
    const key = removeKey(target.fileId, target.upgradeId)
    if (on) next[key] = 1
    else delete next[key]
  }
  return next
}

/* ------------------------------------------------------- ladders & death ---- */

export interface TiersSold {
  /** how many tiers of the ladder the shop still offers */
  count: number
  /** false when the removals are not a clean "everything above tier N" cut */
  uniform: boolean
}

/**
 * Limit a ladder to its first `count` tiers.
 *
 * Only the boundary tier gets a flag: every chain links tier N to tier N-1 by
 * `req`, and `applyTweaks` drops anything whose `req` chain reaches a removed
 * upgrade, so flagging tier 3 removes 3, 4 and 5 on its own. One key instead of
 * three, and the derive step reads back exactly what was written.
 */
export function applyTiersSold(
  chain: TweakChain,
  count: number,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  const limit = Math.max(0, Math.min(chain.tiers.length, Math.round(count)))

  for (const tier of chain.tiers) delete next[removeKey(chain.fileId, tier.upgrade.id)]
  if (limit < chain.tiers.length) {
    next[removeKey(chain.fileId, chain.tiers[limit].upgrade.id)] = 1
  }
  return next
}

/**
 * How many tiers the shop still offers.
 *
 * A hand-made removal the cascade cannot express — tier 3 and 5 flagged but not
 * 4 — reads back as the *lowest* flagged tier with `uniform: false`. That is
 * honest rather than lossy: the emitted file really does drop 4 as well, because
 * 4 requires 3.
 */
export function deriveTiersSold(chain: TweakChain, tweaks: PlayerTweaks): TiersSold {
  const flagged = chain.tiers
    .map((tier, index) => (tweaks[removeKey(chain.fileId, tier.upgrade.id)] === 1 ? index : -1))
    .filter((index) => index >= 0)

  if (flagged.length === 0) return { count: chain.tiers.length, uniform: true }
  // one flag, and nothing below it, is the shape applyTiersSold writes
  return { count: flagged[0], uniform: flagged.length === 1 }
}

/**
 * True when an upgrade has nothing left to give — every stat it writes is
 * already at or past the character's current starting value.
 *
 * **An upgrade with no editable children is never dead.** `life`, `rejuv` and the
 * three potion upgrades carry no stats at all, so there is nothing to compare;
 * they stay in the shop because a maxed character can still use an extra life.
 * That is why this is a computed rule rather than "remove everything".
 */
export function isDeadUpgrade(
  file: TweakUnitFile,
  upgrade: TweakUnitFile['upgrades'][number],
  tweaks: PlayerTweaks
): boolean {
  // bools count: an upgrade whose only job is unlocking a skill you already have
  // is just as spent as one that sets a stat you already beat
  const children = upgrade.children.filter(
    (child) => child.name !== 'lvl' && child.type !== 'string'
  )
  if (children.length === 0) return false

  return children.every((child) => {
    const start = TWEAK_FIELD_MAP.get(paramKey(file.id, child.name))
    if (start === undefined) return false

    const target = child.type === 'bool' ? (child.value === true ? 1 : 0) : Number(child.value)
    const current = tweaks[start.key] ?? start.stock

    if (child.type === 'bool') return current === target
    if (isSentinel(current)) return false

    const improves = directionOf(file.id, child.name, target, start.stock)
    // no direction means the child carries no progression at all — warlock's
    // `garg` rewrites `garg-mana-cost` with the value it already had — so it
    // cannot be an improvement and must not veto the rest
    if (improves === 0) return true

    return isSpent(target, current, improves)
  })
}

/** Stock values every upgrade in a file writes for a stat, in file order. */
const EFFECT_STOCKS = ((): Map<string, number[]> => {
  const map = new Map<string, number[]>()
  for (const field of TWEAK_FIELDS) {
    if (field.group !== 'effect' || field.stat === undefined) continue
    const key = `${field.fileId}.${field.stat}`
    const bucket = map.get(key)
    if (bucket === undefined) map.set(key, [field.stock])
    else bucket.push(field.stock)
  }
  return map
})()

/**
 * Which way an upgrade improves a stat, positive for "higher is better".
 *
 * **The ladder is consulted first**, because it is the progression the game
 * actually shipped, while a starting value can lie in two ways: it may be the
 * `-1`/`9999` "locked" sentinel (`whirl-dur`), or a plain `0` meaning *disabled*
 * rather than *worst*. Priest `hp-regen` is the case that matters — it starts at
 * 0, so measuring from it says "higher is better", but the ladder runs
 * 5 → 2.5 → 1.67 → 1.25 because it is a period in seconds and lower is faster.
 *
 * A stat written by only one upgrade has no ladder, so it falls back to the
 * starting value; if that yields nothing either, the caller treats the child as a
 * no-op rather than an improvement.
 */
function directionOf(
  fileId: string,
  stat: string,
  effectStock: number,
  startStock: number
): number {
  const ladder = (EFFECT_STOCKS.get(`${fileId}.${stat}`) ?? []).filter((v) => !isSentinel(v))
  if (ladder.length >= 2) {
    const slope = improvesBy(ladder[ladder.length - 1], ladder[0])
    if (slope !== 0) return slope
  }

  return isSentinel(startStock) ? 0 : improvesBy(effectStock, startStock)
}

/**
 * Take every upgrade that can no longer improve anything out of the shop.
 *
 * Written per chain rather than per upgrade so it shares the tiers-sold
 * representation: the lowest dead tier becomes the ladder's limit, and the `req`
 * cascade clears the rest.
 */
export function applyDeadUpgradeRemoval(tweaks: PlayerTweaks): PlayerTweaks {
  let next: PlayerTweaks = { ...tweaks }

  for (const file of applyTweaks(next)) {
    if (file.kind !== 'unit') continue
    for (const chain of buildChains(file)) {
      const dead = chain.tiers.findIndex((tier) => isDeadUpgrade(file, tier.upgrade, next))
      if (dead >= 0) next = applyTiersSold(chain, dead, next)
    }
  }

  return next
}

export function deriveShopRemovals(targets: ShopRemoval[], tweaks: PlayerTweaks): boolean {
  return (
    targets.length > 0 &&
    targets.every((target) => tweaks[removeKey(target.fileId, target.upgradeId)] === 1)
  )
}

/**
 * Returns every field the quick-setup section can reach to its stock value.
 *
 * That includes hand edits to those same fields — the section owns all starting
 * stats, upgrade effects, prices and skill flags, so this is "undo the roster",
 * not "undo only my knob presses". Enemy difficulty is untouched, and so is
 * the extra-life removal: this generator's campaigns never sell lives
 * (`defaultParameters()` ships the removal), so a reset must not reopen them.
 */
export function resetQuickSetup(tweaks: PlayerTweaks): PlayerTweaks {
  const keep = new Set(EXTRA_LIFE_UPGRADES.map((target) => removeKey(target.fileId, target.upgradeId)))
  const next: PlayerTweaks = {}
  for (const [key, value] of Object.entries(tweaks)) {
    const field = TWEAK_FIELD_MAP.get(key.toLowerCase())
    // dropping by field rather than by knob: a stat whose stock is 0 carries no
    // factor, so scaling it back to ×1 would leave it behind
    if (field !== undefined && field.fileId !== 'general' && !keep.has(key.toLowerCase())) continue
    next[key] = value
  }
  return next
}

/** Total price of every upgrade in the shop, for the "gold to max" readout. */
export function totalShopCost(tweaks: PlayerTweaks): number {
  return applyTweaks(tweaks).reduce(
    (sum, file) =>
      file.kind === 'unit'
        ? sum + file.upgrades.reduce((inner, upgrade) => inner + upgrade.cost, 0)
        : sum,
    0
  )
}
