import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 1)
}

describe('Doodad.needSync', () => {
  it('defaults to false and emits need-sync False', () => {
    const ctx = newContext()
    const d = Doodad.create(ctx, 0, 0, 'Torch', 'a')
    expect(d.needSync).toBe(false)
    expect(d.getXML()).toContain('<bool name="need-sync">False</bool>')
  })

  it('emits True once the field is set — required for a DestroyObject target', () => {
    const ctx = newContext()
    const d = Doodad.create(ctx, 0, 0, 'Torch', 'a')
    d.needSync = true
    expect(d.getXML()).toContain('<bool name="need-sync">True</bool>')
    expect(d.getXML()).not.toContain('need-sync">False')
  })

  it('leaves every other existing Doodad.create call site unaffected — no constructor param was added', () => {
    const ctx = newContext()
    // same positional call shape as every other existing call site in the codebase
    const d = Doodad.create(ctx, 3, 4, 'CornerLD', 'b')
    expect(d.needSync).toBe(false)
  })
})
