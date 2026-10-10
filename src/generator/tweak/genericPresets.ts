import { paramKey, removeKey } from './chains'
import { aeMovementAndCombo, costs, ladder } from './presetParts'
import type { PlayerPreset } from './presets'
import type { PlayerTweaks } from './types'

/**
 * Player presets not modelled on another game — the Player tab's "Generic"
 * section. The research behind them is `reference/hammerwatch-class-balance.md`.
 */

/**
 * Dungeon Rebalanced — the original game, tuned for this generator's runs (big
 * floors with backtracking, limited gold, no extra lives) by BUFFING the
 * classes players and the numbers agree are weak or unfun, and nerfing nothing
 * (owner's call, 2026-10-08):
 *
 * - priest, the clearest weak class early ("6 damage … horrific", "HP scaling
 *   is atrocious", the mana shield "screws you before … one upgrade"): more
 *   health and a real health ladder, a usable smite, the mana shield starting
 *   at its first upgrade's strength, better beam healing, a cheaper first
 *   skill and half-price armor (stock 18,000g for 5 armor);
 * - warlock, "a walking sandbag" early and mana-starved, but the strongest
 *   maxed: cheaper lightning and half-price armor make the early game easier,
 *   while the storm is untouched so the ceiling doesn't rise;
 * - thief, fragile early (40 HP, 5-damage knives) but strong late: a little
 *   more health and knife damage at the start only;
 * - sorcerer, second-weakest by the numbers (35 HP, a shield that procs
 *   rather than evades): a little more health and a cheaper comet.
 *
 * Paladin, ranger and wizard — the consensus strong classes ("too easy"; the
 * developer called the wizard OP) — are left alone. Everyone gets AE's faster
 * movement and longer combo window.
 *
 * Every new start stays below its own first upgrade, so no tier becomes a
 * downgrade (the "no new warnings" test holds every preset to that).
 */
function dungeonRebalanced(): PlayerTweaks {
  return {
    ...aeMovementAndCombo(),
    // this generator's campaigns never sell extra lives
    [removeKey('shared', 'life')]: 1,

    [paramKey('priest', 'max-health')]: 40,
    ...ladder('priest', 'max-health', { 'health-1': 55, 'health-2': 70, 'health-3': 80, 'health-4': 90, 'health-5': 100 }),
    [paramKey('priest', 'smite-dmg')]: 9,
    [paramKey('priest', 'shield-dmg-per-mana')]: 0.5,
    ...ladder('priest', 'shield-dmg-per-mana', { mshield1: 0.75, mshield2: 1, mshield3: 1.25, mshield4: 1.5, mshield5: 1.75 }),
    [paramKey('priest', 'beam-heal')]: 4,
    ...ladder('priest', 'beam-heal', { beamdmg1: 5, beamdmg2: 6, beamdmg3: 7, beamdmg4: 8 }),
    ...costs('priest', { area: 1200, 'armor-1': 600, 'armor-2': 1200, 'armor-3': 1800, 'armor-4': 2400, 'armor-5': 3000 }),

    [paramKey('warlock', 'lightning-mana-cost')]: 20,
    ...ladder('warlock', 'lightning-mana-cost', { lightningtrg1: 23, lightningtrg2: 26, lightningtrg3: 29, lightningtrg4: 32 }),
    ...costs('warlock', { 'armor-1': 600, 'armor-2': 1200, 'armor-3': 1800, 'armor-4': 2400, 'armor-5': 3000 }),

    [paramKey('thief', 'max-health')]: 50,
    [paramKey('thief', 'knives-dmg')]: 6,

    [paramKey('sorcerer', 'max-health')]: 40,
    [paramKey('sorcerer', 'comet-mana-cost')]: 20,
    ...ladder('sorcerer', 'comet-mana-cost', { cometdmg2: 25, cometdmg4: 30 })
  }
}

export const GENERIC_PRESETS: readonly PlayerPreset[] = [
  {
    id: 'dungeon-rebalanced',
    label: 'Dungeon Rebalanced',
    group: 'generic',
    description:
      'Buffs the classes that are weak or unfun in the original — the priest most, then the warlock, thief and sorcerer — leaves the paladin, ranger and wizard alone, and adds AE’s faster movement and longer combo window.',
    build: dungeonRebalanced
  }
]
