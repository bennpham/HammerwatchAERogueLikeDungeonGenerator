import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'
import { NodeDestroyObject } from '../src/generator/objects/nodes'
import { AeLevel } from '../src/generator/ae/model'
import { emitObjects } from '../src/generator/ae/emit'
import { renderLevel } from '../src/generator/ae/levelWriter'
import { readLevel } from '../src/generator/ae/levelReader'
import type { AeScript } from '../src/generator/ae/model'
import { idsParam } from './ae'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 1)
}

/** Emit the context's objects into a level, write it as SVAL, and read it back. */
function roundTrip(ctx: GenerationContext): AeLevel {
  const level = new AeLevel(null)
  emitObjects(level, ctx)
  return readLevel(renderLevel(level)).level
}

const scriptById = (level: AeLevel, id: number): AeScript => level.scripts.find((s) => s.id === id)!

describe('NodeDestroyObject', () => {
  it('ships as the AE DestroyUnits script', () => {
    expect(new NodeDestroyObject(newContext(), 0, 0).cls).toBe('DestroyUnits')
  })

  it('writes an empty Units array when it has no targets', () => {
    const ctx = newContext()
    const node = new NodeDestroyObject(ctx, 0, 0)
    expect(idsParam(scriptById(roundTrip(ctx), node.id), 'Units')).toEqual([])
  })

  it('names its targets by unit id once connected', () => {
    const ctx = newContext()
    const doodad = Doodad.create(ctx, 0, 0, 'Torch', 'prison')
    const node = new NodeDestroyObject(ctx, 0, 0)
    node.connectDoodad(doodad)
    const level = roundTrip(ctx)
    expect(idsParam(scriptById(level, node.id), 'Units')).toEqual([doodad.id])
    expect(level.units.some((u) => u.id === doodad.id)).toBe(true)
  })
})

describe('ScriptNode connections', () => {
  it('writes each connection as [target id, delay ms], in connection order', () => {
    const ctx = newContext()
    const a = new NodeDestroyObject(ctx, 0, 0)
    const b = new NodeDestroyObject(ctx, 1, 0)
    const c = new NodeDestroyObject(ctx, 2, 0)
    const d = new NodeDestroyObject(ctx, 3, 0)
    a.connectTo(b)
    a.connectTo(c, 2500)
    a.connectTo(d)
    expect(scriptById(roundTrip(ctx), a.id).connections).toEqual([
      [b.id, 0],
      [c.id, 2500],
      [d.id, 0]
    ])
  })

  it('shares one id counter between units and scripts', () => {
    const ctx = newContext()
    const first = new NodeDestroyObject(ctx, 0, 0)
    const doodad = Doodad.create(ctx, 0, 0, 'Torch', 'prison')
    const second = new NodeDestroyObject(ctx, 0, 0)
    expect([first.id, doodad.id, second.id]).toEqual([first.id, first.id + 1, first.id + 2])
  })
})
