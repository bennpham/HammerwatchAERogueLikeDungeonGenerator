import { TWEAK_CLASS_IDS } from './baseline'
import { applyTweaks } from './overrides'
import type { PlayerTweaks, TweakUnitFile, TweakValueType } from './types'

/** One row of the loadout sheet. */
export interface LoadoutStat {
  name: string
  type: TweakValueType
  /** value at character creation */
  start: number
  /** value after buying every upgrade that writes it */
  maxed: number
  /** true when the start value differs from the stock game */
  changed: boolean
}

export interface ClassLoadout {
  id: string
  label: string
  stats: LoadoutStat[]
  /** gold to buy every upgrade in the tree */
  totalCost: number
  /** the same total in the stock game */
  stockTotalCost: number
}

/** How many `req` hops separate an upgrade from the root of its chain. */
function chainDepth(file: TweakUnitFile, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0 // defensive: stock data has no cycles
  seen.add(id)
  const upgrade = file.upgrades.find((u) => u.id === id)
  if (upgrade?.req === undefined) return 0
  return 1 + chainDepth(file, upgrade.req, seen)
}

/**
 * Fully-upgraded stats: buy every upgrade in dependency order and let later
 * purchases overwrite earlier ones, which is exactly how the game applies them
 * (an upgrade *sets* a param rather than adding to it).
 *
 * Exported because the "fully upgraded roster" bulk preset needs the same walk —
 * it writes these values back as starting stats.
 */
/**
 * Every upgrade in the order a player could buy them: prerequisites first, ties
 * broken by file order. Later purchases overwrite earlier ones, which is how the
 * game applies them.
 */
export function upgradesInBuyOrder(file: TweakUnitFile): TweakUnitFile['upgrades'] {
  return file.upgrades
    .map((upgrade, index) => ({ upgrade, index, depth: chainDepth(file, upgrade.id) }))
    .sort((a, b) => (a.depth === b.depth ? a.index - b.index : a.depth - b.depth))
    .map((entry) => entry.upgrade)
}

/**
 * The string values a fully-upgraded character ends up with.
 *
 * Separate from {@link maxedParams} because strings are not stats — but they still
 * have to advance, since `combo-nova-projectile` and `aura-buff` start empty and
 * a skill pointed at an empty projectile path crashes the game.
 */
export function maxedStrings(file: TweakUnitFile): Map<string, string> {
  const values = new Map<string, string>()
  for (const upgrade of upgradesInBuyOrder(file)) {
    for (const child of upgrade.children) {
      if (child.type === 'string') values.set(child.name, String(child.value))
    }
  }
  return values
}

export function maxedParams(file: TweakUnitFile): Map<string, number> {
  const values = new Map<string, number>()
  for (const param of file.params) {
    if (param.type === 'int' || param.type === 'float') {
      values.set(param.name, Number(param.value))
    }
  }

  const ordered = upgradesInBuyOrder(file).map((upgrade) => ({ upgrade }))

  for (const { upgrade } of ordered) {
    for (const child of upgrade.children) {
      if (child.name === 'lvl') continue
      if (child.type === 'int' || child.type === 'float') {
        values.set(child.name, Number(child.value))
      }
    }
  }

  return values
}

function unitFiles(files: ReturnType<typeof applyTweaks>): Map<string, TweakUnitFile> {
  const map = new Map<string, TweakUnitFile>()
  for (const file of files) {
    if (file.kind === 'unit') map.set(file.id, file)
  }
  return map
}

/**
 * Character sheets for the seven classes with `tweaks` applied, including a
 * stock comparison so the UI can flag what the user changed.
 */
export function buildLoadouts(tweaks: PlayerTweaks): ClassLoadout[] {
  const tweaked = unitFiles(applyTweaks(tweaks))
  const stock = unitFiles(applyTweaks({}))

  const loadouts: ClassLoadout[] = []

  for (const id of TWEAK_CLASS_IDS) {
    const file = tweaked.get(id)
    const stockFile = stock.get(id)
    if (file === undefined || stockFile === undefined) continue

    const maxed = maxedParams(file)
    const stockStart = new Map(
      stockFile.params
        .filter((p) => p.type === 'int' || p.type === 'float')
        .map((p) => [p.name, Number(p.value)] as const)
    )

    const stats: LoadoutStat[] = file.params
      .filter((param) => param.type === 'int' || param.type === 'float')
      .map((param) => {
        const start = Number(param.value)
        return {
          name: param.name,
          type: param.type,
          start,
          maxed: maxed.get(param.name) ?? start,
          changed: stockStart.get(param.name) !== start
        }
      })

    loadouts.push({
      id,
      label: file.label,
      stats,
      totalCost: file.upgrades.reduce((sum, u) => sum + u.cost, 0),
      stockTotalCost: stockFile.upgrades.reduce((sum, u) => sum + u.cost, 0)
    })
  }

  return loadouts
}
