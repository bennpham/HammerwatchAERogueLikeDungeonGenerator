import { describe, expect, it } from 'vitest'
import {
  parseParametersTxt,
  parsePlayerSettingsTxt,
  serializeParametersTxt,
  serializePlayerSettingsTxt,
  validateParameters
} from '../src/generator'
import {
  HW2_CLASSES,
  PLAYER_FIELD_MAP,
  PLAYER_PRESETS,
  PLAYER_PRESET_GROUPS,
  applyEverythingFree,
  applyFullyUpgraded,
  applyGroupFactor,
  applySpeedMode,
  buildLoadouts,
  classesIn,
  deriveGroupFactor,
  deriveSpeedMode,
  fieldsOfGroup,
  hw2AttributePoints,
  hw2Body,
  playerOverrides,
  playerPresetById,
  prunePlayerTweaks,
  setClassSpeed,
  setEveryoneSpeed,
  setGroupSpeed,
  skillKey,
  speedOf,
  statKey,
  totalShopCost,
  validatePlayerTweaks
} from '../src/generator/players'
import type { PlayerTweaks } from '../src/generator/players'
import { defaultParameters } from '../src/generator/config/parameters'

const INT_KEY = statKey('warlock', 'base-health')
const FLOAT_KEY = statKey('wizard', 'base-mana-regen')
const COST_KEY = skillKey('warlock_gargoyle', 1, 'cost')

/** the lines that are not the `#` header */
function bodyLines(text: string): string[] {
  return text.split('\r\n').filter((line) => line !== '' && !line.startsWith('#'))
}

describe('playersettings.txt', () => {
  it('names real fields of the expected types', () => {
    expect(PLAYER_FIELD_MAP.get(FLOAT_KEY)?.type).toBe('float')
    expect(PLAYER_FIELD_MAP.get(INT_KEY)?.type).toBe('int')
    expect(PLAYER_FIELD_MAP.get(COST_KEY)?.kind).toBe('cost')
  })

  it.each<[string, PlayerTweaks]>([
    ['empty', {}],
    ['a float field', { [FLOAT_KEY]: 2.25 }],
    ['an int field', { [INT_KEY]: 300 }],
    ['mixed fields', { [COST_KEY]: 0, [FLOAT_KEY]: 0.5, [INT_KEY]: 1 }]
  ])('round-trips %s exactly', (_label, tweaks) => {
    const parsed = parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks))
    expect(parsed.tweaks).toEqual(prunePlayerTweaks(tweaks))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys).toEqual([])
  })

  it('writes only the header for a stock Player tab', () => {
    const text = serializePlayerSettingsTxt({})
    expect(bodyLines(text)).toEqual([])
    expect(text.startsWith('#')).toBe(true)
  })

  it('writes stock-valued entries as nothing, and sorts the rest', () => {
    const text = serializePlayerSettingsTxt({ [INT_KEY]: 75, [FLOAT_KEY]: 2, [COST_KEY]: 10 })
    expect(bodyLines(text)).toEqual([`${FLOAT_KEY}=2`, `${COST_KEY}=10`].sort())
  })

  it('formats every line exactly as parameters.txt does', () => {
    const tweaks = { [COST_KEY]: 5, [FLOAT_KEY]: 0.5, [INT_KEY]: 200 }
    const full = serializeParametersTxt({ ...defaultParameters(), playerTweaks: tweaks }).split('\r\n')
    for (const line of bodyLines(serializePlayerSettingsTxt(tweaks))) expect(full).toContain(line)
  })

  it('drops a stock value, truncates an int, and lowercases keys', () => {
    const parsed = parsePlayerSettingsTxt(`${FLOAT_KEY}=1.6\n${INT_KEY.toUpperCase()}=250.9\n`)
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 250 })
  })

  it('reports an original-Hammerwatch key and a non-number, and keeps the rest', () => {
    const parsed = parsePlayerSettingsTxt(['player.knight.param.max-health=5', `${FLOAT_KEY}=lots`, `${INT_KEY}=120`].join('\n'))
    expect(parsed.unknownKeys).toEqual(['player.knight.param.max-health', FLOAT_KEY])
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 120 })
  })

  it('takes only the player half of a whole parameters.txt', () => {
    const params = { ...defaultParameters(), playerTweaks: { [COST_KEY]: 1, [INT_KEY]: 400 } }
    const parsed = parsePlayerSettingsTxt(serializeParametersTxt(params))
    expect(parsed.tweaks).toEqual(params.playerTweaks)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys.length).toBeGreaterThan(0)
  })

  it('still applies its player keys when imported as a parameters.txt', () => {
    const parsed = parseParametersTxt(serializePlayerSettingsTxt({ [INT_KEY]: 222 }))
    expect(parsed.params.playerTweaks[INT_KEY]).toBe(222)
    expect(parsed.unknownKeys).toEqual([])
  })
})

