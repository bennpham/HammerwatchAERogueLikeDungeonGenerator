#!/usr/bin/env node
/**
 * Regenerates the two committed data modules of src/generator/lobby/:
 *
 *   template.ts   the lobby level XML, verbatim, as a string literal
 *   assets.ts     the custom files the template references, base64 where binary
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the lobby ships as
 * committed data rather than something read from the Steam folder at runtime.
 *
 * Two modes:
 *
 *   node scripts/import-lobby-assets.mjs
 *       Authors the built-in fallback lobby from the layout constants below.
 *       Stock assets only, so `assets.ts` comes out empty. This is what is
 *       committed today.
 *
 *   node scripts/import-lobby-assets.mjs --from "<HW>/editor/<campaign>" \
 *        --level levels/test_lobby.xml --asset doodads/level1/c_v_16.xml ...
 *       Imports a real hand-authored lobby and the custom files it references.
 *       Each --asset is read relative to --from and embedded, base64 for
 *       anything that is not XML.
 *
 * buildLobby() finds the vendor stalls, the diamonds and the exit by the id
 * constants at the bottom of template.ts and nothing else, so an import
 * *derives* those ids from the file it just read (see deriveMeta) rather than
 * trusting the layout constants below. A re-import therefore stays correct
 * without anyone editing the generated file by hand; if the source level is
 * missing a stall, an exit or its diamonds, the derivation throws instead of
 * emitting a template that would fail later inside the generator.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'lobby')

// ---------------------------------------------------------------- layout

/**
 * The fallback lobby's geometry, in tiles.
 *
 * Positive coordinates on purpose. The Dreadmann Mansion template this is
 * standing in for is centred on the origin (x -13..14, y -10..12), but a
 * tilemap block at (bx, by) samples world (bx - 10 + i%20, by - 10 + i/20),
 * so an origin-centred room needs nine 20x20 blocks to cover its corners
 * where a positive one needs four. The relative layout — spawn left, pad
 * right, diamonds above, vendor row below — is the same.
 */
const FLOOR = { x0: 1, y0: 1, x1: 24, y1: 24 }
const BLOCKS = [
  [0, 0],
  [20, 0],
  [0, 20],
  [20, 20]
]
const TILESET = 'tilemaps/c_default.xml'
/** every floor cell gets variant 1: the lobby draws no random values at all */
const TILE_VARIANT = 1

const SPAWN = { x: 3, y: 12 }
const PAD = { x: 20, y: 12 }
const EXIT = { x: 23, y: 10 }
const VENDOR_Y = 20
/** offsets from the vendor doodad, preserved from the decoded template */
const SHOP_AREA_DY = -3.5
const SHOP_SHAPE_DY = -0.25

const VENDORS = [
  { key: 'combo', x: 4, ids: 100 },
  { key: 'defense', x: 8, ids: 110 },
  { key: 'misc', x: 12, ids: 120 },
  { key: 'offense', x: 16, ids: 130 },
  { key: 'power', x: 20, ids: 140 }
]

const DIAMOND_SLOTS = []
for (const y of [5, 7]) {
  for (const x of [5.5, 8.5, 11.5, 14.5, 17.5, 20.5]) DIAMOND_SLOTS.push([x, y])
}

const IDS = {
  levelStart: 0,
  pad: 10,
  trigger: 11,
  sound: 12,
  exit: 13,
  teleportStand: 20,
  teleport: 21
}

/** ids at or above this are buildLobby's to allocate; the template uses none */
const DIAMOND_ID_BASE = 10000

/** ids buildLobby allocates for the arrival-respawn rig (LOBBY_RESPAWN_ID_BASE in build.ts) */
const RESPAWN_ID_BASE = 9000

// ------------------------------------------------------------ XML helpers

const int = (name, v) => `<int name="${name}">${Math.trunc(v)}</int>`
const flt = (name, v) => `<float name="${name}">${v.toFixed(6)}</float>`
const str = (name, v) => `<string name="${name}">${v}</string>`
const bool = (name, v) => `<bool name="${name}">${v ? 'True' : 'False'}</bool>`
const intArr = (name, v) => `<int-arr name="${name}">${v.map(Math.trunc).join(' ')}</int-arr>`

