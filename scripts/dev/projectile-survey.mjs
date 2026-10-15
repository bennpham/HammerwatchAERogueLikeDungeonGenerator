// Projectile units a wall spewer could fire: behaviour class, speed, damage.
// Feeds src/generator/objects/projectileTypes.ts.
import { findAeAssets, preprocess } from '../lib/aeunit.mjs'
const { assets } = findAeAssets()
const list = process.argv.slice(2)
for (const p of list) {
  const x = preprocess(assets, p)
  const cls = /<behavior class="([^"]+)"/.exec(x)?.[1] ?? '-'
  const speed = /<float name="speed">([\d.]+)/.exec(x)?.[1] ?? '-'
  const dmg = [...x.matchAll(/<int name="(physical|magical|dmg|damage)">(\d+)/g)].map((m) => `${m[1]}=${m[2]}`).slice(0, 3).join(',') || '-'
  const buff = /<string name="buff">([^<]+)/.exec(x)?.[1] ?? ''
  console.log([p, cls, speed, dmg, buff].join(' | '))
}
