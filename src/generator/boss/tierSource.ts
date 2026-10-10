/**
 * What fires a boss wave tier's trigger — issue #64 part 1 (multiple bosses in
 * one arena or on one dungeon floor).
 *
 * A single-boss fight or floor gets the engine's own `Boss 75%/50%/25%/Died`
 * events, one `GlobalEventTrigger` per threshold, created at the exact call
 * site every tier-keyed rig (`waves.ts`, `waveBuffs.ts`, `wavePickups.ts`,
 * `traps.ts`, and their `dungeonBoss/` counterparts) has always built it from
 * — so a single-boss fight or floor's node ids and order never move.
 *
 * With two or more bosses the engine still fires those events, but for the
 * FIRST boss actor to cross each threshold or die — no rig can tell whose 75%
 * it just saw. So a multi-boss fight or floor:
 *
 *   - skips tiers 1-3 (75/50/25%) ENTIRELY, before allocating so much as one
 *     node for them (`skipTier`) — not "fires them for nobody in particular",
 *     skipped;
 *   - re-keys the death tier (tier 4, `Boss Died`) to "every boss's own
 *     death": a shared `Variable` starts at the boss count, and each boss's
 *     `ObjectEventTrigger(Destroyed)` subtracts one from it and then checks it
 *     for 0. Every death-tier rig — and the alcove/seal opener — connects off
 *     that check exactly as it would off a single boss's
 *     `GlobalEventTrigger` (`buildAllBossesDied`).
 *
 * Invulnerability and checkpoints are not threaded through this at all: they
 * are skipped outright for a multi-boss fight or floor (their settings stay on
 * the object, unread — the same losslessness `arenaMode` already promises for
 * survival's boss-only fields), because both genuinely need to know "the
 * boss", not "a boss".
 */

import type { GenerationContext } from '../core/context'
import { ScriptNode } from '../objects/scriptNode'
import { CHANGE_VAR_SUB, NodeChangeVariable, NodeCheckVariable, NodeObjectEventTrigger, NodeVariable } from '../objects/nodes'
import { NodeGlobalEventTrigger } from '../objects/nodes'
import { TIER_EVENT_NAMES } from './waves'
import { BOSS_WAVE_COUNT } from '../config/parameters'

export interface TierSource {
  /**
   * Whether tier `tier` (1..TIER_EVENT_NAMES.length — 75%, 50%, 25%, death, in
   * that order) must be skipped entirely, before any node is built for it.
   * Callers never ask about tier 0: that tier's own AreaTrigger (arena) or
   * LevelLoaded (dungeon floor) wiring is a separate branch, untouched by
   * multi-boss.
   */
  skipTier(tier: number): boolean
  /** The tier's trigger node. Only ever called when `skipTier(tier)` is `false`. */
  tierTrigger(ctx: GenerationContext, x: number, y: number, tier: number): ScriptNode
}

/**
 * One boss: the historical rig. `tierTrigger` constructs the same
 * `NodeGlobalEventTrigger` at the same call site every rig has always used,
 * so nothing about a single-boss fight or floor's ids or order changes.
 */
export function singleBossTierSource(): TierSource {
  return {
    skipTier: () => false,
    tierTrigger: (ctx, x, y, tier) => new NodeGlobalEventTrigger(ctx, x, y, TIER_EVENT_NAMES[tier - 1])
  }
}

/**
 * Tier number of the boss-death tier — the last of `BOSS_WAVE_COUNT` tiers
 * (100/75/50/25%, then death), i.e. `TIER_EVENT_NAMES.length`. Computed from
 * `BOSS_WAVE_COUNT` rather than by importing `TIER_EVENT_NAMES`'s own length:
 * `waves.ts` imports this module, and reading `TIER_EVENT_NAMES.length` at
 * this module's top level — before `waves.ts` has finished evaluating its own
 * exports in that circular-import order — would read it as `undefined`.
 */
const DEATH_TIER = BOSS_WAVE_COUNT - 1

