import { describe, expect, it } from 'vitest'
import {
  defaultParameters,
  mysteryStarterPool,
  generateDungeon,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters
} from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import {
  campaignOrder,
  normalizeOrder,
  parseSlotLabel,
  slotFileName,
  slotLabel,
  stemOfFileName,
  worldId
} from '../src/generator/campaign'
import { defaultWorld, worldList } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { BIOME_DEFS } from '../src/generator/world/biomes'
import { COAST_PIECE_NAMES, EDGE_SETS, coastPiece } from '../src/generator/world/coast'
import { buildIsland } from '../src/generator/world/island'
import { Rand } from '../src/generator/core/rand'
import { aeAssetExists } from '../src/generator/catalog/assets'
import {
  firedBy,
  generateOk,
  idsParam,
  intParam,
  levelsOf,
  lvlText,
  scriptsOf,
  stemsOf,
  strParam,
  textsOf,
  unitsOf,
  withStemPathsText
} from './ae'
import { floodFill } from '../src/generator/map/reachability'
import { PORTAL_TEXT } from '../src/generator/world/objectives'
import { MONSTER_THEMES, matchingTheme } from '../src/generator/world/monsterThemes'
import { WORLD_PRESETS } from '../src/generator/world/presets'
import { isKnownFloorPoolKey } from '../src/generator/objects/monsterTypes'
import { closureOf } from './closure'
import { aeAssetsDir } from './aeInstall'
import { plainParameters } from './params'

/** A small, fast world: 96 tiles square. */
function smallWorld(patch: Partial<WorldDef> = {}): WorldDef {
  return { ...defaultWorld(), minWidth: 96, maxWidth: 96, minHeight: 96, maxHeight: 96, buttons: 2, bossCount: 1, ...patch }
}

/** Three floors and one fight, plus `worlds` worlds — W1 first unless `order` says otherwise. */
function withWorlds(worlds: WorldDef[], order?: string): DungeonParameters {
  const p = plainParameters()
  p.levels = 3
  p.themes = p.themes.slice(0, 3)
  p.levelMonsters = p.levelMonsters.slice(0, 3)
  p.levelBuffs = p.levelBuffs?.slice(0, 3)
  p.levelTraps = p.levelTraps?.slice(0, 3)
  p.levelTimers = p.levelTimers?.slice(0, 3)
  p.floorMusic = p.floorMusic?.slice(0, 3)
  p.levelLock = p.levelLock?.slice(0, 3)
  p.world = { enabled: worlds.length > 0, worlds }
  if (order !== undefined) p.levelOrder = order.split(',').map((t) => parseSlotLabel(t)!)
  return p
}

describe('world slots in the campaign', () => {
  it('labels, names and parses a world slot', () => {
    const slot = { kind: 'world' as const, index: 1 }
    expect(slotLabel(slot)).toBe('W2')
    expect(parseSlotLabel('W2')).toEqual(slot)
    expect(parseSlotLabel('w2')).toEqual(slot)
    expect(slotFileName(slot, 3, 9)).toBe('04_world2')
    expect(stemOfFileName('04_world2')).toBe(worldId(1))
  })

  it('puts worlds after the lobbies and before the floors by default', () => {
    const order = campaignOrder({ levels: 2, fights: 1, lobbies: 1, worlds: 2 })
    expect(order.map((s) => slotLabel(s)).join(',')).toBe('L1,W1,W2,1,2,B1')
  })

  it('repairs an order that is missing a world or names one too many', () => {
    const counts = { levels: 2, fights: 0, lobbies: 0, worlds: 1 }
    expect(normalizeOrder([{ kind: 'floor', index: 0 }, { kind: 'floor', index: 1 }], counts).map((s) => slotLabel(s))).toEqual([
      '1',
      '2',
      'W1'
    ])
    expect(
      normalizeOrder([{ kind: 'world', index: 3 }, { kind: 'floor', index: 0 }, { kind: 'floor', index: 1 }, { kind: 'world', index: 0 }], counts).map(
        (s) => slotLabel(s)
      )
    ).toEqual(['1', '2', 'W1'])
  })

  it('reads no world while they are switched off', () => {
    expect(worldList(defaultParameters().world)).toEqual([])
    expect(worldList({ enabled: true, worlds: [smallWorld()] })).toHaveLength(1)
  })
})

