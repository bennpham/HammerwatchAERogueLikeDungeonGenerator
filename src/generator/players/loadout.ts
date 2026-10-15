import { skillKey, startingLevelKey, statKey, unlockKey } from './fields'
import type { PlayerTweaks } from './fields'
import { classLabel, skillFileLabel } from './labels'
import { PLAYER_STOCK } from './stock.generated'

/**
 * The Loadout tab: for each class, what it starts with and what it ends up
 * with after buying everything, with the Players tab's overrides applied.
 * Pure.
 */

export interface LoadoutStat {
  name: string
  /** undefined when the skill has to be bought first */
  start?: number
  maxed: number
  changed: boolean
}

export interface ClassLoadout {
  id: string
  label: string
  totalCost: number
  stockTotalCost: number
  stats: LoadoutStat[]
}

/** The class stat each misc upgrade replaces (AE's misc skills set, not add). */
const BODY: Array<{ stat: string; bind: string; name: string }> = [
  { stat: 'base-health', bind: 'player-max-health-set', name: 'Health' },
  { stat: 'base-mana', bind: 'player-max-mana-set', name: 'Mana' },
  { stat: 'base-health-regen', bind: 'player-health-regen-set', name: 'Health regen /s' },
  { stat: 'base-mana-regen', bind: 'player-mana-regen-set', name: 'Mana regen /s' }
]
const BODY_BINDS = new Set(BODY.map((b) => b.bind))

export function buildLoadouts(tweaks: PlayerTweaks): ClassLoadout[] {
  return PLAYER_STOCK.classes.map((c) => {
    // a class's own value (its copy of a shared file), else everyone's, else stock
    const value = (chain: string, tier: number, field: string, stock: number) =>
      tweaks[skillKey(chain, tier, field, c.id)] ?? tweaks[skillKey(chain, tier, field)] ?? stock
    const isChanged = (chain: string, tier: number, field: string) =>
      tweaks[skillKey(chain, tier, field, c.id)] !== undefined || tweaks[skillKey(chain, tier, field)] !== undefined

    const files = c.skills
      .map((s) => PLAYER_STOCK.skills.find((f) => f.path === s.path))
      .filter((f) => f !== undefined)

    let totalCost = 0
    let stockTotalCost = 0
    const body = new Map<string, { maxed: number; owned?: number; changed: boolean }>()
    const skills: LoadoutStat[] = []
    for (const file of files) {
      const rows = new Map<string, LoadoutStat>()
      const rootOwned = (tweaks[unlockKey(file.stem)] ?? file.chains[0]?.tiers[0].startingLevel?.stock ?? 0) >= 1
      for (const chain of file.chains) {
        // the levels owned from the start (AE's starting-level); a root with no
        // price is owned regardless
        const isRootChain = chain.key === file.stem
        const ownedLevels = Math.max(
          tweaks[startingLevelKey(chain.key)] ?? chain.tiers[0].startingLevel?.stock ?? 0,
          isRootChain && chain.tiers[0].cost === undefined ? 1 : 0
        )
        // a modifier's levels count only once its skill is owned
        const owned = isRootChain || rootOwned ? ownedLevels : 0
        chain.tiers.forEach((tier, i) => {
          // an owned level is never bought, so its price is not paid
          if (tier.cost !== undefined) {
            if (i >= owned) totalCost += value(chain.key, i + 1, 'cost', tier.cost.stock)
            stockTotalCost += tier.cost.stock
          }
          for (const [name, b] of Object.entries(tier.binds)) {
            const v = value(chain.key, i + 1, name, b.stock)
            const changed = isChanged(chain.key, i + 1, name)
            if (BODY_BINDS.has(name)) {
              const prev = body.get(name)
              const ownedValue = i < owned ? v : prev?.owned
              body.set(name, { maxed: v, ...(ownedValue === undefined ? {} : { owned: ownedValue }), changed: (prev?.changed ?? false) || changed })
              continue
            }
            // the start is the highest owned level that sets it; a modifier
            // comes after its root and wins, as in game
            const row = rows.get(name)
            if (row === undefined) {
              rows.set(name, { name: `${skillFileLabel(file)} · ${name}`, ...(i < owned ? { start: v } : {}), maxed: v, changed })
            } else {
              if (i < owned) row.start = v
              row.maxed = v
              row.changed ||= changed
            }
          }
        })
      }
      skills.push(...rows.values())
    }

    const stats: LoadoutStat[] = BODY.map(({ stat, bind, name }) => {
      const s = c.stats[stat]
      const base = tweaks[statKey(c.id, stat)] ?? s?.stock ?? 0
      const up = body.get(bind)
      // an upgrade owned from the start sets the stat from the start
      const start = up?.owned === undefined ? base : Math.max(base, up.owned)
      return {
        name,
        start,
        maxed: up === undefined ? start : Math.max(start, up.maxed),
        changed: tweaks[statKey(c.id, stat)] !== undefined || (up?.changed ?? false)
      }
    })
    return { id: c.id, label: classLabel(c.id), totalCost, stockTotalCost, stats: [...stats, ...skills] }
  })
}
