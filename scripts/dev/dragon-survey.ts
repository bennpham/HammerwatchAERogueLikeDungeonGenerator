// How stock AE levels seat the two dragons against the wall above them: the
// dragon's y minus the lowest horizontal wall piece above it in its column.
//   node scripts/run-ts.mjs scripts/dev/dragon-survey.ts [extra.lvl ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readLevel } from '../../src/generator/ae/levelReader'

const AE = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const DRAGONS = ['actors/bosses/boss_dragon/boss_dragon.unit', 'actors/bosses/boss_dragon_hwr/dragon.unit']

const files: string[] = [...process.argv.slice(2)]
for (const sc of readdirSync(join(AE, 'scenarios'))) {
  const dir = join(AE, 'scenarios', sc, 'levels')
  if (!existsSync(dir)) continue
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.lvl')) files.push(p)
    }
  }
  walk(dir)
}
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  if (!DRAGONS.some((d) => text.includes(d))) continue
  const { level } = readLevel(text)
  for (const u of level.units.filter((x) => DRAGONS.includes(x.path))) {
    const walls = level.units.filter(
      (w) => /^doodads\/walls\//.test(w.path) && Math.abs(w.x - u.x) <= 24 && w.y < u.y && !/\/v(_16|_32)?\.unit$/.test(w.path)
    )
    const above = walls.sort((a, b) => b.y - a.y)[0]
    console.log(
      `${f.replace(/.*scenarios[\\/]/, '')}: ${u.path.split('/').pop()} at ${u.x},${u.y}; nearest wall above ${above?.path.split('/').pop()} at y ${above?.y} → dy ${above === undefined ? '?' : u.y - above.y}`
    )
  }
}
