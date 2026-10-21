/**
 * What a lobby hands the party: its starting gold (as red diamonds) and free
 * upgrade pickups. Shared by the lobby builder, the parameters and validation.
 */

/**
 * Gold per red diamond. [VERIFIED] `items/pickups/money/diamond_red.unit`
 * gives exactly 500 (GiveGold amount 500), so a lobby's starting gold is a
 * multiple of 500, one diamond each.
 */
export const DIAMOND_VALUE = 500

/** Hard cap on diamonds in one room — a bound on output size, not a balance knob. */
export const MAX_DIAMOND_COUNT = 10_000

export const DIAMOND_UNIT = 'items/pickups/money/diamond_red.unit'

/** How many red diamonds `startingGold` pays out as (floored, never negative). */
export function diamondCount(startingGold: number): number {
  if (!Number.isFinite(startingGold) || startingGold <= 0) return 0
  return Math.min(MAX_DIAMOND_COUNT, Math.floor(startingGold / DIAMOND_VALUE))
}

/**
 * Append-only: `lobby<i>Upgrades` stores the counts positionally in this
 * order, so a file written before speed/attack speed existed (8 numbers)
 * still reads, with the new kinds at zero. AE ships all twelve pickups.
 */
export const UPGRADE_KINDS = [
  'damage',
  'defense',
  'health',
  'mana',
  'damage2',
  'defense2',
  'health2',
  'mana2',
  'speed',
  'attackspeed',
  'speed2',
  'attackspeed2'
] as const

export type UpgradeKind = (typeof UPGRADE_KINDS)[number]

/** How many of each free upgrade a room puts on the floor. */
export type UpgradeCounts = Readonly<Record<UpgradeKind, number>>

/** The AE pickup a kind places: `mana2` is `items/pickups/upgrade_mana_2.unit`. */
export function upgradeItemPath(kind: UpgradeKind): string {
  return `items/pickups/upgrade_${kind.replace(/2$/, '_2')}.unit`
}

/** Every kind at zero — the "no free upgrades at all" set. */
export function noUpgrades(): UpgradeCounts {
  return Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 0])) as UpgradeCounts
}

/** Every kind at one. */
export function oneOfEachUpgrade(): UpgradeCounts {
  return Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 1])) as UpgradeCounts
}

/** A room's fixed payout spots, in tiles (lobby/stockTown.ts). */
export interface TownPayout {
  diamonds: ReadonlyArray<readonly [number, number]>
  upgrades: Readonly<Record<UpgradeKind, readonly [number, number]>>
}

/** `cols` × `rows` spots from (x0, y0), one tile apart, in reading order. */
export function payoutBlock(x0: number, y0: number, cols: number, rows: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push([x0 + x, y0 + y])
  return out
}

/** The column order the user placed the upgrades in, base kind on top, its `_2` below. */
const PLACED_ORDER = ['attackspeed', 'damage', 'defense', 'health', 'mana', 'speed'] as const

/** Two rows of upgrades from (x0, y), one column per kind in `PLACED_ORDER`. */
export function upgradeRows(x0: number, y: number): TownPayout['upgrades'] {
  const out = {} as Record<UpgradeKind, readonly [number, number]>
  PLACED_ORDER.forEach((kind, i) => {
    out[kind] = [x0 + i, y]
    out[`${kind}2`] = [x0 + i, y + 1]
  })
  return out
}
