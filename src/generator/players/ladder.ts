import type { PlayerBuffLevel, PlayerChain, PlayerSkillFile, PlayerTier } from './model'

/**
 * A chain's tiers past stock. AE has no cap on a skill's levels: it has as
 * many as the skill dict plus its `upgrades` (`PlayerClass.as`), and its shop
 * sells the next one whenever that tier's `category` is a column the vendor
 * sells ([VERIFIED] up to level 99, docs/discovery/upgrades-past-tier-5.md).
 * A tier added past stock is a copy of the chain's last upgrade, re-valued:
 * every number carries on the step of the two tiers below it. Pure; this
 * module knows the stock files only, and the caller supplies the effective
 * values the ladder starts from.
 */

/** The most tiers a chain can have; the experiment went this far. */
export const PLAYER_LEVELS_MAX = 99

/** The highest price the tab accepts; past this nobody could afford it anyway. */
export const PLAYER_COST_MAX = 999_999

/** A `*-chance` bind closes in on this and never reaches it: at 1 the player is never hit. */
export const CHANCE_CAP = 0.99

/** The upgrade a tier past stock is copied from. */
export function templateTier(chain: PlayerChain): PlayerTier {
  return chain.tiers[chain.tiers.length - 1]
}

/** A chain whose tiers can be removed: it has upgrades. */
export function hasUpgrades(chain: PlayerChain): boolean {
  return chain.tiers.length >= 2 && templateTier(chain).block !== undefined
}

/**
 * A chain that can grow past stock: its last upgrade sets a number or a
 * numbered buff, so a copy of it has something to raise. (A meteor's count
 * upgrade adds actions instead; a copy of it would sell nothing.)
 */
export function canAddTiers(chain: PlayerChain): boolean {
  if (!hasUpgrades(chain)) return false
  const last = templateTier(chain)
  return Object.keys(last.binds).length > 0 || Object.values(last.strings ?? {}).some((s) => s.buff !== undefined)
}

/** One number a tier past stock sets. */
export interface AddedFieldSpec {
  /** `cost`, a bind, or a buff argument (`combo-heal-buff`, `nova-buff-2`) */
  name: string
  kind: 'cost' | 'bind' | 'buff'
  type: 'int' | 'float'
  /** the template's line holding it */
  line: number
  /** a buff argument: the string bind naming the buff, and the argument's index */
  bind?: string
  arg?: number
  buff?: PlayerBuffLevel
}

export function addedFieldSpecs(chain: PlayerChain): AddedFieldSpec[] {
  const last = templateTier(chain)
  const out: AddedFieldSpec[] = []
  if (last.cost !== undefined) out.push({ name: 'cost', kind: 'cost', type: 'int', line: last.cost.line })
  for (const [name, b] of Object.entries(last.binds)) out.push({ name, kind: 'bind', type: b.type, line: b.line })
  for (const [bind, s] of Object.entries(last.strings ?? {})) {
    const buff = s.buff
    if (buff === undefined) continue
    buff.args.forEach((a, i) => {
      const whole = Number.isInteger(a) && (buff.prevArgs === undefined || Number.isInteger(buff.prevArgs[i]))
      out.push({
        name: buff.args.length === 1 ? bind : `${bind}-${i + 1}`,
        kind: 'buff',
        type: whole ? 'int' : 'float',
        line: s.line,
        bind,
        arg: i,
        buff
      })
    })
  }
  return out
}

/** The tier (0-based) and stock value a bind has before the template: earlier in the chain, else the root skill's own. */
export function bindBefore(
  file: PlayerSkillFile,
  chain: PlayerChain,
  name: string
): { chainKey: string; tier: number; stock: number } | undefined {
  for (let j = chain.tiers.length - 2; j >= 0; j--) {
    const b = chain.tiers[j].binds[name]
    if (b !== undefined) return { chainKey: chain.key, tier: j, stock: b.stock }
  }
  const root = file.chains.find((c) => c.key === file.stem)
  const r = root !== undefined && root !== chain ? root.tiers[0].binds[name] : undefined
  return r === undefined ? undefined : { chainKey: root!.key, tier: 0, stock: r.stock }
}

export function roundAs(type: 'int' | 'float', v: number): number {
  return type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000
}

/**
 * How a number goes on past stock, from its last two stock tiers `v0` → `v1`:
 * the same step each tier, or for a rising chance, the same share of what is
 * left below {@link CHANCE_CAP}.
 */
