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
 *        → SetUnitScene(portal, open): the empty frame comes alive
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
import { LEVEL_LOADED_EVENT } from '../core/events'
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
  NodeGlobalEventRanged,
  NodeGlobalEventTrigger,
  NodeHideUnit,
  NodeObjectEventTrigger,
  NodePlaySound,
  NodeSetFlag,
  NodeToggleElement,
  NodeUnitPickedUpTrigger
} from '../objects/nodes'
import { SEAL_SOUND, buildButtonCountdown } from '../map/buttonSeal'
import { MYSTERY_BUTTON_STATE } from '../mystery/rig'
import { MYSTERY_PLATE } from './encounters'
import { BOSS_DEFS, expandLineup, pickBosses, START_SIGNAL_RADIUS, START_SIGNAL_RESEND_MS, startSignalsFor } from '../boss/bosses'
import type { BossSide } from '../boss/bosses'
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

/**
 * Which of `siteCount` sites the bosses take: spread evenly round the
 * island. Site i lies in angle sector i (`place.ts`), so taking every
 * (n/b)-th site keeps the bosses apart instead of on one shore. No draws.
 */
export function bossSiteIndexes(siteCount: number, bossCount: number): number[] {
  const b = Math.min(bossCount, siteCount)
  return Array.from({ length: b }, (_, i) => Math.floor((i * siteCount) / b))
}

/**
 * Where the victory orb stands, in tiles from the centre: three tiles north.
 * At the centre itself it was hidden behind the start's save plate and the
 * arrival (user, 2026-11-16); north of the hub is clear of both, which lie
 * south of it, and of the camp's tent and the village's centrepiece.
 */
export const ORB_AT: Tile = { x: 0, y: -3 }

/** Where a boss's statue stands, in tiles from its site, and the disc kept for it. */
export const STATUE_OFFSET: Tile = { x: 3, y: -3 }
export const STATUE_RADIUS = Math.max(
  0,
  ...Object.values(BOSS_DEFS).map((b) => (b.statue === undefined ? 0 : Math.ceil(b.statue.footprint / 2)))
)

/**
 * The statue spots of every site a boss may take, reserved before the
 * landmarks so none grows over one. Which boss stands there is drawn later,
 * so every boss site keeps the spot. No draws.
 */
export function reserveStatueSpots(grid: WorldGrid, sites: readonly Tile[], bossCount: number): Tile[] {
  const spots = bossSiteIndexes(sites.length, bossCount).map((i) => ({ x: sites[i].x + STATUE_OFFSET.x, y: sites[i].y + STATUE_OFFSET.y }))
  for (const spot of spots) grid.markDisc(spot, STATUE_RADIUS, WorldGrid.RESERVED)
  return spots
}

/** "2 objectives remain", for the countdown's announcements. */
export function objectivesRemainingText(k: number): string {
  return k === 1 ? '1 objective remains' : `${k} objectives remain`
}

