/**
 * The builders the hand-made presets share: a campaign sized to its floors,
 * slot shorthands, button locks, wave tables, lobbies, arenas and floor
 * bosses. Used by `claudePresets.ts`, `campaignModePresets.ts` and
 * `worldCampaignPresets.ts`.
 *
 * Every helper allocates fresh arrays and objects on each call, never a
 * shared constant handed out by reference: a preset's `build()` must return
 * a fresh object every call and draw no random values.
 */

import {
  bossDeathBuffs,
  defaultBossFight,
  defaultDungeonBoss,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultFloorTraps,
  defaultLobby,
  defaultParameters,
  defaultSurvivalOptions,
  scatterWave,
  stockWavePickups,
  SHOOTER_ARROW_TRAPS
} from './parameters'
import type {
  BossArenaOptions,
  BossFight,
  BossTrap,
  BossWave,
  DungeonBoss,
  DungeonParameters,
  FloorLock,
  SurvivalBuff,
  SurvivalOptions,
  SurvivalPickup,
  SurvivalTrap,
  SurvivalWave,
  WaveEntry
} from './parameters'
import type { CampaignSlot } from '../campaign'
import { MUSIC_DEFAULT } from '../music/tracks'
import { defaultWorld } from '../world/options'
import type { WorldDef } from '../world/options'


/**
 * `defaultParameters()` sized to `levels`: every per-floor array (buffs,
 * traps, timers, boss, music) gets a fresh default entry per floor, so a
 * preset below only has to override the floors it actually changes.
 * `themes`/`levelMonsters`/`boss`/`lobbies`/`levelOrder` are cleared to
 * nothing so a preset can never accidentally inherit the castle campaign's
 * eight-floor versions — every preset supplies its own.
 */
export function campaign(levels: number, overrides: Partial<DungeonParameters>): DungeonParameters {
  const base = defaultParameters()
  const params: DungeonParameters = {
    ...base,
    levels,
    themes: [],
    levelMonsters: [],
    levelBuffs: Array.from({ length: levels }, () => defaultFloorBuffs()),
    levelTraps: Array.from({ length: levels }, () => defaultFloorTraps()),
    levelTimers: Array.from({ length: levels }, () => defaultFloorTimer()),
    // NOT defaulted, deliberately: unlike the three arrays above,
    // `parameters.txt` has no "pad levelBoss back to `levels` long" pass —
    // `defaultParameters()` itself never sets `levelBoss` — so a params
    // object that carries a full array of disabled placeholders round-trips
    // to `undefined` the moment it's re-parsed (every disabled floor writes
    // no `bossFloorN=` line at all). Presets that use a floor boss set this
    // field themselves, sized only up to the last floor that actually uses
    // one — see the comment on `longHaul()`.
    floorMusic: Array.from({ length: levels }, () => MUSIC_DEFAULT),
    monsterMax: { ...base.monsterMax },
    lobbies: [],
    levelOrder: undefined,
    boss: { enabled: true, fights: [] }
  }
  return { ...params, ...overrides }
}

/**
 * Per-floor button counts as `levelLock` (issue #69): 0 unlocks a floor, 1 is
 * the stock single button (no count stored), n > 1 needs every one of n.
 *
 * The presets that set this are built WITHOUT `withGatewayLocks` (see the
 * registry), which would otherwise overwrite it. A count on a floor that
 * would lead on by stairs swaps them for the blue teleport — a deliberate
 * content change that re-rolls that floor and every floor after it.
 */
export function buttonLocks(counts: readonly number[]): FloorLock[] {
  return counts.map((n) => (n === 0 ? { enabled: false } : n === 1 ? { enabled: true } : { enabled: true, buttons: n }))
}

/** `{kind:'lobby',index:i}` / `{kind:'floor',index:i}` / `{kind:'boss',index:i}` / `{kind:'world',index:i}` shorthands. */
export const L = (index: number): CampaignSlot => ({ kind: 'lobby', index })
export const F = (index: number): CampaignSlot => ({ kind: 'floor', index })
export const B = (index: number): CampaignSlot => ({ kind: 'boss', index })
export const W = (index: number): CampaignSlot => ({ kind: 'world', index })

