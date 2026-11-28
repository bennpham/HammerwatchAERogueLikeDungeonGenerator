import React, { createContext, useContext } from 'react'
import { AE_ONLY, SOURCE_LABELS, sourceOfId } from '../generator'
import type { ContentContext } from '../generator'

/**
 * Which custom content sources ("Load custom", experimental) the app has
 * loaded, for the forms: content from a source that isn't loaded is never
 * offered. Stock AE content always is.
 */
export const ContentSourcesContext = createContext<ContentContext>(AE_ONLY)

export function useContentSources(): ContentContext {
  return useContext(ContentSourcesContext)
}

/** Display groups made of one source's content (themes' 'Hammerwatch 2', MONSTER_GROUPS' four). */
const SOURCE_GROUPS: Readonly<Record<string, string>> = {
  'Hammerwatch 2': 'hw2',
  'Hammerwatch 2: Beasts': 'hw2',
  'Hammerwatch 2: Humans': 'hw2',
  'Hammerwatch 2: Undead': 'hw2',
  'Hammerwatch 2: Other': 'hw2'
}

/**
 * The display groups a picker shows: a source's own group only with that
 * source loaded, or when `keep` says the picker already holds something from
 * it (so a pick from an imported file stays reachable to undo).
 */
export function useOfferedGroups<T extends string>(groups: readonly T[], keep: (group: T) => boolean = () => false): T[] {
  const ctx = useContentSources()
  return groups.filter((g) => {
    const source = SOURCE_GROUPS[g]
    return source === undefined || (ctx.sources as readonly string[]).includes(source) || keep(g)
  })
}

/** Whether any of `keys` (pool keys, ids) is custom content. */
export function holdsCustom(keys: readonly string[]): boolean {
  return keys.some((k) => sourceOfId(k) !== null)
}

/** Whether a picker may offer this id: stock, or from a loaded source. */
export function offerable(id: string, ctx: ContentContext): boolean {
  const s = sourceOfId(id)
  return s === null || ctx.sources.includes(s)
}

/**
 * The groups of a registry a picker offers, in registry order, dropping
 * entries from sources that aren't loaded. `keep` stays listed even so (the
 * value a select already holds, say from an imported parameters.txt), so the
 * select shows it beside its validation error rather than a blank.
 */
export function offeredGroups<T extends { id: string; group: string }>(
  defs: readonly T[],
  ctx: ContentContext,
  keep?: string
): Array<[string, T[]]> {
  const groups: Array<[string, T[]]> = []
  for (const def of defs) {
    if (!offerable(def.id, ctx) && def.id !== keep) continue
    const existing = groups.find(([name]) => name === def.group)
    if (existing) existing[1].push(def)
    else groups.push([def.group, [def]])
  }
  return groups
}

/** A label, marked when its source isn't loaded. */
export function offeredLabel(id: string, label: string, ctx: ContentContext): string {
  const s = sourceOfId(id)
  return s === null || ctx.sources.includes(s) ? label : `${label} (${SOURCE_LABELS[s]}, not loaded)`
}

/** Grouped `<option>`s for a select over a registry, gated by the loaded sources. */
export function GroupedOptions<T extends { id: string; group: string; label: string }>({
  defs,
  value
}: {
  defs: readonly T[]
  value?: string
}) {
  const ctx = useContentSources()
  return (
    <>
      {offeredGroups(defs, ctx, value).map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((t) => (
            <option key={t.id} value={t.id}>
              {offeredLabel(t.id, t.label, ctx)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
