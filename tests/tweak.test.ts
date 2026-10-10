import { describe, expect, it } from 'vitest'
import {
  TWEAK_BASELINE,
  TWEAK_FIELDS,
  TWEAK_FIELD_MAP,
  applyTweaks,
  buildLoadouts,
  countTweaksByFile,
  emitTweakFiles,
  pruneTweaks
} from '../src/generator/tweak'
import { generateDungeon } from '../src/generator'
import { defaultParameters } from '../src/generator/config/parameters'

describe('tweak baseline', () => {
  it('has all nine stock files', () => {
    expect(TWEAK_BASELINE.map((f) => f.file).sort()).toEqual([
      'general.xml',
      'knight.xml',
      'priest.xml',
      'ranger.xml',
      'shared.xml',
      'sorcerer.xml',
      'thief.xml',
      'warlock.xml',
      'wizard.xml'
    ])
  })

  it('every req points at an upgrade in the same file', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      const ids = new Set(file.upgrades.map((u) => u.id))
      for (const upgrade of file.upgrades) {
        if (upgrade.req === undefined) continue
        expect(ids.has(upgrade.req), `${file.file}: ${upgrade.id} requires missing ${upgrade.req}`).toBe(
          true
        )
      }
    }
  })

  it('upgrade ids are unique within a file', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      const ids = file.upgrades.map((u) => u.id)
      expect(new Set(ids).size, `${file.file} has duplicate upgrade ids`).toBe(ids.length)
    }
  })

  it('field keys are unique', () => {
    expect(TWEAK_FIELD_MAP.size).toBe(TWEAK_FIELDS.length)
  })

  it('matches known stock values', () => {
    expect(TWEAK_FIELD_MAP.get('player.knight.param.max-health')?.stock).toBe(75)
    expect(TWEAK_FIELD_MAP.get('player.priest.param.max-health')?.stock).toBe(30)
    expect(TWEAK_FIELD_MAP.get('player.warlock.param.max-mana')?.stock).toBe(75)
    expect(TWEAK_FIELD_MAP.get('player.shared.cost.life')?.stock).toBe(350)
    expect(TWEAK_FIELD_MAP.get('player.knight.cost.health-5')?.stock).toBe(3000)
    expect(TWEAK_FIELD_MAP.get('player.general.hard.enemydamagebase')?.stock).toBe(1.75)
  })

  it('exposes string params as an index into their stock values', () => {
    // not a free-text field: the override is an index, so only paths the game
    // actually ships can ever be emitted
    const gfx = TWEAK_FIELD_MAP.get('player.knight.param.sword-arc-gfx')
    expect(gfx?.type).toBe('string')
    expect(gfx?.stock).toBe(0)
    // one graphic per rung of the sword-arc ladder, starting value first
    expect(gfx?.choices).toEqual([
      'effects/knight_slash_90.xml',
      'effects/knight_slash_120.xml',
      'effects/knight_slash_150.xml',
      'effects/knight_slash_180.xml',
      'effects/knight_slash_210.xml',
      'effects/knight_slash_240.xml'
    ])

    // index 0 is always the stock starting value
    const projectile = TWEAK_FIELD_MAP.get('player.shared.param.combo-nova-projectile')
    expect(projectile?.choices?.[0]).toBe('')
    expect(projectile?.choices?.length).toBe(4)

    expect(TWEAK_FIELD_MAP.has('player.knight.param.sword-arc')).toBe(true)
  })

  it('exposes bool params as 0/1 so skills can be pre-unlocked', () => {
    const whirl = TWEAK_FIELD_MAP.get('player.knight.param.whirl')
    expect(whirl?.type).toBe('bool')
    expect(whirl?.stock).toBe(0)
  })

  it('offers a removal flag for every upgrade', () => {
    const life = TWEAK_FIELD_MAP.get('player.shared.remove.life')
    expect(life?.group).toBe('remove')
    expect(life?.stock).toBe(0)
  })

  it('files every upgrade field under a real shop group', () => {
    const upgrades = TWEAK_FIELDS.filter((f) => f.group === 'cost' || f.group === 'effect')
    // a new upgrade falling through the rules would land in the catch-all
    const ungrouped = upgrades.filter(
      (f) => f.shopGroup === undefined || f.shopGroup === 'Other upgrades'
    )
    expect(ungrouped.map((f) => f.key)).toEqual([])
  })

  it('groups shared upgrades by what the upgrade buys', () => {
    const groupOf = (id: string) => TWEAK_FIELD_MAP.get(`player.shared.cost.${id}`)?.shopGroup
    expect(groupOf('life')).toBe('Health upgrades')
    expect(groupOf('rejuv')).toBe('Health upgrades')
    // pot-rejuv is a potion despite the name overlapping the health upgrade
    expect(groupOf('pot-rejuv')).toBe('Potion upgrades')
    expect(groupOf('pot-invul')).toBe('Potion upgrades')
    expect(groupOf('speed-2')).toBe('Movement speed upgrades')
    expect(groupOf('combo')).toBe('Combo upgrades')
    expect(groupOf('combo-heal-1')).toBe('Combo upgrades')
  })

  it('groups class upgrades by the shop column the game uses', () => {
    const groupOf = (unit: string, id: string) =>
      TWEAK_FIELD_MAP.get(`player.${unit}.cost.${id}`)?.shopGroup
    expect(groupOf('knight', 'health-1')).toBe('Health & mana upgrades')
    expect(groupOf('knight', 'mana-5')).toBe('Health & mana upgrades')
    expect(groupOf('knight', 'dmg1')).toBe('Offense upgrades')
    expect(groupOf('knight', 'armor-3')).toBe('Defense upgrades')
    expect(groupOf('wizard', 'meteor')).toBe('Offense upgrades')
  })

  it('exposes what each upgrade grants, not just its price', () => {
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.health-1.max-health')?.stock).toBe(120)
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.health-5.max-health')?.stock).toBe(300)
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.mana-3.max-mana')?.stock).toBe(125)
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.mana-3.mana-regen')?.stock).toBe(800)
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.armor-5.dmg-reduction')?.stock).toBe(10)
    // floats keep their type so the form steps them by 0.05
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.chrgdmg2.charge-dmg-multiplier')).toMatchObject({
      stock: 2.25,
      type: 'float'
    })
  })

  it('does not expose lvl, strings or bools as upgrade effects', () => {
    // lvl is the tier index, not balance; the gfx path and unlock flag are structure
    expect(TWEAK_FIELD_MAP.has('player.knight.effect.health-1.lvl')).toBe(false)
    expect(TWEAK_FIELD_MAP.has('player.knight.effect.arc1.sword-arc-gfx')).toBe(false)
    expect(TWEAK_FIELD_MAP.has('player.knight.effect.whirl.whirl')).toBe(false)
    expect(TWEAK_FIELD_MAP.has('player.knight.effect.arc1.sword-arc')).toBe(true)
    expect(TWEAK_FIELD_MAP.has('player.knight.effect.whirl.whirl-dur')).toBe(true)
  })

  it('tags upgrade fields with the upgrade and chain they belong to', () => {
    expect(TWEAK_FIELD_MAP.get('player.knight.effect.health-3.max-health')).toMatchObject({
      upgradeId: 'health-3',
      chain: 'health',
      stat: 'max-health',
      group: 'effect'
    })
    // the ladder, not the id, decides the chain: knight's tier-2 whirl duration
    // really is id="whirldur"
    expect(TWEAK_FIELD_MAP.get('player.knight.cost.whirldur')?.chain).toBe('whirldur')
    expect(TWEAK_FIELD_MAP.get('player.knight.cost.whirldur1')?.chain).toBe('whirldur')
  })
})

