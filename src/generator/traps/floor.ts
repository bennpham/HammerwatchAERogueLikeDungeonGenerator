/**
 * Traps on an ordinary dungeon floor — projectile spewers lining room walls.
 *
 * The arena's rig (boss/traps.ts) one level up: a floor may carry any number of
 * trap rows, each naming a projectile, the direction it fires, how wide it
 * fans, how often it shoots and how many spewers to place. They share the
 * placement primitives (traps/slots.ts) and every playtested constant in them.
 *
 * Three things are deliberately NOT shared, because a floor is not an arena:
 *
 *   - **No tiers, no triggers.** An arena has health thresholds to switch
 *     hazard sets between; a floor has nothing to switch on, so every spewer
 *     ships `enabled: True` and is live from load, exactly as buffs/field.ts's
 *     aura is. A floor's rig is N spewer nodes and nothing else — no
 *     GlobalEventTrigger, no ToggleElement.
 *   - **`count` is counted over the FLOOR.** A tier's row places `count`
 *     spewers along one arena wall. A floor's row places `count` spewers spread
 *     over every eligible room's wall of that direction, because a floor's unit
 *     of design is the floor, not the room — a dungeon master asking for six
 *     arrow traps wants six, not six per room on a floor whose room count is
 *     itself a roll.
 *   - **The pool is per direction, not per wall.** One flat pool for the whole
 *     floor, built by walking `level.rooms` in index order. Bigger rooms
 *     contribute more slots and so attract proportionally more traps, which is
 *     the distribution you want: a broom cupboard should not get the same
 *     hazard as a hall.
 *
 * ## Where a spewer goes
 *
 * On the innermost interior floor tile of the room wall it fires *away* from —
 * `up` along the room's south wall shooting north, `down` along its north wall,
 * `left` along its east wall, `right` along its west. `Room.contains` is
 * inclusive, so a room's interior is [r.x, r.x + r.width] x [r.y, r.y +
 * r.height] and its wall band is the ring outside that.
 *
 * Both corrections the arena learned in playtest apply unchanged, re-anchored
 * on the room rather than the arena:
 *
 *   - the emitted position is the tile CENTRE (`TILE_CENTRE`), never the
 *     integer corner, which on a minimum edge lies on the band boundary and
 *     eats the projectile as it spawns;
 *   - the north wall's row is `r.y + overhangRows(theme)`, not `r.y`: on the
 *     lettered themes the wall art hangs two tiles down over the floor in front
 *     of it. This is the same `r.y + 2` that `spawnKey`, `grantLockLoot` and
 *     `map/buttonSeal.ts` already treat as the top of a room's usable interior;
 *     asking the theme is strictly better, because the flat-anchored themes
 *     (h, every bonus<n>) bury nothing and can use the row.
 *
 * Every slot is then checked over a window widened by TRAP_WALL_MARGIN on both
 * sides — the arena's `overlaps` trick, because a spewer two tiles from a
 * doorway still fires down it:
 *
 *   - Its own tile must be this room's floor: not a wall, not `wallSet` (a
 *     stair prefab paints its own walls), and `regionMap` must name this room.
 *   - **The band tile behind it must be solid wall.** This is what rejects
 *     passage mouths, and it is one grid read rather than a walk over
 *     `room.passages`. It has to be the band and not `regionMap`, because
 *     `buildTileArray` fills the region map room-first and a passage's last
 *     cells inside the room it arrives at read as the room.
 *   - It must be clear of every ObjectSet's footprint, `contains` and
 *     `containsWall` both — the stairs, the shop, the orb and the two portals.
 *
 * And three room types are skipped whole:
 *
 *   - `Entrance`, because the party materialises there with no warning. The
 *     arena excludes its entrance strip for exactly this reason, and a floor is
 *     entered once, blind.
 *   - `Shop`, because the stall and the browsing party are a fixed target that
 *     cannot dodge.
 *   - `sealed`, the button-gated victory room: one corridor deep, holding the
 *     campaign's last prefab, its geometry already fully spent on the seal.
 *
 * A `locked` vault is deliberately NOT skipped. A trapped reward room is the
 * point of a trapped reward room, and a spewer never blocks a door.
 *
 * ## RNG
 *
 * One `ctx.trapRand.iRand` per placed spewer, and nothing else. Three rules
 * follow, all load-bearing:
 *
 * 1. **It returns before touching the stream** when the floor carries no usable
 *    row (generator invariant 2), so every existing seed stays byte-identical.
 * 2. **`trapRand` is its own stream** (`seed + 3`). Traps are therefore purely
 *    additive: arming any floor leaves every floor's rooms, walls, doodads,
 *    actors, items and pre-existing ids identical. The one thing the stream
 *    carries between floors is its own draws — arming floor 0 moves floor 1's
 *    TRAP POSITIONS and nothing else about floor 1.
 * 3. **`index.ts` calls it after the retry loop has ACCEPTED a floor**, never
 *    from inside the `Level` constructor. The loop builds up to
 *    MAX_LEVEL_ATTEMPTS candidates and `ctx.clearLevel()`s the rejects, but
 *    nothing can rewind a `Rand`: a rig drawing in the constructor would burn
 *    draws on discarded candidates, making a floor's traps depend on how many
 *    times reachability happened to reject it. Drawing only after acceptance
 *    makes the draw count a function of the trap config alone.
 *
 * Draw order is fixed and total: rows in list order, copies 0..count-1, one
 * draw each. A row that can place nothing draws nothing.
 *
 * Script nodes carry no collision, so nothing here affects map/reachability.ts
 * or map/sealCheck.ts — which is what makes it safe to run after both have
 * already passed on this floor.
 */

