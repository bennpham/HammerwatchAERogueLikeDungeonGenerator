import { GenerationContext } from './core/context'
import { Level } from './map/level'
import { defaultParameters, bossFights, arenaMode, defaultSurvivalOptions, floorBoss, floorBossCount, floorLockButtons, floorLockDisguised } from './config/parameters'
import type { DungeonParameters } from './config/parameters'
import { validateParameters, ValidationResult } from './config/validation'
import { DEFAULT_LOBBY_PRESET_ID, buildLobby, lobbyPresetById } from './lobby'
import { buildBossArena } from './boss'
import { campaignOrder, floorId, gatewayAfter, slotEntryId, slotLabeller } from './campaign'
import type { CampaignSlot } from './campaign'
import { renderLevel } from './ae/levelWriter'
import { renderInfoXml } from './ae/scenario'
import { scenarioLogoBase64 } from './ae/logo'
import { buildFloorHazardRig } from './timer/hazard'
import { buildFloorBuffRig } from './buffs/field'
import { buildMusicRig } from './music/rig'
import { buildFloorTrapRig } from './traps/floor'
import { buildFloorBossRig } from './dungeonBoss'
import { buildMysteryButtonRig } from './mystery/rig'
import { playerOverrides } from './players'
import { environmentOverrides } from './lighting'
import type { PlayerFileOverride } from './players'

