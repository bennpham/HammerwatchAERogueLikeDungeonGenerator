import { serializeParametersTxt } from '../../generator'
import type { DungeonParameters } from '../../generator'

/** One parameters.txt key whose line differs between two parameter sets. */
export interface ParamChange {
  key: string
  /** null when the key was not in the "before" file */
  before: string | null
  /** null when the key is no longer in the "after" file */
  after: string | null
}

const FENCE = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/g
const KEY_LINE = /^[A-Za-z][\w.-]*\s*=/
const PLAIN_TAGS = new Set(['', 'txt', 'text', 'ini', 'properties', 'conf'])

/**
 * Pulls the parameters.txt lines out of a model reply. Order of preference:
 * every ```parameters block (joined, later lines win in the parser), then any
 * untagged/plain-text fence, then bare `key=value` lines in the prose. A fence
 * the model never closed (a truncated reply) still counts. Returns null when
 * the reply holds none, so a prose-only answer is never mistaken for an edit.
 */
export function extractParametersBlock(reply: string): string | null {
  const text = reply.replace(/\r\n?/g, '\n')
  const tagged: string[] = []
  const plain: string[] = []
  for (const match of text.matchAll(FENCE)) {
    const tag = match[1].toLowerCase()
    const body = match[2].trim()
    if (body === '') continue
    if (tag === 'parameters' || tag === 'params') tagged.push(body)
    else if (PLAIN_TAGS.has(tag)) plain.push(body)
  }
  if (tagged.length > 0) return tagged.join('\n')
  const plainWithKeys = plain.filter((body) => body.split('\n').some((line) => KEY_LINE.test(line)))
  if (plainWithKeys.length > 0) return plainWithKeys.join('\n')
  const bare = text.split('\n').filter((line) => KEY_LINE.test(line))
  return bare.length > 0 ? bare.join('\n') : null
}

/** Per-floor key families a model may write as a range, `trap0-98=...`. */
const RANGE_LINE = /^(monsters|trap|timer|music|buff|bossFloor)(\d+)-(\d+)([A-Za-z]\w*)?\s*=(.*)$/i
/** No real campaign gets near this; it only stops a typo like `0-99999` freezing the UI. */
const MAX_RANGE_FLOOR = 999
const LOCK_FLOORS_LINE = /^lockFloors\s*=(.*)$/i
const LOCK_RANGE_TOKEN = /^(\d+)-(\d+)(:\d+)?$/
const FULLY_UPGRADED_LINE = /^playerFullyUpgraded\s*=\s*(1|true|yes)\s*$/i

/**
 * Assistant-only shorthands, rewritten into plain parameters.txt lines before
 * the parser sees them, so a small model can describe a 99-floor run in a few
 * lines instead of hundreds:
 * - `bossFloor0-98=...` (any per-floor family, any suffix such as
 *   `bossFloor0-98Invuln=off`) becomes one line per floor, inclusive.
 * - `lockFloors=0-98:2` (a range token, optional button count) becomes one
 *   token per floor.
 * - `playerFullyUpgraded=1` is removed and reported, for the caller to apply
 *   the same "fully upgraded" action as the Player tab's button.
 * An imported parameters.txt never goes through this; it is the chat's dialect.
 */
export function expandShorthands(block: string): { text: string; fullyUpgraded: boolean } {
  let fullyUpgraded = false
  const out: string[] = []
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (FULLY_UPGRADED_LINE.test(line)) {
      fullyUpgraded = true
      continue
    }
    const lock = LOCK_FLOORS_LINE.exec(line)
    if (lock !== null) {
      const tokens = lock[1].split(',').map((t) => t.trim()).filter((t) => t !== '')
      const expanded = tokens.flatMap((token) => {
        const r = LOCK_RANGE_TOKEN.exec(token)
        if (r === null) return [token]
        const from = parseInt(r[1], 10)
        const to = Math.min(parseInt(r[2], 10), MAX_RANGE_FLOOR)
        return Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => `${from + k}${r[3] ?? ''}`)
      })
      out.push(`lockFloors=${expanded.join(',')}`)
      continue
    }
    const m = RANGE_LINE.exec(line)
    if (m === null) {
      out.push(raw)
      continue
    }
    const from = parseInt(m[2], 10)
    const to = Math.min(parseInt(m[3], 10), MAX_RANGE_FLOOR)
    for (let i = from; i <= to; i++) out.push(`${m[1]}${i}${m[4] ?? ''}=${m[5].trim()}`)
  }
  return { text: out.join('\n'), fullyUpgraded }
}

/**
 * The prompt lets a model write fewer `themes` / `monstersN` than floors (a
 * 99-floor run would otherwise be ~200 lines a small model rarely finishes).
 * This repeats what it gave, in order, until every floor has one. Returns the
 * filled params and a note for the preview, or the input and null when no
 * floor was missing a theme or pool. Assistant-side only: an imported
 * parameters.txt still gets the validator's error for a short list.
 */
export function fillPerFloorLists(params: DungeonParameters): { params: DungeonParameters; note: string | null } {
  const levels = params.levels
  const short = (list: readonly unknown[]) => list.length > 0 && list.length < levels
  if (!short(params.themes) && !short(params.levelMonsters)) return { params, note: null }
  const cycle = <T>(list: readonly T[]): T[] => Array.from({ length: levels }, (_, i) => list[i % list.length])
  const filled: string[] = []
  const next = { ...params }
  if (short(params.themes)) {
    filled.push(`themes (${params.themes.length} given)`)
    next.themes = cycle(params.themes)
  }
  if (short(params.levelMonsters)) {
    filled.push(`monster pools (${params.levelMonsters.length} given)`)
    next.levelMonsters = cycle(params.levelMonsters).map((pool) => [...pool])
  }
  return { params: next, note: `Repeated the ${filled.join(' and ')} to cover all ${levels} floors.` }
}

/** `key -> value` for every non-comment line, in file order. */
function linesByKey(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return map
}

/** The keys whose lines differ between two serialized parameter files. */
export function diffSerialized(before: string, after: string): ParamChange[] {
  const a = linesByKey(before)
  const b = linesByKey(after)
  const changes: ParamChange[] = []
  for (const [key, value] of b) {
    const old = a.get(key) ?? null
    if (old !== value) changes.push({ key, before: old, after: value })
  }
  for (const [key, value] of a) {
    if (!b.has(key)) changes.push({ key, before: value, after: null })
  }
  return changes
}

/**
 * Which parameters.txt keys differ between two parameter sets — computed on the
 * serialized lines, so it speaks the same vocabulary the model was shown.
 */
export function diffParams(before: DungeonParameters, after: DungeonParameters): ParamChange[] {
  return diffSerialized(serializeParametersTxt(before), serializeParametersTxt(after))
}
