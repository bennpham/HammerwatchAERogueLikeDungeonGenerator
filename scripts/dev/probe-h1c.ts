// What do PACKAGER.exe's hashes cover? Windows only, Steam must be running.
//
//   node scripts/run-ts.mjs scripts/dev/probe-h1c.ts pack <outDir>   pack the variants with the real PACKAGER
//   node scripts/run-ts.mjs scripts/dev/probe-h1c.ts crack <outDir>  compare them and try hash families
//
// `pack` writes a throwaway scenario `hwae_probe` into <AE>/scenarios, packs it
// once per variant, copies each .h1c and its sources to <outDir>/<variant>/,
// and removes what it made from the AE folder.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { crc32 } from 'node:zlib'
import { generateDungeon } from '../../src/generator'
import { plainParameters } from '../../tests/params'
import type { DungeonResult } from '../../src/generator'
import { readH1c } from '../../src/main/h1c/read'

const AE = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const ID = 'hwae_probe'
const [mode, outDir] = process.argv.slice(2)
if (!['pack', 'crack', 'kept'].includes(mode) || (mode !== 'kept' && outDir === undefined)) {
  console.error('usage: probe-h1c.ts pack|crack <outDir>, or kept')
  process.exit(1)
}

type Files = Map<string, Buffer>

function baseFiles(): Files {
  const params = plainParameters()
  params.levels = 1
  params.themes = ['prison']
  params.levelMonsters = [['bat']]
  params.boss = { ...params.boss, enabled: false }
  const result = generateDungeon(params, 4242) as DungeonResult
  if (!result.ok) throw new Error('generation failed: ' + JSON.stringify((result as { errors?: unknown }).errors))
  const files: Files = new Map()
  for (const f of result.files) {
    // the generator names everything after its own campaign id; rename to ours
    const path = f.path.replaceAll(result.campaignName, ID)
    const body = f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : Buffer.from(f.content.replaceAll(result.campaignName, ID))
    files.set(path, body)
  }
  return files
}

function variants(): [string, Files][] {
  const base = baseFiles()
  const levels = [...base.keys()].filter((p) => p.endsWith('.lvl'))
  const first = levels[0]
  const edit = (fn: (f: Files) => void): Files => {
    const f = new Map(base)
    fn(f)
    return f
  }
  return [
    ['a_base', base],
    ['a_again', base],
    // whitespace only: the text changes, the compiled SVAL does not
    ['b_whitespace', edit((f) => f.set(first, Buffer.concat([f.get(first)!, Buffer.from('\n\n')])))],
    // one value: both change
    ['b_value', edit((f) => f.set(first, Buffer.from(f.get(first)!.toString().replace('<int name="version">', '<int name="version">1'))))],
    ['c_info', edit((f) => f.set('info.xml', Buffer.from(f.get('info.xml')!.toString().replace('<description>', '<description>Probe. '))))],
    ['d_renamed', edit((f) => {
      const body = f.get(first)!
      f.delete(first)
      f.set(first.replace(/[^/]+\.lvl$/, 'zz_renamed.lvl'), body)
    })],
    ['e_extra_file', edit((f) => f.set('scripts/probe.as', Buffer.from('// probe\n')))]
  ]
}

function pack(): void {
  const scenarios = join(AE, 'scenarios')
  const src = join(scenarios, ID)
  const packed = join(scenarios, `${ID}.h1c`)
  try {
    for (const [name, files] of variants()) {
      rmSync(src, { recursive: true, force: true })
      rmSync(packed, { force: true })
      for (const [p, body] of files) {
        mkdirSync(dirname(join(src, p)), { recursive: true })
        writeFileSync(join(src, p), body)
      }
      let output = ''
      try {
        output = execFileSync(join(AE, 'PACKAGER.exe'), ['-l', ID], { cwd: AE, stdio: 'pipe', timeout: 400_000 }).toString()
      } catch (e) {
        // exits 127 even on success; the .h1c is the test
        const err = e as { stdout?: Buffer; stderr?: Buffer; message: string }
        output = `${err.message}\n${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`
      }
      if (!existsSync(packed)) throw new Error(`${name}: PACKAGER produced no .h1c (is Steam running?)\n${output.slice(-3000)}`)
      const out = join(outDir, name)
      rmSync(out, { recursive: true, force: true })
      cpSync(src, join(out, 'src'), { recursive: true })
      cpSync(packed, join(out, `${ID}.h1c`))
      console.log(`${name}: packed`)
    }
  } finally {
    rmSync(src, { recursive: true, force: true })
    rmSync(packed, { force: true })
  }
}

