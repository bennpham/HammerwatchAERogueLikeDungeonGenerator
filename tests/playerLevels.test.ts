import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultParameters, parseParametersTxt, serializeParametersTxt, validateParameters } from '../src/generator'
import {
  CHAIN_BY_KEY,
  PLAYER_FIELDS,
  PLAYER_LEVELS_MAX,
  PLAYER_STOCK,
  SHOP_OWNED_LEVEL_FIXES,
  SKILL_SHOP_PATH,
  addedFieldSpecs,
  addedTiers,
  applyChainLevels,
  applyEverythingFree,
  applyFullyUpgraded,
  applyLineEdits,
  buildLoadouts,
  canAddTiers,
  hasUpgrades,
  levelsKey,
  parsePlayerValue,
  parseSkillFile,
  playerField,
  playerOverrides,
  prunePlayerTweaks,
  setChainLevels,
  skillKey,
  startingLevelKey,
  totalShopCost,
  validatePlayerTweaks
} from '../src/generator/players'
import type { LineEdit, PlayerTweaks } from '../src/generator/players'
import { parsePlayerSettingsTxt, serializePlayerSettingsTxt } from '../src/generator/config/playerSettingsFile'
import { aeAssetsDir } from './aeInstall'

const assets = aeAssetsDir()
const readAsset = (rel: string): string => readFileSync(join(assets!, rel), 'utf8')

const HP = 'wiz_misc_health'
const FIREBALL = 'wiz_fireball:wiz_fireball_damage'
const COMBO_HEAL = 'shared_combo:shared_combo_heal'
const DODGE = 'ran_dodge'

/** A file as the scenario ships it with these overrides. */
function patched(tweaks: PlayerTweaks, path: string): string {
  const o = playerOverrides(tweaks).find((x) => x.path === path)
  if (o === undefined) throw new Error(`no override of ${path}`)
  const { text, missed } = applyLineEdits(readAsset(o.source), o.edits)
  expect(missed, path).toEqual([])
  return text
}

describe('clone and drop line edits', () => {
  const text = ['a', 'b <int name="x">1</int>', 'c', 'd'].join('\r\n')

  it('copies stock lines after an anchor, edited, several in order', () => {
    const copy = (v: string): LineEdit => ({
      line: 3,
      kind: 'clone',
      from: 2,
      to: 3,
      edits: [{ line: 2, kind: 'value', name: 'x', value: v }]
    })
    const edits: LineEdit[] = [{ line: 2, kind: 'value', name: 'x', value: '9' }, copy('2'), copy('3')]
    const { text: out, missed } = applyLineEdits(text, edits)
    expect(missed).toEqual([])
    // the copies are of the stock lines, not of line 2 as edited
    expect(out.split('\r\n')).toEqual([
      'a',
      'b <int name="x">9</int>',
      'c',
      'b <int name="x">2</int>',
      'c',
      'b <int name="x">3</int>',
      'c',
      'd'
    ])
  })

  it('drops a range, and the other edits keep their stock line numbers', () => {
    const { text: out } = applyLineEdits(text, [
      { line: 2, kind: 'drop', to: 3 },
      { line: 4, kind: 'text', find: 'd', replace: 'D' }
    ])
    expect(out).toBe('a\r\nD')
  })

  it('reports a copy whose edit misses, or a range off the file', () => {
    const bad: LineEdit = { line: 1, kind: 'clone', from: 2, to: 2, edits: [{ line: 2, kind: 'text', find: 'zz', replace: '' }] }
    expect(applyLineEdits(text, [bad]).missed).toEqual([{ line: 2, kind: 'text', find: 'zz', replace: '' }])
    expect(applyLineEdits(text, [{ line: 3, kind: 'drop', to: 9 }]).missed.length).toBe(1)
  })
})