/**
 * The start: arrival, the portal at `hub` (or the hidden orb just north of it), and every
 * objective on `sites` — bosses spread round them (`bossSiteIndexes`), buttons on the rest.
 *
 * With no objectives at all the world is free roam: the portal stands open
 * (or the orb in plain sight) from the start, and there is no countdown, so
 * the party can explore for loot or walk straight on.
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
  const freeRoam = sites.length === 0

  // the way out, shut until the count reaches zero (or open from the start)
  let reveal: ScriptNode[] = []
  if (gateway.kind === 'orb') {
    const at = { x: hub.x + ORB_AT.x, y: hub.y + ORB_AT.y }
    const orb = Item.create(ctx, at.x + 0.5, at.y + 0.5, 'Orb', 0)
    grid.markDisc(at, 1, WorldGrid.RESERVED)
    if (!freeRoam) orb.state = { hidden: { kind: 'bool', value: true } }
    const picked = new NodeUnitPickedUpTrigger(ctx, hub.x, hub.y + 2)
    picked.units.push(orb)
    const victory = new NodeAnnounceText(ctx, hub.x + 1, hub.y + 2)
    victory.setText('Victory!')
    const end = new NodeGameEnd(ctx, hub.x, hub.y + 4)
    end.showCredits = true
    picked.connectTo(victory)
    picked.connectTo(end, 3000)
    if (!freeRoam) {
      const show = new NodeHideUnit(ctx, hub.x, hub.y - 2)
      show.setTarget(orb)
      reveal = [show, announce(ctx, hub, ORB_TEXT)]
    }
  } else {
    const portal = Doodad.prop(ctx, hub.x + 0.5, hub.y + 0.5, nextIsFight ? PORTAL_RED : PORTAL_BLUE, {
      start: { kind: 'string', value: freeRoam ? 'open' : 'closed' }
    })
    const sensor = new SensorShape(ctx, hub.x + 0.5, hub.y + 0.5)
    sensor.width = 3
    sensor.height = 3
    const [use] = buildExitRig(ctx, sensor, gateway.target, hub.x, hub.y + 2)
    if (!freeRoam) {
      use.enabled = false
      const wake = new NodeChangeDoodadState(ctx, hub.x, hub.y - 2, 'open')
      wake.setTarget(portal)
      const enable = new NodeToggleElement(ctx, hub.x + 1, hub.y - 2)
      enable.action = 'enable'
      enable.connectToElement(use)
      reveal = [wake, enable, announce(ctx, hub, PORTAL_TEXT)]
    }
  }
  if (!freeRoam) reveal.push(new NodePlaySound(ctx, hub.x + 2, hub.y - 2, PORTAL_SOUND))
  // the portal's own colliders, two small posts
  grid.markDisc(hub, 1, WorldGrid.SOLID)

  const triggers: ScriptNode[] = []
  const bossCount = Math.min(worldBossCount(def), sites.length)
  const ids: BossId[] =
    bossSelection(def) === 'lineup' ? expandLineup(def.bossLineup).slice(0, bossCount) : pickBosses(rand, def.bossPool, bossCount)
  const bosses: Tile[] = []
  const bossSites = bossSiteIndexes(sites.length, ids.length)
  ids.forEach((id, i) => {
    const boss = BOSS_DEFS[id]
    // a sideWall boss (Doombringer, a perched dragon) takes the island's west or east end,
    // facing in, instead of its site; its site stays empty
    let site = sites[bossSites[i]]
    let side: BossSide | undefined
    if (boss.placement === 'sideWall') {
      side = rand.iRand(0, 2) === 0 ? 'W' : 'E'
      const radius = Math.ceil(boss.footprintWidth / 2) + 1
      // reached from where the party arrives (the hub itself is solid by now)
      const reached = grid.reach({ x: hub.x, y: hub.y + 3 })
      const spot = islandEndSpot(grid, side, radius, reached) ?? islandEndSpot(grid, side === 'W' ? 'E' : 'W', radius, reached)
      if (spot !== null) {
        if (spot.side !== side) side = spot.side
        site = spot.at
        grid.markDisc(site, radius, WorldGrid.RESERVED)
      } else {
        // no end fits him: his site, facing the start
        side = site.x <= hub.x ? 'W' : 'E'
      }
    }
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
      grid.markDisc({ x: site.x + STATUE_OFFSET.x, y: site.y + STATUE_OFFSET.y }, Math.ceil(boss.statue.footprint / 2), WorldGrid.RESERVED)
    }
    const near = new SensorShape(ctx, site.x + 0.5, site.y + 0.5)
    near.radius = BOSS_BAR_RADIUS
    const approach = new NodeAreaTrigger(ctx, site.x, site.y - 4)
    approach.triggerTimes = 1
    approach.connectToShape(near)
    approach.connectTo(new NodeCreateBossBar(ctx, site.x + 1, site.y - 4, [actor], boss.barName))
    // what the boss's own arena would tell it as the fight starts (HW2's), on load and again
    // a little later; a boss without any allocates nothing
    const signals = startSignalsFor(boss, side)
    if (signals.length > 0) {
      const loaded = new NodeGlobalEventTrigger(ctx, site.x - 1, site.y - 4, LEVEL_LOADED_EVENT)
      for (const signal of signals) {
        const node =
          'event' in signal
            ? new NodeGlobalEventRanged(ctx, site.x + 0.5, site.y + 0.5, signal.event, START_SIGNAL_RADIUS)
            : new NodeSetFlag(ctx, site.x + 0.5, site.y + 0.5, signal.flag)
        loaded.connectTo(node)
        loaded.connectTo(node, START_SIGNAL_RESEND_MS)
      }
    }
    const died = new NodeObjectEventTrigger(ctx, site.x, site.y - 3)
    died.connectObject(actor)
    died.triggerTimes = 1
    triggers.push(died)
  })

  const buttons = sites.filter((_, i) => !bossSites.includes(i))
  const plates = buttons.map((at) => {
    // disguised, it wears the mystery plates' art and presses the way they do
    const plate = def.disguise === true ? Doodad.prop(ctx, at.x + 0.5, at.y + 0.5, MYSTERY_PLATE) : Doodad.prop(ctx, at.x, at.y, BUTTON_PLATE)
    const shape = new SensorShape(ctx, at.x + 0.5, at.y + 0.5)
    const trigger = new NodeAreaTrigger(ctx, at.x + 0.5, at.y + 0.5)
    trigger.triggerTimes = 1
    trigger.connectToShape(shape)
    trigger.connectTo(new NodePlaySound(ctx, at.x + 0.5, at.y + 0.5, SEAL_SOUND))
    const press = new NodeChangeDoodadState(ctx, at.x + 0.5, at.y + 0.5, def.disguise === true ? MYSTERY_BUTTON_STATE : BUTTON_PRESSED)
    press.setTarget(plate)
    trigger.connectTo(press)
    triggers.push(trigger)
    return { at, trigger }
  })

  if (triggers.length > 0) {
    const zero = buildButtonCountdown(ctx, triggers, { x: hub.x + 8, y: hub.y - 8 }, objectivesRemainingText)
    for (const node of reveal) zero.connectTo(node)
  }
  return { buttons, bosses, plates }
}

/**
 * The westmost (or eastmost) spot where a disc of `radius` is all free land the
 * party can walk to: a perched boss's place at that end of the island, kept off
 * the coast and the cliffs. Rows nearer the island's middle first. Null if none.
 */
function islandEndSpot(grid: WorldGrid, side: BossSide, radius: number, reached: Uint8Array): { at: Tile; side: BossSide } | null {
  const midY = Math.trunc(grid.height / 2)
  const rows = Array.from({ length: grid.height }, (_, y) => y).sort((a, b) => Math.abs(a - midY) - Math.abs(b - midY) || a - b)
  for (let i = 0; i < grid.width; i++) {
    const x = side === 'W' ? i : grid.width - 1 - i
    for (const y of rows) {
      const at = { x, y }
      if (reached[y * grid.width + x] !== 1) continue
      if (grid.discAll(at, radius, (cx, cy) => grid.free(cx, cy))) return { at, side }
    }
  }
  return null
}

function announce(ctx: GenerationContext, hub: Tile, text: string): NodeAnnounceText {
  const node = new NodeAnnounceText(ctx, hub.x + 3, hub.y - 2)
  node.setText(text)
  node.time = ANNOUNCE_MS
  node.textType = 1
  return node
}