/** Floors `from..to` inclusive, ascending. */
export function floorRange(from: number, to: number): CampaignSlot[] {
  return Array.from({ length: to - from + 1 }, (_, i) => F(from + i))
}

/**
 * The shape most of the presets share: one lobby, every floor, a second
 * lobby, then a single boss fight — no escape floor after it. Distinct from
 * `shippedOrder()`, which plays one more floor AFTER the boss.
 */
export function actOrder(levels: number): CampaignSlot[] {
  return [L(0), ...floorRange(0, levels - 1), L(1), B(0)]
}

/** A wave tier carrying nothing at all — the "skip this tier" entry. */
export function emptyWave(): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 1500 }
}

/**
 * A five-tier wave table that only fills tier 0 and the boss-death tier,
 * leaving 75/50/25% empty. Every monster is anchored (never scattered), which
 * sidesteps the blocking-wreck scatter restriction entirely — see
 * actorCollision.ts. Used for every multi-boss arena/floor below (mandatory —
 * multi-boss fights skip 75/50/25%, see boss/tierSource.ts) and, for
 * simplicity, for most single-boss ones too.
 */
export function tierAndDeathWaves(
  tier0: readonly WaveEntry[],
  death: readonly WaveEntry[],
  deathTraps: readonly BossTrap[] = [],
  deathPickups: ReturnType<typeof stockWavePickups>['death'] = []
): BossWave[] {
  return [
    scatterWave([], tier0, 2000),
    emptyWave(),
    emptyWave(),
    emptyWave(),
    scatterWave([], death, 1500, bossDeathBuffs(), deathPickups, deathTraps)
  ]
}

/** A light five-tier arena wave table for a short, low-stakes fight (Lunch Break). */
export function lightArenaWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave([], [['bat', 20], ['tick', 10]], 3000),
    scatterWave([], [['skeleton_warrior', 16], ['skeleton_archer', 8]], 2500),
    scatterWave([], [['skeleton_soldier', 12], ['wisp', 8]], 2000, [], drops.half),
    scatterWave([], [['skeleton_lich', 3], ['skeleton_ranger', 6]], 1500, [], drops.quarter, SHOOTER_ARROW_TRAPS),
    scatterWave([], [['skeleton_lich', 2]], 1500, bossDeathBuffs(), drops.death, SHOOTER_ARROW_TRAPS)
  ]
}

/** One stock lobby, gold and upgrades overridable — a fresh object every call. */
export function lobby(presetId: string, overrides: Partial<ReturnType<typeof defaultLobby>> = {}): ReturnType<typeof defaultLobby> {
  return { ...defaultLobby(presetId), ...overrides }
}

/** A fresh arena, built from the stock boss fight's arena with overrides applied. */
export function arena(overrides: Partial<BossArenaOptions>): BossArenaOptions {
  return { ...defaultBossFight().arena, ...overrides }
}

/** A boss-mode fight from an arena override set. */
export function bossFight(overrides: Partial<BossArenaOptions>): BossFight {
  return { arena: arena(overrides) }
}

/** A survival-mode fight from an arena override set and a survival config. */
export function survivalFight(arenaOverrides: Partial<BossArenaOptions>, survival: Partial<SurvivalOptions>): BossFight {
  return { mode: 'survival', arena: arena(arenaOverrides), survival: { ...defaultSurvivalOptions(), ...survival } }
}

/** A dungeon-floor boss picked by exact lineup (always a single boss here). */
export function floorBoss(
  lineup: DungeonBoss['bossLineup'],
  waves: BossWave[],
  overrides: Partial<DungeonBoss> = {}
): DungeonBoss {
  return {
    ...defaultDungeonBoss(),
    enabled: true,
    bossSelection: 'lineup',
    bossLineup: { ...lineup },
    waves,
    ...overrides
  }
}

