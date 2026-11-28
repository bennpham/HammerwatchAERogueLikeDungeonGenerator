// Dev probe: where an arena's wave pickups and its boss land (the spike dungeon_11260014 crash).
//   node scripts/run-ts.mjs scripts/dev/probe-arena-pickups.ts [seed] [pickups 0|1] [cover 0|1]
import { applyFullyUpgraded, defaultParameters, generateDungeon, playerPresetById } from '../../src/generator'
import type { DungeonParameters, DungeonResult } from '../../src/generator'
import { parseSlotLabel } from '../../src/generator/campaign'
import { levelsOf } from '../../tests/ae'

const [seedArg, pickupsArg, coverArg] = process.argv.slice(2)
const seed = Number(seedArg ?? 11260014)
const p: DungeonParameters = defaultParameters()
p.playerTweaks = applyFullyUpgraded(playerPresetById('hw2-level-50')!.build())
const drops = [
  { item: 'upgrade_damage_2', count: 64 },
  { item: 'upgrade_defense_2', count: 40 },
  { item: 'upgrade_health_2', count: 20 },
  { item: 'upgrade_attackspeed_2', count: 20 },
  { item: 'potion_1', count: 10 },
  { item: 'potion_3', count: 10 },
  { item: 'health_4', count: 20 }
]
p.boss = {
  ...p.boss,
  enabled: true,
  fights: p.boss.fights.map((f, i) =>
    i === 0
      ? {
          ...f,
          arena: {
            ...f.arena,
            bossSelection: 'random',
            bossPool: ['hw2_doombringer'],
            bossCount: 1,
            cover: coverArg === '1' ? f.arena.cover : { ...f.arena.cover, density: 0 },
            waves: f.arena.waves.map((w, t) => (t === 0 && pickupsArg !== '0' ? { ...w, pickups: drops } : w))
          }
        }
      : f
  )
}
const order = p.levelOrder ?? []
const ab1 = order.find((slot) => JSON.stringify(slot) === JSON.stringify(parseSlotLabel('AB1')))
if (ab1 !== undefined) p.levelOrder = [order[0], ab1, ...order.slice(1).filter((slot) => slot !== ab1)]

const gen = generateDungeon(p, seed, { sources: ['hw2'] })
if (!gen.ok) throw new Error(gen.errors.join('; '))
const levels = levelsOf(gen as DungeonResult)
const [name, arena] = [...levels].find(([, l]) => l.units.some((u) => u.path.includes('doombringer')))!
const boss = arena.units.find((u) => u.path.includes('boss_doombringer'))!
const xs = arena.units.map((u) => u.x)
const ys = arena.units.map((u) => u.y)
console.log(`${name}: units ${arena.units.length}, scripts ${arena.scripts.length}, x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`)
console.log(`boss at ${boss.x},${boss.y}`)
const spawns = arena.scripts.filter((s) => s.cls === 'SpawnObject' || s.cls === 'SpawnUnit')
const items = arena.units.filter((u) => u.path.startsWith('items/'))
console.log(`item units ${items.length}, spawn scripts ${spawns.length}`)
const near = (x: number, y: number) => Math.hypot(x - boss.x, y - boss.y) < 60
console.log(`items within 60 px of the boss: ${items.filter((u) => near(u.x, u.y)).length}, spawns: ${spawns.filter((s) => near(s.x, s.y)).length}`)
const at = new Map<string, number>()
for (const u of items) at.set(`${u.x},${u.y}`, (at.get(`${u.x},${u.y}`) ?? 0) + 1)
console.log(`item positions: ${at.size} distinct for ${items.length} items; most stacked: ${Math.max(0, ...at.values())}`)
const kinds = new Map<string, number>()
for (const s of arena.scripts) kinds.set(s.cls, (kinds.get(s.cls) ?? 0) + 1)
console.log([...kinds].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', '))
const pickupScripts = arena.scripts.filter((s) => /Spawn|Item|Pickup/.test(s.cls))
const pos = new Map<string, number>()
for (const s of pickupScripts) pos.set(`${s.x},${s.y}`, (pos.get(`${s.x},${s.y}`) ?? 0) + 1)
console.log(`spawn-ish scripts ${pickupScripts.length} at ${pos.size} places; most at one place: ${Math.max(0, ...pos.values())}`)
console.log('sample', pickupScripts.slice(0, 3).map((s) => `${s.cls}@${s.x},${s.y} ${JSON.stringify(s.params).slice(0, 160)}`).join('\n'))
const itemSpawns = arena.scripts.filter((s) => s.cls === 'SpawnUnit' && String(s.params.find((q) => q.name === 'UnitType')?.value ?? '').startsWith('items/'))
const ip = new Map<string, number>()
for (const s of itemSpawns) ip.set(`${s.x},${s.y}`, (ip.get(`${s.x},${s.y}`) ?? 0) + 1)
console.log(`item SpawnUnits ${itemSpawns.length} at ${ip.size} places; within 64 px of the boss: ${itemSpawns.filter((s) => Math.hypot(s.x - boss.x, s.y - boss.y) < 64).length}`)
console.log(`item x ${Math.min(...itemSpawns.map((s) => s.x))}..${Math.max(...itemSpawns.map((s) => s.x))}, y ${Math.min(...itemSpawns.map((s) => s.y))}..${Math.max(...itemSpawns.map((s) => s.y))}`)
const spew = arena.scripts.filter((s) => s.cls === 'ProjectileSpewer')
console.log(`spewers within 64 px of the boss: ${spew.filter((s) => Math.hypot(s.x - boss.x, s.y - boss.y) < 64).length}; nearest ${Math.min(...spew.map((s) => Math.hypot(s.x - boss.x, s.y - boss.y))).toFixed(0)} px`)