const dict = (name, children) =>
  `<dictionary${name === '' ? '' : ` name="${name}"`}>\n${children.map((c) => `${c}\n`).join('')}</dictionary>\n`

const arr = (name, children) => `<array name="${name}">${children.join('')}</array>`

const doodad = (id, type, x, y) => dict('', [int('id', id), str('type', type), flt('x', x), flt('y', y), bool('need-sync', false)])

const item = (id, type, x, y) => dict('', [int('id', id), str('type', type), flt('x', x), flt('y', y)])

const node = (id, type, x, y, params, connections) =>
  dict('', [
    int('id', id),
    str('type', type),
    bool('enabled', true),
    int('trigger-times', -1),
    flt('x', x),
    flt('y', y),
    dict('parameters', params),
    ...(connections === undefined ? [] : [intArr('connections', connections), intArr('delays', connections)])
  ])

const shapeRef = (ids) => dict('shape', [intArr('static', ids)])

// ------------------------------------------------------------- the tilemap

function tileBlock(bx, by) {
  const t = []
  for (let i = 0; i < 400; i++) {
    const x = bx - 10 + (i % 20)
    const y = by - 10 + Math.trunc(i / 20)
    const floor = x >= FLOOR.x0 && x <= FLOOR.x1 && y >= FLOOR.y0 && y <= FLOOR.y1
    t.push(floor ? TILE_VARIANT : 0)
  }
  const full = new Array(400).fill(255)
  const set = dict('', [
    str('tileset', TILESET),
    intArr('data-t', t),
    intArr('data-r', full),
    intArr('data-g', full),
    intArr('data-b', full),
    intArr('data-a', full)
  ])
  return dict('', [int('x', bx), int('y', by), arr('datasets', [set])])
}

// ------------------------------------------------------------- the doodads

/**
 * A ring of stock theme_c wall pieces around the floor.
 *
 * Wall doodads carry the collision, so this is what stops the party walking
 * off the edge — it is not decoration. The floor is sized in multiples of 8
 * so the 8-tile segments tile it exactly with no gap to fall through, and the
 * per-piece offsets are the ones src/generator/objects/doodad.ts applies to
 * the same art.
 */
function wallDoodads(startId) {
  const out = []
  let id = startId
  const push = (type, x, y, dx, dy) => {
    out.push(doodad(id++, `doodads/theme_c/${type}.xml`, x + dx, y + dy))
  }

  const left = FLOOR.x0 - 1
  const right = FLOOR.x1 + 1
  const top = FLOOR.y0 - 1
  const bottom = FLOOR.y1 + 1

  for (let x = FLOOR.x0; x <= FLOOR.x1; x += 8) {
    push('c_h_8', x, top, 0, 2)
    push('c_h_8', x, bottom, 0, 2)
  }
  for (let y = FLOOR.y0; y <= FLOOR.y1; y += 8) {
    push('c_v_8', left, y, 0, 1)
    push('c_v_8', right, y, 0, 1)
  }
  push('c_crn_l_up', left, top, 0, 1)
  push('c_crn_r_up', right, top, 0, 1)
  push('c_crn_l_dn', left, bottom, 0, 2)
  push('c_crn_r_dn', right, bottom, 0, 2)

  return out
}

