import {
  BOSS_IDS,
  MOBILE_BOSS_IDS,
  bossDeathBuffs,
  defaultBossFight,
  defaultDungeonBoss,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultFloorTraps,
  defaultLobby,
  defaultParameters,
  defaultSurvivalOptions,
  escapeFloorTimer,
  MYSTERY_STARTER_TRAP_SECONDS,
  scatterWave,
  stockWavePickups,
  SHOOTER_ARROW_TRAPS,
  withGatewayLocks
} from './parameters'
import type {
  BossArenaOptions,
  BossFight,
  BossTrap,
  BossWave,
  DungeonBoss,
  DungeonParameters,
  FloorBuff,
  FloorLock,
  SurvivalBuff,
  SurvivalOptions,
  SurvivalPickup,
  SurvivalTrap,
  SurvivalWave,
  WaveEntry
} from './parameters'
import { oneOfEachUpgrade } from '../levelTemplate/surgery'
import { deepLoot, midLoot, mysteryButton, mysteryKit, shallowLoot } from './presetMystery'
import type { MysteryPicks } from './presetMystery'
import type { CampaignSlot } from '../campaign'
import { MUSIC_DEFAULT } from '../music/tracks'
// Type-only: presets.ts imports CLAUDE_PRESETS from this file at runtime, so a
// runtime import of CampaignPreset back from presets.ts would cycle. `import
// type` is erased at compile time and carries no such risk.
import type { CampaignPreset } from './presets'

/**
 * Ten hand-built presets that show off everything added since the beta
 * classics: floor bosses, multi-boss arenas and lineups, survival arenas,
 * chained arenas, per-floor traps/timers/buffs, and mystery buttons and
 * enhanced/disguised lock buttons. Grouped separately from
 * the three classic presets in the preset dialog (see `PRESET_GROUPS` in
 * `presets.ts`).
 *
 * Same rules as the classic presets: `build()` must return a fresh object
 * every call and draw no random values — every helper below is a function
 * that allocates new arrays/objects on each invocation, never a shared
 * top-level constant handed out by reference.
 */

// --- shared builder helpers -------------------------------------------------

/**
 * `defaultParameters()` sized to `levels`: every per-floor array (buffs,
 * traps, timers, boss, music) gets a fresh default entry per floor, so a
 * preset below only has to override the floors it actually changes.
 * `themes`/`levelMonsters`/`boss`/`lobbies`/`levelOrder` are cleared to
 * nothing so a preset can never accidentally inherit the castle campaign's
 * eight-floor versions — every preset supplies its own.
 */
function campaign(levels: number, overrides: Partial<DungeonParameters>): DungeonParameters {
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
function buttonLocks(counts: readonly number[]): FloorLock[] {
  return counts.map((n) => (n === 0 ? { enabled: false } : n === 1 ? { enabled: true } : { enabled: true, buttons: n }))
}

/** `{kind:'lobby',index:i}` / `{kind:'floor',index:i}` / `{kind:'boss',index:i}` shorthands. */
const L = (index: number): CampaignSlot => ({ kind: 'lobby', index })
const F = (index: number): CampaignSlot => ({ kind: 'floor', index })
const B = (index: number): CampaignSlot => ({ kind: 'boss', index })

/** Floors `from..to` inclusive, ascending. */
function floorRange(from: number, to: number): CampaignSlot[] {
  return Array.from({ length: to - from + 1 }, (_, i) => F(from + i))
}

/**
 * The shape most of the presets share: one lobby, every floor, a second
 * lobby, then a single boss fight — no escape floor after it. Distinct from
 * `shippedOrder()`, which plays one more floor AFTER the boss.
 */
function actOrder(levels: number): CampaignSlot[] {
  return [L(0), ...floorRange(0, levels - 1), L(1), B(0)]
}

/** A wave tier carrying nothing at all — the "skip this tier" entry. */
function emptyWave(): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 1500 }
}

/**
 * A five-tier wave table that only fills tier 0 and the boss-death tier,
 * leaving 75/50/25% empty. Every monster is anchored (never scattered), which
 * sidesteps the blocking-wreck scatter restriction entirely — see
 * actorCollision.ts. Used for every multi-boss arena/floor below (mandatory —
 * the engine cannot tell one boss's threshold from another's) and, for
 * simplicity, for most single-boss ones too.
 */
function tierAndDeathWaves(
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
function lightArenaWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave([], [['bat1', 20], ['tick1', 10]], 3000),
    scatterWave([], [['skeleton1', 16], ['archer1', 8]], 2500),
    scatterWave([], [['skeleton2', 12], ['wisp1', 8]], 2000, [], drops.half),
    scatterWave([], [['lich', 3], ['archer2', 6]], 1500, [], drops.quarter, SHOOTER_ARROW_TRAPS),
    scatterWave([], [['lich', 2]], 1500, bossDeathBuffs(), drops.death, SHOOTER_ARROW_TRAPS)
  ]
}

/** One stock lobby, gold and upgrades overridable — a fresh object every call. */
function lobby(presetId: string, overrides: Partial<ReturnType<typeof defaultLobby>> = {}): ReturnType<typeof defaultLobby> {
  return { ...defaultLobby(presetId), ...overrides }
}

/** A fresh arena, built from the stock boss fight's arena with overrides applied. */
function arena(overrides: Partial<BossArenaOptions>): BossArenaOptions {
  return { ...defaultBossFight().arena, ...overrides }
}

/** A boss-mode fight from an arena override set. */
function bossFight(overrides: Partial<BossArenaOptions>): BossFight {
  return { arena: arena(overrides) }
}

/** A survival-mode fight from an arena override set and a survival config. */
function survivalFight(arenaOverrides: Partial<BossArenaOptions>, survival: Partial<SurvivalOptions>): BossFight {
  return { mode: 'survival', arena: arena(arenaOverrides), survival: { ...defaultSurvivalOptions(), ...survival } }
}