export type { DungeonParameters, DungeonBoss, LobbyOptions, BossOptions, BossFight, BossArenaOptions, BossWave, BossSpawnMode, BossFloorPattern, FloorTimer, FloorLock, FloorBuff, FloorTrap, TrapDirection, BuffTarget, WavePickup, BossTrap, BossTrapDirection, BossCheckpointPreset, ArenaMode, SurvivalOptions, SurvivalWave, SurvivalBuff, SurvivalPickup, SurvivalTrap, SurvivalCountdown } from './config/parameters'
export {
  THEMES,
  BOSS_IDS,
  BOSS_COVER_DENSITY_MAX,
  BOSS_COVER_PATTERNS,
  BOSS_FLOOR_PATTERNS,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  BOSS_DEATH_WAVE,
  BOSS_INVULN_THRESHOLDS,
  BOSS_INVULN_COUNT,
  DEFAULT_BOSS_INVULN_SECONDS,
  MAX_BOSS_INVULN_SECONDS,
  BOSS_CHECKPOINT_EVENTS,
  BOSS_CHECKPOINT_PRESETS,
  DEFAULT_WAVE_MONSTER_MAX,
  defaultBossOptions,
  defaultBossFight,
  defaultLobby,
  shippedOrder,
  bossFights,
  defaultFloorTimer,
  defaultFloorBuffs,
  defaultFloorTraps,
  BUFF_TARGETS,
  BUFF_TARGET_TYPES,
  BUFF_REFRESH_MS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_FREQ_MS,
  MAX_TIMER_FREQ_MS,
  MAX_TIMER_DAMAGE,
  TIMER_COUNTDOWN_NODE_WARN,
  isScatterMode,
  waveBuffs,
  wavePickups,
  waveTraps,
  BOSS_TRAP_DIRECTIONS,
  MAX_TRAP_COUNT,
  TRAP_SPREAD_MAX,
  waveSpawnMode,
  ARENA_MODES,
  SURVIVAL_COUNTDOWN_STYLES,
  SURVIVAL_SECONDS_MAX,
  SURVIVAL_COUNTDOWN_NODE_WARN,
  DEFAULT_SURVIVAL_SECONDS,
  DEFAULT_SURVIVAL_INTERVAL_MS,
  arenaMode,
  arenaModes,
  MOBILE_BOSS_IDS,
  defaultDungeonBoss,
  floorBoss,
  defaultSurvivalOptions,
  survivalWaves,
  survivalBuffs,
  survivalPickups,
  survivalTraps,
  MAX_BOSS_COUNT,
  BOSS_COUNT_WARN,
  BOSS_SELECTIONS,
  bossSelection,
  lineupTotal,
  arenaBossCount,
  floorBossCount,
  isMultiBoss,
  defaultFloorLock,
  floorLocked,
  floorLockButtons,
  MAX_LOCK_BUTTONS,
  gatewayLockedFloors,
  withGatewayLocks,
  arenaUsesBodyguards,
  defaultFloorMystery,
  floorMystery,
  defaultFloorLockMystery,
  floorLockMystery,
  floorLockDisguised,
  mysteryStarterPool,
  MYSTERY_STARTER_TRAP_SECONDS,
  MYSTERY_PARSE_LIMIT,
  MAX_MYSTERY_PER_FLOOR,
  MAX_MYSTERY_MONSTERS,
  MYSTERY_NAME_MAX,
  MYSTERY_TEXT_MAX,
  MAX_MYSTERY_TRAP_SECONDS
} from './config/parameters'
export type { BossSelection, MysteryButton, MysteryMonster, FloorMystery, FloorLockMystery } from './config/parameters'
export { MYSTERY_LOOT_DEFS, MYSTERY_LOOT_GROUPS, mysteryLootById } from './objects/mysteryLoot'
export type { LootDef } from './objects/mysteryLoot'
export { BUFF_DEFS, BUFF_GROUPS, BUFF_HELPFUL_IDS, buffById } from './objects/buffTypes'
export type { BuffDef } from './objects/buffTypes'
export { PICKUP_DEFS, PICKUP_GROUPS, MAX_PICKUP_COUNT, pickupById } from './objects/pickupTypes'
export type { ProjectileDef } from './objects/projectileTypes'
export { PROJECTILE_DEFS, PROJECTILE_GROUPS, projectileById } from './objects/projectileTypes'
export { floorTrapCapacity } from './traps/floor'
export { MUSIC_TRACKS, MUSIC_DEFAULT, musicSound, isKnownMusicId } from './music/tracks'
export type { MusicTrack } from './music/tracks'
export type { PickupDef, PickupLane } from './objects/pickupTypes'
export { THEME_DEFS, getTheme } from './config/themes'
export type { ThemeDef } from './config/themes'
export { ARENA_PATTERN_LABELS, isShapePattern } from './boss/arenaPattern'
export type { ArenaPatternKind } from './boss/arenaPattern'
export { defaultParameters }
export {
  bossArenaId,
  floorId,
  campaignOrder,
  defaultOrder,
  gatewayAfter,
  isDefaultOrder,
  lobbyId,
  normalizeOrder,
  parseSlotLabel,
  slotLabeller,
  slotEntryId,
  slotLabel
} from './campaign'
export type { CampaignCounts, CampaignSlot, Gateway } from './campaign'
export { CAMPAIGN_PRESETS, DEFAULT_PRESET_ID, PRESET_GROUPS, campaignPresetById } from './config/presets'
export type { CampaignPreset, PresetGroupId } from './config/presets'
export { validateParameters } from './config/validation'
export type { ValidationResult, ValidationIssue } from './config/validation'
export { GOLD_SAFETY_MAX, UPGRADE_COUNT_MAX } from './config/validation'
export { UPGRADE_KINDS, noUpgrades, oneOfEachUpgrade, upgradeItemPath } from './lobby/payout'
export type { UpgradeCounts, UpgradeKind } from './lobby/payout'
export type { BossDef, BossId, BossPlacement } from './boss'
export {
  BOSS_DEF_LIST,
  UNIQUE_BOSS_IDS,
  ARENA_LAYOUT_SLOTS,
  BOSS_LAYOUT_GAP,
  arenaBossLayout,
  expandLineup,
  isMobileBoss,
  pickBosses
} from './boss'
export { parseParametersTxt, serializeParametersTxt } from './config/configFile'
export type { ParsedConfig } from './config/configFile'
export { parsePlayerSettingsTxt, serializePlayerSettingsTxt } from './config/playerSettingsFile'
export type { ParsedPlayerSettings } from './config/playerSettingsFile'
export {
  ALL_LOBBY_CATEGORIES,
  DEFAULT_LOBBY_PRESET_ID,
  LOBBY_DIAMOND_VALUE,
  LOBBY_PRESETS,
  LOBBY_VENDORS,
  STANDIN_LOBBY_ID,
  buildLobby,
  categoriesFor,
  diamondCount,
  isLobbyCategory,
  lobbyCategoryCounts,
  lobbyPresetById,
  vendorOfCategory
} from './lobby'
export type { LobbyPresetDef, LobbyVendorDef } from './lobby'
export {
  MONSTER_CATEGORIES,
  MONSTER_GROUPS,
  MONSTER_TYPES,
  MONSTER_VARIANT_GROUPS,
  MONSTER_FAMILIES,
  defaultTier,
  familyMembers,
  familyOfMember,
  floorPoolBucketId,
  floorPoolEntries,
  floorPoolEntriesInGroup,
  floorPoolFamilyEntry,
  floorPoolGroup,
  floorPoolTier,
  isKnownFamilyId,
  monsterFamilyById,
  isKnownFloorPoolKey,
  isKnownMonsterKey,
  monsterCategories,
  monsterNote,
  monsterTypeById,
  monsterTypesInGroup,
  monsterVariants,
  monsterVariantsInGroup,
  parseMonsterKey,
  resolveActorPath,
  ARENA_BODYGUARD_TWINS,
  arenaActorPath,
  resolveArenaActorPath,
  variantGroup,
  variantKey
} from './objects/monsterTypes'
export type {
  FloorPoolEntry,
  MonsterCampaign,
  MonsterFamilyDef,
  MonsterCategory,
  MonsterGroup,
  MonsterTypeDef,
  MonsterVariant,
  MonsterVariantGroup
} from './objects/monsterTypes'
export { corpseCollision, corpseCollisionPaths } from './objects/actorCollision'
export type { CorpseCollision } from './objects/actorCollision'
export * from './players'

