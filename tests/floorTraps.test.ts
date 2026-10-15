/**
 * Traps on ordinary dungeon floors (src/generator/traps/floor.ts).
 *
 * Three things are being proved here.
 *
 * First, invariant 2 and the fourth stream: an untrapped floor must be
 * byte-identical to what the generator produced before the feature existed, the
 * rig must not touch ANY stream when it has nothing to place, and — the whole
 * reason `ctx.trapRand` exists — arming one floor must leave every other floor's
 * dungeon untouched.
 *
 * Second, the rig: spewers, live from load, with no tier wiring at all. The
 * arena's copy has triggers and toggles; a copy-paste of that would be wrong
 * here, so its absence is asserted rather than assumed.
 *
 * Third, placement. `boss/traps.ts` earned its constants in playtest and every
 * one of them is re-checked against a room wall: tile centres, the north wall's
 * art overhang, the margins, the spacing, the passage mouths, the prefab
 * footprints and the rooms that are skipped whole.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_TRAP_COUNT,
  TRAP_FAST_SPAWN_RATE_MS,
  TRAP_SPREAD_MAX,
  defaultFloorTraps,
  defaultParameters
} from '../src/generator/config/parameters'
import type { FloorTrap, TrapDirection } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { generateDungeon, withGatewayLocks } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { Level } from '../src/generator/map/level'
import { buildFloorTrapRig, floorTrapCapacity } from '../src/generator/traps/floor'
import { TILE_CENTRE, TRAP_MIN_SPACING, TRAP_WALL_MARGIN } from '../src/generator/traps/slots'
import { overhangRows } from '../src/generator/map/reachability'
import { NodeProjectileSpewer } from '../src/generator/objects/nodes'
import { projectileById } from '../src/generator/objects/projectileTypes'
import { SPEWER_DIRECTION, SPREAD_DEGREES_PER_UNIT } from '../src/generator/traps/slots'
import type { AeLevel, AeScript } from '../src/generator/ae/model'
import { changedScripts, intParam as aeInt, levelsOf, placements, scriptsOf, strParam } from './ae'
import { plainParameters } from './params'

const SEED = 4242

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

/**
 * Stock parameters with every optional layer off, so the file list is just the
 * dungeon floors. Same isolation discipline as floorTimer.test.ts.
 */
function bareParams(floors = 3): DungeonParameters {
  const params = plainParameters()
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelTimers = undefined
  params.levelTraps = Array.from({ length: floors }, () => defaultFloorTraps())
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

function trapRow(patch: Partial<FloorTrap> = {}): FloorTrap {
  return { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 4, ...patch }
}

/** `bareParams()` with floor `index` carrying `rows`. */
function withTrapsOn(index: number, ...rows: FloorTrap[]): DungeonParameters {
  const params = bareParams()
  const traps = params.levelTraps as FloorTrap[][]
  traps[index] = rows
  return params
}

function floor(result: DungeonResult, index: number): AeLevel {
  const l = levelsOf(result).get(`floor${index}`)
  expect(l, `floor${index} missing`).toBeDefined()
  return l!
}

function spewers(level: AeLevel): AeScript[] {
  return scriptsOf(level, 'ProjectileSpewer')
}

/**
 * Builds one real floor in isolation and hands back everything a placement
 * assertion needs — the finished Level, the context that built it, and the
 * spewers the rig then placed on it.
 */
function buildFloor(
  params: DungeonParameters,
  seed: number,
  rows: FloorTrap[] | undefined,
  levelIndex = 0
): { ctx: GenerationContext; level: Level; placed: NodeProjectileSpewer[] } {
  const ctx = new GenerationContext(params, seed)
  ctx.gateway = { kind: 'orb' }

  let level: Level | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new Level(ctx, levelIndex)
    if (candidate.levelValid) {
      level = candidate
      break
    }
    ctx.clearLevel()
  }
  expect(level, `no valid level at seed ${seed}`).not.toBeNull()

  const before = ctx.scriptNodes.length
  buildFloorTrapRig(ctx, rows, level as Level)
  const placed = ctx.scriptNodes
    .slice(before)
    .filter((n): n is NodeProjectileSpewer => n instanceof NodeProjectileSpewer)

  return { ctx, level: level as Level, placed }
}

