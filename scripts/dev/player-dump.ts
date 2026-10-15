// Print every AE player chain compactly: tier, column, cost and binds.
//   node scripts/run-ts.mjs scripts/dev/player-dump.ts [filter]
import { PLAYER_STOCK } from '../../src/generator/players/stock.generated'

const filter = process.argv[2] ?? ''
for (const c of PLAYER_STOCK.classes) {
  if (filter && !c.id.includes(filter) && filter !== 'classes') continue
  console.log(`class ${c.id}: ${Object.entries(c.stats).map(([k, v]) => `${k}=${v.stock}`).join(' ')}`)
}
for (const f of PLAYER_STOCK.skills) {
  if (filter && !f.path.includes(filter)) continue
  console.log(`# ${f.path}`)
  for (const ch of f.chains) {
    const tiers = ch.tiers.map((t, i) => {
      const binds = Object.entries(t.binds).map(([k, v]) => `${k}=${v.stock}`).join(',')
      return `${i + 1}:${t.category ?? 'start'}${t.cost ? `/${t.cost.stock}` : ''}${binds ? ` {${binds}}` : ''}`
    })
    console.log(`  ${ch.key} "${ch.name}"  ${tiers.join(' | ')}`)
  }
}
