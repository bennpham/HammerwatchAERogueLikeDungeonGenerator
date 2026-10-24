import { Doodad, EXIT_PAD_CENTRE, exitDoorway, exitIsPad } from './doodad'
import type { DoodadTypeName } from './doodad'
import { Item } from './item'
import { equipmentTier } from './equipment'
import { DEFAULT_SHOP_KIND_IDS } from './vendorRoll'
import type { ShopKindId } from './vendorRoll'
import { ScriptNode } from './scriptNode'
import {
  ICON_EXIT,
  ICON_SHOP,
  NodeAllPlayersArea,
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeGameEnd,
  NodeLevelExit,
  NodeLevelStart,
  NodeSetRespawnPoint,
  NodeShopArea,
  NodeUnitPickedUpTrigger,
  NodeUseTrigger,
  SHOP_ITEMS,
  SHOP_POWER,
  SHOP_SKILLS,
  SensorShape
} from './nodes'
import type { GenerationContext } from '../core/context'
import { bossArenaId, lobbyId } from '../campaign'

export type SetTypeName = 'ExitUp' | 'ExitDn' | 'Shop' | 'Orb' | 'BossPortal' | 'LobbyPortal'

/**
 * A floor's way on when it has no stairs down: the orb, or the portal a
 * gateway room carries (red into a boss or the next floor, blue into a
 * lobby). The reachability and seal checks walk to it, so every kind must be
 * here: a floor before a lobby once went unchecked because `LobbyPortal` was
 * missing, and shipped a walk-around of its boss seal (dungeon_1428135045).
 */
export function isGatewaySet(type: SetTypeName): boolean {
  return type === 'Orb' || type === 'BossPortal' || type === 'LobbyPortal'
}

/** `.meta.info.gatherparty` — "You must gather your party before venturing forth." [VERIFIED] */
export const GATHER_PARTY_TEXT = '.meta.info.gatherparty'

/**
 * The shop stands a room can get, and what each sells. AE shop categories run
 * `off1..5`, `def1..5`, `misc1..5`, `combo1..5` (skills, Type 0) and `power`
 * (Type 1). [VERIFIED] against stock ShopAreas. The Warlock's gargoyle is
 * `def2` (players/warlock/skills/warlock_gargoyle.sval), so any defense stand
 * sells it to a warlock.
 */
export interface ShopKind {
  id: ShopKindId
  vendor: DoodadTypeName
  categories: string
  type: number
}

export const SHOP_KINDS: readonly ShopKind[] = [
  { id: 'combo', vendor: 'VendorCombo', categories: 'combo1 combo2 combo3 combo4 combo5', type: SHOP_SKILLS },
  { id: 'offense', vendor: 'VendorOffense', categories: 'off1 off2 off3 off4 off5', type: SHOP_SKILLS },
  { id: 'defense', vendor: 'VendorDefense', categories: 'def1 def2 def3 def4 def5', type: SHOP_SKILLS },
  { id: 'misc', vendor: 'VendorMisc', categories: 'misc1 misc2 misc3 misc4 misc5', type: SHOP_SKILLS },
  { id: 'power', vendor: 'VendorPower', categories: 'power', type: SHOP_POWER },
  // the equipment shop (Type 2). equipment_3 is only the fallback: a dungeon
  // shop room rolls its own tier (map/room.ts) and a lobby stall sells the
  // tiers its options tick
  { id: 'item', vendor: 'VendorItem', categories: 'equipment_3', type: SHOP_ITEMS }
]

/**
 * The tier badge an item stand wears: `shop_item.unit`'s scenes `1`…`5` add
 * a numeral over the vendor, as the stock `prefabs/shop_item_t<n>.pfb` set
 * with `start="<n>"`. A stall selling several tiers shows the highest; one
 * selling none of them (never emitted) keeps the plain `none` scene.
 */
export function itemStandBadge(categories: string): string | undefined {
  const top = Math.max(0, ...categories.split(' ').map(equipmentTier))
  return top > 0 ? String(top) : undefined
}

/**
 * The press-F way out of a level, exactly as Castle Hammerwatch AE wires every
 * exit [VERIFIED level_1/level_2]:
 *
 *   UseTrigger(Icon=Exit, Areas=[sensor])
 *     → AllPlayersArea(Area=[sensor], OnlyAlivePlayers=f)
 *         OnTrue  → SetRespawnPoint(target), LevelExit(target level, StartID=target)
 *         OnFalse → AnnounceText(".meta.info.gatherparty")
 *
 * The party must ALL stand in the sensor and one of them press F; there is no
 * walk-in auto transport. `target` is the next slot's stem (`floor3`), which is
 * also the StartID of that level's arrival `LevelStart`.
 */
