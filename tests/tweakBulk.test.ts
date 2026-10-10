import { describe, expect, it } from 'vitest'
import {
  SHOP_PRICE_MAX,
  EXTRA_LIFE_UPGRADES,
  STAT_GROUPS,
  TWEAK_FIELDS,
  applyCostPolicy,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlocks,
  applyStatFactor,
  buildLoadouts,
  changedFileIds,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  emitTweakFiles,
  groupOfStat,
  pruneTweaks,
  applyTiersSold,
  buildChains,
  deriveTiersSold,
  isDeadUpgrade,
  resetQuickSetup,
  shopPrice
} from '../src/generator/tweak'
import { TWEAK_BASELINE, applyTweaks } from '../src/generator/tweak'
import type { TweakChain, TweakUnitFile } from '../src/generator/tweak'
import { SKILL_UNLOCKS, fieldsOfGroup } from '../src/generator/tweak/bulk'
import { validateParameters } from '../src/generator/config/validation'
import { defaultParameters } from '../src/generator/config/parameters'
import type { PlayerTweaks } from '../src/generator/tweak'

const params = (playerTweaks: PlayerTweaks) => ({ ...defaultParameters(), playerTweaks })

// the tweaked file, which is what applyDeadUpgradeRemoval walks — a baseline
// upgrade would still carry its stock values and read as dead against a scaled stat
const knightFile = (tweaks: PlayerTweaks = {}): TweakUnitFile =>
  applyTweaks(tweaks).find((f) => f.id === 'knight') as TweakUnitFile
const knightUpgrade = (id: string, tweaks: PlayerTweaks = {}) =>
  knightFile(tweaks).upgrades.find((u) => u.id === id) as TweakUnitFile['upgrades'][number]

describe('stat groups', () => {
  it('claims every numeric character stat', () => {
    // a stat matching no rule would silently escape the bulk editor
    const scalable = TWEAK_FIELDS.filter(
      (f) =>
        f.fileId !== 'general' &&
        (f.group === 'param' || f.group === 'effect') &&
        f.type !== 'bool' &&
        f.type !== 'string' &&
        f.stat !== undefined
    )
    const owned = new Set(STAT_GROUPS.flatMap((g) => fieldsOfGroup(g.id).map((f) => f.key)))
    expect(scalable.filter((f) => !owned.has(f.key)).map((f) => f.key)).toEqual([])
  })

  it('files each stat under exactly one group', () => {
    const seen = new Map<string, number>()
    for (const group of STAT_GROUPS) {
      for (const field of fieldsOfGroup(group.id)) {
        seen.set(field.key, (seen.get(field.key) ?? 0) + 1)
      }
    }
    expect([...seen].filter(([, count]) => count !== 1)).toEqual([])
  })

  it('classifies the stats that are easy to mis-file', () => {
    expect(groupOfStat('max-health')).toBe('health')
    expect(groupOfStat('mana-regen')).toBe('mana')
    expect(groupOfStat('sword-dmg')).toBe('damage')
    // reads as "-dmg" to a careless rule but is defensive
    expect(groupOfStat('dmg-reduction')).toBe('defense')
    // reads as a mana stat but is defensive
    expect(groupOfStat('shield-dmg-per-mana')).toBe('defense')
    expect(groupOfStat('whirl-mana-cost')).toBe('costs')
    expect(groupOfStat('sword-arc')).toBe('utility')
  })
})

