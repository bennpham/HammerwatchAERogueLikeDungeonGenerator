/**
 * Timer mode: the per-floor timed hazard.
 *
 * A floor with its timer on gives the party a countdown. When it runs out, a
 * DangerArea covering the whole map switches on and starts ticking `damage`
 * every `freqMs` milliseconds. A **negative** damage heals instead, so the same
 * rig covers "the floor turns hostile" and "the floor starts healing you".
 *
 * The rig, ported from the hand-authored test_damage_player_timer.xml:
 *
 *   RectangleShape(types: 1, whole map)          // players only, not monsters
 *   DangerArea{enabled: False, damage, freq, buff: ""} -> that shape
 *   GlobalEventTrigger("LevelLoaded")
 *        ├─ delay 0                AnnounceText "3:00"
 *        ├─ delay 1000             AnnounceText "2:59"
 *        ├─ ...                    (one node per second)
 *        ├─ delay seconds*1000     AnnounceText "0:00"
 *        └─ delay seconds*1000     ToggleElement{state: 0} -> the DangerArea
 *
 * `state: 0` ENABLES the target — the same inverted polarity NodeToggleElement
 * documents, re-confirmed against the shipped prefabs/trap_fire_floor.xml, where
 * area-enter sends state 0 and area-exit sends state 1.
 *
 * Like waves.ts and invulnerability.ts this module draws **no** random values
 * from any stream and writes no XML directly — the nodes self-register on
 * `ctx.scriptNodes` and Level.getXML() drains them. It runs after the floor is
 * fully built, so every dungeon id is already allocated and the rig only appends
 * ids: a seed's dungeon is untouched whether the timer is on or off.
 */

import type { GenerationContext } from '../core/context'
import type { FloorTimer } from '../config/parameters'
import { COUNTDOWN_TEXT_TYPE, TICK_DISPLAY_MS, formatCountdown } from '../core/countdown'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { COVER_MARGIN, coveringShape } from '../map/coverShape'
import {
  NodeAnnounceText,
  NodeDangerArea,
  NodeGlobalEventTrigger,
  NodeToggleElement
} from '../objects/nodes'

/**
 * RectangleShape's entity-type bitmask, players only. The shipped
 * prefabs/bonus_field_confuse.xml uses 1 for a player-only field and
 * prefabs/trap_fire_floor.xml uses 15 for one that catches everything.
 */
const PLAYERS_ONLY = 1

/**
 * Builds one floor's hazard rig. Emits nothing at all — not one node, not one
 * id — when the floor has no timer or its timer is off, so a disabled feature
 * leaves the level byte-identical.
 *
 * `mapWidth`/`mapHeight` are the floor's tile dimensions; map array coordinates
 * are world coordinates, and a RectangleShape's position is its **centre** (see
 * the 3x3 BossPortal shape in objects/objectSet.ts).
 */
export function buildFloorHazardRig(
  ctx: GenerationContext,
  timer: FloorTimer | undefined,
  mapWidth: number,
  mapHeight: number
): void {
  if (timer === undefined || !timer.enabled) return

  // The nodes are placed off the east edge of the map, one column, one row per
  // node — cosmetic editor markers only, nothing about the rig is positional.
  const col = mapWidth + COVER_MARGIN
  let row = 0

  const shape = coveringShape(ctx, mapWidth, mapHeight, PLAYERS_ONLY)

  const hazard = new NodeDangerArea(ctx, col, row)
  hazard.damage = timer.damage
  hazard.freqMs = timer.freqMs
  hazard.connectToShape(shape)

  row += 1
  const trigger = new NodeGlobalEventTrigger(ctx, col, row, LEVEL_LOADED_EVENT)

  const windowMs = timer.seconds * 1000

  if (timer.countdown) {
    // Counts the window down inclusively: `seconds` at delay 0 through "0:00" at
    // the moment the hazard switches on, so the party sees the number it is
    // waiting on and then sees it hit zero. Same shape as the boss arena's
    // invulnerability countdown.
    for (let remaining = timer.seconds; remaining >= 0; remaining--) {
      row += 1
      const tick = new NodeAnnounceText(ctx, col, row)
      tick.setText(formatCountdown(remaining))
      tick.time = TICK_DISPLAY_MS
      tick.textType = COUNTDOWN_TEXT_TYPE
      trigger.connectTo(tick, (timer.seconds - remaining) * 1000)
    }
  }

  row += 1
  const arm = new NodeToggleElement(ctx, col, row)
  arm.state = 0 // 0 enables the target element
  arm.connectToElement(hazard)
  // A countdown-less rig still needs a real delay here, which is why this is the
  // one connection that always passes one: ScriptNode.connectTo only switches
  // into true-millisecond mode once a delay is given.
  trigger.connectTo(arm, windowMs)
}
