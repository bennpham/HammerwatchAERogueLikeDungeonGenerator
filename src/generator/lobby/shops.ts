import { playerCategoryCounts } from '../players/validate'

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
  { id: 'power', label: 'Power', categories: ['power'] },
  // the item vendor (AE ShopArea Type 2, the equipment shop). Its columns are
  // AE's equipment loot tables (tweak/shops/equipment.sval): five random items
  // each, tier 1 all common, 2-3 common and uncommon, 4 up to rare, 5 with one
  // epic (objects/equipment.ts)
  { id: 'item', label: 'Items', categories: ['equipment_1', 'equipment_2', 'equipment_3', 'equipment_4', 'equipment_5'] }
]

/** Every selectable shop column, in the order the vendor row stands in. */
export const ALL_LOBBY_CATEGORIES: readonly string[] = LOBBY_VENDORS.flatMap((v) => v.categories)

/** Whether a column is an item (equipment) table rather than skill upgrades. */
export function isEquipmentCategory(id: string): boolean {
  return id.startsWith('equipment_')
}

/**
 * The equipment tiers a lobby's item stall sells by default: common and
 * uncommon (tiers 2 and 3, ten items). The item vendor lists every item of
 * every selected tier, so all five at once would be a wall of 25 items.
 */
export const DEFAULT_LOBBY_EQUIPMENT: readonly string[] = ['equipment_2', 'equipment_3']

/**
 * What a boss-prep lobby adds on top: tier 4, the first with rares — the
 * last shop before a fight is where the good stock is (the owner's call,
 * 2026-10-16).
 */
export const BOSS_PREP_EQUIPMENT: readonly string[] = ['equipment_4']

/** A new lobby's columns: every skill column, power, and the default equipment tiers. */
export const DEFAULT_LOBBY_CATEGORIES: readonly string[] = ALL_LOBBY_CATEGORIES.filter(
  (c) => !isEquipmentCategory(c) || DEFAULT_LOBBY_EQUIPMENT.includes(c)
)

/** A boss-prep lobby's columns: the defaults plus the rare tier, in canonical order. */
export const BOSS_PREP_LOBBY_CATEGORIES: readonly string[] = ALL_LOBBY_CATEGORIES.filter(
  (c) => DEFAULT_LOBBY_CATEGORIES.includes(c) || BOSS_PREP_EQUIPMENT.includes(c)
)

const CATEGORY_SET = new Set(ALL_LOBBY_CATEGORIES)

export function isLobbyCategory(id: string): boolean {
  return CATEGORY_SET.has(id)
}

/** The vendor a column belongs to, or undefined for an unknown column. */
export function vendorOfCategory(category: string): LobbyVendorDef | undefined {
  return LOBBY_VENDORS.find((v) => v.categories.includes(category))
}

/**
 * Which stall an authored `ShopArea` is, by the categories it sells (its
 * first column: `def*` -> defense, `off*` -> offense, `item`,
 * `equipment_*` or the Sun's `st_equipment_*` -> item...). Undefined for a
 * shop no lobby stall stands for.
 */
export function vendorIdOfShopArea(categories: string): string | undefined {
  const first = categories.trim().split(/\s+/)[0] ?? ''
  if (first.startsWith('combo')) return 'combo'
  if (first.startsWith('def')) return 'defense'
  if (first.startsWith('off')) return 'offense'
  if (first.startsWith('misc')) return 'misc'
  if (first === 'power') return 'power'
  if (first === 'item' || /^(st_)?equipment_/.test(first)) return 'item'
  return undefined
}

/**
 * A vendor's stand in an authored or stock lobby: Castle's and Shaftlocke's
 * stalls (`shop_*`, `shop_item_hwr`), and the Sun bazaar's shopkeepers.
 */
export const VENDOR_STAND = /^doodads\/generic\/(shop_[a-z_]+|npc_dungeonvendor_desert)\.unit$/

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
 * How many purchases each skill shop column holds, across every class, from
 * AE's own skill files. A count of 0 means the stall would stand there selling
 * an empty column.
 */
export function lobbyCategoryCounts(): Record<string, number> {
  const stock = playerCategoryCounts()
  const counts: Record<string, number> = {}
  for (const category of ALL_LOBBY_CATEGORIES) counts[category] = stock[category] ?? 0
  return counts
}
