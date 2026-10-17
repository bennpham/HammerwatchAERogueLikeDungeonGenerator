/**
 * The items a mystery button (issue #67) can spawn — chests, coins and
 * diamonds, then every wave pickup.
 *
 * Kept apart from PICKUP_DEFS on purpose. That roster is the arena's, and each
 * of its entries carries a drop-pad `lane` (boss/pickupPad.ts); a chest has no
 * lane there, and adding one to PICKUP_DEFS would offer it on every wave
 * tier's picker too. A mystery button has no pad — its loot lands on the tiles
 * nearest the plate — so here the lane is simply dropped.
 *
 * Verification status (see hammerwatch-modding/references/):
 *   every PICKUP_DEFS entry — as documented in objects/pickupTypes.ts
 *   [VERIFIED]   chest_red via SpawnObject — the owner's sample and the
 *                mystery-button playtest, 2026-09-26
 *   [VERIFIED]   chest_wood / chest_blue / chest_green via SpawnObject — the
 *                owner's preset playtest (PR #73), 2026-09-28
 *                Left untested on purpose in the 2026-09-27 playtest, which
 *                covered the starter set's monsters and traps only
 *   [VERIFIED]   valuable_1..9 via SpawnObject — owner playtest 2026-09-26.
 *                Gold amounts read from assetsExtract/items/valuable_*.xml
 *                (`behavior="money"`, `amount`); the metal is the sprite's
 *                colour on items.png (see DISCOVERY-LOG 2026-09-26)
 *   [VERIFIED]   valuable_diamond_red — the lobbies' 500-gold diamond
 *   [VERIFIED]   valuable_diamond_small / _small_red / valuable_diamond via
 *                SpawnObject — amounts read from their asset files; seen in
 *                game (checklist #52)
 */
import { PICKUP_DEFS } from './pickupTypes'
import type { PickupDef } from './pickupTypes'
import { ITEM_QUALITY, itemsOfQuality } from './equipment'

/**
 * A mystery-button loot entry: a pickup without the arena's drop-pad lane.
 * An `equipment` entry is spawned with SpawnEquipment instead of SpawnUnit —
 * a named item, or a random one of a quality; its `path` is the pickup unit
 * SpawnEquipment produces.
 */
export type LootDef = Omit<PickupDef, 'lane'> & {
  equipment?: LootEquipment
}

/**
 * What a SpawnEquipment loot entry drops: a named item, a random item of a
 * quality (rolled by the game, which skips shop-blocked items), or one of a
 * list of named items (rolled by the generator from mysteryRand, so a
 * shop-blocked unique can still come up).
 */
export type LootEquipment = { id: string } | { quality: number } | { anyOf: readonly string[] }

/** What SpawnEquipment produces, whichever item it carries. */
export const EQUIPMENT_PICKUP_PATH = 'items/equipment/base_equipment.unit'

/**
 * The lucky plate's prizes: a random unique, every unique item by id (four of
 * the five are shop-blocked, which a random-by-quality spawn would skip), then
 * a random rare and a random epic.
 */
const UNIQUES = itemsOfQuality('unique')
const EQUIPMENT_LOOT: readonly LootDef[] = [
  {
    id: 'random_unique_item',
    path: EQUIPMENT_PICKUP_PATH,
    label: 'Random unique item',
    group: 'Items',
    description: `One of the ${UNIQUES.length} unique items, picked when the dungeon is generated: ${UNIQUES.map((i) => i.name).join(', ')}.`,
    equipment: { anyOf: UNIQUES.map((i) => i.id) }
  },
  ...UNIQUES.map((item) => ({
    id: `unique_${item.id}`,
    path: EQUIPMENT_PICKUP_PATH,
    label: `${item.name} (unique)`,
    group: 'Items',
    description: `${item.name}: ${item.effect}`,
    equipment: { id: item.id }
  })),
  {
    id: 'random_rare_item',
    path: EQUIPMENT_PICKUP_PATH,
    label: 'Random rare item',
    group: 'Items',
    description: 'One random rare item, rolled by the game when the plate is pressed.',
    equipment: { quality: ITEM_QUALITY.rare }
  },
  {
    id: 'random_epic_item',
    path: EQUIPMENT_PICKUP_PATH,
    label: 'Random epic item',
    group: 'Items',
    description: 'One random epic item, rolled by the game when the plate is pressed.',
    equipment: { quality: ITEM_QUALITY.epic }
  }
]

