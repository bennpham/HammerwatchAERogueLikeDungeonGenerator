import { XMLBool, XMLDictionary, XMLFloat, XMLInt, XMLObject, XMLString } from '../xml'
import { getTheme } from '../config/themes'
import type { GenerationContext } from '../core/context'

interface DoodadTypeDef {
  /** path template; %s slots are substituted with the theme letter */
  path: string
  xOffset: number
  yOffset: number
  /** how many times the theme letter is substituted into the path */
  themeSubs: 0 | 1 | 2
}

/** Wall pieces, torches, vendors, exits… (ported from Doodad.java's DoodadType enum). */
export const DoodadType = {
  VendorMisc: { path: 'doodads/special/vendor_misc.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  VendorCombo: { path: 'doodads/special/vendor_combo.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  VendorOffense: { path: 'doodads/special/vendor_offense.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  VendorDefense: { path: 'doodads/special/vendor_defense.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  Spawn: { path: 'doodads/generic/marker_spawn.xml', xOffset: 1, yOffset: 1, themeSubs: 0 },
  ExitMarker: { path: 'doodads/generic/marker_exit.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  // The animated portal to the boss prep room, as used by the authored
  // test_boss_prep_room.xml and the shipped campaign's level_11. Ships its own
  // open/closed states (defaulting to open) and two collision posts the player
  // walks between — unlike ExitMarker above, which is a flat editor decal on
  // layer -5 and is only ever laid *under* real art. [VERIFIED] 2026-08-11
  BossPortal: { path: 'doodads/generic/exit_teleport_boss.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  // The blue teleport into a lobby — visually distinct from BossPortal's red
  // so a party can tell "shop" from "boss fight" before stepping through.
  // Already used by the lobby template's own authored exit and by the
  // dungeon-prep preset's teleport doodad, so it is stock and known to
  // render. [VERIFIED] — see ASSET-REGISTRY.md.
  LobbyPortal: { path: 'doodads/generic/exit_teleport.xml', xOffset: 0, yOffset: 0, themeSubs: 0 },
  CornerLD: { path: 'doodads/theme_%s/%s_crn_l_dn.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  CornerLU: { path: 'doodads/theme_%s/%s_crn_l_up.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  CornerRD: { path: 'doodads/theme_%s/%s_crn_r_dn.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  CornerRU: { path: 'doodads/theme_%s/%s_crn_r_up.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  ExitDn: { path: 'doodads/theme_%s/%s_exit_h_dn.xml', xOffset: 0, yOffset: 0, themeSubs: 2 },
  ExitUp: { path: 'doodads/theme_%s/%s_exit_h_up.xml', xOffset: 0, yOffset: 0, themeSubs: 2 },
  Horizontal: { path: 'doodads/theme_%s/%s_h_8.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  Vertical: { path: 'doodads/theme_%s/%s_v_8.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  Cover: { path: 'doodads/special/color_theme_%s_16.xml', xOffset: 0.5, yOffset: 0.5, themeSubs: 1 },
  // A floor plate the party steps on. Purely decorative by itself — it carries
  // no trigger of its own, so the rig that uses it lays a RectangleShape over
  // the art and hangs an AreaTrigger off that. Mind the two anchors: this
  // position is where the art's top-left corner lands, while a RectangleShape's
  // is its centre, so a 1x1 box covering the plate goes half a tile further on
  // (see map/buttonSeal.ts). [EMITTED] — the path is taken from a hand-edited
  // level6 that loaded. Not placed by anything at the moment: the seal moved to
  // BossDoorButton below, and this plate is kept for a later puzzle feature.
  TriggerButton: { path: 'doodads/special/trigger_button_floor.xml', xOffset: 0.5, yOffset: 0.5, themeSubs: 0 },
  // The plate the button seal (map/buttonSeal.ts) hides on the floor. Same
  // anchoring as TriggerButton above; driven to `activate` rather than
  // `pressed`. [VERIFIED 2026-09-26] in game — first taken from a hand-edited
  // level6 that swapped it in for trigger_button_floor.
  BossDoorButton: { path: 'doodads/special/boss_door_button.xml', xOffset: 0.5, yOffset: 0.5, themeSubs: 0 },
  Torch: { path: 'doodads/generic/lamp_torch.xml', xOffset: 0.5, yOffset: 1, themeSubs: 0 },
  TorchOff: { path: 'doodads/generic/lamp_torch_off.xml', xOffset: 0.5, yOffset: 1, themeSubs: 0 },
  CrossWall: { path: 'doodads/theme_%s/%s_x_x.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  VCapDown: { path: 'doodads/theme_%s/%s_v_cap_dn.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  VCapUp: { path: 'doodads/theme_%s/%s_v_cap_up.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  HCapLeft: { path: 'doodads/theme_%s/%s_h_cap_l.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  HCapRight: { path: 'doodads/theme_%s/%s_h_cap_r.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  TDown: { path: 'doodads/theme_%s/%s_x_t_dn.xml', xOffset: 0, yOffset: 2, themeSubs: 2 },
  TUp: { path: 'doodads/theme_%s/%s_x_t_up.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  TLeft: { path: 'doodads/theme_%s/%s_x_t_l.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  TRight: { path: 'doodads/theme_%s/%s_x_t_r.xml', xOffset: 0, yOffset: 1, themeSubs: 2 },
  // free-standing arena cover, not a wall-band piece — the pattern matcher
  // never places it. Default resolves correctly for the classic lettered
  // themes (doodadToken === the theme id); theme h and the bonus themes
  // override it in themes.ts because their filenames don't fit this template.
  Pillar: { path: 'doodads/theme_%s/%s_special_pillar.xml', xOffset: 0, yOffset: 0, themeSubs: 2 }
} as const satisfies Record<string, DoodadTypeDef>

export type DoodadTypeName = keyof typeof DoodadType

export function doodadPath(type: DoodadTypeName, theme: string): string {
  const themeDef = getTheme(theme)

  // a theme that does not ship this piece can point at a complete replacement
  // path, which is used verbatim — no %s substitution
  const override = themeDef?.doodadOverrides?.[type]?.path
  if (override !== undefined) return override

  const token = themeDef?.doodadToken ?? theme
  const def = DoodadType[type]
  switch (def.themeSubs) {
    case 1:
      return def.path.replace('%s', token)
    case 2:
      return def.path.replace('%s', token).replace('%s', token)
    default:
      return def.path
  }
}

/**
 * Where this piece sits relative to its tile.
 *
 * The defaults in `DoodadType` compensate for the anchor of the classic themes'
 * art (`yOffset` = the asset's `<origin>` y / 16). A theme whose art is anchored
 * differently overrides them — and must, since the offset moves the doodad's
 * collision polygon, not just its sprite.
 */
export function doodadOffset(type: DoodadTypeName, theme: string): { x: number; y: number } {
  const def = DoodadType[type]
  const override = getTheme(theme)?.doodadOverrides?.[type]
  return {
    x: override?.xOffset ?? def.xOffset,
    y: override?.yOffset ?? def.yOffset
  }
}

export class Doodad extends XMLObject {
  id: number
  /**
   * Whether this doodad must be network-synced. Stock doodads never need it
   * (`false`), but a doodad that a `DestroyObject` node can later remove —
   * the boss arena's alcove seals are the only current case — must be
   * syncable so its destruction replicates ([VERIFIED] see boss-tab.md).
   *
   * A mutable field with a default, not a constructor parameter: `create` is
   * called positionally from ~15 sites, and inserting a param there would
   * silently mis-bind one of the existing arguments at every call site. A
   * caller that needs `true` sets `seal.needSync = true` after construction.
   */
  needSync = false

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: DoodadTypeName,
    public theme: string
  ) {
    super()
    this.id = ctx.idCounter++
  }

  static create(ctx: GenerationContext, x: number, y: number, type: DoodadTypeName, theme: string): Doodad {
    const d = new Doodad(ctx, x, y, type, theme)
    ctx.doodads.push(d)
    return d
  }

  getXML(): string {
    const offset = doodadOffset(this.type, this.theme)
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', doodadPath(this.type, this.theme)))
    dict.addData(new XMLFloat('x', this.x + offset.x))
    dict.addData(new XMLFloat('y', this.y + offset.y))
    dict.addData(new XMLBool('need-sync', this.needSync))
    return dict.getXML()
  }
}
