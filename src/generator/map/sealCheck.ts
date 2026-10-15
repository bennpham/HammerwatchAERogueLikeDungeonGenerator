import type { Level } from './level'
import type { GenerationContext } from '../core/context'

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

type Fence = 'tile' | 'left' | 'right' | 'up' | 'none'

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
 * The floor's movement graph with the gate treated as intact: solid tiles off
 * the grid (AE walls are whole-cell colliders on their footprint, so the grid
 * is the truth), plus every seal wall piece, which stands on corridor floor.
 * Buttons are plates the party stands on and never count.
 */
function passabilityOf(level: Level, ctx: GenerationContext): Passability {
  const { width, height } = level
  const pass = new Passability(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (level.tileArray[x + y * width].wall && !level.tileArray[x + y * width].reserved) pass.setSolid(x, y)
    }
  }
  for (const d of ctx.doodads) {
    if (d.blocking) pass.setSolid(Math.trunc(d.x), Math.trunc(d.y))
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
 * Close every locked door on the floor — any route to the orb that crosses
 * ANY door is a gated route, which is what is being asked.
 */
function closeDoors(pass: Passability, ctx: GenerationContext): boolean {
  let any = false
  for (const item of ctx.items) {
    if (item.type !== 'Door') continue
    any = true
    // the cells it closes (room.ts records them); a door piece without them is
    // the one-cell kind, anchored one row below the cell it blocks
    for (const [x, y] of item.blocks ?? [[Math.trunc(item.x), item.y - 1]]) pass.setSolid(x, y)
  }
  return any
}

/**
 * True when the floor's gate holds — the orb cannot be reached without opening
 * it — or when there is nothing to check.
 *
 * Must run after `buildTileArray`.
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

  // the same cell `prefabTarget` uses: the floor in front of the stairs
  const from = standing(pass, entrance.x + 3, entrance.y + 2)
  const to = standing(pass, goal.x, goal.y)
  if (from === null || to === null) return true // nothing to walk between

  return fill(pass, from)[to] === 0
}
