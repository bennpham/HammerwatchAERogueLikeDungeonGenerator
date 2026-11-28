// Dev probe: what copying every curated HW2 monster at once ships (experimental Load custom).
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-roster.ts
import { MONSTER_TYPES } from '../../src/generator/objects/monsterTypes'
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'

const hw2Dir = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const aeDir = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const hw2 = MONSTER_TYPES.filter((t) => t.source === 'hw2')
const plan = hw2CopyPlan(hw2Dir, aeDir, hw2.flatMap((t) => t.tiers))!
const mb = (fs: typeof plan.files) => (fs.reduce((n, f) => n + f.data.length, 0) / 1048576).toFixed(1)
const oggs = plan.files.filter((f) => f.path.endsWith('.ogg'))
const scripts = plan.files.filter((f) => f.path.startsWith('scripts/'))
const bank = new TextDecoder().decode(plan.files.find((f) => f.path === 'hw2/sounds/sounds.sbnk')?.data ?? new Uint8Array())
console.log(`${hw2.length} monsters: ${plan.files.length} files, ${mb(plan.files)} MB`)
console.log(`sounds: ${(bank.match(/<sound /g) ?? []).length} entries, ${oggs.length} .ogg, ${mb(oggs)} MB`)
console.log(`scripts carried: ${scripts.length} files`)
console.log(`errors: ${plan.errors.length}, notes: ${plan.notes.length}`)
const sizes = [...bank.matchAll(/<!-- ([^ ]+) -->\n  <sound [^>]*>\n((?:    <source[^\n]*\n)*)/g)].map((m) => [m[1], (m[2].match(/<source/g) ?? []).length] as const)
sizes.sort((a, b) => b[1] - a[1])
console.log(sizes.slice(0, 12).map(([e, n]) => `${n} ${e}`).join('\n'))
