import {
  BOSS_CHECKPOINT_PRESETS,
  BOSS_COVER_DENSITY_MAX,
  BOSS_COVER_PATTERNS,
  BOSS_DEATH_WAVE,
  BOSS_FLOOR_PATTERNS,
  BOSS_IDS,
  BOSS_INVULN_COUNT,
  BOSS_INVULN_THRESHOLDS,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  MAX_BOSS_INVULN_SECONDS,
  BUFF_TARGETS,
  MAX_TIMER_DAMAGE,
  MAX_TIMER_FREQ_MS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_FREQ_MS,
  TIMER_COUNTDOWN_NODE_WARN,
  DungeonParameters,
  THEMES,
  isScatterMode,
  waveSpawnMode,
  waveBuffs,
  wavePickups,
  waveTraps,
  BOSS_TRAP_DIRECTIONS,
  MAX_TRAP_COUNT,
  TRAP_FAST_SPAWN_RATE_MS,
  TRAP_SPREAD_MAX,
  SURVIVAL_COUNTDOWN_STYLES,
  SURVIVAL_SECONDS_MAX,
  SURVIVAL_COUNTDOWN_NODE_WARN,
  MOBILE_BOSS_IDS,
  MAX_BOSS_COUNT,
  BOSS_COUNT_WARN,
  BOSS_SELECTIONS,
  arenaBossCount,
  floorBossCount,
  bossSelection,
  isMultiBoss,
  arenaMode,
  survivalBuffs,
  survivalPickups,
  survivalTraps,
  survivalWaves,
  floorLocked,
  floorLockButtons,
  MAX_LOCK_BUTTONS,
  MAX_MYSTERY_MONSTERS,
  MAX_MYSTERY_PER_FLOOR,
  MAX_MYSTERY_TRAP_SECONDS,
  MYSTERY_NAME_MAX,
  MYSTERY_TEXT_MAX
} from './parameters'
import { mysteryLootById } from '../objects/mysteryLoot'
import { mysteryCapacity } from '../mystery/placement'
import { MUSIC_DEFAULT, MUSIC_TRACKS, isKnownMusicId } from '../music/tracks'
import type { BossTrapDirection, TrapDirection } from './parameters'
import type { BossFight, BossOptions } from './parameters'
import type { CampaignSlot } from '../campaign'
import { getTheme } from './themes'
import {
  defaultTier,
  isKnownFamilyId,
  isKnownFloorPoolKey,
  isKnownMonsterId,
  isKnownMonsterKey,
  monsterFamilyById,
  monsterTypeById,
  parseMonsterKey,
  resolveActorPath
} from '../objects/monsterTypes'
import { BOSS_DEFS, expandLineup, isMobileBoss, topWallBossClearance, topWallBossY, UNIQUE_BOSS_IDS } from '../boss/bosses'
import type { BossDef } from '../boss/bosses'
import { arenaBossLayout } from '../boss/geometry'
import { anchors as computeAnchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from '../boss/anchors'
import { corpseCollision } from '../objects/actorCollision'
import { BUFF_HELPFUL_IDS, buffById } from '../objects/buffTypes'
import { MAX_PICKUP_COUNT, pickupById } from '../objects/pickupTypes'
import { projectileById } from '../objects/projectileTypes'
import { LOBBY_DIAMOND_VALUE } from '../lobby/build'
import { LOBBY_PRESETS } from '../lobby/presets'
import { ALL_LOBBY_CATEGORIES, isLobbyCategory, lobbyCategoryCounts, vendorOfCategory } from '../lobby/shops'
import { DIAMOND_VALUE, MAX_DIAMOND_COUNT, UPGRADE_KINDS } from '../levelTemplate/surgery'
import type { UpgradeCounts } from '../levelTemplate/surgery'
import { ARENA_LAYOUT_SLOTS, ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, freeFloorArea } from '../boss/geometry'
import { wallCapacity } from '../boss/traps'
import { floorTrapCapacity } from '../traps/floor'
import { scaledMax } from '../boss/waves'
import { TWEAK_BASELINE } from '../tweak/baseline'
import { SHOP_PRICE_MAX } from '../tweak/bulk'
import { SENTINELS, isDowngrade, improvesBy, paramKey } from '../tweak/chains'
import { TWEAK_FIELDS, TWEAK_FIELD_MAP } from '../tweak/overrides'
import type { TweakFieldDef } from '../tweak/overrides'
import type { PlayerTweaks } from '../tweak/types'

export interface ValidationIssue {
  /** parameter field the issue belongs to, for inline display in the GUI */
  field: string
  message: string
}

export interface ValidationResult {
  /** blocking problems — generation is refused while any exist */
  errors: ValidationIssue[]
  /** non-blocking hints (capacity, conventions) */
  warnings: ValidationIssue[]
  valid: boolean
}

/**
 * Guards against every crash/hang path of the original Java tool:
 * ArrayIndexOutOfBounds on short theme/monster lists, doors drawn outside
 * rooms when passages are wider than rooms, entrances that can never fit,
 * and impossible room layouts that made it retry forever.
 */
export function validateParameters(p: DungeonParameters): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const requirePositiveInt = (field: string, value: number, min = 1) => {
    if (!Number.isInteger(value) || value < min) {
      errors.push({ field, message: `Must be a whole number ≥ ${min}.` })
      return false
    }
    return true
  }

  // 0 floors is legal and means "boss-only campaign": no generated dungeon at
  // all, straight into the arena (or a lobby first, if one leads to it). The
  // rules just below keep that honest.
  requirePositiveInt('levels', p.levels, 0)
  if (p.levels === 0 && p.boss?.enabled !== true) {
    errors.push({
      field: 'levels',
      message: 'With 0 floors the boss fight must be enabled — otherwise the campaign has no levels to play.'
    })
  }
  requirePositiveInt('minRoomSize', p.minRoomSize, 3)
  requirePositiveInt('maxRoomSize', p.maxRoomSize, 3)
  requirePositiveInt('minPassageWidth', p.minPassageWidth)
  requirePositiveInt('maxPassageWidth', p.maxPassageWidth)
  requirePositiveInt('minRoomCount', p.minRoomCount, 2)
  requirePositiveInt('maxRoomCount', p.maxRoomCount, 2)
  requirePositiveInt('mapWidth', p.mapWidth, 20)
  requirePositiveInt('mapHeight', p.mapHeight, 20)
  requirePositiveInt('edgePadding', p.edgePadding, 0)
  requirePositiveInt('roomPadding', p.roomPadding, 0)

  if (p.minRoomSize > p.maxRoomSize) {
    errors.push({ field: 'minRoomSize', message: 'Min room size must be ≤ max room size.' })
  }
  if (p.minPassageWidth > p.maxPassageWidth) {
    errors.push({ field: 'minPassageWidth', message: 'Min passage width must be ≤ max passage width.' })
  }
  if (p.minRoomCount > p.maxRoomCount) {
    errors.push({ field: 'minRoomCount', message: 'Min room count must be ≤ max room count.' })
  }

  // rooms must fit on the map (room height rolls up to maxRoomSize + 2)
  if (p.maxRoomSize + 2 * p.edgePadding > p.mapWidth) {
    errors.push({
      field: 'maxRoomSize',
      message: `Max room size + edge padding doesn't fit the map width (needs ≤ ${p.mapWidth - 2 * p.edgePadding}).`
    })
  }
  if (p.maxRoomSize + 2 + 2 * p.edgePadding > p.mapHeight) {
    errors.push({
      field: 'maxRoomSize',
      message: `Rooms can be up to ${p.maxRoomSize + 2} tiles tall and won't fit the map height (needs max room size ≤ ${p.mapHeight - 2 - 2 * p.edgePadding}).`
    })
  }

  // passage doors are carved out of room edges — a passage wider than the
  // smallest room would place doors outside the room (crash in the original)
  if (p.maxPassageWidth > p.minRoomSize) {
    errors.push({
      field: 'maxPassageWidth',
      message: `Max passage width must be ≤ min room size (${p.minRoomSize}), or doors end up outside rooms.`
    })
  }

  // a locked exit room needs a dead end of its own, plus somewhere else to put
  // the button that opens it — on a two-room floor the entrance is the only
  // other room
  const anyLocked = Array.from({ length: p.levels }, (_, i) => floorLocked(p, i)).some(Boolean)
  if (anyLocked && p.minRoomCount < 3) {
    warnings.push({
      field: 'minRoomCount',
      message:
        'With a locked floor, floors with fewer than 3 rooms leave almost nowhere to put the button that opens it.'
    })
  }

  // a lock's button count (issue #69 part 2): a whole number, 0..MAX. 0 is
  // legal — it is "no button", which leaves a boss floor boss-only and any
  // other floor unlocked
  ;(p.levelLock ?? []).slice(0, Math.max(p.levels, 0)).forEach((lock, i) => {
    if (!lock.enabled || lock.buttons === undefined) return
    if (!Number.isInteger(lock.buttons) || lock.buttons < 0 || lock.buttons > MAX_LOCK_BUTTONS) {
      errors.push({
        field: `levelLock.${i}.buttons`,
        message: `Level ${i + 1}: buttons must be a whole number from 0 to ${MAX_LOCK_BUTTONS}.`
      })
    }
  })

  // the entrance/exit stair prefab is 6 tiles wide and needs room to spare
  if (p.maxRoomSize < 7) {
    errors.push({
      field: 'maxRoomSize',
      message: 'Max room size must be ≥ 7 so the entrance/exit stairs (6 tiles wide) can fit in at least some rooms.'
    })
  }

  // themes: the original crashed with ArrayIndexOutOfBounds when the theme
  // list was shorter than the level count
  if (p.themes.length < p.levels) {
    errors.push({
      field: 'themes',
      message: `Need one theme per level: ${p.levels} levels but only ${p.themes.length} theme(s).`
    })
  }
  p.themes.slice(0, p.levels).forEach((t, i) => {
    if (!(THEMES as readonly string[]).includes(t)) {
      errors.push({
        field: 'themes',
        message: `Level ${i + 1} theme "${t}" is not one of: ${THEMES.join(', ')}.`
      })
    }
  })
  // a theme's cosmetic caveat is a property of the theme, not of the level, so
  // it is reported once however many levels use it — the same collapsing the
  // bulk tweak warnings do
  for (const id of new Set(p.themes.slice(0, p.levels))) {
    const note = getTheme(id)?.cosmeticWarning
    if (note !== undefined) {
      warnings.push({ field: 'themes', message: note })
    }
  }

  // per-level monster pools
  if (p.levelMonsters.length < p.levels) {
    errors.push({
      field: 'levelMonsters',
      message: `Need a monster pool per level: ${p.levels} levels but only ${p.levelMonsters.length} pool(s).`
    })
  }
  p.levelMonsters.slice(0, p.levels).forEach((pool, i) => {
    if (pool.length === 0) {
      errors.push({ field: 'levelMonsters', message: `Level ${i + 1} has an empty monster pool.` })
    }
    for (const key of pool) {
      // A floor pool entry is either a bare id (roll the type's ladder) or
      // `id#tier` pinning one actor. isKnownFloorPoolKey, NOT the arena's
      // isKnownMonsterKey — see its comment for why the two grammars differ.
      if (isKnownFloorPoolKey(key)) continue
      const { id, tier } = parseMonsterKey(key)
      const family = monsterFamilyById(id)
      if (family) {
        // The only way to fail with a known family id is a `#tier` suffix.
        // Name the members rather than a tier range — a family has no tiers,
        // and "pick tower_banner2" is the answer the user actually needs.
        errors.push({
          field: 'levelMonsters',
          message: `Level ${i + 1} pool entry "${key}" adds a tier to the family "${id}", which has none. Use the family on its own, or name a member: ${family.members.join(', ')}.`
        })
      } else if (!isKnownMonsterId(id)) {
        errors.push({ field: 'levelMonsters', message: `Level ${i + 1} pool contains unknown monster "${key}".` })
      } else {
        // Say what the legal range is: the tier suffix is the one part of the
        // grammar a user has to discover, and "unknown monster" would be a lie.
        const last = monsterTypeById(id).tiers.length - 1
        const what = Number.isInteger(tier) ? `tier ${tier}` : 'a non-numeric tier'
        errors.push({
          field: 'levelMonsters',
          message: `Level ${i + 1} pool entry "${key}" names ${what}; "${id}" has tiers 0-${last}.`
        })
      }
    }
    // A pooled type capped at 0 spawns an empty horde, which reads in game as a
    // lair that is simply missing its monsters. Advisory, not fatal: 0 is the
    // documented way to disable a type, so a stale pool entry is a mistake worth
    // pointing at rather than a reason to refuse to generate.
    // A family is capped in its own right, so it is checked by its own id and
    // never by its members' — pooling `tower_flower` with a cap of 6 is not
    // silent just because `tower_flower1` ships at 0.
    const silent = [...new Set(pool.map((key) => parseMonsterKey(key).id))].filter(
      (id) => (isKnownMonsterId(id) || isKnownFamilyId(id)) && (p.monsterMax[id] ?? 0) === 0
    )
    if (silent.length > 0) {
      warnings.push({
        field: 'levelMonsters',
        message: `Level ${i + 1} pools ${silent.join(', ')} but its max count is 0, so those lairs spawn nothing.`
      })
    }
  })

  const chanceFields: Array<[string, number]> = [
    ['shopChance', p.shopChance],
    ['vaultChance', p.vaultChance],
    ['lockChance', p.lockChance],
    ['keyChance', p.keyChance]
  ]
  for (const [field, value] of chanceFields) {
    if (!(value >= 0 && value <= 1)) {
      errors.push({ field, message: 'Chance must be between 0 and 1.' })
    }
  }
  const multiplierFields: Array<[string, number]> = [
    ['monsterMultiplier', p.monsterMultiplier],
    ['goldMultiplier', p.goldMultiplier],
    ['foodMultiplier', p.foodMultiplier]
  ]
  for (const [field, value] of multiplierFields) {
    if (!(value >= 0)) {
      errors.push({ field, message: 'Multiplier must be ≥ 0.' })
    }
  }

  for (const [id, max] of Object.entries(p.monsterMax)) {
    if (!Number.isInteger(max) || max < 0) {
      errors.push({ field: `monsterMax.${id}`, message: 'Max count must be a whole number ≥ 0.' })
    }
  }

  // capacity heuristic: average room footprint (incl. padding) vs usable map
  if (errors.length === 0) {
    const avgRoomW = (p.minRoomSize + p.maxRoomSize) / 2 + p.roomPadding
    const avgRoomH = (p.minRoomSize + 2 + p.maxRoomSize + 2) / 2 + p.roomPadding
    const usable = (p.mapWidth - 2 * p.edgePadding) * (p.mapHeight - 2 * p.edgePadding)
    const needed = p.maxRoomCount * avgRoomW * avgRoomH
    if (needed > usable) {
      warnings.push({
        field: 'maxRoomCount',
        message:
          'Rooms of this size and count may not all fit — generation will place fewer rooms or retry. ' +
          'Consider a larger map or fewer/smaller rooms.'
      })
    }

    if (p.mapWidth % 20 !== 0 || p.mapHeight % 20 !== 0) {
      warnings.push({
        field: 'mapWidth',
        message: 'Map sizes that are multiples of 20 line up best with Hammerwatch tilemap blocks.'
      })
    }
  }

  validatePlayerTweaks(p, errors, warnings)
  validateLevelBuffs(p, errors, warnings)
  validateLevelTraps(p, errors, warnings)
  validateLevelBoss(p, errors, warnings)
  validateMystery(p, errors, warnings)
  validateLevelTimers(p, errors, warnings)
  validateFloorMusic(p, errors, warnings)
  validateLobbies(p, errors, warnings)
  validateBoss(p, errors, warnings)
  validateLevelOrder(p, errors)

  return { errors, warnings, valid: errors.length === 0 }
}

