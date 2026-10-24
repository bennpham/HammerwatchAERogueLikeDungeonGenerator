/**
 * SVAL text — the XML-shaped format Hammerwatch Anniversary Edition uses for
 * levels (`.lvl`), scenario info and most data files.
 *
 * A value is one element: `dict`, `array`, `string`, `int`, `float`, `bool`,
 * `vec2`, `vec3`, `vec4`, `ivec2`, `ivec3`, `ivec4`, `bytes`, `color` or
 * `null` (the game's own data files use `ivec2` for time windows). Children of a `dict`
 * carry a `name` attribute; children of an `array` do not. Booleans are `t` /
 * `f`. The editor indents with tabs and ends lines with LF.
 *
 * Reading keeps every value's tag (`SvalNode`) because a level's unit and
 * script arrays are positional and mix types. Writing goes through
 * `SvalWriter`, which builds the text line by line so the output matches the
 * editor's own layout. Ported from hw2ae's `sval.py`. Pure: no fs.
 */

export const SVAL_SCALAR_TAGS = new Set([
  'string',
  'int',
  'float',
  'bool',
  'vec2',
  'vec3',
  'vec4',
  'ivec2',
  'ivec3',
  'ivec4',
  'bytes',
  'color',
  'null'
])

export interface SvalNode {
  tag: string
  name?: string
  /** raw (unescaped) text of a scalar; empty for containers */
  text: string
  children: SvalNode[]
  /** 1-based line of the opening tag, for patching a stock file in place */
  line?: number
  /** 1-based line of the closing tag (the opening line when self-closing) */
  endLine?: number
}

/** Child of a dict by name, or undefined. */
export function svalGet(node: SvalNode | undefined, name: string): SvalNode | undefined {
  return node?.children.find((c) => c.name === name)
}

export function svalString(node: SvalNode | undefined): string | undefined {
  return node === undefined ? undefined : node.text.trim()
}

export function svalInt(node: SvalNode | undefined): number | undefined {
  return node === undefined ? undefined : Number.parseInt(node.text.trim(), 10)
}

export function svalNumbers(node: SvalNode | undefined): number[] {
  if (node === undefined) return []
  const s = node.text.trim()
  return s === '' ? [] : s.split(/\s+/).map(Number)
}

export function svalBool(node: SvalNode | undefined): boolean | undefined {
  if (node === undefined) return undefined
  const s = node.text.trim().toLowerCase()
  return s === 't' || s === 'true' || s === '1'
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Parse SVAL text into a node tree. A small hand-rolled tokenizer rather than
 * a DOM parser so the generator stays free of browser/Node globals.
 */
export function parseSval(text: string): SvalNode {
  let src = text
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g
  const root: SvalNode = { tag: '#root', text: '', children: [] }
  const stack: SvalNode[] = [root]
  let last = 0
  let line = 1
  let counted = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(src)) !== null) {
    const between = src.slice(last, m.index)
    for (let i = counted; i < m.index; i++) if (src.charCodeAt(i) === 10) line++
    counted = m.index
    last = tagRe.lastIndex
    const top = stack[stack.length - 1]
    if (between.length > 0 && SVAL_SCALAR_TAGS.has(top.tag)) top.text += unescapeXml(between)
    if (m[2] === undefined) continue // comment or declaration
    const closing = m[1] === '/'
    const tag = m[2]
    const selfClosing = m[4] === '/'
    if (closing) {
      const open = stack.pop()
      if (open === undefined || open.tag !== tag) {
        throw new Error(`SVAL: </${tag}> does not close <${open?.tag ?? 'nothing'}>`)
      }
      open.endLine = line
      continue
    }
    const nameMatch = /\bname\s*=\s*"([^"]*)"/.exec(m[3] ?? '')
    const node: SvalNode = { tag, text: '', children: [], line }
    if (nameMatch !== null) node.name = unescapeXml(nameMatch[1])
    top.children.push(node)
    if (selfClosing) node.endLine = line
    else stack.push(node)
  }
  if (stack.length !== 1) throw new Error(`SVAL: <${stack[stack.length - 1].tag}> is never closed`)
  const first = root.children[0]
  if (first === undefined) throw new Error('SVAL: empty document')
  return first
}

/**
 * Integers print without a decimal point, everything else with up to three
 * decimals — what the AE editor writes.
 */
export function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v)
  let s = v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (s === '-0') s = '0'
  return s
}

/**
 * Builds SVAL text with tab indentation. `open`/`close` wrap containers; the
 * scalar helpers write one line each. Pass `name` inside a dict, leave it out
 * inside an array.
 */
export class SvalWriter {
  private lines: string[] = []
  private depth = 0

  private attr(name: string | undefined): string {
    return name === undefined ? '' : ` name="${escapeXml(name)}"`
  }

  line(text: string): void {
    this.lines.push('\t'.repeat(this.depth) + text)
  }

  open(tag: 'dict' | 'array', name?: string): void {
    this.line(`<${tag}${this.attr(name)}>`)
    this.depth++
  }

  close(tag: 'dict' | 'array'): void {
    this.depth--
    this.line(`</${tag}>`)
  }

  scalar(tag: string, value: string, name?: string): void {
    this.line(`<${tag}${this.attr(name)}>${value}</${tag}>`)
  }

  string(value: string, name?: string): void {
    this.scalar('string', escapeXml(value), name)
  }

  int(value: number, name?: string): void {
    this.scalar('int', String(Math.trunc(value)), name)
  }

  float(value: number, name?: string): void {
    this.scalar('float', fmtNum(value), name)
  }

  bool(value: boolean, name?: string): void {
    this.scalar('bool', value ? 't' : 'f', name)
  }

  vec2(x: number, y: number, name?: string): void {
    this.scalar('vec2', `${fmtNum(x)} ${fmtNum(y)}`, name)
  }

  vec3(x: number, y: number, z: number, name?: string): void {
    this.scalar('vec3', `${fmtNum(x)} ${fmtNum(y)} ${fmtNum(z)}`, name)
  }

  bytes(hex: string, name?: string): void {
    this.scalar('bytes', hex, name)
  }

  null(): void {
    this.line('<null/>')
  }

  text(): string {
    return this.lines.join('\n') + '\n'
  }
}
