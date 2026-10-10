/**
 * The scenario's `logos.png` — the 128×128 picture AE's scenario list shows.
 *
 * Drawn here rather than shipped as an asset: an original emblem (nested
 * squares, a stylised dungeon map with a stairway notch) tinted from the seed,
 * so every run's icon differs a little. Encoded without zlib — stored
 * (uncompressed) deflate blocks plus CRC-32 and Adler-32 — so the generator
 * stays pure and runs in a browser as well as Node.
 */

const SIZE = 128

function crc32Table(): Uint32Array {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
}
const CRC = crc32Table()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function chunk(type: string, data: Uint8Array): number[] {
  const td = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i)
  td.set(data, 4)
  return [...u32(data.length), ...td, ...u32(crc32(td))]
}

/** zlib stream of stored blocks (max 65535 bytes each). */
function storedZlib(raw: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01]
  for (let pos = 0; pos < raw.length; pos += 65535) {
    const len = Math.min(65535, raw.length - pos)
    const final = pos + len >= raw.length ? 1 : 0
    out.push(final, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255)
    for (let i = 0; i < len; i++) out.push(raw[pos + i])
  }
  out.push(...u32(adler32(raw)))
  return Uint8Array.from(out)
}

export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const ihdr = Uint8Array.from([...u32(width), ...u32(height), 8, 6, 0, 0, 0])
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', storedZlib(raw)),
    ...chunk('IEND', new Uint8Array(0))
  ])
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    s += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return s
}

/** The seed-tinted emblem as RGBA. Pure function of `seed`. */
export function logoPixels(seed: number): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4)
  const hue = ((seed >>> 0) % 360) / 360
  const accent = hsl(hue, 0.55, 0.55)
  const dim = hsl(hue, 0.35, 0.28)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4
      // ring index: distance to the edge in 12-px bands
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y)
      const band = Math.trunc(edge / 12)
      let c: [number, number, number] = [18, 16, 24]
      if (edge >= 6 && edge % 12 < 3) c = band % 2 === 0 ? accent : dim
      // a stairway notch cut into the rings at the bottom centre
      if (y > SIZE - 46 && Math.abs(x - SIZE / 2) < 10) c = [18, 16, 24]
      if (y > SIZE - 46 && Math.abs(x - SIZE / 2) < 8 && (SIZE - y) % 8 < 3) c = accent
      // the core: a solid block, the boss at the heart of the map
      if (edge >= 54) c = accent
      px[o] = c[0]
      px[o + 1] = c[1]
      px[o + 2] = c[2]
      px[o + 3] = 255
    }
  }
  return px
}

export function scenarioLogoBase64(seed: number): string {
  return toBase64(encodePngRgba(SIZE, SIZE, logoPixels(seed)))
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}
