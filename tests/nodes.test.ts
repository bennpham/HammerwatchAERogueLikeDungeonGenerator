import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'
import { NodeDestroyObject } from '../src/generator/objects/nodes'
import { badIntArray } from './xmlHelpers'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 1)
}

describe('NodeDestroyObject', () => {
  it('omits the <int-arr> entirely when it has no targets, instead of emitting an empty one', () => {
    const ctx = newContext()
    const node = new NodeDestroyObject(ctx, 0, 0)
    const xml = node.getXML()

    expect(xml).not.toContain('<int-arr')
    expect(badIntArray(xml)).toBeNull()
  })

  it('emits the target ids once targets are connected', () => {
    const ctx = newContext()
    const doodad = Doodad.create(ctx, 0, 0, 'Torch', 'a')
    const node = new NodeDestroyObject(ctx, 0, 0)
    node.connectDoodad(doodad)
    const xml = node.getXML()

    expect(xml).toContain(`<int-arr name="static">${doodad.id}</int-arr>`)
    expect(badIntArray(xml)).toBeNull()
  })

  it('ships type DestroyObject without requiring the caller to pass it', () => {
    const ctx = newContext()
    const node = new NodeDestroyObject(ctx, 0, 0)
    expect(node.type).toBe('DestroyObject')
  })
})

describe('ScriptNode connection delays', () => {
  it('keeps the Java original\u2019s delays line while no connection asks for a delay', () => {
    const ctx = newContext()
    const a = new NodeDestroyObject(ctx, 0, 0)
    const b = new NodeDestroyObject(ctx, 1, 0)
    const c = new NodeDestroyObject(ctx, 2, 0)
    a.connectTo(b)
    a.connectTo(c)
    const xml = a.getXML()

    // the original passed the ids array for delays too; every level in the repo
    // still ships that, and none of them may move a byte
    expect(xml).toContain(`<int-arr name="connections">${b.id} ${c.id}</int-arr>`)
    expect(xml).toContain(`<int-arr name="delays">${b.id} ${c.id}</int-arr>`)
    expect(xml).not.toContain('connection-delays')
  })

  it('writes real milliseconds under both delay names once any connection carries one', () => {
    const ctx = newContext()
    const a = new NodeDestroyObject(ctx, 0, 0)
    const b = new NodeDestroyObject(ctx, 1, 0)
    const c = new NodeDestroyObject(ctx, 2, 0)
    a.connectTo(b, 0)
    a.connectTo(c, 2500)
    const xml = a.getXML()

    expect(xml).toContain('<int-arr name="delays">0 2500</int-arr>')
    expect(xml).toContain('<int-arr name="connection-delays">0 2500</int-arr>')
    expect(badIntArray(xml)).toBeNull()
  })

  it('back-fills zeros for connections made before the first delay', () => {
    const ctx = newContext()
    const a = new NodeDestroyObject(ctx, 0, 0)
    const b = new NodeDestroyObject(ctx, 1, 0)
    const c = new NodeDestroyObject(ctx, 2, 0)
    const d = new NodeDestroyObject(ctx, 3, 0)
    a.connectTo(b)
    a.connectTo(c, 1000)
    a.connectTo(d)
    const xml = a.getXML()

    // b was connected before delays existed on this node, d after but without
    // one of its own — both are 0, and the arrays stay the same length as
    // connections
    expect(xml).toContain('<int-arr name="connection-delays">0 1000 0</int-arr>')
    expect(xml).toContain(`<int-arr name="connections">${b.id} ${c.id} ${d.id}</int-arr>`)
  })
})
