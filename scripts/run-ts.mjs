#!/usr/bin/env node
// Run a TypeScript dev script that imports generator code:
//   node scripts/run-ts.mjs scripts/dev/<file>.ts [args...]
// Bundles with esbuild (already installed as a vite dependency) into a temp
// .mjs next to the OS temp dir and executes it with the remaining args.
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const [entry, ...rest] = process.argv.slice(2)
if (!entry) {
  console.error('usage: run-ts.mjs <script.ts> [args...]')
  process.exit(1)
}
const outfile = path.join(os.tmpdir(), `hwae-${path.basename(entry, '.ts')}-${process.pid}.mjs`)
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' })
process.argv = [process.argv[0], outfile, ...rest]
await import(pathToFileURL(outfile).href)
