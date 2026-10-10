import { MONSTER_FAMILIES, MONSTER_TYPES } from '../objects/monsterTypes'
import { THEME_DEFS } from './themes'
import { ALL_LOBBY_CATEGORIES } from '../lobby/shops'
import type { PlayerTweaks } from '../tweak/types'
import { noUpgrades } from '../levelTemplate/surgery'
import type { UpgradeCounts } from '../levelTemplate/surgery'
// the tweak key builder, so the default life removal below cannot drift from
// the key QuickSetup's checkbox writes. tweak/ imports nothing from config/,
// so this direction adds no cycle
import { removeKey } from '../tweak/chains'
import type { ArenaMode, CampaignSlot } from '../campaign'
import { ARENA_MODES, campaignOrder, gatewayAfter } from '../campaign'
// Type-only: boss/bosses.ts imports BOSS_IDS/MOBILE_BOSS_IDS FROM this file at
// runtime, so a runtime import back here would cycle. `import type` is erased
// at compile time and carries no such risk — see BossArenaOptions.bossLineup.
import type { BossId } from '../boss/bosses'

/** Ids of every theme the generator can emit — see themes.ts for the registry. */
export const THEMES: readonly string[] = THEME_DEFS.map((t) => t.id)

/** The four cover-placement patterns the arena's Boss tab offers. */
export const BOSS_COVER_PATTERNS = ['random', 'ring', 'gaussian', 'symmetric'] as const

/**
 * How a *mixed* arena theme lays its floor palette out — `random` lets the seed
 * pick, anything else pins it. Ignored entirely unless `arena.theme` is one of
 * the `- mixed` entries, which are the only ones with a palette to arrange.
 *
 * Listed literally rather than derived from `ARENA_PATTERN_KINDS` to keep
 * config/ from importing boss/ at runtime — the same reason `THEMED_WALL_PIECES`
 * is spelled out in themes.ts. `arenaPattern.test.ts` asserts the two stay in
 * sync, so adding a kind without listing it here fails the suite.
 */
export const BOSS_FLOOR_PATTERNS = [
  'random',
  'checker',
  'bandsH',
  'bandsV',
  'bandsDiag',
  'rings',
  'diamond',
  'cross',
  'triangle'
] as const
export type BossFloorPattern = (typeof BOSS_FLOOR_PATTERNS)[number]

/**
 * Hard ceiling on arena cover density, as a fraction of the free floor.
 *
 * A validation error rather than a warning: 0.5 shipped once and the arena
 * playtested as impassable, so anything this dense is a broken campaign, not
 * an aggressive one. 0.25 is roughly 98 pillars on a mid-size arena — dense,
 * but navigable given cover.ts's reachability guarantee.
 */
export const BOSS_COVER_DENSITY_MAX = 0.25

/**
 * How one monster of a boss wave reaches the arena floor.
 *
 * `anchors` is the original rig and the default: the monster's budget is split
 * round-robin across the 9 fixed spawn anchors and trickles in on the wave's
 * timer. The other four are one-shot *scatter* modes sharing cover.ts's
 * pattern names — the whole budget is placed as individual SpawnObjects across
 * the arena and fires once, so the wave's interval means nothing for that
 * monster (issue #21).
 */
export const BOSS_SPAWN_MODES = ['anchors', 'random', 'ring', 'gaussian', 'symmetric'] as const
export type BossSpawnMode = (typeof BOSS_SPAWN_MODES)[number]

/** Whether `mode` places its monsters as one-shot scattered spawns. */
export function isScatterMode(mode: BossSpawnMode): boolean {
  return mode !== 'anchors'
}

/** Who a buff field catches. */
export type BuffTarget = 'players' | 'monsters' | 'both'

/** The three targets, in form order. */
export const BUFF_TARGETS: readonly BuffTarget[] = ['players', 'monsters', 'both']

/**
 * A buff field's RectangleShape `types` bitmask, per target.
 *
 * Bit 1 = players is [VERIFIED] — timer mode ships it and monsters demonstrably
 * take no damage. Bit 2 = monsters is inferred: the shipped
 * `campaign/levels/level_boss_1.xml` binds an instakill `DangerArea{damage:
 * 1337}` to a `types: 2` shape, and `prefabs/trap_fire_floor.xml` uses `3` where
 * `1` is the known players-only value. Shipped content only ever uses 1, 2, 3
 * and 15. See DISCOVERY-LOG.md.
 */
export const BUFF_TARGET_TYPES: Record<BuffTarget, number> = {
  players: 1,
  monsters: 2,
  both: 3
}

/**
 * One buff aura on one floor.
 *
 * Unlike timer mode there is no countdown: the field is live from the moment
 * the floor loads and never switches off, so the buff simply is a property of
 * that floor. See buffs/field.ts for the node rig.
 */
export interface FloorBuff {
  /** A BUFF_DEFS id from objects/buffTypes.ts, e.g. 'frost'. */
  buff: string
  /** Who it catches. */
  target: BuffTarget
}

/**
 * How often a buff field reapplies its buff, in milliseconds. 100 is what the
 * hand-authored test_buff.xml uses; every shipped buff's duration outlasts it,
 * so the aura reads as continuous while the target stands in the field.
 */
export const BUFF_REFRESH_MS = 100

/**
 * There is no cap on how many buffs a floor or a boss tier may carry. The game
 * ships 41 and nothing verified limits how many DangerArea nodes a level holds;
 * the earlier bound of 8 was a guess at good taste, not a constraint, and a
 * campaign that wants all of them is the author's call. Each entry still costs
 * nodes — see DISCOVERY-LOG.md — so the count is a performance question, not a
 * validity one.
 */

/** A fresh, empty buff list — the stock value for every floor. */
export function defaultFloorBuffs(): FloorBuff[] {
  return []
}

/**
 * One row of a floor's trap list: a projectile, the wall it fires from, how
 * wide it fans, how often it fires, and how many spewers of it to place across
 * the floor.
 *
 * The same five fields as `BossTrap`, and deliberately its own interface rather
 * than an alias: an arena wall and a room wall are different enough places that
 * the two are likely to diverge (a floor has no health tiers to switch between,
 * for one), and a shared type would make that divergence a breaking change for
 * both.
 *
 * What differs from the arena is what `count` is counted over. A tier's row
 * places `count` spewers along ONE arena wall; a floor's row places `count`
 * spewers spread over every eligible room's wall of that direction — the floor
 * is the unit, not the room, so "six arrows firing north" is six spewers on the
 * floor however many rooms it has. See traps/floor.ts.
 */
export interface FloorTrap {
  /** a projectile id from PROJECTILE_DEFS (objects/projectileTypes.ts) */
  projectile: string
  /** which way it fires; the room wall it sits on is the opposite one */
  direction: TrapDirection
  /** fan width, 0..TRAP_SPREAD_MAX. Decimal — 0.5 is the reference axe rig. */
  spread: number
  /** milliseconds between shots */
  spawnRateMs: number
  /**
   * How many spewers this row places, at least 1. Unlike BossTrap.count it has
   * no upper bound: a wave tier's count is spent on one fixed-size arena wall,
   * but a floor's is spread across every eligible room on the whole floor, so
   * MAX_TRAP_COUNT would be an arbitrary ceiling with no relationship to what
   * the floor can actually hold. Running the pool dry is a graceful stop that
   * validation warns about (see floorTrapCapacity), not an error.
   */
  count: number
}

/** A fresh, empty trap list — the stock value for every floor. */
export function defaultFloorTraps(): FloorTrap[] {
  return []
}

/**
 * One floor's timed hazard ("timer mode").
 *
 * After `seconds` of play the whole floor turns into a damage field: a
 * DangerArea covering the entire map, switched on by a ToggleElement at the end
 * of a countdown. See timer/hazard.ts for the node rig.
 *
 * `damage` is deliberately signed — a negative value heals the party instead,
 * so the same feature covers "the floor starts hurting" and "the floor starts
 * healing". Only players are affected (RectangleShape `types: 1`).
 */
export interface FloorTimer {
  /** Off by default; a floor with this false emits no nodes at all. */
  enabled: boolean
  /** Countdown length before the hazard switches on, in seconds. */
  seconds: number
  /** Health change per application. Negative heals. */
  damage: number
  /** Milliseconds between applications once the hazard is live. */
  freqMs: number
  /** Announce a `M:SS` tick every second while the countdown runs. */
  countdown: boolean
}

/** Upper bound on a floor timer's countdown — an hour. */
export const MAX_TIMER_SECONDS = 3600
/** Fastest a floor hazard may tick. Below this it is effectively per-frame. */
export const MIN_TIMER_FREQ_MS = 50
/** Slowest a floor hazard may tick — ten minutes. */
export const MAX_TIMER_FREQ_MS = 600_000
/** Bound on a floor hazard's per-tick health change, either direction. */
export const MAX_TIMER_DAMAGE = 10_000
/**
 * A countdown longer than this emits more than this many AnnounceText nodes on
 * that one floor, which bloats the level XML — warned about, not rejected.
 * Same threshold and same reasoning as BOSS_COUNTDOWN_NODE_WARN.
 */
export const TIMER_COUNTDOWN_NODE_WARN = 200

/** A fresh, disabled floor timer — the stock value for every floor. */
export function defaultFloorTimer(): FloorTimer {
  return { enabled: false, seconds: 180, damage: 1, freqMs: 1000, countdown: true }
}

/**
 * The escape floor's timer — 90 seconds, then 1 damage every 100ms.
 *
 * Preset data, not a feature: every shipped campaign ends on one extra dungeon
 * floor played after the boss arena, and this is the clock that makes it a run
 * for the exit rather than another floor to clear. 91 AnnounceText nodes, well
 * under TIMER_COUNTDOWN_NODE_WARN.
 */
/**
 * A boss standing on an ordinary dungeon floor (issue #61) — the floor keeps
 * every one of its standard controls and gains a boss, a sealed way out, and
 * the same health-tier rigs the arena runs.
 *
 * This is deliberately NOT `BossArenaOptions`. An arena owns its own geometry
 * (size, theme, floor pattern, cover) and picks its boss from all seven; a
 * floor supplies the geometry itself and can only host a boss that MOVES, so
 * the two share the rigs rather than the options. The fields that are here are
 * exactly the ones the issue lists, minus the geometry.
 *
 * `waves` is the arena's own `BossWave`, reused whole: its `buffs` and `traps`
 * are the issue's Wave Buffs and Traps sections, so one type covers three.
 * Two of its fields are simply not read on a floor — `spawnMode`, because a
 * floor has no scatter modes (wave monsters always land on interior room
 * tiles), and `pickups`, which are deferred to a follow-up because a dungeon
 * floor has no entrance drop pad for them to land on.
 */
export interface DungeonBoss {
  /** Off by default; a floor with this false emits no nodes and moves no draw. */
  enabled: boolean
  /**
   * The bosses this floor may roll, as a subset of `MOBILE_BOSS_IDS`. A
   * stationary boss parked in a room can never reach the party, so validation
   * rejects one rather than letting a floor ship unwinnable.
   */
  bossPool: string[]
  /** Exactly BOSS_WAVE_COUNT tiers, keyed to the boss's health like an arena's. */
  waves: BossWave[]
  /** Seconds of immortality per health threshold. Mutually exclusive with this floor's timer. */
  invulnerability: { enabled: boolean; seconds: number[]; countdown: boolean }
  /** The same two milestone presets the arena carries. */
  checkpoints: { respawnPlayers: BossCheckpointPreset; saveGame: BossCheckpointPreset }
  /** Scales each tier's counts, separate from the dungeon's own monsterMultiplier. */
  monsterMultiplier: number
  /**
   * How many bosses this floor rolls (issue #64 part 1). **Absent means 1** —
   * read through `floorBossCount`. Same multi-boss re-keying as an arena's
   * `bossCount` — see that field's comment and `boss/tierSource.ts`. 1..MAX_BOSS_COUNT.
   */
  bossCount?: number
  /**
   * How this floor picks its bosses — the floor twin of
   * `BossArenaOptions.bossSelection` (issue #64 follow-up). **Absent means
   * `'random'`**, read through `bossSelection()`. `'lineup'` picks
   * `bossLineup`'s exact per-boss counts with zero `ctx.floorBossRand` draws
   * for the pick, and `bossPool` is not read in this mode.
   */
  bossSelection?: BossSelection
  /**
   * Exact per-boss counts for `bossSelection: 'lineup'` — the floor twin of
   * `BossArenaOptions.bossLineup`. Every key must be a `MOBILE_BOSS_IDS` id
   * (a stationary boss can never reach the party on a floor, same rule
   * `bossPool` already follows); validated in `config/validation.ts`. Always
   * iterated in `BOSS_IDS` order. Kept on the object across a mode flip.
   */
  bossLineup?: Partial<Record<BossId, number>>
}

