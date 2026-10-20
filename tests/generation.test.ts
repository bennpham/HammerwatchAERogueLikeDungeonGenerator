/**
 * End-to-end generation: what a campaign's files are, that every floor is
 * finishable and wired, and how the final-room lock and its buttons are built.
 * Everything is read back from the emitted AE levels.
 */
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_PRESETS, generateDungeon, defaultParameters, DungeonResult } from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import { plainParameters } from './params'
import { SEAL_SOUND } from '../src/generator/map/buttonSeal'
import { KEY_UNITS } from '../src/generator/objects/item'
import type { AeLevel, AeScript } from '../src/generator/ae/model'
import { allIds, idsParam, intParam, isWallPiece, levelsOf, scriptById, scriptsOf, sensorSizePx, stemOfPath, stemsOf, strParam, unitById } from './ae'

// The shipped campaign ends on an extra dungeon floor played AFTER the boss
// arena (see presets.ts), which moves the orb off the last generated floor.
// That is preset content; everything below is about the generator, so it
// builds on the neutral campaign instead.
function generateOk(seed: number, mutate?: (p: DungeonParameters) => void): DungeonResult {
  const params = plainParameters()
  mutate?.(params)
  const result = generateDungeon(params, seed)
  expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
  return result as DungeonResult
}

const TILE = 16
const BOSS_PLATE = 'doodads/doors/boss_door_button.unit'
const GOLD_KEY = KEY_UNITS[2]
const firedIds = (s: AeScript): number[] => s.connections.map(([id]) => id)

function floorOf(result: DungeonResult, i: number): AeLevel {
  const l = levelsOf(result).get(`floor${i}`)
  expect(l, `floor${i} missing`).toBeDefined()
  return l!
}

describe('generateDungeon', () => {
  it('produces one .lvl per level plus info.xml and the logo', () => {
    const result = generateOk(12345)
    const floors = plainParameters().levels
    // boss defaults on, so previews gain the arena beyond the numeric floors
    expect(result.levels).toHaveLength(floors + 1)
    const stems = stemsOf(result)
    for (let i = 0; i < floors; i++) expect(stems).toContain(`floor${i}`)
    expect(stems).toContain('boss0')
    for (const f of result.files.filter((file) => file.path.endsWith('.lvl'))) {
      // play position, then what the level is: 01_floor1, 04_arena_boss1, 01_lobby1
      expect(f.path).toMatch(new RegExp(`^levels/${result.campaignName}/\\d{2,}_(floor\\d+(_boss)?|arena_(boss|survival)\\d+|lobby\\d+)\\.lvl$`))
    }
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('info.xml')
    expect(paths).toContain('logos.png')
    expect(paths.some((p) => p.endsWith('.xml') && p !== 'info.xml'), 'no HW1 level or tweak XML').toBe(false)
    expect(result.campaignName).toBe('dungeon_12345')
  })

  it('is deterministic for a given seed', () => {
    const a = generateOk(777)
    const b = generateOk(777)
    expect(a.files).toEqual(b.files)
    expect(a.levels).toEqual(b.levels)
  })

  it('differs across seeds', () => {
    const a = generateOk(1)
    const b = generateOk(2)
    expect(floorOf(a, 0).tileCells).not.toEqual(floorOf(b, 0).tileCells)
  })

  it('keeps all rooms inside the map bounds', () => {
    const result = generateOk(2024)
    for (const level of result.levels) {
      for (const room of level.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0)
        expect(room.y).toBeGreaterThanOrEqual(0)
        expect(room.x + room.width).toBeLessThanOrEqual(level.mapWidth)
        expect(room.y + room.height).toBeLessThanOrEqual(level.mapHeight)
      }
      expect(level.walls.length).toBe(level.mapWidth * level.mapHeight)
    }
  })

  it('gives every floor an entrance, and an exit or the final orb', () => {
    const result = generateOk(555)
    const floors = result.levels.slice(0, plainParameters().levels)
    floors.forEach((level, i) => {
      const types = level.rooms.map((r) => r.type)
      expect(types).toContain('Entrance')
      expect(types).toContain(i < floors.length - 1 ? 'Exit' : 'Orb')
      expect(types).not.toContain('None')
    })
  })

  it('gives every unit and script a unique id on every level', () => {
    for (const [stem, level] of levelsOf(generateOk(31337))) {
      const ids = allIds(level)
      expect(new Set(ids).size, stem).toBe(ids.length)
    }
  })

  it('writes an AE level: a lighting environment, theme tiles, and every script link resolving', () => {
    for (const [stem, level] of levelsOf(generateOk(31337))) {
      expect(level.gameMode, stem).toBe('DungeonGameMode')
      expect(level.environment, stem).toMatch(/\.env$/)
      expect(level.tileCells.length, stem).toBeGreaterThan(0)
      const ids = new Set(allIds(level))
      for (const s of level.scripts) {
        for (const [id] of s.connections) expect(ids.has(id), `${stem} script ${s.id} -> ${id}`).toBe(true)
        for (const p of s.params) {
          if (p.kind === 'ids') for (const id of p.value) expect(ids.has(id), `${stem} ${s.cls}.${p.name} -> ${id}`).toBe(true)
        }
      }
    }
  })

  it('respects the level count parameter', () => {
    const result = generateOk(4242, (p) => {
      p.levels = 3
    })
    expect(result.levels).toHaveLength(4)
    expect(result.levels[2].rooms.map((r) => r.type)).toContain('Orb')
  })

  it('refuses invalid parameters with structured errors instead of throwing', () => {
    const params = defaultParameters()
    params.levels = 20 // themes list too short
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes('theme'))).toBe(true)
  })

  it('fails gracefully (no hang) when rooms cannot fit', () => {
    const params = defaultParameters()
    params.mapWidth = 40
    params.mapHeight = 40
    params.minRoomSize = 18
    params.maxRoomSize = 18
    params.minRoomCount = 40
    params.maxRoomCount = 40
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('Could not generate')
  })
})