// ---- hash families -------------------------------------------------------

const M64 = (1n << 64n) - 1n
const rotl64 = (x: bigint, r: bigint): bigint => ((x << r) | (x >> (64n - r))) & M64
const rotl32 = (x: number, r: number): number => ((x << r) | (x >>> (32 - r))) >>> 0

function fnv1a64(b: Uint8Array): bigint {
  let h = 0xcbf29ce484222325n
  for (const x of b) h = ((h ^ BigInt(x)) * 0x100000001b3n) & M64
  return h
}
function fnv1_64(b: Uint8Array): bigint {
  let h = 0xcbf29ce484222325n
  for (const x of b) h = ((h * 0x100000001b3n) & M64) ^ BigInt(x)
  return h
}
function fnv1a32(b: Uint8Array): number {
  let h = 0x811c9dc5
  for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0
  return h
}
function fnv1_32(b: Uint8Array): number {
  let h = 0x811c9dc5
  for (const x of b) h = (Math.imul(h, 0x01000193) ^ x) >>> 0
  return h
}
function djb2(b: Uint8Array): number {
  let h = 5381
  for (const x of b) h = (Math.imul(h, 33) + x) >>> 0
  return h
}
function sdbm(b: Uint8Array): number {
  let h = 0
  for (const x of b) h = (x + (h << 6) + (h << 16) - h) >>> 0
  return h
}

const P32 = [2654435761, 2246822519, 3266489917, 668265263, 374761393]
function xxh32(b: Uint8Array, seed = 0): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 0
  let h: number
  const round = (acc: number, lane: number): number => Math.imul(rotl32((acc + Math.imul(lane, P32[1])) >>> 0, 13), P32[0]) >>> 0
  if (b.length >= 16) {
    let a1 = (seed + P32[0] + P32[1]) >>> 0
    let a2 = (seed + P32[1]) >>> 0
    let a3 = seed >>> 0
    let a4 = (seed - P32[0]) >>> 0
    while (i + 16 <= b.length) {
      a1 = round(a1, v.getUint32(i, true))
      a2 = round(a2, v.getUint32(i + 4, true))
      a3 = round(a3, v.getUint32(i + 8, true))
      a4 = round(a4, v.getUint32(i + 12, true))
      i += 16
    }
    h = (rotl32(a1, 1) + rotl32(a2, 7) + rotl32(a3, 12) + rotl32(a4, 18)) >>> 0
  } else h = (seed + P32[4]) >>> 0
  h = (h + b.length) >>> 0
  while (i + 4 <= b.length) {
    h = Math.imul(rotl32((h + Math.imul(v.getUint32(i, true), P32[2])) >>> 0, 17), P32[3]) >>> 0
    i += 4
  }
  while (i < b.length) {
    h = Math.imul(rotl32((h + Math.imul(b[i], P32[4])) >>> 0, 11), P32[0]) >>> 0
    i++
  }
  h = Math.imul(h ^ (h >>> 15), P32[1]) >>> 0
  h = Math.imul(h ^ (h >>> 13), P32[2]) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const P64 = [0x9e3779b185ebca87n, 0xc2b2ae3d27d4eb4fn, 0x165667b19e3779f9n, 0x85ebca77c2b2ae63n, 0x27d4eb2f165667c5n]
