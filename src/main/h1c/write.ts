/**
 * Write a packed AE scenario (`.h1c`) without PACKAGER.exe. PACKAGER needs a
 * running Steam client ("Failed to initialize Steam!"), so it can't pack on
 * Linux at all, nor on Windows with Steam closed. The layout is the one
 * `read.ts` documents; this is its inverse. Pure: bytes in, bytes out.
 */
import { parseSval } from '../../generator/ae/sval'
import type { SvalNode } from '../../generator/ae/sval'
import type { GeneratedFile } from '../../generator'
import { H1C_MAGIC } from './read'

/** What a pack is made from: scenario-relative paths and their bytes. */
export interface PackFile {
  path: string
  data: Uint8Array
}

/** The generator's files (text, or base64 for the logo) as pack files. */
export function toPackFiles(files: readonly GeneratedFile[]): PackFile[] {
  return files.map((f) => ({
    path: f.path,
    data: f.encoding === 'base64' ? Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)) : utf8(f.content)
  }))
}

class Bytes {
  private chunks: Uint8Array[] = []
  length = 0

  push(b: Uint8Array): void {
    this.chunks.push(b)
    this.length += b.length
  }

  u8(v: number): void {
    this.push(Uint8Array.of(v))
  }

  u32(v: number): void {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, v >>> 0, true)
    this.push(b)
  }

  i32(v: number): void {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setInt32(0, v, true)
    this.push(b)
  }

  f32(v: number): void {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setFloat32(0, v, true)
    this.push(b)
  }

  cstr(s: string): void {
    const b = utf8(s)
    if (b.includes(0)) throw new Error('sval: a string holds a NUL byte')
    this.push(b)
    this.u8(0)
  }

  done(): Uint8Array {
    const out = new Uint8Array(this.length)
    let o = 0
    for (const c of this.chunks) {
      out.set(c, o)
      o += c.length
    }
    return out
  }
}

const encoder = new TextEncoder()
function utf8(s: string): Uint8Array {
  return encoder.encode(s)
}

/** vecN tag → [full type byte, first compact byte for k stored floats (k = 0…N-1)] */
const VEC_TYPES: Record<string, [number, number, number]> = {
  vec2: [0x08, 0x7a, 2],
  vec3: [0x09, 0x7c, 3],
  vec4: [0x0a, 0x7f, 4]
}

function numbers(node: SvalNode): number[] {
  const s = node.text.trim()
  return s === '' ? [] : s.split(/\s+/).map(Number)
}

function writeValue(out: Bytes, node: SvalNode): void {
  const text = node.text.trim()
  switch (node.tag) {
    case 'null':
      out.u8(0x00)
      return
    case 'array':
      if (node.children.length === 0) {
        out.u8(0x65)
        return
      }
      out.u8(0x01)
      out.u32(node.children.length)
      for (const c of node.children) writeValue(out, c)
      return
    case 'dict':
      out.u8(0x02)
      out.u32(node.children.length)
      for (const c of node.children) {
        if (c.name === undefined) throw new Error(`sval: a <${c.tag}> in a dict has no name`)
        out.cstr(c.name)
        writeValue(out, c)
      }
      return
    case 'bool': {
      const t = text.toLowerCase()
      out.u8(t === 't' || t === 'true' || t === '1' ? 0x67 : 0x68)
      return
    }
    case 'int': {
      const v = Number.parseInt(text, 10)
      if (!Number.isFinite(v)) throw new Error(`sval: bad int ${JSON.stringify(node.text)}`)
      if (v === 0) {
        out.u8(0x6e)
        return
      }
      out.u8(0x05)
      out.i32(v)
      return
    }
    case 'float': {
      const v = Number(text)
      if (text === '' || Number.isNaN(v)) throw new Error(`sval: bad float ${JSON.stringify(node.text)}`)
      if (Object.is(Math.fround(v), 0)) {
        out.u8(0x69)
        return
      }
      out.u8(0x04)
      out.f32(v)
      return
    }
    case 'string':
      if (node.text === '') {
        out.u8(0x78)
        return
      }
      out.u8(0x06)
      out.cstr(node.text)
      return
    case 'bytes': {
      if (text.length % 2 !== 0 || /[^0-9a-fA-F]/.test(text)) throw new Error('sval: bad bytes')
      out.u8(0x07)
      out.u32(text.length / 2)
      const b = new Uint8Array(text.length / 2)
      for (let i = 0; i < b.length; i++) b[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16)
      out.push(b)
      return
    }
    case 'vec2':
    case 'vec3':
    case 'vec4': {
      const [full, compact, size] = VEC_TYPES[node.tag]
      const v = numbers(node)
      if (v.length !== size || v.some((x) => Number.isNaN(x))) throw new Error(`sval: bad ${node.tag} ${JSON.stringify(node.text)}`)
      const f = v.map((x) => Math.fround(x))
      // trailing zeros are left out; a vec2 of two equal non-zero floats is stored once
      let stored = size
      while (stored > 0 && Object.is(f[stored - 1], 0)) stored--
      if (stored < size) {
        out.u8(compact + stored)
        for (let k = 0; k < stored; k++) out.f32(f[k])
        return
      }
      if (size === 2 && f[0] === f[1]) {
        out.u8(0x8c)
        out.f32(f[0])
        return
      }
      out.u8(full)
      for (const x of f) out.f32(x)
      return
    }
    default:
      throw new Error(`sval: no binary form known for <${node.tag}>`)
  }
}

