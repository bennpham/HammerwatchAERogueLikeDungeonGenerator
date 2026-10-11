// Print the floor hashes tests/monsters.test.ts "pins the layout RNG stream"
// expects, for re-baselining after a deliberate change to floor output.
//   node scripts/run-ts.mjs scripts/dev/layout-hash.ts
import { createHash } from 'node:crypto'
import { defaultParameters, generateDungeon } from '../../src/generator'

for (const seed of [1234, 987654]) {
  const params = defaultParameters()
  params.levelLock = undefined
  params.boss.enabled = false
  params.levelTimers = undefined
  params.levelTraps = undefined
  params.floorMusic = undefined
  params.lobbies = []
  delete params.levelOrder
  params.levels = 8
  params.themes = ['prison', 'prison', 'armory', 'armory', 'archives', 'archives', 'chambers', 'chambers']
  params.levelMonsters = [
    ['bat', 'tick', 'maggot'],
    ['bat', 'tick', 'slime', 'maggot'],
    ['slime', 'skeleton_warrior', 'maggot'],
    ['eye', 'skeleton_warrior', 'skeleton_archer', 'skeleton_ranger'],
    ['wisp', 'skeleton_warrior', 'skeleton_ranger', 'eye'],
    ['skeleton_warrior', 'skeleton_ranger', 'skeleton_soldier', 'wisp'],
    ['skeleton_soldier', 'skeleton_ranger', 'skeleton_lich'],
    ['skeleton_soldier', 'skeleton_lich']
  ]
  const result = generateDungeon(params, seed)
  if (!result.ok) throw new Error(result.errors.join('; '))
  const digest = createHash('sha256')
  for (const file of result.files) {
    if (!/\/floor\d+\.lvl$/.test(file.path)) continue
    digest.update(`${file.path} ${file.content} `)
  }
  console.log(seed, digest.digest('hex'))
}
