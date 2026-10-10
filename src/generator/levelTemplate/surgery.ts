/**
 * Text surgery over a committed level template.
 *
 * The lobby and the boss prep room are hand-authored levels imported verbatim
 * and edited by id — never re-serialized through src/generator/xml/. These
 * helpers locate an element by its id and rewrite or remove it, treating the
 * template as opaque text. The caller passes a label ("lobby", "bossprep") so
 * failures name the level they came from.
 */

/**
 * Each red diamond is worth exactly this much (items/valuable_diamond_red.xml).
 * A property of the item, not of any one level — the lobby and the boss prep
 * room both use it, under their own `*_DIAMOND_VALUE` names.
 */
export const DIAMOND_VALUE = 500

/**
 * The most diamonds a payout can ever produce.
 *
 * `GOLD_SAFETY_MAX` in config/validation.ts is this times `DIAMOND_VALUE`, so
 * the cap and the id arithmetic below cannot drift apart: the highest id a
 * diamond can take is `itemIdBase + MAX_DIAMOND_COUNT - 1`, which is what each
 * template's `*_UPGRADE_ID_BASE` sits directly above.
 */
export const MAX_DIAMOND_COUNT = 10_000

/**
 * The span of the element whose id is `id`.
 *
 * An element is an unnamed `<dictionary>` whose first child is its id, which
 * makes the opening marker unambiguous — `<int name="id">0</int>` also appears
 * inside a `LevelStart`'s parameters, and anchoring on the pair rules that out
 * (`<dictionary name="parameters">` is a named tag and cannot match). The
 * whitespace between the two is matched rather than assumed, because the
 * template may be a level saved by the game's own editor, which indents with
 * tabs. The closing tag is found by counting nesting rather than by regex,
 * because elements contain a nested `parameters` (and `shape`) dictionary.
 */
export function elementSpan(xml: string, id: number, label: string): { start: number; end: number } {
  const marker = new RegExp(`<dictionary>\\s*<int name="id">${id}</int>`, 'g')
  const opening = marker.exec(xml)
  if (opening === null) {
    throw new Error(`${label} template has no element with id ${id}`)
  }
  if (marker.exec(xml) !== null) {
    throw new Error(`${label} template has more than one element with id ${id}`)
  }
  const start = opening.index

  const tag = /<dictionary\b[^>]*>|<\/dictionary>/g
  tag.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) return { start, end: match.index + match[0].length }
  }

  throw new Error(`${label} template element ${id} is not closed`)
}

/**
 * Drop one element, taking the whole lines it sits on.
 *
 * The indentation in front of it and the newline behind it go too, so removing
 * a stall leaves no blank or indent-only line where it used to be.
 */
export function removeElement(xml: string, id: number, label: string): string {
  const { start, end } = elementSpan(xml, id, label)
  let from = start
  while (from > 0 && (xml[from - 1] === '\t' || xml[from - 1] === ' ')) from--
  const after = /^\r?\n/.exec(xml.slice(end))
  return xml.slice(0, from) + xml.slice(end + (after === null ? 0 : after[0].length))
}

/** Rewrite the first match of `pattern` inside one element only. */
export function replaceInElement(
  xml: string,
  id: number,
  pattern: RegExp,
  replacement: string,
  label: string
): string {
  const { start, end } = elementSpan(xml, id, label)
  const body = xml.slice(start, end)
  if (!pattern.test(body)) {
    throw new Error(`${label} template element ${id} has nothing matching ${pattern}`)
  }
  return xml.slice(0, start) + body.replace(pattern, replacement) + xml.slice(end)
}

/**
 * Where the level's single `LevelStart` node sits.
 *
 * Derived from the template rather than hardcoded so a re-import that moves the
 * spawn point keeps working. Anchored on the `type` string and scanned forward
 * to the node's own `pos`, which is the next `<vec2 name="pos">` in the file —
 * a `LevelStart`'s parameters hold only `id` and `dir`, no vec2 of their own.
 */
