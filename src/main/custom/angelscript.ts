/**
 * The top-level declarations of an AngelScript file, with where each sits, so a
 * scenario can carry one class or function cut out of another game's script
 * (experimental "Load custom"; docs/plans/hammerwatch-2-bosses.md). Pure.
 *
 * Not a parser: it skips comments and strings, matches braces, and reads each
 * top-level statement's header up to its body or `;`. Top level means outside
 * any brace, or directly inside a `namespace` body (namespaces nest and can be
 * reopened). That's all a copy needs: names, kinds and spans.
 */

export type DeclKind = 'class' | 'interface' | 'enum' | 'funcdef' | 'function' | 'variable'

export interface Decl {
  kind: DeclKind
  name: string
  /** enclosing namespaces, outermost first */
  namespace: string[]
  /** the declaration's span in the text, from its first token to its closing `}` or `;` */
  start: number
  end: number
}

/** `text` with comments and string literals blanked to spaces (newlines kept), offsets unchanged. */
export function maskScript(text: string): string {
  const out = text.split('')
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' '
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      const e = text.indexOf('\n', i)
      const end = e < 0 ? text.length : e
      blank(i, end)
      i = end
    } else if (c === '/' && next === '*') {
      const e = text.indexOf('*/', i + 2)
      const end = e < 0 ? text.length : e + 2
      blank(i, end)
      i = end
    } else if (c === '"' && text.startsWith('"""', i)) {
      const e = text.indexOf('"""', i + 3)
      const end = e < 0 ? text.length : e + 3
      blank(i, end)
      i = end
    } else if (c === '%' && (i === 0 || text[i - 1] === '\n' || /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i)))) {
      // the engine's preprocessor runs over scripts too: a %defblock … %endblock template is
      // only text until a %block expands it, and other % lines (%if, %endif…) aren't code
      const lineEnd = text.indexOf('\n', i)
      let end = lineEnd < 0 ? text.length : lineEnd
      if (text.startsWith('%defblock', i)) {
        const close = text.indexOf('%endblock', i)
        if (close >= 0) {
          const e = text.indexOf('\n', close)
          end = e < 0 ? text.length : e
        }
      }
      blank(i, end)
      i = end
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      const end = Math.min(text.length, j + 1)
      // keep the quotes so a string still reads as one token
      blank(i + 1, end - 1)
      i = end
    } else i++
  }
  return out.join('')
}

/** The index just past the brace matching the `{` at `open`, in masked text; the text's end if unmatched. */
function matchBrace(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return masked.length
}

const IDENT = /[A-Za-z_]\w*/g
const KEYWORDS = new Set(['const', 'shared', 'external', 'abstract', 'final', 'mixin', 'private', 'protected', 'funcdef', 'get', 'set', 'override'])

/** The name a function or funcdef header declares: the identifier right before its first `(`. */
function nameBeforeParen(header: string): string | null {
  const paren = header.indexOf('(')
  if (paren < 0) return null
  const ids = header.slice(0, paren).match(IDENT)
  if (ids === null) return null
  for (let k = ids.length - 1; k >= 0; k--) if (!KEYWORDS.has(ids[k])) return ids[k]
  return null
}

export function scriptDeclarations(text: string): Decl[] {
  const masked = maskScript(text)
  const decls: Decl[] = []
  const walk = (from: number, to: number, namespace: string[]): void => {
    let i = from
    while (i < to) {
      // the next statement's first token
      while (i < to && /\s/.test(masked[i])) i++
      if (i >= to) return
      if (masked[i] === ';' || masked[i] === '}') {
        i++
        continue
      }
      if (masked[i] === '#') {
        // a preprocessor line (#include, #if…): not a declaration
        const e = masked.indexOf('\n', i)
        i = e < 0 ? to : e + 1
        continue
      }
      const start = i
      // the header runs to the first top-level `{` or `;`, outside parentheses
      let paren = 0
      let j = i
      let bodyAt = -1
      let endAt = -1
      let sawEquals = false
      for (; j < to; j++) {
        const c = masked[j]
        if (c === '(') paren++
        else if (c === ')') paren--
        else if (paren === 0 && c === '=') sawEquals = true
        else if (paren === 0 && c === ';') {
          endAt = j + 1
          break
        } else if (paren === 0 && c === '{') {
          if (sawEquals) {
            // an initializer list: skip it and keep looking for the `;`
            j = matchBrace(masked, j) - 1
            continue
          }
          bodyAt = j
          break
        }
      }
      if (bodyAt < 0 && endAt < 0) return
      const header = masked.slice(start, bodyAt >= 0 ? bodyAt : endAt)
      const ns = /\bnamespace\s+([A-Za-z_]\w*)/.exec(header)
      if (ns !== null && bodyAt >= 0) {
        const close = matchBrace(masked, bodyAt)
        walk(bodyAt + 1, close - 1, [...namespace, ns[1]])
        i = close
        continue
      }
      const end = bodyAt >= 0 ? matchBrace(masked, bodyAt) : endAt
      const typeDecl = /\b(class|interface|enum)\s+([A-Za-z_]\w*)/.exec(header)
      let kind: DeclKind | null = null
      let name: string | null = null
      if (typeDecl !== null) {
        kind = typeDecl[1] as DeclKind
        name = typeDecl[2]
      } else if (/\bfuncdef\b/.test(header)) {
        kind = 'funcdef'
        name = nameBeforeParen(header)
      } else if (!sawEquals && header.includes('(') && bodyAt >= 0) {
        kind = 'function'
        name = nameBeforeParen(header)
      } else {
        // a global variable (or several: `int a, b;`): its name is the last identifier before `=` or `;`
        kind = 'variable'
        const lhs = header.split('=')[0]
        const ids = lhs.match(IDENT)
        name = ids === null ? null : ids[ids.length - 1]
      }
      if (name !== null) decls.push({ kind, name, namespace, start, end })
      i = end
    }
  }
  walk(0, masked.length, [])
  return decls
}

/** The identifiers a span of script uses, comments and strings aside. */
export function scriptIdentifiers(text: string): Set<string> {
  return new Set(maskScript(text).match(IDENT) ?? [])
}

/** The `Namespace::name` pairs a span of script uses (the innermost namespace of each). */
export function qualifiedNames(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of maskScript(text).matchAll(/\b([A-Za-z_]\w*)\s*::\s*([A-Za-z_]\w*)/g)) out.add(`${m[1]}::${m[2]}`)
  return out
}
