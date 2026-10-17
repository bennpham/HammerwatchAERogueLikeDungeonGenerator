/**
 * Which vendors a dungeon shop room rolls between, and how an item vendor
 * picks its equipment tier. A leaf module (no imports) so config/parameters.ts
 * can take its defaults without pulling objectSet.ts in at runtime.
 */

/** A shop room's vendor kinds — objectSet.ts SHOP_KINDS, in that order. */
export const SHOP_KIND_IDS = ['combo', 'offense', 'defense', 'misc', 'power', 'item'] as const

export type ShopKindId = (typeof SHOP_KIND_IDS)[number]

export const SHOP_KIND_LABELS: Readonly<Record<ShopKindId, string>> = {
  combo: 'Combo',
  offense: 'Offense',
  defense: 'Defense',
  misc: 'Misc',
  power: 'Power',
  item: 'Items'
}

/**
 * The vendors a shop room rolls between when a campaign names none: the four
 * skill vendors HW1's generator rolled between, and the item vendor.
 */
export const DEFAULT_SHOP_KIND_IDS: readonly ShopKindId[] = ['combo', 'offense', 'defense', 'misc', 'item']

export function isShopKindId(id: string): id is ShopKindId {
  return (SHOP_KIND_IDS as readonly string[]).includes(id)
}

/**
 * How a dungeon item vendor picks its equipment tier: relative weights for
 * the common/uncommon band (tiers 1-3, split evenly), the rare tier (4) and
 * the epic tier (5). The owner's call (2026-10-16): mostly common/uncommon,
 * sometimes rare, an epic stall least often.
 */
export type ItemVendorOdds = [commonUncommon: number, rare: number, epic: number]

export const DEFAULT_ITEM_VENDOR_ODDS: Readonly<ItemVendorOdds> = [70, 20, 10]

/** The most any one of the three odds may be — a bound for validation. */
export const MAX_ITEM_VENDOR_ODDS = 1000

/**
 * Integer weights for tiers 1..5 under `odds`: the common/uncommon band's
 * weight goes to each of tiers 1-3 and the other two are tripled, so the band
 * still gets the share `odds` gives it, with no fractions.
 */
export function itemTierWeights(odds: Readonly<ItemVendorOdds>): number[] {
  const [band, rare, epic] = odds
  return [band, band, band, rare * 3, epic * 3]
}

/** The tier (1-5) a uniform draw `roll` in [0, sum of weights) lands on. */
export function itemTierOf(weights: readonly number[], roll: number): number {
  let at = roll
  for (let i = 0; i < weights.length; i++) {
    if (at < weights[i]) return i + 1
    at -= weights[i]
  }
  return weights.length
}
