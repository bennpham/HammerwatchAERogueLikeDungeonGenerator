import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHAIN_BY_KEY,
  GROWING_NUMBERS,
  HELD_NUMBERS,
  HW2_OWNED_SKILLS,
  HW2_SHOP_TIERS,
  PLAYER_STOCK,
  addedFieldSpecs,
  addedTiers,
  applyLineEdits,
  boughtRoot,
  canAddTiers,
  chainLevels,
  holdKey,
  levelsKey,
  playerOverrides,
  playerPresetById,
  prunePlayerTweaks,
  skillKey,
  unlockKey,
  validatePlayerTweaks
} from '../src/generator/players'
import { aeAssetsDir } from './aeInstall'

const HW2_PRESETS = ['hw2-level-1', 'hw2-level-10', 'hw2-level-25', 'hw2-level-50']

/** Every number a tier past stock can set, by chain. */
const ADDED_NUMBERS = PLAYER_STOCK.skills.flatMap((file) =>
  file.chains.filter(canAddTiers).flatMap((chain) =>
    addedFieldSpecs(chain)
      .filter((s) => s.kind !== 'cost')
      .map((s) => ({ chain: chain.key, name: s.name }))
  )
)

describe('the HW2 shop rule', () => {
  it('sorts every number a tier past stock can set: it grows, or it holds', () => {
    for (const { chain, name } of ADDED_NUMBERS) {
      expect(GROWING_NUMBERS.has(name) || HELD_NUMBERS.has(name), `${chain}: ${name}`).toBe(true)
      expect(GROWING_NUMBERS.has(name) && HELD_NUMBERS.has(name), name).toBe(false)
    }
    // and names nothing the snapshot lacks
    const known = new Set(ADDED_NUMBERS.map((n) => n.name))
    for (const name of [...GROWING_NUMBERS, ...HELD_NUMBERS]) expect(known.has(name), name).toBe(true)
  })

  it("owns each class's skills 2 and 3: the two active skills it would buy", () => {
    for (const c of PLAYER_STOCK.classes) {
      const owned = HW2_OWNED_SKILLS[c.id]
      expect(owned, c.id).toBeDefined()
      expect(c.skills.slice(2, 4).map((s) => s.path.split('/').pop()!.replace(/\.sval$/, '')), c.id).toEqual([...owned])
      for (const stem of owned) expect(boughtRoot(CHAIN_BY_KEY.get(stem)!.file), stem).toBeDefined()
    }
  })
})

