/**
 * The survival arena's clock — the one node everything else in
 * `src/generator/survival/` hangs off.
 *
 * A boss arena is driven by engine events: the game fires `Boss 75%`,
 * `Boss 50%`, `Boss 25%` and `Boss Died` for any actor in the `actors/boss_*`
 * folders, and every optional rig in `boss/` listens for one of them. A
 * survival arena has no boss actor, so none of those events ever fire and none
 * of those rigs would do anything. What it has instead is elapsed time.
 *
 * So one `GlobalEventTrigger(LevelLoaded)` is created per arena and every
 * survival event hangs off it with its own per-connection delay:
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        ├─ delay      0 ms  ─> the row that spawns at the start
 *        ├─ delay  30000 ms  ─> the buff window that opens at 0:30
 *        ├─ delay  90000 ms  ─> the trap window that closes at 1:30
 *        └─ delay 180000 ms  ─> DestroyObject, opening the alcove
 *
 * `ScriptNode.connectTo(node, delayMs)` is what makes that work: passing a
 * delay opts the connection into writing true milliseconds under both `delays`
 * and `connection-delays`, the same mechanism `timer/hazard.ts` and
 * `boss/checkpoints.ts` already use. Without a delay argument a connection
 * keeps the Java original's verbatim `delays` copy, which is not a time at all.
 *
 * Everything here is RNG-free: not one draw from any stream.
 *
 * [UNVERIFIED] `LEVEL_LOADED_EVENT` itself — the whole feature rests on it. See
 * the modding skill's DISCOVERY-LOG.
 */

import type { GenerationContext } from '../core/context'
import type { SurvivalCountdown } from '../config/parameters'
import { COUNTDOWN_TEXT_TYPE, TICK_DISPLAY_MS, formatCountdown } from '../core/countdown'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { NodeAnnounceText, NodeGlobalEventTrigger } from '../objects/nodes'

/** How long the "you survived" line stays on screen, in ms. */
export const SURVIVED_ANNOUNCE_MS = 4000

/**
 * AnnounceText's `type` for the round's closing line — 0 is the centred banner
 * the victory text uses, as opposed to the small corner line a countdown tick
 * gets (see `core/countdown.ts`).
 */
export const SURVIVED_TEXT_TYPE = 0

/** What the party is told when the clock runs out. */
export const SURVIVED_TEXT = 'You survived! The way out has opened!'

/** The arena's clock. One per survival arena; every rig connects to it with a delay. */
export function survivalClock(ctx: GenerationContext, x: number, y: number): NodeGlobalEventTrigger {
  return new NodeGlobalEventTrigger(ctx, x, y, LEVEL_LOADED_EVENT)
}

/**
 * The seconds a `milestones` countdown announces, ascending: every minute, then
 * every ten seconds inside the last minute, then every second inside the last
 * ten — plus 0, the moment the door opens.
 *
 * A fixed handful of nodes however long the round runs, which is the whole
 * point of the style: `seconds` on a twenty-minute round is 1201 AnnounceText
 * nodes on one level.
 *
 * Pure, and deliberately exported: `config/validation.ts` counts what it
 * returns rather than re-deriving the rule, and the suite asserts the shape.
 */
export function milestoneSeconds(seconds: number): number[] {
  const marks = new Set<number>()
  for (let s = seconds; s > 60; s -= 60) marks.add(s)
  for (let s = Math.min(seconds, 60); s > 10; s -= 10) marks.add(s)
  for (let s = Math.min(seconds, 10); s >= 0; s -= 1) marks.add(s)
  marks.add(seconds)
  return [...marks].filter((s) => s >= 0 && s <= seconds).sort((a, b) => b - a)
}

/** Every second from `seconds` down to 0 — timer mode's own countdown shape. */
export function everySecond(seconds: number): number[] {
  const marks: number[] = []
  for (let s = seconds; s >= 0; s--) marks.push(s)
  return marks
}

/**
 * The seconds a countdown style announces, newest first. `off` announces none,
 * which is what makes `buildSurvivalCountdown` emit no node at all.
 */
export function countdownMarks(seconds: number, style: SurvivalCountdown): number[] {
  if (style === 'off') return []
  if (style === 'seconds') return everySecond(seconds)
  return milestoneSeconds(seconds)
}

/**
 * The on-screen clock: one AnnounceText per mark, each connected from the clock
 * at the moment it should appear.
 *
 * Emits nothing at all for `off`, so a survival arena that wants no clock costs
 * no ids. Node positions are cosmetic editor markers; only the delays matter.
 */
export function buildSurvivalCountdown(
  ctx: GenerationContext,
  clock: NodeGlobalEventTrigger,
  seconds: number,
  style: SurvivalCountdown,
  x: number,
  y: number
): void {
  const marks = countdownMarks(seconds, style)
  if (marks.length === 0) return

  let row = y
  for (const remaining of marks) {
    row += 1
    const tick = new NodeAnnounceText(ctx, x, row)
    tick.setText(formatCountdown(remaining))
    tick.time = TICK_DISPLAY_MS
    tick.textType = COUNTDOWN_TEXT_TYPE
    clock.connectTo(tick, (seconds - remaining) * 1000)
  }
}

/** The closing banner, shown as the alcove opens. */
export function buildSurvivedAnnounce(
  ctx: GenerationContext,
  clock: NodeGlobalEventTrigger,
  seconds: number,
  x: number,
  y: number
): void {
  const banner = new NodeAnnounceText(ctx, x, y)
  banner.setText(SURVIVED_TEXT)
  banner.time = SURVIVED_ANNOUNCE_MS
  banner.textType = SURVIVED_TEXT_TYPE
  clock.connectTo(banner, seconds * 1000)
}
