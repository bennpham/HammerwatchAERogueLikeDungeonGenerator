import { describe, expect, it } from 'vitest'
import { TWEAK_BASELINE } from '../src/generator/tweak'
import {
  applyCostCurve,
  applyValueCurve,
  buildChains,
  chainKeyOf,
  currentCost,
  currentValue,
  deriveCostCurve,
  deriveValueCurve
} from '../src/generator/tweak/chains'
import type { TweakChain } from '../src/generator/tweak/chains'
import type { TweakUnitFile } from '../src/generator/tweak/types'

function unit(id: string): TweakUnitFile {
  const file = TWEAK_BASELINE.find((f) => f.id === id)
  if (file === undefined || file.kind !== 'unit') throw new Error(`no unit file ${id}`)
  return file
}

const knight = unit('knight')
const knightChains = buildChains(knight)

function chain(chains: TweakChain[], key: string): TweakChain {
  const found = chains.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no chain ${key}`)
  return found
}

/** Every tier's value for a stat, in ladder order. */
function ladder(c: TweakChain, stat: string, tweaks: Record<string, number>): number[] {
  return c.tiers
    .map((tier) => currentValue(c, tier, stat, tweaks))
    .filter((v): v is number => v !== undefined)
}

describe('chain grouping', () => {
  it('strips tier numbers from both id styles', () => {
    expect(chainKeyOf('health-1')).toBe('health')
    expect(chainKeyOf('armor-5')).toBe('armor')
    expect(chainKeyOf('dmg1')).toBe('dmg')
    expect(chainKeyOf('healeff3')).toBe('healeff')
    expect(chainKeyOf('areadmg-2')).toBe('areadmg')
    // ids without a tier number are their own chain
    expect(chainKeyOf('whirl')).toBe('whirl')
    expect(chainKeyOf('fire-shield')).toBe('fire-shield')
    expect(chainKeyOf('pot-dmg')).toBe('pot-dmg')
  })

  it('keeps a root unlock separate from the tiers that follow it', () => {
    // `heal` grants the skill; `healeff1..3` improve it. Different ladders.
    expect(chain(knightChains, 'heal').tiers.map((t) => t.upgrade.id)).toEqual(['heal'])
    expect(chain(knightChains, 'healeff').tiers.map((t) => t.upgrade.id)).toEqual([
      'healeff1',
      'healeff2',
      'healeff3'
    ])
    expect(chain(knightChains, 'heal').flat).toBe(true)
    expect(chain(knightChains, 'healeff').flat).toBe(false)
  })

  it('takes tier order from lvl, not from the id', () => {
    // knight's tier-2 whirl duration really is id="whirldur"
    const whirldur = chain(knightChains, 'whirldur')
    expect(whirldur.tiers.map((t) => t.upgrade.id)).toEqual(['whirldur1', 'whirldur'])
    expect(whirldur.tiers.map((t) => t.level)).toEqual([1, 2])
  })

  it('lists the numeric stats a chain writes', () => {
    expect(chain(knightChains, 'health').stats).toEqual(['max-health'])
    expect(chain(knightChains, 'mana').stats).toEqual(['max-mana', 'mana-regen'])
    // the gfx path is a string, so it is not editable and not listed
    expect(chain(knightChains, 'arc').stats).toEqual(['sword-arc'])
  })

  it('covers every upgrade of every unit file exactly once', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      const ids = buildChains(file).flatMap((c) => c.tiers.map((t) => t.upgrade.id))
      expect(ids.sort()).toEqual(file.upgrades.map((u) => u.id).sort())
    }
  })
})

describe('cost curves', () => {
  it('reads the stock ladders as the straight lines they are', () => {
    const health = deriveCostCurve(chain(knightChains, 'health'), {})
    expect(health).toMatchObject({ first: 600, step: 600, mode: 'add', fits: true })

    const mana = deriveCostCurve(chain(knightChains, 'mana'), {})
    expect(mana).toMatchObject({ first: 800, step: 1100, mode: 'add', fits: true })
  })

  it('flags an irregular ladder instead of pretending it fits', () => {
    // 800 / 1600 / 2700 / 3900 / 5200 — the steps grow
    expect(deriveCostCurve(chain(knightChains, 'dmg'), {}).fits).toBe(false)
  })

  it('rewrites every tier and round-trips back to the same curve', () => {
    const health = chain(knightChains, 'health')
    const curve = deriveCostCurve(health, {})
    const tweaks = applyCostCurve(health, { ...curve, first: 1000, step: 1000 }, {})

    expect(health.tiers.map((t) => currentCost(health, t, tweaks))).toEqual([
      1000, 2000, 3000, 4000, 5000
    ])
    expect(deriveCostCurve(health, tweaks)).toMatchObject({ first: 1000, step: 1000, fits: true })
  })

  it('multiplies when asked to', () => {
    const health = chain(knightChains, 'health')
    const tweaks = applyCostCurve(health, { first: 100, step: 2, mode: 'mul', fits: false }, {})
    expect(health.tiers.map((t) => currentCost(health, t, tweaks))).toEqual([100, 200, 400, 800, 1600])
  })

  it('never prescribes a negative price', () => {
    const health = chain(knightChains, 'health')
    const tweaks = applyCostCurve(health, { first: 100, step: -500, mode: 'add', fits: false }, {})
    expect(health.tiers.map((t) => currentCost(health, t, tweaks))).toEqual([100, 0, 0, 0, 0])
  })

  it('stores nothing when the curve reproduces the stock ladder', () => {
    const health = chain(knightChains, 'health')
    expect(applyCostCurve(health, deriveCostCurve(health, {}), {})).toEqual({})
  })
})

describe('value curves', () => {
  it('measures the stock ladders from the starting stat', () => {
    const health = deriveValueCurve(knight, chain(knightChains, 'health'), 'max-health', {})
    expect(health).toMatchObject({ anchor: 75, step: 45, mode: 'add', fits: true, fromStart: true })

    const mana = chain(knightChains, 'mana')
    expect(deriveValueCurve(knight, mana, 'max-mana', {})).toMatchObject({
      anchor: 50,
      step: 25,
      fits: true,
      fromStart: true
    })
    // mana-regen is a period in ms, so the stock ladder counts down
    expect(deriveValueCurve(knight, mana, 'mana-regen', {})).toMatchObject({
      anchor: 1100,
      step: -100,
      fits: true,
      fromStart: true
    })
    expect(deriveValueCurve(knight, chain(knightChains, 'arc'), 'sword-arc', {})).toMatchObject({
      anchor: 90,
      step: 30,
      fits: true,
      fromStart: true
    })
  })

  it('fits through the tiers when the starting stat is a locked sentinel', () => {
    // whirl-dur starts at -1 ("skill locked"), so it cannot anchor the ladder
    const curve = deriveValueCurve(knight, chain(knightChains, 'whirldur'), 'whirl-dur', {})
    expect(curve.fromStart).toBe(false)
    expect(curve.fits).toBe(true)
    expect(curve.step).toBe(2)
  })

  it('flags a ladder that does not sit on a line at all', () => {
    // dmg-reduction is 4 / 6 / 8 / 9 / 10 — the steps shrink at the top
    const curve = deriveValueCurve(knight, chain(knightChains, 'armor'), 'dmg-reduction', {})
    expect(curve.fits).toBe(false)
    // no fit either way, so it falls back to the starting stat
    expect(curve.fromStart).toBe(true)
  })

  it('falls back to a line through the tiers when the ladder is off-centre', () => {
    // shield-arc is 120 / 180 / 240 (+60), but starts at 75 — a clean ladder the
    // game simply did not hang off the base value
    const curve = deriveValueCurve(knight, chain(knightChains, 'shield'), 'shield-arc', {})
    expect(curve).toMatchObject({ anchor: 60, step: 60, fits: true, fromStart: false })
  })

  it('rewrites the ladder from the starting stat', () => {
    const health = chain(knightChains, 'health')
    const curve = deriveValueCurve(knight, health, 'max-health', {})
    const tweaks = applyValueCurve(health, 'max-health', { ...curve, step: 100 }, {})
    expect(ladder(health, 'max-health', tweaks)).toEqual([175, 275, 375, 475, 575])
  })

  it('re-anchors a stale ladder onto a raised starting stat', () => {
    // the reported bug: raise starting health and every health tier becomes a
    // paid downgrade, because an upgrade sets the stat rather than adding to it
    const start = { 'player.knight.param.max-health': 400 }
    const health = chain(knightChains, 'health')
    expect(ladder(health, 'max-health', start)).toEqual([120, 165, 210, 255, 300])

    const curve = deriveValueCurve(knight, health, 'max-health', start)
    const fixed = applyValueCurve(health, 'max-health', { ...curve, anchor: 400 }, start)
    expect(ladder(health, 'max-health', fixed)).toEqual([445, 490, 535, 580, 625])
    // and the repaired ladder now reads back as anchored on the starting stat
    expect(deriveValueCurve(knight, health, 'max-health', fixed)).toMatchObject({
      anchor: 400,
      step: 45,
      fits: true,
      fromStart: true
    })
  })

  it('writes only the tiers that carry the stat', () => {
    // sorcerer's comet ladder only touches comet-mana-cost on two of its four tiers
    const sorcerer = unit('sorcerer')
    const comet = chain(buildChains(sorcerer), 'cometdmg')
    const carriers = comet.tiers.filter(
      (t) => currentValue(comet, t, 'comet-mana-cost', {}) !== undefined
    )
    expect(carriers.length).toBeGreaterThan(0)
    expect(carriers.length).toBeLessThan(comet.tiers.length)

    const tweaks = applyValueCurve(
      comet,
      'comet-mana-cost',
      { anchor: 0, step: 7, mode: 'add', fits: false, fromStart: false },
      {}
    )
    for (const key of Object.keys(tweaks)) {
      expect(key).toContain('.comet-mana-cost')
    }
    expect(Object.keys(tweaks)).toHaveLength(carriers.length)
  })

  it('keeps float stats off the integer grid', () => {
    const chrg = chain(knightChains, 'chrgdmg')
    const tweaks = applyValueCurve(
      chrg,
      'charge-dmg-multiplier',
      { anchor: 1.75, step: 0.5, mode: 'add', fits: false, fromStart: true },
      {}
    )
    expect(ladder(chrg, 'charge-dmg-multiplier', tweaks)).toEqual([2.25, 2.75, 3.25])
  })

  it('stores nothing when the curve reproduces the stock ladder', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      for (const c of buildChains(file)) {
        if (c.flat) continue
        for (const stat of c.stats) {
          const curve = deriveValueCurve(file, c, stat, {})
          if (!curve.fits) continue
          expect(applyValueCurve(c, stat, curve, {}), `${file.id}/${c.key}/${stat}`).toEqual({})
        }
      }
    }
  })

  it('derives a fitting curve for the great majority of stock ladders', () => {
    let total = 0
    let fitting = 0
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      for (const c of buildChains(file)) {
        if (c.flat) continue
        for (const stat of c.stats) {
          total += 1
          if (deriveValueCurve(file, c, stat, {}).fits) fitting += 1
        }
      }
    }
    // a regression that broke the fit would show up here long before the UI
    expect(total).toBeGreaterThan(40)
    expect(fitting / total).toBeGreaterThan(0.6)
  })
})
