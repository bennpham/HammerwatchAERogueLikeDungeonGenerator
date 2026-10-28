/**
 * The World tab's parameters: the open islands a campaign can carry, each its
 * own `world` slot in `levelOrder` (`W1`, `W2`, …). The plan is
 * `docs/plans/world-mode.md`.
 *
 * Kept out of config/parameters.ts, which only hangs `world: WorldOptions` on
 * `DungeonParameters`. Everything here is plain data, read through the helpers
 * below ("absent means default", the same discipline `arenaMode()` enforces).
 */

import type { BossSelection, FloorTimer } from '../config/parameters'
import type { BossId } from '../boss/bosses'

/** How a world's start looks. `random` picks `camp` or `bare` from the world's own layout stream. */
export const WORLD_HUBS = ['random', 'camp', 'bare'] as const
export type WorldHub = (typeof WORLD_HUBS)[number]


/** Size bounds, in tiles. Above the warning size, load time and frame rate are unverified. */
export const WORLD_MIN_SIZE = 96
export const WORLD_MAX_SIZE = 512
export const WORLD_WARN_SIZE = 384

/** Water between the coast and the map edge, in tiles. */
export const WORLD_MIN_MARGIN = 4
export const WORLD_MAX_MARGIN = 32

/** Bounds on each count; validation enforces them. */
export const WORLD_MAX_BUTTONS = 32
export const WORLD_MAX_PACKS = 400
export const WORLD_MAX_GROUP = 30
export const WORLD_MAX_AMBUSHES = 100
export const WORLD_MAX_LOOT = 100
export const WORLD_MIN_SAFE_RADIUS = 8
export const WORLD_MAX_SAFE_RADIUS = 64
/** A world timer emits one node per second; this keeps the level under ~2000 of them. */
export const WORLD_MAX_TIMER_SECONDS = 1800

/**
 * Tiles kept between two objective sites. With the island's rough area this
 * bounds how many sites fit (`worldSiteCapacity`).
 */
export const WORLD_SITE_SPACING = 20

/** One open island. Sizes in tiles; percentages 0–100. */
export interface WorldDef {
  /** A `world/biomes.ts` id: the ground, scatter, cliffs and camp the island is built from. */
  biome: string
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  /** How ragged the coastline is, 0 (a smooth blob) to 100. */
  coast: number
  /** Water between the coast and the map edge, in tiles. */
  waterMargin: number
  hub: WorldHub
  /** Floor buttons to press; each counts toward the portal. */
  buttons: number
  /** Bosses to kill; each counts toward the portal. Ignored in `lineup` mode. */
  bossCount: number
  /** Bosses a site may roll, a subset of `MOBILE_BOSS_IDS`. */
  bossPool: string[]
  /** Absent means `random`, read through `bossSelection()`. */
  bossSelection?: BossSelection
  bossLineup?: Partial<Record<BossId, number>>
  /** Pool keys for packs and ambushes, the same grammar as a floor's `levelMonsters` pool. */
  monsters: string[]
  /** Roaming packs placed on the island. */
  packs: number
  /** Most monsters in one pack. */
  packSize: number
  /** No pack, ambush or objective closer than this to the start, in tiles. */
  safeRadius: number
  /** Ambush tripwires: walking over one spawns monsters around the party. */
  ambushes: number
  /** Monsters one ambush spawns. */
  ambushSize: number
  /** Chance, in percent, that a floor button also springs an ambush. */
  buttonAmbush: number
  /** Loot caches placed on the island. */
  loot: number
  /** Dirt trails from the start to every site. */
  trails: boolean
  /** How dense trees, rocks and bushes grow, 0–100. */
  scatter: number
  /** A countdown, then a whole-island hazard, like a floor's timer. */
  timer?: FloorTimer
  /** A `music/tracks.ts` id; absent plays nothing new. */
  music?: string
}

/**
 * The worlds a campaign carries. `enabled: false` reproduces the campaign
 * without worlds byte for byte: the worlds draw only from `ctx.worldRand`.
 * Like `boss`, the list is kept while switched off, so the tab remembers it.
 */
export interface WorldOptions {
  enabled: boolean
  worlds: WorldDef[]
}

/** A fresh world: a medium grass island with four buttons and one boss. */
export function defaultWorld(): WorldDef {
  return {
    biome: 'grass',
    minWidth: 192,
    maxWidth: 192,
    minHeight: 192,
    maxHeight: 192,
    coast: 50,
    waterMargin: 8,
    hub: 'random',
    buttons: 4,
    bossCount: 1,
    bossPool: ['boss_knight', 'boss_lich', 'boss_golem', 'boss_warden', 'boss_vampire'],
    monsters: ['bat', 'tick', 'maggot', 'flower_small', 'slime', 'skeleton_warrior', 'skeleton_archer'],
    packs: 30,
    packSize: 6,
    safeRadius: 20,
    ambushes: 8,
    ambushSize: 6,
    buttonAmbush: 50,
    loot: 8,
    trails: true,
    scatter: 50,
    music: 'act1'
  }
}

/** Off, holding one default world, so the tab has something to switch on. */
export function defaultWorldOptions(): WorldOptions {
  return { enabled: false, worlds: [defaultWorld()] }
}

/** The worlds a campaign will actually build: none when switched off or absent. */
export function worldList(world: WorldOptions | undefined): WorldDef[] {
  if (world === undefined || !world.enabled) return []
  return world.worlds ?? []
}

/**
 * How many objective sites a world of this size can hold, roughly: the
 * island covers about half the area inside the water margin, and each site
 * needs a `WORLD_SITE_SPACING` square. The start takes one.
 */
export function worldSiteCapacity(width: number, height: number, margin: number): number {
  const land = Math.max(0, width - 2 * margin) * Math.max(0, height - 2 * margin) * 0.5
  return Math.max(0, Math.floor(land / (WORLD_SITE_SPACING * WORLD_SITE_SPACING)) - 1)
}