function lobbyDoodads() {
  const out = []

  // generic/, not special/ — special/ only has bonus_exit, bonus_teleport and
  // minimap_exit_dn; the pad and its portal live under generic/
  out.push(doodad(IDS.teleportStand, 'doodads/generic/exit_teleport_stand.xml', PAD.x, PAD.y))
  out.push(doodad(IDS.teleport, 'doodads/generic/exit_teleport.xml', PAD.x, PAD.y))

  for (const v of VENDORS) {
    out.push(doodad(v.ids + 2, `doodads/special/vendor_${v.key}.xml`, v.x, VENDOR_Y))
    out.push(doodad(v.ids + 3, `doodads/special/vendor_speech_${v.key}.xml`, v.x, VENDOR_Y))
    // the little number over a vendor is a plain doodad, not shop data. It
    // starts at the full column count and buildLobby rewrites the path to match
    // the selection. `power` is a single column, so it wears no badge at all.
    if (v.key !== 'power') {
      out.push(doodad(v.ids + 4, 'doodads/special/vendor_speech_level5.xml', v.x, VENDOR_Y))
    }
  }

  out.push(...wallDoodads(200))
  return out
}

// --------------------------------------------------------------- the nodes

function lobbyNodes() {
  const out = []

  out.push(node(IDS.levelStart, 'LevelStart', SPAWN.x, SPAWN.y, [int('id', 0), int('dir', 2)]))

  for (const v of VENDORS) {
    const cats =
      v.key === 'power' ? 'power' : [1, 2, 3, 4, 5].map((n) => `${shortCat(v.key)}${n}`).join(' ')
    out.push(
      node(v.ids, 'RectangleShape', v.x, VENDOR_Y + SHOP_SHAPE_DY, [
        flt('w', 2),
        flt('h', 2),
        int('types', 15)
      ])
    )
    out.push(
      node(v.ids + 1, 'ShopArea', v.x, VENDOR_Y + SHOP_AREA_DY, [str('cats', cats), shapeRef([v.ids])])
    )
  }

  out.push(node(IDS.pad, 'RectangleShape', PAD.x, PAD.y, [flt('w', 3), flt('h', 3), int('types', 15)]))
  out.push(
    node(
      IDS.trigger,
      'AllPlayersAreaTrigger',
      PAD.x,
      PAD.y,
      [shapeRef([IDS.pad])],
      [IDS.sound, IDS.exit]
    )
  )
  out.push(
    node(IDS.sound, 'PlaySound', PAD.x, PAD.y, [str('sound', 'sound/misc.xml:info_teleport_activate')])
  )
  // The level string is the one value buildLobby rewrites.
  //
  // The shape points back at the pad rather than being left empty: an empty
  // <int-arr> is not a legal SValue, and LevelPacker.exe dies parsing it with
  // `System.FormatException` out of Int32.Parse. Sharing one shape across
  // several nodes is what the stock campaigns do, and it is what the dungeon's
  // own exit does (objectSet.ts builds one RectangleShape and connects the
  // exit to it).
  out.push(
    node(IDS.exit, 'LevelExitArea', EXIT.x, EXIT.y, [
      str('level', '1'),
      int('start id', 0),
      shapeRef([IDS.pad])
    ])
  )

  return out
}

function shortCat(key) {
  return { combo: 'combo', defense: 'def', misc: 'misc', offense: 'off' }[key]
}

// ------------------------------------------------------------ the whole file

function buildFallbackTemplate() {
  const tilemap = dict('tilemap', [arr('tiledata', BLOCKS.map(([x, y]) => tileBlock(x, y)))])
  const doodads = dict('doodads', [arr('doodads', lobbyDoodads())])
  const actors = dict('actors', [arr('actors', [])])
  const scripting = dict('scripting', [arr('nodes', lobbyNodes())])
  const items = dict('items', [arr('items', [])])
  const lighting = dict('lighting', [
    arr('lights', []),
    dict('ambient-color', [int('r', 255), int('g', 255), int('b', 255), int('a', 255)]),
    dict('shadow-color', [int('r', 128), int('g', 128), int('b', 128), int('a', 128)])
  ])

  return dict('', [tilemap, doodads, actors, scripting, items, lighting])
}

// --------------------------------------------------------- id derivation

/** The prefix a stall's `cats` entries use, e.g. `off3` -> the offense stall. */
const CATS_PREFIX = { power: 'power', off: 'offense', misc: 'misc', def: 'defense', combo: 'combo' }

const DIAMOND_ITEM = 'items/valuable_diamond_red.xml'

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
 * same way buildLobby locates an element at generation time.
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