export function levelStartPos(xml: string, label: string): [number, number] {
  const marker = /<string name="type">LevelStart<\/string>/g
  const opening = marker.exec(xml)
  if (opening === null) throw new Error(`${label} template has no LevelStart node`)
  if (marker.exec(xml) !== null) throw new Error(`${label} template has more than one LevelStart node`)

  const pos = /<vec2 name="pos">(-?[\d.]+) (-?[\d.]+)<\/vec2>/g
  pos.lastIndex = opening.index
  const found = pos.exec(xml)
  if (found === null) throw new Error(`${label} template's LevelStart node has no pos`)

  return [Number(found[1]), Number(found[2])]
}

/**
 * The four-node "revive whoever arrived dead, once" rig, as template text.
 *
 * The same rig the `ExitUp` prefab puts on every dungeon floor (see
 * `objects/objectSet.ts`), minus its `AnnounceText`: an `AreaTrigger` over the
 * spawn point fires `RespawnPlayers`, then a `ToggleElement` whose `element` is
 * the trigger's *own* id switches the trigger off, so it can never fire twice.
 * Without it a player who died on the previous level arrives dead and stays
 * dead — in the prep room that means they cannot shop for the boss fight.
 *
 * Emitted in the level editor's own dialect, which the hand-authored templates
 * are saved in and which differs from the generated floors' in two ways:
 * `<vec2 name="pos">` instead of a `<float name="x">`/`<float name="y">` pair,
 * and `connection-delays` (zeros) instead of the floors' `delays` (a copy of
 * `connections`). Indented with tabs to sit inside `<array name="nodes">`.
 *
 * `size` is deliberately wider than the floors' 1x1: a living player who spawns
 * slightly off the exact start tile and walks away must still cross it.
 */
export function respawnOnEntryNodes(idBase: number, x: number, y: number, size = 3): string {
  const shape = idBase
  const trigger = idBase + 1
  const respawn = idBase + 2
  const disable = idBase + 3

  return `\t\t\t<dictionary>
\t\t\t\t<int name="id">${shape}</int>
\t\t\t\t<string name="type">RectangleShape</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<dictionary name="parameters">
\t\t\t\t\t<float name="w">${size}</float>
\t\t\t\t\t<float name="h">${size}</float>
\t\t\t\t\t<int name="types">15</int>
\t\t\t\t</dictionary>
\t\t\t</dictionary>
\t\t\t<dictionary>
\t\t\t\t<int name="id">${trigger}</int>
\t\t\t\t<string name="type">AreaTrigger</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<dictionary name="parameters">
\t\t\t\t\t<int name="event">0</int>
\t\t\t\t\t<int name="types">1</int>
\t\t\t\t\t<dictionary name="shape">
\t\t\t\t\t\t<int-arr name="static">${shape}</int-arr>
\t\t\t\t\t</dictionary>
\t\t\t\t</dictionary>
\t\t\t\t<int-arr name="connections">${respawn} ${disable}</int-arr>
\t\t\t\t<int-arr name="connection-delays">0 0</int-arr>
\t\t\t</dictionary>
\t\t\t<dictionary>
\t\t\t\t<int name="id">${respawn}</int>
\t\t\t\t<string name="type">RespawnPlayers</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<dictionary name="parameters">
\t\t\t\t</dictionary>
\t\t\t</dictionary>
\t\t\t<dictionary>
\t\t\t\t<int name="id">${disable}</int>
\t\t\t\t<string name="type">ToggleElement</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<dictionary name="parameters">
\t\t\t\t\t<int name="state">1</int>
\t\t\t\t\t<dictionary name="element">
\t\t\t\t\t\t<int-arr name="static">${trigger}</int-arr>
\t\t\t\t\t</dictionary>
\t\t\t\t</dictionary>
\t\t\t</dictionary>
`
}