/**
 * A lobby is a hand-authored template with a fixed number of authored slots,
 * so its rules are about what the template can physically carry rather than
 * about layout feasibility.
 *
 * Not a game limit, either of the below. Both `LOBBY_PRESETS` rooms stack
 * diamonds round-robin over their authored slots without bound, so any amount
 * of starting gold fits — it just piles deeper on the same spots. This
 * ceiling exists only so a typed typo (`99999999999`) is rejected instead of
 * emitting millions of `<item>` nodes and hanging the generator.
 */
export const GOLD_SAFETY_MAX = DIAMOND_VALUE * MAX_DIAMOND_COUNT

/**
 * The same kind of ceiling for the free upgrade pickups, per kind.
 *
 * Also not a game limit: a count above one stacks on the kind's single slot, so
 * any number "fits" the room. This exists so a typo cannot ask for a million
 * `<array>` entries, and it is deliberately generous — the dungeon master is
 * meant to be able to hand out an absurd pile if that is the campaign.
 */
export const UPGRADE_COUNT_MAX = 10_000

/**
 * The shared rule for one room's free upgrade counts.
 *
 * Every lobby, whichever preset it edits, carries the identical block, so the
 * messages are generated from the field prefix rather than written twice.
 */
function validateUpgrades(
  upgrades: UpgradeCounts | undefined,
  field: string,
  errors: ValidationIssue[]
): void {
  // a config written before the feature existed has no block at all; that means
  // "none", not "invalid" — the same reading as a missing lobby
  if (upgrades === undefined) return

  for (const kind of UPGRADE_KINDS) {
    const count = upgrades[kind]
    if (count === undefined) continue
    if (!Number.isInteger(count) || count < 0) {
      errors.push({ field, message: `The ${kind} upgrade count must be a whole number ≥ 0.` })
    } else if (count > UPGRADE_COUNT_MAX) {
      errors.push({
        field,
        message: `The ${kind} upgrade count cannot exceed ${UPGRADE_COUNT_MAX} — not a game limit, just the point past which the stack is too large to emit.`
      })
    }
  }
}

/**
 * The campaign's play order, when one is stored.
 *
 * Absent is always valid — it means the default order, which is what every
 * campaign had before this was configurable. A stored order has to describe
 * exactly this campaign: one entry per lobby, per floor and per boss fight, no
 * duplicates, nothing that does not exist, and each of the three sequences
 * ascending. Only the interleaving is free — except that a lobby can never be
 * the campaign's very last entry, since it has no victory orb of its own.
 *
 * `campaign.normalizeOrder` can repair every one of these, and the importer
 * uses it so a stale file is never fatal — but the form edits the stored value
 * directly, so a broken order still has to be reportable rather than silently
 * rewritten under the dungeon master.
 */
function validateLevelOrder(p: DungeonParameters, errors: ValidationIssue[]): void {
  const order = p.levelOrder
  if (order === undefined) return

  const fightCount = p.boss?.enabled === true ? (p.boss.fights?.length ?? 0) : 0
  const lobbyCount = p.lobbies?.length ?? 0
  const limit = (kind: string): number => (kind === 'floor' ? p.levels : kind === 'boss' ? fightCount : lobbyCount)
  const name = (slot: CampaignSlot): string =>
    slot.kind === 'floor' ? `floor ${slot.index + 1}` : slot.kind === 'boss' ? `boss fight ${slot.index + 1}` : `lobby ${slot.index + 1}`

  const seen = new Set<string>()
  const last = new Map<string, number>()
  for (const slot of order) {
    if (slot === null || typeof slot !== 'object' || (slot.kind !== 'floor' && slot.kind !== 'boss' && slot.kind !== 'lobby')) {
      errors.push({ field: 'levelOrder', message: 'The floor order contains an entry that is neither a floor, a boss fight nor a lobby.' })
      continue
    }
    if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index >= limit(slot.kind)) {
      errors.push({
        field: 'levelOrder',
        message: `The floor order names ${name(slot)}, which this campaign does not have.`
      })
      continue
    }

    const key = `${slot.kind}:${slot.index}`
    if (seen.has(key)) {
      errors.push({ field: 'levelOrder', message: `The floor order lists ${name(slot)} more than once.` })
      continue
    }
    seen.add(key)

    // ascending within each kind — the interleaving is free, the numbering is not
    const previous = last.get(slot.kind)
    if (previous !== undefined && slot.index < previous) {
      errors.push({
        field: 'levelOrder',
        message: `The floor order puts ${name(slot)} after a later one. Floors, boss fights and lobbies each stay in their own order; only how they interleave is up to you.`
      })
    }
    last.set(slot.kind, slot.index)
  }

  const named = [
    ...Array.from({ length: Math.max(0, lobbyCount) }, (_, index) => ({ kind: 'lobby' as const, index })),
    ...Array.from({ length: Math.max(0, p.levels) }, (_, index) => ({ kind: 'floor' as const, index })),
    ...Array.from({ length: Math.max(0, fightCount) }, (_, index) => ({ kind: 'boss' as const, index }))
  ]
  for (const slot of named) {
    if (!seen.has(`${slot.kind}:${slot.index}`)) {
      errors.push({ field: 'levelOrder', message: `The floor order never places ${name(slot)}.` })
    }
  }

  // A lobby has no victory orb of its own, so it may never be the campaign's
  // very last entry — including when it is the ONLY thing the order names.
  // Checked after the rules above so a malformed order reports its actual
  // problem first, rather than a misleading "ends in a lobby" on top of it.
  if (order.length > 0) {
    const lastSlot = order[order.length - 1]
    if (lastSlot !== null && typeof lastSlot === 'object' && lastSlot.kind === 'lobby') {
      errors.push({
        field: 'levelOrder',
        message: 'The campaign cannot end in a lobby: the last floor or boss arena carries the victory orb.'
      })
    }
  }
}

/**
 * Every rule for one lobby. Field keys are scoped by index (`lobbies.0.*`) so
 * the form can anchor an inline message to the sub-tab that is actually
 * wrong — the same shape `validateBossFight` uses for `boss.fights.N.*`.
 */
function validateLobbies(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // a settings file or parameters.txt written before the feature existed has no
  // lobbies list at all; that means "none", not "invalid"
  const lobbies = p.lobbies
  if (lobbies === undefined) return

  lobbies.forEach((lobby, index) => validateLobby(lobby, index, p, errors, warnings))
}

function validateLobby(
  lobby: DungeonParameters['lobbies'][number],
  index: number,
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const before = errors.length
  /** field key for one setting of this lobby */
  const lf = (suffix: string): string => `lobbies.${index}.${suffix}`

  if (LOBBY_PRESETS.every((preset) => preset.id !== lobby.preset)) {
    errors.push({
      field: lf('preset'),
      message: `"${lobby.preset}" is not a lobby preset. Valid presets: ${LOBBY_PRESETS.map((preset) => preset.id).join(', ')}.`
    })
  }

  // music: unset/default means "leave the template's own music alone"
  if (!isKnownMusicId(lobby.music)) {
    errors.push({
      field: lf('music'),
      message: `"${lobby.music}" is not a music track. Valid tracks: ${MUSIC_DEFAULT}, ${MUSIC_TRACKS.map((t) => t.id).join(', ')}.`
    })
  }

  const gold = lobby.startingGold
  if (!Number.isInteger(gold) || gold < 0) {
    errors.push({ field: lf('startingGold'), message: 'Starting gold must be a whole number ≥ 0.' })
  } else if (gold % LOBBY_DIAMOND_VALUE !== 0) {
    errors.push({
      field: lf('startingGold'),
      message: `Starting gold must be a multiple of ${LOBBY_DIAMOND_VALUE} — each ${LOBBY_DIAMOND_VALUE} is one red diamond.`
    })
  } else if (gold > GOLD_SAFETY_MAX) {
    errors.push({
      field: lf('startingGold'),
      message: `Starting gold cannot exceed ${GOLD_SAFETY_MAX} — not a game limit, just the point past which the diamond pile is too large to emit.`
    })
  }

  validateUpgrades(lobby.upgrades, lf('upgrades'), errors)

  const unknown = lobby.shopCategories.filter((c) => !isLobbyCategory(c))
  for (const id of [...new Set(unknown)].sort()) {
    errors.push({
      field: lf('shopCategories'),
      message: `"${id}" is not a shop column. Valid columns: ${ALL_LOBBY_CATEGORIES.join(', ')}.`
    })
  }

  if (errors.length > before) return

  if (lobby.shopCategories.length === 0) {
    warnings.push({
      field: lf('shopCategories'),
      message: 'This lobby has no vendors; the party can only walk to the teleport.'
    })
  }

  // a column the Player tab has emptied leaves a vendor standing behind an
  // empty stall. Collapsed into one message the way the bulk tweak warnings
  // are — deselecting every ladder in the game would otherwise fire 21 of them.
  const counts = lobbyCategoryCounts(p.playerTweaks ?? {})
  const empty = lobby.shopCategories.filter((c) => counts[c] === 0)
  if (empty.length > 0) {
    const vendors = [...new Set(empty.map((c) => vendorOfCategory(c)?.label ?? c))].sort()
    warnings.push({
      field: lf('shopCategories'),
      message:
        `${empty.length === 1 ? 'One selected shop column has' : `${empty.length} selected shop columns have`} ` +
        `no upgrades left after the Player tab's edits (${vendors.join(', ')}). ` +
        'Those stalls will stand in this lobby with nothing to sell.'
    })
  }
}

/**
 * Scattered spawns per arena that start drawing a warning, counted across all
 * four tiers. A scattered monster is one `SpawnObject` script node of its own —
 * the anchor rig fits any horde in at most 9 nodes, a scatter needs one per
 * monster — so a big scatter quietly turns into a big level.
 *
 * Counted per arena rather than per monster because the node budget is a
 * property of the floor, not of one pool entry: the stock presets scatter
 * 1000-1300 nodes spread over ~40 entries and none of them is remarkable on its
 * own. Advisory only — there is no upper limit.
 */
export const BOSS_SCATTER_WARN = 2000

/**
 * Countdown ticks (one AnnounceText node per second, summed across all three
 * windows) past which the arena is warned about node count. Same spirit as
 * BOSS_SCATTER_WARN: not a limit, a nudge.
 */
const BOSS_COUNTDOWN_NODE_WARN = 200

/**
 * How many spawns a scattered monster actually emits — the same arithmetic
 * `buildWaveRig` applies, imported rather than re-derived so a message can
 * never quote a number the generator disagrees with. Endless (`-1`) has its
 * own error, so it counts as nothing here.
 */
function scatterCount(max: number, monsterMultiplier: number): number {
  return max === -1 ? 0 : scaledMax(max, monsterMultiplier)
}

/**
 * Bounds on any wave-side interval in milliseconds: a tier's shared interval, a
 * per-monster override, and the scatter batch timer. Below 100 ms the timer is
 * effectively per-frame; above a minute it is indistinguishable from off.
 */
const MIN_WAVE_INTERVAL_MS = 100
const MAX_WAVE_INTERVAL_MS = 60000

/**
 * Whether `pool` (a list of boss ids, not necessarily validated yet — callers
 * filter to known ids first) can fit `count` bosses into an arena of exactly
 * `minWidth` x `minHeight`, over EVERY combination the seed could actually
 * draw (issue #64 part 1). `pickBosses` never repeats a unique boss (dragon,
 * queen) within one pick, so the search only enumerates combinations that
 * respect that. The enumeration depth is capped at `ARENA_LAYOUT_SLOTS` (5:
 * topWall + primary + three offsets), NOT at `count` — `arenaBossLayout`
 * never computes more than five distinct positions however large `count` is,
 * since bosses beyond the fixed slots stack onto one already in use, so
 * checking a combo longer than five would only re-check a slot assignment
 * this function has already covered. That keeps the brute force at
 * `pool.length ** min(count, 5)`, bounded by `BOSS_IDS.length` (7), so at
 * most 16807 calls to the pure, draw-free `arenaBossLayout` — independent of
 * `MAX_BOSS_COUNT` (issue #64 follow-up).
 *
 * The entrance rectangle and the 9 anchors are recomputed here with no boss
 * clearance, matching what a same-size arena with the SMALLEST legal boss
 * combination would use — good enough for a validation estimate, and never
 * more permissive than what `arena.ts` actually builds (a real arena's
 * anchors get pushed further from a boss than this unclearanced set, which
 * only makes real placement strictly easier to fit than what this checks).
 */
/**
 * Whether ONE exact combo of bosses fits an arena of exactly `minWidth` x
 * `minHeight` — the single-combo check `bossLayoutFitsEveryCombo`'s brute
 * force repeats, and what a `'lineup'` fight or floor needs directly, since a
 * lineup rolls no combinations at all: there is exactly one, and it is known
 * up front.
 *
 * The anchor list needs the SAME clearance `arena.ts` gives it before ever
 * calling `arenaBossLayout` — a topWall boss's northClearance and the primary
 * centre boss's own footprint — or a legitimate combo would be flagged as not
 * fitting purely because an unclearanced anchor sits on top of the very boss
 * it was pushed clear of in the real arena.
 */
function bossLayoutFits(minWidth: number, minHeight: number, combo: readonly BossDef[]): boolean {
  const entrance = {
    x: Math.trunc(minWidth / 2) - Math.trunc(ENTRANCE_WIDTH / 2),
    y: minHeight - ENTRANCE_DEPTH,
    width: ENTRANCE_WIDTH,
    height: ENTRANCE_DEPTH
  }
  const topWall = combo.find((d) => d.placement === 'topWall')
  const centreDefs = combo.filter((d) => d.placement !== 'topWall')
  const primary = centreDefs.find((d) => d.id === 'boss_queen') ?? centreDefs[0]
  const anchorList = computeAnchors(minWidth, minHeight, {
    ...(topWall !== undefined ? { northClearance: topWallBossClearance(topWall, topWallBossY(topWall)) } : {}),
    ...(primary !== undefined ? { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } } : {})
  })
  return arenaBossLayout(minWidth, minHeight, entrance, anchorList, combo) !== null
}

function bossLayoutFitsEveryCombo(minWidth: number, minHeight: number, pool: readonly string[], count: number): boolean {
  const defs = pool.filter((id): id is (typeof BOSS_IDS)[number] => (BOSS_IDS as readonly string[]).includes(id)).map((id) => BOSS_DEFS[id])
  if (defs.length === 0) return true // an empty/unknown pool is its own error, reported separately

  // Capped at ARENA_LAYOUT_SLOTS, not `count` — see the doc comment above.
  const targetLength = Math.min(count, ARENA_LAYOUT_SLOTS)
  const combo: BossDef[] = []
  let ok = true
  const recurse = (): void => {
    if (!ok) return
    if (combo.length === targetLength) {
      if (!bossLayoutFits(minWidth, minHeight, combo)) ok = false
      return
    }
    for (const def of defs) {
      if (def.unique && combo.includes(def)) continue
      combo.push(def)
      recurse()
      combo.pop()
      if (!ok) return
    }
  }
  recurse()
  return ok
}