function xxh64(b: Uint8Array, seed = 0n): bigint {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const mul = (a: bigint, c: bigint): bigint => (a * c) & M64
  const round = (acc: bigint, lane: bigint): bigint => mul(rotl64((acc + mul(lane, P64[1])) & M64, 31n), P64[0])
  const merge = (acc: bigint, val: bigint): bigint => ((mul(acc ^ round(0n, val), 1n) * P64[0] + P64[3]) & M64)
  let i = 0
  let h: bigint
  if (b.length >= 32) {
    let a1 = (seed + P64[0] + P64[1]) & M64
    let a2 = (seed + P64[1]) & M64
    let a3 = seed
    let a4 = (seed - P64[0]) & M64
    while (i + 32 <= b.length) {
      a1 = round(a1, v.getBigUint64(i, true))
      a2 = round(a2, v.getBigUint64(i + 8, true))
      a3 = round(a3, v.getBigUint64(i + 16, true))
      a4 = round(a4, v.getBigUint64(i + 24, true))
      i += 32
    }
    h = (rotl64(a1, 1n) + rotl64(a2, 7n) + rotl64(a3, 12n) + rotl64(a4, 18n)) & M64
    h = merge(h, a1)
    h = merge(h, a2)
    h = merge(h, a3)
    h = merge(h, a4)
  } else h = (seed + P64[4]) & M64
  h = (h + BigInt(b.length)) & M64
  while (i + 8 <= b.length) {
    h = (mul(rotl64(h ^ round(0n, v.getBigUint64(i, true)), 27n), P64[0]) + P64[3]) & M64
    i += 8
  }
  if (i + 4 <= b.length) {
    h = (mul(rotl64(h ^ mul(BigInt(v.getUint32(i, true)), P64[0]), 23n), P64[1]) + P64[2]) & M64
    i += 4
  }
  while (i < b.length) {
    h = mul(rotl64(h ^ mul(BigInt(b[i]), P64[4]), 11n), P64[0])
    i++
  }
  h = mul(h ^ (h >> 33n), P64[1])
  h = mul(h ^ (h >> 29n), P64[2])
  return h ^ (h >> 32n)
}

function murmur3_32(b: Uint8Array, seed = 0): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let h = seed >>> 0
  const n = b.length & ~3
  for (let i = 0; i < n; i += 4) {
    let k = Math.imul(v.getUint32(i, true), 0xcc9e2d51)
    k = Math.imul(rotl32(k >>> 0, 15), 0x1b873593)
    h = (Math.imul(rotl32((h ^ k) >>> 0, 13), 5) + 0xe6546b64) >>> 0
  }
  let k = 0
  for (let i = b.length - 1; i >= n; i--) k = ((k << 8) | b[i]) >>> 0
  if (b.length & 3) {
    k = Math.imul(rotl32(Math.imul(k, 0xcc9e2d51) >>> 0, 15), 0x1b873593) >>> 0
    h = (h ^ k) >>> 0
  }
  h = (h ^ b.length) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

function murmur3_128(b: Uint8Array, seed = 0n): [bigint, bigint] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const c1 = 0x87c37b91114253d5n
  const c2 = 0x4cf5ad432745937fn
  const mul = (a: bigint, c: bigint): bigint => (a * c) & M64
  const fmix = (k: bigint): bigint => {
    k = mul(k ^ (k >> 33n), 0xff51afd7ed558ccdn)
    k = mul(k ^ (k >> 33n), 0xc4ceb9fe1a85ec53n)
    return k ^ (k >> 33n)
  }
  let h1 = seed
  let h2 = seed
  const n = b.length - (b.length % 16)
  for (let i = 0; i < n; i += 16) {
    let k1 = v.getBigUint64(i, true)
    let k2 = v.getBigUint64(i + 8, true)
    k1 = mul(rotl64(mul(k1, c1), 31n), c2)
    h1 ^= k1
    h1 = (mul(((rotl64(h1, 27n) + h2) & M64), 5n) + 0x52dce729n) & M64
    k2 = mul(rotl64(mul(k2, c2), 33n), c1)
    h2 ^= k2
    h2 = (mul(((rotl64(h2, 31n) + h1) & M64), 5n) + 0x38495ab5n) & M64
  }
  let k1 = 0n
  let k2 = 0n
  for (let i = b.length - 1; i >= n; i--) {
    const j = i - n
    if (j >= 8) k2 |= BigInt(b[i]) << BigInt((j - 8) * 8)
    else k1 |= BigInt(b[i]) << BigInt(j * 8)
  }
  if (b.length - n > 8) h2 ^= mul(rotl64(mul(k2, c2), 33n), c1)
  if (b.length - n > 0) h1 ^= mul(rotl64(mul(k1, c1), 31n), c2)
  h1 ^= BigInt(b.length)
  h2 ^= BigInt(b.length)
  h1 = (h1 + h2) & M64
  h2 = (h2 + h1) & M64
  h1 = fmix(h1)
  h2 = fmix(h2)
  h1 = (h1 + h2) & M64
  h2 = (h2 + h1) & M64
  return [h1, h2]
}

