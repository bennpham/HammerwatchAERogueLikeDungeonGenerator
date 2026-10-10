import { describe, expect, it } from 'vitest'
import {
  parseParametersTxt,
  parsePlayerSettingsTxt,
  serializeParametersTxt,
  serializePlayerSettingsTxt,
  validateParameters
} from '../src/generator'
import { PLAYER_PRESETS, PLAYER_PRESET_GROUPS, TWEAK_FIELD_MAP, playerPresetById, pruneTweaks } from '../src/generator/tweak'
import { HW2_CLASSES, hw2AttributePoints, hw2Body } from '../src/generator/tweak/hw2Presets'
import { defaultParameters } from '../src/generator/config/parameters'
import type { PlayerTweaks } from '../src/generator/tweak/types'

const FLOAT_KEY = 'player.general.easy.enemyhealthall'
const INT_KEY = 'player.knight.param.max-health'
const REMOVE_KEY = 'player.shared.remove.life'

/** the lines that are not the `#` header */
function bodyLines(text: string): string[] {
  return text.split('\r\n').filter((line) => line !== '' && !line.startsWith('#'))
}

describe('playersettings.txt', () => {
  it('names real tweak fields of the expected types', () => {
    expect(TWEAK_FIELD_MAP.get(FLOAT_KEY)?.type).toBe('float')
    expect(TWEAK_FIELD_MAP.get(INT_KEY)?.type).toBe('int')
    expect(TWEAK_FIELD_MAP.has(REMOVE_KEY)).toBe(true)
  })

  it.each<[string, PlayerTweaks]>([
    ['empty', {}],
    ['the default', defaultParameters().playerTweaks],
    ['a float field', { [FLOAT_KEY]: 1.25 }],
    ['an int field', { [INT_KEY]: 300 }],
    ['a remove flag plus mixed fields', { [REMOVE_KEY]: 1, [FLOAT_KEY]: 0.5, [INT_KEY]: 1 }]
  ])('round-trips %s exactly', (_label, tweaks) => {
    const parsed = parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks))
    expect(parsed.tweaks).toEqual(pruneTweaks(tweaks))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys).toEqual([])
  })

  it('writes only the header for a stock Player tab', () => {
    const text = serializePlayerSettingsTxt({})
    expect(bodyLines(text)).toEqual([])
    expect(text.startsWith('#')).toBe(true)
  })

  it('writes stock-valued entries as nothing, and sorts the rest', () => {
    const stock = TWEAK_FIELD_MAP.get(INT_KEY)!.stock
    const text = serializePlayerSettingsTxt({ [REMOVE_KEY]: 1, [INT_KEY]: stock, [FLOAT_KEY]: 2 })
    expect(bodyLines(text)).toEqual([`${FLOAT_KEY}=2.000000`, `${REMOVE_KEY}=1`])
  })

  it('formats every line exactly as parameters.txt does', () => {
    const tweaks = { [REMOVE_KEY]: 1, [FLOAT_KEY]: 0.5, [INT_KEY]: 200 }
    const full = serializeParametersTxt({ ...defaultParameters(), playerTweaks: tweaks }).split('\r\n')
    for (const line of bodyLines(serializePlayerSettingsTxt(tweaks))) {
      expect(full).toContain(line)
    }
  })

  it('replaces the Player tab: a key the file leaves out is stock', () => {
    // the default carries `remove.life`; a file without it means "buyable again"
    expect(parsePlayerSettingsTxt(`${INT_KEY}=200\n`).tweaks).toEqual({ [INT_KEY]: 200 })
  })

  it('drops a stock value, truncates an int, and lowercases keys', () => {
    const stock = TWEAK_FIELD_MAP.get(FLOAT_KEY)!.stock
    const parsed = parsePlayerSettingsTxt(`${FLOAT_KEY}=${stock}\nPLAYER.Knight.Param.Max-Health=250.9\n`)
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 250 })
  })

  it('reports an unknown player key and a non-number, and keeps the rest', () => {
    const parsed = parsePlayerSettingsTxt(
      ['player.knight.param.no-such-stat=5', `${FLOAT_KEY}=lots`, `${INT_KEY}=120`].join('\n')
    )
    expect(parsed.unknownKeys).toEqual(['player.knight.param.no-such-stat', FLOAT_KEY])
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 120 })
  })

  it('skips comments, blank lines, CRLF endings and malformed lines', () => {
    const parsed = parsePlayerSettingsTxt(`# a comment\r\n\r\n${INT_KEY}=90\r\nnot a key value line\r\n`)
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 90 })
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys).toEqual([])
  })

  it('takes only the player half of a whole parameters.txt', () => {
    const params = { ...defaultParameters(), playerTweaks: { [REMOVE_KEY]: 1, [INT_KEY]: 400 } }
    const text = serializeParametersTxt(params)
    const parsed = parsePlayerSettingsTxt(text)
    expect(parsed.tweaks).toEqual(pruneTweaks(params.playerTweaks))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys.length).toBeGreaterThan(0)
    expect(parsed.ignoredKeys.some((key) => key.toLowerCase().startsWith('player.'))).toBe(false)
  })

  it('still applies its player keys when imported as a parameters.txt', () => {
    const tweaks = { [INT_KEY]: 222 }
    const parsed = parseParametersTxt(serializePlayerSettingsTxt(tweaks))
    expect(parsed.params.playerTweaks[INT_KEY]).toBe(222)
    expect(parsed.unknownKeys).toEqual([])
  })
})