/**
 * Every rule for a `bossLineup` object (issue #64 follow-up: exact lineups),
 * shared by the arena and the dungeon floor so the two grammars cannot drift.
 *
 * `allowedIds` is `BOSS_IDS` for an arena (any end boss may be lined up) or
 * `MOBILE_BOSS_IDS` for a floor — a stationary boss can never reach the party
 * there, the same restriction `bossPool` already carries for a floor. An id
 * that IS a real boss but outside `allowedIds` gets the floor's "cannot move"
 * message (the only way that combination happens); anything else is simply
 * unknown. `subject` labels the message ("Fight 2" / "Floor 3").
 *
 * Iterates `Object.keys(lineup)` — fine here, unlike in generation code: this
 * only orders validation MESSAGES, never an RNG draw.
 */
function validateBossLineup(
  lineup: Partial<Record<string, number>> | undefined,
  field: string,
  allowedIds: readonly string[],
  errors: ValidationIssue[],
  subject: string
): void {
  if (lineup === undefined) return
  for (const id of Object.keys(lineup)) {
    if (!allowedIds.includes(id)) {
      if ((BOSS_IDS as readonly string[]).includes(id)) {
        errors.push({
          field,
          message: `${subject}: "${id}" cannot move, so it can never reach the party on a dungeon floor. Pick one of: ${MOBILE_BOSS_IDS.join(', ')}.`
        })
      } else {
        errors.push({ field, message: `${subject}: unknown boss "${id}" in the lineup.` })
      }
      continue
    }
    const count = lineup[id]
    if (count === undefined) continue
    if (!Number.isInteger(count) || count < 0) {
      errors.push({ field, message: `${subject}: lineup count for "${id}" must be a whole number ≥ 0.` })
      continue
    }
    if (count > 1 && (UNIQUE_BOSS_IDS as readonly string[]).includes(id)) {
      errors.push({ field, message: `${subject}: "${id}" is unique — at most 1 in a lineup, not ${count}.` })
    }
  }
}

/**
 * The boss arena is generated geometry with its own validation rules — sizes,
 * pool completeness and interval bounds. Absent boss object means "off", not
 * "invalid", mirroring how validateLobby handles the lobby.
 *
 * Structured like validateLobby: a `before` snapshot, every error rule, a
 * guard, then warnings — so a disabled boss or one with existing errors never
 * accumulates warnings on top.
 */
function validateBoss(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const boss = p.boss
  if (boss === undefined) return

  // A campaign with the boss on must have something to fight. No upper bound —
  // `levels` has none either (see requirePositiveInt above), and a dungeon
  // master who wants a ten-arena gauntlet is not making a mistake.
  const fights = boss.fights ?? []
  if (boss.enabled && fights.length === 0) {
    errors.push({
      field: 'boss.fights',
      message: 'The boss fight is on but no fights are configured — set at least one.'
    })
  }

  fights.forEach((fight, index) => validateBossFight(boss, fight, index, errors, warnings))

  // Two fights that can only ever roll the same boss are legal but almost
  // certainly not what was meant, so this warns rather than blocks: a pool of
  // one is the only case where the seed has no say.
  const pinned = new Map<string, number>()
  fights.forEach((fight, index) => {
    const pool = fight.arena.bossPool
    if (pool.length !== 1) return
    const first = pinned.get(pool[0])
    if (first === undefined) pinned.set(pool[0], index)
    else {
      warnings.push({
        field: `boss.fights.${index}.arena.bossPool`,
        message: `Fight ${index + 1} always fights the same boss as fight ${first + 1} ("${pool[0]}").`
      })
    }
  })
}

/**
 * Every rule for one boss fight. Field keys are scoped by fight index so the
 * form can anchor an inline message to the tab that is actually wrong.
 */
