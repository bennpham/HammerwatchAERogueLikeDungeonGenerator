import { fmtNum } from '../ae/sval'
import { deriveGroupFactor } from './bulk'
import { CHAIN_BY_KEY, PLAYER_FIELD_MAP, chainLevels, extraKey, levelsKey, skillKey } from './fields'
import type { PlayerTweaks } from './fields'
import {
  addedCategory,
  addedFieldSpecs,
  bindBefore,
  canAddTiers,
  extendLadder,
  hasUpgrades,
  templateTier
} from './ladder'
import type { AddedFieldSpec, AddedTier, LadderBase } from './ladder'
import type { LineEdit, PlayerBuffLevel, PlayerChain, PlayerSkillFile } from './model'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Turning `player.<chain>.levels` into edits: a removed tier's upgrade dict
 * is dropped, a tier past stock is a `clone` of the chain's last upgrade with
 * every number re-valued (`ladder.ts`), and a tier whose upgrade names a
 * numbered buff gets the next buff, a copy of the buff's `%block` line. Pure.
 */

function fmt(type: 'int' | 'float', v: number): string {
  return type === 'int' ? String(Math.trunc(v)) : fmtNum(v)
}

/** The extras entry (`combo_heal_5`) a buff level is edited through, if any. */
function extraOfBuff(buff: PlayerBuffLevel, level: number): { id: string; stock: number } | undefined {
  return PLAYER_STOCK.extras.find((e) => e.path === buff.path && e.prefix.endsWith(` ${buff.name}${level} `))
}

/**
 * The ladder from the effective values: overrides (the class's own, for a
 * class's copy of a shared file) on the last two stock tiers, the combo regen
 * extras for a combo buff, and the Prices knob.
 */
function effectiveBase(file: PlayerSkillFile, chain: PlayerChain, tweaks: PlayerTweaks, classId?: string): LadderBase {
  const at = (chainKey: string, tier: number, name: string, stock: number): number =>
    (classId === undefined ? undefined : tweaks[skillKey(chainKey, tier, name, classId)]) ??
    tweaks[skillKey(chainKey, tier, name)] ??
    stock
  const stock = chain.tiers.length
  const last = templateTier(chain)
  const buffArg = (s: AddedFieldSpec, level: number, fallback: number): number => {
    const extra = s.buff!.args.length === 1 ? extraOfBuff(s.buff!, level) : undefined
    return extra === undefined ? fallback : (tweaks[extraKey(extra.id)] ?? fallback)
  }
  return {
    last: (s) => {
      if (s.kind === 'cost') return at(chain.key, stock, 'cost', last.cost!.stock)
      if (s.kind === 'bind') return at(chain.key, stock, s.name, last.binds[s.name].stock)
      return buffArg(s, s.buff!.level, s.buff!.args[s.arg!])
    },
    prev: (s) => {
      if (s.kind === 'buff') return buffArg(s, s.buff!.level - 1, s.buff!.prevArgs?.[s.arg!] ?? s.buff!.args[s.arg!])
      if (s.kind === 'cost') return at(chain.key, stock, 'cost', last.cost!.stock)
      const b = bindBefore(file, chain, s.name)
      return b === undefined ? at(chain.key, stock, s.name, last.binds[s.name].stock) : at(b.chainKey, b.tier + 1, s.name, b.stock)
    },
    override: (t, name) => tweaks[skillKey(chain.key, t, name)],
    costFactor: deriveGroupFactor('cost', tweaks) ?? 1
  }
}

/** The tiers a chain has past stock with these overrides (lowercased keys); none when it has stock or fewer. */
export function addedTiers(chainKey: string, tweaks: PlayerTweaks, classId?: string): AddedTier[] {
  const found = CHAIN_BY_KEY.get(chainKey)
  if (found === undefined || !canAddTiers(found.chain)) return []
  return extendLadder(found.chain, chainLevels(chainKey, tweaks), effectiveBase(found.file, found.chain, tweaks, classId))
}

/**
 * The template's description with its arguments re-valued for an added tier.
 * An argument is the number of the field of the same name, else of the one
 * field whose template value it is, written as is, as a percentage (a chance)
 * or in seconds (a duration in ms); `curr-x` is that field one tier down. An
 * argument that matches nothing keeps the template's text.
 */
