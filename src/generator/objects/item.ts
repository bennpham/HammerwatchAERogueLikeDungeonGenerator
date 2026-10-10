import { XMLDictionary, XMLFloat, XMLInt, XMLObject, XMLString } from '../xml'
import type { GenerationContext } from '../core/context'

const TREASURE = [
  'items/valuable_1.xml',
  'items/valuable_2.xml',
  'items/valuable_3.xml',
  'items/valuable_4.xml',
  'items/valuable_5.xml',
  'items/valuable_6.xml',
  'items/valuable_7.xml',
  'items/valuable_8.xml',
  'items/valuable_9.xml'
]

const BREAKABLES = [
  'items/breakable_barrel.xml',
  'items/breakable_barrel_b.xml',
  'items/breakable_barrel_b_v2.xml',
  'items/breakable_barrel_v2.xml',
  'items/breakable_crate.xml',
  'items/breakable_crate_b.xml',
  'items/breakable_vase.xml',
  'items/breakable_vase_v2.xml',
  'items/breakable_vase_v3.xml',
  'items/breakable_vase_v4.xml'
]

const FOOD = ['items/health_1.xml', 'items/mana_1.xml']

const POWERUPS = [
  'items/powerup_potion1.xml',
  'items/powerup_potion2.xml',
  'items/powerup_potion3.xml',
  'items/powerup_health.xml',
  'items/chest_blue.xml',
  'items/chest_red.xml',
  'items/chest_green.xml',
  'items/chest_wood.xml'
]

const KEYS = ['items/key_bronze.xml', 'items/key_silver.xml', 'items/key_gold.xml']

const DOORS = [
  'items/door_a_bronze_h_v2.xml',
  'items/door_a_silver_h_v2.xml',
  'items/door_a_gold_h_v2.xml',
  'items/door_a_bronze_v.xml',
  'items/door_a_silver_v.xml',
  'items/door_a_gold_v.xml'
]

/** Index into KEYS/DOORS for the gold tier — the highest of the three. */
export const GOLD_LOCK_TIER = 2

const ORBS = ['items/crystal_purple.xml', 'items/crystal_green.xml', 'items/crystal_red.xml']

export const ItemType = {
  Treasure: TREASURE,
  Breakable: BREAKABLES,
  Food: FOOD,
  Powerup: POWERUPS,
  Key: KEYS,
  Door: DOORS,
  Orb: ORBS
} as const

export type ItemTypeName = keyof typeof ItemType

/** A pickup/prop placed on the level (ported from Item.java). */
export class Item extends XMLObject {
  id: number

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: ItemTypeName,
    public index: number
  ) {
    super()
    this.id = ctx.idCounter++
  }

  static create(ctx: GenerationContext, x: number, y: number, type: ItemTypeName, index?: number): Item {
    const variants = ItemType[type]
    const i = new Item(ctx, x, y, type, index ?? ctx.rand.iRand(0, variants.length))
    ctx.items.push(i)
    return i
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', ItemType[this.type][this.index]))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    return dict.getXML()
  }
}