function validateBossFight(
  boss: BossOptions,
  fight: BossFight,
  index: number,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const before = errors.length

  const arena = fight.arena
  /** field key for an arena setting of this fight */
  const af = (suffix: string): string => `boss.fights.${index}.arena.${suffix}`

  // A SURVIVAL arena has no boss, so none of the boss-only rules below apply to
  // it: its bossPool, waves, invulnerability, checkpoints and scatter-spawn
  // settings stay on the object precisely so flipping the mode is lossless, but
  // the generator never reads them — and blocking generation over a field
  // nothing reads would be wrong.
  //
  // Rather than wrap six separate regions in a mode check and reindent them,
  // the boss-only rules push HERE. In boss mode these are the real arrays, so
  // the behaviour is identical to before survival mode existed; in survival
  // mode they are a throwaway, which also keeps the `errors.length > before`
  // guard below reading the right thing. What stays on the shared path is
  // everything about the ROOM — size, theme, cover, multipliers — which means
  // the same thing in both modes.
  const isSurvival = arenaMode(fight) === 'survival'
  const bossErrors: ValidationIssue[] = isSurvival ? [] : errors
  const bossWarnings: ValidationIssue[] = isSurvival ? [] : warnings

  // Survival's ADVISORIES are suppressed for a campaign with no arenas, the
  // same way the boss-mode warnings below stop at `!boss.enabled`. The fight
  // list is retained while arenas are off — zero arenas is a cleared flag, not
  // a cleared list — so without this a turned-off campaign still reports things
  // like "this survival arena spawns nothing" about an arena it will not build.
  // Errors still go through, exactly as they do in boss mode.
  if (isSurvival) validateSurvival(fight, index, errors, boss.enabled ? warnings : [])

  // min ≤ max on both axes
  if (arena.minWidth > arena.maxWidth) {
    errors.push({ field: af('minWidth'), message: 'Min width must be ≤ max width.' })
  }
  if (arena.minHeight > arena.maxHeight) {
    errors.push({ field: af('minHeight'), message: 'Min height must be ≤ max height.' })
  }

  // arena large enough for the biggest boss + 3×3 alcove + anchor insets
  if (arena.minWidth < ARENA_MIN_WIDTH) {
    errors.push({
      field: af('minWidth'),
      message: `Arena width needs room for the boss, the alcove and the spawn anchors — minimum ${ARENA_MIN_WIDTH} tiles.`
    })
  }
  if (arena.minHeight < ARENA_MIN_HEIGHT) {
    errors.push({
      field: af('minHeight'),
      message: `Arena height needs room for the boss, the alcove and the spawn anchors — minimum ${ARENA_MIN_HEIGHT} tiles.`
    })
  }

  // Bodyguard-twin toggle (issue #64 part 2). Applies in BOTH modes — it is a
  // path substitution on whatever wave/row names an actor, not a boss-only
  // setting, so unlike bossPool/waves/etc it is not gated behind `bossErrors`.
  if (arena.bodyguardVariants !== undefined && typeof arena.bodyguardVariants !== 'boolean') {
    errors.push({ field: af('bodyguardVariants'), message: 'Bodyguard variants must be true or false.' })
  }

  // Selection mode (issue #64 follow-up: exact lineups). An unknown id is an
  // error, not a silent fallback to 'random' — the same treatment every other
  // "must be a known id" rule in this file gets.
  if (arena.bossSelection !== undefined && !(BOSS_SELECTIONS as readonly string[]).includes(arena.bossSelection)) {
    bossErrors.push({ field: af('bossSelection'), message: `Unknown boss selection mode "${arena.bossSelection}".` })
  }

  const selection = bossSelection(arena)
  // arenaBossCount() already applies the lineup-aware rule, so both modes
  // share this one read.
  const bossCount = arenaBossCount(arena)

  if (selection === 'lineup') {
    // Lineup mode does not read bossPool at all, so it gets none of the pool
    // errors below — only the lineup's own keys and counts are validated. Any
    // BOSS_IDS id is allowed here — an arena is not restricted to mobile
    // bosses the way a dungeon floor is.
    validateBossLineup(arena.bossLineup, af('bossLineup'), BOSS_IDS, bossErrors, `Fight ${index + 1}`)

    if (!Number.isInteger(bossCount) || bossCount < 1 || bossCount > MAX_BOSS_COUNT) {
      bossErrors.push({
        field: af('bossLineup'),
        message: `The lineup must total between 1 and ${MAX_BOSS_COUNT} bosses.`
      })
    } else if (isMultiBoss(bossCount) && arena.minWidth >= ARENA_MIN_WIDTH && arena.minHeight >= ARENA_MIN_HEIGHT) {
      // expandLineup only ever iterates BOSS_IDS itself, so every id it
      // returns is already a known def — no filter needed.
      const defs = expandLineup(arena.bossLineup).map((id) => BOSS_DEFS[id])
      if (defs.length > 0 && !bossLayoutFits(arena.minWidth, arena.minHeight, defs)) {
        bossErrors.push({
          field: af('bossLineup'),
          message: `This lineup does not fit the arena's minimum size (${arena.minWidth}×${arena.minHeight}). Raise the minimum size or trim the lineup.`
        })
      }
    }
  } else {
    // bossPool must not be empty
    if (arena.bossPool.length === 0) {
      bossErrors.push({ field: af('bossPool'), message: 'At least one boss must be in the pool.' })
    }
    const knownPoolIds: string[] = []
    for (const id of arena.bossPool) {
      if (!BOSS_IDS.includes(id as typeof BOSS_IDS[number])) {
        bossErrors.push({ field: af('bossPool'), message: `Unknown boss "${id}".` })
      } else {
        knownPoolIds.push(id)
      }
    }

    // bossCount (issue #64 part 1): a whole number 1..MAX_BOSS_COUNT, and — if
    // the pool holds only unique bosses (dragon, queen: at most one each) —
    // never more than the pool can actually supply.
    if (!Number.isInteger(bossCount) || bossCount < 1 || bossCount > MAX_BOSS_COUNT) {
      bossErrors.push({
        field: af('bossCount'),
        message: `Boss count must be a whole number from 1 to ${MAX_BOSS_COUNT}.`
      })
    } else {
      if (knownPoolIds.length > 0 && knownPoolIds.every((id) => (UNIQUE_BOSS_IDS as readonly string[]).includes(id)) && bossCount > knownPoolIds.length) {
        bossErrors.push({
          field: af('bossCount'),
          message: `Every boss in the pool is unique (at most one each) — a pool of ${knownPoolIds.length} cannot supply ${bossCount} bosses.`
        })
      }
      // Layout fit: only meaningful once the pool and the minimum size are both
      // sane — `isMultiBoss`'s single-boss case reuses the historical single
      // draw and needs no layout check at all.
      if (
        isMultiBoss(bossCount) &&
        knownPoolIds.length > 0 &&
        arena.minWidth >= ARENA_MIN_WIDTH &&
        arena.minHeight >= ARENA_MIN_HEIGHT &&
        !bossLayoutFitsEveryCombo(arena.minWidth, arena.minHeight, knownPoolIds, bossCount)
      ) {
        bossErrors.push({
          field: af('bossCount'),
          message: `At ${bossCount} bosses, this arena's minimum size (${arena.minWidth}×${arena.minHeight}) cannot fit some combination the pool could roll. Raise the minimum size, narrow the pool, or lower the boss count.`
        })
      }
    }
  }

  // exactly BOSS_WAVE_COUNT waves
  if (arena.waves.length !== BOSS_WAVE_COUNT) {
    bossErrors.push({
      field: af('waves'),
      message: `Exactly ${BOSS_WAVE_COUNT} waves are required (100/75/50/25 and boss death).`
    })
  }

  // per-wave errors, indexed by wave so a NumberField can anchor to the tier
  // that is actually wrong — every wave is reported, not just the first
  for (let i = 0; i < arena.waves.length; i++) {
    const wave = arena.waves[i]
    const ms = wave.defaultIntervalMs
    if (!Number.isInteger(ms) || ms < MIN_WAVE_INTERVAL_MS || ms > MAX_WAVE_INTERVAL_MS) {
      bossErrors.push({
        field: af(`waves.${i}.defaultIntervalMs`),
        message: `Spawn interval must be between ${MIN_WAVE_INTERVAL_MS} and ${MAX_WAVE_INTERVAL_MS} ms.`
      })
    }

    // A wave pool holds variant keys, not bare monster ids: `bat1` is the
    // ordinary bat, `bat1#0` the bats spawner, `archer1#2` the elite. Each
    // failure mode gets its own message so a hand-edited parameters.txt says
    // what is actually wrong with the key.
    for (const key of wave.monsters) {
      if (isKnownMonsterKey(key)) continue
      const { id, tier } = parseMonsterKey(key)
      const field = af(`waves.${i}.monsters`)
      if (!isKnownMonsterId(id)) {
        bossErrors.push({ field, message: `Wave ${i + 1} pool contains unknown monster "${key}".` })
      } else if (tier === undefined || !Number.isInteger(tier)) {
        bossErrors.push({
          field,
          message: `Wave ${i + 1} entry "${key}" has a malformed variant — the suffix after "#" must be a whole number.`
        })
      } else {
        const type = monsterTypeById(id)
        if (tier === defaultTier(type)) {
          bossErrors.push({
            field,
            message: `Wave ${i + 1} entry "${key}" is not canonical — that variant is spelled "${id}".`
          })
        } else {
          bossErrors.push({
            field,
            message: `Wave ${i + 1} entry "${key}" has no variant ${tier} — "${id}" has ${type.tiers.length} (0..${type.tiers.length - 1}).`
          })
        }
      }
    }

    for (const [id, max] of Object.entries(wave.monsterMax ?? {})) {
      if (!Number.isInteger(max) || max < -1) {
        bossErrors.push({
          field: af(`waves.${i}.monsterMax.${id}`),
          message: `Max count for "${id}" in wave ${i + 1} must be a whole number ≥ -1 (-1 = endless).`
        })
      }
    }

    if (wave.intervalMs) {
      for (const [id, overrideMs] of Object.entries(wave.intervalMs)) {
        if (!Number.isInteger(overrideMs) || overrideMs < MIN_WAVE_INTERVAL_MS || overrideMs > MAX_WAVE_INTERVAL_MS) {
          bossErrors.push({
            field: af(`waves.${i}.intervalMs.${id}`),
            message: `Monster "${id}" in wave ${i + 1} has interval ${overrideMs} — must be ${MIN_WAVE_INTERVAL_MS}..${MAX_WAVE_INTERVAL_MS}.`
          })
        }
      }
    }

    // The tier's arena-wide buffs. An empty list means none, which is the
    // pre-feature default and never invalid.
    waveBuffs(wave).forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) {
        bossErrors.push({
          field: af(`waves.${i}.buffs.${j}.buff`),
          message: `"${entry.buff}" is not a buff the game ships.`
        })
      }
      if (!BUFF_TARGETS.includes(entry.target)) {
        bossErrors.push({
          field: af(`waves.${i}.buffs.${j}.target`),
          message: `"${entry.target}" is not a buff target — use ${BUFF_TARGETS.join(', ')}.`
        })
      }
    })

    // The tier's item drops. An empty list means none, which is what a tier
    // that has never been touched carries and is never invalid.
    wavePickups(wave).forEach((entry, j) => {
      if (pickupById(entry.item) === undefined) {
        bossErrors.push({
          field: af(`waves.${i}.pickups.${j}.item`),
          message: `"${entry.item}" is not an item the game ships.`
        })
      }
      // Every copy is its own SpawnObject node, so the count is a node count —
      // see boss/wavePickups.ts. Bounded for the same reason every retry loop
      // in the port is.
      if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > MAX_PICKUP_COUNT) {
        bossErrors.push({
          field: af(`waves.${i}.pickups.${j}.count`),
          message: `Wave ${i + 1} drops ${entry.count} × "${entry.item}" — the count must be a whole number 1..${MAX_PICKUP_COUNT}.`
        })
      }
    })

    // The tier's wall traps. An empty list means none, which is what a tier
    // that has never been touched carries and is never invalid.
    waveTraps(wave).forEach((row, j) => {
      if (projectileById(row.projectile) === undefined) {
        bossErrors.push({
          field: af(`waves.${i}.traps.${j}.projectile`),
          message: `"${row.projectile}" is not a projectile the game ships.`
        })
      }
      if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) {
        bossErrors.push({
          field: af(`waves.${i}.traps.${j}.direction`),
          message: `"${row.direction}" is not a firing direction — use ${BOSS_TRAP_DIRECTIONS.join(', ')}.`
        })
      }
      // Decimal on purpose: the reference axe rig fires at 0.5. The engine
      // clamps outside 0..2 with no warning, so the bound is ours to enforce.
      if (!Number.isFinite(row.spread) || row.spread < 0 || row.spread > TRAP_SPREAD_MAX) {
        bossErrors.push({
          field: af(`waves.${i}.traps.${j}.spread`),
          message: `Wave ${i + 1}'s "${row.projectile}" trap fans at ${row.spread} — spread must be between 0 and ${TRAP_SPREAD_MAX}.`
        })
      }
      if (!Number.isInteger(row.spawnRateMs) || row.spawnRateMs < 1) {
        bossErrors.push({
          field: af(`waves.${i}.traps.${j}.spawnRateMs`),
          message: `Wave ${i + 1}'s "${row.projectile}" trap fires every ${row.spawnRateMs} ms — the rate must be a whole number of milliseconds, at least 1.`
        })
      } else if (row.spawnRateMs < TRAP_FAST_SPAWN_RATE_MS) {
        // A warning, not an error: the engine imposes no bound and a very fast
        // lane is a legitimate thing to build deliberately. It is worth saying
        // out loud because nothing else will.
        bossWarnings.push({
          field: af(`waves.${i}.traps.${j}.spawnRateMs`),
          message: `Wave ${i + 1}'s "${row.projectile}" trap fires every ${row.spawnRateMs} ms. Below ${TRAP_FAST_SPAWN_RATE_MS} ms the arena fills with projectiles faster than the party can cross it, and the framerate suffers.`
        })
      }
      // Every spewer is its own node on its own tile — see boss/traps.ts.
      if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_TRAP_COUNT) {
        bossErrors.push({
          field: af(`waves.${i}.traps.${j}.count`),
          message: `Wave ${i + 1} places ${row.count} × "${row.projectile}" — the count must be a whole number 1..${MAX_TRAP_COUNT}.`
        })
      }
    })

    // Spawn modes. A key for a monster that is no longer in the pool is
    // ignored rather than reported — the parser and the form both rebuild the
    // record from the pool, so a stale key is housekeeping, not user error.
    for (const [id, mode] of Object.entries(wave.spawnMode ?? {})) {
      if (!wave.monsters.includes(id)) continue
      const field = af(`waves.${i}.spawnMode.${id}`)

      if (!(BOSS_SPAWN_MODES as readonly string[]).includes(mode)) {
        bossErrors.push({ field, message: `"${mode}" is not one of: ${BOSS_SPAWN_MODES.join(', ')}.` })
        continue
      }
      if (!isScatterMode(mode)) continue

      // A wreck that keeps its collision is permanent geometry. Nine anchors
      // put those wrecks in nine known places; a scatter puts them anywhere,
      // which is how an arena ends up walled off by its own dead towers.
      if (isKnownMonsterKey(id) && corpseCollision(resolveActorPath(id)) === 'blocking') {
        bossErrors.push({
          field,
          message: `"${id}" leaves a wreck that still blocks movement, so it cannot be scattered — scattering it can wall the arena off. Use the anchors mode, or pick a variant whose wreck is passable.`
        })
      }

      if (wave.monsterMax[id] === -1) {
        bossErrors.push({
          field,
          message: `"${id}" is set to endless (-1), which has no meaning for a one-shot scattered spawn. Give it a real count, or put it back on the anchors mode.`
        })
      }
    }
  }

  // theme valid
  if (!THEMES.includes(arena.theme)) {
    errors.push({ field: af('theme'), message: `"${arena.theme}" is not one of: ${THEMES.join(', ')}.` })
  }

  // music: unset/default means "no PlayMusic node", always valid
  if (!isKnownMusicId(arena.music)) {
    errors.push({
      field: af('music'),
      message: `"${arena.music}" is not a music track. Valid tracks: ${MUSIC_DEFAULT}, ${MUSIC_TRACKS.map((t) => t.id).join(', ')}.`
    })
  }

  // floor pattern valid. Not an error to set one on a theme that ignores it —
  // the value is simply unused, and clearing it when the user switches theme
  // away and back would lose their choice.
  if (!BOSS_FLOOR_PATTERNS.includes(arena.floorPattern)) {
    errors.push({
      field: af('floorPattern'),
      message: `"${arena.floorPattern}" is not one of: ${BOSS_FLOOR_PATTERNS.join(', ')}.`
    })
  }

  // cover pattern and its numeric knobs
  if (!(BOSS_COVER_PATTERNS as readonly string[]).includes(arena.cover.pattern)) {
    errors.push({
      field: af('cover.pattern'),
      message: `"${arena.cover.pattern}" is not one of: ${BOSS_COVER_PATTERNS.join(', ')}.`
    })
  }
  // A hard error, not a warning. Density is a fraction of the free floor, so
  // 0.5 — which shipped once — buries the arena under ~200 pillars and
  // playtested as impassable in game. Anything past the cap is a broken
  // campaign rather than an aggressive one.
  if (!Number.isFinite(arena.cover.density) || arena.cover.density < 0 || arena.cover.density > BOSS_COVER_DENSITY_MAX) {
    errors.push({
      field: af('cover.density'),
      message: `Cover density must be between 0 and ${BOSS_COVER_DENSITY_MAX} — it is the fraction of the arena floor filled with pillars, and denser than that leaves nowhere to fight.`
    })
  }
  if (!Number.isInteger(arena.cover.ringSpacing) || arena.cover.ringSpacing < 1) {
    errors.push({ field: af('cover.ringSpacing'), message: 'Ring spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.cover.clusters) || arena.cover.clusters < 1) {
    errors.push({ field: af('cover.clusters'), message: 'Cluster count must be a whole number ≥ 1.' })
  }

  // the arena's own multipliers, same rule as the dungeon's — a negative one
  // would drive scaledMax below the -1 endless sentinel and every horde to 0
  for (const [field, value] of [
    [af('monsterMultiplier'), arena.monsterMultiplier],
    [af('foodMultiplier'), arena.foodMultiplier]
  ] as Array<[string, number]>) {
    if (!(Number.isFinite(value) && value >= 0)) {
      errors.push({ field, message: 'Multiplier must be ≥ 0.' })
    }
  }

  // the scatter modes' own knobs — same shape as cover's, deliberately separate
  // so pillars and monsters can be spaced differently
  if (!Number.isInteger(arena.spawn.spacing) || arena.spawn.spacing < 1) {
    bossErrors.push({ field: af('spawn.spacing'), message: 'Spawn spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.spawn.ringSpacing) || arena.spawn.ringSpacing < 1) {
    bossErrors.push({ field: af('spawn.ringSpacing'), message: 'Spawn ring spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.spawn.clusters) || arena.spawn.clusters < 1) {
    bossErrors.push({ field: af('spawn.clusters'), message: 'Spawn cluster count must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.spawn.batchSize) || arena.spawn.batchSize < 1) {
    bossErrors.push({ field: af('spawn.batchSize'), message: 'Spawn batch size must be a whole number ≥ 1.' })
  }
  if (
    !Number.isInteger(arena.spawn.batchIntervalMs) ||
    arena.spawn.batchIntervalMs < MIN_WAVE_INTERVAL_MS ||
    arena.spawn.batchIntervalMs > MAX_WAVE_INTERVAL_MS
  ) {
    bossErrors.push({
      field: af('spawn.batchIntervalMs'),
      message: `Spawn batch interval must be a whole number of milliseconds between ${MIN_WAVE_INTERVAL_MS} and ${MAX_WAVE_INTERVAL_MS}.`
    })
  }

  // the invulnerability windows — one per health threshold, 0 disabling that one
  const invuln = arena.invulnerability
  if (!Array.isArray(invuln.seconds) || invuln.seconds.length !== BOSS_INVULN_COUNT) {
    bossErrors.push({
      field: af('invulnerability.seconds'),
      message: `Boss invulnerability needs exactly ${BOSS_INVULN_COUNT} window lengths, one per health threshold (${BOSS_INVULN_THRESHOLDS.join(', ')}).`
    })
  } else {
    for (let i = 0; i < invuln.seconds.length; i++) {
      const s = invuln.seconds[i]
      if (!Number.isInteger(s) || s < 0 || s > MAX_BOSS_INVULN_SECONDS) {
        bossErrors.push({
          field: af(`invulnerability.seconds.${i}`),
          message: `The ${BOSS_INVULN_THRESHOLDS[i]} window must be a whole number of seconds between 0 (off) and ${MAX_BOSS_INVULN_SECONDS}.`
        })
      }
    }
  }

  // an unknown preset id is only reachable via a hand-edited parameters.txt —
  // the form only ever writes a known one — but a bad import should not silently
  // fall back to a default without the user seeing why
  if (!(arena.checkpoints.respawnPlayers in BOSS_CHECKPOINT_PRESETS)) {
    bossErrors.push({
      field: af('checkpoints.respawnPlayers'),
      message: `Unknown checkpoint preset "${arena.checkpoints.respawnPlayers}".`
    })
  }
  if (!(arena.checkpoints.saveGame in BOSS_CHECKPOINT_PRESETS)) {
    bossErrors.push({
      field: af('checkpoints.saveGame'),
      message: `Unknown checkpoint preset "${arena.checkpoints.saveGame}".`
    })
  }

  if (!boss.enabled || errors.length > before) return

  // Both of these are shape-dependent, so they only run once the rules above
  // have confirmed the array is the right length and every entry is sane.
  if (invuln.enabled && invuln.seconds.every((s) => s === 0)) {
    bossWarnings.push({
      field: af('invulnerability.seconds'),
      message: 'Boss invulnerability is on but every window is 0 seconds — no threshold will pause the fight.'
    })
  }
  // The countdown emits one AnnounceText node per second per window. That is
  // cheap next to the scatter budget below, but a 300s window on all three
  // thresholds is 900 nodes for a timer nobody is reading by then.
  if (invuln.enabled && invuln.countdown) {
    const tickNodes = invuln.seconds.reduce((sum, s) => sum + (s > 0 ? s + 1 : 0), 0)
    if (tickNodes > BOSS_COUNTDOWN_NODE_WARN) {
      bossWarnings.push({
        field: af('invulnerability.countdown'),
        message: `The countdown adds ${tickNodes} script nodes (one per second, per window). Consider shorter windows, or turning the countdown off.`
      })
    }
  }

  // Advisory ceiling (issue #64 follow-up), in EITHER selection mode: legal at
  // any count up to MAX_BOSS_COUNT, but past BOSS_COUNT_WARN a dungeon master
  // is warned about a crowded arena and slower generation rather than blocked.
  if (bossCount > BOSS_COUNT_WARN) {
    bossWarnings.push({
      field: selection === 'lineup' ? af('bossLineup') : af('bossCount'),
      message: `${bossCount} bosses is a lot — expect a crowded, chaotic arena and slower generation.`
    })
  }

  // per-wave warnings, same indexing as the errors above
  for (let i = 0; i < arena.waves.length; i++) {
    const wave = arena.waves[i]
    // An empty health tier is a mistake worth naming. An empty boss-death tier
    // is the shipped default, so warning about it would put a message on every
    // stock run.
    if (wave.monsters.length === 0 && i !== BOSS_DEATH_WAVE) {
      bossWarnings.push({
        field: af(`waves.${i}.monsters`),
        message: `Wave ${i + 1} has an empty monster pool — nothing will spawn at this tier.`
      })
    }

    const seenTierBuffs = new Set<string>()
    waveBuffs(wave).forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) return

      const pair = `${entry.buff}|${entry.target}`
      if (seenTierBuffs.has(pair)) {
        bossWarnings.push({
          field: af(`waves.${i}.buffs.${j}.buff`),
          message: `Wave ${i + 1}: "${entry.buff}" is already applied to ${entry.target} on this tier — the second copy does nothing.`
        })
      }
      seenTierBuffs.add(pair)

      // The boss is already dead by this tier, so a buff aimed at the horde has
      // only whatever that tier itself spawns to land on.
      if (i === BOSS_DEATH_WAVE && entry.target === 'monsters' && wave.monsters.length === 0) {
        bossWarnings.push({
          field: af(`waves.${i}.buffs.${j}.target`),
          message:
            'The after-the-boss-dies buff catches monsters, but that tier spawns none — nothing will be buffed on the walk to the orb.'
        })
      }
      // No BUFF_HELPFUL_IDS check here, deliberately, and unlike the per-floor
      // rule further down. On an ordinary floor a strengthener aimed at monsters
      // is usually a mis-aimed target and worth naming. The arena's five tiers
      // are an explicit difficulty ladder, so strengthening the horde there is
      // the feature — the stock boss-death tier does exactly that (see
      // bossDeathBuffs()), and warning about it would put a message on every
      // stock run, which is the same trap the empty-tier rule above avoids.
    })

    const seenTierPickups = new Set<string>()
    wavePickups(wave).forEach((entry, j) => {
      if (pickupById(entry.item) === undefined) return

      // Two rows of the same item work — they just take adjacent pad slots —
      // but a single row with the counts added is what the author meant, and
      // one row is what the form can then edit in one place.
      if (seenTierPickups.has(entry.item)) {
        bossWarnings.push({
          field: af(`waves.${i}.pickups.${j}.item`),
          message: `Wave ${i + 1} already drops "${entry.item}" — fold the two rows into one count.`
        })
      }
      seenTierPickups.add(entry.item)
    })

    for (const id of wave.monsters) {
      const mode = waveSpawnMode(wave, id)
      if (!isScatterMode(mode)) continue
      const field = af(`waves.${i}.spawnMode.${id}`)

      // The interval belongs to the timer rig, and a scattered monster has no
      // timer. Worth saying out loud: the number stays visible in
      // parameters.txt, so silence would read as "it still applies".
      if (wave.intervalMs?.[id] !== undefined) {
        bossWarnings.push({
          field,
          message: `"${id}" in wave ${i + 1} is scattered, so its ${wave.intervalMs[id]} ms interval is ignored — scattered monsters all spawn at once.`
        })
      }
    }
  }

  // A wall's slot pool belongs to the arena, not to a tier: boss/traps.ts
  // carries it across all five so tier 3's spewers cannot land on tier 1's.
  // Counted the same way here — against the SMALLEST arena the size range can
  // roll, since that is the one that overflows. A warning rather than an error
  // because overflowing is not fatal: the rig simply stops placing, so the
  // campaign still generates and still plays, just with fewer traps than asked
  // for. Cover pillars can only reduce the real capacity further, which is the
  // other reason this cannot be an exact promise.
  const perWall = new Map<BossTrapDirection, number>()
  for (const wave of arena.waves) {
    for (const row of waveTraps(wave)) {
      if (projectileById(row.projectile) === undefined) continue
      if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) continue
      if (!Number.isInteger(row.count) || row.count < 1) continue
      perWall.set(row.direction, (perWall.get(row.direction) ?? 0) + row.count)
    }
  }
  for (const [direction, wanted] of perWall) {
    const capacity = wallCapacity(arena.minWidth, arena.minHeight, direction)
    if (wanted > capacity) {
      bossWarnings.push({
        field: af('waves'),
        message: `The ${direction === 'up' ? 'south' : direction === 'down' ? 'north' : direction === 'left' ? 'east' : 'west'} wall is asked for ${wanted} ${direction}-firing spewers across all tiers, but an arena ${arena.minWidth}×${arena.minHeight} only has room for about ${capacity} spaced along it. The extra ones will be skipped.`
      })
    }
  }

  // The node budget belongs to the floor, so it is counted once across every
  // tier rather than per pool entry — 40 modest scatters cost the same as one
  // enormous one.
  const scattered = arena.waves.reduce(
    (total, wave) =>
      total +
      wave.monsters
        .filter((id) => isScatterMode(waveSpawnMode(wave, id)))
        .reduce((n, id) => n + scatterCount(wave.monsterMax[id], arena.monsterMultiplier), 0),
    0
  )
  if (scattered >= BOSS_SCATTER_WARN) {
    bossWarnings.push({
      field: af('waves'),
      message: `The waves scatter ${scattered} spawns in total, one script node each — that is a lot of nodes on one floor.`
    })
  }

  // Whether the arena has floor to *put* them on, which is a different question
  // from the node budget above and the one the 2026-08-27 playtest ran into: a
  // tier that wants more distinct spawn points than the smallest arena it can
  // roll has free tiles cannot place them all, and the shortfall is padded onto
  // tiles other monsters already claimed. Counted per tier, because
  // spawnPoints.ts now clears its placed list between tiers.
  //
  // A warning, not an error: padding is a real, handled outcome (every monster
  // still spawns), and the free-floor figure is an estimate — the pillars are
  // not placed yet. `spacing` reserves a square per point, hence the squaring.
  const perPoint = Math.max(1, Math.trunc(arena.spawn.spacing)) ** 2
  const capacity = Math.floor(freeFloorArea(arena.minWidth, arena.minHeight) / perPoint)
  const budget = Math.max(1, Math.trunc(arena.spawn.batchSize))
  for (let i = 0; i < arena.waves.length; i++) {
    const wave = arena.waves[i]
    const points = wave.monsters
      .filter((id) => isScatterMode(waveSpawnMode(wave, id)))
      .reduce((n, id) => n + Math.min(scatterCount(wave.monsterMax[id], arena.monsterMultiplier), budget), 0)
    if (points > capacity) {
      bossWarnings.push({
        field: af(`waves.${i}`),
        message: `Wave ${i + 1} wants ${points} scatter points but the smallest arena it can roll (${arena.minWidth}x${arena.minHeight}) fits about ${capacity} — some monsters will share tiles. Raise the arena size, or lower the spawn spacing or batch size.`
      })
    }
  }

  // The arena's theme carries the same cosmetic caveat the dungeon's themes do
  // — the loop above only walks `p.themes`, so without this, picking theme h
  // for the arena said nothing at all. Same field-scoped shape, so BossForm's
  // theme select shows it inline.
  const arenaNote = getTheme(arena.theme)?.cosmeticWarning
  if (arenaNote !== undefined) {
    warnings.push({ field: af('theme'), message: arenaNote })
  }

  // No area-aware density warning lives here any more. It fired only when
  // `density * interior > free`, i.e. above ~0.69 even on the smallest legal
  // arena — unreachable now that BOSS_COVER_DENSITY_MAX errors at 0.25, and a
  // rule that can never fire is worse than no rule. The cap plus cover.ts's
  // reachability guarantee cover what this was reaching for.
}

/**
 * Every rule for one SURVIVAL arena (issue #61).
 *
 * Called from `validateBossFight`, which has already checked everything about
 * the room itself — size, theme, cover, multipliers — because those mean the
 * same thing in both modes. What is left is the timeline: a round length, how
 * it is announced, and four lists of timed events.
 *
 * House shape (the same one `validateLevelTraps` documents): snapshot, error
 * rules, a guard, then warnings — so a list with an unknown id never also
 * accumulates advisories about it.
 *
 * Field keys are scoped by fight index AND row index, so the form anchors an
 * inline message to the exact row that is wrong rather than to the section.
 */
function validateSurvival(
  fight: BossFight,
  index: number,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const before = errors.length

  /** field key for a survival setting of this fight */
  const sf = (suffix: string): string => `boss.fights.${index}.survival.${suffix}`

  // A fight flipped to survival by a hand-edited file may carry no options at
  // all. The generator falls back to the defaults rather than throwing
  // (invariant 5), so there is nothing to validate and nothing to report.
  const survival = fight.survival
  if (survival === undefined) return

  // Read the four lists through their accessors, never off the object.
  //
  // A hand-edited parameters.txt, or a settings file written before one of
  // these lists existed, can hand us a `survival` missing any of them — and
  // validation's whole job is to REPORT bad input, not to throw on it
  // (invariant 5). The generator's rigs already go through the same accessors,
  // so the two ends agree that an absent list means an empty one.
  const waves = survivalWaves(survival)
  const buffs = survivalBuffs(survival)
  const pickups = survivalPickups(survival)
  const traps = survivalTraps(survival)

  // --- the round itself ---

  if (!Number.isInteger(survival.seconds) || survival.seconds < 1 || survival.seconds > SURVIVAL_SECONDS_MAX) {
    errors.push({
      field: sf('seconds'),
      message: `Survival length must be a whole number of seconds between 1 and ${SURVIVAL_SECONDS_MAX}.`
    })
  }

  if (!(SURVIVAL_COUNTDOWN_STYLES as readonly string[]).includes(survival.countdown)) {
    errors.push({
      field: sf('countdown'),
      message: `"${survival.countdown}" is not one of: ${SURVIVAL_COUNTDOWN_STYLES.join(', ')}.`
    })
  }

  /**
   * Whether a timestamp is a whole number of seconds inside the round.
   *
   * The upper bound is the round length itself: an event scheduled after the
   * door has already opened never fires, which is a mistake rather than a
   * style. It is checked against the STORED length even when that length is
   * itself invalid — the two messages are independent, and suppressing one
   * because of the other would hide half the problem.
   */
  const timeOk = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= survival.seconds

  // --- wave rows ---

  waves.forEach((row, i) => {
    if (!isKnownMonsterKey(row.monster)) {
      errors.push({ field: sf(`waves.${i}.monster`), message: `Unknown monster "${row.monster}".` })
    }
    if (!Number.isInteger(row.count) || (row.count < 1 && row.count !== -1)) {
      errors.push({
        field: sf(`waves.${i}.count`),
        // -1 is the same endless sentinel a boss tier's monsterMax uses. In a
        // survival round it means "keep coming until the clock runs out" — the
        // rig stops the row's timer on the tick that opens the alcove.
        message: 'Count must be a whole number ≥ 1, or -1 for endless.'
      })
    }
    if (!timeOk(row.atSeconds)) {
      errors.push({
        field: sf(`waves.${i}.atSeconds`),
        message: `Start time must be a whole number of seconds between 0 and the round length (${survival.seconds}).`
      })
    }
    if (!Number.isInteger(row.intervalMs) || row.intervalMs < MIN_WAVE_INTERVAL_MS || row.intervalMs > MAX_WAVE_INTERVAL_MS) {
      errors.push({
        field: sf(`waves.${i}.intervalMs`),
        message: `Spawn interval must be between ${MIN_WAVE_INTERVAL_MS} and ${MAX_WAVE_INTERVAL_MS} ms.`
      })
    }
  })

  // --- buff windows ---

  buffs.forEach((row, i) => {
    if (buffById(row.buff) === undefined) {
      errors.push({ field: sf(`buffs.${i}.buff`), message: `Unknown buff "${row.buff}".` })
    }
    if (!BUFF_TARGETS.includes(row.target)) {
      errors.push({
        field: sf(`buffs.${i}.target`),
        message: `"${row.target}" is not one of: ${BUFF_TARGETS.join(', ')}.`
      })
    }
    validateWindow(row, sf(`buffs.${i}`), 'Buff window', survival.seconds, errors)
  })

  // --- item drops ---

  pickups.forEach((row, i) => {
    if (pickupById(row.item) === undefined) {
      errors.push({ field: sf(`pickups.${i}.item`), message: `Unknown item "${row.item}".` })
    }
    if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_PICKUP_COUNT) {
      errors.push({
        field: sf(`pickups.${i}.count`),
        message: `Count must be a whole number between 1 and ${MAX_PICKUP_COUNT}.`
      })
    }
    if (!timeOk(row.atSeconds)) {
      errors.push({
        field: sf(`pickups.${i}.atSeconds`),
        message: `Drop time must be a whole number of seconds between 0 and the round length (${survival.seconds}).`
      })
    }
  })

  // --- trap windows ---

  traps.forEach((row, i) => {
    if (projectileById(row.projectile) === undefined) {
      errors.push({ field: sf(`traps.${i}.projectile`), message: `Unknown projectile "${row.projectile}".` })
    }
    if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) {
      errors.push({
        field: sf(`traps.${i}.direction`),
        message: `"${row.direction}" is not one of: ${BOSS_TRAP_DIRECTIONS.join(', ')}.`
      })
    }
    if (!Number.isFinite(row.spread) || row.spread < 0 || row.spread > TRAP_SPREAD_MAX) {
      errors.push({
        field: sf(`traps.${i}.spread`),
        message: `Spread must be between 0 and ${TRAP_SPREAD_MAX}.`
      })
    }
    if (!Number.isInteger(row.spawnRateMs) || row.spawnRateMs < 1) {
      errors.push({ field: sf(`traps.${i}.spawnRateMs`), message: 'Fire rate must be a whole number of milliseconds ≥ 1.' })
    }
    if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_TRAP_COUNT) {
      errors.push({
        field: sf(`traps.${i}.count`),
        message: `Trap count must be a whole number between 1 and ${MAX_TRAP_COUNT}.`
      })
    }
    validateWindow(row, sf(`traps.${i}`), 'Trap window', survival.seconds, errors)
  })

  // Errors first, then advisories — a list with an unknown id never also
  // collects warnings about it.
  if (errors.length > before) return

  // --- warnings ---

  // A survival round with nothing in it is legal — the party simply waits out
  // the clock in an empty room — but it is almost never what was meant.
  if (waves.length === 0) {
    warnings.push({
      field: sf('waves'),
      message: 'This survival arena spawns nothing — the party just waits for the timer.'
    })
  }

  // One AnnounceText per second, all on one level. Same threshold and reasoning
  // as timer mode's countdown; `milestones` is a fixed handful at any length,
  // which is why it is the default.
  if (survival.countdown === 'seconds' && survival.seconds + 1 > SURVIVAL_COUNTDOWN_NODE_WARN) {
    warnings.push({
      field: sf('countdown'),
      message: `A per-second countdown over ${survival.seconds}s emits ${survival.seconds + 1} announcement nodes on this level. Switch to milestones to keep it to a handful.`
    })
  }

  // The same wall-capacity heuristic the boss tiers get: every window's spewers
  // come out of one pool per wall, carried across all of them, so the totals add
  // up exactly as a boss arena's tiers do. A warning, not an error — the rig
  // stops placing gracefully when a pool runs dry.
  const perWall = new Map<BossTrapDirection, number>()
  for (const row of traps) {
    perWall.set(row.direction, (perWall.get(row.direction) ?? 0) + row.count)
  }
  for (const [direction, wanted] of perWall) {
    const capacity = wallCapacity(fight.arena.minWidth, fight.arena.minHeight, direction)
    if (wanted > capacity) {
      warnings.push({
        field: sf('traps'),
        message: `The ${wallNoun(direction)} wall is asked for ${wanted} ${direction}-firing spewers across all windows, but an arena ${fight.arena.minWidth}×${fight.arena.minHeight} only has room for about ${capacity} spaced along it. The extra ones will be skipped.`
      })
    }
  }
}

