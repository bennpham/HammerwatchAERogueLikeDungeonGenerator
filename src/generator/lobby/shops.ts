import { applyTweaks } from '../tweak/overrides'
import type { PlayerTweaks } from '../tweak/types'

/**
 * The five stalls in the lobby's vendor row.
 *
 * `cats` on a `ShopArea` is a list of independent shop *columns*, not a tier
 * depth: `cats="misc1"` sells only the misc1 column and `cats="misc1 misc3"` is
 * equally legal. So the Lobby tab offers an arbitrary subset rather than a
 * "first N" slider, and a stall with an empty subset is deleted outright
 * instead of shipping a vendor with nothing to sell.
 *
 * This is deliberately a *starter* shop. Dungeon shop rooms keep rolling their
 * own random 5-column set (`NodeShopArea`), so finding a richer vendor
 * underground stays a reward for exploring.
 */
export interface LobbyVendorDef {
  /** key into LOBBY_TEMPLATE_IDS */
  id: string
  label: string
  /** shop columns this stall can sell, in canonical order */
  categories: readonly string[]
}

export const LOBBY_VENDORS: readonly LobbyVendorDef[] = [
  { id: 'combo', label: 'Combo', categories: ['combo1', 'combo2', 'combo3', 'combo4', 'combo5'] },
  { id: 'defense', label: 'Defense', categories: ['def1', 'def2', 'def3', 'def4', 'def5'] },
  { id: 'misc', label: 'Misc', categories: ['misc1', 'misc2', 'misc3', 'misc4', 'misc5'] },
  { id: 'offense', label: 'Offense', categories: ['off1', 'off2', 'off3', 'off4', 'off5'] },
  // `power` is real and stock — five shared.xml upgrades (life, rejuv and the
  // three potions). One column, so this stall is on/off and wears no badge.
  { id: 'power', label: 'Power', categories: ['power'] }
]

/** Every selectable shop column, in the order the vendor row stands in. */
export const ALL_LOBBY_CATEGORIES: readonly string[] = LOBBY_VENDORS.flatMap((v) => v.categories)

const CATEGORY_SET = new Set(ALL_LOBBY_CATEGORIES)

export function isLobbyCategory(id: string): boolean {
  return CATEGORY_SET.has(id)
}

/** The vendor a column belongs to, or undefined for an unknown column. */
export function vendorOfCategory(category: string): LobbyVendorDef | undefined {
  return LOBBY_VENDORS.find((v) => v.categories.includes(category))
}

/**
 * Selected columns for one stall, in canonical order.
 *
 * Canonical rather than selection order so the emitted `cats` string — and
 * therefore the whole lobby file — depends only on *which* columns are on.
 */
export function categoriesFor(vendor: LobbyVendorDef, selected: readonly string[]): string[] {
  const chosen = new Set(selected)
  return vendor.categories.filter((c) => chosen.has(c))
}

/**
 * How many upgrades each shop column actually contains once the Player tab's
 * edits are applied.
 *
 * Derived from the tweaked baseline rather than a hardcoded column→upgrade map,
 * so removing a ladder on the Player tab is visible on the Lobby tab without
 * the two features knowing about each other. A count of 0 means the stall would
 * stand there selling an empty column.
 */
export function lobbyCategoryCounts(tweaks: PlayerTweaks): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const category of ALL_LOBBY_CATEGORIES) counts[category] = 0

  for (const file of applyTweaks(tweaks)) {
    if (file.kind !== 'unit') continue
    for (const upgrade of file.upgrades) {
      if (counts[upgrade.cat] !== undefined) counts[upgrade.cat] += 1
    }
  }

  return counts
}
