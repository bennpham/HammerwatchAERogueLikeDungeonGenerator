/**
 * The scripts a scenario must carry for another game's units to run in AE
 * (experimental "Load custom"; docs/plans/hammerwatch-2-bosses.md). Pure.
 *
 * AE compiles a scenario's scripts together with its own, and one compile
 * error stops every script (spike S2: the party stuck in the lobby, no doors,
 * no monsters). So what ships is as little as compiles:
 *
 *   - a class AE lacks ships as its whole file, when AE has no file at that
 *     path and declares none of the file's names (DashStrike.as);
 *   - otherwise only the declaration is cut out of its file, with its
 *     namespaces, into one `scripts/Hw2Compat.as` (HW2's `easeSineOut` lives in
 *     its Utils/Functions.as, which AE has its own of; HW2's
 *     CompositeActorTriggeredSkill.as also redefines three AE classes);
 *   - whatever a shipped piece names that the other game declares and AE
 *     doesn't follows the same way. A file AE has is never followed whole: its
 *     names are cut one by one, so Functions.as doesn't drag in HW2's
 *     inventory and quests.
 * Nothing replaces an AE file, and nothing AE declares is declared again.
 */
import { maskScript, qualifiedNames, scriptDeclarations, scriptIdentifiers } from './angelscript'
import type { Decl } from './angelscript'

export interface ScriptFile {
  path: string
  text: string
}

export interface ScriptIndex {
  files: ReadonlyMap<string, { text: string; decls: Decl[] }>
  /** name → where it's declared (several for overloads, or a name in several namespaces) */
  byName: ReadonlyMap<string, ReadonlyArray<{ path: string; decl: Decl }>>
}

export function indexScripts(files: Iterable<ScriptFile>): ScriptIndex {
  const out = new Map<string, { text: string; decls: Decl[] }>()
  const byName = new Map<string, Array<{ path: string; decl: Decl }>>()
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const decls = scriptDeclarations(f.text)
    out.set(f.path, { text: f.text, decls })
    for (const decl of decls) {
      let list = byName.get(decl.name)
      if (list === undefined) byName.set(decl.name, (list = []))
      list.push({ path: f.path, decl })
    }
  }
  return { files: out, byName }
}

/** What AE's scripts already have: every top-level name, and every file path. */
export interface ScriptBase {
  names: ReadonlySet<string>
  files: ReadonlySet<string>
}

export function scriptBase(index: ScriptIndex): ScriptBase {
  return { names: new Set(index.byName.keys()), files: new Set(index.files.keys()) }
}

export interface ScriptPlan {
  /** whole files, at their own paths */
  files: ScriptFile[]
  /** the declarations cut out of files AE has, as one file; null when there are none */
  compat: ScriptFile | null
  /** classes asked for that the other game doesn't declare either */
  missing: string[]
}

export const COMPAT_PATH = 'scripts/Hw2Compat.as'

/**
 * The script with its `override` keywords dropped. `override` only asks the
 * compiler to check that a method replaces one of its base class, so dropping
 * it changes nothing where it does, and lets the file compile where AE's base
 * lacks the method: HW2's ResistBuffSkill overrides `OnBuffApplied` and
 * `OnStackApplied`, which AE's skills don't have, and that one error stopped
 * every script (spike S5). AE then never calls those methods.
 *
 * It goes from every method, not just those AE's bases lack: AE then logs
 * "Missing override keyword on method" for each that does override, which is
 * only noise. Keeping it wherever AE's scripts name the method would be wrong
 * where AE names it in some other class than the base, and that is a compile
 * error, which stops every script.
 */
export function withoutOverride(text: string): string {
  const masked = maskScript(text)
  let out = ''
  let last = 0
  for (const m of masked.matchAll(/[ \t]*\boverride\b/g)) {
    out += text.slice(last, m.index)
    last = m.index + m[0].length
  }
  return out + text.slice(last)
}

/**
 * One edit that lets a carried file compile against AE's scripts: the first
 * `find` in the file (after `after`, when given) becomes `replace`.
 */
export interface ScriptPatch {
  path: string
  after?: string
  find: string
  replace: string
  /** what AE has differently */
  why: string
}

/** `text`, a piece of the file at `path`, with that file's patches applied; and the patches that found nothing in it. */
function patched(text: string, path: string, patches: readonly ScriptPatch[]): { text: string; unmatched: ScriptPatch[] } {
  const unmatched: ScriptPatch[] = []
  for (const p of patches) {
    if (p.path !== path) continue
    const from = p.after === undefined ? 0 : text.indexOf(p.after)
    const at = from < 0 ? -1 : text.indexOf(p.find, from)
    if (at < 0) {
      unmatched.push(p)
      continue
    }
    text = text.slice(0, at) + p.replace + text.slice(at + p.find.length)
  }
  return { text, unmatched }
}

