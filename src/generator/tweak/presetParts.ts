import { costKey, effectKey, paramKey } from './chains'
import type { PlayerTweaks } from './types'

/**
 * Building blocks shared by more than one player preset. A module of its own
 * so the preset files can share them without `presets.ts` (which imports every
 * preset file) becoming part of an import cycle.
 */

/** `{ upgradeId: value }` for one stat across a ladder, as effect keys. */
export function ladder(fileId: string, stat: string, tiers: Record<string, number>): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [upgradeId, value] of Object.entries(tiers)) out[effectKey(fileId, upgradeId, stat)] = value
  return out
}

/** `{ upgradeId: gold }` as cost keys. */
export function costs(fileId: string, tiers: Record<string, number>): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [upgradeId, gold] of Object.entries(tiers)) out[costKey(fileId, upgradeId)] = gold
  return out
}

/**
 * Anniversary Edition's movement and combo window, in original-game keys
 * (AE `shared_speed(_melee).sval`, `shared_combo.sval`). The original has ONE
 * shared `move-speed`, while AE gives ranged classes 1.0 (shop 1.1/1.2/1.3) and
 * melee classes 1.2 (1.3/1.4/1.5); 1.1 with a 1.2/1.3/1.4 shop splits the
 * difference (owner's call, 2026-10-08). AE's combo window is 0.25 s longer
 * at every tier. Used by the AE preset and by Dungeon Rebalanced, whose owner
 * found the faster movement cuts the long backtracking walks.
 */
export function aeMovementAndCombo(): PlayerTweaks {
  return {
    [paramKey('shared', 'move-speed')]: 1.1,
    ...ladder('shared', 'move-speed', { 'speed-1': 1.2, 'speed-2': 1.3, 'speed-3': 1.4 }),
    [paramKey('shared', 'combo-timer')]: 1.0,
    ...ladder('shared', 'combo-timer', {
      'combo-time-1': 1.25,
      'combo-time-2': 1.5,
      'combo-time-3': 1.75,
      'combo-time-4': 2.0,
      'combo-time-5': 2.25
    })
  }
}
