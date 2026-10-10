// Generate a scenario into a folder: node scripts/run-ts.mjs scripts/dev/gen.ts <outDir> [seed]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defaultParameters, generateDungeon } from '../../src/generator'

const [outDir, seedArg] = process.argv.slice(2)
const result = generateDungeon(defaultParameters(), seedArg === undefined ? 42 : Number(seedArg))
if (!result.ok) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
const root = join(outDir, result.campaignName)
for (const f of result.files) {
  const p = join(root, f.path)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content)
}
console.log(`wrote ${root}: ${result.files.map((f) => f.path).join(', ')}`)
