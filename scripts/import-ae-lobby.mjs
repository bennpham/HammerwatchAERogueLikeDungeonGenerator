#!/usr/bin/env node
/**
 * Import a hand-made AE editor level as a lobby template.
 *
 *   node scripts/import-ae-lobby.mjs <level.lvl> --id <id> --label "<label>" [--description "<text>"]
 *
 * Adds (or replaces, by id) one entry in src/generator/lobby/templates.generated.ts,
 * embedding the level text verbatim. The generator rewrites the copy it emits:
 * exit, spawn, vendors and payout are found by script label or, failing that,
 * by structure — see docs/LOBBY-AUTHORING.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATES_REL, writeLobbyTemplate } from './lib/lobbyTemplates.mjs'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const file = process.argv[2]
const id = arg('id')
const label = arg('label') ?? id
const description = arg('description') ?? `Imported from ${path.basename(file ?? '')}.`
if (file === undefined || file.startsWith('--') || id === undefined) {
  console.error('usage: node scripts/import-ae-lobby.mjs <level.lvl> --id <id> --label "<label>" [--description "<text>"]')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
  console.error(`id "${id}" must be lowercase letters, digits, - or _`)
  process.exit(1)
}

const lvl = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
if (!lvl.includes('<string name="Class">DungeonGameMode</string>') && !lvl.includes('game-mode')) {
  console.error(`${file} does not look like an AE level`)
  process.exit(1)
}

const count = writeLobbyTemplate({ id, label, description, lvl })
console.log(`imported ${file} as "${id}" (${count} template(s) in ${TEMPLATES_REL})`)
