import { parseSval, svalGet, svalInt, svalString } from '../ae/sval'
import type { SvalNode } from '../ae/sval'
import type { PlayerChain, PlayerClass, PlayerSkillFile, PlayerTier, PlayerValue } from './model'

/**
 * Read AE's stock player files into the `PlayerStock` shape. Pure: the caller
 * passes the text. Used by `scripts/scan-ae-players.ts` to write the snapshot,
 * and by the tests that check the snapshot still matches the install.
 */

/** The class stats the Players tab edits. AE has no character levels, so the
 * `level-*` twins are always 0 and are left alone; str/dex/int are unused. */
export const CLASS_STATS = ['base-health', 'base-mana', 'base-health-regen', 'base-mana-regen'] as const

function numberOf(node: SvalNode | undefined): PlayerValue | undefined {
  if (node === undefined || node.line === undefined) return undefined
  if (node.tag !== 'int' && node.tag !== 'float') return undefined
  const stock = Number(node.text.trim())
  if (!Number.isFinite(stock)) return undefined
  return { line: node.line, type: node.tag, stock }
}

function tierOf(dict: SvalNode): PlayerTier {
  const tier: PlayerTier = { binds: {} }
  const lvl = svalInt(svalGet(dict, 'lvl'))
  if (lvl !== undefined) tier.lvl = lvl
  const category = svalString(svalGet(dict, 'category'))
  if (category !== undefined) tier.category = category
  const cost = numberOf(svalGet(dict, 'cost'))
  if (cost !== undefined) tier.cost = cost
  // the root and a modifier skill keep their binds under `skill`; an upgrade
  // carries them directly
  const binds = svalGet(dict, 'binds') ?? svalGet(svalGet(dict, 'skill'), 'binds')
  for (const b of binds?.children ?? []) {
    const v = numberOf(b)
    if (v !== undefined && b.name !== undefined) tier.binds[b.name] = v
  }
  const desc = svalGet(dict, 'description')
  if (desc?.line !== undefined && desc.text.includes('=')) tier.description = { line: desc.line, text: desc.text }
  return tier
}

function chainOf(key: string, dict: SvalNode): PlayerChain {
  return {
    key,
    id: svalString(svalGet(dict, 'id')) ?? key,
    name: svalString(svalGet(dict, 'name')) ?? '',
    tiers: [tierOf(dict), ...(svalGet(dict, 'upgrades')?.children ?? []).filter((c) => c.tag === 'dict').map(tierOf)]
  }
}

export function stemOf(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.sval$/, '')
}

export function parseSkillFile(path: string, text: string): PlayerSkillFile {
  const root = parseSval(text)
  const stem = stemOf(path)
  const chains = [chainOf(stem, root)]
  for (const m of svalGet(root, 'modifier-skills')?.children ?? []) {
    if (m.tag !== 'dict') continue
    const id = svalString(svalGet(m, 'id')) ?? `${chains.length}`
    chains.push(chainOf(`${stem}:${id}`, m))
  }
  // a chain that buys or sets nothing has nothing to edit
  return { path, stem, chains: chains.filter((c) => c.tiers.some((t) => t.cost !== undefined || Object.keys(t.binds).length > 0)) }
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
