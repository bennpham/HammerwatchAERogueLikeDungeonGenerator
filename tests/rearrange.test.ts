import { describe, expect, it } from 'vitest'
import { withGatewayLocks } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { defaultLobby, defaultParameters, type BossFight } from '../src/generator/config/parameters'
import { DEFAULT_LOBBY_PRESET_ID } from '../src/generator/lobby/presets'
import { parseSlotLabel } from '../src/generator/campaign'
import type { CampaignSlot } from '../src/generator/campaign'
import type { AeLevel } from '../src/generator/ae/model'
import { fileOf, generateOk, levelsOf, scriptsOf, stemOfPath, strParam } from './ae'

const slots = (spec: string): CampaignSlot[] =>
  spec.split(',').map((token) => {
    const slot = parseSlotLabel(token)
    if (slot === null) throw new Error(`bad slot "${token}"`)
    return slot
  })

/**
 * A small campaign — 3 floors, `fightCount` fights, `lobbyCount` lobbies —
 * arranged as `spec`. Small on purpose: these tests are about wiring.
 */
function campaign(spec: string | undefined, fightCount = 2, lobbyCount = 0): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  params.levelBuffs = params.levelBuffs?.slice(0, 3)
  params.levelTimers = params.levelTimers?.slice(0, 3)

  const stock = params.boss.fights[0]
  params.boss = {
    ...params.boss,
    fights: Array.from({ length: fightCount }, () => JSON.parse(JSON.stringify(stock)) as BossFight)
  }
  params.lobbies = Array.from({ length: lobbyCount }, () => defaultLobby(DEFAULT_LOBBY_PRESET_ID))
  if (spec !== undefined) params.levelOrder = slots(spec)
  return params
}

const SEED = 4242

const level = (r: DungeonResult, stem: string): AeLevel => {
  const l = levelsOf(r).get(stem)
  if (l === undefined) throw new Error(`no level ${stem}`)
  return l
}

/** The StartIDs a level's exits lead to — the next slots' stems. */
const exitTargets = (l: AeLevel) => scriptsOf(l, 'LevelExit').map((s) => strParam(s, 'StartID'))

/** The stem a new game starts in, read from info.xml. */
const startOf = (r: DungeonResult) => {
  const path = /lvl="([^"]+)"/.exec(fileOf(r, 'info.xml')!.content)?.[1]
  return path === undefined ? undefined : stemOfPath(path)
}

/** Play order: the start level, then each level's exit, until a level ends the run. */
function playOrder(r: DungeonResult): string[] {
  const order: string[] = []
  let stem = startOf(r)
  while (stem !== undefined && !order.includes(stem)) {
    order.push(stem)
    stem = exitTargets(level(r, stem))[0]
  }
  return order
}

/** Stems of the levels that end the scenario (ShowGameOver). */
const endsOf = (r: DungeonResult) => [...levelsOf(r)].filter(([, l]) => scriptsOf(l, 'ShowGameOver').length > 0).map(([s]) => s)

const hasUnit = (l: AeLevel, path: string) => l.units.some((u) => u.path === path)
const RED_PORTAL = 'doodads/generic/teleport_red.unit'
const BLUE_PORTAL = 'doodads/generic/teleport_mt.unit'
const ORB = 'items/pickups/collectable_10_sphere.unit'

describe('campaign order — the default is unchanged', () => {
  it('an explicit default order generates byte-identical files to no order at all', () => {
    for (const seed of [1, SEED]) {
      const implicit = generateOk(campaign(undefined), seed)
      const explicit = generateOk(campaign('1,2,3,B1,B2'), seed)
      expect(explicit.files, `seed ${seed}`).toEqual(implicit.files)
    }
  }, 60_000)

  it('plays the campaign in order and labels the preview tabs to match', () => {
    const result = generateOk(campaign(undefined), SEED)
    expect(playOrder(result)).toEqual(['floor0', 'floor1', 'floor2', 'boss0', 'boss1'])
    expect(result.levels.map((l) => l.label)).toEqual(['1', '2', '3', 'AB1', 'AB2'])
  })
})