/**
 * The `startSeconds < endSeconds`, both-inside-the-round rule the buff and trap
 * windows share. Two rules that differ only in a noun are one rule.
 */
function validateWindow(
  row: { startSeconds: number; endSeconds: number },
  field: string,
  noun: string,
  seconds: number,
  errors: ValidationIssue[]
): void {
  if (!Number.isInteger(row.startSeconds) || row.startSeconds < 0 || row.startSeconds > seconds) {
    errors.push({
      field: `${field}.startSeconds`,
      message: `${noun} start must be a whole number of seconds between 0 and the round length (${seconds}).`
    })
    return
  }
  if (!Number.isInteger(row.endSeconds) || row.endSeconds < 0 || row.endSeconds > seconds) {
    errors.push({
      field: `${field}.endSeconds`,
      message: `${noun} end must be a whole number of seconds between 0 and the round length (${seconds}).`
    })
    return
  }
  // A window that ends at or before it starts never switches anything on.
  if (row.endSeconds <= row.startSeconds) {
    errors.push({
      field: `${field}.endSeconds`,
      message: `${noun} end must be after its start.`
    })
  }
}

/** Which wall a trap direction stands on, for a message a person reads. */
function wallNoun(direction: BossTrapDirection): string {
  return direction === 'up' ? 'south' : direction === 'down' ? 'north' : direction === 'left' ? 'east' : 'west'
}

/**
 * Player tweaks are sparse and keyed by the tweak field keys, so issues use the
 * same key as `field` and the existing inline-error plumbing shows them next to
 * the right input.
 */
