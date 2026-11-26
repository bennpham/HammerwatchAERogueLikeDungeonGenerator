// Dev probe: what a scenario carries for each Hammerwatch 2 theme (experimental Load custom).
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-copy.ts [--notes] [hw2 dir] [ae dir]
import { generateDungeon, defaultParameters } from '../../src/generator'
import type { DungeonResult } from '../../src/generator'
import { THEME_DEFS } from '../../src/generator/config/themes'
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'

const args = process.argv.slice(2)
const showNotes = args.includes('--notes')
const [hw2Dir = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2', aeDir = 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'] =
  args.filter((a) => a !== '--notes')

for (const theme of THEME_DEFS.filter((t) => t.source === 'hw2')) {
  const p = defaultParameters()
  p.themes = p.themes.map(() => theme.id)
  const r = generateDungeon(p, 1, { sources: ['hw2'] })
  if (!r.ok) {
    console.log(theme.id, 'failed:', r.errors.join('; '))
    continue
  }
  const plan = hw2CopyPlan(hw2Dir, aeDir, (r as DungeonResult).customAssets)!
  const bytes = plan.files.reduce((n, f) => n + f.data.length, 0)
  const flag3 = plan.files.filter((f) => f.flag === 3).length
  console.log(
    `${theme.id.padEnd(18)} roots=${(r as DungeonResult).customAssets.length} files=${plan.files.length} ` +
      `(${(bytes / 1048576).toFixed(1)} MB, ${flag3} compiled) keptAe=${plan.keptAe.length} notes=${plan.notes.length} errors=${plan.errors.length}`
  )
  if (showNotes) {
    for (const n of [...plan.notes, ...plan.errors]) console.log(`  ${n}`)
    console.log(`  kept at AE: ${plan.keptAe.join(' ')}`)
  }
}
