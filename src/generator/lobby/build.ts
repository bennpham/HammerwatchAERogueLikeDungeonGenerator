import { LOBBY_VENDORS, categoriesFor } from './shops'
import type { LobbyPresetDef } from './presets'
import type { LobbyOptions } from '../config/parameters'
import { musicSound } from '../music/tracks'
import { musicRigNodes } from '../music/template'
import {
  DIAMOND_VALUE,
  diamondArray,
  diamondCount,
  insertNodes,
  levelStartPos,
  removeElement,
  replaceInElement,
  itemsBody,
  respawnOnEntryNodes,
  saveButtonArray,
  setItems,
  upgradeArrays
} from '../levelTemplate/surgery'

// re-exported so the lobby's public surface (and src/generator/index.ts, which
// re-exports it) keeps importing them from ./lobby exactly as before the shared
// surgery module existed
export { diamondCount }

/** The lobby's own name for the shared per-diamond value (see DIAMOND_VALUE). */
export const LOBBY_DIAMOND_VALUE = DIAMOND_VALUE

/**
 * Apply the user's lobby options to `preset`'s committed template.
 *
 * Surgical edits and nothing else — no RNG (neither `ctx.rand` nor
 * `ctx.cosmeticRand` is even in scope here), no theme substitution, and no
 * round trip through `src/generator/xml/`. The template is treated as opaque
 * text located by the element ids it was generated with, so replacing it with
 * a purpose-built room only means regenerating `template.ts` and adding an
 * entry to `LOBBY_PRESETS` — this function itself never has to change.
 *
 * `exitTarget` is the level id this lobby's teleport leads to — the id of
 * whatever slot follows it in the campaign order, or `'0'` when a lobby
 * somehow ends up last (validation forbids that; the generator falls back
 * rather than throwing). One lobby, one exit: unlike a boss fight a lobby
 * slot has nothing else to wire up.
 *
 * `saves` places `items/trigger_button_save.xml` by the room's exit (a plain
 * checkpoint item, no scripting) — the campaign-wide `lobbySaves` toggle. Off
 * leaves the template's items untouched apart from the gold/upgrade payout.
 */
export function buildLobby(
  preset: LobbyPresetDef,
  options: LobbyOptions,
  exitTarget: string,
  saves: boolean
): string {
  let xml = preset.template

  for (const vendor of LOBBY_VENDORS) {
    const ids = preset.templateIds[vendor.id]
    if (ids === undefined) continue

    const selected = categoriesFor(vendor, options.shopCategories)

    if (selected.length === 0) {
      // a stall with nothing to sell is removed outright, shape included, so
      // the file never leaves a ShopArea pointing at a shape that is gone
      for (const id of [ids.shop, ids.shape, ids.vendor, ids.speech, ids.badge]) {
        if (id !== null) xml = removeElement(xml, id, preset.surgeryLabel)
      }
      continue
    }

    xml = replaceInElement(
      xml,
      ids.shop,
      /<string name="cats">[^<]*<\/string>/,
      `<string name="cats">${selected.join(' ')}</string>`,
      preset.surgeryLabel
    )

    if (ids.badge !== null) {
      xml = replaceInElement(
        xml,
        ids.badge,
        /<string name="type">[^<]*<\/string>/,
        `<string name="type">doodads/special/vendor_speech_level${selected.length}.xml</string>`,
        preset.surgeryLabel
      )
    }
  }

  xml = replaceInElement(
    xml,
    preset.exitNodeId,
    /<string name="level">[^<]*<\/string>/,
    `<string name="level">${exitTarget}</string>`,
    preset.surgeryLabel
  )

  // the same arrival net the dungeon floors carry — nobody should be stuck
  // dead in a room whose whole point is shopping
  const [startX, startY] = levelStartPos(xml, preset.surgeryLabel)
  xml = insertNodes(xml, respawnOnEntryNodes(preset.respawnIdBase, startX, startY), preset.surgeryLabel)

  // optional music swap, same append-only shape as the respawn net above —
  // emits nothing at all (not even an id) when unset/default, leaving the
  // template's own music untouched
  const sound = musicSound(options.music)
  if (sound !== null) {
    xml = insertNodes(xml, musicRigNodes(preset.musicIdBase, startX, startY, sound), preset.surgeryLabel)
  }

  // one items section, two independent populations: the gold payout, and the
  // free upgrades the dungeon master hands the party. Their id ranges cannot
  // overlap however large either gets — see preset.upgradeIdBase.
  return setItems(
    xml,
    itemsBody([
      ...diamondArray(options.startingGold, preset.diamondSlots, preset.itemIdBase),
      ...upgradeArrays(options.upgrades, preset.upgradeSlots, preset.upgradeIdBase),
      ...saveButtonArray(saves, preset.saveButtonSlot, preset.saveButtonId)
    ]),
    preset.surgeryLabel
  )
}
