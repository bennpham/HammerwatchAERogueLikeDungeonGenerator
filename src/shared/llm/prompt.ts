import {
  BOSS_IDS,
  MOBILE_BOSS_IDS,
  BUFF_DEFS,
  CAMPAIGN_PRESETS,
  LOBBY_PRESETS,
  MONSTER_TYPES,
  MUSIC_TRACKS,
  PICKUP_DEFS,
  PLAYER_PRESETS,
  PROJECTILE_DEFS,
  THEME_DEFS,
  defaultParameters,
  serializeParametersTxt
} from '../../generator'
import type { BossId, DungeonParameters, MonsterCampaign, MonsterGroup } from '../../generator'
import { diffSerialized } from './reply'

/** Claude presets shown as worked examples: a short one, a floor-boss one, a trap/timer one. */
const EXAMPLE_PRESET_IDS = ['claude-pandemonium', 'claude-beat-the-clock', 'claude-frozen-descent']

/**
 * How each feature key is written, one rule per line. Exported because
 * tests/llmPreset.test.ts parses every `key=value` example in them, so a format
 * cannot drift from what configFile.ts accepts. AE has no boss checkpoints.
 */
export const FEATURE_KEYS: readonly string[] = [
  'Floor wall traps: `trapN=<projectile>:<up|down|left|right>:<spread>:<fireEveryMs>:<count>|...`, e.g. `trap2=shooter_arrow:down:0:1000:3|shooter_arrow:up:0:1000:3`.',
  'Floor timer (floor hurts once the clock runs out): `timerN=1|<seconds>|<damage per tick>|<tick ms>|<1 to show the countdown>`, e.g. `timer5=1|240|1|1000|1`. `timerN=0` turns it off.',
  'Floor buff: `buffN=<buff id>:<players|monsters|both>`, e.g. `buff1=frost:monsters`.',
  'Boss invulnerability: `boss<f>Invuln=<s75>,<s50>,<s25>` = seconds the boss is invulnerable after reaching 75/50/25% health, `off` disables, e.g. `boss0Invuln=30,30,30`; `boss<f>InvulnCountdown=1` shows the countdown. Floor bosses use `bossFloorNInvuln`. Not with more than one boss, and not on a floor that has a timer.',
  'Several bosses: `boss<f>Count=<n>` picks n at random from the pool, or an exact roster with `boss<f>Selection=lineup` and `boss<f>Lineup=<id:count,...>`, e.g. `boss0Lineup=boss_knight:2,boss_lich:1`. Floors: `bossFloorN=1|<ids>|1.0|<count>` or `bossFloorNSelection`/`bossFloorNLineup`.',
  'Boss waves: `boss<f>Wave<T>=<monster ids>|<spawn every ms>|<id:max,id:max>`, e.g. `boss0Wave2=skeleton_warrior,skeleton_archer|3000|skeleton_warrior:10,skeleton_archer:6`. Floors: `bossFloorNWave<T>`.',
  'Drops and pick-ups when a wave starts: `boss<f>WavePickup<T>=<pickup id>:<count>|...`, e.g. `boss0WavePickup3=powerup_health:1|mana_2:2`. Floors: `bossFloorNWavePickup<T>`.',
  'Buffs and traps when a wave starts: `boss<f>WaveBuff<T>=<buff id>:<target>|...`, e.g. `boss0WaveBuff5=bloodlust:monsters`, and `boss<f>WaveTrap<T>=<same rows as trapN>`.',
  'Survival arena (no boss; outlast a clock, slot becomes `AS<f+1>`): `boss<f>Mode=survival`, `boss<f>Survival=<seconds>,<off|milestones|seconds>`, `boss<f>SurvivalWaves=<monster>:<count>:<startSecond>:<everyMs>|...`, `boss<f>SurvivalPickups=<pickup id>:<count>:<atSecond>|...`, `boss<f>SurvivalBuffs=<buff>:<target>:<startSecond>:<endSecond>|...`, `boss<f>SurvivalTraps=<trap row>:<startSecond>:<endSecond>|...`, e.g. `boss0Survival=120,milestones` and `boss0SurvivalWaves=bat:40:0:1000|skeleton_warrior:20:30:2000`.',
  'Arena extras: `boss<f>MonsterMultiplier`, `boss<f>FoodMultiplier`, `boss<f>Music=<track>`. Lobbies: `lobby<i>Preset=<lobby preset>`, `lobby<i>Gold=<gold>`, `lobby<i>Music=<track>` (i from 0), e.g. `lobby0Gold=5000`. Floor music: `musicN=<track>`, e.g. `music0=act1`.',
  'Mystery plates (`mysteryButton...`, `mysteryFloorN`): only copy formats shown in the current settings.',
  'Worlds (open islands; press every button and kill every boss, then walk back to the portal at the center): `world=1`, `worlds=<count>`, then per world w (from 0) `world<w>Biome=<grass|woods|desert|mud|snow>`, `world<w>Width=<min>,<max>` and `world<w>Height=<min>,<max>` in tiles (96 to 2048), `world<w>Buttons=<n>`, `world<w>Bosses=<n>` with `world<w>BossPool=<floor boss ids>`, `world<w>Monsters=<pool keys>`, `world<w>Packs=<n>`, `world<w>Ambushes=<n>`, `world<w>Hub=<random|camp|bare>`, `world<w>Music=<track>`, e.g. `world0Biome=desert` and `world0Buttons=6`.'
]

