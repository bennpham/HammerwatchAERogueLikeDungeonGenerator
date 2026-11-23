/**
 * Read AE's packs: a packed scenario (`<AE>/scenarios/<id>.h1c`, magic `HW1S`)
 * and the game's own assets (`<AE>/res/assets.bin`, magic `HW1R`). Binary SVAL
 * files come back as the text SVAL the editor writes. Pure: no fs.
 *
 * Nothing in AE unpacks a `.h1c`, and survival ships only packed (no
 * `scenarios/survival/` folder). The `.h1c` layout, all little-endian:
 *
 *   "HW1S", u8 version (3), u32 hash, u32 info length, binary-SVAL info
 *   u32 logo length, logo PNG (0 and nothing when the scenario has none)
 *   u32 file count, then per file:
 *     u32 path length, path, u8 flag, u32 raw size, u32 packed size, data
 *
 * `assets.bin` is "HW1R", u8 version (3), u32 hash, u32 0, u32 file count and
 * the same file entries. Its last entries are the FMOD banks, which sit
 * beside it in `res/assets/sound/`: flag 0xff and raw size 0xffffffff, with no
 * packed size and no data.
 *
 * Data is an LZ4 block of `packed size` bytes, or stored raw when the packed
 * size is 0. A compiled file (`.lvl`, textures) has flag 3, any other flag 1.
 * A compiled `.lvl` is an 8-byte hash and then binary SVAL.
 *
 * Binary SVAL: a type byte, then the value.
 *
 *   0 null; 1 array (u32 n, n typed values); 2 dict (u32 n, n × key\0 typed
 *   value); 3 bool (u8); 4 float; 5 int (i32); 6 string\0; 7 bytes (u32 n, n
 *   bytes); 8/9/10 vec2/vec3/vec4 (floats).
 *   Compact forms with no or fewer payload bytes: `e` (0x65) empty array, `g`
 *   true, `h` false, `i` float 0, `n` int 0, `x` empty string; 0x7a–0x82 a vecN with only
 *   its first k floats stored, the rest 0 (vec2 k 0–1, vec3 k 0–2, vec4 k 0–3,
 *   in that order); 0x8c a vec2 whose two components are equal, stored once.
 *
 * [VERIFIED] every level of castle_hammerwatch, shaftlocke_tower and sun_temple
 * `.h1c` decodes to the same tree as the editor-saved copy in
 * `scenarios/<id>/levels/` (tests/h1c.test.ts).
 */

export interface H1cFile {
  flag: number
  data: Uint8Array
}

export interface H1c {
  version: number
  /** the header's u32 hash */
  hash: number
  /** the scenario's info, as text SVAL */
  info: string
  /** the info as stored: binary SVAL */
  infoBinary: Uint8Array
  logo: Uint8Array
  /** in pack order */
  files: Map<string, H1cFile>
}

export const H1C_MAGIC = 'HW1S'
export const ASSETS_MAGIC = 'HW1R'

/** flag of an entry whose data lives outside the pack (assets.bin's sound banks) */
export const EXTERNAL_FLAG = 0xff
const EXTERNAL_SIZE = 0xffffffff

export function readH1c(buf: Uint8Array): H1c {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== H1C_MAGIC) throw new Error('h1c: no HW1S header')
  const version = buf[4]
  const hash = view.getUint32(5, true)
  let o = 9
  const u32 = (): number => {
    const v = view.getUint32(o, true)
    o += 4
    return v
  }
  const infoLen = u32()
  const infoBinary = buf.slice(o, o + infoLen)
  const info = binarySvalToText(infoBinary)
  o += infoLen
  const logoLen = u32()
  const logo = buf.slice(o, o + logoLen)
  o += logoLen
  const count = u32()
  const files = new Map<string, H1cFile>()
  for (let i = 0; i < count; i++) {
    const entry = readEntryHeader((at, len) => buf.subarray(at, at + len), o)
    o = entry.next
    files.set(entry.path, { flag: entry.flag, data: entryData(entry, (at, len) => buf.subarray(at, at + len)) })
  }
  if (o !== buf.length) throw new Error(`h1c: ${buf.length - o} bytes past the last file`)
  return { version, hash, info, infoBinary, logo, files }
}

