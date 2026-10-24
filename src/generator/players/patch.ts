import { fmtNum } from '../ae/sval'
import { PLAYER_FIELDS, chainLevels, extraKey, prunePlayerTweaks, shopKey, skillKey, statKey } from './fields'
import type { PlayerTweaks } from './fields'
import { buffLevelEdits, chainLevelEdits } from './levels'
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
    const levels = chainLevels(chain.key, tweaks)
    chain.tiers.forEach((tier, i) => {
      const t = i + 1
      // a removed tier's dict is dropped whole
      if (t > levels) return
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
  // levels owned from the start: AE's own `starting-level`, which the classes'
  // first skills carry, rewritten where the file has one, else written beside
  // the chain's price (the same dict)
  for (const chain of file.chains) {
    const first = chain.tiers[0]
    const stock = first.startingLevel?.stock ?? 0
    const level = effective(chain.key, 1, 'starting-level', stock)
    if (level !== stock) {
      if (first.startingLevel !== undefined) {
        edits.push({ line: first.startingLevel.line, kind: 'value', name: 'starting-level', value: String(Math.trunc(level)) })
      } else if (first.cost !== undefined) {
        edits.push({ line: first.cost.line, kind: 'text', find: '<int name="cost">', replace: `<int name="starting-level">${Math.trunc(level)}</int> <int name="cost">` })
      }
    }
    // AE's shop lists a modifier skill nobody has bought whatever its starting
    // level (`SkillShopMenuContent.AddModifiersToShop`), and buying one already
    // at its top does nothing; a column no vendor sells keeps it off the shelf
    if (chain.key !== file.stem && level >= chainLevels(chain.key, tweaks) && first.categoryLine !== undefined) {
      edits.push({ line: first.categoryLine, kind: 'value', name: 'category', value: OWNED_CATEGORY })
    }
    // tiers removed, or added past stock
    edits.push(...chainLevelEdits(file, chain, tweaks, classId))
  }
  return edits
}

export const SKILL_SHOP_PATH = 'scripts/GUI/Shop/SkillShopMenuContent.as'

/**
 * AE's skill shop shows the upgrade at `m_levelParams[bought]`, but buying it
 * grants level `starting-level + bought` (`GetSkillLevel`); the two agree only
 * when nothing is owned from the start. A root owning some of its levels
 * therefore lists nothing more (index 0 is the skill dict, which has no
 * category), and a modifier is offered again at its level-1 price, after
 * which the shop shows a tier the player already has. Owning the stock levels
 * and buying the added ones needs both fixed: the shop indexes by the real
 * level, and a modifier owned from the start is listed by its upgrades.
 * [UNVERIFIED] in game; stock lines, the text exactly as AE ships it.
 */
export const SHOP_OWNED_LEVEL_FIXES: ReadonlyArray<{ path: string; line: number; find: string; replace: string }> = [
  ...[102, 106, 107, 108].map((line) => ({
    path: SKILL_SHOP_PATH,
    line,
    find: 'skillDef.m_levelParams[currLevel]',
    replace: 'skillDef.m_levelParams[skillDef.m_startingLevel + currLevel]'
  })),
  {
    path: SKILL_SHOP_PATH,
    line: 118,
    find: 'EligibleCategory(mod.m_shopCategory) && int(record.pickedSkills[mod.m_id]) == 0',
    replace: 'EligibleCategory(mod.m_shopCategory) && mod.m_startingLevel == 0 && int(record.pickedSkills[mod.m_id]) == 0'
  },
  {
    path: SKILL_SHOP_PATH,
    line: 122,
    find: 'else if (int(record.pickedSkills[mod.m_id]) > 0)',
    replace: 'else if (mod.m_startingLevel > 0 || int(record.pickedSkills[mod.m_id]) > 0)'
  }
]

/** Some chain owns part of its levels from the start and sells the rest: the shop needs {@link SHOP_OWNED_LEVEL_FIXES}. */
export function needsShopOwnedLevelFix(tweaks: PlayerTweaks): boolean {
  for (const file of PLAYER_STOCK.skills) {
    for (const chain of file.chains) {
      const first = chain.tiers[0]
      const stock = first.startingLevel?.stock ?? 0
      const level = tweaks[skillKey(chain.key, 1, 'starting-level')] ?? stock
      if (level !== stock && level > 0 && level < chainLevels(chain.key, tweaks)) return true
    }
  }
  return false
}

/** The shop column a maxed modifier skill moves to: no vendor sells it. */
export const OWNED_CATEGORY = 'owned'

const COMBO_STEM = 'shared_combo'

/**
 * AE's two checks for "has combo" read `pickedSkills["shared_misc_combo"]`, how
 * many times the combo skill was *bought*, where everything else reads
 * `GetSkillLevel`, which adds `starting-level`. A combo owned from the start
 * therefore never counts a kill (`Player.KilledActor`) nor takes a combo
 * pickup (`GiveCombo.CanApply`). [VERIFIED] the only two such checks in the
 * scripts; stock lines, the text exactly as AE ships it.
 */
export const COMBO_OWNED_FIXES: ReadonlyArray<{ path: string; line: number; find: string; replace: string }> = [
  {
    path: 'scripts/Behaviors/Actors/Player/Player.as',
    line: 183,
    find: 'int(m_record.pickedSkills["shared_misc_combo"]) > 0',
    replace: 'm_record.GetSkillLevel("shared_misc_combo") > 0'
  },
  {
    path: 'scripts/Behaviors/Effects/GiveCombo.as',
    line: 38,
    find: 'int(player.m_record.pickedSkills["shared_misc_combo"]) == 0',
    replace: 'player.m_record.GetSkillLevel("shared_misc_combo") == 0'
  }
]

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
  // skill numbers outside players/: the combo buffs, the lightning bolt
  for (const e of PLAYER_STOCK.extras) {
    const value = tweaks[extraKey(e.id)]
    if (value === undefined) continue
    const edits = scripts.get(e.path) ?? []
    edits.push({ line: e.line, kind: 'text', find: `${e.prefix}${e.stock}${e.suffix}`, replace: `${e.prefix}${fmt(e.type, value)}${e.suffix}` })
    scripts.set(e.path, edits)
  }
  // the numbered buffs of tiers added past stock
  for (const [path, edits] of buffLevelEdits(tweaks)) scripts.set(path, [...(scripts.get(path) ?? []), ...edits])
  // combo owned from the start: AE counts combo kills only for a combo that
  // was bought, so the scenario's scripts ask for its level instead; levels
  // owned with more for sale: the skill shop lists by the real level
  const fixes = [
    ...((tweaks[skillKey(COMBO_STEM, 1, 'starting-level')] ?? 0) >= 1 ? COMBO_OWNED_FIXES : []),
    ...(needsShopOwnedLevelFix(tweaks) ? SHOP_OWNED_LEVEL_FIXES : [])
  ]
  for (const fix of fixes) {
    const edits = scripts.get(fix.path) ?? []
    edits.push({ line: fix.line, kind: 'text', find: fix.find, replace: fix.replace })
    scripts.set(fix.path, edits)
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
  const stock = text.split('\n')
  const lines = [...stock]
  const missed: LineEdit[] = []
  const inserted = new Map<number, string[]>()
  const dropped = new Set<number>()
  for (const e of edits) {
    const i = e.line - 1
    const line = lines[i]
    if (line === undefined) {
      missed.push(e)
      continue
    }
    if (e.kind === 'clone') {
      // a copy of the stock lines, whatever else edits them
      if (e.from < 1 || e.to < e.from || e.to > stock.length) {
        missed.push(e)
        continue
      }
      const shift = e.from - 1
      const copy = applyLineEdits(
        stock.slice(shift, e.to).join('\n'),
        e.edits.map((c) => ({ ...c, line: c.line - shift }))
      )
      missed.push(...copy.missed.map((c) => ({ ...c, line: c.line + shift })))
      inserted.set(i, [...(inserted.get(i) ?? []), copy.text])
    } else if (e.kind === 'drop') {
      if (e.to < e.line || e.to > stock.length) missed.push(e)
      else for (let j = i; j < e.to; j++) dropped.add(j)
    } else if (e.kind === 'value') {
      const re = new RegExp(`(name="${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">)[^<]*(<)`)
      if (!re.test(line)) missed.push(e)
      else lines[i] = line.replace(re, (_m, open: string, close: string) => `${open}${e.value}${close}`)
    } else if (!line.includes(e.find)) {
      missed.push(e)
    } else {
      lines[i] = line.replace(e.find, () => e.replace)
    }
  }
  if (inserted.size === 0 && dropped.size === 0) return { text: lines.join('\n'), missed }
  const out: string[] = []
  lines.forEach((line, i) => {
    if (!dropped.has(i)) out.push(line)
    out.push(...(inserted.get(i) ?? []))
  })
  return { text: out.join('\n'), missed }
}
