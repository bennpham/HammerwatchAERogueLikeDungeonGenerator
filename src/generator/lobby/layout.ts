import { UPGRADE_KINDS } from './payout'
import type { UpgradeKind } from './payout'

/**
 * The generated stand-in lobby's fixed layout, in tiles — shared by the
 * builder (lobby/build.ts) and the Lobby tab's diagram, so the picture always
 * matches what is generated.
 */
export const STANDIN_MAP = { width: 34, height: 22 }
export const STANDIN_ROOM = { x: 3, y: 6, width: 27, height: 12 }

/** Diamonds start here and fill rows of six, three rows deep (they stack past that). */
export const STANDIN_GOLD_ORIGIN = { x: STANDIN_ROOM.x + 2, y: STANDIN_ROOM.y + STANDIN_ROOM.height - 4 }
/** Upgrades: four per row, two tiles apart. */
export const STANDIN_UPGRADE_ORIGIN = { x: STANDIN_ROOM.x + STANDIN_ROOM.width - 10, y: STANDIN_ROOM.y + STANDIN_ROOM.height - 4 }

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

/** The stand-in's diamond slots (one per distinct spot) and upgrade slots, for the diagram. */
export function standinDiagramSlots(): {
  diamondSlots: Array<readonly [number, number]>
  upgradeSlots: Record<UpgradeKind, readonly [number, number]>
} {
  const diamondSlots = Array.from({ length: DIAMONDS_PER_ROW * DIAMOND_ROWS }, (_, i) => diamondSlot(STANDIN_GOLD_ORIGIN, i))
  const upgradeSlots = {} as Record<UpgradeKind, readonly [number, number]>
  for (const k of UPGRADE_KINDS) upgradeSlots[k] = upgradeSlot(STANDIN_UPGRADE_ORIGIN, k)
  return { diamondSlots, upgradeSlots }
}
