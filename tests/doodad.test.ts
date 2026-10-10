import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'
import type { DoodadTypeName } from '../src/generator/objects/doodad'
import { THEMES } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 1)
}

const FIXED: readonly DoodadTypeName[] = [
  'Torch',
  'TorchOff',
  'TriggerButton',
  'BossDoorButton',
  'BossPortal',
  'LobbyPortal',
  'ExitMarker'
]

describe('Doodad', () => {
  it('draws one id from the level counter and registers itself', () => {
    const ctx = newContext()
    ctx.idCounter = 10
    const d = Doodad.create(ctx, 0, 0, 'Torch', 'prison')
    expect(d.id).toBe(10)
    expect(ctx.idCounter).toBe(11)
    expect(ctx.doodads).toContain(d)
  })

  it('resolves every theme-independent doodad to a unit the install ships', () => {
    for (const type of FIXED) {
      const d = Doodad.create(newContext(), 0, 0, type, 'prison')
      expect(aeAssetExists(d.path), `${type} -> ${d.path}`).toBe(true)
    }
  })

  it('resolves the wall and exit pieces of every theme to shipped units', () => {
    for (const theme of THEMES) {
      for (const type of ['Horizontal', 'Vertical', 'ExitUp', 'ExitDn'] as const) {
        const d = Doodad.create(newContext(), 0, 0, type, theme)
        expect(aeAssetExists(d.path), `${theme} ${type} -> ${d.path}`).toBe(true)
      }
    }
  })

  it('uses the red teleporter for a boss portal and the round one for a lobby portal', () => {
    expect(Doodad.create(newContext(), 0, 0, 'BossPortal', 'prison').path).toBe('doodads/generic/teleport_red.unit')
    expect(Doodad.create(newContext(), 0, 0, 'LobbyPortal', 'prison').path).toBe('doodads/generic/teleport_round.unit')
  })

  it('is not blocking unless a seal says so', () => {
    expect(Doodad.create(newContext(), 3, 4, 'Horizontal', 'prison').blocking).toBe(false)
  })
})