/**
 * A dungeon-floor boss picked randomly from a pool — the floor twin of
 * `bossFight`'s random selection. Deliberately NOT `floorBoss()` plus an
 * override: `floorBoss()`'s scaffold always carries `bossSelection: 'lineup'`
 * and a (possibly empty) `bossLineup`, and `'random'`/absent is the actual
 * default this codebase reads through `bossSelection()` — setting either
 * explicitly on a random-mode floor writes a value `configFile.ts` never
 * serializes back (a random-mode floor writes neither `bossFloor<i>Selection=`
 * nor `bossFloor<i>Lineup=`), which is a real, reportable round-trip mismatch
 * for `preset.build()`'s own object, not merely cosmetic.
 */
export function floorBossRandom(pool: readonly string[], count: number, waves: BossWave[]): DungeonBoss {
  return {
    ...defaultDungeonBoss(),
    enabled: true,
    bossPool: [...pool],
    bossCount: count,
    waves
  }
}

/**
 * `tierAndDeathWaves`, re-shaped for a FLOOR boss rather than an arena one.
 *
 * `defaultDungeonBoss()`'s own scaffold (`emptyWave()` in parameters.ts) ships
 * every tier with `buffs: []` and `traps: []` already present, and
 * `configFile.ts`'s `bossFloorN…` parser has no cleanup pass to strip a stale
 * one back to absent the way the arena's `boss<i>…` parser does for
 * `traps`/`pickups`. So a floor boss's wave objects need those two fields
 * present as `[]` on every tier — omitting them (as the arena-safe
 * `tierAndDeathWaves` does) round-trips to `{buffs: [], traps: []}` anyway,
 * which is a real, reportable mismatch for `preset.build()`'s own object.
 */
export function floorTierAndDeathWaves(
  tier0: readonly WaveEntry[],
  death: readonly WaveEntry[],
  deathTraps: readonly BossTrap[] = []
): BossWave[] {
  return tierAndDeathWaves(tier0, death, deathTraps).map((wave) => ({
    ...wave,
    buffs: wave.buffs ?? [],
    traps: wave.traps ?? []
  }))
}

export function survivalWaveRow(monster: string, count: number, atSeconds: number, intervalMs = 1500): SurvivalWave {
  return { monster, count, atSeconds, intervalMs }
}

/**
 * Every survival arena spawns from boss/anchors.ts's 9 fixed anchors, and a
 * finite row is dealt round-robin over them (survival/waves.ts).
 */
const SURVIVAL_ANCHORS = 9

/**
 * A finite row sized to run out at `toSeconds`: each anchor spawns one monster
 * per `intervalMs`, so `count / 9 × interval` is how long the row lasts. Phases
 * built from these hand over to the next monster on the clock, without an
 * endless row left running and without the arena filling up behind the party.
 * Assumes the arena's `monsterMultiplier` is 1, which scales the count.
 */
export function phaseRow(monster: string, fromSeconds: number, toSeconds: number, intervalMs: number): SurvivalWave {
  const count = Math.floor((SURVIVAL_ANCHORS * (toSeconds - fromSeconds) * 1000) / intervalMs)
  return survivalWaveRow(monster, count, fromSeconds, intervalMs)
}

export function survivalBuffRow(buff: string, target: SurvivalBuff['target'], startSeconds: number, endSeconds: number): SurvivalBuff {
  return { buff, target, startSeconds, endSeconds }
}

export function survivalPickupRow(item: string, count: number, atSeconds: number): SurvivalPickup {
  return { item, count, atSeconds }
}

export function survivalTrapRow(row: BossTrap, startSeconds: number, endSeconds: number): SurvivalTrap {
  return { ...row, startSeconds, endSeconds }
}

/**
 * One island for a preset: `defaultWorld()` with overrides, a fresh object
 * every call. The preset switches worlds on itself (`world.enabled`);
 * `campaign()` inherits them switched off.
 */
export function island(overrides: Partial<WorldDef>): WorldDef {
  return { ...defaultWorld(), ...overrides }
}