/**
 * A fresh, disabled dungeon boss — the stock value for every floor.
 *
 * Disabled, and with an empty wave table, so that adding the field to a
 * parameter object changes nothing: the whole feature is opt-in per floor.
 */
export function defaultDungeonBoss(): DungeonBoss {
  return {
    enabled: false,
    bossPool: [...MOBILE_BOSS_IDS],
    waves: Array.from({ length: BOSS_WAVE_COUNT }, () => emptyWave()),
    invulnerability: {
      enabled: false,
      seconds: BOSS_INVULN_THRESHOLDS.map(() => DEFAULT_BOSS_INVULN_SECONDS),
      countdown: true
    },
    checkpoints: { respawnPlayers: 'never', saveGame: 'never' },
    monsterMultiplier: 1.0
  }
}

/** A tier carrying nothing — no monsters, no buffs, no traps. */
function emptyWave(): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 1500, buffs: [], traps: [] }
}

/** The boss config for floor `i`, or undefined when that floor has none. */
export function floorBoss(params: DungeonParameters, level: number): DungeonBoss | undefined {
  const boss = params.levelBoss?.[level]
  return boss !== undefined && boss.enabled ? boss : undefined
}

/** One floor's locked exit room (issue #69). */
export interface FloorLock {
  /** Off by default; a floor with this false is never sealed by a button. */
  enabled: boolean
  /**
   * How many buttons must ALL be pressed to open the wall (issue #69 part 2).
   * Absent means 1 — read through `floorLockButtons`, never off the field.
   * 0 means no button: the floor is then unlocked, unless it hosts a boss, in
   * which case the boss alone opens it, exactly as an unlocked boss floor.
   */
  buttons?: number
}

/** Most buttons one floor may hide. */
export const MAX_LOCK_BUTTONS = 20

/** A fresh, unlocked floor — the stock value for a floor nobody locked. */
export function defaultFloorLock(): FloorLock {
  return { enabled: false }
}

/** How many buttons floor `level`'s lock needs — 0 when it is not locked. */
export function floorLockButtons(params: DungeonParameters, level: number): number {
  const lock = params.levelLock?.[level]
  if (lock === undefined || !lock.enabled) return 0
  return lock.buttons ?? 1
}

/**
 * Whether floor `level` has its exit room locked behind at least one button.
 * A lock with 0 buttons is no lock: nothing the party can press seals it.
 */
export function floorLocked(params: DungeonParameters, level: number): boolean {
  return floorLockButtons(params, level) > 0
}

/**
 * One monster row a mystery button spawns: `count` copies of one actor, each
 * its own `SpawnObject`. `monster` speaks the ARENA grammar
 * (`isKnownMonsterKey`) — a bare id is a pin at `defaultTier` — because a
 * button fires structure, not a roll: resolving a floor pool key's ladder or a
 * family would need a draw per copy.
 */
export interface MysteryMonster {
  monster: string
  /** 1..MAX_MYSTERY_MONSTERS copies; NOT scaled by `monsterMultiplier` */
  count: number
}

/**
 * One entry of the campaign-wide mystery-button POOL (issue #67). Stepping on
 * the plate fires every outcome it carries at once; a button carrying nothing
 * is a dud, which is a legitimate outcome and not an error.
 */
export interface MysteryButton {
  /** the dungeon master's label for it — the form only, never emitted */
  name?: string
  /** announced on press; absent or empty emits no `AnnounceText` at all */
  text?: string
  /** items spawned beside the plate; `item` is a `MYSTERY_LOOT_DEFS` id */
  loot: WavePickup[]
  /** monsters spawned a few tiles clear of the plate */
  monsters: MysteryMonster[]
  /**
   * spewers placed on the walls of the plate's own ROOM, shipped disabled and
   * switched on by the press. `count` is per button, bounded by MAX_TRAP_COUNT.
   */
  traps: BossTrap[]
  /** switch the traps back off this many seconds after the press; absent/0 = never */
  trapSeconds?: number
}

/**
 * How many mystery buttons floor `i` hides and which pool buttons they may
 * be. `pool` holds 0-based indices into `mysteryButtons`, repeated to weight —
 * the same convention `levelMonsters` uses. Each plate draws one entry
 * independently, so a button may appear more than once and `count` may exceed
 * the pool's size.
 */
export interface FloorMystery {
  count: number
  pool: number[]
}

/**
 * NOT a cap on the pool — the pool is unbounded, a button is only data and
 * only the ones a floor rolls are emitted. This guards the parameters.txt
 * importer alone: it pads the pool out to every `mysteryButton<i>…` index and
 * to the `mysteryButtons=` count, so a stray `mysteryButton999999999Name=`
 * line would otherwise build a billion buttons and freeze the import. An index
 * or count at or past this is reported as an unknown key instead.
 */
export const MYSTERY_PARSE_LIMIT = 10000
/** Most mystery buttons one floor may hide. */
export const MAX_MYSTERY_PER_FLOOR = 200
/** Most copies one monster row of a button may spawn. */
export const MAX_MYSTERY_MONSTERS = 100
/** Longest button name the form accepts. */
export const MYSTERY_NAME_MAX = 40
/** Longest announce text — one line of the game's banner. */
export const MYSTERY_TEXT_MAX = 120
/** Longest a button's traps may stay on before switching off again. */
export const MAX_MYSTERY_TRAP_SECONDS = 3600

/** A floor with no mystery buttons — the pad value for a floor nobody armed. */
export function defaultFloorMystery(): FloorMystery {
  return { count: 0, pool: [] }
}

/**
 * Floor `level`'s mystery-button config, or undefined when it places none —
 * no count, or no pool index that names a real button. Read the field through
 * this, never directly: a stale index must not count as "armed".
 */
export function floorMystery(params: DungeonParameters, level: number): FloorMystery | undefined {
  const floor = params.levelMystery?.[level]
  const defs = params.mysteryButtons ?? []
  if (floor === undefined || !(floor.count > 0)) return undefined
  const pool = floor.pool.filter((i) => Number.isInteger(i) && i >= 0 && i < defs.length)
  return pool.length > 0 ? { count: floor.count, pool } : undefined
}

/**
 * Enhanced lock buttons: up to `count` of a locked floor's own `BossDoorButton`
 * plates ALSO fire a mystery payload drawn from `pool`, on top of counting
 * toward the lock as they always have. A separate per-floor pick list from
 * `levelMystery` — the dungeon master picks the plate squads and the lock
 * squads independently, since pressing a lock button cannot be avoided the
 * way a mystery plate can.
 *
 * `disguise` (optional, absent = off) draws the floor's lock buttons with the
 * mystery plate's `TriggerButton` art and `pressed` state instead of
 * `BossDoorButton`/`activate`, so every plate on the floor looks the same —
 * zero draws, construction time only (`map/buttonSeal.ts`).
 */
export interface FloorLockMystery {
  count: number
  pool: number[]
  disguise?: boolean
}

/** A floor with no enhanced lock buttons — the pad value for one nobody armed. */
export function defaultFloorLockMystery(): FloorLockMystery {
  return { count: 0, pool: [] }
}

/**
 * Floor `level`'s enhanced-lock-button config, or undefined when it enhances
 * none — the floor is not locked, there is no valid pool index, or `count` is
 * 0. `count` is clamped to the floor's own button count (`floorLockButtons`):
 * asking to enhance more buttons than the lock has just enhances all of them.
 * Read the field through this, never directly — mirrors `floorMystery`.
 */
export function floorLockMystery(params: DungeonParameters, level: number): FloorLockMystery | undefined {
  if (!floorLocked(params, level)) return undefined
  const floor = params.levelLockMystery?.[level]
  if (floor === undefined || !(floor.count > 0)) return undefined
  const defs = params.mysteryButtons ?? []
  const pool = floor.pool.filter((i) => Number.isInteger(i) && i >= 0 && i < defs.length)
  if (pool.length === 0) return undefined
  return { count: Math.min(floor.count, floorLockButtons(params, level)), pool, disguise: floor.disguise }
}

/**
 * Whether floor `level`'s lock buttons are disguised as mystery plates.
 * Independent of `floorLockMystery` — a floor may disguise its buttons
 * without enhancing any of them, and vice versa.
 */
export function floorLockDisguised(params: DungeonParameters, level: number): boolean {
  return floorLocked(params, level) && params.levelLockMystery?.[level]?.disguise === true
}

/** How long every starter-set trap room stays armed after the press. */
export const MYSTERY_STARTER_TRAP_SECONDS = 30

/**
 * The starter set the form's "Add starter set" inserts: one dud, then rewards
 * cheapest first, then monster squads, then trap rooms. Pure data, fresh every
 * call; it fills the pool only — which floors get which buttons, and how
 * often, is the dungeon master's call on the per-floor picks.
 *
 * Tuned from the owner's playtest of their 4-button sample: the rewards stop
 * short of the red chest and the red diamond (a chest is 91% its diamond —
 * wood 50, green 100, blue 250, red 500 — and 5% an extra life) and give a
 * tier-II upgrade only one to a button, the squads are big enough to panic a
 * party rather than be farmed, and every trap room fires from all four walls
 * and switches off after MYSTERY_STARTER_TRAP_SECONDS so the room is passable
 * again.
 */
