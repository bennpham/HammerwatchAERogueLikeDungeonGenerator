/**
 * A world: one open island, built by terrain rather than rooms and passages
 * (docs/plans/world-mode.md).
 *
 *   1. size, from the world's `layout` stream
 *   2. the island mask (`island.ts`), retried with fresh draws until clean
 *   3. ground, patches and water tiles; the cliff ring and its fence (`coast.ts`)
 *   4. the start at the center: the arrival and the portal frame
 *
 * Draws only from `ctx.worldRand`, three values up front — the seeds of this
 * world's `layout`, `scatter` and `encounters` streams — so a world never moves
 * a floor, an arena or another world, and changing how dense the scatter is
 * never moves an objective.
 *
 * Ids follow invariant 7: every object first, then the cliff pieces and the
 * fence, which nothing references.
 */

import type { GenerationContext } from '../core/context'
import { Rand } from '../core/rand'
import type { Gateway } from '../campaign'
import { AeLevel } from '../ae/model'
import { TileLayers } from '../ae/tiles'
import { emitObjects } from '../ae/emit'
import { tilesetSize } from '../catalog/assets'
import { Doodad } from '../objects/doodad'
import { ObjectSet, addArrival, buildExitRig } from '../objects/objectSet'
import { SensorShape } from '../objects/scriptNode'
import type { LevelPreview } from '../index'
import type { WorldDef } from './options'
import { biomeById, BIOME_DEFS } from './biomes'
import type { BiomeDef } from './biomes'
import { buildIsland } from './island'
import type { IslandMask } from './island'
import { coastFence, coastPiece, coastUnits } from './coast'
import { ValueNoise } from './noise'

/** Fresh islands tried before the world gives up. */
const MAX_WORLD_ATTEMPTS = 20

/** The portal: blue into a floor, lobby or world; red into a fight, as the lobbies do. */
const PORTAL_BLUE = 'doodads/generic/teleport_mt.unit'
const PORTAL_RED = 'doodads/generic/teleport_red.unit'

/** A world's map for the preview: one char per tile, row-major. */
export interface WorldPreview {
  /** '0' water, '1' land, '2' cliff, '3' trail, '4' solid scatter */
  map: string
  hub: { x: number; y: number }
  sites: Array<{ x: number; y: number; kind: 'button' | 'boss' | 'ambush' | 'loot' }>
}

/** A world's three streams, each seeded from one `ctx.worldRand` draw. */
export interface WorldStreams {
  layout: Rand
  scatter: Rand
  encounters: Rand
}

export function worldStreams(worldRand: Rand): WorldStreams {
  const seed = () => worldRand.nextInt(2147483647)
  return { layout: new Rand(seed()), scatter: new Rand(seed()), encounters: new Rand(seed()) }
}

/** Per-tile flags of a world under construction. */
export class WorldGrid {
  static readonly LAND = 1
  static readonly CLIFF = 2
  static readonly TRAIL = 4
  static readonly SOLID = 8
  static readonly RESERVED = 16

  readonly flags: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.flags = new Uint8Array(width * height)
  }

  has(x: number, y: number, flag: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && (this.flags[y * this.width + x] & flag) !== 0
  }

  set(x: number, y: number, flag: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.flags[y * this.width + x] |= flag
  }

  /** Land the party can stand on: not cliff, not under a solid prop. */
  walkable(x: number, y: number): boolean {
    return this.has(x, y, WorldGrid.LAND) && !this.has(x, y, WorldGrid.CLIFF) && !this.has(x, y, WorldGrid.SOLID)
  }
}

/**
 * Build world `def` for the slot `ctx` was just `enter`ed with. `gateway` is
 * where its portal leads (any kind but `orb` leads to `gateway.target`);
 * `nextIsFight` turns the portal red. Null when no clean island turned up in
 * `MAX_WORLD_ATTEMPTS` tries.
 */
