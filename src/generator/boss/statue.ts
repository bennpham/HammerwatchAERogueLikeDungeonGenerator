/**
 * The statue an `immortal` boss stands behind: today only the wraith.
 *
 * `wraith.inc` sets `immortal` true, so every hit on the wraith deals 0 and
 * shows "immortal". Stock (`hwr/boss_armory.lvl`) pairs each wraith with a
 * statue and clears the immortality when the statue dies. So do we:
 *
 *   UnitDestroyedTrigger(statue)
 *     ├─ ToggleImmortality{off}(wraith)
 *     └─ ToggleScripts{enable}(timer)
 *   TimerTrigger(every 1000 ms, starts off) → ToggleImmortality{off}(wraith)
 *   ActorHealthTrigger(wraith < 90%) ─┐
 *   UnitDestroyedTrigger(wraith) ─────┴→ ToggleScripts{disable}(timer)
 *
 * The timer is there because the wraith turns `immortal` back on by itself.
 * It starts in `state_wraith_intro`, and its first switch to `state_default`
 * re-applies the flag (`StateActorBehavior.SetState` calls
 * `SetActorProperties`). The switch comes after 1020 ms of the wraith
 * updating, and it updates only while a player is within its 400 px max
 * range. A statue broken before that would leave the wraith immortal for good;
 * stock guards the same race with a `CheckFlag` 2000 ms after the spawn.
 * Clearing the flag every second until the wraith has really been hurt covers
 * any timing. It stops above the invulnerability rig's first window (75%), so
 * it never cuts a window short, and on the wraith's death, so it never
 * toggles a dead unit (`ToggleImmortality` casts without a null check).
 * Placement (`statueSlot` on a floor, `arenaStatueSpot` here) also keeps the
 * statue within `STATUE_MAX_GAP` tiles, so the party at the statue is in the
 * wraith's range.
 *
 * Stock also wires `SetDamageTransfer` from the statue to the wraith. It is
 * left out: it forwards the statue's hits to a wraith that is still immortal,
 * so it does nothing.
 *
 * Draws nothing. Allocates ids only for a boss whose def carries `statue`.
 */

import type { GenerationContext } from '../core/context'
import type { Monster as MonsterInstance } from '../objects/monster'
import { Monster } from '../objects/monster'
import {
  NodeActorHealthTrigger,
  NodeObjectEventTrigger,
  NodeTimerTrigger,
  NodeToggleElement,
  NodeToggleImmortality
} from '../objects/nodes'
import type { BossDef } from './bosses'
import { ANCHOR_INSET, NORTH_ANCHOR_INSET } from './anchors'

/** How often the timer clears the boss's immortality once the statue is down. */
export const STATUE_RETOGGLE_MS = 1000

/** The boss's health below which the timer stops: above the first invulnerability window (75%). */
export const STATUE_RETOGGLE_UNTIL = 0.9

/**
 * The most tiles (Chebyshev) a statue stands from its boss: 96 px, so a party
 * breaking it is well inside the wraith's 400 px update range.
 */
export const STATUE_MAX_GAP = 6

/** An arena statue's aim, in tiles north of the boss and across. */
const STATUE_ARENA_OFFSET = 4

/**
 * Places `def`'s statue at `(x, y)` and wires its death to clear `boss`'s
 * immortality. Returns the statue, or null (allocating nothing) when the boss
 * has no statue.
 *
 * `(markerX, markerY)` is a cosmetic origin for the editor nodes only.
 */