function validatePlayerTweaks(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const tweaks = p.playerTweaks ?? {}
  const bounties: Array<{ key: string; value: number }> = []
  const overCapped: Array<{ key: string; stat: string; value: number }> = []
  const cascades: Array<{ key: string; id: string; extra: number }> = []

  for (const [key, value] of Object.entries(tweaks)) {
    const field = TWEAK_FIELD_MAP.get(key.toLowerCase())
    if (field === undefined) continue

    if (!Number.isFinite(value)) {
      errors.push({ field: key, message: 'Must be a number.' })
      continue
    }

    if (field.group === 'cost') {
      if (!Number.isInteger(value)) {
        errors.push({ field: key, message: 'Cost must be a whole number.' })
      } else if (Math.abs(value) > SHOP_PRICE_MAX) {
        errors.push({
          field: key,
          message: `The shop cannot display more than ${SHOP_PRICE_MAX}.`
        })
      } else if (value < 0) {
        // confirmed in game: the shop pays out on a negative price. Legal and
        // deliberately supported, so it is collected and reported once below
        // rather than once per upgrade — a bounty shop sets all 372 of them.
        bounties.push({ key, value })
      }
      continue
    }

    // bools and removal flags ride the numeric rail as 0/1; anything else would
    // serialize as a value the game cannot read
    if (field.type === 'bool') {
      if (value !== 0 && value !== 1) {
        errors.push({ field: key, message: 'Must be 0 (off) or 1 (on).' })
        continue
      }

      if (field.group === 'remove' && value === 1) {
        // collected and summarised below: shortening one ladder is worth a note,
        // but the fully-upgraded preset shortens every ladder in the game
        const cascade = removalCascade(field, tweaks)
        if (cascade > 0) cascades.push({ key, id: field.upgradeId ?? key, extra: cascade })
      }
      continue
    }

    // a string override is an index into the values the stock data offers, so
    // anything outside that range would emit a path the game cannot load
    if (field.type === 'string') {
      const count = field.choices?.length ?? 0
      if (!Number.isInteger(value) || value < 0 || value >= count) {
        errors.push({
          field: key,
          message: `Must be a whole number from 0 to ${Math.max(0, count - 1)}.`
        })
      }
      continue
    }

    if (field.type === 'int' && !Number.isInteger(value)) {
      errors.push({ field: key, message: 'Must be a whole number.' })
      continue
    }

    // -1 is the game's "skill locked" sentinel, so negatives are legitimate for
    // most fields; only the handful that must be positive get a floor.
    if ((field.stat === 'max-health' || field.stat === 'max-mana') && value < 1) {
      errors.push({ field: key, message: 'Must be at least 1.' })
      continue
    }

    if (field.group === 'difficulty' && value < 0) {
      errors.push({ field: key, message: 'Difficulty multipliers cannot be negative.' })
      continue
    }

    if (field.stat === 'max-health' && value > 10000) {
      warnings.push({ field: key, message: 'Very high health — the campaign may be trivial.' })
    }

    // a probability cannot do more than always. Every stock chance ladder tops
    // out at or below 100, and shield-chance tops out at exactly 100, so past
    // that the extra points buy nothing at all.
    if (field.stat !== undefined && isChanceStat(field.stat) && value > 100) {
      overCapped.push({ key, stat: field.stat, value })
    }

    if (field.group === 'effect') {
      const downgrade = downgradeMessage(field, value, tweaks)
      if (downgrade !== undefined) warnings.push({ field: key, message: downgrade })
      continue
    }

    if (field.group === 'param') {
      const stale = staleUpgrades(field, value, tweaks)
      if (stale !== undefined) {
        warnings.push({
          field: key,
          message: `${stale.count} ${stale.count === 1 ? 'upgrade still sets' : 'upgrades still set'} ${field.stat} ${stale.side} ${value} — buying ${stale.count === 1 ? 'it' : 'them'} would downgrade the character. Adjust the ${field.stat} ladder to match.`
        })
      }
    }
  }

  for (const issue of armedWithEmptyPath(tweaks)) errors.push(issue)

  if (cascades.length > 0) {
    cascades.sort((a, b) => a.key.localeCompare(b.key))
    const extra = cascades.reduce((sum, entry) => sum + entry.extra, 0)
    warnings.push({
      field: cascades[0].key,
      message:
        cascades.length === 1
          ? `Removing ${cascades[0].id} also removes ${extra} upgrade${extra === 1 ? '' : 's'} that require it, so the shop never references a missing entry.`
          : `${cascades.length} removed upgrades take ${extra} dependent upgrades with them, so the shop never references a missing entry.`
    })
  }

  if (overCapped.length > 0) {
    overCapped.sort((a, b) => a.key.localeCompare(b.key))
    const stats = [...new Set(overCapped.map((o) => o.stat))].sort()
    const evasive = stats.filter(isEvasionStat)
    warnings.push({
      field: overCapped[0].key,
      message:
        `${overCapped.length === 1 ? 'A percentage stat is' : `${overCapped.length} percentage stats are`} ` +
        `over 100% (${stats.join(', ')}). Anything past 100 is wasted — a chance cannot exceed always.` +
        (evasive.length > 0
          ? ` Note that ${evasive.join(' and ')} at 100 already avoids every hit, which makes the character invulnerable.`
          : '')
    })
  }

  if (bounties.length > 0) {
    // sorted so the field the message points at is stable regardless of the
    // order the overrides happened to be written in
    bounties.sort((a, b) => a.key.localeCompare(b.key))
    const most = Math.max(...bounties.map((b) => -b.value))
    warnings.push({
      field: bounties[0].key,
      message:
        bounties.length === 1
          ? `${bounties[0].key.split('.').pop()} pays the player ${most} gold instead of charging them.`
          : `${bounties.length} upgrades pay the player instead of charging them, up to ${most} gold each.`
    })
  }
}

/**
 * Skills switched on but pointed at an empty projectile or buff path.
 *
 * This is a **crash**, not a balance mistake. `combo-nova-projectile` and
 * `aura-buff` are `""` in the stock files and only an upgrade fills them in, so
 * handing a character the numbers without the path arms a skill with nothing to
 * spawn. The game dies with a `NullReferenceException` in
 * `PlayerActorBehavior.Update` the moment it fires — which is mid-combat, not at
 * load, so it survives every start-up check.
 *
 * Derived from the baseline rather than hardcoded: any string param that starts
 * empty is checked against the numeric siblings the same upgrades write.
 */
function armedWithEmptyPath(tweaks: PlayerTweaks): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const file of TWEAK_BASELINE) {
    if (file.kind !== 'unit') continue

    for (const param of file.params) {
      if (param.type !== 'string' || param.value !== '') continue

      const field = TWEAK_FIELD_MAP.get(paramKey(file.id, param.name))
      if (field === undefined) continue
      // index 0 is the stock value, which for these is the empty string
      if ((tweaks[field.key] ?? field.stock) !== 0) continue

      // the numbers the same upgrades write. If any of those is live, the skill
      // will try to fire and there is no path for it.
      const siblings = new Set<string>()
      for (const upgrade of file.upgrades) {
        if (!upgrade.children.some((c) => c.name === param.name && c.type === 'string')) continue
        for (const child of upgrade.children) {
          if (child.name !== param.name && child.type !== 'bool') siblings.add(child.name)
        }
      }

      const live = [...siblings].filter((stat) => {
        const sibling = TWEAK_FIELD_MAP.get(paramKey(file.id, stat))
        if (sibling === undefined || sibling.type === 'string') return false
        return (tweaks[sibling.key] ?? sibling.stock) > 0
      })

      if (live.length > 0) {
        issues.push({
          field: field.key,
          message: `${param.name} is still empty while ${live.sort().join(', ')} ${live.length === 1 ? 'is' : 'are'} set — the skill would fire with an empty path and crash the game. Point ${param.name} at one of its ${field.choices?.length ?? 0} values.`
        })
      }
    }
  }

  return issues
}

/**
 * Stats the game rolls as a percentage.
 *
 * `shield-chance` is the giveaway: its stock ladder climbs 20/40/60/80/100 and
 * stops exactly at 100, whereas every damage ladder keeps climbing. Play-testing
 * confirmed 500 behaves like 100. `shield-distr` is the share of damage routed to
 * mana, a percentage for the same reason.
 */
function isChanceStat(stat: string): boolean {
  return (
    stat.endsWith('-chance') || stat.endsWith('-slow') || stat === 'slow' || stat === 'shield-distr'
  )
}

/**
 * The percentage stats that avoid the hit outright, rather than proccing an
 * effect alongside it.
 *
 * The distinction is worth drawing because the two look identical in the data and
 * behave completely differently at 100: `dodge-chance` at 100 makes a Thief or
 * Ranger literally unhittable `[VERIFIED]`, while `shield-chance` at 100 leaves a
 * Sorcerer taking full damage — it is the frost-shield proc, not evasion.
 */
function isEvasionStat(stat: string): boolean {
  return stat === 'dodge-chance'
}

/**
 * How many extra upgrades a removal takes down with it.
 *
 * An upgrade names its prerequisite by id, so `applyTweaks` removes the whole
 * dependent subtree rather than leaving a `req` pointing at an entry the file no
 * longer contains. That is the right behaviour, but it can remove more than the
 * user picked, so it is worth saying out loud. A dependent the user ALSO
 * removed is not "more than they picked", so it is not counted — removing a
 * whole ladder's tail tier by tier (as a player preset may) warns about nothing.
 */
function removalCascade(field: TweakFieldDef, tweaks: PlayerTweaks): number {
  const file = TWEAK_BASELINE.find((candidate) => candidate.id === field.fileId)
  if (file === undefined || file.kind !== 'unit' || field.upgradeId === undefined) return 0

  const doomed = new Set([field.upgradeId])
  let growing = true
  while (growing) {
    growing = false
    for (const upgrade of file.upgrades) {
      if (doomed.has(upgrade.id)) continue
      if (upgrade.req !== undefined && doomed.has(upgrade.req)) {
        doomed.add(upgrade.id)
        growing = true
      }
    }
  }

  let extra = 0
  for (const id of doomed) {
    if (id === field.upgradeId) continue
    if (tweaks[`player.${field.fileId}.remove.${id}`.toLowerCase()] !== 1) extra++
  }
  return extra
}

/**
 * Upgrades *set* a stat to an absolute value, so an upgrade that lands on the
 * wrong side of the character's starting value is bought with gold and makes
 * the character worse. That is easy to walk into by raising a starting stat and
 * leaving the ladder alone, so it warns rather than blocks — an intentionally
 * cursed build is still a legal build.
 *
 * Which side is "wrong" comes from the stock data: most stats climb, but
 * `mana-regen` is a millisecond period and the `*-mana-cost` stats are prices,
 * where the stock upgrades fall.
 */
function downgradeMessage(
  field: TweakFieldDef,
  value: number,
  tweaks: PlayerTweaks
): string | undefined {
  if (field.stat === undefined) return undefined

  const start = TWEAK_FIELD_MAP.get(paramKey(field.fileId, field.stat))
  if (start === undefined || SENTINELS.has(start.stock)) return undefined

  const improves = improvesBy(field.stock, start.stock)
  if (improves === 0) return undefined

  const current = tweaks[start.key] ?? start.stock
  if (SENTINELS.has(current)) return undefined

  if (!isDowngrade(value, current, improves)) return undefined
  if (ladderAbsorbed(start, current, tweaks)) return undefined

  return `${field.upgradeId} sets ${field.stat} to ${value}, ${
    improves > 0 ? 'below' : 'above'
  } the starting ${field.stat} of ${current} — buying it would downgrade the character.`
}

/**
 * True when the starting stat sits exactly on a rung of its own ladder.
 *
 * That is the signature of a character created fully upgraded: every tier below
 * the top really is a downgrade, but saying so once per tier per class buries the
 * screen in warnings about the thing the user just asked for. A start that merely
 * *overshoots* the ladder is not absorbed and still warns, because that is the
 * typed-a-big-number mistake these messages are written for.
 */
function ladderAbsorbed(
  startField: TweakFieldDef,
  start: number,
  tweaks: PlayerTweaks
): boolean {
  for (const effect of EFFECTS_BY_STAT.get(startField.key) ?? []) {
    if ((tweaks[effect.key] ?? effect.stock) === start) return true
  }
  return false
}

/** Effect fields grouped by the starting stat they compete with. */
const EFFECTS_BY_STAT = ((): Map<string, TweakFieldDef[]> => {
  const map = new Map<string, TweakFieldDef[]>()
  for (const field of TWEAK_FIELDS) {
    if (field.group !== 'effect' || field.stat === undefined) continue
    const key = paramKey(field.fileId, field.stat)
    const bucket = map.get(key)
    if (bucket === undefined) map.set(key, [field])
    else bucket.push(field)
  }
  return map
})()

/**
 * How many upgrades a *starting stat* has just overtaken.
 *
 * The per-field check above only sees tiers the user actually edited, and the
 * mistake this is here to catch is the opposite: raising a starting stat and
 * leaving the stock ladder alone, which stores no upgrade override at all.
 *
 * A start that has absorbed its own ladder is exempt — see {@link ladderAbsorbed}.
 */
function staleUpgrades(
  field: TweakFieldDef,
  start: number,
  tweaks: PlayerTweaks
): { count: number; side: string } | undefined {
  if (field.stat === undefined || SENTINELS.has(start)) return undefined
  if (ladderAbsorbed(field, start, tweaks)) return undefined

  let count = 0
  // the stat's own stock ladder says which direction counts as an improvement
  let improving = 0
  for (const effect of EFFECTS_BY_STAT.get(field.key) ?? []) {
    const improves = improvesBy(effect.stock, field.stock)
    if (improves === 0) continue
    const value = tweaks[effect.key] ?? effect.stock
    if (isDowngrade(value, start, improves)) {
      count += 1
      improving = improves
    }
  }

  if (count === 0) return undefined
  return { count, side: improving > 0 ? 'below' : 'above' }
}

/**
 * Timer mode's per-floor rules.
 *
 * Structured like validateLobby and validateBoss: a `before` snapshot, every
 * error rule, a guard, then warnings — so a floor that is off, or one that
 * already has errors, never accumulates advisories on top.
 *
 * An absent `levelTimers` means "no floor has a timer", which is the
 * pre-feature default and never invalid. Entries past `levels` are ignored by
 * the generator, so they are a warning rather than an error.
 */