export function buildExitRig(
  ctx: GenerationContext,
  sensor: SensorShape,
  target: string,
  x: number,
  y: number
): ScriptNode[] {
  const use = new NodeUseTrigger(ctx, x, y, ICON_EXIT)
  use.label = 'Exit'
  use.connectToShape(sensor)
  const all = new NodeAllPlayersArea(ctx, x + 1, y)
  all.area.push(sensor)
  use.connectTo(all)
  const respawn = new NodeSetRespawnPoint(ctx, x + 2, y, target)
  const exit = new NodeLevelExit(ctx, x + 2, y + 1, ctx.levelPath(target), target)
  all.onTrue.push(respawn, exit)
  const gather = new NodeAnnounceText(ctx, x + 1, y + 1)
  gather.setText(GATHER_PARTY_TEXT)
  // the regular line, as Castle writes it (no Style)
  gather.textType = 2
  all.onFalse.push(gather)
  return [use, all, respawn, exit, gather]
}

/**
 * Where the party arrives in this level: a LevelStart answering to the
 * level's own stem (the StartID the previous level's exit asks for), plus the
 * default spawn when this is the campaign's first level.
 */
export function addArrival(ctx: GenerationContext, x: number, y: number): NodeLevelStart[] {
  const starts = [new NodeLevelStart(ctx, x, y, ctx.currentStem)]
  if (ctx.isStartLevel) starts.push(new NodeLevelStart(ctx, x, y))
  return starts
}

/**
 * A prefab group of doodads, items and script nodes — stairs, the shop, the
 * victory orb, the portals (ported from ObjectSet.java, rebuilt for AE).
 */
export class ObjectSet {
  doodads: Doodad[] = []
  scriptNodes: ScriptNode[] = []
  items: Item[] = []
  sensors: SensorShape[] = []
  width = 0
  height = 0
  /**
   * Wall-line cells this set's own art occupies — an exit's doorway. The wall
   * placer gives them no piece (the exit art is the wall there) and they stay
   * walkable, which is where the party stands to press F.
   */
  reserved: Array<[number, number]> = []

  static create(
    ctx: GenerationContext,
    x: number,
    y: number,
    type: SetTypeName,
    theme: string,
    exitTarget?: string,
    shop?: ShopKind
  ): ObjectSet {
    const s = new ObjectSet(ctx, x, y, type, theme, exitTarget, shop)
    ctx.objectSets.push(s)
    return s
  }

