/**
 * The `.h1c` reader (scripts/lib/h1c.ts) against the stock packs: every stock
 * campaign that also ships its levels unpacked (the editor's own text saves)
 * must decode to the same tree, value for value (arrays in order).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSval } from '../src/generator/ae/sval'
import { binarySvalToText, entryData, levelText, lz4Block, readHw1rIndex } from '../scripts/lib/h1c'
import { svalDiff as diff } from './svalDiff'
import { AE_ROOT, HAS_AE, aeAssetsDir, readStockLevel, readStockPack } from './aeInstall'

/** the stock packs whose levels are also unpacked beside them */
const TWINNED = ['castle_hammerwatch', 'shaftlocke_tower', 'sun_temple']

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

  it("walks the game's own assets.bin (HW1R) to its last byte, sound banks and all", () => {
    const bin = readFileSync(join(AE_ROOT, 'res', 'assets.bin'))
    const entries = readHw1rIndex((at, len) => bin.subarray(at, at + len), bin.length)
    expect(entries.size).toBeGreaterThan(10_000)
    expect(entries.get('sound/sfx.bank')?.flag).toBe(0xff)
    const assets = aeAssetsDir()
    if (assets === null) return
    for (const path of ['players/classes.sval', 'scripts/GUI/Shop/PowerShopMenuContent.as']) {
      const data = entryData(entries.get(path)!, (at, len) => bin.subarray(at, at + len))
      expect(Buffer.compare(Buffer.from(data), readFileSync(join(assets, path))), path).toBe(0)
    }
  })

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