/**
 * Append `body` just inside the close of the level's `nodes` array.
 *
 * The closing tag is found by counting `<array>` nesting rather than by taking
 * the first `</array>`, for the same reason `setItems` counts `<dictionary>`
 * depth: a node's parameters may hold arrays of their own.
 */
export function insertNodes(xml: string, body: string, label: string): string {
  const open = '<array name="nodes">'
  const start = xml.indexOf(open)
  if (start === -1) throw new Error(`${label} template has no nodes array`)

  const tag = /<array\b[^>]*>|<\/array>/g
  tag.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) {
      // the closing tag sits on its own indented line; the body ends in a
      // newline, so it lands on whole lines of its own above that indent
      let from = match.index
      while (from > 0 && (xml[from - 1] === '\t' || xml[from - 1] === ' ')) from--
      return xml.slice(0, from) + body + xml.slice(from)
    }
  }

  throw new Error(`${label} template nodes array is not closed`)
}

/**
 * Replace the whole body of the level's `items` section.
 *
 * Whatever the template author left on the floor is discarded: the authored
 * diamonds are only there to say where the slots are — they are what the
 * import script reads the diamond slots back out of — and how many actually
 * appear is the player's `startingGold`.
 */
export function setItems(xml: string, body: string, label: string): string {
  const open = '<dictionary name="items">'
  const start = xml.indexOf(open)
  if (start === -1) throw new Error(`${label} template has no items section`)

  const tag = /<dictionary\b[^>]*>|<\/dictionary>/g
  tag.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) {
      return xml.slice(0, start + open.length) + body + xml.slice(match.index)
    }
  }

  throw new Error(`${label} template items section is not closed`)
}

/** One item on the floor: its element id and where it sits. */
export interface ItemEntry {
  id: number
  x: number
  y: number
}

/** Every item of one type, as the editor's items dialect groups them. */
export interface ItemSection {
  /** the item file, e.g. `items/valuable_diamond_red.xml` */
  item: string
  entries: readonly ItemEntry[]
}

/**
 * Assemble the whole `<dictionary name="items">` body from its sections.
 *
 * This is the level editor's own items dialect — one array per item type, each
 * entry an `<array>` of id and position — not the dictionary-per-element form
 * the rest of the file uses.
 *
 * The leading newline and the trailing tab are the section's own indentation,
 * so `setItems` can splice the result straight between the open and close tags.
 * With nothing to place the body is just that indentation: an empty
 * `<array>` is never emitted, because LevelPacker.exe parses what is inside one
 * and throws on nothing ([VERIFIED] 2026-07-31).
 */
export function itemsBody(sections: readonly ItemSection[]): string {
  const filled = sections.filter((section) => section.entries.length > 0)
  if (filled.length === 0) return '\n\t'

  let out = '\n'
  for (const section of filled) {
    out += `\t\t<array name="${section.item}">\n`
    for (const { id, x, y } of section.entries) {
      out += `\t\t\t<array><int>${id}</int><vec2>${x} ${y}</vec2></array>\n`
    }
    out += '\t\t</array>\n'
  }
  return out + '\t'
}

/** The stock save checkpoint a lobby carries when lobby saves are on. */
const SAVE_BUTTON_ITEM = 'items/trigger_button_save.xml'

/**
 * The item section for a lobby's save checkpoint, or none when saves are off.
 *
 * `items/trigger_button_save.xml` is a plain `behavior="checkpoint"` item, not
 * a scripting node — it needs nothing spliced into `<array name="nodes">`, just
 * one entry in the items section like the diamonds and upgrades.
 */
export function saveButtonArray(
  enabled: boolean,
  slot: readonly [number, number],
  id: number
): ItemSection[] {
  if (!enabled) return []
  return [{ item: SAVE_BUTTON_ITEM, entries: [{ id, x: slot[0], y: slot[1] }] }]
}

/** How many diamonds a given amount of starting gold is worth. */
export function diamondCount(startingGold: number): number {
  return Math.max(0, Math.floor(startingGold / DIAMOND_VALUE))
}

