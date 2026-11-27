/**
 * The asset paths a game text file names (`.unit`, `.inc`, `.tileset`,
 * `.effect`, `.sval`, `.env`…), with where each sits in the text so a copy can
 * rewrite it in place. Pure.
 *
 * Paths appear in a few shapes (read off HW2's and AE's files):
 *   - quoted attributes: `texture="doodads/generic/deco/props_table.png"`,
 *     `material="system/default.mats:floor"` (a file, then `:` and an entry),
 *     `src="./glass.unit:beer"`, `icon="system/icons.png;352;96;32;32"`;
 *   - element text: `<string name="projectile">actors/…/arrow.unit</string>`;
 *   - preprocessor lines: `%include "doodads/walls/h_32.inc"` (also unquoted),
 *     `%replace SFX_HIT actors/…/hit.effect`.
 * A path may hold spaces (`tilesets/crypt_tile_white_a 32.tileset`). One that
 * starts `./` or `../` is relative: the engine resolves it against the folder
 * of the unit being loaded, not of the `.inc` the text came from (the shared
 * wall include `doodads/walls/h_32.inc` draws `./base.png` from each set's
 * own folder).
 *
 * Only spans ending in a known asset extension count, so scene names
 * (`src="bread"`), numbers and sound events are never taken for paths.
 */

export interface Ref {
  /** as written, without a `:entry` or `;args` tail */
  path: string
  /** the span of `path` in the text */
  start: number
  end: number
  relative: boolean
  /** the `:entry` after the path, when there is one (`system/default.mats:floor` → `floor`) */
  entry?: string
}

const ASSET_EXT = /\.(?:unit|inc|png|effect|sval|tileset|env|mats|pfb|fbx|tif|tga|brush|sbnk|ogg|wav|gui|fnt|ttf|otf|dds|jpg|txt)$/i

/** Text extensions worth reading for further references; everything else is a leaf. */
const TEXT_EXT = /\.(?:unit|inc|effect|sval|tileset|env|mats|pfb|brush|sbnk|gui|fnt|txt)$/i

export function isTextAsset(path: string): boolean {
  return TEXT_EXT.test(path)
}

/** Quoted strings, element text, and the argument of a %include / %replace line. */
// an include may open a quote it never closes: HW2's boss_dace_arden.inc has
// `%include "actors/bosses/dace_arden/_boss_dace_arden_states.inc`, which the engine reads
const SEGMENT = /"([^"\r\n]*)"|>([^<\r\n]*)<|^[ \t]*%(?:include[ \t]+"?|replace[ \t]+\S+[ \t]+)([^"\r\n]+?)"?[ \t]*$/gm

/**
 * `text` with every XML comment blanked to spaces (newlines kept), so offsets
 * still line up: the engine never reads a commented-out block, so what it names
 * isn't a reference and the classes it uses aren't needed.
 */
export function maskComments(text: string): string {
  const blank = (c: string): string => c.replace(/[^\n]/g, ' ')
  // XML comments, and the preprocessor's `%//` comment lines
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, blank).replace(/^[ \t]*%\/\/.*$/gm, blank)
}

export function extractRefs(text: string): Ref[] {
  const out: Ref[] = []
  for (const m of maskComments(text).matchAll(SEGMENT)) {
    const group = m[1] !== undefined ? 1 : m[2] !== undefined ? 2 : 3
    const seg = m[group]
    if (seg === undefined || seg === '') continue
    // the segment's offset in the text: past the opening quote or `>`, or found in the line
    const segStart = group === 3 ? m.index + m[0].lastIndexOf(seg) : m.index + 1
    // a segment may chain pieces with `;` (icon args), `:` (a .mats/.sbnk/.unit
    // entry) or `?` (effect arguments, `smoke_4.effect?scale=0.3`); the split
    // keeps the separators, at the odd indexes
    const parts = seg.split(/([;:?])/)
    let at = 0
    for (let i = 0; i < parts.length; i += 2) {
      const piece = parts[i]
      const lead = piece.length - piece.trimStart().length
      const path = piece.trim()
      const start = segStart + at + lead
      at += piece.length + (parts[i + 1]?.length ?? 0)
      if (path === '' || !ASSET_EXT.test(path) || path.startsWith('event')) continue
      const ref: Ref = { path, start, end: start + path.length, relative: path.startsWith('./') || path.startsWith('../') }
      const entry = parts[i + 1] === ':' ? parts[i + 2]?.trim() : undefined
      if (entry !== undefined && entry !== '') ref.entry = entry
      out.push(ref)
    }
  }
  return out
}

/** `dir` joined with a relative path, `.` and `..` resolved; null if it climbs out of the root. */
export function resolveRelative(dir: string, rel: string): string | null {
  const parts = dir === '' ? [] : dir.split('/')
  for (const p of rel.split('/')) {
    if (p === '.' || p === '') continue
    if (p === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else parts.push(p)
  }
  return parts.join('/')
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