describe('tweak overrides', () => {
  it('emits nothing when the user changed nothing', () => {
    expect(emitTweakFiles({})).toEqual([])
    expect(emitTweakFiles(undefined)).toEqual([])
  })

  it('emits nothing when a value is set back to its stock value', () => {
    expect(emitTweakFiles({ 'player.knight.param.max-health': 75 })).toEqual([])
    expect(pruneTweaks({ 'player.knight.param.max-health': 75 })).toEqual({})
  })

  it('ignores keys that do not name a real field', () => {
    expect(pruneTweaks({ 'player.bogus.param.nope': 5 })).toEqual({})
    expect(emitTweakFiles({ 'player.bogus.param.nope': 5 })).toEqual([])
  })

  it('emits only the file that changed', () => {
    const files = emitTweakFiles({ 'player.knight.param.max-health': 120 })
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('tweak/knight.xml')
    expect(files[0].content).toContain('<int name="max-health">120</int>')
  })

  it('emits one file per touched unit', () => {
    const files = emitTweakFiles({
      'player.knight.param.max-health': 120,
      'player.general.hard.enemydamagebase': 2.5,
      'player.shared.cost.life': 500
    })
    expect(files.map((f) => f.path).sort()).toEqual([
      'tweak/general.xml',
      'tweak/knight.xml',
      'tweak/shared.xml'
    ])
  })

  it('writes a complete file, not a fragment', () => {
    const [file] = emitTweakFiles({ 'player.knight.param.max-health': 120 })
    // the whole params block survives
    expect(file.content).toContain('<int name="max-mana">50</int>')
    expect(file.content).toContain('<string name="sword-arc-gfx">effects/knight_slash_90.xml</string>')
    expect(file.content).toContain('<bool name="whirl">false</bool>')
    // and every tier of an untouched chain
    for (const [id, cost] of [
      ['health-1', 600],
      ['health-2', 1200],
      ['health-3', 1800],
      ['health-4', 2400],
      ['health-5', 3000]
    ] as const) {
      expect(file.content).toContain(`id="${id}" cost="${cost}"`)
    }
    expect(file.content.startsWith('<tweak>')).toBe(true)
    expect(file.content.trimEnd().endsWith('</tweak>')).toBe(true)
  })

  it('overrides an upgrade cost without touching its siblings', () => {
    const [file] = emitTweakFiles({ 'player.knight.cost.health-3': 999 })
    expect(file.content).toContain('id="health-3" cost="999"')
    expect(file.content).toContain('id="health-2" cost="1200"')
    expect(file.content).toContain('id="health-4" cost="2400"')
  })

  it('overrides what an upgrade grants', () => {
    const [file] = emitTweakFiles({
      'player.knight.effect.health-3.max-health': 640,
      'player.knight.effect.mana-2.mana-regen': 450
    })
    expect(file.content).toContain('<int name="max-health">640</int>')
    expect(file.content).toContain('<int name="mana-regen">450</int>')
    // the other tiers of the same chain are intact
    expect(file.content).toContain('<int name="max-health">165</int>')
    expect(file.content).toContain('<int name="max-health">255</int>')
    // and so is the other child of the upgrade that was edited
    expect(file.content).toContain('<int name="max-mana">100</int>')
    expect(file.content).toContain('<int name="mana-regen">800</int>')
    expect(file.content).not.toContain('<int name="max-health">210</int>')
  })

  it('keeps the tier index out of the emitted edit', () => {
    const [file] = emitTweakFiles({ 'player.knight.effect.health-3.max-health': 640 })
    // lvl is untouchable, so tier 3 still identifies itself as tier 3
    expect(file.content).toContain('<int name="lvl">3</int>')
  })

  it('keeps self-closing form and extra attributes', () => {
    const [file] = emitTweakFiles({ 'player.shared.cost.rejuv': 100 })
    expect(file.content).toContain(
      '<dictionary id="life" cost="350" cat="power" name="life-uname" desc="life-udesc" life-cost-scale="2.6" />'
    )
    expect(file.content).toContain('id="rejuv" cost="100"')
  })

  it('emits general.xml with all three difficulties', () => {
    const [file] = emitTweakFiles({ 'player.general.hard.enemydamagebase': 2.5 })
    expect(file.path).toBe('tweak/general.xml')
    expect(file.content).toContain('<dictionary name="easy">')
    expect(file.content).toContain('<dictionary name="medium">')
    expect(file.content).toContain('<dictionary name="hard">')
    expect(file.content).toContain('<float name="EnemyDamageBase">2.5</float>')
    expect(file.content).toContain('<float name="EnemyHealthAll">0.75</float>')
  })

  it('does not mutate the baseline', () => {
    const before = TWEAK_BASELINE.find((f) => f.id === 'knight')
    applyTweaks({ 'player.knight.param.max-health': 999 })
    const after = TWEAK_BASELINE.find((f) => f.id === 'knight')
    expect(before).toBe(after)
    if (after?.kind === 'unit') {
      expect(after.params.find((p) => p.name === 'max-health')?.value).toBe(75)
    }
  })

  it('counts overrides per file for the section badges', () => {
    const counts = countTweaksByFile({
      'player.knight.param.max-health': 120,
      'player.knight.cost.health-1': 700,
      'player.thief.param.max-health': 60
    })
    expect(counts).toEqual({ knight: 2, thief: 1 })
  })
})

