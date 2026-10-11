import { skillKey, statKey } from './fields'
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
    const body = new Map<string, { maxed: number; changed: boolean }>()
    const skills: LoadoutStat[] = []
    for (const file of files) {
      const rows = new Map<string, LoadoutStat>()
      for (const chain of file.chains) {
        chain.tiers.forEach((tier, i) => {
          if (tier.cost !== undefined) {
            totalCost += value(chain.key, i + 1, 'cost', tier.cost.stock)
            stockTotalCost += tier.cost.stock
          }
          for (const [name, b] of Object.entries(tier.binds)) {
            const v = value(chain.key, i + 1, name, b.stock)
            const changed = isChanged(chain.key, i + 1, name)
            if (BODY_BINDS.has(name)) {
              const prev = body.get(name)
              body.set(name, { maxed: v, changed: (prev?.changed ?? false) || changed })
              continue
            }
            const row = rows.get(name)
            if (row === undefined) {
              // owned from the start only when the root skill costs nothing
              const owned = chain.key === file.stem && i === 0 && tier.cost === undefined
              rows.set(name, { name: `${skillFileLabel(file)} · ${name}`, ...(owned ? { start: v } : {}), maxed: v, changed })
            } else {
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
      const start = tweaks[statKey(c.id, stat)] ?? s?.stock ?? 0
      const up = body.get(bind)
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