const HASH32: Record<string, (b: Uint8Array) => number> = {
  crc32: (b) => crc32(b),
  fnv1a32,
  fnv1_32,
  xxh32: (b) => xxh32(b),
  murmur3_32: (b) => murmur3_32(b),
  djb2,
  sdbm
}
const HASH64: Record<string, (b: Uint8Array) => bigint> = {
  fnv1a64,
  fnv1_64,
  xxh64: (b) => xxh64(b),
  murmur3_128lo: (b) => murmur3_128(b)[0],
  murmur3_128hi: (b) => murmur3_128(b)[1]
}

/** A pack and the folder it was packed from. */
interface Probe {
  name: string
  id: string
  h1c: string
  src: string
}

function inputs(probe: Probe, levelPath: string, levelData: Uint8Array): Record<string, Uint8Array> {
  const text = readFileSync(join(probe.src, levelPath))
  const enc = (s: string): Uint8Array => Buffer.from(s)
  return {
    text,
    textCrlf: Buffer.from(text.toString().replace(/\n/g, '\r\n')),
    body: levelData.subarray(8),
    path: enc(levelPath),
    pathLc: enc(levelPath.toLowerCase()),
    pathBs: enc(levelPath.replace(/\//g, '\\')),
    scenarioPath: enc(`scenarios/${probe.id}/${levelPath}`),
    pathNoExt: enc(levelPath.replace(/\.lvl$/, '')),
    pathText: Buffer.concat([enc(levelPath), text]),
    pathBody: Buffer.concat([enc(levelPath), levelData.subarray(8)]),
    utf16Path: Buffer.from(levelPath, 'utf16le')
  }
}

/** Known answers, so a miss means "not this family" rather than "my port is wrong". */
function selfTest(): void {
  const a = Buffer.from('a')
  const e = new Uint8Array(0)
  const checks: [string, boolean][] = [
    ['xxh32("")', xxh32(e) === 0x02cc5d05],
    ['xxh32("a")', xxh32(a) === 0x550d7456],
    ['xxh64("")', xxh64(e) === 0xef46db3751d8e999n],
    ['xxh64("a")', xxh64(a) === 0xd24ec4f1a98c6e5bn],
    ['murmur3_32("a")', murmur3_32(a) === 0x3c2569b2],
    ['murmur3_128("")', murmur3_128(e)[0] === 0n],
    ['fnv1a32("a")', fnv1a32(a) === 0xe40c292c],
    ['fnv1a64("a")', fnv1a64(a) === 0xaf63dc4c8601ec8cn]
  ]
  const bad = checks.filter(([, ok]) => !ok).map(([n]) => n)
  console.log(bad.length === 0 ? 'hash self-test ok' : `hash self-test FAILED: ${bad.join(', ')}`)
}

function variantProbes(): Probe[] {
  return readdirSync(outDir)
    .filter((d) => existsSync(join(outDir, d, `${ID}.h1c`)))
    .sort()
    .map((d) => ({ name: d, id: ID, h1c: join(outDir, d, `${ID}.h1c`), src: join(outDir, d, 'src') }))
}

/** Installs made with "keep source": the pack in scenarios/, its folder in editor/generated/. */
function keptProbes(): Probe[] {
  const gen = join(AE, 'editor', 'generated')
  return readdirSync(gen)
    .filter((d) => existsSync(join(AE, 'scenarios', `${d}.h1c`)))
    .map((d) => ({ name: d, id: d, h1c: join(AE, 'scenarios', `${d}.h1c`), src: join(gen, d) }))
}

function crack(probes: Probe[]): void {
  selfTest()
  const packs = new Map(probes.map((p) => [p.name, readH1c(readFileSync(p.h1c))]))
  const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
  for (const [name, p] of packs) {
    console.log(`\n== ${name}: header hash ${p.hash.toString(16).padStart(8, '0')}, ${p.files.size} files`)
    for (const [path, f] of p.files) {
      const extra = path.endsWith('.lvl') ? ` hash ${hex(f.data.subarray(0, 8))}` : ''
      console.log(`  flag ${f.flag} ${path} (${f.data.length} bytes)${extra}`)
    }
  }
  // which hashes moved between variants
  const base = packs.get('a_base')
  for (const [name, p] of base === undefined ? [] : packs) {
    if (name === 'a_base' || base === undefined) continue
    const lvl = (q: typeof p): string[] => [...q.files].filter(([k]) => k.endsWith('.lvl')).map(([k, f]) => `${k.split('/').pop()}=${hex(f.data.subarray(0, 8))}`)
    console.log(`\n${name} vs a_base: header ${p.hash === base.hash ? 'same' : 'CHANGED'}; levels ${JSON.stringify(lvl(p))} vs ${JSON.stringify(lvl(base))}`)
    const sameBodies = [...p.files].every(([k, f]) => !k.endsWith('.lvl') || !base.files.has(k) || Buffer.compare(Buffer.from(f.data.subarray(8)), Buffer.from(base.files.get(k)!.data.subarray(8))) === 0)
    console.log(`  level bodies ${sameBodies ? 'same' : 'differ'}`)
  }
  // try every family on every input
  const hits: string[] = []
  for (const probe of probes) {
    const name = probe.name
    const p = packs.get(name)!
    for (const [path, f] of p.files) {
      if (!path.endsWith('.lvl')) continue
      const want64 = Buffer.from(f.data.subarray(0, 8)).readBigUInt64LE(0)
      const want32 = [Buffer.from(f.data).readUInt32LE(0), Buffer.from(f.data).readUInt32LE(4)]
      for (const [inName, input] of Object.entries(inputs(probe, path, f.data))) {
        for (const [hName, h] of Object.entries(HASH64)) {
          const got = h(input)
          if (got === want64) hits.push(`${name} ${path}: u64 = ${hName}(${inName})`)
          if ((got & 0xffffffffn) === BigInt(want32[0]) || (got >> 32n) === BigInt(want32[1])) hits.push(`${name} ${path}: half of u64 = ${hName}(${inName})`)
        }
        for (const [hName, h] of Object.entries(HASH32)) {
          const got = h(input) >>> 0
          if (got === want32[0]) hits.push(`${name} ${path}: low u32 = ${hName}(${inName})`)
          if (got === want32[1]) hits.push(`${name} ${path}: high u32 = ${hName}(${inName})`)
        }
      }
    }
    const infoXml = readFileSync(join(probe.src, 'info.xml'))
    const infoId = Number(/<int name="ID">(-?\d+)<\/int>/.exec(p.info)?.[1]) >>> 0
    const nameOf = /<string name="Name">([^<]*)<\/string>/.exec(p.info)?.[1] ?? ''
    const whole = readFileSync(probe.h1c)
    const stringInputs: Record<string, Uint8Array> = {
      infoXml,
      infoBin: p.infoBinary,
      logo: p.logo,
      id: Buffer.from(probe.id),
      idUpper: Buffer.from(probe.id.toUpperCase()),
      scenarioDir: Buffer.from(`scenarios/${probe.id}`),
      scenarioDirSlash: Buffer.from(`scenarios/${probe.id}/`),
      h1cName: Buffer.from(`${probe.id}.h1c`),
      scenarioH1c: Buffer.from(`scenarios/${probe.id}.h1c`),
      name: Buffer.from(nameOf),
      afterHash: whole.subarray(9),
      whole0: (() => {
        const b = Buffer.from(whole)
        b.fill(0, 5, 9)
        return b
      })()
    }
    for (const [target, want] of [['header', p.hash], ['info ID', infoId]] as const) {
      for (const [inName, input] of Object.entries(stringInputs)) {
        for (const [hName, h] of Object.entries(HASH32)) if (h(input) >>> 0 === want) hits.push(`${name}: ${target} = ${hName}(${inName})`)
        for (const [hName, h] of Object.entries(HASH64)) {
          const got = h(input)
          if ((got & 0xffffffffn) === BigInt(want) || got >> 32n === BigInt(want)) hits.push(`${name}: ${target} = half of ${hName}(${inName})`)
        }
      }
    }
    console.log(`${name}: header ${p.hash.toString(16)}, info ID ${infoId.toString(16)}`)
  }
  console.log(`\nhash hits:\n${hits.length > 0 ? hits.join('\n') : '(none)'}`)
}

if (mode === 'pack') pack()
else if (mode === 'kept') crack(keptProbes())
else crack(variantProbes())
