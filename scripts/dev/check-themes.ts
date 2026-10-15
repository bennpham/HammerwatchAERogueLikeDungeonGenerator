import { THEME_DEFS } from '../../src/generator/config/themes'
import { AE_ENVIRONMENTS, AE_TILESET_SIZES, AE_UNITS } from '../../src/generator/catalog/aeAssets.generated'
const units = new Set(AE_UNITS)
for (const t of THEME_DEFS) {
  const miss: string[] = []
  for (const ts of [...t.floor, ...(t.mixed ?? [])]) if (!(ts in AE_TILESET_SIZES)) miss.push(ts)
  for (const e of t.environments) if (!AE_ENVIRONMENTS.includes(e)) miss.push(e)
  for (const set of [t.exitUpSet]) if (!units.has(`doodads/walls/${set}/exit_up.unit`)) miss.push(`${set}/exit_up`)
  for (const set of [t.exitDnSet]) if (!units.has(`doodads/walls/${set}/exit_dn.unit`)) miss.push(`${set}/exit_dn`)
  for (const m of ['bronze', 'silver', 'gold']) for (const o of ['h', 'v']) if (!units.has(`doodads/doors/door_${o}_mid_${m}_${t.doors}.unit`)) miss.push(`door ${o} ${m} ${t.doors}`)
  console.log(t.id.padEnd(16), miss.length === 0 ? 'ok' : miss.join(', '))
}
