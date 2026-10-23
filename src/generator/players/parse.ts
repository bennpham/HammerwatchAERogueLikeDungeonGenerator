import { parseSval, svalGet, svalInt, svalString } from '../ae/sval'
import type { SvalNode } from '../ae/sval'
import type {
  PlayerBuffLevel,
  PlayerChain,
  PlayerClass,
  PlayerExtraValue,
  PlayerShopPrice,
  PlayerSkillFile,
  PlayerStringBind,
  PlayerTier,
  PlayerValue
} from './model'

/**
 * Read AE's stock player files into the `PlayerStock` shape. Pure: the caller
 * passes the text. Used by `scripts/scan-ae-players.ts` to write the snapshot,
 * and by the tests that check the snapshot still matches the install.
 */

/** The class stats the Players tab edits. AE has no character levels, so the
 * `level-*` twins are always 0 and are left alone; str/dex/int are unused. */
export const CLASS_STATS = ['base-health', 'base-mana', 'base-health-regen', 'base-mana-regen'] as const

/**
 * The skill-level numbers the Players tab edits, besides the binds. A skill
 * reads them itself (`PlayerSkill.as`, `RangerShoot.as`, `Whirlnova.as`):
 * - `move-speed-mul`: walking speed while the skill casts, inside the
 *   `move-speed` window (read as `move-speed-until`, the window's end in cast
 *   ms);
 * - `speed-mul`: the same for a channelled skill (flurry, flame spray);
 * - `cooldown`, `cast-speed-mul`, `castpoint`: how often it fires and how fast
 *   its animation plays;
 * - `overheating-max`, `overheating-recovery`: the ranger bow's heat, which
 *   adds cooldown and spread as it builds; a max of 0 turns it off.
 */
export const SKILL_PARAMS = [
  'move-speed-mul',
  'speed-mul',
  'cooldown',
  'cast-speed-mul',
  'castpoint',
  'overheating-max',
  'overheating-recovery'
] as const

/** `move-speed`'s end, the one number of the window worth editing. */
export const MOVE_WINDOW_PARAM = 'move-speed-until'

function numberOf(node: SvalNode | undefined): PlayerValue | undefined {
  if (node === undefined || node.line === undefined) return undefined
  if (node.tag !== 'int' && node.tag !== 'float') return undefined
  const stock = Number(node.text.trim())
  if (!Number.isFinite(stock)) return undefined
  return { line: node.line, type: node.tag, stock }
}

/** `<ivec2 name="move-speed">0 260</ivec2>` as its end, 260. */
function windowEndOf(node: SvalNode | undefined): PlayerValue | undefined {
  if (node === undefined || node.line === undefined || node.tag !== 'ivec2' || node.name === undefined) return undefined
  const parts = node.text.trim().split(/\s+/).map(Number)
  if (parts.length !== 2 || !parts.every(Number.isInteger)) return undefined
  return { line: node.line, type: 'int', stock: parts[1], vec: { element: node.name, start: parts[0] } }
}

function paramsOf(dict: SvalNode): Record<string, PlayerValue> {
  const out: Record<string, PlayerValue> = {}
  // a root or modifier skill keeps them under `skill`; an upgrade carries them
  // directly
  for (const host of [svalGet(dict, 'skill'), dict]) {
    if (host === undefined) continue
    for (const name of SKILL_PARAMS) {
      const v = numberOf(svalGet(host, name))
      if (v !== undefined && out[name] === undefined) out[name] = v
    }
    const end = windowEndOf(svalGet(host, 'move-speed'))
    if (end !== undefined && out[MOVE_WINDOW_PARAM] === undefined) out[MOVE_WINDOW_PARAM] = end
  }
  return out
}

/** Reads a buff file by its asset path, for the numbered buffs upgrades name. */
export type BuffFileReader = (path: string) => string | undefined

