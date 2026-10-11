import { PLAYER_FIELDS, PLAYER_FIELD_MAP, prunePlayerTweaks, skillKey, statKey } from './fields'
import type { PlayerFieldDef, PlayerTweaks } from './fields'
import { PLAYER_STOCK } from './stock.generated'

/**
 * The Players tab's quick setup: whole-game knobs that write ordinary
 * per-value overrides, so everything they do shows (and stays editable) in
 * the per-skill editor below. Each knob is measured from stock, never from
 * the current value, so setting ×2 twice is still ×2. Pure.
 */

export type StatGroupId = 'cost' | 'damage' | 'health' | 'mana' | 'armor'

export interface StatGroup {
  id: StatGroupId
  label: string
  /** shown as the knob's tooltip */
  description: string
  matches(field: PlayerFieldDef): boolean
}

const isDamage = (name: string): boolean => /(^|-)(dmg|damage)(-|$)/.test(name) && name !== 'dmg-per-mana'

/** Only the all-classes fields: a class's own copy follows them unless edited. */
const unscoped = (f: PlayerFieldDef): boolean => f.kind === 'stat' || f.classId === undefined

export const STAT_GROUPS: readonly StatGroup[] = [
  {
    id: 'cost',
    label: 'Prices',
    description: 'Every price in the shops: skills, upgrades, potions and items.',
    matches: (f) => f.kind === 'cost' && unscoped(f)
  },
  {
    id: 'damage',
    label: 'Damage',
    description: 'Every damage bind: attacks, projectiles, bombs, fields, clouds, damage multipliers.',
    matches: (f) => f.kind === 'bind' && unscoped(f) && (isDamage(f.name) || f.name.endsWith('dmg-multiplier'))
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Base health, the health upgrades, healing and health regen.',
    matches: (f) =>
      unscoped(f) &&
      (f.name === 'base-health' ||
        f.name === 'base-health-regen' ||
        f.name === 'player-max-health-set' ||
        f.name === 'player-health-regen-set' ||
        f.name === 'heal' ||
        f.name === 'beam-heal')
  },
  {
    id: 'mana',
    label: 'Mana',
    description: 'Base mana, mana regen and the mana upgrades.',
    matches: (f) =>
      unscoped(f) &&
      (f.name === 'base-mana' ||
        f.name === 'base-mana-regen' ||
        f.name === 'player-max-mana-set' ||
        f.name === 'player-mana-regen-set' ||
        f.name === 'mana-amount')
  },
  {
    id: 'armor',
    label: 'Armor',
    description: 'Every armor value, from the start and from the armor upgrades.',
    matches: (f) => unscoped(f) && f.name === 'player-armor-set'
  }
]

export function statGroup(id: StatGroupId): StatGroup {
  return STAT_GROUPS.find((g) => g.id === id)!
}

export function fieldsOfGroup(id: StatGroupId): PlayerFieldDef[] {
  const group = statGroup(id)
  return PLAYER_FIELDS.filter((f) => group.matches(f))
}

/** stock × factor, rounded the way the field is stored. */
export function scaled(field: PlayerFieldDef, factor: number): number {
  const v = field.stock * factor
  return field.type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000
}

function setField(out: PlayerTweaks, field: PlayerFieldDef, value: number): void {
  if (value === field.stock) delete out[field.key]
  else out[field.key] = value
}

/** Every field of the group at stock × `factor`; other overrides are kept. */
export function applyGroupFactor(id: StatGroupId, factor: number, tweaks: PlayerTweaks): PlayerTweaks {
  const out = { ...tweaks }
  if (!Number.isFinite(factor) || factor < 0) return out
  for (const f of fieldsOfGroup(id)) setField(out, f, scaled(f, factor))
  return out
}

/**
 * The factor the group is at, read back from the overrides: 1 when untouched,
 * the common factor when every non-zero field is stock × it, else null (the
 * values were edited by hand).
 */
export function deriveGroupFactor(id: StatGroupId, tweaks: PlayerTweaks): number | null {
  const fields = fieldsOfGroup(id).filter((f) => f.stock !== 0)
  let factor: number | undefined
  for (const f of fields) {
    const v = tweaks[f.key]
    if (v === undefined) continue
    factor = v / f.stock
    break
  }
  if (factor === undefined) return 1
  const f0 = Math.round(factor * 1000) / 1000
  for (const f of fields) {
    const v = tweaks[f.key] ?? f.stock
    if (v !== scaled(f, f0)) return null
  }
  return f0
}

/**
 * Every class starts with every skill it can own, each at the top of its own
 * upgrade ladder, its base health and mana at its best health and mana
 * upgrade, and every purchase costs nothing. A skill that is normally bought
 * is owned from the start (AE's `starting-level`).
 */
export function applyFullyUpgraded(tweaks: PlayerTweaks): PlayerTweaks {
  const out = { ...tweaks }
  for (const f of PLAYER_FIELDS) if (f.kind === 'unlock') setField(out, f, 1)
  for (const file of PLAYER_STOCK.skills) {
    // the best value each bind reaches anywhere in the file
    const top = new Map<string, number>()
    for (const chain of file.chains) {
      for (const tier of chain.tiers) {
        for (const [name, b] of Object.entries(tier.binds)) top.set(name, b.stock)
      }
    }
    for (const chain of file.chains) {
      chain.tiers.forEach((tier, i) => {
        if (tier.cost !== undefined) {
          const f = PLAYER_FIELD_MAP.get(skillKey(chain.key, i + 1, 'cost'))
          if (f !== undefined) setField(out, f, 0)
        }
        for (const name of Object.keys(tier.binds)) {
          const f = PLAYER_FIELD_MAP.get(skillKey(chain.key, i + 1, name))
          const best = top.get(name)
          if (f !== undefined && best !== undefined) setField(out, f, best)
        }
      })
    }
  }
  // a class's own body starts at its best health and mana upgrade
  for (const c of PLAYER_STOCK.classes) {
    for (const s of c.skills) {
      const file = PLAYER_STOCK.skills.find((f) => f.path === s.path)
      const last = file?.chains[0]?.tiers.at(-1)
      if (last === undefined) continue
      const bodyStat: Array<[string, string]> = [
        ['player-max-health-set', 'base-health'],
        ['player-max-mana-set', 'base-mana'],
        ['player-mana-regen-set', 'base-mana-regen'],
        ['player-health-regen-set', 'base-health-regen']
      ]
      for (const [bind, stat] of bodyStat) {
        const b = last.binds[bind]
        const f = PLAYER_FIELD_MAP.get(statKey(c.id, stat))
        if (b !== undefined && f !== undefined && b.stock > f.stock) setField(out, f, b.stock)
      }
    }
  }
  return prunePlayerTweaks(out)
}

/** Every price at 0, nothing else touched. */
export function applyEverythingFree(tweaks: PlayerTweaks): PlayerTweaks {
  return applyGroupFactor('cost', 0, tweaks)
}

/** Gold to buy every skill and upgrade once, across every class (potions and items are bought again and again). */
export function totalShopCost(tweaks: PlayerTweaks): number {
  let sum = 0
  for (const f of PLAYER_FIELDS) {
    if (f.kind === 'cost' && f.classId === undefined && f.shopId === undefined) sum += tweaks[f.key] ?? f.stock
  }
  return sum
}