const CHESTS: readonly LootDef[] = (['wood', 'blue', 'red', 'green'] as const).map((colour) => ({
  id: `chest_${colour}`,
  path: `items/misc/chest_${colour}.unit`,
  label: `Chest (${colour[0].toUpperCase()}${colour.slice(1)})`,
  group: 'Chests',
  description: `A ${colour} treasure chest — the same asset the dungeon floors scatter as a powerup.`
}))

/**
 * The nine coin pickups, as [id, label, gold]. Three metals of three sizes —
 * a single coin, a small stack, a big pile — in the order the game's own
 * files number them; bronze, silver, gold.
 */
const COINS: ReadonlyArray<readonly [string, string, number]> = [
  ['valuable_1', 'Bronze coin', 1],
  ['valuable_2', 'Bronze coins', 5],
  ['valuable_3', 'Bronze coin pile', 10],
  ['valuable_4', 'Silver coin', 3],
  ['valuable_5', 'Silver coins', 13],
  ['valuable_6', 'Silver coin pile', 25],
  ['valuable_7', 'Gold coin', 5],
  ['valuable_8', 'Gold coins', 27],
  ['valuable_9', 'Gold coin pile', 42]
]

/** The four diamonds, as [id, label, gold], cheapest first. */
const DIAMONDS: ReadonlyArray<readonly [string, string, number]> = [
  ['valuable_diamond_small', 'Small blue diamond', 50],
  ['valuable_diamond_small_red', 'Small red diamond', 100],
  ['valuable_diamond', 'Blue diamond', 250],
  ['valuable_diamond_red', 'Red diamond', 500]
]

/** HW1 valuable id -> the AE money unit (hw2ae's pairing, matched on gold value). */
const MONEY_UNIT: Record<string, string> = {
  valuable_1: 'coin_copper_small',
  valuable_2: 'coin_copper_medium',
  valuable_3: 'coin_copper_large',
  valuable_4: 'coin_silver_small',
  valuable_5: 'coin_silver_medium',
  valuable_6: 'coin_silver_large',
  valuable_7: 'coin_gold_small',
  valuable_8: 'coin_gold_medium',
  valuable_9: 'coin_gold_large',
  valuable_diamond_small: 'diamond_small',
  valuable_diamond_small_red: 'diamond_small_red',
  valuable_diamond: 'diamond',
  valuable_diamond_red: 'diamond_red'
}

const money = (group: string, rows: ReadonlyArray<readonly [string, string, number]>): LootDef[] =>
  rows.map(([id, name, gold]) => ({
    id,
    path: `items/pickups/money/${MONEY_UNIT[id]}.unit`,
    label: `${name} (${gold} gold)`,
    group,
    description: `${name} — worth ${gold} gold when picked up.`
  }))

/** Every item a mystery button can spawn, in dropdown order. */
export const MYSTERY_LOOT_DEFS: readonly LootDef[] = [
  ...CHESTS,
  ...money('Coins', COINS),
  ...money('Diamonds', DIAMONDS),
  ...EQUIPMENT_LOOT,
  ...PICKUP_DEFS.map(({ lane: _lane, ...def }) => def)
]

/** The <optgroup> order, first-seen, like PICKUP_GROUPS. */
export const MYSTERY_LOOT_GROUPS: readonly string[] = MYSTERY_LOOT_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const LOOT_BY_ID = new Map(MYSTERY_LOOT_DEFS.map((def) => [def.id, def]))

/** Looks a loot entry up by id. Undefined for an unknown id — validation is the gate. */
export function mysteryLootById(id: string): LootDef | undefined {
  return LOOT_BY_ID.get(id)
}
