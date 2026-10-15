// Write the floors of the layout-hash plan (seed 1234) to a folder, to diff
// two versions of the generator.
//   node scripts/run-ts.mjs scripts/dev/dump-floors.ts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultParameters, generateDungeon } from '../../src/generator'

const out = process.argv[2]
const params = defaultParameters()
params.levelLock = undefined
params.boss.enabled = false
params.levelTimers = undefined
params.levelTraps = undefined
params.floorMusic = undefined
params.lobbies = []
delete params.levelOrder
params.levels = 4
params.themes = ['prison', 'armory', 'archives', 'chambers']
params.levelMonsters = [['bat', 'tick'], ['slime'], ['eye'], ['wisp']]
const result = generateDungeon(params, 1234)
if (!result.ok) throw new Error(result.errors.join('; '))
mkdirSync(out, { recursive: true })
for (const f of result.files) if (/floor\d+\.lvl$/.test(f.path)) writeFileSync(join(out, f.path.replace(/.*\//, '')), f.content)