export function buildBossStatue(
  ctx: GenerationContext,
  def: BossDef,
  boss: MonsterInstance,
  x: number,
  y: number,
  markerX: number,
  markerY: number
): MonsterInstance | null {
  if (def.statue === undefined) return null

  const statue = Monster.create(
    ctx,
    x,
    y,
    { id: `${def.id}_statue`, configKey: '', tiers: [def.statue.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Mini-bosses' },
    0
  )

  const mortal = (row: number): NodeToggleImmortality => {
    const node = new NodeToggleImmortality(ctx, markerX, markerY + row)
    node.immortal = false
    node.setTarget(boss)
    return node
  }

  const destroyed = new NodeObjectEventTrigger(ctx, markerX, markerY)
  destroyed.connectObject(statue)
  destroyed.triggerTimes = 1
  destroyed.connectTo(mortal(1))

  const timer = new NodeTimerTrigger(ctx, markerX, markerY + 2, STATUE_RETOGGLE_MS)
  timer.connectTo(mortal(3))
  const start = new NodeToggleElement(ctx, markerX, markerY + 4)
  start.action = 'enable'
  start.connectToElement(timer)
  destroyed.connectTo(start)

  const stop = new NodeToggleElement(ctx, markerX, markerY + 5)
  stop.action = 'disable'
  stop.connectToElement(timer)
  new NodeActorHealthTrigger(ctx, markerX, markerY + 6, [boss], STATUE_RETOGGLE_UNTIL).connectTo(stop)
  const bossDied = new NodeObjectEventTrigger(ctx, markerX, markerY + 7)
  bossDied.connectObject(boss)
  bossDied.triggerTimes = 1
  bossDied.connectTo(stop)

  return statue
}

/**
 * Where a boss's statue stands in an arena: the free interior tile nearest a
 * point `STATUE_ARENA_OFFSET` tiles north of the boss and as many across, on
 * the side away from the alcove (east when the alcove is W, else west). Free
 * means inside the anchor insets, two tiles from every anchor and every other
 * statue, and a tile clear of the entrance and every boss's footprint. A tile
 * within `STATUE_MAX_GAP` of the boss always beats one past it, which only a
 * crowded multi-boss arena falls back to. Ties go to the first in row-major
 * order. Draws nothing; null only for an arena too small to fit one.
 *
 * Interior coordinates as in anchors.ts. The caller adds the statue to the
 * cover arena's `bosses`, so pillars and food keep off it and its neighbours
 * stay reachable.
 */
export function arenaStatueSpot(
  arena: { width: number; height: number; alcoveWall: 'N' | 'E' | 'W' },
  boss: { x: number; y: number },
  anchors: ReadonlyArray<{ x: number; y: number }>,
  entrance: { x: number; y: number; width: number; height: number },
  bosses: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
  statues: ReadonlyArray<{ x: number; y: number }>
): { x: number; y: number } | null {
  const { width, height } = arena
  const side = arena.alcoveWall === 'W' ? 1 : -1
  const want = { x: boss.x + side * STATUE_ARENA_OFFSET, y: boss.y - STATUE_ARENA_OFFSET }

  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = NORTH_ANCHOR_INSET; y <= height - 1 - ANCHOR_INSET; y++) {
    for (let x = ANCHOR_INSET; x <= width - 1 - ANCHOR_INSET; x++) {
      if (anchors.some((a) => chebyshev(a, { x, y }) < 2)) continue
      if (statues.some((s) => chebyshev(s, { x, y }) < 2)) continue
      if (within(entrance, x, y, 1)) continue
      if (bosses.some((b) => within({ x: b.x - b.width / 2, y: b.y - b.height / 2, width: b.width, height: b.height }, x, y, 1))) continue
      const d = (x - want.x) ** 2 + (y - want.y) ** 2 + (chebyshev(boss, { x, y }) > STATUE_MAX_GAP ? 1e9 : 0)
      if (d < bestD) {
        best = { x, y }
        bestD = d
      }
    }
  }
  return best
}

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(Math.round(a.x) - b.x), Math.abs(Math.round(a.y) - b.y))
}

/** Whether tile (x, y) touches `rect` grown by `margin` tiles. */
function within(rect: { x: number; y: number; width: number; height: number }, x: number, y: number, margin: number): boolean {
  return x + 1 > rect.x - margin && x < rect.x + rect.width + margin && y + 1 > rect.y - margin && y < rect.y + rect.height + margin
}
