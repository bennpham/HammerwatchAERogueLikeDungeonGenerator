/**
 * The `.h1c` writer (src/main/h1c/write.ts): binary SVAL, LZ4 and the pack,
 * read back through the reader. With the game installed, also against packs
 * PACKAGER.exe made: the stock ones, and generated installs kept with "keep
 * source" (`<AE>/editor/generated/<id>/` beside `<AE>/scenarios/<id>.h1c`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSval } from '../src/generator/ae/sval'
import { BIOME_IDS, defaultLobby, defaultWorld, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { binarySvalToText, levelText, lz4Block, readH1c } from '../src/main/h1c/read'
import { compileLevel, encodeSval, fnv1a64, infoDict, lz4Compress, toPackFiles, writeH1c } from '../src/main/h1c/write'
import type { PackFile } from '../src/main/h1c/write'
import { encodeSvalNode } from '../src/main/h1c/write'
import { svalDiff } from './svalDiff'
import { plainParameters } from './params'
import { AE_ROOT, HAS_AE, readStockPack } from './aeInstall'

const decode = (b: Uint8Array): string => new TextDecoder().decode(b)

describe('h1c writer: binary SVAL', () => {
  it('round-trips every tag and every compact form', () => {
    const text = [
      '<dict>',
      '\t<null name="nothing"/>',
      '\t<bool name="t">t</bool>',
      '\t<bool name="f">f</bool>',
      '\t<int name="zero">0</int>',
      '\t<int name="neg">-12345</int>',
      '\t<float name="fzero">0</float>',
      '\t<float name="half">0.5</float>',
      '\t<string name="empty"></string>',
      '\t<string name="s">a &amp; b &lt;c&gt; "d"</string>',
      '\t<bytes name="b">00ff10</bytes>',
      '\t<array name="ea"></array>',
      '\t<array name="a">',
      '\t\t<int>1</int>',
      '\t\t<vec2>0 0</vec2>',
      '\t\t<vec2>5 0</vec2>',
      '\t\t<vec2>3 3</vec2>',
      '\t\t<vec2>-1 2</vec2>',
      '\t\t<vec3>0 0 0</vec3>',
      '\t\t<vec3>1 0 0</vec3>',
      '\t\t<vec3>1 2 0</vec3>',
      '\t\t<vec3>1 2 3</vec3>',
      '\t\t<vec3>0 0 3</vec3>',
      '\t\t<vec4>0 0 0 0</vec4>',
      '\t\t<vec4>1 0 0 0</vec4>',
      '\t\t<vec4>1 2 0 0</vec4>',
      '\t\t<vec4>1 2 3 0</vec4>',
      '\t\t<vec4>1 2 3 4</vec4>',
      '\t</array>',
      '\t<dict name="d"></dict>',
      '</dict>'
    ].join('\n')
    const bin = encodeSval(text)
    expect(svalDiff(parseSval(binarySvalToText(bin)), parseSval(text))).toBeNull()
  })

  it('uses the compact forms PACKAGER uses', () => {
    const one = (t: string): number[] => [...encodeSval(t)]
    expect(one('<bool>t</bool>')).toEqual([0x67])
    expect(one('<bool>f</bool>')).toEqual([0x68])
    expect(one('<int>0</int>')).toEqual([0x6e])
    expect(one('<float>0</float>')).toEqual([0x69])
    expect(one('<string></string>')).toEqual([0x78])
    expect(one('<array></array>')).toEqual([0x65])
    expect(one('<vec2>0 0</vec2>')).toEqual([0x7a])
    expect(one('<vec4>1 2 3 0</vec4>')[0]).toBe(0x82)
    expect(one('<vec2>7 7</vec2>')[0]).toBe(0x8c)
  })

  it('refuses a tag it has no binary form for, rather than guessing', () => {
    expect(() => encodeSval('<dict><ivec2 name="x">1 2</ivec2></dict>')).toThrow(/no binary form/)
    expect(() => encodeSval('<dict><color name="x">1 2 3 4</color></dict>')).toThrow(/no binary form/)
  })
})

describe('h1c writer: LZ4', () => {
  const roundTrip = (src: Uint8Array): void => {
    const packed = lz4Compress(src)
    expect([...lz4Block(packed, src.length)]).toEqual([...src])
  }

  it('round-trips empty, short, random and repetitive data', () => {
    roundTrip(new Uint8Array(0))
    roundTrip(Uint8Array.from([1, 2, 3]))
    roundTrip(new TextEncoder().encode('abcabcabcabcabcabcabcabcabcabc'))
    let seed = 7
    const random = Uint8Array.from({ length: 70_000 }, () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24)
    roundTrip(random)
    // long literal runs and matches far past 15 + 255
    roundTrip(Uint8Array.from({ length: 100_000 }, (_, i) => (i < 600 ? i % 251 : i % 7)))
    roundTrip(new Uint8Array(200_000))
  })

  it('compresses text the way a pack needs', () => {
    const text = new TextEncoder().encode('<dict>\n'.repeat(2000))
    expect(lz4Compress(text).length).toBeLessThan(text.length / 20)
  })
})

describe('h1c writer: FNV-1a 64', () => {
  it('matches a BigInt reference', () => {
    const ref = (b: Uint8Array): bigint => {
      let h = 0xcbf29ce484222325n
      for (const x of b) h = ((h ^ BigInt(x)) * 0x100000001b3n) & ((1n << 64n) - 1n)
      return h
    }
    for (const s of ['', 'a', 'foobar', 'ÿþ\u0080 binary-ish', 'x'.repeat(1000)]) {
      const b = new TextEncoder().encode(s)
      expect(Buffer.from(fnv1a64(b)).readBigUInt64LE(0), s).toBe(ref(b))
    }
  })
})

describe('h1c writer: info.xml', () => {
  const INFO = [
    '<info>',
    '\t<name>Dungeon #1 &amp; co</name>',
    '\t<tag>Hammerwatch</tag>',
    '\t<description>desc</description>',
    '\t<players min="1" max="4" />',
    '\t<saving>all</saving>',
    '\t<start>',
    '\t\t<level name="Start level" lvl="levels/d/01.lvl" />',
    '\t</start>',
    '\t<modifiers>',
    '\t\t<modifier name=".l.a" id="A" tooltip="tip" />',
    '\t\t<separator />',
    '\t\t<modifier name=".l.b" id="B" forced="true" />',
    '\t\t<modifier name=".l.c" id="C" locked-by="A,B" />',
    '\t</modifiers>',
    '</info>'
  ].join('\n')

  it('moves forced modifiers out of the switch list and keeps separators', () => {
    const info = parseSval(binarySvalToText(encodeSvalNode(infoDict(INFO, 'd'))))
    const get = (n: string) => info.children.find((c) => c.name === n)!
    expect(get('Name').text).toBe('Dungeon #1 & co')
    expect(get('NameID').text).toBe('d')
    expect(get('MaxPlayers').text).toBe('4')
    expect(get('ForcedSwitches').children.map((c) => c.children.find((k) => k.name === 'ID')!.text)).toEqual(['B'])
    const switches = get('Switches').children.map((c) => `${c.children[0].text}:${c.children[2].text}:${c.children[3].text}`)
    expect(switches).toEqual(['0:A:', '1::', '0:C:A,B'])
  })

  it('gives each scenario its own ID', () => {
    const id = (s: string): string => infoDict(INFO, s).children.find((c) => c.name === 'ID')!.text
    expect(id('dungeon_1')).not.toBe(id('dungeon_2'))
    expect(id('dungeon_1')).toBe(id('dungeon_1'))
  })

  it("refuses what the mapping hasn't been checked for", () => {
    expect(() => infoDict(INFO.replace('forced="true"', 'default-on="true"'), 'd')).toThrow(/default-on/)
    expect(() => infoDict(INFO.replace('<saving>all</saving>', '<saving>none</saving>'), 'd')).toThrow(/saving/)
    expect(() => infoDict(INFO.replace('</modifiers>', '</modifiers><gamemodes/>'), 'd')).toThrow(/gamemodes/)
    expect(() => infoDict(INFO.replace('min="1"', 'min="2"'), 'd')).toThrow(/min players/)
  })
})

/** A pack written and read back must give back every file the generator made. */
function expectRoundTrip(result: DungeonResult): void {
  const files = toPackFiles(result.files)
  const bytes = writeH1c(result.campaignName, files)
  expect(writeH1c(result.campaignName, files), 'deterministic').toEqual(bytes)
  const pack = readH1c(bytes)
  expect(pack.info).toContain(`<string name="NameID">${result.campaignName}</string>`)
  const paths = [...pack.files.keys()]
  expect(paths.at(-1)).toBe('info.xml')
  expect(paths).not.toContain('logos.png')
  expect(new Set(paths)).toEqual(new Set(files.map((f) => f.path).filter((p) => p !== 'logos.png')))
  for (const f of files) {
    if (f.path === 'logos.png') {
      expect(Buffer.compare(Buffer.from(pack.logo), Buffer.from(f.data))).toBe(0)
      continue
    }
    const packed = pack.files.get(f.path)!
    if (f.path.endsWith('.lvl')) {
      expect(packed.flag, f.path).toBe(3)
      expect(svalDiff(parseSval(levelText(packed)), parseSval(decode(f.data))), f.path).toBeNull()
    } else {
      expect(packed.flag, f.path).toBe(1)
      expect(Buffer.compare(Buffer.from(packed.data), Buffer.from(f.data)), f.path).toBe(0)
    }
  }
}