function describe(
  text: string,
  specs: AddedFieldSpec[],
  stockOf: (s: AddedFieldSpec) => number,
  now: Record<string, number>,
  before: Record<string, number>
): string {
  const args = [...text.matchAll(/[?&]([\w.-]+)=([^&\s]*)/g)].map((m) => ({ key: m[1], n: Number(m[2]) }))
  const numbers = specs.filter((s) => s.kind !== 'cost')
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
  const match = (base: string): { spec: AddedFieldSpec; k: number } | undefined => {
    const own = args.find((a) => a.key === base)
    if (own === undefined || Number.isNaN(own.n)) return undefined
    for (const k of [1, 100, 0.001]) {
      const named = numbers.find((s) => s.name === base && near(own.n, stockOf(s) * k))
      if (named !== undefined) return { spec: named, k }
    }
    for (const k of [1, 100, 0.001]) {
      const same = numbers.filter((s) => near(own.n, stockOf(s) * k))
      if (same.length === 1) return { spec: same[0], k }
    }
    return undefined
  }
  return text.replace(/([?&])([\w.-]+)=([^&\s]*)/g, (whole, delim: string, key: string) => {
    const curr = key.startsWith('curr-')
    const m = match(curr ? key.slice(5) : key)
    if (m === undefined) return whole
    const v = (curr ? before : now)[m.spec.name] * m.k
    return `${delim}${key}=${fmtNum(Math.round(v * 1000) / 1000)}`
  })
}

/** The buff an added tier applies: the template's buff, numbered on from it. */
function buffName(buff: PlayerBuffLevel, stockLevels: number, tier: number): string {
  return `${buff.name}${buff.level + tier - stockLevels}`
}

/**
 * The edits a chain's tier count makes to its skill file (or a class's copy
 * of it): a `drop` per removed upgrade, a `clone` per added tier.
 */
export function chainLevelEdits(file: PlayerSkillFile, chain: PlayerChain, tweaks: PlayerTweaks, classId?: string): LineEdit[] {
  if (!hasUpgrades(chain)) return []
  const stock = chain.tiers.length
  const levels = chainLevels(chain.key, tweaks)
  if (levels < stock) {
    return chain.tiers.slice(levels).map((t) => ({ line: t.block!.start, kind: 'drop', to: t.block!.end }))
  }
  const added = addedTiers(chain.key, tweaks, classId)
  if (added.length === 0) return []
  const last = templateTier(chain)
  const specs = addedFieldSpecs(chain)
  const base = effectiveBase(file, chain, tweaks, classId)
  const stockOf = (s: AddedFieldSpec): number =>
    s.kind === 'cost' ? last.cost!.stock : s.kind === 'bind' ? last.binds[s.name].stock : s.buff!.args[s.arg!]
  const category = addedCategory(chain)
  // the template's own params as edited (a class's walking speed while it
  // casts …): an added tier carries them on
  const params: LineEdit[] = []
  for (const [name, p] of Object.entries(last.params ?? {})) {
    const v =
      (classId === undefined ? undefined : tweaks[skillKey(chain.key, stock, name, classId)]) ??
      tweaks[skillKey(chain.key, stock, name)] ??
      p.stock
    if (v === p.stock) continue
    params.push(
      p.vec === undefined
        ? { line: p.line, kind: 'value', name, value: fmt(p.type, v) }
        : { line: p.line, kind: 'value', name: p.vec.element, value: `${p.vec.start} ${fmt(p.type, v)}` }
    )
  }
  let before: Record<string, number> = Object.fromEntries(specs.map((s) => [s.name, base.last(s)]))
  const out: LineEdit[] = []
  for (const a of added) {
    const edits: LineEdit[] = [...params]
    if (last.name !== undefined && /\?lvl=\d+/.test(last.name.text)) {
      edits.push({ line: last.name.line, kind: 'value', name: 'name', value: last.name.text.replace(/\?lvl=\d+/, `?lvl=${a.tier}`) })
    }
    if (last.lvlLine !== undefined) edits.push({ line: last.lvlLine, kind: 'value', name: 'lvl', value: String(a.tier) })
    if (category !== undefined && last.categoryLine !== undefined) {
      edits.push({ line: last.categoryLine, kind: 'value', name: 'category', value: category })
    }
    for (const s of specs) {
      if (s.kind === 'cost') edits.push({ line: s.line, kind: 'value', name: 'cost', value: fmt('int', a.values.cost) })
      else if (s.kind === 'bind') edits.push({ line: s.line, kind: 'value', name: s.name, value: fmt(s.type, a.values[s.name]) })
    }
    for (const [name, str] of Object.entries(last.strings ?? {})) {
      if (str.buff !== undefined) {
        edits.push({ line: str.line, kind: 'value', name, value: `${str.buff.path}:${buffName(str.buff, stock, a.tier)}` })
        continue
      }
      // an effect sized to match: the fireball's hit, the growth and smoke areas
      const radius = Object.keys(last.binds).filter((b) => b.endsWith('radius'))
      if (radius.length === 1 && /radius=\d+/.test(str.stock)) {
        const r = Math.round(a.values[radius[0]])
        edits.push({ line: str.line, kind: 'value', name, value: str.stock.replace(/radius=\d+/, `radius=${r}`) })
      }
      // anything else (the level-5 combo nova, a charge's speed) is the template's
    }
    if (last.description !== undefined) {
      const text = describe(last.description.text, specs, stockOf, a.values, before)
      if (text !== last.description.text) edits.push({ line: last.description.line, kind: 'value', name: 'description', value: text })
    }
    out.push({ line: last.block!.end, kind: 'clone', from: last.block!.start, to: last.block!.end, edits })
    before = a.values
  }
  return out
}

