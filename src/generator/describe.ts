/**
 * The optional `<scenario>_description.txt`: a plain-text summary of what a
 * generated campaign holds, so a player knows what they are getting into
 * before they start it.
 *
 * Pure and deterministic: it reads the parameters and the previews of a
 * finished generation, draws from no stream and has no date. It is written
 * BESIDE the scenario (next to the `.h1c`, the exported folder or at the zip
 * root), never into it, so the packed scenario stays byte-identical.
 */
import {
  arenaBossCount,
  arenaMode,
  bossFights,
  campaignCounts,
  floorBoss,
  floorBossCount,
  floorLockButtons,
  floorMystery
} from './config/parameters'
import type { DungeonParameters, FloorTimer } from './config/parameters'
import { getTheme } from './config/themes'
import { campaignOrder, gatewayAfter, slotLabeller } from './campaign'
import type { CampaignSlot } from './campaign'
import { DEFAULT_LOBBY_PRESET_ID, lobbyPresetById } from './lobby/presets'
import { biomeById } from './world/biomes'
import { worldList } from './world/options'
import type { LevelPreview } from './index'

export interface ScenarioSummarySource {
  seed: number
  /** the scenario id, `dungeon_<seed>` */
  campaignName: string
  /** the previews, in play order and relabelled (`DungeonResult.levels`) */
  levels: LevelPreview[]
  /** the parameters the campaign was generated from */
  params: DungeonParameters
}

/** The description file's name: `dungeon_<seed>_description.txt`. */
export function descriptionFileName(scenarioId: string): string {
  return `${scenarioId}_description.txt`
}

/** One line for the scenario list (info.xml) and the description: what the run holds. */
export function scenarioBlurb(params: DungeonParameters, fights: number, lobbies: number, worlds: number): string {
  const parts = [`${params.levels} floor${params.levels === 1 ? '' : 's'}`]
  if (worlds > 0) parts.push(`${worlds} world${worlds === 1 ? '' : 's'}`)
  if (fights > 0) parts.push(`${fights} arena${fights === 1 ? '' : 's'}`)
  if (lobbies > 0) parts.push(`${lobbies} lobb${lobbies === 1 ? 'y' : 'ies'}`)
  return `A generated rogue-like dungeon: ${parts.join(', ')}.`
}

const SPECIAL_ROOMS = ['Shop', 'Vault', 'Storage', 'Lair'] as const

const INDENT = '    '

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** `90` → `1:30`. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function timerText(timer: FloorTimer): string {
  const effect = timer.damage < 0 ? `heals ${-timer.damage}` : `${timer.damage} damage`
  return `a ${clock(timer.seconds)} timer, then ${effect} every ${timer.freqMs} ms`
}

function themeLabel(id: string): string {
  return getTheme(id)?.label ?? id
}

function roomLines(level: LevelPreview): string[] {
  const lines: string[] = []
  const special = SPECIAL_ROOMS.map((type) => ({ type, n: level.rooms.filter((r) => r.type === type).length })).filter((s) => s.n > 0)
  if (special.length > 0) {
    lines.push(`${INDENT}special rooms: ${special.map((s) => plural(s.n, s.type.toLowerCase())).join(', ')}`)
  }
  const locked = level.rooms.filter((r) => r.lockTier !== null).length
  const sealed = level.rooms.filter((r) => r.sealed).length
  const gates: string[] = []
  if (locked > 0) gates.push(plural(locked, 'locked door'))
  if (sealed > 0) gates.push(plural(sealed, 'button-sealed room'))
  if (gates.length > 0) lines.push(`${INDENT}gates: ${gates.join(', ')}`)
  return lines
}

function sizeParts(level: LevelPreview): string[] {
  return [`${level.mapWidth}x${level.mapHeight}`, plural(level.monsterCount, 'monster'), plural(level.itemCount, 'item')]
}

function floorLines(params: DungeonParameters, index: number, level: LevelPreview): string[] {
  const head = [`theme ${themeLabel(level.theme)}`, `${level.mapWidth}x${level.mapHeight}`, plural(level.rooms.length, 'room')]
  head.push(plural(level.monsterCount, 'monster'), plural(level.itemCount, 'item'))
  const lines = [`Floor ${index + 1}: ${head.join(', ')}`, ...roomLines(level)]

  const extras: string[] = []
  const boss = floorBoss(params, index)
  if (boss !== undefined) extras.push(floorBossCount(boss) === 1 ? 'a floor boss' : `${floorBossCount(boss)} floor bosses`)
  const buttons = floorLockButtons(params, index)
  if (buttons > 0) extras.push(`the way out opens after ${plural(buttons, 'button')}`)
  const timer = params.levelTimers?.[index]
  if (timer?.enabled === true) extras.push(timerText(timer))
  const traps = params.levelTraps?.[index]?.length ?? 0
  if (traps > 0) extras.push(plural(traps, 'trap'))
  const buffs = params.levelBuffs?.[index]?.length ?? 0
  if (buffs > 0) extras.push(plural(buffs, 'buff field'))
  const mystery = floorMystery(params, index)
  if (mystery !== undefined) extras.push(plural(mystery.count, 'mystery button'))
  if (extras.length > 0) lines.push(`${INDENT}on this floor: ${extras.join(', ')}`)
  return lines
}

