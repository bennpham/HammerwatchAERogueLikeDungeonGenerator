// Loads AE `.unit` files for the dev tools: runs the asset preprocessor
// (%include / %define / %replace / %if-%elif-%else-%endif), then extracts a
// scene's sprites and collision rects. Not a full engine port — enough
// to draw a level's doodads where the game would and to read their footprints.
import fs from 'node:fs'
import path from 'node:path'

export function findAeAssets() {
  const root = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^unpacked_assets_\d+$/.test(d)) : []
  dirs.sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return { root, assets: dirs.length > 0 ? path.join(root, dirs[0]) : null }
}

function evalCond(expr, defs) {
  // symbols, !, &&, || — no parentheses in practice
  return expr.split('||').some((orPart) =>
    orPart.split('&&').every((term) => {
      const t = term.trim()
      return t.startsWith('!') ? !defs.has(t.slice(1).trim()) : defs.has(t)
    })
  )
}

export function preprocess(assets, rel, defs = new Set(), replaces = new Map(), depth = 0) {
  if (depth > 12) return ''
  let text
  try { text = fs.readFileSync(path.join(assets, rel), 'utf8') } catch { return '' }
  const out = []
  const stack = [] // {active, taken}
  const active = () => stack.every((s) => s.active)
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('%//')) continue
    const m = /^%(\w+)\s*(.*)$/.exec(line)
    if (m) {
      const [, dir, arg] = m
      if (dir === 'if') { const on = active() && evalCond(arg, defs); stack.push({ active: on, taken: on, parent: active() }); continue }
      if (dir === 'elif') { const s = stack[stack.length - 1]; if (!s) continue; const on = s.parent && !s.taken && evalCond(arg, defs); s.active = on; s.taken ||= on; continue }
      if (dir === 'else') { const s = stack[stack.length - 1]; if (!s) continue; s.active = s.parent && !s.taken; s.taken = true; continue }
      if (dir === 'endif') { stack.pop(); continue }
      if (!active()) continue
      if (dir === 'define') { defs.add(arg.split(/\s+/)[0]); continue }
      if (dir === 'replace') { const [a, ...b] = arg.split(/\s+/); replaces.set(a, b.join(' ')); continue }
      if (dir === 'include') {
        // quoted or bare: `%include "a.inc"`, `%include doodads/carpeting/carpet_base.inc`
        const inc = /"([^"]+)"/.exec(arg) ?? /^(\S+)/.exec(arg)
        if (inc) out.push(preprocess(assets, inc[1], defs, replaces, depth + 1))
        continue
      }
      continue
    }
    if (!active()) continue
    let l = rawLine
    for (const [a, b] of replaces) l = l.split(a).join(b)
    out.push(l)
  }
  return out.join('\n')
}

function attrs(s) {
  const o = {}
  for (const m of s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2]
  return o
}

// split <scene ...>...</scene> blocks at the top level of <scenes>
function scenes(xml) {
  const res = []
  const re = /<scene\b([^>]*?)(\/?)>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    if (m[2] === '/') continue // <scene src=.../> reference inside a scene
    const a = attrs(m[1])
    // find matching </scene>
    let depth = 1, i = re.lastIndex
    const tagRe = /<(\/?)scene\b([^>]*?)(\/?)>/g
    tagRe.lastIndex = i
    let t
    while (depth > 0 && (t = tagRe.exec(xml)) !== null) {
      if (t[3] === '/') continue
      depth += t[1] === '/' ? -1 : 1
    }
    const body = xml.slice(i, t ? t.index : xml.length)
    res.push({ name: a.name ?? '', attrs: a, body })
    re.lastIndex = t ? tagRe.lastIndex : xml.length
  }
  return res
}

const cache = new Map()

/**
 * { sprites:[{texture, ox, oy, frame:[x,y,w,h], layer}], rects:[[x,y,w,h]], unitLayer }
 *
 * `scene` picks a named scene (a unit's `start` state); without one, or when
 * the unit has no such scene, the default scene.
 */
export function loadUnit(assets, unitPath, scene) {
  const key = scene === undefined ? unitPath : `${unitPath}#${scene}`
  if (cache.has(key)) return cache.get(key)
  const xml = preprocess(assets, unitPath)
  const unitTag = /<unit\b([^>]*)>/.exec(xml)
  const unitLayer = unitTag ? Number(attrs(unitTag[1]).layer ?? 0) : 0
  const all = scenes(xml)
  const byName = new Map(all.map((s) => [s.name, s]))
  const scenesTag = /<scenes\b([^>]*)>/.exec(xml)
  const sa = scenesTag ? attrs(scenesTag[1]) : {}
  let pick = (scene !== undefined ? byName.get(scene) : undefined) ?? all.find((s) => s.name === '') ?? byName.get(sa.on ?? '') ?? byName.get('default') ?? byName.get('default-1') ?? all.find((s) => s.name !== 'shared') ?? all[0]
  const expand = (body, depth = 0) => {
    if (depth > 4) return body
    return body.replace(/<scene\s+src="([^":]+)"\s*\/>/g, (_, n) => (byName.has(n) ? expand(byName.get(n).body, depth + 1) : ''))
  }
  const body = pick ? expand(pick.body) : ''
  const dir = path.posix.dirname(unitPath)
  const sprites = []
  for (const m of body.matchAll(/<sprite\b([^>]*)>([\s\S]*?)<\/sprite>/g)) {
    const a = attrs(m[1])
    const fr = /<frame[^>]*>\s*([-\d]+)\s+([-\d]+)\s+([-\d]+)\s+([-\d]+)\s*<\/frame>/.exec(m[2])
    if (!fr || !a.texture) continue
    const [ox, oy] = (a.origin ?? '0 0').split(/\s+/).map(Number)
    let tex = a.texture
    if (tex.startsWith('./') || tex.startsWith('../')) tex = path.posix.normalize(path.posix.join(dir, tex))
    sprites.push({ texture: tex, ox, oy, frame: fr.slice(1, 5).map(Number), layer: Number(a.layer ?? 0) + Number(a.ulayer ?? 0) / 1000, material: a.material ?? '' })
  }
  const rects = []
  // every solid collision shape as a rect [x, y, w, h]: polygons and circles by
  // their bounding box; sensor shapes (a pickup's trigger circle) block nothing
  const sensor = (tagAttrs) => attrs(tagAttrs).sensor === 'true'
  for (const m of body.matchAll(/<collision\b[^>]*>([\s\S]*?)<\/collision>/g)) {
    for (const r of m[1].matchAll(/<rect\b([^>]*)>\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*<\/rect>/g)) {
      if (!sensor(r[1])) rects.push(r.slice(2, 6).map(Number))
    }
    for (const p of m[1].matchAll(/<polygon\b([^>]*)>([\s\S]*?)<\/polygon>/g)) {
      if (sensor(p[1])) continue
      const pts = [...p[2].matchAll(/<point>\s*([-\d.]+)\s+([-\d.]+)\s*<\/point>/g)].map((q) => [Number(q[1]), Number(q[2])])
      if (pts.length === 0) continue
      const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y)
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
    }
    for (const c of m[1].matchAll(/<circle\b([^>]*)\/?>/g)) {
      const a = attrs(c[1])
      if (a.sensor === 'true') continue
      const r = Number(a.radius ?? 0)
      const [ox, oy] = (a.offset ?? '0 0').split(/\s+/).map(Number)
      if (r > 0) rects.push([ox - r, oy - r, 2 * r, 2 * r])
    }
  }
  const res = { sprites, rects, unitLayer }
  cache.set(key, res)
  return res
}
