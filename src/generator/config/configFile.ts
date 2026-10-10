import {
  BOSS_CHECKPOINT_PRESETS,
  BOSS_COVER_PATTERNS,
  BOSS_DEATH_WAVE,
  BOSS_FLOOR_PATTERNS,
  BOSS_INVULN_COUNT,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  BUFF_TARGETS,
  DEFAULT_WAVE_MONSTER_MAX,
  DungeonParameters,
  defaultFloorBuffs,
  defaultFloorTraps,
  defaultBossFight,
  defaultFloorTimer,
  defaultFloorLock,
  defaultFloorMystery,
  defaultFloorLockMystery,
  MYSTERY_PARSE_LIMIT,
  gatewayLockedFloors,
  defaultLobby,
  defaultParameters,
  isScatterMode,
  waveBuffs,
  wavePickups,
  waveTraps,
  BOSS_TRAP_DIRECTIONS,
  arenaMode,
  ARENA_MODES,
  BOSS_IDS,
  defaultDungeonBoss,
  DEFAULT_SURVIVAL_INTERVAL_MS,
  SURVIVAL_COUNTDOWN_STYLES,
  SURVIVAL_SECONDS_MAX,
  defaultSurvivalOptions,
  arenaBossCount,
  floorBossCount,
  BOSS_SELECTIONS,
  bossSelection,
  arenaUsesBodyguards
} from './parameters'
import { UPGRADE_KINDS, noUpgrades } from '../levelTemplate/surgery'
import type { UpgradeCounts } from '../levelTemplate/surgery'
import type {
  BossArenaOptions,
  BossCheckpointPreset,
  BossFight,
  BossFloorPattern,
  BossSpawnMode,
  BuffTarget,
  FloorBuff,
  LobbyOptions,
  WavePickup,
  BossTrap,
  BossTrapDirection,
  ArenaMode,
  SurvivalBuff,
  SurvivalCountdown,
  SurvivalOptions,
  SurvivalPickup,
  SurvivalTrap,
  SurvivalWave,
  DungeonBoss,
  BossSelection,
  FloorMystery,
  FloorLockMystery,
  MysteryButton,
  MysteryMonster
} from './parameters'
import { MONSTER_FAMILIES, MONSTER_TYPES, isKnownMonsterKey } from '../objects/monsterTypes'
import { buffById } from '../objects/buffTypes'
import { pickupById } from '../objects/pickupTypes'
import { mysteryLootById } from '../objects/mysteryLoot'
import { projectileById } from '../objects/projectileTypes'
import { isLobbyCategory } from '../lobby/shops'
import { DEFAULT_LOBBY_PRESET_ID, LOBBY_PRESETS } from '../lobby/presets'
import { campaignOrder, isDefaultOrder, normalizeOrder, parseSlotLabel, slotLabeller } from '../campaign'
import type { CampaignSlot } from '../campaign'
import { TWEAK_FIELD_MAP, formatTweakLine, parseTweakValue, pruneTweaks } from '../tweak/overrides'
import { MUSIC_DEFAULT, isKnownMusicId } from '../music/tracks'

export interface ParsedConfig {
  params: DungeonParameters
  /** Hammerwatch install path, if present in the file */
  path?: string
  /** original cleanupFiles flag, if present */
  cleanupFiles?: boolean
  /** keys we did not recognize (reported to the user, never fatal) */
  unknownKeys: string[]
}

/**
 * The canonical order for parameters in exported parameters.txt files.
 * This ensures all exports follow a consistent, user-friendly order.
 * The "monster" and "monsterMax" entries are placeholders; actual monster
 * pools and max values follow MONSTER_TYPES order.
 */
export const PARAMETER_ORDER = [
  'path',
  'levels',
  'minRoomSize',
  'maxRoomSize',
  'minPassageWidth',
  'maxPassageWidth',
  'minRoomCount',
  'maxRoomCount',
  'mapWidth',
  'mapHeight',
  'edgePadding',
  'roomPadding',
  'cleanupFiles',
  'themes',
  'monsterMultiplier',
  'goldMultiplier',
  'foodMultiplier',
  'shopChance',
  'vaultChance',
  'lockChance',
  'keyChance',
  'lockFloors',
  'monster', // placeholder: expanded to monsters0...monstersN
  'buff', // placeholder: expanded to buffN for each floor that carries a buff
  'trap', // placeholder: expanded to trapN for each floor that runs wall traps
  'timer', // placeholder: expanded to timerN for each floor whose timer is on
  'bossFloor', // placeholder: expanded to bossFloorN… for each floor carrying a boss
  'music', // placeholder: expanded to musicN for each floor with a track set
  'mystery', // placeholder: mysteryButtons=, mysteryButton<i>…, then mysteryFloorN
  'monsterMax', // placeholder: expanded per MONSTER_TYPES order
  'playerTweaks', // placeholder: sorted by key
] as const

// Families carry their own cap, so they round-trip through the same `max*=`
// grammar the types do — one entry per thing a pool can name. A test asserts
// the two registries' configKeys never collide.
const configKeyToMonsterId = new Map(
  [...MONSTER_TYPES, ...MONSTER_FAMILIES].map((t) => [t.configKey.toLowerCase(), t.id])
)

/**
 * Structural equality, ignoring object key order — `JSON.stringify` is not
 * enough here because the same logical `FloorTrap`/`FloorTimer`/`CampaignSlot`
 * can be produced by two different code paths (a preset literal vs.
 * `defaultParameters()`) with keys inserted in a different order. Used only to
 * decide whether the SERIALIZER needs to write an explicit line — never to
 * decide generator output, so it carries no determinism risk of its own.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || a === undefined || b === undefined) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a as Record<string, unknown>)
    const bk = Object.keys(b as Record<string, unknown>)
    if (ak.length !== bk.length) return false
    return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/**
 * Parse the original tool's parameters.txt format (key=value per line).
 * Anything present overrides the defaults; anything missing keeps them —
 * the same semantics the Java ConfigFile had.
 */

/**
 * Parse a `lobbyUpgrades` / `bossUpgrades` value: the free upgrade counts as
 * whole numbers in `UPGRADE_KINDS` order, space separated.
 *
 * Lenient on purpose, like every other key here (invariant: unknown or
 * malformed input is reported, never fatal). A short list leaves the kinds it
 * does not reach at zero; a long one reports the extras; a value that is not a
 * whole number ≥ 0 is reported and that one kind stays at zero. Whatever
 * survives is a complete, valid `UpgradeCounts` — `validation.ts` is the gate
 * for the parts that did parse.
 */
function parseUpgradeCounts(key: string, value: string, unknownKeys: string[]): UpgradeCounts {
  const counts: Record<string, number> = { ...noUpgrades() }
  const fields = value.split(/\s+/).filter((f) => f !== '')

  fields.forEach((field, i) => {
    const kind = UPGRADE_KINDS[i]
    if (kind === undefined) {
      unknownKeys.push(`${key} extra value "${field}"`)
      return
    }
    const n = parseInt(field, 10)
    if (Number.isNaN(n) || n < 0 || String(n) !== field) {
      unknownKeys.push(`${key} value "${field}"`)
      return
    }
    counts[kind] = n
  })

  return counts as UpgradeCounts
}

/**
 * Per-fight bookkeeping for the two wave post-passes. One of these per fight
 * index the file mentioned: the keys of one fight say nothing about another, so
 * a file that fully describes fight 0's tiers must not clear fight 1's.
 */
interface BossFightParseState {
  /** whether the file carried any `bossNWaveM=` line for this fight */
  sawAnyWave: boolean
  /** whether one of them was the death tier */
  sawDeathWave: boolean
  // Which tiers a wave line described, and which of those also carried a pickup
  // line. A tier in the first set but not the second was described by a file
  // that gave it no drops, so the stock drop table the defaults supplied has to
  // go — see the post-pass. Two sets rather than clearing inline, so the two
  // keys may appear in either order.
  sawWaveLine: Set<number>
  sawPickupLine: Set<number>
  sawTrapLine: Set<number>
  sawBuffLine: Set<number>
}

function newBossFightParseState(): BossFightParseState {
  return {
    sawAnyWave: false,
    sawDeathWave: false,
    sawWaveLine: new Set(),
    sawPickupLine: new Set(),
    sawTrapLine: new Set(),
    sawBuffLine: new Set()
  }
}

/**
 * Parse one `boss<i><suffix>` key into one fight. Returns false when the suffix
 * is not a boss key at all, so the caller can report it like any other unknown.
 *
 * Everything here is per-fight state; the campaign-wide `boss` (enabled) and
 * `bossFights` (count) keys are handled by the caller, before the index is
 * even parsed.
 *
 * `gold`, `upgrades` and `shops` are deliberately NOT handled here any more —
 * issue #48 moved the fight's prep room out to its own `lobby` slot, so a
 * `boss<i>Gold` etc. from a file written before that lands in `unknownKeys`
 * like any other key this parser no longer recognizes (invariant #5: never
 * fatal). There is no alias to a lobby index; the break is deliberately loud.
 */
/**
 * Parses a `<bossId>:<count>,<bossId>:<count>` value into a `bossLineup`
 * object (issue #64 follow-up: exact lineups). Shared by the arena's
 * `boss<f>Lineup` and the floor's `bossFloor<i>Lineup`, for the same no-drift
 * reason `parseTrapRows` and `parsePickupRows` below are shared — the floor
 * validates the result against `MOBILE_BOSS_IDS` itself, same as it already
 * does for `bossPool`, so this parser accepts any `BOSS_IDS` id.
 *
 * A bare id with no count is one copy, the same friendliest-reading rule
 * `parsePickupRows` uses. An unknown id or a non-numeric count is reported
 * through `unknownKeys` and skipped, never thrown on (invariant #5); the rest
 * of the line still parses.
 */
function parseLineupLine(key: string, value: string, unknownKeys: string[]): Partial<Record<string, number>> {
  const lineup: Partial<Record<string, number>> = {}
  for (const segment of value.split(',')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    const colon = trimmed.indexOf(':')
    const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
    const countText = colon === -1 ? '1' : trimmed.slice(colon + 1).trim()

    if (!BOSS_IDS.includes(id as (typeof BOSS_IDS)[number])) {
      unknownKeys.push(`${key} boss "${id}"`)
      continue
    }
    const count = parseInt(countText, 10)
    if (Number.isNaN(count)) {
      unknownKeys.push(`${key} count "${countText}"`)
      continue
    }
    lineup[id] = count
  }
  return lineup
}

/**
 * Serializes a `bossLineup` object back to the `<bossId>:<count>,…` grammar
 * `parseLineupLine` reads, always in `BOSS_IDS` order (never `Object.keys` —
 * determinism, invariant 2) and only the positive integer counts a real
 * lineup carries.
 */
function lineupLine(lineup: Partial<Record<string, number>> | undefined): string {
  if (lineup === undefined) return ''
  return BOSS_IDS.filter((id) => (lineup[id] ?? 0) > 0)
    .map((id) => `${id}:${lineup[id]}`)
    .join(',')
}

/**
 * Parses an `<item>:<count>|…` value into drop rows. Shared by the arena's
 * `boss<f>WavePickupN` and the floor's `bossFloor<i>WavePickupN`, for the same
 * no-drift reason `parseTrapRows` below is shared.
 *
 * A bare item with no count is one copy — the friendliest reading of a
 * hand-written line. An unknown item or a non-numeric count is reported
 * through `unknownKeys` and skipped, never thrown on (invariant #5).
 */
function parsePickupRows(
  key: string,
  value: string,
  unknownKeys: string[],
  known: (id: string) => unknown = pickupById
): WavePickup[] {
  const entries: WavePickup[] = []
  for (const segment of value.split('|')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    const colon = trimmed.indexOf(':')
    const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
    const countText = colon === -1 ? '1' : trimmed.slice(colon + 1).trim()

    if (known(id) === undefined) {
      unknownKeys.push(`${key} item "${id}"`)
      continue
    }
    const count = parseInt(countText, 10)
    if (Number.isNaN(count)) {
      unknownKeys.push(`${key} count "${countText}"`)
      continue
    }
    entries.push({ item: id, count })
  }
  return entries
}

/**
 * Parses a mystery button's `<monster key>:<count>|…` value. Keys speak the
 * arena grammar (`isKnownMonsterKey`) — see `MysteryMonster`. A bare key is
 * one copy; an unknown key or a non-numeric count is reported and skipped.
 */
function parseMonsterCountRows(key: string, value: string, unknownKeys: string[]): MysteryMonster[] {
  const rows: MysteryMonster[] = []
  for (const segment of value.split('|')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    const colon = trimmed.indexOf(':')
    const monster = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim().toLowerCase()
    const countText = colon === -1 ? '1' : trimmed.slice(colon + 1).trim()
    if (!isKnownMonsterKey(monster)) {
      unknownKeys.push(`${key} monster "${monster}"`)
      continue
    }
    const count = parseInt(countText, 10)
    if (Number.isNaN(count)) {
      unknownKeys.push(`${key} count "${countText}"`)
      continue
    }
    rows.push({ monster, count })
  }
  return rows
}

/** A pool entry nothing has been set on yet — what `mysteryButton<i>…` keys grow the pool with. */
function emptyMysteryButton(): MysteryButton {
  return { loot: [], monsters: [], traps: [] }
}

/**
 * Parses a `<count>:<pool index>,<pool index>,…` value — the shared grammar
 * `mysteryFloorN` and `mysteryLockN` (enhanced lock buttons) both use. 0-based
 * indices, repeated to weight. Returns null (after reporting) when the count
 * itself does not parse; a malformed pool token is reported and simply
 * dropped, same as every other row parser in this file.
 */
