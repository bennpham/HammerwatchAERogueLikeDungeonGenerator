// One-off migration: rewrite HW1 monster/theme/music ids in TypeScript sources
// to their AE ids, using src/generator/catalog/substitutions.ts.
//   node scripts/run-ts.mjs scripts/dev/migrate-ids.ts <file.ts>...
import { readFileSync, writeFileSync } from 'node:fs'
import {
  MONSTER_SUBSTITUTIONS,
  MUSIC_SUBSTITUTIONS,
  translateMonsterKey,
  translateMusic,
  translateTheme
} from '../../src/generator/catalog/substitutions'

const monsterBases = new Set(Object.keys(MONSTER_SUBSTITUTIONS).map((k) => k.split('#')[0]))
const isMonsterKey = (s: string) => monsterBases.has(s.split('#')[0]) && /^[a-z0-9_]+(#\d+)?$/.test(s)
const HW1_THEME = /^(?:[a-i](?:_[a-z_]+)?|bonus[1-5])$/

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, 'utf8')
  let changes = 0
  let s = before.replace(/'([a-z0-9_#]+)'/g, (m, id: string) => {
    if (isMonsterKey(id)) {
      const ae = translateMonsterKey(id)
      if (ae !== id) changes++
      return `'${ae}'`
    }
    if (id in MUSIC_SUBSTITUTIONS) {
      changes++
      return `'${translateMusic(id)}'`
    }
    return m
  })
  // theme ids only where a theme is expected
  s = s.replace(/(\btheme:\s*)'([a-z0-9_]+)'/g, (m, pre: string, id: string) => {
    if (!HW1_THEME.test(id)) return m
    changes++
    return `${pre}'${translateTheme(id)}'`
  })
  s = s.replace(/(\bthemes:\s*\[)([^\]]*)\]/g, (_m, pre: string, body: string) => {
    const out = body.replace(/'([a-z0-9_]+)'/g, (mm, id: string) => {
      if (!HW1_THEME.test(id)) return mm
      changes++
      return `'${translateTheme(id)}'`
    })
    return `${pre}${out}]`
  })
  if (s !== before) writeFileSync(file, s)
  console.log(`${file}: ${changes} ids`)
}