describe('campaign order — rearranged', () => {
  // B1,1,2,B2,3 — opens on a boss fight, ends on a dungeon floor.
  const SPEC = 'B1,1,2,B2,3'

  it('plays the levels in the arranged order', () => {
    expect(playOrder(generateOk(campaign(SPEC), SEED))).toEqual(['boss0', 'floor0', 'floor1', 'boss1', 'floor2'])
  })

  it('starts the party at the first slot — here, a boss arena', () => {
    expect(startOf(generateOk(campaign(SPEC), SEED))).toBe('boss0')
  })

  it('chains every slot to the next one, and gives the start a default spawn', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(exitTargets(level(result, 'boss0'))).toContain('floor0')
    expect(exitTargets(level(result, 'floor0'))).toContain('floor1')
    expect(exitTargets(level(result, 'floor1'))).toContain('boss1')
    expect(exitTargets(level(result, 'boss1'))).toContain('floor2')
    // a new game spawns at the LevelStart with no StartID — only in the start level
    const defaults = [...levelsOf(result)].filter(([, l]) =>
      scriptsOf(l, 'LevelStart').some((s) => strParam(s, 'StartID') === undefined)
    )
    expect(defaults.map(([s]) => s)).toEqual(['boss0'])
  })

  it('ends the campaign on the last slot, wherever that is', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(endsOf(result)).toEqual(['floor2'])
    expect(hasUnit(level(result, 'floor2'), ORB)).toBe(true)
  })

  it('gives a floor that leads into a fight the boss portal rather than stairs', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(hasUnit(level(result, 'floor1'), RED_PORTAL)).toBe(true)
    expect(hasUnit(level(result, 'floor0'), RED_PORTAL)).toBe(false)
  })

  it('labels the preview tabs and the arrival banners in play order', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(result.levels.map((l) => l.label)).toEqual(['AB1', '1', '2', 'AB2', '3'])
    const banner = (stem: string) =>
      scriptsOf(level(result, stem), 'AnnounceText')
        .map((s) => strParam(s, 'Text') ?? '')
        .find((t) => t.startsWith('Floor '))
    // floors announce their position in play order, never repeating one
    expect([banner('floor0'), banner('floor1'), banner('floor2')]).toEqual(['Floor 2', 'Floor 3', 'Floor 5'])
  })

  it('is deterministic', () => {
    const params = campaign(SPEC)
    expect(generateOk(params, 2024).files).toEqual(generateOk(params, 2024).files)
  }, 60_000)

  it('leaves each arena geometry identical to its place in the default order', () => {
    const rearranged = level(generateOk(campaign('B1,1,2,B2,3'), SEED), 'boss0')
    const plain = level(generateOk(campaign(undefined), SEED), 'boss0')
    // the floor the RNG drew did not move
    expect(rearranged.tileCells).toEqual(plain.tileCells)
  }, 60_000)
})

describe('campaign order — a lobby in the chain', () => {
  const SPEC = 'B1,1,2,L1,B2,3'

  it('plays the lobby as its own level, between the floor and the arena it feeds', () => {
    expect(playOrder(generateOk(campaign(SPEC, 2, 1), SEED))).toEqual(['boss0', 'floor0', 'floor1', 'lobby0', 'boss1', 'floor2'])
  })

  it('chains floor -> lobby -> arena through their exit targets, via the blue portal', () => {
    const result = generateOk(campaign(SPEC, 2, 1), SEED)
    const floor1 = level(result, 'floor1')
    expect(exitTargets(floor1)).toContain('lobby0')
    expect(hasUnit(floor1, BLUE_PORTAL)).toBe(true)
    expect(hasUnit(floor1, RED_PORTAL)).toBe(false)
    expect(exitTargets(level(result, 'lobby0'))).toContain('boss1')
  })

  it('still hands out exactly one victory end, on the last slot', () => {
    expect(endsOf(generateOk(campaign(SPEC, 2, 1), SEED))).toEqual(['floor2'])
  })
})

describe('campaign order — the three gateway prefabs', () => {
  it('gives the same floor a red portal, a blue portal, or the orb, depending only on what follows it', () => {
    const direct = generateOk(campaign('1,2,B1,3', 1, 0), SEED)
    expect(hasUnit(level(direct, 'floor1'), RED_PORTAL)).toBe(true)
    expect(hasUnit(level(direct, 'floor1'), ORB)).toBe(false)
    expect(hasUnit(level(direct, 'floor2'), ORB)).toBe(true)

    const viaLobby = generateOk(campaign('1,2,L1,B1,3', 1, 1), SEED)
    expect(hasUnit(level(viaLobby, 'floor1'), BLUE_PORTAL)).toBe(true)
    expect(hasUnit(level(viaLobby, 'floor1'), RED_PORTAL)).toBe(false)
    expect(hasUnit(level(viaLobby, 'floor2'), ORB)).toBe(true)
  })
})