function parsePoolLine(key: string, value: string, unknownKeys: string[]): { count: number; pool: number[] } | null {
  const colon = value.indexOf(':')
  const countText = (colon === -1 ? value : value.slice(0, colon)).trim()
  const count = parseInt(countText, 10)
  if (Number.isNaN(count)) {
    unknownKeys.push(`${key} count "${countText}"`)
    return null
  }
  const pool: number[] = []
  for (const token of (colon === -1 ? '' : value.slice(colon + 1)).split(',')) {
    const t = token.trim()
    if (t === '') continue
    const n = parseInt(t, 10)
    if (Number.isNaN(n) || n < 0) unknownKeys.push(`${key} button "${t}"`)
    else pool.push(n)
  }
  return { count, pool }
}

/**
 * Parses a `<projectile>:<direction>:<spread>:<rate>:<count>|…` value into trap
 * rows. Shared verbatim by the arena's `boss<f>WaveTrapN` and the floor's
 * `trapN`, which carry the same five fields in the same grammar — the two must
 * not be allowed to drift on what a hand-written line means.
 *
 * Everything after the projectile id is optional and falls back to a sane
 * default: a bare projectile is one linear spewer firing north every second.
 * A malformed segment is reported through `unknownKeys` and skipped, never
 * thrown on (invariant #5); the rest of the line still parses.
 */
function parseTrapRows(key: string, value: string, unknownKeys: string[]): BossTrap[] {
  const rows: BossTrap[] = []

  for (const segment of value.split('|')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    const parts = trimmed.split(':').map((p) => p.trim())
    const id = parts[0] ?? ''

    if (projectileById(id) === undefined) {
      unknownKeys.push(`${key} projectile "${id}"`)
      continue
    }

    const directionText = (parts[1] ?? 'up').toLowerCase()
    if (!(BOSS_TRAP_DIRECTIONS as readonly string[]).includes(directionText)) {
      unknownKeys.push(`${key} direction "${parts[1]}"`)
      continue
    }
    const direction = directionText as BossTrapDirection

    const spread = parts[2] === undefined || parts[2] === '' ? 0 : parseFloat(parts[2])
    if (Number.isNaN(spread)) {
      unknownKeys.push(`${key} spread "${parts[2]}"`)
      continue
    }
    const spawnRateMs = parts[3] === undefined || parts[3] === '' ? 1000 : parseInt(parts[3], 10)
    if (Number.isNaN(spawnRateMs)) {
      unknownKeys.push(`${key} rate "${parts[3]}"`)
      continue
    }
    const count = parts[4] === undefined || parts[4] === '' ? 1 : parseInt(parts[4], 10)
    if (Number.isNaN(count)) {
      unknownKeys.push(`${key} count "${parts[4]}"`)
      continue
    }

    rows.push({ projectile: id, direction, spread, spawnRateMs, count })
  }

  return rows
}

/**
 * `<projectile>:<dir>:<spread>:<rate>:<count>:<start>:<end>|…` — a survival
 * arena's trap windows.
 *
 * The first five fields are `parseTrapRows`' own, deliberately in the same
 * order and with the same defaults, so a boss tier's row and a survival window
 * read identically up to the two timestamps appended on the tail. That tail
 * placement is the house rule for growing a value: a field added at the end
 * leaves every shorter line valid.
 *
 * A window with no timestamps runs the whole round — the friendliest reading
 * of a hand-written line, and never fatal (invariant #5). `end` is left at
 * `Number.POSITIVE_INFINITY`'s stand-in, SURVIVAL_SECONDS_MAX, rather than 0,
 * because a window ending at 0 would never fire at all.
 */
function parseSurvivalTrapRows(key: string, value: string, unknownKeys: string[]): SurvivalTrap[] {
  const rows: SurvivalTrap[] = []

  for (const segment of value.split('|')) {
    const trimmed = segment.trim()
    if (trimmed === '') continue
    const parts = trimmed.split(':').map((p) => p.trim())

    // Re-parse the first five fields through the shared row parser, so the two
    // key families cannot drift on defaults or on which field is which.
    const base = parseTrapRows(key, parts.slice(0, 5).join(':'), unknownKeys)
    if (base.length === 0) continue

    const startSeconds = parts[5] === undefined || parts[5] === '' ? 0 : parseInt(parts[5], 10)
    if (Number.isNaN(startSeconds)) {
      unknownKeys.push(`${key} start "${parts[5]}"`)
      continue
    }
    const endSeconds = parts[6] === undefined || parts[6] === '' ? SURVIVAL_SECONDS_MAX : parseInt(parts[6], 10)
    if (Number.isNaN(endSeconds)) {
      unknownKeys.push(`${key} end "${parts[6]}"`)
      continue
    }

    rows.push({ ...base[0], startSeconds, endSeconds })
  }

  return rows
}

/**
 * One `bossFloorN…` key (issue #61). Returns false for a suffix this parser
 * does not know, so the caller falls through to the catch-all and reports it
 * rather than swallowing it.
 *
 * The wave/buff/trap lines deliberately reuse the arena's own grammars
 * (`parseWaveLine`, `parseTrapRows`, the `id:target` buff pairs), because a
 * floor boss's tiers ARE `BossWave`s — one format, one parser, no drift.
 */