import type { GenerationContext } from '../core/context'
import type { DungeonParameters, FloorTrap, TrapDirection } from '../config/parameters'
import type { ProjectileDef } from '../objects/projectileTypes'
import { projectileById } from '../objects/projectileTypes'
import { NodeProjectileSpewer } from '../objects/nodes'
import type { Level } from '../map/level'
import type { Room } from '../map/room'
import { overhangRows } from '../map/reachability'
import type { Slot } from './slots'
import { SPEWER_DIRECTION, TILE_CENTRE, TRAP_MIN_SPACING, TRAP_WALL_MARGIN, takeSlot, wallCapacity } from './slots'

/**
 * Builds one floor's trap rig. Emits nothing at all — not one node, not one id,
 * and not one RNG draw — when the floor carries no trap, so an untrapped floor
 * stays byte-identical to the pre-feature output.
 *
 * A row naming an unknown projectile, or asking for no spewers, is skipped
 * rather than thrown on; config/validation.ts is the gate, and a generator that
 * crashes on bad input is the bug the port exists to fix.
 */
export function buildFloorTrapRig(
  ctx: GenerationContext,
  rows: readonly FloorTrap[] | undefined,
  level: Level
): void {
  if (rows === undefined || rows.length === 0) return

  const usable: { def: ProjectileDef; row: FloorTrap }[] = []
  for (const row of rows) {
    const def = projectileById(row.projectile)
    if (def !== undefined && row.count >= 1) usable.push({ def, row })
  }
  // Must come before any trapRand draw — see the file header's RNG note.
  if (usable.length === 0) return

  // One pool per direction, built lazily on first use so a floor asking only
  // for `up` traps never walks the other three walls, and carried across every
  // row so two rows on the same wall of the same room cannot stack.
  const pools = new Map<TrapDirection, Slot[]>()
  const poolFor = (direction: TrapDirection): Slot[] => {
    let pool = pools.get(direction)
    if (pool === undefined) {
      pool = floorSlots(level, ctx, direction)
      pools.set(direction, pool)
    }
    return pool
  }

  for (const { def, row } of usable) {
    const pool = poolFor(row.direction)

    for (let copy = 0; copy < row.count; copy++) {
      // Pool exhausted: stop placing this row rather than stacking spewers on
      // one tile. No draw is made, which keeps the stream tied to the number of
      // spewers actually placed.
      if (pool.length === 0) break

      const slot = takeSlot(ctx.trapRand, pool)
      const spewer = new NodeProjectileSpewer(
        ctx,
        slot.x + TILE_CENTRE,
        slot.y + TILE_CENTRE,
        def.path,
        SPEWER_DIRECTION[row.direction],
        row.spread,
        row.spawnRateMs
      )
      // A floor has no health tiers and nothing to switch it on, so unlike
      // every arena tier past the first it has to arrive live. Same reason
      // buffs/field.ts sets its DangerArea back to enabled.
      spewer.enabled = true
    }
  }
}

