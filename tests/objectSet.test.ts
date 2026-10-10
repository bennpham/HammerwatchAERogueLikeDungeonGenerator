import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { ObjectSet } from '../src/generator/objects/objectSet'
import type { SetTypeName } from '../src/generator/objects/objectSet'
import { bossArenaId, lobbyId } from '../src/generator/campaign'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 5)
}

/**
 * BossPortal and LobbyPortal each replace Orb at the same coordinates —
 * BossPortal on a floor leading into a fight, LobbyPortal on one leading into
 * a lobby. Room transforms run before wall rasterization and ctx.idCounter is
 * one monotonic counter per level, so both portals must match Orb's id/RNG
 * contract exactly: any drift here shifts every wall doodad id placed after
 * it on that floor.
 */
describe('ObjectSet — Orb vs BossPortal vs LobbyPortal parity', () => {
  const PORTAL_TYPES: readonly SetTypeName[] = ['BossPortal', 'LobbyPortal']

  it('all three register exactly 3 ctx ids from an equal starting idCounter', () => {
    const ctxOrb = newContext()
    ctxOrb.idCounter = 10
    ObjectSet.create(ctxOrb, 0, 0, 'Orb', 'a')
    expect(ctxOrb.idCounter).toBe(13)

    for (const type of PORTAL_TYPES) {
      const ctx = newContext()
      ctx.idCounter = 10
      ObjectSet.create(ctx, 0, 0, type, 'a')
      expect(ctx.idCounter, type).toBe(13)
    }
  })

  for (const type of PORTAL_TYPES) {
    it(`${type} draws nothing from ctx.rand`, () => {
      const params = defaultParameters()
      const untouched = new GenerationContext(params, 5)
      const withPortal = new GenerationContext(params, 5)

      ObjectSet.create(withPortal, 0, 0, type, 'a')

      const untouchedValues = Array.from({ length: 20 }, () => untouched.rand.iRand(0, 1_000_000))
      const afterValues = Array.from({ length: 20 }, () => withPortal.rand.iRand(0, 1_000_000))
      expect(afterValues).toEqual(untouchedValues)
    })

    it(`${type} draws nothing from ctx.cosmeticRand`, () => {
      const params = defaultParameters()
      const untouched = new GenerationContext(params, 5)
      const withPortal = new GenerationContext(params, 5)

      ObjectSet.create(withPortal, 0, 0, type, 'a')

      const untouchedValues = Array.from({ length: 20 }, () => untouched.cosmeticRand.iRand(0, 1_000_000))
      const afterValues = Array.from({ length: 20 }, () => withPortal.cosmeticRand.iRand(0, 1_000_000))
      expect(afterValues).toEqual(untouchedValues)
    })
  }

  it("BossPortal targets the first fight's arena directly, not a numeric next floor", () => {
    const ctx = newContext()
    const set = ObjectSet.create(ctx, 0, 0, 'BossPortal', 'a')
    const xml = set.scriptNodes.map((n) => n.getXML()).join('')
    expect(xml).toContain(`<string name="level">${bossArenaId(0)}</string>`)
  })

  it('LobbyPortal targets the first lobby by default', () => {
    const ctx = newContext()
    const set = ObjectSet.create(ctx, 0, 0, 'LobbyPortal', 'a')
    const xml = set.scriptNodes.map((n) => n.getXML()).join('')
    expect(xml).toContain(`<string name="level">${lobbyId(0)}</string>`)
  })

  // The same rig ends a non-final arena (BossPortal) or a dungeon floor
  // (either), where it points at whatever the campaign order puts next.
  // Either way this is the mechanism a multi-fight, multi-lobby campaign
  // chains on.
  it('takes an explicit target when one is given', () => {
    const boss = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'a', bossArenaId(3))
    expect(boss.scriptNodes.map((n) => n.getXML()).join('')).toContain('<string name="level">boss3</string>')

    const lobby = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'a', lobbyId(2))
    expect(lobby.scriptNodes.map((n) => n.getXML()).join('')).toContain('<string name="level">lobby2</string>')
  })

  it('lays the red portal doodad for BossPortal and the blue one for LobbyPortal', () => {
    const boss = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'a')
    expect(boss.doodads.map((d) => d.getXML()).join('')).toContain('doodads/generic/exit_teleport_boss.xml')

    const lobby = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'a')
    const lobbyDoodadXML = lobby.doodads.map((d) => d.getXML()).join('')
    expect(lobbyDoodadXML).toContain('doodads/generic/exit_teleport.xml')
    expect(lobbyDoodadXML).not.toContain('doodads/generic/exit_teleport_boss.xml')
  })
})
