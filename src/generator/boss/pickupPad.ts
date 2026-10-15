/**
 * The drop pad: where a wave tier's items land.
 *
 * Wave pickups used to be dealt round-robin onto the nine spawn anchors, which
 * put a mid-fight heal on a wall midpoint 25 tiles away, behind the horde that
 * had just spawned on the same tile. The anchors exist to make a horde
 * *surround* the party — deliberately far apart, hugging the walls — and that
 * is exactly wrong for a resupply the party has to walk to. The 2026-08-28
 * playtest found the 50% health and the 25% potion had both been dealt to the
 * north wall and never been found at all.
 *
 * So drops go to a fixed pad just inside the entrance instead: one place, the
 * place the party already spawns at and retreats to, laid out the same way on
 * every seed so it can be learnt once.
 *
 * The layout, with `cx` the entrance's centre column and `padY` two rows north
 * of the entrance mouth (`.` is untouched floor):
 *
 *        cx-4  cx-3 cx-2  cx-1   cx   cx+1 cx+2  cx+3
 *   ...    H    (h)    .     U     U     .   (m)    M     padY - 4
 *          H    (h)    .     U     U     .   (m)    M     padY - 3
 *          H    (h)    .     U     U     .   (m)    M     padY - 2
 *          H    (h)    .     U     U     .   (m)    M     padY - 1
 *          P     P     P     P     P     P    P     P     padY
 *          p     p     p     p     p     p    p     p     padY + 1
 *                          [ the entrance mouth ]        padY + 2
 *
 * Health runs up the left, mana up the right, the eight upgrades fill the
 * two-wide block in the middle, and the consumables — the three potions and the
 * two extra-life pickups — sit in the bottom row, nearest the door, where they
 * are the first thing seen on walking in. That is the
 * arrangement the owner laid out by hand in the game's own editor and asked
 * for; `PickupLane` in objects/pickupTypes.ts is what routes each item to its
 * column.
 *
 * The lower-case slots are overflow, reached only once a lane's visible column
 * is full or a cover pillar has buried part of it, so a normal drop table looks
 * exactly like the diagram's capitals and nothing else.
 *
 * Slots are ordered, and boss/wavePickups.ts walks one cursor per lane across
 * *every* tier rather than restarting each tier, so the 50% drops and the
 * boss-death drops sit next to each other in the same column instead of
 * stacking on one tile.
 *
 * Pure geometry — no context, no RNG, no map. Whether a slot is actually free
 * floor is wavePickups.ts's problem: it holds the reachability mask and skips
 * to the lane's next slot when a cover pillar sits on one.
 */

import type { PickupLane } from '../objects/pickupTypes'

/**
 * How many rows deep each lane runs.
 *
 * Every lane is two columns wide, so this is 20 slots each for health, mana and
 * the upgrades — far past any sane tier table. The width is not decoration:
 * cover pillars are placed before this rig runs and DO land on the pad (seed
 * 777 puts one squarely in the mana lane), so a lane needs slack to route
 * around a buried tile rather than running out and stacking. The second column
 * is only ever reached once the first is used up or blocked, so the ordinary
 * case still reads as the single clean column of the reference layout.
 *
 * Ten rows reaches `padY - 10`, inside even a minimum-height (42-tile) arena.
 * A lane that somehow exhausts both columns wraps to its first slot and
 * stacks, which is legal: two items on one tile are both pickable.
 */
/**
 * The arena facts a drop rig needs to place an item. Read-only, all of it.
 *
 * Lives here rather than next to either rig because both the boss arena's
 * per-tier drops (`boss/wavePickups.ts`) and the survival arena's timed drops
 * (`survival/pickups.ts`) place onto the same pad and must not drift on what
 * they need to do it.
 */
export interface PickupArena {
  width: number
  height: number
  /** The entrance mouth's centre column — `entranceRect` in arena.ts. */
  entranceCx: number
  /** The entrance mouth's northernmost row. */
  entranceTop: number
  /**
   * Post-prune walkable floor, indexed `x + y * width`, from cover.ts's
   * `reachableMask`. A pad slot outside it has a pillar on it. Optional so a
   * test can build a rig without a map; every slot counts as free then.
   */
  walkable?: Uint8Array
}

export const PAD_ROWS = 10

/** How far north of the entrance mouth the pad's bottom row sits. */
const PAD_OFFSET = 2

/**
 * The pad's columns, as offsets from the entrance's centre column. The first
 * entry of each pair is the lane's visible column; the second is the overflow
 * column it spills into, always the gap on the inward side.
 */
const HEALTH_COLS = [-4, -3]
const MANA_COLS = [3, 2]
const UPGRADE_COLS = [-1, 0]
/** Bottom rows, filled from the middle outwards so 1..3 potions stay centred. */
const POTION_COLS = [-1, 0, 1, -2, 2, -3, 3]
/** How many rows the potion lane occupies: its own, then one nearer the door. */
const POTION_ROWS = [0, -1]

export interface PadSlot {
  x: number
  y: number
}

/** One ordered slot list per lane. Never empty. */
export type PickupPad = Record<PickupLane, PadSlot[]>

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

/**
 * Builds the pad for an arena of this interior size.
 *
 * `entranceCx` is the entrance mouth's centre column and `entranceTop` its
 * northernmost row — `entranceRect.y` in boss/arena.ts. Every slot is clamped
 * a tile inside the interior, so a pad that would overhang a wall on a
 * pathologically narrow arena folds against it rather than emitting a tile the
 * level has no floor for.
 */
export function pickupPad(entranceCx: number, entranceTop: number, width: number, height: number): PickupPad {
  const maxX = Math.max(1, width - 2)
  const maxY = Math.max(1, height - 2)
  const cx = clamp(entranceCx, 1, maxX)
  const padY = clamp(entranceTop - PAD_OFFSET, 1, maxY)

  const at = (dx: number, dy: number): PadSlot => ({
    x: clamp(cx + dx, 1, maxX),
    y: clamp(padY - dy, 1, maxY)
  })

  // Column-major: the whole visible column first, then the overflow column, so
  // a lane only widens once it has to.
  const strip = (cols: number[]): PadSlot[] => {
    const slots: PadSlot[] = []
    for (const dx of cols) {
      for (let row = 1; row <= PAD_ROWS; row++) slots.push(at(dx, row))
    }
    return slots
  }

  // Row-major instead: the eight upgrades fill this as a 2-wide, 4-tall block,
  // which is how the owner's reference layout reads.
  const block: PadSlot[] = []
  for (let row = 1; row <= PAD_ROWS; row++) {
    for (const dx of UPGRADE_COLS) block.push(at(dx, row))
  }

  const potion: PadSlot[] = []
  for (const dy of POTION_ROWS) {
    for (const dx of POTION_COLS) potion.push(at(dx, dy))
  }

  return {
    health: strip(HEALTH_COLS),
    mana: strip(MANA_COLS),
    upgrade: block,
    potion
  }
}