/** A dungeon-floor boss picked by exact lineup (always a single boss here). */
function floorBoss(
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
function floorBossRandom(pool: readonly string[], count: number, waves: BossWave[]): DungeonBoss {
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
function floorTierAndDeathWaves(
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

function survivalWaveRow(monster: string, count: number, atSeconds: number, intervalMs = 1500): SurvivalWave {
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
function phaseRow(monster: string, fromSeconds: number, toSeconds: number, intervalMs: number): SurvivalWave {
  const count = Math.floor((SURVIVAL_ANCHORS * (toSeconds - fromSeconds) * 1000) / intervalMs)
  return survivalWaveRow(monster, count, fromSeconds, intervalMs)
}

function survivalBuffRow(buff: string, target: SurvivalBuff['target'], startSeconds: number, endSeconds: number): SurvivalBuff {
  return { buff, target, startSeconds, endSeconds }
}

function survivalPickupRow(item: string, count: number, atSeconds: number): SurvivalPickup {
  return { item, count, atSeconds }
}

function survivalTrapRow(row: BossTrap, startSeconds: number, endSeconds: number): SurvivalTrap {
  return { ...row, startSeconds, endSeconds }
}

// --- Lunch Break -------------------------------------------------------------

/** One friendly plate a floor — mostly a treat, with a small squad or an arrow room as the catch. */
function lunchBreakMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit()
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(1, shallowLoot(), [['Bat swarm', 3], ['Tick nest', 3], ['Arrow storm', 2]]),
      kit.pick(1, shallowLoot(), [['Skeleton squad', 3], ['Slime pit', 2], ['Archer volley', 2], ['Arrow storm', 2]]),
      kit.pick(1, midLoot(), [['Skeleton squad', 2], ['Wisps', 3], ['Archer volley', 2], ['Axe mill', 2]])
    ]
  }
}

function lunchBreak(): DungeonParameters {
  return campaign(3, {
    mapWidth: 56,
    mapHeight: 42,
    minRoomCount: 6,
    maxRoomCount: 8,
    themes: ['b_mixed', 'e_mixed', 'g_mixed'],
    levelMonsters: [
      ['bat1', 'tick1', 'maggot'],
      ['skeleton1', 'archer1', 'slime'],
      ['skeleton2', 'archer2', 'wisp1']
    ],
    floorMusic: ['act1', 'act2', 'act3'],
    lobbies: [lobby('BETA-dungeon-prep', { startingGold: 15000 })],
    ...lunchBreakMystery(),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          minWidth: 32,
          maxWidth: 42,
          minHeight: 32,
          maxHeight: 42,
          bossPool: ['boss_knight', 'boss_lich', 'boss_dragon', 'boss_queen'],
          waves: lightArenaWaves(),
          monsterMultiplier: 0.6,
          invulnerability: { enabled: true, seconds: [15, 15, 15], countdown: true },
          music: 'boss_1'
        })
      ]
    }
    // no levelOrder: 3 floors, 1 fight, 1 lobby — the default order (every
    // lobby, then every floor, then every fight) is exactly L0 -> F0-F2 -> AB0.
  })
}

// --- the clock presets' shared ending ---------------------------------------

/**
 * Monsters at +50% damage and speed — the clock presets' late-fight spike.
 * A boss actor does NOT catch a monsters-only field (owner playtest,
 * 2026-10-01, DISCOVERY-LOG), so every enrage below lands together with fresh
 * minions — they are what it actually reaches.
 */
function enrage(): FloorBuff[] {
  return [{ buff: 'bloodlust', target: 'monsters' }]
}

/**
 * The clock presets' last floor: one random mobile boss, no lock buttons, so
 * the seal opens on its death alone and the clock is spent hunting it, not
 * plates. Invulnerability stays off — it may not share a floor with a timer.
 * At 25% the boss is cornered: `cornered` joins it, enraged. Sized to the last
 * floor (`levels` long), the only enabled entry — see the comment on
 * `campaign()`.
 */
function huntFloorBoss(
  levels: number,
  tier0: readonly WaveEntry[],
  cornered: readonly WaveEntry[],
  death: readonly WaveEntry[]
): DungeonBoss[] {
  const bosses = Array.from({ length: levels }, () => defaultDungeonBoss())
  const waves = floorTierAndDeathWaves(tier0, death)
  // a floor wave keeps `traps: []` present — see floorTierAndDeathWaves
  waves[3] = { ...scatterWave([], cornered, 1500, enrage()), traps: [] }
  // `bossCount` left absent (= 1): `parameters.txt` writes no count for a
  // single boss, so an explicit 1 would not round-trip
  const { bossCount: _single, ...boss } = floorBossRandom(MOBILE_BOSS_IDS, 1, waves)
  bosses[levels - 1] = boss
  return bosses
}

/** A boss arena's invulnerability, switched off — the seconds stay on the object, unread. */
function noInvulnerability(): BossArenaOptions['invulnerability'] {
  return { ...defaultBossFight().arena.invulnerability, enabled: false }
}

/** A small survival arena, the clock presets' finale. */
function clockArena(waves: SurvivalWave[]): BossFight {
  return survivalFight(
    { theme: 'g_mixed', minWidth: 32, maxWidth: 42, minHeight: 32, maxHeight: 42, music: 'boss_final' },
    {
      seconds: 120,
      // a tick every second, the same clock as the five timed floors:
      // `milestones` flashed one "2:00" during the load fade and then went
      // silent for a minute, and playtesters could not tell what the goal was
      countdown: 'seconds',
      waves,
      // the last 30 seconds enraged, on the lich miniboss's push
      buffs: [survivalBuffRow('bloodlust', 'monsters', 90, 120)],
      // one health drop at the halfway mark, then the arrows for the last minute
      pickups: [survivalPickupRow('powerup_health', 1, 60)],
      traps: [survivalTrapRow(SHOOTER_ARROW_TRAPS[0], 60, 120), survivalTrapRow(SHOOTER_ARROW_TRAPS[1], 60, 120)]
    }
  )
}

// --- Beat the Clock ----------------------------------------------------------

/**
 * Two minutes in the clock arena, getting meaner every 30 seconds — the party
 * arrives from the boss-prep lobby, upgraded, so a miniboss leads each push
 * and the lich miniboss closes it.
 */
function beatTheClockArena(): BossFight {
  return clockArena([
    survivalWaveRow('tick1#2', 12, 0, 800),
    survivalWaveRow('mb_tick', 1, 0),
    survivalWaveRow('skeleton3', 12, 30, 1200),
    survivalWaveRow('archer2', 6, 30),
    survivalWaveRow('mb_skeleton', 2, 30, 3000),
    survivalWaveRow('lich', 6, 60),
    survivalWaveRow('mb_eye', 1, 60),
    survivalWaveRow('mb_lich', 1, 90),
    survivalWaveRow('lich#0', 4, 90),
    // filler between the pushes, so the arena never goes quiet — the
    // toughest regulars, since an upgraded party vaporizes the easy ones
    survivalWaveRow('bat2#2', 16, 15),
    survivalWaveRow('skeleton3', 12, 45, 2000),
    survivalWaveRow('archer3', 8, 75, 2000)
  ])
}

function beatTheClock(): DungeonParameters {
  const levels = 5
  const params = campaign(levels, {
    mapWidth: 64,
    mapHeight: 48,
    minRoomCount: 8,
    maxRoomCount: 10,
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed'],
    levelMonsters: [
      ['bat1', 'bat2'],
      ['tick1', 'tick2'],
      ['skeleton3', 'bat2'],
      ['skeleton3', 'tick2'],
      ['skeleton3', 'bat1', 'tick1']
    ],
    floorMusic: ['act1', 'act1', 'act2', 'act2', 'act3'],
    // the last floor is the hunt: kill its boss before the clock does
    levelBoss: huntFloorBoss(levels, [['skeleton3', 6]], [['skeleton3', 4]], [['skeleton3', 4]]),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    // L0 -> F0-F4 -> L1 -> AS0: the lobby is the reward for the hunt, and
    // the campaign ends on one more clock instead of a boss
    levelOrder: actOrder(levels),
    boss: { enabled: true, fights: [beatTheClockArena()] }
  })
  // every floor timed, clock shrinking as the damage rate ramps — except the
  // hunt, which gets three minutes because a boss fight eats the clock
  const seconds = [150, 120, 100, 80, 180]
  const freqMs = [250, 212, 175, 137, 100]
  params.levelTimers = seconds.map((s, i) => ({ enabled: true, seconds: s, damage: 2, freqMs: freqMs[i], countdown: true }))
  // No sprinting for the stairs: the middle floors hide two buttons each. The
  // hunt has none — its boss is the lock.
  params.levelLock = buttonLocks([1, 2, 2, 2, 0])
  return params
}

