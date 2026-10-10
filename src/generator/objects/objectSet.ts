import { Doodad } from './doodad'
import { getTheme } from '../config/themes'
import { Item } from './item'
import { ScriptNode } from './scriptNode'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeGameEnd,
  NodeLevelExit,
  NodeLevelStart,
  NodeObjectEventTrigger,
  NodeRectangleShape,
  NodeShopArea,
  NodeToggleElement
} from './nodes'
import type { GenerationContext } from '../core/context'
import { bossArenaId, lobbyId } from '../campaign'

export type SetTypeName = 'ExitUp' | 'ExitDn' | 'Shop' | 'Orb' | 'RestoreOrb' | 'BossPortal' | 'LobbyPortal'

/**
 * A prefab group of doodads, items and script nodes — stair entrances/exits,
 * the shop vendor, and the endgame orb (ported from ObjectSet.java).
 */
export class ObjectSet {
  doodads: Doodad[] = []
  scriptNodes: ScriptNode[] = []
  items: Item[] = []
  width = 0
  height = 0
  wallX = 0
  wallY = 0
  wallWidth = 0
  wallHeight = 0
  replaceWalls = false

  static create(
    ctx: GenerationContext,
    x: number,
    y: number,
    type: SetTypeName,
    theme: string,
    exitTarget?: string
  ): ObjectSet {
    const s = new ObjectSet(ctx, x, y, type, theme, exitTarget)
    ctx.objectSets.push(s)
    return s
  }

  static delete(ctx: GenerationContext, s: ObjectSet): void {
    s.delete(ctx)
    ctx.objectSets = ctx.objectSets.filter((o) => o !== s)
  }

  /**
   * Close the gap the stair alcove leaves in the room's wall band, for themes
   * whose stair sprite has no collider of its own (see ThemeDef.stairBacking).
   *
   * The set is placed at `room.y - 2`, so `y + 1` is the wall row and everything
   * below is room floor. The prefab already caps that row with `TDown` at
   * `x + 1` and `x + 4`, leaving exactly `x + 2` and `x + 3` open — the two tiles
   * the lettered themes cover with their solid `_exit_h_*` sprite. Emits nothing
   * when the theme's own stair art is already solid.
   */
  private addStairBacking(ctx: GenerationContext, x: number, y: number, theme: string): void {
    const backing = getTheme(theme)?.stairBacking
    if (backing === undefined) return

    for (let dx = 2; dx <= 3; dx++) {
      this.doodads.push(Doodad.create(ctx, x + dx, y + 1, backing, theme))
    }
  }

