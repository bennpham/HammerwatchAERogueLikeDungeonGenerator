import type { SvalNode } from '../src/generator/ae/sval'

/**
 * The first difference between two SVAL trees, as a path, or null. Numbers
 * compare as 32-bit floats; a dict's keys are a map (a pack and the editor
 * list them in different orders), arrays are positional.
 */
export function svalDiff(a: SvalNode, b: SvalNode, at = ''): string | null {
  const here = `${at}/${a.name ?? a.tag}`
  if (a.tag !== b.tag || a.name !== b.name) return `${here}: <${a.tag} ${a.name ?? ''}> vs <${b.tag} ${b.name ?? ''}>`
  if (a.children.length !== b.children.length) return `${here}: ${a.children.length} vs ${b.children.length} children`
  const byName = (n: SvalNode) => (a.tag === 'dict' ? [...n.children].sort((p, q) => ((p.name ?? '') < (q.name ?? '') ? -1 : 1)) : n.children)
  const [ka, kb] = [byName(a), byName(b)]
  for (let i = 0; i < ka.length; i++) {
    const d = svalDiff(ka[i], kb[i], here)
    if (d !== null) return d
  }
  if (a.children.length > 0 || a.tag === 'dict' || a.tag === 'array') return null
  const [x, y] = [a.text.trim(), b.text.trim()]
  if (/^(float|vec[234]|int)$/.test(a.tag)) {
    const nx = x.split(/\s+/).map((v) => Math.fround(Number(v)))
    const ny = y.split(/\s+/).map((v) => Math.fround(Number(v)))
    return nx.length === ny.length && nx.every((v, i) => v === ny[i]) ? null : `${here}: ${x} vs ${y}`
  }
  if (a.tag === 'bool') return x[0] === y[0] ? null : `${here}: ${x} vs ${y}`
  if (a.tag === 'bytes') return x.toLowerCase() === y.toLowerCase() ? null : `${here}: bytes differ`
  return x === y ? null : `${here}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`
}