describe('player presets', () => {
  // Every build, present and future, is held to the same rules the campaign
  // presets follow.
  it('each sit in a known Player-tab group', () => {
    const groups = new Set(PLAYER_PRESET_GROUPS.map((group) => group.id))
    for (const preset of PLAYER_PRESETS) expect(groups.has(preset.group), preset.id).toBe(true)
  })

  it('have unique ids, and playerPresetById finds each one', () => {
    const ids = PLAYER_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PLAYER_PRESETS) expect(playerPresetById(preset.id)).toBe(preset)
    expect(playerPresetById('no-such-preset')).toBeUndefined()
  })

  it('build a fresh, pruned record of real tweak keys that validates', () => {
    for (const preset of PLAYER_PRESETS) {
      const first = preset.build()
      const second = preset.build()
      expect(first).not.toBe(second)
      expect(first).toEqual(second)
      expect(first).toEqual(pruneTweaks(first))
      for (const key of Object.keys(first)) expect(TWEAK_FIELD_MAP.has(key)).toBe(true)
      const result = validateParameters({ ...defaultParameters(), playerTweaks: first })
      expect(result.errors, preset.id).toEqual([])
    }
  })

  // This generator's campaigns never sell extra lives. Loading a preset
  // replaces the whole Player tab, so each one has to carry the removal itself.
  it('never put extra lives back in the shop', () => {
    for (const preset of PLAYER_PRESETS) {
      expect(preset.build()['player.shared.remove.life'], preset.id).toBe(1)
    }
  })

  it('survive a playersettings.txt round trip', () => {
    for (const preset of PLAYER_PRESETS) {
      const tweaks = preset.build()
      expect(parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks)).tweaks).toEqual(tweaks)
    }
  })
})

describe('Anniversary Edition player preset', () => {
  const ae = () => {
    const preset = playerPresetById('anniversary')
    if (preset === undefined) throw new Error('anniversary preset missing')
    return preset.build()
  }

  it('moves everyone at 1.1 with a shop ladder that stays above it', () => {
    const tweaks = ae()
    expect(tweaks['player.shared.param.move-speed']).toBe(1.1)
    const ladder = ['speed-1', 'speed-2', 'speed-3'].map((id) => tweaks[`player.shared.effect.${id}.move-speed`])
    expect(ladder).toEqual([1.2, 1.3, 1.4])
  })
})

