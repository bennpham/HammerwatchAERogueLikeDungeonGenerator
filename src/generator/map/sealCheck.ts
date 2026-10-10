import { getTheme } from '../config/themes'
import type { Level } from './level'
import type { GenerationContext } from '../core/context'
import type { DoodadTypeName } from '../objects/doodad'

/**
 * Can the party reach the orb without opening the gate that guards it?
 *
 * This is the floor's actual promise, and until now nothing checked it.
 * `exitReachable` deliberately fills *through* the seal — the seal is doodads,
 * not tiles, and what that check proves is that the *button* is reachable — so
 * four separate ways of walking around the gate shipped before anyone noticed,
 * each found by playing the game. They fell into two families:
 *
 *  1. The barrier was in the wrong place, or fenced the wrong edge of the right
 *     tile, so the corridor was not actually closed.
 *  2. The gated room was simply open on another side. `buildTileArray` marks a
 *     tile floor if *any* room or passage contains it, so two regions that merely
 *     touch merge with no wall band between them — and the gate, which is built
 *     from the room's one registered passage, never sees the second way in.
 *
 * No amount of care in `buttonSeal.ts` can fix family 2, so this asks the
 * question directly instead: block the gate, walk from the entrance, and reject
 * the floor if the orb is still reachable. Draws no random values; a floor that
 * fails re-rolls like any other invalid one.
 */

/** Which tile boundary a wall piece closes on a `directionalFences` theme. */
type Fence =
  /** the whole tile is impassable */
  | 'tile'
  /** the boundary between this tile and its left / right / upper neighbour */
  | 'left'
  | 'right'
  | 'up'
  /** it has a collider, but not one that stops anybody */
  | 'none'

/**
 * Theme h's band, by the `DoodadType` the emitter used, from the collision
 * polygons in `<install>/editor/assetsExtract/doodads/theme_h/`.
 *
 * Tiles are the wrong model for a fence theme and that is the whole point: its
 * pieces close one *edge* each, so the player legitimately stands inside a wall
 * tile. A tile-based fill cannot see a barrier that fences the wrong side of the
 * right tile, which is exactly what the LEFT-corridor seal used to do.
 *
 * `CornerRD` / `CornerLD` closing nothing is not an omission — `h_crn_r_dn` is
 * `(0,3)(-5,0)(1,-5)(2,0)`, a ~7x8px nub in one corner of its tile, and that
 * hole is the one the walk-around went through.
 *
 * Anything absent here counts as `none`, which makes the model *more* permissive
 * and so can only ever cost an extra re-roll — never let a leaking floor ship.
 */
const FENCE: Partial<Record<DoodadTypeName, Fence>> = {
  Vertical: 'right', //     h_v_8_l,       x 10..18 of its own tile
  TLeft: 'right', //        h_v_8_l
  TRight: 'left', //        h_v_8_r,       x -2..6
  Horizontal: 'up', //      h_h_8_dn,      y -2..6
  TDown: 'up', //           h_h_8_dn
  VCapDown: 'up', //        h_h_8_dn
  TUp: 'tile', //           h_h_8_up,      x 0..16, y 13..32 at yOffset -1
  VCapUp: 'tile', //        h_h_8_up
  CrossWall: 'tile', //     h_h_8_up — the one piece that seals a whole tile
  CornerRU: 'left', //      h_crn_r_up,    x -2..6, y 16..32 at yOffset -1
  CornerLU: 'right', //     h_crn_l_up,    x 10..18, y 16..32 at yOffset -1
  CornerRD: 'none', //      h_crn_r_dn — a nub in the tile's top-left corner
  CornerLD: 'none', //      h_crn_l_dn — a nub in the tile's top-right corner
  HCapLeft: 'tile', //      h_h_cap_up_l,  x 6..16, y 6..32 at yOffset -1
  HCapRight: 'tile', //     h_h_cap_up_r,  x 0..14, y 4..32 at yOffset -1
  // h_pyramid_exit declares no polygon at all, which is why the theme carries a
  // `stairBacking` piece to close the band behind it — that piece blocks, this
  // one does not.
  ExitUp: 'none',
  ExitDn: 'none'
}

/** 0 left, 1 right, 2 up, 3 down. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
]

/** Where the player can walk: solid tiles, plus boundaries that cannot be crossed. */
class Passability {
  private readonly solid: Uint8Array
  /** `blocked[dir][idx]` — leaving `idx` in direction `dir` is barred */
  private readonly blocked: Uint8Array[]

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.solid = new Uint8Array(width * height)
    this.blocked = STEPS.map(() => new Uint8Array(width * height))
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  setSolid(x: number, y: number): void {
    if (this.inside(x, y)) this.solid[x + y * this.width] = 1
  }

  isSolid(x: number, y: number): boolean {
    return !this.inside(x, y) || this.solid[x + y * this.width] === 1
  }

  /** Close one boundary from both sides, so no fill can cross it either way. */
  private close(x: number, y: number, dir: number): void {
    const [dx, dy] = STEPS[dir]
    const back = dir ^ 1
    if (this.inside(x, y)) this.blocked[dir][x + y * this.width] = 1
    if (this.inside(x + dx, y + dy)) this.blocked[back][x + dx + (y + dy) * this.width] = 1
  }

  apply(x: number, y: number, fence: Fence): void {
    switch (fence) {
      case 'tile':
        this.setSolid(x, y)
        break
      case 'left':
        this.close(x, y, 0)
        break
      case 'right':
        this.close(x, y, 1)
        break
      case 'up':
        this.close(x, y, 2)
        break
      case 'none':
        break
    }
  }

