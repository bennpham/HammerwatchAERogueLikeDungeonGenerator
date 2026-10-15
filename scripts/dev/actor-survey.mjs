// Survey every actor unit: behaviour class, hp, bestiary name, loot table.
// Feeds the AE monster roster (src/generator/objects/monsterTypes.ts).
import { findAeAssets, preprocess } from '../lib/aeunit.mjs'
import fs from 'node:fs'
import path from 'node:path'
const { assets } = findAeAssets()
const out = []
const walk = (rel) => {
  for (const e of fs.readdirSync(path.join(assets, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) walk(r)
    else if (r.endsWith('.unit')) out.push(r)
  }
}
walk('actors')
for (const u of out.sort()) {
  const x = preprocess(assets, u)
  const cls = /<behavior class="([^"]+)"/.exec(x)?.[1] ?? '-'
  if (!/ActorBehavior|Boss|Tower|Spawner|Composite/.test(cls)) continue
  const hp = /<int name="hp">(\d+)/.exec(x)?.[1] ?? '?'
  const name = /<string name="beastiary-name">([^<]+)/.exec(x)?.[1] ?? ''
  const loot = /<string name="loot">([^<]+)/.exec(x)?.[1] ?? ''
  const bossbar = /boss/i.test(cls) ? 'BOSS' : ''
  console.log([u.replace('actors/', '').replace('.unit', ''), cls, hp, name, loot, bossbar].join('\t'))
}