describe('every player preset', () => {
  // A preset that leaves a downgrade tier (an upgrade below its own new start)
  // or a misleading note in the panel is a bug; it should add no warnings at
  // all over the stock Player tab.
  it('adds no validation warnings over the stock Player tab', () => {
    const messages = (playerTweaks: PlayerTweaks) =>
      new Set(validateParameters({ ...defaultParameters(), playerTweaks }).warnings.map((w) => w.message))
    const stock = messages({})
    for (const preset of PLAYER_PRESETS) {
      const added = [...messages(preset.build())].filter((message) => !stock.has(message))
      expect(added, preset.id).toEqual([])
    }
  })
})

describe('Hammerwatch 2 player presets', () => {
  const byUnit = (unit: string) => {
    const cls = HW2_CLASSES.find((candidate) => candidate.unit === unit)
    if (cls === undefined) throw new Error(`no HW2 class for ${unit}`)
    return cls
  }

  it('derive level-1 bodies from HW2 classes.inc', () => {
    expect(hw2Body(byUnit('knight'), 1)).toEqual({ maxHealth: 91, maxMana: 60, manaRegenMs: 1250 })
    expect(hw2Body(byUnit('ranger'), 1)).toEqual({ maxHealth: 69, maxMana: 64, manaRegenMs: 1163 })
    expect(hw2Body(byUnit('thief'), 1)).toEqual({ maxHealth: 69, maxMana: 60, manaRegenMs: 1250 })
    expect(hw2Body(byUnit('wizard'), 1)).toEqual({ maxHealth: 60, maxMana: 100, manaRegenMs: 625 })
    expect(hw2Body(byUnit('warlock'), 1)).toEqual({ maxHealth: 74, maxMana: 86, manaRegenMs: 649 })
  })

  it('reach the endgame table at level 50', () => {
    expect(hw2Body(byUnit('knight'), 50)).toEqual({ maxHealth: 507, maxMana: 280, manaRegenMs: 133 })
    expect(hw2Body(byUnit('wizard'), 50)).toEqual({ maxHealth: 280, maxMana: 591, manaRegenMs: 98 })
  })

  it('spend exactly 5 attribute points per level gained', () => {
    for (const cls of HW2_CLASSES) {
      for (const level of [1, 2, 10, 25, 50]) {
        const placed = hw2AttributePoints(cls.attributes, level)
        expect(placed.reduce((sum, value) => sum + value, 0)).toBe(5 * (level - 1))
      }
    }
  })

  it('get tougher with every level', () => {
    const hw2 = PLAYER_PRESETS.filter((preset) => preset.group === 'hw2')
    expect(hw2.map((preset) => preset.id)).toEqual(['hw2-level-1', 'hw2-level-10', 'hw2-level-25', 'hw2-level-50'])
    const health = hw2.map((preset) => preset.build()['player.knight.param.max-health'])
    for (let i = 1; i < health.length; i++) expect(health[i]).toBeGreaterThan(health[i - 1])
  })

  it('shift a health ladder the new start overtook', () => {
    // stock wizard: 35 HP, health tiers 45/60/70/85/100; HW2 level 1 starts at 60
    const tweaks = playerPresetById('hw2-level-1')!.build()
    const ladder = [1, 2, 3, 4, 5].map((n) => tweaks[`player.wizard.effect.health-${n}.max-health`])
    expect(ladder).toEqual([70, 85, 95, 110, 125])
  })

  describe('priest and sorcerer (not in HW2, anchored on the wizard)', () => {
    const hw2 = () => PLAYER_PRESETS.filter((p) => p.group === 'hw2')
    const body = (tweaks: PlayerTweaks, unit: string) => ({
      maxHealth: tweaks[`player.${unit}.param.max-health`],
      maxMana: tweaks[`player.${unit}.param.max-mana`],
      manaRegenMs: tweaks[`player.${unit}.param.mana-regen`]
    })
    const regenLadder = (tweaks: PlayerTweaks, unit: string) =>
      [1, 2, 3, 4, 5].map((n) => tweaks[`player.${unit}.effect.mana-${n}.mana-regen`])

    it('give the sorcerer the wizard’s body at every level', () => {
      for (const preset of hw2()) {
        const tweaks = preset.build()
        expect(body(tweaks, 'sorcerer'), preset.id).toEqual(body(tweaks, 'wizard'))
      }
    })

    it('scale the priest off the wizard by their stock ratios', () => {
      for (const preset of hw2()) {
        const tweaks = preset.build()
        const wizard = body(tweaks, 'wizard')
        expect(body(tweaks, 'priest'), preset.id).toEqual({
          maxHealth: Math.round((wizard.maxHealth * 30) / 35),
          maxMana: Math.round((wizard.maxMana * 70) / 75),
          manaRegenMs: Math.round((wizard.manaRegenMs * 570) / 600)
        })
      }
    })

    it('keep the priest the frailest class', () => {
      const units = ['knight', 'ranger', 'thief', 'wizard', 'warlock', 'sorcerer']
      for (const preset of hw2()) {
        const tweaks = preset.build()
        for (const unit of units) {
          expect(tweaks['player.priest.param.max-health'], `${preset.id} vs ${unit}`).toBeLessThan(
            tweaks[`player.${unit}.param.max-health`]
          )
        }
      }
    })

    it('keep the priest’s mana regen fastest, start and every tier', () => {
      for (const preset of hw2()) {
        const tweaks = preset.build()
        expect(body(tweaks, 'priest').manaRegenMs).toBeLessThan(body(tweaks, 'wizard').manaRegenMs)
        const priest = regenLadder(tweaks, 'priest')
        const wizard = regenLadder(tweaks, 'wizard')
        priest.forEach((tier, i) => expect(tier, `${preset.id} tier ${i + 1}`).toBeLessThan(wizard[i]))
      }
    })

    it('give the sorcerer HW2’s 12-shard frost nova', () => {
      const tweaks = playerPresetById('hw2-level-1')!.build()
      expect(tweaks['player.sorcerer.effect.nova.nova-shards']).toBe(12)
    })
  })
})

