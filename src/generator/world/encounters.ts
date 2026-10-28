/**
 * What lurks on a world's island, none of which counts toward the portal:
 *
 * - roaming packs: groups of actors from the world's pool, placed outright.
 *   An actor only updates while a player is within its range (300 px by
 *   default), so a pack across the island sleeps until the party comes near.
 * - ambush tripwires: a sensor across a trail; the first player through it
 *   springs a ring of `SpawnUnit`s round it, each aggroed on the spot. The
 *   HW1 mansion `test_yard` level's pattern, in AE's nodes.
 * - the same ring on a floor button, at `buttonAmbush` percent.
 * - mystery plates: a plate that fires a button from the campaign's mystery
 *   pool (`mystery/rig.ts`'s `emitPayload`): loot, monsters, a line of text,
 *   or nothing. With `disguise` on, the real portal buttons fire one too.
 * - loot caches: a cluster of coins.
 *
 * Draws only from the world's encounter stream. A pool key resolves the way a
 * floor's does (`Monster.resolveFloorPoolEntry`): a family picks a member, a
 * pinned key its tier, anything else rolls its ladder — here from this stream,
 * never `ctx.rand` (`Monster.createRolled` would move every dungeon seed).
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Item } from '../objects/item'
import { Monster } from '../objects/monster'
import type { MonsterTypeDef } from '../objects/monsterTypes'
import { isKnownMonsterKey, resolveActorPath } from '../objects/monsterTypes'
import { pick } from './scatter'
import { SensorShape } from '../objects/scriptNode'
import type { ScriptNode } from '../objects/scriptNode'
import { Doodad } from '../objects/doodad'
import { NodeAreaTrigger, NodeChangeDoodadState, NodePlaySound, NodeSpawnObject } from '../objects/nodes'
import type { MysteryButton } from '../config/parameters'
import { MYSTERY_ANNOUNCE_TYPE, MYSTERY_BUTTON_STATE, emitPayload } from '../mystery/rig'
import { SEAL_SOUND } from '../map/buttonSeal'
import type { WorldAmbushType, WorldDef } from './options'
import { worldMysteryPool } from './options'
import type { Tile } from './grid'
import { WorldGrid, dist2 } from './grid'
import { freeTile } from './place'

/** Stock's "trap sprung" cue. */
export const AMBUSH_SOUND = 'event:/SFX/UI/puzzle/puzzle_fail'
/** Tiles from the tripwire to the ring the ambush springs from. */
const AMBUSH_RING = 5
/** The tripwire's square, in tiles. */
const TRIPWIRE_SIZE = 4
const PACK_SPACING = 10
const AMBUSH_SPACING = 12
const PLACE_TRIES = 400
/** The mystery plates' art: the floors' own plate (`TriggerButton`), centred on its tile. */
export const MYSTERY_PLATE = 'doodads/generic/button_round.unit'
const MYSTERY_SPACING = 10
/** How far round a plate its loot and monsters may land, in tiles. */
const PAYLOAD_REACH = 6

export interface WorldEncounters {
  packs: Tile[]
  ambushes: Tile[]
  mystery: Tile[]
}

