/**
 * Timed wall-trap windows — `boss/traps.ts` re-keyed to the clock.
 *
 * Each entry is an ordinary `BossTrap` row (projectile, the wall it fires away
 * from, spread, rate, how many spewers) plus a start and an end:
 *
 *   ProjectileSpewer × count, on the innermost floor tile of their wall   (ships disabled)
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        ├─ delay startSeconds*1000 ─> ToggleElement{state: 0} × count  (on)
 *        └─ delay   endSeconds*1000 ─> ToggleElement{state: 1} × count  (off)
 *
 * Placement is `boss/traps.ts`'s own `wallSlots` — the same corner margins,
 * entrance strip, alcove mouth, pillar and spacing exclusions, and the same
 * per-wall pool carried across every entry so two windows cannot crowd one
 * tile. Reusing it rather than re-deriving it is deliberate: every one of those
 * exclusions is a playtest scar, and a second copy would drift.
 *
 * Like the buff windows and unlike the boss tiers, **windows do not replace one
 * another**: two overlapping windows both fire. Each entry owns one on pair and
 * one off pair over its own spewers, and no entry knows about any other.
 *
 * **This is the only survival rig that draws.** One `ctx.bossRand.iRand` per
 * *placed* spewer, via `takeSlot` — a copy the pool cannot place draws nothing.
 * Two consequences, both load-bearing and both inherited from the boss rig:
 *
 * 1. It must return **before touching the stream** when no entry is usable.
 *    That is what keeps an untrapped survival arena from moving the arenas
 *    after it in `ctx.bossRand`.
 * 2. `arena.ts` calls it after every layout draw — size, alcove wall, cover,
 *    food — so arming traps cannot move the arena's geometry. It is not last
 *    overall: `getArenaXML` rolls floor-tile variants afterwards, so traps do
 *    shift those cosmetics, exactly as they do in a boss arena.
 */

import type { GenerationContext } from '../core/context'
import type { BossTrapDirection, SurvivalTrap } from '../config/parameters'
import type { ProjectileDef } from '../objects/projectileTypes'
import { projectileById } from '../objects/projectileTypes'
import { NodeGlobalEventTrigger, NodeProjectileSpewer, NodeToggleElement } from '../objects/nodes'
import type { TrapArena } from '../boss/traps'
import { wallSlots } from '../boss/traps'
import type { Slot } from '../traps/slots'
import { SPEWER_DIRECTION, TILE_CENTRE, WALLS, takeSlot } from '../traps/slots'

/**
 * Builds the arena's timed trap windows. Emits nothing at all — not one node,
 * not one id, and not one RNG draw — when no entry is usable.
 *
 * An entry naming an unknown projectile, or asking for no spewers, is skipped
 * rather than thrown on; `config/validation.ts` is the gate.
 */
export function buildSurvivalTrapRig(
  ctx: GenerationContext,
  entries: readonly SurvivalTrap[],
  arena: TrapArena,
  clock: NodeGlobalEventTrigger
): void {
  const usable: { def: ProjectileDef; row: SurvivalTrap }[] = entries.flatMap((row) => {
    const def = projectileById(row.projectile)
    return def === undefined || row.count < 1 ? [] : [{ def, row }]
  })
  // Must come before any bossRand draw — see the file header's RNG note.
  if (usable.length === 0) return

  // One pool per wall, consumed across every window so no two spewers crowd.
  const pools = new Map<BossTrapDirection, Slot[]>()
  for (const wall of WALLS) pools.set(wall, wallSlots(arena, wall))

  const col = arena.width + 1
  let markerRow = 0

  for (const { def, row } of usable) {
    const pool = pools.get(row.direction)
    // An unknown direction cannot reach here — validation rejects it and the
    // type only admits four — but a missing pool must not throw.
    if (pool === undefined) continue

    const spewers: NodeProjectileSpewer[] = []
    for (let copy = 0; copy < row.count; copy++) {
      // Pool exhausted: stop placing this row rather than stacking spewers on
      // one tile. No draw is made, which keeps the stream tied to the number of
      // spewers actually placed.
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
      // Ships disabled (the node's own default) — its own ToggleElement
      // switches it on, even for a window that opens at 0 seconds.
      spewers.push(spewer)
    }

    if (spewers.length === 0) continue

    // Toggle nodes are parked just outside the arena — cosmetic editor markers
    // only. The spewers above are the nodes whose position matters.
    for (const spewer of spewers) {
      markerRow += 1
      const on = new NodeToggleElement(ctx, col, markerRow)
      on.state = 0 // 0 enables the target element
      on.connectToElement(spewer)
      clock.connectTo(on, row.startSeconds * 1000)
    }

    for (const spewer of spewers) {
      markerRow += 1
      const off = new NodeToggleElement(ctx, col, markerRow)
      off.state = 1 // 1 disables the target element
      off.connectToElement(spewer)
      clock.connectTo(off, row.endSeconds * 1000)
    }
  }
}
