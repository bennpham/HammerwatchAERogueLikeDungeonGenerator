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
 *   [UNVERIFIED] valuable_diamond_small / _small_red / valuable_diamond via
 *                SpawnObject — amounts read from their asset files
 */
import { PICKUP_DEFS } from './pickupTypes'
import type { PickupDef } from './pickupTypes'

/** A mystery-button loot entry: a pickup without the arena's drop-pad lane. */
export type LootDef = Omit<PickupDef, 'lane'>

const CHESTS: readonly LootDef[] = (['wood', 'blue', 'red', 'green'] as const).map((colour) => ({
  id: `chest_${colour}`,
  path: `items/chest_${colour}.xml`,
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

const money = (group: string, rows: ReadonlyArray<readonly [string, string, number]>): LootDef[] =>
  rows.map(([id, name, gold]) => ({
    id,
    path: `items/${id}.xml`,
    label: `${name} (${gold} gold)`,
    group,
    description: `${name} — worth ${gold} gold when picked up.`
  }))

/** Every item a mystery button can spawn, in dropdown order. */
export const MYSTERY_LOOT_DEFS: readonly LootDef[] = [
  ...CHESTS,
  ...money('Coins', COINS),
  ...money('Diamonds', DIAMONDS),
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