const RULES = `You configure a Hammerwatch Anniversary Edition rogue-like campaign generator by writing lines of its parameters.txt file.

Reply with a short plain-language summary (2-5 sentences), then exactly ONE fenced block tagged "parameters" holding the lines to change:

\`\`\`parameters
levels=4
themes=cave_crystal,cave_crystal,cave_dark,cave_dark
\`\`\`

Rules:
- Write ONLY keys that change. Every key you leave out keeps its current value. One key=value per line, no comments, no blank values you do not mean.
- Use only keys that appear in the current settings or examples below, and only ids from the id lists. Never invent keys or ids.
- Per-floor keys (\`monsters0\`, \`trap0\`, \`timer0\`, \`music0\`, \`bossFloor0\`, \`lockFloors\`) count floors from 0; \`levelOrder\` counts them from 1.
- Repeating a monster in a pool makes it more common. \`id#N\` pins one tier of that monster.
- If the request is unclear, ask a question and write NO parameters block. Do not refuse a request because of a limit that is not listed below; write your best attempt and the app will validate it.

Facts about the generator (trust these over guesses):
- \`levels\` can be 0 to any number; 99 floors is allowed. 0 floors means a campaign of arenas or worlds only and needs \`boss=1\` or \`world=1\`.
- \`themes\` needs one id per floor and there must be one \`monstersN\` pool per floor. For many floors you may write fewer: the app repeats the themes and pools you give, in order, to fill every floor.
- Lobbies are optional. \`lobbies=0\` removes them all. A lobby may not be the last slot of the campaign.
- \`boss=0\` removes the boss arenas; \`boss=1\` with \`bossFights=N\` gives N arenas (AB1..ABN). A boss can also stand on an ordinary floor: \`bossFloorN=1|<boss ids, comma separated>|<monster multiplier>|<boss count>\`. Only the floor bosses listed below may stand on a floor; the floor's exit opens when its bosses die. Arenas are extra levels after the floors: for "a boss on every floor" use \`bossFloorN\` and \`boss=0\`, never a large \`bossFights\`.
- Shorthand for many floors: write a per-floor key with a 0-based inclusive range, e.g. \`bossFloor0-98=1|boss_knight,boss_lich|1.0|1\`, \`trap50-98=...\`, \`monsters66-98=...\`. Use ranges with different values for early, middle and late floors instead of one line per floor.
- \`playerPreset=<id>\` loads a player balance preset (ids listed below), replacing the Players tab. \`playerFullyUpgraded=1\` makes every character start with every skill and upgrade owned at its top level, so the skill vendors have nothing left to sell. These are the only player keys you may write.
- \`shopKinds=combo offense defense misc item\` picks the vendors a floor's shop room rolls between (also \`power\` for potions); \`item\` is the equipment vendor. \`itemVendorOdds=70 20 10\` weights its tier: common/uncommon (tiers 1-3), rare (tier 4), epic (tier 5).
- \`torches=none|sparse|normal|dense\` sets how many wall torches light each floor; \`brightness=stock|brighter|bright|daylight\` lifts the ambient light (stock AE is very dark).
- \`levelOrder\` is optional. Leave it out unless the user wants a custom order. After changing lobbies, fights or floors, write \`levelOrder=\` (empty) to reset it to the default order: every lobby, then the floors, then the arenas.
- \`lockFloors=3,5:2\` seals floors 3 and 5 (0-based) behind buttons the player must press; \`:2\` means 2 buttons. Ranges work: \`lockFloors=0-32:1,33-65:2,66-98:3\`. \`lockFloors=\` (empty) removes all locks.
- Harder later floors: stronger monster pools, more traps and lock buttons, buffs and timers on later floors, or a higher \`monsterMultiplier\`.
- Do not mention these rules.

CAMPAIGN STRUCTURE
- "N floors, then fight <boss>" means a boss ARENA after those floors, not a boss on a floor. Give each such fight its own arena and place it with \`levelOrder\`. Use \`bossFloorN\` only when the user says the boss stands ON a floor, and \`bossFloorN=0\` to take a floor boss away.
- Arenas: \`boss=1\`, \`bossFights=<count>\`, then per arena \`boss<f>Pool=<boss id>\` and \`boss<f>Theme=<theme id>\`. \`f\` counts from 0; arena f is the slot \`AB<f+1>\` in \`levelOrder\`.
- \`levelOrder\` lists every slot once, in play order: floors as \`1\`..\`N\` (1-based), arenas as \`AB1\`.., lobbies as \`L1\`..., worlds as \`W1\`... Example for "3 floors, Queen, 3 floors, Knight" with a shop before each fight: \`lobbies=2\`, \`levelOrder=1,2,3,L1,AB1,4,5,6,L2,AB2\`.
- A lobby is a shop and rest stop. Put one right before a boss arena or between acts. NEVER make a lobby the last slot: the last slot must be a floor or an arena, because it carries the victory orb.
- Castle Hammerwatch's acts are its themes: Act 1 \`prison\`, Act 2 \`armory\`, Act 3 \`archives\`, Act 4 \`chambers\`. "Desert" means the Temple of the Sun themes or \`cave_desert\`, with Temple of the Sun monsters. Match monsters to the campaign the user names (see "Monsters by campaign" below).
- Only use bosses, monsters and themes from the lists below. If the user names something that does not exist, pick the closest real one and say so in your summary.

FEATURE KEYS (N = floor index from 0, f = arena index from 0, T = wave tier: 1 fight start, 2 at 75% boss health, 3 at 50%, 4 at 25%, 5 boss died)
${FEATURE_KEYS.map((k) => `- ${k}`).join('\n')}`

