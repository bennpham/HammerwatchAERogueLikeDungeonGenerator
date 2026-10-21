// Where each lobby template's teleporters and exits are, and the stock bazaar's pads.
//   node scripts/run-ts.mjs scripts/dev/lobby-portals.ts
import { readLevel } from '../../src/generator/ae/levelReader'
import { LOBBY_TEMPLATES } from '../../src/generator/lobby/templates.generated'
import { readStockLevel } from '../../tests/aeInstall'

for (const t of LOBBY_TEMPLATES) {
  const { level } = readLevel(t.lvl)
  const pads = level.units.filter((u) => u.path.startsWith('doodads/generic/teleport'))
  const exits = level.scripts.filter((s) => s.label === 'lobby:exit').map((s) => s.cls)
  const spawn = level.scripts.find((s) => s.cls === 'LevelStart')
  console.log(
    t.id,
    'pads',
    pads.map((u) => `${u.path.split('/').pop()}@${u.x / 16},${u.y / 16}`).join(' ') || '-',
    'labelled exits',
    exits.join(',') || '-',
    'spawn',
    spawn && `${spawn.x / 16},${spawn.y / 16}`
  )
}

const { level } = readLevel(readStockLevel('sun_temple/levels/sun_temple/level_hub.lvl'))
for (const u of level.units.filter((v) => v.path.startsWith('doodads/generic/teleport') || /circle|emblem|sun_|pad/.test(v.path))) {
  console.log('stock', u.path, u.x / 16, u.y / 16, JSON.stringify(u.state ?? {}).slice(0, 120))
}