  /** The pair of occlusion overlays over the alcove, for themes that use them. */
  private addStairCover(ctx: GenerationContext, x: number, y: number, theme: string): void {
    if (getTheme(theme)?.omitCover === true) return

    this.doodads.push(Doodad.create(ctx, x + 1.5, y + 0.25, 'Cover', theme))
    this.doodads.push(Doodad.create(ctx, x + 2.5, y + 0.25, 'Cover', theme))
  }

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: SetTypeName,
    theme: string,
    exitTarget?: string
  ) {
    switch (type) {
      case 'ExitUp': {
        // first, so the stair sprite is emitted after it and draws on top
        this.addStairBacking(ctx, x, y, theme)
        this.doodads.push(Doodad.create(ctx, x + 1, y + 1, 'TDown', theme))
        this.doodads.push(Doodad.create(ctx, x + 4, y + 1, 'TDown', theme))
        this.doodads.push(Doodad.create(ctx, x + 1, y + 3, 'TorchOff', theme))
        this.doodads.push(Doodad.create(ctx, x + 2, y + 3, 'ExitUp', theme))
        this.doodads.push(Doodad.create(ctx, x + 4, y + 3, 'TorchOff', theme))
        this.addStairCover(ctx, x, y, theme)
        this.doodads.push(Doodad.create(ctx, x + 2, y + 4, 'ExitMarker', theme))
        this.scriptNodes.push(new NodeLevelStart(ctx, x + 3, y + 5))

        const shape = new NodeRectangleShape(ctx, x + 3, y + 5)
        this.scriptNodes.push(shape)

        const areaTrig = new NodeAreaTrigger(ctx, x + 3, y + 6)
        areaTrig.connectToShape(shape)
        this.scriptNodes.push(areaTrig)

        const levelText = new NodeAnnounceText(ctx, x + 3, y + 7)
        levelText.setText(`Level ${ctx.currentLevel + 1}`)
        areaTrig.connectTo(levelText)
        this.scriptNodes.push(levelText)

        const toggle = new NodeToggleElement(ctx, x + 3, y + 8)
        toggle.connectToElement(areaTrig)
        areaTrig.connectTo(toggle)
        this.scriptNodes.push(toggle)

        const resScript = new ScriptNode(ctx, x, y + 8, 'RespawnPlayers')
        areaTrig.connectTo(resScript)
        this.scriptNodes.push(resScript)

        this.width = 6
        this.height = 5
        this.wallWidth = 3
        this.wallHeight = 4
        this.wallX = x + 1
        this.wallY = y + 1
        this.replaceWalls = true
        break
      }

      case 'ExitDn': {
        // first, so the stair sprite is emitted after it and draws on top
        this.addStairBacking(ctx, x, y, theme)
        this.doodads.push(Doodad.create(ctx, x + 1, y + 1, 'TDown', theme))
        this.doodads.push(Doodad.create(ctx, x + 4, y + 1, 'TDown', theme))
        this.doodads.push(Doodad.create(ctx, x + 1, y + 3, 'Torch', theme))
        this.doodads.push(Doodad.create(ctx, x + 2, y + 3, 'ExitDn', theme))
        this.doodads.push(Doodad.create(ctx, x + 4, y + 3, 'Torch', theme))
        this.addStairCover(ctx, x, y, theme)
        this.doodads.push(Doodad.create(ctx, x + 2, y + 4, 'ExitMarker', theme))

        const shape = new NodeRectangleShape(ctx, x + 3, y + 4)
        this.scriptNodes.push(shape)

        const exit = new NodeLevelExit(ctx, x + 3, y + 6)
        // The next floor in the campaign ORDER, which under the default order
        // is the `currentLevel + 1` the Java original hardcoded and
        // NodeLevelExit still defaults to. A rearranged campaign can put a boss
        // fight between two floors, so the number is no longer implied by this
        // floor's own index.
        if (ctx.gateway?.kind === 'exit') exit.level = ctx.gateway.target
        exit.connectToShape(shape)
        this.scriptNodes.push(exit)

        this.width = 6
        this.height = 5
        this.wallWidth = 3
        this.wallHeight = 4
        this.wallY = y + 1
        this.wallX = x + 1
        this.replaceWalls = true
        break
      }

      case 'Shop': {
        const shape = new NodeRectangleShape(ctx, x, y)
        this.scriptNodes.push(shape)
        const shop = new NodeShopArea(ctx, x, y)
        shop.connectToShape(shape)
        this.scriptNodes.push(shop)
        this.doodads.push(Doodad.create(ctx, x, y, shop.shopType.vendor, theme))
        this.width = 1
        this.height = 1
        this.replaceWalls = false
        break
      }

      case 'Orb': {
        const orb = Item.create(ctx, x, y, 'Orb', 0)
        this.items.push(orb)

        const trigger = new NodeObjectEventTrigger(ctx, x, y + 2)
        trigger.connectItem(orb)

        const textScript = new NodeGameEnd(ctx, x, y + 4)
        trigger.connectTo(textScript)

        this.scriptNodes.push(trigger)
        this.scriptNodes.push(textScript)

        this.width = 1
        this.height = 1
        this.replaceWalls = false
        break
      }

      case 'BossPortal': {
        // Replaces 'Orb' at the same coordinates on the final dungeon floor
        // when the boss feature is on, so it must match Orb's contract
        // exactly: register exactly 3 ctx ids and draw nothing from either
        // RNG stream. Room transforms run before wall rasterization and
        // ctx.idCounter is one monotonic counter per level, so a mismatch
        // here would shift every wall doodad id placed after it.
        // 3x3 trigger area, matching the authored portal in
        // test_boss_prep_room.xml — a 1x1 is easy to step over at a run
        const shape = new NodeRectangleShape(ctx, x, y)
        shape.width = 3
        shape.height = 3
        this.scriptNodes.push(shape)

        // Points at a named level, not the next numeric floor: the id of
        // whatever slot the campaign order puts next — the first fight's
        // arena directly, or a lobby first if the dungeon master put a shop
        // there. The same rig also ends a non-final arena, where it points at
        // whatever comes after THAT fight, which is how a multi-fight
        // campaign chains.
        const exit = new NodeLevelExit(ctx, x, y + 2)
        exit.level = exitTarget ?? bossArenaId(0)
        exit.connectToShape(shape)
        this.scriptNodes.push(exit)

        // the portal art itself, NOT ExitMarker: that is a flat editor decal
        // which ExitDn only uses *under* its stair sprite, so using it alone
        // would render a floor marker where the portal should be
        this.doodads.push(Doodad.create(ctx, x, y, 'BossPortal', theme))

        this.width = 1
        this.height = 1
        this.replaceWalls = false
        break
      }

      case 'LobbyPortal': {
        // Cloned from 'BossPortal' above, differing only in which doodad is
        // laid — the blue teleport rather than the red one, so a party can
        // tell "shop" from "boss fight" before stepping through. Same
        // contract for the same reason: replaces 'Orb' at the same
        // coordinates when the next slot is a lobby, so it must register
        // exactly 3 ctx ids and draw nothing from either RNG stream — a
        // mismatch here would shift every wall doodad id placed after it.
        const shape = new NodeRectangleShape(ctx, x, y)
        shape.width = 3
        shape.height = 3
        this.scriptNodes.push(shape)

        // Points at the lobby the campaign order puts next. A boss arena can
        // also end in this rig (an arena followed by a lobby), which is why
        // boss/arena.ts picks the doodad by gateway kind the same way
        // map/room.ts does for a dungeon floor. A locked floor (issue #69) that
        // would otherwise take the stairs also ends here, pointing at the next
        // floor — stairs cannot be sealed.
        const exit = new NodeLevelExit(ctx, x, y + 2)
        exit.level = exitTarget ?? lobbyId(0)
        exit.connectToShape(shape)
        this.scriptNodes.push(exit)

        this.doodads.push(Doodad.create(ctx, x, y, 'LobbyPortal', theme))

        this.width = 1
        this.height = 1
        this.replaceWalls = false
        break
      }

      case 'RestoreOrb': {
        // unused by the generator, kept for completeness with the original
        const orbR = Item.create(ctx, x, y, 'Orb', 1)
        this.items.push(orbR)

        const triggerR = new NodeObjectEventTrigger(ctx, x, y + 2)
        triggerR.connectItem(orbR)

        const titleScript = new NodeAnnounceText(ctx, x, y + 4)
        titleScript.setText('Orb of Restoration')
        triggerR.connectTo(titleScript)

        const subScript = new NodeAnnounceText(ctx, x, y + 6)
        subScript.setText('Fallen party members restored')
        triggerR.connectTo(subScript)

        this.scriptNodes.push(triggerR)
        this.scriptNodes.push(titleScript)
        this.scriptNodes.push(subScript)

        this.width = 1
        this.height = 1
        this.replaceWalls = false
        break
      }
    }
  }

  /** Removes this set's doodads and script nodes from the level registries. */
  delete(ctx: GenerationContext): void {
    ctx.doodads = ctx.doodads.filter((d) => !this.doodads.includes(d))
    ctx.scriptNodes = ctx.scriptNodes.filter((n) => !this.scriptNodes.includes(n))
  }

  contains(x: number, y: number): boolean {
    return x <= this.x + this.width && x >= this.x && y <= this.y + this.height && y >= this.y
  }

  containsWall(x: number, y: number): boolean {
    return (
      x <= this.wallX + this.wallWidth &&
      x >= this.wallX &&
      y <= this.wallY + this.wallHeight &&
      y >= this.wallY
    )
  }
}
