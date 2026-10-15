import { validateParameters } from '../../src/generator'
import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'
const pre = CAMPAIGN_PRESETS.find((p) => p.id === 'claude-pandemonium')!
for (const s of [42, 46, 48, 50]) {
  const p = pre.build()
  const a = p.boss.fights[0].arena
  a.minWidth = s; a.minHeight = s; a.maxWidth = Math.max(a.maxWidth, s); a.maxHeight = Math.max(a.maxHeight, s)
  console.log(s, validateParameters(p).errors.map((e) => e.message.slice(0, 60)))
}
