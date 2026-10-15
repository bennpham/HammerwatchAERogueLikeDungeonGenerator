// Minimal PNG codec for the dev tools (render-level, calibrate-walls).
// Decodes 8-bit non-interlaced PNGs of colour types 0, 2, 3, 4, 6 (with tRNS
// for palette images) into RGBA; encodes RGBA. No dependencies beyond zlib.
import zlib from 'node:zlib'

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG')
  let pos = 8
  let width = 0, height = 0, depth = 0, ctype = 0, interlace = 0
  let palette = null, trns = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      depth = data[8]; ctype = data[9]; interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG depth ${depth} interlace ${interlace}`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype]
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      line[i] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const s = x * channels
      if (ctype === 6) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = line[s + 3] }
      else if (ctype === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255 }
      else if (ctype === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255 }
      else if (ctype === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1] }
      else if (ctype === 3) {
        const idx = line[s]
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2]
        out[o + 3] = trns !== null && idx < trns.length ? trns[idx] : 255
      }
    }
    prev = line
  }
  return { width, height, data: out }
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

export function blankImage(width, height, rgba = [0, 0, 0, 255]) {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { width, height, data }
}

/** alpha-blend `src` (region sx,sy,w,h) onto `dst` at dx,dy */
export function blit(dst, src, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) {
    const ty = dy + y, fy = sy + y
    if (ty < 0 || ty >= dst.height || fy < 0 || fy >= src.height) continue
    for (let x = 0; x < w; x++) {
      const tx = dx + x, fx = sx + x
      if (tx < 0 || tx >= dst.width || fx < 0 || fx >= src.width) continue
      const so = (fy * src.width + fx) * 4, d = (ty * dst.width + tx) * 4
      const a = src.data[so + 3] / 255
      if (a === 0) continue
      for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round(src.data[so + k] * a + dst.data[d + k] * (1 - a))
      dst.data[d + 3] = 255
    }
  }
}

export function fillRect(dst, x0, y0, w, h, rgba) {
  for (let y = Math.max(0, y0); y < Math.min(dst.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(dst.width, x0 + w); x++) {
      const d = (y * dst.width + x) * 4, a = rgba[3] / 255
      for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round(rgba[k] * a + dst.data[d + k] * (1 - a))
    }
  }
}