/** Bounds the walk; the nine HW2 bosses need about a dozen pieces. */
export const MAX_SCRIPT_PIECES = 400

export function planScripts(
  classes: Iterable<string>,
  source: ScriptIndex,
  ae: ScriptBase,
  patches: readonly ScriptPatch[] = []
): ScriptPlan & { error?: string } {
  const theirsOnly = (name: string): boolean => !ae.names.has(name) && source.byName.has(name)
  const wholeOk = new Map<string, boolean>()
  const canShipWhole = (path: string): boolean => {
    let ok = wholeOk.get(path)
    if (ok === undefined) {
      const f = source.files.get(path)!
      ok = !ae.files.has(path) && f.decls.every((d) => !ae.names.has(d.name))
      wholeOk.set(path, ok)
    }
    return ok
  }

  const wholeFiles = new Set<string>()
  const cut = new Map<string, Decl[]>()
  /** a shipped piece's text, and the namespaces its unqualified names may resolve in */
  const queue: Array<{ text: string; scope: ReadonlySet<string> }> = []
  let pieces = 0
  const ship = (path: string, decl: Decl): void => {
    if (wholeFiles.has(path)) return
    const file = source.files.get(path)!
    if (canShipWhole(path)) {
      wholeFiles.add(path)
      pieces++
      queue.push({ text: file.text, scope: new Set(file.decls.flatMap((d) => d.namespace)) })
      return
    }
    let list = cut.get(path)
    if (list === undefined) cut.set(path, (list = []))
    if (list.includes(decl)) return
    list.push(decl)
    pieces++
    queue.push({ text: file.text.slice(decl.start, decl.end), scope: new Set(decl.namespace) })
  }
  /**
   * The declarations a use of `name` can mean. A global one by its bare name; a
   * namespaced one only as `Namespace::name`, or bare from inside that namespace:
   * a variable `n` in HW2's `Modifiers` isn't every `n` in its scripts.
   */
  const meant = (name: string, qualifier: string | null, scope: ReadonlySet<string>): Array<{ path: string; decl: Decl }> =>
    (source.byName.get(name) ?? []).filter(({ decl }) => {
      const inner = decl.namespace[decl.namespace.length - 1]
      if (qualifier !== null) return inner === qualifier
      return inner === undefined || scope.has(inner)
    })

  const missing: string[] = []
  for (const cls of [...new Set(classes)].sort()) {
    if (ae.names.has(cls)) continue
    const defs = meant(cls, null, new Set()).length > 0 ? meant(cls, null, new Set()) : (source.byName.get(cls) ?? [])
    if (defs.length === 0) missing.push(cls)
    for (const d of defs) ship(d.path, d.decl)
  }
  while (queue.length > 0) {
    if (pieces > MAX_SCRIPT_PIECES) {
      return { files: [], compat: null, missing, error: `more than ${MAX_SCRIPT_PIECES} script pieces to carry; stopped` }
    }
    const { text, scope } = queue.shift()!
    for (const id of scriptIdentifiers(text)) {
      if (!theirsOnly(id)) continue
      for (const d of meant(id, null, scope)) ship(d.path, d.decl)
    }
    for (const q of qualifiedNames(text)) {
      const [ns, id] = q.split('::')
      if (!theirsOnly(id)) continue
      for (const d of meant(id, ns, scope)) ship(d.path, d.decl)
    }
  }

  // a patch that no longer matches a whole file means the other game changed: compiling it
  // would fail and stop every script, so it's an error. (A cut declaration may simply not
  // contain the patched text, so those aren't checked.)
  const stale: string[] = []
  const files = [...wholeFiles].sort().map((path) => {
    const p = patched(withoutOverride(source.files.get(path)!.text), path, patches)
    for (const u of p.unmatched) stale.push(`${path}: "${u.find}"`)
    return { path, text: p.text }
  })
  // a whole file already carries whatever was also asked of it
  const cutPaths = [...cut.keys()].filter((p) => !wholeFiles.has(p)).sort()
  let compat: ScriptFile | null = null
  if (cutPaths.length > 0) {
    const parts: string[] = ['// Hammerwatch 2 declarations its scripts need and AE lacks, cut from the files named.\n']
    for (const path of cutPaths) {
      const text = source.files.get(path)!.text
      for (const d of [...cut.get(path)!].sort((a, b) => a.start - b.start)) {
        const body = patched(withoutOverride(text.slice(d.start, d.end)), path, patches).text
        const open = d.namespace.map((n) => `namespace ${n} { `).join('')
        const close = d.namespace.map(() => ' }').join('')
        parts.push(`// from ${path}\n${open}${body}${close}\n`)
      }
    }
    compat = { path: COMPAT_PATH, text: parts.join('\n') }
  }
  if (stale.length > 0) return { files, compat, missing, error: `script patches that no longer match: ${stale.join('; ')}` }
  return { files, compat, missing }
}