/** The next `count` values of each stream, without disturbing a live context. */
function streamProbe(params: DungeonParameters, seed: number, count = 12): Record<string, number[]> {
  const ctx = new GenerationContext(params, seed)
  const take = (r: { iRand: (a: number, b: number) => number }): number[] =>
    Array.from({ length: count }, () => r.iRand(0, 1_000_000))
  return {
    rand: take(ctx.rand),
    cosmeticRand: take(ctx.cosmeticRand),
    bossRand: take(ctx.bossRand),
    trapRand: take(ctx.trapRand)
  }
}

describe('floor traps — off means off', () => {
  it('every list empty is byte-identical to no levelTraps at all, across seeds', () => {
    for (const seed of [1, 4242, 987654]) {
      const empty = generateOk(bareParams(), seed)
      const absent = bareParams()
      absent.levelTraps = undefined
      const none = generateOk(absent, seed)

      expect(empty.files).toEqual(none.files)
      expect(empty.levels).toEqual(none.levels)
    }
  })

  it('an untrapped floor emits no ProjectileSpewer node', () => {
    const result = generateOk(bareParams(), SEED)
    for (let i = 0; i < 3; i++) expect(spewers(floor(result, i))).toHaveLength(0)
  })

  it('draws from no stream at all when there is nothing to place', () => {
    const params = bareParams()

    for (const rows of [
      undefined,
      [] as FloorTrap[],
      [trapRow({ projectile: 'not_a_projectile' })],
      [trapRow({ count: 0 })],
      [trapRow({ projectile: 'not_a_projectile' }), trapRow({ count: -3 })]
    ]) {
      const control = buildFloor(params, SEED, undefined)
      const subject = buildFloor(params, SEED, rows)

      expect(subject.placed).toHaveLength(0)
      expect(subject.ctx.idCounter).toBe(control.ctx.idCounter)
      expect(subject.ctx.scriptNodes.length).toBe(control.ctx.scriptNodes.length)

      // The four streams must be exactly where the control left them.
      for (const stream of ['rand', 'cosmeticRand', 'bossRand', 'trapRand'] as const) {
        const a = Array.from({ length: 8 }, () => control.ctx[stream].iRand(0, 1_000_000))
        const b = Array.from({ length: 8 }, () => subject.ctx[stream].iRand(0, 1_000_000))
        expect(b, `${stream} moved for ${JSON.stringify(rows)}`).toEqual(a)
      }
    }
  })
})

describe('floor traps — the fourth stream keeps them additive', () => {
  it('trapRand is a distinct stream and draining it moves no other', () => {
    const params = bareParams()
    const base = streamProbe(params, SEED)

    expect(base.trapRand).not.toEqual(base.rand)
    expect(base.trapRand).not.toEqual(base.cosmeticRand)
    expect(base.trapRand).not.toEqual(base.bossRand)

    const ctx = new GenerationContext(params, SEED)
    for (let i = 0; i < 1000; i++) ctx.trapRand.iRand(0, 97)
    expect(Array.from({ length: 12 }, () => ctx.rand.iRand(0, 1_000_000))).toEqual(base.rand)
    expect(Array.from({ length: 12 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))).toEqual(base.cosmeticRand)
    expect(Array.from({ length: 12 }, () => ctx.bossRand.iRand(0, 1_000_000))).toEqual(base.bossRand)
  })

  it('arming one floor leaves every other floor identical', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withTrapsOn(1, trapRow({ count: 6 })), SEED)

    expect(floor(on, 0)).toEqual(floor(off, 0))
    expect(floor(on, 2)).toEqual(floor(off, 2))
    // Preview geometry is identical on ALL floors, the armed one included:
    // script nodes are not geometry.
    expect(on.levels).toEqual(off.levels)
  })

  it('on the armed floor only scripts are added — nothing else moves', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withTrapsOn(1, trapRow({ count: 6 })), SEED)

    const before = floor(off, 1)
    const after = floor(on, 1)

    expect(after.tileCells).toEqual(before.tileCells)
    expect(after.environment).toEqual(before.environment)
    expect(placements(after)).toEqual(placements(before))
    expect(changedScripts(before, after)).toEqual([])
    expect(after.scripts.length - before.scripts.length).toBe(spewers(after).length)
  })

  it('traps on an early floor do not move a later floor at all', () => {
    // The load-bearing one. On ctx.rand this would be false: floor 0's extra
    // draws would shift floor 1's entire layout.
    const none = generateOk(bareParams(), SEED)
    const early = generateOk(withTrapsOn(0, trapRow({ count: 8 })), SEED)

    expect(floor(early, 1)).toEqual(floor(none, 1))
    expect(floor(early, 2)).toEqual(floor(none, 2))
  })

  it('is deterministic', () => {
    const params = withTrapsOn(1, trapRow({ count: 5 }), trapRow({ direction: 'left', count: 3 }))
    expect(generateOk(params, SEED).files).toEqual(generateOk(params, SEED).files)
  })

  it('a different seed moves the positions, not the count', () => {
    const params = withTrapsOn(1, trapRow({ count: 5 }))
    const a = spewers(floor(generateOk(params, 11), 1))
    const b = spewers(floor(generateOk(params, 22), 1))

    expect(a).toHaveLength(5)
    expect(b).toHaveLength(5)
    expect(a.map((n) => `${n.x},${n.y}`)).not.toEqual(b.map((n) => `${n.x},${n.y}`))
  })
})

