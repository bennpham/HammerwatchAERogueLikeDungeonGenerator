/**
 * A world's objectives and its way out: every floor button and every boss
 * counts down one shared variable, and at zero the portal at the center comes
 * alive (or the orb appears, when the world ends the campaign).
 *
 *   per button:  plate + 1×1 sensor → AreaTrigger(once) → PlaySound + SetUnitScene(activate)
 *   per boss:    actor (+ its statue) ; AreaTrigger(once, near it) → CreateBossBar
 *                UnitDestroyedTrigger(boss, once)
 *   every one of those triggers → buildButtonCountdown (`map/buttonSeal.ts`)
 *   == 0 → AnnounceText + PlaySound
 *        → frame:  SetUnitScene(portal, open)    appear: HideUnit(portal, show)
 *        → ToggleScripts(enable) the exit's UseTrigger, which ships disabled
 *   orb:   == 0 → HideUnit(orb, show); the orb ships hidden
 *
 * The plate is the lock buttons' (`boss_door_button`, driven to `activate`,
 * [VERIFIED] on the floors). A boss's bar appears when the party first walks
 * near it rather than at load: an island may hold several, and a bar for a boss
 * across the map would only be clutter.
 *
 * Draws only from the world's encounter stream (which bosses).
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import type { Gateway } from '../campaign'
import { Doodad } from '../objects/doodad'
import { Item } from '../objects/item'
import { Monster } from '../objects/monster'
import { addArrival, buildExitRig } from '../objects/objectSet'
import { SensorShape } from '../objects/scriptNode'
import type { ScriptNode } from '../objects/scriptNode'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodeCreateBossBar,
  NodeGameEnd,
  NodeHideUnit,
  NodeObjectEventTrigger,
  NodePlaySound,
  NodeToggleElement,
  NodeUnitPickedUpTrigger
} from '../objects/nodes'
import { SEAL_SOUND, buildButtonCountdown } from '../map/buttonSeal'
import { BOSS_DEFS, expandLineup, pickBosses } from '../boss/bosses'
import type { BossId } from '../boss/bosses'
import { buildBossStatue } from '../boss/statue'
import { bossSelection, worldBossCount } from '../config/parameters'
import type { WorldDef } from './options'
import type { Tile } from './grid'
import { WorldGrid } from './grid'

const PORTAL_BLUE = 'doodads/generic/teleport_mt.unit'
const PORTAL_RED = 'doodads/generic/teleport_red.unit'
const BUTTON_PLATE = 'doodads/doors/boss_door_button.unit'
const BUTTON_PRESSED = 'activate'
/** Stock's "solved" cue (Castle and Temple puzzles). */
export const PORTAL_SOUND = 'event:/SFX/Effects/other/puzzle_complete_2'
export const PORTAL_TEXT = 'The portal has opened!'
export const ORB_TEXT = 'The orb has appeared!'
/** How near, in tiles, the party must come before a boss's bar shows. */
const BOSS_BAR_RADIUS = 10
const ANNOUNCE_MS = 4000

/** What the objectives placed: the triggers that count, and what they open. */
export interface WorldObjectives {
  buttons: Tile[]
  bosses: Tile[]
  /** the button triggers, so an ambush can hang off one */
  plates: Array<{ at: Tile; trigger: ScriptNode }>
}

/** "2 objectives remain", for the countdown's announcements. */
export function objectivesRemainingText(k: number): string {
  return k === 1 ? '1 objective remains' : `${k} objectives remain`
}

/**
 * The start: arrival, the portal (or the hidden orb) at `hub`, and every
 * objective on `sites` — bosses on the first `bossCount`, buttons on the rest.
 */
