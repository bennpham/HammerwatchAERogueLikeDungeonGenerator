/**
 * The one validation rule for custom content (custom/sources.ts): a parameter
 * may name custom content only when its source is loaded.
 *
 * Rather than repeat a check in every id field's own rule (themes, arena
 * themes, biomes, every monster list and max, every music field…), this walks
 * the whole parameter tree once and flags every string value or map key that is
 * a custom id from an unloaded source. The field it reports is the value's
 * dotted path (`world.worlds.0.biome`, `boss.fights.1.arena.theme`,
 * `floorMusic.2`, `monsterMax.hw2_troll_brute`), the convention the other rules
 * and the GUI's inline errors already use, so a new id field is covered without
 * touching this file.
 */

import type { ValidationIssue } from '../config/validation'
import { sourceOfId, unavailableMessage } from './sources'
import type { ContentContext } from './sources'

/** A token shaped like a content id or pool key (`hw2_troll#2`), not free text. */
const ID_LIKE = /^[A-Za-z0-9_#:.-]+$/

/**
 * Lists whose errors the GUI shows per entry (`floorMusic.2`). Every other
 * list reports on the list itself (`themes`, `levelMonsters`,
 * `world.worlds.0.monsters`), as their own rules do.
 */
const PER_ENTRY = new Set(['floorMusic'])

/** The parameter tree is plain data; this only bounds a malformed import. */
const MAX_DEPTH = 16

/** What to call the content in the message, from where it sits. */
function kindOf(field: string): string {
  const f = field.toLowerCase()
  if (f.includes('biome')) return 'biome'
  if (f.includes('theme')) return 'theme'
  if (f.includes('music')) return 'track'
  if (f.includes('monster') || f.includes('pool') || f.includes('wave') || f.includes('max')) return 'monster'
  return 'option'
}

/**
 * The field to report for a value at `path`: list indexes at its end are
 * dropped (`levelMonsters.2.0` → `levelMonsters`), except one for a
 * per-entry list (`floorMusic.2`).
 */
function reportField(path: string): string {
  const parts = path.split('.')
  let end = parts.length
  while (end > 1 && /^\d+$/.test(parts[end - 1])) end--
  const base = parts.slice(0, end).join('.')
  return PER_ENTRY.has(base) && end < parts.length ? `${base}.${parts[end]}` : base
}

function check(id: string, path: string, ctx: ContentContext, seen: Set<string>, errors: ValidationIssue[]): void {
  const field = reportField(path)
  const key = `${field}|${id}`
  if (!ID_LIKE.test(id) || sourceOfId(id) === null || seen.has(key)) return
  const message = unavailableMessage(id, ctx, kindOf(field))
  if (message === null) return
  seen.add(key)
  errors.push({ field, message })
}

/**
 * Pushes an error for each place `p` names custom content whose source `ctx`
 * hasn't loaded. With every source loaded it pushes nothing.
 */
export function validateContentSources(p: unknown, ctx: ContentContext, errors: ValidationIssue[]): void {
  const seen = new Set<string>()
  const walk = (value: unknown, field: string, depth: number): void => {
    if (depth > MAX_DEPTH) return
    if (typeof value === 'string') {
      check(value, field, ctx, seen, errors)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, field === '' ? String(i) : `${field}.${i}`, depth + 1))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const at = field === '' ? k : `${field}.${k}`
        // a map keyed by id (monsterMax, pool weights)
        check(k, at, ctx, seen, errors)
        walk(v, at, depth + 1)
      }
    }
  }
  walk(p, '', 0)
}
