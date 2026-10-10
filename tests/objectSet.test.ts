import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { ObjectSet } from '../src/generator/objects/objectSet'
import type { SetTypeName } from '../src/generator/objects/objectSet'
import type { ScriptNode } from '../src/generator/objects/scriptNode'
import { bossArenaId, lobbyId } from '../src/generator/campaign'

function newContext(): GenerationContext {
  const ctx = new GenerationContext(defaultParameters(), 5)
  ctx.scenarioId = 'dungeon_5'
  return ctx
}

const paramOf = (n: ScriptNode, name: string) => n.params().find((p) => p.name === name)
const exits = (nodes: readonly ScriptNode[]) => nodes.filter((n) => n.cls === 'LevelExit')
const exitStartIds = (nodes: readonly ScriptNode[]) =>
  exits(nodes).map((n) => {
    const p = paramOf(n, 'StartID')
    return p?.kind === 'string' ? p.value : undefined
  })

/**
 * BossPortal and LobbyPortal each replace Orb at the same coordinates —
 * BossPortal on a floor leading into a fight, LobbyPortal on one leading into
 * a lobby. None of the three may draw a layout or cosmetic value, or swapping
 * one for another would move everything generated after it.
 */
describe('ObjectSet — Orb, BossPortal and LobbyPortal', () => {
  const ALL: readonly SetTypeName[] = ['Orb', 'BossPortal', 'LobbyPortal']

  for (const type of ALL) {
    it(`${type} draws nothing from ctx.rand or ctx.cosmeticRand`, () => {
      const params = defaultParameters()
      const untouched = new GenerationContext(params, 5)
      const withSet = new GenerationContext(params, 5)
      withSet.scenarioId = 'dungeon_5'

      ObjectSet.create(withSet, 0, 0, type, 'prison')

      const draw = (c: GenerationContext) => [
        ...Array.from({ length: 20 }, () => c.rand.iRand(0, 1_000_000)),
        ...Array.from({ length: 20 }, () => c.cosmeticRand.iRand(0, 1_000_000))
      ]
      expect(draw(withSet)).toEqual(draw(untouched))
    })
  }

  it("BossPortal leads to the first fight's arena by default, through a press-F exit", () => {
    const set = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'prison')
    expect(exitStartIds(set.scriptNodes)).toEqual([bossArenaId(0)])
    const level = paramOf(exits(set.scriptNodes)[0], 'Level')
    expect(level?.kind === 'string' && level.value).toBe(`levels/dungeon_5/${bossArenaId(0)}.lvl`)
    expect(set.scriptNodes.map((n) => n.cls)).toEqual(expect.arrayContaining(['UseTrigger', 'AllPlayersArea', 'SetRespawnPoint']))
  })

  it('LobbyPortal leads to the first lobby by default', () => {
    const set = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'prison')
    expect(exitStartIds(set.scriptNodes)).toEqual([lobbyId(0)])
  })

  // The same rig ends a non-final arena (BossPortal) or a dungeon floor
  // (either), where it points at whatever the campaign order puts next.
  it('takes an explicit target when one is given', () => {
    const boss = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'prison', bossArenaId(3))
    expect(exitStartIds(boss.scriptNodes)).toEqual(['boss3'])
    const lobby = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'prison', lobbyId(2))
    expect(exitStartIds(lobby.scriptNodes)).toEqual(['lobby2'])
  })

  it('lays the red teleporter for BossPortal and the round one for LobbyPortal', () => {
    const boss = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'prison')
    expect(boss.doodads.map((d) => d.path)).toContain('doodads/generic/teleport_red.unit')
    const lobby = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'prison')
    expect(lobby.doodads.map((d) => d.path)).toContain('doodads/generic/teleport_round.unit')
    expect(lobby.doodads.map((d) => d.path)).not.toContain('doodads/generic/teleport_red.unit')
  })

  it('ends the game on the orb: pickup -> victory banner -> ShowGameOver', () => {
    const set = ObjectSet.create(newContext(), 0, 0, 'Orb', 'prison')
    expect(exits(set.scriptNodes)).toEqual([])
    const classes = set.scriptNodes.map((n) => n.cls)
    expect(classes).toEqual(expect.arrayContaining(['UnitPickedUpTrigger', 'ShowGameOver']))
  })
})