describe('h1c writer: generated scenarios round-trip', () => {
  const base = () => {
    const params = plainParameters()
    params.levels = 1
    params.themes = ['prison']
    params.levelMonsters = [['bat']]
    params.boss = { ...params.boss, enabled: false }
    return params
  }

  it('a dungeon campaign', () => {
    const result = generateDungeon(plainParameters(), 99001) as DungeonResult
    expect(result.ok).toBe(true)
    expectRoundTrip(result)
  }, 120_000)

  it('a world of every biome', () => {
    const params = base()
    params.world = { enabled: true, worlds: BIOME_IDS.map((biome) => ({ ...defaultWorld(), biome })) }
    // Hammerwatch 2's biomes generate with HW2 loaded
    const result = generateDungeon(params, 99003, { sources: ['hw2'] }) as DungeonResult
    expect(result.ok).toBe(true)
    expectRoundTrip(result)
  }, 120_000)

  it('the stock rooms as lobbies', () => {
    const params = base()
    params.levels = 3
    params.themes = ['prison', 'prison', 'prison']
    params.levelMonsters = [['bat'], ['bat'], ['bat']]
    params.lobbies = [defaultLobby('sun_bazaar'), defaultLobby('shaftlocke_town'), defaultLobby('castle_bridge')]
    const result = generateDungeon(params, 99002) as DungeonResult
    expect(result.ok).toBe(true)
    expectRoundTrip(result)
  }, 120_000)

  it('refuses a scenario with no info.xml or a file listed twice', () => {
    const info: PackFile = { path: 'info.xml', data: new Uint8Array(0) }
    expect(() => writeH1c('d', [])).toThrow(/info\.xml/)
    const lvl: PackFile = { path: 'levels/d/a.lvl', data: new TextEncoder().encode('<dict></dict>') }
    expect(() => writeH1c('d', [info, lvl, lvl])).toThrow()
  })
})