describe('stat factors', () => {
  it('writes nothing at x1', () => {
    expect(applyMasterFactor(1, {})).toEqual({})
    expect(pruneTweaks(applyMasterFactor(1, {}))).toEqual({})
    expect(emitTweakFiles(applyMasterFactor(1, {}))).toEqual([])
  })

  it('scales a starting stat and its whole ladder together', () => {
    const tweaks = applyStatFactor('health', 2, {})
    expect(tweaks['player.knight.param.max-health']).toBe(150)
    expect(tweaks['player.knight.effect.health-1.max-health']).toBe(240)
    expect(tweaks['player.knight.effect.health-5.max-health']).toBe(600)
    // and it reaches every class, not just the first
    expect(tweaks['player.priest.param.max-health']).toBe(60)
    expect(tweaks['player.wizard.param.max-health']).toBe(70)
  })

  it('divides stats where lower is better', () => {
    const tweaks = applyStatFactor('mana', 2, {})
    // a millisecond period: halving it doubles the regen rate
    expect(tweaks['player.knight.param.mana-regen']).toBe(550)
    expect(tweaks['player.knight.effect.mana-1.mana-regen']).toBe(500)
    expect(tweaks['player.knight.param.max-mana']).toBe(100)
  })

  it('makes skill costs cheaper as the factor rises', () => {
    const tweaks = applyStatFactor('costs', 2, {})
    expect(tweaks['player.knight.param.charge-mana-cost']).toBe(5)
    expect(tweaks['player.knight.param.whirl-mana-cost']).toBe(25)
  })

  it('leaves sentinels alone', () => {
    const tweaks = applyMasterFactor(3, {})
    // -1 is "skill locked", 9999 "unaffordable" — scaling either corrupts it
    expect(tweaks['player.knight.param.heal-amount']).toBeUndefined()
    expect(tweaks['player.knight.param.whirl-dur']).toBeUndefined()
    expect(tweaks['player.sorcerer.param.nova-mana-cost']).toBeUndefined()
  })

  it('keeps ints whole and floats short', () => {
    const tweaks = applyMasterFactor(1.5, {})
    for (const group of STAT_GROUPS) {
      for (const field of fieldsOfGroup(group.id)) {
        const value = tweaks[field.key]
        if (value === undefined) continue
        if (field.type === 'int') expect(Number.isInteger(value)).toBe(true)
        // 2.25 must not come back as 2.2500000000000004
        else expect(String(value).replace(/^-?\d*\.?/, '').length).toBeLessThanOrEqual(6)
      }
    }
  })

  it('derives the factor back out', () => {
    const tweaks = applyStatFactor('health', 2, {})
    expect(deriveStatFactor('health', tweaks)).toEqual({ factor: 2, uniform: true })
    expect(deriveMasterFactor(applyMasterFactor(2.5, {}))).toEqual({ factor: 2.5, uniform: true })
  })

  it('reports a hand-edited group as not uniform', () => {
    const tweaks = { ...applyStatFactor('health', 2, {}) }
    tweaks['player.knight.param.max-health'] = 999
    expect(deriveStatFactor('health', tweaks).uniform).toBe(false)
  })

  it('treats an untouched group as x1', () => {
    expect(deriveStatFactor('health', {})).toEqual({ factor: 1, uniform: true })
    expect(deriveMasterFactor({})).toEqual({ factor: 1, uniform: true })
  })

  it('is idempotent — factors measure from stock, not from the current value', () => {
    const once = applyStatFactor('damage', 2, {})
    expect(applyStatFactor('damage', 2, once)).toEqual(once)
  })

  it('refuses a factor that cannot scale anything', () => {
    expect(applyMasterFactor(0, { 'player.knight.param.max-health': 100 })).toEqual({
      'player.knight.param.max-health': 100
    })
    expect(applyMasterFactor(Number.NaN, {})).toEqual({})
  })

  it('produces no validation errors across a scaled roster', () => {
    for (const factor of [0.5, 2, 3]) {
      const result = validateParameters(params(applyMasterFactor(factor, {})))
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    }
  })
})

