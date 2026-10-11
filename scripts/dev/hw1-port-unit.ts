// Ports one AE unit (one scene, one rotation) to an OG Hammerwatch (HW1)
// doodad: every sprite of the scene, nested and cross-file `<scene src>`
// included, is composited into one PNG strip (one cell per animation frame),
// and the collision rects and circles become HW1 polygons and circles. Used by
// hw1-lobby-from-ae.ts for the furniture and decor HW1 has no counterpart for.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { preprocess } from '../lib/aeunit.mjs'
import { decodePng, encodePng } from '../lib/png.mjs'

interface Img {
  width: number
  height: number
  data: Buffer
}
interface El {
  tag: string
  attrs: Record<string, string>
  children: El[]
  text: string
}

function parseXml(text: string): El {
  const root: El = { tag: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<(\/?)([\w.:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    stack[stack.length - 1].text += text.slice(last, m.index)
    last = re.lastIndex
    if (m[2] === undefined) continue
    if (m[1] === '/') {
      if (stack.length > 1) stack.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of (m[3] ?? '').matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2]
    const el: El = { tag: m[2], attrs, children: [], text: '' }
    stack[stack.length - 1].children.push(el)
    if (m[4] !== '/') stack.push(el)
  }
  return root
}

const nums = (s: string | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).map(Number)

interface Sprite {
  texture: string
  x: number // top-left of the frame, relative to the unit position
  y: number
  frames: Array<{ rect: number[]; time: number }>
  layer: number
  floor: boolean
  bright: boolean
}
export interface Ported {
  /** one frame's size; the PNG is `frames` cells wide */
  width: number
  height: number
  /** the unit position inside a frame */
  originX: number
  originY: number
  times: number[]
  png: Buffer
  polygons: Array<Array<[number, number]>>
  circles: Array<{ x: number; y: number; r: number }>
  /** every sprite is floor art (carpets and the like) */
  floor: boolean
  unitLayer: number
  /** where a light belongs (a candle flame, a fire), unit-relative */
  light: { x: number; y: number; small: boolean } | null
  scene: string
}

interface UnitFile {
  dir: string
  unit: El
  scenes: El
  byName: Map<string, El>
}
const files = new Map<string, UnitFile | null>()
function loadFile(assets: string, rel: string): UnitFile | null {
  if (!files.has(rel)) {
    const root = parseXml(preprocess(assets, rel))
    const unit = root.children.find((c) => c.tag === 'unit' || c.tag === 'effect')
    const scenes = unit?.children.find((c) => c.tag === 'scenes')
    if (unit === undefined) files.set(rel, null)
    else {
      const byName = new Map<string, El>()
      for (const s of scenes?.children ?? []) if (s.tag === 'scene' && s.attrs.name !== undefined) byName.set(s.attrs.name, s)
      files.set(rel, { dir: path.posix.dirname(rel), unit, scenes: scenes ?? { tag: 'scenes', attrs: {}, children: [], text: '' }, byName })
    }
  }
  return files.get(rel) ?? null
}

/** The scene the game shows with no scene chosen: `on` if there is one, else the first one `<scenes>` lists. */
export function defaultScene(assets: string, unitPath: string): string | null {
  const f = loadFile(assets, unitPath)
  if (f === null) return null
  const a = f.scenes.attrs
  const first = a.on ?? Object.values(a)[0]
  if (first !== undefined && f.byName.has(first)) return first
  const s = f.scenes.children.find((c) => c.tag === 'scene' && c.attrs.name === undefined) ?? f.scenes.children.find((c) => c.tag === 'scene' && !/shared/.test(c.attrs.name ?? ''))
  return s?.attrs.name ?? ''
}

const rel = (dir: string, p: string) => (p.startsWith('./') || p.startsWith('../') ? path.posix.normalize(path.posix.join(dir, p)) : p)

interface Collected {
  sprites: Sprite[]
  rects: number[][]
  circles: Array<{ x: number; y: number; r: number }>
  lights: Array<{ x: number; y: number; small: boolean }>
}

function collect(assets: string, f: UnitFile, scene: El, dx: number, dy: number, out: Collected, depth: number): void {
  if (depth > 8) return
  for (const c of scene.children) {
    if (c.tag === 'scene') {
      const [px, py] = c.attrs.pos !== undefined ? nums(c.attrs.pos) : [0, 0]
      const src = c.attrs.src
      if (src === undefined) {
        collect(assets, f, c, dx + px, dy + py, out, depth + 1)
        continue
      }
      const colon = src.lastIndexOf(':')
      const target = colon > 0 ? loadFile(assets, rel(f.dir, src.slice(0, colon))) : f
      const name = colon > 0 ? src.slice(colon + 1) : src
      const el = target?.byName.get(name)
      if (target !== null && el !== undefined) collect(assets, target, el, dx + px, dy + py, out, depth + 1)
    } else if (c.tag === 'sprite') {
      const texture = c.attrs.texture
      if (texture === undefined || /minimap|editor_|__guide|special\/empty|lights\//.test(texture)) continue
      const [ox, oy] = nums(c.attrs.origin ?? '0 0')
      const frames = c.children.filter((k) => k.tag === 'frame').map((k) => ({ rect: nums(k.text), time: Number(k.attrs.time ?? 100) }))
      if (frames.length === 0 || frames[0].rect.length !== 4) continue
      const material = c.attrs.material ?? ''
      if (material.endsWith(':vendoricon')) continue // the shop bubble; HW1 gets no shop here
      const layer = Number(c.attrs.layer ?? 0) + Number(c.attrs.ulayer ?? 0) / 1000
      out.sprites.push({ texture: rel(f.dir, texture), x: dx - ox, y: dy - oy, frames, layer, floor: material.endsWith(':floor') || layer < 0, bright: material.includes('bright') })
    } else if (c.tag === 'collision') {
      for (const k of c.children) {
        if (k.tag === 'rect') {
          const [x, y, w, h] = nums(k.text)
          out.rects.push([x + dx, y + dy, w, h])
        } else if (k.tag === 'circle') {
          const [ox, oy] = nums(k.attrs.offset ?? '0 0')
          out.circles.push({ x: ox + dx, y: oy + dy, r: Number(k.attrs.radius ?? 4) })
        }
      }
    } else if (c.tag === 'effect' && c.attrs.src !== undefined) {
      // an effect's plain sprites (a wick, a flame) are art too; its
      // expression-driven particles draw from special/empty and drop out
      const ef = loadFile(assets, rel(f.dir, c.attrs.src))
      if (ef !== null) collect(assets, ef, ef.unit, dx, dy, out, depth + 1)
    } else if (c.tag === 'light') {
      out.lights.push({ x: dx, y: dy, small: f.unit.tag === 'effect' })
    }
  }
}

const textures = new Map<string, Img | null>()
function texture(assets: string, p: string): Img | null {
  if (!textures.has(p)) {
    try {
      textures.set(p, decodePng(readFileSync(path.join(assets, p))) as Img)
    } catch {
      textures.set(p, null)
    }
  }
  return textures.get(p) ?? null
}

/** Porter-Duff "over" of src's region onto dst at (dx, dy). */
function over(dst: Img, src: Img, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    const ty = dy + y
    const fy = sy + y
    if (ty < 0 || ty >= dst.height || fy < 0 || fy >= src.height) continue
    for (let x = 0; x < w; x++) {
      const tx = dx + x
      const fx = sx + x
      if (tx < 0 || tx >= dst.width || fx < 0 || fx >= src.width) continue
      const s = (fy * src.width + fx) * 4
      const d = (ty * dst.width + tx) * 4
      const sa = src.data[s + 3] / 255
      if (sa === 0) continue
      const da = dst.data[d + 3] / 255
      const oa = sa + da * (1 - sa)
      for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round((src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / oa)
      dst.data[d + 3] = Math.round(oa * 255)
    }
  }
}

const blank = (width: number, height: number): Img => ({ width, height, data: Buffer.alloc(width * height * 4) })

/** Quarter turns clockwise (screen space, y down). */
const turn = (x: number, y: number, q: number): [number, number] => {
  let p: [number, number] = [x, y]
  for (let i = 0; i < q; i++) p = [-p[1], p[0]]
  return p
}

export function portUnit(assets: string, unitPath: string, rot: number, scene?: string): Ported | null {
  const f = loadFile(assets, unitPath)
  const name = scene ?? defaultScene(assets, unitPath)
  if (f === null || name === null) return null
  const el = f.byName.get(name) ?? f.scenes.children.find((c) => c.tag === 'scene' && (c.attrs.name ?? '') === name)
  if (el === undefined) return null
  const got: Collected = { sprites: [], rects: [], circles: [], lights: [] }
  collect(assets, f, el, 0, 0, got, 0)
  const sprites = got.sprites.filter((s) => texture(assets, s.texture) !== null)
  if (sprites.length === 0) return null

  // one timeline: the sprite with the most frames drives it, the others loop
  const driver = sprites.reduce((a, b) => (b.frames.length > a.frames.length ? b : a))
  const count = Math.min(driver.frames.length, 32)
  const times = driver.frames.slice(0, count).map((fr) => fr.time)

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const s of sprites) {
    for (const fr of s.frames) {
      left = Math.min(left, s.x)
      top = Math.min(top, s.y)
      right = Math.max(right, s.x + fr.rect[2])
      bottom = Math.max(bottom, s.y + fr.rect[3])
    }
  }
  const w = right - left
  const h = bottom - top
  const order = sprites.map((s, i) => ({ s, i })).sort((a, b) => a.s.layer - b.s.layer || a.i - b.i)
  const frames: Img[] = []
  for (let k = 0; k < count; k++) {
    const img = blank(w, h)
    for (const { s } of order) {
      const [fx, fy, fw, fh] = s.frames[k % s.frames.length].rect
      over(img, texture(assets, s.texture)!, fx, fy, fw, fh, s.x - left, s.y - top)
    }
    frames.push(img)
  }

  // rotate each frame about the unit position
  const q = ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4
  const corners = [
    turn(left, top, q),
    turn(right, top, q),
    turn(left, bottom, q),
    turn(right, bottom, q)
  ]
  const nl = Math.min(...corners.map((c) => c[0]))
  const nt = Math.min(...corners.map((c) => c[1]))
  const nw = q % 2 === 0 ? w : h
  const nh = q % 2 === 0 ? h : w
  const turned = frames.map((img) => {
    if (q === 0) return img
    const out = blank(nw, nh)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [rx, ry] = turn(left + x + 0.5, top + y + 0.5, q)
        const tx = Math.floor(rx - nl)
        const ty = Math.floor(ry - nt)
        img.data.copy(out.data, (ty * nw + tx) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4)
      }
    }
    return out
  })
  const strip = blank(nw * turned.length, nh)
  turned.forEach((img, i) => {
    for (let y = 0; y < nh; y++) img.data.copy(strip.data, (y * strip.width + i * nw) * 4, y * nw * 4, (y + 1) * nw * 4)
  })

  // HW1 polygons run bottom-left, top-left, top-right, bottom-right
  const polygons = got.rects.map(([x, y, rw, rh]) =>
    ([
      [x, y + rh],
      [x, y],
      [x + rw, y],
      [x + rw, y + rh]
    ] as Array<[number, number]>).map(([px, py]) => turn(px, py, q))
  )
  const circles = got.circles.map((c) => {
    const [x, y] = turn(c.x, c.y, q)
    return { x, y, r: c.r }
  })
  let light: Ported['light'] = null
  const l = got.lights[0]
  if (l !== undefined) {
    const [x, y] = turn(l.x, l.y, q)
    light = { x, y, small: l.small }
  } else {
    const glow = sprites.find((s) => s.bright)
    if (glow !== undefined) {
      const [x, y] = turn(glow.x + glow.frames[0].rect[2] / 2, glow.y + glow.frames[0].rect[3] / 2, q)
      light = { x, y, small: false }
    }
  }
  return {
    width: nw,
    height: nh,
    originX: -nl,
    originY: -nt,
    times,
    png: encodePng(strip) as Buffer,
    polygons,
    circles,
    floor: sprites.every((s) => s.floor) && polygons.length === 0 && circles.length === 0,
    unitLayer: Number(f.unit.attrs.layer ?? 0),
    light,
    scene: name
  }
}