describe('world validation', () => {
  const fieldsOf = (p: DungeonParameters) => validateParameters(p).errors.map((e) => e.field)

  it('accepts the default world', () => {
    expect(validateParameters(withWorlds([defaultWorld()])).errors).toEqual([])
  })

  it('rejects switching worlds on with none', () => {
    const p = withWorlds([])
    p.world = { enabled: true, worlds: [] }
    expect(fieldsOf(p)).toContain('world.worlds')
  })

  it.each<[Partial<WorldDef>, string]>([
    [{ biome: 'lava' }, 'biome'],
    [{ minWidth: 40 }, 'minWidth'],
    [{ maxWidth: 900 }, 'maxWidth'],
    [{ minWidth: 200, maxWidth: 150 }, 'minWidth'],
    [{ coast: 101 }, 'coast'],
    [{ waterMargin: 2 }, 'waterMargin'],
    [{ hub: 'castle' as never }, 'hub'],
    [{ buttons: -1 }, 'buttons'],
    [{ buttons: 0, bossCount: 0 }, 'buttons'],
    [{ buttons: 33 }, 'buttons'],
    [{ buttons: 20, minWidth: 96, maxWidth: 96, minHeight: 96, maxHeight: 96 }, 'buttons'],
    [{ bossPool: [] }, 'bossPool'],
    [{ bossPool: ['boss_dragon'] }, 'bossPool'],
    [{ bossSelection: 'lineup', bossLineup: { boss_queen: 1 } }, 'bossLineup'],
    [{ packs: 9999 }, 'packs'],
    [{ packSize: 0 }, 'packSize'],
    [{ safeRadius: 2 }, 'safeRadius'],
    [{ ambushes: -3 }, 'ambushes'],
    [{ ambushSize: 99 }, 'ambushSize'],
    [{ buttonAmbush: 150 }, 'buttonAmbush'],
    [{ loot: 1000 }, 'loot'],
    [{ scatter: -1 }, 'scatter'],
    [{ monsters: ['not_a_monster'] }, 'monsters'],
    [{ monsters: [] }, 'monsters'],
    [{ timer: { enabled: true, seconds: 5000, damage: 1, freqMs: 1000, countdown: true } }, 'timer.seconds'],
    [{ music: 'kazoo' }, 'music']
  ])('rejects %j on field %s', (patch, field) => {
    expect(fieldsOf(withWorlds([{ ...defaultWorld(), ...patch }]))).toContain(`world.worlds.0.${field}`)
  })

  it('warns, without blocking, about an island past the tested size', () => {
    const result = validateParameters(withWorlds([{ ...defaultWorld(), minWidth: 400, maxWidth: 400 }]))
    expect(result.errors).toEqual([])
    expect(result.warnings.map((w) => w.field)).toContain('world.worlds.0.maxWidth')
  })

  it('accepts a campaign of worlds alone: 0 floors and no arena', () => {
    const p = withWorlds([smallWorld()])
    p.levels = 0
    p.boss.enabled = false
    delete p.levelLock
    expect(validateParameters(p).errors).toEqual([])
    const result = generateOk(p, 2)
    expect(stemsOf(result)).toEqual(['world0'])
    // the world is the whole campaign, so it ends on the orb
    expect(scriptsOf(levelsOf(result).get('world0')!, 'ShowGameOver')).toHaveLength(1)
    // still refused with neither an arena nor a world
    p.world!.enabled = false
    expect(fieldsOf(p)).toContain('levels')
  })

  it('rejects an order that names a world the campaign does not have', () => {
    const p = withWorlds([smallWorld()], 'W1,1,2,3,B1')
    expect(fieldsOf(p)).toEqual([])
    p.world!.enabled = false
    expect(fieldsOf(p)).toContain('levelOrder')
  })
})

describe('world parameters.txt keys', () => {
  it('writes nothing for the default, switched-off world', () => {
    expect(serializeParametersTxt(defaultParameters())).not.toMatch(/^world/m)
  })

  it('round-trips every world field', () => {
    const p = withWorlds(
      [
        smallWorld({ biome: 'desert', hub: 'camp', coast: 80, music: 'temple_hub', mysteryPlates: 5, disguise: true, mysteryPool: [0, 2] }),
        smallWorld({
          biome: 'snow',
          bossSelection: 'lineup',
          bossLineup: { boss_lich: 2 },
          trails: true,
          timer: { enabled: true, seconds: 600, damage: 2, freqMs: 500, countdown: false },
          music: undefined
        })
      ],
      'W1,1,2,W2,3,B1'
    )
    const text = serializeParametersTxt(p)
    expect(text).toContain('world=1')
    expect(text).toContain('worlds=2')
    expect(text).toContain('levelOrder=W1,1,2,W2,3,AB1')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.world).toEqual(p.world)
    expect(parsed.params.levelOrder).toEqual(p.levelOrder)
  })

  it('reports a bad world value and keys past the count, never throwing', () => {
    const parsed = parseParametersTxt('world=1\r\nworlds=1\r\nworld0Hub=castle\r\nworld0Bogus=1\r\nworld3Biome=snow\r\n')
    expect(parsed.unknownKeys).toEqual(expect.arrayContaining(['world0Hub value "castle"', 'world0Bogus', 'world3Biome']))
    expect(parsed.params.world!.worlds).toHaveLength(1)
  })
})

