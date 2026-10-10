import { GenerationContext } from './core/context'
import { Level } from './map/level'
import { DungeonParameters, defaultParameters, bossFights, arenaMode, defaultSurvivalOptions, floorBoss, floorBossCount, floorLockButtons, floorLockDisguised } from './config/parameters'
import { validateParameters, ValidationResult } from './config/validation'
import { emitTweakFiles } from './tweak/overrides'
import { DEFAULT_LOBBY_PRESET_ID, buildLobby, lobbyPresetById } from './lobby'
import { buildBossArena } from './boss'
import { bossArenaId, bossArenaPath, campaignOrder, gatewayAfter, lobbyId, lobbyPath, slotEntryId, slotLabeller } from './campaign'
import { buildFloorHazardRig } from './timer/hazard'
import { buildFloorBuffRig } from './buffs/field'
import { buildMusicRig } from './music/rig'
import { buildFloorTrapRig } from './traps/floor'
import { buildFloorBossRig } from './dungeonBoss'
import { buildMysteryButtonRig } from './mystery/rig'

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
  bossArenaPath,
  campaignOrder,
  defaultOrder,
  gatewayAfter,
  isDefaultOrder,
  lobbyId,
  lobbyPath,
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
export {
  UPGRADE_KINDS,
  noUpgrades,
  oneOfEachUpgrade,
  upgradeItemPath
} from './levelTemplate/surgery'
export type { UpgradeCounts, UpgradeKind } from './levelTemplate/surgery'
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
  MonsterAct,
  MonsterFamilyDef,
  MonsterCategory,
  MonsterGroup,
  MonsterTypeDef,
  MonsterVariant,
  MonsterVariantGroup
} from './objects/monsterTypes'
export { corpseCollision, corpseCollisionPaths } from './objects/actorCollision'
export type { CorpseCollision } from './objects/actorCollision'
export {
  EXTRA_LIFE_UPGRADES,
  SHOP_PRICE_MAX,
  SKILL_UNLOCKS,
  STAT_GROUPS,
  TWEAK_BASELINE,
  TWEAK_CLASS_IDS,
  TWEAK_FIELDS,
  TWEAK_FIELD_MAP,
  applyCostCurve,
  applyCostPolicy,
  applyDeadUpgradeRemoval,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlock,
  applySkillUnlocks,
  applyStatFactor,
  applyTiersSold,
  applyValueCurve,
  buildChains,
  buildLoadouts,
  countTweaksByFile,
  currentCost,
  currentStart,
  currentValue,
  deriveCostCurve,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  deriveTiersSold,
  deriveValueCurve,
  emitTweakFiles,
  groupOfStat,
  isDeadUpgrade,
  pruneTweaks,
  resetQuickSetup,
  shopPrice,
  totalShopCost,
  PLAYER_PRESETS,
  PLAYER_PRESET_GROUPS,
  playerPresetById
} from './tweak'
export type {
  ClassLoadout,
  CostCurve,
  CostPolicy,
  CurveMode,
  LoadoutStat,
  PlayerPreset,
  PlayerPresetGroupId,
  PlayerTweaks,
  ShopRemoval,
  StatFactor,
  StatGroup,
  StatGroupId,
  TiersSold,
  TweakChain,
  TweakChainTier,
  TweakFieldDef,
  TweakUnitFile,
  ValueCurve
} from './tweak'

export interface GeneratedFile {
  /** path relative to the campaign folder, e.g. "levels/level0.xml" */
  path: string
  /** utf-8 text, or base64 when `encoding` says so */
  content: string
  /**
   * How to turn `content` back into bytes on the way out. Optional so every
   * existing producer keeps compiling; absent means utf-8. The generator still
   * returns strings only — no `fs`, no `Buffer`, no loss of purity.
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
  /**
   * Barred by a destructible wall and a button rather than a door and a key.
   * Mutually exclusive with `lockTier`, and only the final floor's orb room
   * ever sets it — see map/buttonSeal.ts.
   */
  sealed: boolean
}