describe('floor traps — emission shape', () => {
  it('places one spewer per copy, carrying the row settings', () => {
    const row = trapRow({ projectile: 'shooter_spike', direction: 'left', spread: 1.5, spawnRateMs: 250, count: 3 })
    const nodes = spewers(floor(generateOk(withTrapsOn(1, row), SEED), 1))

    expect(nodes).toHaveLength(3)
    for (const n of nodes) {
      expect(strParam(n, 'Projectile')).toBe(projectileById('shooter_spike')!.path)
      // AE Spread is in degrees: 45 per remake unit
      expect(aeInt(n, 'Spread')).toBeCloseTo(1.5 * SPREAD_DEGREES_PER_UNIT, 6)
      expect(aeInt(n, 'Frequency')).toBe(250)
      // AE Direction is in degrees, 180 = west
      expect(aeInt(n, 'Direction')).toBe(180)
      expect(n.triggerTimes).toBe(-1)
    }
  })

  it('every spewer arrives enabled — a floor has nothing to switch it on', () => {
    const nodes = spewers(floor(generateOk(withTrapsOn(1, trapRow({ count: 4 })), SEED), 1))
    expect(nodes).toHaveLength(4)
    for (const n of nodes) expect(n.enabled).toBe(true)
  })

  it('emits no tier wiring at all', () => {
    // The arena's rig switches tiers with health triggers + ToggleScripts.
    // A floor has no tiers, so a copy-paste of that wiring would be a bug.
    const off = floor(generateOk(bareParams(), SEED), 1)
    const on = floor(generateOk(withTrapsOn(1, trapRow({ count: 4 })), SEED), 1)

    for (const cls of ['ActorHealthTrigger', 'ScriptLink', 'ToggleScripts']) {
      expect(scriptsOf(on, cls).length, cls).toBe(scriptsOf(off, cls).length)
    }
  })

  it('maps all four directions to AE degrees', () => {
    const expected: Record<TrapDirection, number> = { up: 270, down: 90, left: 180, right: 0 }
    expect(SPEWER_DIRECTION).toEqual(expected)
    for (const direction of ['up', 'down', 'left', 'right'] as TrapDirection[]) {
      const nodes = spewers(floor(generateOk(withTrapsOn(1, trapRow({ direction, count: 2 })), SEED), 1))
      expect(nodes.length, `nothing placed firing ${direction}`).toBeGreaterThan(0)
      for (const n of nodes) expect(aeInt(n, 'Direction')).toBe(expected[direction])
    }
  })

  it('two rows on one wall mix ammunition without sharing a tile', () => {
    const params = withTrapsOn(
      1,
      trapRow({ projectile: 'shooter_arrow', count: 3 }),
      trapRow({ projectile: 'shooter_fireball', count: 3 })
    )
    const nodes = spewers(floor(generateOk(params, SEED), 1))

    expect(nodes).toHaveLength(6)
    const paths = nodes.map((n) => strParam(n, 'Projectile'))
    expect(paths.filter((pth) => pth === projectileById('shooter_arrow')!.path)).toHaveLength(3)
    expect(paths.filter((pth) => pth === projectileById('shooter_fireball')!.path)).toHaveLength(3)

    const tiles = nodes.map((n) => `${n.x},${n.y}`)
    expect(new Set(tiles).size).toBe(6)
  })

  it('skips an unknown projectile and still places its sibling row', () => {
    // validateParameters rejects such a row outright, so this is the rig's own
    // belt and braces rather than a path generateDungeon can reach: a generator
    // that crashes on bad input is the bug the port exists to fix.
    const { placed } = buildFloor(bareParams(), SEED, [
      trapRow({ projectile: 'not_a_projectile', count: 5 }),
      trapRow({ count: 2 })
    ])
    expect(placed).toHaveLength(2)
  })

})

