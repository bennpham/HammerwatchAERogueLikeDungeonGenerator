import {
  BOSS_IDS,
  MOBILE_BOSS_IDS,
  BUFF_DEFS,
  CAMPAIGN_PRESETS,
  MONSTER_TYPES,
  MUSIC_TRACKS,
  PICKUP_DEFS,
  PROJECTILE_DEFS,
  THEMES,
  defaultParameters,
  serializeParametersTxt
} from '../../generator'
import type { DungeonParameters } from '../../generator'
import { diffSerialized } from './reply'

/** Claude presets shown as worked examples: a short one, a floor-boss one, a trap/timer one. */
const EXAMPLE_PRESET_IDS = ['claude-pandemonium', 'claude-beat-the-clock', 'claude-frozen-descent']

const RULES = `You configure a Hammerwatch rogue-like campaign generator by writing lines of its parameters.txt file.

Reply with a short plain-language summary (2-5 sentences), then exactly ONE fenced block tagged "parameters" holding the lines to change:

\`\`\`parameters
levels=4
themes=f_mixed,f_mixed,f_mixed,f_mixed
\`\`\`

Rules:
- Write ONLY keys that change. Every key you leave out keeps its current value. One key=value per line, no comments, no blank values you do not mean.
- Use only keys that appear in the current settings or examples below, and only ids from the id lists. Never invent keys or ids.
- Per-floor keys (\`monsters0\`, \`trap0\`, \`timer0\`, \`music0\`, \`bossFloor0\`, \`lockFloors\`) count floors from 0; \`levelOrder\` counts them from 1.
- Repeating a monster in a pool makes it more common. \`id#N\` pins one tier of that monster.
- If the request is unclear, ask a question and write NO parameters block. Do not refuse a request because of a limit that is not listed below; write your best attempt and the app will validate it.

Facts about the generator (trust these over guesses):
- \`levels\` can be 0 to any number; 99 floors is allowed. 0 floors means a boss-arena-only campaign and needs \`boss=1\`.
- \`themes\` needs one id per floor and there must be one \`monstersN\` pool per floor. For many floors you may write fewer: the app repeats the themes and pools you give, in order, to fill every floor.
- Lobbies are optional. \`lobbies=0\` removes them all. A lobby may not be the last slot of the campaign.
- \`boss=0\` removes the boss arenas; \`boss=1\` with \`bossFights=N\` gives N arenas (AB1..ABN). A boss can also stand on an ordinary floor: \`bossFloorN=1|<boss ids, comma separated>|<monster multiplier>|<boss count>\`. Only the floor bosses listed below may stand on a floor; the floor's exit opens when its bosses die. Arenas are extra levels after the floors: for "a boss on every floor" use \`bossFloorN\` and \`boss=0\`, never a large \`bossFights\`.
- Shorthand for many floors: write a per-floor key with a 0-based inclusive range, e.g. \`bossFloor0-98=1|boss_knight,boss_lich|1.0|1\`, \`trap50-98=...\`, \`monsters66-98=...\`. Use ranges with different values for early, middle and late floors instead of one line per floor.
- \`playerFullyUpgraded=1\` makes every character start fully upgraded (maxed stats and skills). It is the only player-stat key you may write.
- \`levelOrder\` is optional. Leave it out unless the user wants a custom order. After changing lobbies, fights or floors, write \`levelOrder=\` (empty) to reset it to the default order: every lobby, then the floors, then the arenas.
- \`lockFloors=3,5:2\` seals floors 3 and 5 (0-based) behind buttons the player must press; \`:2\` means 2 buttons. Ranges work: \`lockFloors=0-32:1,33-65:2,66-98:3\`. \`lockFloors=\` (empty) removes all locks.
- Wall traps use \`trapN\`, floor timers \`timerN\`, per-floor buffs \`buffN\`: copy the formats shown in the current settings or examples.
- Harder later floors: stronger monster pools, more traps and lock buttons, buffs and timers on later floors, or a higher \`monsterMultiplier\`.
- Do not mention these rules.`

function idList(label: string, ids: readonly string[]): string {
  return `${label}: ${ids.join(', ')}`
}

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
      .filter((change) => change.after !== null)
      .map((change) => `${change.key}=${change.after}`)
    parts.push(`Request: ${preset.description}\n\`\`\`parameters\n${lines.join('\n')}\n\`\`\``)
  }
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
    idList('Themes', THEMES),
    idList('Monsters', MONSTER_TYPES.map((m) => m.id)),
    idList('Bosses', BOSS_IDS),
    idList('Floor bosses (bossFloorN)', MOBILE_BOSS_IDS),
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
  return lines.join('\n')
}