/** Packs and tripwires, and an ambush on each button that rolls one. Before the scatter, which keeps off them. */
export function buildEncounters(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  def: WorldDef,
  hub: Tile,
  sites: readonly Tile[],
  plates: ReadonlyArray<{ at: Tile; trigger: ScriptNode }>,
  mysteryDefs: readonly MysteryButton[]
): WorldEncounters {
  const packs: Tile[] = []
  if (def.monsters.length > 0) {
    for (let i = 0; i < def.packs; i++) {
      const at = freeTile(rand, grid, hub, def.safeRadius, [...packs, ...sites], PACK_SPACING, PLACE_TRIES)
      if (at === null) break
      packs.push(at)
      const key = def.monsters[rand.iRand(0, def.monsters.length)]
      const size = rand.iRand(Math.ceil(def.packSize / 2), def.packSize + 1)
      for (let m = 0; m < size; m++) {
        const spot = { x: at.x + rand.iRand(-2, 3), y: at.y + rand.iRand(-2, 3) }
        if (!grid.walkable(spot.x, spot.y)) continue
        const { type, tier } = rollPoolKey(rand, key)
        Monster.create(ctx, spot.x + 0.5, spot.y + 0.5, type, tier)
      }
      grid.markDisc(at, 3, WorldGrid.RESERVED)
    }
  }

  // tripwires on the trails (or the kept-clear corridors), away from everything
  const ambushes: Tile[] = []
  const path: Tile[] = []
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) if (grid.walkable(x, y) && grid.has(x, y, WorldGrid.PATH)) path.push({ x, y })
  }
  const clearOf = (t: Tile) =>
    dist2(t, hub) >= def.safeRadius * def.safeRadius &&
    [...ambushes, ...sites].every((a) => dist2(a, t) >= AMBUSH_SPACING * AMBUSH_SPACING)
  for (let i = 0; i < def.ambushes && canAmbush(def) && path.length > 0; i++) {
    let at: Tile | null = null
    for (let t = 0; t < PLACE_TRIES && at === null; t++) {
      const candidate = path[rand.iRand(0, path.length)]
      if (clearOf(candidate)) at = candidate
    }
    if (at === null) break
    ambushes.push(at)
    const wire = new SensorShape(ctx, at.x + 0.5, at.y + 0.5)
    wire.width = TRIPWIRE_SIZE
    wire.height = TRIPWIRE_SIZE
    const sprung = new NodeAreaTrigger(ctx, at.x + 0.5, at.y + 0.5)
    sprung.triggerTimes = 1
    sprung.connectToShape(wire)
    springRing(ctx, rand, grid, def, at, sprung)
  }

  for (const plate of plates) {
    if (!canAmbush(def) || rand.iRand(0, 100) >= def.buttonAmbush) continue
    springRing(ctx, rand, grid, def, plate.at, plate.trigger)
  }

  // Mystery plates, then a payload on each disguised real button, both drawing
  // after everything above so a world without them draws exactly as before.
  const pool = worldMysteryPool(def, mysteryDefs.length)
  const mystery: Tile[] = []
  if (pool.length > 0) {
    const pick = () => mysteryDefs[pool[rand.iRand(0, pool.length)]]
    const fire = (trigger: ScriptNode, at: Tile, button: MysteryButton, index: number) =>
      emitPayload(
        ctx,
        trigger,
        at,
        index,
        button,
        [...plates.map((p) => p.at), ...mystery],
        () => openGround(grid, at),
        () => [],
        MYSTERY_ANNOUNCE_TYPE,
        rand
      )
    for (let i = 0; i < (def.mysteryPlates ?? 0); i++) {
      const at = freeTile(rand, grid, hub, def.safeRadius, [...mystery, ...sites, ...ambushes], MYSTERY_SPACING, PLACE_TRIES)
      if (at === null) break
      mystery.push(at)
      grid.markDisc(at, 2, WorldGrid.RESERVED)
      fire(mysteryPlate(ctx, at), at, pick(), i)
    }
    if (def.disguise === true) plates.forEach((p, i) => fire(p.trigger, p.at, pick(), mystery.length + i))
  }
  return { packs, ambushes, mystery }
}

/** A mystery plate on `at`: its doodad, sensor and one-shot trigger, pressing down for good. */
function mysteryPlate(ctx: GenerationContext, at: Tile): ScriptNode {
  const plate = Doodad.prop(ctx, at.x + 0.5, at.y + 0.5, MYSTERY_PLATE)
  const shape = new SensorShape(ctx, at.x + 0.5, at.y + 0.5)
  const trigger = new NodeAreaTrigger(ctx, at.x + 0.5, at.y + 0.5)
  trigger.triggerTimes = 1
  trigger.connectToShape(shape)
  trigger.connectTo(new NodePlaySound(ctx, at.x + 0.5, at.y + 0.5, SEAL_SOUND))
  const press = new NodeChangeDoodadState(ctx, at.x + 0.5, at.y + 0.5, MYSTERY_BUTTON_STATE)
  press.setTarget(plate)
  trigger.connectTo(press)
  return trigger
}

/** Walkable tiles within `PAYLOAD_REACH` of `at`: where a plate's loot and monsters may land. */
function openGround(grid: WorldGrid, at: Tile): Tile[] {
  const out: Tile[] = []
  for (let dy = -PAYLOAD_REACH; dy <= PAYLOAD_REACH; dy++) {
    for (let dx = -PAYLOAD_REACH; dx <= PAYLOAD_REACH; dx++) {
      if (grid.walkable(at.x + dx, at.y + dy)) out.push({ x: at.x + dx, y: at.y + dy })
    }
  }
  return out
}