describe('locked floors (levelLock)', () => {
  /** index of the gold tier in ItemType.Key / ItemType.Door */
  const GOLD = 2
  const finalFloorIndex = plainParameters().levels - 1
  const last = (r: DungeonResult) => floorOf(r, finalFloorIndex)
  const count = (l: AeLevel, path: string) => l.units.filter((u) => u.path === path).length

  it('touches nothing before the final floor', () => {
    const on = generateOk(4242)
    const off = generateOk(4242, (p) => (p.levelLock = undefined))
    expect(off.levels.slice(0, finalFloorIndex)).toEqual(on.levels.slice(0, finalFloorIndex))
    for (let i = 0; i < finalFloorIndex; i++) expect(floorOf(off, i)).toEqual(floorOf(on, i))
    expect(off.levels[finalFloorIndex].rooms.find((r) => r.type === 'Orb')?.locked).toBeFalsy()
  })

  it('locks the orb into a dead-end room on the final floor only', () => {
    for (const seed of [4, 555, 90210]) {
      const result = generateOk(seed)
      const orbRooms = result.levels[finalFloorIndex].rooms.filter((r) => r.type === 'Orb')
      expect(orbRooms).toHaveLength(1)
      expect(orbRooms[0].locked).toBe(true)
      for (const level of result.levels.slice(0, finalFloorIndex)) {
        expect(level.rooms.map((r) => r.type)).not.toContain('Orb')
      }
    }
  })

  it('never ships more gold doors than gold keys on the final floor', () => {
    let sawGoldDoor = false
    for (let seed = 1; seed <= 40; seed++) {
      const result = generateOk(seed)
      const goldSealed = result.levels[finalFloorIndex].rooms.filter((r) => r.lockTier === GOLD).length
      expect(count(last(result), GOLD_KEY), `seed ${seed}`).toBeGreaterThanOrEqual(goldSealed)
      if (goldSealed > 0) sawGoldDoor = true
    }
    expect(sawGoldDoor).toBe(true)
  }, 120_000)

  describe('the button seal', () => {
    it('gates the orb with one button: a one-shot press that animates the plate', () => {
      for (const seed of [4, 555, 90210]) {
        const result = generateOk(seed)
        const level = last(result)
        const orb = result.levels[finalFloorIndex].rooms.find((r) => r.type === 'Orb')!
        expect(orb.locked).toBe(true)
        expect(orb.sealed).toBe(true)
        expect(orb.lockTier).toBeNull()

        const plates = level.units.filter((u) => u.path === BOSS_PLATE)
        expect(plates).toHaveLength(1)
        expect(scriptsOf(level, 'PlaySound').map((s) => strParam(s, 'Sound'))).toContain(SEAL_SOUND)
        expect(scriptsOf(level, 'DestroyUnits')).toHaveLength(1)

        const press = scriptsOf(level, 'SetUnitScene')
        expect(press, `seed ${seed}`).toHaveLength(1)
        expect(strParam(press[0], 'State')).toBe('activate')
        expect(idsParam(press[0], 'Units')).toEqual([plates[0].id])

        const oneShot = scriptsOf(level, 'AreaTrigger').find((t) => t.triggerTimes === 1 && firedIds(t).includes(press[0].id))
        expect(oneShot, `seed ${seed}`).toBeDefined()
      }
    })

    it('destroys exactly the wall pieces it placed on the corridor, and no others', () => {
      for (const seed of [4, 555, 90210]) {
        const result = generateOk(seed)
        const level = last(result)
        const preview = result.levels[finalFloorIndex]
        // the wall pieces standing on corridor floor — vertical pieces anchor
        // one row up, so their cell is one row down
        const vertical = (path: string) => /\/v(_\d+)?\.unit$/.test(path)
        const cellOf = (u: { path: string; x: number; y: number }) =>
          Math.floor(u.x / TILE) + (Math.floor(u.y / TILE) + (vertical(u.path) ? 1 : 0)) * preview.mapWidth
        const onFloor = level.units
          // (the stairs art stands on its own reserved doorway cells, which read as open)
          .filter((u) => isWallPiece(u.path) && !/\/exit_(up|dn)\.unit$/.test(u.path) && preview.walls[cellOf(u)] === '0')
          .map((u) => u.id)
        const destroyed = idsParam(scriptsOf(level, 'DestroyUnits')[0], 'Units')
        expect(destroyed.length, `seed ${seed}`).toBeGreaterThan(0)
        expect([...destroyed].sort((a, b) => a - b), `seed ${seed}`).toEqual([...onFloor].sort((a, b) => a - b))
      }
    })

    it('presses on a one-tile sensor centred on the plate', () => {
      for (const seed of [4, 555, 90210]) {
        const level = last(generateOk(seed))
        const plate = level.units.find((u) => u.path === BOSS_PLATE)!
        const press = scriptsOf(level, 'SetUnitScene')[0]
        const trigger = scriptsOf(level, 'AreaTrigger').find((t) => firedIds(t).includes(press.id))!
        const sensor = unitById(level, idsParam(trigger, 'Areas')[0])!
        expect(sensorSizePx(sensor), `seed ${seed}`).toEqual([TILE, TILE])
        // boss_door_button is drawn from its top-left corner; the sensor sits on the cell centre
        expect(sensor.x - (Math.floor(plate.x / TILE) * TILE + TILE / 2), `seed ${seed}`).toBeCloseTo(0, 0)
        expect(sensor.y - (Math.floor(plate.y / TILE) * TILE + TILE / 2), `seed ${seed}`).toBeCloseTo(0, 0)
      }
    })
  })

  it('seals a stairs floor behind the blue teleport, pointing at the next floor', () => {
    const MIDDLE = 2
    for (const seed of [4, 555, 90210]) {
      const plain = generateOk(seed)
      const locked = generateOk(seed, (p) => {
        p.levelLock = p.levelLock!.map((l, i) => ({ enabled: l.enabled || i === MIDDLE }))
      })
      for (let i = 0; i < MIDDLE; i++) expect(floorOf(locked, i)).toEqual(floorOf(plain, i))
      const level = floorOf(locked, MIDDLE)
      expect(level.units.some((u) => u.path.endsWith('/exit_dn.unit')), 'no stairs').toBe(false)
      expect(count(level, 'doodads/generic/teleport_mt.unit')).toBe(1)
      expect(count(level, 'doodads/generic/teleport_red.unit')).toBe(0)
      expect(scriptsOf(level, 'LevelExit').map((s) => strParam(s, 'StartID'))).toContain(`floor${MIDDLE + 1}`)
      expect(count(level, BOSS_PLATE)).toBe(1)
      expect(scriptsOf(level, 'DestroyUnits')).toHaveLength(1)
      expect(locked.levels[MIDDLE].rooms.find((r) => r.type === 'Orb')!.sealed).toBe(true)
    }
  })

  describe('several buttons (issue #69 part 2)', () => {
    const withButtons = (n: number) => (p: DungeonParameters) => {
      p.levelLock = p.levelLock!.map((l, i) => (i === finalFloorIndex ? { enabled: true, buttons: n } : l))
    }

    it('needs every button: a countdown, a "remaining" line per press, the wall on the last', () => {
      for (const seed of [4, 555, 90210]) {
        const level = last(generateOk(seed, withButtons(3)))
        expect(count(level, BOSS_PLATE), `seed ${seed}`).toBe(3)

        const variables = scriptsOf(level, 'Variable')
        expect(variables).toHaveLength(1)
        expect(intParam(variables[0], 'Value')).toBe(3)
        const changes = scriptsOf(level, 'ChangeVariables')
        const checks = scriptsOf(level, 'CheckVariables')
        expect(changes).toHaveLength(3)
        expect(checks.map((c) => intParam(c, 'Value'))).toEqual([0, 1, 2])

        const destroy = scriptsOf(level, 'DestroyUnits')
        expect(destroy).toHaveLength(1)
        expect(idsParam(checks[0], 'OnTrue')).toContain(destroy[0].id)
        const textOf = (id: number) => strParam(scriptById(level, id)!, 'Text')
        expect(idsParam(checks[1], 'OnTrue').map(textOf)).toEqual(['1 button remains'])
        expect(idsParam(checks[2], 'OnTrue').map(textOf)).toEqual(['2 buttons remain'])

        const buttons = scriptsOf(level, 'AreaTrigger').filter((t) => changes.some((c) => firedIds(t).includes(c.id)))
        expect(buttons).toHaveLength(3)
        buttons.forEach((b, i) => {
          const to = firedIds(b)
          expect(to).toContain(changes[i].id)
          for (const c of checks) expect(to).toContain(c.id)
          expect(to.indexOf(changes[i].id)).toBeLessThan(to.indexOf(checks[0].id))
          expect(to).not.toContain(destroy[0].id)
        })
        expect(scriptsOf(level, 'PlaySound')).toHaveLength(3)
        expect(scriptsOf(level, 'SetUnitScene')).toHaveLength(3)
      }
    })

    it('keeps the buttons apart', () => {
      for (const seed of [4, 555, 90210]) {
        const at = last(generateOk(seed, withButtons(6)))
          .units.filter((u) => u.path === BOSS_PLATE)
          .map((u) => ({ x: u.x / TILE, y: u.y / TILE }))
        expect(at).toHaveLength(6)
        for (let i = 0; i < at.length; i++)
          for (let j = i + 1; j < at.length; j++)
            expect(Math.abs(at[i].x - at[j].x) >= 2 || Math.abs(at[i].y - at[j].y) >= 2, `seed ${seed}`).toBe(true)
      }
    })

    it('treats 0 buttons on a floor with no boss as no lock at all', () => {
      const unlocked = generateOk(555, (p) => (p.levelLock = undefined))
      const zero = generateOk(555, withButtons(0))
      expect(zero.files).toEqual(unlocked.files)
    })

    it('stores one button as the same floor it always was', () => {
      expect(generateOk(90210, withButtons(1)).files).toEqual(generateOk(90210).files)
    })
  })

  it('leaves an unlocked orb floor open', () => {
    const result = generateOk(555, (p) => (p.levelLock = undefined))
    const level = last(result)
    expect(count(level, BOSS_PLATE)).toBe(0)
    expect(scriptsOf(level, 'DestroyUnits')).toHaveLength(0)
    expect(result.levels[finalFloorIndex].rooms.find((r) => r.type === 'Orb')?.sealed).toBeFalsy()
  })

  it('still generates on a single-level campaign', () => {
    const result = generateOk(8, (p) => {
      p.levelLock = [{ enabled: true }]
      p.levels = 1
      p.themes = ['prison']
      p.levelMonsters = [['bat']]
    })
    const types = result.levels[0].rooms.map((r) => r.type)
    expect(types).toContain('Entrance')
    expect(types).toContain('Orb')
    expect(types).not.toContain('None')
  })
})

