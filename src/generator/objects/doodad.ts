import { getTheme } from '../config/themes'
import { resolvePiece } from '../map/aeWalls'
import { AE_UNIT_SET } from '../catalog/assets'
import type { GenerationContext } from '../core/context'
import type { StateValue } from '../ae/model'

/**
 * A placed AE doodad unit: stairs, portals, torches, shops, buttons, seal
 * walls. Regular room walls are NOT doodads — `map/aeWalls.ts` computes them
 * from the finished tile grid when the level is emitted.
 *
 * `x`/`y` are in generator tiles (16 px), already including the kind's anchor
 * offset; the emitter multiplies by 16.
 */
export type DoodadTypeName =
  // stairs and gateways
  | 'ExitUp'
  | 'ExitDn'
  | 'ExitMarker'
  | 'BossPortal'
  | 'LobbyPortal'
  // shop stands
  | 'VendorOffense'
  | 'VendorDefense'
  | 'VendorCombo'
  | 'VendorMisc'
  | 'VendorPower'
  | 'VendorItem'
  // lights
  | 'Torch'
  | 'TorchOff'
  // floor buttons
  | 'TriggerButton'
  | 'BossDoorButton'
  // free-standing wall pieces (seals, arena cover); HW1-era names, AE pieces
  | 'Horizontal'
  | 'Vertical'
  | 'Pillar'
  | 'Cover'

interface Resolved {
  path: string
  /** tile offsets added to the placement */
  dx: number
  dy: number
  state?: Record<string, StateValue>
}

const exists = (p: string) => AE_UNIT_SET.has(p)

/** The AE unit (and anchor offset) a doodad kind resolves to on `theme`. */
export function resolveDoodad(type: DoodadTypeName, themeId: string): Resolved {
  const theme = getTheme(themeId)
  const walls = theme?.walls ?? 'prison'
  switch (type) {
    case 'ExitUp':
      return { path: `doodads/walls/${theme?.exitUpSet ?? 'prison'}/exit_up.unit`, dx: 0, dy: 0 }
    case 'ExitDn':
      return { path: `doodads/walls/${theme?.exitDnSet ?? 'prison'}/exit_dn.unit`, dx: 0, dy: 0 }
    case 'ExitMarker':
      return { path: 'doodads/generic/marker_exit.unit', dx: 0, dy: 0 }
    // portal art: the red square pad for a boss fight, the house's own square
    // pad (teleport_mt, the user's call over the big round one, 2026-10-10)
    // for a lobby or a locked floor's way on. Both open by default.
    case 'BossPortal':
      return { path: 'doodads/generic/teleport_red.unit', dx: 0, dy: 0 }
    case 'LobbyPortal':
      return { path: 'doodads/generic/teleport_mt.unit', dx: 0, dy: 0 }
    // shop stands, offset like hw2ae placed them on Castle's shop spots (dy 4 px)
    case 'VendorOffense':
      return { path: 'doodads/generic/shop_offense.unit', dx: 0, dy: 0.25 }
    case 'VendorDefense':
      return { path: 'doodads/generic/shop_defense.unit', dx: 0, dy: 0.25 }
    case 'VendorCombo':
      return { path: 'doodads/generic/shop_combo.unit', dx: 0, dy: 0.25 }
    case 'VendorMisc':
      return { path: 'doodads/generic/shop_health.unit', dx: 0, dy: 0.25 }
    case 'VendorPower':
      return { path: 'doodads/generic/shop_potion.unit', dx: 0, dy: 0.25 }
    case 'VendorItem':
      return { path: 'doodads/generic/shop_item.unit', dx: 0, dy: 0.25 }
    case 'Torch':
      return { path: 'doodads/generic/lamps/torch.unit', dx: 0.5, dy: 1 }
    case 'TorchOff':
      return { path: 'doodads/generic/lamps/torch.unit', dx: 0.5, dy: 1, state: { start: { kind: 'string', value: 'n-off' } } }
    // a floor plate, driven to `on` (disguised lock buttons, mystery buttons)
    case 'TriggerButton':
      return { path: 'doodads/generic/button_round.unit', dx: 0.5, dy: 0.5 }
    // the boss-door plate, driven to `activate` (lock buttons); its art is
    // anchored top-left (origin 0 0), where button_round is centred (8 8)
    case 'BossDoorButton':
      return { path: 'doodads/doors/boss_door_button.unit', dx: 0, dy: 0 }
    case 'Horizontal': {
      const r = resolvePiece(walls, 'h_16', exists)
      return { path: r?.path ?? `doodads/walls/${walls}/h_16.unit`, dx: 0, dy: r?.dy ?? 0 }
    }
    case 'Vertical': {
      const r = resolvePiece(walls, 'v_16', exists)
      return { path: r?.path ?? `doodads/walls/${walls}/v_16.unit`, dx: 0, dy: r?.dy ?? -1 }
    }
    case 'Pillar': {
      const r = resolvePiece(walls, 'single', exists)
      return { path: r?.path ?? `doodads/walls/${walls}/x_x.unit`, dx: 0, dy: r?.dy ?? 0 }
    }
    case 'Cover':
      return { path: `doodads/walls/${walls}/__color_16.unit`, dx: 0, dy: 1 }
  }
}

export class Doodad {
  id: number
  path: string
  state?: Record<string, StateValue>
  /**
   * A barrier the party cannot cross while it stands — a seal wall piece on
   * corridor floor. Read by the seal check; walls from the grid are not doodads.
   */
  blocking = false

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: DoodadTypeName,
    public theme: string
  ) {
    this.id = ctx.idCounter++
    const r = resolveDoodad(type, theme)
    this.path = r.path
    this.x = x + r.dx
    this.y = y + r.dy
    if (r.state !== undefined) this.state = r.state
  }

  static create(ctx: GenerationContext, x: number, y: number, type: DoodadTypeName, theme: string): Doodad {
    const d = new Doodad(ctx, x, y, type, theme)
    ctx.doodads.push(d)
    return d
  }
}