export interface GeneratedFile {
  /** path relative to the scenario folder, e.g. "levels/dungeon_42/floor0.lvl" */
  path: string
  /** utf-8 text, or base64 when `encoding` says so */
  content: string
  /**
   * How to turn `content` back into bytes on the way out; absent means utf-8.
   * The generator still returns strings only — no `fs`, no `Buffer`.
   */
  encoding?: 'utf-8' | 'base64'
}

export interface PreviewSegment {
  x: number
  y: number
  dir: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  length: number
}

export interface PreviewPassage {
  width: number
  segments: PreviewSegment[]
}

export interface PreviewRoom {
  x: number
  y: number
  width: number
  height: number
  type: string
  locked: boolean
  /** door tier sealing the room (0 bronze, 1 silver, 2 gold), null when open */
  lockTier: number | null
  /** barred by a destructible wall and a button rather than a door and a key */
  sealed: boolean
}

export interface LevelPreview {
  level: number
  /** what the preview tabs call this level, in campaign order: `3`, `AB2`, … */
  label: string
  theme: string
  mapWidth: number
  mapHeight: number
  rooms: PreviewRoom[]
  passages: PreviewPassage[]
  monsterCount: number
  itemCount: number
  /** wall bitmap packed row-major as '0'/'1' chars, for the canvas preview */
  walls: string
}

export interface DungeonResult {
  ok: true
  seed: number
  /** the scenario id: its folder name, PACKAGER argument and `levels/<id>/` namespace */
  campaignName: string
  files: GeneratedFile[]
  /**
   * Stock files the scenario ships patched (the Players tab's edits and the
   * brightness setting's lighting environments). The
   * generator never holds the game's files: the install reads each `source`
   * from the user's own unpacked assets and applies the edits.
   */
  assetOverrides: PlayerFileOverride[]
  levels: LevelPreview[]
}

export interface DungeonError {
  ok: false
  /** blocking validation issues or a generation failure explanation */
  errors: string[]
  validation?: ValidationResult
}

/** attempts per level before giving up (the original retried forever) */
const MAX_LEVEL_ATTEMPTS = 60

/**
 * Generate a complete Hammerwatch Anniversary Edition scenario in memory: one
 * `.lvl` per campaign slot under `levels/<scenario>/`, plus `info.xml` and
 * `logos.png` — exactly the folder AE's PACKAGER.exe packs into a `.h1c`, and
 * which the game also loads as-is from `<AE>/scenarios/`.
 */