/**
 * The `%block` lines the added tiers' buffs need, by buff file: each a copy
 * of the template's buff line under the next number, with its own arguments.
 * Shared by every class, so from the all-classes values.
 */
export function buffLevelEdits(tweaks: PlayerTweaks): Map<string, LineEdit[]> {
  const out = new Map<string, LineEdit[]>()
  for (const file of PLAYER_STOCK.skills) {
    for (const chain of file.chains) {
      const buffs = Object.values(templateTier(chain).strings ?? {}).filter((s) => s.buff !== undefined)
      if (buffs.length === 0) continue
      const added = addedTiers(chain.key, tweaks)
      if (added.length === 0) continue
      const specs = addedFieldSpecs(chain)
      for (const { buff } of buffs) {
        const b = buff!
        const args = specs.filter((s) => s.buff === b).sort((x, y) => x.arg! - y.arg!)
        const edits = out.get(b.path) ?? []
        for (const a of added) {
          const replace = `${buffName(b, chain.tiers.length, a.tier)} ${args.map((s) => fmt(s.type, a.values[s.name])).join(' ')}`
          edits.push({ line: b.line, kind: 'clone', from: b.line, to: b.line, edits: [{ line: b.line, kind: 'text', find: b.find, replace }] })
        }
        out.set(b.path, edits)
      }
    }
  }
  return out
}

/**
 * Gold to buy every skill and upgrade once, across every class, tiers added
 * past stock included and removed ones not (potions and items are bought
 * again and again).
 */
export function totalShopCost(tweaks: PlayerTweaks): number {
  let sum = 0
  for (const f of PLAYER_FIELD_MAP.values()) {
    if (f.kind !== 'cost' || f.classId !== undefined || f.shopId !== undefined) continue
    if (f.chainKey !== undefined && f.tier! > chainLevels(f.chainKey, tweaks)) continue
    sum += tweaks[f.key] ?? f.stock
  }
  for (const { chain } of CHAIN_BY_KEY.values()) {
    for (const a of addedTiers(chain.key, tweaks)) sum += a.values.cost ?? 0
  }
  return sum
}

/**
 * Every chain with upgrades at `n` tiers (as far as each can go), or back at
 * stock; the numbers of tiers past the new count are dropped.
 */
export function applyChainLevels(tweaks: PlayerTweaks, n: number | 'stock'): PlayerTweaks {
  const out = { ...tweaks }
  for (const f of PLAYER_FIELD_MAP.values()) {
    if (f.kind !== 'levels') continue
    const v = n === 'stock' ? f.stock : Math.min(f.maxLevel ?? f.stock, Math.max(1, Math.trunc(n)))
    if (v === f.stock) delete out[f.key]
    else out[f.key] = v
  }
  return dropTiersPast(out)
}

/** A chain at `n` tiers; the numbers of tiers past `n` are dropped, so adding one back starts fresh. */
export function setChainLevels(tweaks: PlayerTweaks, chainKey: string, n: number): PlayerTweaks {
  const f = PLAYER_FIELD_MAP.get(levelsKey(chainKey))
  if (f === undefined) return tweaks
  const out = { ...tweaks }
  const v = Math.min(f.maxLevel ?? f.stock, Math.max(1, Math.trunc(n)))
  if (v === f.stock) delete out[f.key]
  else out[f.key] = v
  return dropTiersPast(out, chainKey)
}

/** Overrides of tiers a chain no longer has (stock tiers it dropped, added tiers past its count). */
function dropTiersPast(tweaks: PlayerTweaks, onlyChain?: string): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [key, value] of Object.entries(tweaks)) {
    const m = /^player\.(?:[^.@]+@)?([^.@]+)\.(\d+)\.[^.]+$/.exec(key)
    const keep =
      m === null ||
      (onlyChain !== undefined && m[1] !== onlyChain) ||
      !CHAIN_BY_KEY.has(m[1]) ||
      Number(m[2]) <= chainLevels(m[1], tweaks)
    if (keep) out[key] = value
  }
  return out
}
