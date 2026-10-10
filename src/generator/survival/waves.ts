/**
 * Timed spawn rows — the survival arena's answer to `boss/waves.ts`'s five
 * health tiers.
 *
 * A boss arena's waves are keyed to the boss losing health. A survival arena
 * has no boss, so its waves are keyed to the clock instead, and the shape that
 * falls out is simpler: a flat list of rows, each naming one monster, how many
 * of it, when the row starts, and how fast it trickles.
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        ├─ delay atSeconds*1000 ─> ToggleElement{state: 0}
 *        │                               └─ arms TimerTrigger(intervalMs)
 *        │                                       └─ SpawnObject × 9 anchors
 *        └─ delay   seconds*1000 ─> ToggleElement{state: 1}   (endless rows only)
 *                                        └─ stops that same timer
 *
 * That inner half — timer, toggle, and the count split round-robin over the
 * nine anchors — is `boss/waves.ts:250-281` unchanged, down to reusing its
 * `splitRoundRobin` and its `scaledMax`. Only the trigger on the front differs,
 * and the stop on the back, which a boss tier has no use for.
 *
 * Two things a row is NOT:
 *
 * 1. **Not a tier.** "50 bats at the start and 200 more two minutes in" is two
 *    rows naming the same monster. Neither replaces the other and neither
 *    cancels the other — they are two independent timers, and by 2:00 both are
 *    running. Boss tiers behave the same way (nothing ever disables a wave
 *    timer), so this is continuity rather than a new rule.
 * 2. **Not scattered.** Issue #61 removes scattered spawns from Survival
 *    outright, which is why this module never asks for spawn points and
 *    `arena.ts` hands `placeSpawnPoints` an empty request list in survival
 *    mode — so the arena makes no `ctx.bossRand` draw there at all.
 *
 * **Endless rows.** `count: -1` is the same sentinel a boss tier's `monsterMax`
 * uses: every anchor gets one unbounded `SpawnObject` (`trigger-times` left at
 * its -1 default) and the monster keeps coming. `scaledMax` is what keeps it
 * from being scaled by the arena's `monsterMultiplier` — a sentinel is not a
 * quantity — and reusing it rather than re-deriving the rule is what stops the
 * two rigs drifting on that.
 *
 * Where survival differs from a boss tier is the END. A boss fight is
 * unbounded, so nothing ever disables a wave timer; a survival round finishes
 * at a known second, and an endless row left running past it keeps filling the
 * arena behind the party as they walk out — at a 500 ms interval across nine
 * anchors that is ~18 actors a second, for as long as anyone lingers, which is
 * the 2026-08-27 flood that made the arena unplayable, just spread over time.
 * So an endless row gets a `ToggleElement{state: 1}` on the same clock tick
 * that opens the alcove. Finite rows need nothing: they self-limit through
 * `trigger-times`.
 *
 * Draws no random values from any stream.
 */

import type { GenerationContext } from '../core/context'
import type { SurvivalWave } from '../config/parameters'
import type { Anchor } from '../boss/anchors'
import { scaledMax, splitRoundRobin } from '../boss/waves'
import { isKnownMonsterKey, resolveArenaActorPath } from '../objects/monsterTypes'
import { NodeGlobalEventTrigger, NodeSpawnObject, NodeTimerTrigger, NodeToggleElement } from '../objects/nodes'

/**
 * Builds the arena's timed spawn rows. Emits nothing at all — not one node, not
 * one id — when no row is usable, so a survival arena with an empty wave list
 * costs nothing.
 *
 * A row naming an unknown monster, or asking for none, is skipped rather than
 * thrown on; `config/validation.ts` is the gate.
 *
 * Node positions are cosmetic editor markers except the SpawnObjects, which
 * sit on the anchors they spawn at.
 */
export function buildSurvivalWaveRig(
  ctx: GenerationContext,
  rows: readonly SurvivalWave[],
  monsterMultiplier: number,
  anchorList: readonly Anchor[],
  clock: NodeGlobalEventTrigger,
  seconds: number,
  x: number,
  y: number,
  // issue #64 part 2, same arena-twin substitution `boss/waves.ts` makes —
  // still no RNG draw. Defaults true to match the arena's absent-means-on
  // toggle.
  useBodyguardTwins: boolean = true
): void {
  const usable = rows.filter((row) => isKnownMonsterKey(row.monster) && (row.count === -1 || row.count >= 1))
  if (usable.length === 0) return
  if (anchorList.length === 0) return

  let row = y
  for (const wave of usable) {
    // The arena's monsterMultiplier scales a survival row exactly as it scales
    // a boss tier's max count, through the very same helper — trunc after
    // scaling, floored at 0, and -1 passed through untouched because a sentinel
    // is not a quantity. A row the multiplier scales away emits nothing rather
    // than an empty timer.
    const count = scaledMax(wave.count, monsterMultiplier)
    if (count === 0) continue

    const endless = count === -1
    // A finite row deals its count round-robin over the anchors; an endless one
    // gives every anchor an unbounded spawner instead, so there is nothing to
    // split. `shares` is only consulted on the finite path.
    const shares = endless ? [] : splitRoundRobin(count, anchorList.length)
    if (!endless && shares.every((share) => share === 0)) continue

    row += 1
    const timer = new NodeTimerTrigger(ctx, x, row, wave.intervalMs)

    row += 1
    const arm = new NodeToggleElement(ctx, x, row)
    arm.state = 0 // 0 enables the target element — see nodes.ts
    arm.connectToElement(timer)
    // A row at 0 seconds still passes a real delay: connectTo only switches
    // into true-millisecond mode once one is given, and a row that armed on the
    // Java original's verbatim `delays` copy would not be timed at all.
    clock.connectTo(arm, wave.atSeconds * 1000)

    const actorPath = resolveArenaActorPath(wave.monster, useBodyguardTwins)
    for (let i = 0; i < anchorList.length; i++) {
      if (!endless && shares[i] === 0) continue
      const anchor = anchorList[i]
      const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
      // An endless row leaves trigger-times at ScriptNode's own -1 (unlimited),
      // exactly as an endless boss tier entry does.
      if (!endless) spawn.triggerTimes = shares[i]
      timer.connectTo(spawn)
    }

    if (endless) {
      // Only an endless row needs stopping: a finite one runs out on its own.
      // Same tick as the alcove opener, so if the door opened, this fired.
      row += 1
      const stop = new NodeToggleElement(ctx, x, row)
      stop.state = 1 // 1 disables the target element
      stop.connectToElement(timer)
      clock.connectTo(stop, seconds * 1000)
    }
  }
}
