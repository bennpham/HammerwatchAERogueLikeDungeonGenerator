// Survey how stock AE levels parameterise each WorldScript class: for every
// class, the param names, their SVAL shape, and a sample value. Output feeds
// docs/discovery and the AE node vocabulary in objects/nodes.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readLevel } from '../../src/generator/ae'

const root = process.argv[2]
const want = new Set((process.argv[3] ?? '').split(',').filter(Boolean))
const files: string[] = []
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.lvl')) files.push(p)
  }
}
for (const sc of ['castle_hammerwatch', 'shaftlocke_tower', 'sun_temple']) walk(join(root, sc, 'levels'))
const shapes = new Map<string, Map<string, { kind: string; sample: string; n: number }>>()
const counts = new Map<string, number>()
const meta = new Map<string, { trig: Set<number>; label: number; conn: number }>()
for (const f of files) {
  const { level } = readLevel(readFileSync(f, 'utf8'))
  for (const s of level.scripts) {
    if (want.size > 0 && !want.has(s.cls)) continue
    counts.set(s.cls, (counts.get(s.cls) ?? 0) + 1)
    const m = meta.get(s.cls) ?? { trig: new Set(), label: 0, conn: 0 }
    m.trig.add(s.triggerTimes); if (s.label) m.label++; if (s.connections.length) m.conn++
    meta.set(s.cls, m)
    const per = shapes.get(s.cls) ?? new Map()
    shapes.set(s.cls, per)
    for (const p of s.params) {
      const e = per.get(p.name) ?? { kind: p.kind, sample: JSON.stringify(p.value).slice(0, 70), n: 0 }
      e.n++
      per.set(p.name, e)
    }
  }
}
for (const [cls, per] of [...shapes].sort()) {
  const m = meta.get(cls)!
  console.log(`== ${cls} x${counts.get(cls)} trig=${[...m.trig].join('/')} labelled=${m.label} withConn=${m.conn}`)
  for (const [name, e] of [...per].sort()) console.log(`   ${name.padEnd(22)} ${e.kind.padEnd(8)} n=${String(e.n).padEnd(5)} ${e.sample}`)
}