/** The stock red diamond every template's starting gold is paid out in. */
const DIAMOND_ITEM = 'items/valuable_diamond_red.xml'

/**
 * The item section paying `startingGold` out as diamonds, walking `slots`
 * round-robin so gold past the authored slot count lands back on slot 0 rather
 * than somewhere outside the room. Ids start at `itemIdBase`, which each
 * template puts above anything it already uses so they cannot collide.
 *
 * Returns no section at all at zero gold, so `itemsBody` never emits an empty
 * array — see its note on LevelPacker.exe.
 */
export function diamondArray(
  startingGold: number,
  slots: readonly (readonly [number, number])[],
  itemIdBase: number
): ItemSection[] {
  const count = diamondCount(startingGold)
  if (count === 0) return []

  const entries: ItemEntry[] = []
  for (let i = 0; i < count; i++) {
    const [x, y] = slots[i % slots.length]
    entries.push({ id: itemIdBase + i, x, y })
  }
  return [{ item: DIAMOND_ITEM, entries }]
}

/**
 * The eight free upgrade pickups the lobby and the prep room lay out.
 *
 * Order is fixed and load-bearing: it is the order ids are handed out in, the
 * order `parameters.txt` writes the counts in, and the order the form shows
 * them in. The `2` suffix is the game's own — `items/upgrade_damage_2.xml` is
 * the second-tier pickup, not a second copy of the first.
 */
export const UPGRADE_KINDS = [
  'damage',
  'defense',
  'health',
  'mana',
  'damage2',
  'defense2',
  'health2',
  'mana2'
] as const

export type UpgradeKind = (typeof UPGRADE_KINDS)[number]

/** How many of each free upgrade a room puts on the floor. */
export type UpgradeCounts = Readonly<Record<UpgradeKind, number>>

/** Where each kind goes in one room, one slot per kind. */
export type UpgradeSlots = Readonly<Record<UpgradeKind, readonly [number, number]>>

/** The item file a kind picks up as: `mana2` is `items/upgrade_mana_2.xml`. */
export function upgradeItemPath(kind: UpgradeKind): string {
  return `items/upgrade_${kind.replace(/2$/, '_2')}.xml`
}

/** Every kind at zero — the "no free upgrades at all" set. */
export function noUpgrades(): UpgradeCounts {
  return Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 0])) as UpgradeCounts
}

/** Every kind at one, which is what both rooms were authored with. */
export function oneOfEachUpgrade(): UpgradeCounts {
  return Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 1])) as UpgradeCounts
}

/**
 * The free upgrades' item sections.
 *
 * Unlike the diamonds there is exactly one slot per kind, so a count above one
 * **stacks** on that slot rather than walking a list — which is the whole point
 * of letting the count run free: the dungeon master decides how many of each
 * the party is handed, and the room's layout does not have to grow to match.
 *
 * Ids run sequentially from `idBase` in `UPGRADE_KINDS` order, so the output is
 * a pure function of the counts. A kind at zero emits **no** array rather than
 * an empty one, for the same reason zero gold emits no diamond array:
 * LevelPacker.exe parses what is inside and throws on nothing
 * ([VERIFIED] 2026-07-31).
 */
export function upgradeArrays(
  counts: UpgradeCounts,
  slots: UpgradeSlots,
  idBase: number
): ItemSection[] {
  const sections: ItemSection[] = []
  let id = idBase

  for (const kind of UPGRADE_KINDS) {
    const count = counts[kind] ?? 0
    const [x, y] = slots[kind]
    const entries: ItemEntry[] = []
    // ids advance with the items actually placed, so a kind left at zero costs
    // no id and the numbering stays a function of the counts alone
    for (let i = 0; i < count; i++) entries.push({ id: id++, x, y })
    if (entries.length > 0) sections.push({ item: upgradeItemPath(kind), entries })
  }

  return sections
}