/** `tweak/buffs/buffs.sval:combo_health_regen_level_5` and its `%block` line. */
function buffLevelOf(value: string, readBuffs: BuffFileReader | undefined): PlayerBuffLevel | undefined {
  const m = /^(tweak\/buffs\/[\w/]+\.sval):(\w*?)(\d+)$/.exec(value)
  const text = m === null ? undefined : readBuffs?.(m[1])
  if (m === null || text === undefined) return undefined
  const [, path, name] = m
  const level = Number(m[3])
  const lines = text.split('\n')
  const find = (k: number): { line: number; args: number[]; find: string } | undefined => {
    const re = new RegExp(`^%block \\w+ (${name}${k}((?: [\\d.-]+)+))\\s*$`)
    for (let i = 0; i < lines.length; i++) {
      const b = re.exec(lines[i])
      if (b !== null) return { line: i + 1, args: b[2].trim().split(' ').map(Number), find: b[1] }
    }
    return undefined
  }
  const own = find(level)
  if (own === undefined || own.args.some((a) => !Number.isFinite(a))) return undefined
  const prev = find(level - 1)
  return {
    path,
    line: own.line,
    name,
    level,
    args: own.args,
    ...(prev === undefined || prev.args.length !== own.args.length ? {} : { prevArgs: prev.args }),
    find: own.find
  }
}

function tierOf(dict: SvalNode, upgrade = false, readBuffs?: BuffFileReader): PlayerTier {
  const tier: PlayerTier = { binds: {} }
  const lvl = svalInt(svalGet(dict, 'lvl'))
  if (lvl !== undefined) tier.lvl = lvl
  const categoryNode = svalGet(dict, 'category')
  const category = svalString(categoryNode)
  if (category !== undefined) tier.category = category
  if (category !== undefined && categoryNode?.line !== undefined) tier.categoryLine = categoryNode.line
  const startingLevel = numberOf(svalGet(dict, 'starting-level'))
  if (startingLevel !== undefined) tier.startingLevel = startingLevel
  const cost = numberOf(svalGet(dict, 'cost'))
  if (cost !== undefined) tier.cost = cost
  // the root and a modifier skill keep their binds under `skill`; an upgrade
  // carries them directly
  const binds = svalGet(dict, 'binds') ?? svalGet(svalGet(dict, 'skill'), 'binds')
  for (const b of binds?.children ?? []) {
    const v = numberOf(b)
    if (v !== undefined && b.name !== undefined) tier.binds[b.name] = v
  }
  const params = paramsOf(dict)
  if (Object.keys(params).length > 0) tier.params = params
  const desc = svalGet(dict, 'description')
  if (desc?.line !== undefined && desc.text.includes('=')) tier.description = { line: desc.line, text: desc.text }
  // what copying this upgrade as a new tier rewrites
  if (upgrade && dict.line !== undefined && dict.endLine !== undefined) {
    tier.block = { start: dict.line, end: dict.endLine }
    const name = svalGet(dict, 'name')
    if (name?.line !== undefined) tier.nameLine = name.line
    const lvl = svalGet(dict, 'lvl')
    if (lvl?.line !== undefined) tier.lvlLine = lvl.line
    const strings: Record<string, PlayerStringBind> = {}
    for (const b of binds?.children ?? []) {
      if (b.tag !== 'string' || b.name === undefined || b.line === undefined) continue
      const stock = b.text.trim()
      const buff = buffLevelOf(stock, readBuffs)
      strings[b.name] = { line: b.line, stock, ...(buff === undefined ? {} : { buff }) }
    }
    if (Object.keys(strings).length > 0) tier.strings = strings
  }
  return tier
}

function chainOf(key: string, dict: SvalNode, readBuffs?: BuffFileReader): PlayerChain {
  return {
    key,
    id: svalString(svalGet(dict, 'id')) ?? key,
    name: svalString(svalGet(dict, 'name')) ?? '',
    tiers: [
      tierOf(dict),
      ...(svalGet(dict, 'upgrades')?.children ?? [])
        .filter((c) => c.tag === 'dict')
        .map((d) => tierOf(d, true, readBuffs))
    ]
  }
}

export function stemOf(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.sval$/, '')
}

/** `readBuffs` resolves the numbered buffs upgrades name (`PlayerBuffLevel`); without it they stay plain strings. */
export function parseSkillFile(path: string, text: string, readBuffs?: BuffFileReader): PlayerSkillFile {
  const root = parseSval(text)
  const stem = stemOf(path)
  const chains = [chainOf(stem, root, readBuffs)]
  for (const m of svalGet(root, 'modifier-skills')?.children ?? []) {
    if (m.tag !== 'dict') continue
    const id = svalString(svalGet(m, 'id')) ?? `${chains.length}`
    chains.push(chainOf(`${stem}:${id}`, m, readBuffs))
  }
  // a chain that buys or sets nothing has nothing to edit
  return {
    path,
    stem,
    chains: chains.filter((c) =>
      c.tiers.some((t) => t.cost !== undefined || Object.keys(t.binds).length > 0 || t.params !== undefined)
    )
  }
}

