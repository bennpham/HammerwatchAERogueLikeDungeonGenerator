// Where a campaign's lock buttons landed, against their room and wall bitmap —
// for checking a button is on visible floor.
//   node scripts/run-ts.mjs scripts/dev/lock-button-probe.ts <presetId> <seed> [compareDir]
// compareDir: a folder of installed .lvl files to byte-compare floors against.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'
import { generateDungeon } from '../../src/generator'

const [presetId, seedText, compareDir] = process.argv.slice(2)
const preset = CAMPAIGN_PRESETS.find((p) => p.id === presetId)
if (preset === undefined) throw new Error(`no preset ${presetId}`)
const result = generateDungeon(preset.build(), Number(seedText))
if (!result.ok) throw new Error(result.errors.join('; '))

if (compareDir !== undefined && existsSync(compareDir)) {
  for (const name of readdirSync(compareDir)) {
    const ours = result.files.find((f) => f.path.endsWith(`/${name}`))
    const same = ours !== undefined && ours.content === readFileSync(join(compareDir, name), 'utf8')
    console.log(`${name}: ${ours === undefined ? 'missing' : same ? 'identical' : 'DIFFERS'}`)
  }
}

for (const file of result.files) {
  if (!file.path.endsWith('.lvl')) continue
  const units = file.content.match(/<array name="doodads\/doors\/boss_door_button\.unit">[\s\S]*?\n\t\t<\/array>/)
  if (units === null) continue
  const stem = file.path.replace(/.*\//, '')
  for (const p of units[0].matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)) {
    const tx = Number(p[1]) / 16
    const ty = Number(p[2]) / 16
    console.log(`${stem}: button at tile ${tx.toFixed(2)},${ty.toFixed(2)}`)
  }
}

// rooms of every floor preview, with the wall rows under each room's south edge
for (const level of result.levels) {
  const wall = (x: number, y: number) => level.walls[y * level.mapWidth + x] === '1'
  for (const r of level.rooms) {
    const southWall = Array.from({ length: 4 }, (_, i) => r.y + r.height - 2 + i).filter((y) => wall(r.x + 1, y))
    console.log(`L${level.label} room ${r.x},${r.y} ${r.width}x${r.height} ${r.type}${r.locked ? ' locked' : ''} wall rows near south: ${southWall.join(',')}`)
  }
}
