import { UPGRADE_KINDS } from './payout'
import type { UpgradeKind } from './payout'

/**
 * The payout pattern, in tiles: how diamonds and upgrades are laid out from a
 * lobby's `lobby:payout` marker (lobby/build.ts), and what the Lobby tab's
 * diagram draws.
 */

/** Diamonds start here and fill rows of six, three rows deep (they stack past that). */
const DIAGRAM_GOLD_ORIGIN = { x: 5, y: 14 }
/** Upgrades: four per row, two tiles apart. */
const DIAGRAM_UPGRADE_ORIGIN = { x: 20, y: 14 }

export const DIAMONDS_PER_ROW = 6
export const DIAMOND_ROWS = 3

/** Where diamond `i` lies, relative to `origin`. */
export function diamondSlot(origin: { x: number; y: number }, i: number): [number, number] {
  return [origin.x + (i % DIAMONDS_PER_ROW), origin.y + (Math.trunc(i / DIAMONDS_PER_ROW) % DIAMOND_ROWS)]
}

/** Where upgrade kind `kind` lies, relative to `origin`. */
export function upgradeSlot(origin: { x: number; y: number }, kind: UpgradeKind): [number, number] {
  const i = UPGRADE_KINDS.indexOf(kind)
  return [origin.x + (i % 4) * 2, origin.y + Math.trunc(i / 4) * 2]
}

/** The pattern's diamond slots (one per distinct spot) and upgrade slots, for the diagram. */
export function payoutDiagramSlots(): {
  diamondSlots: Array<readonly [number, number]>
  upgradeSlots: Record<UpgradeKind, readonly [number, number]>
} {
  const diamondSlots = Array.from({ length: DIAMONDS_PER_ROW * DIAMOND_ROWS }, (_, i) => diamondSlot(DIAGRAM_GOLD_ORIGIN, i))
  const upgradeSlots = {} as Record<UpgradeKind, readonly [number, number]>
  for (const k of UPGRADE_KINDS) upgradeSlots[k] = upgradeSlot(DIAGRAM_UPGRADE_ORIGIN, k)
  return { diamondSlots, upgradeSlots }
}