export interface LevelPreview {
  level: number
  /**
   * What to call this level in the preview tabs: `3` for the third dungeon
   * floor, `B2` for the second boss fight, both 1-based. Filled from the
   * campaign order, so a rearranged campaign's tabs read in play order.
   */
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
  campaignName: string
  files: GeneratedFile[]
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
 * Generate a complete campaign in memory: one XML file per level plus
 * info.xml and levels.xml, exactly the folder LevelPacker.exe expects
 * (ported from HammerwatchGen.main).
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
  const ctx = new GenerationContext(params, usedSeed)

  const campaignName = `dungeon${usedSeed}`
  const files: GeneratedFile[] = []
  // Levels are BUILT in their own fixed sequences — floors in numeric order off
  // ctx.rand, then arenas in list order off ctx.bossRand — but LISTED in
  // campaign order, so each slot's preview is stashed here and walked at the
  // end. Under the default order the walk reproduces the old append order
  // exactly.
  const floorPreviews = new Map<number, LevelPreview>()
  const arenaPreviews = new Map<number, LevelPreview>()
  let levelString = ''

  // The campaign's play order — every lobby then every floor then every fight
  // by default, or whatever `levelOrder` arranged. Everything below reads
  // position in THIS list rather than a floor's own index: which prefab a
  // floor's way out gets, where it points, what `start` is, what a lobby's
  // teleport targets, and what order levels.xml lists.
  const fights = bossFights(params.boss)
  const lobbies = params.lobbies ?? []
  const order = campaignOrder({ levels: params.levels, fights: fights.length, lobbies: lobbies.length }, params.levelOrder)

  // Floors are still generated in numeric order, whatever the campaign order
  // is. Their draws come off ctx.rand one floor after another, so generating
  // them in a different sequence would move every seed — the order changes how
  // the floors are LINKED, never how they are built.
  const floorPosition = new Map<number, number>()
  order.forEach((slot, position) => {
    if (slot.kind === 'floor') floorPosition.set(slot.index, position)
  })

  for (let i = 0; i < params.levels; i++) {
    // Set before the constructor runs: `Level` and `Room.transform` both read
    // it while placing the exit/orb room, and objectSet.ts reads it for the
    // stairs' target. A floor the order somehow never mentions cannot happen —
    // normalizeOrder appends every missing slot — but fall back to the orb
    // rather than a null gateway if it ever did.
    const position = floorPosition.get(i)
    ctx.gateway = position === undefined ? { kind: 'orb' } : gatewayAfter(order, position)
    // Read during construction too, and for the same reason: a boss floor's way
    // out is a sealed portal room rather than a stairs room, which `Level` and
    // `Room.transform` decide while the floor is being built, not after.
    const levelBoss = floorBoss(params, i)
    ctx.floorBoss = levelBoss !== undefined ? floorBossCount(levelBoss) : 0
    // Issue #69: same timing, same reason — a locked floor is sealed too.
    ctx.floorLockButtons = floorLockButtons(params, i)
    ctx.floorLocked = ctx.floorLockButtons > 0
    ctx.floorLockDisguise = floorLockDisguised(params, i)

    let level: Level | null = null
    for (let attempt = 0; attempt < MAX_LEVEL_ATTEMPTS; attempt++) {
      const candidate = new Level(ctx, i)
      if (candidate.levelValid) {
        level = candidate
        break
      }
      ctx.clearLevel()
    }

    if (level === null) {
      return {
        ok: false,
        errors: [
          `Could not generate level ${i + 1} after ${MAX_LEVEL_ATTEMPTS} attempts. ` +
            `The map is likely too crowded — try fewer or smaller rooms, narrower passages, or a larger map.`
        ]
      }
    }

    // The four optional per-floor rigs, in the order the form lists them. All
    // are built AFTER the floor is complete, so every dungeon id is already
    // allocated and they can only append — a seed's walls, rooms, doodads,
    // actors and items are identical whether any is on. Each emits nothing at
    // all when its floor is unconfigured, so turning one on never moves
    // another's ids. Three of them draw no random value at all
    // (buffs/field.ts, timer/hazard.ts, music/rig.ts); traps/floor.ts draws,
    // but only from ctx.trapRand, which no floor's layout has ever read.
    buildFloorBuffRig(ctx, params.levelBuffs?.[i], params.mapWidth, params.mapHeight)
    buildFloorHazardRig(ctx, params.levelTimers?.[i], params.mapWidth, params.mapHeight)
    buildMusicRig(ctx, params.floorMusic?.[i])
    // Traps are the fourth, and the only one that DRAWS — one ctx.trapRand
    // iRand per placed spewer. Last of the four so arming them cannot move a
    // buff, timer or music node's id, and here rather than inside `new Level()`
    // because the retry loop above discards candidates and nothing can rewind a
    // Rand: drawing in the constructor would tie a floor's trap positions to
    // how many times reachability happened to reject it. See traps/floor.ts.
    buildFloorTrapRig(ctx, params.levelTraps?.[i], level)

    // Fifth and last: the dungeon boss (issue #61). After the four above so
    // arming one cannot move a buff, timer, music or ordinary-trap node's id,
    // and drawing from ctx.floorBossRand — its own stream — so it cannot move
    // an armed floor's spewer positions or any arena's layout either.
    //
    // The one thing it does move is this floor's own layout, and every floor
    // after it, because a boss floor takes a different branch inside `new
    // Level()` above. That is decided by ctx.floorBoss, not here.
    buildFloorBossRig(ctx, levelBoss, level)

    // Sixth: mystery buttons (issue #67). Last, so arming them cannot move any
    // other rig's ids, and drawing from ctx.mysteryRand alone, so they move no
    // floor's layout, no floor trap and no floor boss. Their plates keep clear
    // of the boss's tiles and the lock buttons, which is why they come after.
    buildMysteryButtonRig(ctx, params, level, i)

    files.push({ path: `levels/level${i}.xml`, content: level.getXML() })
    floorPreviews.set(i, buildPreview(ctx, level))
    ctx.clearLevel()
  }

