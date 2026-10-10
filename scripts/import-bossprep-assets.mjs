#!/usr/bin/env node
/**
 * Regenerates the committed template module of src/generator/bossprep/:
 *
 *   template.ts   the boss prep room level XML, verbatim, as a string literal
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the prep room ships
 * as committed data rather than something read from the Steam folder at
 * runtime.
 *
 * Unlike scripts/import-lobby-assets.mjs, there is no fallback-authoring mode
 * and no --asset handling: the prep room is always imported from the real
 * hand-authored level, and it references stock assets only (checked in game
 * 2026-08-10 — see docs/plans/boss-tab.md §"Verified mechanics"), so there is
 * nothing for an assets.ts to carry.
 *
 * Usage:
 *
 *   node scripts/import-bossprep-assets.mjs --from "<HW>/editor/<campaign>" \
 *        [--level levels/test_non_related_to_map/test_boss_prep_room.xml]
 *
 * `buildLobby()` (src/generator/lobby/build.ts) finds the vendor stalls, the
 * diamonds and the exit by the id constants at the bottom of template.ts and
 * nothing else, so an import *derives* those ids from the file it just read
 * (see deriveMeta) rather than hardcoding them. A re-import therefore stays
 * correct without anyone editing the generated file by hand; if the source
 * level is missing a stall, an exit or its diamonds, the derivation throws
 * instead of emitting a template that would fail later inside the generator.
 *
 * Since issue #48 this template is one of two entries `LOBBY_PRESETS`
 * (src/generator/lobby/presets.ts) can point a lobby slot at — it is no
 * longer welded to a boss fight — but it is still generated into its own
 * bossprep/ directory rather than moved under lobby/, so a re-import here
 * changes nothing else about that file's layout.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'bossprep')

// --------------------------------------------------------- id derivation

/** The prefix a stall's `cats` entries use, e.g. `off3` -> the offense stall. */
const CATS_PREFIX = { power: 'power', off: 'offense', misc: 'misc', def: 'defense', combo: 'combo' }

const DIAMOND_ITEM = 'items/valuable_diamond_red.xml'

/** ids at or above this are buildBossPrep's to allocate for diamonds */
const DIAMOND_ID_BASE = 10000

/** ids buildBossPrep allocates for the arrival-respawn rig (BOSSPREP_RESPAWN_ID_BASE in build.ts) */
const RESPAWN_ID_BASE = 9000

/** The body of `<dictionary name="x">` / `<array name="x">`, brackets excluded. */
function section(xml, tag, name) {
  const open = `<${tag} name="${name}">`
  const start = xml.indexOf(open)
  if (start === -1) throw new Error(`level has no <${tag} name="${name}">`)

  const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g')
  scan.lastIndex = start
  let depth = 0
  let match
  while ((match = scan.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) return xml.slice(start + open.length, match.index)
  }
  throw new Error(`level's <${tag} name="${name}"> is not closed`)
}

/**
 * Every `{ id, type, x, y, body }` in a doodads/actors/nodes body.
 *
 * `body` is the element's whole text, nested `parameters` and `shape` included,
 * so it is found by counting `<dictionary>` depth rather than by regex — the
 * same way buildBossPrep locates an element at generation time.
 */
function elements(body) {
  const out = []
  const header =
    /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>[\s\S]*?<vec2 name="pos">(-?[\d.]+) (-?[\d.]+)<\/vec2>/g

  let m
  while ((m = header.exec(body)) !== null) {
    const scan = /<dictionary\b[^>]*>|<\/dictionary>/g
    scan.lastIndex = m.index
    let depth = 0
    let tag
    while ((tag = scan.exec(body)) !== null) {
      depth += tag[0].startsWith('</') ? -1 : 1
      if (depth === 0) break
    }
    if (tag === null) throw new Error(`element ${m[1]} is not closed`)

    out.push({
      id: Number(m[1]),
      type: m[2],
      x: Number(m[3]),
      y: Number(m[4]),
      body: body.slice(m.index, tag.index)
    })
    header.lastIndex = tag.index
  }
  return out
}

/**
 * The ids buildBossPrep needs, read back out of an imported level.
 *
 * A stall is found by its ShopArea's `cats` prefix, not by position: `cats` is
 * the value buildBossPrep rewrites, so anchoring on it means a template whose
 * stalls have been moved around still imports correctly. The doodads that make
 * up the stall are then the ones standing on the same spot as its vendor.
 *
 * Ported from scripts/import-lobby-assets.mjs's deriveMeta — kept a separate
 * copy rather than shared, because the two importers are one-shot scripts
 * (never imported by src/generator/** The eight free upgrade pickups, in the order UPGRADE_KINDS lists them. */
const UPGRADE_KINDS = ['damage', 'defense', 'health', 'mana', 'damage2', 'defense2', 'health2', 'mana2']

/** `mana2` -> `items/upgrade_mana_2.xml`, matching upgradeItemPath in surgery.ts. */
function upgradeItemPath(kind) {
  return `items/upgrade_${kind.replace(/2$/, '_2')}.xml`
}

