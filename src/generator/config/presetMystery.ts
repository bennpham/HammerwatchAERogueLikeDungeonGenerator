import { mysteryStarterPool } from './parameters'
import type { BossTrap, FloorMystery, MysteryButton } from './parameters'

/**
 * Mystery-button data for the campaign presets (issue #67 follow-up).
 *
 * A preset's pool is `mysteryStarterPool()` — untouched, so the editor's
 * "Add starter set" keeps meaning what it always meant — with the preset's own
 * custom buttons appended. Floors pick from it by button NAME, not by index,
 * so a preset reads as a weighted pick list and a typo throws (and fails the
 * preset tests) instead of silently pointing at the wrong button.
 *
 * Same rules as every preset helper: pure, no random draws, and a fresh object
 * on every call.
 *
 * The weights follow one rule — risk and reward ramp with depth. Shallow
 * floors hand out coins and small squads, deep ones chests, diamonds and
 * tier-II upgrades against liches, tombs and death orbs; the nastiest outcomes
 * (kamikazes, dragon's breath, Anubis' wrath) only appear near the end, at a
 * low weight. Weights are written on a scale where one floor totals about 50.
 */

/** A weighted pick list: `[button name, weight]`, read in written order. */
export type MysteryPicks = ReadonlyArray<readonly [string, number]>

export interface MysteryKit {
  /** the preset's whole pool: the starter set, then its custom buttons */
  buttons: MysteryButton[]
  /** `count` plates drawing from `picks`, each name repeated `weight` times */
  pick(count: number, ...picks: MysteryPicks[]): FloorMystery
}

/** Builds a preset's pool and the name → index resolver over it. */
export function mysteryKit(custom: readonly MysteryButton[] = []): MysteryKit {
  const buttons = [...mysteryStarterPool(), ...custom]
  const index = new Map<string, number>()
  buttons.forEach((button, i) => {
    const name = button.name ?? ''
    if (name === '' || index.has(name)) throw new Error(`mystery pool: button ${i} needs a unique name, got "${name}"`)
    index.set(name, i)
  })
  return {
    buttons,
    pick(count, ...picks) {
      const pool: number[] = []
      for (const rows of picks) {
        for (const [name, weight] of rows) {
          const i = index.get(name)
          if (i === undefined) throw new Error(`mystery pool: no button named "${name}"`)
          for (let n = 0; n < weight; n++) pool.push(i)
        }
      }
      return { count, pool }
    }
  }
}

/** A custom pool entry. Absent `trapSeconds` means the traps never switch off. */
export function mysteryButton(
  name: string,
  text: string,
  contents: {
    loot?: Array<[string, number]>
    monsters?: Array<[string, number]>
    traps?: BossTrap[]
    trapSeconds?: number
  }
): MysteryButton {
  const button: MysteryButton = {
    name,
    text,
    loot: (contents.loot ?? []).map(([item, count]) => ({ item, count })),
    monsters: (contents.monsters ?? []).map(([monster, count]) => ({ monster, count })),
    traps: (contents.traps ?? []).map((row) => ({ ...row }))
  }
  if (contents.trapSeconds !== undefined) button.trapSeconds = contents.trapSeconds
  return button
}

// --- loot tiers ---------------------------------------------------------------
// The dud plus the reward side of a floor, about 28 of its ~50. A preset adds
// its own monster and trap rows on top.

/** Early floors: mostly coins and a snack, the odd tier-I upgrade. */
export function shallowLoot(): MysteryPicks {
  return [
    ['Nothing', 7],
    ['Pocket change', 5],
    ['Loose change', 4],
    ['Silver stash', 2],
    ['Small diamond', 1],
    ['A chest', 2],
    ['Refreshments', 3],
    ['Rejuvenation', 1],
    ['Health upgrade', 1],
    ['Defense upgrade', 1]
  ]
}

/** Middle floors: silver and gold, a second chest, every potion and tier-I upgrade. */
export function midLoot(): MysteryPicks {
  return [
    ['Nothing', 6],
    ['Loose change', 2],
    ['Silver stash', 3],
    ['Gold stash', 3],
    ['Small diamond', 2],
    ['Small red diamond', 1],
    ['A chest', 2],
    ['Two chests', 1],
    ['Refreshments', 2],
    ['Rejuvenation', 1],
    ['Invincibility', 1],
    ['Fury', 1],
    ['Damage upgrade', 1],
    ['Defense upgrade', 1],
    ['Health upgrade', 1],
    ['Mana upgrade', 1]
  ]
}

/**
 * Deep floors: gold, diamonds and chests, plus the tier-II upgrades a preset
 * names — at most a couple, so a late floor can still roll a dud.
 */
export function deepLoot(tierTwo: readonly string[] = []): MysteryPicks {
  return [
    ['Nothing', 6],
    ['Silver stash', 1],
    ['Gold stash', 3],
    ['Small red diamond', 2],
    ['Blue diamond', 1],
    ['Two chests', 2],
    ['Three chests', 1],
    ['Refreshments', 2],
    ['Rejuvenation', 1],
    ['Invincibility', 1],
    ['Fury', 1],
    ['Damage upgrade', 1],
    ['Defense upgrade', 1],
    ['Health upgrade', 1],
    ['Mana upgrade', 1],
    ...tierTwo.map((name) => [name, 1] as const)
  ]
}

/**
 * The single plate on a classic escape floor, played against a 90-second
 * clock: mostly something that helps the run for the exit, with one squad and
 * a rare kamikaze pack as the price of stopping to press it.
 */
export function escapePicks(squad: string): MysteryPicks {
  return [
    ['Nothing', 4],
    ['Invincibility', 2],
    ['Fury', 2],
    ['Rejuvenation', 2],
    ['Blue diamond', 2],
    ['Three chests', 1],
    [squad, 2],
    ['Kamikazes', 1]
  ]
}
