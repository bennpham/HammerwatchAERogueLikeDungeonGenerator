#!/usr/bin/env node
// Render an AE .lvl to a PNG for eyeballing wall placement — stock levels and
// generated ones alike, with the same code, so the two can be compared.
//
//   node scripts/render-level.mjs <level.lvl> <out.png> [--crop x y w h] [--collision] [--scale n]
//
// Floors are flat colours per tileset (not textures); units are drawn from
// their default scene's sprites, sorted by layer then y like the engine does.
// --collision overlays every static collision rect in red so footprints can be
// checked against the art.
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, blankImage, blit, fillRect } from './lib/png.mjs'
import { findAeAssets, loadUnit } from './lib/aeunit.mjs'

const args = process.argv.slice(2)
const [lvlPath, outPath] = args
if (!lvlPath || !outPath) {
  console.error('usage: render-level.mjs <level.lvl> <out.png> [--crop x y w h] [--collision] [--scale n]')
  process.exit(1)
}
const flag = (n) => args.indexOf(n)
const { assets } = findAeAssets()
if (!assets) { console.error('AE assets not found; set HWAE_ROOT'); process.exit(1) }

const text = fs.readFileSync(lvlPath, 'utf8')
const units = []
const usec = text.slice(text.indexOf('<dict name="units">'), text.indexOf('<array name="scripts">'))
for (const g of usec.matchAll(/<array name="([^"]+)">([\s\S]*?)\n\t\t<\/array>/g)) {
  for (const p of g[2].matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>\s*<int>(\d+)<\/int>/g)) units.push({ path: g[1], x: +p[1], y: +p[2], id: +p[3] })
}
const tiles = []
const tsec = text.slice(text.indexOf('<array name="tiles">'), text.indexOf('<dict name="units">'))
const sizeCache = new Map()
const tsSize = (ts) => {
  if (!sizeCache.has(ts)) {
    let s = 16
    try { const m = /size="(\d+)"/.exec(fs.readFileSync(path.join(assets, ts), 'utf8')); if (m) s = +m[1] } catch {}
    sizeCache.set(ts, s)
  }
  return sizeCache.get(ts)
}
for (const ch of tsec.matchAll(/<vec2 name="pos">(-?\d+) (-?\d+)<\/vec2>\s*<array name="datasets">([\s\S]*?)<\/array>/g)) {
  const cx = +ch[1] - 256, cy = +ch[2] - 256
  for (const ds of ch[3].matchAll(/<string name="tileset">([^<]+)<\/string>\s*<bytes name="data-rle">([0-9a-f]*)<\/bytes>/g)) {
    const ts = ds[1]
    if (/minimap|_dummy|______/.test(ts)) continue
    const size = tsSize(ts), n = 512 / size
    let idx = 0
    for (let i = 0; i < ds[2].length; i += 2) {
      const b = parseInt(ds[2].slice(i, i + 2), 16), run = b < 128 ? b : 256 - b
      if (b < 128) for (let k = 0; k < run; k++) { const c = idx + k; tiles.push({ ts, x: cx + (c % n) * size, y: cy + Math.floor(c / n) * size, size }) }
      idx += run
    }
  }
}

let x0, y0, W, H
const ci = flag('--crop')
if (ci >= 0) [x0, y0, W, H] = args.slice(ci + 1, ci + 5).map(Number)
else {
  const xs = units.map((u) => u.x), ys = units.map((u) => u.y)
  x0 = Math.min(...xs) - 64; y0 = Math.min(...ys) - 96; W = Math.max(...xs) - x0 + 128; H = Math.max(...ys) - y0 + 128
}
const img = blankImage(W, H, [12, 10, 16, 255])
const color = (ts) => {
  if (ts.includes('__black')) return [0, 0, 0, 255]
  let h = 0
  for (const c of ts) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return [70 + (h % 60), 70 + ((h >> 8) % 60), 60 + ((h >> 16) % 50), 255]
}
for (const t of tiles) fillRect(img, t.x - x0, t.y - y0, t.size, t.size, color(t.ts))

const texCache = new Map()
const tex = (p) => {
  if (!texCache.has(p)) {
    try { texCache.set(p, decodePng(fs.readFileSync(path.join(assets, p)))) } catch { texCache.set(p, null) }
  }
  return texCache.get(p)
}
const draws = []
for (const u of units) {
  if (u.path.startsWith(':') || u.path.startsWith('effects/')) continue
  if (u.x < x0 - 128 || u.x > x0 + W + 128 || u.y < y0 - 128 || u.y > y0 + H + 160) continue
  const def = loadUnit(assets, u.path)
  for (const s of def.sprites) {
    if (s.texture.includes('minimap') || s.texture.includes('light') || s.texture.includes('__guide') || s.material.includes('bright')) continue
    const floorish = s.material.includes(':floor') || s.layer < 0
    draws.push({ u, s, key: floorish ? -1e9 + s.layer : def.unitLayer * 1e6 + s.layer * 1e5 + u.y })
  }
}
draws.sort((a, b) => a.key - b.key)
for (const { u, s } of draws) {
  const t = tex(s.texture)
  if (!t) continue
  const [fx, fy, fw, fh] = s.frame
  blit(img, t, fx, fy, fw, fh, Math.round(u.x - s.ox - x0), Math.round(u.y - s.oy - y0))
}
if (flag('--collision') >= 0) {
  for (const u of units) {
    if (u.path.startsWith(':')) continue
    for (const [rx, ry, rw, rh] of loadUnit(assets, u.path).rects) fillRect(img, Math.round(u.x + rx - x0), Math.round(u.y + ry - y0), rw, rh, [255, 0, 0, 70])
  }
}
let out = img
const si = flag('--scale')
if (si >= 0) {
  const k = Number(args[si + 1])
  out = blankImage(W * k, H * k)
  for (let y = 0; y < H * k; y++) for (let x = 0; x < W * k; x++) img.data.copy(out.data, (y * W * k + x) * 4, (Math.floor(y / k) * W + Math.floor(x / k)) * 4, (Math.floor(y / k) * W + Math.floor(x / k)) * 4 + 4)
}
fs.writeFileSync(outPath, encodePng(out))
console.log(`wrote ${outPath} (${out.width}x${out.height}), ${units.length} units, ${tiles.length} tiles`)
