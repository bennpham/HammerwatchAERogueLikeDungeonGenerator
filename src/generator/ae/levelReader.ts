import { parseSval, svalGet, svalNumbers, svalString, svalBool, svalInt } from './sval'
import type { SvalNode } from './sval'
import { AeLevel } from './model'
import type { AeScript, AeUnit, Param, StateValue } from './model'

/**
 * Read an AE `.lvl` (SVAL text) back into an `AeLevel`.
 *
 * Used by tests (round-trip against the stock levels), by the validator, and
 * by the lobby importer that turns a hand-made editor level into a template
 * the generator can rewrite. Ported from hw2ae's `ae/level_reader.py`.
 *
 * Script params are converted into typed `Param`s where the shape is
 * recognisable; anything else is skipped and reported via `unknownParams`,
 * which is why the reader is for inspection and templates, not lossless
 * archival of arbitrary levels.
 */
export interface ReadLevelResult {
  level: AeLevel
  /** `"Class#id.name"` of every param the reader could not type */
  unknownParams: string[]
}

export function readLevel(text: string): ReadLevelResult {
  const root = parseSval(text)
  const env = svalString(svalGet(svalGet(root, 'lighting'), 'environment')) ?? null
  const level = new AeLevel(env)
  const gm = svalString(svalGet(svalGet(root, 'game-mode'), 'Class'))
  if (gm !== undefined) level.gameMode = gm
  const unknownParams: string[] = []
  let maxId = 0

  for (const cell of svalGet(root, 'tiles')?.children ?? []) {
    const [x, y] = svalNumbers(svalGet(cell, 'pos'))
    const datasets: Array<{ tileset: string; rle: string }> = []
    for (const ds of svalGet(cell, 'datasets')?.children ?? []) {
      datasets.push({
        tileset: svalString(svalGet(ds, 'tileset')) ?? '',
        rle: svalString(svalGet(ds, 'data-rle')) ?? ''
      })
    }
    level.tileCells.push({ x, y, datasets })
  }

  // units the editor saved with a position only (no id) — numbered after the
  // highest id in the file, once that is known
  const idless: AeUnit[] = []
  for (const group of svalGet(root, 'units')?.children ?? []) {
    const path = group.name ?? ''
    const kids = group.children
    // Flat form alternates vec2,int; wrapped form is one array per unit. The
    // editor also writes a bare vec2 with no id after it (pickups placed by
    // hand: `<array name="…diamond_red.unit"><vec2>…</vec2><vec2>…</vec2>`).
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]
      let unit: AeUnit | null = null
      if (k.tag === 'vec2') {
        const [x, y] = svalNumbers(k)
        if (kids[i + 1]?.tag === 'int') {
          unit = { path, x, y, id: svalInt(kids[i + 1]) ?? 0 }
          i++
        } else {
          idless.push({ path, x, y, id: 0 })
          continue
        }
      } else if (k.tag === 'array') {
        const [x, y] = svalNumbers(k.children[0])
        const id = svalInt(k.children[1]) ?? 0
        unit = { path, x, y, id }
        const dict = k.children.find((c) => c.tag === 'dict')
        if (dict !== undefined) unit.state = readState(dict)
      }
      if (unit !== null) {
        level.units.push(unit)
        maxId = Math.max(maxId, unit.id)
      }
    }
  }

  // statics: one array per path holding vec2 positions, each optionally
  // followed by its own state dict
  for (const group of svalGet(root, 'statics')?.children ?? []) {
    const path = group.name ?? ''
    for (const k of group.children) {
      if (k.tag === 'vec2') {
        const [x, y] = svalNumbers(k)
        level.statics.push({ path, x, y })
      } else if (k.tag === 'dict' && level.statics.length > 0) {
        level.statics[level.statics.length - 1].state = readState(k)
      }
    }
  }

  for (const s of svalGet(root, 'scripts')?.children ?? []) {
    const c = s.children
    const script: AeScript = {
      cls: svalString(c[0]) ?? '',
      id: svalInt(c[1]) ?? 0,
      x: svalNumbers(c[2])[0] ?? 0,
      y: svalNumbers(c[2])[1] ?? 0,
      enabled: svalBool(c[3]) ?? true,
      triggerTimes: svalInt(c[4]) ?? -1,
      executeOnStart: svalBool(c[5]) ?? false,
      params: [],
      connections: []
    }
    for (const extra of c.slice(6)) {
      if (extra.tag === 'string') script.label = svalString(extra)
      else if (extra.tag === 'dict') script.params = readParams(extra, `${script.cls}#${script.id}`, unknownParams)
      else if (extra.tag === 'array') {
        const nums = extra.children.map((n) => svalInt(n) ?? 0)
        for (let i = 0; i + 1 < nums.length; i += 2) script.connections.push([nums[i], nums[i + 1]])
      }
    }
    level.scripts.push(script)
    maxId = Math.max(maxId, script.id)
  }

  const pf = svalGet(root, 'prefabs')?.children ?? []
  for (let i = 0; i + 1 < pf.length; i += 2) {
    const [x, y] = svalNumbers(pf[i + 1])
    level.prefabs.push({ path: svalString(pf[i]) ?? '', x, y })
  }

  // continue numbering after the highest id read, so edits never collide
  while (level.peekId() <= maxId) level.newId()
  for (const u of idless) {
    u.id = level.newId()
    level.units.push(u)
  }
  return { level, unknownParams }
}