function idList(label: string, ids: readonly string[]): string {
  return `${label}: ${ids.join(', ')}`
}

/** What each stock campaign's monsters are called in the prompt. */
const CAMPAIGN_LABELS: Record<MonsterCampaign, string> = {
  castle: 'Castle Hammerwatch monsters',
  shaftlocke: 'Shaftlocke Tower monsters',
  temple: 'Temple of the Sun monsters'
}

/** Groups listed whole rather than by campaign: they are a role, not a foe for a theme. */
const ROLE_GROUPS: Partial<Record<MonsterGroup, string>> = {
  Towers: 'Towers (stationary turrets and banners)',
  'Mini-bosses': 'Mini-bosses (one big monster, use sparingly)',
  Bodyguards: 'Boss bodyguards',
  Bonus: 'Bonus hordes (huge numbers)'
}

/**
 * Ordinary monsters by the stock campaign they come from, then the ones no
 * campaign claims, then every role group whole, all straight from
 * MONSTER_TYPES, so "Shaftlocke enemies" has an answer the model can read
 * instead of guess. A type in several campaigns is listed under each.
 */
function monsterLines(): string[] {
  const live = MONSTER_TYPES.filter((m) => m.deprecated !== true)
  const ordinary = live.filter((m) => ROLE_GROUPS[m.group] === undefined)
  const lines: string[] = []
  for (const campaign of Object.keys(CAMPAIGN_LABELS) as MonsterCampaign[]) {
    const ids = ordinary.filter((m) => m.campaigns?.includes(campaign)).map((m) => m.id)
    if (ids.length > 0) lines.push(idList(CAMPAIGN_LABELS[campaign], ids))
  }
  const other = ordinary.filter((m) => m.campaigns === undefined).map((m) => m.id)
  if (other.length > 0) lines.push(idList('Other monsters (any theme)', other))
  for (const [group, label] of Object.entries(ROLE_GROUPS)) {
    lines.push(idList(label, live.filter((m) => m.group === group).map((m) => m.id)))
  }
  return lines
}