/** The eight free upgrade pickups, in the order UPGRADE_KINDS lists them. */
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

/**
 * The ids buildLobby needs, read back out of an imported level.
 *
 * A stall is found by its ShopArea's `cats` prefix, not by position: `cats` is
 * the value buildLobby rewrites, so anchoring on it means a template whose
 * stalls have been moved around still imports correctly. The doodads that make
 * up the stall are then the ones standing on the same spot as its vendor.
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
      // a single-column stall wears no tier number; buildLobby leaves it alone
      badge: badge === undefined ? null : badge.id
    }
  }
  if (Object.keys(ids).length === 0) throw new Error('level has no ShopArea nodes')

  const exits = nodes.filter((n) => n.type === 'LevelExitArea')
  if (exits.length !== 1) throw new Error(`expected exactly one LevelExitArea, found ${exits.length}`)

  // The authored diamonds are only a slot map — buildLobby replaces the lot.
  // They are stacked and listed out of order in the editor's output, so take
  // the distinct spots in reading order and let the count come from the
  // player's starting gold.
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

  // buildLobby also inserts the four-node arrival-respawn rig at a fixed id base,
  // which an authored level must therefore stay below
  const overRig = [...xml.matchAll(/<int name="id">(\d+)<\/int>/g)]
    .map((m) => Number(m[1]))
    .filter((id) => id >= RESPAWN_ID_BASE)
  if (overRig.length > 0) {
    throw new Error(`level uses id ${Math.max(...overRig)}, at or above the respawn rig's ${RESPAWN_ID_BASE}`)
  }

  // buildLobby allocates diamond ids from a base rather than reusing the
  // authored ones, so the base has to clear everything the file already uses
  const used = [...xml.matchAll(/<int name="id">(\d+)<\/int>/g)].map((m) => Number(m[1]))
  const base = Math.max(DIAMOND_ID_BASE, Math.ceil((Math.max(...used) + 1) / 1000) * 1000)

  return { ids, exit: exits[0].id, slots, base, upgradeSlots: deriveUpgradeSlots(xml) }
}

/**
 * Where the fallback layout puts the free upgrades.
 *
 * Fallback mode builds a lobby from constants rather than reading an authored
 * level, so it has to name these outright. Two rows of four behind the vendors,
 * matching the authored room's arrangement.
 */
const UPGRADE_SLOTS_FALLBACK = {
  damage: [-9, -4.5],
  defense: [-8, -4.5],
  health: [-7, -4.5],
  mana: [-6, -4.5],
  damage2: [-9, -3.5],
  defense2: [-8, -3.5],
  health2: [-7, -3.5],
  mana2: [-6, -3.5]
}