/** One file's place in a pack, without its data. */
export interface PackEntry {
  path: string
  flag: number
  raw: number
  /** 0 when stored raw */
  packed: number
  /** where the data starts */
  offset: number
  /** where the next entry starts */
  next: number
}

/** Bytes `[offset, offset + length)` of a pack, from memory or a file. */
export type ReadAt = (offset: number, length: number) => Uint8Array

/** u32 at `at` in `b`; a Node Buffer's slice() shares memory, so never go through `.buffer` alone */
function u32Of(b: Uint8Array, at: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true)
}

function readEntryHeader(readAt: ReadAt, at: number): PackEntry {
  const u32At = (p: number): number => u32Of(readAt(p, 4), 0)
  const pathLen = u32At(at)
  if (pathLen === 0 || pathLen > 4096) throw new Error(`pack: bad path length ${pathLen} at byte ${at}`)
  const head = readAt(at + 4, pathLen + 5)
  const path = new TextDecoder().decode(head.subarray(0, pathLen))
  const flag = head[pathLen]
  const raw = u32Of(head, pathLen + 1)
  if (flag === EXTERNAL_FLAG && raw === EXTERNAL_SIZE) {
    const offset = at + 4 + pathLen + 5
    return { path, flag, raw: 0, packed: 0, offset, next: offset }
  }
  const packed = u32At(at + 4 + pathLen + 5)
  const offset = at + 4 + pathLen + 9
  return { path, flag, raw, packed, offset, next: offset + (packed > 0 ? packed : raw) }
}

/** An entry's bytes, LZ4-decoded when packed. */
export function entryData(entry: PackEntry, readAt: ReadAt): Uint8Array {
  if (entry.packed > 0) return lz4Block(readAt(entry.offset, entry.packed), entry.raw)
  return readAt(entry.offset, entry.raw).slice()
}

/**
 * The file table of an `HW1R` pack (`res/assets.bin`), read entry by entry
 * through `readAt` so the 60+ MB pack never has to be in memory. `size` is
 * the pack's length; the walk must end exactly there.
 */
export function readHw1rIndex(readAt: ReadAt, size: number): Map<string, PackEntry> {
  const head = readAt(0, 17)
  if (new TextDecoder().decode(head.subarray(0, 4)) !== ASSETS_MAGIC) throw new Error('assets: no HW1R header')
  const count = u32Of(head, 13)
  const entries = new Map<string, PackEntry>()
  let o = 17
  for (let i = 0; i < count; i++) {
    const entry = readEntryHeader(readAt, o)
    entries.set(entry.path, entry)
    o = entry.next
  }
  if (o !== size) throw new Error(`assets: ${size - o} bytes past the last file`)
  return entries
}

/** A compiled level's text SVAL: the 8-byte hash skipped. */
export function levelText(file: H1cFile): string {
  return binarySvalToText(file.data.subarray(8))
}

/** Decode one LZ4 block (no frame) into `rawLen` bytes. */
export function lz4Block(src: Uint8Array, rawLen: number): Uint8Array {
  const out = new Uint8Array(rawLen)
  let i = 0
  let j = 0
  const length = (n: number): number => {
    if (n !== 15) return n
    let b: number
    do {
      b = src[i++]
      n += b
    } while (b === 255)
    return n
  }
  while (i < src.length) {
    const token = src[i++]
    const literals = length(token >> 4)
    out.set(src.subarray(i, i + literals), j)
    i += literals
    j += literals
    if (i >= src.length) break
    const offset = src[i] | (src[i + 1] << 8)
    i += 2
    const match = length(token & 15) + 4
    if (offset === 0 || offset > j) throw new Error('lz4: bad match offset')
    for (let k = 0; k < match; k++, j++) out[j] = out[j - offset]
  }
  if (j !== rawLen) throw new Error(`lz4: decoded ${j} bytes, expected ${rawLen}`)
  return out
}