export function buildWorld(
  ctx: GenerationContext,
  def: WorldDef,
  levelNumber: number,
  gateway: Gateway,
  nextIsFight: boolean
): { level: AeLevel; preview: LevelPreview } | null {
  const streams = worldStreams(ctx.worldRand)
  const biome = biomeById(def.biome) ?? BIOME_DEFS[0]
  const { layout } = streams
  const width = layout.iRand(def.minWidth, def.maxWidth + 1)
  const height = layout.iRand(def.minHeight, def.maxHeight + 1)

  for (let attempt = 0; attempt < MAX_WORLD_ATTEMPTS; attempt++) {
    ctx.clearLevel()
    const island = buildIsland(layout, width, height, def.waterMargin, def.coast)
    if (island === null) continue
    const grid = gridOf(island)
    const hub = { x: Math.floor(width / 2), y: Math.floor(height / 2) }

    // the start: the arrival just south of the portal
    addArrival(ctx, hub.x + 0.5, hub.y + 3)
    if (gateway.kind === 'orb') {
      ObjectSet.create(ctx, hub.x + 0.5, hub.y + 0.5, 'Orb', '')
    } else {
      Doodad.prop(ctx, hub.x + 0.5, hub.y + 0.5, nextIsFight ? PORTAL_RED : PORTAL_BLUE, {
        start: { kind: 'string', value: 'open' }
      })
      const sensor = new SensorShape(ctx, hub.x + 0.5, hub.y + 0.5)
      sensor.width = 3
      sensor.height = 3
      buildExitRig(ctx, sensor, gateway.target, hub.x, hub.y + 2)
    }
    reserveDisc(grid, hub, 4)

    const level = emitWorld(ctx, biome, island, grid, streams.scatter)
    return { level, preview: previewOf(ctx, grid, hub, levelNumber, biome, []) }
  }
  return null
}

function gridOf(island: IslandMask): WorldGrid {
  const grid = new WorldGrid(island.width, island.height)
  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < island.width && y < island.height && island.land[y * island.width + x] === 1
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      if (!isLand(x, y)) continue
      grid.set(x, y, WorldGrid.LAND)
      if (coastPiece(isLand, x, y) !== 'inland') grid.set(x, y, WorldGrid.CLIFF)
    }
  }
  return grid
}

/** Mark a disc of tiles reserved: no scatter, no pack, no tripwire. */
export function reserveDisc(grid: WorldGrid, at: { x: number; y: number }, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) grid.set(at.x + dx, at.y + dy, WorldGrid.RESERVED)
    }
  }
}

/** The finished island as an AE level: tiles, every placed object, then the cliffs and the fence. */
function emitWorld(ctx: GenerationContext, biome: BiomeDef, island: IslandMask, grid: WorldGrid, scatter: Rand): AeLevel {
  const { width, height } = island
  const level = new AeLevel(biome.environment)
  const layers = new TileLayers(tilesetSize)

  const land: Array<[number, number]> = []
  const water: Array<[number, number]> = []
  const trail: Array<[number, number]> = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.has(x, y, WorldGrid.LAND)) land.push([x, y])
      else water.push([x, y])
      if (grid.has(x, y, WorldGrid.TRAIL)) trail.push([x, y])
    }
  }
  // the ground grown a tile, so it reaches under the cliff lips
  layers.paint16(biome.ground, land, [1, 1, 1, 1])
  // patches: one noise field per tileset, never under a trail or a cliff
  biome.patches.forEach((tileset) => {
    const noise = new ValueNoise(scatter, width, height, 12, 2)
    const cells = land.filter(([x, y]) => !grid.has(x, y, WorldGrid.TRAIL | WorldGrid.CLIFF) && noise.at(x, y) > 0.62)
    if (cells.length > 0) layers.paint16(tileset, cells)
  })
  if (trail.length > 0) layers.paint16(biome.trail, trail)
  layers.paint16(biome.water, water)
  level.tileCells = layers.cells()

  emitObjects(level, ctx)
  for (const u of coastUnits(biome.edgeSet, width, height, island.land)) {
    level.units.push({ path: u.path, x: u.x, y: u.y, id: ctx.idCounter++ })
  }
  for (const u of coastFence(width, height, island.land)) {
    level.units.push({ ...u, id: ctx.idCounter++ })
  }
  return level
}

function previewOf(
  ctx: GenerationContext,
  grid: WorldGrid,
  hub: { x: number; y: number },
  levelNumber: number,
  biome: BiomeDef,
  sites: WorldPreview['sites']
): LevelPreview {
  let map = ''
  let walls = ''
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = !grid.has(x, y, WorldGrid.LAND)
        ? '0'
        : grid.has(x, y, WorldGrid.CLIFF)
          ? '2'
          : grid.has(x, y, WorldGrid.SOLID)
            ? '4'
            : grid.has(x, y, WorldGrid.TRAIL)
              ? '3'
              : '1'
      map += c
      walls += grid.walkable(x, y) ? '0' : '1'
    }
  }
  return {
    level: levelNumber,
    // generateDungeon relabels it with the slot's own label
    label: String(levelNumber + 1),
    theme: biome.id,
    mapWidth: grid.width,
    mapHeight: grid.height,
    rooms: [],
    passages: [],
    monsterCount: ctx.monsters.length,
    itemCount: ctx.items.length,
    walls,
    world: { map, hub, sites }
  }
}