// --- Boss Rush -----------------------------------------------------------------

/**
 * Every floor's one lock button also drops supplies — never a squad or a
 * trap — so searching the floor pays for the boss standing on it.
 */
function bossRushMystery(levels: number): Pick<DungeonParameters, 'mysteryButtons' | 'levelLockMystery'> {
  const kit = mysteryKit([
    mysteryButton('Field rations', 'Supplies for the fight', {
      loot: [['powerup_health', 1], ['mana_2', 2]]
    })
  ])
  const supplies: MysteryPicks = [
    ['Field rations', 3],
    ['Refreshments', 3],
    ['Rejuvenation', 2],
    ['Invincibility', 1],
    ['Fury', 1]
  ]
  return {
    mysteryButtons: kit.buttons,
    levelLockMystery: Array.from({ length: levels }, () => kit.pick(1, supplies))
  }
}

function bossRush(): DungeonParameters {
  const levels = 4
  return campaign(levels, {
    themes: ['e_mixed', 'bonus3', 'f_frozen', 'i_mixed'],
    levelMonsters: [
      ['skeleton1', 'archer1'],
      ['bonus_archer1', 'bonus_skeleton1'],
      ['wisp1', 'tick2'],
      ['guard_desert', 'mummy_desert']
    ],
    levelBoss: [
      floorBoss({ boss_knight: 1 }, floorTierAndDeathWaves([['skeleton1', 10]], [['skeleton1', 5]])),
      floorBoss({ boss_lich: 1 }, floorTierAndDeathWaves([['bonus_skeleton1', 10]], [['bonus_skeleton1', 5]])),
      floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp1', 8]], [['wisp1', 4]])),
      floorBoss({ boss_anubis: 1 }, floorTierAndDeathWaves([['mummy_desert', 10]], [['mummy_desert', 5]]))
    ],
    // one button on every boss floor, so the way out needs the boss dead AND
    // the floor searched — the boss stays the main event
    levelLock: buttonLocks([1, 1, 1, 1]),
    ...bossRushMystery(levels),
    floorMusic: ['act2', 'bonus_1', 'act3', 'desert_temple'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'g_mixed',
          bossSelection: 'lineup',
          bossLineup: { boss_dragon: 1, boss_queen: 1 },
          // Set explicitly to match the lineup's own total (2): `boss<i>Count=`
          // is written whenever `arenaBossCount()` (which reads the lineup
          // total in lineup mode) isn't 1, whatever the selection mode — a
          // round-trip artifact this object may as well already carry, the
          // same "kept on the object, simply unread" losslessness a mode flip
          // already promises.
          bossCount: 2,
          waves: tierAndDeathWaves([['skeleton2', 20], ['archer2', 10]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Arena Marathon --------------------------------------------------------------

function arenaMarathon(): DungeonParameters {
  const order: CampaignSlot[] = [L(0), F(0), B(0), L(1), B(1), B(2), L(2), B(3)]
  return campaign(1, {
    themes: ['a_mixed'],
    levelMonsters: [['bat1', 'tick1', 'maggot']],
    floorMusic: ['act1'],
    // lobby index 1 needs its own explicit music — `defaultParameters()`'s
    // own second lobby (the implicit base `parseParametersTxt` starts from)
    // already carries `music: 'boss_1'`, and a lobby's `music=` line is only
    // written when it differs from `default`, so leaving this one unset would
    // silently inherit that stale value back on re-import. See the identical
    // landmine on `longHaul()`'s `levelTimers`/`levelTraps`.
    lobbies: [
      lobby('BETA-dungeon-prep'),
      lobby('BETA-boss-prep', { startingGold: 20000, music: 'boss_1' }),
      lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })
    ],
    levelOrder: order,
    boss: {
      enabled: true,
      fights: [
        // AS0 — the warm-up, on a party carrying only the first lobby's 10 000
        // gold: four 30-second phases of floor-1 monsters, about 2 a second,
        // and one miniboss in the last phase. The first cut (bat1 ×60, then skeleton1 ×20) died
        // on arrival; the second (elites, ~4.4 a second, three minibosses)
        // wiped the party (owner playtests, 2026-10-05). The room is
        // Colosseum-sized, so every anchor sits inside aggro range and nothing
        // piles up idle. Intervals divide each phase into whole rounds of 9.
        survivalFight(
          { theme: 'b_mixed', minWidth: 16, maxWidth: 20, minHeight: 18, maxHeight: 22, music: 'boss_1' },
          {
            seconds: 120,
            countdown: 'seconds',
            waves: [
              phaseRow('bat1', 0, 30, 5000),
              phaseRow('tick1', 0, 30, 15000),
              phaseRow('skeleton1', 30, 60, 10000),
              phaseRow('bat1', 30, 60, 10000),
              phaseRow('maggot', 60, 90, 10000),
              phaseRow('archer1', 60, 90, 15000),
              // the closing push: the miniboss arrives alone, never alongside
              // archers (the second playtest broke at mb_tick + elite archers
              // + elite skeletons landing together)
              phaseRow('skeleton1', 90, 120, 10000),
              phaseRow('bat2', 90, 120, 7500),
              survivalWaveRow('mb_tick', 1, 90)
            ],
            pickups: [survivalPickupRow('powerup_health', 2, 60), survivalPickupRow('mana_2', 2, 60)]
          }
        ),
        // AB1 — a single random boss, knight or lich. Every health tier
        // spawns adds, so each invulnerability window has something to fight
        // (with empty 75/50/25% tiers it was only a wait — owner playtest,
        // 2026-10-05). Floor 2-3 strength for a party carrying the 20 000-gold
        // lobby's gear: no liches until the boss is dead.
        bossFight({
          theme: 'c_mixed',
          bossPool: ['boss_knight', 'boss_lich'],
          waves: (() => {
            const drops = stockWavePickups()
            return [
              scatterWave([], [['skeleton1', 12], ['archer1', 6]], 2000),
              scatterWave([], [['skeleton1', 12], ['maggot', 8]], 2000),
              scatterWave([], [['skeleton2', 10], ['archer1', 6]], 2000, [], drops.half),
              scatterWave([], [['skeleton2', 10], ['bat2', 12]], 2000, [], drops.quarter),
              scatterWave([], [['lich', 4]], 1500, bossDeathBuffs(), drops.death)
            ]
          })(),
          music: 'boss_1'
        }),
        // AS2 — six 30-second phases on floor 2-3 monsters, about 1.8 spawns
        // a second, against the 20 000-gold lobby's gear. The first cut
        // (skeleton3, frost-spitting lich#2, lich#0, bloodlust, five
        // minibosses, ~4 a second) overran the party (owner playtest,
        // 2026-10-05): no liches now, no bloodlust, one miniboss per half and
        // never alongside archers, arrows only in the last phase.
        survivalFight(
          { theme: 'd_mixed', minWidth: 16, maxWidth: 24, minHeight: 18, maxHeight: 26, music: 'boss_1' },
          {
            seconds: 180,
            countdown: 'seconds',
            waves: [
              phaseRow('skeleton1', 0, 30, 10000),
              phaseRow('archer1', 0, 30, 10000),
              phaseRow('skeleton2', 30, 60, 10000),
              phaseRow('bat2', 30, 60, 10000),
              phaseRow('maggot', 60, 90, 10000),
              phaseRow('wisp1', 60, 90, 10000),
              survivalWaveRow('mb_maggot', 1, 60),
              phaseRow('skeleton2', 90, 120, 10000),
              phaseRow('archer1', 90, 120, 10000),
              phaseRow('skeleton1', 120, 150, 10000),
              phaseRow('eye', 120, 150, 10000),
              // the last push: the miniboss, then the arrows
              phaseRow('skeleton2', 150, 180, 10000),
              phaseRow('bat2', 150, 180, 10000),
              survivalWaveRow('mb_tick', 1, 150)
            ],
            pickups: [survivalPickupRow('powerup_health', 1, 60), survivalPickupRow('potion_2', 1, 120)],
            traps: [
              survivalTrapRow(SHOOTER_ARROW_TRAPS[0], 150, 180),
              survivalTrapRow(SHOOTER_ARROW_TRAPS[1], 150, 180)
            ]
          }
        ),
        // AB3 — the finale: 3 random bosses from the full roster
        bossFight({
          theme: 'g_mixed',
          bossPool: [...BOSS_IDS],
          bossCount: 3,
          waves: tierAndDeathWaves([['skeleton1', 20]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Trap Gauntlet ---------------------------------------------------------------

/**
 * The plates are mostly trap rooms firing that floor's own projectiles, and
 * from the second floor on the lock buttons are trapped too — the one button
 * the party cannot skip may light up its room, or may pay out for braving it.
 * Trapped lock buttons grow with depth: one, then two on the last two floors.
 */
function trapGauntletMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery' | 'levelLockMystery'> {
  const kit = mysteryKit()
  // each floor's trap rooms, matching that floor's wall rig in levelTraps
  const rooms: MysteryPicks[] = [
    [['Arrow storm', 12]],
    [['Arrow storm', 6], ['Spike gauntlet', 6]],
    [['Axe mill', 6], ['Fireball ring', 6]],
    [['Boulder run', 6], ['Big fireball cross', 6]],
    [['Arrow storm', 3], ['Spike gauntlet', 3], ['Fireball ring', 3], ["Dragon's breath", 3]]
  ]
  const loot = [shallowLoot(), shallowLoot(), midLoot(), midLoot(), deepLoot(['Defense upgrade II'])]
  const squads: MysteryPicks[] = [
    [['Bat swarm', 3], ['Tick nest', 3]],
    [['Maggot brood', 3], ['Slime pit', 3]],
    [['Skeleton squad', 3], ['Archer volley', 3]],
    [['Skeleton squad', 3], ['Archer volley', 3]],
    [['Wisps', 2], ['Eye cluster', 2], ['Necromancer', 2]]
  ]
  const trapped = [0, 1, 1, 2, 2]
  return {
    mysteryButtons: kit.buttons,
    levelMystery: rooms.map((room, i) => kit.pick(2, loot[i], squads[i], room)),
    levelLockMystery: rooms.map((room, i) =>
      trapped[i] === 0
        ? { count: 0, pool: [] }
        : kit.pick(trapped[i], room, [['Nothing', 4], ['Refreshments', 2], ['Rejuvenation', 1], ['A chest', 1]])
    )
  }
}

function trapGauntlet(): DungeonParameters {
  const levels = 5
  return campaign(levels, {
    monsterMultiplier: 0.6,
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed'],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['skeleton1', 'archer1'],
      ['skeleton2', 'archer2'],
      ['eye', 'wisp1', 'lich']
    ],
    levelTraps: [
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1200, count: 2 },
        { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1200, count: 2 }
      ],
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_spike', direction: 'left', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_spike', direction: 'right', spread: 0, spawnRateMs: 1000, count: 2 }
      ],
      [
        { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_axe', direction: 'down', spread: 0.5, spawnRateMs: 900, count: 3 },
        { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 900, count: 3 }
      ],
      // Floors 4-5 carry the lethal ammunition (damage >= 50: boulders,
      // large fireballs, spikes). An always-on trap may fire it only in
      // straight, timeable lanes, never fanned out — a sprayed boulder or
      // spike cannot be dodged, and a lock button or the last corridor can
      // land inside it (playtest, 2026-09-28). tests/presets.test.ts holds
      // every preset to this; mystery buttons are exempt.
      [
        { projectile: 'shooter_stone_ball', direction: 'up', spread: 0, spawnRateMs: 2500, count: 1 },
        { projectile: 'shooter_stone_ball', direction: 'down', spread: 0, spawnRateMs: 2500, count: 1 },
        { projectile: 'shooter_fireball_2', direction: 'left', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_fireball_2', direction: 'right', spread: 0, spawnRateMs: 1000, count: 2 }
      ],
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 700, count: 4 },
        { projectile: 'shooter_spike', direction: 'down', spread: 0, spawnRateMs: 1200, count: 3 },
        { projectile: 'shooter_fireball', direction: 'left', spread: 0.5, spawnRateMs: 700, count: 4 },
        { projectile: 'enemy_boss_dragon_fireball', direction: 'right', spread: 0.5, spawnRateMs: 900, count: 2 }
      ]
    ],
    // buttons rise with the traps, so the trapped rooms have to be crossed
    // rather than run past
    levelLock: buttonLocks([1, 1, 2, 2, 3]),
    ...trapGauntletMystery(),
    floorMusic: ['act1', 'act2', 'act3', 'act4', 'act4'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          monsterMultiplier: 0.6,
          waves: [
            scatterWave([], [['skeleton1', 10]], 2500, [], [], [
              { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 4 },
              { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1000, count: 4 }
            ]),
            emptyWave(),
            scatterWave([], [['archer1', 8]], 2000, [], [], [
              { projectile: 'shooter_spike', direction: 'left', spread: 0, spawnRateMs: 900, count: 4 },
              { projectile: 'shooter_spike', direction: 'right', spread: 0, spawnRateMs: 900, count: 4 }
            ]),
            scatterWave([], [['lich', 4]], 1500, [], [], [
              { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 800, count: 4 },
              { projectile: 'enemy_axe', direction: 'down', spread: 0.5, spawnRateMs: 800, count: 4 }
            ]),
            scatterWave([], [['lich', 3]], 1500, bossDeathBuffs(), stockWavePickups().death, [
              { projectile: 'enemy_boss_dragon_fireball', direction: 'left', spread: 0.5, spawnRateMs: 900, count: 3 },
              { projectile: 'enemy_boss_anubis_fireball', direction: 'right', spread: 0.5, spawnRateMs: 900, count: 3 }
            ])
          ],
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Frozen Descent --------------------------------------------------------------

/**
 * Frost-themed plates: chests frozen into the caves, Krilith's own dead, and
 * rooms that fill with frost or confusion. One plate on the first floor and on
 * Krilith's, two in between.
 */
function frozenDescentMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    mysteryButton('Frozen chest', 'A chest in the ice', {
      loot: [['chest_blue', 1], ['mana_2', 1]]
    }),
    mysteryButton('Frozen dead', 'The frozen dead rise', {
      monsters: [['krilith_mb_skeleton', 2], ['skeleton2', 6]]
    })
  ])
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(1, shallowLoot(), [
        ['Wisps', 4], ['Gold beetles', 4], ['Frozen chest', 2],
        ['Frost wall', 3], ['Arrow storm', 2]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Skeleton squad', 3], ['Wisps', 3], ['Frozen dead', 2], ['Frozen chest', 2],
        ['Frost wall', 3], ['Confusion', 2]
      ]),
      // the Regeneration floor — a breather, so the treasure leans richer
      kit.pick(2, midLoot(), [
        ['Eye cluster', 3], ['Wisps', 3], ['Frozen chest', 3],
        ['Frost wall', 2], ['Confusion', 2]
      ]),
      kit.pick(2, deepLoot(['Defense upgrade II']), [
        ['Necromancer', 3], ['Frozen dead', 3], ['Lich council', 1], ['Frozen chest', 2],
        ['Frost wall', 3], ['Confusion', 2], ['Death orbs', 1]
      ]),
      kit.pick(1, deepLoot(['Health upgrade II']), [
        ['Frozen chest', 3], ['Wisps', 2], ['Frozen dead', 2],
        ['Frost wall', 2]
      ])
    ]
  }
}

function frozenDescent(): DungeonParameters {
  const levels = 5
  return campaign(levels, {
    themes: ['f', 'f_fine', 'f_frozen', 'f_mixed', 'f_frozen'],
    levelMonsters: [
      ['wisp2', 'tick2'],
      ['skeleton2', 'wisp1'],
      ['eye', 'wisp2'],
      ['lich', 'skeleton2'],
      ['wisp2', 'tower_static_frost']
    ],
    floorMusic: ['act3', 'act3', 'act4', 'act4', 'act4'],
    // F1: a frost aura on the monsters. F2: a breather — the Regeneration
    // field (buff id `test`) heals the party but halves their speed.
    levelBuffs: [
      [],
      [{ buff: 'frost', target: 'monsters' }],
      [{ buff: 'test', target: 'players' }],
      [],
      []
    ],
    // F4: icebeam-overload traps on all four walls, and a Krilith floor boss
    // (sized to 5 — the last floor is the highest enabled index, so no
    // round-trip truncation risk, see the comment on `campaign()`).
    levelTraps: [
      [],
      [],
      [],
      [],
      [
        { projectile: 'enemy_tower_icebeam_overload', direction: 'up', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'down', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'left', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'right', spread: 0, spawnRateMs: 900, count: 3 }
      ]
    ],
    levelBoss: [
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp2', 8]], [['wisp2', 4]]))
    ],
    // the deeper caves become a scavenger hunt: two buttons from floor 3 on,
    // and on Krilith's floor the wall waits for her too
    levelLock: buttonLocks([0, 0, 2, 2, 2]),
    ...frozenDescentMystery(),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'f_frozen',
          bossSelection: 'lineup',
          bossLineup: { boss_krilith: 1 },
          waves: tierAndDeathWaves(
            [['krilith_mb_skeleton', 6], ['tower_static_frost', 3]],
            [['krilith_mb_skeleton', 4]]
          ),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Pandemonium -------------------------------------------------------------

function pandemonium(): DungeonParameters {
  const levels = 4
  return campaign(levels, {
    foodMultiplier: 1.6,
    themes: ['c_mixed', 'd_mixed', 'e_mixed', 'f_mixed'],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['eye', 'wisp1'],
      ['skeleton2', 'archer2']
    ],
    levelBoss: [2, 2, 3, 3].map((count, i) =>
      floorBossRandom(
        MOBILE_BOSS_IDS,
        count,
        floorTierAndDeathWaves([['skeleton1', 6 + i * 2]], [['skeleton1', 4]])
      )
    ),
    floorMusic: ['act2', 'act3', 'act3', 'act4'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'g_mixed',
          bossPool: [...BOSS_IDS],
          bossCount: 6,
          waves: tierAndDeathWaves([['skeleton1', 15]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- The Long Haul ---------------------------------------------------------------

/** The classic escape-floor pool: ~42% battlements, repeated from the castle preset. */
function escapeFloorPool(): string[] {
  return [
    'tower_empty', 'tower_empty', 'tower_empty', 'tower_empty',
    'tower_empty', 'tower_empty', 'tower_empty', 'tower_empty',
    'skeleton3', 'bat2', 'wisp2', 'lich', 'mb_eye',
    'wisp1', 'tower_static_frost', 'tower_static_frost', 'tower_static_frost',
    'mb_lich', 'tower_nova'
  ]
}

function escapeFloorTraps(): BossTrap[] {
  return [
    { projectile: 'shooter_fireball', direction: 'up', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'down', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 1000, count: 8 }
  ]
}

/**
 * The Long Haul's plates walk the whole depth ramp across four acts: coins and
 * vermin in the castle, frost around Krilith, tombs and scarabs in the desert,
 * and the lich council, kamikazes and dragonfire only in the bonus act at the
 * bottom. One plate on the first floor, two after, none on the escape floor.
 */
function longHaulMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit()
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      // castle act
      kit.pick(1, shallowLoot(), [
        ['Tick nest', 5], ['Bat swarm', 5], ['Maggot brood', 3], ['Arrow storm', 3], ['Fireball ring', 2]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Maggot brood', 4], ['Slime pit', 4], ['Tick nest', 3], ['Flower bed', 3], ['Arrow storm', 3], ['Axe mill', 2]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Skeleton squad', 5], ['Archer volley', 5], ['Bat swarm', 2], ['Axe mill', 3], ['Arrow storm', 2]
      ]),
      // castle/ice act
      kit.pick(2, shallowLoot(), [
        ['Skeleton squad', 4], ['Archer volley', 4], ['Necromancer', 3], ['Axe mill', 3], ['Spike gauntlet', 2]
      ]),
      kit.pick(2, midLoot(), [
        ['Eye cluster', 4], ['Wisps', 4], ['Nova towers', 3], ['Purple drift', 3], ['Fireball ring', 2]
      ]),
      kit.pick(2, midLoot(), [
        ['Wisps', 4], ['Fire and frost tracking', 3], ['Nova towers', 2], ['Frost wall', 3], ['Confusion', 2]
      ]),
      // desert act
      kit.pick(2, midLoot(), [
        ['Gold beetles', 4], ['Tick nest', 3], ['Spider nest', 3], ['Big fireball cross', 3], ['Arrow storm', 2]
      ]),
      kit.pick(2, midLoot(), [
        ['Mummy tomb', 3], ['Spider nest', 3], ['Gold beetles', 2],
        ['Spike gauntlet', 2], ['Boulder run', 2], ['Fireball ring', 2]
      ]),
      kit.pick(2, deepLoot(['Defense upgrade II']), [
        ['Mummy tomb', 3], ['Spider nest', 3], ['Fire pillars', 2], ['Lich council', 1],
        ["Anubis' wrath", 2], ['Death orbs', 2]
      ]),
      // bonus act
      kit.pick(2, deepLoot(['Damage upgrade II']), [
        ['Skeleton squad', 4], ['Archer volley', 3], ['Necromancer', 3],
        ['Purple drift', 3], ['Axe mill', 2], ['Death orbs', 1]
      ]),
      kit.pick(2, deepLoot(['Health upgrade II']), [
        ['Wisps', 3], ['Necromancer', 3], ['Eye cluster', 3], ['Lich council', 2],
        ['Death orbs', 2], ['Frost wall', 2], ['Spike gauntlet', 1]
      ]),
      kit.pick(2, deepLoot(['Damage upgrade II', 'Mana upgrade II']), [
        ['Lich council', 3], ['Kamikazes', 2], ['Eye cluster', 2], ['Fire floaters', 2],
        ['Death orbs', 2], ["Dragon's breath", 1], ['Purple drift', 2]
      ]),
      // the escape floor — the clock is pressure enough
      { count: 0, pool: [] }
    ]
  }
}

function longHaul(): DungeonParameters {
  const levels = 13
  const order: CampaignSlot[] = [
    L(0),
    ...floorRange(0, 2),
    L(1),
    ...floorRange(3, 5),
    L(2),
    B(0),
    ...floorRange(6, 11),
    L(3),
    B(1),
    F(12)
  ]

  const params = campaign(levels, {
    themes: [
      'a_mixed', 'b_mixed', 'c_mixed', // castle act
      'd_mixed', 'e_mixed', 'f_frozen', // castle/ice act
      'h', 'i', 'i_mixed', // desert act
      'bonus2', 'bonus4', 'g_mixed', // bonus act
      'f_mixed' // escape floor
    ],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['skeleton1', 'archer1'],
      ['skeleton2', 'archer2'],
      ['eye', 'wisp1'],
      ['wisp2', 'tower_static_frost'],
      ['guard_desert', 'tick1'],
      ['mummy_desert', 'mummy_ranged'],
      ['lich_desert', 'spider'],
      ['bonus_archer1', 'bonus_skeleton1'],
      ['wisp2', 'skeleton2'],
      ['mb_lich', 'mb_doomspawn'],
      escapeFloorPool()
    ],
    floorMusic: [
      'act1', 'act1', 'act2',
      'act2', 'act3', 'act3',
      'desert_cavern', 'desert_temple', 'desert_temple',
      'bonus_1', 'bonus_2', 'act4',
      'act4'
    ],
    // Sized to 9 (0..8), NOT `levels` (13): `bossFloorN=` is only written for
    // an enabled floor, and the parser pads no further than the highest index
    // it actually saw — a trailing run of disabled placeholders past floor 8
    // would round-trip back as a shorter array, not a byte-identical one. See
    // the comment on `campaign()`.
    levelBoss: (() => {
      const bosses = Array.from({ length: 9 }, () => defaultDungeonBoss())
      bosses[2] = floorBoss({ boss_knight: 1 }, floorTierAndDeathWaves([['skeleton1', 10]], [['skeleton1', 5]]))
      bosses[5] = floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp2', 6]], [['wisp2', 4]]))
      bosses[8] = floorBoss({ boss_anubis: 1 }, floorTierAndDeathWaves([['mummy_desert', 10]], [['mummy_desert', 6]]))
      return bosses
    })(),
    // lobby index 1 is given music explicitly (not left on the `default`
    // sentinel) for a round-trip reason, not a flavour one: `defaultParameters()`
    // — the implicit base `parseParametersTxt` starts from — already has a
    // SECOND lobby of its own with `music: 'boss_1'`. `lobby1Music=` is only
    // written when a lobby's music differs from `default`, so leaving this one
    // on `default` would silently inherit that stale value back on re-import.
    // See the identical landmine on `levelTimers`/`levelTraps` below.
    lobbies: [
      lobby('BETA-dungeon-prep'),
      lobby('BETA-dungeon-prep', { startingGold: 15000, music: 'act2' }),
      lobby('BETA-boss-prep', { startingGold: 20000, music: 'boss_1' }),
      lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })
    ],
    levelOrder: order,
    ...longHaulMystery(),
    boss: {
      enabled: true,
      fights: [
        // the mid-campaign arena: a single random boss, lich or knight
        bossFight({
          theme: 'e_mixed',
          bossPool: ['boss_lich', 'boss_knight'],
          waves: tierAndDeathWaves([['skeleton1', 15], ['archer1', 8]], [['lich', 4]]),
          music: 'boss_1'
        }),
        // the finale: the stock castle wave table, unmodified
        bossFight({ music: 'boss_final' })
      ]
    }
  })

  // Floor 7 (the desert temple, "i") carries a light heat hazard and a couple
  // of light traps of its own. Both are also a round-trip necessity, not just
  // flavour: `defaultParameters()` — the implicit base `parseParametersTxt`
  // starts from — arms exactly floor 7 as ITS escape floor (levels=8), and
  // neither `timerN=`/`trapN=` is ever written for a floor that is off/empty,
  // so leaving floor 7 untouched here would silently inherit castle's
  // 90s/100ms escape clock and fireball rig back on re-import. Giving it its
  // own real (lighter) content is what forces an explicit line, which is the
  // only way to overwrite the stale one.
  params.levelTimers![7] = { enabled: true, seconds: 200, damage: 1, freqMs: 2000, countdown: false }
  params.levelTraps![7] = [
    { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1200, count: 2 },
    { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1200, count: 2 }
  ]
  // The escape floor (last): the classic pattern — a 90s hazard clock, a
  // fireball rig on all four walls, and nowhere else in the campaign pools
  // tower_empty.
  params.levelTimers![levels - 1] = escapeFloorTimer()
  params.levelTraps![levels - 1] = escapeFloorTraps()
  // Buttons escalate by act: one through the first act, two from the second
  // on (the knight/Krilith/Anubis floors need their boss too), and three on
  // the escape floor, against its 90-second clock.
  params.levelLock = buttonLocks([1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3])
  return params
}

// --- Double or Nothing -----------------------------------------------------------

/** One spewer per wall, all four walls — the shape every custom trap button below uses. */
function fourWalls(projectile: string, spawnRateMs: number, spread: number): BossTrap[] {
  return (['up', 'down', 'left', 'right'] as const).map((direction) => ({ projectile, direction, spread, spawnRateMs, count: 1 }))
}

/**
 * The red lock buttons are in plain sight and always safe: find them and the
 * floor opens. Everything else is a wager. The plates draw from a high-stakes
 * pool — tier-II upgrades, a jackpot and an extra life against lich councils,
 * kamikaze packs and rooms of death orbs — and the odds tilt toward the house
 * with every floor. Ignore them and walk into the boss with what you brought;
 * gamble and walk in a giant, or not at all.
 */
function doubleOrNothingMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    // the house pays out
    mysteryButton('Safe bet', 'A modest win', { loot: [['health_2', 1], ['valuable_5', 2]] }),
    mysteryButton('Power surge', 'Power surges through you', { loot: [['upgrade_damage_2', 1], ['potion_3', 1]] }),
    mysteryButton('Iron skin', 'Your skin turns to iron', { loot: [['upgrade_defense_2', 1], ['upgrade_health', 1]] }),
    mysteryButton('Vitality', 'You feel unstoppable', { loot: [['upgrade_health_2', 1], ['health_3', 1]] }),
    mysteryButton('Arcane well', 'Arcane power floods in', { loot: [['upgrade_mana_2', 1], ['mana_2', 2]] }),
    mysteryButton('Jackpot', 'JACKPOT!', { loot: [['chest_blue', 1], ['chest_green', 1], ['valuable_diamond', 1]] }),
    mysteryButton('Diamond rain', 'Diamonds!', { loot: [['valuable_diamond', 2], ['valuable_diamond_small_red', 2]] }),
    mysteryButton('Extra life', 'An extra life!', { loot: [['powerup_1up', 1]] }),
    // the house collects
    mysteryButton('Bone pit', 'The pit opens', { monsters: [['mb_skeleton', 2], ['skeleton2', 12], ['archer2', 6]] }),
    mysteryButton('Double trouble', 'Double or nothing... nothing', {
      monsters: [['mb_lich', 1], ['lich#0', 3], ['special_beheaded_kamikaze', 3]]
    }),
    mysteryButton('Death trap', 'You lose', {
      monsters: [['special_beheaded_kamikaze', 2]],
      traps: fourWalls('enemy_magicball_death', 500, 0.5),
      trapSeconds: MYSTERY_STARTER_TRAP_SECONDS
    }),
    mysteryButton('Inferno', 'Burn!', {
      monsters: [['floater_fire', 4]],
      traps: fourWalls('enemy_boss_dragon_fireball', 800, 0.5),
      trapSeconds: MYSTERY_STARTER_TRAP_SECONDS
    })
  ])
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(3, [
        ['Nothing', 10], ['Safe bet', 8], ['Silver stash', 4], ['Refreshments', 4],
        ['Power surge', 2], ['Iron skin', 2], ['Jackpot', 1], ['Diamond rain', 1],
        ['Bone pit', 5], ['Skeleton squad', 4], ['Lich council', 1],
        ['Arrow storm', 3], ['Spike gauntlet', 3], ['Death orbs', 2]
      ]),
      kit.pick(4, [
        ['Nothing', 8], ['Safe bet', 6], ['Silver stash', 3],
        ['Power surge', 2], ['Iron skin', 2], ['Vitality', 2], ['Arcane well', 1], ['Jackpot', 2], ['Diamond rain', 1],
        ['Bone pit', 5], ['Necromancer', 3], ['Lich council', 2], ['Kamikazes', 1],
        ['Death orbs', 3], ['Spike gauntlet', 3], ['Axe mill', 3]
      ]),
      kit.pick(4, [
        ['Nothing', 6], ['Safe bet', 4],
        ['Power surge', 3], ['Iron skin', 3], ['Vitality', 2], ['Arcane well', 2], ['Jackpot', 2], ['Diamond rain', 2],
        ['Three chests', 1],
        ['Lich council', 3], ['Bone pit', 4], ['Kamikazes', 2],
        ['Death orbs', 3], ['Death trap', 2], ['Boulder run', 2], ["Dragon's breath", 1]
      ]),
      kit.pick(5, [
        ['Nothing', 5], ['Safe bet', 3],
        ['Power surge', 3], ['Iron skin', 3], ['Vitality', 3], ['Arcane well', 2], ['Jackpot', 3], ['Diamond rain', 2],
        ['Extra life', 1],
        ['Lich council', 4], ['Double trouble', 3], ['Kamikazes', 3], ['Mummy tomb', 2],
        ['Death trap', 3], ['Inferno', 2], ["Dragon's breath", 2], ["Anubis' wrath", 2]
      ]),
      kit.pick(5, [
        ['Nothing', 4],
        ['Power surge', 3], ['Iron skin', 3], ['Vitality', 3], ['Arcane well', 2], ['Jackpot', 4], ['Diamond rain', 2],
        ['Extra life', 2],
        ['Double trouble', 5], ['Lich council', 4], ['Kamikazes', 3],
        ['Death trap', 4], ['Inferno', 3], ["Dragon's breath", 2], ["Anubis' wrath", 2]
      ])
    ]
  }
}

function doubleOrNothing(): DungeonParameters {
  const levels = 5
  return campaign(levels, {
    // the floors themselves are quiet — the plates are the danger
    monsterMultiplier: 0.6,
    themes: ['b_mixed', 'c_mixed', 'd_mixed', 'e_mixed', 'g_mixed'],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['skeleton1', 'archer1'],
      ['eye', 'wisp1'],
      ['skeleton2', 'archer2'],
      ['lich', 'wisp2']
    ],
    floorMusic: ['act1', 'act2', 'act3', 'act3', 'act4'],
    // the red buttons, never disguised: finding them is always the safe way on
    levelLock: buttonLocks([1, 1, 2, 2, 2]),
    ...doubleOrNothingMystery(),
    // a thin purse to start, so the gold won on the plates is what the
    // boss-prep shop is spent with
    lobbies: [
      lobby('BETA-dungeon-prep', { startingGold: 5000 }),
      lobby('BETA-boss-prep', { startingGold: 10000, music: 'boss_1' })
    ],
    levelOrder: actOrder(levels),
    boss: { enabled: true, fights: [bossFight({ music: 'boss_final' })] }
  })
}

// --- Shell Game --------------------------------------------------------------------

/**
 * Every plate looks the same. Each floor's lock buttons are drawn as mystery
 * plates (`disguise`), some of them fire a payload of their own, and decoys
 * are mixed in among them. A real lock button gives itself away only once
 * pressed, when it announces how many remain. The clock gives time to check
 * a few plates, never all of them.
 */
function shellGameMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery' | 'levelLockMystery'> {
  const kit = mysteryKit()
  // what a real lock button may also do — mostly help, sometimes cost time
  const lockPayload: MysteryPicks = [
    ['Nothing', 4], ['Refreshments', 3], ['Rejuvenation', 2], ['Fury', 1], ['Invincibility', 1],
    ['Bat swarm', 2], ['Skeleton squad', 2], ['Arrow storm', 2]
  ]
  // the decoys — tempting loot, and squads and trap rooms that eat the clock
  const decoys: MysteryPicks[] = [
    [...shallowLoot(), ['Bat swarm', 4], ['Tick nest', 4], ['Arrow storm', 4], ['Fireball ring', 3]],
    [...shallowLoot(), ['Tick nest', 4], ['Gold beetles', 3], ['Slime pit', 3], ['Arrow storm', 3], ['Axe mill', 3]],
    [...midLoot(), ['Skeleton squad', 4], ['Bat swarm', 3], ['Archer volley', 3], ['Axe mill', 3], ['Spike gauntlet', 2]],
    [...midLoot(), ['Skeleton squad', 4], ['Necromancer', 3], ['Gold beetles', 3], ['Spike gauntlet', 3], ['Boulder run', 2]],
    [...deepLoot(['Damage upgrade II']), ['Necromancer', 3], ['Bat swarm', 3], ['Kamikazes', 1], ['Death orbs', 3], ['Spike gauntlet', 2]]
  ]
  const decoyCounts = [2, 2, 3, 3, 4]
  // the hunt floor has no lock to disguise — its decoys just waste the clock
  const enhanced = [1, 1, 1, 2]
  return {
    mysteryButtons: kit.buttons,
    levelMystery: decoys.map((picks, i) => kit.pick(decoyCounts[i], picks)),
    levelLockMystery: [...enhanced.map((count) => ({ ...kit.pick(count, lockPayload), disguise: true })), { count: 0, pool: [] }]
  }
}

