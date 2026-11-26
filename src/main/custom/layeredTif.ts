/**
 * Hammerwatch 2's tinted sprite sheets (experimental "Load custom").
 *
 * HW2 draws most actors from a `.tif` whose pixels either carry their own
 * colour or take one from the unit's `colorize` slots
 * (`<i>0</i><a><s>#dark</s><s>#mid</s><s>#light</s></a>`): a tinted pixel's
 * grey tone, in linear light, picks a colour along its slot's three. AE reads
 * neither of HW2's forms of these sheets (the troll drew wrong, the grey wolf
 * failed to load), so a scenario carries a `.png` with the tint baked in:
 * HW2's own `.png` beside the sheet when there is one, else one baked here.
 *
 * The sheet comes in two forms, both read here:
 *   - PACKED, in HW2's `res/assets.bin` (every install has it): a 12-byte
 *     header (width, height, slot count; u32 LE), then 4 bytes a pixel. The
 *     last byte's top bit marks a tinted pixel; its low 7 bits are alpha / 2
 *     (127 is opaque). A tinted pixel is (tone, slot, 0, ·); a plain one is
 *     its RGB in linear light. Read against HW2's own unpacked sheets.
 *   - RAW, in an unpacked extract (`unpacked_assets_*`, from HW2's
 *     PACKAGER.exe): an uncompressed TIFF of RGBA plus one mask channel per
 *     slot, the tone being the sRGB grey of the colour channels.
 * Baked, the troll matches HW2's own troll_brute.png within a few levels.
 */
import { deflateSync } from 'node:zlib'

/** A sheet read from either form: plain pixels' colour (sRGB) and every pixel's alpha, with each tinted pixel's slot and tone. */
export interface TintSheet {
  width: number
  height: number
  /** sRGB colour for plain pixels (ignored for tinted ones), and alpha for all */
  rgba: Uint8Array
  /** the colorize slot of a tinted pixel, -1 for a plain one */
  slot: Int8Array
  /** a tinted pixel's tone in linear light, 0–1 */
  tone: Float32Array
}

/** Three colours per slot index, as RGB. */
export type Colorize = ReadonlyMap<number, readonly (readonly number[])[]>

/** Bounds a sheet's size against a corrupt header. */
const MAX_SIDE = 8192

function toLinear(s: number): number {
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function toSrgb(l: number): number {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
}

function emptySheet(width: number, height: number): TintSheet {
  const n = width * height
  return { width, height, rgba: new Uint8Array(n * 4), slot: new Int8Array(n).fill(-1), tone: new Float32Array(n) }
}

/** HW2's packed sheet (an `assets.bin` entry); null if it isn't one. */
export function readPackedTif(data: Uint8Array): TintSheet | null {
  if (data.length < 12) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(0, true)
  const height = view.getUint32(4, true)
  const slots = view.getUint32(8, true)
  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE || slots > 64) return null
  if (data.length !== 12 + width * height * 4) return null
  const sheet = emptySheet(width, height)
  const srgb = new Uint8Array(256)
  for (let v = 0; v < 256; v++) srgb[v] = Math.round(toSrgb(v / 255) * 255)
  for (let p = 0; p < width * height; p++) {
    const at = 12 + p * 4
    const last = data[at + 3]
    const a7 = last & 127
    sheet.rgba[p * 4 + 3] = a7 === 127 ? 255 : a7 * 2
    if (last & 128) {
      sheet.slot[p] = data[at + 1]
      sheet.tone[p] = data[at] / 255
    } else {
      sheet.rgba[p * 4] = srgb[data[at]]
      sheet.rgba[p * 4 + 1] = srgb[data[at + 1]]
      sheet.rgba[p * 4 + 2] = srgb[data[at + 2]]
    }
  }
  return sheet
}

/** An unpacked sheet: an uncompressed, 8-bit, single-strip, interleaved TIFF with more than 4 channels; null otherwise. */
export function readLayeredTif(data: Uint8Array): TintSheet | null {
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
  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) return null
  if (channels <= 4 || (tags.get(259) ?? 1) !== 1 || (tags.get(284) ?? 1) !== 1) return null
  if (offset + width * height * channels > data.length) return null
  const sheet = emptySheet(width, height)
  const linear = new Float32Array(256)
  for (let v = 0; v < 256; v++) linear[v] = toLinear(v / 255)
  for (let p = 0; p < width * height; p++) {
    const at = offset + p * channels
    sheet.rgba.set(data.subarray(at, at + 4), p * 4)
    // the strongest mask, if any, is the pixel's slot
    let best = 0
    for (let j = 4; j < channels; j++) {
      if (data[at + j] > best) {
        best = data[at + j]
        sheet.slot[p] = j - 4
      }
    }
    if (best > 0) sheet.tone[p] = linear[data[at]]
  }
  return sheet
}

/** A sheet from an asset file: packed (flag 3, from a pack) or raw (an unpacked `.tif`). */
export function readTintSheet(file: { flag: number; data: Uint8Array }): TintSheet | null {
  return file.flag === 3 ? readPackedTif(file.data) : readLayeredTif(file.data)
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

/** RGBA with each tinted pixel coloured from its slot; a slot the unit doesn't define keeps its grey tone. */
export function bakeTintSheet(sheet: TintSheet, colorize: Colorize): Uint8Array {
  const { width, height, rgba, slot, tone } = sheet
  const out = new Uint8Array(rgba)
  for (let p = 0; p < width * height; p++) {
    if (slot[p] < 0) continue
    const t = tone[p]
    const c = colorize.get(slot[p])
    if (c === undefined) {
      const g = Math.round(toSrgb(t) * 255)
      out.set([g, g, g], p * 4)
      continue
    }
    const [lo, hi, f] = t < 0.5 ? [c[0], c[1], t * 2] : [c[1], c[2], t * 2 - 1]
    for (let k = 0; k < 3; k++) out[p * 4 + k] = Math.round(lo[k] + (hi[k] - lo[k]) * f)
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