/**
 * Where each free upgrade kind sits, read off the authored level.
 *
 * One slot per kind: the authored copies are a position map, not a count — how
 * many actually appear is the dungeon master's setting, and anything above one
 * stacks on the slot. A kind the level does not place is fatal rather than
 * defaulted, for the same reason a missing diamond is: a silently-zeroed slot
 * would drop pickups at 0,0 in the middle of the room.
 */
function deriveUpgradeSlots(xml) {
  const items = section(xml, 'dictionary', 'items')
  const each = /<array><int>\d+<\/int><vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2><\/array>/
  const slots = {}

  for (const kind of UPGRADE_KINDS) {
    const path = upgradeItemPath(kind)
    let body
    try {
      body = section(items, 'array', path)
    } catch {
      throw new Error(`level places no ${path} to use as the ${kind} upgrade slot`)
    }
    const first = each.exec(body)
    if (first === null) throw new Error(`${path} is present but places nothing`)
    slots[kind] = [Number(first[1]), Number(first[2])]
  }

  return slots
}

/**) and a shared module would only add
 * indirection for code that is read once per re-import.
 */
function deriveMeta(xml) {
  const doodads = elements(section(xml, 'array', 'doodads'))
  const nodes = elements(section(xml, 'array', 'nodes'))

  const ids = {}
  for (const node of nodes) {
    if (node.type !== 'ShopArea') continue

    const cats = /<string name="cats">([^<]*)<\/string>/.exec(node.body)
    if (cats === null) throw new Error(`ShopArea ${node.id} has no cats`)
    const key = CATS_PREFIX[cats[1].split(' ')[0].replace(/\d+$/, '')]
    if (key === undefined) throw new Error(`ShopArea ${node.id} sells unknown cats "${cats[1]}"`)
    if (ids[key] !== undefined) throw new Error(`two ShopAreas sell ${key}`)

    const shape = /<dictionary name="shape">\s*<int-arr name="static">(\d+)<\/int-arr>/.exec(node.body)
    if (shape === null) throw new Error(`ShopArea ${node.id} has no static shape`)

    const vendor = doodads.find((d) => d.type === `doodads/special/vendor_${key}.xml`)
    if (vendor === undefined) throw new Error(`no vendor_${key} doodad for ShopArea ${node.id}`)
    const on = (d) => d.x === vendor.x && d.y === vendor.y
    const speech = doodads.find((d) => on(d) && d.type === `doodads/special/vendor_speech_${key}.xml`)
    if (speech === undefined) throw new Error(`no vendor_speech_${key} doodad on the ${key} stall`)
    const badge = doodads.find((d) => on(d) && /vendor_speech_level\d+\.xml$/.test(d.type))

    ids[key] = {
      shape: Number(shape[1]),
      shop: node.id,
      vendor: vendor.id,
      speech: speech.id,
      // a single-column stall wears no tier number; buildBossPrep leaves it alone
      badge: badge === undefined ? null : badge.id
    }
  }
  if (Object.keys(ids).length === 0) throw new Error('level has no ShopArea nodes')

  const exits = nodes.filter((n) => n.type === 'LevelExitArea')
  if (exits.length !== 1) throw new Error(`expected exactly one LevelExitArea, found ${exits.length}`)

  // The authored diamonds are only a slot map — buildBossPrep replaces the lot.
  // They are listed out of order in the editor's output, so take the distinct
  // spots in reading order and let the count come from the player's starting
  // gold.
  const items = section(xml, 'dictionary', 'items')
  const seen = new Set()
  const slots = []
  const each = /<array><int>(\d+)<\/int><vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2><\/array>/g
  for (const stack of section(items, 'array', DIAMOND_ITEM).matchAll(each)) {
    const [x, y] = [Number(stack[2]), Number(stack[3])]
    const at = `${x} ${y}`
    if (seen.has(at)) continue
    seen.add(at)
    slots.push([x, y])
  }
  if (slots.length === 0) throw new Error(`level places no ${DIAMOND_ITEM} to use as diamond slots`)
  slots.sort((a, b) => a[1] - b[1] || a[0] - b[0])

  // buildBossPrep also inserts the four-node arrival-respawn rig at a fixed id base,
  // which an authored level must therefore stay below
  const overRig = [...xml.matchAll(/<int name="id">(\d+)<\/int>/g)]
    .map((m) => Number(m[1]))
    .filter((id) => id >= RESPAWN_ID_BASE)
  if (overRig.length > 0) {
    throw new Error(`level uses id ${Math.max(...overRig)}, at or above the respawn rig's ${RESPAWN_ID_BASE}`)
  }

  // buildBossPrep allocates diamond ids from a base rather than reusing the
  // authored ones, so the base has to clear everything the file already uses
  const used = [...xml.matchAll(/<int name="id">(\d+)<\/int>/g)].map((m) => Number(m[1]))
  const base = Math.max(DIAMOND_ID_BASE, Math.ceil((Math.max(...used) + 1) / 1000) * 1000)

  return { ids, exit: exits[0].id, slots, base, upgradeSlots: deriveUpgradeSlots(xml) }
}