describe('tier counts', () => {
  it('every chain with upgrades has a count; one that can grow goes to the cap', () => {
    for (const { chain } of CHAIN_BY_KEY.values()) {
      const f = playerField(levelsKey(chain.key))
      if (!hasUpgrades(chain)) {
        expect(f).toBeUndefined()
        continue
      }
      expect(f?.stock).toBe(chain.tiers.length)
      expect(f?.maxLevel).toBe(canAddTiers(chain) ? PLAYER_LEVELS_MAX : chain.tiers.length)
    }
    // the stat chains of the level-99 experiment, and skill chains besides
    for (const key of [HP, FIREBALL, COMBO_HEAL, DODGE, 'shared_speed:shared_misc_speed_modifier', 'wiz_fireball:wiz_fireball_range']) {
      expect(canAddTiers(CHAIN_BY_KEY.get(key)!.chain), key).toBe(true)
    }
    // the meteor's count upgrade adds actions, not a number: nothing to raise
    expect(canAddTiers(CHAIN_BY_KEY.get('wiz_meteor:wiz_meteor_amount')!.chain)).toBe(false)
  })

  it('every string bind of a template is re-valued or deliberately copied', () => {
    // buffs get the next number; an effect's radius follows the chain's radius;
    // these stay as the game wrote them
    const verbatim = new Set(['combo-nova-projectile', 'charge-speed'])
    for (const { chain } of CHAIN_BY_KEY.values()) {
      if (!canAddTiers(chain)) continue
      const last = chain.tiers[chain.tiers.length - 1]
      for (const [name, s] of Object.entries(last.strings ?? {})) {
        const radius = /radius=\d+/.test(s.stock) && Object.keys(last.binds).some((b) => b.endsWith('radius'))
        expect(s.buff !== undefined || radius || verbatim.has(name), `${chain.key} ${name}`).toBe(true)
      }
    }
  })

  it('an added tier carries on the step; a chance closes in on 99%; a price follows the stock ladder', () => {
    const fire = addedTiers(FIREBALL, { [levelsKey(FIREBALL)]: 8 })
    expect(fire.map((a) => a.tier)).toEqual([6, 7, 8])
    expect(fire.map((a) => a.values['proj-damage'])).toEqual([45, 50, 55])
    expect(fire.map((a) => a.values['proj-radius'])).toEqual([35, 38, 41])
    expect(fire.map((a) => a.values.cost)).toEqual([7500, 9000, 10500])

    const dodge = addedTiers(DODGE, { [levelsKey(DODGE)]: PLAYER_LEVELS_MAX }).map((a) => a.values['dodge-chance'])
    for (let i = 1; i < dodge.length; i++) expect(dodge[i]).toBeGreaterThanOrEqual(dodge[i - 1])
    expect(dodge[0]).toBeGreaterThan(0.5)
    expect(Math.max(...dodge)).toBeLessThanOrEqual(0.99)

    // a slow that would pass zero stays at its last value
    const slow = addedTiers('wiz_fire_nova:wiz_fire_nova_slow', { [levelsKey('wiz_fire_nova:wiz_fire_nova_slow')]: 6 })
    expect(slow.map((a) => a.values['nova-buff-2'])).toEqual([0.1, 0.1, 0.1])
  })

  it('an edit to an added tier moves the ones above it by as much', () => {
    const t = { [levelsKey(FIREBALL)]: 8, [skillKey(FIREBALL, 7, 'proj-damage')]: 100 }
    const fire = addedTiers(FIREBALL, t)
    expect(fire.map((a) => a.values['proj-damage'])).toEqual([45, 100, 105])
    expect(fire[1].defaults['proj-damage']).toBe(50)
  })

  it('follows the edited stock tiers and the Prices knob', () => {
    const doubled = { [levelsKey(HP)]: 6, [skillKey(HP, 4, 'player-max-health-set')]: 170, [skillKey(HP, 5, 'player-max-health-set')]: 200 }
    expect(addedTiers(HP, doubled)[0].values['player-max-health-set']).toBe(230)
    expect(addedTiers(HP, applyEverythingFree({ [levelsKey(HP)]: 6 }))[0].values.cost).toBe(0)
  })

  it('a count past stock in a file reads back with its tiers, and the stock count clears it', () => {
    const t = prunePlayerTweaks({ [levelsKey(HP)]: 7, [skillKey(HP, 7, 'cost')]: 123 })
    expect(parsePlayerSettingsTxt(serializePlayerSettingsTxt(t)).tweaks).toEqual(t)
    expect(parseParametersTxt(serializeParametersTxt({ ...defaultParameters(), playerTweaks: t })).params.playerTweaks).toEqual(t)
    expect(parsePlayerValue(levelsKey(HP), '5')).toBe('stock')
    // an added tier has no fixed default, so its number is always kept
    expect(parsePlayerValue(skillKey(HP, 7, 'cost'), String(playerField(skillKey(HP, 7, 'cost'))!.stock))).not.toBe('stock')
  })

  it('drops the numbers of tiers a chain no longer has', () => {
    const t = { [levelsKey(HP)]: 7, [skillKey(HP, 7, 'cost')]: 123, [skillKey(HP, 5, 'cost')]: 9 }
    expect(prunePlayerTweaks({ ...t, [levelsKey(HP)]: 6 })).toEqual({ [levelsKey(HP)]: 6, [skillKey(HP, 5, 'cost')]: 9 })
    expect(setChainLevels(t, HP, 4)).toEqual({ [levelsKey(HP)]: 4 })
    expect(setChainLevels(t, HP, 5)).toEqual({ [skillKey(HP, 5, 'cost')]: 9 })
    const all = applyChainLevels({}, 20)
    expect(all[levelsKey(HP)]).toBe(20)
    expect(all[levelsKey('wiz_meteor:wiz_meteor_amount')]).toBeUndefined()
    expect(applyChainLevels(all, 'stock')).toEqual({})
  })

  it('is validated', () => {
    const errs = (t: PlayerTweaks): string[] => validatePlayerTweaks(t).errors.map((e) => e.field)
    expect(errs({ [levelsKey(HP)]: 0 })).toEqual([levelsKey(HP)])
    expect(errs({ [levelsKey(HP)]: PLAYER_LEVELS_MAX + 1 })).toEqual([levelsKey(HP)])
    expect(errs({ [levelsKey(HP)]: 6.5 })).toEqual([levelsKey(HP)])
    expect(errs({ [levelsKey('wiz_meteor:wiz_meteor_amount')]: 4 })).toEqual([levelsKey('wiz_meteor:wiz_meteor_amount')])
    expect(errs({ [levelsKey(HP)]: 99, [skillKey(HP, 99, 'cost')]: -1 })).toEqual([skillKey(HP, 99, 'cost')])
    // owned levels go up to the chain's own count
    expect(errs({ [levelsKey(HP)]: 8, [startingLevelKey(HP)]: 8 })).toEqual([])
    expect(errs({ [levelsKey(HP)]: 3, [startingLevelKey(HP)]: 4 })).toEqual([startingLevelKey(HP)])
    // a number for a tier past the count is ignored, and said so
    const past = validatePlayerTweaks({ [skillKey(HP, 7, 'cost')]: 5 })
    expect(past.errors).toEqual([])
    expect(past.warnings.map((w) => w.field)).toEqual([skillKey(HP, 7, 'cost')])
    // a lobby must sell the chain's column and its tier-5 one
    const params = { ...defaultParameters(), playerTweaks: { [levelsKey(HP)]: 8 } }
    params.lobbies = params.lobbies.map((l) => ({ ...l, shopCategories: l.shopCategories.filter((c) => c !== 'misc5') }))
    expect(validateParameters(params).warnings.some((w) => w.field === levelsKey(HP))).toBe(true)
  })

  it('Fully upgraded owns the stock tiers and leaves the added ones for sale, with the shop patched', () => {
    const t = applyFullyUpgraded({ [levelsKey(HP)]: 8, [levelsKey(FIREBALL)]: 3 })
    expect(t[startingLevelKey(HP)]).toBe(5)
    expect(t[startingLevelKey(FIREBALL)]).toBe(3)
    const shop = playerOverrides(t).find((o) => o.path === SKILL_SHOP_PATH)
    expect(shop?.edits.length).toBe(SHOP_OWNED_LEVEL_FIXES.length)
    // nothing owned with more for sale: no patch
    expect(playerOverrides(applyFullyUpgraded({})).some((o) => o.path === SKILL_SHOP_PATH)).toBe(false)
    expect(playerOverrides({ [levelsKey(HP)]: 8 }).some((o) => o.path === SKILL_SHOP_PATH)).toBe(false)
  })

  it('counts added tiers in the gold to buy everything, and not removed ones', () => {
    const stock = totalShopCost({})
    expect(totalShopCost({ [levelsKey(HP)]: 6 })).toBe(stock + 4300)
    expect(totalShopCost({ [levelsKey(HP)]: 4 })).toBe(stock - 3600)
  })

  it('the loadout reaches an added tier, and stops at a removed one', () => {
    const health = (t: PlayerTweaks) => buildLoadouts(t).find((c) => c.id === 'wizard')!.stats.find((s) => s.name === 'Health')!
    expect(health({}).maxed).toBe(100)
    expect(health({ [levelsKey(HP)]: 6 }).maxed).toBe(115)
    expect(health({ [levelsKey(HP)]: 2 }).maxed).toBe(60)
    const cost = (t: PlayerTweaks) => buildLoadouts(t).find((c) => c.id === 'wizard')!.totalCost
    expect(cost({ [levelsKey(HP)]: 6 }) - cost({})).toBe(4300)
  })

  it('is deterministic', () => {
    const t = applyChainLevels({}, 30)
    expect(JSON.stringify(playerOverrides(t))).toBe(JSON.stringify(playerOverrides({ ...t })))
  })

  it('a chain that keeps its stock count adds nothing', () => {
    expect(playerOverrides({ [levelsKey(HP)]: 5 })).toEqual([])
    for (const f of PLAYER_FIELDS) if (f.kind === 'levels') expect(addedFieldSpecs(CHAIN_BY_KEY.get(f.chainKey!)!.chain).length).toBeGreaterThan(0)
  })
})

