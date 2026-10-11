/**
 * The rooms a lobby slot can be built from.
 *
 * `standin` is generated (a themed room with the selected vendor stands, the
 * starting gold and free upgrades on the floor, and a press-F exit).
 *
 * Hand-made lobbies are AE editor levels imported with
 * `scripts/import-ae-lobby.mjs` into `templates.generated.ts`; the generator
 * finds their exit, spawn, vendors and payout spot by script label or by
 * structure and rewrites them (docs/LOBBY-AUTHORING.md). The user's own
 * `hall` lobby is the default.
 */
import { LOBBY_TEMPLATES } from './templates.generated'
import { standinDiagramSlots } from './layout'
import type { UpgradeKind } from './payout'

export interface LobbyPresetDef {
  /** stable id stored in `LobbyOptions.preset` */
  id: string
  label: string
  description: string
  /** the imported AE level text, or undefined for the generated stand-in */
  lvl?: string
  /** where diamonds and upgrades lie, for the Lobby tab diagram */
  diamondSlots: ReadonlyArray<readonly [number, number]>
  upgradeSlots: Readonly<Record<UpgradeKind, readonly [number, number]>>
}

export const STANDIN_LOBBY_ID = 'standin'

export const LOBBY_PRESETS: readonly LobbyPresetDef[] = [
  {
    id: STANDIN_LOBBY_ID,
    label: 'Generated room',
    description: 'A generated shop room: the vendors you pick, your starting gold and upgrades, and a press-F exit.',
    ...standinDiagramSlots()
  },
  // an imported lobby drops its payout at its own `lobby:payout` marker in the
  // same pattern, so the stand-in's slots describe it too
  ...LOBBY_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description, lvl: t.lvl, ...standinDiagramSlots() }))
]

/** The user's hand-made AE lobby, when it has been imported; else the generated room. */
export const HALL_LOBBY_ID = 'hall'
export const DEFAULT_LOBBY_PRESET_ID = LOBBY_TEMPLATES.some((t) => t.id === HALL_LOBBY_ID) ? HALL_LOBBY_ID : STANDIN_LOBBY_ID

export function lobbyPresetById(id: string): LobbyPresetDef | undefined {
  return LOBBY_PRESETS.find((p) => p.id === id)
}
