/**
 * The `.h1c` reader (scripts/lib/h1c.ts) against the stock packs: every stock
 * campaign that also ships its levels unpacked (the editor's own text saves)
 * must decode to the same tree, value for value (arrays in order).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSval } from '../src/generator/ae/sval'
import type { SvalNode } from '../src/generator/ae/sval'
import { binarySvalToText, levelText, lz4Block } from '../scripts/lib/h1c'
import { AE_ROOT, HAS_AE, readStockLevel, readStockPack } from './aeInstall'

/** the stock packs whose levels are also unpacked beside them */
const TWINNED = ['castle_hammerwatch', 'shaftlocke_tower', 'sun_temple']

/** The first difference between two trees, as a path, or null. Numbers compare as 32-bit floats. */
function diff(a: SvalNode, b: SvalNode, at = ''): string | null {
  const here = `${at}/${a.name ?? a.tag}`
  if (a.tag !== b.tag || a.name !== b.name) return `${here}: <${a.tag} ${a.name ?? ''}> vs <${b.tag} ${b.name ?? ''}>`
  if (a.children.length !== b.children.length) return `${here}: ${a.children.length} vs ${b.children.length} children`
  // a dict's keys are a map (the pack and the editor list unit groups in different orders); arrays are positional
  const byName = (n: SvalNode) => (a.tag === 'dict' ? [...n.children].sort((p, q) => ((p.name ?? '') < (q.name ?? '') ? -1 : 1)) : n.children)
  const [ka, kb] = [byName(a), byName(b)]
  for (let i = 0; i < ka.length; i++) {
    const d = diff(ka[i], kb[i], here)
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

describe('h1c: LZ4 blocks and binary SVAL', () => {
  it('decodes a literal run and an overlapping match', () => {
    // "ab" then a match of 6 at offset 2: "abababab"
    expect(new TextDecoder().decode(lz4Block(Uint8Array.from([0x22, 0x61, 0x62, 0x02, 0x00]), 8))).toBe('abababab')
  })

  it('reads the compact forms: true/false, int 0, empty string and array, vectors with zeros left out', () => {
    const name = (s: string) => [...new TextEncoder().encode(s), 0]
    const f32 = (v: number) => [...new Uint8Array(Float32Array.of(v).buffer)]
    const bin = Uint8Array.from([
      0x02, 8, 0, 0, 0,
      ...name('t'), 0x67,
      ...name('f'), 0x68,
      ...name('n'), 0x6e,
      ...name('s'), 0x78,
      ...name('a'), 0x65,
      ...name('z'), 0x7a,
      ...name('c'), 0x82, ...f32(0.5), ...f32(1), ...f32(2),
      ...name('d'), 0x8c, ...f32(-512)
    ])
    const root = parseSval(binarySvalToText(bin))
    const text = (n: string) => root.children.find((c) => c.name === n)!.text
    expect(['t', 'f', 'n', 's', 'z', 'c', 'd'].map(text)).toEqual(['t', 'f', '0', '', '0 0', '0.5 1 2 0', '-512 -512'])
    expect(root.children.find((c) => c.name === 'a')!.tag).toBe('array')
  })

  it('refuses a type it does not know rather than guessing its width', () => {
    expect(() => binarySvalToText(Uint8Array.from([0x02, 1, 0, 0, 0, 0x61, 0, 0x99]))).toThrow(/unknown type 0x99/)
  })
})

describe.skipIf(!HAS_AE)('h1c: the stock packs', () => {
  it('walks every stock pack to its last byte', () => {
    for (const id of [...TWINNED, 'survival']) {
      const pack = readStockPack(`${id}.h1c`)
      expect(pack.files.size, id).toBeGreaterThan(0)
      expect(pack.info, id).toContain(`<string name="NameID">${id}</string>`)
    }
  })

  it('decodes every packed level to the editor-saved copy, value for value (arrays in order)', () => {
    let levels = 0
    for (const id of TWINNED) {
      for (const [path, file] of readStockPack(`${id}.h1c`).files) {
        if (!path.endsWith('.lvl') || !existsSync(join(AE_ROOT, 'scenarios', id, path))) continue
        const d = diff(parseSval(levelText(file)), parseSval(readStockLevel(`${id}/${path}`)))
        expect(d, `${id}/${path}`).toBeNull()
        levels++
      }
    }
    expect(levels).toBe(66)
  }, 120_000)

  it("reads survival's levels, which AE ships only packed", () => {
    const survival = readStockPack('survival.h1c')
    const levels = [...survival.files.keys()].filter((p) => p.endsWith('.lvl')).sort()
    expect(levels).toEqual([
      'levels/crystal_mines.lvl',
      'levels/crystal_mines_shops.lvl',
      'levels/desert_caves.lvl',
      'levels/desert_caves_shops.lvl',
      'levels/shaftlocke_mountains.lvl',
      'levels/shaftlocke_mountains_shops.lvl'
    ])
    for (const p of levels) expect(() => parseSval(readStockLevel(`survival.h1c:${p}`)), p).not.toThrow()
  })
})
