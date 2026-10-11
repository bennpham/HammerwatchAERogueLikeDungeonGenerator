import { readFileSync } from 'node:fs'
import { readLevel } from '../../src/generator/ae/levelReader'
const { level } = readLevel(readFileSync(process.argv[2], 'utf8'))
const xs = level.units.map((u) => u.x), ys = level.units.map((u) => u.y)
const x0 = Math.floor(Math.min(...xs) / 16) - 1, y0 = Math.floor(Math.min(...ys) / 16) - 1
const x1 = Math.ceil(Math.max(...xs) / 16) + 1, y1 = Math.ceil(Math.max(...ys) / 16) + 1
const W = x1 - x0 + 1, H = y1 - y0 + 1
const g = Array.from({ length: H }, () => Array(W).fill(' '))
const put = (u: any, c: string, dy = 0) => { const x = Math.floor(u.x / 16) - x0, y = Math.floor(u.y / 16) - y0 + dy; if (g[y]?.[x] !== undefined) g[y][x] = c }
for (const u of level.units) {
  if (u.path.startsWith('doodads/walls/')) put(u, '#', /\/(v|v_16|v_32|cap_n|cap_s)\.unit$/.test(u.path) ? 1 : 0)
  else if (u.path.includes('shop_')) put(u, 'S')
  else if (u.path.includes('teleport')) put(u, 'T')
  else if (u.path.startsWith('doodads/doors/')) put(u, 'D')
  else if (!u.path.startsWith(':')) put(u, '.')
}
for (const s of level.scripts) if (s.cls === 'LevelStart') { const x = Math.floor(s.x / 16) - x0, y = Math.floor(s.y / 16) - y0; g[y][x] = '@' }
console.log('origin', x0, y0, 'size', W, H)
console.log(g.map((r, i) => String(i + y0).padStart(4) + ' ' + r.join('')).join('\n'))
for (const s of level.scripts) if (s.cls === 'LevelStart' || s.cls === 'SetRespawnPoint') console.log(s.cls, s.x, s.y)
for (const u of level.units) if (u.path.includes('teleport') || u.path.includes('shop_')) console.log(u.path, u.x, u.y, u.id)
for (const s of level.scripts.filter((s) => s.cls === 'UseTrigger')) console.log('use', s.id, JSON.stringify(s.params))
for (const u of level.units.filter((u) => u.path.startsWith(':'))) console.log(u.path, u.x, u.y, u.id, JSON.stringify(u.state))
