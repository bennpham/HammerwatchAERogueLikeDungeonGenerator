// List the units near a point in a level, nearest first.
//   node scripts/run-ts.mjs scripts/dev/near-unit.ts <level.lvl> <x> <y> [radius]
import { readFileSync } from 'node:fs'
import { readLevel } from '../../src/generator/ae/levelReader'

const [file, xs, ys, rs] = process.argv.slice(2)
const x = Number(xs)
const y = Number(ys)
const r = Number(rs ?? 120)
const { level } = readLevel(readFileSync(file, 'utf8'))
const near = level.units
  .map((u) => ({ u, d: Math.hypot(u.x - x, u.y - y) }))
  .filter((n) => n.d <= r && !n.u.path.startsWith(':'))
  .sort((a, b) => a.d - b.d)
for (const { u, d } of near.slice(0, 40)) console.log(`${Math.round(d).toString().padStart(4)}  ${u.x},${u.y}  ${u.path}`)
