import { fmtNum } from '../ae/sval'
import { PLAYER_FIELDS, boughtRoot, prunePlayerTweaks, shopKey, skillKey, statKey } from './fields'
import type { PlayerTweaks } from './fields'
import type { LineEdit, PlayerFileOverride, PlayerSkillFile, PlayerTier } from './model'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Turn the Players tab's overrides into the files the scenario ships. Pure:
 * each override names its stock source and the line edits, and the install
 * (`src/main/packer.ts`) applies them to the install's own copy with
 * `applyLineEdits`.
 */

export const CLASSES_PATH = 'players/classes.sval'

/** Where a class's own copy of a shared skill file goes. */
export function sharedCopyPath(path: string, classId: string): string {
  return path.replace(/\.sval$/, `_${classId}.sval`)
}

function fmt(type: 'int' | 'float', v: number): string {
  return type === 'int' ? String(Math.trunc(v)) : fmtNum(v)
}

/**
 * The edits for one skill file: every value whose effective number (the
 * class's own override, else the all-classes one, else stock) differs from
 * stock, plus the description arguments that echo those values.
 */
function skillFileEdits(file: PlayerSkillFile, tweaks: PlayerTweaks, classId?: string): LineEdit[] {
  const effective = (chainKey: string, tier: number, name: string, stock: number): number =>
    (classId === undefined ? undefined : tweaks[skillKey(chainKey, tier, name, classId)]) ??
    tweaks[skillKey(chainKey, tier, name)] ??
    stock
  const edits: LineEdit[] = []
  const root = file.chains.find((c) => c.key === file.stem)
  for (const chain of file.chains) {
    chain.tiers.forEach((tier, i) => {
      const t = i + 1
      if (tier.cost !== undefined) {
        const v = effective(chain.key, t, 'cost', tier.cost.stock)
        if (v !== tier.cost.stock) edits.push({ line: tier.cost.line, kind: 'value', name: 'cost', value: fmt('int', v) })
      }
      for (const [name, b] of Object.entries(tier.binds)) {
        const v = effective(chain.key, t, name, b.stock)
        if (v !== b.stock) edits.push({ line: b.line, kind: 'value', name, value: fmt(b.type, v) })
      }
      for (const [name, p] of Object.entries(tier.params ?? {})) {
        const v = effective(chain.key, t, name, p.stock)
        if (v === p.stock) continue
        edits.push(
          p.vec === undefined
            ? { line: p.line, kind: 'value', name, value: fmt(p.type, v) }
            : { line: p.line, kind: 'value', name: p.vec.element, value: `${p.vec.start} ${fmt(p.type, v)}` }
        )
      }
      if (tier.description === undefined) return
      // the value a bind had before this tier: an earlier tier of the chain,
      // else (for a modifier skill) the root skill's own
      const before = (name: string): { stock: number; value: number; type: 'int' | 'float' } | undefined => {
        for (let j = i - 1; j >= 0; j--) {
          const b = chain.tiers[j].binds[name]
          if (b !== undefined) return { stock: b.stock, value: effective(chain.key, j + 1, name, b.stock), type: b.type }
        }
        const r = root !== undefined && root !== chain ? root.tiers[0].binds[name] : undefined
        return r === undefined ? undefined : { stock: r.stock, value: effective(root!.key, 1, name, r.stock), type: r.type }
      }
      edits.push(...descriptionEdits(tier, (name) => {
        const b = tier.binds[name]
        return { stock: b.stock, value: effective(chain.key, t, name, b.stock), type: b.type }
      }, before))
    })
  }
  // a bought skill owned from the start: AE's own `starting-level`, which the
  // classes' first skills carry, written beside the root's price (the same dict)
  const bought = boughtRoot(file)
  if (bought !== undefined && effective(file.stem, 1, 'starting-level', 0) >= 1) {
    edits.push({ line: bought.tiers[0].cost!.line, kind: 'text', find: '<int name="cost">', replace: '<int name="starting-level">1</int> <int name="cost">' })
  }
  return edits
}

type Valued = { stock: number; value: number; type: 'int' | 'float' }

/**
 * A shop description carries the numbers it shows as arguments
 * (`.wardmg-udesc?curr-dagger-dmg=9&dagger-dmg=14`), named the HW1 way rather
 * than after the bind. An argument is matched to the tier's bind of the same
 * name, else to the tier's only bind with the same stock number; `curr-x` is
 * that bind's value before the tier. It is rewritten only when its stock text
 * is exactly the stock number — anything in other units (ms for seconds, %)
 * is left as the game wrote it.
 */
