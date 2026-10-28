/**
 * A world: one open island, built by terrain rather than rooms and passages
 * (docs/plans/world-mode.md).
 *
 *   1. size, then the island mask (`island.ts`), retried until clean
 *   2. the start at the center: kept clear, then the camp (`hub.ts`)
 *   3. the objective sites round it (`place.ts`) and the trails to them (`paths.ts`)
 *   4. the objectives and the way out (`objectives.ts`)
 *   5. packs and ambushes (`encounters.ts`), then the scatter (`scatter.ts`)
 *   6. the flood: every site and the arrival reachable, or the island is re-rolled
 *   7. loot on reachable ground, the timer and the music
 *   8. tiles, every object, then the cliffs and the fence (`coast.ts`)
 *
 * Draws only from `ctx.worldRand`: three values up front, the seeds of this
 * world's `layout`, `scatter` and `encounters` streams. So a world never moves
 * a floor, an arena or another world, and how dense the scatter is never moves
 * a site, a trail or a monster.
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
import { buildFloorHazardRig } from '../timer/hazard'
import { buildMusicRig } from '../music/rig'
import type { LevelPreview } from '../index'
import { worldBossCount } from '../config/parameters'
import type { WorldDef } from './options'
import { biomeById, BIOME_DEFS } from './biomes'
import type { BiomeDef } from './biomes'
import { buildIsland } from './island'
import type { IslandMask } from './island'
import { coastFence, coastPiece, coastUnits } from './coast'
import { ValueNoise } from './noise'
import { WorldGrid } from './grid'
import type { Tile } from './grid'
import { HUB_RADIUS, buildHub, resolveHub } from './hub'
import { SITE_RADIUS, placeSites } from './place'
import { carveTrails } from './paths'
import { buildObjectives } from './objectives'
import { buildEncounters, placeLoot } from './encounters'
import { scatterProps } from './scatter'

/** Fresh islands tried before the world gives up. */
const MAX_WORLD_ATTEMPTS = 20

/** A world's map for the preview. */
export interface WorldPreview {
  /** one char per tile, row-major: '0' water, '1' land, '2' cliff, '3' trail, '4' solid */
  map: string
  hub: Tile
  sites: Array<Tile & { kind: 'button' | 'boss' | 'ambush' | 'pack' | 'loot' | 'mystery' }>
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

/**
 * Build world `def` for the slot `ctx` was just `enter`ed with. `gateway` is
 * where its portal leads (anything but `orb` leads to `gateway.target`);
 * `nextIsFight` turns the portal red. Null when no island worked out in
 * `MAX_WORLD_ATTEMPTS` tries.
 */
export function buildWorld(
  ctx: GenerationContext,
  def: WorldDef,
  levelNumber: number,
  gateway: Gateway,
  nextIsFight: boolean
): { level: AeLevel; preview: LevelPreview } | null {
  const { layout, scatter, encounters } = worldStreams(ctx.worldRand)
  const biome = biomeById(def.biome) ?? BIOME_DEFS[0]
  const width = layout.iRand(def.minWidth, def.maxWidth + 1)
  const height = layout.iRand(def.minHeight, def.maxHeight + 1)
  const objectives = def.buttons + worldBossCount(def)

  for (let attempt = 0; attempt < MAX_WORLD_ATTEMPTS; attempt++) {
    ctx.clearLevel()
    const island = buildIsland(layout, width, height, def.waterMargin, def.coast)
    if (island === null) continue
    const grid = gridOf(island)
    const hub = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
    const arrival = { x: hub.x, y: hub.y + 3 }
    const hubKind = resolveHub(layout, def.hub)
    if (!grid.discAll(hub, HUB_RADIUS, (x, y) => grid.walkable(x, y))) continue
    grid.markDisc(hub, HUB_RADIUS, WorldGrid.RESERVED)

    const sites = placeSites(layout, grid, hub, objectives, def.safeRadius)
    if (sites === null) continue
    for (const s of sites) grid.markDisc(s, SITE_RADIUS, WorldGrid.RESERVED)
    buildHub(ctx, grid, biome, hubKind, hub)
    grid.markDisc(hub, 1, WorldGrid.SOLID)
    if (!carveTrails(layout, grid, arrival, sites, def.trails)) continue

    const placed = buildObjectives(ctx, encounters, grid, def, hub, sites, gateway, nextIsFight)
    const met = buildEncounters(ctx, encounters, grid, def, hub, sites, placed.plates, ctx.params.mysteryButtons ?? [])
    scatterProps(ctx, scatter, grid, biome, def.scatter)

    const reached = grid.reach(arrival)
    if (sites.some((s) => reached[s.y * width + s.x] !== 1)) continue
    const loot = placeLoot(ctx, encounters, grid, def, hub, reached, [...sites, ...met.packs, ...met.mystery])

    buildFloorHazardRig(ctx, def.timer, width, height)
    buildMusicRig(ctx, def.music, hub.x - 4, hub.y - 8)

    const level = emitWorld(ctx, biome, island, grid, scatter)
    const marks: WorldPreview['sites'] = [
      ...placed.bosses.map((t) => ({ ...t, kind: 'boss' as const })),
      ...placed.buttons.map((t) => ({ ...t, kind: 'button' as const })),
      ...met.ambushes.map((t) => ({ ...t, kind: 'ambush' as const })),
      ...met.packs.map((t) => ({ ...t, kind: 'pack' as const })),
      ...met.mystery.map((t) => ({ ...t, kind: 'mystery' as const })),
      ...loot.map((t) => ({ ...t, kind: 'loot' as const }))
    ]
    return { level, preview: previewOf(ctx, grid, hub, levelNumber, biome, marks) }
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
  for (const tileset of biome.patches) {
    const noise = new ValueNoise(scatter, width, height, 12, 2)
    const cells = land.filter(([x, y]) => !grid.has(x, y, WorldGrid.TRAIL | WorldGrid.CLIFF) && noise.at(x, y) > 0.62)
    if (cells.length > 0) layers.paint16(tileset, cells)
  }
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
  hub: Tile,
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
          : grid.has(x, y, WorldGrid.TRAIL)
            ? '3'
            : grid.has(x, y, WorldGrid.SOLID)
              ? '4'
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