describe('the island', () => {
  it('ships every cliff piece the coast can ask for, in every edge set a biome names', () => {
    for (const set of EDGE_SETS) {
      for (const piece of COAST_PIECE_NAMES) expect(aeAssetExists(`doodads/cliffs/${set}/${piece}.unit`), `${set}/${piece}`).toBe(true)
    }
    for (const b of BIOME_DEFS) expect(EDGE_SETS).toContain(b.edgeSet)
  })

  it('names only assets that exist, in every biome', () => {
    for (const b of BIOME_DEFS) {
      const paths = [
        b.ground,
        ...b.patches,
        b.trail,
        b.water,
        b.environment,
        ...b.clumps.map((s) => s.path),
        ...b.cover.map((s) => s.path),
        b.camp.tent,
        b.camp.fire,
        ...b.camp.extras,
        b.village.centre.path,
        ...b.village.tents.map((t) => t.path),
        ...b.village.props.map((p) => p.path)
      ]
      for (const path of paths) expect(aeAssetExists(path), `${b.id}: ${path}`).toBe(true)
    }
  })

  it('cleans every mask until each coast cell has a piece, water to the edge', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = new Rand(seed)
      const coast = (seed * 37) % 101
      const mask = buildIsland(rand, 96, 120, 6, coast)
      if (mask === null) continue
      const { width, height, land } = mask
      const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!isLand(x, y)) continue
          expect(coastPiece(isLand, x, y), `seed ${seed} at ${x},${y}`).not.toBeNull()
          expect(x >= 6 && y >= 6 && x < width - 6 && y < height - 6).toBe(true)
        }
      }
      // land at the center, under the start
      expect(isLand(48, 60)).toBe(true)
    }
  })
})

describe('monster themes', () => {
  it('names only known pool keys, and every theme validates on a world', () => {
    expect(MONSTER_THEMES.length).toBeGreaterThan(5)
    for (const theme of MONSTER_THEMES) {
      expect(theme.monsters.length, theme.id).toBeGreaterThan(0)
      for (const key of theme.monsters) expect(isKnownFloorPoolKey(key), `${theme.id}: ${key}`).toBe(true)
      expect(validateParameters(withWorlds([smallWorld({ monsters: [...theme.monsters] })])).errors, theme.id).toEqual([])
    }
  })

  it('recognises a pool as its theme in any order, and nothing else', () => {
    const act1 = MONSTER_THEMES.find((t) => t.id === 'castle_act1')!
    expect(matchingTheme([...act1.monsters].reverse())?.id).toBe('castle_act1')
    expect(matchingTheme([...act1.monsters, 'bat'])).toBeUndefined()
  })

  it('keeps towers, mini-bosses and bodyguards out of the mixed theme', () => {
    const mixed = MONSTER_THEMES.find((t) => t.id === 'mixed')!
    expect(mixed.monsters).toContain('mummy')
    expect(mixed.monsters).toContain('prison_warrior')
    expect(mixed.monsters.some((k) => k.startsWith('mb_') || k.startsWith('tower_') || k.includes('guard_'))).toBe(false)
  })
})

