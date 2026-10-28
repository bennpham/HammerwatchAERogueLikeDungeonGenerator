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
  // any unit by path (a world's trees, cliffs, tents): see `Doodad.prop`
  | 'Prop'

interface Resolved {
  path: string
  /** tile offsets added to the placement */
  dx: number
  dy: number
  state?: Record<string, StateValue>
}

const exists = (p: string) => AE_UNIT_SET.has(p)

/**
 * Stair art narrower than the shared 64-px `doodads/walls/exit_*.inc`, by wall
 * set: each closes two cells, and `dx` is the anchor offset (tiles, from the
 * doorway's first cell) that puts its collision over the doorway's middle two
 * cells. [VERIFIED from the unit files] cave_desert/cave_crystal collide
 * `0 0 32 -24` from the anchor; battlement's exit_up is centred, `-16 -16 32 16`.
 */
const NARROW_STAIRS: Readonly<Record<string, Partial<Record<'ExitUp' | 'ExitDn', number>>>> = {
  cave_desert: { ExitUp: 1, ExitDn: 1 },
  cave_crystal: { ExitUp: 1, ExitDn: 1 },
  battlement: { ExitUp: 2 }
}

/**
 * The px box a stair unit's art covers, from its anchor, so the wall-top
 * cover (`map/aeCover.ts`, drawn over it at layer 10) can leave it clear.
 * [VERIFIED from the unit files] the shared `exit_up.inc`/`exit_dn.inc` draw
 * 64×72 at origin `0 72`; cave_desert/cave_crystal 32×48 at `0 32`;
 * battlement's own `exit_up` 38×40 at `18 39`.
 */
const STAIR_ART: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = {
  cave_desert: { x: 0, y: -32, w: 32, h: 48 },
  cave_crystal: { x: 0, y: -32, w: 32, h: 48 },
  battlement: { x: -18, y: -39, w: 38, h: 40 }
}
const SHARED_STAIR_ART = { x: 0, y: -72, w: 64, h: 72 }

/** The level-px box a placed stair's art covers, or null for anything else (pads included). */
export function stairArtRect(d: { path: string; x: number; y: number }): { x: number; y: number; w: number; h: number } | null {
  const m = /^doodads\/walls\/([^/]+)\/exit_(?:up|dn)\.unit$/.exec(d.path)
  if (m === null) return null
  const a = STAIR_ART[m[1]] ?? SHARED_STAIR_ART
  return { x: d.x * 16 + a.x, y: d.y * 16 + a.y, w: a.w, h: a.h }
}

function stairSet(type: 'ExitUp' | 'ExitDn', themeId: string): string {
  const theme = getTheme(themeId)
  return (type === 'ExitUp' ? theme?.exitUpSet : theme?.exitDnSet) ?? 'prison'
}

/**
 * Whether the theme's way in and out is a floor pad inside the room (the bonus
 * sets, as stock bonus levels have) rather than stairs set in the wall.
 */
export function exitIsPad(themeId: string): boolean {
  return getTheme(themeId)?.exitPads === true
}

/**
 * The wall-line cells a stair's art closes, from the stair set's first cell:
 * all four for the shared 64-px art, the middle two for a narrow set, none for
 * a floor pad. The wall placer lays ordinary pieces on the rest, so no gap is
 * left beside the stairs.
 */
export function exitDoorway(type: 'ExitUp' | 'ExitDn', themeId: string): { from: number; cells: number } {
  if (exitIsPad(themeId)) return { from: 0, cells: 0 }
  return NARROW_STAIRS[stairSet(type, themeId)]?.[type] === undefined ? { from: 0, cells: 4 } : { from: 1, cells: 2 }
}

/**
 * Where a floor pad is centred, in tiles from the stair set's first doorway
 * cell: two cells in from the left, two rows below the wall line (the first
 * floor row's bottom edge), clear of the wall.
 */
export const EXIT_PAD_CENTRE = { dx: 2, dy: 2 } as const

/** The AE unit (and anchor offset) a doodad kind resolves to on `theme`. */
export function resolveDoodad(type: DoodadTypeName, themeId: string): Resolved {
  const theme = getTheme(themeId)
  const walls = theme?.walls ?? 'prison'
  switch (type) {
    // the bonus pads are 24-px floor art, anchored top-left; the exit's
    // sprite sits 4 px below its anchor, and it starts `inactive` unless told
    case 'ExitUp':
    case 'ExitDn': {
      if (exitIsPad(themeId)) {
        return type === 'ExitUp'
          ? { path: 'doodads/special/bonus_entrance.unit', dx: EXIT_PAD_CENTRE.dx - 0.75, dy: EXIT_PAD_CENTRE.dy - 0.75 }
          : {
              path: 'doodads/special/bonus_exit.unit',
              dx: EXIT_PAD_CENTRE.dx - 0.75,
              dy: EXIT_PAD_CENTRE.dy - 1,
              state: { start: { kind: 'string', value: 'active' } }
            }
      }
      const set = stairSet(type, themeId)
      const file = type === 'ExitUp' ? 'exit_up' : 'exit_dn'
      return { path: `doodads/walls/${set}/${file}.unit`, dx: NARROW_STAIRS[set]?.[type] ?? 0, dy: 0 }
    }
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
    // a prop names its own unit; nothing resolves one by kind
    case 'Prop':
      return { path: '', dx: 0, dy: 0 }
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
  /**
   * The tile the doodad was placed on, before its art's anchor offset: the
   * cell a seal piece closes. `x`/`y` are where the unit is drawn from, which
   * for a vertical piece is a row away (`v_16` anchors one row up, or down on
   * the flat sets), so reading the seal from `y` checks the wrong row.
   */
  readonly cell: readonly [number, number]

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: DoodadTypeName,
    public theme: string,
    fixed?: Resolved
  ) {
    this.id = ctx.idCounter++
    this.cell = [Math.trunc(x), Math.trunc(y)]
    const r = fixed ?? resolveDoodad(type, theme)
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

  /** Any unit by its path, drawn from (x, y) with no anchor offset: a world's trees, tents and portals. */
  static prop(ctx: GenerationContext, x: number, y: number, path: string, state?: Record<string, StateValue>): Doodad {
    const d = new Doodad(ctx, x, y, 'Prop', '', { path, dx: 0, dy: 0, state })
    ctx.doodads.push(d)
    return d
  }
}
