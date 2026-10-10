/**
 * Timed buff windows — `boss/waveBuffs.ts` re-keyed to the clock.
 *
 * Each entry is one whole-arena aura with a start and an end:
 *
 *   RectangleShape(whole arena, types = players | monsters | both)
 *        └─ DangerArea{damage: 0, freq: BUFF_REFRESH_MS, buff: <path>}   (ships disabled)
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        ├─ delay startSeconds*1000 ─> ToggleElement{state: 0}  (on)
 *        └─ delay   endSeconds*1000 ─> ToggleElement{state: 1}  (off)
 *
 * The one real difference from the boss rig: **windows do not replace one
 * another.** A boss tier switches the previous tier's whole set off as it
 * switches its own on, because tiers are phases of one fight. A survival
 * window is a span on a timeline, so two overlapping windows both apply and
 * each owns exactly one on/off pair. That also means a window needs no
 * knowledge of any other — nothing here carries state between entries.
 *
 * Every field ships `enabled: false` (the node's own default) even when it
 * opens at 0 seconds, because its ToggleElement fires at delay 0 and switches
 * it on. The boss rig's tier 0 is the opposite case — it has no trigger at all,
 * so it must arrive live.
 *
 * Draws no random values from any stream.
 */

import type { GenerationContext } from '../core/context'
import type { BuffTarget, SurvivalBuff } from '../config/parameters'
import { BUFF_REFRESH_MS, BUFF_TARGET_TYPES } from '../config/parameters'
import type { BuffDef } from '../objects/buffTypes'
import { buffById } from '../objects/buffTypes'
import { coveringShape } from '../map/coverShape'
import { NodeDangerArea, NodeGlobalEventTrigger, NodeToggleElement } from '../objects/nodes'

/**
 * Builds the arena's timed buff windows. Emits nothing at all when no entry is
 * usable. An entry naming an unknown buff is skipped rather than thrown on;
 * `config/validation.ts` is the gate.
 */
export function buildSurvivalBuffRig(
  ctx: GenerationContext,
  entries: readonly SurvivalBuff[],
  arenaWidth: number,
  arenaHeight: number,
  clock: NodeGlobalEventTrigger,
  x: number,
  y: number
): void {
  const usable: { def: BuffDef; target: BuffTarget; startSeconds: number; endSeconds: number }[] = entries.flatMap(
    (entry) => {
      const def = buffById(entry.buff)
      return def === undefined
        ? []
        : [{ def, target: entry.target, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds }]
    }
  )
  if (usable.length === 0) return

  let row = y
  for (const entry of usable) {
    const shape = coveringShape(ctx, arenaWidth, arenaHeight, BUFF_TARGET_TYPES[entry.target])

    row += 1
    const field = new NodeDangerArea(ctx, x, row)
    field.damage = 0
    field.freqMs = BUFF_REFRESH_MS
    field.buff = entry.def.path
    field.connectToShape(shape)
    // Ships disabled — its own ToggleElement switches it on, even at 0 seconds.

    row += 1
    const on = new NodeToggleElement(ctx, x, row)
    on.state = 0 // 0 enables the target element
    on.connectToElement(field)
    clock.connectTo(on, entry.startSeconds * 1000)

    row += 1
    const off = new NodeToggleElement(ctx, x, row)
    off.state = 1 // 1 disables the target element
    off.connectToElement(field)
    clock.connectTo(off, entry.endSeconds * 1000)
  }
}
