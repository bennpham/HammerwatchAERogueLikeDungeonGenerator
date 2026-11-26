/**
 * Content from outside Anniversary Edition ("Load custom", experimental). For now
 * the only source is Hammerwatch 2: a player points the app at their HW2 install,
 * and HW2 themes, monsters, biomes and music become available. The scenario then
 * ships the HW2 files it uses under the `hw2/` prefix
 * (docs/discovery/hammerwatch-2-assets.md).
 *
 * Whether a source is loaded is CONTEXT, never a parameter: it only decides
 * whether parameters that name custom content are valid. Generation never reads
 * it, so the same parameters and seed give the same bytes with or without it
 * (invariant 1). Custom content is told apart by its id prefix (`hw2_crypt`) and
 * asset paths by their path prefix (`hw2/doodads/…`), so no lookup is needed.
 */

export type ContentSource = 'hw2'

export const CONTENT_SOURCES: readonly ContentSource[] = ['hw2']

/** What the run has loaded besides AE itself. */
export interface ContentContext {
  sources: readonly ContentSource[]
}

/** Stock AE only: the default everywhere. */
export const AE_ONLY: ContentContext = { sources: [] }

/** Display names, for messages and the UI. */
export const SOURCE_LABELS: Readonly<Record<ContentSource, string>> = {
  hw2: 'Hammerwatch 2'
}

/** The id prefix of a source's content (`hw2_crypt`). */
export function sourceIdPrefix(source: ContentSource): string {
  return `${source}_`
}

/** The path prefix a source's files ship under (`hw2/tilesets/…`). */
export function sourcePathPrefix(source: ContentSource): string {
  return `${source}/`
}

/** The source a content id belongs to, or null for stock AE content. */
export function sourceOfId(id: string): ContentSource | null {
  for (const s of CONTENT_SOURCES) if (id.startsWith(sourceIdPrefix(s))) return s
  return null
}

/** The source an asset path belongs to, or null for a stock AE path. */
export function sourceOfPath(path: string): ContentSource | null {
  for (const s of CONTENT_SOURCES) if (path.startsWith(sourcePathPrefix(s))) return s
  return null
}

/** Whether content with this id can be used in this run (stock content always can). */
export function isAvailable(id: string, ctx: ContentContext): boolean {
  const s = sourceOfId(id)
  return s === null || ctx.sources.includes(s)
}

/**
 * The validation message for custom content whose source isn't loaded, or null
 * when the id is usable. `what` names the kind of thing ("theme", "monster").
 */
export function unavailableMessage(id: string, ctx: ContentContext, what: string): string | null {
  const s = sourceOfId(id)
  if (s === null || ctx.sources.includes(s)) return null
  const label = SOURCE_LABELS[s]
  return `"${id}" is ${label} content. Load your ${label} folder with Load custom, or pick another ${what}.`
}