/** The same shape as deriveMeta, from the layout constants, for fallback mode. */
function fallbackMeta() {
  const ids = {}
  for (const v of VENDORS) {
    ids[v.key] = {
      shape: v.ids,
      shop: v.ids + 1,
      vendor: v.ids + 2,
      speech: v.ids + 3,
      badge: v.key === 'power' ? null : v.ids + 4
    }
  }
  return { ids, exit: IDS.exit, slots: DIAMOND_SLOTS, base: DIAMOND_ID_BASE, upgradeSlots: UPGRADE_SLOTS_FALLBACK }
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

  return `/**
 * The lobby level, verbatim.
 *
 * GENERATED by scripts/import-lobby-assets.mjs — do not edit by hand.
 * Source: ${source}
 *
 * Treated as an opaque swappable template: buildLobby() rewrites four things
 * in it by id (vendor \`cats\`, badge doodad paths, the items list — diamonds and
 * free upgrades both — and the exit's target level) and touches nothing else.
 * Nothing here is re-serialized through src/generator/xml/, and no value is
 * drawn from either RNG stream.
 *
 * Lights come through verbatim from the source level and are unconditional —
 * there is no parameter for them. They are never renumbered at build time, so
 * the authored level has to keep their ids below the respawn rig's base, which
 * deriveMeta enforces for every id in the file.
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const LOBBY_TEMPLATE = ${literal(xml)}

/** Element ids buildLobby edits, one group per vendor stall. */
export interface LobbyVendorIds {
  /** the shape the ShopArea covers */
  shape: number
  /** the ShopArea node carrying \`cats\` */
  shop: number
  /** the vendor doodad */
  vendor: number
  /** the speech-bubble doodad */
  speech: number
  /** the little tier number over the vendor, or null for a single-column stall */
  badge: number | null
}

export const LOBBY_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildLobby rewrites. */
export const LOBBY_EXIT_NODE_ID = ${meta.exit}

/**
 * Where the red diamonds go, in template order.
 *
 * Starting gold past one diamond per slot walks this list again rather than
 * spilling outside the room — stacking pays out in full ([VERIFIED] 2026-07-30).
 */
export const LOBBY_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First id buildLobby hands to a diamond; above anything the template uses. */
export const LOBBY_ITEM_ID_BASE = ${meta.base}

/**
 * Where each free upgrade pickup goes — one slot per kind.
 *
 * Read off the hand-authored level, same as the diamond slots above. A count
 * above one stacks on the kind's single slot rather than spreading, so this map
 * never has to grow with the count.
 */
export const LOBBY_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/**
 * First id buildLobby() hands to a free upgrade.
 *
 * Directly above the diamonds rather than a round number: the payout is capped
 * at \`MAX_DIAMOND_COUNT\` diamonds, so \`LOBBY_ITEM_ID_BASE + MAX_DIAMOND_COUNT\`
 * is the first id no diamond can reach however much gold is asked for. Derived
 * so raising that cap moves this with it instead of silently colliding.
 */
export const LOBBY_UPGRADE_ID_BASE = LOBBY_ITEM_ID_BASE + MAX_DIAMOND_COUNT
`
}

function emitAssets(assets) {
  const entries = assets
    .map(
      (a) =>
        `  {\n    path: '${a.path}',\n    content: ${literal(a.content)},\n    encoding: '${a.encoding}'\n  }`
    )
    .join(',\n')

  return `import type { GeneratedFile } from '../index'

/**
 * Files the lobby template references that the game does not already ship.
 *
 * GENERATED by scripts/import-lobby-assets.mjs — do not edit by hand.
 *
 * Empty for the built-in fallback lobby, which deliberately references stock
 * assets only. Importing a hand-authored lobby fills this in; binary files are
 * carried as base64 and written back out by src/main/packer.ts.
 */
export const LOBBY_ASSETS: readonly GeneratedFile[] = [${entries === '' ? '' : `\n${entries}\n`}]
`
}

// --------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = { from: undefined, level: 'levels/test_lobby.xml', assets: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') out.from = argv[++i]
    else if (argv[i] === '--level') out.level = argv[++i]
    else if (argv[i] === '--asset') out.assets.push(argv[++i])
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

let xml
let source
let meta
let assets = []

if (args.from === undefined) {
  xml = buildFallbackTemplate()
  source = 'authored by this script (--from not given) — stock assets only'
  meta = fallbackMeta()
} else {
  // the editor saves UTF-8 with a BOM and CRLF endings; neither survives a
  // template literal intact, so normalize once here rather than leaving the
  // committed constant subtly different from the file on disk
  xml = clean(readFileSync(join(args.from, args.level), 'utf-8'))
  source = `${args.from}/${args.level}`
  meta = deriveMeta(xml)
  assets = args.assets.map((path) => {
    const bytes = readFileSync(join(args.from, path))
    const binary = extname(path).toLowerCase() !== '.xml'
    return {
      path,
      content: binary ? bytes.toString('base64') : clean(bytes.toString('utf-8')),
      encoding: binary ? 'base64' : 'utf-8'
    }
  })
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, source, meta), 'utf-8')
writeFileSync(join(outDir, 'assets.ts'), emitAssets(assets), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) and assets.ts (${assets.length} asset(s)) from ${source}`)