  static delete(ctx: GenerationContext, s: ObjectSet): void {
    s.delete(ctx)
    ctx.objectSets = ctx.objectSets.filter((o) => o !== s)
  }

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: SetTypeName,
    theme: string,
    exitTarget?: string,
    shop?: ShopKind
  ) {
    switch (type) {
      case 'ExitUp':
      case 'ExitDn': {
        // The set spans x..x+5 with y = room.y - 2. The exit art stands in the
        // room's top wall row (y + 1): the shared 64-px art over cells
        // x+1..x+4, a narrow set's 32-px art over the middle two (exitDoorway).
        // Those cells become the walkable doorway, the art's own collision
        // closes the row above, and the wall placer fills the rest of the row.
        // [VERIFIED] geometry from Castle level_2's exit_up at -432,-112.
        // A pad theme (bonus) has no doorway: its pad lies on the floor below
        // an unbroken wall, and the party arrives and leaves on the pad.
        const ax = x + 1
        const ay = y + 1
        const pad = exitIsPad(theme)
        this.doodads.push(Doodad.create(ctx, ax, ay, type, theme))
        const door = exitDoorway(type, theme)
        for (let dx = door.from; dx < door.from + door.cells; dx++) this.reserved.push([ax + dx, ay])

        if (type === 'ExitUp') {
          // where the party arrives from the previous level, and the default
          // spawn when this is the campaign's first level (index.ts adds it)
          this.scriptNodes.push(...addArrival(ctx, ax + 2, pad ? ay + EXIT_PAD_CENTRE.dy : ay + 1))
          // one-shot floor banner as the party steps out of the stairs
          const banner = new SensorShape(ctx, ax + 2, ay + 2)
          banner.width = 6
          banner.height = 3
          this.sensors.push(banner)
          const trig = new NodeAreaTrigger(ctx, ax + 2, ay + 4)
          trig.connectToShape(banner)
          trig.triggerTimes = 1
          const text = new NodeAnnounceText(ctx, ax + 3, ay + 4)
          text.setText(ctx.currentBanner)
          trig.connectTo(text)
          this.scriptNodes.push(trig, text)
        } else {
          // the doorway's middle two cells, as Castle's 32×16 exit sensor; on
          // a pad theme, the pad
          const sensor = pad ? new SensorShape(ctx, ax + EXIT_PAD_CENTRE.dx, ay + EXIT_PAD_CENTRE.dy) : new SensorShape(ctx, ax + 2, ay + 0.5)
          sensor.width = 2
          sensor.height = pad ? 2 : 1
          this.sensors.push(sensor)
          const target = exitTarget ?? (ctx.gateway?.kind === 'exit' ? ctx.gateway.target : undefined)
          if (target !== undefined) this.scriptNodes.push(...buildExitRig(ctx, sensor, target, ax, ay + 2))
        }

        this.width = 6
        this.height = 5
        break
      }

      case 'Shop': {
        const kind = shop ?? SHOP_KINDS[0]
        const stand = Doodad.create(ctx, x, y, kind.vendor, theme)
        const badge = kind.type === SHOP_ITEMS ? itemStandBadge(kind.categories) : undefined
        if (badge !== undefined) stand.state = { start: { kind: 'string', value: badge } }
        this.doodads.push(stand)
        // a use circle around the stand, as stock shops have [VERIFIED r16]
        const sensor = new SensorShape(ctx, x, y + 0.5)
        sensor.radius = 1.25
        this.sensors.push(sensor)
        const use = new NodeUseTrigger(ctx, x, y + 1, ICON_SHOP)
        use.connectToShape(sensor)
        const area = new NodeShopArea(ctx, x + 1, y + 1, use, kind.categories, kind.type)
        area.label = `shop:${kind.id}`
        // F runs the shop: #PlayerTarget only names who pressed, the UseTrigger
        // must also fire the ShopArea, as the stock and house vendors do
        use.connectTo(area)
        this.scriptNodes.push(use, area)
        this.width = 1
        this.height = 1
        break
      }

      case 'Orb': {
        // the run's end: pick up the sphere and the scenario is won
        const orb = Item.create(ctx, x, y, 'Orb', 0)
        this.items.push(orb)
        const picked = new NodeUnitPickedUpTrigger(ctx, x, y + 2)
        picked.units.push(orb)
        const text = new NodeAnnounceText(ctx, x + 1, y + 2)
        text.setText('Victory!')
        const end = new NodeGameEnd(ctx, x, y + 4)
        end.showCredits = true
        picked.connectTo(text)
        picked.connectTo(end, 3000)
        this.scriptNodes.push(picked, text, end)
        this.width = 1
        this.height = 1
        break
      }

      case 'BossPortal':
      case 'LobbyPortal': {
        this.doodads.push(Doodad.create(ctx, x, y, type, theme))
        const sensor = new SensorShape(ctx, x, y)
        sensor.width = 3
        sensor.height = 3
        this.sensors.push(sensor)
        // with no explicit target a portal leads to the first fight or lobby
        const target = exitTarget ?? (type === 'BossPortal' ? bossArenaId(0) : lobbyId(0))
        this.scriptNodes.push(...buildExitRig(ctx, sensor, target, x, y + 2))
        this.width = 1
        this.height = 1
        break
      }
    }
  }

  /** Removes this set's objects from the level registries. */
  delete(ctx: GenerationContext): void {
    ctx.doodads = ctx.doodads.filter((d) => !this.doodads.includes(d))
    ctx.scriptNodes = ctx.scriptNodes.filter((n) => !this.scriptNodes.includes(n))
    ctx.sensors = ctx.sensors.filter((s) => !this.sensors.includes(s))
    ctx.items = ctx.items.filter((i) => !this.items.includes(i))
  }

  contains(x: number, y: number): boolean {
    return x <= this.x + this.width && x >= this.x && y <= this.y + this.height && y >= this.y
  }

  /** Whether (x, y) is one of the wall-line cells this set's art occupies (an exit doorway). */
  containsWall(x: number, y: number): boolean {
    return this.reserved.some(([rx, ry]) => rx === x && ry === y)
  }
}

export * from './vendorRoll'

/**
 * The shop stands a floor's shop room may roll, in SHOP_KINDS order. Unknown
 * ids are ignored and an empty selection falls back to the defaults, so a
 * hand-edited parameters file can never leave the roll with nothing to draw
 * (validation reports both).
 */
export function enabledShopKinds(ids?: readonly string[]): ShopKind[] {
  const wanted = new Set(ids === undefined || ids.length === 0 ? DEFAULT_SHOP_KIND_IDS : ids)
  const kinds = SHOP_KINDS.filter((k) => wanted.has(k.id))
  return kinds.length > 0 ? kinds : SHOP_KINDS.filter((k) => DEFAULT_SHOP_KIND_IDS.includes(k.id))
}