/** `def.ambushSize` monsters round `at`, spawned by `trigger`, plus the cue. */
function springRing(ctx: GenerationContext, rand: Rand, grid: WorldGrid, def: WorldDef, at: Tile, trigger: ScriptNode): void {
  trigger.connectTo(new NodePlaySound(ctx, at.x + 0.5, at.y - 1, AMBUSH_SOUND))
  const offset = rand.nextFloat() * Math.PI * 2
  // an ambush type, when the world has any: exactly its monsters, decided up front
  const types = ambushTypes(def)
  const exact =
    types.length > 0
      ? pick(rand, types).monsters.flatMap((row) =>
          isKnownMonsterKey(row.monster) && row.count >= 1 ? Array.from({ length: row.count }, () => resolveActorPath(row.monster)) : []
        )
      : null
  const size = exact === null ? def.ambushSize : exact.length
  for (let i = 0; i < size; i++) {
    const angle = offset + (i / size) * Math.PI * 2
    // the ring point, or the nearest walkable tile toward the center
    let spot: Tile | null = null
    for (let r = AMBUSH_RING; r >= 1 && spot === null; r--) {
      const t = { x: Math.round(at.x + Math.cos(angle) * r), y: Math.round(at.y + Math.sin(angle) * r) }
      if (grid.walkable(t.x, t.y)) spot = t
    }
    if (spot === null) continue
    let actor: string
    if (exact !== null) actor = exact[i]
    else {
      const key = def.monsters[rand.iRand(0, def.monsters.length)]
      const { type, tier } = rollPoolKey(rand, key)
      actor = type.tiers[tier] ?? resolveActorPath(key)
    }
    const spawn = new NodeSpawnObject(ctx, spot.x + 0.5, spot.y + 0.5, actor)
    spawn.triggerTimes = 1
    trigger.connectTo(spawn)
    grid.set(spot.x, spot.y, WorldGrid.RESERVED)
  }
}

/** The world's usable ambush types: a positive weight and at least one monster. */
function ambushTypes(def: WorldDef): WorldAmbushType[] {
  return (def.ambushTypes ?? []).filter((t) => t.weight > 0 && t.monsters.some((m) => m.count >= 1))
}

/** Whether this world can spring an ambush at all: a type to pick, or a pool to draw from. */
function canAmbush(def: WorldDef): boolean {
  return ambushTypes(def).length > 0 || def.monsters.length > 0
}

/** Coin clusters on reachable, free ground, after the scatter. */
export function placeLoot(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  def: WorldDef,
  hub: Tile,
  reached: Uint8Array,
  avoid: readonly Tile[]
): Tile[] {
  const caches: Tile[] = []
  const ok = (t: Tile) => grid.free(t.x, t.y) && reached[t.y * grid.width + t.x] === 1
  for (let i = 0; i < def.loot; i++) {
    const at = freeTile(rand, grid, hub, def.safeRadius / 2, [...caches, ...avoid], PACK_SPACING, PLACE_TRIES, ok)
    if (at === null) break
    caches.push(at)
    const count = rand.iRand(3, 7)
    for (let c = 0; c < count; c++) {
      const spot = { x: at.x + rand.iRand(-1, 2), y: at.y + rand.iRand(-1, 2) }
      if (!ok(spot)) continue
      Item.create(ctx, spot.x + rand.nextFloat(), spot.y + rand.nextFloat(), 'Treasure', rand.iRand(0, 9))
    }
  }
  return caches
}

/**
 * The actor type and tier a pool key gives: a family's member, a pinned tier,
 * or the type's ladder climbed with `upgradeChance` (`Monster.createRolled`'s
 * rule, drawn from `rand`).
 */
export function rollPoolKey(rand: Rand, key: string): { type: MonsterTypeDef; tier: number } {
  const source = Monster.resolveFloorPoolEntry(key)
  if (source.kind === 'pinned') return { type: source.type, tier: source.tier }
  const type = source.kind === 'family' ? source.members[rand.iRand(0, source.members.length)] : source.type
  let tier = 1
  while (rand.fRand(0, 1) < type.upgradeChance && tier < type.tiers.length - 1) tier++
  return { type, tier: Math.min(tier, type.tiers.length - 1) }
}