export function mysteryStarterPool(): MysteryButton[] {
  const loot = (name: string, text: string, rows: Array<[string, number]>): MysteryButton => ({
    name,
    text,
    loot: rows.map(([item, count]) => ({ item, count })),
    monsters: [],
    traps: []
  })
  const squad = (name: string, text: string, rows: Array<[string, number]>): MysteryButton => ({
    name,
    text,
    loot: [],
    monsters: rows.map(([monster, count]) => ({ monster, count })),
    traps: []
  })
  // [up, down, left, right] spewer counts; a zero leaves that wall bare.
  const trapRoom = (
    name: string,
    text: string,
    projectile: string,
    counts: [number, number, number, number],
    spawnRateMs = 500,
    spread = 0.5
  ): MysteryButton => ({
    name,
    text,
    loot: [],
    monsters: [],
    traps: (['up', 'down', 'left', 'right'] as const)
      .map((direction, i) => ({ projectile, direction, spread, spawnRateMs, count: counts[i] }))
      .filter((row) => row.count > 0),
    trapSeconds: MYSTERY_STARTER_TRAP_SECONDS
  })

  return [
    { name: 'Nothing', text: 'Nothing...', loot: [], monsters: [], traps: [] },

    loot('Pocket change', 'A few coins', [['valuable_1', 5], ['valuable_4', 3]]),
    loot('Loose change', 'Some coins', [['valuable_2', 4], ['valuable_3', 1]]),
    loot('Silver stash', 'A silver stash', [['valuable_5', 3], ['valuable_6', 1]]),
    loot('Gold stash', 'A gold stash', [['valuable_8', 2], ['valuable_9', 1]]),
    loot('Small diamond', 'Something glitters', [['valuable_diamond_small', 1]]),
    loot('Small red diamond', 'Something glitters red', [['valuable_diamond_small_red', 1]]),
    loot('Blue diamond', 'A diamond!', [['valuable_diamond', 1]]),
    loot('A chest', 'A chest', [['chest_wood', 1]]),
    loot('Two chests', 'Two chests', [['chest_wood', 1], ['chest_green', 1]]),
    loot('Three chests', 'Three chests!', [['chest_wood', 1], ['chest_green', 1], ['chest_blue', 1]]),
    loot('Refreshments', 'Refreshments', [['health_2', 1], ['mana_1', 1]]),
    loot('Rejuvenation', 'A potion', [['potion_2', 1]]),
    loot('Invincibility', 'A potion', [['potion_1', 1]]),
    loot('Fury', 'A potion', [['potion_3', 1]]),
    loot('Damage upgrade', 'An upgrade', [['upgrade_damage', 1]]),
    loot('Defense upgrade', 'An upgrade', [['upgrade_defense', 1]]),
    loot('Health upgrade', 'An upgrade', [['upgrade_health', 1]]),
    loot('Mana upgrade', 'An upgrade', [['upgrade_mana', 1]]),
    loot('Damage upgrade II', 'A great upgrade', [['upgrade_damage_2', 1]]),
    loot('Defense upgrade II', 'A great upgrade', [['upgrade_defense_2', 1]]),
    loot('Health upgrade II', 'A great upgrade', [['upgrade_health_2', 1]]),
    loot('Mana upgrade II', 'A great upgrade', [['upgrade_mana_2', 1]]),

    squad('Tick nest', 'The floor is crawling', [['mb_tick', 1], ['tick1#0', 1], ['tick1', 24], ['tick1#2', 12], ['tick1#3', 3]]),
    squad('Gold beetles', 'Gold beetles!', [['tick2', 4], ['tick2#0', 6]]),
    squad('Bat swarm', 'Bats!', [['bat1', 40], ['bat2', 30], ['bat2#2', 10]]),
    squad('Skeleton squad', 'The dead rise', [['mb_skeleton', 2], ['skeleton1#3', 4], ['skeleton1#2', 10], ['skeleton1', 4]]),
    squad('Archer volley', 'Archers!', [['archer1', 12], ['archer2', 6], ['archer1#2', 3]]),
    squad('Necromancer', 'Necromancers!', [['lich#3', 4], ['skeleton3', 18]]),
    squad('Wisps', 'Wisps!', [['wisp1', 8], ['wisp1#2', 6], ['wisp2', 6]]),
    squad('Flower bed', 'Something blooms', [['tower_flower1_small', 4], ['tower_flower1', 2], ['tower_flower2', 1]]),
    squad('Nova towers', 'Towers rise', [['tower_nova1', 1], ['tower_nova2', 1]]),
    squad('Fire and frost tracking', 'Towers rise', [['tower_tracking1', 1], ['tower_tracking2', 1]]),
    squad('Drain tracking', 'Your mana drains away', [['tower_tracking3', 2]]),
    squad('Maggot brood', 'Maggots!', [['mb_maggot', 1], ['maggot', 12], ['maggot#2', 10], ['maggot#3', 4]]),
    squad('Eye cluster', 'You are being watched', [['mb_eye', 1], ['eye', 8], ['eye#2', 8]]),
    squad('Slime pit', 'Slime!', [['slime', 70], ['slime#0', 1]]),
    squad('Kamikazes', 'AAAAAAAAAA', [['special_beheaded_kamikaze', 6]]),
    squad('Fire pillars', 'Run!', [['pillar_fire', 6]]),
    squad('Fire floaters', 'Fire!', [['floater_fire', 8]]),
    squad('Spider nest', 'Spiders!', [['spider', 13]]),
    squad('Lich council', 'The council convenes', [['mb_lich', 1], ['lich#0', 4], ['lich', 2], ['lich#2', 3]]),
    squad('Mummy tomb', 'The tomb opens', [
      ['mb_mummy', 1],
      ['mummy_desert', 8],
      ['mummy_desert#2', 6],
      ['mummy_desert#3', 3],
      ['mummy_ranged', 4],
      ['mummy_ranged#2', 2]
    ]),

    trapRoom('Big fireball cross', 'Traps activated', 'shooter_fireball_2', [1, 1, 1, 1]),
    trapRoom('Fireball ring', 'Traps activated', 'shooter_fireball', [2, 2, 2, 2]),
    trapRoom('Arrow storm', 'Traps activated', 'shooter_arrow', [4, 4, 2, 2]),
    trapRoom('Axe mill', 'Traps activated', 'enemy_axe', [1, 1, 2, 2]),
    trapRoom('Death orbs', 'Traps activated', 'enemy_magicball_death', [1, 1, 1, 1]),
    trapRoom('Purple drift', 'Traps activated', 'enemy_magicball_purple', [2, 2, 2, 2]),
    // Spikes and boulders are the lethal ones: slow rates and no fan, so every
    // shot is a single lane the party can read and step out of.
    trapRoom('Spike gauntlet', 'Traps activated', 'shooter_spike', [1, 1, 1, 1], 1500, 0),
    trapRoom('Boulder run', 'Boulders!', 'shooter_stone_ball', [1, 1, 1, 1], 3000, 0),
    trapRoom("Dragon's breath", 'Traps activated', 'enemy_boss_dragon_fireball', [1, 1, 1, 1], 800),
    trapRoom("Anubis' wrath", 'Traps activated', 'enemy_boss_anubis_fireball', [1, 1, 1, 1], 1000, 0.25),
    trapRoom('Frost wall', 'Traps activated', 'enemy_boss_krilith_frostball', [2, 2, 2, 2], 900),
    trapRoom('Confusion', 'Traps activated', 'enemy_boss_krilith_confusion', [2, 2, 2, 2], 900),
    trapRoom('Poison nova', 'Traps activated', 'boss_maggot_nova', [1, 1, 1, 1], 700)
  ]
}

/**
 * The floors the old campaign-wide `lockFinalRoom` flag sealed, as per-floor
 * data: every floor whose way out is NOT stairs — the victory orb, the red
 * portal into an arena, or the blue one into a lobby — and that has no boss.
 *
 * Used to seed `defaultParameters()` and the presets, so their campaigns
 * stayed byte-identical when the flag became per-floor, and to read a legacy
 * `lockFinalRoom=1` line from parameters.txt. The result is a snapshot of the
 * CURRENT order: rearranging the campaign afterwards moves no lock.
 */
export function gatewayLockedFloors(params: DungeonParameters): FloorLock[] {
  const counts = {
    levels: params.levels,
    fights: bossFights(params.boss).length,
    lobbies: (params.lobbies ?? []).length
  }
  const order = campaignOrder(counts, params.levelOrder)
  const locks = Array.from({ length: params.levels }, () => defaultFloorLock())
  order.forEach((slot, position) => {
    if (slot.kind !== 'floor' || slot.index >= params.levels) return
    // A boss floor is skipped: the old flag never put a button on one — the
    // boss's death alone opened it — and locking it now would add one.
    locks[slot.index].enabled =
      gatewayAfter(order, position).kind !== 'exit' && floorBoss(params, slot.index) === undefined
  })
  return locks
}

/**
 * `params` with `levelLock` re-derived by `gatewayLockedFloors` — for a
 * preset that spreads `defaultParameters()` and then changes the floor count
 * or the order, so the base's locks no longer line up. Mutates and returns.
 */
export function withGatewayLocks(params: DungeonParameters): DungeonParameters {
  const locks = gatewayLockedFloors(params)
  // none locked is stored as absent, the shape parameters.txt reads it back as
  if (locks.some((l) => l.enabled)) params.levelLock = locks
  else delete params.levelLock
  return params
}

export function escapeFloorTimer(): FloorTimer {
  return { enabled: true, seconds: 90, damage: 1, freqMs: 100, countdown: true }
}

/**
 * The shipped campaign order: the dungeon-prep lobby, every floor but the
 * last, the boss-prep lobby, the boss fight, then that last floor — the
 * escape floor.
 *
 * Stored explicitly because it is genuinely NOT the default order (which,
 * with two lobbies, would put BOTH of them before any floor — see
 * `defaultOrder` in campaign.ts), so `isDefaultOrder` is false for it and a
 * stock export writes a `levelOrder=` line. All three presets use it, and each
 * ships exactly one fight and the same two stock lobbies `defaultParameters()`
 * does.
 */
export function shippedOrder(levels: number): CampaignSlot[] {
  return [
    { kind: 'lobby' as const, index: 0 },
    ...Array.from({ length: Math.max(0, levels - 1) }, (_, index) => ({ kind: 'floor' as const, index })),
    { kind: 'lobby' as const, index: 1 },
    { kind: 'boss' as const, index: 0 },
    { kind: 'floor' as const, index: Math.max(0, levels - 1) }
  ]
}

/**
 * All knobs of the generator, ported from the modified Parameters.java.
 * Sizes are in tiles. `monsterMax` is keyed by monster id (see monsterTypes.ts).
 */