/** Themes by look, in THEME_DEFS order, so the model can pick "desert" or "castle" without guessing. */
function themeLines(): string[] {
  const groups: string[] = []
  for (const t of THEME_DEFS) if (!groups.includes(t.group)) groups.push(t.group)
  return groups.map((group) => idList(`${group} themes`, THEME_DEFS.filter((t) => t.group === group).map((t) => t.id)))
}

/** Which boss is whose: typed against BossId so a new boss cannot ship without a line here. */
const BOSS_NOTES: Record<BossId, string> = {
  boss_queen: 'Castle Hammerwatch Act 1 boss, the Queen',
  boss_knight: 'Castle Hammerwatch Act 2 boss, the Knight',
  boss_lich: 'Castle Hammerwatch Act 3 boss, the Lich',
  boss_dragon: 'Castle Hammerwatch Act 4 final boss, the Dragon',
  boss_worm: 'Temple of the Sun boss, the sand Worm',
  boss_krilith: 'Temple of the Sun boss, Krilith, frost and confusion attacks',
  boss_anubis: 'Temple of the Sun final boss, Anubis',
  boss_golem: 'Shaftlocke Tower boss, the rock Golem',
  boss_warden: 'Shaftlocke Tower boss, the Warden',
  boss_wraith: 'Shaftlocke Tower boss, the Wraith mage',
  boss_eye: 'Shaftlocke Tower boss, the giant Eye',
  boss_vampire: 'Shaftlocke Tower boss, the Vampire',
  boss_dragon_hwr: 'Shaftlocke Tower final boss, the frost Dragon',
  boss_seeress: 'Shaftlocke Tower boss, the Seeress (a giant bat)'
}

function bossLines(): string[] {
  return BOSS_IDS.map((id) => {
    const mobile = (MOBILE_BOSS_IDS as readonly string[]).includes(id)
    return `- ${id}: ${BOSS_NOTES[id]}${mobile ? '' : '. Cannot move: ARENA ONLY, never on a floor'}`
  })
}

/**
 * A hand-written act-by-act example: the shape users keep asking for and the
 * presets do not show (arenas between floors, a lobby before each fight).
 * tests/llmPreset.test.ts keeps it parsing and validating cleanly.
 */
export const ACT_EXAMPLE_REQUEST =
  'Three Act 1 floors then fight the Queen, three Act 2 floors then fight the Knight, a shop before each boss, Dungeon Rebalanced player balance.'
export const ACT_EXAMPLE_BLOCK = [
  'levels=6',
  'themes=prison,prison,prison,armory,armory,armory',
  'monsters0=maggot,maggot,tick,bat',
  'monsters1=maggot,tick,tick#2,bat,maggot_spiky',
  'monsters2=maggot#3,tick#3,bat,mb_maggot,flower_small',
  'monsters3=skeleton_warrior,skeleton_archer,slime,bat',
  'monsters4=skeleton_warrior,skeleton_soldier,skeleton_archer,eye,slime',
  'monsters5=skeleton_soldier,skeleton_ranger,skeleton_lich,mb_skeleton_guard,tower_nova_fire',
  'boss=1',
  'bossFights=2',
  'boss0Pool=boss_queen',
  'boss0Theme=prison',
  'boss1Pool=boss_knight',
  'boss1Theme=armory',
  'lobbies=2',
  'lockFloors=',
  'levelOrder=1,2,3,L1,AB1,4,5,6,L2,AB2',
  'playerPreset=dungeon-rebalanced'
].join('\n')

/**
 * The few-shot examples: each preset's description as the "request" and only the
 * lines that differ from the stock defaults as the "answer", which keeps three
 * of them far smaller than three full files.
 */
