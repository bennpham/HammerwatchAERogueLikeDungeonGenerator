/**
 * Folders of the art families the generator names by set: wall sets
 * (`doodads/walls/<set>/`) and cliff sets (`doodads/cliffs/<set>/`).
 *
 * A stock AE set is a bare name (`prison`). A set from a custom source
 * (custom/sources.ts) is written `<source>:<name>` (`hw2:crypt`), and its folder
 * sits under that source's prefix (`hw2/doodads/walls/crypt`), where the scenario
 * ships it. These set keys are internal: they live in theme and biome data and
 * never appear in parameters.txt (whose content ids are `hw2_crypt`).
 */

import { CONTENT_SOURCES, sourcePathPrefix } from '../custom/sources'
import type { ContentSource } from '../custom/sources'

/** Splits a set key into its source (null for stock AE) and folder name. */
export function parseSetKey(set: string): { source: ContentSource | null; name: string } {
  const colon = set.indexOf(':')
  if (colon > 0) {
    const s = set.slice(0, colon)
    if ((CONTENT_SOURCES as readonly string[]).includes(s)) return { source: s as ContentSource, name: set.slice(colon + 1) }
  }
  return { source: null, name: set }
}

function setDir(family: string, set: string): string {
  const { source, name } = parseSetKey(set)
  const root = source === null ? '' : sourcePathPrefix(source)
  return `${root}doodads/${family}/${name}`
}

/** `prison` → `doodads/walls/prison`; `hw2:crypt` → `hw2/doodads/walls/crypt`. */
export function wallDir(set: string): string {
  return setDir('walls', set)
}

/** `basalt` → `doodads/cliffs/basalt`; `hw2:basalt` → `hw2/doodads/cliffs/basalt`. */
export function cliffDir(set: string): string {
  return setDir('cliffs', set)
}