type Step = { ratio: number } | { add: number }

function stepOf(spec: AddedFieldSpec, v0: number, v1: number): Step {
  if (spec.kind === 'bind' && spec.name.endsWith('-chance') && v1 >= 0 && v1 < CHANCE_CAP && v1 > v0 && v0 < CHANCE_CAP) {
    return { ratio: (CHANCE_CAP - v1) / (CHANCE_CAP - v0) }
  }
  return { add: v1 - v0 }
}

/**
 * The value one step on from `v`. A chance never passes the cap; a value that
 * would reach or cross 0 stays where it is (a slow down to nothing, a cooldown
 * below zero).
 */
function stepOn(spec: AddedFieldSpec, step: Step, v: number): number {
  if ('ratio' in step) return v >= CHANCE_CAP ? v : roundAs(spec.type, CHANCE_CAP - (CHANCE_CAP - v) * step.ratio)
  const next = roundAs(spec.type, v + step.add)
  return v !== 0 && (next === 0 || Math.sign(next) !== Math.sign(v)) ? v : next
}

/** Where the ladder starts: each number at the chain's last two stock tiers, and any tier's own override. */
export interface LadderBase {
  last(spec: AddedFieldSpec): number
  prev(spec: AddedFieldSpec): number
  override(tier: number, name: string): number | undefined
  /** the Prices knob, applied to the stock price ladder */
  costFactor: number
}

export interface AddedTier {
  /** 1-based */
  tier: number
  /** what the tier sets: its override, else its default */
  values: Record<string, number>
  /** what the tier would set without its own overrides (earlier tiers' still count) */
  defaults: Record<string, number>
}

/**
 * Tiers stock+1 … `levels`. A price follows the stock price ladder (its last
 * step, never down) times the Prices knob; every other number takes the step
 * of its last two stock tiers (as edited) on from the tier below, overrides
 * included, so an edited tier 7 moves 8 and up by as much.
 */
export function extendLadder(chain: PlayerChain, levels: number, base: LadderBase): AddedTier[] {
  const stock = chain.tiers.length
  if (levels <= stock || !canAddTiers(chain)) return []
  const specs = addedFieldSpecs(chain)
  const steps: Record<string, Step> = {}
  const v1: Record<string, number> = {}
  for (const s of specs) {
    v1[s.name] = base.last(s)
    steps[s.name] = stepOf(s, base.prev(s), v1[s.name])
  }
  const lastCost = templateTier(chain).cost?.stock ?? 0
  const costStep = Math.max(0, lastCost - (chain.tiers[stock - 2].cost?.stock ?? lastCost))
  const out: AddedTier[] = []
  for (let t = stock + 1; t <= Math.min(levels, PLAYER_LEVELS_MAX); t++) {
    const values: Record<string, number> = {}
    const defaults: Record<string, number> = {}
    for (const s of specs) {
      const d =
        s.kind === 'cost'
          ? Math.min(PLAYER_COST_MAX, Math.max(0, Math.round((lastCost + costStep * (t - stock)) * base.costFactor)))
          : stepOn(s, steps[s.name], v1[s.name])
      const v = base.override(t, s.name) ?? d
      defaults[s.name] = d
      values[s.name] = v
      v1[s.name] = v
    }
    out.push({ tier: t, values, defaults })
  }
  return out
}

/** The ladder from stock values alone: what an added tier sets when nothing is edited. */
export function stockLadderBase(file: PlayerSkillFile, chain: PlayerChain): LadderBase {
  const last = templateTier(chain)
  return {
    last: (s) =>
      s.kind === 'cost' ? last.cost!.stock : s.kind === 'bind' ? last.binds[s.name].stock : s.buff!.args[s.arg!],
    prev: (s) => {
      if (s.kind === 'cost') return last.cost!.stock
      if (s.kind === 'buff') return s.buff!.prevArgs?.[s.arg!] ?? s.buff!.args[s.arg!]
      return bindBefore(file, chain, s.name)?.stock ?? last.binds[s.name].stock
    },
    override: () => undefined,
    costFactor: 1
  }
}

/** A tier's shop column for a tier past stock: the chain's own column at tier 5, sold by the late shops. */
export function addedCategory(chain: PlayerChain): string | undefined {
  return templateTier(chain).category?.replace(/\d+$/, '5')
}