describe('loadout sheet', () => {
  const stock = buildLoadouts({})

  it('covers the seven classes', () => {
    expect(stock.map((l) => l.id)).toEqual([
      'knight',
      'priest',
      'ranger',
      'sorcerer',
      'thief',
      'warlock',
      'wizard'
    ])
  })

  it('computes stock ceilings that match the reference tables', () => {
    const knight = stock.find((l) => l.id === 'knight')
    const health = knight?.stats.find((s) => s.name === 'max-health')
    expect(health?.start).toBe(75)
    expect(health?.maxed).toBe(300)
    expect(knight?.stats.find((s) => s.name === 'dmg-reduction')?.maxed).toBe(10)
    expect(knight?.stats.find((s) => s.name === 'sword-dmg')?.maxed).toBe(38)

    const priest = stock.find((l) => l.id === 'priest')
    expect(priest?.stats.find((s) => s.name === 'max-health')?.maxed).toBe(65)

    const warlock = stock.find((l) => l.id === 'warlock')
    expect(warlock?.stats.find((s) => s.name === 'max-mana')?.maxed).toBe(450)

    // sorcerer and wizard have no armour tier 5
    const sorcerer = stock.find((l) => l.id === 'sorcerer')
    expect(sorcerer?.stats.find((s) => s.name === 'dmg-reduction')?.maxed).toBe(4)
  })

  it('follows an edited upgrade to a new ceiling', () => {
    const tweaked = buildLoadouts({ 'player.knight.effect.health-5.max-health': 900 })
    const knight = tweaked.find((l) => l.id === 'knight')
    expect(knight?.stats.find((s) => s.name === 'max-health')?.maxed).toBe(900)
    // the starting value is untouched, so it is not flagged as changed
    expect(knight?.stats.find((s) => s.name === 'max-health')?.changed).toBe(false)
  })

  it('flags changed starting values and shifts totals', () => {
    const tweaked = buildLoadouts({
      'player.knight.param.max-health': 500,
      'player.knight.cost.health-1': 100
    })
    const knight = tweaked.find((l) => l.id === 'knight')
    const stockKnight = stock.find((l) => l.id === 'knight')

    expect(knight?.stats.find((s) => s.name === 'max-health')?.changed).toBe(true)
    expect(knight?.stats.find((s) => s.name === 'max-mana')?.changed).toBe(false)
    expect(knight?.totalCost).toBe((stockKnight?.totalCost ?? 0) - 500)
    expect(knight?.stockTotalCost).toBe(stockKnight?.totalCost)
  })
})

describe('generateDungeon with tweaks', () => {
  it('ships exactly one tweak file for stock parameters — the extra-life removal', () => {
    // Stock is no longer tweak-free: defaultParameters() turns off the
    // repeatable extra-life shop upgrade (CLAUDE.md invariant 6).
    const result = generateDungeon(defaultParameters(), 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const tweaks = result.files.filter((f) => f.path.startsWith('tweak/'))
    expect(tweaks.map((f) => f.path)).toEqual(['tweak/shared.xml'])
    expect(tweaks[0].content).not.toContain('"life"')
  })

  it('emits no tweak folder at all once every tweak is cleared', () => {
    const params = defaultParameters()
    params.playerTweaks = {}
    const result = generateDungeon(params, 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files.filter((f) => f.path.startsWith('tweak/'))).toEqual([])
  })

  it('adds the edited tweak file to the campaign', () => {
    const params = defaultParameters()
    params.playerTweaks = { 'player.knight.param.max-health': 120 }
    const result = generateDungeon(params, 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('tweak/knight.xml')
    expect(paths).toContain('info.xml')
    expect(paths).toContain('levels.xml')
  })
})