function validateLevelTimers(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const timers = p.levelTimers
  if (timers === undefined) return

  const before = errors.length

  timers.slice(0, p.levels).forEach((timer, i) => {
    if (!timer.enabled) return
    const at = (field: string) => `levelTimers.${i}.${field}`

    if (!Number.isInteger(timer.seconds) || timer.seconds < 1 || timer.seconds > MAX_TIMER_SECONDS) {
      errors.push({
        field: at('seconds'),
        message: `Floor ${i + 1}: countdown must be a whole number of seconds between 1 and ${MAX_TIMER_SECONDS}.`
      })
    }
    if (
      !Number.isInteger(timer.freqMs) ||
      timer.freqMs < MIN_TIMER_FREQ_MS ||
      timer.freqMs > MAX_TIMER_FREQ_MS
    ) {
      errors.push({
        field: at('freqMs'),
        message: `Floor ${i + 1}: frequency must be a whole number of milliseconds between ${MIN_TIMER_FREQ_MS} and ${MAX_TIMER_FREQ_MS}.`
      })
    }
    if (!Number.isInteger(timer.damage) || Math.abs(timer.damage) > MAX_TIMER_DAMAGE) {
      errors.push({
        field: at('damage'),
        message: `Floor ${i + 1}: damage must be a whole number between -${MAX_TIMER_DAMAGE} and ${MAX_TIMER_DAMAGE} (negative heals).`
      })
    }
  })

  if (errors.length > before) return

  const enabled = timers.slice(0, p.levels).filter((t) => t.enabled)
  if (enabled.length === 0) return

  if (timers.length > p.levels) {
    warnings.push({
      field: 'levelTimers',
      message: `${timers.length} floor timers for ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }

  timers.slice(0, p.levels).forEach((timer, i) => {
    if (!timer.enabled) return
    if (timer.damage === 0) {
      warnings.push({
        field: `levelTimers.${i}.damage`,
        message: `Floor ${i + 1}: a timer with 0 damage does nothing once it fires.`
      })
    }
    if (timer.countdown && timer.seconds > TIMER_COUNTDOWN_NODE_WARN) {
      warnings.push({
        field: `levelTimers.${i}.countdown`,
        message:
          `Floor ${i + 1}: a ${timer.seconds}s countdown emits ${timer.seconds + 1} announce nodes on that floor. ` +
          'Turn the countdown off, or shorten it, to keep the level file small.'
      })
    }
  })

  if (p.levels === 0) {
    warnings.push({
      field: 'levelTimers',
      message: 'Floor timers only apply to generated dungeon floors — with 0 floors none of them run.'
    })
  }
}

/**
 * Per-floor music (music/rig.ts). Same shape as validateLevelTimers above it.
 *
 * An absent `floorMusic`, or every entry unset/`MUSIC_DEFAULT`, means "no
 * floor swaps its music", which is the pre-feature default and never invalid.
 * Entries past `levels` are ignored by the generator, so they are a warning
 * rather than an error.
 */
function validateFloorMusic(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const floorMusic = p.floorMusic
  if (floorMusic === undefined) return

  const before = errors.length

  floorMusic.slice(0, p.levels).forEach((track, i) => {
    if (!isKnownMusicId(track)) {
      errors.push({
        field: `floorMusic.${i}`,
        message: `Floor ${i + 1}: "${track}" is not a music track. Valid tracks: ${MUSIC_DEFAULT}, ${MUSIC_TRACKS.map((t) => t.id).join(', ')}.`
      })
    }
  })

  if (errors.length > before) return

  if (floorMusic.length > p.levels) {
    warnings.push({
      field: 'floorMusic',
      message: `${floorMusic.length} floor music entries for ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }
}

/**
 * Buff auras per floor (buffs/field.ts).
 *
 * Same shape as validateLevelTimers below it — snapshot, error rules, a guard,
 * then warnings — so a floor with an unknown buff never also accumulates
 * advisories about it.
 *
 * An absent `levelBuffs`, or an empty list, means "no floor carries a buff",
 * which is the pre-feature default and never invalid. Entries past `levels` are
 * ignored by the generator, so they are a warning rather than an error.
 */
function validateLevelBuffs(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const levelBuffs = p.levelBuffs
  if (levelBuffs === undefined) return

  const before = errors.length

  levelBuffs.slice(0, p.levels).forEach((buffs, i) => {
    buffs.forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) {
        errors.push({
          field: `levelBuffs.${i}.${j}.buff`,
          message: `Floor ${i + 1}: "${entry.buff}" is not a buff the game ships.`
        })
      }
      if (!BUFF_TARGETS.includes(entry.target)) {
        errors.push({
          field: `levelBuffs.${i}.${j}.target`,
          message: `Floor ${i + 1}: "${entry.target}" is not a buff target — use ${BUFF_TARGETS.join(', ')}.`
        })
      }
    })
  })

  if (errors.length > before) return

  const inRange = levelBuffs.slice(0, p.levels)
  if (inRange.every((buffs) => buffs.length === 0)) return

  if (levelBuffs.length > p.levels) {
    warnings.push({
      field: 'levelBuffs',
      message: `Buffs for ${levelBuffs.length} floors but only ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }

  inRange.forEach((buffs, i) => {
    const seen = new Set<string>()
    buffs.forEach((entry, j) => {
      const pair = `${entry.buff}|${entry.target}`
      if (seen.has(pair)) {
        warnings.push({
          field: `levelBuffs.${i}.${j}.buff`,
          message: `Floor ${i + 1}: "${entry.buff}" is already applied to ${entry.target} on this floor — the second copy does nothing.`
        })
      }
      seen.add(pair)

      // Aiming a strengthening buff at the horde is a legitimate "make this
      // floor terrifying" choice, so this is advisory only — it exists to catch
      // the case where the target dropdown was simply left on its default.
      if (BUFF_HELPFUL_IDS.includes(entry.buff) && entry.target !== 'players') {
        warnings.push({
          field: `levelBuffs.${i}.${j}.target`,
          message: `Floor ${i + 1}: "${entry.buff}" strengthens whatever it catches, and this one catches ${entry.target}.`
        })
      }
    })
  })

  if (p.levels === 0) {
    warnings.push({
      field: 'levelBuffs',
      message: 'Buff auras only apply to generated dungeon floors — with 0 floors none of them run.'
    })
  }
}

/**
 * The per-floor wall traps. Same five fields as a boss tier's, phrased per
 * floor, with two deliberate differences: a capacity warning measured against
 * rooms rather than an arena, and no upper bound on `count` — see
 * FloorTrap.count's doc comment for why MAX_TRAP_COUNT does not apply here.
 */
/**
 * Every rule for the per-floor bosses (issue #61).
 *
 * House shape, the one `validateLevelTraps` documents: snapshot, error rules, a
 * guard, then warnings — so a floor with an unknown boss never also collects
 * advisories about it.
 *
 * Only ENABLED floors are checked. A disabled entry is the stock value on every
 * floor of every campaign, so validating its contents would make the default
 * parameter set noisy about a feature nobody switched on.
 */
function validateLevelBoss(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const levelBoss = p.levelBoss
  if (levelBoss === undefined) return

  const before = errors.length

  levelBoss.slice(0, p.levels).forEach((boss, i) => {
    if (boss === undefined || !boss.enabled) return

    const bf = (suffix: string): string => `levelBoss.${i}.${suffix}`

    // Selection mode (issue #64 follow-up: exact lineups) — same "unknown id
    // is an error" treatment as the arena's.
    if (boss.bossSelection !== undefined && !(BOSS_SELECTIONS as readonly string[]).includes(boss.bossSelection)) {
      errors.push({ field: bf('bossSelection'), message: `Floor ${i + 1}: unknown boss selection mode "${boss.bossSelection}".` })
    }

    const floorSelection = bossSelection(boss)
    // floorBossCount() already applies the lineup-aware rule.
    const floorBossCountValue = floorBossCount(boss)

    if (floorSelection === 'lineup') {
      // Lineup mode does not read bossPool at all — restricted to
      // MOBILE_BOSS_IDS, same reason bossPool is. No layout-fit check: a
      // floor boss is placed on an ordinary interior room tile, not laid out
      // by arenaBossLayout, so there is nothing geometric to check here.
      validateBossLineup(boss.bossLineup, bf('bossLineup'), MOBILE_BOSS_IDS, errors, `Floor ${i + 1}`)

      if (!Number.isInteger(floorBossCountValue) || floorBossCountValue < 1 || floorBossCountValue > MAX_BOSS_COUNT) {
        errors.push({
          field: bf('bossLineup'),
          message: `Floor ${i + 1}: the lineup must total between 1 and ${MAX_BOSS_COUNT} bosses.`
        })
      }
    } else {
      if (boss.bossPool.length === 0) {
        errors.push({ field: bf('bossPool'), message: `Floor ${i + 1}: at least one boss must be in the pool.` })
      }
      const knownFloorPoolIds: string[] = []
      for (const id of boss.bossPool) {
        if (!BOSS_IDS.includes(id as (typeof BOSS_IDS)[number])) {
          errors.push({ field: bf('bossPool'), message: `Floor ${i + 1}: unknown boss "${id}".` })
        } else if (!isMobileBoss(id)) {
          // The floor's way out is sealed until the boss dies, so a boss that
          // cannot cross the floor to reach the party is a floor that can never
          // be finished. An arena confines the fight; a dungeon floor does not.
          errors.push({
            field: bf('bossPool'),
            message: `Floor ${i + 1}: "${id}" cannot move, so it can never reach the party on a dungeon floor. Pick one of: ${MOBILE_BOSS_IDS.join(', ')}.`
          })
        } else {
          knownFloorPoolIds.push(id)
        }
      }

      // bossCount (issue #64 part 1): a whole number 1..MAX_BOSS_COUNT, and — if
      // the pool holds only unique bosses — never more than the pool can
      // actually supply. In practice MOBILE_BOSS_IDS has none, but the rule is
      // the same one an arena's pool follows, not a floor-specific exemption.
      if (!Number.isInteger(floorBossCountValue) || floorBossCountValue < 1 || floorBossCountValue > MAX_BOSS_COUNT) {
        errors.push({
          field: bf('bossCount'),
          message: `Floor ${i + 1}: boss count must be a whole number from 1 to ${MAX_BOSS_COUNT}.`
        })
      } else if (
        knownFloorPoolIds.length > 0 &&
        knownFloorPoolIds.every((id) => (UNIQUE_BOSS_IDS as readonly string[]).includes(id)) &&
        floorBossCountValue > knownFloorPoolIds.length
      ) {
        errors.push({
          field: bf('bossCount'),
          message: `Floor ${i + 1}: every boss in the pool is unique (at most one each) — a pool of ${knownFloorPoolIds.length} cannot supply ${floorBossCountValue} bosses.`
        })
      }
    }

    if (boss.waves.length !== BOSS_WAVE_COUNT) {
      errors.push({
        field: bf('waves'),
        message: `Floor ${i + 1}: exactly ${BOSS_WAVE_COUNT} wave tiers are required (100/75/50/25 and boss death).`
      })
    }

    boss.waves.forEach((wave, tier) => {
      for (const key of wave.monsters) {
        if (!isKnownMonsterKey(key)) {
          errors.push({ field: bf(`waves.${tier}.monsters`), message: `Floor ${i + 1}: unknown monster "${key}".` })
        }
      }
      for (const [id, max] of Object.entries(wave.monsterMax ?? {})) {
        if (!Number.isInteger(max) || max < -1) {
          errors.push({
            field: bf(`waves.${tier}.monsterMax.${id}`),
            message: `Floor ${i + 1}: max count for "${id}" must be a whole number ≥ -1 (-1 = endless).`
          })
        }
      }
      const ms = wave.defaultIntervalMs
      if (!Number.isInteger(ms) || ms < MIN_WAVE_INTERVAL_MS || ms > MAX_WAVE_INTERVAL_MS) {
        errors.push({
          field: bf(`waves.${tier}.defaultIntervalMs`),
          message: `Floor ${i + 1}: spawn interval must be between ${MIN_WAVE_INTERVAL_MS} and ${MAX_WAVE_INTERVAL_MS} ms.`
        })
      }
      for (const [j, row] of waveTraps(wave).entries()) {
        const tf = (suffix: string): string => bf(`waves.${tier}.traps.${j}.${suffix}`)
        if (projectileById(row.projectile) === undefined) {
          errors.push({ field: tf('projectile'), message: `Floor ${i + 1}: unknown projectile "${row.projectile}".` })
        }
        if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) {
          errors.push({ field: tf('direction'), message: `Floor ${i + 1}: "${row.direction}" is not one of: ${BOSS_TRAP_DIRECTIONS.join(', ')}.` })
        }
        if (!Number.isFinite(row.spread) || row.spread < 0 || row.spread > TRAP_SPREAD_MAX) {
          errors.push({ field: tf('spread'), message: `Floor ${i + 1}: spread must be between 0 and ${TRAP_SPREAD_MAX}.` })
        }
        if (!Number.isInteger(row.count) || row.count < 1) {
          errors.push({ field: tf('count'), message: `Floor ${i + 1}: trap count must be a whole number of at least 1.` })
        }
      }
      for (const [j, entry] of waveBuffs(wave).entries()) {
        if (buffById(entry.buff) === undefined) {
          errors.push({ field: bf(`waves.${tier}.buffs.${j}.buff`), message: `Floor ${i + 1}: unknown buff "${entry.buff}".` })
        }
        if (!BUFF_TARGETS.includes(entry.target)) {
          errors.push({
            field: bf(`waves.${tier}.buffs.${j}.target`),
            message: `Floor ${i + 1}: "${entry.target}" is not one of: ${BUFF_TARGETS.join(', ')}.`
          })
        }
      }
      // Each copy is its own SpawnObject, so the count is a node count — the
      // same bound the arena puts on it.
      for (const [j, entry] of wavePickups(wave).entries()) {
        if (pickupById(entry.item) === undefined) {
          errors.push({ field: bf(`waves.${tier}.pickups.${j}.item`), message: `Floor ${i + 1}: "${entry.item}" is not an item the game ships.` })
        }
        if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > MAX_PICKUP_COUNT) {
          errors.push({
            field: bf(`waves.${tier}.pickups.${j}.count`),
            message: `Floor ${i + 1}: wave ${tier + 1} drops ${entry.count} × "${entry.item}" — the count must be a whole number 1..${MAX_PICKUP_COUNT}.`
          })
        }
      }
    })

    const invuln = boss.invulnerability
    for (const [j, seconds] of invuln.seconds.entries()) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_BOSS_INVULN_SECONDS) {
        errors.push({
          field: bf(`invulnerability.seconds.${j}`),
          message: `Floor ${i + 1}: an invulnerability window must be a whole number of seconds between 0 and ${MAX_BOSS_INVULN_SECONDS}.`
        })
      }
    }

    // Both rigs count down on screen on the same level, and the issue is
    // explicit that turning one on turns the other off. An error rather than a
    // silent drop: whichever we discarded, the dungeon master configured it.
    // Multi-boss (issue #64 part 1): invulnerability is skipped outright for
    // more than one boss, so it cannot compete with the timer's countdown —
    // this error applies only to a single-boss floor.
    if (!isMultiBoss(floorBossCountValue) && invuln.enabled && p.levelTimers?.[i]?.enabled === true) {
      errors.push({
        field: bf('invulnerability'),
        message: `Floor ${i + 1}: boss invulnerability and timer mode cannot both run on one floor — they announce competing countdowns. Switch one off.`
      })
    }

    if (!(boss.checkpoints.respawnPlayers in BOSS_CHECKPOINT_PRESETS)) {
      errors.push({ field: bf('checkpoints.respawnPlayers'), message: `Floor ${i + 1}: unknown checkpoint preset "${boss.checkpoints.respawnPlayers}".` })
    }
    if (!(boss.checkpoints.saveGame in BOSS_CHECKPOINT_PRESETS)) {
      errors.push({ field: bf('checkpoints.saveGame'), message: `Floor ${i + 1}: unknown checkpoint preset "${boss.checkpoints.saveGame}".` })
    }

    if (!Number.isFinite(boss.monsterMultiplier) || boss.monsterMultiplier < 0) {
      errors.push({ field: bf('monsterMultiplier'), message: `Floor ${i + 1}: multiplier must be ≥ 0.` })
    }
  })

  if (errors.length > before) return

  // --- warnings ---

  levelBoss.slice(0, p.levels).forEach((boss, i) => {
    if (boss === undefined || !boss.enabled) return
    const bf = (suffix: string): string => `levelBoss.${i}.${suffix}`

    // The gateway room has to be a dead end for the seal to close it, and a
    // floor with very few rooms rarely rolls one — the same shape the existing
    // lockFinalRoom warning is about, and here it is not optional.
    if (p.minRoomCount < 3) {
      warnings.push({
        field: bf('enabled'),
        message: `Floor ${i + 1}: a boss floor's way out must be a dead-end room, which a floor of only ${p.minRoomCount} rooms will often fail to produce — expect slow generation or a failure.`
      })
    }

    if (boss.waves.every((w) => w.monsters.length === 0)) {
      warnings.push({
        field: bf('waves'),
        message: `Floor ${i + 1}: the boss fights alone — no wave tier spawns anything.`
      })
    }

    // Advisory ceiling (issue #64 follow-up), in EITHER selection mode — same
    // "legal but expect chaos" warning the arena carries.
    const floorEffectiveCount = floorBossCount(boss)
    if (floorEffectiveCount > BOSS_COUNT_WARN) {
      warnings.push({
        field: bossSelection(boss) === 'lineup' ? bf('bossLineup') : bf('bossCount'),
        message: `Floor ${i + 1}: ${floorEffectiveCount} bosses is a lot — expect a crowded, chaotic floor and slower generation.`
      })
    }

    // Two rows of one item work — they just scatter separately — but one row
    // with the counts added is what was meant, and what the form edits in one place.
    boss.waves.forEach((wave, tier) => {
      const seen = new Set<string>()
      wavePickups(wave).forEach((entry, j) => {
        if (seen.has(entry.item)) {
          warnings.push({
            field: bf(`waves.${tier}.pickups.${j}.item`),
            message: `Floor ${i + 1}: wave ${tier + 1} already drops "${entry.item}" — fold the two rows into one count.`
          })
        }
        seen.add(entry.item)
      })
    })
  })

  if (levelBoss.length > p.levels) {
    warnings.push({
      field: 'levelBoss',
      message: `There are more boss entries than floors — the extra entries are ignored.`
    })
  }
}

