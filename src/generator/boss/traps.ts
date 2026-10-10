/**
 * Traps per boss wave tier — projectile spewers lining the arena walls.
 *
 * Each of the five tiers (100 / 75 / 50 / 25% and Boss Died) may carry any
 * number of trap rows, each naming a projectile, the direction it fires, how
 * wide it fans, how often it shoots and how many spewers to place. Like the
 * buffs and unlike the pickups, tiers **replace** one another: a tier's trigger
 * switches the previous tier's whole set off as it switches its own on, so the
 * hazard changes as the fight moves through its phases instead of accumulating
 * into a crossfire nobody can cross.
 *
 *   tier 0 (100%)   ProjectileSpewer{enabled: True}
 *                   (live from arena load — no trigger, it IS the opening state)
 *
 *   tier N          GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *                        ├─ ToggleElement{state: 1} -> each previous tier's spewer
 *                        └─ ToggleElement{state: 0} -> each of this tier's
 *
 * `state: 0` ENABLES and `state: 1` disables — the inverted polarity
 * NodeToggleElement documents. "The previous tier's spewers" is the nearest
 * EARLIER tier that actually carries a trap, not `tier - 1`, so a campaign that
 * traps only 100% and 25% still has the 25% trigger switch the opening set off.
 *
 * All of that is lifted from waveBuffs.ts, which solves the same problem for
 * buff fields; read that file alongside this one.
 *
 * ## Where a spewer goes
 *
 * A trap sits on the wall it fires *away* from — `up` along the south wall
 * shooting north, `down` along the north wall shooting south, `left` along the
 * east wall, `right` along the west wall — on the innermost interior floor
 * tile of that wall, never on the wall band itself. A spewer buried in the band
 * would spawn its projectiles inside collision.
 *
 * "Innermost" has two corrections on it, both learned from a playtest and both
 * pointing at collision the tilemap does not record:
 *
 *   - the emitted position is the tile's CENTRE, not the integer corner
 *     (`TILE_CENTRE`). On the two minimum-edge walls the corner lies exactly on
 *     the boundary with the band, and the projectile is eaten as it spawns.
 *   - the north wall's row is `northWallRow`, not 0: on the lettered themes the
 *     wall art hangs two tiles down over the floor in front of it.
 *
 * The position along the wall is seeded. Legal slots are enumerated first and
 * then drawn from, so nothing here loops unbounded:
 *
 *   - TRAP_WALL_MARGIN tiles are kept clear at each end of every wall, so a
 *     spewer never lands in a corner or clips the adjacent band.
 *   - The south wall skips the entrance strip (widened by the margin): the
 *     party arrives there and must not be shot the instant they load in.
 *   - Whichever of N/E/W the alcove took skips its mouth, likewise widened, so
 *     the walk to the orb is not down a firing lane.
 *   - A slot a cover pillar stands on is skipped — the mask is READ, never
 *     written, so cover placement is untouched.
 *   - TRAP_MIN_SPACING tiles are kept between two spewers. The slot pool is per
 *     wall and carried across ALL tiers, so tier 3's traps cannot land on top
 *     of tier 1's.
 *
 * A wall whose pool runs dry simply stops placing; config/validation.ts warns
 * about that before generation, and running out is never fatal.
 *
 * ## RNG
 *
 * Unlike waves.ts, waveBuffs.ts, wavePickups.ts and invulnerability.ts, this
 * module DOES draw — one `ctx.bossRand.iRand` per placed spewer, and nothing
 * else. Two rules follow, and both are load-bearing:
 *
 * 1. **It returns before touching the stream when no tier carries a trap**
 *    (generator invariant 2), so every existing seed stays byte-identical.
 * 2. **arena.ts calls it after every layout draw** — the size, the boss, the
 *    alcove wall, the cover pillars, the food, the scattered spawn points, and
 *    the mixed-theme floor-pattern roll. Turning traps on therefore cannot move
 *    the arena's layout: the same seed lays out the same room with the same
 *    pillars, trapped or not.
 *
 *    It is not, and cannot be, the last consumer overall: `getArenaXML` rolls a
 *    variant per floor tile and again for the overlay and mixed palettes. So
 *    turning traps on does shift the arena's floor-tile COSMETICS, and (like
 *    every other arena knob) a later fight's stream. Neither changes how the
 *    fight plays. Do not "fix" that by moving this call earlier — ahead of
 *    placeSpawnPoints or placeCoverPillars it would move the layout itself,
 *    which is the thing that actually matters.
 *
 * Draw order is fixed and total: tiers 0..4, rows in list order, copies
 * 0..count-1, one draw each. A row that can place nothing draws nothing.
 *
 * Script nodes carry no collision, so nothing here affects map/reachability.ts
 * or the cover mask.
 */