export function generateDungeon(params: DungeonParameters, seed?: number): DungeonResult | DungeonError {
  const validation = validateParameters(params)
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
      validation
    }
  }

  const usedSeed = seed ?? Math.floor(Math.random() * 2 ** 31)
  const scenarioId = `dungeon_${usedSeed}`
  const ctx = new GenerationContext(params, usedSeed, scenarioId)
  const files: GeneratedFile[] = []
  const floorPreviews = new Map<number, LevelPreview>()
  // the lighting environments the generated levels use, for the brightness copies
  const environments = new Set<string>()
  const arenaPreviews = new Map<number, LevelPreview>()

  const fights = bossFights(params.boss)
  const lobbies = params.lobbies ?? []
  const order = campaignOrder({ levels: params.levels, fights: fights.length, lobbies: lobbies.length }, params.levelOrder)
  const label = slotLabeller(fights.map(arenaMode))
  const positionOf = new Map<string, number>()
  order.forEach((slot, position) => positionOf.set(slotEntryId(slot), position))

  /** what the arrival banner says: the slot's position in play order */
  const bannerFor = (slot: CampaignSlot): string => {
    const n = (positionOf.get(slotEntryId(slot)) ?? 0) + 1
    if (slot.kind === 'boss') return `Floor ${n} — ${arenaMode(fights[slot.index]) === 'survival' ? 'Survive!' : 'Boss'}`
    if (slot.kind === 'lobby') return `Floor ${n} — Shop`
    return `Floor ${n}`
  }
  const enter = (slot: CampaignSlot): void => {
    ctx.currentStem = slotEntryId(slot)
    ctx.currentBanner = bannerFor(slot)
    ctx.isStartLevel = order.length > 0 && slotEntryId(order[0]) === ctx.currentStem
  }

  // Floors are generated in numeric order whatever the campaign order is —
  // their draws come off ctx.rand one after another, so the order changes how
  // floors are LINKED, never how they are built.
  for (let i = 0; i < params.levels; i++) {
    const slot: CampaignSlot = { kind: 'floor', index: i }
    const position = positionOf.get(slotEntryId(slot))
    ctx.gateway = position === undefined ? { kind: 'orb' } : gatewayAfter(order, position)
    const levelBoss = floorBoss(params, i)
    ctx.floorBoss = levelBoss !== undefined ? floorBossCount(levelBoss) : 0
    ctx.floorLockButtons = floorLockButtons(params, i)
    ctx.floorLocked = ctx.floorLockButtons > 0
    ctx.floorLockDisguise = floorLockDisguised(params, i)

    let level: Level | null = null
    for (let attempt = 0; attempt < MAX_LEVEL_ATTEMPTS; attempt++) {
      ctx.clearLevel()
      enter(slot)
      const candidate = new Level(ctx, i)
      if (candidate.levelValid) {
        level = candidate
        break
      }
    }

    if (level === null) {
      return {
        ok: false,
        errors: [
          `Could not generate floor ${i + 1} after ${MAX_LEVEL_ATTEMPTS} attempts. ` +
            `The map is likely too crowded — try fewer or smaller rooms, narrower passages, or a larger map.`
        ]
      }
    }
    if (ctx.levelGargoyleShop) ctx.gargoyleShopPlaced = true

    // the optional per-floor rigs, after the floor is accepted (append-only)
    buildFloorBuffRig(ctx, params.levelBuffs?.[i], params.mapWidth, params.mapHeight)
    buildFloorHazardRig(ctx, params.levelTimers?.[i], params.mapWidth, params.mapHeight)
    buildMusicRig(ctx, params.floorMusic?.[i])
    buildFloorTrapRig(ctx, params.levelTraps?.[i], level)
    buildFloorBossRig(ctx, levelBoss, level)
    buildMysteryButtonRig(ctx, params, level, i)

    const ae = level.toAeLevel()
    if (level.missingWallPieces.length > 0) {
      return {
        ok: false,
        errors: [`Theme "${level.theme}" is missing wall pieces: ${level.missingWallPieces.slice(0, 5).join(', ')}`]
      }
    }
    files.push({ path: ctx.levelPath(ctx.currentStem), content: renderLevel(ae) })
    if (ae.environment !== null) environments.add(ae.environment)
    floorPreviews.set(i, buildPreview(ctx, level))
  }

  // Each fight is a generated arena drawing only from ctx.bossRand, so a
  // dungeon seed is the same with or without fights.
  fights.forEach((fight, i) => {
    const slot: CampaignSlot = { kind: 'boss', index: i }
    const position = positionOf.get(slotEntryId(slot))
    const gateway = position === undefined ? { kind: 'orb' as const } : gatewayAfter(order, position)
    const survival = arenaMode(fight) === 'survival' ? (fight.survival ?? defaultSurvivalOptions()) : undefined
    ctx.clearLevel()
    enter(slot)
    const { level, preview } = buildBossArena(ctx, fight.arena, params.levels + i, gateway, survival)
    files.push({ path: ctx.levelPath(ctx.currentStem), content: renderLevel(level) })
    if (level.environment !== null) environments.add(level.environment)
    arenaPreviews.set(i, preview)
  })

  // Lobbies draw from no stream at all.
  order.forEach((slot, position) => {
    if (slot.kind !== 'lobby') return
    const options = lobbies[slot.index]
    if (options === undefined) return
    const preset = lobbyPresetById(options.preset) ?? lobbyPresetById(DEFAULT_LOBBY_PRESET_ID)!
    const next = order[position + 1]
    const exitTarget = next === undefined ? slotEntryId(order[0]) : slotEntryId(next)
    ctx.clearLevel()
    enter(slot)
    const level = buildLobby(ctx, preset, options, exitTarget, params.lobbySaves === true, position)
    files.push({ path: ctx.levelPath(ctx.currentStem), content: renderLevel(level) })
  })

  const previews: LevelPreview[] = []
  for (const slot of order) {
    const p = slot.kind === 'floor' ? floorPreviews.get(slot.index) : slot.kind === 'boss' ? arenaPreviews.get(slot.index) : undefined
    if (p !== undefined) previews.push({ ...p, label: label(slot) })
  }

  const startStem = order.length > 0 ? slotEntryId(order[0]) : floorId(0)
  files.push({
    path: 'info.xml',
    content: renderInfoXml({
      name: `Dungeon #${usedSeed}`,
      description: describeCampaign(params, fights.length, lobbies.length),
      startLevel: ctx.levelPath(startStem)
    })
  })
  files.push({ path: 'logos.png', content: scenarioLogoBase64(usedSeed), encoding: 'base64' })

  return {
    ok: true,
    seed: usedSeed,
    campaignName: scenarioId,
    files,
    assetOverrides: [
      ...playerOverrides(params.playerTweaks ?? {}),
      ...environmentOverrides(environments, params.brightness ?? 'brighter')
    ],
    levels: previews
  }
}

