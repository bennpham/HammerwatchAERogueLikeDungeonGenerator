import { readFileSync } from 'node:fs'
import { readLevel } from '../../src/generator/ae/levelReader'
const { level } = readLevel(readFileSync(process.argv[2], 'utf8'))
console.log('env', level.environment, 'tiles', level.tileCells.length, 'units', level.units.length, 'scripts', level.scripts.length, 'prefabs', level.prefabs.length)
const byPath = new Map<string, number>()
for (const u of level.units) byPath.set(u.path, (byPath.get(u.path) ?? 0) + 1)
console.log([...byPath].map(([p, n]) => `${n} ${p}`).join('\n'))
console.log('tilesets', [...new Set(level.tileCells.flatMap((c: any) => c.datasets.map((d: any) => d.tileset)))].join(' '))
for (const s of level.scripts) console.log(s.id, s.cls, s.label ?? '', JSON.stringify(s.params).slice(0, 220), JSON.stringify(s.connections))
for (const p of level.prefabs) console.log('prefab', JSON.stringify(p).slice(0, 200))