describe('cost policy', () => {
  it('makes every upgrade free', () => {
    const tweaks = applyCostPolicy('free', SHOP_PRICE_MAX, {})
    expect(tweaks['player.knight.cost.health-1']).toBe(0)
    expect(tweaks['player.shared.cost.life']).toBe(0)
    // the skill unlocks are ordinary upgrades, so they come free too
    expect(tweaks['player.knight.cost.whirl']).toBe(0)
    expect(deriveCostPolicy(tweaks, SHOP_PRICE_MAX)).toBe('free')
    // all eight unit files change, so all eight get emitted
    expect(changedFileIds(tweaks).sort()).toEqual([
      'knight',
      'priest',
      'ranger',
      'shared',
      'sorcerer',
      'thief',
      'warlock',
      'wizard'
    ])
  })

  it('empties the shop rather than pricing it out of reach', () => {
    // play-testing showed an omitted upgrade is simply absent from the shop,
    // which beats a price nobody can afford
    const tweaks = applyCostPolicy('removed', SHOP_PRICE_MAX, {})
    expect(deriveCostPolicy(tweaks, SHOP_PRICE_MAX)).toBe('removed')
    // no price overrides at all — the upgrades are gone, not expensive
    expect(tweaks['player.knight.cost.health-1']).toBeUndefined()
    expect(tweaks['player.knight.remove.health-1']).toBe(1)
    // base stats are untouched
    expect(tweaks['player.knight.param.max-health']).toBeUndefined()

    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')
    expect(knight?.content).not.toContain('<dictionary id=')
    expect(knight?.content).toContain('<upgrades>')
  })

  it('sets any custom price, including one that pays the player', () => {
    const bounty = applyCostPolicy('custom', -500, {})
    expect(bounty['player.knight.cost.health-1']).toBe(-500)
    expect(deriveCostPolicy(bounty, -500)).toBe('custom')

    const dear = applyCostPolicy('custom', 12345, {})
    expect(dear['player.knight.cost.health-1']).toBe(12345)
    expect(deriveCostPolicy(dear, 12345)).toBe('custom')
  })

  it('clamps a price to what the shop can display', () => {
    expect(shopPrice(50_000_000)).toBe(SHOP_PRICE_MAX)
    expect(shopPrice(-50_000_000)).toBe(-SHOP_PRICE_MAX)
    expect(shopPrice(12.6)).toBe(13)
    expect(shopPrice(Number.NaN)).toBe(0)
  })

  it('returns to stock from every policy', () => {
    for (const policy of ['free', 'removed', 'custom'] as const) {
      const changed = applyCostPolicy(policy, 4321, {})
      const back = applyCostPolicy('stock', 4321, changed)
      expect(pruneTweaks(back)).toEqual({})
      expect(deriveCostPolicy(back, 4321)).toBe('stock')
    }
  })

  it('reports a partly-edited shop as mixed', () => {
    expect(deriveCostPolicy({ 'player.knight.cost.health-1': 5 }, SHOP_PRICE_MAX)).toBe('mixed')
    // a removal says nothing about prices: removing extra lives or shortening a
    // ladder must not flip the price toggle off "Stock prices"
    expect(deriveCostPolicy({ 'player.shared.remove.life': 1 }, SHOP_PRICE_MAX)).toBe('stock')
    expect(deriveCostPolicy({ 'player.knight.remove.health-3': 1 }, SHOP_PRICE_MAX)).toBe('stock')
  })

  it('validates clean when everything is free, removed, or a bounty', () => {
    for (const [policy, price] of [
      ['free', 0],
      ['removed', 0],
      ['custom', -500]
    ] as const) {
      const result = validateParameters(params(applyCostPolicy(policy, price, {})))
      expect(result.errors).toEqual([])
    }
  })

  it('warns that a negative price pays the player', () => {
    const one = validateParameters(params({ 'player.knight.cost.health-1': -250 }))
    expect(one.errors).toEqual([])
    expect(one.warnings.some((w) => w.message.includes('pays the player 250 gold'))).toBe(true)
  })

  it('reports a whole bounty shop once, not 372 times', () => {
    const result = validateParameters(params(applyCostPolicy('custom', -500, {})))
    const bounty = result.warnings.filter((w) => w.message.includes('pay the player'))
    expect(bounty).toHaveLength(1)
    expect(bounty[0].message).toContain('up to 500 gold each')
  })

  it('says once that percentages over 100 do nothing', () => {
    // play-tested: shield-chance 500 on a Sorcerer still takes damage, because the
    // stock ladder stops at exactly 100 and a proc cannot fire more than always
    const result = validateParameters(
      params({
        'player.sorcerer.param.shield-chance': 500,
        'player.thief.param.dodge-chance': 250,
        'player.ranger.param.dodge-chance': 250
      })
    )
    const capped = result.warnings.filter((w) => w.message.includes('over 100%'))
    expect(capped).toHaveLength(1)
    expect(capped[0].message).toContain('dodge-chance, shield-chance')
    // dodge-chance really does grant invulnerability at 100; shield-chance does not
    expect(capped[0].message).toContain('dodge-chance at 100 already avoids every hit')
    expect(result.errors).toEqual([])
  })

  it('does not claim invulnerability for a proc-only chance', () => {
    const result = validateParameters(params({ 'player.sorcerer.param.shield-chance': 500 }))
    const capped = result.warnings.filter((w) => w.message.includes('over 100%'))
    expect(capped).toHaveLength(1)
    expect(capped[0].message).not.toContain('invulnerable')
  })

  it('leaves percentages at or below 100 alone', () => {
    const result = validateParameters(params({ 'player.sorcerer.param.shield-chance': 100 }))
    expect(result.warnings.filter((w) => w.message.includes('over 100%'))).toEqual([])
  })

  it('rejects a price the shop cannot display', () => {
    const result = validateParameters(params({ 'player.knight.cost.health-1': 10_000_000 }))
    expect(result.errors.some((e) => e.message.includes('cannot display'))).toBe(true)
  })
})