/** One line for the scenario list: what the run holds. */
function describeCampaign(params: DungeonParameters, fights: number, lobbies: number): string {
  const parts = [`${params.levels} floor${params.levels === 1 ? '' : 's'}`]
  if (fights > 0) parts.push(`${fights} arena${fights === 1 ? '' : 's'}`)
  if (lobbies > 0) parts.push(`${lobbies} lobb${lobbies === 1 ? 'y' : 'ies'}`)
  return `A generated rogue-like dungeon: ${parts.join(', ')}.`
}

function buildPreview(ctx: GenerationContext, level: Level): LevelPreview {
  let walls = ''
  for (const t of level.tileArray) {
    walls += t.wall && !t.reserved ? '1' : '0'
  }

  return {
    level: level.levelNum,
    label: String(level.levelNum + 1),
    theme: level.theme,
    mapWidth: level.width,
    mapHeight: level.height,
    rooms: level.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      type: r.type,
      locked: r.locked,
      lockTier: r.lockTier,
      sealed: r.sealed
    })),
    passages: level.passageList.map((p) => ({
      width: p.width,
      segments: p.path.map((s) => ({ x: s.x, y: s.y, dir: s.dir.name, length: s.length }))
    })),
    monsterCount: ctx.monsters.length,
    itemCount: ctx.items.length,
    walls
  }
}
export * from './lighting'
