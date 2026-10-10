import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'
import { parseParametersTxt, serializeParametersTxt } from '../../src/generator'
import { COLOSSEUM_PARAMETERS_TXT } from '../../src/generator/config/colosseumPreset'
function diff(a: any, b: any, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [`${path}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`]
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((k) => diff(a[k], b[k], `${path}.${k}`))
}
for (const id of ['desert', 'bonus', 'pre-alpha']) {
  const p = CAMPAIGN_PRESETS.find((x) => x.id === id)!.build()
  const back = parseParametersTxt(serializeParametersTxt(p)).params
  console.log(id, diff(p, back).slice(0, 8))
}
console.log('colosseum unknown', parseParametersTxt(COLOSSEUM_PARAMETERS_TXT).unknownKeys)
