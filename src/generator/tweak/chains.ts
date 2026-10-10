import type { PlayerTweaks, TweakParam, TweakUnitFile, TweakUpgrade } from './types'

/**
 * Upgrade *chains* — the ladders the shop actually sells — and the linear curves
 * that describe them.
 *
 * The stock files store each tier as an independent `<dictionary>` with absolute
 * values, so editing a chain by hand means retyping up to five costs and five
 * stat values. Almost every stock ladder is a straight line though, so the UI
 * offers a first cost + per-tier step instead and expands it back out to the
 * per-tier overrides this module's callers already understand. Nothing here is
 * new state: `applyCostCurve`/`applyValueCurve` return an ordinary
 * `PlayerTweaks` map, so parameters.txt, validation and emission are unchanged.
 *
 * Everything is pure and RNG-free, like the rest of tweak/.
 */

/** floats accumulate noise through the fits check and back out through apply */
const EPSILON = 1e-6

/**
 * `-1` means "skill locked" and `9999` "unaffordable". Neither anchors a curve,
 * and neither may be scaled: `-1 × 2` is not "twice as locked", it is a corrupt
 * sentinel the game would read as a real value.
 */
export const SENTINELS = new Set([-1, 9999])

export function isSentinel(value: number): boolean {
  return SENTINELS.has(value)
}

export type CurveMode = 'add' | 'mul'

/** One rung: `cost(level) = first (+|*) step` applied `level - 1` times. */
export interface CostCurve {
  first: number
  step: number
  mode: CurveMode
  /** every tier lands exactly on the curve */
  fits: boolean
}

/** `value(level) = anchor (+|*) step` applied `level` times. */
export interface ValueCurve {
  /** what tier 0 would be: the starting stat, or the value the ladder implies */
  anchor: number
  step: number
  mode: CurveMode
  fits: boolean
  /** true when `anchor` is the class's starting stat rather than a fitted value */
  fromStart: boolean
}

export interface TweakChainTier {
  upgrade: TweakUpgrade
  /**
   * Position in the ladder. The `<int name="lvl">` child where the stock file has
   * one — ids can't be trusted, since knight's tier-2 whirl duration is
   * `id="whirldur"`, not `whirldur2` — else the 1-based position.
   */
  level: number
}

export interface TweakChain {
  fileId: string
  /** family key shared by every tier, e.g. "health", "armor", "whirldur" */
  key: string
  /** shop column of the first tier, e.g. "misc1" */
  cat: string
  tiers: TweakChainTier[]
  /** editable numeric stats the chain writes, in first-appearance order */
  stats: string[]
  /** single-entry chains (skill unlocks, everything in shared.xml) have no curve */
  flat: boolean
}

/** Canonical override keys. Lowercase, because configFile.ts lowercases on parse. */
export function paramKey(fileId: string, name: string): string {
  return `player.${fileId}.param.${name}`.toLowerCase()
}

export function costKey(fileId: string, upgradeId: string): string {
  return `player.${fileId}.cost.${upgradeId}`.toLowerCase()
}

export function effectKey(fileId: string, upgradeId: string, stat: string): string {
  return `player.${fileId}.effect.${upgradeId}.${stat}`.toLowerCase()
}

/**
 * "Delete this upgrade from the emitted file" rather than "change its numbers".
 * A campaign's tweak file replaces the base file wholesale, so an upgrade left
 * out of it simply does not exist in the shop — the official Temple of the Sun
 * campaign drops `pot-invul` from shared.xml exactly this way.
 */
export function removeKey(fileId: string, upgradeId: string): string {
  return `player.${fileId}.remove.${upgradeId}`.toLowerCase()
}

/**
 * Family an upgrade belongs to: its id with any trailing tier number removed.
 * Stock ids mix hyphenated and bare forms (`health-1`, `armor-1` vs `dmg1`,
 * `healeff1`), so both have to fall out of the same rule.
 */
export function chainKeyOf(id: string): string {
  const stripped = id.replace(/\d+$/, '').replace(/-$/, '')
  return stripped.length === 0 ? id : stripped
}

/**
 * Which way an upgrade improves the stat it writes, read off the stock data:
 * positive when the stock upgrade raises the starting value, negative when it
 * lowers it. `mana-regen` is a period in ms and the `*-mana-cost` stats are
 * prices, so for those the stock ladder descends.
 *
 * Shared because two features need the same answer: validation warns when an
 * upgrade has become a paid downgrade, and the bulk editor removes upgrades that
 * have nothing left to give.
 */
export function improvesBy(effectStock: number, startStock: number): number {
  return effectStock - startStock
}

/** True when buying an upgrade that sets `value` would make `start` worse. */
export function isDowngrade(value: number, start: number, improves: number): boolean {
  return improves > 0 ? value < start : value > start
}

/**
 * True when an upgrade has nothing left to give: it lands on the wrong side of
 * the current value, or exactly on it. Buying it costs gold and changes nothing
 * or makes the character worse.
 */
export function isSpent(value: number, start: number, improves: number): boolean {
  return value === start || isDowngrade(value, start, improves)
}