function parseFloorBossKey(
  suffix: string,
  key: string,
  value: string,
  boss: DungeonBoss,
  unknownKeys: string[]
): boolean {
  // bossFloorN=<enabled>|<bossIds>|<monsterMultiplier>|<bossCount>
  // The 4th field is issue #64 part 1's boss count — only present when the
  // file was written with more than one, so an old three-field line parses to
  // count 1 (the field's own default) exactly as before this feature existed.
  if (suffix === '') {
    const parts = value.split('|').map((v) => v.trim())
    boss.enabled = parts[0] === '1' || parts[0]?.toLowerCase() === 'true'
    if (parts[1] !== undefined && parts[1] !== '') {
      const pool: string[] = []
      for (const id of parts[1].split(',').map((v) => v.trim()).filter((v) => v !== '')) {
        if (!BOSS_IDS.includes(id as (typeof BOSS_IDS)[number])) {
          unknownKeys.push(`${key} boss "${id}"`)
          continue
        }
        pool.push(id)
      }
      if (pool.length > 0) boss.bossPool = pool
    }
    if (parts[2] !== undefined && parts[2] !== '') {
      const multiplier = parseFloat(parts[2])
      if (Number.isNaN(multiplier)) unknownKeys.push(`${key} multiplier "${parts[2]}"`)
      else boss.monsterMultiplier = multiplier
    }
    if (parts[3] !== undefined && parts[3] !== '') {
      const count = parseInt(parts[3], 10)
      if (Number.isNaN(count)) unknownKeys.push(`${key} count "${parts[3]}"`)
      else boss.bossCount = count
    }
    return true
  }

  // Selection mode and lineup (issue #64 follow-up), on their own keys for the
  // same byte-compatibility reason survival's keys are — a floor that never
  // touches lineup mode writes not one of them.
  if (suffix === 'selection') {
    const text = value.trim().toLowerCase()
    if (!(BOSS_SELECTIONS as readonly string[]).includes(text)) {
      unknownKeys.push(`${key} value "${value}"`)
    } else {
      boss.bossSelection = text as BossSelection
    }
    return true
  }

  if (suffix === 'lineup') {
    boss.bossLineup = parseLineupLine(key, value, unknownKeys)
    return true
  }

  if (suffix === 'invuln') {
    // `off` keeps the window lengths, so toggling in a file and back loses
    // nothing — the same shape boss<i>Invuln uses.
    if (value.trim().toLowerCase() === 'off') {
      boss.invulnerability.enabled = false
      return true
    }
    boss.invulnerability.enabled = true
    const parts = value.split(',').map((v) => v.trim()).filter((v) => v !== '')
    const seconds = [...boss.invulnerability.seconds]
    for (let i = 0; i < BOSS_INVULN_COUNT; i++) {
      const raw = parts.length === 1 ? parts[0] : parts[i]
      if (raw === undefined || raw === '') continue
      const parsed = parseInt(raw, 10)
      if (Number.isNaN(parsed)) unknownKeys.push(`${key} value "${raw}"`)
      else seconds[i] = parsed
    }
    boss.invulnerability.seconds = seconds
    return true
  }

  if (suffix === 'invulncountdown') {
    boss.invulnerability.countdown = value.trim() === '1' || value.trim().toLowerCase() === 'true'
    return true
  }

  if (suffix === 'checkpoints') {
    const parts = value.split(',').map((v) => v.trim())
    if (parts[0] !== undefined && parts[0] !== '') {
      if (parts[0] in BOSS_CHECKPOINT_PRESETS) boss.checkpoints.respawnPlayers = parts[0] as BossCheckpointPreset
      else unknownKeys.push(`${key} respawn preset "${parts[0]}"`)
    }
    if (parts[1] !== undefined && parts[1] !== '') {
      if (parts[1] in BOSS_CHECKPOINT_PRESETS) boss.checkpoints.saveGame = parts[1] as BossCheckpointPreset
      else unknownKeys.push(`${key} save preset "${parts[1]}"`)
    }
    return true
  }

  // The four tier lines, tested most-specific-first for the same
  // anchored-pattern reason the arena's are: `wavetrap1` must not fall through
  // to the `wave(\d+)` branch.
  const pickupMatch = suffix.match(/^wavepickup(\d+)$/)
  if (pickupMatch) {
    const tier = parseInt(pickupMatch[1], 10) - 1
    if (tier < 0 || tier >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    boss.waves[tier].pickups = parsePickupRows(key, value, unknownKeys)
    return true
  }

  const trapMatch = suffix.match(/^wavetrap(\d+)$/)
  if (trapMatch) {
    const tier = parseInt(trapMatch[1], 10) - 1
    if (tier < 0 || tier >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    boss.waves[tier].traps = parseTrapRows(key, value, unknownKeys)
    return true
  }

  const buffMatch = suffix.match(/^wavebuff(\d+)$/)
  if (buffMatch) {
    const tier = parseInt(buffMatch[1], 10) - 1
    if (tier < 0 || tier >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    const entries: FloorBuff[] = []
    for (const segment of value.split('|')) {
      const trimmed = segment.trim()
      if (trimmed === '') continue
      const parts = trimmed.split(':').map((v) => v.trim())
      if (buffById(parts[0]) === undefined) {
        unknownKeys.push(`${key} buff "${parts[0]}"`)
        continue
      }
      const target = parts[1] === undefined || parts[1] === '' ? 'players' : parts[1].toLowerCase()
      if (!(BUFF_TARGETS as readonly string[]).includes(target)) {
        unknownKeys.push(`${key} target "${parts[1]}"`)
        continue
      }
      entries.push({ buff: parts[0], target: target as BuffTarget })
    }
    boss.waves[tier].buffs = entries
    return true
  }

  const waveMatch = suffix.match(/^wave(\d+)$/)
  if (waveMatch) {
    const tier = parseInt(waveMatch[1], 10) - 1
    if (tier < 0 || tier >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    // <monsters>|<defaultIntervalMs>|<monsterMax>|<intervalMs overrides>
    // The arena's fifth field (spawn modes) is deliberately absent: a floor has
    // no scatter modes, so writing one would describe something nothing reads.
    const parts = value.split('|')
    const wave = boss.waves[tier]

    const monsters: string[] = []
    for (const id of (parts[0] ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '')) {
      if (!isKnownMonsterKey(id)) {
        unknownKeys.push(`${key} monster "${id}"`)
        continue
      }
      monsters.push(id)
    }
    wave.monsters = monsters

    if (parts[1] !== undefined && parts[1].trim() !== '') {
      const ms = parseInt(parts[1].trim(), 10)
      if (Number.isNaN(ms)) unknownKeys.push(`${key} interval "${parts[1].trim()}"`)
      else wave.defaultIntervalMs = ms
    }

    const maxes: Record<string, number> = {}
    for (const entry of (parts[2] ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '')) {
      const [id, raw] = entry.split(':').map((v) => v.trim())
      const parsed = parseInt(raw ?? '', 10)
      if (Number.isNaN(parsed)) {
        unknownKeys.push(`${key} max "${entry}"`)
        continue
      }
      maxes[id] = parsed
    }
    wave.monsterMax = maxes

    const overrides: Record<string, number> = {}
    for (const entry of (parts[3] ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '')) {
      const [id, raw] = entry.split(':').map((v) => v.trim())
      const parsed = parseInt(raw ?? '', 10)
      if (Number.isNaN(parsed)) {
        unknownKeys.push(`${key} interval override "${entry}"`)
        continue
      }
      overrides[id] = parsed
    }
    if (Object.keys(overrides).length > 0) wave.intervalMs = overrides
    else delete wave.intervalMs

    return true
  }

  return false
}

function parseBossFightKey(
  suffix: string,
  key: string,
  value: string,
  fight: BossFight,
  state: BossFightParseState,
  unknownKeys: string[]
): boolean {
  const arena = fight.arena

  // --- Arena mode and the survival keys (issue #61) ---
  //
  // All six are on their OWN suffixes rather than extra fields on an existing
  // key, for the byte-compatibility reason stated throughout this file: a
  // boss-mode fight writes not one of them, so every parameters.txt written
  // before survival mode existed round-trips unchanged.
  //
  // None of these patterns can collide with the `waveN`/`waveBuffN`/
  // `waveTrapN`/`wavePickupN` family below — those are anchored on `wave`, and
  // `survivalwaves` is not `wave<digits>` — but they are tested first anyway,
  // which is the habit that keeps the next one safe.

  /** The fight's survival options, created on first mention. */
  const survivalOf = (): SurvivalOptions => {
    if (fight.survival === undefined) fight.survival = defaultSurvivalOptions()
    return fight.survival
  }

  if (suffix === 'mode') {
    const text = value.trim().toLowerCase()
    if (!(ARENA_MODES as readonly string[]).includes(text)) {
      unknownKeys.push(`${key} value "${value.trim()}"`)
      return true
    }
    fight.mode = text as ArenaMode
    // A survival fight always has options, even if the file describes none.
    if (fight.mode === 'survival') survivalOf()
    return true
  }

  // survival=<seconds>,<countdown> — the round length and how it is announced.
  // Per-field NaN guard, like bossCover and bossSpawn: a malformed field is
  // reported and only that field keeps its default.
  if (suffix === 'survival') {
    const survival = survivalOf()
    const parts = value.split(',').map((p) => p.trim())

    if (parts[0] !== undefined && parts[0] !== '') {
      const seconds = parseInt(parts[0], 10)
      if (Number.isNaN(seconds)) unknownKeys.push(`${key} seconds "${parts[0]}"`)
      else survival.seconds = seconds
    }
    if (parts[1] !== undefined && parts[1] !== '') {
      const style = parts[1].toLowerCase()
      if (!(SURVIVAL_COUNTDOWN_STYLES as readonly string[]).includes(style)) {
        unknownKeys.push(`${key} countdown "${parts[1]}"`)
      } else {
        survival.countdown = style as SurvivalCountdown
      }
    }
    return true
  }

  // survivalWaves=<monster>:<count>:<atSeconds>:<intervalMs>|…
  if (suffix === 'survivalwaves') {
    const survival = survivalOf()
    const rows: SurvivalWave[] = []

    for (const segment of value.split('|')) {
      const trimmed = segment.trim()
      if (trimmed === '') continue
      const parts = trimmed.split(':').map((p) => p.trim())
      const monster = parts[0] ?? ''

      if (!isKnownMonsterKey(monster)) {
        unknownKeys.push(`${key} monster "${monster}"`)
        continue
      }
      const count = parts[1] === undefined || parts[1] === '' ? 1 : parseInt(parts[1], 10)
      if (Number.isNaN(count)) {
        unknownKeys.push(`${key} count "${parts[1]}"`)
        continue
      }
      // A row with no timestamp starts at the beginning — the friendliest
      // reading of a hand-written line.
      const atSeconds = parts[2] === undefined || parts[2] === '' ? 0 : parseInt(parts[2], 10)
      if (Number.isNaN(atSeconds)) {
        unknownKeys.push(`${key} at "${parts[2]}"`)
        continue
      }
      const intervalMs =
        parts[3] === undefined || parts[3] === '' ? DEFAULT_SURVIVAL_INTERVAL_MS : parseInt(parts[3], 10)
      if (Number.isNaN(intervalMs)) {
        unknownKeys.push(`${key} interval "${parts[3]}"`)
        continue
      }

      rows.push({ monster, count, atSeconds, intervalMs })
    }

    survival.waves = rows
    return true
  }

  // survivalBuffs=<id>:<target>:<startSeconds>:<endSeconds>|…
  if (suffix === 'survivalbuffs') {
    const survival = survivalOf()
    const rows: SurvivalBuff[] = []

    for (const segment of value.split('|')) {
      const trimmed = segment.trim()
      if (trimmed === '') continue
      const parts = trimmed.split(':').map((p) => p.trim())
      const id = parts[0] ?? ''

      if (buffById(id) === undefined) {
        unknownKeys.push(`${key} buff "${id}"`)
        continue
      }
      // An omitted target reads as `players`, matching the per-floor buffN key.
      const targetText = parts[1] === undefined || parts[1] === '' ? 'players' : parts[1].toLowerCase()
      if (!(BUFF_TARGETS as readonly string[]).includes(targetText)) {
        unknownKeys.push(`${key} target "${parts[1]}"`)
        continue
      }
      const startSeconds = parts[2] === undefined || parts[2] === '' ? 0 : parseInt(parts[2], 10)
      if (Number.isNaN(startSeconds)) {
        unknownKeys.push(`${key} start "${parts[2]}"`)
        continue
      }
      const endSeconds = parts[3] === undefined || parts[3] === '' ? SURVIVAL_SECONDS_MAX : parseInt(parts[3], 10)
      if (Number.isNaN(endSeconds)) {
        unknownKeys.push(`${key} end "${parts[3]}"`)
        continue
      }

      rows.push({ buff: id, target: targetText as BuffTarget, startSeconds, endSeconds })
    }

    survival.buffs = rows
    return true
  }

  // survivalPickups=<item>:<count>:<atSeconds>|…
  if (suffix === 'survivalpickups') {
    const survival = survivalOf()
    const rows: SurvivalPickup[] = []

    for (const segment of value.split('|')) {
      const trimmed = segment.trim()
      if (trimmed === '') continue
      const parts = trimmed.split(':').map((p) => p.trim())
      const id = parts[0] ?? ''

      if (pickupById(id) === undefined) {
        unknownKeys.push(`${key} item "${id}"`)
        continue
      }
      const count = parts[1] === undefined || parts[1] === '' ? 1 : parseInt(parts[1], 10)
      if (Number.isNaN(count)) {
        unknownKeys.push(`${key} count "${parts[1]}"`)
        continue
      }
      const atSeconds = parts[2] === undefined || parts[2] === '' ? 0 : parseInt(parts[2], 10)
      if (Number.isNaN(atSeconds)) {
        unknownKeys.push(`${key} at "${parts[2]}"`)
        continue
      }

      rows.push({ item: id, count, atSeconds })
    }

    survival.pickups = rows
    return true
  }

  // survivalTraps=<projectile>:<dir>:<spread>:<rate>:<count>:<start>:<end>|…
  if (suffix === 'survivaltraps') {
    survivalOf().traps = parseSurvivalTrapRows(key, value, unknownKeys)
    return true
  }

  if (suffix === 'invuln') {
    // `off` (or a bare 0) turns the feature off and leaves the window lengths
    // alone, so toggling it in a file and back does not lose the numbers. One
    // value sets all three thresholds; three set them individually. Same
    // per-field NaN guard as bossCover: a malformed segment is reported and
    // only that field keeps its default.
    if (value.toLowerCase() === 'off') {
      arena.invulnerability.enabled = false
      return true
    }
    arena.invulnerability.enabled = true
    const parts = value.split(',').map((s) => s.trim()).filter((s) => s !== '')
    const seconds = [...arena.invulnerability.seconds]
    for (let i = 0; i < BOSS_INVULN_COUNT; i++) {
      // one value means "same for every threshold"
      const raw = parts.length === 1 ? parts[0] : parts[i]
      if (raw === undefined) break
      const n = parseInt(raw, 10)
      if (Number.isNaN(n)) unknownKeys.push(`${key} value "${raw}"`)
      else seconds[i] = n
    }
    arena.invulnerability.seconds = seconds
    return true
  }
  if (suffix === 'invulncountdown') {
    arena.invulnerability.countdown = value === '1'
    return true
  }
  if (suffix === 'theme') {
    arena.theme = value
    return true
  }
  if (suffix === 'music') {
    // The sentinel and "unset" are the same state everywhere else in the
    // codebase (`?? MUSIC_DEFAULT`), so parse `default` back to `undefined`
    // rather than the literal string — that is what makes an object whose
    // `arena.music` was genuinely `undefined` (never touched) round-trip to
    // itself once the serializer starts writing an explicit line to CLEAR an
    // inherited base track.
    if (value === MUSIC_DEFAULT) arena.music = undefined
    else if (isKnownMusicId(value)) arena.music = value
    else unknownKeys.push(`${key} value "${value}"`)
    return true
  }
  if (suffix === 'floorpattern') {
    // same guard as bosscover's pattern segment: an unrecognized name is
    // reported and the field keeps its default, rather than casting an
    // arbitrary string into the union
    if (!(BOSS_FLOOR_PATTERNS as readonly string[]).includes(value)) {
      unknownKeys.push(`${key} value "${value}"`)
    } else {
      arena.floorPattern = value as BossFloorPattern
    }
    return true
  }
  if (suffix === 'monstermultiplier' || suffix === 'foodmultiplier') {
    // The arena's own multipliers, kept out of the global monsterMultiplier /
    // foodMultiplier so a hectic arena does not imply a hectic dungeon.
    // Same NaN guard as every other numeric boss key: report and keep the
    // default rather than writing a NaN into the params.
    const n = parseFloat(value)
    if (Number.isNaN(n)) {
      unknownKeys.push(`${key} value "${value}"`)
    } else if (suffix === 'monstermultiplier') {
      arena.monsterMultiplier = n
    } else {
      arena.foodMultiplier = n
    }
    return true
  }
  if (suffix === 'width' || suffix === 'height') {
    const parts = value.split(',').map((s) => parseInt(s.trim(), 10))
    if (parts.length === 2 && !parts.some(Number.isNaN)) {
      if (suffix === 'width') {
        arena.minWidth = parts[0]
        arena.maxWidth = parts[1]
      } else {
        arena.minHeight = parts[0]
        arena.maxHeight = parts[1]
      }
    } else {
      unknownKeys.push(key)
    }
    return true
  }
  if (suffix === 'pool') {
    arena.bossPool = value.split(',').map((s) => s.trim()).filter((s) => s !== '')
    return true
  }
  if (suffix === 'count') {
    // issue #64 part 1. Absent means 1 — see arenaBossCount — so this key is
    // only ever written for a fight that rolls more than one boss.
    const n = parseInt(value.trim(), 10)
    if (Number.isNaN(n)) unknownKeys.push(`${key} value "${value}"`)
    else arena.bossCount = n
    return true
  }
  if (suffix === 'bodyguardvariants') {
    // issue #64 part 2. Absent means on — see arenaUsesBodyguards — so this
    // key is only ever written for a fight that switches the twins off.
    // `true` leaves the field absent rather than writing it explicitly, which
    // is what keeps a file round-tripping to the same (undefined) shape.
    const text = value.trim().toLowerCase()
    if (text === 'true') {
      // absent already means on; nothing to set
    } else if (text === 'false') {
      arena.bodyguardVariants = false
    } else {
      unknownKeys.push(`${key} value "${value}"`)
    }
    return true
  }
  // Selection mode and lineup (issue #64 follow-up: exact lineups), on their
  // own keys for the same byte-compatibility reason survival's keys are — a
  // fight that never touches lineup mode writes not one of them.
  if (suffix === 'selection') {
    const text = value.trim().toLowerCase()
    if (!(BOSS_SELECTIONS as readonly string[]).includes(text)) {
      unknownKeys.push(`${key} value "${value}"`)
    } else {
      arena.bossSelection = text as BossSelection
    }
    return true
  }
  if (suffix === 'lineup') {
    arena.bossLineup = parseLineupLine(key, value, unknownKeys)
    return true
  }
  if (suffix === 'cover') {
    // mirrors width/height's NaN guard, but per-field rather than per-line: a
    // malformed segment is reported and its own field keeps its default instead
    // of the whole line being dropped or an arbitrary string being cast into
    // the pattern union.
    const parts = value.split(',').map((s) => s.trim())
    const pattern = parts[0]
    if (!(BOSS_COVER_PATTERNS as readonly string[]).includes(pattern)) {
      unknownKeys.push(`${key} value "${pattern}"`)
    } else {
      arena.cover.pattern = pattern as BossArenaOptions['cover']['pattern']
    }
    if (parts.length >= 2) {
      const density = parseFloat(parts[1])
      if (Number.isNaN(density)) unknownKeys.push(`${key} value "${parts[1]}"`)
      else arena.cover.density = density
    }
    if (parts.length >= 3) {
      const ringSpacing = parseInt(parts[2], 10)
      if (Number.isNaN(ringSpacing)) unknownKeys.push(`${key} value "${parts[2]}"`)
      else arena.cover.ringSpacing = ringSpacing
    }
    if (parts.length >= 4) {
      const clusters = parseInt(parts[3], 10)
      if (Number.isNaN(clusters)) unknownKeys.push(`${key} value "${parts[3]}"`)
      else arena.cover.clusters = clusters
    }
    return true
  }
  if (suffix === 'checkpoints') {
    // boss<f>Checkpoints=<respawnPlayers preset>,<saveGame preset> — mirrors
    // bosscover's per-field unknown-value guard: a bad preset id is reported
    // and that field keeps its default rather than being cast into the
    // union. A file written before the two presets split apart carried a
    // third 0/1 field; it simply fails this same preset check and is
    // reported, leaving saveGame at its default.
    const parts = value.split(',').map((s) => s.trim())
    const respawnPreset = parts[0]
    if (!(respawnPreset in BOSS_CHECKPOINT_PRESETS)) {
      unknownKeys.push(`${key} value "${respawnPreset}"`)
    } else {
      arena.checkpoints.respawnPlayers = respawnPreset as BossCheckpointPreset
    }
    if (parts.length >= 2) {
      const savePreset = parts[1]
      if (!(savePreset in BOSS_CHECKPOINT_PRESETS)) {
        unknownKeys.push(`${key} value "${savePreset}"`)
      } else {
        arena.checkpoints.saveGame = savePreset as BossCheckpointPreset
      }
    }
    return true
  }
  if (suffix === 'spawn') {
    // same per-field NaN guard as cover above — a malformed segment is
    // reported and only that field keeps its default
    const parts = value.split(',').map((s) => s.trim())
    // Appending to the tail keeps every file written before batching valid:
    // a three-field line simply leaves batchSize/batchIntervalMs at their
    // defaults (invariant #5 — the old format keeps working).
    const fields = ['spacing', 'ringSpacing', 'clusters', 'batchSize', 'batchIntervalMs'] as const
    for (let f = 0; f < fields.length; f++) {
      if (parts.length <= f) break
      const n = parseInt(parts[f], 10)
      if (Number.isNaN(n)) unknownKeys.push(`${key} value "${parts[f]}"`)
      else arena.spawn[fields[f]] = n
    }
    return true
  }

  // wavePickupN=<item>:<count>|<item>:<count> — one line per tier that drops
  // items, written only for those tiers. Absent means the tier drops none, so a
  // file written before pickups existed parses exactly as it always did. Must
  // be tested BEFORE the waveN branch, for the same anchored-pattern reason as
  // waveBuffN below.
  const wavePickupMatch = suffix.match(/^wavepickup(\d+)$/)
  if (wavePickupMatch) {
    const idx = parseInt(wavePickupMatch[1], 10) - 1
    if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    arena.waves[idx].pickups = parsePickupRows(key, value, unknownKeys)
    state.sawPickupLine.add(idx)
    return true
  }

  // waveTrapN=<projectile>:<direction>:<spread>:<rate>:<count>|… — one line per
  // tier that runs wall traps, written only for those tiers. Absent means the
  // tier carries none, so a file written before traps existed parses exactly as
  // it always did. Tested BEFORE the waveN branch for the same anchored-pattern
  // reason as wavePickupN above.
  const waveTrapMatch = suffix.match(/^wavetrap(\d+)$/)
  if (waveTrapMatch) {
    const idx = parseInt(waveTrapMatch[1], 10) - 1
    if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    arena.waves[idx].traps = parseTrapRows(key, value, unknownKeys)
    state.sawTrapLine.add(idx)
    return true
  }

  // waveBuffN=<id>:<target>|<id>:<target> — one line per tier carrying arena
  // buffs, written only for those tiers, in the same form as the per-floor
  // `buffN` key. A file written when a tier could only hold one buff has a
  // single segment and parses to a one-entry list. Must be tested BEFORE the
  // waveN branch: `wavebuff1` would otherwise never match anything, since that
  // branch's pattern is anchored and would simply fall through to unknownKeys.
  const waveBuffMatch = suffix.match(/^wavebuff(\d+)$/)
  if (waveBuffMatch) {
    const idx = parseInt(waveBuffMatch[1], 10) - 1
    if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    const entries: FloorBuff[] = []

    for (const segment of value.split('|')) {
      const trimmed = segment.trim()
      if (trimmed === '') continue
      const colon = trimmed.indexOf(':')
      const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
      const target = (colon === -1 ? 'players' : trimmed.slice(colon + 1).trim()) as BuffTarget

      if (buffById(id) === undefined) {
        unknownKeys.push(`${key} buff "${id}"`)
        continue
      }
      if (!BUFF_TARGETS.includes(target)) {
        unknownKeys.push(`${key} target "${target}"`)
        continue
      }
      entries.push({ buff: id, target })
    }

    arena.waves[idx].buffs = entries
    state.sawBuffLine.add(idx)
    return true
  }

  const waveMatch = suffix.match(/^wave(\d+)$/)
  if (waveMatch) {
    const idx = parseInt(waveMatch[1], 10) - 1
    if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
      unknownKeys.push(key)
      return true
    }
    // five |-separated fields:
    // monsters|defaultIntervalMs|monsterMax|intervalMs|spawnMode.
    // Everything after the first is optional on parse, so the legacy two-,
    // three- and four-field forms all still work. monsterMax is REBUILT from
    // the parsed monster pool rather than merged onto whatever was there,
    // which is what guarantees its keys always match the pool exactly.
    //
    // A file written before the boss-death tier existed carries wave1..4
    // only; the fifth tier is simply never visited and keeps the empty pool
    // the defaults gave it, which is exactly what that file described.
    state.sawAnyWave = true
    state.sawWaveLine.add(idx)
    if (idx === BOSS_DEATH_WAVE) state.sawDeathWave = true
    const parts = value.split('|')
    const monsters = (parts[0] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
    arena.waves[idx].monsters = monsters
    // The line is the whole truth about this wave: the two optional records
    // are cleared before they are re-read, so a file that omits them (or
    // whose entries are all rejected) cannot leave the stock preset's
    // per-monster intervals and spawn modes attached to a pool that no longer
    // contains those monsters.
    delete arena.waves[idx].intervalMs
    delete arena.waves[idx].spawnMode

    if (parts.length >= 2 && parts[1].trim() !== '') {
      const ms = parseInt(parts[1].trim(), 10)
      if (Number.isNaN(ms)) unknownKeys.push(`${key} interval "${parts[1]}"`)
      else arena.waves[idx].defaultIntervalMs = ms
    }

    const parsedMax: Record<string, number> = {}
    if (parts.length >= 3 && parts[2].trim() !== '') {
      for (const entry of parts[2].split(',')) {
        const [id, raw] = entry.split(':').map((s) => s.trim())
        const n = raw === undefined ? NaN : parseInt(raw, 10)
        if (id === '' || Number.isNaN(n)) {
          unknownKeys.push(`${key} monsterMax "${entry}"`)
          continue
        }
        parsedMax[id] = n
      }
    }
    arena.waves[idx].monsterMax = Object.fromEntries(
      monsters.map((id) => [id, parsedMax[id] ?? DEFAULT_WAVE_MONSTER_MAX])
    )

    if (parts.length >= 4 && parts[3].trim() !== '') {
      const overrides: Record<string, number> = {}
      for (const entry of parts[3].split(',')) {
        const [id, raw] = entry.split(':').map((s) => s.trim())
        const n = raw === undefined ? NaN : parseInt(raw, 10)
        if (id === '' || Number.isNaN(n)) {
          unknownKeys.push(`${key} intervalMs "${entry}"`)
          continue
        }
        overrides[id] = n
      }
      if (Object.keys(overrides).length > 0) arena.waves[idx].intervalMs = overrides
    }

    // spawn modes, keyed like the two fields above. An unknown mode is
    // reported and dropped rather than cast into the union; a key for a
    // monster outside the parsed pool is dropped too, so the record can
    // never disagree with `monsters`.
    if (parts.length >= 5 && parts[4].trim() !== '') {
      const modes: Record<string, BossSpawnMode> = {}
      for (const entry of parts[4].split(',')) {
        const [id, raw] = entry.split(':').map((s) => s.trim())
        if (id === '' || raw === undefined || !monsters.includes(id) || !(BOSS_SPAWN_MODES as readonly string[]).includes(raw)) {
          unknownKeys.push(`${key} spawnMode "${entry}"`)
          continue
        }
        modes[id] = raw as BossSpawnMode
      }
      if (Object.keys(modes).length > 0) arena.waves[idx].spawnMode = modes
    }
    return true
  }

  return false
}

export function parseParametersTxt(content: string, base?: DungeonParameters): ParsedConfig {
  const params: DungeonParameters = base
    ? JSON.parse(JSON.stringify(base))
    : defaultParameters()
  // a base object round-tripped from an older settings file may predate these
  if (params.playerTweaks === undefined) params.playerTweaks = {}
  if (params.lobbies === undefined) params.lobbies = defaultParameters().lobbies
  if (params.boss === undefined) params.boss = defaultParameters().boss
  if (params.lobbySaves === undefined) params.lobbySaves = defaultParameters().lobbySaves
  const result: ParsedConfig = { params, unknownKeys: [] }
  // `lockFloors=` indices, or undefined when the file has no such line.
  // Resolved after the whole file is read, since `levels` may come after it.
  let lockFloors: Array<{ index: number; buttons?: number }> | undefined
  // A legacy `lockFinalRoom=` line (the campaign-wide flag issue #69 replaced),
  // or undefined. Needs the finished order and boss floors, so it is resolved
  // at the very end too.
  let legacyLockFinalRoom: boolean | undefined
  /** highest N seen in a `monstersN=` key, or -1 if the file declared no pools */
  let highestPoolIndex = -1
  // Highest `timerN=` seen, same purpose as highestPoolIndex above.
  let highestTimerIndex = -1
  // musicN= lines seen, keyed by floor index — collected separately from
  // `params.floorMusic` so a base object's own per-floor tracks (e.g. the
  // built-in default's) never bleed into an index this file leaves unmentioned.
  // See the highestMusicIndex post-pass below.
  const explicitMusic = new Map<number, string>()
  // Highest `buffN=` seen, same purpose again.
  let highestBuffIndex = -1
  let highestTrapIndex = -1
  // Highest `musicN=` seen, same purpose again.
  let highestMusicIndex = -1
  // Per-fight bookkeeping for the wave post-passes below. Boss keys carry a
  // fight index (`boss0Wave1`), the count may be declared after them, and the
  // keys of one fight say nothing about another — so every fight gets its own
  // state and its own grown-on-demand entry in `params.boss.fights`.
  const fightState = new Map<number, BossFightParseState>()
  /** the keys that named each fight index, so an index past `bossFights` can be reported */
  const fightKeys = new Map<number, string[]>()
  /** the `bossFights=` count, or null when the file never declared one */
  let declaredFightCount: number | null = null

  const fightAt = (index: number, key: string): BossFight => {
    const fights = params.boss.fights ?? (params.boss.fights = [])
    while (fights.length <= index) fights.push(defaultBossFight())
    if (!fightState.has(index)) fightState.set(index, newBossFightParseState())
    const named = fightKeys.get(index)
    if (named === undefined) fightKeys.set(index, [key])
    else named.push(key)
    return fights[index]
  }

  // Lobby bookkeeping, the same shape as the fight bookkeeping above: `lobby<i>`
  // keys carry an index, the count (`lobbies=`) may be declared before or after
  // them, and one lobby's keys say nothing about another.
  /** the keys that named each lobby index, so an index past `lobbies` can be reported */
  const lobbyKeys = new Map<number, string[]>()
  /** the `lobbies=` count, or null when the file never declared one */
  let declaredLobbyCount: number | null = null

  // Mystery buttons (issue #67). A file that mentions the pool at all states
  // the WHOLE pool: the first `mysteryButtons=` / `mysteryButton<i>…` key
  // clears whatever the base carried, so a base's stale buttons can never
  // survive into indices this file leaves unmentioned. Floors likewise: any
  // `mysteryFloorN=` line rebuilds `levelMystery` from scratch (the musicN
  // rule).
  let mysteryPoolSeen = false
  /** the `mysteryButtons=` count, or null when the file never declared one */
  let declaredMysteryCount: number | null = null
  /** the keys that named each pool index, so an index past the count can be reported */
  const mysteryKeys = new Map<number, string[]>()
  const explicitMystery = new Map<number, FloorMystery>()
  // Enhanced lock buttons (built on the mystery pool above). Either
  // `mysteryLockN=` or `mysteryLockDisguiseN=` on a floor is enough to declare
  // it — same "any line rebuilds the whole array" rule as explicitMystery.
  const explicitLockMystery = new Map<number, FloorLockMystery>()
  const lockMysteryAt = (index: number): FloorLockMystery => {
    let entry = explicitLockMystery.get(index)
    if (entry === undefined) {
      entry = defaultFloorLockMystery()
      explicitLockMystery.set(index, entry)
    }
    return entry
  }
  const claimMysteryPool = (): MysteryButton[] => {
    if (!mysteryPoolSeen) {
      params.mysteryButtons = []
      mysteryPoolSeen = true
    }
    return params.mysteryButtons ?? (params.mysteryButtons = [])
  }
  const mysteryAt = (index: number, key: string): MysteryButton => {
    const pool = claimMysteryPool()
    while (pool.length <= index) pool.push(emptyMysteryButton())
    const named = mysteryKeys.get(index)
    if (named === undefined) mysteryKeys.set(index, [key])
    else named.push(key)
    return pool[index]
  }

  const lobbyAt = (index: number, key: string): LobbyOptions => {
    while (params.lobbies.length <= index) params.lobbies.push(defaultLobby(DEFAULT_LOBBY_PRESET_ID))
    const named = lobbyKeys.get(index)
    if (named === undefined) lobbyKeys.set(index, [key])
    else named.push(key)
    return params.lobbies[index]
  }

  const intKeys: Record<string, (v: number) => void> = {
    levels: (v) => (params.levels = v),
    minroomsize: (v) => (params.minRoomSize = v),
    maxroomsize: (v) => (params.maxRoomSize = v),
    minpassagewidth: (v) => (params.minPassageWidth = v),
    maxpassagewidth: (v) => (params.maxPassageWidth = v),
    minroomcount: (v) => (params.minRoomCount = v),
    maxroomcount: (v) => (params.maxRoomCount = v),
    mapwidth: (v) => (params.mapWidth = v),
    mapheight: (v) => (params.mapHeight = v),
    edgepadding: (v) => (params.edgePadding = v),
    roompadding: (v) => (params.roomPadding = v)
  }

  const floatKeys: Record<string, (v: number) => void> = {
    monstermultiplier: (v) => (params.monsterMultiplier = v),
    goldmultiplier: (v) => (params.goldMultiplier = v),
    foodmultiplier: (v) => (params.foodMultiplier = v),
    shopchance: (v) => (params.shopChance = v),
    vaultchance: (v) => (params.vaultChance = v),
    lockchance: (v) => (params.lockChance = v),
    keychance: (v) => (params.keyChance = v)
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const parts = line.split('=')
    if (parts.length !== 2) continue

    const key = parts[0].trim()
    const keyLower = key.toLowerCase()
    const value = parts[1].trim()

    if (keyLower === 'path') {
      result.path = value
      continue
    }
    if (keyLower === 'cleanupfiles') {
      result.cleanupFiles = value === '1'
      continue
    }
    if (keyLower === 'lockfinalroom') {
      legacyLockFinalRoom = value === '1'
      continue
    }
    if (keyLower === 'lockfloors') {
      lockFloors = []
      for (const token of value.split(',').map((t) => t.trim()).filter((t) => t !== '')) {
        // `6` is floor 6 with one button, `6:3` with three (issue #69 part 2)
        const m = /^(\d+)(?::(\d+))?$/.exec(token)
        if (m === null) {
          result.unknownKeys.push(`${key} floor "${token}"`)
          continue
        }
        const entry: { index: number; buttons?: number } = { index: parseInt(m[1], 10) }
        if (m[2] !== undefined) entry.buttons = parseInt(m[2], 10)
        lockFloors.push(entry)
      }
      continue
    }
    if (keyLower === 'themes') {
      params.themes = value.split(',').map((t) => t.trim())
      continue
    }
    if (keyLower === 'lobbysaves') {
      // absent keeps the default (on) — parseParametersTxt starts from
      // defaultParameters(); only an explicit `lobbySaves=0` turns it off
      params.lobbySaves = value === '1'
      continue
    }

    // `lobbies=<n>` — how many lobby slots the campaign has. The old singular
    // `lobby`/`lobbyGold`/`lobbyShops`/`lobbyUpgrades` keys (one lobby,
    // always prepended) are a HARD BREAK from issue #48: they are not aliased
    // to lobby 0, so a file written before the feature exists still imports
    // (invariant #5) but reports them as unknown rather than silently
    // resurrecting the old single-lobby shape.
    if (keyLower === 'lobbies') {
      const n = parseInt(value, 10)
      if (Number.isNaN(n) || n < 0) result.unknownKeys.push(`${key} value "${value}"`)
      else declaredLobbyCount = n
      continue
    }

    // Every other lobby key is `lobby<i><suffix>` — the index sits directly
    // after `lobby`, mirroring the `boss<i><suffix>` dispatcher below. The
    // `\d+` is what makes this a hard break rather than an alias: a bare
    // `lobbyGold` has no digit here and falls through to the catch-all
    // unknownKeys push at the end of the loop, exactly like `boss0Gold` now
    // does.
    const lobbyMatch = keyLower.match(/^lobby(\d+)(.+)$/)
    if (lobbyMatch) {
      const index = parseInt(lobbyMatch[1], 10)
      const suffix = lobbyMatch[2]
      const lobby = lobbyAt(index, key)

      if (suffix === 'preset') {
        if (LOBBY_PRESETS.some((preset) => preset.id === value)) lobby.preset = value
        else result.unknownKeys.push(`${key} value "${value}"`)
        continue
      }
      if (suffix === 'gold') {
        const n = parseInt(value, 10)
        if (Number.isNaN(n)) result.unknownKeys.push(key)
        else lobby.startingGold = n
        continue
      }
      if (suffix === 'upgrades') {
        lobby.upgrades = parseUpgradeCounts(key, value, result.unknownKeys)
        continue
      }
      if (suffix === 'shops') {
        // space separated to mirror the `cats` string it becomes. Unknown
        // column ids are reported rather than dropped silently, but never throw.
        const wanted = value.split(/\s+/).filter((c) => c !== '')
        lobby.shopCategories = wanted.filter(isLobbyCategory)
        for (const bad of wanted.filter((c) => !isLobbyCategory(c))) {
          result.unknownKeys.push(`${key} value "${bad}"`)
        }
        continue
      }
      if (suffix === 'music') {
        // Same "default parses back to undefined" rule as the arena's music
        // key — see its comment.
        if (value === MUSIC_DEFAULT) lobby.music = undefined
        else if (isKnownMusicId(value)) lobby.music = value
        else result.unknownKeys.push(`${key} value "${value}"`)
        continue
      }

      // an unrecognized lobby<i> suffix
      result.unknownKeys.push(key)
      continue
    }

    if (keyLower === 'levelorder') {
      // `1,2,B1,3` — floors by their 1-based number, boss fights as B<n>. A
      // malformed token is reported and dropped; the order is repaired against
      // the campaign's real shape in the post-pass below, so a stale or partial
      // line is never fatal (invariant #5).
      const slots: CampaignSlot[] = []
      for (const token of value.split(',')) {
        const trimmed = token.trim()
        if (trimmed === '') continue
        const slot = parseSlotLabel(trimmed)
        if (slot === null) result.unknownKeys.push(`${key} value "${trimmed}"`)
        else slots.push(slot)
      }
      params.levelOrder = slots
      continue
    }

    if (keyLower === 'boss') {
      params.boss.enabled = value === '1'
      continue
    }
    if (keyLower === 'bossfights') {
      const n = parseInt(value, 10)
      if (Number.isNaN(n) || n < 0) result.unknownKeys.push(`${key} value "${value}"`)
      else declaredFightCount = n
      continue
    }

    // Every other boss key is `boss<i><suffix>` — the fight index sits directly
    // after `boss`, so `boss0Theme` and `boss2Wave1` name different fights of
    // the same campaign. The index is captured greedily and the suffix is what
    // is left, which is why `boss0wave1` splits as (0, "wave1") and never as
    // (0, "wave") plus a stray digit.
    //
    // An unprefixed key (`bossTheme`, `bossWave1`) is read as fight 0. Nothing
    // writes that form any more — the serializer always emits the index — but
    // reading it keeps every parameters.txt written before multiple fights
    // existed importing exactly as it did, per invariant #5.
    // bossFloorN… — the per-floor boss (issue #61).
    //
    // MUST be tested before the `boss(\d*)` fight dispatcher below. That one's
    // index is `\d*`, so it matches the empty string, and `bossfloor1` would
    // otherwise split as fight 0 with the suffix "floor1" and be swallowed.
    const bossFloorMatch = keyLower.match(/^bossfloor(\d+)(.*)$/)
    if (bossFloorMatch) {
      const levelIndex = parseInt(bossFloorMatch[1], 10)
      const suffix = bossFloorMatch[2]
      const levelBoss = params.levelBoss ?? (params.levelBoss = [])
      while (levelBoss.length <= levelIndex) levelBoss.push(defaultDungeonBoss())
      if (parseFloorBossKey(suffix, key, value, levelBoss[levelIndex], result.unknownKeys)) {
        continue
      }
      // fell through to the catch-all, which reports it — never fatal.
    }
    const bossMatch = keyLower.match(/^boss(\d*)(.+)$/)
    if (bossMatch) {
      const suffix = bossMatch[2]
      const index = bossMatch[1] === '' ? 0 : parseInt(bossMatch[1], 10)
      if (parseBossFightKey(suffix, key, value, fightAt(index, key), fightState.get(index)!, result.unknownKeys)) {
        continue
      }
      // fell through: a `boss…` key this parser does not know. Reported by the
      // catch-all below, exactly as before.
    }
    // buffN=<id>:<target>|<id>:<target> — one line per floor that carries at
    // least one buff aura. Absent floors keep the default (none), so a file
    // written before buffs existed parses exactly as it always did. Split on
    // the FIRST colon only: buff ids are lowercase-and-underscore today, but
    // splitting greedily would silently mangle any that ever gains one.
    const buffMatch = keyLower.match(/^buff(\d+)$/)
    if (buffMatch) {
      const levelIndex = parseInt(buffMatch[1], 10)
      const levelBuffs = params.levelBuffs ?? (params.levelBuffs = [])
      while (levelBuffs.length <= levelIndex) levelBuffs.push(defaultFloorBuffs())
      const entries: FloorBuff[] = []

      for (const segment of value.split('|')) {
        const trimmed = segment.trim()
        if (trimmed === '') continue
        const colon = trimmed.indexOf(':')
        const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
        // An omitted target is the common case by hand, and players is the
        // conservative reading of "buff this floor".
        const target = (colon === -1 ? 'players' : trimmed.slice(colon + 1).trim()) as BuffTarget

        if (buffById(id) === undefined) {
          result.unknownKeys.push(`${key} buff "${id}"`)
          continue
        }
        if (!BUFF_TARGETS.includes(target)) {
          result.unknownKeys.push(`${key} target "${target}"`)
          continue
        }
        entries.push({ buff: id, target })
      }

      levelBuffs[levelIndex] = entries
      highestBuffIndex = Math.max(highestBuffIndex, levelIndex)
      continue
    }
    // trapN=<projectile>:<direction>:<spread>:<rate>:<count>|… — one line per
    // floor that runs wall traps. Absent floors keep the default (none), so a
    // file written before floor traps existed parses exactly as it always did.
    // Anchored and disjoint from every other floor key, and `boss0WaveTrap1`
    // never reaches here — the `boss…` dispatcher above consumes it.
    const trapMatch = keyLower.match(/^trap(\d+)$/)
    if (trapMatch) {
      const levelIndex = parseInt(trapMatch[1], 10)
      const levelTraps = params.levelTraps ?? (params.levelTraps = [])
      while (levelTraps.length <= levelIndex) levelTraps.push(defaultFloorTraps())
      levelTraps[levelIndex] = parseTrapRows(key, value, result.unknownKeys)
      highestTrapIndex = Math.max(highestTrapIndex, levelIndex)
      continue
    }

    // Mystery buttons (issue #67): the pool count, then one key per button
    // field, then one line per armed floor. All three are anchored on a
    // `mystery` prefix no other key shares.
    if (keyLower === 'mysterybuttons') {
      const count = parseInt(value, 10)
      if (Number.isNaN(count) || count < 0 || count >= MYSTERY_PARSE_LIMIT) result.unknownKeys.push(`${key} "${value}"`)
      else {
        claimMysteryPool()
        declaredMysteryCount = count
      }
      continue
    }
    const mysteryButtonMatch = keyLower.match(/^mysterybutton(\d+)(.+)$/)
    if (mysteryButtonMatch) {
      const index = parseInt(mysteryButtonMatch[1], 10)
      const field = mysteryButtonMatch[2]
      // mysteryAt pads the pool out to `index` — see MYSTERY_PARSE_LIMIT.
      if (index >= MYSTERY_PARSE_LIMIT) result.unknownKeys.push(key)
      else if (field === 'name') mysteryAt(index, key).name = value
      else if (field === 'text') mysteryAt(index, key).text = value
      else if (field === 'loot') mysteryAt(index, key).loot = parsePickupRows(key, value, result.unknownKeys, mysteryLootById)
      else if (field === 'monsters') mysteryAt(index, key).monsters = parseMonsterCountRows(key, value, result.unknownKeys)
      else if (field === 'traps') mysteryAt(index, key).traps = parseTrapRows(key, value, result.unknownKeys)
      else if (field === 'trapseconds') {
        const seconds = parseInt(value, 10)
        if (Number.isNaN(seconds)) result.unknownKeys.push(`${key} "${value}"`)
        else mysteryAt(index, key).trapSeconds = seconds
      } else result.unknownKeys.push(key)
      continue
    }
    // mysteryFloorN=<count>:<pool index>,<pool index>,… — 0-based indices,
    // repeated to weight.
    const mysteryFloorMatch = keyLower.match(/^mysteryfloor(\d+)$/)
    if (mysteryFloorMatch) {
      const levelIndex = parseInt(mysteryFloorMatch[1], 10)
      const parsed = parsePoolLine(key, value, result.unknownKeys)
      if (parsed !== null) explicitMystery.set(levelIndex, parsed)
      continue
    }
    // Enhanced lock buttons: mysteryLockN=<count>:<pool index>,… (the same
    // grammar as mysteryFloorN, reusing its parser) and
    // mysteryLockDisguiseN=1, the per-floor "disguise as mystery plates"
    // tickbox. Both anchored on `mysterylock`, a prefix neither
    // `mysterybutton(\d+)(.+)` nor `mysteryfloor(\d+)` above can match, so
    // order between the three mystery dispatchers does not matter. The
    // disguise check is tried first only so a floor that sets nothing but the
    // disguise still gets a bookkeeping entry without the count regex ever
    // seeing it.
    const mysteryLockDisguiseMatch = keyLower.match(/^mysterylockdisguise(\d+)$/)
    if (mysteryLockDisguiseMatch) {
      const levelIndex = parseInt(mysteryLockDisguiseMatch[1], 10)
      lockMysteryAt(levelIndex).disguise = value === '1'
      continue
    }
    const mysteryLockMatch = keyLower.match(/^mysterylock(\d+)$/)
    if (mysteryLockMatch) {
      const levelIndex = parseInt(mysteryLockMatch[1], 10)
      const parsed = parsePoolLine(key, value, result.unknownKeys)
      if (parsed !== null) {
        const entry = lockMysteryAt(levelIndex)
        entry.count = parsed.count
        entry.pool = parsed.pool
      }
      continue
    }

    // timerN=enabled|seconds|damage|freqMs|countdown — one line per floor whose
    // timer is on. Absent floors keep the default (off), so a file written
    // before timer mode existed parses exactly as it always did. Per-field NaN
    // guards, house style: a malformed segment is reported and only that field
    // keeps its default.
    const timerMatch = keyLower.match(/^timer(\d+)$/)
    if (timerMatch) {
      const levelIndex = parseInt(timerMatch[1], 10)
      const timers = params.levelTimers ?? (params.levelTimers = [])
      while (timers.length <= levelIndex) timers.push(defaultFloorTimer())
      const timer = timers[levelIndex]
      const fields = value.split('|').map((f) => f.trim())

      timer.enabled = fields[0] === '1'
      const numeric: Array<[number, string, (n: number) => void]> = [
        [1, 'seconds', (n) => (timer.seconds = n)],
        [2, 'damage', (n) => (timer.damage = n)],
        [3, 'freqMs', (n) => (timer.freqMs = n)]
      ]
      for (const [index, name, assign] of numeric) {
        if (fields[index] === undefined || fields[index] === '') continue
        const n = parseInt(fields[index], 10)
        if (Number.isNaN(n)) result.unknownKeys.push(`${key} ${name} "${fields[index]}"`)
        else assign(n)
      }
      if (fields[4] !== undefined && fields[4] !== '') timer.countdown = fields[4] === '1'

      highestTimerIndex = Math.max(highestTimerIndex, levelIndex)
      continue
    }

    // musicN=<track id> — one line per floor that swaps its music. Absent
    // floors keep the default (unset, no PlayMusic node), so a file written
    // before music existed parses exactly as it always did.
    const musicMatch = keyLower.match(/^music(\d+)$/)
    if (musicMatch) {
      const levelIndex = parseInt(musicMatch[1], 10)
      if (isKnownMusicId(value)) explicitMusic.set(levelIndex, value)
      else result.unknownKeys.push(`${key} value "${value}"`)
      highestMusicIndex = Math.max(highestMusicIndex, levelIndex)
      continue
    }

    const monstersMatch = keyLower.match(/^monsters(\d+)$/)
    if (monstersMatch) {
      const levelIndex = parseInt(monstersMatch[1], 10)
      while (params.levelMonsters.length <= levelIndex) {
        params.levelMonsters.push([])
      }
      params.levelMonsters[levelIndex] = value.split(',').map((m) => m.trim())
      highestPoolIndex = Math.max(highestPoolIndex, levelIndex)
      continue
    }

    if (keyLower.startsWith('player.')) {
      const tweak = parseTweakValue(keyLower, value)
      if (tweak === undefined) {
        result.unknownKeys.push(key)
      } else if (tweak === 'stock') {
        // An explicit stock value is how the serializer clears an override the
        // base object inherited (e.g. castle's stock `player.shared.remove.life`)
        // — without this, a file naming the key back at stock would silently
        // leave the base's non-stock value in place rather than removing it.
        delete params.playerTweaks[keyLower]
      } else {
        params.playerTweaks[keyLower] = tweak
      }
      continue
    }

    const monsterId = configKeyToMonsterId.get(keyLower)
    if (monsterId !== undefined) {
      const n = parseInt(value, 10)
      if (!Number.isNaN(n)) params.monsterMax[monsterId] = n
      continue
    }

    if (intKeys[keyLower]) {
      const n = parseInt(value, 10)
      if (!Number.isNaN(n)) intKeys[keyLower](n)
      continue
    }

    if (floatKeys[keyLower]) {
      const n = parseFloat(value)
      if (!Number.isNaN(n)) floatKeys[keyLower](n)
      continue
    }

    result.unknownKeys.push(key)
  }

  // A file that declares any pool declares all of them: drop whatever the base
  // defaults had beyond its last `monstersN=`. Without this, importing a short
  // campaign leaves the tail of the longer default campaign attached — invisible
  // while `levels` stays short, then silently appended if the user raises it.
  if (highestPoolIndex >= 0) {
    params.levelMonsters.length = highestPoolIndex + 1
  }

  // Only floors carrying a buff get a `buffN=` line, so the same padding rule
  // as the timers below applies: pad to the floor count, trim to it, and leave
  // the array absent entirely when neither the file nor the base mentioned one.
  if (highestBuffIndex >= 0 || params.levelBuffs !== undefined) {
    const levelBuffs = params.levelBuffs ?? (params.levelBuffs = [])
    while (levelBuffs.length < params.levels) levelBuffs.push(defaultFloorBuffs())
    levelBuffs.length = params.levels
  }

  // Only floors running traps get a `trapN=` line — same padding rule as the
  // buffs above.
  if (highestTrapIndex >= 0 || params.levelTraps !== undefined) {
    const levelTraps = params.levelTraps ?? (params.levelTraps = [])
    while (levelTraps.length < params.levels) levelTraps.push(defaultFloorTraps())
    levelTraps.length = params.levels
  }

  // Mystery buttons. A declared count is the whole truth about the pool's
  // size: trim (reporting the keys of any button it drops) or pad with empty
  // buttons. Floor lines rebuild `levelMystery` from scratch, then every floor
  // pool index is checked against the final pool — a dangling index is
  // reported and dropped rather than left to fail validation on a file the
  // user never hand-edited. Both fields end absent when they carry nothing.
  if (declaredMysteryCount !== null) {
    const pool = claimMysteryPool()
    for (const [index, keys] of [...mysteryKeys].sort((a, b) => a[0] - b[0])) {
      if (index >= declaredMysteryCount) result.unknownKeys.push(...keys)
    }
    while (pool.length < declaredMysteryCount) pool.push(emptyMysteryButton())
    pool.length = declaredMysteryCount
  }
  if (explicitMystery.size > 0) {
    const floors: FloorMystery[] = []
    for (let i = 0; i < params.levels; i++) floors.push(explicitMystery.get(i) ?? defaultFloorMystery())
    for (const index of [...explicitMystery.keys()].sort((a, b) => a - b)) {
      if (index >= params.levels) result.unknownKeys.push(`mysteryFloor${index}`)
    }
    params.levelMystery = floors
  } else if (params.levelMystery !== undefined) {
    while (params.levelMystery.length < params.levels) params.levelMystery.push(defaultFloorMystery())
    params.levelMystery.length = params.levels
  }
  if (params.levelMystery !== undefined) {
    const poolSize = params.mysteryButtons?.length ?? 0
    params.levelMystery.forEach((floor, i) => {
      const dangling = floor.pool.filter((n) => n >= poolSize)
      if (dangling.length === 0) return
      for (const n of dangling) result.unknownKeys.push(`mysteryFloor${i} button "${n}"`)
      floor.pool = floor.pool.filter((n) => n < poolSize)
    })
    if (params.levelMystery.every((f) => f.count === 0 && f.pool.length === 0)) delete params.levelMystery
  }

  // Enhanced lock buttons. Same shape as levelMystery just above: any
  // mysteryLock*N= line rebuilds the whole array from scratch, then every
  // floor's pool index is checked against the final pool — before the pool
  // itself is possibly cleared below, so poolSize still reflects what this
  // file actually declared.
  if (explicitLockMystery.size > 0) {
    const floors: FloorLockMystery[] = []
    for (let i = 0; i < params.levels; i++) floors.push(explicitLockMystery.get(i) ?? defaultFloorLockMystery())
    for (const index of [...explicitLockMystery.keys()].sort((a, b) => a - b)) {
      if (index >= params.levels) result.unknownKeys.push(`mysteryLock${index}`)
    }
    params.levelLockMystery = floors
  } else if (params.levelLockMystery !== undefined) {
    while (params.levelLockMystery.length < params.levels) params.levelLockMystery.push(defaultFloorLockMystery())
    params.levelLockMystery.length = params.levels
  }
  if (params.levelLockMystery !== undefined) {
    const poolSize = params.mysteryButtons?.length ?? 0
    params.levelLockMystery.forEach((floor, i) => {
      const dangling = floor.pool.filter((n) => n >= poolSize)
      if (dangling.length === 0) return
      for (const n of dangling) result.unknownKeys.push(`mysteryLock${i} button "${n}"`)
      floor.pool = floor.pool.filter((n) => n < poolSize)
    })
    if (params.levelLockMystery.every((f) => f.count === 0 && f.pool.length === 0 && f.disguise !== true)) {
      delete params.levelLockMystery
    }
  }

  if (params.mysteryButtons !== undefined && params.mysteryButtons.length === 0) delete params.mysteryButtons

  // Only enabled floors get a `timerN=` line, so an imported file is sparse by
  // design: pad up to the floor count rather than trimming to the highest key,
  // and leave the array absent entirely when neither the file nor the base
  // mentioned a timer at all.
  if (highestTimerIndex >= 0 || params.levelTimers !== undefined) {
    const timers = params.levelTimers ?? (params.levelTimers = [])
    while (timers.length < params.levels) timers.push(defaultFloorTimer())
    // ...and no further: an inherited array from a longer base campaign would
    // otherwise stay attached, invisible until the user raised `levels`. Same
    // reasoning as the levelMonsters trim above.
    timers.length = params.levels
  }

  // A file with at least one `musicN=` line declares the whole array: rebuild
  // it from scratch rather than mutating the inherited one in place, so a
  // base object's own per-floor tracks (e.g. the built-in default's) never
  // bleed into an index THIS FILE leaves unmentioned but that still falls
  // inside its own declared range. A file with none at all is the legacy
  // case — leave the base's `floorMusic` (if any) entirely untouched, same
  // padding rule as the timers above otherwise.
  if (highestMusicIndex >= 0) {
    params.floorMusic = Array.from(
      { length: params.levels },
      (_, i) => explicitMusic.get(i) ?? MUSIC_DEFAULT
    )
  } else if (params.floorMusic !== undefined) {
    const floorMusic = params.floorMusic
    while (floorMusic.length < params.levels) floorMusic.push(MUSIC_DEFAULT)
    floorMusic.length = params.levels
  }

  // How many fights the campaign ends up with. An explicit `bossFights` wins;
  // otherwise the highest index any key named decides it, so a hand-written
  // file that just writes a `boss1…` block gets two fights without having to
  // say so. Either way at least one, since `enabled` alone means "one fight".
  const grown = params.boss.fights?.length ?? 0
  const wanted = Math.max(1, declaredFightCount ?? grown)
  const fights = params.boss.fights ?? (params.boss.fights = [])
  while (fights.length < wanted) fights.push(defaultBossFight())
  if (fights.length > wanted) {
    // The count is the whole truth about how many fights the file describes, so
    // keys past it are dropped rather than silently adding a fight the dungeon
    // master did not ask for. Reported by key, the same way an off-array
    // `boss0Wave6` is, so the import panel names what was ignored.
    for (let i = wanted; i < fights.length; i++) {
      for (const named of fightKeys.get(i) ?? []) result.unknownKeys.push(named)
    }
    fights.length = wanted
  }

  // How many lobbies the campaign ends up with. An explicit `lobbies=` wins;
  // otherwise whatever `params.lobbies` already held — the base object's own
  // list (defaultParameters()'s two stock lobbies, backfilled above, unless a
  // different base was passed) — grown by any `lobby<i>` key the file named.
  // Unlike fights there is no floor of 1: an explicit `lobbies=0` clears the
  // list entirely.
  if (declaredLobbyCount !== null) {
    while (params.lobbies.length < declaredLobbyCount) params.lobbies.push(defaultLobby(DEFAULT_LOBBY_PRESET_ID))
    if (params.lobbies.length > declaredLobbyCount) {
      // Same reporting shape as the fights trim above: keys past the declared
      // count are dropped rather than silently keeping an extra lobby around,
      // and the import panel names what was ignored.
      for (let i = declaredLobbyCount; i < params.lobbies.length; i++) {
        for (const named of lobbyKeys.get(i) ?? []) result.unknownKeys.push(named)
      }
      params.lobbies.length = declaredLobbyCount
    }
  }

  // The order is only meaningful next to the campaign it describes, and
  // `levels`, `bossFights` and `lobbies` may all be parsed after it, so it is
  // repaired here rather than inline. An order that turns out to be the
  // default one is dropped entirely: absent is the shape that guarantees
  // byte-identical output, and a file saying "1,2,3,B1" should not behave
  // differently from one that says nothing.
  if (params.levelOrder !== undefined) {
    const counts = { levels: params.levels, fights: params.boss.fights?.length ?? 0, lobbies: params.lobbies.length }
    const repaired = normalizeOrder(params.levelOrder, counts)
    params.levelOrder = isDefaultOrder(repaired, counts) ? undefined : repaired
    if (params.levelOrder === undefined) delete params.levelOrder
  }

  // Per-floor locks (issue #69). An explicit `lockFloors=` line is the whole
  // truth; failing that, a legacy `lockFinalRoom=1` locks exactly the floors
  // the old flag sealed — which needs the order and boss floors repaired
  // above — and `lockFinalRoom=0` locks none. A file with neither keeps the
  // base's locks, fitted to the floor count.
  if (lockFloors !== undefined) {
    const locks = Array.from({ length: params.levels }, () => defaultFloorLock())
    for (const { index, buttons } of lockFloors) {
      if (index >= params.levels) {
        result.unknownKeys.push(`lockFloors floor "${index}"`)
        continue
      }
      locks[index].enabled = true
      // absent means 1, so a one-button floor stores no count — the shape
      // defaultParameters() and the form produce
      if (buttons !== undefined && buttons !== 1) locks[index].buttons = buttons
    }
    // No locks at all is stored as absent — the shape a campaign that never
    // locked anything has, so a round trip of one stays equal to it.
    if (locks.some((l) => l.enabled)) params.levelLock = locks
    else delete params.levelLock
  } else if (legacyLockFinalRoom === true) {
    params.levelLock = gatewayLockedFloors(params)
  } else if (legacyLockFinalRoom === false) {
    delete params.levelLock
  } else if (params.levelLock !== undefined) {
    while (params.levelLock.length < params.levels) params.levelLock.push(defaultFloorLock())
    params.levelLock.length = params.levels
  }

  for (const [index, state] of fightState) {
    const arena = fights[index]?.arena
    if (arena === undefined) continue

    // A tier the file described but gave no pickup line drops nothing. The wave
    // branch cannot do this inline the way it clears intervalMs and spawnMode,
    // because the two keys are independent lines and a hand-written file may
    // order them either way. Without this, importing any file written before
    // pickups existed would silently hand every tier the stock drop table.
    for (const idx of state.sawWaveLine) {
      if (!state.sawPickupLine.has(idx)) delete arena.waves[idx].pickups
      // Same rule, same reason, for the tier's wall traps.
      if (!state.sawTrapLine.has(idx)) delete arena.waves[idx].traps
      // And its buffs: the serializer writes no line for a tier without any,
      // so without this a tier saved buff-less (e.g. a death tier with its
      // stock bloodlust removed) came back with the stock buff on import.
      if (!state.sawBuffLine.has(idx)) delete arena.waves[idx].buffs
    }

    // A file written before the boss-death tier existed carries wave1..4 and
    // nothing else. It described a fight that stops when the boss dies, so the
    // stock death tier the defaults supplied is dropped rather than inherited —
    // otherwise importing an old file would silently add a wave it never had.
    if (state.sawAnyWave && !state.sawDeathWave) {
      const death = arena.waves[BOSS_DEATH_WAVE]
      death.monsters = []
      death.monsterMax = {}
      delete death.intervalMs
      delete death.spawnMode
    }
  }

  return result
}

/** Serialize parameters back into the original parameters.txt format, following PARAMETER_ORDER. */

/** The free upgrade counts as a `lobbyUpgrades`/`bossUpgrades` value. */
function upgradeCountsLine(upgrades: UpgradeCounts | undefined): string {
  const counts = upgrades ?? noUpgrades()
  return UPGRADE_KINDS.map((kind) => counts[kind] ?? 0).join(' ')
}

/**
 * Writes a `<keyPrefix>=<track>` line whenever it is needed to reproduce
 * `desired` on re-import — not just whenever `desired` is a real track.
 *
 * The historical rule ("only write when non-default") is lossy the moment the
 * BASE `parseParametersTxt` overlays onto (`defaultParameters()`) carries a
 * non-default track at this same slot: omitting the line does not mean
 * "unset", it means "inherit whatever the base already had here" — castle's
 * per-floor tracks, its `boss_1` second lobby, its `boss_final` arena cue.
 * So a campaign that explicitly wants `default` where the base does not
 * still needs an explicit `<keyPrefix>=default` line to override it, while a
 * campaign that already agrees with the base writes nothing, exactly as
 * before (byte-identical for castle/desert/bonus, whose own tracks already
 * clear the old "!= default" bar on every slot they use).
 */
function writeMusicLine(lines: string[], keyPrefix: string, desired: string | undefined, baseValue: string | undefined): void {
  const track = desired ?? MUSIC_DEFAULT
  const inherited = baseValue ?? MUSIC_DEFAULT
  if (track === MUSIC_DEFAULT) {
    if (inherited === MUSIC_DEFAULT) return
    lines.push(`${keyPrefix}=${MUSIC_DEFAULT}`)
    return
  }
  lines.push(`${keyPrefix}=${track}`)
}

export function serializeParametersTxt(params: DungeonParameters, path?: string, cleanupFiles = true): string {
  const lines: string[] = []
  // `parseParametersTxt(content)` (no base) overlays onto this exact object,
  // so it is the reference every "only write when it differs" check below
  // must diff against — not some hardcoded sentinel — or a field the base
  // ships non-default (the escape floor's timer/traps, its per-floor music,
  // its stock `player.shared.remove.life` tweak, its shipped `levelOrder`)
  // silently leaks back in on re-import the moment a campaign turns it off.
  const base = defaultParameters()

  for (const key of PARAMETER_ORDER) {
    if (key === 'path') {
      if (path !== undefined) lines.push(`path=${path}`)
    } else if (key === 'levels') {
      lines.push(`levels=${params.levels}`)
    } else if (key === 'minRoomSize') {
      lines.push(`minRoomSize=${params.minRoomSize}`)
    } else if (key === 'maxRoomSize') {
      lines.push(`maxRoomSize=${params.maxRoomSize}`)
    } else if (key === 'minPassageWidth') {
      lines.push(`minPassageWidth=${params.minPassageWidth}`)
    } else if (key === 'maxPassageWidth') {
      lines.push(`maxPassageWidth=${params.maxPassageWidth}`)
    } else if (key === 'minRoomCount') {
      lines.push(`minRoomCount=${params.minRoomCount}`)
    } else if (key === 'maxRoomCount') {
      lines.push(`maxRoomCount=${params.maxRoomCount}`)
    } else if (key === 'mapWidth') {
      lines.push(`mapWidth=${params.mapWidth}`)
    } else if (key === 'mapHeight') {
      lines.push(`mapHeight=${params.mapHeight}`)
    } else if (key === 'edgePadding') {
      lines.push(`edgePadding=${params.edgePadding}`)
    } else if (key === 'roomPadding') {
      lines.push(`roomPadding=${params.roomPadding}`)
    } else if (key === 'cleanupFiles') {
      lines.push(`cleanupFiles=${cleanupFiles ? 1 : 0}`)
    } else if (key === 'themes') {
      lines.push(`themes=${params.themes.join(',')}`)
    } else if (key === 'monsterMultiplier') {
      lines.push(`monsterMultiplier=${params.monsterMultiplier.toFixed(6)}`)
    } else if (key === 'goldMultiplier') {
      lines.push(`goldMultiplier=${params.goldMultiplier.toFixed(6)}`)
    } else if (key === 'foodMultiplier') {
      lines.push(`foodMultiplier=${params.foodMultiplier.toFixed(6)}`)
    } else if (key === 'shopChance') {
      lines.push(`shopChance=${params.shopChance.toFixed(6)}`)
    } else if (key === 'vaultChance') {
      lines.push(`vaultChance=${params.vaultChance.toFixed(6)}`)
    } else if (key === 'lockChance') {
      lines.push(`lockChance=${params.lockChance.toFixed(6)}`)
    } else if (key === 'keyChance') {
      lines.push(`keyChance=${params.keyChance.toFixed(6)}`)
    } else if (key === 'lockFloors') {
      // Always written, empty when no floor is locked, so importing it over a
      // base campaign that had locks really does clear them.
      // A floor with a count other than one is written `i:n` — including
      // `i:0`, a lock with no button, so it round-trips as set.
      const locked: string[] = []
      ;(params.levelLock ?? []).slice(0, Math.max(params.levels, 0)).forEach((lock, i) => {
        if (!lock.enabled) return
        locked.push(lock.buttons === undefined || lock.buttons === 1 ? `${i}` : `${i}:${lock.buttons}`)
      })
      lines.push(`lockFloors=${locked.join(',')}`)
    } else if (key === 'monster') {
      params.levelMonsters.forEach((pool, i) => {
        lines.push(`monsters${i}=${pool.join(',')}`)
      })
    } else if (key === 'monsterMax') {
      // Families after the types, so an existing file's line order is
      // untouched and the new keys simply append.
      for (const t of [...MONSTER_TYPES, ...MONSTER_FAMILIES]) {
        lines.push(`${t.configKey}=${params.monsterMax[t.id] ?? 0}`)
      }
    } else if (key === 'buff') {
      // A floor carrying at least one buff always gets a line (the historical
      // rule — keeps parameters.default.txt and every file exported before
      // buffs existed byte-identical) OR the floor differs from what omitting
      // the line would reconstruct (the base's own buffs at that index —
      // always `[]` today, but read through `base` rather than hardcoded so
      // this stays correct if that ever changes).
      if (params.levelBuffs !== undefined) {
        for (let i = 0; i < params.levels; i++) {
          const buffs = params.levelBuffs[i] ?? defaultFloorBuffs()
          const baseBuffs = base.levelBuffs?.[i] ?? defaultFloorBuffs()
          if (buffs.length === 0 && deepEqual(buffs, baseBuffs)) continue
          lines.push(`buff${i}=${buffs.map((b) => `${b.buff}:${b.target}`).join('|')}`)
        }
      }
    } else if (key === 'trap') {
      // A floor running at least one trap always gets a line (the historical
      // rule — keeps parameters.default.txt and every file exported before
      // floor traps existed byte-identical: castle's escape floor is already
      // non-empty, so it is written exactly as before) OR the floor differs
      // from what omitting the line would reconstruct — the base's own traps
      // at that index. Without the second clause, a campaign that clears the
      // escape floor's stock fireball rig (base index 7) back to empty would
      // silently get it back on re-import, since an empty array used to mean
      // "nothing to write" rather than "explicitly none".
      if (params.levelTraps !== undefined) {
        for (let i = 0; i < params.levels; i++) {
          const rows = params.levelTraps[i] ?? defaultFloorTraps()
          const baseRows = base.levelTraps?.[i] ?? defaultFloorTraps()
          if (rows.length === 0 && deepEqual(rows, baseRows)) continue
          lines.push(
            `trap${i}=${rows
              .map((t) => `${t.projectile}:${t.direction}:${t.spread}:${t.spawnRateMs}:${t.count}`)
              .join('|')}`
          )
        }
      }
    } else if (key === 'timer') {
      // A floor whose timer is ON always gets a line (the historical rule) OR
      // the floor differs from what omitting the line would reconstruct — the
      // base's own timer at that index (the escape floor's is ON). The full
      // state (enabled bit included) is always written, never just the three
      // numeric fields the old "only when enabled" rule assumed, so a floor
      // explicitly turned OFF where the base's is ON can say so.
      if (params.levelTimers !== undefined) {
        for (let i = 0; i < params.levels; i++) {
          const timer = params.levelTimers[i] ?? defaultFloorTimer()
          const baseTimer = base.levelTimers?.[i] ?? defaultFloorTimer()
          if (!timer.enabled && deepEqual(timer, baseTimer)) continue
          lines.push(
            `timer${i}=${timer.enabled ? 1 : 0}|${timer.seconds}|${timer.damage}|${timer.freqMs}|${timer.countdown ? 1 : 0}`
          )
        }
      }
    } else if (key === 'bossFloor') {
      // Only floors with a boss ON get lines — and then the whole block, so
      // clearing a wave tier in the form and re-importing really does clear it
      // rather than falling back to the base object. A campaign with no boss
      // floor writes not one of these keys, which is what keeps every file
      // exported before the feature byte-identical.
      ;(params.levelBoss ?? []).forEach((boss, i) => {
        if (!boss.enabled) return
        // The 4th field is only written when the count differs from 1 (issue
        // #64 part 1), so a single-boss floor's line is byte-identical to
        // before this feature existed.
        const countSuffix = floorBossCount(boss) !== 1 ? `|${floorBossCount(boss)}` : ''
        lines.push(`bossFloor${i}=1|${boss.bossPool.join(',')}|${boss.monsterMultiplier.toFixed(6)}${countSuffix}`)
        // Selection mode and lineup (issue #64 follow-up), only in lineup
        // mode — a random-mode floor writes neither, the same "not one of the
        // six" rule survival's keys follow, so every file written before this
        // feature round-trips byte for byte.
        if (bossSelection(boss) === 'lineup') {
          lines.push(`bossFloor${i}Selection=lineup`)
          lines.push(`bossFloor${i}Lineup=${lineupLine(boss.bossLineup)}`)
        }
        lines.push(
          `bossFloor${i}Invuln=${boss.invulnerability.enabled ? boss.invulnerability.seconds.join(',') : 'off'}`
        )
        lines.push(`bossFloor${i}InvulnCountdown=${boss.invulnerability.countdown ? 1 : 0}`)
        lines.push(`bossFloor${i}Checkpoints=${boss.checkpoints.respawnPlayers},${boss.checkpoints.saveGame}`)

        boss.waves.forEach((wave, tier) => {
          const maxes = wave.monsters
            .map((id) => `${id}:${wave.monsterMax[id] ?? DEFAULT_WAVE_MONSTER_MAX}`)
            .join(',')
          // Sorted, so the same params always serialize to the same bytes
          // whatever order the overrides were inserted in.
          const overrides = wave.intervalMs
            ? Object.entries(wave.intervalMs)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([id, ms]) => `${id}:${ms}`)
                .join(',')
            : ''
          lines.push(
            `bossFloor${i}Wave${tier + 1}=${wave.monsters.join(',')}|${wave.defaultIntervalMs}|${maxes}|${overrides}`
          )

          // Their own keys, written only for tiers that carry something — the
          // same reason the arena's buff and trap lines are separate keys.
          const buffs = waveBuffs(wave)
          if (buffs.length > 0) {
            lines.push(`bossFloor${i}WaveBuff${tier + 1}=${buffs.map((b) => `${b.buff}:${b.target}`).join('|')}`)
          }
          const pickups = wavePickups(wave)
          if (pickups.length > 0) {
            lines.push(`bossFloor${i}WavePickup${tier + 1}=${pickups.map((d) => `${d.item}:${d.count}`).join('|')}`)
          }
          const traps = waveTraps(wave)
          if (traps.length > 0) {
            lines.push(
              `bossFloor${i}WaveTrap${tier + 1}=${traps
                .map((t) => `${t.projectile}:${t.direction}:${t.spread}:${t.spawnRateMs}:${t.count}`)
                .join('|')}`
            )
          }
        })
      })
    } else if (key === 'music') {
      // A real (non-default) track always gets a line, same as before — that
      // alone keeps castle/desert/bonus byte-identical, since none of their
      // floors use the `default` sentinel. What is new is the other
      // direction: a floor explicitly reset to `default` where the base's
      // own track at that index is NOT `default` (pre-alpha clearing
      // castle's act1..act4) also needs a line, or the base's track leaks
      // back in on re-import — `writeMusicLine` is exactly the "only write
      // when it differs from the base at this slot" rule the rest of this
      // function now follows.
      if (params.floorMusic !== undefined) {
        for (let i = 0; i < params.floorMusic.length; i++) {
          writeMusicLine(lines, `music${i}`, params.floorMusic[i], base.floorMusic?.[i])
        }
      }
    } else if (key === 'mystery') {
      // Nothing at all for a campaign without mystery buttons, which is every
      // campaign written before them — so those files stay byte-identical. The
      // base never carries a pool, so "differs from the base" is simply
      // "present", and the parser treats the pool this writes as the whole pool.
      const pool = params.mysteryButtons ?? []
      if (pool.length > 0) {
        lines.push(`mysteryButtons=${pool.length}`)
        pool.forEach((b, i) => {
          if (b.name !== undefined && b.name !== '') lines.push(`mysteryButton${i}Name=${b.name}`)
          if (b.text !== undefined && b.text !== '') lines.push(`mysteryButton${i}Text=${b.text}`)
          if (b.loot.length > 0) {
            lines.push(`mysteryButton${i}Loot=${b.loot.map((r) => `${r.item}:${r.count}`).join('|')}`)
          }
          if (b.monsters.length > 0) {
            lines.push(`mysteryButton${i}Monsters=${b.monsters.map((r) => `${r.monster}:${r.count}`).join('|')}`)
          }
          if (b.traps.length > 0) {
            lines.push(
              `mysteryButton${i}Traps=${b.traps
                .map((t) => `${t.projectile}:${t.direction}:${t.spread}:${t.spawnRateMs}:${t.count}`)
                .join('|')}`
            )
          }
          if ((b.trapSeconds ?? 0) !== 0) lines.push(`mysteryButton${i}TrapSeconds=${b.trapSeconds}`)
        })
      }
      if (params.levelMystery !== undefined) {
        for (let i = 0; i < params.levels; i++) {
          const floor = params.levelMystery[i]
          if (floor === undefined || (floor.count === 0 && floor.pool.length === 0)) continue
          lines.push(`mysteryFloor${i}=${floor.count}:${floor.pool.join(',')}`)
        }
      }
      // Enhanced lock buttons: written only for floors that carry an
      // enhancement, a disguise, or both — a campaign that never touches this
      // stays byte-identical to one written before the feature existed.
      if (params.levelLockMystery !== undefined) {
        for (let i = 0; i < params.levels; i++) {
          const floor = params.levelLockMystery[i]
          if (floor === undefined) continue
          if (floor.count > 0 || floor.pool.length > 0) {
            lines.push(`mysteryLock${i}=${floor.count}:${floor.pool.join(',')}`)
          }
          if (floor.disguise === true) lines.push(`mysteryLockDisguise${i}=1`)
        }
      }
    } else if (key === 'playerTweaks') {
      const tweaks = pruneTweaks(params.playerTweaks ?? {})
      const baseTweaks = pruneTweaks(base.playerTweaks ?? {})
      // Every key the BASE overrides (non-stock) that this campaign does not
      // override the same way must be written back to its stock value
      // explicitly, or omitting the line — which now means "delete the
      // inherited override" (see the parser change above) — would still
      // leave nothing to delete only because nothing said to. Without this a
      // campaign that clears castle's stock `player.shared.remove.life`
      // tweak (an empty `playerTweaks: {}`) would silently get it back.
      const explicitStock = new Set<string>()
      for (const baseKey of Object.keys(baseTweaks)) {
        if (tweaks[baseKey] === undefined) explicitStock.add(baseKey)
      }
      const allKeys = new Set([...Object.keys(tweaks), ...explicitStock])
      for (const tweakKey of Array.from(allKeys).sort()) {
        lines.push(formatTweakLine(tweakKey, tweaks[tweakKey] ?? TWEAK_FIELD_MAP.get(tweakKey)?.stock ?? 0))
      }
    }
  }

  // Add lobby params after the main loop — every lobby fully indexed
  // (`lobby0Preset`, `lobby1Gold`, …), the same shape the per-fight keys
  // below use. No bare `lobbyGold` alias to lobby 0: the old singular lobby
  // is a hard break (see the parser's comment on the same keys).
  const lobbies = params.lobbies ?? []
  // the global heading over the per-lobby blocks: whether each carries a save
  // checkpoint. `?? true` matches the default for a base params that predates it
  lines.push(`lobbySaves=${(params.lobbySaves ?? true) ? 1 : 0}`)
  lines.push(`lobbies=${lobbies.length}`)
  lobbies.forEach((lobby, i) => {
    lines.push(`lobby${i}Preset=${lobby.preset}`)
    lines.push(`lobby${i}Gold=${lobby.startingGold}`)
    lines.push(`lobby${i}Shops=${lobby.shopCategories.join(' ')}`)
    lines.push(`lobby${i}Upgrades=${upgradeCountsLine(lobby.upgrades)}`)
    // Written whenever it differs from what omitting the line would
    // reconstruct — the base's own lobby at this index. `defaultParameters()`
    // ships lobby 1 (`BETA-boss-prep`) with `music: 'boss_1'`, so a campaign
    // that puts a DIFFERENT lobby at index 1 and leaves its own music on
    // `default` must say so explicitly, or the stale `boss_1` leaks back in
    // on re-import.
    writeMusicLine(lines, `lobby${i}Music`, lobby.music, base.lobbies[i]?.music)
  })

  // Add boss params after the lobby params.
  //
  // Every per-fight key carries its fight index (`boss0Theme`, `boss1Wave3`), so
  // a campaign with several fights writes one full block per fight and each is
  // read back onto the fight it names. The parser still accepts the unprefixed
  // form as fight 0, which is what keeps older files importable, but nothing
  // writes it any more — an export is always fully indexed. `boss<i>Gold`,
  // `boss<i>Shops` and `boss<i>Upgrades` are gone entirely: the fight's prep
  // room is a `lobby` slot now, so a shop in front of a fight is written as one
  // of the `lobby<i>*` blocks above, not as part of the fight.
  const fights = params.boss.fights ?? []

  // Written when the campaign was actually rearranged (the historical rule —
  // keeps every stock export byte-identical to one written before floors
  // could be reordered) OR when OMITTING the line would reconstruct the
  // wrong thing. The two are different questions: `defaultParameters()`
  // itself ships the shipped order (`L1,1..7,L2,B1,8`), not the naive
  // "lobbies, then floors, then fights" default, so a campaign with fewer
  // lobbies or no boss whose OWN order genuinely IS that naive shape (e.g.
  // pre-alpha) still needs an explicit line — omitting it would have
  // `parseParametersTxt` repair the base's shipped order against this
  // campaign's own counts instead, which is not the same thing.
  const counts = { levels: params.levels, fights: fights.length, lobbies: lobbies.length }
  const order = campaignOrder(counts, params.levelOrder)
  const isRearranged = !isDefaultOrder(order, counts)
  const absentOrder =
    base.levelOrder === undefined
      ? undefined
      : (() => {
          const repaired = normalizeOrder(base.levelOrder, counts)
          return isDefaultOrder(repaired, counts) ? undefined : repaired
        })()
  const omittingWouldReconstructCorrectly =
    absentOrder === undefined ? isDefaultOrder(order, counts) : deepEqual(order, absentOrder)
  if (isRearranged || !omittingWouldReconstructCorrectly) {
    const label = slotLabeller(fights.map(arenaMode))
    lines.push(`levelOrder=${order.map(label).join(',')}`)
  }

  lines.push(`boss=${params.boss.enabled ? 1 : 0}`)
  lines.push(`bossFights=${fights.length}`)
  fights.forEach((fight, f) => {
    const arena = fight.arena

    // Arena mode, and the survival block when it is one (issue #61).
    //
    // A boss-mode fight writes NOT ONE of these keys — not even `boss<i>Mode`,
    // whose absence already means boss — so every stock export, and every file
    // written before survival mode existed, round-trips byte for byte.
    //
    // A survival fight writes all six unconditionally, empty lists included, so
    // that clearing a list in the form and exporting really does clear it on
    // re-import rather than falling back to whatever the base object held.
    if (arenaMode(fight) === 'survival') {
      const survival = fight.survival ?? defaultSurvivalOptions()
      lines.push(`boss${f}Mode=survival`)
      lines.push(`boss${f}Survival=${survival.seconds},${survival.countdown}`)
      lines.push(
        `boss${f}SurvivalWaves=${survival.waves
          .map((w) => `${w.monster}:${w.count}:${w.atSeconds}:${w.intervalMs}`)
          .join('|')}`
      )
      lines.push(
        `boss${f}SurvivalBuffs=${survival.buffs
          .map((b) => `${b.buff}:${b.target}:${b.startSeconds}:${b.endSeconds}`)
          .join('|')}`
      )
      lines.push(
        `boss${f}SurvivalPickups=${survival.pickups.map((d) => `${d.item}:${d.count}:${d.atSeconds}`).join('|')}`
      )
      lines.push(
        `boss${f}SurvivalTraps=${survival.traps
          .map((t) => `${t.projectile}:${t.direction}:${t.spread}:${t.spawnRateMs}:${t.count}:${t.startSeconds}:${t.endSeconds}`)
          .join('|')}`
      )
    }

    lines.push(`boss${f}Theme=${arena.theme}`)
    // Written whenever it differs from what omitting the line would
    // reconstruct: `defaultBossFight()` ships `music: 'boss_final'` — both on
    // `defaultParameters()`'s own fight 0 AND on whatever fresh fight the
    // parser pads the array out to — so a campaign that wants NO arena music
    // must say `default` explicitly, at any fight index, or `boss_final`
    // leaks back in on re-import.
    writeMusicLine(lines, `boss${f}Music`, arena.music, (base.boss.fights?.[f] ?? defaultBossFight()).arena.music)
    lines.push(`boss${f}FloorPattern=${arena.floorPattern}`)
    lines.push(`boss${f}Width=${arena.minWidth},${arena.maxWidth}`)
    lines.push(`boss${f}Height=${arena.minHeight},${arena.maxHeight}`)
    lines.push(`boss${f}Pool=${arena.bossPool.join(',')}`)
    // Only when more than one — issue #64 part 1. Absent means 1, so a fight
    // that never touched this rolls not one boss count line, keeping every
    // file written before the feature byte-identical.
    if (arenaBossCount(arena) !== 1) {
      lines.push(`boss${f}Count=${arenaBossCount(arena)}`)
    }
    // issue #64 part 2. Absent means on, so a fight that never touched this
    // writes not one line, keeping every file written before the feature
    // byte-identical.
    if (!arenaUsesBodyguards(arena)) {
      lines.push(`boss${f}BodyguardVariants=false`)
    }
    // Selection mode and lineup (issue #64 follow-up), only in lineup mode —
    // a random-mode fight writes neither, the same "not one of the six" rule
    // survival's keys follow, so every file written before this feature
    // round-trips byte for byte.
    if (bossSelection(arena) === 'lineup') {
      lines.push(`boss${f}Selection=lineup`)
      lines.push(`boss${f}Lineup=${lineupLine(arena.bossLineup)}`)
    }
    lines.push(
      `boss${f}Cover=${arena.cover.pattern},${arena.cover.density},${arena.cover.ringSpacing},${arena.cover.clusters}`
    )
    lines.push(
      `boss${f}Spawn=${arena.spawn.spacing},${arena.spawn.ringSpacing},${arena.spawn.clusters},${arena.spawn.batchSize},${arena.spawn.batchIntervalMs}`
    )
    // `off` keeps the window lengths out of the file entirely when the feature is
    // disabled — importing it back leaves them at their defaults, which is what a
    // file that never mentions them does too.
    lines.push(
      `boss${f}Invuln=${arena.invulnerability.enabled ? arena.invulnerability.seconds.join(',') : 'off'}`
    )
    lines.push(`boss${f}InvulnCountdown=${arena.invulnerability.countdown ? 1 : 0}`)
    lines.push(`boss${f}Checkpoints=${arena.checkpoints.respawnPlayers},${arena.checkpoints.saveGame}`)
    // six decimals, matching the global multipliers above
    lines.push(`boss${f}MonsterMultiplier=${arena.monsterMultiplier.toFixed(6)}`)
    lines.push(`boss${f}FoodMultiplier=${arena.foodMultiplier.toFixed(6)}`)
    for (let i = 0; i < arena.waves.length; i++) {
      const wave = arena.waves[i]
      // fixed arity of five fields; monsterMax is always rebuilt from the
      // monster pool (never merged), and the fourth and fifth are left empty
      // when there are no per-monster interval overrides or spawn modes.
      const monsterMax = wave.monsters
        .map((id) => `${id}:${wave.monsterMax[id] ?? DEFAULT_WAVE_MONSTER_MAX}`)
        .join(',')
      // sorted by id, so the same params always serialize to the same bytes no
      // matter what order the overrides were inserted in
      const overrides = wave.intervalMs
        ? Object.entries(wave.intervalMs)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([id, ms]) => `${id}:${ms}`)
            .join(',')
        : ''
      // fifth field, same sorted shape: only monsters actually on a non-default
      // mode are written, so a campaign that never touched spawn modes
      // serializes exactly as it did before they existed
      const modes = wave.spawnMode
        ? Object.entries(wave.spawnMode)
            .filter(([id, mode]) => isScatterMode(mode) && wave.monsters.includes(id))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([id, mode]) => `${id}:${mode}`)
            .join(',')
        : ''
      lines.push(
        `boss${f}Wave${i + 1}=${wave.monsters.join(',')}|${wave.defaultIntervalMs}|${monsterMax}|${overrides}|${modes}`
      )
      // A separate key rather than a sixth field on the line above: appending one
      // would put a trailing `|` on every stock export, so a file written before
      // wave buffs existed would no longer round-trip to the same bytes.
      const buffs = waveBuffs(wave)
      if (buffs.length > 0) {
        lines.push(`boss${f}WaveBuff${i + 1}=${buffs.map((b) => `${b.buff}:${b.target}`).join('|')}`)
      }
      // Same story again: its own key, written only for tiers that drop
      // something, so an export from before pickups existed round-trips byte for
      // byte.
      const pickups = wavePickups(wave)
      if (pickups.length > 0) {
        lines.push(`boss${f}WavePickup${i + 1}=${pickups.map((d) => `${d.item}:${d.count}`).join('|')}`)
      }
      // And once more for the tier's wall traps. All five fields are always
      // written even where the parser would default them, so an exported file
      // says what it means rather than relying on the reader's fallbacks.
      const traps = waveTraps(wave)
      if (traps.length > 0) {
        lines.push(
          `boss${f}WaveTrap${i + 1}=${traps
            .map((t) => `${t.projectile}:${t.direction}:${t.spread}:${t.spawnRateMs}:${t.count}`)
            .join('|')}`
        )
      }
    }
  })

  return lines.join('\r\n') + '\r\n'
}