describe('skill unlocks', () => {
  it('finds an unlock for each class ultimate', () => {
    const knight = SKILL_UNLOCKS.filter((u) => u.fileId === 'knight').map((u) => u.flag)
    expect(knight).toContain('whirl')
    expect(knight).toContain('heal')
    expect(SKILL_UNLOCKS.some((u) => u.fileId === 'sorcerer' && u.flag === 'nova')).toBe(true)
    expect(SKILL_UNLOCKS.some((u) => u.fileId === 'wizard' && u.flag === 'meteor')).toBe(true)
  })

  // QuickSetup's STAT_GATED_SKILLS explains the gargoyle by hand instead of
  // giving it a checkbox. If the baseline ever gains a bool for it, that note
  // is wrong and the gargoyle belongs in SKILL_UNLOCKS like every other skill.
  it('leaves the warlock gargoyle out: it is gated by 0 stats, not a bool', () => {
    expect(SKILL_UNLOCKS.some((u) => u.fileId === 'warlock' && u.upgradeId === 'garg')).toBe(false)
    const warlock = TWEAK_BASELINE.find((file) => file.id === 'warlock')
    if (warlock?.kind !== 'unit') throw new Error('no warlock unit file')
    const stock = (name: string) => warlock.params.find((p) => p.name === name)?.value
    expect(stock('garg-dmg')).toBe(0)
    expect(stock('garg-dur')).toBe(0)
    const garg = warlock.upgrades.find((u) => u.id === 'garg')
    expect(garg?.children.some((c) => c.type === 'bool')).toBe(false)
    expect(garg?.children.map((c) => c.name)).toEqual(expect.arrayContaining(['garg-dmg', 'garg-dur']))
  })

  it('fills in the stats a locked skill leaves on sentinels', () => {
    const tweaks = applySkillUnlocks(true, {})
    expect(tweaks['player.knight.param.whirl']).toBe(1)
    // the flag alone would give a whirlwind that lasts -1 seconds
    expect(tweaks['player.knight.param.whirl-dur']).toBe(4)
    expect(tweaks['player.knight.param.whirl-dmg-multiplier']).toBe(1.5)
    expect(tweaks['player.sorcerer.param.nova-mana-cost']).toBe(50)
    expect(deriveSkillUnlocks(tweaks)).toBe(true)
  })

  it('writes booleans the game can read', () => {
    const xml = emitTweakFiles(applySkillUnlocks(true, {})).find((f) => f.path === 'tweak/knight.xml')
    expect(xml?.content).toContain('<bool name="whirl">true</bool>')
  })

  it('pre-unlocks the scaled skill when the roster is already scaled', () => {
    const scaled = applyStatFactor('damage', 2, {})
    const tweaks = applySkillUnlocks(true, scaled)
    // whirl-dmg-multiplier is a damage stat, so the ladder moved before the bake
    expect(tweaks['player.knight.param.whirl-dmg-multiplier']).toBe(3)
  })

  it('fills in the string a skill needs, not just its numbers', () => {
    // Regression: combo-nova-projectile and aura-buff are EMPTY at spawn and only
    // an upgrade fills them in. Pre-unlocking the skill without them armed a combo
    // nova with no projectile to spawn, and the game died with a
    // NullReferenceException in PlayerActorBehavior.Update mid-fight on floor 3.
    const tweaks = applySkillUnlocks(true, {})

    // the priest's aura upgrade carries its buff path as a child, so unlocking it
    // must bring the path along
    const priest = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/priest.xml')
    expect(priest?.content).toContain('<bool name="aura">true</bool>')
    expect(priest?.content).not.toContain('<string name="aura-buff"></string>')
    expect(priest?.content).toContain('buffs/priest_cripple_1.xml')
  })

  it('leaves no skill armed with an empty path', () => {
    // the general form of the crash above: any string param that starts empty must
    // not still be empty once its skill is switched on
    // combo is the case that actually crashed: its flag lives on one upgrade and
    // the nova's projectile on another, so arming the numbers without the path is
    // reachable only through the fully-upgraded preset
    for (const tweaks of [applyFullyUpgraded({}), applyFullyUpgraded(applyMasterFactor(2, {}))]) {
      for (const file of emitTweakFiles(tweaks)) {
        expect(file.content).not.toMatch(/<string name="[^"]+"><\/string>/)
      }
      expect(validateParameters(params(tweaks)).errors).toEqual([])
    }
  })

  it('blocks an armed skill with no projectile path', () => {
    // exactly the shape that crashed: combo nova numbers set, projectile still ""
    const result = validateParameters(
      params({
        'player.shared.param.combo': 1,
        'player.shared.param.combo-nova-dmg': 84,
        'player.shared.param.combo-nova-parts': 22
      })
    )
    expect(
      result.errors.some(
        (e) =>
          e.field === 'player.shared.param.combo-nova-projectile' &&
          e.message.includes('empty path and crash the game')
      )
    ).toBe(true)
  })

  it('advances a string ladder to its top when fully upgraded', () => {
    const tweaks = applyFullyUpgraded({})
    const shared = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/shared.xml')
    // combo-nova-5 is the last rung
    expect(shared?.content).toContain('projectiles/player_combo_nova_3.xml')
    const wizard = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/wizard.xml')
    expect(wizard?.content).toContain('projectiles/player_fireball_6.xml')
  })

  it('never lets a multiplier touch a string index', () => {
    const tweaks = applyMasterFactor(3, applySkillUnlocks(true, {}))
    // a scaled index would point at an unrelated projectile, or off the end
    for (const key of Object.keys(tweaks)) {
      const field = TWEAK_FIELDS.find((f) => f.key === key)
      if (field?.type !== 'string') continue
      expect(tweaks[key]).toBeLessThan(field.choices?.length ?? 0)
    }
    expect(validateParameters(params(tweaks)).errors).toEqual([])
  })

  it('reverses cleanly', () => {
    expect(pruneTweaks(applySkillUnlocks(false, applySkillUnlocks(true, {})))).toEqual({})
    expect(deriveSkillUnlocks({})).toBe(false)
  })

  it('validates clean', () => {
    expect(validateParameters(params(applySkillUnlocks(true, {}))).errors).toEqual([])
  })
})