describe('floor traps — placement', () => {
  const DIRECTIONS: TrapDirection[] = ['up', 'down', 'left', 'right']

  /** Every spewer placed at `seed`, paired with the room it should be on. */
  function sweep(params: DungeonParameters, seed: number, rows: FloorTrap[]) {
    const { ctx, level, placed } = buildFloor(params, seed, rows)
    return { ctx, level, placed }
  }

  it('emits tile centres, never integer corners', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { placed } = sweep(bareParams(), seed, DIRECTIONS.map((direction) => trapRow({ direction, count: 6 })))
      for (const node of placed) {
        expect(node.x - Math.floor(node.x)).toBeCloseTo(TILE_CENTRE, 9)
        expect(node.y - Math.floor(node.y)).toBeCloseTo(TILE_CENTRE, 9)
      }
    }
  })

  it('stands on the correct wall line of an eligible room, inside the margins', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const direction of DIRECTIONS) {
        const { level, placed } = sweep(bareParams(), seed, [trapRow({ direction, count: 8 })])

        for (const node of placed) {
          const x = node.x - TILE_CENTRE
          const y = node.y - TILE_CENTRE
          const room = level.rooms.find((r) => r.contains(x, y))
          expect(room, `spewer at ${x},${y} is in no room`).toBeDefined()
          if (room === undefined) continue

          const overhang = overhangRows(room.theme)
          if (direction === 'up') {
            expect(y).toBe(room.y + room.height)
            expect(x).toBeGreaterThanOrEqual(room.x + TRAP_WALL_MARGIN)
            expect(x).toBeLessThanOrEqual(room.x + room.width - TRAP_WALL_MARGIN)
          } else if (direction === 'down') {
            expect(y).toBe(room.y + overhang)
            expect(x).toBeGreaterThanOrEqual(room.x + TRAP_WALL_MARGIN)
            expect(x).toBeLessThanOrEqual(room.x + room.width - TRAP_WALL_MARGIN)
          } else if (direction === 'left') {
            expect(x).toBe(room.x + room.width)
            expect(y).toBeGreaterThanOrEqual(room.y + Math.max(TRAP_WALL_MARGIN, overhang))
            expect(y).toBeLessThanOrEqual(room.y + room.height - TRAP_WALL_MARGIN)
          } else {
            expect(x).toBe(room.x)
            expect(y).toBeGreaterThanOrEqual(room.y + Math.max(TRAP_WALL_MARGIN, overhang))
            expect(y).toBeLessThanOrEqual(room.y + room.height - TRAP_WALL_MARGIN)
          }
        }
      }
    }
  })

  it('uses row 0 for a down trap on every theme — AE walls have no overhang', () => {
    const themes = ['prison', 'cave_desert', 'bonus1']
    for (const t of themes) expect(overhangRows(t)).toBe(0)

    for (let seed = 0; seed < 25; seed++) {
      for (const theme of themes) {
        const params = bareParams()
        params.themes = params.themes.map(() => theme)
        const { level, placed } = sweep(params, seed, [trapRow({ direction: 'down', count: 8 })])
        for (const node of placed) {
          const x = node.x - TILE_CENTRE
          const y = node.y - TILE_CENTRE
          const room = level.rooms.find((r) => r.contains(x, y))
          expect(room).toBeDefined()
          if (room !== undefined) expect(y).toBe(room.y)
        }
      }
    }
  })

  it('stands on this room\'s floor, off prefab walls, with a solid band outside it', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const direction of DIRECTIONS) {
        const { ctx, level, placed } = sweep(bareParams(), seed, [trapRow({ direction, count: 8 })])
        const vertical = direction === 'left' || direction === 'right'

        for (const node of placed) {
          const x = node.x - TILE_CENTRE
          const y = node.y - TILE_CENTRE
          const roomIndex = level.rooms.findIndex((r) => r.contains(x, y))
          expect(roomIndex).toBeGreaterThanOrEqual(0)
          const room = level.rooms[roomIndex]

          // The band is the room's own edge ring, NOT one step out from the
          // slot: a `down` trap stands `overhangRows` tiles clear of its band,
          // with ordinary room floor in between.
          const band =
            direction === 'up'
              ? room.y + room.height + 1
              : direction === 'down'
                ? room.y - 1
                : direction === 'left'
                  ? room.x + room.width + 1
                  : room.x - 1
          const slot = vertical ? x : y
          const step = band < slot ? 1 : -1

          for (let offset = -TRAP_WALL_MARGIN; offset <= TRAP_WALL_MARGIN; offset++) {
            const along = (vertical ? y : x) + offset

            const bx = vertical ? band : along
            const by = vertical ? along : band
            expect(level.tileArray[bx + by * level.width].wall, `open band at ${bx},${by}`).toBe(true)
            for (const set of ctx.objectSets) {
              expect(set.contains(bx, by) || set.containsWall(bx, by)).toBe(false)
            }

            // Every tile from the room edge in to the slot is this room's floor.
            for (let depth = band + step; ; depth += step) {
              const px = vertical ? depth : along
              const py = vertical ? along : depth
              const idx = px + py * level.width

              expect(level.tileArray[idx].wall, `wall at ${px},${py}`).toBe(false)
              expect(level.tileArray[idx].reserved, `reserved at ${px},${py}`).toBe(false)
              expect(level.regionMap[idx]).toBe(roomIndex)
              for (const set of ctx.objectSets) {
                expect(set.contains(px, py) || set.containsWall(px, py)).toBe(false)
              }

              if (depth === slot) break
            }
          }
        }
      }
    }
  })

  it('the band rule matches the geometric passage test', () => {
    // Proves the one grid read is equivalent to walking the passages, which is
    // the reason floor.ts does not walk them. Note this is asserted on the BAND
    // tile, not on the slot: a passage's last cells legitimately lie inside the
    // room it arrives at, so a passage overlapping the slot line says nothing —
    // what makes a doorway a doorway is the hole it punches in the band.
    for (let seed = 0; seed < 40; seed++) {
      for (const direction of DIRECTIONS) {
        const { level, placed } = sweep(bareParams(), seed, [trapRow({ direction, count: 8 })])
        const vertical = direction === 'left' || direction === 'right'

        for (const node of placed) {
          const x = node.x - TILE_CENTRE
          const y = node.y - TILE_CENTRE
          const room = level.rooms.find((r) => r.contains(x, y))
          expect(room).toBeDefined()
          if (room === undefined) continue

          const band =
            direction === 'up'
              ? room.y + room.height + 1
              : direction === 'down'
                ? room.y - 1
                : direction === 'left'
                  ? room.x + room.width + 1
                  : room.x - 1

          for (let offset = -TRAP_WALL_MARGIN; offset <= TRAP_WALL_MARGIN; offset++) {
            const along = (vertical ? y : x) + offset
            const px = vertical ? band : along
            const py = vertical ? along : band
            for (const passage of level.passageList) {
              expect(passage.contains(px, py), `passage through the band at ${px},${py}`).toBe(false)
            }
          }
        }
      }
    }
  })

  it('never traps the entrance, the shop or the sealed room — but may trap a vault', () => {
    let sawVault = false

    for (let seed = 0; seed < 60; seed++) {
      const params = bareParams()
      withGatewayLocks(params)
      const { level, placed } = sweep(params, seed, DIRECTIONS.map((direction) => trapRow({ direction, count: 6 })))

      for (const node of placed) {
        const room = level.rooms.find((r) => r.contains(node.x - TILE_CENTRE, node.y - TILE_CENTRE))
        expect(room).toBeDefined()
        if (room === undefined) continue
        expect(room.type).not.toBe('Entrance')
        expect(room.type).not.toBe('Shop')
        expect(room.sealed).toBe(false)
        if (room.locked) sawVault = true
      }
    }

    // The allowance has to be live, not accidentally dead.
    expect(sawVault, 'no seed ever trapped a locked room').toBe(true)
  })

  it('keeps TRAP_MIN_SPACING between two spewers on the same wall of the same room', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { level, placed } = sweep(bareParams(), seed, [trapRow({ count: MAX_TRAP_COUNT })])

      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const ax = placed[i].x - TILE_CENTRE
          const ay = placed[i].y - TILE_CENTRE
          const bx = placed[j].x - TILE_CENTRE
          const by = placed[j].y - TILE_CENTRE
          const roomA = level.rooms.findIndex((r) => r.contains(ax, ay))
          const roomB = level.rooms.findIndex((r) => r.contains(bx, by))
          if (roomA !== roomB) continue
          expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBeGreaterThanOrEqual(TRAP_MIN_SPACING)
        }
      }
    }
  })

  it('shares one pool per direction across rows, so no two spewers stack', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { placed } = sweep(bareParams(), seed, [
        trapRow({ count: 6 }),
        trapRow({ projectile: 'shooter_spike', count: 6 }),
        trapRow({ projectile: 'shooter_fireball', count: 6 })
      ])
      const tiles = placed.map((n) => `${n.x},${n.y}`)
      expect(new Set(tiles).size).toBe(tiles.length)
    }
  })

  it('runs a pool dry gracefully, drawing once per PLACED spewer', () => {
    const params = bareParams()
    params.minRoomCount = 2
    params.maxRoomCount = 3
    params.minRoomSize = 7
    params.maxRoomSize = 8
    params.maxPassageWidth = 4

    const control = buildFloor(params, SEED, undefined)
    const { placed, ctx } = buildFloor(params, SEED, [trapRow({ count: MAX_TRAP_COUNT })])

    expect(placed.length).toBeLessThan(MAX_TRAP_COUNT)

    // Exactly `placed.length` draws were made — no draw is spent on a copy the
    // dry pool could not place. Replaying that many on the untouched control's
    // stream must land it exactly where the subject's stream now is.
    for (let i = 0; i < placed.length; i++) control.ctx.trapRand.iRand(0, 1_000_000)
    const a = Array.from({ length: 6 }, () => control.ctx.trapRand.iRand(0, 1_000_000))
    const b = Array.from({ length: 6 }, () => ctx.trapRand.iRand(0, 1_000_000))
    expect(b).toEqual(a)
  })

  it('never exceeds what floorTrapCapacity promises for the smallest floor', () => {
    const params = bareParams()
    for (const direction of DIRECTIONS) {
      const capacity = floorTrapCapacity(params, direction)
      expect(capacity).toBeGreaterThan(0)
      for (let seed = 0; seed < 20; seed++) {
        const { placed } = buildFloor(params, seed, [trapRow({ direction, count: MAX_TRAP_COUNT })])
        // The estimate is for the SMALLEST rollable floor, so a real one holds
        // at least as many; what must never happen is placing more than asked.
        expect(placed.length).toBeLessThanOrEqual(MAX_TRAP_COUNT)
      }
    }
  })
})