export interface DungeonParameters {
  levels: number
  minRoomSize: number
  maxRoomSize: number
  minPassageWidth: number
  maxPassageWidth: number
  minRoomCount: number
  maxRoomCount: number
  mapWidth: number
  mapHeight: number
  edgePadding: number
  roomPadding: number
  /** one theme letter per level */
  themes: string[]
  monsterMultiplier: number
  goldMultiplier: number
  foodMultiplier: number
  shopChance: number
  vaultChance: number
  lockChance: number
  keyChance: number
  /** monster pool (plain ids) per level */
  levelMonsters: string[][]
  /**
   * Buff auras per level, one list per floor. Optional, and empty per floor by
   * default: a params object without it, or with every list empty, produces
   * byte-identical output to the pre-feature generator for every seed.
   */
  levelBuffs?: FloorBuff[][]
  /**
   * Wall traps per level, one list per floor. Optional, and empty per floor by
   * default: a params object without it, or with every list empty, produces
   * byte-identical output to the pre-feature generator for every seed.
   *
   * This is the first per-floor layer that draws a random value — one
   * `ctx.trapRand.iRand` per placed spewer. It is the fourth stream precisely
   * so that arming a floor still cannot move that floor's rooms, walls,
   * doodads, actors, items or existing ids, nor any other floor's. See
   * `traps/floor.ts`.
   */
  levelTraps?: FloorTrap[][]
  /**
   * Timed hazard per level, one entry per floor. Optional: a params object
   * without it, or with every floor disabled, produces byte-identical output to
   * the pre-feature generator for every seed.
   */
  levelTimers?: FloorTimer[]
  /**
   * A boss standing on a dungeon floor, one entry per floor (issue #61).
   * Optional, and disabled per floor by default: a params object without it, or
   * with every floor disabled, produces byte-identical output to the
   * pre-feature generator for every seed.
   *
   * Unlike the other three per-floor layers this one is NOT purely additive to
   * the floor it is on. A boss floor's way out becomes a sealed portal room
   * instead of a stairs room, which is a different branch of `map/level.ts`
   * and a different number of `ctx.rand` draws, so enabling a boss moves that
   * floor's layout and every floor generated after it — the same cost invariant
   * 8 documents for changing a floor's gateway KIND, and free in practice
   * because no seed predates the feature. What must not move is a floor with
   * no boss on it; every branch is gated on `enabled`.
   *
   * The rig proper is a post-pass like `traps/floor.ts`, drawing only from
   * `ctx.floorBossRand`. See `src/generator/dungeonBoss/`.
   */
  levelBoss?: DungeonBoss[]
  /**
   * A locked exit room per level, one entry per floor (issue #69). Optional,
   * and unlocked per floor when absent — which is what replaced the old
   * campaign-wide `lockFinalRoom` flag.
   *
   * A locked floor forces its way out into a dead-end room and bars that
   * room's corridor with a destructible wall, opened by a floor button hidden
   * elsewhere on the floor (`map/buttonSeal.ts`). No key is involved, so a
   * party that hoarded gold keys or spent this floor's on a chance-rolled
   * door cannot shut itself out.
   *
   * Like `levelBoss`, NOT purely additive: stairs cannot be sealed, so a
   * locked floor that would lead on by stairs takes the portal branch instead
   * (the blue teleport, into the same next floor) — a different room pick and
   * a different number of `ctx.rand` draws, so locking a stairs floor moves
   * it and every floor after it. Locking a floor that already ends in a portal
   * or the orb costs only the button's own draws, exactly what the old flag
   * cost. With a boss on the floor too, the wall waits for the boss(es) AND
   * the button — see `dungeonBoss/opener.ts`.
   */
  levelLock?: FloorLock[]
  /**
   * The campaign-wide pool of mystery buttons (issue #67) that
   * `levelMystery` draws from. Optional; absent (or empty) with no floor
   * armed produces byte-identical output for every seed — see `mystery/`.
   */
  mysteryButtons?: MysteryButton[]
  /**
   * Mystery buttons per floor — how many plates and which pool buttons they
   * may be. Optional, absent = none anywhere. Purely ADDITIVE, like
   * `levelTraps`: the rig runs after a floor is accepted and draws only from
   * `ctx.mysteryRand`, so arming a floor moves no floor's dungeon. Read a
   * floor through `floorMystery`.
   */
  levelMystery?: FloorMystery[]
  /**
   * Enhanced lock buttons per floor (up to `floorLockButtons(params, i)` of a
   * locked floor's own buttons also fire a mystery payload) and the optional
   * disguise that draws them as `TriggerButton` plates. Optional, absent =
   * none anywhere. Purely ADDITIVE like `levelMystery`: the enhancement draws
   * only from `ctx.mysteryRand`, strictly after every other mystery draw on
   * the floor, so arming it moves no floor's dungeon — not even this floor's
   * own plates. Read a floor through `floorLockMystery`/`floorLockDisguised`.
   */
  levelLockMystery?: FloorLockMystery[]
  /**
   * A `MUSIC_TRACKS` id per level, or the `MUSIC_DEFAULT` sentinel. Optional,
   * and unset per floor by default: a params object without it, or with every
   * floor unset/`default`, produces byte-identical output to the pre-feature
   * generator for every seed — see `src/generator/music/`.
   */
  floorMusic?: string[]
  /**
   * The order the campaign's lobbies, floors and boss fights are played in.
   *
   * Optional, and absent is the historical shape: every lobby, then every
   * dungeon floor, then every boss fight, all in order. With `lobbies` empty
   * this is the same byte-identity contract `levelBuffs` and `levelTimers`
   * carry — a params object without it must generate exactly what the
   * generator produced before floors could be rearranged.
   *
   * One entry per lobby, per floor and per boss fight. All three sequences
   * stay ascending — only the interleaving is free, so `L1, 1, 2, B1, 3` and
   * `B1, 1, 2, 3` are both legal but `2, 1` is not. A lobby may never be the
   * campaign's last entry — it has no victory orb of its own — which
   * `validation.ts` enforces. `campaign.ts` owns the model and the repair.
   */
  levelOrder?: CampaignSlot[]
  /** max horde size per monster id */
  monsterMax: Record<string, number>
  /**
   * Sparse overrides of the game's tweak/*.xml balance data, keyed by the
   * canonical lowercase field keys in tweak/overrides.ts. Empty means the user
   * changed nothing, in which case no tweak/ folder is emitted at all.
   */
  playerTweaks: PlayerTweaks
  /**
   * The campaign's shop rooms — hand-authored levels, not generated geometry.
   * An arbitrary number, each independently ordered by `levelOrder` and each
   * built from one of `LOBBY_PRESETS`. A lobby exists iff it is in this list;
   * an empty array reproduces the pre-lobby campaign exactly — same files,
   * same `levels.xml`, same seeds. `LobbyOptions.enabled` is gone: there is no
   * "disabled lobby" any more, only "no entry for it in this list", the same
   * rule `boss.fights` already followed for a boss fight.
   */
  lobbies: LobbyOptions[]
  /**
   * Whether every lobby carries a save checkpoint
   * (`items/trigger_button_save.xml`), placed next to that room's exit.
   *
   * Global rather than per-lobby: a run where only some shop rooms can be saved
   * at is a trap, not a choice. Off emits each lobby exactly as its template
   * was authored. Draws no randomness and touches no `levels/level*.xml` — see
   * invariant 6; only the lobby files gain (or lose) the one item entry.
   */
  lobbySaves: boolean
  /**
   * The boss fight appended after the last dungeon floor. `enabled: false`
   * reproduces the pre-boss campaign exactly — the arena draws from its own
   * RNG stream, so every existing seed's dungeon is unchanged.
   */
  boss: BossOptions
}

/**
 * One lobby slot: a hand-authored level, not generated geometry, so its
 * options describe what to *edit* in the committed template rather than how
 * to lay it out. `preset` picks which committed room (`LOBBY_PRESETS` in
 * `src/generator/lobby/presets.ts`) this slot edits — the same options shape
 * fits either template, since `buildLobby()` reads every coordinate and id off
 * the preset rather than off a hardcoded room. See src/generator/lobby/.
 */
export interface LobbyOptions {
  /** a `LOBBY_PRESETS` id — which committed room this lobby edits */
  preset: string
  /** multiple of 500 — each 500 is one red diamond on the lobby floor */
  startingGold: number
  /** selected shop columns, e.g. ['misc1', 'misc2', 'off1', 'power'] */
  shopCategories: string[]
  /**
   * How many of each free upgrade pickup lies on the floor, by `UPGRADE_KINDS`.
   * Anything above one stacks on that kind's single slot, so the count is not
   * bounded by the room's layout — it is the dungeon master's dial.
   */
  upgrades: UpgradeCounts
  /**
   * A `MUSIC_TRACKS` id, or the `MUSIC_DEFAULT` sentinel (the default —
   * unset emits no `PlayMusic` node and leaves the template's own music
   * untouched). See `src/generator/music/`.
   */
  music?: string
}

/** The generated-arena half of one boss fight. */
export interface BossArenaOptions {
  /** one theme letter from THEME_DEFS, independent of the dungeon floors' themes */
  theme: string
  /**
   * Which pattern a `- mixed` arena theme arranges its floor palette in.
   * `random` (the default) lets the seed choose. Ignored for every other
   * theme, which has no palette to arrange.
   */
  floorPattern: BossFloorPattern
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  /** ids of the end-boss actors the seed may pick from */
  bossPool: string[]
  /**
   * exactly BOSS_WAVE_COUNT waves: the four health tiers 100 / 75 / 50 / 25,
   * then BOSS_DEATH_WAVE — the pool that spawns when the boss dies, while the
   * player is walking to the orb that ends the campaign.
   */
  waves: BossWave[]
  cover: {
    pattern: (typeof BOSS_COVER_PATTERNS)[number]
    density: number
    ringSpacing: number
    clusters: number
  }
  /**
   * Tuning for the scatter spawn modes — deliberately its own block rather
   * than a second reading of `cover`, so a monster ring and a pillar ring can
   * be spaced differently. Ignored entirely while every monster is on
   * `anchors`, which is the default.
   */
  spawn: {
    /** minimum gap, in tiles, kept between two scattered spawn points */
    spacing: number
    /** minimum gap between adjacent points on the `ring` mode */
    ringSpacing: number
    /** seeded cluster centres for the `gaussian` mode */
    clusters: number
    /**
     * How many spawn *points* one monster entry of one tier may occupy, and
     * therefore how many of it can appear on a single frame.
     *
     * A scattered monster used to get one point per monster, all fired off the
     * tier trigger at once — a 120-bat entry was 120 actors materialising on
     * one frame, and five tiers of that saturated the floor so badly that the
     * placement pass ran out of room and fell back to the 9 anchors (#43).
     * Now a count above this budget is spread over `batchSize` points, each
     * carrying a share of the total on a `batchIntervalMs` timer, exactly the
     * way the anchor rig splits a horde over its 9 anchors.
     *
     * An entry whose count is at or below the budget keeps the old one-shot
     * shape, so a small wave emits byte-identical XML.
     */
    batchSize: number
    /** the timer, in ms, batched scatter spawns trickle in on */
    batchIntervalMs: number
  }
  /**
   * Temporary boss immortality on each health threshold (75/50/25%), with an
   * optional per-second countdown announced to the party.
   *
   * Two problems, one mechanism: a fully upgraded party can burst a boss down
   * fast enough that all three thresholds fire in the same second, which both
   * ends the fight before any of the wave design is seen and switches every
   * wave tier's spawners on at once (the arena floods and the framerate dies).
   * Holding the boss immortal for a fixed window forces the thresholds apart.
   *
   * Independent of `waves`: a threshold gets a window whether or not its tier
   * has any monsters in it.
   */
  invulnerability: {
    enabled: boolean
    /**
     * One window length in seconds per threshold, in BOSS_INVULN_THRESHOLDS
     * order (75%, 50%, 25%). 0 disables that one threshold. The GUI drives all
     * three from a single field unless "set per threshold" is on, but the
     * stored shape is always the full array.
     */
    seconds: number[]
    /** announce a ticking M:SS countdown for the length of each window */
    countdown: boolean
  }
  /**
   * Checkpoints: on chosen boss health milestones, pull downed players back
   * into the fight and/or move the party's respawn point and write a save.
   * The two behaviours are independently scheduled — a dungeon master
   * typically wants players revived often but a save written only once, so
   * each carries its own preset rather than sharing one threshold list.
   *
   * Independent of `invulnerability` and `waves` — it listens to the same
   * `Boss 75%`/`Boss 50%`/`Boss 25%`/`Boss Died` events but wires its own
   * dedicated triggers (one per event actually used by either preset, shared
   * between the two behaviours when they land on the same milestone), so
   * turning either preset on or off never touches another rig's
   * `connections`. Both fields at `'never'` emits nothing at all — no
   * trigger, no Checkpoint node, no RespawnPlayers node.
   */
  checkpoints: {
    /** which milestones pull dead/lagging players back into the arena */
    respawnPlayers: BossCheckpointPreset
    /** which milestones move the respawn point and write a save (the Checkpoint node) */
    saveGame: BossCheckpointPreset
  }
  /** scales each wave tier's monsterMax (except -1/endless, which stays endless) */
  monsterMultiplier: number
  /** scales the sparse health/mana pickup clusters scattered around the arena */
  foodMultiplier: number
  /**
   * A `MUSIC_TRACKS` id, or the `MUSIC_DEFAULT` sentinel (the default — emits
   * no `PlayMusic` node). See `src/generator/music/`.
   */
  music?: string
  /**
   * How many bosses this arena rolls (issue #64 part 1). **Absent means 1** —
   * read it through `arenaBossCount`, never off the field — which is what
   * keeps every parameter object and `parameters.txt` written before this
   * feature byte-identical. 1..MAX_BOSS_COUNT.
   *
   * The engine fires `Boss 75%/50%/25%/Died` for the FIRST boss actor to cross
   * a threshold or die, and for nothing else — with two or more bosses no rig
   * can tell whose threshold it saw. So above 1, every tier-keyed rig (waves,
   * wave buffs, wave pickups, traps) skips the 75/50/25% tiers entirely and
   * re-keys the death tier and the alcove opener to "every boss's own death",
   * counted down on a shared Variable — see `boss/tierSource.ts`. Invulnerability and
   * checkpoints are skipped outright; their settings stay on the object,
   * simply unread, the same losslessness `arenaMode` already promises.
   */
  bossCount?: number
  /**
   * How this arena picks its bosses (issue #64 follow-up). **Absent means
   * `'random'`** — the historical pick through `bossPool`/`bossCount`, read
   * through `bossSelection()` never off this field directly, so every
   * parameter object and `parameters.txt` written before this feature is
   * byte-identical.
   *
   * `'lineup'` picks `bossLineup`'s exact per-boss counts instead of rolling
   * `bossCount` random picks from `bossPool` — `expandLineup()` in
   * `boss/bosses.ts` draws ZERO `ctx.bossRand` values for the pick, and
   * `bossPool` is not read at all in this mode (no pool validation either).
   */
  bossSelection?: BossSelection
  /**
   * Exact per-boss counts for `bossSelection: 'lineup'`, e.g.
   * `{ boss_knight: 3, boss_lich: 1 }`. Always iterated in `BOSS_IDS` order
   * (never `Object.keys`, invariant 2) — see `expandLineup()`. Ignored in
   * `'random'` mode but kept on the object regardless of which mode is
   * active, so flipping `bossSelection` back and forth loses nothing — the
   * same losslessness `arenaMode` already promises for a survival fight's
   * boss-only fields.
   */
  bossLineup?: Partial<Record<BossId, number>>
  /**
   * Whether this arena spawns the `actors/boss_*` bodyguard twins for the 5
   * near-duplicate actors that have one (issue #64 part 2) — `archer_1`,
   * `skeleton_1`, `skeleton_1_small`, `skeleton_3` and `mummy_ranged_2`.
   * **Absent means ON**, read through `arenaUsesBodyguards`, never off the
   * field directly — the toggle's whole point is "the twins are the arena's
   * default now", so a fresh fight and every parameter object built before
   * this feature both get twins on without writing anything to
   * `parameters.txt`.
   *
   * A pure path substitution (`resolveArenaActorPath` in monsterTypes.ts) —
   * it draws nothing from `ctx.bossRand` or any other stream, so flipping it
   * moves no arena's layout, only which actor path a wave/row names. Applies
   * only to a key that names one of the 5 twinned actors directly; a spawner
   * variant such as `skeleton1#0` still spawns the plain spawner prop,
   * because the spawner has no boss-folder twin.
   */
  bodyguardVariants?: boolean
}

