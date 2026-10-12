import { generateDungeon, defaultFloorLock, defaultFloorLockMystery, defaultFloorTraps } from '../../src/generator'
import { readLevel } from '../../src/generator/ae/levelReader'
import { plainParameters } from '../../tests/params'
function bare() {
  const p = plainParameters(); p.levels = 4; p.themes = p.themes.slice(0, 4); p.levelMonsters = p.levelMonsters.slice(0, 4)
  p.levelTimers = undefined; p.levelTraps = Array.from({ length: 4 }, () => defaultFloorTraps()); p.levelLock = Array.from({ length: 4 }, () => defaultFloorLock())
  p.lobbies = []; p.boss = { ...p.boss, enabled: false }; p.playerTweaks = {}
  p.levelLock[1] = { enabled: true, buttons: 2 }
  return p
}
// floor 2's file: `<position>_floor2.lvl`, `_boss` when it has a floor boss
const lvl = (r: any) => readLevel(r.files.find((f: any) => /_floor2(_boss)?\.lvl$/.test(f.path)).content).level
const off = lvl(generateDungeon(bare(), 4242))
const d = bare(); d.levelLockMystery = Array.from({ length: 4 }, () => defaultFloorLockMystery()); d.levelLockMystery[1] = { count: 0, pool: [], disguise: true }
const on = lvl(generateDungeon(d, 4242))
console.log('units', off.units.length, on.units.length, 'scripts', off.scripts.length, on.scripts.length)
for (let i = 0; i < Math.max(off.units.length, on.units.length); i++) {
  const a = JSON.stringify(off.units[i]), b = JSON.stringify(on.units[i]); if (a !== b) console.log('U', i, a, '\n   ', b)
}
for (let i = 0; i < Math.max(off.scripts.length, on.scripts.length); i++) {
  const a = JSON.stringify(off.scripts[i]), b = JSON.stringify(on.scripts[i]); if (a !== b) console.log('S', i, a?.slice(0, 300), '\n   ', b?.slice(0, 300))
}
const norm = (l: any) => ({
  tiles: JSON.stringify(l.tileCells),
  units: l.units.map((u: any) => (u.path.includes('button') ? JSON.stringify({ id: u.id, x: Math.floor(u.x / 16), y: Math.floor(u.y / 16) }) : JSON.stringify(u))).sort(),
  env: l.environment, prefabs: JSON.stringify(l.prefabs)
})
const A = norm(off), B = norm(on)
console.log('tiles eq', A.tiles === B.tiles, 'env', A.env === B.env, 'prefabs', A.prefabs === B.prefabs)
console.log('unit diffs', A.units.filter((x: string, i: number) => x !== B.units[i]).slice(0, 4), B.units.filter((x: string, i: number) => x !== A.units[i]).slice(0, 4))
