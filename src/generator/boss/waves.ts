/**
 * The boss arena's wave spawn rig (boss-tab.md §4 "Wave wiring"). Pure
 * script-node wiring — no RNG, no XML written directly (every node type used
 * here already exists in objects/nodes.ts and self-registers on
 * `ctx.scriptNodes` via ScriptNode's constructor).
 *
 * Shape, repeated once per tier (100% / 75% / 50% / 25% / boss death):
 *
 *   trigger ─> ToggleElement{state: 0} ─> TimerTrigger(enabled=False)
 *                                              │
 *                                              v
 *                                   SpawnObject × (monster, anchor)
 *
 * Tier 0 (100%) is triggered by an AreaTrigger over the arena's entrance
 * shape; tiers 1-3 (75/50/25%) are triggered by a GlobalEventTrigger the
 * engine fires at that health threshold. A tier with two distinct spawn
 * intervals gets two independent ToggleElement -> TimerTrigger chains, both
 * fed by the same tier trigger — NodeToggleElement can only enable a single
 * downstream element (`element` is one id, not an array), so "one toggle per
 * timer" is the only way to switch on more than one timer per tier.
 *
 * Tier 4 is the boss-death tier: same rig, but its GlobalEventTrigger listens
 * for `Boss Died` rather than a health threshold. The fight is not over at that
 * point — arena.ts's win chain hangs its own separate `Boss Died` trigger off
 * the same event to open the alcove seals, and the campaign only ends when the
 * player reaches the orb behind them, so this tier spawns into that walk. Two
 * GlobalEventTrigger nodes on one event is ordinary (the shipped campaign
 * levels do it); nothing here needs to know about the win chain's node.
 *
 * Nothing ever disables a timer: once a tier's trigger fires, its timers run
 * until their SpawnObject budgets are exhausted, and lower tiers keep firing
 * as health drops further, so at 25% health all four health tiers are spawning
 * at once (boss-tab.md, boss-tab-handoff.md item 6).
 *
 * A monster on a *scatter* spawn mode (issue #21) skips that whole rig while it
 * fits in the arena's `spawn.batchSize`: it gets no toggle and no timer, and its
 * SpawnObjects — one per monster, at points spawnPoints.ts placed across the
 * arena, each with `trigger-times: 1` — hang directly off the tier trigger, so
 * the entire group appears the moment the tier fires:
 *
 *   trigger ─> SpawnObject{trigger-times: 1} × count
 *
 * Past that budget it goes back on a timer, because "the entire group appears
 * the moment the tier fires" is a frame spike once the group is big: the stock
 * Castle 100% tier used to put 480 actors on the floor in one instant and the
 * arena never recovered (playtest 2026-08-27). Such a monster gets `batchSize`
 * points, its count split round-robin over them, and one shared timer per tier:
 *
 *   trigger ─> ToggleElement{state: 0} ─> TimerTrigger(batchIntervalMs)
 *                                              │
 *                                              v
 *                                   SpawnObject{trigger-times: share} × points
 *
 * A tier whose monsters are all on scatter modes and all inside the budget
 * therefore still emits no ToggleElement or TimerTrigger at all.
 *
 * A pool entry is a monster VARIANT key, not a bare monster id — `bat1` is the
 * ordinary bat, `bat1#0` the bats spawner, `archer1#2` the elite archer (see
 * monsterTypes.ts). `resolveArenaActorPath` turns the key into one actor path
 * with no RNG draw: the wave rig is deterministic structure, not a roll, so a
 * key always resolves to the same actor. That is the whole difference from the
 * dungeon, which rolls tiers upward with `upgradeChance` in Monster.createRolled
 * and picks spawners separately in room.ts.
 *
 * `resolveArenaActorPath` additionally substitutes the arena's bodyguard
 * twins (issue #64 part 2) for the handful of actors that have one — still no
 * RNG draw, so `useBodyguardTwins` can never move an arena's layout, only
 * which actor path a wave names. `dungeonBoss/waves.ts` deliberately stays on
 * plain `resolveActorPath` — a boss floor is a dungeon floor, not an arena.
 *
 * This module draws no RNG at all, including for the scatter modes: the points
 * are placed by arena.ts (which owns the ctx.bossRand draw order) and passed in
 * as a finished map.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave } from '../config/parameters'
import { isScatterMode, waveSpawnMode } from '../config/parameters'
import { resolveArenaActorPath } from '../objects/monsterTypes'
import {
  NodeAreaTrigger,
  NodeGlobalEventTrigger,
  NodeRectangleShape,
  NodeSpawnObject,
  NodeTimerTrigger,
  NodeToggleElement
} from '../objects/nodes'
import type { Anchor } from './anchors'
import type { SpawnPointMap, SpawnRequest } from './spawnPoints'
import { spawnPointKey } from './spawnPoints'
import type { TierSource } from './tierSource'
import { singleBossTierSource } from './tierSource'

/**
 * GlobalEventTrigger names for tiers 75/50/25 and the boss-death tier — index 0
 * (the 100% tier) is triggered by the entrance AreaTrigger instead, so this
 * array is offset by one from the tier index (`TIER_EVENT_NAMES[tier - 1]`).
 * Every string here is an engine event verified to fire for a bare boss actor;
 * see the modding skill's DISCOVERY-LOG.
 */
