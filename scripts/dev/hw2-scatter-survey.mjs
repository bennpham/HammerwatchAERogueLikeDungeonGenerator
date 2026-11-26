// Dev survey: Hammerwatch 2 terrain doodads as World scatter (experimental Load custom).
// Prints each unit's solid collision as the `solid` radius (tiles) the biomes
// use: 0 when nothing collides, else the half-extent of its collision box
// rounded up to whole tiles, measured the way the stock biomes were.
//   node scripts/dev/hw2-scatter-survey.mjs [folder under doodads, default terrain]
import fs from 'node:fs'
import path from 'node:path'
import { loadUnit } from '../lib/aeunit.mjs'

const root = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const dirs = fs.readdirSync(root).filter((d) => /^unpacked_assets_\d+$/.test(d)).sort()
const assets = path.join(root, dirs.at(-1))
const folder = process.argv[2] ?? 'terrain'
const dir = path.join(assets, 'doodads', folder)
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.unit')).sort()) {
  const u = loadUnit(assets, `doodads/${folder}/${f}`)
  let reach = 0
  for (const [x, y, w, h] of u.rects) reach = Math.max(reach, Math.abs(x), Math.abs(y), Math.abs(x + w), Math.abs(y + h))
  const solid = u.rects.length === 0 ? 0 : Math.max(1, Math.ceil(reach / 16))
  const size = u.sprites.length === 0 ? '-' : u.sprites.map((s) => `${s.frame[2]}x${s.frame[3]}`).slice(0, 2).join(',')
  console.log(`${f.padEnd(40)} solid=${solid} sprites=${u.sprites.length} ${size}`)
}