function arenaLines(params: DungeonParameters, index: number, level: LevelPreview): string[] {
  const fight = bossFights(params.boss)[index]
  const survival = fight !== undefined && arenaMode(fight) === 'survival'
  const head = [`theme ${themeLabel(level.theme)}`, ...sizeParts(level)]
  const lines = [`${survival ? 'Survival' : 'Boss'} arena ${index + 1}: ${head.join(', ')}`]
  if (fight === undefined) return lines
  if (survival) {
    const seconds = fight.survival?.seconds
    lines.push(`${INDENT}survive the waves${seconds !== undefined ? ` for ${clock(seconds)}` : ''}`)
  } else {
    const n = arenaBossCount(fight.arena)
    lines.push(`${INDENT}${n === 1 ? 'one boss' : `${n} bosses`} to kill`)
  }
  return lines
}

function worldLines(params: DungeonParameters, index: number, level: LevelPreview): string[] {
  const biome = biomeById(level.theme)?.label ?? level.theme
  const lines = [`World ${index + 1}: biome ${biome}, ${sizeParts(level).join(', ')}`]
  const sites = level.world?.sites ?? []
  const buttons = sites.filter((s) => s.kind === 'button').length
  const bosses = sites.filter((s) => s.kind === 'boss').length
  const objectives: string[] = []
  if (buttons > 0) objectives.push(plural(buttons, 'button'))
  if (bosses > 0) objectives.push(plural(bosses, 'boss site'))
  lines.push(`${INDENT}objectives: ${objectives.length > 0 ? objectives.join(', ') : 'none, the portal is open from the start'}`)
  const timer = worldList(params.world)[index]?.timer
  if (timer?.enabled === true) lines.push(`${INDENT}on this island: ${timerText(timer)}`)
  return lines
}

function lobbyLine(params: DungeonParameters, index: number): string {
  // the same fallback the build uses: a retired or unknown preset is the default lobby
  const preset = lobbyPresetById(params.lobbies?.[index]?.preset ?? '') ?? lobbyPresetById(DEFAULT_LOBBY_PRESET_ID)
  return `Lobby ${index + 1}: ${preset?.label ?? 'town'}, a town with shops`
}

/** The whole description, one block per level in play order. */
export function describeScenario(source: ScenarioSummarySource): string {
  const { params } = source
  const fights = bossFights(params.boss)
  const counts = campaignCounts(params)
  const order = campaignOrder(counts, params.levelOrder)
  const label = slotLabeller(fights.map(arenaMode))
  const previews = new Map(source.levels.map((l) => [l.label, l]))
  const tweaks = Object.keys(params.playerTweaks ?? {}).length

  const lines = [
    `Hammerwatch AE rogue-like campaign: ${source.campaignName}`,
    `In game: Dungeon #${source.seed}`,
    `Seed: ${source.seed}`,
    `Holds: ${scenarioBlurb(params, counts.fights, counts.lobbies, counts.worlds)}`,
    `Play order: ${order.map(label).join(' > ')}`,
    'Lives: none (the No Lives modifier is forced)'
  ]
  if (tweaks > 0) lines.push(`Player balance: ${plural(tweaks, 'setting')} changed from stock`)
  lines.push('')

  order.forEach((slot: CampaignSlot, position) => {
    const tag = label(slot)
    const level = previews.get(tag)
    let block: string[]
    if (slot.kind === 'lobby') block = [lobbyLine(params, slot.index)]
    else if (level === undefined) return
    else if (slot.kind === 'floor') block = floorLines(params, slot.index, level)
    else if (slot.kind === 'boss') block = arenaLines(params, slot.index, level)
    else block = worldLines(params, slot.index, level)
    block[0] = `[${tag}] ${block[0]}`
    if (slot.kind !== 'lobby' && gatewayAfter(order, position).kind === 'orb') {
      block.push(`${INDENT}final level: the victory orb ends the run`)
    }
    lines.push(...block)
  })

  return `${lines.join('\n')}\n`
}