/**
 * One boss fight: a generated arena. A campaign may carry several, and each
 * one is edited independently — nothing is shared between them.
 *
 * Before issue #48 a fight also carried its own welded-on prep room
 * (`BossPrepOptions`, now deleted). A shop in front of a fight is a `lobby`
 * slot now, like any other — placed next to the fight in `levelOrder` rather
 * than travelling with it, which is what lets a dungeon master skip the shop
 * before one fight or put two in front of another.
 */
export interface BossFight {
  /**
   * Which kind of arena this slot is.
   *
   * Absent means `'boss'`, which is what keeps every parameter object and every
   * `parameters.txt` written before survival mode existed byte-identical — the
   * same "absent is the historical default" contract `levelOrder`, `levelBuffs`
   * and `levelTimers` carry.
   */
  mode?: ArenaMode
  /**
   * The arena itself. Shared by BOTH modes: its size, theme, floor pattern,
   * cover, music and multipliers mean the same thing whether a boss is standing
   * in it or a clock is running. The boss-only fields (`bossPool`, `waves`,
   * `invulnerability`, `checkpoints`, `spawn`) stay on the object in survival
   * mode, simply unread, so flipping a fight to Survival and back loses nothing.
   */
  arena: BossArenaOptions
  /** Read only when `mode === 'survival'`. See `src/generator/survival/`. */
  survival?: SurvivalOptions
}

/**
 * Which kind of arena a fight is. `'boss'` is the historical, and absent, one.
 *
 * Defined in `campaign.ts` and re-exported here: the label vocabulary
 * (`AB1`/`AS2`) needs it and parameters.ts imports campaign.ts, not the other
 * way round. This is the name the rest of the app reads it by.
 */
export type { ArenaMode }
export { ARENA_MODES }

/** A fight's mode, with the absent-means-boss default applied. */
export function arenaMode(fight: BossFight): ArenaMode {
  return fight.mode === 'survival' ? 'survival' : 'boss'
}

/**
 * How a survival arena shows its clock.
 *
 * `off` emits no announcement at all. `seconds` is timer mode's own shape —
 * one AnnounceText per second, which is fine for a 60-second round and
 * ruinous for a 20-minute one (validation warns past
 * SURVIVAL_COUNTDOWN_NODE_WARN). `milestones` is the default: every minute,
 * then every ten seconds under a minute, then every second in the last ten,
 * which is a fixed handful of nodes however long the round runs.
 *
 * Stored verbatim in `parameters.txt`, so these ids are on-disk vocabulary —
 * never rename one without a configFile.ts migration.
 */
export const SURVIVAL_COUNTDOWN_STYLES = ['off', 'milestones', 'seconds'] as const
export type SurvivalCountdown = (typeof SURVIVAL_COUNTDOWN_STYLES)[number]

/** Longest a survival round may run. Same ceiling as a floor's timer. */
export const SURVIVAL_SECONDS_MAX = MAX_TIMER_SECONDS

/** Stock survival round length. */
export const DEFAULT_SURVIVAL_SECONDS = 180

/** Stock trickle interval for a fresh survival wave row, in milliseconds. */
export const DEFAULT_SURVIVAL_INTERVAL_MS = 1500

/**
 * Node budget past which a `seconds` countdown is worth warning about. Same
 * threshold and reasoning as TIMER_COUNTDOWN_NODE_WARN — one AnnounceText per
 * second, all on one level.
 */
export const SURVIVAL_COUNTDOWN_NODE_WARN = TIMER_COUNTDOWN_NODE_WARN

/**
 * An arena cleared by outlasting a clock instead of by killing something.
 *
 * Everything in it is keyed to elapsed time rather than to a boss's health,
 * because there is no boss: the engine fires `Boss 75%`/`Boss Died` for any
 * actor in the `actors/boss_*` folders and for nothing else, so with no boss actor none
 * of the tier events ever fire. A survival arena therefore runs its own clock —
 * one `LevelLoaded` trigger with a per-connection millisecond delay per event
 * (see `src/generator/survival/clock.ts`).
 *
 * The four lists are independent and none of them replaces another: a buff
 * window, a trap window, a wave row and a pickup drop each own their own
 * timestamps. That is the one real difference from the boss arena's five tiers,
 * where buffs and traps deliberately switch each other off.
 */
export interface SurvivalOptions {
  /** how long the party must last, in seconds; 1..SURVIVAL_SECONDS_MAX */
  seconds: number
  /** how the clock is announced */
  countdown: SurvivalCountdown
  /** timed spawn rows; the same monster may appear in several */
  waves: SurvivalWave[]
  /** timed buff windows over the whole arena */
  buffs: SurvivalBuff[]
  /** timed item drops onto the entrance pickup pad */
  pickups: SurvivalPickup[]
  /** timed wall-trap windows */
  traps: SurvivalTrap[]
}

/**
 * One timed spawn row: `count` of `monster` starting at `atSeconds`, trickling
 * in every `intervalMs` from the nine anchors.
 *
 * A row is not a tier. "50 bat3 at the start and 200 more two minutes in" is
 * two rows naming the same monster, and they are wired independently — neither
 * cancels or replaces the other.
 *
 * `monster` is a canonical monster VARIANT key (`isKnownMonsterKey`), the
 * arena's grammar where a bare id IS a pin — not the dungeon floor's looser
 * pool-key grammar where a bare id means "roll the ladder".
 */
export interface SurvivalWave {
  /** a monster variant key, e.g. `bat1`, `bat1#0`, `archer1#2` */
  monster: string
  /** how many to spawn in total; at least 1 */
  count: number
  /** seconds into the round when this row starts spawning */
  atSeconds: number
  /** milliseconds between spawns once it starts */
  intervalMs: number
}

/**
 * One timed buff window: `buff` aimed at `target`, live from `startSeconds`
 * until `endSeconds`. Windows may overlap — each owns its own field and its own
 * on/off pair, so two buffs running at once both apply.
 */
export interface SurvivalBuff {
  /** a BUFF_DEFS id */
  buff: string
  /** who it applies to */
  target: BuffTarget
  /** seconds into the round when it switches on */
  startSeconds: number
  /** seconds into the round when it switches off; must be after startSeconds */
  endSeconds: number
}

/** One timed item drop: `count` copies of `item` onto the pickup pad at `atSeconds`. */
export interface SurvivalPickup {
  /** a PICKUP_DEFS id */
  item: string
  /** how many copies drop; at least 1, at most MAX_PICKUP_COUNT */
  count: number
  /** seconds into the round when they drop */
  atSeconds: number
}

/**
 * One timed wall-trap window: a `BossTrap` row that fires only between
 * `startSeconds` and `endSeconds`. Unlike a boss tier's traps these do not
 * replace one another; two overlapping windows both fire.
 */
export interface SurvivalTrap extends BossTrap {
  /** seconds into the round when the spewers switch on */
  startSeconds: number
  /** seconds into the round when they switch off; must be after startSeconds */
  endSeconds: number
}

/**
 * A fresh survival config, used when a fight is flipped to Survival in the form
 * or by `parameters.txt` naming a survival key on a fight that has none.
 *
 * Deliberately NOT called by `defaultBossFight()`: the stock campaign ships
 * every arena in boss mode, and a stock export must keep writing not one
 * survival key (invariant 8's byte-identity contract).
 *
 * A fresh object every call — the lists are edited in place by the form.
 */
export function defaultSurvivalOptions(): SurvivalOptions {
  return {
    seconds: DEFAULT_SURVIVAL_SECONDS,
    countdown: 'milestones',
    waves: [],
    buffs: [],
    pickups: [],
    traps: []
  }
}

/** The wave rows `fight` runs. Empty when it is not a survival arena. */
export function survivalWaves(survival: SurvivalOptions | undefined): SurvivalWave[] {
  return survival?.waves ?? []
}

/** The buff windows `survival` runs. */
export function survivalBuffs(survival: SurvivalOptions | undefined): SurvivalBuff[] {
  return survival?.buffs ?? []
}

/** The item drops `survival` makes. */
export function survivalPickups(survival: SurvivalOptions | undefined): SurvivalPickup[] {
  return survival?.pickups ?? []
}

/** The trap windows `survival` runs. */
export function survivalTraps(survival: SurvivalOptions | undefined): SurvivalTrap[] {
  return survival?.traps ?? []
}

/**
 * The boss fights appended after the last dungeon floor.
 *
 * `enabled: false` reproduces the pre-boss campaign byte-for-byte — every arena
 * draws from a dedicated RNG stream, `ctx.bossRand`, and never touches
 * `ctx.rand` or `ctx.cosmeticRand`, so every existing seed's dungeon is
 * unchanged whatever this holds.
 *
 * `fights` is ordered and, like `levels`, has a lower bound but no upper one:
 * a campaign may chain as many arenas as the dungeon master wants. Fight N's
 * arena leads into whatever `levelOrder` puts next — the next fight directly,
 * or a lobby first if the dungeon master put a shop between them; only the
 * last slot in the whole campaign ends it. They share `ctx.bossRand` in order,
 * so fight 0 draws exactly what a single-fight campaign always did and the
 * extra fights continue the same stream after it.
 */
export interface BossOptions {
  enabled: boolean
  fights: BossFight[]
}

/**
 * One spawn tier of the boss fight. A max count of -1 means endless — the
 * monster's SpawnObject budget never expires, so the anchor keeps spawning until
 * the timer is shut off (timers are never disabled; a tier stops only when its
 * budgets run out).
 */