function validateLevelTraps(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const levelTraps = p.levelTraps
  if (levelTraps === undefined) return

  const before = errors.length

  levelTraps.slice(0, p.levels).forEach((rows, i) => {
    rows.forEach((row, j) => {
      if (projectileById(row.projectile) === undefined) {
        errors.push({
          field: `levelTraps.${i}.${j}.projectile`,
          message: `Floor ${i + 1}: "${row.projectile}" is not a projectile the game ships.`
        })
      }
      if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) {
        errors.push({
          field: `levelTraps.${i}.${j}.direction`,
          message: `Floor ${i + 1}: "${row.direction}" is not a firing direction — use ${BOSS_TRAP_DIRECTIONS.join(', ')}.`
        })
      }
      // Decimal on purpose: the reference axe rig fires at 0.5. The engine
      // clamps outside 0..2 with no warning, so the bound is ours to enforce.
      if (!Number.isFinite(row.spread) || row.spread < 0 || row.spread > TRAP_SPREAD_MAX) {
        errors.push({
          field: `levelTraps.${i}.${j}.spread`,
          message: `Floor ${i + 1}: the "${row.projectile}" trap fans at ${row.spread} — spread must be between 0 and ${TRAP_SPREAD_MAX}.`
        })
      }
      if (!Number.isInteger(row.spawnRateMs) || row.spawnRateMs < 1) {
        errors.push({
          field: `levelTraps.${i}.${j}.spawnRateMs`,
          message: `Floor ${i + 1}: the "${row.projectile}" trap fires every ${row.spawnRateMs} ms — the rate must be a whole number of milliseconds, at least 1.`
        })
      }
      // Every spewer is its own node on its own tile — see traps/floor.ts. No
      // upper bound: unlike a boss tier's wall, a floor's pool is the whole
      // floor's rooms, and running it dry is a warning (below), not an error.
      if (!Number.isInteger(row.count) || row.count < 1) {
        errors.push({
          field: `levelTraps.${i}.${j}.count`,
          message: `Floor ${i + 1} places ${row.count} × "${row.projectile}" — the count must be a whole number of at least 1.`
        })
      }
    })
  })

  if (errors.length > before) return

  const inRange = levelTraps.slice(0, p.levels)
  if (inRange.every((rows) => rows.length === 0)) return

  if (levelTraps.length > p.levels) {
    warnings.push({
      field: 'levelTraps',
      message: `Traps for ${levelTraps.length} floors but only ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }

  if (p.levels === 0) {
    warnings.push({
      field: 'levelTraps',
      message: 'Wall traps only apply to generated dungeon floors — with 0 floors none of them run.'
    })
  }

  inRange.forEach((rows, i) => {
    // A warning, not an error: the engine imposes no bound and a very fast lane
    // is a legitimate thing to build deliberately. It is worth saying out loud
    // because nothing else will.
    rows.forEach((row, j) => {
      if (Number.isInteger(row.spawnRateMs) && row.spawnRateMs < TRAP_FAST_SPAWN_RATE_MS) {
        warnings.push({
          field: `levelTraps.${i}.${j}.spawnRateMs`,
          message: `Floor ${i + 1}: the "${row.projectile}" trap fires every ${row.spawnRateMs} ms. Below ${TRAP_FAST_SPAWN_RATE_MS} ms the floor fills with projectiles faster than the party can cross it, and the framerate suffers.`
        })
      }
    })

    // Capacity is per direction, because each has its own slot pool. The
    // estimate assumes the smallest floor this parameter set can roll and an
    // empty one at that — doorways, prefabs and the skipped rooms only reduce
    // it — so overshooting means "some of these will be skipped", not "this is
    // invalid". traps/floor.ts stops placing gracefully either way.
    const wanted = new Map<TrapDirection, number>()
    for (const row of rows) {
      if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) continue
      wanted.set(row.direction, (wanted.get(row.direction) ?? 0) + row.count)
    }
    for (const direction of BOSS_TRAP_DIRECTIONS) {
      const total = wanted.get(direction) ?? 0
      if (total === 0) continue
      const capacity = floorTrapCapacity(p, direction)
      if (total > capacity) {
        warnings.push({
          field: `levelTraps.${i}`,
          message: `Floor ${i + 1} asks for ${total} trap(s) firing ${direction}, but its smallest rooms hold about ${capacity} — the extra ones will be skipped.`
        })
      }
    }
  })
}

/** Characters a mystery button's name or text may not carry — see validateMystery. */
const MYSTERY_FORBIDDEN = /[=<>&\r\n]/

/**
 * Mystery buttons (issue #67): the campaign-wide pool and each floor's pick
 * from it. Every row rule mirrors the same row type elsewhere (a wave pickup,
 * a boss tier's trap), because the rig emits the same nodes for them.
 */
function validateMystery(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const pool = p.mysteryButtons ?? []
  const floors = p.levelMystery

  // No rule on the pool's size: it is unbounded by design (see MYSTERY_PARSE_LIMIT).
  pool.forEach((button, i) => {
    const at = `mysteryButtons.${i}`
    const label = `Mystery button ${i + 1}${button.name ? ` ("${button.name}")` : ''}`

    // Both strings go into the level XML unescaped (xml/ writes values raw)
    // and into parameters.txt, whose line split drops any value holding `=`.
    for (const [field, text, max] of [
      ['name', button.name, MYSTERY_NAME_MAX],
      ['text', button.text, MYSTERY_TEXT_MAX]
    ] as const) {
      if (text === undefined) continue
      if (text.length > max) {
        errors.push({ field: `${at}.${field}`, message: `${label}: the ${field} is ${text.length} characters — at most ${max}.` })
      }
      if (MYSTERY_FORBIDDEN.test(text)) {
        errors.push({
          field: `${at}.${field}`,
          message: `${label}: the ${field} may not contain = < > & or a line break.`
        })
      } else if (field === 'text' && /[^\x20-\x7e]/.test(text)) {
        warnings.push({
          field: `${at}.text`,
          message: `${label}: the announcement has characters outside plain ASCII, which the game's font may not draw.`
        })
      }
    }

    button.loot.forEach((row, j) => {
      if (mysteryLootById(row.item) === undefined) {
        errors.push({ field: `${at}.loot.${j}.item`, message: `${label}: "${row.item}" is not an item a mystery button can spawn.` })
      }
      if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_PICKUP_COUNT) {
        errors.push({
          field: `${at}.loot.${j}.count`,
          message: `${label} spawns ${row.count} × "${row.item}" — the count must be a whole number from 1 to ${MAX_PICKUP_COUNT}.`
        })
      }
    })

    button.monsters.forEach((row, j) => {
      if (!isKnownMonsterKey(row.monster)) {
        errors.push({ field: `${at}.monsters.${j}.monster`, message: `${label}: "${row.monster}" is not a known monster.` })
      }
      if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_MYSTERY_MONSTERS) {
        errors.push({
          field: `${at}.monsters.${j}.count`,
          message: `${label} spawns ${row.count} × "${row.monster}" — the count must be a whole number from 1 to ${MAX_MYSTERY_MONSTERS}.`
        })
      }
    })

    button.traps.forEach((row, j) => {
      if (projectileById(row.projectile) === undefined) {
        errors.push({ field: `${at}.traps.${j}.projectile`, message: `${label}: "${row.projectile}" is not a projectile the game ships.` })
      }
      if (!BOSS_TRAP_DIRECTIONS.includes(row.direction)) {
        errors.push({
          field: `${at}.traps.${j}.direction`,
          message: `${label}: "${row.direction}" is not a firing direction — use ${BOSS_TRAP_DIRECTIONS.join(', ')}.`
        })
      }
      if (!Number.isFinite(row.spread) || row.spread < 0 || row.spread > TRAP_SPREAD_MAX) {
        errors.push({
          field: `${at}.traps.${j}.spread`,
          message: `${label}: the "${row.projectile}" trap fans at ${row.spread} — spread must be between 0 and ${TRAP_SPREAD_MAX}.`
        })
      }
      if (!Number.isInteger(row.spawnRateMs) || row.spawnRateMs < 1) {
        errors.push({
          field: `${at}.traps.${j}.spawnRateMs`,
          message: `${label}: the "${row.projectile}" trap fires every ${row.spawnRateMs} ms — the rate must be a whole number of milliseconds, at least 1.`
        })
      } else if (row.spawnRateMs < TRAP_FAST_SPAWN_RATE_MS) {
        warnings.push({
          field: `${at}.traps.${j}.spawnRateMs`,
          message: `${label}: the "${row.projectile}" trap fires every ${row.spawnRateMs} ms — below ${TRAP_FAST_SPAWN_RATE_MS} ms the room fills with projectiles faster than the party can cross it.`
        })
      }
      // One room's wall, like one arena wall — so the arena's bound applies.
      if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_TRAP_COUNT) {
        errors.push({
          field: `${at}.traps.${j}.count`,
          message: `${label} places ${row.count} × "${row.projectile}" — the count must be a whole number from 1 to ${MAX_TRAP_COUNT}.`
        })
      }
    })

    const seconds = button.trapSeconds
    if (seconds !== undefined) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_MYSTERY_TRAP_SECONDS) {
        errors.push({
          field: `${at}.trapSeconds`,
          message: `${label}: traps switch off after ${seconds} s — use a whole number from 0 (never) to ${MAX_MYSTERY_TRAP_SECONDS}.`
        })
      } else if (seconds > 0 && button.traps.length === 0) {
        warnings.push({ field: `${at}.trapSeconds`, message: `${label} has a trap switch-off time but no traps.` })
      }
    }
  })

  if (floors !== undefined) {
    const inRange = floors.slice(0, p.levels)
    const capacity = mysteryCapacity(p.minRoomCount, p.minRoomSize)
    inRange.forEach((floor, i) => {
      const at = `levelMystery.${i}`
      if (!Number.isInteger(floor.count) || floor.count < 0 || floor.count > MAX_MYSTERY_PER_FLOOR) {
        errors.push({
          field: `${at}.count`,
          message: `Floor ${i + 1}: ${floor.count} mystery buttons — use a whole number from 0 to ${MAX_MYSTERY_PER_FLOOR}.`
        })
        return
      }
      const dangling = floor.pool.filter((n) => !Number.isInteger(n) || n < 0 || n >= pool.length)
      if (dangling.length > 0) {
        errors.push({
          field: `${at}.pool`,
          message: `Floor ${i + 1} draws from mystery button(s) ${dangling.map((n) => n + 1).join(', ')}, which the pool does not have.`
        })
        return
      }
      if (floor.count > 0 && floor.pool.length === 0) {
        errors.push({
          field: `${at}.pool`,
          message: `Floor ${i + 1} places ${floor.count} mystery buttons but has none picked from the pool — tick at least one.`
        })
        return
      }
      if (floor.count > capacity) {
        warnings.push({
          field: `${at}.count`,
          message: `Floor ${i + 1} asks for ${floor.count} mystery buttons, but the smallest floor these room settings can roll has room for about ${capacity} — the rest are skipped when it runs out.`
        })
      }
    })

    if (floors.length > p.levels && floors.slice(p.levels).some((f) => f.count > 0)) {
      warnings.push({
        field: 'levelMystery',
        message: `Mystery buttons are set for ${floors.length} floors but there are only ${p.levels} — the extra entries are ignored.`
      })
    }
  }

  // Enhanced lock buttons (built on the pool above) — a separate per-floor
  // pick list, so it is validated independent of `levelMystery` above; a
  // campaign may enhance lock buttons with no ordinary mystery plates at all.
  const lockFloors = p.levelLockMystery
  if (lockFloors === undefined) return

  const inRangeLock = lockFloors.slice(0, p.levels)
  inRangeLock.forEach((floor, i) => {
    const at = `levelLockMystery.${i}`
    if (!Number.isInteger(floor.count) || floor.count < 0 || floor.count > MAX_LOCK_BUTTONS) {
      errors.push({
        field: `${at}.count`,
        message: `Floor ${i + 1}: ${floor.count} enhanced lock buttons — use a whole number from 0 to ${MAX_LOCK_BUTTONS}.`
      })
      return
    }
    const dangling = floor.pool.filter((n) => !Number.isInteger(n) || n < 0 || n >= pool.length)
    if (dangling.length > 0) {
      errors.push({
        field: `${at}.pool`,
        message: `Floor ${i + 1}'s enhanced lock buttons draw from mystery button(s) ${dangling.map((n) => n + 1).join(', ')}, which the pool does not have.`
      })
      return
    }
    if (floor.count > 0 && floor.pool.length === 0) {
      errors.push({
        field: `${at}.pool`,
        message: `Floor ${i + 1} enhances ${floor.count} lock button(s) but has none picked from the pool — tick at least one.`
      })
      return
    }

    if (!floorLocked(p, i)) {
      if (floor.count > 0 || floor.pool.length > 0 || floor.disguise === true) {
        warnings.push({
          field: at,
          message: `Floor ${i + 1} has enhanced lock buttons or a disguise set, but the floor is not locked — there is nothing to enhance or disguise.`
        })
      }
      return
    }

    const buttons = floorLockButtons(p, i)
    if (floor.count > buttons) {
      warnings.push({
        field: `${at}.count`,
        message: `Floor ${i + 1} asks to enhance ${floor.count} lock buttons, but the floor only has ${buttons} — the rest are ignored.`
      })
    }
  })

  if (
    lockFloors.length > p.levels &&
    lockFloors.slice(p.levels).some((f) => f.count > 0 || f.pool.length > 0 || f.disguise === true)
  ) {
    warnings.push({
      field: 'levelLockMystery',
      message: `Enhanced lock buttons are set for ${lockFloors.length} floors but there are only ${p.levels} — the extra entries are ignored.`
    })
  }
}
