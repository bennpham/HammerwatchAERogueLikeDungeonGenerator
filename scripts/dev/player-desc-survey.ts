// Checks the player snapshot against the install and lists description
// arguments that no bind of the same tier explains (alias candidates).
//   node scripts/run-ts.mjs scripts/dev/player-desc-survey.ts
import fs from 'node:fs'
import path from 'node:path'
import { PLAYER_STOCK } from '../../src/generator/players/stock.generated'

const assets = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition/unpacked_assets_66'
const lines = (rel: string) => fs.readFileSync(path.join(assets, rel), 'utf8').split(/\r?\n/)
let bad = 0
let costs = 0
const unexplained = new Map<string, Set<string>>()
for (const f of PLAYER_STOCK.skills) {
  const L = lines(f.path)
  for (const c of f.chains) {
    for (const t of c.tiers) {
      const vals = [...Object.entries(t.binds), ...(t.cost ? [['cost', t.cost] as const] : [])]
      if (t.cost) costs++
      for (const [name, v] of vals) {
        const l = L[v.line - 1] ?? ''
        if (!l.includes(`name="${name}"`)) { bad++; console.log('MISS', f.path, v.line, name, l.trim()) }
      }
      if (t.description) {
        const q = t.description.text.split('?')[1] ?? ''
        for (const kv of q.split('&')) {
          const [k] = kv.split('=')
          const base = k.replace(/^curr-/, '')
          if (!(base in t.binds)) {
            const set = unexplained.get(base) ?? new Set()
            set.add(`${f.stem}[${Object.keys(t.binds).join(',')}]`)
            unexplained.set(base, set)
          }
        }
      }
    }
  }
}
const C = lines('players/classes.sval')
for (const c of PLAYER_STOCK.classes) for (const [n, v] of Object.entries(c.stats)) if (!C[v.line - 1].includes(n)) { bad++; console.log('MISS class', c.id, n) }
console.log('bad', bad, 'costs', costs)
for (const [k, s] of unexplained) console.log(k, '<-', [...s].slice(0, 4).join(' '), s.size)