/** The children a user may edit: numeric, and not the tier index itself. */
export function editableChildren(upgrade: TweakUpgrade): TweakParam[] {
  return upgrade.children.filter(
    (child) => child.name !== 'lvl' && (child.type === 'int' || child.type === 'float')
  )
}

function levelOf(upgrade: TweakUpgrade, position: number): number {
  const lvl = upgrade.children.find((child) => child.name === 'lvl' && child.type === 'int')
  const parsed = lvl === undefined ? 0 : Number(lvl.value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : position + 1
}

/** Chains of `file`, in the order their first tier appears in the stock file. */
export function buildChains(file: TweakUnitFile): TweakChain[] {
  const byKey = new Map<string, TweakChain>()
  const order: string[] = []
  const positions = new Map<string, number>()

  for (const upgrade of file.upgrades) {
    const key = chainKeyOf(upgrade.id)
    let chain = byKey.get(key)
    if (chain === undefined) {
      chain = { fileId: file.id, key, cat: upgrade.cat, tiers: [], stats: [], flat: true }
      byKey.set(key, chain)
      order.push(key)
    }

    const position = positions.get(key) ?? 0
    positions.set(key, position + 1)
    chain.tiers.push({ upgrade, level: levelOf(upgrade, position) })

    for (const child of editableChildren(upgrade)) {
      if (!chain.stats.includes(child.name)) chain.stats.push(child.name)
    }
  }

  const chains = order.map((key) => byKey.get(key) as TweakChain)
  for (const chain of chains) {
    chain.flat = chain.tiers.length < 2
  }
  return chains
}

/** Cost of one tier with the user's overrides applied. */
export function currentCost(chain: TweakChain, tier: TweakChainTier, tweaks: PlayerTweaks): number {
  return tweaks[costKey(chain.fileId, tier.upgrade.id)] ?? tier.upgrade.cost
}

/** Value one tier writes for `stat`, with overrides applied, or undefined if it doesn't. */
export function currentValue(
  chain: TweakChain,
  tier: TweakChainTier,
  stat: string,
  tweaks: PlayerTweaks
): number | undefined {
  const child = editableChildren(tier.upgrade).find((k) => k.name === stat)
  if (child === undefined) return undefined
  return tweaks[effectKey(chain.fileId, tier.upgrade.id, stat)] ?? Number(child.value)
}

/** Starting value of `stat` with overrides applied, or undefined if it isn't a param. */
export function currentStart(
  file: TweakUnitFile,
  stat: string,
  tweaks: PlayerTweaks
): number | undefined {
  const param = file.params.find(
    (p) => p.name === stat && (p.type === 'int' || p.type === 'float')
  )
  if (param === undefined) return undefined
  return tweaks[paramKey(file.id, stat)] ?? Number(param.value)
}

function isInt(chain: TweakChain, stat: string): boolean {
  for (const tier of chain.tiers) {
    const child = tier.upgrade.children.find((k) => k.name === stat)
    if (child !== undefined) return child.type === 'int'
  }
  return true
}

export function round(value: number, int: boolean): number {
  if (int) return Math.round(value)
  // floats are typed by hand in the stock files; 2.25 must not come back 2.2500000000000004
  return Math.round(value * 1e6) / 1e6
}

export function same(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

function stepAt(base: number, step: number, mode: CurveMode, times: number): number {
  return mode === 'add' ? base + step * times : base * Math.pow(step, times)
}

/** Cost the curve prescribes for a tier. Never negative — validation rejects that. */
export function costAt(curve: CostCurve, chain: TweakChain, tier: TweakChainTier): number {
  const firstLevel = chain.tiers[0]?.level ?? 1
  return Math.max(0, round(stepAt(curve.first, curve.step, curve.mode, tier.level - firstLevel), true))
}

/** Value the curve prescribes for a tier. */
export function valueAt(
  curve: ValueCurve,
  chain: TweakChain,
  tier: TweakChainTier,
  stat: string
): number {
  return round(stepAt(curve.anchor, curve.step, curve.mode, tier.level), isInt(chain, stat))
}

function costFits(chain: TweakChain, curve: CostCurve, tweaks: PlayerTweaks): boolean {
  return chain.tiers.every((tier) => same(costAt(curve, chain, tier), currentCost(chain, tier, tweaks)))
}

/**
 * The curve the chain's current costs describe.
 *
 * Additive is tried first because the stock ladders are arithmetic, not
 * geometric — knight health is 600/1200/1800/2400/3000 (+600) and mana
 * 800/1900/3000/4100/5200 (+1100). `fits: false` means the tiers are irregular
 * and the step shown is only a best fit through the endpoints.
 */
export function deriveCostCurve(chain: TweakChain, tweaks: PlayerTweaks): CostCurve {
  const first = currentCost(chain, chain.tiers[0], tweaks)
  const last = chain.tiers[chain.tiers.length - 1]
  const lastCost = currentCost(chain, last, tweaks)
  const span = last.level - chain.tiers[0].level

  if (span <= 0) return { first, step: 0, mode: 'add', fits: true }

  const add: CostCurve = { first, step: round((lastCost - first) / span, true), mode: 'add', fits: false }
  add.fits = costFits(chain, add, tweaks)
  if (add.fits) return add

  if (first > 0 && lastCost > 0) {
    const mul: CostCurve = {
      first,
      step: round(Math.pow(lastCost / first, 1 / span), false),
      mode: 'mul',
      fits: false
    }
    mul.fits = costFits(chain, mul, tweaks)
    if (mul.fits) return mul
  }

  return add
}

function statTiers(chain: TweakChain, stat: string, tweaks: PlayerTweaks): TweakChainTier[] {
  return chain.tiers.filter((tier) => currentValue(chain, tier, stat, tweaks) !== undefined)
}

function valueFits(
  chain: TweakChain,
  stat: string,
  curve: ValueCurve,
  tweaks: PlayerTweaks
): boolean {
  return statTiers(chain, stat, tweaks).every((tier) =>
    same(valueAt(curve, chain, tier, stat), currentValue(chain, tier, stat, tweaks) as number)
  )
}

/**
 * The curve the chain's current values for `stat` describe.
 *
 * Anchored on the class's starting stat where there is one, because that is how
 * the stock ladders were built and it is what makes the shop coherent: knight
 * health is 75 +45/tier, mana 50 +25/tier, mana-regen 1100 −100/tier, sword-arc
 * 90 +30/tier — all exact. Chains whose stat has no starting param, or whose
 * param sits on a locked sentinel, fall back to a line fitted through the tiers.
 */
export function deriveValueCurve(
  file: TweakUnitFile,
  chain: TweakChain,
  stat: string,
  tweaks: PlayerTweaks
): ValueCurve {
  const tiers = statTiers(chain, stat, tweaks)
  const first = tiers[0]
  const last = tiers[tiers.length - 1]
  const firstValue = currentValue(chain, first, stat, tweaks) as number
  const lastValue = currentValue(chain, last, stat, tweaks) as number

  const start = currentStart(file, stat, tweaks)
  const usableStart = start !== undefined && start >= 0 && !SENTINELS.has(start)

  const build = (anchor: number, fromStart: boolean, span: number, from: number): ValueCurve => {
    const add: ValueCurve = {
      anchor,
      step: span <= 0 ? 0 : round((lastValue - from) / span, false),
      mode: 'add',
      fits: false,
      fromStart
    }
    add.fits = valueFits(chain, stat, add, tweaks)
    if (add.fits) return add

    if (anchor > 0 && lastValue > 0 && span > 0) {
      const mul: ValueCurve = {
        anchor,
        step: round(Math.pow(lastValue / from, 1 / span), false),
        mode: 'mul',
        fits: false,
        fromStart
      }
      mul.fits = valueFits(chain, stat, mul, tweaks)
      if (mul.fits) return mul
    }

    return add
  }

  const anchored = usableStart ? build(start, true, last.level, start) : undefined
  if (anchored?.fits === true) return anchored

  if (tiers.length < 2) {
    return anchored ?? { anchor: firstValue, step: 0, mode: 'add', fits: true, fromStart: false }
  }

  // the ladder doesn't sit on the starting stat (or there isn't one): fit a line
  // through the tiers themselves and expose the tier-0 value it implies, so the
  // step still means "per tier" even for a ladder the game built off-centre
  const span = last.level - first.level
  const step = round((lastValue - firstValue) / span, false)
  const fitted: ValueCurve = {
    anchor: round(firstValue - step * first.level, false),
    step,
    mode: 'add',
    fits: false,
    fromStart: false
  }
  fitted.fits = valueFits(chain, stat, fitted, tweaks)
  if (fitted.fits) return fitted

  // neither is exact — prefer the starting stat, which is the knob that matters
  return anchored ?? fitted
}

/**
 * Records one override in place. Exported because every bulk writer needs the
 * same rule: an override equal to stock is not an override — `pruneTweaks` would
 * drop it anyway, and keeping it would make "nothing changed" stop meaning `{}`.
 */
export function withOverride(
  tweaks: PlayerTweaks,
  key: string,
  value: number,
  stock: number
): void {
  if (same(value, stock)) delete tweaks[key]
  else tweaks[key] = value
}

/** `tweaks` with every tier's cost rewritten to follow `curve`. */
export function applyCostCurve(
  chain: TweakChain,
  curve: CostCurve,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  for (const tier of chain.tiers) {
    withOverride(
      next,
      costKey(chain.fileId, tier.upgrade.id),
      costAt(curve, chain, tier),
      tier.upgrade.cost
    )
  }
  return next
}

/** `tweaks` with every tier's `stat` rewritten to follow `curve`. */
export function applyValueCurve(
  chain: TweakChain,
  stat: string,
  curve: ValueCurve,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  for (const tier of chain.tiers) {
    const child = editableChildren(tier.upgrade).find((k) => k.name === stat)
    if (child === undefined) continue
    withOverride(
      next,
      effectKey(chain.fileId, tier.upgrade.id, stat),
      valueAt(curve, chain, tier, stat),
      Number(child.value)
    )
  }
  return next
}
