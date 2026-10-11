// Where stock levels hang torches relative to the horizontal wall pieces:
// for every torch, the vertical distance to the nearest `h_*` wall unit in
// the same column (within 16 px horizontally).
//   node scripts/run-ts.mjs scripts/dev/torch-survey.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readLevel } from '../../src/generator/ae/levelReader'

const AE = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const levels = [
  'castle_hammerwatch/levels/level_1.lvl',
  'castle_hammerwatch/levels/level_2.lvl',
  'castle_hammerwatch/levels/level_4.lvl',
  'castle_hammerwatch/levels/level_6.lvl'
]
const dys = new Map<string, number>()
const pieces = new Map<string, number>()
for (const rel of levels) {
  const { level } = readLevel(readFileSync(join(AE, 'scenarios', rel), 'utf8'))
  const walls = level.units.filter((u) => /^doodads\/walls\/[^/]+\/h_/.test(u.path))
  for (const t of level.units) {
    if (t.path !== 'doodads/generic/lamps/torch.unit') continue
    let best: { dy: number; path: string } | undefined
    for (const w of walls) {
      if (Math.abs(w.x - t.x) > 16) continue
      const dy = t.y - w.y
      if (Math.abs(dy) > 48) continue
      if (best === undefined || Math.abs(dy) < Math.abs(best.dy)) best = { dy, path: w.path }
    }
    const key = best === undefined ? 'none' : String(best.dy)
    dys.set(key, (dys.get(key) ?? 0) + 1)
    if (best !== undefined) {
      const p = best.path.replace(/^.*\//, '')
      pieces.set(p, (pieces.get(p) ?? 0) + 1)
    }
  }
}
console.log('torch.y - wall.y:', [...dys].sort((a, b) => b[1] - a[1]).slice(0, 12))
console.log('nearest wall piece:', [...pieces].sort((a, b) => b[1] - a[1]).slice(0, 12))