  canLeave(x: number, y: number, dir: number): boolean {
    return this.blocked[dir][x + y * this.width] === 0
  }
}

/**
 * The floor's movement graph, with the gate treated as intact.
 *
 * A solid-tile theme reads straight off the tile grid, and deliberately without
 * `OVERHANG_ROWS`: over-stating where the player can walk is the safe direction
 * here, because it can only ever find *more* ways around a gate than exist. A
 * fence theme is read off its wall doodads instead, since there a wall tile is
 * somewhere the player stands.
 */
function passabilityOf(level: Level, ctx: GenerationContext): Passability {
  const { width, height } = level
  const pass = new Passability(width, height)
  const fenced = getTheme(level.theme)?.directionalFences === true

  if (fenced) {
    for (const d of ctx.doodads) {
      pass.apply(d.x, d.y, FENCE[d.type] ?? 'none')
    }
  } else {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (level.tileArray[x + y * width].wall) pass.setSolid(x, y)
      }
    }
  }

  // The gate itself. Its pieces stand on corridor floor, so on a solid theme
  // they are the one thing the tile grid does not already carry; on a fence
  // theme they were applied above with every other doodad, and blocking their
  // tile outright here would make the barrier stronger than the art really is.
  //
  // `need-sync` marks a doodad whose runtime changes replicate, which is not the
  // same as "blocks the player" — the button carries it too, for its *state*.
  // It is a plate the party stands on, not a barrier, so counting it here
  // would invent an obstacle, and an invented obstacle shrinks the reachable
  // set: this check would start passing floors it should reject. Both plates
  // are excluded — the lock's `BossDoorButton` and the mystery buttons'
  // `TriggerButton` (issue #67), which today are placed after this check runs
  // but must never become obstacles should that order change.
  if (!fenced) {
    for (const d of ctx.doodads) {
      if (d.needSync && d.type !== 'BossDoorButton' && d.type !== 'TriggerButton') pass.setSolid(d.x, d.y)
    }
  }

  return pass
}

/** Tiles reachable from `start`. */
function fill(pass: Passability, start: number): Uint8Array {
  const { width, height } = pass
  const seen = new Uint8Array(width * height)
  const stack = [start]
  seen[start] = 1
  for (let guard = 0; stack.length > 0 && guard < width * height; guard++) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = Math.trunc(idx / width)
    for (let dir = 0; dir < STEPS.length; dir++) {
      const nx = x + STEPS[dir][0]
      const ny = y + STEPS[dir][1]
      if (pass.isSolid(nx, ny) || !pass.canLeave(x, y, dir)) continue
      const nIdx = nx + ny * width
      if (seen[nIdx]) continue
      seen[nIdx] = 1
      stack.push(nIdx)
    }
  }
  return seen
}

/** A tile at or beside `(x, y)` the player could stand on, or null. */
function standing(pass: Passability, x: number, y: number): number | null {
  const tx = Math.trunc(x)
  const ty = Math.trunc(y)
  for (const [dx, dy] of [[0, 0] as const, ...STEPS]) {
    if (!pass.isSolid(tx + dx, ty + dy)) return tx + dx + (ty + dy) * pass.width
  }
  return null
}

/**
 * Close every locked door on the floor.
 *
 * The other half of the same promise: the chance-gated locks bar their room with
 * a door rather than a destructible wall, off the same `passages[0]` and so with
 * the same blind spot. A door is a solid one-tile-wide collider standing on
 * corridor floor; how far it reaches *up* differs by variant, and that is the
 * whole of the difference between the two door assets:
 *
 *   `door_a_*_h_v2`  y -16..0 px  -> its own row and the one above
 *   `door_a_*_v`     y -32..+8 px -> its own row and the two above
 *
 * Blocking every door, not just the orb's, is deliberate: any route to the orb
 * that crosses *any* door is a gated route, which is what is being asked.
 */
function closeDoors(pass: Passability, ctx: GenerationContext): boolean {
  let any = false
  for (const item of ctx.items) {
    if (item.type !== 'Door') continue
    any = true
    // DOORS is three horizontal variants then three vertical ones
    const rows = item.index >= 3 ? 3 : 2
    const x = Math.trunc(item.x)
    for (let up = 0; up < rows; up++) pass.setSolid(x, item.y - up)
  }
  return any
}

/**
 * True when the floor's gate holds — the orb cannot be reached without opening
 * it — or when there is nothing to check.
 *
 * Must run after `buildTileArray` and `buildWalls`: the fence model reads the
 * wall doodads, which do not exist until the pattern matcher has placed them.
 */
export function sealHolds(level: Level, ctx: GenerationContext): boolean {
  // Only when the floor claims the orb is gated. `lockFinalRoom: false` leaves it
  // deliberately open, and the chance-rolled locks elsewhere on the floor still
  // put doors down — demanding the orb sit behind one of *those* would reject
  // every honest floor until a lucky roll buried it by accident.
  const orbRoom = level.rooms.find((r) => r.type === 'Orb')
  if (orbRoom === undefined || !orbRoom.locked) return true

  const entrance = ctx.objectSets.find((s) => s.type === 'ExitUp')
  const goal = ctx.objectSets.find((s) => s.type === 'Orb' || s.type === 'BossPortal')
  if (entrance === undefined || goal === undefined) return true

  const pass = passabilityOf(level, ctx)
  closeDoors(pass, ctx)

  // the same row `prefabTarget` uses for a stair prefab: the marker row, the
  // first one the player can actually stand on
  const from = standing(pass, entrance.x + 3, entrance.y + 4)
  const to = standing(pass, goal.x, goal.y)
  if (from === null || to === null) return true // nothing to walk between

  return fill(pass, from)[to] === 0
}
