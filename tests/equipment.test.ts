import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EQUIPMENT_ITEMS, EQUIPMENT_TIERS } from '../src/generator/catalog/equipment.generated'
import {
  EQUIPMENT_QUALITIES,
  EQUIPMENT_TIER_IDS,
  parseEquipmentItems,
  parseEquipmentTiers,
  parseLang
} from '../src/generator/catalog/equipmentParse'
import { equipmentTier, itemsOfQuality, qualityPrice, tierSummary } from '../src/generator/objects/equipment'
import { shopKey } from '../src/generator/players/fields'
import { AE_ROOT, aeAssetsDir } from './aeInstall'

const assets = aeAssetsDir()

describe('equipment snapshot', () => {
  it('has five tiers of five slots each', () => {
    for (const id of EQUIPMENT_TIER_IDS) expect(EQUIPMENT_TIERS[id]).toHaveLength(5)
  })

  it('climbs from all-common to one guaranteed epic', () => {
    const round = (n: number | undefined): number => Math.round((n ?? 0) * 100) / 100
    const shape = (tier: number) => {
      const e = tierSummary(tier).expected
      return [round(e.common), round(e.uncommon), round(e.rare), round(e.epic)]
    }
    expect(shape(1)).toEqual([5, 0, 0, 0])
    expect(shape(2)).toEqual([3.5, 1.5, 0, 0])
    expect(shape(3)).toEqual([1.5, 3.5, 0, 0])
    expect(shape(4)).toEqual([1, 2.5, 1.5, 0])
    expect(shape(5)).toEqual([0.67, 1.67, 1.67, 1])
  })

  it('never sells a unique', () => {
    for (const id of EQUIPMENT_TIER_IDS) {
      for (const slot of EQUIPMENT_TIERS[id]) expect(slot.some((d) => d.quality === 'unique')).toBe(false)
    }
    expect(itemsOfQuality('unique').length).toBeGreaterThan(0)
  })

  it('prices a tier from the Players tab when edited', () => {
    expect(tierSummary(1).minPrice).toBe(qualityPrice('common'))
    expect(tierSummary(5).maxPrice).toBe(qualityPrice('epic'))
    expect(qualityPrice('rare', { [shopKey('equipment_rare')]: 9 })).toBe(9)
  })

  it('reads a tier off a category id', () => {
    expect(equipmentTier('equipment_4')).toBe(4)
    expect(equipmentTier('def4')).toBe(0)
  })

  it.skipIf(assets === null)('matches the install', () => {
    const read = (rel: string): string => readFileSync(join(assets!, rel), 'utf8')
    expect(parseEquipmentTiers(read('tweak/shops/equipment.sval'))).toMatchObject(EQUIPMENT_TIERS)
    const strings = parseLang(readFileSync(join(AE_ROOT, 'res', 'language', 'english', 'items.lang'), 'utf8'))
    const items = EQUIPMENT_QUALITIES.flatMap((q) => parseEquipmentItems(read(`tweak/items/${q}.sval`), strings))
    expect(items).toEqual(EQUIPMENT_ITEMS)
  })
})