/** vecN with only its first `stored` floats in the file, by type byte */
export const VECTORS: Record<number, [tag: string, size: number, stored: number]> = {
  0x08: ['vec2', 2, 2],
  0x09: ['vec3', 3, 3],
  0x0a: ['vec4', 4, 4],
  0x7a: ['vec2', 2, 0],
  0x7b: ['vec2', 2, 1],
  0x7c: ['vec3', 3, 0],
  0x7d: ['vec3', 3, 1],
  0x7e: ['vec3', 3, 2],
  0x7f: ['vec4', 4, 0],
  0x80: ['vec4', 4, 1],
  0x81: ['vec4', 4, 2],
  0x82: ['vec4', 4, 3]
}

/** Binary SVAL to text SVAL, one element per line, tab-indented as the editor writes it. */
export function binarySvalToText(buf: Uint8Array): string {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const utf8 = new TextDecoder()
  const lines: string[] = []
  let i = 0
  const cstr = (): string => {
    const end = buf.indexOf(0, i)
    if (end < 0) throw new Error('sval: unterminated string')
    const s = utf8.decode(buf.subarray(i, end))
    i = end + 1
    return s
  }
  const f32 = (): number => {
    const v = view.getFloat32(i, true)
    i += 4
    return v
  }
  const value = (depth: number, name: string | undefined): void => {
    const type = buf[i++]
    const pad = '\t'.repeat(depth)
    const attr = name === undefined ? '' : ` name="${escapeXml(name)}"`
    const scalar = (tag: string, text: string): void => {
      lines.push(`${pad}<${tag}${attr}>${text}</${tag}>`)
    }
    const vec = VECTORS[type]
    if (vec !== undefined) {
      const [tag, size, stored] = vec
      const v: number[] = []
      for (let k = 0; k < size; k++) v.push(k < stored ? f32() : 0)
      scalar(tag, v.map(fmtFloat).join(' '))
      return
    }
    switch (type) {
      case 0x00:
        lines.push(`${pad}<null${attr}/>`)
        return
      case 0x01:
      case 0x02: {
        const tag = type === 0x01 ? 'array' : 'dict'
        const n = view.getUint32(i, true)
        i += 4
        lines.push(`${pad}<${tag}${attr}>`)
        for (let k = 0; k < n; k++) value(depth + 1, type === 0x02 ? cstr() : undefined)
        lines.push(`${pad}</${tag}>`)
        return
      }
      case 0x65:
        lines.push(`${pad}<array${attr}></array>`)
        return
      case 0x03:
        scalar('bool', buf[i++] !== 0 ? 't' : 'f')
        return
      case 0x67:
        scalar('bool', 't')
        return
      case 0x68:
        scalar('bool', 'f')
        return
      case 0x04:
        scalar('float', fmtFloat(f32()))
        return
      case 0x69:
        scalar('float', '0')
        return
      case 0x05:
        scalar('int', String(view.getInt32(i, true)))
        i += 4
        return
      case 0x6e:
        scalar('int', '0')
        return
      case 0x06:
        scalar('string', escapeXml(cstr()))
        return
      case 0x78:
        scalar('string', '')
        return
      case 0x07: {
        const n = view.getUint32(i, true)
        i += 4
        scalar('bytes', hex(buf.subarray(i, i + n)))
        i += n
        return
      }
      case 0x8c: {
        const v = fmtFloat(f32())
        scalar('vec2', `${v} ${v}`)
        return
      }
      default:
        throw new Error(`sval: unknown type 0x${type.toString(16)} at byte ${i - 1}`)
    }
  }
  value(0, undefined)
  if (i !== buf.length) throw new Error(`sval: ${buf.length - i} bytes after the root value`)
  return lines.join('\n') + '\n'
}

/** The shortest decimal that reads back as the same 32-bit float. */
function fmtFloat(v: number): string {
  if (Number.isInteger(v)) return String(v)
  for (let p = 1; p < 9; p++) {
    const s = String(Number(v.toPrecision(p)))
    if (Math.fround(Number(s)) === v) return s
  }
  return String(v)
}

function hex(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