describe('dungeon floors — arrival', () => {
  it('gives every floor a LevelStart named for it, and the start floor the default spawn', () => {
    const result = generateOk(31337)
    for (const [stem, level] of levelsOf(result)) {
      const starts = scriptsOf(level, 'LevelStart')
      expect(starts.map((s) => strParam(s, 'StartID')), stem).toContain(stem)
      const defaults = starts.filter((s) => strParam(s, 'StartID') === undefined)
      expect(defaults, stem).toHaveLength(stem === 'floor0' ? 1 : 0)
    }
  })
})

describe('campaign level references — every exit lands somewhere', () => {
  /**
   * Every LevelExit names a level file the campaign ships and a StartID that
   * level defines, and info.xml starts on a shipped level. A dangling target
   * would strand the party at a door that does nothing.
   */
  function expectClosed(result: DungeonResult, label: string): void {
    const levels = levelsOf(result)
    const files = new Set(result.files.map((f) => f.path))
    for (const [stem, level] of levels) {
      for (const exit of scriptsOf(level, 'LevelExit')) {
        const path = strParam(exit, 'Level')!
        const start = strParam(exit, 'StartID')!
        expect(files.has(path), `${label}: ${stem} exits to missing ${path}`).toBe(true)
        // the file the exit names is the level that answers its StartID
        expect(stemOfPath(path), `${label}: ${stem}`).toBe(start)
        const target = levels.get(start)!
        expect(
          scriptsOf(target, 'LevelStart').some((s) => strParam(s, 'StartID') === start),
          `${label}: ${start} has no LevelStart for ${stem}'s exit`
        ).toBe(true)
      }
    }
    const info = result.files.find((f) => f.path === 'info.xml')!.content
    const startLvl = /lvl="([^"]+)"/.exec(info)?.[1]
    expect(startLvl && files.has(startLvl), `${label}: info.xml start`).toBe(true)
  }

  it('closes the neutral campaign', () => {
    expectClosed(generateOk(31337), 'neutral')
  })

  it('closes the shipped defaults (two lobbies, a fight, a post-boss floor)', () => {
    const result = generateDungeon(defaultParameters(), 31337)
    expect(result.ok).toBe(true)
    expectClosed(result as DungeonResult, 'defaults')
  }, 60_000)

  it('closes every preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const result = generateDungeon(preset.build(), 31337)
      expect(result.ok, preset.id).toBe(true)
      expectClosed(result as DungeonResult, preset.id)
    }
  }, 300_000)
})
