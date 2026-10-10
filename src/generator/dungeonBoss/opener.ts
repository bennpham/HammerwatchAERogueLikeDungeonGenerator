/**
 * What opens the way out of a dungeon boss floor.
 *
 * The floor's gateway room is sealed by the same destructible wall the button
 * rig uses (`map/buttonSeal.ts`'s `sealRoomWall`), but with no button: the key
 * is the boss's death.
 *
 *   GlobalEventTrigger("Boss Died") -> DestroyObject -> the wall pieces
 *
 * Which is, line for line, what `boss/arena.ts` wires to its alcove seals. The
 * announce line is this rig's own, because a floor has no other signal that
 * something across the map just opened.
 *
 * A floor that is also LOCKED (issue #69) needs the boss and its button both:
 * the death trigger and the button's AreaTrigger each count down one shared
 * Variable, and the wall comes down off that countdown instead.
 *
 * Draws no random values.
 */

import type { GenerationContext } from '../core/context'
import type { Doodad } from '../objects/doodad'
import { NodeAnnounceText, NodeDestroyObject, NodeGlobalEventTrigger } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'
import { buildCountdown } from '../boss/tierSource'

/** The engine event a boss actor fires on death. Shared with boss/waves.ts's tier names. */
export const BOSS_DIED_EVENT = 'Boss Died'

/** What the party is told when the wall comes down. */
export const OPENED_TEXT = 'The boss is dead — the way onward has opened!'

/**
 * Pluralised for a multi-boss floor (issue #64 part 1) — the seal opens once
 * every boss on the floor has died, not just one.
 */
export const OPENED_TEXT_MULTI = 'The bosses are dead — the way onward has opened!'

/**
 * For a floor that is locked AND hosts a boss (issue #69): the wall opens on
 * whichever of the boss's death and the button press comes last.
 */
export const OPENED_TEXT_COMBINED = 'The way onward has opened!'

/** How long that line stays on screen, in ms. */
export const OPENED_ANNOUNCE_MS = 2500

/**
 * Subtitle (1 — the editor lists 0 Title, 1 Subtitle, 2 Regular, 3 Pickup):
 * the global announcement, the style `buttonSeal.ts` uses for the same
 * message, and off the Regular line a floor timer ticks on.
 */
export const OPENED_TEXT_TYPE = 1

/**
 * Wires the floor's seals to the boss's death. Emits nothing when there is
 * nothing to destroy — a node must never ship an empty `connections` array.
 */
export function buildFloorBossOpener(
  ctx: GenerationContext,
  seals: readonly Doodad[],
  x: number,
  y: number,
  /**
   * The "all bosses died" CheckVariable, for a multi-boss floor (issue #64 part 1) —
   * built once by `boss/tierSource.ts`'s `buildAllBossesDied` and passed in so
   * this opener connects from it instead of its own `Boss Died`
   * GlobalEventTrigger. Omitted (the default) reproduces exactly the
   * single-boss wiring this rig has always built.
   */
  deathTrigger?: ScriptNode,
  bossCount = 1,
  /**
   * The `AreaTrigger`s of the floor's buttons when it is also locked (issue
   * #69) — `Level.sealButtons`. Non-empty puts the boss's death and every
   * press into one countdown (`buildCountdown`) and opens the wall off that
   * instead. Empty (the default) is the boss-only rig, unchanged.
   */
  buttons: readonly ScriptNode[] = []
): void {
  if (seals.length === 0) return

  const death = deathTrigger ?? new NodeGlobalEventTrigger(ctx, x, y, BOSS_DIED_EVENT)
  // Below the all-died rig's own rows (one per boss, from y + 1), so the two
  // countdowns' editor markers do not sit on top of each other.
  const trigger = buttons.length > 0 ? buildCountdown(ctx, [death, ...buttons], x + 3, y) : death

  // Cosmetic placement, on the wall it destroys — the same choice buttonSeal
  // makes for its own DestroyObject.
  const mid = seals[Math.trunc(seals.length / 2)]
  const destroy = new NodeDestroyObject(ctx, mid.x, mid.y)
  for (const seal of seals) destroy.connectDoodad(seal)
  trigger.connectTo(destroy)

  const announce = new NodeAnnounceText(ctx, x, y + 1)
  // With buttons in the count, whichever of boss or button came last opened
  // it, so the line names neither.
  announce.setText(buttons.length > 0 ? OPENED_TEXT_COMBINED : bossCount > 1 ? OPENED_TEXT_MULTI : OPENED_TEXT)
  announce.time = OPENED_ANNOUNCE_MS
  announce.textType = OPENED_TEXT_TYPE
  trigger.connectTo(announce)
}