export const POWER_SHOP_PATH = 'scripts/GUI/Shop/PowerShopMenuContent.as'
export const SHOP_CONSTANTS_PATH = 'scripts/Data/Misc.as'

/**
 * The potion and item prices: the power shop's literal offers (the extra life,
 * whose price is a formula, is left alone — a scenario never sells it) and
 * Misc.as's per-quality item base costs.
 */
export function parseShopPrices(powerShop: string, constants: string): PlayerShopPrice[] {
  const out: PlayerShopPrice[] = []
  powerShop.split('\n').forEach((line, i) => {
    const m = /AddItemToShop\("(\w+)",.*(, (\d+)\);)/.exec(line)
    if (m !== null) out.push({ id: m[1], path: POWER_SHOP_PATH, line: i + 1, find: m[2], stock: Number(m[3]) })
  })
  constants.split('\n').forEach((line, i) => {
    const m = /const int Equipment(\w+)BaseCost = ((\d+);)/.exec(line)
    if (m !== null) {
      out.push({ id: `equipment_${m[1].toLowerCase()}`, path: SHOP_CONSTANTS_PATH, line: i + 1, find: `= ${m[2]}`, stock: Number(m[3]) })
    }
  })
  return out
}

export const COMBO_BUFFS_PATH = 'tweak/buffs/buffs.sval'
export const LIGHTNING_BOLT_PATH = 'players/warlock/projectiles/lightning_bolt.unit'

/**
 * The skill numbers outside `players/` the Players tab edits:
 * - the combo's per-tier regen buffs, `%block Combo_mana_regen
 *   combo_mana_regen_level_N V` (and `Combo_health_regen`): + V mana (health)
 *   per second while combo is on, as `combo_mana_N` / `combo_heal_N`;
 * - the warlock lightning bolt's reach from where the orb lands (`range`, px)
 *   and the falloff on a repeat hit of the same enemy (`consecutive-mul`), as
 *   `lightning_range` / `lightning_repeat_mul`.
 */
export function parseExtras(buffs: string, bolt: string): PlayerExtraValue[] {
  const out: PlayerExtraValue[] = []
  buffs.split('\n').forEach((line, i) => {
    const m = /^(%block Combo_(mana|health)_regen combo_\2_regen_level_(\d) )(\d+)(\s*)$/.exec(line)
    if (m === null) return
    const id = `combo_${m[2] === 'mana' ? 'mana' : 'heal'}_${m[3]}`
    out.push({ id, path: COMBO_BUFFS_PATH, line: i + 1, prefix: m[1], suffix: '', type: 'int', stock: Number(m[4]) })
  })
  const boltIds: Record<string, string> = { range: 'lightning_range', 'consecutive-mul': 'lightning_repeat_mul' }
  bolt.split('\n').forEach((line, i) => {
    const m = /(<(int|float) name="(range|consecutive-mul)">)([\d.]+)(<\/\2>)/.exec(line)
    if (m === null) return
    out.push({
      id: boltIds[m[3]],
      path: LIGHTNING_BOLT_PATH,
      line: i + 1,
      prefix: m[1],
      suffix: m[5],
      type: m[2] as 'int' | 'float',
      stock: Number(m[4])
    })
  })
  return out
}

export function parseClasses(text: string): PlayerClass[] {
  // the file is `<loader>…</loader><array>…</array>`: two top-level elements
  const doc = parseSval(`<doc>${text}</doc>`)
  const list = doc.children.find((c) => c.tag === 'array')
  const out: PlayerClass[] = []
  for (const d of list?.children ?? []) {
    if (d.tag !== 'dict') continue
    const id = svalString(svalGet(d, 'id'))
    if (id === undefined) continue
    const skills = (svalGet(d, 'skills')?.children ?? [])
      .filter((s) => s.tag === 'string' && s.line !== undefined)
      .map((s) => ({ path: s.text.trim(), line: s.line! }))
    const stats: Record<string, PlayerValue> = {}
    for (const name of CLASS_STATS) {
      const v = numberOf(svalGet(d, name))
      if (v !== undefined) stats[name] = v
    }
    out.push({ id, skills, stats })
  }
  return out
}