import type { GenerationContext } from '../core/context'
import type { BossTrap, BossTrapDirection, BossWave } from '../config/parameters'
import { waveTraps } from '../config/parameters'
import type { ProjectileDef } from '../objects/projectileTypes'
import { projectileById } from '../objects/projectileTypes'
import { NodeProjectileSpewer, NodeToggleElement } from '../objects/nodes'
import { OVERHANG_ROWS, overhangRows } from '../map/reachability'
import type { TierSource } from './tierSource'
import { singleBossTierSource } from './tierSource'
import type { Slot } from '../traps/slots'
import {
  SPEWER_DIRECTION,
  TILE_CENTRE,
  TRAP_MIN_SPACING,
  TRAP_WALL_MARGIN,
  WALLS,
  takeSlot,
  wallCapacity
} from '../traps/slots'

/**
 * Re-exported so the arena stays the one place that talks about arena traps:
 * `config/validation.ts` and `tests/bossTraps.test.ts` import them from here,
 * and did before the primitives moved to `traps/slots.ts` for the floor rig.
 */
export { TRAP_MIN_SPACING, TRAP_WALL_MARGIN, wallCapacity }

/** The arena facts the rig needs. Read-only, all of it. */
export interface TrapArena {
  width: number
  height: number
  /**
   * The arena's theme id, read only to ask how deep its wall art hangs — see
   * `northWallRow`. Optional so a test can build the rig without one; absent
   * is treated as the lettered themes' overhang, the conservative answer.
   */
  theme?: string
  /** The entrance strip on the south wall, in interior coordinates. */
  entrance: { x: number; y: number; width: number; height: number }
  /** Which wall the alcove took. The south wall is always the entrance. */
  alcoveWall: 'N' | 'E' | 'W'
  /** Interior mid-column — where an N alcove's mouth sits. */
  midX: number
  /** Interior mid-row — where an E or W alcove's mouth sits. */
  midY: number
  /**
   * Post-prune walkable floor, indexed `x + y * width`, from cover.ts's
   * `reachableMask`. A slot outside it has a pillar on it. Optional so a test
   * can build the rig without a map; every slot counts as free then.
   */
  walkable?: Uint8Array
}

/** Half-width of the alcove mouth: it is three tiles, centred. */
const ALCOVE_MOUTH_HALF = 1

/**
 * Builds the arena's per-tier trap rig. Emits nothing at all — not one node,
 * not one id, and not one RNG draw — when no tier carries a trap, so an arena
 * without them stays byte-identical to the pre-feature output.
 *
 * A row naming an unknown projectile, or asking for no spewers, is skipped
 * rather than thrown on; config/validation.ts is the gate.
 */
export function buildTrapRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  arena: TrapArena,
  tierSource: TierSource = singleBossTierSource()
): void {
  const carried: { def: ProjectileDef; row: BossTrap }[][] = waves.map((wave) =>
    waveTraps(wave).flatMap((row) => {
      const def = projectileById(row.projectile)
      return def === undefined || row.count < 1 ? [] : [{ def, row }]
    })
  )
  // Must come before any bossRand draw — see the file header's RNG note.
  if (carried.every((entries) => entries.length === 0)) return

  // One pool per wall, consumed across every tier so no two spewers crowd.
  const pools = new Map<BossTrapDirection, Slot[]>()
  for (const wall of WALLS) pools.set(wall, wallSlots(arena, wall))

  let previous: NodeProjectileSpewer[] = []

  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely — no
    // spewer for that tier is placed and no draw is made for it.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    const spewers: NodeProjectileSpewer[] = []
    for (const { def, row } of entries) {
      const pool = pools.get(row.direction)
      // An unknown direction cannot reach here — validation rejects it, and the
      // type only admits four — but a missing pool must not throw.
      if (pool === undefined) continue

      for (let copy = 0; copy < row.count; copy++) {
        // Pool exhausted: stop placing this row rather than stacking spewers on
        // one tile. No draw is made, which keeps the stream tied to the number
        // of spewers actually placed.
        if (pool.length === 0) break

        const slot = takeSlot(ctx.bossRand, pool)
        const spewer = new NodeProjectileSpewer(
          ctx,
          slot.x + TILE_CENTRE,
          slot.y + TILE_CENTRE,
          def.path,
          SPEWER_DIRECTION[row.direction],
          row.spread,
          row.spawnRateMs
        )
        // The opening tier has nothing to switch it on, so it must arrive live;
        // every later tier ships disabled (the node's own default) and waits for
        // its threshold. That is also why tier 0 emits no trigger at all.
        spewer.enabled = tier === 0
        spewers.push(spewer)
      }
    }

    if (spewers.length === 0) continue

    if (tier > 0) {
      // Trigger and toggle nodes are parked just outside the arena, one column
      // per tier — cosmetic editor markers only, nothing about them is
      // positional. The spewers above are the nodes whose position matters.
      const col = arena.width + 1 + tier
      let markerRow = 0

      const trigger = tierSource.tierTrigger(ctx, col, markerRow, tier)

      for (const stale of previous) {
        markerRow += 1
        const off = new NodeToggleElement(ctx, col, markerRow)
        off.state = 1 // 1 disables the target element
        off.connectToElement(stale)
        trigger.connectTo(off)
      }

      for (const spewer of spewers) {
        markerRow += 1
        const on = new NodeToggleElement(ctx, col, markerRow)
        on.state = 0 // 0 enables the target element
        on.connectToElement(spewer)
        trigger.connectTo(on)
      }
    }

    previous = spewers
  }
}

