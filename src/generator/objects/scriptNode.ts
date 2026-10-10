import type { GenerationContext } from '../core/context'
import type { Param } from '../ae/model'

/**
 * One Anniversary Edition WorldScript in a generated level.
 *
 * Positions are in generator TILES (16 px) like every other object, and turn
 * into pixels when the level is emitted. A script's position is editor
 * placement only — except for scripts that act where they stand
 * (`SpawnUnit`, `ProjectileSpewer`, `SpawnEffect`), where it is the spot.
 *
 * Ids come from `ctx.idCounter`, the single per-level counter every unit also
 * draws from: AE resolves `Areas`/`Units`/`Scripts`/`OnTrue` arrays against
 * units and scripts alike, so the two id spaces must never overlap.
 *
 * Subclasses override `params()` and read their targets' ids at EMIT time, so
 * a node can be wired to things created after it.
 */
export class ScriptNode {
  id: number
  enabled = true
  /** -1 = unlimited */
  triggerTimes = -1
  executeOnStart = false
  /** editor comment; templates find their slots by it */
  label?: string
  /** scripts this one fires, with a delay in ms each */
  connections: Array<{ node: ScriptNode; delayMs: number }> = []

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public cls: string
  ) {
    this.id = ctx.idCounter++
    ctx.scriptNodes.push(this)
  }

  /** Fire `n` when this script runs, after `delayMs` (0 = immediately). */
  connectTo(n: ScriptNode, delayMs = 0): void {
    this.connections.push({ node: n, delayMs })
  }

  /** The script's parameter dict, resolved at emit time. */
  params(): Param[] {
    return []
  }
}

/**
 * A trigger area: an AE `:Physics_Rectangle` (or `:Physics_Circle`) sensor
 * unit that `AreaTrigger`, `UseTrigger`, `AllPlayersArea`, `ShopArea`-users
 * and `DangerArea` name in their `Areas`. Replaces HW1's `RectangleShape`
 * script node — in AE a shape is a unit, not a script.
 *
 * `x`/`y` are the CENTRE, in tiles, which is how AE anchors rectangles
 * [VERIFIED] (the stock exit sensor sits at exit anchor + (32, 8) for a 32×16
 * box). `width`/`height` are in tiles; `radius` (tiles) makes it a circle.
 */
export class SensorShape {
  id: number
  width = 1
  height = 1
  radius?: number
  /**
   * Who the area is meant for, as AE filter flags (2 players, 4 enemies, 6
   * both). AE filters on the trigger, not the shape, so a DangerArea reads
   * this from its first area; HW1 kept the same mask on the shape itself.
   */
  types?: number

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number
  ) {
    this.id = ctx.idCounter++
    ctx.sensors.push(this)
  }
}
