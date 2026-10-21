/**
 * The statue an `immortal` boss stands behind: today only the wraith.
 *
 * `wraith.inc` sets `immortal` true, so every hit on the wraith deals 0 and
 * shows "immortal". Stock (`hwr/boss_armory.lvl`) pairs each wraith with a
 * statue and clears the immortality when the statue dies:
 *
 *   UnitDestroyedTrigger(statue)
 *     ├─ delay 0      ToggleImmortality{off}(wraith)
 *     └─ delay 2000   ToggleImmortality{off}(wraith)   (a second node)
 *
 * The second toggle is stock's own guard (its `CheckFlag` 2000 ms after the
 * wraith spawns). The wraith starts in `state_wraith_intro`, and its first
 * switch to `state_default` re-applies `immortal` (`StateActorBehavior.SetState`
 * calls `SetActorProperties`). A statue broken before that switch would
 * otherwise leave the wraith immortal again.
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
import { NodeObjectEventTrigger, NodeToggleImmortality } from '../objects/nodes'
import type { BossDef } from './bosses'
import { ANCHOR_INSET, NORTH_ANCHOR_INSET } from './anchors'

/** The delay of the second toggle: stock's 2000 ms, past the wraith's 1020 ms intro. */
export const STATUE_RETOGGLE_MS = 2000

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

  const destroyed = new NodeObjectEventTrigger(ctx, markerX, markerY)
  destroyed.connectObject(statue)
  destroyed.triggerTimes = 1
  // Two nodes rather than one linked twice: stock never lists one target twice.
  for (const [row, delayMs] of [[1, 0], [2, STATUE_RETOGGLE_MS]] as const) {
    const mortal = new NodeToggleImmortality(ctx, markerX, markerY + row)
    mortal.immortal = false
    mortal.setTarget(boss)
    destroyed.connectTo(mortal, delayMs)
  }

  return statue
}

/**
 * Where a boss's statue stands in an arena: the free interior tile nearest a
 * point a quarter of the arena north of the boss and a quarter across, on the
 * side away from the alcove (east when the alcove is W, else west). Free means
 * inside the anchor insets, two tiles from every anchor and every other
 * statue, and a tile clear of the entrance and every boss's footprint. Ties go
 * to the first in row-major order. Draws nothing; null only for an arena too
 * small to fit one.
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
  const want = { x: boss.x + side * Math.trunc(width / 4), y: boss.y - Math.trunc(height / 4) }

  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = NORTH_ANCHOR_INSET; y <= height - 1 - ANCHOR_INSET; y++) {
    for (let x = ANCHOR_INSET; x <= width - 1 - ANCHOR_INSET; x++) {
      if (anchors.some((a) => chebyshev(a, { x, y }) < 2)) continue
      if (statues.some((s) => chebyshev(s, { x, y }) < 2)) continue
      if (within(entrance, x, y, 1)) continue
      if (bosses.some((b) => within({ x: b.x - b.width / 2, y: b.y - b.height / 2, width: b.width, height: b.height }, x, y, 1))) continue
      const d = (x - want.x) ** 2 + (y - want.y) ** 2
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