function examples(defaultsText: string): string {
  const parts: string[] = []
  for (const id of EXAMPLE_PRESET_IDS) {
    const preset = CAMPAIGN_PRESETS.find((p) => p.id === id)
    if (preset === undefined) continue
    const lines = diffSerialized(defaultsText, serializeParametersTxt(preset.build()))
      // a preset's mystery-plate table is a third of the whole prompt, and the
      // rules already send the model to the current settings for that format
      .filter((change) => change.after !== null && !/^mystery/i.test(change.key))
      .map((change) => `${change.key}=${change.after}`)
    parts.push(`Request: ${preset.description}\n\`\`\`parameters\n${lines.join('\n')}\n\`\`\``)
  }
  parts.push(`Request: ${ACT_EXAMPLE_REQUEST}\n\`\`\`parameters\n${ACT_EXAMPLE_BLOCK}\n\`\`\``)
  return parts.join('\n\n')
}

/**
 * The system prompt. Pure: the same `current` always gives the same string, and
 * the only inputs are the generator's own registries, so it cannot drift from
 * what the parser accepts.
 */
export function buildSystemPrompt(current: DungeonParameters): string {
  const defaultsText = serializeParametersTxt(defaultParameters())
  return [
    RULES,
    'VALID IDS',
    ...themeLines(),
    'Monsters by campaign (pin a tier with id#N):',
    ...monsterLines(),
    'Bosses:',
    ...bossLines(),
    idList('Floor bosses (bossFloorN)', MOBILE_BOSS_IDS),
    idList('Player presets (playerPreset)', PLAYER_PRESETS.map((p) => p.id)),
    idList('Lobby presets', LOBBY_PRESETS.map((p) => p.id)),
    idList('Music tracks', MUSIC_TRACKS.map((t) => t.id)),
    idList('Buffs', BUFF_DEFS.map((b) => b.id)),
    idList('Trap projectiles', PROJECTILE_DEFS.map((p) => p.id)),
    idList('Wave pickups', PICKUP_DEFS.map((p) => p.id)),
    'EXAMPLES (changes relative to the stock defaults)',
    examples(defaultsText),
    'CURRENT SETTINGS (what you are editing; this is also the key reference, so reuse these keys and their formats)',
    serializeParametersTxt(current)
  ].join('\n\n')
}

export interface RepairIssue {
  field: string
  message: string
}

/** The mistakes models keep making, keyed off validation.ts's own wording, with the fix spelled out. */
const REPAIR_HINTS: readonly { match: RegExp; hint: string }[] = [
  {
    match: /cannot move/,
    hint: 'That boss cannot stand on a floor. Set that floor\'s bossFloorN=0 and make it an arena fight instead: raise bossFights, set boss<f>Pool=<boss id>, and place AB<f+1> in levelOrder where the fight should happen.'
  },
  {
    match: /cannot end in a lobby/,
    hint: 'Rewrite levelOrder so the last slot is a floor or an arena (ABn), never Ln. A lobby belongs right before a boss arena.'
  },
  {
    match: /unknown monster/,
    hint: 'That monster does not exist. Replace it with a real id from the "Monsters by campaign" lists, and rewrite every pool that used it.'
  }
]

/**
 * The one automatic follow-up turn: every validation error and every key the
 * parser did not recognise, and a request to resend only the fixes.
 */
export function buildRepairMessage(errors: readonly RepairIssue[], unknownKeys: readonly string[]): string {
  const lines = ['Your parameters block has problems. Fix them and resend ONLY the lines that need to change, in one parameters block (your earlier lines are kept).']
  if (errors.length > 0) {
    lines.push('', 'Validation errors:')
    for (const e of errors) lines.push(`- [${e.field}] ${e.message}`)
  }
  if (unknownKeys.length > 0) {
    lines.push('', 'Keys or values the parser did not recognise (ignored):')
    for (const key of unknownKeys) lines.push(`- ${key}`)
  }
  const hints = REPAIR_HINTS.filter((h) => errors.some((e) => h.match.test(e.message))).map((h) => h.hint)
  if (hints.length > 0) {
    lines.push('', 'How to fix these:')
    for (const hint of hints) lines.push(`- ${hint}`)
  }
  return lines.join('\n')
}