export const TIER_EVENT_NAMES = ['Boss 75%', 'Boss 50%', 'Boss 25%', 'Boss Died'] as const

/**
 * The batch timer `buildWaveRig` falls back to when no caller supplies one.
 * The real value is `arena.spawn.batchIntervalMs`; this only exists so the
 * tests written before batching can still call the rig with six arguments.
 */
export const DEFAULT_BATCH_INTERVAL_MS = 1500

/**
 * Splits `total` round-robin across `anchorCount` slots: the first
 * `total % anchorCount` slots get one extra. Deterministic and stable for any
 * `total`, including 0 (every slot gets 0) and totals smaller than
 * `anchorCount` (only the first `total` slots get a nonzero share).
 *
 * `-1` (endless) is never passed here — see buildWaveRig, which handles it as
 * a separate "every anchor, unchanged" case instead of a value to divide.
 */
export function splitRoundRobin(total: number, anchorCount: number): number[] {
  const base = Math.trunc(total / anchorCount)
  const remainder = total % anchorCount
  return Array.from({ length: anchorCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * A monster's horde size after the arena's monsterMultiplier. `-1` is the
 * endless sentinel, not a quantity — it must never be scaled. Otherwise this
 * matches room.ts's own multiplier application: trunc after scaling, floored
 * at 0 so a multiplier < 1 can't go negative.
 */
export function scaledMax(rawMax: number, monsterMultiplier: number): number {
  return rawMax === -1 ? -1 : Math.max(0, Math.trunc(rawMax * monsterMultiplier))
}

/**
 * Every monster across every tier that needs scattered spawn points, in tier
 * order and then `wave.monsters` order — the order arena.ts feeds to
 * `placeSpawnPoints`, and therefore the order its `ctx.bossRand` draws happen
 * in. Pure: this is the same count arithmetic `buildWaveRig` applies, factored
 * out so the placement pass and the rig can never disagree about how many
 * spawns a monster gets.
 *
 * `batchSize` caps the *points* a monster gets — see `SpawnRequest.points`. The
 * count is unchanged; what changes is whether it arrives on one frame or over a
 * few seconds.
 *
 * An endless (`-1`) count has no meaning for a one-shot scattered spawn —
 * validation rejects that combination, and it is skipped here so a params
 * object built in code emits nothing for it rather than something arbitrary.
 */
export function scatterRequests(
  waves: readonly BossWave[],
  monsterMultiplier: number,
  batchSize: number
): SpawnRequest[] {
  const requests: SpawnRequest[] = []
  const budget = Math.max(1, Math.trunc(batchSize))

  for (let tier = 0; tier < waves.length; tier++) {
    const wave = waves[tier]
    for (const key of wave.monsters) {
      const mode = waveSpawnMode(wave, key)
      if (!isScatterMode(mode)) continue
      const count = scaledMax(wave.monsterMax[key], monsterMultiplier)
      if (count <= 0) continue
      requests.push({ tier, key, mode, count, points: Math.min(count, budget) })
    }
  }

  return requests
}

/**
 * Builds the full wave rig for all of `waves` (exactly BOSS_WAVE_COUNT tiers,
 * 100/75/50/25 then boss death — enforced by validation.ts, not re-checked
 * here) and wires every timed
 * SpawnObject onto `anchorList` (the 9 fixed-order anchors from anchors.ts).
 *
 * `entranceShape` is the arena's entrance RectangleShape, built and
 * positioned by the caller (Phase 5e's arena.ts) — this module only connects
 * an AreaTrigger to it, it never places or sizes arena geometry.
 *
 * `spawnPoints` carries the scattered monsters' placed points, keyed by
 * `spawnPointKey(tier, monsterKey)` — `scatterRequests` decides what goes in
 * it and arena.ts fills it. Defaulting it to an empty map is what lets a
 * caller that has no scatter modes (and every test written before them) call
 * this with five arguments: a scattered monster with no points is simply not
 * wired.
 *
 * A tier with an empty monster pool (`wave.monsters.length === 0`, allowed —
 * validation only warns) degrades safely: no trigger, toggle or timer is
 * created for it at all, so no node ever ships with an empty `connections`
 * array. Node positions here are cosmetic (editor-only markers; the actual
 * trigger geometry is the entrance shape and the SpawnObject anchors) so they
 * just walk down from the entrance shape's position, one row per node.
 */
export function buildWaveRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  monsterMultiplier: number,
  anchorList: readonly Anchor[],
  entranceShape: NodeRectangleShape,
  spawnPoints: SpawnPointMap = new Map(),
  batchIntervalMs: number = DEFAULT_BATCH_INTERVAL_MS,
  tierSource: TierSource = singleBossTierSource(),
  // issue #64 part 2. Defaults true to match the arena's own absent-means-on
  // toggle (`arenaUsesBodyguards`) — every caller that does not think about
  // this gets the arena's historical-plus-twins behaviour, not the dungeon's.
  useBodyguardTwins: boolean = true
): void {
  let y = entranceShape.y

  for (let tier = 0; tier < waves.length; tier++) {
    const wave = waves[tier]
    if (wave.monsters.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% are skipped entirely,
    // before allocating any node for them — see tierSource.ts's header.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    // Scatter monsters leave the timer rig entirely, so the split has to happen
    // before the interval grouping below — otherwise a tier of nothing but
    // scattered monsters would still ship a toggle and a timer with nothing on
    // the end of them.
    const anchorIds: string[] = []
    const scatterIds: string[] = []
    for (const id of wave.monsters) {
      if (isScatterMode(waveSpawnMode(wave, id))) scatterIds.push(id)
      else anchorIds.push(id)
    }

    const scattered = scatterIds
      .map((id) => ({
        id,
        points: spawnPoints.get(spawnPointKey(tier, id)) ?? [],
        total: scaledMax(wave.monsterMax[id], monsterMultiplier)
      }))
      .filter((entry) => entry.points.length > 0 && entry.total > 0)

    // Every monster is scattered and none of them got a point (a zero count, or
    // a params object that never passed validation): there is nothing for the
    // tier trigger to connect to, and a node must never ship an empty
    // `connections` array.
    if (anchorIds.length === 0 && scattered.length === 0) continue

    y += 1
    let triggerNode
    if (tier === 0) {
      const areaTrig = new NodeAreaTrigger(ctx, entranceShape.x, y)
      areaTrig.connectToShape(entranceShape)
      triggerNode = areaTrig
    } else {
      triggerNode = tierSource.tierTrigger(ctx, entranceShape.x, y, tier)
    }

    // Group this tier's monsters by effective interval, preserving the order
    // monsters first appear in wave.monsters (Map iteration is insertion
    // order) — deterministic and independent of any object-key order.
    const byInterval = new Map<number, string[]>()
    for (const id of anchorIds) {
      const interval = wave.intervalMs?.[id] ?? wave.defaultIntervalMs
      const group = byInterval.get(interval)
      if (group) group.push(id)
      else byInterval.set(interval, [id])
    }

    for (const [interval, ids] of byInterval) {
      y += 1
      const timer = new NodeTimerTrigger(ctx, entranceShape.x, y, interval)

      y += 1
      const toggle = new NodeToggleElement(ctx, entranceShape.x, y)
      toggle.state = 0 // 0 enables the target element — see nodes.ts
      toggle.connectToElement(timer)
      triggerNode.connectTo(toggle)

      for (const id of ids) {
        const max = scaledMax(wave.monsterMax[id], monsterMultiplier)
        const actorPath = resolveArenaActorPath(id, useBodyguardTwins)

        if (max === -1) {
          // Endless: every anchor spawns this monster, unbounded, unchanged.
          for (const anchor of anchorList) {
            const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
            timer.connectTo(spawn)
          }
          continue
        }

        const shares = splitRoundRobin(max, anchorList.length)
        for (let i = 0; i < anchorList.length; i++) {
          if (shares[i] === 0) continue
          const anchor = anchorList[i]
          const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
          spawn.triggerTimes = shares[i]
          timer.connectTo(spawn)
        }
      }
    }

    // Scattered monsters, in two shapes.
    //
    // Within the batch budget there is one point per monster and each
    // SpawnObject hangs straight off the tier trigger: the whole group appears
    // the moment the tier fires. `trigger-times: 1` is what makes it a one-shot
    // — tier 0's AreaTrigger fires again every time a player walks back over the
    // entrance, and without the budget that would re-summon the group each time.
    //
    // Past the budget the count is split round-robin over the points it *did*
    // get and hung off a timer instead, exactly the way the anchor rig above
    // splits a horde over its 9 anchors. So a 42-bat entry on a budget of 8
    // becomes 8 points spawning 6 bats each, one per point per tick, rather than
    // 42 actors on a single frame. All batched monsters of a tier share one
    // toggle/timer chain — NodeToggleElement.element is a single id, so it is
    // one toggle per timer, not per monster.
    const batched = scattered.filter((entry) => entry.points.length < entry.total)
    const oneShot = scattered.filter((entry) => entry.points.length >= entry.total)

    for (const { id, points } of oneShot) {
      const actorPath = resolveArenaActorPath(id, useBodyguardTwins)
      for (const point of points) {
        const spawn = new NodeSpawnObject(ctx, point.x, point.y, actorPath)
        spawn.triggerTimes = 1
        triggerNode.connectTo(spawn)
      }
    }

    if (batched.length > 0) {
      y += 1
      const batchTimer = new NodeTimerTrigger(ctx, entranceShape.x, y, batchIntervalMs)

      y += 1
      const batchToggle = new NodeToggleElement(ctx, entranceShape.x, y)
      batchToggle.state = 0 // 0 enables the target element — see nodes.ts
      batchToggle.connectToElement(batchTimer)
      triggerNode.connectTo(batchToggle)

      for (const { id, points, total } of batched) {
        const actorPath = resolveArenaActorPath(id, useBodyguardTwins)
        const shares = splitRoundRobin(total, points.length)
        for (let i = 0; i < points.length; i++) {
          if (shares[i] === 0) continue
          const spawn = new NodeSpawnObject(ctx, points[i].x, points[i].y, actorPath)
          spawn.triggerTimes = shares[i]
          batchTimer.connectTo(spawn)
        }
      }
    }
  }
}
