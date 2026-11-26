// Dev probe: which Hammerwatch 2 enemy units a scenario could carry (experimental Load custom).
// For each actor unit, plans its copy the way an install would and reports
// the script classes AE lacks anywhere in its closure, its hp and its behavior.
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-actors.ts [folder prefix] [--ok]
import { HW2_UNITS } from '../../src/generator/catalog/hw2Assets.generated'
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'

const hw2Dir = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const aeDir = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const args = process.argv.slice(2)
const onlyOk = args.includes('--ok')
const prefix = args.find((a) => !a.startsWith('--')) ?? 'hw2/actors/'
const SKIP = /\/(npcs|bosses|critters|arena)\/|\/projectiles?\/|\/effects?\//

const dec = new TextDecoder()
for (const unit of HW2_UNITS.filter((u) => u.startsWith(prefix) && !SKIP.test(u))) {
  const plan = hw2CopyPlan(hw2Dir, aeDir, [unit])!
  const root = plan.files.find((f) => f.path === unit)
  const text = root === undefined ? '' : dec.decode(root.data)
  const behavior = /<behavior class="(\w+)"/.exec(plan.files.map((f) => dec.decode(f.data)).join('\n'))?.[1] ?? '-'
  const hp = /<int name="hp">([^<]+)<\/int>/.exec(text)?.[1] ?? '?'
  const missing = [...new Set(plan.errors.map((e) => /class (\w+)/.exec(e)?.[1] ?? e))]
  if (onlyOk && missing.length > 0) continue
  const kb = plan.files.reduce((n, f) => n + f.data.length, 0) / 1024
  console.log(`${missing.length === 0 ? 'OK ' : 'NO '} ${unit.padEnd(70)} ${behavior.padEnd(22)} hp=${hp.padEnd(22)} files=${plan.files.length} ${kb.toFixed(0)}KB ${missing.join(',')}`)
}
