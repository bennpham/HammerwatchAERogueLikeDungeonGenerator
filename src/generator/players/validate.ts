import { PLAYER_FIELD_MAP, skillKey } from './fields'
import type { PlayerTweaks } from './fields'
import { PLAYER_STOCK } from './stock.generated'

/**
 * The Players tab's checks. Issues use the override's key as `field`, so the
 * form shows each one next to its input. Pure.
 */

export interface PlayerIssue {
  field: string
  message: string
}

/** The highest price the tab accepts; past this nobody could afford it anyway. */
export const PLAYER_COST_MAX = 999_999

export function validatePlayerTweaks(tweaks: PlayerTweaks): { errors: PlayerIssue[]; warnings: PlayerIssue[] } {
  const errors: PlayerIssue[] = []
  const warnings: PlayerIssue[] = []
  const unknown: string[] = []

  for (const [raw, value] of Object.entries(tweaks)) {
    const key = raw.toLowerCase()
    const field = PLAYER_FIELD_MAP.get(key)
    if (field === undefined) {
      unknown.push(raw)
      continue
    }
    if (!Number.isFinite(value)) {
      errors.push({ field: key, message: 'Must be a number.' })
      continue
    }
    if (field.type === 'int' && !Number.isInteger(value)) {
      errors.push({ field: key, message: 'Must be a whole number.' })
      continue
    }
    if (field.kind === 'unlock' && value !== 0 && value !== 1) {
      errors.push({ field: key, message: 'Must be 0 (bought in a shop) or 1 (owned from the start).' })
      continue
    }
    if (field.kind === 'cost' && (value < 0 || value > PLAYER_COST_MAX)) {
      errors.push({ field: key, message: `A price must be from 0 to ${PLAYER_COST_MAX}.` })
      continue
    }
    if (field.kind === 'stat' && (field.name === 'base-health' || field.name === 'base-mana') && value < 1) {
      errors.push({ field: key, message: 'Must be at least 1.' })
      continue
    }
    if (field.kind !== 'cost' && value < 0 && field.stock >= 0) {
      errors.push({ field: key, message: 'Cannot be negative.' })
      continue
    }
    // the cast clock runs at this rate; 0 would leave the skill casting forever
    if (field.kind === 'param' && field.name === 'cast-speed-mul' && value <= 0) {
      errors.push({ field: key, message: 'Must be above 0, or the skill never finishes casting.' })
      continue
    }
    if (field.windowStart !== undefined && value < field.windowStart) {
      errors.push({ field: key, message: `The window starts at ${field.windowStart} ms; it cannot end before that.` })
    }
  }

  if (unknown.length > 0) {
    unknown.sort()
    warnings.push({
      field: unknown[0],
      message:
        `${unknown.length === 1 ? 'One player setting is' : `${unknown.length} player settings are`} not an ` +
        `Anniversary Edition value (${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ', …' : ''}) and ` +
        'will be ignored. Settings from the original Hammerwatch tweak files do not carry over.'
    })
  }

  warnings.push(...downgrades(tweaks))
  return { errors, warnings }
}

/**
 * A tier that sets a bind to something worse than the tier before it: buying
 * it would make the character weaker. "Worse" follows the stock ladder's own
 * direction, so a cooldown that shrinks per tier is checked the right way.
 * One warning per chain and bind, at the first tier that goes backwards.
 */
function downgrades(raw: PlayerTweaks): PlayerIssue[] {
  const tweaks: PlayerTweaks = {}
  for (const [k, v] of Object.entries(raw)) tweaks[k.toLowerCase()] = v
  const out: PlayerIssue[] = []
  for (const file of PLAYER_STOCK.skills) {
    for (const chain of file.chains) {
      const names = new Set(chain.tiers.flatMap((t) => Object.keys(t.binds)))
      for (const name of names) {
        const ladder = chain.tiers
          .map((t, i) => ({ tier: i + 1, b: t.binds[name] }))
          .filter((x) => x.b !== undefined)
        if (ladder.length < 2) continue
        const rising = ladder[ladder.length - 1].b.stock >= ladder[0].b.stock
        let prev: number | undefined
        for (const { tier, b } of ladder) {
          const key = skillKey(chain.key, tier, name)
          const value = tweaks[key] ?? b.stock
          if (prev !== undefined && (rising ? value < prev : value > prev) && tweaks[key] !== undefined) {
            out.push({
              field: key,
              message: `Tier ${tier} sets ${name} to ${value}, worse than the tier before it (${prev}); buying it would weaken the character.`
            })
            break
          }
          prev = value
        }
      }
    }
  }
  return out
}

/** How many purchases each shop column holds, from the stock skill files. */
export function playerCategoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of PLAYER_STOCK.skills) {
    for (const chain of file.chains) {
      for (const tier of chain.tiers) {
        if (tier.category !== undefined && tier.cost !== undefined) counts[tier.category] = (counts[tier.category] ?? 0) + 1
      }
    }
  }
  return counts
}
