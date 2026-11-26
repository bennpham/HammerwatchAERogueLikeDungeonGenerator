// Dev probe: the largest files in one Hammerwatch 2 unit's copy, and who names them.
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-closure.ts hw2/actors/beasts/trolls/troll_brute.unit [count]
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'
import { extractRefs } from '../../src/main/custom/refs'

const hw2Dir = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const aeDir = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const [root, count = '15'] = process.argv.slice(2)
const plan = hw2CopyPlan(hw2Dir, aeDir, [root])!
const dec = new TextDecoder()
const namedBy = new Map<string, string[]>()
for (const f of plan.files) {
  if (!/\.(unit|inc|effect|sval|tileset)$/.test(f.path)) continue
  for (const r of extractRefs(dec.decode(f.data))) {
    const target = r.path.startsWith('hw2/') ? r.path : `hw2/${r.path}`
    namedBy.set(target, [...(namedBy.get(target) ?? []), f.path])
  }
}
console.log(`${plan.files.length} files, ${(plan.files.reduce((n, f) => n + f.data.length, 0) / 1048576).toFixed(1)} MB, errors: ${plan.errors.join('; ') || 'none'}`)
for (const f of [...plan.files].sort((a, b) => b.data.length - a.data.length).slice(0, Number(count))) {
  console.log(`${(f.data.length / 1024).toFixed(0).padStart(7)} KB  ${f.path}  <- ${(namedBy.get(f.path) ?? ['(relative)']).slice(0, 2).join(', ')}`)
}