/** Every legal slot on the floor for `direction`, room by room in index order. */
export function floorSlots(level: Level, ctx: GenerationContext, direction: TrapDirection): Slot[] {
  const slots: Slot[] = []
  level.rooms.forEach((room, roomIndex) => {
    if (!eligibleRoom(room)) return
    slots.push(...roomWallSlots(level, ctx, room, roomIndex, direction))
  })
  return slots
}

/** Whether a room may hold traps at all — see the header for each reason. */
/**
 * Rooms a per-floor rig may place into. Exported because the dungeon boss rig
 * (`dungeonBoss/`) draws from the same set — the reasons a room is a bad place
 * for a spewer are the same reasons it is a bad place for a wave monster.
 */
export function eligibleRoom(room: Room): boolean {
  if (room.type === 'Entrance' || room.type === 'Shop') return false
  if (room.sealed) return false
  return true
}

/**
 * The legal slots on one room's `direction` wall, in ascending order along it:
 * the innermost interior floor row or column, minus the corners, the passage
 * mouths and any prefab's footprint. Exported for `mystery/`, whose trap
 * buttons arm spewers in the plate's own room rather than across the floor.
 */
export function roomWallSlots(
  level: Level,
  ctx: GenerationContext,
  room: Room,
  roomIndex: number,
  direction: TrapDirection
): Slot[] {
  const slots: Slot[] = []

  // Vertical walls (a trap firing left sits on the east wall, and vice versa)
  // run down a column; horizontal walls run along a row.
  const vertical = direction === 'left' || direction === 'right'
  const overhang = overhangRows(room.theme)

  const fixed =
    direction === 'up'
      ? room.y + room.height
      : direction === 'down'
        ? room.y + overhang
        : direction === 'left'
          ? room.x + room.width
          : room.x

  // Where the wall's usable span starts and ends. The vertical walls start
  // below the north band's overhang for the same reason a `down` trap does —
  // art hanging over the top rows buries a spewer on the east wall exactly as
  // it buries one on the north. The max() is a no-op while the two constants
  // are both 2, and is written out so they can move apart.
  const lo = vertical ? room.y + Math.max(TRAP_WALL_MARGIN, overhang) : room.x + TRAP_WALL_MARGIN
  const hi = vertical ? room.y + room.height - TRAP_WALL_MARGIN : room.x + room.width - TRAP_WALL_MARGIN

  // A room too small to hold a margin at each end, or one whose overhang has
  // swallowed the whole span, holds nothing. Placing nothing is correct;
  // validation already warns when a floor's pools are likely to run dry.
  if (hi < lo) return slots
  if (direction === 'down' && fixed > room.y + room.height - TRAP_WALL_MARGIN) return slots

  for (let along = lo; along <= hi; along++) {
    const x = vertical ? fixed : along
    const y = vertical ? along : fixed
    if (slotClear(level, ctx, room, roomIndex, direction, x, y)) slots.push({ x, y })
  }

  return slots
}

/**
 * The band tile just outside the room on a given wall — the ring `Room.contains`
 * stops one short of, which `buildTileArray` rasterizes as wall unless a passage
 * has opened it.
 *
 * Not simply "one step out from the slot": a `down` trap does not stand against
 * its band. The north wall's art hangs `overhangRows` tiles down over the floor,
 * so the spewer sits at `r.y + overhang` with those rows of ordinary room floor
 * between it and the band at `r.y - 1`. Stepping one tile north from such a slot
 * lands on room floor, which is never wall — reading that as "a doorway is here"
 * silently rejected every `down` slot on every lettered theme.
 */