describe.skipIf(assets === null)('tier counts against the install', () => {
  it('extends health to 99 and fireball damage to 8, by position', () => {
    const t = { [levelsKey(HP)]: 99, [levelsKey(FIREBALL)]: 8 }
    const hp = parseSkillFile('players/wizard/skills/wiz_misc_health.sval', patched(t, 'players/wizard/skills/wiz_misc_health.sval'))
    const tiers = hp.chains[0].tiers
    expect(tiers.length).toBe(99)
    tiers.forEach((tier, i) => {
      expect(tier.lvl).toBe(i + 1)
      expect(tier.category).toBe(i < 5 ? `misc${i + 1}` : 'misc5')
      if (i > 0) expect(tier.cost!.stock).toBeGreaterThan(tiers[i - 1].cost!.stock)
      if (i > 0) expect(tier.binds['player-max-health-set'].stock).toBeGreaterThan(tiers[i - 1].binds['player-max-health-set'].stock)
    })
    expect(tiers[98].description?.text).toBe('.hp-udesc?curr-max-health=1495&max-health=1510')

    const text = patched(t, 'players/wizard/skills/wiz_fireball.sval')
    const fire = parseSkillFile('players/wizard/skills/wiz_fireball.sval', text).chains.find((c) => c.key === FIREBALL)!
    expect(fire.tiers.length).toBe(8)
    expect(text).toContain('<string name="name">.wizdmg-uname?lvl=8</string>')
    expect(text).toContain('wiz_fireball_hit.effect?radius=41</string>')
    expect(fire.tiers[7].binds['proj-radius'].stock).toBe(41)
    // the other chain of the file is untouched
    const range = parseSkillFile('players/wizard/skills/wiz_fireball.sval', text).chains.find(
      (c) => c.key === 'wiz_fireball:wiz_fireball_range'
    )
    expect(range!.tiers.length).toBe(5)
  })

  it('removes tiers', () => {
    const t = { [levelsKey(HP)]: 2 }
    const hp = parseSkillFile('p', patched(t, 'players/wizard/skills/wiz_misc_health.sval'))
    expect(hp.chains[0].tiers.map((x) => x.lvl)).toEqual([1, 2])
  })

  it('gives an added combo heal tier the next buff, defined in buffs.sval', () => {
    const t = { [levelsKey(COMBO_HEAL)]: 7, [skillKey(COMBO_HEAL, 7, 'combo-heal-buff')]: 20 }
    const combo = patched(t, 'players/shared/skills/shared_combo.sval')
    expect(combo).toContain('tweak/buffs/buffs.sval:combo_health_regen_level_6<')
    expect(combo).toContain('tweak/buffs/buffs.sval:combo_health_regen_level_7<')
    expect(combo).toContain('combo-heal=20<')
    const buffs = patched(t, 'tweak/buffs/buffs.sval').split(/\r?\n/)
    const at = buffs.findIndex((l) => l.startsWith('%block Combo_health_regen combo_health_regen_level_5 '))
    expect(buffs.slice(at + 1, at + 3)).toEqual([
      '%block Combo_health_regen combo_health_regen_level_6 12',
      '%block Combo_health_regen combo_health_regen_level_7 20'
    ])
  })

  it('patches every chain to the cap and every one down to 1 cleanly', () => {
    for (const n of [PLAYER_LEVELS_MAX, 1]) {
      for (const o of playerOverrides(applyChainLevels({}, n))) {
        const { text, missed } = applyLineEdits(readAsset(o.source), o.edits)
        expect(missed, o.path).toEqual([])
        if (o.path.startsWith('players/')) {
          for (const c of parseSkillFile(o.path, text).chains) {
            const f = playerField(levelsKey(c.key))
            if (f !== undefined) expect(c.tiers.length, c.key).toBe(Math.min(n, f.maxLevel!))
          }
        }
      }
    }
  })

  it('the shop patch matches the stock skill shop script', () => {
    const lines = readAsset(SKILL_SHOP_PATH).split('\n')
    for (const fix of SHOP_OWNED_LEVEL_FIXES) expect(lines[fix.line - 1], `line ${fix.line}`).toContain(fix.find)
  })

  it('the stock never owns part of a chain with more to buy, so the shop patch changes no stock skill', () => {
    for (const file of PLAYER_STOCK.skills) {
      for (const c of file.chains) {
        const start = c.tiers[0].startingLevel?.stock ?? 0
        expect(start === 0 || start >= c.tiers.length, c.key).toBe(true)
      }
    }
  })
})
