// Torches per generated level at each density, for the default campaign.
//   node scripts/run-ts.mjs scripts/dev/torch-count.ts
import { defaultParameters, generateDungeon, TORCH_DENSITIES } from '../../src/generator'

for (const density of TORCH_DENSITIES) {
  const params = { ...defaultParameters(), torches: density }
  const result = generateDungeon(params, 4242)
  if (!result.ok) throw new Error(result.errors.join('; '))
  const counts = result.files
    .filter((f) => f.path.endsWith('.lvl'))
    .map((f) => `${f.path.replace(/.*\//, '').replace('.lvl', '')}:${(f.content.match(/lamps\/torch\.unit/g) ?? []).length === 0 ? 0 : (f.content.split('lamps/torch.unit')[1].split('</array>')[0].match(/<vec2>/g) ?? []).length}`)
  console.log(density.padEnd(7), counts.join(' '))
}