/** A parsed SVAL value as binary SVAL. Throws on a tag it can't encode. */
export function encodeSvalNode(node: SvalNode): Uint8Array {
  const out = new Bytes()
  writeValue(out, node)
  return out.done()
}

/** Text SVAL to binary SVAL. */
export function encodeSval(text: string): Uint8Array {
  return encodeSvalNode(parseSval(text))
}

// ---- LZ4 ----------------------------------------------------------------

const MIN_MATCH = 4
/** the last 5 bytes are always literals, and no match starts in the last 12 */
const LAST_LITERALS = 5
const MF_LIMIT = 12
const HASH_BITS = 16

/**
 * One LZ4 block (no frame), greedy with a single-entry hash table. Any LZ4
 * decoder reads it; it is deterministic, so the same bytes always pack the same.
 */
export function lz4Compress(src: Uint8Array): Uint8Array {
  const out = new Bytes()
  const table = new Int32Array(1 << HASH_BITS).fill(-1)
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const hash = (i: number): number => Math.imul(view.getUint32(i, true), 2654435761) >>> (32 - HASH_BITS)
  const length = (n: number): void => {
    while (n >= 255) {
      out.u8(255)
      n -= 255
    }
    out.u8(n)
  }
  const sequence = (litStart: number, litEnd: number, offset: number, matchLen: number): void => {
    const lit = litEnd - litStart
    const m = matchLen - MIN_MATCH
    out.u8((Math.min(lit, 15) << 4) | (matchLen === 0 ? 0 : Math.min(m, 15)))
    if (lit >= 15) length(lit - 15)
    out.push(src.subarray(litStart, litEnd))
    if (matchLen === 0) return
    out.u8(offset & 0xff)
    out.u8(offset >> 8)
    if (m >= 15) length(m - 15)
  }
  let anchor = 0
  let i = 0
  const limit = src.length - MF_LIMIT
  while (i < limit) {
    const h = hash(i)
    const ref = table[h]
    table[h] = i
    if (ref >= 0 && i - ref <= 0xffff && view.getUint32(ref, true) === view.getUint32(i, true)) {
      let len = MIN_MATCH
      const maxLen = src.length - LAST_LITERALS - i
      while (len < maxLen && src[ref + len] === src[i + len]) len++
      sequence(anchor, i, i - ref, len)
      i += len
      anchor = i
      continue
    }
    i++
  }
  sequence(anchor, src.length, 0, 0)
  return out.done()
}

// ---- the pack -----------------------------------------------------------

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** `<tag a="b" … />` attributes; throws on one not in `known`. */
function attributes(tag: string, raw: string, known: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    if (!known.includes(m[1])) throw new Error(`info.xml: <${tag}> has an attribute PACKAGER's mapping isn't known for: ${m[1]}`)
    out.set(m[1], unescapeXml(m[2]))
  }
  return out
}

