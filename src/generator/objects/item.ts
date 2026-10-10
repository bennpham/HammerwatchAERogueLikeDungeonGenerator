import { getTheme } from '../config/themes'
import type { GenerationContext } from '../core/context'

/**
 * Pickups and props placed in rooms, as Anniversary Edition units. The HW1
 * categories and their indices are kept (rooms draw an index with `iRand`, so
 * each category's LENGTH is part of the RNG contract); the paths are AE's.
 * HW1→AE pairs follow hw2ae's table (matched on identical hp/value).
 */

/** valuable_1..9 → copper/silver/gold small/medium/large */
const TREASURE = [
  'items/pickups/money/coin_copper_small.unit',
  'items/pickups/money/coin_copper_medium.unit',
  'items/pickups/money/coin_copper_large.unit',
  'items/pickups/money/coin_silver_small.unit',
  'items/pickups/money/coin_silver_medium.unit',
  'items/pickups/money/coin_silver_large.unit',
  'items/pickups/money/coin_gold_small.unit',
  'items/pickups/money/coin_gold_medium.unit',
  'items/pickups/money/coin_gold_large.unit'
]

/** AE breakables are doodads under doodads/generic/containers; ten slots like HW1 */
const BREAKABLES = [
  'doodads/generic/containers/barrel_wood.unit',
  'doodads/generic/containers/barrel_wood_poor.unit',
  'doodads/generic/containers/barrel_wood_poor.unit',
  'doodads/generic/containers/barrel_wood.unit',
  'doodads/generic/containers/crate_wood_12x12.unit',
  'doodads/generic/containers/crate_wood_16x16.unit',
  'doodads/generic/containers/vase_big.unit',
  'doodads/generic/containers/vase_big.unit',
  'doodads/generic/containers/vase_small.unit',
  'doodads/generic/containers/vase_small.unit'
]

const FOOD = ['items/pickups/health_1.unit', 'items/pickups/mana_1.unit']

const POWERUPS = [
  'items/pickups/powerup_potion_1_invul.unit',
  'items/pickups/powerup_potion_2_rejuv.unit',
  'items/pickups/powerup_potion_3_dmg.unit',
  'items/pickups/special_serious_health.unit',
  'items/misc/chest_blue.unit',
  'items/misc/chest_red.unit',
  'items/misc/chest_green.unit',
  'items/misc/chest_wood.unit'
]

/** key index = lock tier: bronze, silver, gold */
export const KEY_UNITS = ['items/pickups/key_bronze.unit', 'items/pickups/key_silver.unit', 'items/pickups/key_gold.unit']

/** the `Collectable` a DoorController asks for, per lock tier */
export const KEY_COLLECTABLES = ['key_bronze', 'key_silver', 'key_gold']

const DOOR_METALS = ['bronze', 'silver', 'gold']

/** Index into KEYS/DOORS for the gold tier — the highest of the three. */
export const GOLD_LOCK_TIER = 2

/**
 * The run-ending pickup. AE has no HW1 crystal; the sphere collectable is
 * what hw2ae ported the generator's win orb to. The second and third slots are
 * kept for index compatibility.
 */
const ORBS = [
  'items/pickups/collectable_10_sphere.unit',
  'items/pickups/collectable_10_sphere.unit',
  'items/pickups/collectable_10_sphere.unit'
]

/**
 * Door slots: 0..2 horizontal bronze/silver/gold, 3..5 vertical. The unit is
 * resolved per floor theme (`ThemeDef.doors`) in `itemPath`.
 */
const DOORS = ['h0', 'h1', 'h2', 'v0', 'v1', 'v2']

export const ItemType = {
  Treasure: TREASURE,
  Breakable: BREAKABLES,
  Food: FOOD,
  Powerup: POWERUPS,
  Key: KEY_UNITS,
  Door: DOORS,
  Orb: ORBS
} as const

export type ItemTypeName = keyof typeof ItemType

/** `doodads/doors/door_{h|v}_mid_<metal>_<style>.unit` for a door slot on a theme. */
export function doorUnitPath(slot: number, themeId: string): string {
  const style = getTheme(themeId)?.doors ?? 'prison'
  const orient = slot >= 3 ? 'v' : 'h'
  return `doodads/doors/door_${orient}_mid_${DOOR_METALS[slot % 3]}_${style}.unit`
}

/** A pickup/prop placed on the level (ported from Item.java). */
export class Item {
  id: number
  /** the floor theme at creation, which picks door art */
  theme: string

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: ItemTypeName,
    public index: number
  ) {
    this.id = ctx.idCounter++
    this.theme = ctx.currentTheme
  }

  static create(ctx: GenerationContext, x: number, y: number, type: ItemTypeName, index?: number): Item {
    const variants = ItemType[type]
    const i = new Item(ctx, x, y, type, index ?? ctx.rand.iRand(0, variants.length))
    ctx.items.push(i)
    return i
  }

  /** The AE unit this item places. */
  get path(): string {
    if (this.type === 'Door') return doorUnitPath(this.index, this.theme)
    return ItemType[this.type][this.index]
  }
}