/**
 * Every legal slot on the wall a `direction` trap fires away from, in ascending
 * order along that wall — the innermost interior floor row or column, minus the
 * corners, the entrance, the alcove mouth and any tile a pillar stands on.
 */
export function wallSlots(arena: TrapArena, direction: BossTrapDirection): Slot[] {
  const { width, height, entrance, alcoveWall, midX, midY } = arena
  const slots: Slot[] = []

  // Vertical walls (a trap firing left sits on the east wall, and vice versa)
  // run down a column; horizontal walls run along a row.
  const vertical = direction === 'left' || direction === 'right'
  const span = vertical ? height : width
  const fixed =
    direction === 'up'
      ? height - 1
      : direction === 'down'
        ? northWallRow(arena)
        : direction === 'left'
          ? width - 1
          : 0

  // A pathologically small arena can push the north row past the far wall.
  // Placing nothing is correct there; validation already warns on a dry pool.
  if (fixed < 0 || fixed >= (vertical ? width : height)) return slots

  for (let along = TRAP_WALL_MARGIN; along <= span - 1 - TRAP_WALL_MARGIN; along++) {
    const x = vertical ? fixed : along
    const y = vertical ? along : fixed

    // The party lands on the entrance strip; never shoot it as they arrive.
    if (direction === 'up' && overlaps(along, entrance.x, entrance.x + entrance.width - 1)) continue

    // The alcove mouth is three tiles centred on the arena's midline. Keep the
    // walk to the orb out of the firing line.
    if (direction === 'down' && alcoveWall === 'N' && overlaps(along, midX - ALCOVE_MOUTH_HALF, midX + ALCOVE_MOUTH_HALF)) continue
    if (direction === 'left' && alcoveWall === 'E' && overlaps(along, midY - ALCOVE_MOUTH_HALF, midY + ALCOVE_MOUTH_HALF)) continue
    if (direction === 'right' && alcoveWall === 'W' && overlaps(along, midY - ALCOVE_MOUTH_HALF, midY + ALCOVE_MOUTH_HALF)) continue

    if (!isFreeFloor(arena, x, y)) continue

    slots.push({ x, y })
  }

  return slots
}

/**
 * The row a north-wall trap (one firing `down`) sits on.
 *
 * Not row 0. The lettered themes' wall pieces are three tiles tall and anchored
 * two tiles up, so a wall at row -1 physically fills rows 0 and 1 of the floor
 * below it — `map/reachability.ts` models exactly this as `OVERHANG_ROWS`, and
 * it is why `blockedGrid` rejects a floor whose only route runs under a wall.
 * The arena has been bitten by it before: `boss/bosses.ts` records the dragon
 * placed at interior row 0 reading as off the map to the north, unreachable and
 * unable to fire, which is the same failure a spewer shows as its projectiles
 * dying the instant they spawn.
 *
 * `overhangRows` is asked per theme rather than assumed: theme h and the bonus
 * themes anchor their art on its own tile and bury nothing, so a trap there
 * sits on row 0 as the other three walls do on theirs. [VERIFIED] 2026-09-02 in
 * game on both branches — row 2 on a lettered theme and row 0 on theme h are
 * each clear of their own wall's art.
 *
 * The south wall needs no equivalent: art hangs DOWN, so the band at row
 * `height` buries rows outside the arena, not the interior row in front of it.
 */
function northWallRow(arena: TrapArena): number {
  return arena.theme === undefined ? OVERHANG_ROWS : overhangRows(arena.theme)
}

/** Whether `along` falls inside [lo, hi] once widened by the wall margin. */
function overlaps(along: number, lo: number, hi: number): boolean {
  return along >= lo - TRAP_WALL_MARGIN && along <= hi + TRAP_WALL_MARGIN
}

/** Whether a slot is walkable floor rather than a cover pillar. */
function isFreeFloor(arena: TrapArena, x: number, y: number): boolean {
  const { walkable, width, height } = arena
  if (!walkable) return true
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return walkable[x + y * width] !== 0
}