function bandLine(room: Room, direction: TrapDirection): number {
  if (direction === 'up') return room.y + room.height + 1
  if (direction === 'down') return room.y - 1
  if (direction === 'left') return room.x + room.width + 1
  return room.x - 1
}

/**
 * Whether a spewer may stand at `(x, y)`, checked over the window widened by
 * TRAP_WALL_MARGIN along the wall — a trap two tiles from a doorway still fires
 * down it, so the whole neighbourhood has to hold up, not just the one tile.
 *
 * Two things are checked across that window, at every depth from the wall band
 * in to the slot itself:
 *
 *   - the BAND line must be solid wall. That is the passage-mouth test, and one
 *     grid read rather than a walk over `room.passages`.
 *   - every line from the room's edge in to the slot must be this room's floor,
 *     unclaimed by a prefab. On the north wall that covers the overhang rows the
 *     spewer stands behind; on the other three it is the slot line alone.
 */
function slotClear(
  level: Level,
  ctx: GenerationContext,
  room: Room,
  roomIndex: number,
  direction: TrapDirection,
  x: number,
  y: number
): boolean {
  const vertical = direction === 'left' || direction === 'right'
  const band = bandLine(room, direction)
  const slot = vertical ? x : y
  // From the band towards the slot: +1 when the band is the lower coordinate.
  const step = band < slot ? 1 : -1

  const at = (along: number, depth: number): { x: number; y: number } =>
    vertical ? { x: depth, y: along } : { x: along, y: depth }

  for (let offset = -TRAP_WALL_MARGIN; offset <= TRAP_WALL_MARGIN; offset++) {
    const along = (vertical ? y : x) + offset

    // The band must be wall — a corridor arriving at this wall is exactly a
    // hole in this tile.
    const b = at(along, band)
    if (!inBounds(level, b.x, b.y)) return false
    if (!level.tileArray[b.x + b.y * level.width].wall) return false
    for (const set of ctx.objectSets) {
      if (set.contains(b.x, b.y) || set.containsWall(b.x, b.y)) return false
    }

    // And every tile from the room's edge in to the slot must be this room's
    // own floor, unclaimed by a prefab.
    for (let depth = band + step; ; depth += step) {
      const t = at(along, depth)
      if (!inBounds(level, t.x, t.y)) return false
      const idx = t.x + t.y * level.width
      if (level.tileArray[idx].wall || level.tileArray[idx].wallSet) return false
      if (level.regionMap[idx] !== roomIndex) return false
      for (const set of ctx.objectSets) {
        if (set.contains(t.x, t.y) || set.containsWall(t.x, t.y)) return false
      }
      if (depth === slot) break
    }
  }

  return true
}

export function inBounds(level: Level, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height
}

/**
 * Roughly how many spewers a floor can hold on one direction's walls — what
 * config/validation.ts warns a floor's trap counts against.
 *
 * The smallest floor this parameter set can roll: `minRoomCount` rooms, each
 * the smallest `Room` can be. `Room` rolls `width = iRand(minRoomSize,
 * maxRoomSize)` and `height = iRand(minRoomSize + 2, maxRoomSize + 2)`, both
 * half-open, and `contains` is inclusive — so the smallest room's walls span
 * `minRoomSize + 1` by `minRoomSize + 3` tiles.
 *
 * Deliberately optimistic: the entrance and shop exclusions, the sealed room,
 * every passage mouth and every prefab footprint can only reduce this. Running
 * a pool dry is graceful, so this is a warning's threshold and not an error's.
 */
export function floorTrapCapacity(params: DungeonParameters, direction: TrapDirection): number {
  const perRoom = wallCapacity(params.minRoomSize + 1, params.minRoomSize + 3, direction)
  return Math.max(0, params.minRoomCount) * perRoom
}

/** Re-exported for the tests and validation, which reason in these units. */
export { TRAP_MIN_SPACING, TRAP_WALL_MARGIN }