  // Each boss fight is a generated arena, appended after every numeric dungeon
  // floor — emitted after the level loop, drawing nothing from ctx.rand or
  // ctx.cosmeticRand (the arenas have their own ctx.bossRand stream), so the
  // same seed produces the same dungeon whether the boss is on or off. It
  // only appends level entries; `start` is untouched.
  //
  // Where one fight leads is purely a matter of the campaign ORDER, exactly
  // like a floor's stairs: the next slot, whatever kind it is (another fight
  // directly, or a lobby first if the dungeon master put a shop there), or the
  // victory orb if this is the last slot in the whole campaign.
  //
  // They share ctx.bossRand in list order, so fight 0 draws precisely what a
  // single-fight campaign has always drawn and each extra fight continues the
  // stream after it. Adding a second fight therefore cannot move the first.
  const bossPosition = new Map<number, number>()
  order.forEach((slot, position) => {
    if (slot.kind === 'boss') bossPosition.set(slot.index, position)
  })

  fights.forEach((fight, i) => {
    const position = bossPosition.get(i)
    const gateway = position === undefined ? { kind: 'orb' as const } : gatewayAfter(order, position)

    // A survival fight hands its options through; a boss fight passes nothing,
    // which is what selects the mode inside. `defaultSurvivalOptions()` covers
    // a fight a hand-written file flipped to survival without describing one.
    const survival = arenaMode(fight) === 'survival' ? (fight.survival ?? defaultSurvivalOptions()) : undefined

    const { xml, preview } = buildBossArena(ctx, fight.arena, params.levels + i, gateway, survival)
    files.push({ path: bossArenaPath(i), content: xml })
    arenaPreviews.set(i, preview)
  })

  // Every lobby is a hand-authored shop room, built after both loops above and
  // drawing nothing from either RNG stream — exactly like emitTweakFiles. Same
  // seed means the same dungeon whatever lobbies the order carries; a lobby
  // slot only ever appends a level entry and points its own teleport at
  // whichever slot follows it — the next floor, the next fight's arena, or
  // even another lobby.
  //
  // Validation forbids a lobby from being the campaign's last slot (it has no
  // victory orb of its own), but the generator falls back to `'0'` rather than
  // throwing if one somehow got there anyway — a hand-edited parameters.txt
  // bypasses the form, and invariant #5 is "validate, don't crash".
  const usedLobbyPresets = new Set<string>()
  order.forEach((slot, position) => {
    if (slot.kind !== 'lobby') return
    const options = lobbies[slot.index]
    if (options === undefined) return
    const preset = lobbyPresetById(options.preset) ?? lobbyPresetById(DEFAULT_LOBBY_PRESET_ID)!
    usedLobbyPresets.add(preset.id)

    const next = order[position + 1]
    const exitTarget = next === undefined ? '0' : slotEntryId(next)
    files.push({
      path: lobbyPath(slot.index),
      content: buildLobby(preset, options, exitTarget, params.lobbySaves)
    })
  })

