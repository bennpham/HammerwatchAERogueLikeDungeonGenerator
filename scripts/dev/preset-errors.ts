import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'
import { validateParameters } from '../../src/generator'
const seen = new Map<string, Set<string>>()
for (const p of CAMPAIGN_PRESETS) {
  const errs = validateParameters(p.build()).errors
  for (const e of errs) {
    const msg = (e.message ?? String(e)).replace(/^Mystery button \d+ \("[^"]*"\): /, '').replace(/Wave \d+ entry/, 'Wave entry')
    if (!seen.has(msg)) seen.set(msg, new Set())
    seen.get(msg)!.add(p.id)
  }
}
for (const [m, ids] of seen) console.log(m, '  <-', [...ids].join(','))