/**
 * The boss after the hunt, with no invulnerability to hide behind: a small
 * anchored add and a set of arrow traps on every health tier, so clearing
 * the bodyguards never buys a free kite, but never a horde either.
 */
function shellGameBossFight(): BossFight {
  const drops = stockWavePickups()
  return bossFight({
    minWidth: 32,
    maxWidth: 42,
    minHeight: 32,
    maxHeight: 42,
    invulnerability: noInvulnerability(),
    // no revives and no saves: with the stock '75-50-25-dead' the fight
    // played too easy, and a mid-fight save can lock a party into a doomed
    // state (written while someone is being torn apart)
    checkpoints: { respawnPlayers: 'never', saveGame: 'never' },
    waves: [
      scatterWave([], [['skeleton2', 8]], 2000),
      scatterWave([], [['archer2', 6], ['mb_skeleton', 1]], 2000, [], [], SHOOTER_ARROW_TRAPS),
      scatterWave([], [['skeleton3', 6], ['lich', 2]], 2000, [], drops.half, SHOOTER_ARROW_TRAPS),
      // 25%: enraged, standing in for the invulnerability this fight skips
      scatterWave([], [['lich#2', 3], ['mb_eye', 1]], 2000, enrage(), drops.quarter, SHOOTER_ARROW_TRAPS),
      scatterWave([], [['lich', 3]], 1500, bossDeathBuffs(), drops.death)
    ],
    music: 'boss_1'
  })
}

