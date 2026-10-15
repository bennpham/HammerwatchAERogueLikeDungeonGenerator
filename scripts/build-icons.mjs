#!/usr/bin/env node
/**
 * Rebuild every app icon from one square source image.
 *
 *   node scripts/build-icons.mjs [build/icons/source/icon-source.png]
 *
 * Writes build/icons/icon.png (1024²), the macOS iconset
 * (build/icons/icon.iconset/icon_<n>x<n>[@2x].png), icon.ico (16–256, PNG
 * entries) and icon.icns (16–1024, PNG entries). Downscaling averages every
 * source pixel under each target pixel, which keeps pixel art clean at small
 * sizes without blurring the large ones.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './lib/png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = path.join(ROOT, 'build/icons')
const src = process.argv[2] ?? path.join(ICONS, 'source/icon-source.png')

const image = decodePng(fs.readFileSync(src))
if (image.width !== image.height) throw new Error(`the source must be square (${image.width}x${image.height})`)

/** Area-average downscale (or nearest upscale) of a square RGBA image to n×n. */
function resize(img, n) {
  const out = Buffer.alloc(n * n * 4)
  const scale = img.width / n
  for (let y = 0; y < n; y++) {
    const y0 = Math.floor(y * scale)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale))
    for (let x = 0; x < n; x++) {
      const x0 = Math.floor(x * scale)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale))
      const sum = [0, 0, 0, 0]
      let count = 0
      for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
        for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
          const i = (sx + sy * img.width) * 4
          const a = img.data[i + 3]
          // weight colour by alpha so transparent edges do not darken
          sum[0] += img.data[i] * a
          sum[1] += img.data[i + 1] * a
          sum[2] += img.data[i + 2] * a
          sum[3] += a
          count++
        }
      }
      const o = (x + y * n) * 4
      out[o] = sum[3] > 0 ? Math.round(sum[0] / sum[3]) : 0
      out[o + 1] = sum[3] > 0 ? Math.round(sum[1] / sum[3]) : 0
      out[o + 2] = sum[3] > 0 ? Math.round(sum[2] / sum[3]) : 0
      out[o + 3] = Math.round(sum[3] / count)
    }
  }
  return { width: n, height: n, data: out }
}

const pngs = new Map()
const pngOf = (n) => {
  if (!pngs.has(n)) pngs.set(n, encodePng(resize(image, n)))
  return pngs.get(n)
}

// icon.png for electron-builder (it wants at least 512²)
fs.writeFileSync(path.join(ICONS, 'icon.png'), pngOf(1024))

// macOS iconset
const iconset = path.join(ICONS, 'icon.iconset')
fs.mkdirSync(iconset, { recursive: true })
for (const n of [16, 32, 128, 256, 512]) {
  fs.writeFileSync(path.join(iconset, `icon_${n}x${n}.png`), pngOf(n))
  fs.writeFileSync(path.join(iconset, `icon_${n}x${n}@2x.png`), pngOf(n * 2))
}

// Windows .ico: a directory of PNG entries (Vista+); 256 is stored as 0
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
const dir = Buffer.alloc(16 * icoSizes.length)
let offset = 6 + dir.length
const bodies = []
icoSizes.forEach((n, i) => {
  const png = pngOf(n)
  const e = i * 16
  dir.writeUInt8(n >= 256 ? 0 : n, e)
  dir.writeUInt8(n >= 256 ? 0 : n, e + 1)
  dir.writeUInt8(0, e + 2)
  dir.writeUInt8(0, e + 3)
  dir.writeUInt16LE(1, e + 4)
  dir.writeUInt16LE(32, e + 6)
  dir.writeUInt32LE(png.length, e + 8)
  dir.writeUInt32LE(offset, e + 12)
  offset += png.length
  bodies.push(png)
})
fs.writeFileSync(path.join(ICONS, 'icon.ico'), Buffer.concat([header, dir, ...bodies]))

// macOS .icns: PNG-carrying element types
const icnsTypes = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024]
]
const elements = icnsTypes.map(([type, n]) => {
  const png = pngOf(n)
  const head = Buffer.alloc(8)
  head.write(type, 0, 'ascii')
  head.writeUInt32BE(png.length + 8, 4)
  return Buffer.concat([head, png])
})
const icnsBody = Buffer.concat(elements)
const icnsHead = Buffer.alloc(8)
icnsHead.write('icns', 0, 'ascii')
icnsHead.writeUInt32BE(icnsBody.length + 8, 4)
fs.writeFileSync(path.join(ICONS, 'icon.icns'), Buffer.concat([icnsHead, icnsBody]))

console.log(`icons rebuilt from ${path.relative(ROOT, src)} (${image.width}x${image.height})`)