export interface BossWave {
  /** monster ids from MONSTER_TYPES */
  monsters: string[]
  /** max horde size per monster id; -1 = endless */
  monsterMax: Record<string, number>
  /** the wave's shared spawn interval in ms */
  defaultIntervalMs: number
  /** per-monster interval overrides, keyed by monster id */
  intervalMs?: Record<string, number>
  /**
   * Per-monster spawn mode, keyed by monster id. A missing key (and a missing
   * record) means `anchors`, so a wave that has never been touched behaves
   * exactly as it did before the modes existed. A monster on a scatter mode
   * ignores both `defaultIntervalMs` and its own `intervalMs` override — it
   * spawns once, not on a timer.
   */
  spawnMode?: Record<string, BossSpawnMode>
  /**
   * This tier's arena-wide buff fields, each aimed at players, monsters or
   * both. Optional so every wave literal written before the feature keeps
   * compiling, and empty everywhere leaves the arena byte-identical.
   *
   * Independent of the tier's monsters: an otherwise empty tier may still carry
   * buffs, and a populated tier need not. Tiers *replace* one another — a
   * tier's whole set switches the previous tier's whole set off. See
   * boss/waveBuffs.ts.
   */
  buffs?: FloorBuff[]
  /**
   * Legacy single-buff form, kept so configs and `parameters.txt` files written
   * before `buffs` existed still load. Read through `waveBuffs()`; nothing
   * writes these any more.
   */
  buff?: string
  /** Legacy target for `buff`. Defaults to `players`. */
  buffTarget?: BuffTarget
  /**
   * The items this tier drops when its health threshold fires, spread over the
   * arena's nine spawn anchors. Optional for the same reason as `buffs`: every
   * wave literal written before the feature keeps compiling, and an absent list
   * everywhere leaves the arena byte-identical.
   *
   * Independent of both the tier's monsters and its buffs. Unlike buffs, a
   * tier's pickups do NOT clear the previous tier's — items already on the
   * floor stay there. See boss/wavePickups.ts.
   */
  pickups?: WavePickup[]
  /**
   * The projectile spewers this tier runs along the arena walls. Optional for
   * the same reason as `buffs` and `pickups`: every wave literal written before
   * the feature keeps compiling, and an absent list everywhere leaves the arena
   * byte-identical.
   *
   * Independent of the tier's monsters, buffs and drops. Like the buffs and
   * unlike the pickups, tiers **replace** one another — a tier's whole set
   * switches the previous tier's whole set off, so the hazard changes as the
   * fight moves through its phases rather than accumulating into an unsurvivable
   * crossfire. See boss/traps.ts.
   */
  traps?: BossTrap[]
}

/**
 * One row of a tier's drop list: an item from PICKUP_DEFS and how many copies
 * of it land. Each copy becomes its own SpawnObject node — see
 * boss/wavePickups.ts for why the count cannot live in `trigger-times`.
 */
export interface WavePickup {
  /** a pickup id from PICKUP_DEFS (objects/pickupTypes.ts) */
  item: string
  /** how many copies drop; at least 1, at most MAX_PICKUP_COUNT */
  count: number
}

/**
 * Which way a trap's spewer fires, and therefore which wall it sits on: a trap
 * is placed on the wall it fires *away* from, so `up` spawns along the south
 * wall and shoots north across the arena.
 *
 * Stored as words rather than the engine's integers so a `parameters.txt` stays
 * readable; boss/traps.ts maps them to the `direction` enum.
 */
export const BOSS_TRAP_DIRECTIONS = ['up', 'down', 'left', 'right'] as const
export type BossTrapDirection = (typeof BOSS_TRAP_DIRECTIONS)[number]

/**
 * The same four directions, under the name a dungeon floor's traps use. An
 * alias rather than a rename: `BossTrapDirection` is on the public export list,
 * in the skill's parameter table and in every `boss<i>WaveTrapN` line already
 * written, so it stays exactly as it is. Nothing about a direction is
 * arena-specific — a wall is a wall.
 */
export type TrapDirection = BossTrapDirection

/** Widest fan the engine's `spread` parameter accepts. 0 is a single stream. */
export const TRAP_SPREAD_MAX = 2

/**
 * Most spewers one boss wave tier's trap row may place on its arena wall. Only
 * BossTrap.count is bounded by this — FloorTrap.count has no such ceiling; see
 * its own doc comment for why.
 */
export const MAX_TRAP_COUNT = 24

/**
 * Below this spawn rate the arena fills with projectiles faster than the party
 * can cross it. The engine imposes no bound at all and gives no warning, so
 * validation raises one of its own — a warning, not an error: a 10 ms boulder
 * lane is a legitimate thing to build on purpose.
 */
export const TRAP_FAST_SPAWN_RATE_MS = 50

/**
 * One row of a tier's trap list: a projectile, the wall it fires from, how wide
 * it fans, how often it fires, and how many spewers of it to place.
 *
 * A row carries a `count` *and* a tier may hold several rows, which is what
 * lets one wall mix ammunition — "three axes and two fireballs firing north"
 * is two rows, both `direction: 'up'`. Each of a row's spewers gets its own
 * seeded position along that wall.
 */
export interface BossTrap {
  /** a projectile id from PROJECTILE_DEFS (objects/projectileTypes.ts) */
  projectile: string
  /** which way it fires; the wall it sits on is the opposite one */
  direction: BossTrapDirection
  /** fan width, 0..TRAP_SPREAD_MAX. Decimal — 0.5 is the reference axe rig. */
  spread: number
  /** milliseconds between shots */
  spawnRateMs: number
  /** how many spewers this row places; at least 1, at most MAX_TRAP_COUNT */
  count: number
}

/**
 * The buffs `wave` applies, newest storage first and the legacy single pair as
 * a fallback. An empty array means the tier carries none.
 */
export function waveBuffs(wave: BossWave): FloorBuff[] {
  if (wave.buffs !== undefined) return wave.buffs
  if (wave.buff !== undefined && wave.buff !== '') {
    return [{ buff: wave.buff, target: wave.buffTarget ?? 'players' }]
  }
  return []
}

/** The items `wave` drops. An empty array means the tier drops none. */
export function wavePickups(wave: BossWave): WavePickup[] {
  return wave.pickups ?? []
}

/** The traps `wave` runs. An empty array means the tier carries none. */
export function waveTraps(wave: BossWave): BossTrap[] {
  return wave.traps ?? []
}

/** The spawn mode `wave` uses for `id` — the stored one, or `anchors`. */
export function waveSpawnMode(wave: BossWave, id: string): BossSpawnMode {
  return wave.spawnMode?.[id] ?? 'anchors'
}

/**
 * The seven end-boss actors, in the order the Boss tab's checkbox grid lists
 * them. The seed picks one per campaign from `boss.arena.bossPool`.
 */
export const BOSS_IDS = [
  'boss_anubis',
  'boss_dragon',
  'boss_knight',
  'boss_krilith',
  'boss_lich',
  'boss_queen',
  'boss_worm'
] as const

/**
 * The bosses that can CHASE — the pool a dungeon floor may host (issue #61).
 *
 * Authored here rather than derived from the actor files, because nothing in
 * them answers the question. `<collision static="...">` describes the collider,
 * not locomotion: it is `true` for the worm, which burrows across a whole
 * arena, and anubis and krilith carry no `<collision>` child at all, so they
 * state nothing either way. Reading `static` as "immobile" would wrongly drop
 * the worm and wrongly keep the other two.
 *
 * Out: the dragon (pinned to the top wall, no upward-facing art) and the queen
 * (static collider, no `movement` dict — it attacks in every direction but
 * stays put). Those are the two the issue names.
 *
 * It matters because an arena confines a fight and a dungeon floor does not: a
 * boss that cannot close the distance is one the party walks away from, which
 * on a boss floor means never opening the sealed way out. `boss/bosses.ts`
 * derives each def's `mobile` flag from this list; it lives here because that
 * file imports from this one and not the other way round.
 */
export const MOBILE_BOSS_IDS = ['boss_anubis', 'boss_knight', 'boss_krilith', 'boss_lich', 'boss_worm'] as const

/**
 * Most bosses one arena or one dungeon floor may roll at once (issue #64,
 * raised in the follow-up that added stacking and exact lineups). Bounded so
 * a malformed count cannot emit an unserializable pile of actors — each boss
 * costs one actor and, in multi-boss mode, one `ObjectEventTrigger` — rather
 * than for a geometry reason: `boss/geometry.ts`'s `arenaBossLayout` no
 * longer caps how many bosses it can place at all, since bosses beyond its
 * five fixed slots (topWall + primary + three offsets) stack round-robin
 * onto a slot already in use. See `BOSS_COUNT_WARN` for the advisory
 * threshold well below this hard ceiling.
 */
export const MAX_BOSS_COUNT = 100

/**
 * Past this many bosses, validation WARNS (never blocks) about performance
 * and on-screen chaos — a huge stacked pile of bosses is legal, just probably
 * not what was meant. Advisory only, in both `'random'` and `'lineup'` mode.
 */
export const BOSS_COUNT_WARN = 12

/**
 * How an arena or a dungeon floor picks the bosses it rolls (issue #64
 * follow-up: exact lineups, alongside the historical random pool pick).
 * `parameters.txt` stores the id directly, so these are on-disk vocabulary —
 * never rename one without a `configFile.ts` migration.
 */
export const BOSS_SELECTIONS = ['random', 'lineup'] as const
export type BossSelection = (typeof BOSS_SELECTIONS)[number]

/**
 * `x.bossSelection`, with the absent-means-`'random'` default applied. Shared
 * by `BossArenaOptions` and `DungeonBoss`, which both carry the same field —
 * read through this rather than off the field directly, the same discipline
 * `arenaMode()` enforces for `BossFight.mode`.
 */
export function bossSelection(x: { bossSelection?: BossSelection }): BossSelection {
  return x.bossSelection === 'lineup' ? 'lineup' : 'random'
}

/**
 * Sum of a `bossLineup`, in `BOSS_IDS` order (never `Object.keys` —
 * determinism, invariant 2). An absent lineup, or one with no positive
 * integer counts, sums to 0 — `config/validation.ts` is what turns that into
 * an error for a fight or floor actually in `'lineup'` mode.
 */
export function lineupTotal(lineup: Partial<Record<BossId, number>> | undefined): number {
  if (lineup === undefined) return 0
  return BOSS_IDS.reduce((sum, id) => sum + (lineup[id] ?? 0), 0)
}

/**
 * `arena.bossCount`, with the absent-means-one default applied — UNLESS
 * `arena` is in `'lineup'` mode, in which case the effective count is the
 * lineup's own total (`lineupTotal`), not `bossCount`. Every existing caller
 * (rigs, validation, the GUI's greying) reads the fight's boss count through
 * this function rather than off either field, so a lineup fight is treated
 * as multi-boss exactly like a random one with the same total.
 */
export function arenaBossCount(arena: BossArenaOptions): number {
  return bossSelection(arena) === 'lineup' ? lineupTotal(arena.bossLineup) : arena.bossCount ?? 1
}

/** `boss.bossCount`, with the same lineup-aware rule as `arenaBossCount`. */
export function floorBossCount(boss: DungeonBoss): number {
  return bossSelection(boss) === 'lineup' ? lineupTotal(boss.bossLineup) : boss.bossCount ?? 1
}

/**
 * `arena.bodyguardVariants`, with the absent-means-on default applied (issue
 * #64 part 2) — read every arena's toggle through this, never off the field.
 * Dungeon floors (`dungeonBoss/`) never read this at all: the twin swap is
 * arena-only.
 */
export function arenaUsesBodyguards(arena: BossArenaOptions): boolean {
  return arena.bodyguardVariants !== false
}

/**
 * Whether `count` bosses means the engine's `Boss 75%/50%/25%/Died` events can
 * no longer be trusted to mean any one particular boss — the single gate every
 * multi-boss rig and validation rule reads, so "more than one" is decided in
 * exactly one place.
 */
export function isMultiBoss(count: number): boolean {
  return count > 1
}

/**
 * One stock lobby built from `presetId`. A fresh object every call, like
 * `defaultBossFight()` — the list it goes into is edited in place by the form
 * and imported by configFile.ts, so two lobbies must never share a
 * `shopCategories` array.
 *
 * Both stock rooms sell every column, power included — see the `LobbyOptions`
 * interface comment for why: extra lives matter more right before a boss than
 * at the start of a run, and the one thing that made buying them anywhere
 * questionable is removed by `defaultParameters()`'s own
 * `player.shared.remove.life` tweak. The only difference between the two is
 * gold: 10000 for the campaign's own starting lobby, 20000 — the last shop
 * before a fight, so the party arrives able to actually spend at it — for the
 * boss-prep room.
 */
export function defaultLobby(presetId: string): LobbyOptions {
  return {
    preset: presetId,
    startingGold: presetId === 'BETA-boss-prep' ? 20000 : 10000,
    shopCategories: [...ALL_LOBBY_CATEGORIES],
    // no free upgrades by default: the vendors are the intended way to get
    // them, so handing eight out on the floor is opt-in per kind
    upgrades: noUpgrades()
  }
}