const LIGHT = {
  big: { mul: 150, add: 64 },
  small: { mul: 64, add: 24 }
}

/** The HW1 doodad XML for a ported unit whose PNG is published at `texturePath`. */
export function doodadXml(p: Ported, texturePath: string, layer: number): string {
  const r = (n: number) => Math.round(n * 100) / 100
  const lines = [`<doodad ao="false" defaultlayer="${layer}">`]
  lines.push(`\t<sprite scale="16"${p.times.length > 1 ? ' random-start="true"' : ''}>`)
  lines.push(`\t\t<texture>${texturePath}</texture>`)
  lines.push(`\t\t<origin>${p.originX} ${p.originY}</origin>`)
  p.times.forEach((t, i) => lines.push(`\t\t<frame${p.times.length > 1 ? ` time="${t}"` : ''}>${i * p.width} 0 ${p.width} ${p.height}</frame>`))
  lines.push('\t</sprite>')
  if (p.polygons.length > 0 || p.circles.length > 0) {
    lines.push('\t<collision static="true">')
    for (const poly of p.polygons) {
      lines.push('\t\t<polygon>')
      for (const [x, y] of poly) lines.push(`\t\t\t<point>${r(x)} ${r(y)}</point>`)
      lines.push('\t\t</polygon>')
    }
    for (const c of p.circles) lines.push(`\t\t<circle offset="${r(c.x)} ${r(c.y)}" radius="${r(c.r)}" />`)
    lines.push('\t</collision>')
  }
  if (p.light !== null) {
    const l = p.light.small ? LIGHT.small : LIGHT.big
    lines.push(
      '\t<light>',
      `\t\t<origin>${r(p.light.x)} ${r(p.light.y)}</origin>`,
      '\t\t<mul>',
      `\t\t\t<range>${l.mul}</range>`,
      '\t\t\t<color1>220 150 50</color1>',
      '\t\t\t<color2>180 90 30</color2>',
      '\t\t\t<color3>160 70 10</color3>',
      '\t\t</mul>',
      '\t\t<add>',
      `\t\t\t<range>${l.add}</range>`,
      '\t\t\t<color1>80 40 0</color1>',
      '\t\t\t<color2>64 24 0</color2>',
      '\t\t\t<color3>64 0 0</color3>',
      '\t\t</add>',
      '\t</light>'
    )
  }
  lines.push('</doodad>')
  return lines.join('\n') + '\n'
}