describe('player validation', () => {
  it('a stock Player tab is clean', () => {
    expect(validatePlayerTweaks({})).toEqual({ errors: [], warnings: [] })
  })

  it('rejects a fractional int, a negative price and a zero health', () => {
    const { errors } = validatePlayerTweaks({ [INT_KEY]: 0, [COST_KEY]: -5, [statKey('wizard', 'base-mana')]: 10.5 })
    expect(errors.map((e) => e.field).sort()).toEqual([COST_KEY, INT_KEY, statKey('wizard', 'base-mana')].sort())
  })

  it('warns once about keys from the original game', () => {
    const { warnings } = validatePlayerTweaks({ 'player.knight.param.max-health': 120, 'player.shared.remove.life': 1 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toMatch(/2 player settings/)
  })

  it('warns when a tier would make the character weaker', () => {
    const key = skillKey('warlock_dagger:warlock_dagger_dmg', 3, 'dagger-dmg')
    const { warnings } = validatePlayerTweaks({ [key]: 1 })
    expect(warnings.map((w) => w.field)).toEqual([key])
  })

  it('is part of validateParameters', () => {
    const result = validateParameters({ ...defaultParameters(), playerTweaks: { [COST_KEY]: -1 } })
    expect(result.errors.some((e) => e.field === COST_KEY)).toBe(true)
  })
})

describe('quick setup', () => {
  it('scales a group from stock and reads the factor back', () => {
    const t = applyGroupFactor('damage', 2, {})
    expect(t[skillKey('warlock_dagger', 1, 'dagger-dmg')]).toBe(18)
    expect(deriveGroupFactor('damage', t)).toBe(2)
    // measured from stock: ×2 twice is still ×2
    expect(applyGroupFactor('damage', 2, t)).toEqual(t)
    expect(deriveGroupFactor('damage', {})).toBe(1)
    expect(deriveGroupFactor('damage', { [skillKey('warlock_dagger', 1, 'dagger-dmg')]: 50 })).toBeNull()
  })

  it('groups only their own stats', () => {
    expect(fieldsOfGroup('damage').some((f) => f.name === 'proj-speed')).toBe(false)
    expect(fieldsOfGroup('damage').some((f) => f.name === 'dmg-per-mana')).toBe(false)
    expect(fieldsOfGroup('health').some((f) => f.name === 'base-health')).toBe(true)
    expect(fieldsOfGroup('cost').every((f) => f.kind === 'cost' && f.classId === undefined)).toBe(true)
  })

  it('everything free costs nothing', () => {
    expect(totalShopCost({})).toBeGreaterThan(100_000)
    expect(totalShopCost(applyEverythingFree({}))).toBe(0)
  })

  it('fully upgraded starts at the top and validates', () => {
    const t = applyFullyUpgraded({})
    expect(t[statKey('warlock', 'base-health')]).toBe(130)
    expect(t[statKey('paladin', 'base-health')]).toBe(300)
    expect(t[skillKey('warlock_dagger', 1, 'dagger-dmg')]).toBe(38)
    expect(t[skillKey('pal_misc_armor', 1, 'player-armor-set')]).toBe(12)
    expect(totalShopCost(t)).toBe(0)
    expect(validatePlayerTweaks(t).errors).toEqual([])
  })
})

describe('move speed', () => {
  it('stock is melee vs ranged, as AE ships it', () => {
    expect(deriveSpeedMode({})).toBe('group')
    expect(speedOf({}, 'ranged')).toBe(1)
    expect(speedOf({}, 'melee')).toBe(1.2)
    expect(classesIn('melee')).toEqual(['paladin', 'thief', 'warlock'])
  })

  it('everyone: one speed, with the shop ladder following at +0.1', () => {
    const t = setEveryoneSpeed({}, 0.9)
    expect(deriveSpeedMode(t)).toBe('everyone')
    expect(t[skillKey('shared_speed_melee', 1, 'movespeed-mul')]).toBe(0.9)
    expect(t[skillKey('shared_speed:shared_misc_speed_modifier', 3, 'movespeed-mul')]).toBe(1.2)
  })

  it('group: each side on its own', () => {
    const t = setGroupSpeed({}, 'melee', 1.5)
    expect(speedOf(t, 'melee')).toBe(1.5)
    expect(speedOf(t, 'ranged')).toBe(1)
  })

  it('class: a class forks its file; switching back drops the forks', () => {
    const t = setClassSpeed({}, 'priest', 1.7)
    expect(deriveSpeedMode(t)).toBe('class')
    expect(speedOf(t, 'ranged', 'priest')).toBe(1.7)
    expect(speedOf(t, 'ranged', 'wizard')).toBe(1)
    expect(playerOverrides(t).map((o) => o.path)).toContain('players/shared/skills/shared_speed_priest.sval')
    const back = applySpeedMode('group', t)
    expect(deriveSpeedMode(back)).toBe('group')
    expect(playerOverrides(back)).toEqual([])
  })

  it('switching to per class keeps every class at its speed', () => {
    const t = applySpeedMode('class', setGroupSpeed({}, 'melee', 1.4))
    expect(speedOf(t, 'melee', 'thief')).toBe(1.4)
    expect(speedOf(t, 'ranged', 'wizard')).toBe(1)
  })
})

describe('loadout sheet', () => {
  it('shows each class start and maxed body', () => {
    const warlock = buildLoadouts({}).find((l) => l.id === 'warlock')!
    expect(warlock.stats.find((s) => s.name === 'Health')).toMatchObject({ start: 75, maxed: 130, changed: false })
    expect(warlock.totalCost).toBe(warlock.stockTotalCost)
    const garg = warlock.stats.find((s) => s.name.startsWith('Gargoyle'))!
    expect(garg.start).toBeUndefined()
  })

  it('flags what changed', () => {
    const warlock = buildLoadouts({ [INT_KEY]: 200 }).find((l) => l.id === 'warlock')!
    expect(warlock.stats.find((s) => s.name === 'Health')).toMatchObject({ start: 200, changed: true })
  })
})

describe('player presets', () => {
  it('each sit in a known group, Original Hammerwatch instead of an AE one', () => {
    expect(PLAYER_PRESET_GROUPS.map((g) => g.id)).toEqual(['generic', 'original', 'hw2'])
    const groups = new Set(PLAYER_PRESET_GROUPS.map((group) => group.id))
    for (const preset of PLAYER_PRESETS) expect(groups.has(preset.group), preset.id).toBe(true)
  })

  it('have unique ids, and playerPresetById finds each one', () => {
    const ids = PLAYER_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PLAYER_PRESETS) expect(playerPresetById(preset.id)).toBe(preset)
    expect(playerPresetById('no-such-preset')).toBeUndefined()
  })

  it('build a fresh, pruned record of real keys that validates without warnings', () => {
    for (const preset of PLAYER_PRESETS) {
      const first = preset.build()
      const second = preset.build()
      expect(first).not.toBe(second)
      expect(first).toEqual(second)
      expect(first).toEqual(prunePlayerTweaks(first))
      expect(Object.keys(first).length, preset.id).toBeGreaterThan(0)
      for (const key of Object.keys(first)) expect(PLAYER_FIELD_MAP.has(key), key).toBe(true)
      expect(validatePlayerTweaks(first), preset.id).toEqual({ errors: [], warnings: [] })
    }
  })

  it('survive a playersettings.txt round trip', () => {
    for (const preset of PLAYER_PRESETS) {
      const tweaks = preset.build()
      expect(parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks)).tweaks).toEqual(tweaks)
    }
  })

  it('original Hammerwatch: one slower speed for everyone, the original damage', () => {
    const t = playerPresetById('original')!.build()
    expect(deriveSpeedMode(t)).toBe('everyone')
    expect(speedOf(t, 'melee')).toBe(0.9)
    expect(t[skillKey('pal_sword', 1, 'sword-dmg')]).toBe(9)
    expect(t[skillKey('shared_combo', 1, 'combo-timer')]).toBe(750)
  })
})