describe('Dungeon Rebalanced player preset', () => {
  const build = () => playerPresetById('dungeon-rebalanced')!.build()

  it('sits first, in the Generic section', () => {
    expect(PLAYER_PRESET_GROUPS[0].id).toBe('generic')
    expect(playerPresetById('dungeon-rebalanced')?.group).toBe('generic')
  })

  it('shares the AE preset’s movement and combo window exactly', () => {
    const ae = playerPresetById('anniversary')!.build()
    const tweaks = build()
    const shared = Object.keys(ae).filter((key) => /^player\.shared\.(param|effect\.(speed|combo-time)-\d)\.?(move-speed|combo-timer)/.test(key))
    expect(shared.length).toBe(10)
    for (const key of shared) expect(tweaks[key], key).toBe(ae[key])
  })

  it('buffs the priest’s start', () => {
    const tweaks = build()
    expect(tweaks['player.priest.param.max-health']).toBe(40)
    expect(tweaks['player.priest.param.smite-dmg']).toBe(9)
  })

  it('leaves the strong classes alone', () => {
    const keys = Object.keys(build())
    for (const unit of ['knight', 'ranger', 'wizard']) {
      expect(keys.some((key) => key.startsWith(`player.${unit}.`)), unit).toBe(false)
    }
  })

  it('does not raise the warlock’s storm ceiling', () => {
    expect(Object.keys(build()).some((key) => key.includes('storm'))).toBe(false)
  })

  it('leaves the AE preset as it was after sharing its movement block', () => {
    expect(Object.keys(playerPresetById('anniversary')!.build())).toHaveLength(62)
  })
})