describe('fully upgraded roster', () => {
  it('bakes every upgrade into the starting stats', () => {
    const tweaks = applyFullyUpgraded({})
    // the health-5 tier
    expect(tweaks['player.knight.param.max-health']).toBe(300)
    expect(tweaks['player.knight.param.whirl']).toBe(1)
  })

  it('leaves nothing left to buy', () => {
    const loadouts = buildLoadouts(applyFullyUpgraded({}))
    const headroom = loadouts.flatMap((loadout) =>
      loadout.stats
        .filter((stat) => stat.start !== stat.maxed)
        .map((stat) => `${loadout.id}.${stat.name}`)
    )

    // The Priest's cripple aura is the one thing a maxed character can still buy,
    // and correctly so: the chain's payload is `slow` (30 → 50 → 70), for which
    // the Priest has no starting param, so it cannot be baked in and the upgrade
    // really does still grant something. Buying it also re-applies
    // `aura-mana-drain` 1 — a trade-off, not a pure downgrade.
    expect(headroom).toEqual(['priest.aura-mana-drain'])
  })

  it('composes with the factors rather than fighting them', () => {
    const tweaks = applyFullyUpgraded(applyStatFactor('health', 2, {}))
    // 300 maxed, doubled
    expect(tweaks['player.knight.param.max-health']).toBe(600)
  })

  it('validates clean', () => {
    expect(validateParameters(params(applyFullyUpgraded({}))).errors).toEqual([])
  })

  it('does not bury the user in downgrade warnings', () => {
    // every upgrade IS a downgrade once the roster starts maxed, but that is the
    // whole point of the preset, so it must not read as hundreds of mistakes
    for (const tweaks of [applyFullyUpgraded({}), applyFullyUpgraded(applyMasterFactor(2, {}))]) {
      const result = validateParameters(params(tweaks))
      expect(result.warnings.filter((w) => w.message.includes('would downgrade'))).toEqual([])
    }
  })

  it('still warns when a starting stat merely overshoots its ladder', () => {
    // the typed-a-big-number case the warning exists for
    const result = validateParameters(params({ 'player.knight.param.max-health': 400 }))
    expect(result.warnings.some((w) => w.message.includes('would downgrade'))).toBe(true)
  })
})

