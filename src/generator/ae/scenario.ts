import { escapeXml } from './sval'

/**
 * AE scenario metadata: `info.xml`, which both the game (for an unpacked
 * scenario folder) and PACKAGER.exe read. A packed `.h1c` carries `info.xml`,
 * `logos.png` and the levels; PACKAGER compiles the rest (`info.sval`), so the
 * generator must NOT write an `info.sval` of its own — PACKAGER would ship it
 * as a plain file.
 *
 * The modifier list is the one Shaftlocke Tower and Temple of the Sun ship
 * (Castle Hammerwatch adds `LEGACY`, a switch only its own levels check).
 * [VERIFIED] against all three stock info.xml files.
 *
 * Except lives: a generated dungeon is a rogue-like, so it always plays with
 * no extra lives. `NO_LIVES` is FORCED on (`forced` is a modifier attribute
 * HW1A.exe reads, next to `default-on`) — the game then defines
 * `MOD_NO_LIVES`, which PartyRecord.as starts at 0 lives, the HUD hides the
 * counter and extra-life pickups honour. INFINITE_LIVES and DOUBLE_LIVES
 * would hand lives back, so they are not offered. [UNVERIFIED] in game that
 * `forced="true"` is the value the engine expects — docs/BOOT-CHECKLIST.md.
 */

export interface ModifierDef {
  name: string
  id: string
  lockedBy?: string
  tooltip?: string
  /** always on; the player cannot switch it off */
  forced?: boolean
}

/** `null` is a separator */
export const SCENARIO_MODIFIERS: Array<ModifierDef | null> = [
  { name: '.l.lineofsight', id: 'LINE_OF_SIGHT', tooltip: 'line of sight' },
  null,
  { name: '.l.nolives', id: 'NO_LIVES', forced: true },
  null,
  { name: '.l.1hp', id: 'ONE_HP', lockedBy: 'REVERSE_HP_REGEN' },
  { name: '.l.sharehp', id: 'SHARED_HP' },
  { name: '.l.hpregen', id: 'HP_REGEN', lockedBy: 'ONE_HP,REVERSE_HP_REGEN' },
  null,
  { name: '.l.doubledmg', id: 'DOUBLE_DAMAGE' },
  null,
  { name: '.l.nohppup', id: 'NO_HEALTH_PICKUP' },
  null,
  { name: '.l.nomanaregen', id: 'NO_MANA_REGEN', lockedBy: '5x_MANA_REGEN' },
  { name: '.l.quickmana', id: '5x_MANA_REGEN', lockedBy: 'NO_MANA_REGEN' },
  { name: '.l.revhpregen', id: 'REVERSE_HP_REGEN', lockedBy: 'ONE_HP,HP_REGEN' }
]

export interface ScenarioInfo {
  name: string
  description: string
  /** scenario-relative path of the level a new game opens, e.g. `levels/dungeon_42/floor_1.lvl` */
  startLevel: string
  minPlayers?: number
  maxPlayers?: number
}

export const DEFAULT_MAX_PLAYERS = 7

export function renderInfoXml(info: ScenarioInfo): string {
  const lines = [
    '<info>',
    `\t<name>${escapeXml(info.name)}</name>`,
    '\t<tag>Hammerwatch</tag>',
    `\t<description>${escapeXml(info.description)}</description>`,
    '',
    `\t<players min="${info.minPlayers ?? 1}" max="${info.maxPlayers ?? DEFAULT_MAX_PLAYERS}" />`,
    '\t<saving>all</saving>',
    '',
    '\t<start>',
    `\t\t<level name="Start level" lvl="${escapeXml(info.startLevel)}" />`,
    '\t</start>',
    '',
    '\t<modifiers>'
  ]
  for (const m of SCENARIO_MODIFIERS) {
    if (m === null) {
      lines.push('\t\t<separator />')
      continue
    }
    let attrs = `name="${m.name}" id="${m.id}"`
    if (m.lockedBy !== undefined) attrs += ` locked-by="${m.lockedBy}"`
    if (m.tooltip !== undefined) attrs += ` tooltip="${m.tooltip}"`
    if (m.forced === true) attrs += ' forced="true"'
    lines.push(`\t\t<modifier ${attrs} />`)
  }
  lines.push('\t</modifiers>', '</info>', '')
  return lines.join('\n')
}

/**
 * A scenario id safe for a folder name, a PACKAGER argument and the shared
 * `levels/<id>/` namespace (level paths are global across every scenario and
 * the base game, so each scenario keeps its levels under its own folder).
 */
export function scenarioSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s === '' ? 'scenario' : s
}