describe('a generated world', () => {
  it('builds one level per world, entered by its stem, linked into the campaign', () => {
    const result = generateOk(withWorlds([smallWorld(), smallWorld({ biome: 'woods' })], '1,W1,2,W2,3,B1'))
    expect(stemsOf(result)).toEqual(expect.arrayContaining(['world0', 'world1']))
    const w0 = levelsOf(result).get('world0')!
    // arrival under its own stem; the exit leads to floor 2
    expect(scriptsOf(w0, 'LevelStart').some((s) => s.params.some((p) => p.name === 'StartID' && p.value === 'world0'))).toBe(true)
    expect(lvlText(result, 'world0')).toContain('floor1')
    // the floor before it leads into it
    expect(lvlText(result, 'floor0')).toContain('world0')
    expect(result.levels.map((l) => l.label)).toEqual(['1', 'W1', '2', 'W2', '3', 'AB1'])
    expect(result.levels.find((l) => l.label === 'W1')!.world).toBeDefined()
  })

  it('is the same world for the same seed', () => {
    const p = withWorlds([smallWorld()])
    expect(lvlText(generateOk(p, 11), 'world0')).toBe(lvlText(generateOk(p, 11), 'world0'))
  })

  it('moves no floor and no arena when a world is added', () => {
    // after floor 2, whose stairs lead into it as they led into floor 3: every
    // slot keeps its kind of way out, and only floor 2's exit names a new stem.
    // The arrival banners count play position, so they are masked.
    const same = (text: string) => withStemPathsText(text).replace(/>Floor \d+</g, '>Floor N<')
    const without = generateOk(withWorlds([]), 5)
    const withOne = generateOk(withWorlds([smallWorld()], '1,2,W1,3,B1'), 5)
    for (const stem of ['floor0', 'floor2', 'boss0']) {
      expect(same(lvlText(withOne, stem)), stem).toBe(same(lvlText(without, stem)))
    }
  })

  it('ends the campaign on the orb when it comes last', () => {
    const result = generateOk(withWorlds([smallWorld()], '1,2,3,B1,W1'))
    const w0 = levelsOf(result).get('world0')!
    expect(unitsOf(w0, (u) => u.path.includes('collectable_10_sphere')).length).toBeGreaterThan(0)
    expect(scriptsOf(w0, 'ShowGameOver')).toHaveLength(1)
  })

  it('names only snapshot assets, and every cliff sits on the island', () => {
    for (const b of BIOME_DEFS) {
      const result = generateOk(withWorlds([smallWorld({ biome: b.id })]), 3)
      const w0 = levelsOf(result).get('world0')!
      for (const u of w0.units) expect(aeAssetExists(u.path), `${b.id}: ${u.path}`).toBe(true)
      expect(w0.environment).toBe(b.environment)
      expect(unitsOf(w0, (u) => u.path.startsWith(`doodads/cliffs/${b.edgeSet}/`)).length).toBeGreaterThan(20)
    }
  })

  it('gives every unit and script its own id', () => {
    const w0 = levelsOf(generateOk(withWorlds([smallWorld()]), 9)).get('world0')!
    const ids = [...w0.units.map((u) => u.id), ...w0.scripts.map((s) => s.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('fails cleanly rather than looping on an island too small for its margin', () => {
    const p = withWorlds([smallWorld({ waterMargin: 32, coast: 100 })])
    const r = generateDungeon(p, 1)
    expect(r.ok === true || r.errors.some((e) => /world 1/i.test(e))).toBe(true)
  })
})

describe('the objectives and the portal', () => {
  const worldOf = (def: WorldDef, order?: string, seed = 4) => levelsOf(generateOk(withWorlds([def], order), seed)).get('world0')!

  it('counts every button and boss down one variable, and opens the shut portal at zero', () => {
    const w0 = worldOf(smallWorld({ buttons: 3, bossCount: 1 }))
    const vars = scriptsOf(w0, 'Variable')
    expect(vars).toHaveLength(1)
    expect(intParam(vars[0], 'Value')).toBe(4)
    // the exit's use trigger ships off, and the zero branch switches it on
    const use = scriptsOf(w0, 'UseTrigger')
    expect(use).toHaveLength(1)
    expect(use[0].enabled).toBe(false)
    const enable = scriptsOf(w0, 'ToggleScripts').find((s) => idsParam(s, 'Scripts').includes(use[0].id))!
    expect(intParam(enable, 'State')).toBe(1)
    const zero = scriptsOf(w0, 'CheckVariables').find((s) => intParam(s, 'Value') === 0)!
    expect(idsParam(zero, 'OnTrue')).toContain(enable.id)
    expect(textsOf(w0)).toContain(PORTAL_TEXT)
  })

  it('wakes the empty frame by its scene', () => {
    const frame = worldOf(smallWorld())
    const shut = unitsOf(frame, (u) => u.path === 'doodads/generic/teleport_mt.unit')[0]
    expect(shut.state?.start).toEqual({ kind: 'string', value: 'closed' })
    expect(shut.state?.hidden).toBeUndefined()
    const scene = scriptsOf(frame, 'SetUnitScene').find((s) => idsParam(s, 'Units').includes(shut.id))!
    expect(strParam(scene, 'State')).toBe('open')
  })

  it('still reads a retired world<i>Portal line without complaint', () => {
    expect(parseParametersTxt('world=1\r\nworlds=1\r\nworld0Portal=appear\r\n').unknownKeys).toEqual([])
  })

  it('turns the portal red in front of a fight', () => {
    const w0 = worldOf(smallWorld(), '1,2,3,W1,B1')
    expect(unitsOf(w0, (u) => u.path === 'doodads/generic/teleport_red.unit')).toHaveLength(1)
  })

  it('hides the orb until the count reaches zero when it ends the campaign', () => {
    const w0 = worldOf(smallWorld(), '1,2,3,B1,W1')
    const orb = unitsOf(w0, (u) => u.path.includes('collectable_10_sphere'))[0]
    expect(orb.state?.hidden).toEqual({ kind: 'bool', value: true })
    const show = scriptsOf(w0, 'HideUnit').find((s) => idsParam(s, 'Units').includes(orb.id))!
    const zero = scriptsOf(w0, 'CheckVariables').find((s) => intParam(s, 'Value') === 0)!
    expect(idsParam(zero, 'OnTrue')).toContain(show.id)
    expect(scriptsOf(w0, 'UseTrigger')).toHaveLength(0)
  })

  it('places each boss with a death trigger, and its bar near it', () => {
    const w0 = worldOf(smallWorld({ buttons: 1, bossCount: 2, bossPool: ['boss_knight', 'boss_lich'] }))
    const watched = new Set(scriptsOf(w0, 'UnitDestroyedTrigger').flatMap((s) => idsParam(s, 'Units')))
    expect(unitsOf(w0, (u) => u.path.startsWith('actors/') && watched.has(u.id))).toHaveLength(2)
    expect(scriptsOf(w0, 'CreateBossBar')).toHaveLength(2)
  })

  it('reaches every site from the arrival, on every biome', () => {
    for (const b of BIOME_DEFS) {
      for (const seed of [1, 2, 3]) {
        const result = generateOk(withWorlds([smallWorld({ biome: b.id, buttons: 3, bossCount: 1, scatter: 100 })]), seed)
        const preview = result.levels.find((l) => l.world !== undefined)!
        const world = preview.world!
        const blocked = Uint8Array.from(preview.walls, (c) => (c === '1' ? 1 : 0))
        const reached = floodFill(blocked, preview.mapWidth, preview.mapHeight, { x: world.hub.x, y: world.hub.y + 3 })
        const objectives = world.sites.filter((s) => s.kind === 'button' || s.kind === 'boss')
        expect(objectives).toHaveLength(4)
        for (const s of objectives) expect(reached[s.y * preview.mapWidth + s.x], `${b.id} seed ${seed} ${s.kind}`).toBe(1)
      }
    }
  })
})

describe('the encounters', () => {
  const resultOf = (def: WorldDef, seed = 6) => generateOk(withWorlds([def]), seed)
  const sitesOf = (def: WorldDef, kind: string, seed = 6) =>
    resultOf(def, seed).levels.find((l) => l.world !== undefined)!.world!.sites.filter((s) => s.kind === kind)

  it('springs each ambush once, spawning its ring of monsters', () => {
    const w0 = levelsOf(resultOf(smallWorld({ ambushes: 3, ambushSize: 5, buttonAmbush: 0, safeRadius: 8 }))).get('world0')!
    const wires = scriptsOf(w0, 'AreaTrigger').filter((s) => firedBy(w0, s).some((f) => f.script.cls === 'SpawnUnit'))
    expect(wires.length).toBeGreaterThan(0)
    expect(wires.length).toBeLessThanOrEqual(3)
    for (const wire of wires) {
      expect(wire.triggerTimes).toBe(1)
      const spawns = firedBy(w0, wire).filter((f) => f.script.cls === 'SpawnUnit')
      expect(spawns.length).toBeGreaterThan(0)
      expect(spawns.length).toBeLessThanOrEqual(5)
      for (const s of spawns) expect(strParam(s.script, 'UnitType')).toMatch(/^actors\//)
    }
  })

  it('springs an ambush from every button at 100%, and none at 0%', () => {
    const plates = (chance: number) => {
      const w0 = levelsOf(resultOf(smallWorld({ ambushes: 0, buttonAmbush: chance, bossCount: 0, buttons: 3 }))).get('world0')!
      return scriptsOf(w0, 'AreaTrigger')
        .filter((s) => firedBy(w0, s).some((f) => f.script.cls === 'SetUnitScene'))
        .map((s) => firedBy(w0, s).filter((f) => f.script.cls === 'SpawnUnit').length)
    }
    expect(plates(100)).toHaveLength(3)
    expect(plates(100).every((n) => n > 0)).toBe(true)
    expect(plates(0).every((n) => n === 0)).toBe(true)
  })

  it('keeps the sites where they were whatever the scatter, the packs or the ambushes', () => {
    const base = smallWorld()
    const where = (def: WorldDef) => JSON.stringify([sitesOf(def, 'button'), sitesOf(def, 'boss')])
    expect(where({ ...base, scatter: 0 })).toBe(where({ ...base, scatter: 100 }))
    expect(where({ ...base, ambushes: 0 })).toBe(where({ ...base, ambushes: 12 }))
    expect(where({ ...base, packs: 0 })).toBe(where({ ...base, packs: 60 }))
  })

  it('keeps the packs where they were whatever the scatter', () => {
    const base = smallWorld({ packs: 10 })
    expect(sitesOf({ ...base, scatter: 0 }, 'pack')).toEqual(sitesOf({ ...base, scatter: 100 }, 'pack'))
  })

  it('adds the timer only when it is on', () => {
    const off = levelsOf(resultOf(smallWorld())).get('world0')!
    expect(scriptsOf(off, 'DangerArea')).toHaveLength(0)
    const timer = { enabled: true, seconds: 30, damage: 1, freqMs: 1000, countdown: true }
    const on = levelsOf(resultOf(smallWorld({ timer }))).get('world0')!
    expect(scriptsOf(on, 'DangerArea')).toHaveLength(1)
  })

  it.skipIf(aeAssetsDir() === null)('keeps the party on the island: the cliffs and the fence close every coast', () => {
    for (const b of BIOME_DEFS) {
      // first, so its arrival is the campaign's default spawn the closure walks from
      const result = generateOk(withWorlds([smallWorld({ biome: b.id })], 'W1,1,2,3,B1'), 8)
      const level = levelsOf(result).get('world0')!
      const preview = result.levels.find((l) => l.world !== undefined)!
      const box = { x0: 0, y0: 0, x1: preview.mapWidth * 16, y1: preview.mapHeight * 16 }
      const closure = closureOf(level, box, aeAssetsDir()!)
      expect(closure.leak, b.id).toBeNull()
      expect(closure.reachesExit, b.id).toBe(true)
      expect(closure.area, b.id).toBeGreaterThan(100_000)
    }
  })

  it('paints no trail by default, and only when asked', () => {
    const trailTiles = (trails: boolean) => {
      const text = lvlText(resultOf(smallWorld({ trails })), 'world0')
      return text.includes(BIOME_DEFS[0].trail)
    }
    expect(defaultWorld().trails).toBe(false)
    expect(trailTiles(false)).toBe(false)
    expect(trailTiles(true)).toBe(true)
  })

  it('pitches the camp only when asked', () => {
    const tents = (hub: WorldDef['hub']) =>
      unitsOf(levelsOf(resultOf(smallWorld({ hub }))).get('world0')!, (u) => u.path.includes('tent_')).length
    expect(tents('camp')).toBe(1)
    expect(tents('bare')).toBe(0)
  })
})

describe('the village start', () => {
  const village = (patch: Partial<WorldDef> = {}) =>
    smallWorld({ minWidth: 160, maxWidth: 160, minHeight: 160, maxHeight: 160, hub: 'village', ...patch })

  it("rings the portal with the biome's tents and market, and every site stays reachable", () => {
    for (const seed of [1, 2, 3]) {
      const result = generateOk(withWorlds([village()]), seed)
      const w0 = levelsOf(result).get('world0')!
      expect(unitsOf(w0, (u) => u.path.includes('tent_')).length, `seed ${seed}`).toBeGreaterThan(4)
      expect(unitsOf(w0, (u) => u.path === BIOME_DEFS[0].village.centre.path), `seed ${seed}`).toHaveLength(1)
      const preview = result.levels.find((l) => l.world !== undefined)!
      const blocked = Uint8Array.from(preview.walls, (c) => (c === '1' ? 1 : 0))
      const hub = preview.world!.hub
      const reached = floodFill(blocked, preview.mapWidth, preview.mapHeight, { x: hub.x, y: hub.y + 3 })
      for (const s of preview.world!.sites.filter((s) => s.kind === 'button' || s.kind === 'boss')) {
        expect(reached[s.y * preview.mapWidth + s.x], `seed ${seed} ${s.kind}`).toBe(1)
      }
    }
  })

  it('refuses a village on an island too small for one', () => {
    const fields = validateParameters(withWorlds([smallWorld({ hub: 'village' })])).errors.map((e) => e.field)
    expect(fields).toContain('world.worlds.0.hub')
    expect(validateParameters(withWorlds([village()])).errors).toEqual([])
  })

  it.skipIf(aeAssetsDir() === null)('keeps the party on the island with a village too', () => {
    const result = generateOk(withWorlds([village()], 'W1,1,2,3,B1'), 4)
    const level = levelsOf(result).get('world0')!
    const preview = result.levels.find((l) => l.world !== undefined)!
    const closure = closureOf(level, { x0: 0, y0: 0, x1: preview.mapWidth * 16, y1: preview.mapHeight * 16 }, aeAssetsDir()!)
    expect(closure.leak).toBeNull()
    expect(closure.reachesExit).toBe(true)
  })
})

describe('world presets', () => {
  it('each validates and generates on the default world, with the starter pool where it needs one', () => {
    for (const preset of WORLD_PRESETS) {
      const p = withWorlds([{ ...defaultWorld(), ...preset.patch }])
      if (preset.needsMysteryPool) p.mysteryButtons = mysteryStarterPool()
      expect(validateParameters(p).errors, preset.id).toEqual([])
      expect(generateDungeon(p, 3).ok, preset.id).toBe(true)
      // the flag is honest: a preset without it scatters no plates
      if (!preset.needsMysteryPool) expect(preset.patch.mysteryPlates ?? 0, preset.id).toBe(0)
    }
  })

  it('makes the treasure hunt a hunt: disguised buttons among many plates', () => {
    const hunt = WORLD_PRESETS.find((p) => p.id === 'treasure_hunt')!
    expect(hunt.patch.disguise).toBe(true)
    expect(hunt.patch.mysteryPlates!).toBeGreaterThan(hunt.patch.buttons!)
  })
})

describe('ambush types', () => {
  const spawnsOf = (def: WorldDef) => {
    const w0 = levelsOf(generateOk(withWorlds([def]), 6)).get('world0')!
    const wires = scriptsOf(w0, 'AreaTrigger').filter((s) => firedBy(w0, s).some((f) => f.script.cls === 'SpawnUnit'))
    return wires.map((wire) => firedBy(w0, wire).filter((f) => f.script.cls === 'SpawnUnit').map((f) => strParam(f.script, 'UnitType')!))
  }
  const base = smallWorld({ ambushes: 3, buttonAmbush: 0, safeRadius: 8 })

  it('springs exactly one type\'s monsters per ambush', () => {
    const types = [{ weight: 1, monsters: [{ monster: 'mummy', count: 3 }, { monster: 'scorpion', count: 2 }] }]
    const rings = spawnsOf({ ...base, ambushTypes: types })
    expect(rings.length).toBeGreaterThan(0)
    for (const ring of rings) {
      expect(ring).toHaveLength(5)
      expect(ring.filter((p) => p.includes('mummy'))).toHaveLength(3)
    }
  })

  it('needs no monster pool when every ambush is a type', () => {
    const def = { ...base, packs: 0, monsters: [], ambushTypes: [{ weight: 2, monsters: [{ monster: 'bat', count: 4 }] }] }
    expect(validateParameters(withWorlds([def])).errors).toEqual([])
    // and without types the empty pool is refused
    expect(validateParameters(withWorlds([{ ...def, ambushTypes: [] }])).errors.map((e) => e.field)).toContain('world.worlds.0.monsters')
  })

  it('refuses a bad weight, an unknown monster or a type with none', () => {
    const fields = (ambushTypes: WorldDef['ambushTypes']) =>
      validateParameters(withWorlds([{ ...base, ambushTypes }])).errors.map((e) => e.field)
    expect(fields([{ weight: 0, monsters: [{ monster: 'bat', count: 1 }] }])).toContain('world.worlds.0.ambushTypes.0.weight')
    expect(fields([{ weight: 1, monsters: [{ monster: 'dragon_of_doom', count: 1 }] }])).toContain('world.worlds.0.ambushTypes.0.monsters.0.monster')
    expect(fields([{ weight: 1, monsters: [] }])).toContain('world.worlds.0.ambushTypes.0.monsters')
  })

  it('round-trips through parameters.txt', () => {
    const p = withWorlds([{ ...base, ambushTypes: [{ weight: 3, monsters: [{ monster: 'mummy', count: 2 }] }, { weight: 1, monsters: [{ monster: 'bat', count: 6 }] }] }])
    const text = serializeParametersTxt(p)
    expect(text).toContain('world0AmbushType1=3|mummy:2')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.world).toEqual(p.world)
  })
})

describe('mystery plates and the treasure hunt', () => {
  const PLATE = 'doodads/generic/button_round.unit'
  /** The campaign with the starter mystery pool and one world. */
  const withPool = (def: WorldDef) => {
    const p = withWorlds([def])
    p.mysteryButtons = mysteryStarterPool()
    return p
  }
  const worldOf = (p: DungeonParameters, seed = 6) => levelsOf(generateOk(p, seed)).get('world0')!

  it('scatters plates that each fire a pool button once, apart from the portal count', () => {
    const w0 = worldOf(withPool(smallWorld({ mysteryPlates: 4, ambushes: 0, buttonAmbush: 0 })))
    const plates = unitsOf(w0, (u) => u.path === PLATE)
    expect(plates.length).toBeGreaterThan(0)
    expect(plates.length).toBeLessThanOrEqual(4)
    for (const plate of plates) {
      const press = scriptsOf(w0, 'SetUnitScene').find((s) => idsParam(s, 'Units').includes(plate.id))!
      expect(strParam(press, 'State')).toBe('on')
      const trigger = scriptsOf(w0, 'AreaTrigger').find((s) => s.connections.some(([id]) => id === press.id))!
      expect(trigger.triggerTimes).toBe(1)
    }
    // the portal still counts only the buttons and the boss
    expect(intParam(scriptsOf(w0, 'Variable')[0], 'Value')).toBe(3)
  })

  it('places nothing and draws nothing new with plates off', () => {
    const off = smallWorld({ mysteryPlates: 0, disguise: false })
    expect(unitsOf(worldOf(withPool(off)), (u) => u.path === PLATE)).toHaveLength(0)
    // a world with no pool and no plates is byte-identical to one with a pool it never uses
    expect(lvlText(generateOk(withWorlds([off]), 6), 'world0')).toBe(lvlText(generateOk(withPool(off), 6), 'world0'))
  })

  it('disguises the real buttons as mystery plates, still counting toward the portal', () => {
    const w0 = worldOf(withPool(smallWorld({ disguise: true, mysteryPlates: 0, bossCount: 0, buttons: 3 })))
    expect(unitsOf(w0, (u) => u.path === 'doodads/doors/boss_door_button.unit')).toHaveLength(0)
    const plates = unitsOf(w0, (u) => u.path === PLATE)
    expect(plates).toHaveLength(3)
    expect(intParam(scriptsOf(w0, 'Variable')[0], 'Value')).toBe(3)
    // each real button also fires a pool button: its trigger does more than click and count
    const triggers = plates.map((plate) => {
      const press = scriptsOf(w0, 'SetUnitScene').find((s) => idsParam(s, 'Units').includes(plate.id))!
      return scriptsOf(w0, 'AreaTrigger').find((s) => s.connections.some(([id]) => id === press.id))!
    })
    expect(triggers.some((t) => firedBy(w0, t).some((f) => f.script.cls === 'SpawnUnit' || f.script.cls === 'AnnounceText'))).toBe(true)
  })

  it('keeps the plain plate art without disguise', () => {
    const w0 = worldOf(withPool(smallWorld({ disguise: false, bossCount: 0, buttons: 2 })))
    expect(unitsOf(w0, (u) => u.path === 'doodads/doors/boss_door_button.unit')).toHaveLength(2)
  })

  it('draws only from the pool buttons the world picks', () => {
    const p = withPool(smallWorld({ mysteryPlates: 6, mysteryPool: [0] }))
    expect(validateParameters(p).errors).toEqual([])
    const w0 = worldOf(p)
    const first = p.mysteryButtons![0]
    for (const text of textsOf(w0).filter((t) => t !== PORTAL_TEXT && !/objective/.test(t) && !t.startsWith('.meta'))) {
      expect(text).toBe(first.text)
    }
  })

  it('refuses plates with an empty pool, or a pool index past its end', () => {
    const fields = (p: DungeonParameters) => validateParameters(p).errors.map((e) => e.field)
    expect(fields(withWorlds([smallWorld({ mysteryPlates: 3 })]))).toContain('world.worlds.0.mysteryPlates')
    expect(fields(withPool(smallWorld({ mysteryPlates: 3, mysteryPool: [99] })))).toContain('world.worlds.0.mysteryPool')
    expect(fields(withPool(smallWorld({ mysteryPlates: 999 })))).toContain('world.worlds.0.mysteryPlates')
  })

  it('leaves the floors\' own mystery plates as they were', () => {
    const p = withPool(smallWorld({ mysteryPlates: 4, disguise: true }))
    p.levelMystery = [{ count: 2, pool: [0, 1] }, { count: 0, pool: [] }, { count: 0, pool: [] }]
    // the same campaign with the world's plates and disguise off: only the world changes
    const without = { ...p, world: { enabled: true, worlds: [{ ...p.world!.worlds[0], mysteryPlates: 0, disguise: false }] } }
    for (const stem of ['floor0', 'floor1', 'floor2']) {
      expect(lvlText(generateOk(p, 4), stem), stem).toBe(lvlText(generateOk(without, 4), stem))
    }
  })
})