/**
 * The default boss options: feature on, a `g - mixed` arena 42–64 × 42–64
 * with the four castle bosses in the pool, symmetric cover, and four waves whose
 * shared intervals tighten as the fight goes on.
 *
 * The size is the settled answer to two playtests (DISCOVERY-LOG, 2026-08-27 and
 * 2026-08-28), and it was found from both ends. The original 24–32 × 32–44 was
 * too small to hold the wave line-up without the horde stacking on itself. 66–88
 * fixed that and broke something else: on that much open floor a scattered wave
 * arrives dispersed and never re-forms, so the monsters spend the fight
 * pathfinding across empty ground, reach the party in ones and twos, and get
 * picked off. 42–64 is the size at which the tuned counts actually apply
 * pressure — shrinking the floor shortens every spawn-to-party path, which is
 * the same lever from the monsters' side.
 */
export function defaultBossOptions(): BossOptions {
  return {
    enabled: true,
    fights: [defaultBossFight()]
  }
}

/**
 * One stock boss fight. A fresh object every call, like `CampaignPreset.build`:
 * the fight list is edited in place by the form and imported by configFile.ts,
 * so two fights must never share an `arena` or a `waves` array.
 *
 * Carries no prep room any more — see the `BossFight` interface comment. A
 * shop in front of this fight is `defaultLobby('BETA-boss-prep')`, placed next
 * to it in `levelOrder` by whoever builds the campaign (`defaultParameters()`
 * does, via `shippedOrder`).
 */
export function defaultBossFight(): BossFight {
  return {
    arena: {
      theme: 'g_mixed',
      floorPattern: 'random',
      minWidth: 42,
      maxWidth: 64,
      minHeight: 42,
      maxHeight: 64,
      // The castle default fights the four castle-flavoured bosses; anubis and
      // worm belong to the desert and krilith to the ice caves, so they are in
      // BOSS_IDS for the checkbox grid but out of the stock pool.
      bossPool: ['boss_knight', 'boss_lich', 'boss_dragon', 'boss_queen'],
      waves: castleWaves(),
      cover: {
        // symmetric reads as deliberate architecture rather than rubble, and on
        // a floor this size that legibility is what lets a party call out
        // positions. Playtest preference, 2026-08-27.
        pattern: 'symmetric',
        // density is the fraction of the free floor cover fills, so this is a
        // much smaller number than it looks. The original 0.5 filled nearly half
        // the floor and playtested as physically impassable — neither the player
        // nor the boss could move. 0.12 was tried on the 66–88 arena and read as
        // clutter once that arena came back down to 42–64; 0.08 is what both
        // playtests liked at this size. BOSS_COVER_DENSITY_MAX caps it;
        // boss/cover.ts additionally guarantees the boss and every anchor stay
        // reachable.
        density: 0.08,
        ringSpacing: 4,
        clusters: 3
      },
      // Inert until a monster is put on a scatter mode; `spacing: 2` keeps
      // scattered spawns a tile apart so a horde does not materialise stacked
      // on one square. `batchSize`/`batchIntervalMs` are what stop a big entry
      // arriving on one frame — see the interface comment.
      spawn: {
        spacing: 2,
        ringSpacing: 4,
        clusters: 3,
        batchSize: 8,
        batchIntervalMs: 1500
      },
      // 30 seconds on every threshold, countdown on. Long enough that a burst
      // party cannot skip a tier, short enough that a slow fight barely notices.
      invulnerability: {
        enabled: true,
        seconds: BOSS_INVULN_THRESHOLDS.map(() => DEFAULT_BOSS_INVULN_SECONDS),
        countdown: true
      },
      // Revive often — every health tier and after the boss dies — but save
      // only once, at the halfway mark: a fight this long is costly to redo
      // from the top after a wipe, but a save on every threshold is more
      // than most campaigns want.
      checkpoints: {
        respawnPlayers: '75-50-25-dead',
        saveGame: '50'
      },
      monsterMultiplier: 1.0,
      foodMultiplier: 1.2,
      // All three stock presets play the same final-boss cue; `withBoss()`
      // spreads this arena before overriding theme/bossPool/waves, so desert
      // and bonus inherit it for free.
      music: 'boss_final'
    }
  }
}

/**
 * The fights a campaign will actually build.
 *
 * Read every fight through this rather than off `boss.fights`: an object
 * imported from an older `parameters.txt`, or hand-built by a test, may predate
 * the list and carry no fights at all, and a boss that is switched off builds
 * nothing whatever the list holds.
 */
export function bossFights(boss: BossOptions | undefined): BossFight[] {
  if (boss === undefined || !boss.enabled) return []
  return boss.fights ?? []
}

/**
 * Every fight's mode, in list order — what `slotLabeller` needs to label a
 * campaign's arena chips. Empty for a disabled or absent boss, matching
 * `bossFights`.
 */
export function arenaModes(boss: BossOptions | undefined): ArenaMode[] {
  return bossFights(boss).map(arenaMode)
}

/**
 * How many spawn tiers a boss arena has: the four health thresholds
 * (100 / 75 / 50 / 25) plus the boss-death tier. Validation enforces the exact
 * count, and configFile.ts bounds `bossWaveN` by it, so the array length is
 * never in doubt anywhere downstream.
 */
export const BOSS_WAVE_COUNT = 5

/**
 * The health thresholds that can carry an invulnerability window, as the engine
 * event names that fire them.
 *
 * These are deliberately their own list rather than a slice of waves.ts's
 * TIER_EVENT_NAMES: the two features are independent, the wave array also has a
 * 100% tier (fired by an area trigger, not an event) and a `Boss Died` tier, and
 * neither of those can hold a window — one fires before the fight, the other
 * after the boss is already dead.
 */
export const BOSS_INVULN_THRESHOLDS = ['Boss 75%', 'Boss 50%', 'Boss 25%'] as const

/** How many invulnerability windows an arena has — one per health threshold. */
export const BOSS_INVULN_COUNT = BOSS_INVULN_THRESHOLDS.length

/** Stock window length, in seconds, applied to every threshold and every preset. */
export const DEFAULT_BOSS_INVULN_SECONDS = 30

/**
 * Longest window a single threshold may hold. The countdown emits one
 * AnnounceText node per second, so this is also the per-threshold node cost;
 * validation warns well below the cap.
 */
export const MAX_BOSS_INVULN_SECONDS = 300

/**
 * Every milestone a checkpoint can fire on, in the order checkpoints.ts emits
 * them — the emitter walks this list, never a preset's own array or an
 * object's key order, so which events get a shared trigger never depends on
 * iteration order (invariant 2).
 */
export const BOSS_CHECKPOINT_EVENTS = ['Boss 75%', 'Boss 50%', 'Boss 25%', 'Boss Died'] as const

/**
 * Checkpoint threshold presets, as the engine event names each fires.
 * `parameters.txt` stores the preset id directly, so these ids are also the
 * on-disk vocabulary — never rename one without a configFile.ts migration.
 * Declaration order here is also the dropdown order in the form.
 */
export const BOSS_CHECKPOINT_PRESETS = {
  never: [],
  '50': ['Boss 50%'],
  '75-50-25': ['Boss 75%', 'Boss 50%', 'Boss 25%'],
  '75-50-25-dead': ['Boss 75%', 'Boss 50%', 'Boss 25%', 'Boss Died']
} as const satisfies Record<string, readonly (typeof BOSS_CHECKPOINT_EVENTS)[number][]>

export type BossCheckpointPreset = keyof typeof BOSS_CHECKPOINT_PRESETS

/**
 * Index of the boss-death tier — the last one. It is keyed to the engine's
 * `Boss Died` event rather than a health threshold, which is the only thing
 * that distinguishes it from the four tiers above: every other mechanism
 * (max counts, intervals, spawn modes, scatter points) treats it identically.
 *
 * Every preset now ships it populated — the arena keeps fighting while the
 * player walks to the orb. An EMPTY tier is still legal and emits no script
 * nodes and requests no scatter points; clearing it is how a campaign gets the
 * old quiet walk back.
 */
export const BOSS_DEATH_WAVE = BOSS_WAVE_COUNT - 1

/** The stock per-monster max horde size a fresh wave starts every id at. */
export const DEFAULT_WAVE_MONSTER_MAX = 10

/** One `[variant key, max count]` entry of a stock wave. */
export type WaveEntry = readonly [string, number]

/**
 * A stock wave built from two lists: `scattered` monsters, which are placed all
 * at once across the arena on the `random` mode, and `timed` monsters, which
 * stay on the nine anchors and trickle in on `defaultIntervalMs`.
 *
 * With nothing scattered, `spawnMode` is left off entirely rather than set to an
 * empty record — that is what an untouched wave looks like, and it is what
 * configFile.ts reproduces when it parses a line with no spawn-mode field, so
 * the two would otherwise disagree on a round trip.
 *
 * The split is not cosmetic. A monster whose wreck still blocks movement
 * (the nova / frost / tracking towers — see actorCollision.ts) may not be
 * scattered at all; validation rejects it, because a scattered wreck can wall
 * the arena off. Those belong in `timed`, and that is the only reason the stock
 * presets keep an anchored tail on some tiers.
 *
 * Pool order is `scattered` then `timed`, which is also the order spawnPoints.ts
 * places them in — so it is fixed data, not an incidental of how this is called.
 *
 * `buffs` is this tier's arena-wide buff fields. Like `spawnMode` it is left off
 * the object entirely when there are none, rather than set to an empty array —
 * that is what an untouched wave looks like and what configFile.ts reproduces
 * for a line with no `bossWaveBuffN`, so the two would otherwise disagree on a
 * round trip.
 */
export function scatterWave(
  scattered: readonly WaveEntry[],
  timed: readonly WaveEntry[],
  defaultIntervalMs: number,
  buffs: readonly FloorBuff[] = [],
  pickups: readonly WavePickup[] = [],
  traps: readonly BossTrap[] = []
): BossWave {
  const all = [...scattered, ...timed]
  const wave: BossWave = {
    monsters: all.map(([key]) => key),
    monsterMax: Object.fromEntries(all),
    defaultIntervalMs
  }
  if (scattered.length > 0) {
    wave.spawnMode = Object.fromEntries(scattered.map(([key]) => [key, 'random' as BossSpawnMode]))
  }
  if (buffs.length > 0) {
    wave.buffs = buffs.map((entry) => ({ ...entry }))
  }
  // Left off the object entirely when empty, for the same round-trip reason as
  // `buffs` above.
  if (pickups.length > 0) {
    wave.pickups = pickups.map((entry) => ({ ...entry }))
  }
  if (traps.length > 0) {
    wave.traps = traps.map((entry) => ({ ...entry }))
  }
  return wave
}

/**
 * The send-off every preset's boss-death tier carries: the horde that spawns
 * once the boss is down fights at +50% damage and +50% move speed, so the walk
 * to the orb is a fight rather than a victory lap. Playtest request, 2026-08-28.
 *
 * A tier's buffs replace the previous tier's (see boss/waveBuffs.ts), and this is
 * the only tier any stock preset buffs, so the field is dark for the whole health
 * fight and switches on at the kill.
 */
export function bossDeathBuffs(): FloorBuff[] {
  return [{ buff: 'bloodlust', target: 'monsters' }]
}

/**
 * The stock drop table: a resupply at 50%, one rejuvenation potion at 25%, and
 * a double resupply once the boss is down.
 *
 * The shape is deliberately back-loaded. The fight only becomes an attrition
 * problem in its second half, so dropping at 100% or 75% would just be free
 * health the party picks up at full bars. 25% is one potion rather than a
 * resupply because that is the phase where all four tiers are spawning at once
 * (waves.ts's header) and standing still to collect is the expensive move —
 * rejuvenation is the one drop worth the detour. The death tier doubles the
 * 50% table because the horde keeps coming after the kill and the walk to the
 * orb is fought on whatever the party has left.
 */
export function stockWavePickups(): { half: WavePickup[]; quarter: WavePickup[]; death: WavePickup[] } {
  return {
    half: [
      { item: 'powerup_health', count: 1 },
      { item: 'mana_2', count: 2 }
    ],
    quarter: [{ item: 'potion_2', count: 1 }],
    death: [
      { item: 'powerup_health', count: 2 },
      { item: 'mana_2', count: 4 }
    ]
  }
}