describe('Hammerwatch 2 player presets', () => {
  const byClass = (cls: string) => HW2_CLASSES.find((c) => c.cls === cls)!

  it('derive level-1 bodies from HW2 classes.inc', () => {
    expect(hw2Body(byClass('paladin'), 1)).toEqual({ maxHealth: 91, maxMana: 60, manaRegen: 0.8 })
    expect(hw2Body(byClass('wizard'), 1)).toEqual({ maxHealth: 60, maxMana: 100, manaRegen: 1.6 })
  })

  it('spend exactly 5 attribute points per level gained', () => {
    for (const level of [1, 2, 10, 50]) {
      const placed = hw2AttributePoints([18, 12, 10], level)
      expect(placed.reduce((a, b) => a + b, 0)).toBe(5 * (level - 1))
    }
  })

  it('move the health ladder with the start, so no tier is a downgrade', () => {
    const t = playerPresetById('hw2-level-50')!.build()
    const start = t[statKey('paladin', 'base-health')]
    expect(start).toBe(507)
    expect(t[skillKey('pal_misc_health', 1, 'player-max-health-set')]).toBeGreaterThan(start)
  })

  it('keep the priest frailer than the wizard', () => {
    const t = playerPresetById('hw2-level-10')!.build()
    expect(t[statKey('priest', 'base-health')]).toBeLessThan(t[statKey('wizard', 'base-health')])
  })
})