describe('campaign order — lobbies never move a floor', () => {
  // Lobbies draw from no stream, and under the implicit order every lobby is
  // ahead of every floor, so no floor's own next slot changes as lobbies come
  // and go. What legitimately moves: arrival banners count play position, and
  // floor0 stops being the start level, losing its default-spawn LevelStart —
  // whose id shifts every later id by one. So units compare without ids.
  it('leaves every dungeon floor geometry identical as lobbies are added and removed', () => {
    const none = campaign(undefined, 1, 0)
    const two = campaign(undefined, 1, 0)
    two.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID), defaultLobby('BETA-boss-prep')]
    const placed = (l: AeLevel) => l.units.map((u) => `${u.path}@${u.x},${u.y}`)
    for (const seed of [1, SEED]) {
      const a = levelsOf(generateOk(none, seed))
      const b = levelsOf(generateOk(two, seed))
      for (const stem of ['floor0', 'floor1', 'floor2']) {
        expect(b.get(stem)!.tileCells, `seed ${seed} ${stem}`).toEqual(a.get(stem)!.tileCells)
        expect(placed(b.get(stem)!), `seed ${seed} ${stem}`).toEqual(placed(a.get(stem)!))
      }
    }
  }, 60_000)
})

describe('campaign order — a floor that ends the campaign', () => {
  it('seals the gateway room on every floor that carries one', () => {
    const params = withGatewayLocks(campaign('1,B1,2,3', 1))
    expect(params.levelLock!.map((l) => l.enabled)).toEqual([true, false, true])
    const result = generateOk(params, SEED)
    expect(result.levels[0].rooms.some((r) => r.sealed)).toBe(true)
    expect(result.levels[result.levels.length - 1].rooms.some((r) => r.sealed)).toBe(true)
  }, 60_000)
})

describe('campaign order — reachability still holds', () => {
  it('emits only floors with an entrance and a gateway, on every seed', () => {
    for (const seed of [1, SEED, 20260828]) {
      const result = generateOk(campaign('B1,1,2,3', 1), seed)
      const floors = result.levels.filter((l) => /^\d+$/.test(l.label))
      expect(floors, `seed ${seed}`).toHaveLength(3)
      for (const preview of floors) {
        expect(preview.rooms.some((r) => r.type === 'Entrance'), `seed ${seed}`).toBe(true)
        expect(preview.rooms.some((r) => r.type === 'Exit' || r.type === 'Orb'), `seed ${seed} floor ${preview.label}`).toBe(true)
      }
    }
  }, 90_000)

  it('the shipped campaign loads end to end', () => {
    const result = generateOk(defaultParameters(), SEED)
    expect(playOrder(result)).toHaveLength(result.files.filter((f) => f.path.endsWith('.lvl')).length)
  }, 90_000)
})

describe('level files — named by play order', () => {
  const params = campaign('L1,1,2,AB1,L2,AB2,3', 2, 2)
  const result = generateOk(params, SEED)
  const names = result.files
    .filter((f) => f.path.endsWith('.lvl'))
    .map((f) => f.path.slice(f.path.lastIndexOf('/') + 1))
    .sort()

  it('sorts the folder in play order and says what each level is', () => {
    expect(names).toEqual([
      '01_lobby1.lvl',
      '02_floor1.lvl',
      '03_floor2.lvl',
      '04_arena_boss1.lvl',
      '05_lobby2.lvl',
      '06_arena_boss2.lvl',
      '07_floor3.lvl'
    ])
  })

  it('keeps the StartIDs, and every exit names the file that answers its StartID', () => {
    for (const [stem, l] of levelsOf(result)) {
      for (const exit of scriptsOf(l, 'LevelExit')) {
        expect(stemOfPath(strParam(exit, 'Level')!), stem).toBe(strParam(exit, 'StartID'))
      }
    }
    expect(exitTargets(level(result, 'floor0'))).toContain('floor1')
  })

  it('starts the game on the 01_ file', () => {
    expect(fileOf(result, 'info.xml')!.content).toContain(`lvl="levels/${result.campaignName}/01_lobby1.lvl"`)
  })
}, 90_000)
