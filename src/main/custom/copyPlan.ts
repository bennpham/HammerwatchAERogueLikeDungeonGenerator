/**
 * Which files of another game a scenario must carry, and their rewritten
 * text (experimental "Load custom"; docs/discovery/hammerwatch-2-assets.md).
 * Pure: the sources are passed in.
 *
 * The generator names the source's files under a prefix (`hw2/doodads/walls/
 * crypt/h_32.unit`). Those are the ROOTS. Each is found in the source at its
 * own path (`doodads/walls/crypt/h_32.unit`), and everything it names is
 * followed: includes, textures, effects, other units. A followed file is either
 *
 *   - SHIPPED under the prefix, its absolute references to other shipped files
 *     rewritten to match (relative ones, `./base.png`, stay valid as they are);
 *   - KEPT at AE's path when AE has it and it must stay AE's: `system/`
 *     (materials, shaders: the engine's own), or a leaf file (a texture) whose
 *     bytes AE already has, so the pack doesn't carry a second copy;
 *   - or MISSING from the source: noted, and left as written (most are inside
 *     editor-only `%if` branches).
 *
 * Unit text also loses what only the other game defines: its actor `team`,
 * `loot` and `gore` tables, and sound events AE doesn't know. A unit whose
 * behaviour names a script class AE doesn't have can't run, which is an error.
 */

import { dirOf, extractRefs, isTextAsset, maskComments, resolveRelative } from './refs'
import type { Ref } from './refs'

export interface CopySourceFile {
  flag: number
  data: Uint8Array
}

export interface CopySource {
  has(path: string): boolean
  read(path: string): CopySourceFile | null
}

export interface CopyInput {
  /** the generator's paths, all under `prefix` */
  roots: readonly string[]
  /** `hw2/` */
  prefix: string
  /** the other game's files: its pack, or its extract */
  source: CopySource
  /** its extract, preferred for textures (plain PNGs rather than compiled ones) */
  plain?: CopySource | null
  /** AE's own files, to keep what AE already has; null skips that */
  ae: CopySource | null
  /** class names AE's scripts declare */
  aeClasses: ReadonlySet<string>
  /** FMOD events AE's assets name */
  aeEvents: ReadonlySet<string>
}

export interface CopiedFile {
  /** where the scenario ships it */
  path: string
  data: Uint8Array
  /** 1 plain, 3 already compiled (a texture from a pack) */
  flag: number
}

export interface CopyPlan {
  files: CopiedFile[]
  /** source paths kept at AE's path */
  keptAe: string[]
  notes: string[]
  errors: string[]
}

/** Bounds the walk on a malformed source; a real closure is a few hundred files. */
export const MAX_COPY_FILES = 20_000

/** Unit parameters naming the other game's own tables. */
const FOREIGN_PARAMS = /[ \t]*<string name="(?:team|loot|gore)">[^<]*<\/string>[ \t]*\r?\n?/g
const CLASS_NAMES = /\bclass="(\w+)"|<string name="class">(\w+)<\/string>/g
const SOUND_EVENT = /event:\/[\w/\-.]+/g

/** Paths kept at AE's own copy, never shipped: the engine's materials and shaders. */
function pinnedToAe(path: string): boolean {
  return path.startsWith('system/')
}

/**
 * HW2 draws most actors from a `.tif` whose raw file packs 10 channels a pixel
 * (colour plus HW2's lighting layers); AE draws none of it, so the actor shows
 * only its shadow and elite ring. Most sit beside a `.png` of the same sheet
 * (troll_brute.tif / troll_brute.png), which is what ships instead.
 */
function isTif(path: string): boolean {
  return /\.tif$/i.test(path)
}

function pngOf(tif: string): string {
  return tif.slice(0, -4) + '.png'
}

const MATERIAL_NAME =/<material name="([^"]+)"/g
const MATERIAL_BLOCK = /<material name="([^"]+)"[^>]*>[\s\S]*?<\/material>/g

