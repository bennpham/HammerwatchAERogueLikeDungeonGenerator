/**
 * Unpack a scenario `.h1c` (scripts/lib/h1c.ts):
 *
 *   node scripts/run-ts.mjs scripts/unpack-h1c.ts <pack.h1c> <outDir> [path ...]
 *
 * Writes every file, or only the paths given, under `outDir`. Compiled levels
 * come out as text SVAL the editor and scripts/render-level.mjs read; other
 * compiled files (units, textures) are written as they are packed, which is not
 * their source form. `info.xml` is the scenario's info as text SVAL.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { levelText, readH1c } from './lib/h1c'

const [pack, outDir, ...wanted] = process.argv.slice(2)
if (pack === undefined || outDir === undefined) {
  console.error('usage: unpack-h1c.ts <pack.h1c> <outDir> [path ...]')
  process.exit(1)
}
const { info, files } = readH1c(readFileSync(pack))
const missing = wanted.filter((p) => !files.has(p))
if (missing.length > 0) {
  console.error(`not in ${pack}: ${missing.join(', ')}`)
  process.exit(1)
}
const write = (rel: string, data: string | Uint8Array): void => {
  const out = join(outDir, rel)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, data)
}
if (wanted.length === 0) write('info.xml', info)
let n = 0
for (const [path, file] of files) {
  if (wanted.length > 0 && !wanted.includes(path)) continue
  write(path, path.endsWith('.lvl') ? levelText(file) : file.data)
  n++
}
console.log(`unpacked ${n} file(s) from ${pack} into ${outDir}`)
