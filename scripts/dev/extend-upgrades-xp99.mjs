// The level-99 upgrade experiment (2026-10-21, docs/discovery/upgrades-past-tier-5.md):
// extend the stat upgrade chains of a generated scenario's players/ copy to level 99.
// Usage: node scripts/dev/extend-upgrades-xp99.mjs <workDir>
//   workDir = a copy of <AE>/editor/generated/dungeon_1801046482; pack it with PACKAGER.exe -l.
// Edits the copy in place; stock files are read from unpacked_assets_66 for the categories and costs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const AE = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const STOCK = join(AE, 'unpacked_assets_66')
const WORK = process.argv[2]
const MAX = 99
if (!WORK || !existsSync(join(WORK, 'info.xml'))) throw new Error('bad work dir')

// ---------- minimal XML span parser ----------
function parse(text) {
  const root = { tag: '#root', children: [], start: 0, end: text.length }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = re.exec(text))) {
    if (!m[2]) continue // comment / PI
    const [all, close, tag, attrs, selfClose] = m
    if (close) {
      const top = stack.pop()
      if (!top || top.tag !== tag) throw new Error(`mismatched </${tag}> at ${m.index} (open: ${top && top.tag})`)
      top.closeStart = m.index
      top.end = m.index + all.length
      continue
    }
    const nameM = /name="([^"]*)"/.exec(attrs)
    const node = { tag, name: nameM ? nameM[1] : undefined, start: m.index, openEnd: m.index + all.length, children: [], parent: stack[stack.length - 1] }
    node.parent.children.push(node)
    if (selfClose) { node.closeStart = node.openEnd; node.end = node.openEnd } else stack.push(node)
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].tag}>`)
  return root
}
const inner = (text, n) => text.slice(n.openEnd, n.closeStart)
const child = (n, tag, name) => n.children.find((c) => c.tag === tag && (name === undefined || c.name === name))
function walk(n, fn) { fn(n); n.children.forEach((c) => walk(c, fn)) }

// ---------- chain model ----------
// level 1 = the chain dict itself (binds in skill>binds); levels 2+ = upgrades[] dicts (binds in binds)
function findChain(text, tree, prefix) {
  let found
  walk(tree, (n) => {
    if (found || n.tag !== 'dict') return
    const nm = child(n, 'string', 'name')
    if (nm && inner(text, nm) === `${prefix}?lvl=1`) found = n
  })
  if (!found) throw new Error(`chain ${prefix} not found`)
  const ups = child(found, 'array', 'upgrades')
  const levels = [found, ...ups.children.filter((c) => c.tag === 'dict')]
  return { dict: found, ups, levels }
}
function levelBinds(text, lvlNode, isFirst) {
  const b = isFirst ? child(child(lvlNode, 'dict', 'skill'), 'dict', 'binds') : child(lvlNode, 'dict', 'binds')
  const out = {}
  for (const c of b ? b.children : []) out[c.name] = { tag: c.tag, value: inner(text, c) }
  return out
}
const field = (text, lvlNode, tag, name) => { const c = child(lvlNode, tag, name); return c ? inner(text, c) : undefined }
function parseDesc(d) {
  const q = d.indexOf('?')
  if (q < 0) return { key: d, params: [] }
  return { key: d.slice(0, q), params: d.slice(q + 1).split('&').map((p) => p.split('=')) }
}
const fmtFloat = (v) => { const r = Math.round(v * 1000) / 1000; return Number.isInteger(r) ? r.toFixed(1) : String(r) }
const fmtNum = (v, likeStr) => (/\./.test(likeStr) ? String(Math.round(v * 1000) / 1000) : String(Math.round(v)))

// ---------- the edit ----------
const report = []
function extendChain(rel, prefix, opts = {}) {
  const path = join(WORK, rel)
  let text = readFileSync(path, 'utf8')
  const stockText = readFileSync(join(STOCK, rel), 'utf8')
  const stock = findChain(stockText, parse(stockText), prefix)
  // by array position: the `lvl` field is cosmetic and stock thief_dodge has a typo in it
  const stockByPos = stock.levels.map((l) => ({ category: field(stockText, l, 'string', 'category'), cost: field(stockText, l, 'int', 'cost') }))

  // pass 1: restore category/cost from stock, drop starting-level on the chain dict
  {
    const tree = parse(text)
    const ch = findChain(text, tree, prefix)
    const edits = []
    ch.levels.forEach((l, i) => {
      const s = stockByPos[i]
      if (!s || ch.levels.length !== stock.levels.length) throw new Error(`${rel} ${prefix}: level count differs from stock`)
      const cat = child(l, 'string', 'category'), cost = child(l, 'int', 'cost')
      edits.push([cat.openEnd, cat.closeStart, s.category], [cost.openEnd, cost.closeStart, s.cost])
      if (i === 0) { const sl = child(l, 'int', 'starting-level'); if (sl) edits.push([sl.start, sl.end + (text[sl.end] === ' ' ? 1 : 0), '']) }
    })
    edits.sort((a, b) => b[0] - a[0]).forEach(([a, b, s]) => { text = text.slice(0, a) + s + text.slice(b) })
  }

  // pass 2: append levels last+1..MAX
  const tree = parse(text)
  const ch = findChain(text, tree, prefix)
  const n = ch.levels.length
  const last = ch.levels[n - 1], prev = ch.levels[n - 2]
  const lastLvl = n
  const lastCost = Number(field(text, last, 'int', 'cost'))
  const lastCat = field(text, last, 'string', 'category')
  const newCat = lastCat.replace(/\d+$/, '5')
  // cumulative binds at prev and last level
  const cum = []
  let acc = {}
  ch.levels.forEach((l, i) => { acc = { ...acc, ...levelBinds(text, l, i === 0) }; cum.push(acc) })
  const bLast = cum[n - 1], bPrev = cum[n - 2]
  const lastBindNames = Object.keys(levelBinds(text, last, n === 1))
  const dLast = parseDesc(field(text, last, 'string', 'description'))
  const dPrev = parseDesc(field(text, prev, 'string', 'description'))
  const template = text.slice(last.start, last.end)
  // indentation between upgrade dicts
  const indentM = /\n([\t ]*)$/.exec(text.slice(0, last.start))
  const indent = indentM ? indentM[1] : '\t\t'

  const valueAt = (name, N) => {
    if (opts.value) { const v = opts.value(name, N, lastLvl); if (v !== undefined) return v }
    const a = Number(bLast[name].value), b = Number(bPrev[name] ? bPrev[name].value : bLast[name].value)
    return a + (N - lastLvl) * (a - b)
  }
  const descAt = (key, N) => {
    if (opts.desc) { const v = opts.desc(key, N, lastLvl); if (v !== undefined) return v }
    const a = Number(dLast.params.find((p) => p[0] === key)[1])
    const pp = dPrev.params.find((p) => p[0] === key)
    const b = pp ? Number(pp[1]) : a
    return fmtNum(a + (N - lastLvl) * (a - b), dLast.params.find((p) => p[0] === key)[1])
  }

  let added = ''
  for (let N = lastLvl + 1; N <= MAX; N++) {
    let t = template
    t = t.replace(/(<string name="name">)[^<]*(<\/string>)/, `$1${prefix}?lvl=${N}$2`)
    const desc = dLast.params.length ? `${dLast.key}?${dLast.params.map(([k]) => `${k}=${descAt(k, N)}`).join('&')}` : dLast.key
    t = t.replace(/(<string name="description">)[^<]*(<\/string>)/, `$1${desc}$2`)
    t = t.replace(/(<string name="category">)[^<]*(<\/string>)/, `$1${newCat}$2`)
    t = t.replace(/(<int name="cost">)[^<]*(<\/int>)/, `$1${lastCost + 100 * (N - lastLvl)}$2`)
    t = t.replace(/(<int name="lvl">)[^<]*(<\/int>)/, `$1${N}$2`)
    for (const name of lastBindNames) {
      const { tag, value } = bLast[name]
      const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
      const re = new RegExp(`(<${tag} name="${esc}">)[^<]*(</${tag}>)`)
      let nv
      if (tag === 'int') nv = String(Math.round(valueAt(name, N)))
      else if (tag === 'float') nv = fmtFloat(valueAt(name, N))
      else if (tag === 'string') nv = opts.string ? opts.string(name, value, N, valueAt) : value
      else throw new Error(`bind tag ${tag}`)
      t = t.replace(re, `$1${nv}$2`)
    }
    added += `\n\n${indent}${t}`
  }
  text = text.slice(0, last.end) + added + text.slice(last.end)
  writeFileSync(path, text)

  // self-check
  const check = findChain(text, parse(text), prefix)
  const lv = check.levels.map((l) => Number(field(text, l, 'int', 'lvl')))
  if (check.levels.length !== MAX || lv.slice(n).some((v, i) => v !== n + i + 1)) throw new Error(`${rel} ${prefix}: lvls ${lv.join(',')}`)
  if (child(check.dict, 'int', 'starting-level')) throw new Error(`${rel} ${prefix}: starting-level left`)
  for (const l of check.levels) if (!/^(misc|def|off|combo)[1-5]$/.test(field(text, l, 'string', 'category'))) throw new Error(`${rel} ${prefix}: bad category`)
  const top = check.levels[MAX - 1]
  const binds = levelBinds(text, top, false)
  report.push(`${rel.padEnd(42)} ${prefix.padEnd(14)} lvl ${lastLvl}->${MAX}  L99: ${Object.entries(binds).map(([k, v]) => `${k}=${v.value}`).join(' ')}  cost ${field(text, top, 'int', 'cost')}`)
}

const classes = ['paladin:pal', 'priest:priest', 'ranger:ran', 'sorcerer:sorc', 'thief:thief', 'warlock:warlock', 'wizard:wiz']
for (const c of classes) {
  const [dir, p] = c.split(':')
  extendChain(`players/${dir}/skills/${p}_misc_health.sval`, '.hp-uname')
  extendChain(`players/${dir}/skills/${p}_misc_mana.sval`, '.mana-uname')
  extendChain(`players/${dir}/skills/${p}_misc_armor.sval`, '.armor-uname')
}
// dodge: 50% at lvl 5 -> 99% at lvl 99
const dodge = (N, last) => 0.5 + (0.49 * (N - last)) / (MAX - last)
for (const rel of ['players/ranger/skills/ran_dodge.sval', 'players/thief/skills/thief_dodge.sval']) {
  extendChain(rel, '.dodge-uname', {
    value: (name, N, last) => (name === 'dodge-chance' ? dodge(N, last) : undefined),
    desc: (key, N, last) => (key === 'dodge-chance' ? String(Math.round(dodge(N, last) * 100)) : key === 'curr-dodge-chance' ? String(Math.round(dodge(N - 1, last) * 100)) : undefined)
  })
}
extendChain('players/shared/skills/shared_speed.sval', '.speed-uname')
extendChain('players/shared/skills/shared_speed_melee.sval', '.speed-uname')
for (const [rel, prefix] of [
  ['players/paladin/skills/pal_sword.sval', '.paldmg-uname'],
  ['players/priest/skills/priest_smite.sval', '.pridmg-uname'],
  ['players/ranger/skills/ran_bow.sval', '.rngdmg-uname'],
  ['players/sorcerer/skills/sorc_shard.sval', '.srcdmg-uname'],
  ['players/thief/skills/thief_knives.sval', '.thidmg-uname'],
  ['players/warlock/skills/warlock_dagger.sval', '.wardmg-uname'],
  ['players/wizard/skills/wiz_fireball.sval', '.wizdmg-uname']
]) extendChain(rel, prefix, {
  // the hit effect's size follows the explosion radius
  string: (name, value, N, valueAt) => (name === 'proj-fx' ? value.replace(/radius=\d+/, `radius=${Math.round(valueAt('proj-radius', N))}`) : value)
})
const comboBuff = (name, value, N) => value.replace(/(combo_(?:health|mana)_regen_level_)\d+/, `$1${N}`)
for (const prefix of ['.combo-time-uname', '.combo-nova-uname', '.combo-heal-uname', '.combo-mana-uname'])
  extendChain('players/shared/skills/shared_combo.sval', prefix, { string: comboBuff })

// combo buffs 6..99
{
  const path = join(WORK, 'tweak/buffs/buffs.sval')
  let text = readFileSync(path, 'utf8')
  for (const block of ['Combo_health_regen', 'Combo_mana_regen']) {
    const id = block.toLowerCase()
    const re = (k) => new RegExp(`%block ${block} ${id}_level_${k} (\\d+)`)
    const v5 = Number(re(5).exec(text)[1]), v4 = Number(re(4).exec(text)[1])
    let lines = ''
    for (let N = 6; N <= MAX; N++) lines += `\n%block ${block} ${id}_level_${N} ${v5 + (N - 5) * (v5 - v4)}`
    text = text.replace(re(5), (m) => m + lines)
    report.push(`buffs.sval ${block}: level_99 = ${v5 + (MAX - 5) * (v5 - v4)}`)
  }
  parse(text.replace(/^%.*$/gm, ''))
  writeFileSync(path, text)
}

// diamonds: 500 -> 500000
{
  const rel = 'items/pickups/money/diamond_red.unit'
  let text = readFileSync(join(STOCK, rel), 'utf8')
  const before = text
  text = text.replace('<int name="amount">500</int>', '<int name="amount">500000</int>').replace('+500</string>', '+500000</string>')
  if (text === before || !text.includes('500000</int>') || !text.includes('+500000<')) throw new Error('diamond edit failed')
  parse(text)
  mkdirSync(dirname(join(WORK, rel)), { recursive: true })
  writeFileSync(join(WORK, rel), text)
}

// info.xml name
{
  const path = join(WORK, 'info.xml')
  const text = readFileSync(path, 'utf8')
  const out = text.replace('<name>Dungeon #1801046482</name>', '<name>Dungeon #1801046482 (Lv99 test)</name>')
  if (out === text) throw new Error('info.xml name not found')
  writeFileSync(path, out)
}

console.log(report.join('\n'))
console.log('OK')