function materialNames(text: string): Set<string> {
  return new Set([...maskComments(text).matchAll(MATERIAL_NAME)].map((m) => m[1]))
}

/**
 * A `.mats` file holding only `names`, cut from the source's own copy: the
 * materials the other game added to a file pinned to AE's (HW2's
 * `system/default.mats` has `particle-storm`, AE's doesn't).
 */
function materialsFile(text: string, names: ReadonlySet<string>): string {
  const blocks: string[] = []
  for (const m of maskComments(text).matchAll(MATERIAL_BLOCK)) {
    if (names.has(m[1])) blocks.push('\t' + text.slice(m.index, m.index + m[0].length))
  }
  return `<materials>\n${blocks.join('\n')}\n</materials>\n`
}

/** A file reached from a root keeps that root's folder for its relative paths if it's textually included. */
function baseDirFor(path: string, includerBase: string): string {
  return path.endsWith('.inc') ? includerBase : dirOf(path)
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function planCopy(input: CopyInput): CopyPlan {
  const { prefix, source, ae } = input
  const notes: string[] = []
  const errors: string[] = []
  const text = new Map<string, { content: string; refs: Ref[] }>()
  const shipped = new Set<string>()
  const keptAe = new Set<string>()
  const missing = new Set<string>()
  const visited = new Set<string>()
  /** `file\nrefStart` of each `.tif` reference that keeps its `.tif` (no `.png` beside it) */
  const keptTif = new Set<string>()
  /** pinned `.mats` → the entries only the source has, shipped as a prefixed copy */
  const addedMaterials = new Map<string, Set<string>>()
  const matNames = new Map<string, { ae: Set<string>; source: Set<string> }>()
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

  const materialsOf = (path: string): { ae: Set<string>; source: Set<string> } | null => {
    let m = matNames.get(path)
    if (m === undefined) {
      const mine = source.read(path)
      const theirs = ae?.read(path) ?? null
      if (mine === null || theirs === null) return null
      m = { ae: materialNames(decoder.decode(theirs.data)), source: materialNames(decoder.decode(mine.data)) }
      matNames.set(path, m)
    }
    return m
  }

  /** A pinned `.mats:entry` AE lacks: ship the source's entry, or note it. */
  const checkMaterial = (from: string, target: string, entry: string): void => {
    const m = materialsOf(target)
    if (m === null || m.ae.has(entry)) return
    if (!m.source.has(entry)) {
      notes.push(`${from}: no material ${target}:${entry}`)
      return
    }
    let set = addedMaterials.get(target)
    if (set === undefined) addedMaterials.set(target, (set = new Set()))
    set.add(entry)
  }

  const readText = (path: string): { content: string; refs: Ref[] } | null => {
    const cached = text.get(path)
    if (cached !== undefined) return cached
    const f = source.read(path)
    if (f === null) return null
    const content = decoder.decode(f.data)
    const entry = { content, refs: extractRefs(content) }
    text.set(path, entry)
    return entry
  }

  // phase 1: walk, deciding each file's fate. A text file is read once, but
  // its RELATIVE references depend on the unit including it, so a file is
  // visited once per base folder.
  const queue: Array<[path: string, base: string]> = []
  for (const root of [...input.roots].sort()) {
    if (!root.startsWith(prefix)) {
      errors.push(`${root} is not under ${prefix}`)
      continue
    }
    const path = root.slice(prefix.length)
    if (!source.has(path)) {
      errors.push(`${root}: not in the source`)
      continue
    }
    shipped.add(path)
    queue.push([path, baseDirFor(path, dirOf(path))])
  }
  while (queue.length > 0) {
    const [path, base] = queue.shift()!
    const key = `${path}\n${base}`
    if (visited.has(key)) continue
    visited.add(key)
    if (visited.size > MAX_COPY_FILES) {
      errors.push(`more than ${MAX_COPY_FILES} files to copy; stopped`)
      break
    }
    if (!isTextAsset(path)) continue
    const t = readText(path)
    if (t === null) continue
    for (const ref of t.refs) {
      let target = ref.relative ? resolveRelative(base, ref.path) : ref.path
      if (target === null) {
        notes.push(`${path}: ${ref.path} climbs out of the assets`)
        continue
      }
      if (isTif(target)) {
        // the colour sheet beside it draws in AE; without one, the sheet stays (compiled)
        const png = pngOf(target)
        if (source.has(png)) target = png
        else keptTif.add(`${path}\n${ref.start}`)
      }
      if (pinnedToAe(target) && target.endsWith('.mats') && ref.entry !== undefined && !ref.relative) {
        checkMaterial(path, target, ref.entry)
      }
      if (shipped.has(target) || keptAe.has(target) || missing.has(target)) {
        if (shipped.has(target)) queue.push([target, baseDirFor(target, base)])
        continue
      }
      if (pinnedToAe(target)) {
        keptAe.add(target)
        continue
      }
      if (!source.has(target)) {
        // AE's own file of that name serves (it was never the other game's), else it's absent
        if (ae?.has(target) === true) keptAe.add(target)
        else missing.add(target)
        continue
      }
      if (!isTextAsset(target) && !ref.relative && ae !== null) {
        const mine = source.read(target)
        const theirs = ae.read(target)
        if (mine !== null && theirs !== null && mine.flag === theirs.flag && sameBytes(mine.data, theirs.data)) {
          keptAe.add(target)
          continue
        }
      }
      shipped.add(target)
      queue.push([target, baseDirFor(target, base)])
    }
  }
  for (const m of [...missing].sort()) notes.push(`not in the source: ${m}`)

  // phase 2: the shipped files, text rewritten
  const encoder = new TextEncoder()
  const files: CopiedFile[] = []
  for (const path of [...shipped].sort()) {
    if (isTextAsset(path)) {
      const t = readText(path)
      if (t === null) continue
      let out = ''
      let last = 0
      for (const ref of t.refs) {
        const swap = isTif(ref.path) && !keptTif.has(`${path}\n${ref.start}`)
        const written = swap ? pngOf(ref.path) : ref.path
        const added = ref.entry !== undefined && addedMaterials.get(written)?.has(ref.entry) === true
        const prefixed = !ref.relative && (shipped.has(written) || added)
        if (!swap && !prefixed) continue
        out += t.content.slice(last, ref.start) + (prefixed ? prefix : '') + written
        last = ref.end
      }
      out += t.content.slice(last)
      if (path.endsWith('.unit') || path.endsWith('.inc')) {
        out = out.replace(FOREIGN_PARAMS, '')
        out = out.replace(SOUND_EVENT, (e) => (input.aeEvents.has(e) ? e : ''))
        // a commented-out block is never loaded, so its classes aren't needed
        for (const m of maskComments(out).matchAll(CLASS_NAMES)) {
          const cls = m[1] ?? m[2]
          if (!input.aeClasses.has(cls)) errors.push(`${prefix}${path}: needs the script class ${cls}, which AE doesn't have`)
        }
      }
      files.push({ path: prefix + path, data: encoder.encode(out), flag: 1 })
    } else {
      // an extract's .tif is the other game's layered sheet (10 channels), which AE can't
      // draw; the pack's compiled copy is plain RGBA
      const plain = isTif(path) ? null : (input.plain?.read(path) ?? null)
      const f = plain ?? source.read(path)
      if (f === null) continue
      if (isTif(path) && f.flag !== 3) notes.push(`${prefix}${path}: a layered .tif with no .png beside it; AE may not draw it`)
      files.push({ path: prefix + path, data: f.data, flag: f.flag })
    }
  }
  for (const [path, names] of [...addedMaterials].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const f = source.read(path)
    if (f === null) continue
    files.push({ path: prefix + path, data: encoder.encode(materialsFile(decoder.decode(f.data), names)), flag: 1 })
    notes.push(`${prefix}${path}: ${[...names].sort().join(', ')} (materials AE's ${path} lacks)`)
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files, keptAe: [...keptAe].sort(), notes, errors: [...new Set(errors)] }
}