/** The clock arena after the boss — Beat the Clock's, a notch meaner from the first second. */
function shellGameArena(): BossFight {
  return clockArena([
    survivalWaveRow('skeleton3', 10, 0, 1200),
    survivalWaveRow('mb_skeleton', 1, 0),
    survivalWaveRow('lich', 6, 30),
    survivalWaveRow('mb_eye', 1, 30),
    survivalWaveRow('archer2', 6, 60),
    survivalWaveRow('mb_doomspawn', 1, 60),
    survivalWaveRow('mb_lich', 1, 90),
    survivalWaveRow('lich#0', 4, 90),
    // filler, as in Beat the Clock's, a notch tougher
    survivalWaveRow('skeleton3', 12, 0, 2000),
    survivalWaveRow('bat2#2', 16, 20),
    survivalWaveRow('archer3', 8, 45, 2000),
    survivalWaveRow('lich#2', 6, 75, 2000)
  ])
}

function shellGame(): DungeonParameters {
  const levels = 5
  const params = campaign(levels, {
    mapWidth: 64,
    mapHeight: 48,
    minRoomCount: 8,
    maxRoomCount: 10,
    monsterMultiplier: 0.5,
    themes: ['b_mixed', 'c_mixed', 'd_mixed', 'e_mixed', 'f_mixed'],
    levelMonsters: [
      ['bat1'],
      ['tick1', 'bat1'],
      ['skeleton1', 'bat2'],
      ['skeleton3', 'tick2'],
      ['skeleton3', 'bat2']
    ],
    floorMusic: ['act1', 'act2', 'act2', 'act3', 'act4'],
    // the last floor is the hunt, as in Beat the Clock — no lock, its boss is the way out
    levelLock: buttonLocks([1, 2, 2, 3, 0]),
    levelBoss: huntFloorBoss(levels, [['skeleton3', 6]], [['skeleton3', 4]], [['skeleton3', 4]]),
    ...shellGameMystery(),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    // the hunt, the lobby, then a boss to finish and a clock to outlast
    levelOrder: [L(0), ...floorRange(0, levels - 1), L(1), B(0), B(1)],
    boss: { enabled: true, fights: [shellGameBossFight(), shellGameArena()] }
  })
  // Beat the Clock on steroids: each locked floor has less time per button
  // (150 s for one, then down to 35 s each for three), and a floor that runs
  // out hurts harder and faster. The hunt gets three minutes for its boss.
  const seconds = [150, 135, 120, 105, 180]
  const freqMs = [200, 175, 150, 125, 100]
  params.levelTimers = seconds.map((s, i) => ({ enabled: true, seconds: s, damage: 3, freqMs: freqMs[i], countdown: true }))
  return params
}