const node = (tag: string, name: string | undefined, text: string, children: SvalNode[] = []): SvalNode => ({ tag, name, text, children })
const str = (name: string | undefined, v: string): SvalNode => node('string', name, v)
const int = (name: string | undefined, v: number): SvalNode => node('int', name, String(v))
const bool = (name: string | undefined, v: boolean): SvalNode => node('bool', name, v ? 't' : 'f')
const dict = (name: string | undefined, children: SvalNode[]): SvalNode => node('dict', name, '', children)
const array = (name: string | undefined, children: SvalNode[]): SvalNode => node('array', name, '', children)

/** `<saving>` values, as PACKAGER stores them */
const SAVING: Record<string, number> = { all: 2 }

/**
 * `info.xml` as the pack header's info dict, in PACKAGER's key order
 * [VERIFIED against the packs PACKAGER made of generated scenarios]. Forced
 * modifiers go to `ForcedSwitches`; the rest, separators included (Visual 1),
 * to `Switches`, in order. Anything this mapping hasn't been checked for
 * throws, so the install falls back to an unpacked folder rather than guess.
 *
 * `ID` is PACKAGER's own int, which isn't a known hash of anything in the
 * scenario; ours is FNV-1a of the scenario id, so it is stable and differs
 * per scenario.
 */
export function infoDict(infoXml: string, scenarioId: string): SvalNode {
  const body = /<info>([\s\S]*)<\/info>/.exec(infoXml.replace(/<!--[\s\S]*?-->/g, ''))?.[1]
  if (body === undefined) throw new Error('info.xml: no <info> element')
  const text = (tag: string): string => {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)
    if (m === null) throw new Error(`info.xml: no <${tag}>`)
    return unescapeXml(m[1].trim())
  }
  for (const m of body.matchAll(/<(\w+)[\s/>]/g)) {
    if (!['name', 'tag', 'description', 'players', 'saving', 'start', 'level', 'modifiers', 'modifier', 'separator'].includes(m[1])) {
      throw new Error(`info.xml: <${m[1]}> isn't in the known mapping`)
    }
  }

  const players = /<players\b([^>]*)\/>/.exec(body)
  const p = attributes('players', players?.[1] ?? '', ['min', 'max'])
  if ((p.get('min') ?? '1') !== '1') throw new Error('info.xml: only min players 1 is known (packed as -1)')
  const maxPlayers = Number(p.get('max') ?? '7')
  const saving = SAVING[text('saving')]
  if (saving === undefined) throw new Error(`info.xml: unknown <saving> ${text('saving')}`)

  const start = /<start>([\s\S]*?)<\/start>/.exec(body)?.[1] ?? ''
  const startLevels = [...start.matchAll(/<level\b([^>]*)\/>/g)].map((m) => {
    const a = attributes('level', m[1], ['name', 'lvl'])
    return dict(undefined, [str('Name', a.get('name') ?? ''), str('Level', a.get('lvl') ?? '')])
  })
  if (startLevels.length === 0) throw new Error('info.xml: no start level')

  const forced: SvalNode[] = []
  const switches: SvalNode[] = []
  const modifiers = /<modifiers>([\s\S]*?)<\/modifiers>/.exec(body)?.[1] ?? ''
  for (const m of modifiers.matchAll(/<(modifier|separator)\b([^>]*)\/>/g)) {
    const a = attributes(m[1], m[2], m[1] === 'separator' ? [] : ['name', 'id', 'tooltip', 'locked-by', 'forced'])
    const forcedOn = a.get('forced')
    if (forcedOn !== undefined && forcedOn !== 'true') throw new Error(`info.xml: unknown forced="${forcedOn}"`)
    if (forcedOn === 'true') {
      forced.push(dict(undefined, [str('ID', a.get('id') ?? ''), str('LockedBy', a.get('locked-by') ?? '')]))
      continue
    }
    switches.push(
      dict(undefined, [
        int('Visual', m[1] === 'separator' ? 1 : 0),
        str('Tooltip', a.get('tooltip') ?? ''),
        str('ID', a.get('id') ?? ''),
        str('LockedBy', a.get('locked-by') ?? ''),
        str('Name', a.get('name') ?? ''),
        str('RadioGroup', ''),
        bool('DefaultOn', false),
        bool('Multiplayer', false)
      ])
    )
  }

  return dict(undefined, [
    array('ForcedSwitches', forced),
    int('ID', fnv1a32(utf8(scenarioId)) | 0),
    str('Tag', text('tag')),
    str('NameID', scenarioId),
    str('Name', text('name')),
    str('Description', text('description')),
    array('StartLevels', startLevels),
    array('Switches', switches),
    int('MinPlayers', -1),
    int('MaxPlayers', maxPlayers),
    bool('Multiplayer', false),
    int('Saving', saving),
    bool('DisableInclude', false),
    dict('ClassMaps', [array('Behaviors', []), array('Scripts', []), array('Gamemodes', [])]),
    array('IncludeScenarios', [])
  ])
}