export function buildObjectives(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  def: WorldDef,
  hub: Tile,
  sites: readonly Tile[],
  gateway: Gateway,
  nextIsFight: boolean
): WorldObjectives {
  addArrival(ctx, hub.x + 0.5, hub.y + 3)

  // the way out, shut until the count reaches zero
  let reveal: ScriptNode[]
  if (gateway.kind === 'orb') {
    const orb = Item.create(ctx, hub.x + 0.5, hub.y + 0.5, 'Orb', 0)
    orb.state = { hidden: { kind: 'bool', value: true } }
    const picked = new NodeUnitPickedUpTrigger(ctx, hub.x, hub.y + 2)
    picked.units.push(orb)
    const victory = new NodeAnnounceText(ctx, hub.x + 1, hub.y + 2)
    victory.setText('Victory!')
    const end = new NodeGameEnd(ctx, hub.x, hub.y + 4)
    end.showCredits = true
    picked.connectTo(victory)
    picked.connectTo(end, 3000)
    const show = new NodeHideUnit(ctx, hub.x, hub.y - 2)
    show.setTarget(orb)
    reveal = [show, announce(ctx, hub, ORB_TEXT)]
  } else {
    const appear = def.portal === 'appear'
    const portal = Doodad.prop(ctx, hub.x + 0.5, hub.y + 0.5, nextIsFight ? PORTAL_RED : PORTAL_BLUE, {
      start: { kind: 'string', value: appear ? 'open' : 'closed' },
      ...(appear ? { hidden: { kind: 'bool' as const, value: true } } : {})
    })
    const sensor = new SensorShape(ctx, hub.x + 0.5, hub.y + 0.5)
    sensor.width = 3
    sensor.height = 3
    const [use] = buildExitRig(ctx, sensor, gateway.target, hub.x, hub.y + 2)
    use.enabled = false
    let wake: ScriptNode
    if (appear) {
      const show = new NodeHideUnit(ctx, hub.x, hub.y - 2)
      show.setTarget(portal)
      wake = show
    } else {
      const open = new NodeChangeDoodadState(ctx, hub.x, hub.y - 2, 'open')
      open.setTarget(portal)
      wake = open
    }
    const enable = new NodeToggleElement(ctx, hub.x + 1, hub.y - 2)
    enable.action = 'enable'
    enable.connectToElement(use)
    reveal = [wake, enable, announce(ctx, hub, PORTAL_TEXT)]
  }
  reveal.push(new NodePlaySound(ctx, hub.x + 2, hub.y - 2, PORTAL_SOUND))
  // the portal's own colliders, two small posts
  grid.markDisc(hub, 1, WorldGrid.SOLID)

  const triggers: ScriptNode[] = []
  const bossCount = Math.min(worldBossCount(def), sites.length)
  const ids: BossId[] =
    bossSelection(def) === 'lineup' ? expandLineup(def.bossLineup).slice(0, bossCount) : pickBosses(rand, def.bossPool, bossCount)
  const bosses: Tile[] = []
  ids.forEach((id, i) => {
    const site = sites[i]
    const boss = BOSS_DEFS[id]
    const actor = Monster.create(
      ctx,
      site.x + 0.5,
      site.y + 0.5,
      { id: boss.id, configKey: '', tiers: [boss.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Mini-bosses' },
      0
    )
    ctx.bossActors.push(actor)
    bosses.push(site)
    if (boss.statue !== undefined) {
      buildBossStatue(ctx, boss, actor, site.x + 3.5, site.y - 2.5, site.x, site.y - 6)
      // breakable, so not solid; reserved so nothing grows over it
      grid.markDisc({ x: site.x + 3, y: site.y - 3 }, Math.ceil(boss.statue.footprint / 2), WorldGrid.RESERVED)
    }
    const near = new SensorShape(ctx, site.x + 0.5, site.y + 0.5)
    near.radius = BOSS_BAR_RADIUS
    const approach = new NodeAreaTrigger(ctx, site.x, site.y - 4)
    approach.triggerTimes = 1
    approach.connectToShape(near)
    approach.connectTo(new NodeCreateBossBar(ctx, site.x + 1, site.y - 4, [actor], boss.barName))
    const died = new NodeObjectEventTrigger(ctx, site.x, site.y - 3)
    died.connectObject(actor)
    died.triggerTimes = 1
    triggers.push(died)
  })

  const buttons = sites.slice(ids.length)
  const plates = buttons.map((at) => {
    const plate = Doodad.prop(ctx, at.x, at.y, BUTTON_PLATE)
    const shape = new SensorShape(ctx, at.x + 0.5, at.y + 0.5)
    const trigger = new NodeAreaTrigger(ctx, at.x + 0.5, at.y + 0.5)
    trigger.triggerTimes = 1
    trigger.connectToShape(shape)
    trigger.connectTo(new NodePlaySound(ctx, at.x + 0.5, at.y + 0.5, SEAL_SOUND))
    const press = new NodeChangeDoodadState(ctx, at.x + 0.5, at.y + 0.5, BUTTON_PRESSED)
    press.setTarget(plate)
    trigger.connectTo(press)
    triggers.push(trigger)
    return { at, trigger }
  })

  const zero = buildButtonCountdown(ctx, triggers, { x: hub.x + 8, y: hub.y - 8 }, objectivesRemainingText)
  for (const node of reveal) zero.connectTo(node)
  return { buttons, bosses, plates }
}

function announce(ctx: GenerationContext, hub: Tile, text: string): NodeAnnounceText {
  const node = new NodeAnnounceText(ctx, hub.x + 3, hub.y - 2)
  node.setText(text)
  node.time = ANNOUNCE_MS
  node.textType = 1
  return node
}