function descriptionEdits(
  tier: PlayerTier,
  at: (bind: string) => Valued,
  before: (bind: string) => Valued | undefined
): LineEdit[] {
  const desc = tier.description!
  const args = [...desc.text.matchAll(/([?&])([\w.-]+)=([^&\s]*)/g)].map((m) => ({
    delim: m[1],
    key: m[2],
    raw: m[3],
    n: Number(m[3])
  }))
  const bindFor = (base: string): string | undefined => {
    if (base in tier.binds) return base
    const own = args.find((a) => a.key === base)
    if (own === undefined || Number.isNaN(own.n)) return undefined
    const same = Object.keys(tier.binds).filter((b) => tier.binds[b].stock === own.n)
    return same.length === 1 ? same[0] : undefined
  }
  const edits: LineEdit[] = []
  for (const a of args) {
    if (a.raw === '' || Number.isNaN(a.n)) continue
    const curr = a.key.startsWith('curr-')
    const bind = bindFor(curr ? a.key.slice(5) : a.key)
    if (bind === undefined) continue
    const v = curr ? before(bind) : at(bind)
    if (v === undefined || v.stock !== a.n || v.value === v.stock) continue
    edits.push({
      line: desc.line,
      kind: 'text',
      find: `${a.delim}${a.key}=${a.raw}`,
      replace: `${a.delim}${a.key}=${fmt(v.type, v.value)}`
    })
  }
  return edits
}

export function playerOverrides(raw: PlayerTweaks): PlayerFileOverride[] {
  const tweaks = prunePlayerTweaks(raw)
  if (Object.keys(tweaks).length === 0) return []
  const out: PlayerFileOverride[] = []

  // which shared files a class forks: any class-scoped override of it
  const forks = new Map<string, Set<string>>()
  for (const f of PLAYER_FIELDS) {
    if (f.kind === 'stat' || f.classId === undefined || tweaks[f.key] === undefined) continue
    const set = forks.get(f.path) ?? new Set<string>()
    set.add(f.classId)
    forks.set(f.path, set)
  }

  for (const file of PLAYER_STOCK.skills) {
    const edits = skillFileEdits(file, tweaks)
    if (edits.length > 0) out.push({ path: file.path, source: file.path, edits })
    for (const classId of [...(forks.get(file.path) ?? [])].sort()) {
      out.push({ path: sharedCopyPath(file.path, classId), source: file.path, edits: skillFileEdits(file, tweaks, classId) })
    }
  }

  const classEdits: LineEdit[] = []
  for (const c of PLAYER_STOCK.classes) {
    for (const [stat, v] of Object.entries(c.stats)) {
      const value = tweaks[statKey(c.id, stat)]
      if (value !== undefined) classEdits.push({ line: v.line, kind: 'value', name: stat, value: fmt(v.type, value) })
    }
    for (const s of c.skills) {
      if (forks.get(s.path)?.has(c.id) === true) {
        classEdits.push({ line: s.line, kind: 'text', find: s.path, replace: sharedCopyPath(s.path, c.id) })
      }
    }
  }
  if (classEdits.length > 0) out.push({ path: CLASSES_PATH, source: CLASSES_PATH, edits: classEdits })

  // potion and item prices, in the shop scripts
  const scripts = new Map<string, LineEdit[]>()
  for (const p of PLAYER_STOCK.shop) {
    const value = tweaks[shopKey(p.id)]
    if (value === undefined) continue
    const edits = scripts.get(p.path) ?? []
    edits.push({ line: p.line, kind: 'text', find: p.find, replace: p.find.replace(String(p.stock), String(Math.trunc(value))) })
    scripts.set(p.path, edits)
  }
  for (const [path, edits] of scripts) out.push({ path, source: path, edits })

  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Apply line edits to a stock file. Line endings are kept as they were; an
 * edit whose target is not found on its line is returned in `missed` (the
 * install's file differs from the snapshot) and changes nothing.
 */
export function applyLineEdits(text: string, edits: readonly LineEdit[]): { text: string; missed: LineEdit[] } {
  const lines = text.split('\n')
  const missed: LineEdit[] = []
  for (const e of edits) {
    const i = e.line - 1
    const line = lines[i]
    if (line === undefined) {
      missed.push(e)
      continue
    }
    if (e.kind === 'value') {
      const re = new RegExp(`(name="${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">)[^<]*(<)`)
      if (!re.test(line)) missed.push(e)
      else lines[i] = line.replace(re, (_m, open: string, close: string) => `${open}${e.value}${close}`)
    } else if (!line.includes(e.find)) {
      missed.push(e)
    } else {
      lines[i] = line.replace(e.find, () => e.replace)
    }
  }
  return { text: lines.join('\n'), missed }
}