  // The union of every preset actually used, deduped by path — two
  // dungeon-prep lobbies (or a campaign that never uses a lobby at all) must
  // not push the same asset file twice, or ship one nothing references.
  const seenAssetPaths = new Set<string>()
  for (const presetId of usedLobbyPresets) {
    for (const asset of lobbyPresetById(presetId)!.assets) {
      if (seenAssetPaths.has(asset.path)) continue
      seenAssetPaths.add(asset.path)
      files.push(asset)
    }
  }

  // levels.xml lists the campaign in PLAY order, and the in-game floor label
  // counts positions in that order rather than a floor's own index. Every kind
  // of slot — floor, fight, lobby — is exactly one level and consumes exactly
  // one label; under the default order with no lobbies this is floors 0..N-1
  // then the fights, which is exactly what was emitted before the order was
  // configurable.
  const previews: LevelPreview[] = []
  // Arena chips read AB1/AS2 — the prefix is the fight's mode, the number its
  // position in the fight list. See campaign.ts's slotLabel.
  const label = slotLabeller(fights.map(arenaMode))
  let floorLabel = 0
  for (const slot of order) {
    if (slot.kind === 'floor') {
      levelString += `<level id="${slot.index}" res="levels/level${slot.index}.xml" name="lvl.floor?floor=${floorLabel}" />\n`
      floorLabel += 1
      const preview = floorPreviews.get(slot.index)
      if (preview !== undefined) previews.push({ ...preview, label: label(slot) })
    } else if (slot.kind === 'boss') {
      levelString += `<level id="${bossArenaId(slot.index)}" res="${bossArenaPath(slot.index)}" name="lvl.floor?floor=${floorLabel}" />\n`
      floorLabel += 1
      const preview = arenaPreviews.get(slot.index)
      if (preview !== undefined) previews.push({ ...preview, label: label(slot) })
    } else {
      // A lobby contributes no preview — it has no generated geometry, and
      // LobbyDiagram in the form is its stand-in.
      levelString += `<level id="${lobbyId(slot.index)}" res="${lobbyPath(slot.index)}" name="lvl.floor?floor=${floorLabel}" />\n`
      floorLabel += 1
    }
  }

  files.push({
    path: 'info.xml',
    content:
      '<info>\n' +
      `	<name>Dungeon #${usedSeed}</name>\n` +
      '	<description></description>\n' +
      '	<lives>0</lives>\n' +
      '</info>'
  })

  // Whatever the campaign order opens on — a lobby, a floor or a fight's
  // arena. Order is never empty when generation actually reaches this point
  // (validation requires at least one floor or an enabled boss), but the
  // fallback is here rather than a non-null assertion for the same reason as
  // the lobby exit-target fallback above.
  const startLevel = order.length > 0 ? slotEntryId(order[0]) : '0'

  files.push({
    path: 'levels.xml',
    content:
      `<levels start="${startLevel}">\n` +
      '<act name="lvl.act1">\n' +
      levelString +
      '       </act>\n' +
      '</levels>'
  })

  // Only the balance files the user actually edited. Untouched = no tweak/ folder,
  // so a stock run produces exactly the same campaign it always did.
  files.push(...emitTweakFiles(params.playerTweaks))

  return { ok: true, seed: usedSeed, campaignName, files, levels: previews }
}

function buildPreview(ctx: GenerationContext, level: Level): LevelPreview {
  let walls = ''
  for (const t of level.tileArray) {
    walls += t.wall ? '1' : '0'
  }

  return {
    level: level.levelNum,
    // as in the arena's preview: a placeholder the campaign-order walk replaces
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
