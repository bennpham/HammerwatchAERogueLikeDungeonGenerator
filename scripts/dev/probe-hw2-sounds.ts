// Dev probe: the sound effects an HW2 unit's copy carries (experimental Load custom).
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-sounds.ts [unit path ...]
// Prints the copy's sounds.sbnk and its .ogg files' sizes; the default unit is a troll brute.
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'

const hw2Dir = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const aeDir = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const roots = process.argv.slice(2)
const plan = hw2CopyPlan(hw2Dir, aeDir, roots.length > 0 ? roots : ['hw2/actors/beasts/trolls/troll_brute.unit'])!
const dec = new TextDecoder()
const bank = plan.files.find((f) => f.path === 'hw2/sounds/sounds.sbnk')
console.log(bank === undefined ? '(no sounds.sbnk)' : dec.decode(bank.data))
const oggs = plan.files.filter((f) => f.path.endsWith('.ogg'))
console.log(`${oggs.length} .ogg files, ${(oggs.reduce((n, f) => n + f.data.length, 0) / 1024).toFixed(0)} KB`)
for (const f of oggs.slice(0, 5)) console.log(`  ${f.path} ${f.data.length} B, starts ${dec.decode(f.data.subarray(0, 4))}`)
console.log('errors:', plan.errors)