describe('dead upgrades', () => {
  const ids = (tweaks: PlayerTweaks, file: string): string[] => {
    const content = emitTweakFiles(tweaks).find((f) => f.path === `tweak/${file}`)?.content ?? ''
    return [...content.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  }

  it('clears a shop that has nothing left to sell', () => {
    // the reported bug: a maxed Thief was still offered "Knives Damage 1" for 800
    // gold, which would have dropped knives-dmg from 46 to 16
    for (const tweaks of [applyFullyUpgraded({}), applyFullyUpgraded(applyMasterFactor(2, {}))]) {
      for (const file of ['knight', 'ranger', 'sorcerer', 'thief', 'warlock', 'wizard']) {
        expect(ids(tweaks, `${file}.xml`)).toEqual([])
      }
    }
  })

  it('keeps an upgrade whose payload cannot be baked into a starting stat', () => {
    // the Priest's cripple aura writes `slow`, and the Priest has no `slow`
    // starting param — so there is nothing to compare it against and it really
    // does still grant something to a maxed character
    expect(ids(applyFullyUpgraded({}), 'priest.xml')).toEqual([
      'aura',
      'auraslow-1',
      'auraslow-2'
    ])
  })

  it('keeps the purchases that are not stat upgrades', () => {
    // life, rejuv and the potions carry no stats, so "already better" cannot be
    // computed for them — and a maxed character can still use an extra life
    expect(ids(applyFullyUpgraded({}), 'shared.xml')).toEqual([
      'life',
      'rejuv',
      'pot-dmg',
      'pot-rejuv',
      'pot-invul'
    ])
  })

  it('leaves an upgrade that still improves something', () => {
    // scaling moves the ladder too, so every tier still beats the starting stat
    const scaled = applyStatFactor('health', 2, {})
    expect(ids(scaled, 'knight.xml').filter((id) => id.startsWith('health'))).toEqual([
      'health-1',
      'health-2',
      'health-3',
      'health-4',
      'health-5'
    ])
    expect(isDeadUpgrade(knightFile(scaled), knightUpgrade('health-1', scaled), scaled)).toBe(false)
  })

  it('counts a skill unlock you already have as spent', () => {
    // its only effect is a bool that is already true
    const unlocked = applySkillUnlocks(true, {})
    expect(isDeadUpgrade(knightFile(unlocked), knightUpgrade('whirl', unlocked), unlocked)).toBe(true)
    expect(isDeadUpgrade(knightFile(), knightUpgrade('whirl'), {})).toBe(false)
  })

  it('validates clean and emits well-formed files', () => {
    const tweaks = applyFullyUpgraded({})
    expect(validateParameters(params(tweaks)).errors).toEqual([])
    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')?.content ?? ''
    // an empty <upgrades> is the shape this produces — see the DISCOVERY-LOG note
    expect(knight).toContain('<upgrades>')
    expect(knight).toContain('</upgrades>')
    expect(knight).not.toContain('<dictionary id=')
  })
})

describe('tiers sold', () => {
  const healthChain = () =>
    buildChains(knightFile()).find((chain) => chain.key === 'health') as TweakChain

  it('limits a ladder with one flag and lets the req cascade do the rest', () => {
    const chain = healthChain()
    const tweaks = applyTiersSold(chain, 2, {})
    // tier 3 alone is flagged; 4 and 5 require it, so they go too
    expect(Object.keys(tweaks)).toEqual(['player.knight.remove.health-3'])

    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')?.content ?? ''
    const ids = [...knight.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(ids.filter((id) => id.startsWith('health'))).toEqual(['health-1', 'health-2'])

    const have = new Set(ids)
    const reqs = [...knight.matchAll(/req="([^"]+)"/g)].map((m) => m[1])
    expect(reqs.filter((req) => !have.has(req))).toEqual([])
  })

  it('round-trips', () => {
    const chain = healthChain()
    for (const count of [0, 2, chain.tiers.length]) {
      expect(deriveTiersSold(chain, applyTiersSold(chain, count, {}))).toEqual({
        count,
        uniform: true
      })
    }
    // the full ladder is the default, so it stores nothing
    expect(pruneTweaks(applyTiersSold(chain, chain.tiers.length, {}))).toEqual({})
  })

  it('reports a cut the cascade cannot express as custom', () => {
    const chain = healthChain()
    const handmade = { 'player.knight.remove.health-3': 1, 'player.knight.remove.health-5': 1 }
    // health-4 requires health-3, so the emitted file drops it either way
    expect(deriveTiersSold(chain, handmade)).toEqual({ count: 2, uniform: false })
  })

  it('reports the req cascade once, not once per ladder', () => {
    const chain = healthChain()
    const one = validateParameters(params(applyTiersSold(chain, 2, {})))
    expect(one.warnings.filter((w) => w.message.includes('Removing health-3'))).toHaveLength(1)

    // the preset shortens every ladder in the game; that is one note, not 104
    const all = validateParameters(params(applyFullyUpgraded({})))
    const cascade = all.warnings.filter((w) => w.message.includes('missing entry'))
    expect(cascade).toHaveLength(1)
    expect(cascade[0].message).toMatch(/^\d+ removed upgrades take \d+ dependent upgrades/)
    expect(all.errors).toEqual([])
  })

  it('does not count a dependent that is removed explicitly too', () => {
    // health-4 and -5 require health-3; removing all three by hand takes
    // nothing extra, so there is nothing to warn about
    const all = validateParameters(
      params({
        'player.knight.remove.health-3': 1,
        'player.knight.remove.health-4': 1,
        'player.knight.remove.health-5': 1
      })
    )
    expect(all.warnings.filter((w) => w.message.includes('missing entry'))).toEqual([])
    // with health-5 left in, the cascade takes it, and that still warns
    const some = validateParameters(
      params({ 'player.knight.remove.health-3': 1, 'player.knight.remove.health-4': 1 })
    )
    expect(some.warnings.filter((w) => w.message.includes('missing entry'))).toHaveLength(1)
  })

  it('clamps out-of-range counts', () => {
    const chain = healthChain()
    expect(pruneTweaks(applyTiersSold(chain, 99, {}))).toEqual({})
    expect(deriveTiersSold(chain, applyTiersSold(chain, -3, {}))).toEqual({
      count: 0,
      uniform: true
    })
  })
})

describe('shop removals', () => {
  it('drops the extra-life purchases from the emitted file', () => {
    const tweaks = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
    expect(deriveShopRemovals(EXTRA_LIFE_UPGRADES, tweaks)).toBe(true)

    const shared = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/shared.xml')
    expect(shared).toBeDefined()
    expect(shared?.content).not.toContain('id="life"')
    // rejuv is a one-off full heal, not a life — it stays in the shop
    expect(shared?.content).toContain('id="rejuv"')
    // the rest of the shop survives
    expect(shared?.content).toContain('id="pot-dmg"')
  })

  it('reproduces a hand-made removal that is confirmed working in game', () => {
    // A play-tester hand-edited knight.xml to drop the health and mana ladders,
    // packed it, and confirmed neither is purchasable. These are the 36 upgrades
    // that file kept, in order — typed out rather than derived, so a baseline
    // change that altered the shop would fail here.
    const tweaks: PlayerTweaks = {}
    for (const id of ['health', 'mana']) {
      for (let tier = 1; tier <= 5; tier++) tweaks[`player.knight.remove.${id}-${tier}`] = 1
    }

    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')
    const ids = [...(knight?.content ?? '').matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual([
      'dmg1', 'dmg2', 'dmg3', 'dmg4', 'dmg5',
      'arc1', 'arc2', 'arc3', 'arc4', 'arc5',
      'chrgdmg1', 'chrgdmg2', 'chrgdmg3',
      'chrgrng1', 'chrgrng2', 'chrgrng3',
      'whirl', 'whirldmg1', 'whirldmg2', 'whirldur1', 'whirldur',
      'bash1', 'bash2', 'bash3',
      'armor-1', 'armor-2', 'armor-3', 'armor-4', 'armor-5',
      'heal', 'healeff1', 'healeff2', 'healeff3',
      'shield1', 'shield2', 'shield3'
    ])
  })

  it('never leaves a req pointing at a missing upgrade', () => {
    const shared = emitTweakFiles(applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})).find(
      (f) => f.path === 'tweak/shared.xml'
    )
    const content = shared?.content ?? ''
    const ids = new Set([...content.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
    const reqs = [...content.matchAll(/req="([^"]+)"/g)].map((m) => m[1])
    expect(reqs.filter((req) => !ids.has(req))).toEqual([])
  })

  it('puts them back', () => {
    const removed = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
    expect(pruneTweaks(applyShopRemovals(EXTRA_LIFE_UPGRADES, false, removed))).toEqual({})
    expect(emitTweakFiles(applyShopRemovals(EXTRA_LIFE_UPGRADES, false, removed))).toEqual([])
  })
})

describe('reset', () => {
  it('undoes everything the quick setup can reach', () => {
    let tweaks = applyMasterFactor(2.5, {})
    tweaks = applyCostPolicy('free', SHOP_PRICE_MAX, tweaks)
    tweaks = applySkillUnlocks(true, tweaks)
    tweaks = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, tweaks)
    tweaks = applyFullyUpgraded(tweaks)
    expect(Object.keys(pruneTweaks(tweaks)).length).toBeGreaterThan(100)

    // everything but the extra-life removal, which outlives a reset on purpose
    expect(pruneTweaks(resetQuickSetup(tweaks))).toEqual({ 'player.shared.remove.life': 1 })
  })

  it('never puts extra lives back in the shop', () => {
    expect(resetQuickSetup(defaultParameters().playerTweaks)['player.shared.remove.life']).toBe(1)
  })

  it('leaves enemy difficulty alone', () => {
    const tweaks = resetQuickSetup({ 'player.general.hard.enemydamagebase': 3 })
    expect(tweaks['player.general.hard.enemydamagebase']).toBe(3)
  })
})

describe('the extra-life removal survives the cost policy', () => {
  // defaultParameters() ships player.shared.remove.life, and the coarse cost
  // policy used to clear every remove.* flag — so picking any shop-price
  // preset silently put buyable extra lives back on, undoing a default the
  // user never touched. The targeted Quick Setup checkbox owns this flag now.
  const LIFE = 'player.shared.remove.life'

  it('is left alone by every cost policy', () => {
    for (const policy of ['stock', 'free', 'custom', 'removed'] as const) {
      const before = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
      expect(before[LIFE], `${policy} setup`).toBe(1)

      const after = applyCostPolicy(policy, SHOP_PRICE_MAX, before)
      expect(after[LIFE], `after ${policy}`).toBe(1)
    }
  })

  it('stays off when it was off, whatever the policy', () => {
    for (const policy of ['stock', 'free', 'custom'] as const) {
      const after = applyCostPolicy(policy, SHOP_PRICE_MAX, {})
      expect(after[LIFE], `after ${policy}`).toBeUndefined()
    }
  })

  it('does not by itself make the policy read as "removed"', () => {
    // it is orthogonal to prices now, so a lone life removal must not be
    // mistaken for "every upgrade removed"
    const tweaks = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
    expect(deriveCostPolicy(tweaks, SHOP_PRICE_MAX)).toBe('stock')
  })
})
