/**
 * What opens the way out of a survival arena.
 *
 * A boss arena's alcove is sealed by three `need-sync` wall doodads across its
 * mouth, destroyed when the boss dies (`boss/arena.ts`):
 *
 *   GlobalEventTrigger("Boss Died") ─> DestroyObject ─> the three seals
 *
 * A survival arena has no boss to die, so the same three seals come down on the
 * clock instead — which is the whole feature, and is a four-line difference:
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        └─ delay seconds*1000 ─> DestroyObject ─> the three seals
 *
 * The seal set is identical either way, and so is everything downstream of it:
 * the mouth tiles are already floored so the doorway has ground once the seals
 * are gone, and the fence-theme flank pieces are deliberately neither
 * `need-sync` nor in the destroy list.
 *
 * Draws no random values from any stream.
 */

import type { GenerationContext } from '../core/context'
import type { Doodad } from '../objects/doodad'
import { NodeDestroyObject, NodeGlobalEventTrigger } from '../objects/nodes'

/**
 * Wires the alcove seals to the clock. Emits nothing when there is nothing to
 * destroy — a node must never ship an empty `connections` array.
 */
export function buildSurvivalOpener(
  ctx: GenerationContext,
  seals: readonly Doodad[],
  seconds: number,
  clock: NodeGlobalEventTrigger,
  x: number,
  y: number
): void {
  if (seals.length === 0) return

  const destroy = new NodeDestroyObject(ctx, x, y)
  for (const seal of seals) destroy.connectDoodad(seal)
  clock.connectTo(destroy, seconds * 1000)
}