/** Every file under `dir`, scenario-relative with forward slashes. */
function folderFiles(dir: string): PackFile[] {
  const out: PackFile[] = []
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push({ path: relative(dir, p).replace(/\\/g, '/'), data: readFileSync(p) })
    }
  }
  walk(dir)
  return out
}

/** Generated installs kept beside the pack PACKAGER made of them. */
const KEPT = HAS_AE && existsSync(join(AE_ROOT, 'editor', 'generated'))
  ? readdirSync(join(AE_ROOT, 'editor', 'generated')).filter((d) => existsSync(join(AE_ROOT, 'scenarios', `${d}.h1c`)))
  : []

describe.skipIf(!HAS_AE)('h1c writer: against PACKAGER.exe', () => {
  it('encodes every packed stock level back to the same bytes (key order as packed)', () => {
    let levels = 0
    for (const id of ['castle_hammerwatch', 'shaftlocke_tower', 'sun_temple', 'survival']) {
      for (const [path, file] of readStockPack(`${id}.h1c`).files) {
        if (!path.endsWith('.lvl')) continue
        const body = file.data.subarray(8)
        expect(Buffer.compare(Buffer.from(encodeSval(binarySvalToText(body))), Buffer.from(body)), `${id}/${path}`).toBe(0)
        levels++
      }
    }
    expect(levels).toBeGreaterThan(60)
  }, 120_000)

  it.skipIf(KEPT.length === 0)('packs a kept install like PACKAGER did: files, order, flags, levels and info', () => {
    for (const id of KEPT) {
      const theirs = readH1c(readFileSync(join(AE_ROOT, 'scenarios', `${id}.h1c`)))
      const mine = readH1c(writeH1c(id, folderFiles(join(AE_ROOT, 'editor', 'generated', id))))
      expect([...mine.files.keys()], id).toEqual([...theirs.files.keys()])
      expect(Buffer.compare(Buffer.from(mine.logo), Buffer.from(theirs.logo)), id).toBe(0)
      for (const [path, f] of theirs.files) {
        const m = mine.files.get(path)!
        expect(m.flag, `${id}/${path}`).toBe(f.flag)
        if (path.endsWith('.lvl')) {
          expect(svalDiff(parseSval(levelText(m)), parseSval(levelText(f))), `${id}/${path}`).toBeNull()
          // byte for byte once the keys are in PACKAGER's order
          const reordered = encodeSval(binarySvalToText(f.data.subarray(8)))
          expect(Buffer.compare(Buffer.from(reordered), Buffer.from(f.data.subarray(8))), `${id}/${path}`).toBe(0)
        } else {
          expect(Buffer.compare(Buffer.from(m.data), Buffer.from(f.data)), `${id}/${path}`).toBe(0)
        }
      }
      // the info, all but PACKAGER's own ID int
      const strip = (s: string) => parseSval(s.replace(/<int name="ID">-?\d+<\/int>/, '<int name="ID">0</int>'))
      expect(svalDiff(strip(mine.info), strip(theirs.info)), id).toBeNull()
    }
  }, 300_000)

  it('compiles a kept level to the same tree PACKAGER compiled', () => {
    for (const id of KEPT.slice(0, 1)) {
      const theirs = readH1c(readFileSync(join(AE_ROOT, 'scenarios', `${id}.h1c`)))
      for (const [path, f] of theirs.files) {
        if (!path.endsWith('.lvl')) continue
        const mine = compileLevel(readFileSync(join(AE_ROOT, 'editor', 'generated', id, path)))
        expect(svalDiff(parseSval(binarySvalToText(mine.subarray(8))), parseSval(levelText(f))), path).toBeNull()
      }
    }
  }, 120_000)
})
