/**
 * What an item stall sells, in words a dungeon master can read.
 *
 * An item vendor (AE ShopArea Type 2) sells one or more of AE's equipment
 * loot tables, `equipment_1` … `equipment_5` (tweak/shops/equipment.sval,
 * snapshotted in catalog/equipment.generated.ts). Each table is five slots;
 * each slot rolls a quality, then a random unsold item of that quality — so a
 * stall with two tiers ticked lists ten items. Prices are per quality
 * (scripts/Data/Misc.as, the Players tab's `equipment_*` shop keys). Uniques
 * are never in a table: they only come from a mystery plate.
 */
import { EQUIPMENT_ITEMS, EQUIPMENT_TIERS } from '../catalog/equipment.generated'
import { EQUIPMENT_TIER_IDS } from '../catalog/equipmentParse'
import type { EquipmentItem, EquipmentQuality, EquipmentSlot } from '../catalog/equipmentParse'
import { PLAYER_STOCK } from '../players/stock.generated'
import { shopKey } from '../players/fields'
import type { PlayerTweaks } from '../players/fields'

export type { EquipmentItem, EquipmentQuality, EquipmentSlot }
export { EQUIPMENT_ITEMS, EQUIPMENT_TIERS, EQUIPMENT_TIER_IDS }

/** The qualities an item stall can sell, cheapest first. */
export const SOLD_QUALITIES: readonly EquipmentQuality[] = ['common', 'uncommon', 'rare', 'epic']

export const QUALITY_LABELS: Readonly<Record<EquipmentQuality, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  unique: 'Unique'
}

/** A short name per tier, so "Tier 4" says something at a glance. */
export const TIER_NAMES: readonly string[] = ['Starter', 'Basic', 'Solid', 'Strong', 'Elite']

/** `equipment_3` → 3; 0 for anything else. */
export function equipmentTier(category: string): number {
  const m = /^equipment_([1-5])$/.exec(category)
  return m === null ? 0 : Number(m[1])
}

/** A quality's price: the Players tab's edit if any, else AE's stock price. */
export function qualityPrice(quality: EquipmentQuality, tweaks?: PlayerTweaks): number {
  const id = `equipment_${quality}`
  const edited = tweaks?.[shopKey(id)]
  if (edited !== undefined) return edited
  return PLAYER_STOCK.shop.find((p) => p.id === id)?.stock ?? 0
}

export interface TierSummary {
  tier: number
  name: string
  slots: readonly EquipmentSlot[]
  /** expected items of each quality, over the tier's five slots */
  expected: Partial<Record<EquipmentQuality, number>>
  /** every quality the tier can roll, cheapest first */
  qualities: EquipmentQuality[]
  minPrice: number
  maxPrice: number
}

/** What one `equipment_<tier>` table sells. */
export function tierSummary(tier: number, tweaks?: PlayerTweaks): TierSummary {
  const slots = EQUIPMENT_TIERS[`equipment_${tier}`] ?? []
  const expected: Partial<Record<EquipmentQuality, number>> = {}
  for (const slot of slots) {
    const total = slot.reduce((n, d) => n + d.weight, 0)
    for (const d of slot) expected[d.quality] = (expected[d.quality] ?? 0) + d.weight / total
  }
  const qualities = SOLD_QUALITIES.filter((q) => (expected[q] ?? 0) > 0)
  const prices = qualities.map((q) => qualityPrice(q, tweaks))
  return {
    tier,
    name: TIER_NAMES[tier - 1] ?? `Tier ${tier}`,
    slots,
    expected,
    qualities,
    minPrice: prices.length > 0 ? Math.min(...prices) : 0,
    maxPrice: prices.length > 0 ? Math.max(...prices) : 0
  }
}

/** Every item of one quality, in the game's file order. */
export function itemsOfQuality(quality: EquipmentQuality): EquipmentItem[] {
  return EQUIPMENT_ITEMS.filter((i) => i.quality === quality)
}

export function equipmentById(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS.find((i) => i.id === id)
}