describe('floor traps — a trapped floor is still finishable', () => {
  it('generates with every floor trapped and the final room sealed', () => {
    for (const seed of [1, 77, 4242, 987654]) {
      const params = bareParams()
      withGatewayLocks(params)
      params.levelTraps = Array.from({ length: params.levels }, () => [
        trapRow({ count: 8 }),
        trapRow({ direction: 'down', count: 8 }),
        trapRow({ direction: 'left', count: 8 }),
        trapRow({ direction: 'right', count: 8 })
      ])
      // Script nodes carry no collision, so reachability and the seal check
      // cannot see them — but the rig runs after both, so this is what proves
      // that ordering is actually safe.
      generateOk(params, seed)
    }
  })
})

describe('floor traps — validation', () => {
  function issues(mutate: (p: DungeonParameters) => void) {
    const params = bareParams()
    mutate(params)
    return validateParameters(params)
  }

  it('accepts the stock parameters with no trap complaint', () => {
    const result = validateParameters(defaultParameters())
    expect(result.valid).toBe(true)
    expect([...result.errors, ...result.warnings].filter((i) => i.field.startsWith('levelTraps'))).toEqual([])
  })

  it('rejects an unknown projectile', () => {
    const r = issues((p) => ((p.levelTraps as FloorTrap[][])[1] = [trapRow({ projectile: 'nope' })]))
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.field === 'levelTraps.1.0.projectile')).toBe(true)
  })

  it('rejects a bad direction', () => {
    const r = issues(
      (p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ direction: 'sideways' as TrapDirection })])
    )
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.field === 'levelTraps.0.0.direction')).toBe(true)
  })

  it('rejects a spread outside 0..TRAP_SPREAD_MAX', () => {
    for (const spread of [-0.5, TRAP_SPREAD_MAX + 0.1, Number.NaN]) {
      const r = issues((p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ spread })]))
      expect(r.errors.some((e) => e.field === 'levelTraps.0.0.spread')).toBe(true)
    }
  })

  it('rejects a non-integer or sub-1 spawn rate', () => {
    for (const spawnRateMs of [0, -10, 12.5]) {
      const r = issues((p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ spawnRateMs })]))
      expect(r.errors.some((e) => e.field === 'levelTraps.0.0.spawnRateMs')).toBe(true)
    }
  })

  it('rejects a count below 1, but never for being too large', () => {
    for (const count of [0, -1, 2.5]) {
      const r = issues((p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ count })]))
      expect(r.errors.some((e) => e.field === 'levelTraps.0.0.count')).toBe(true)
    }
    // Unlike a boss tier's wall, a floor's pool spans the whole floor and has
    // no comparable ceiling — a very large count just runs the pool dry.
    const r = issues((p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ count: MAX_TRAP_COUNT * 10 })]))
    expect(r.errors.some((e) => e.field === 'levelTraps.0.0.count')).toBe(false)
  })

  it('warns, without blocking, below the fast spawn rate', () => {
    const r = issues(
      (p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ spawnRateMs: TRAP_FAST_SPAWN_RATE_MS - 1 })])
    )
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.field === 'levelTraps.0.0.spawnRateMs')).toBe(true)
  })

  it('warns about entries past the floor count', () => {
    const r = issues((p) => {
      const traps = p.levelTraps as FloorTrap[][]
      traps[0] = [trapRow()]
      traps.push([], [], [])
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.field === 'levelTraps')).toBe(true)
  })

  it('warns when a direction is asked for more traps than the floor can hold', () => {
    const params = bareParams()
    const capacity = floorTrapCapacity(params, 'up')

    const under = issues((p) => ((p.levelTraps as FloorTrap[][])[0] = [trapRow({ count: capacity })]))
    expect(under.warnings.some((w) => w.field === 'levelTraps.0')).toBe(false)

    const over = issues((p) => {
      ;(p.levelTraps as FloorTrap[][])[0] = [trapRow({ count: capacity }), trapRow({ count: 1 })]
    })
    expect(over.valid).toBe(true)
    expect(over.warnings.some((w) => w.field === 'levelTraps.0')).toBe(true)
  })

  it('stays quiet when every floor is empty', () => {
    const r = validateParameters(bareParams())
    expect([...r.errors, ...r.warnings].filter((i) => i.field.startsWith('levelTraps'))).toEqual([])
  })
})