/**
 * The stock 25%/boss-death trap rig castle and desert both run: arrow
 * spewers on all four walls, narrower spread on the side walls (6 spewers)
 * than the top/bottom (4). Its own constant rather than inlined twice so the
 * two presets can't drift apart by a typo.
 */
export const SHOOTER_ARROW_TRAPS: BossTrap[] = [
  { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 4 },
  { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1000, count: 4 },
  { projectile: 'shooter_arrow', direction: 'left', spread: 0, spawnRateMs: 1000, count: 6 },
  { projectile: 'shooter_arrow', direction: 'right', spread: 0, spawnRateMs: 1000, count: 6 }
]

/**
 * The stock Castle wave line-up, one entry per tier (100 / 75 / 50 / 25, then
 * boss death). The death tier is a lich send-off — see BOSS_DEATH_WAVE.
 *
 * Almost everything is scattered: the tiers are big enough that trickling them
 * through nine anchors would queue most of the horde behind the timer. The
 * anchored tail is the blocking-wreck towers, which may not be scattered.
 *
 * The `id#n` keys are variant keys (see monsterTypes.ts): `#0` is the spawner
 * prop, higher indices the elite tiers.
 *
 * Counts were cut ~60% after the 4-player playtest of 2026-08-27. Nothing ever
 * disables a lower tier's rig (waves.ts's header), so the tiers are additive:
 * the old table had spawned ~1140 monsters by the 50% threshold and the fight
 * was pathfinding-bound long before that. The `#0` spawner props are cut hardest
 * because they keep emitting for the rest of the fight — they are a rate, not a
 * quantity. Totals were 152 / 137 / 117 / 38 / 15; issue #64 part 2 added the
 * knight's own bodyguards on top (4 / 4 / 4 / 1), giving 152 / 141 / 121 / 42 / 16.
 */
function castleWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['bat1', 42],
        ['bat2', 24],
        ['maggot', 20],
        ['maggot#2', 12],
        ['maggot#3', 6],
        ['tick1', 24],
        ['tick1#2', 16],
        ['tick1#0', 2],
        ['tower_flower1_small', 6]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['archer1', 14],
        ['archer2', 7],
        ['skeleton1', 24],
        ['skeleton1#2', 28],
        ['slime', 44],
        ['tower_archer1', 6],
        ['mb_tick', 3],
        ['mb_maggot', 1],
        ['skeleton1#0', 2],
        ['archer1#0', 2],
        ['slime#0', 6],
        // the knight's own guard (issue #64 part 2) — bodyguards.
        ['knight_guard', 4]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['eye', 44],
        ['eye#2', 30],
        ['wisp1', 12],
        ['wisp1#2', 4],
        ['wisp2', 8],
        ['lich#3', 8],
        ['tower_flower1', 3],
        ['tower_flower2', 2],
        ['tower_flower3', 1],
        ['mb_skeleton', 4],
        ['mb_eye', 1],
        // bodyguards
        ['lich_guard_lich', 4]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['lich', 4],
        ['lich#0', 4],
        ['lich#2', 6],
        ['mb_eye', 2],
        ['mb_lich', 1],
        ['tower_archer3', 5],
        ['eye#0', 5],
        ['archer2#0', 4],
        ['skeleton2#0', 4],
        // bodyguards
        ['lich_guard_lich', 2],
        ['lich_mirror', 2]
      ],
      [['tower_nova1', 3]],
      1000,
      [],
      drops.quarter,
      SHOOTER_ARROW_TRAPS
    ),
    // boss death — the arena keeps fighting after the kill, see BOSS_DEATH_WAVE.
    // tower_nova2 is anchored because its wreck blocks, and the horde
    // arrives bloodlusted — see bossDeathBuffs().
    scatterWave(
      [
        ['lich#2', 6],
        ['lich', 2],
        ['lich#0', 2],
        ['mb_lich', 1],
        ['mb_doomspawn', 2],
        // the Lich's necromancer guard, sent off with everything else — bodyguards.
        ['lich_guard_lich', 1]
      ],
      [['tower_nova2', 2]],
      1000,
      bossDeathBuffs(),
      drops.death,
      SHOOTER_ARROW_TRAPS
    )
  ]
}

/**
 * The built-in default is the "Castle" campaign preset — 7 floors of castle
 * themes a..g, each in its `- mixed` variant, so every floor varies its tileset
 * region by region and the boss floor lands on `g - mixed`. See config/presets.ts
 * for the other two presets, which override only `levels`, `themes` and
 * `levelMonsters` on top of this.
 *
 * Floors 1-4 are ordinary act mobs; 5-7 are boss rushes, which is why every
 * mini-boss (`mb_*`) lives there and nowhere earlier.
 */
export function defaultParameters(): DungeonParameters {
  const params: DungeonParameters = {
    levels: 8,
    minRoomSize: 6,
    maxRoomSize: 20,
    minPassageWidth: 3,
    maxPassageWidth: 6,
    minRoomCount: 12,
    maxRoomCount: 15,
    mapWidth: 80,
    mapHeight: 60,
    edgePadding: 2,
    roomPadding: 2,
    // ..._mixed a-g are the campaign proper; the eighth is the escape floor
    // played AFTER the boss (see levelOrder below), back on f - mixed
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed', 'f_mixed', 'g_mixed', 'f_mixed'],
    levelBuffs: Array.from({ length: 8 }, () => defaultFloorBuffs()),
    // Every floor but the escape floor stays unarmed; the escape floor (the
    // last one, played after the boss) gets a fireball spewer on all four
    // walls, matching the shipped 070 parameter set.
    levelTraps: [
      ...Array.from({ length: 7 }, () => defaultFloorTraps()),
      [
        { projectile: 'shooter_fireball', direction: 'up', spread: 0, spawnRateMs: 1000, count: 8 },
        { projectile: 'shooter_fireball', direction: 'down', spread: 0, spawnRateMs: 1000, count: 8 },
        { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 1000, count: 8 },
        { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 1000, count: 8 }
      ]
    ],
    // every floor but the escape floor is untimed; that one is the whole point
    // of the timer feature — 90 seconds to find the way out, then 1 damage
    // every 100ms until the party leaves
    levelTimers: [...Array.from({ length: 7 }, () => defaultFloorTimer()), escapeFloorTimer()],
    // One music cue per act, the escape floor staying on act4 — 070 parameter set.
    floorMusic: ['act1', 'act2', 'act2', 'act3', 'act3', 'act4', 'act4', 'act4'],
    monsterMultiplier: 1.0,
    goldMultiplier: 1.1,
    foodMultiplier: 1.2,
    shopChance: 1.0,
    vaultChance: 0.3,
    lockChance: 0.8,
    keyChance: 1.0,
    // Re-tuned in the app after the tier-roll and tower-family fixes (issue
    // #58): several types that were previously unreachable (plain/small
    // skeletons, tower_archer1, tower_banner1, …) are now genuinely in play,
    // and the felt difficulty shifted enough to warrant a playtest pass.
    // Exported and applied verbatim from that pass, except the escape floor's
    // tower_static_frost count — see the comment there.
    levelMonsters: [
      ['bat1', 'tick1', 'maggot', 'tower_flower1_small', 'tower_flower1'],
      ['maggot', 'slime', 'skeleton1', 'archer1'],
      ['eye', 'wisp1', 'lich#3', 'wisp2', 'tower_nova'],
      ['skeleton2', 'archer2', 'archer3', 'lich', 'wisp2', 'wisp1'],
      ['mb_tick', 'mb_maggot', 'bat2', 'tick2', 'maggot', 'tower_flower'],
      ['mb_skeleton', 'mb_eye', 'archer2', 'skeleton2', 'tower_nova'],
      ['mb_lich', 'mb_doomspawn', 'lich', 'wisp2', 'tower_nova2'],
      // The escape floor. Repetition is the only weighting the pool has
      // (chooseMonsterForLevel picks uniformly), so the battlements are
      // repeated until they hold ~4 lairs in 9 — the share measured at 36
      // campaigns to give a median of 213 towers and never fewer than 84. The
      // count tracks the pool's length: lengthen the roster below and the
      // battlements have to grow with it or the maze thins out.
      //
      // tower_static_frost is 3 copies here, not the 4 the playtest export
      // had: at 4 the tower_empty share lands at exactly 8/20 = 0.4, which
      // fails the strict lower bound below (tests/monsters.test.ts,
      // tests/presets.test.ts) — 3 copies clears it at 8/19 ≈ 0.421 while
      // keeping every other count from the export untouched.
      [
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        // the fast harassers and ranged pressure that punish standing still
        'skeleton3',
        'bat2',
        'wisp2',
        'lich',
        'mb_eye',
        // the castle's turret line and a mini-boss lich on top of them
        'wisp1',
        'tower_static_frost',
        'tower_static_frost',
        'tower_static_frost',
        'mb_lich',
        'tower_nova'
      ]
    ],
    // The dungeon-prep lobby, floors 1-7 in order, the boss-prep lobby, the
    // boss fight, then the escape floor. The arena's alcove holds a portal to
    // that floor instead of the victory orb, which the orb follows onto the
    // last slot — verified in game.
    levelOrder: shippedOrder(8),
    monsterMax: {
      ...Object.fromEntries(MONSTER_TYPES.map((t) => [t.id, t.defaultMax])),
      // Families are pooled entries in their own right, so each carries its own
      // cap beside the types'. They are in no default pool, so these keys reach
      // no seed until someone opts in.
      ...Object.fromEntries(MONSTER_FAMILIES.map((f) => [f.id, f.defaultMax])),
      // A horde is trunc(fRand(cap/5, cap)) per lair, so this is what makes the
      // escape floor a maze of 450-HP battlements rather than a handful of
      // them. Campaign-wide, but tower_empty is pooled on no other floor of any
      // preset, so nothing else sees it. The roster's own defaultMax stays 24.
      tower_empty: 150,
      // The rest of this block: the same post-#58 playtest pass as
      // levelMonsters above. lich/tick2/wisp2/skeleton2 are identical across
      // all three exports, so they land here rather than as three separate
      // per-preset overrides — desert and bonus both inherit them for free by
      // spreading this object. tower_static_frost and tower_flower1 differ
      // PER preset (desert wants 99/6, bonus wants 100/0): this is castle's
      // own value, and desert/bonus each carry an explicit override for
      // theirs (presets.ts) — the same "campaign default sits here, roster
      // default stays put" split tower_empty above already uses.
      lich: 20,
      tick2: 25,
      wisp2: 25,
      skeleton2: 100,
      tower_static_frost: 102,
      tower_flower1: 4
    },
    // Extra lives are repeatable, so a party can farm them by leaving a level
    // and coming back — off by default since that trivialises the campaign.
    // Rejuvenation stays: it is a one-off full heal, not another life. This is
    // the one tweak a stock run ships, so a stock campaign now emits exactly
    // one tweak file (see CLAUDE.md invariant 6).
    playerTweaks: { [removeKey('shared', 'life')]: 1 },
    // Two stock lobbies, matching the pre-#48 campaign's two shop rooms: the
    // campaign's own starting lobby (10000 gold) and what used to be the boss
    // fight's welded-on prep room (20000 gold) — now just the second lobby in
    // the order, placed by `shippedOrder` right before the fight. Both sell
    // every column including power; see `defaultLobby`'s comment for why.
    lobbies: [
      defaultLobby('BETA-dungeon-prep'),
      { ...defaultLobby('BETA-boss-prep'), music: 'boss_1' }
    ],
    // On by default: a stock campaign's shop rooms each carry a save checkpoint
    // by the exit, so quitting mid-run does not throw the whole campaign away.
    lobbySaves: true,
    boss: defaultBossOptions()
  }
  // Locks exactly the floors the old campaign-wide `lockFinalRoom` default
  // sealed — every floor that ends in a portal or the orb — so the stock
  // campaign stayed byte-identical when locks became per-floor (issue #69).
  return withGatewayLocks(params)
}
