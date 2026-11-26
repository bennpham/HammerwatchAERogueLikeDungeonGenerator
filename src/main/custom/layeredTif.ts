/**
 * Hammerwatch 2's layered sprite sheets (experimental "Load custom").
 *
 * HW2 draws most actors from an uncompressed `.tif` (TinyTIFFWriter) with 4 +
 * N channels a pixel: RGBA, then one mask per `colorize` slot of the unit
 * (`<i>0</i><a><s>#dark</s><s>#mid</s><s>#light</s></a>`). A masked pixel's
 * grey level picks a colour along that slot's three, blended in linear light.
 * AE reads a different layout (its own sheets carry 2 extra channels), so a
 * scenario can't ship these as they are: the troll drew wrong, the grey wolf
 * failed to load. Most sheets sit beside a `.png` HW2 baked itself; for the
 * rest, `bakeLayeredTif` bakes one the same way (within a few levels of HW2's
 * own: checked against troll_brute.png).
 */
import { deflateSync } from 'node:zlib'

export interface LayeredTif {
  width: number
  height: number
  /** channels a pixel: 4 colour + one mask per colorize slot */
  channels: number
  pixels: Uint8Array
}

/** Three colours per slot index, as RGB. */
export type Colorize = ReadonlyMap<number, readonly (readonly number[])[]>

/** A plain uncompressed, 8-bit, single-strip, interleaved TIFF with more than 4 channels; null otherwise. */
export function readLayeredTif(data: Uint8Array): LayeredTif | null {
  if (data.length < 8) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const le = data[0] === 0x49 && data[1] === 0x49
  if (!le && !(data[0] === 0x4d && data[1] === 0x4d)) return null
  const u16 = (o: number): number => view.getUint16(o, le)
  const u32 = (o: number): number => view.getUint32(o, le)
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  if (ifd + 2 > data.length) return null
  const count = u16(ifd)
  const tags = new Map<number, number>()
  for (let i = 0; i < count && i < 64; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > data.length) return null
    const type = u16(e + 2)
    const n = u32(e + 4)
    // single values only: SHORT sits in the first two bytes, LONG in all four
    tags.set(u16(e), n === 1 && type === 3 ? u16(e + 8) : u32(e + 8))
  }
  const width = tags.get(256) ?? 0
  const height = tags.get(257) ?? 0
  const channels = tags.get(277) ?? 0
  const offset = tags.get(273) ?? 0
  const compression = tags.get(259) ?? 1
  const planar = tags.get(284) ?? 1
  if (width <= 0 || height <= 0 || channels <= 4 || compression !== 1 || planar !== 1) return null
  if (width > 8192 || height > 8192) return null
  const size = width * height * channels
  if (offset + size > data.length) return null
  return { width, height, channels, pixels: data.subarray(offset, offset + size) }
}

const HEX = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i

/** The unit's `colorize` array: slot → its three colours. Empty when it has none. */
export function parseColorize(unitText: string): Map<number, number[][]> {
  const out = new Map<number, number[][]>()
  const arr = /<array name="colorize">([\s\S]*?)<\/array>/.exec(unitText)
  if (arr === null) return out
  for (const m of arr[1].matchAll(/<i>(\d+)<\/i>\s*<a>((?:\s*<s>[^<]*<\/s>)+)\s*<\/a>/g)) {
    const colours: number[][] = []
    for (const s of m[2].matchAll(/<s>([^<]*)<\/s>/g)) {
      const h = HEX.exec(s[1].trim())
      if (h === null) break
      const v = parseInt(h[1], 16)
      colours.push([(v >> 16) & 255, (v >> 8) & 255, v & 255])
    }
    if (colours.length === 3) out.set(Number(m[1]), colours)
  }
  return out
}

function toLinear(s: number): number {
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** RGBA with each masked pixel tinted by its slot; slots the unit doesn't define keep their grey. */
export function bakeLayeredTif(tif: LayeredTif, colorize: Colorize): Uint8Array {
  const { width, height, channels, pixels } = tif
  const out = new Uint8Array(width * height * 4)
  const linear = new Float64Array(256)
  for (let g = 0; g < 256; g++) linear[g] = toLinear(g / 255)
  for (let p = 0; p < width * height; p++) {
    const at = p * channels
    let r = pixels[at]
    let g = pixels[at + 1]
    let b = pixels[at + 2]
    for (let j = 4; j < channels; j++) {
      const w = pixels[at + j] / 255
      const c = w > 0 ? colorize.get(j - 4) : undefined
      if (c === undefined) continue
      const t = linear[pixels[at]]
      const [lo, hi, f] = t < 0.5 ? [c[0], c[1], t * 2] : [c[1], c[2], t * 2 - 1]
      r = r * (1 - w) + (lo[0] + (hi[0] - lo[0]) * f) * w
      g = g * (1 - w) + (lo[1] + (hi[1] - lo[1]) * f) * w
      b = b * (1 - w) + (lo[2] + (hi[2] - lo[2]) * f) * w
    }
    out[p * 4] = Math.round(r)
    out[p * 4 + 1] = Math.round(g)
    out[p * 4 + 2] = Math.round(b)
    out[p * 4 + 3] = pixels[at + 3]
  }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** An 8-bit RGBA PNG (no filtering), byte-for-byte the same for the same pixels. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width)
  v.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const rows = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(rows, { level: 9 }))),
    chunk('IEND', new Uint8Array(0))
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
