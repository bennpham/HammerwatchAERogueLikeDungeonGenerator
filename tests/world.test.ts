import { describe, expect, it } from 'vitest'
import {
  defaultParameters,
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
import { generateOk, levelsOf, lvlText, scriptsOf, stemsOf, unitsOf, withStemPathsText } from './ae'
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
    [{ portal: 'spin' as never }, 'portal'],
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
        smallWorld({ biome: 'desert', hub: 'camp', portal: 'appear', coast: 80, music: 'temple_hub' }),
        smallWorld({
          biome: 'snow',
          bossSelection: 'lineup',
          bossLineup: { boss_lich: 2 },
          trails: false,
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
        ...b.camp.extras
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
