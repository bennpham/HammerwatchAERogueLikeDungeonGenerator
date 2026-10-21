/**
 * The rooms a lobby slot can be built from.
 *
 * Every lobby is an AE editor level imported with `scripts/import-ae-lobby.mjs`
 * (or `scripts/import-stock-towns.ts`) into `templates.generated.ts`; the
 * generator finds its exit, spawn, vendors and payout spot by script label or
 * by structure and rewrites them (docs/LOBBY-AUTHORING.md). The user's own
 * `house` lobby is the default.
 */
import { LOBBY_TEMPLATES } from './templates.generated'
import { payoutDiagramSlots } from './layout'
import type { UpgradeKind } from './payout'

export interface LobbyPresetDef {
  /** stable id stored in `LobbyOptions.preset` */
  id: string
  label: string
  description: string
  /** the imported AE level text */
  lvl: string
  /** the template's teleporter turns red when a fight follows the lobby, as a floor's portal does */
  redBeforeFight?: boolean
  /** where diamonds and upgrades lie, for the Lobby tab diagram */
  diamondSlots: ReadonlyArray<readonly [number, number]>
  upgradeSlots: Readonly<Record<UpgradeKind, readonly [number, number]>>
}

// an imported lobby drops its payout at its own `lobby:payout` marker in the
// payout pattern, so the pattern's slots describe it
export const LOBBY_PRESETS: readonly LobbyPresetDef[] = LOBBY_TEMPLATES.map((t) => ({
  id: t.id,
  label: t.label,
  description: t.description,
  lvl: t.lvl,
  redBeforeFight: t.redBeforeFight === true,
  ...payoutDiagramSlots()
}))

/** The user's hand-made AE lobby. */
export const HOUSE_LOBBY_ID = 'house'
export const DEFAULT_LOBBY_PRESET_ID = HOUSE_LOBBY_ID

/**
 * Lobby ids that are gone: the HW1 remake's two placeholder rooms and the
 * generated stand-in room. Older presets and files still name them; each
 * becomes the default lobby.
 */
export const RETIRED_LOBBY_IDS: readonly string[] = ['BETA-dungeon-prep', 'BETA-boss-prep', 'standin']

export function lobbyPresetById(id: string): LobbyPresetDef | undefined {
  return LOBBY_PRESETS.find((p) => p.id === id)
}