describe.each(HW2_PRESETS)('the %s preset', (id) => {
  const tweaks = prunePlayerTweaks(playerPresetById(id)!.build())

  it('owns skills 2 and 3 from the start, and leaves the passives and combo for sale', () => {
    for (const stems of Object.values(HW2_OWNED_SKILLS)) for (const stem of stems) expect(tweaks[unlockKey(stem)], stem).toBe(1)
    for (const stem of ['wiz_fire_shield', 'wiz_combustion', 'pal_bash', 'ran_dodge', 'ran_marksman', 'thief_dodge', 'shared_combo']) {
      expect(tweaks[unlockKey(stem)], stem).toBeUndefined()
    }
  })

  it('sells health, mana, armor, regen, damage and the combo timer up to tier 99', () => {
    for (const c of PLAYER_STOCK.classes) {
      const prefix = c.skills[0].path.split('/').pop()!.split('_')[0]
      for (const chain of [`${prefix}_misc_health`, `${prefix}_misc_mana`, `${prefix}_misc_armor:1`]) {
        expect(chainLevels(chain, tweaks), chain).toBe(HW2_SHOP_TIERS)
      }
    }
    for (const chain of ['pal_sword:pal_sword_dmg', 'wiz_fireball:wiz_fireball_damage', 'ran_bow:ran_bow_damage', 'thief_knives:thief_knives_dmg', 'priest_health_regen', 'shared_combo:shared_combo_timer', 'shared_combo:shared_combo_heal']) {
      expect(chainLevels(chain, tweaks), chain).toBe(HW2_SHOP_TIERS)
    }
  })

  it('keeps chances, projectile counts and move speed at the stock top', () => {
    for (const chain of ['ran_dodge', 'thief_dodge', 'ran_marksman', 'sorc_frost_shield', 'ran_flurry:ran_flurry_waves', 'thief_fan:thief_fan_arc', 'sorc_nova:sorc_nova_count', 'wiz_fire_nova:wiz_fire_nova_flames', 'shared_combo:shared_combo_nova', 'shared_speed:shared_misc_speed_modifier', 'shared_speed_melee:shared_misc_speed_modifier']) {
      expect(chainLevels(chain, tweaks), chain).toBe(CHAIN_BY_KEY.get(chain)!.chain.tiers.length)
    }
  })

  it('raises the bow damage past tier 5 while arrow speed and lifetime stay put', () => {
    const chain = 'ran_bow:ran_bow_damage'
    const stock = CHAIN_BY_KEY.get(chain)!.chain.tiers.length
    const added = addedTiers(chain, tweaks)
    expect(added).toHaveLength(HW2_SHOP_TIERS - stock)
    for (const name of ['proj-speed', 'proj-ttl']) {
      expect(tweaks[holdKey(chain, name)], name).toBe(1)
      const top = tweaks[skillKey(chain, stock, name)] ?? CHAIN_BY_KEY.get(chain)!.chain.tiers[stock - 1].binds[name].stock
      for (const t of added) expect(t.values[name], `${name} at tier ${t.tier}`).toBe(top)
    }
    for (let i = 1; i < added.length; i++) expect(added[i].values['proj-damage']).toBeGreaterThan(added[i - 1].values['proj-damage'])
  })

  it('never takes a chance past its stock top, on any added tier', () => {
    for (const { chain, name } of ADDED_NUMBERS.filter((n) => n.name.endsWith('-chance'))) {
      const tiers = CHAIN_BY_KEY.get(chain)!.chain.tiers
      const top = tweaks[skillKey(chain, tiers.length, name)] ?? tiers[tiers.length - 1].binds[name].stock
      for (const t of addedTiers(chain, tweaks)) expect(t.values[name], `${chain} ${name} tier ${t.tier}`).toBeLessThanOrEqual(top)
    }
  })

  it('validates clean and builds its player files', () => {
    expect(validatePlayerTweaks(tweaks)).toEqual({ errors: [], warnings: [] })
    const started = Date.now()
    const overrides = playerOverrides(tweaks)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(overrides.some((o) => o.edits.some((e) => e.kind === 'clone'))).toBe(true)
  })
})

describe('holding a number past stock', () => {
  it('keeps it at its last stock value on every added tier, and only 0 or 1 is valid', () => {
    const chain = 'wiz_fireball:wiz_fireball_damage'
    const base = { [levelsKey(chain)]: 20 }
    const free = addedTiers(chain, base)
    const held = addedTiers(chain, { ...base, [holdKey(chain, 'proj-radius')]: 1 })
    expect(free[free.length - 1].values['proj-radius']).not.toBe(held[0].values['proj-radius'])
    expect(new Set(held.map((t) => t.values['proj-radius'])).size).toBe(1)
    // the rest still climbs as before
    expect(held.map((t) => t.values['proj-damage'])).toEqual(free.map((t) => t.values['proj-damage']))
    expect(validatePlayerTweaks({ ...base, [holdKey(chain, 'proj-radius')]: 2 }).errors.map((e) => e.field)).toEqual([holdKey(chain, 'proj-radius')])
    // a hold is dropped when it's off (stock 0)
    expect(prunePlayerTweaks({ ...base, [holdKey(chain, 'proj-radius')]: 0 })).toEqual(base)
  })
})

describe.skipIf(aeAssetsDir() === null)('the Endgame preset, patched into the game files', () => {
  it('stays a reasonable size', () => {
    const overrides = playerOverrides(prunePlayerTweaks(playerPresetById('hw2-level-50')!.build()))
    let bytes = 0
    for (const o of overrides) {
      const stockText = readFileSync(join(aeAssetsDir()!, o.source), 'utf8')
      const patched = applyLineEdits(stockText, o.edits)
      expect(patched.missed, o.path).toEqual([])
      bytes += patched.text.length
    }
    expect(bytes).toBeLessThan(12 * 1024 * 1024)
  })
})