// ----------------------------------------------------------------- emitting

/**
 * Editor output, made safe to carry as a committed string.
 *
 * The editor writes UTF-8 with a BOM and CRLF endings. A template literal
 * normalizes CRLF to LF when TypeScript parses it, so doing it here keeps the
 * committed source and the string it produces the same thing; the BOM would
 * otherwise sit invisibly in the middle of a .ts file.
 */
function clean(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

function literal(text) {
  if (text.includes('`') || text.includes('${')) {
    throw new Error('template contains a backtick or ${ and cannot be emitted as a template literal')
  }
  return `\`${text.replace(/\\/g, '\\\\')}\``
}

function emitTemplate(xml, source, meta) {
  const slots = meta.slots.map(([x, y]) => `  [${x}, ${y}]`).join(',\n')
  const upgradeSlots = UPGRADE_KINDS.map(
    (kind) => `  ${kind}: [${meta.upgradeSlots[kind][0]}, ${meta.upgradeSlots[kind][1]}]`
  ).join(',\n')
  const vendorIds = Object.keys(meta.ids)
    .sort()
    .map((key) => {
      const v = meta.ids[key]
      return `  ${key}: { shape: ${v.shape}, shop: ${v.shop}, vendor: ${v.vendor}, speech: ${v.speech}, badge: ${v.badge === null ? 'null' : v.badge} }`
    })
    .join(',\n')

  return `import type { LobbyVendorIds } from '../lobby/template'

/**
 * The boss prep room level, verbatim.
 *
 * GENERATED by scripts/import-bossprep-assets.mjs — do not edit by hand.
 * Source: ${source}
 *
 * Treated as an opaque swappable template: buildBossPrep() rewrites the same
 * four things buildLobby() does in the lobby template (vendor \`cats\`, badge
 * doodad paths, the items list — diamonds and free upgrades both — and the
 * exit's target level) and touches nothing else. Nothing here is re-serialized
 * through src/generator/xml/, and no value is drawn from either RNG stream —
 * the prep room, like the lobby, is plain text surgery.
 *
 * Stock assets only ([VERIFIED] 2026-08-10, see docs/plans/boss-tab.md
 * "Verified mechanics") — unlike the lobby there is no bossprep/assets.ts.
 *
 * Lights come through verbatim from the source level and are unconditional —
 * there is no parameter for them. They are never renumbered at build time, so
 * the authored level has to keep their ids below the respawn rig's base, which
 * deriveMeta enforces for every id in the file.
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const BOSSPREP_TEMPLATE = ${literal(xml)}

/**
 * Element ids buildBossPrep edits, one group per vendor stall. Identical shape
 * to LOBBY_TEMPLATE_IDS — the prep room is a straight copy of the lobby's shop
 * rig, so the type is reused rather than redeclared.
 */
export const BOSSPREP_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildBossPrep rewrites, to "boss". */
export const BOSSPREP_EXIT_NODE_ID = ${meta.exit}

/**
 * Where the red diamonds go, in template order.
 *
 * Starting gold past one diamond per slot walks this list again rather than
 * spilling outside the room — mirrors LOBBY_DIAMOND_SLOTS.
 */
export const BOSSPREP_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First id buildBossPrep hands to a diamond; above anything the template uses. */
export const BOSSPREP_ITEM_ID_BASE = ${meta.base}

/**
 * Where each free upgrade pickup goes — one slot per kind.
 *
 * Read off the hand-authored level, same as the diamond slots above. A count
 * above one stacks on the kind's single slot rather than spreading, so this map
 * never has to grow with the count.
 */
export const BOSSPREP_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/**
 * First id buildBossPrep() hands to a free upgrade.
 *
 * Directly above the diamonds rather than a round number: the payout is capped
 * at \`MAX_DIAMOND_COUNT\` diamonds, so \`BOSSPREP_ITEM_ID_BASE + MAX_DIAMOND_COUNT\`
 * is the first id no diamond can reach however much gold is asked for. Derived
 * so raising that cap moves this with it instead of silently colliding.
 */
export const BOSSPREP_UPGRADE_ID_BASE = BOSSPREP_ITEM_ID_BASE + MAX_DIAMOND_COUNT
`
}

// --------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = { from: undefined, level: 'levels/test_non_related_to_map/test_boss_prep_room.xml' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') out.from = argv[++i]
    else if (argv[i] === '--level') out.level = argv[++i]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

if (args.from === undefined) {
  console.error('usage: node scripts/import-bossprep-assets.mjs --from "<HW>/editor/<campaign>" [--level levels/...]')
  console.error('the boss prep room has no fallback-authoring mode — it always comes from the authored file')
  process.exit(1)
}

// the editor saves UTF-8 with a BOM and CRLF endings; neither survives a
// template literal intact, so normalize once here rather than leaving the
// committed constant subtly different from the file on disk
const xml = clean(readFileSync(join(args.from, args.level), 'utf-8'))
const source = `${args.from}/${args.level}`
const meta = deriveMeta(xml)

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, source, meta), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) from ${source}`)
