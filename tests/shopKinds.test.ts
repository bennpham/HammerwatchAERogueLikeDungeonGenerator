import { describe, expect, it } from 'vitest'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { validateParameters } from '../src/generator/config/validation'
import { SHOP_KINDS, enabledShopKinds } from '../src/generator/objects/objectSet'
import {
  DEFAULT_SHOP_KIND_IDS,
  SHOP_KIND_IDS,
  itemTierOf,
  itemTierWeights
} from '../src/generator/objects/vendorRoll'
import type { DungeonParameters } from '../src/generator'
import { generateOk, intParam, levelsOf, scriptsOf, strParam } from './ae'
import { plainParameters } from './params'

/** Every floor's shop stands, as `<Type>:<Categories>`. */
function floorShops(params: DungeonParameters, seed = 1): string[] {
  const shops: string[] = []
  for (const [stem, level] of levelsOf(generateOk(params, seed))) {
    if (!stem.startsWith('floor')) continue
    for (const s of scriptsOf(level, 'ShopArea')) shops.push(`${intParam(s, 'Type') ?? 0}:${strParam(s, 'Categories')}`)
  }
  return shops
}

function withShops(patch: Partial<DungeonParameters>): DungeonParameters {
  return { ...plainParameters(), shopChance: 1, ...patch }
}

describe('shop room vendors', () => {
  it('lists the same vendor ids as SHOP_KINDS', () => {
    expect(SHOP_KINDS.map((k) => k.id)).toEqual([...SHOP_KIND_IDS])
  })

  it('rolls the item vendor by default', () => {
    expect(DEFAULT_SHOP_KIND_IDS).toContain('item')
    expect(enabledShopKinds(undefined).map((k) => k.id)).toEqual(['combo', 'offense', 'defense', 'misc', 'item'])
  })

  it('splits the common/uncommon band over tiers 1-3', () => {
    expect(itemTierWeights([70, 20, 10])).toEqual([70, 70, 70, 60, 30])
    const weights = itemTierWeights([1, 1, 1])
    const tiers = Array.from({ length: 9 }, (_, roll) => itemTierOf(weights, roll))
    expect(tiers).toEqual([1, 2, 3, 4, 4, 4, 5, 5, 5])
    expect(itemTierOf(itemTierWeights([0, 0, 1]), 0)).toBe(5)
  })

  it('sells one equipment tier per item vendor, Type 2', () => {
    const shops = floorShops(withShops({ shopKinds: ['item'] }))
    expect(shops.length).toBeGreaterThan(0)
    for (const shop of shops) expect(shop).toMatch(/^2:equipment_[1-5]$/)
  }, 120_000)

  it('follows the odds: all epic, or only common/uncommon tiers', () => {
    expect(new Set(floorShops(withShops({ shopKinds: ['item'], itemVendorOdds: [0, 0, 1] })))).toEqual(new Set(['2:equipment_5']))
    for (const shop of floorShops(withShops({ shopKinds: ['item'], itemVendorOdds: [1, 0, 0] }))) {
      expect(shop).toMatch(/^2:equipment_[123]$/)
    }
  }, 120_000)

  it('badges a dungeon item stand with its tier', () => {
    const result = generateOk(withShops({ shopKinds: ['item'], itemVendorOdds: [0, 1, 0] }))
    const stands = [...levelsOf(result)].flatMap(([, l]) => l.units.filter((u) => u.path === 'doodads/generic/shop_item.unit'))
    expect(stands.length).toBeGreaterThan(0)
    for (const stand of stands) expect(stand.state?.start).toEqual({ kind: 'string', value: '4' })
  }, 120_000)

  it('takes no extra draw when the item vendor is off: the odds change nothing', () => {
    const skills: Partial<DungeonParameters> = { shopKinds: ['combo', 'offense', 'defense', 'misc'] }
    const a = generateOk(withShops({ ...skills, itemVendorOdds: [1, 0, 0] }))
    const b = generateOk(withShops({ ...skills, itemVendorOdds: [0, 0, 1] }))
    expect(a.files.map((f) => f.content)).toEqual(b.files.map((f) => f.content))
  }, 120_000)
})

describe('shop room vendor parameters', () => {
  it('round-trips through parameters.txt', () => {
    const params = withShops({ shopKinds: ['power', 'item'], itemVendorOdds: [5, 3, 1] })
    const text = serializeParametersTxt(params)
    expect(text).toContain('shopKinds=power item')
    expect(text).toContain('itemVendorOdds=5 3 1')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.shopKinds).toEqual(['power', 'item'])
    expect(parsed.params.itemVendorOdds).toEqual([5, 3, 1])
  })

  it('reports an unknown vendor in parameters.txt', () => {
    const text = serializeParametersTxt(plainParameters()).replace(/^shopKinds=.*$/m, 'shopKinds=combo armory')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual(['shopKinds vendor "armory"'])
    expect(parsed.params.shopKinds).toEqual(['combo'])
  })

  it('refuses an empty or unknown vendor list', () => {
    const fields = (p: Partial<DungeonParameters>) => validateParameters(withShops(p)).errors.map((e) => e.field)
    expect(fields({ shopKinds: [] })).toContain('shopKinds')
    expect(fields({ shopKinds: ['armory'] })).toContain('shopKinds')
    expect(fields({ shopKinds: ['item'] })).not.toContain('shopKinds')
  })

  it('refuses odds that are negative, fractional, too large or all zero', () => {
    const fields = (odds: [number, number, number]) =>
      validateParameters(withShops({ itemVendorOdds: odds })).errors.map((e) => e.field)
    expect(fields([70, 20, 10])).not.toContain('itemVendorOdds')
    expect(fields([0, 0, 0])).toContain('itemVendorOdds')
    expect(fields([-1, 2, 3])).toContain('itemVendorOdds')
    expect(fields([1.5, 2, 3])).toContain('itemVendorOdds')
    expect(fields([1001, 0, 0])).toContain('itemVendorOdds')
  })
})