/**
 * Two or more bosses: tiers 1-3 are skipped, and the death tier fires off
 * `allDied` (built once by `buildAllBossesDied` and shared by every tier-keyed
 * rig this fight or floor builds, plus the alcove/seal opener).
 */
export function multiBossTierSource(allDied: ScriptNode): TierSource {
  return {
    skipTier: (tier) => tier !== DEATH_TIER,
    tierTrigger: () => allDied
  }
}

/**
 * The "all bosses died" rig, [VERIFIED 2026-09-23] by the user's playtest of
 * an editor-fixed 6-boss floor (`level0_fixed.xml`, see DISCOVERY-LOG):
 *
 *   Variable(N)
 *   per boss i:  ObjectEventTrigger(Destroyed, [actor i], trigger-times 1)
 *                  → ChangeVariable(var -= 1)
 *                  → CheckVariable(var == 0, on-true: the death-tier targets)
 *
 * so whichever boss dies last is the one whose check passes. The
 * CheckVariables share one `on-true` list (see `NodeCheckVariable`); the first
 * of them is returned, and every death-tier rig and the alcove/seal opener
 * connect FROM it exactly as they would from a single boss's
 * `GlobalEventTrigger` — which puts them in every boss's `on-true`.
 *
 * Each trigger connects to its ChangeVariable before its CheckVariable so the
 * subtraction lands first. Draws no RNG.
 *
 * `(x, y)` is a cosmetic origin for the editor markers only, like every other
 * rig in this repo — nothing about the wiring is positional.
 */
export function buildAllBossesDied(ctx: GenerationContext, actors: ReadonlyArray<{ id: number }>, x: number, y: number): ScriptNode {
  const remaining = new NodeVariable(ctx, x, y, actors.length)
  const onTrue: ScriptNode[] = []
  const checks = actors.map((actor, i) => {
    const trigger = new NodeObjectEventTrigger(ctx, x, y + 1 + i)
    trigger.event = 'Destroyed'
    trigger.connectObject(actor)
    trigger.triggerTimes = 1
    const change = new NodeChangeVariable(ctx, x + 1, y + 1 + i, remaining, CHANGE_VAR_SUB, 1)
    const check = new NodeCheckVariable(ctx, x + 2, y + 1 + i, remaining, 0, onTrue)
    trigger.connectTo(change)
    trigger.connectTo(check)
    return check
  })
  return checks[0]
}

/**
 * A countdown over nodes that already exist — issue #69's "kill the boss AND
 * press the button" seal:
 *
 *   Variable(N)
 *   per decrementer i:  decrementer
 *                         → ChangeVariable(var -= 1)
 *                         → CheckVariable(var == 0, on-true: shared)
 *
 * The same shape as `buildAllBossesDied`, except the per-source trigger is
 * handed in rather than built — a boss's `GlobalEventTrigger("Boss Died")`, a
 * multi-boss floor's all-died check, a button's `AreaTrigger` — so one rig can
 * count sources of different kinds. Each decrementer must fire once: the
 * button trigger is one-shot, and both boss sources fire once per floor.
 *
 * Returns the first check; connect FROM it to reach every check's `on-true`.
 * [VERIFIED 2026-09-26] in game, on single- and multi-boss floors, either
 * order. Draws no RNG. `(x, y)` is a cosmetic editor origin, like every rig here.
 */
export function buildCountdown(ctx: GenerationContext, decrementers: readonly ScriptNode[], x: number, y: number): ScriptNode {
  const remaining = new NodeVariable(ctx, x, y, decrementers.length)
  const onTrue: ScriptNode[] = []
  const checks = decrementers.map((source, i) => {
    const change = new NodeChangeVariable(ctx, x + 1, y + 1 + i, remaining, CHANGE_VAR_SUB, 1)
    const check = new NodeCheckVariable(ctx, x + 2, y + 1 + i, remaining, 0, onTrue)
    source.connectTo(change)
    source.connectTo(check)
    return check
  })
  return checks[0]
}