function fnv1a32(b: Uint8Array): number {
  let h = 0x811c9dc5
  for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0
  return h
}

/** 64-bit FNV-1a, little-endian */
export function fnv1a64(b: Uint8Array): Uint8Array {
  // two 32-bit halves of a 64-bit FNV-1a, without BigInt in the hot loop
  let lo = 0x84222325
  let hi = 0xcbf29ce4
  for (const x of b) {
    lo = (lo ^ x) >>> 0
    // (hi:lo) * 0x100000001b3 = (hi:lo) * 0x1b3 + (lo << 40)
    const loMul = lo * 0x1b3
    const carry = Math.floor(loMul / 0x100000000)
    hi = (Math.imul(hi, 0x1b3) + carry + ((lo << 8) >>> 0)) >>> 0
    lo = loMul >>> 0
  }
  const out = new Uint8Array(8)
  const v = new DataView(out.buffer)
  v.setUint32(0, lo, true)
  v.setUint32(4, hi, true)
  return out
}

/**
 * Write a `.h1c` from a scenario's files (`info.xml` and `logos.png` among
 * them; the logo goes in the header, not the file table). Deterministic: the
 * same files always give the same bytes.
 *
 * The three hashes PACKAGER writes (the header's u32, each level's 8 bytes,
 * the info `ID`) aren't a known hash of the scenario [probe:
 * scripts/dev/probe-h1c.ts]. Ours are FNV-1a over what they stand in front
 * of, so they are stable and differ wherever the content does.
 */
export function writeH1c(scenarioId: string, files: readonly PackFile[]): Uint8Array {
  const info = files.find((f) => f.path === 'info.xml')
  if (info === undefined) throw new Error('h1c: the scenario has no info.xml')
  const logo = files.find((f) => f.path === 'logos.png')?.data ?? new Uint8Array(0)
  const rest = new Bytes()
  const infoBin = encodeSvalNode(infoDict(new TextDecoder().decode(info.data), scenarioId))
  rest.u32(infoBin.length)
  rest.push(infoBin)
  rest.u32(logo.length)
  rest.push(logo)
  const table = packOrder(files.filter((f) => f.path !== 'logos.png'))
  rest.u32(table.length)
  for (const f of table) {
    const compiled = f.path.endsWith('.lvl')
    const data = compiled ? compileLevel(f.data) : f.data
    const packed = lz4Compress(data)
    const path = utf8(f.path)
    rest.u32(path.length)
    rest.push(path)
    rest.u8(compiled ? 3 : 1)
    rest.u32(data.length)
    rest.u32(packed.length)
    rest.push(packed)
  }
  const tail = rest.done()
  const out = new Bytes()
  out.push(utf8(H1C_MAGIC))
  out.u8(3)
  out.u32(fnv1a32(tail))
  out.push(tail)
  return out.done()
}

/**
 * The order PACKAGER lists files in: by path, byte order, with `info.xml`
 * last [VERIFIED in every pack on the dev machine, stock and generated].
 */
function packOrder(files: readonly PackFile[]): PackFile[] {
  const seen = new Set<string>()
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`h1c: ${f.path} is in the scenario twice`)
    seen.add(f.path)
  }
  const byPath = (a: PackFile, b: PackFile): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return [...files.filter((f) => f.path !== 'info.xml').sort(byPath), ...files.filter((f) => f.path === 'info.xml')]
}

/** A `.lvl` as the pack holds it: an 8-byte hash, then binary SVAL. */
export function compileLevel(text: Uint8Array): Uint8Array {
  const body = encodeSval(new TextDecoder().decode(text))
  const out = new Uint8Array(8 + body.length)
  out.set(fnv1a64(body), 0)
  out.set(body, 8)
  return out
}