// --- registry ----------------------------------------------------------------

/** In alphabetical order by label, which is the order the preset dialog lists them in. */
export const CLAUDE_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'claude-arena-marathon',
    label: 'Arena Marathon',
    description:
      'One warm-up floor, then four chained arenas — survival, boss, survival, a 3-boss finale. The survival rounds change monsters every 30 seconds — about 40 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(arenaMarathon())
  },
  {
    id: 'claude-beat-the-clock',
    label: 'Beat the Clock',
    description: 'Every floor runs on a shrinking hazard timer with hidden buttons to find, the last one hides a boss to kill before it hits, then two minutes in a miniboss-led survival arena — about 30 minutes.',
    group: 'claude',
    build: beatTheClock
  },
  {
    id: 'claude-boss-rush',
    label: 'Boss Rush',
    description: 'A mobile boss and a hidden button seal the way out of every floor, and each button drops supplies for the fight, then a two-boss finale — about 40 minutes.',
    group: 'claude',
    build: bossRush
  },
  {
    id: 'claude-double-or-nothing',
    label: 'Double or Nothing',
    description:
      'The red buttons are safe; every other plate is a wager of tier-II upgrades and extra lives against lich councils and death traps. The odds get worse the deeper you go — about 40 minutes.',
    group: 'claude',
    build: doubleOrNothing
  },
  {
    id: 'claude-frozen-descent',
    label: 'Frozen Descent',
    description: 'A five-floor descent through the ice caves, hunting buttons and frozen mystery plates, ending on Krilith — about 45 minutes.',
    group: 'claude',
    build: frozenDescent
  },
  {
    id: 'claude-lunch-break',
    label: 'Lunch Break',
    description: '3 short floors, each hiding one friendly mystery button, into one boss fight — about 15-20 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(lunchBreak())
  },
  {
    id: 'claude-pandemonium',
    label: 'Pandemonium',
    description: 'Every floor hosts several roaming bosses at once, then a six-boss finale — about 50 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(pandemonium())
  },
  {
    id: 'claude-shell-game',
    label: 'Shell Game',
    description:
      'Lock buttons look just like the decoy plates around them, and a steep clock gives time to check only a few. Then hunt a boss against the clock, finish a boss with no invulnerability, and outlast a survival arena — about 35 minutes.',
    group: 'claude',
    build: shellGame
  },
  {
    id: 'claude-long-haul',
    label: 'The Long Haul',
    description: 'A 13-floor campaign across four acts and two boss arenas, with more buttons to find and riskier mystery plates each act, ending in an escape floor — 2-3 hours.',
    group: 'claude',
    build: longHaul
  },
  {
    id: 'claude-trap-gauntlet',
    label: 'Trap Gauntlet',
    description: 'Wall traps escalate every floor, from arrows to dragonfire, and so do the buttons hidden under them — some of which are trapped too — about 45 minutes.',
    group: 'claude',
    build: trapGauntlet
  }
]
