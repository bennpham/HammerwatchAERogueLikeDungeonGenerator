/**
 * The survival arena's rig — everything `boss/`'s tier rigs do, re-keyed from
 * boss health to elapsed time.
 *
 * Why it cannot simply reuse them: the engine fires `Boss 75%`, `Boss 50%`,
 * `Boss 25%` and `Boss Died` for any actor in the `actors/boss_*` folders and
 * for nothing else. Nothing in this repo sends those events. A survival arena
 * places no boss actor, so none of the four ever fire, and every rig listening
 * for one — waves 1-4, the per-tier buffs, traps, drops, checkpoints, the
 * invulnerability windows and the alcove opener — would simply never run.
 * Elapsed time is what a survival arena has instead, so one
 * `GlobalEventTrigger(LevelLoaded)` drives all of it through per-connection
 * millisecond delays (see `clock.ts`).
 *
 * Fixed build order, and it matters for two different reasons. Ids are handed
 * out in call order, so reordering these moves every node after the change;
 * and `traps` is the one rig that draws, so it stays last of the five for the
 * same reason `boss/traps.ts` does — everything the arena's LAYOUT depends on
 * has already drawn by the time it runs.
 *
 *   1. clock            one GlobalEventTrigger("LevelLoaded")
 *   2. countdown        the on-screen clock; nothing at all when `off`
 *   3. waves            timed spawn rows
 *   4. buffs            timed aura windows
 *   5. pickups          timed drops onto the entrance pad
 *   6. traps            timed spewer windows   <- the only one that draws
 *   7. opener           DestroyObject on the alcove seals, at `seconds`
 *   8. survived banner  the closing AnnounceText, at `seconds`
 *
 * Each of 2-7 returns before allocating an id when its own list is empty, which
 * is what keeps one of them from moving another's ids. The clock itself is
 * unconditional: a survival arena always has a round length, and the opener
 * always needs something to hang off.
 */

import type { GenerationContext } from '../core/context'
import type { SurvivalOptions } from '../config/parameters'
import { survivalBuffs, survivalPickups, survivalTraps, survivalWaves } from '../config/parameters'
import type { Doodad } from '../objects/doodad'
import type { Anchor } from '../boss/anchors'
import type { PickupArena } from '../boss/pickupPad'
import type { TrapArena } from '../boss/traps'
import { buildSurvivalCountdown, buildSurvivedAnnounce, survivalClock } from './clock'
import { buildSurvivalWaveRig } from './waves'
import { buildSurvivalBuffRig } from './buffs'
import { buildSurvivalPickupRig } from './pickups'
import { buildSurvivalTrapRig } from './traps'
import { buildSurvivalOpener } from './opener'

export {
  SURVIVED_ANNOUNCE_MS,
  SURVIVED_TEXT,
  SURVIVED_TEXT_TYPE,
  buildSurvivalCountdown,
  buildSurvivedAnnounce,
  countdownMarks,
  everySecond,
  milestoneSeconds,
  survivalClock
} from './clock'
export { buildSurvivalWaveRig } from './waves'
export { buildSurvivalBuffRig } from './buffs'
export { buildSurvivalPickupRig } from './pickups'
export { buildSurvivalTrapRig } from './traps'
export { buildSurvivalOpener } from './opener'

/** Everything the survival rig needs from the arena around it. Read-only. */
export interface SurvivalArena {
  width: number
  height: number
  /** The nine spawn anchors, in their fixed order. */
  anchors: readonly Anchor[]
  /** The three `need-sync` doodads across the alcove mouth. */
  seals: readonly Doodad[]
  /** Where the drop pad is, and which of its slots a pillar buried. */
  pickup: PickupArena
  /** The walls, exclusions and mask the trap windows place against. */
  trap: TrapArena
  /** Scales a wave row's count, exactly as it scales a boss tier's max. */
  monsterMultiplier: number
  /** Marker column/row the cosmetic editor nodes walk down from. */
  markerX: number
  markerY: number
  /**
   * `arenaUsesBodyguards(fight.arena)` (issue #64 part 2) — the same
   * bodyguard-twin path substitution `boss/waves.ts` applies, threaded
   * through because survival's waves read it too. No RNG draw either way.
   */
  useBodyguardTwins: boolean
}

/** Builds the whole survival rig, in the fixed order documented above. */
export function buildSurvivalRig(ctx: GenerationContext, survival: SurvivalOptions, arena: SurvivalArena): void {
  const { markerX, markerY } = arena

  const clock = survivalClock(ctx, markerX, markerY)

  buildSurvivalCountdown(ctx, clock, survival.seconds, survival.countdown, markerX, markerY)

  // Through the accessors, never off the object: a hand-edited parameters.txt
  // can leave any of the four lists out, and an absent list has to mean an
  // empty one rather than a crash (invariant 5). config/validation.ts reads
  // them the same way, so neither end can disagree about that.
  buildSurvivalWaveRig(
    ctx,
    survivalWaves(survival),
    arena.monsterMultiplier,
    arena.anchors,
    clock,
    survival.seconds,
    markerX,
    markerY,
    arena.useBodyguardTwins
  )

  buildSurvivalBuffRig(ctx, survivalBuffs(survival), arena.width, arena.height, clock, markerX, markerY)

  buildSurvivalPickupRig(ctx, survivalPickups(survival), arena.pickup, clock)

  buildSurvivalTrapRig(ctx, survivalTraps(survival), arena.trap, clock)

  buildSurvivalOpener(ctx, arena.seals, survival.seconds, clock, markerX, markerY)

  buildSurvivedAnnounce(ctx, clock, survival.seconds, markerX, markerY)
}