function readState(dict: SvalNode): Record<string, StateValue> {
  const out: Record<string, StateValue> = {}
  for (const n of dict.children) {
    if (n.name === undefined) continue
    switch (n.tag) {
      case 'bool':
        out[n.name] = { kind: 'bool', value: svalBool(n) ?? false }
        break
      case 'int':
        out[n.name] = { kind: 'int', value: svalInt(n) ?? 0 }
        break
      case 'float':
        out[n.name] = { kind: 'float', value: Number(n.text.trim()) }
        break
      case 'vec2': {
        const [a, b] = svalNumbers(n)
        out[n.name] = { kind: 'vec2', value: [a, b] }
        break
      }
      case 'array':
        if (n.children.length > 0 && n.children.every((c) => c.tag === 'vec2')) {
          out[n.name] = { kind: 'vec2s', value: n.children.map((c) => svalNumbers(c) as [number, number]) }
        } else out[n.name] = { kind: 'strings', value: n.children.map((c) => c.text) }
        break
      case 'string':
        out[n.name] = { kind: 'string', value: n.text }
        break
      default:
        // vec3/vec4/ivec*/color…: kept with its tag, so it's written back as AE wrote it
        out[n.name] = { kind: 'raw', tag: n.tag, value: n.text.trim() }
    }
  }
  return out
}

function readParams(dict: SvalNode, where: string, unknown: string[]): Param[] {
  const out: Param[] = []
  for (const n of dict.children) {
    const name = n.name ?? ''
    switch (n.tag) {
      case 'string':
        out.push({ kind: 'string', name, value: n.text })
        break
      case 'int':
        out.push({ kind: 'int', name, value: svalInt(n) ?? 0 })
        break
      case 'float':
        out.push({ kind: 'float', name, value: Number(n.text.trim()) })
        break
      case 'bool':
        out.push({ kind: 'bool', name, value: svalBool(n) ?? false })
        break
      case 'array': {
        const tags = n.children.map((c) => c.tag)
        if (tags.every((t) => t === 'int')) {
          out.push({ kind: 'ids', name, value: n.children.map((c) => svalInt(c) ?? 0) })
        } else if (tags.every((t) => t === 'string')) {
          out.push({ kind: 'strings', name, value: n.children.map((c) => c.text) })
        } else if (tags.length === 2 && tags[0] === 'int' && tags[1] === 'string') {
          out.push({ kind: 'target', name, value: [svalInt(n.children[0]) ?? 0, n.children[1].text] })
        } else if (tags.length % 2 === 0 && tags.every((t, i) => t === (i % 2 === 0 ? 'int' : 'string'))) {
          const pairs: Array<[number, string]> = []
          for (let i = 0; i < n.children.length; i += 2) {
            pairs.push([svalInt(n.children[i]) ?? 0, n.children[i + 1].text])
          }
          out.push({ kind: 'sources', name, value: pairs })
        } else {
          unknown.push(`${where}.${name}`)
        }
        break
      }
      default:
        unknown.push(`${where}.${name}`)
    }
  }
  return out
}
