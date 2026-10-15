import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { ObjectSet, SHOP_KINDS } from '../src/generator/objects/objectSet'
import { NodeAnnounceText } from '../src/generator/objects/nodes'
import type { SetTypeName } from '../src/generator/objects/objectSet'
import type { ScriptNode } from '../src/generator/objects/scriptNode'
import { bossArenaId, lobbyId } from '../src/generator/campaign'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 5, 'dungeon_5')
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
      const withSet = new GenerationContext(params, 5, 'dungeon_5')

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

  it('lays the red square pad for BossPortal and the house square pad for LobbyPortal', () => {
    const boss = ObjectSet.create(newContext(), 0, 0, 'BossPortal', 'prison')
    expect(boss.doodads.map((d) => d.path)).toContain('doodads/generic/teleport_red.unit')
    const lobby = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'prison')
    expect(lobby.doodads.map((d) => d.path)).toContain('doodads/generic/teleport_mt.unit')
    expect(lobby.doodads.map((d) => d.path)).not.toContain('doodads/generic/teleport_red.unit')
  })

  it('ends the game on the orb: pickup -> victory banner -> ShowGameOver', () => {
    const set = ObjectSet.create(newContext(), 0, 0, 'Orb', 'prison')
    expect(exits(set.scriptNodes)).toEqual([])
    const classes = set.scriptNodes.map((n) => n.cls)
    expect(classes).toEqual(expect.arrayContaining(['UnitPickedUpTrigger', 'ShowGameOver']))
  })
})

describe('ObjectSet — Shop', () => {
  // the house's vendors (which work) fire their ShopArea from the UseTrigger;
  // #PlayerTarget alone only names who pressed F, it never runs the shop
  for (const kind of SHOP_KINDS) {
    it(`F at the ${kind.id} stand runs its ShopArea`, () => {
      const set = ObjectSet.create(newContext(), 0, 0, 'Shop', 'prison', undefined, kind)
      const use = set.scriptNodes.find((n) => n.cls === 'UseTrigger')!
      const area = set.scriptNodes.find((n) => n.cls === 'ShopArea')!
      expect(use.connections.map((c) => c.node)).toContain(area)
      expect(paramOf(area, 'Categories')).toMatchObject({ value: kind.categories })
    })
  }
})

describe('AnnounceText styles', () => {
  const styleOf = (textType: number) => {
    const n = new NodeAnnounceText(newContext(), 0, 0)
    n.textType = textType
    return paramOf(n, 'Style')
  }

  it('keeps the countdown on the default line and everything else off it', () => {
    // a timed floor ticks the default `hint_announce` every second, which
    // replaces whatever else is showing there
    expect(styleOf(2)).toBeUndefined()
    expect(styleOf(0)).toMatchObject({ value: 'region_enter' })
    expect(styleOf(1)).toMatchObject({ value: 'region_enter' })
    expect(styleOf(3)).toMatchObject({ value: 'info_event' })
  })

  it('leaves the gather-party line as Castle writes it', () => {
    const set = ObjectSet.create(newContext(), 0, 0, 'LobbyPortal', 'prison')
    const gather = set.scriptNodes.find((n) => n.cls === 'AnnounceText')!
    expect(paramOf(gather, 'Style')).toBeUndefined()
  })
})
