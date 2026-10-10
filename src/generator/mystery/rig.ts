/**
 * Mystery buttons (issue #67) — floor plates hidden around a finished dungeon
 * floor. Stepping on one presses it for good and fires whatever its pool entry
 * carries, all at once: loot beside the plate, monsters a few tiles out, the
 * room's walls turning into spewers, an announcement — or nothing but the
 * click, which is a legitimate outcome and the point of the gamble.
 *
 * Transcribed from the owner's hand-built `test_mystery_button_simple.xml`:
 *
 *   trigger_button_floor doodad (need-sync)
 *   RectangleShape w1 h1 over it  <- AreaTrigger (one shot)
 *     -> PlaySound button_hatch
 *     -> ChangeDoodadState `pressed` on the plate
 *     -> AnnounceText                     (only when the button has text)
 *     -> SpawnObject per loot copy        (trigger-times 1 each)
 *     -> SpawnObject per monster copy     (trigger-times 1 each)
 *     -> ToggleElement{state 0} per spewer (the spewers ship disabled)
 *     -> ToggleElement{state 1} per spewer, delayed  (only with trapSeconds)
 *
 * Enhanced lock buttons (built on issue #69's locked floors) reuse the same
 * payload — see `emitPayload` — on a lock button's OWN trigger instead of a
 * fresh plate: the lock button already has its own PlaySound and press, so
 * only the payload nodes (announce, loot, monsters, spewers, delayed
 * switch-off) are new there.
 *
 * ## RNG
 *
 * Everything that draws draws from `ctx.mysteryRand` alone, after the floor
 * was accepted and after every other per-floor rig — the same terms as
 * `traps/floor.ts`, for the same reason: the retry loop discards candidates
 * and nothing can rewind a Rand. The fixed order per floor:
 *
 *   Phase A: for each ordinary mystery plate in turn, one `iRand` for its tile
 *            and one for which pool button it is.
 *   Phase B: for each plate in the same order, one `iRand` per spewer its
 *            traps place (`emitPayload`).
 *   Phase C: for each ENHANCED lock button in turn (the first `count` entries
 *            of `level.lockButtons`, in the order they were placed), one
 *            `iRand` for which pool button it is.
 *   Phase D: for each enhanced lock button in the same order, one `iRand` per
 *            spewer its traps place (`emitPayload` again).
 *
 * Phases C and D run strictly after A and B, so enabling the enhancement
 * never moves this floor's own plates — only a later floor's mysteryRand
 * draws. A plate the tile pool cannot place draws nothing, an enhanced button
 * whose room has no wall slots left places no spewer, and a floor with
 * neither ordinary plates nor lock enhancements configured returns before
 * touching the stream or allocating an id.
 */

import type { GenerationContext } from '../core/context'
import type { Level } from '../map/level'
import type { ScriptNode } from '../objects/scriptNode'
import type { DungeonParameters, MysteryButton, TrapDirection } from '../config/parameters'
import { floorMystery, floorLockMystery } from '../config/parameters'
import { Doodad, doodadOffset } from '../objects/doodad'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodePlaySound,
  NodeProjectileSpewer,
  NodeRectangleShape,
  NodeSpawnObject,
  NodeToggleElement
} from '../objects/nodes'
import { mysteryLootById } from '../objects/mysteryLoot'
import { isKnownMonsterKey, resolveActorPath } from '../objects/monsterTypes'
import { projectileById } from '../objects/projectileTypes'
import { SEAL_SOUND } from '../map/buttonSeal'
import { roomInteriorSlots } from '../dungeonBoss/placement'
import { roomWallSlots } from '../traps/floor'
import { SPEWER_DIRECTION, TILE_CENTRE, TRAP_MIN_SPACING, takeSlot, takeSpacedSlot } from '../traps/slots'
import type { Slot } from '../traps/slots'
import type { ButtonSlot } from './placement'
import { MYSTERY_BUTTON_SPACING, mysteryButtonSlots, spawnTiles } from './placement'

/**
 * The state a pressed plate is switched to. `pressed` snaps the plate to its
 * final frame and leaves it DOWN — a mystery button fires once, and a plate
 * that stays in the floor tells the party it is spent. The shipped campaign
 * drives the same asset to `activate`, which animates the press and lets it
 * bob back up; that is right for a reusable switch, wrong here. The owner's
 * sample level uses `pressed` for exactly this reason. [VERIFIED] in game,
 * owner playtest 2026-09-26: the plate stays down.
 */
export const MYSTERY_BUTTON_STATE = 'pressed'

/** How long the announcement stays up, as in the owner's sample. */
export const MYSTERY_ANNOUNCE_MS = 2500

/**
 * The announcement style: 3, Pickup — local to the node, so it pops up on the
 * plate that was pressed and several players pressing different plates each
 * see their own result. The editor lists 0 Title, 1 Subtitle (global),
 * 2 Regular (timer ticks), 3 Pickup. The owner's sample used 1; switched by
 * the owner after the 2026-09-27 playtest.
 */
export const MYSTERY_ANNOUNCE_TYPE = 3

/**
 * An ENHANCED LOCK BUTTON's payload text: Pickup (3) as well, on its own
 * plate, for the same reason (owner, 2026-09-27). Kept as its own constant
 * so the lock and the plates can diverge without touching emitPayload.
 */
export const LOCK_PAYLOAD_ANNOUNCE_TYPE = 3

/** Chebyshev distance a button's loot keeps from its plate. */
const LOOT_GAP = 2
/** Chebyshev distance a button's monsters keep from its plate — clear of the presser. */
const MONSTER_GAP = 3

/**
 * The part of a mystery button's rig that is the SAME whether it fires from a
 * fresh plate or from an already-wired lock button: the announcement, the
 * loot and monster spawns, and the disabled-spewer traps with their optional
 * delayed switch-off. Connected onto `trigger`, which the caller already
 * created (and already gave its own PlaySound/press, if any).
 *
 * `plateTiles` is read AND written to by neither this function's caller
 * contract — the caller decides what counts as "a plate" for spawn avoidance
 * (see `buildMysteryButtonRig`'s Phase C/D comment on lock tiles).
 */
function emitPayload(
  ctx: GenerationContext,
  trigger: ScriptNode,
  tile: Slot,
  roomIndex: number,
  def: MysteryButton,
  plateTiles: readonly Slot[],
  interiorOf: (roomIndex: number) => Slot[],
  wallPoolOf: (roomIndex: number, direction: TrapDirection) => Slot[],
  textType: number
): void {
  const text = def.text?.trim() ?? ''
  if (text !== '') {
    const announce = new NodeAnnounceText(ctx, trigger.x, trigger.y)
    announce.setText(text)
    announce.time = MYSTERY_ANNOUNCE_MS
    announce.textType = textType
    trigger.connectTo(announce)
  }

  const room = interiorOf(roomIndex)

  // Loot: one SpawnObject per copy — a SpawnObject spawns once per incoming
  // trigger, so a count cannot live in trigger-times (boss/wavePickups.ts).
  const loot = def.loot.flatMap((row) => {
    const item = mysteryLootById(row.item)
    return item === undefined || !(row.count >= 1) ? [] : Array.from({ length: row.count }, () => item.path)
  })
  spawnTiles(room, tile, plateTiles, LOOT_GAP, loot.length).forEach((at, i) => {
    const spawn = new NodeSpawnObject(ctx, at.x + TILE_CENTRE, at.y + TILE_CENTRE, loot[i])
    spawn.triggerTimes = 1
    trigger.connectTo(spawn)
  })

  const monsters = def.monsters.flatMap((row) =>
    !isKnownMonsterKey(row.monster) || !(row.count >= 1)
      ? []
      : Array.from({ length: row.count }, () => resolveActorPath(row.monster))
  )
  spawnTiles(room, tile, plateTiles, MONSTER_GAP, monsters.length).forEach((at, i) => {
    const spawn = new NodeSpawnObject(ctx, at.x + TILE_CENTRE, at.y + TILE_CENTRE, monsters[i])
    spawn.triggerTimes = 1
    trigger.connectTo(spawn)
  })

  // Traps: spewers on this room's walls, disabled until the press.
  const spewers: NodeProjectileSpewer[] = []
  for (const row of def.traps) {
    const projectile = projectileById(row.projectile)
    if (projectile === undefined || !(row.count >= 1)) continue
    const pool = wallPoolOf(roomIndex, row.direction)
    for (let copy = 0; copy < row.count; copy++) {
      // Wall full: stop this row. No draw, so the stream stays tied to the
      // spewers actually placed.
      if (pool.length === 0) break
      const slot = takeSlot(ctx.mysteryRand, pool)
      const spewer = new NodeProjectileSpewer(
        ctx,
        slot.x + TILE_CENTRE,
        slot.y + TILE_CENTRE,
        projectile.path,
        SPEWER_DIRECTION[row.direction],
        row.spread,
        row.spawnRateMs
      )
      const on = new NodeToggleElement(ctx, spewer.x, spewer.y)
      on.state = 0 // 0 enables — the inverted polarity every ToggleElement uses
      on.connectToElement(spewer)
      trigger.connectTo(on)
      spewers.push(spewer)
    }
  }

  // Switch-off, connected LAST: a delayed connection puts this one trigger
  // into real-delay mode (every earlier connection back-filled with 0), the
  // same shape survival/clock.ts's verified LevelLoaded clock emits. A
  // button with no delay keeps the legacy `delays` line untouched.
  const seconds = def.trapSeconds ?? 0
  if (seconds > 0) {
    for (const spewer of spewers) {
      const off = new NodeToggleElement(ctx, spewer.x, spewer.y)
      off.state = 1
      off.connectToElement(spewer)
      trigger.connectTo(off, seconds * 1000)
    }
  }
}

/**
 * Places floor `levelIndex`'s mystery buttons — and, separately, enhances up
 * to `count` of its lock buttons with a mystery payload of their own — onto
 * an accepted floor. A no-op — no draw, no id — when the floor has neither
 * configured, or has nowhere to put an ordinary plate AND no valid lock
 * enhancement.
 */
export function buildMysteryButtonRig(
  ctx: GenerationContext,
  params: DungeonParameters,
  level: Level,
  levelIndex: number
): void {
  const floor = floorMystery(params, levelIndex)
  const lockMystery = floorLockMystery(params, levelIndex)
  if (floor === undefined && lockMystery === undefined) return

  const defs = params.mysteryButtons ?? []

  // Phase A: every plate's tile and pool button, before anything is emitted,
  // so the draw order does not depend on what a button carries. Skipped
  // outright — no mysteryButtonSlots call, no draw — when this floor has no
  // ordinary mystery-plate config, so an enhancement-only floor never touches
  // the plate-placement machinery at all.
  const tiles = floor !== undefined ? mysteryButtonSlots(level, ctx) : []
  const plates: Array<{ tile: ButtonSlot; def: MysteryButton }> = []
  if (floor !== undefined) {
    for (let k = 0; k < floor.count; k++) {
      if (tiles.length === 0) break
      const tile = takeSpacedSlot(ctx.mysteryRand, tiles, MYSTERY_BUTTON_SPACING)
      const def = defs[floor.pool[ctx.mysteryRand.iRand(0, floor.pool.length)]]
      plates.push({ tile, def })
    }
  }

  const plateTiles: Slot[] = plates.map((p) => ({ x: p.tile.x, y: p.tile.y }))

  // One room's interior, computed once however many plates (or enhanced lock
  // buttons) share the room.
  const interiors = new Map<number, Slot[]>()
  const interiorOf = (roomIndex: number): Slot[] => {
    let slots = interiors.get(roomIndex)
    if (slots === undefined) {
      slots = roomInteriorSlots(level, ctx, level.rooms[roomIndex], roomIndex)
      interiors.set(roomIndex, slots)
    }
    return slots
  }

  // Wall slots per room and direction, shared by every plate AND every
  // enhanced lock button in the room, so none of them can stack spewers on
  // one tile, and built clear of every spewer already on the floor (the
  // floor's own traps and a floor boss's tiers mount on the same wall lines).
  const wallPools = new Map<string, Slot[]>()
  const wallPoolOf = (roomIndex: number, direction: TrapDirection): Slot[] => {
    const key = `${roomIndex}:${direction}`
    let pool = wallPools.get(key)
    if (pool === undefined) {
      const mounted = ctx.scriptNodes
        .filter((n) => n.type === 'ProjectileSpewer')
        .map((n) => ({ x: n.x - TILE_CENTRE, y: n.y - TILE_CENTRE }))
      pool = roomWallSlots(level, ctx, level.rooms[roomIndex], roomIndex, direction).filter(
        (s) => !mounted.some((m) => Math.abs(m.x - s.x) + Math.abs(m.y - s.y) < TRAP_MIN_SPACING)
      )
      wallPools.set(key, pool)
    }
    return pool
  }

  // Phase B: emission, plate by plate. Byte-identical to before the
  // emitPayload extraction — same nodes, same order, same call site for the
  // plate's own doodad/shape/trigger/sound/press.
  for (const { tile, def } of plates) {
    const plate = Doodad.create(ctx, tile.x, tile.y, 'TriggerButton', level.theme)
    // A script changes its state, so it must replicate — see map/buttonSeal.ts.
    plate.needSync = true

    // The shape is centred, the doodad is anchored at its art offset — the
    // same half-tile relationship map/buttonSeal.ts documents and verified.
    const art = doodadOffset('TriggerButton', level.theme)
    const nodeX = tile.x + art.x + 0.5
    const nodeY = tile.y + art.y + 0.5

    const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
    const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
    trigger.triggerTimes = 1 // a mystery button fires once
    trigger.connectToShape(shape)

    trigger.connectTo(new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND))

    const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, MYSTERY_BUTTON_STATE)
    press.setTarget(plate)
    trigger.connectTo(press)

    emitPayload(ctx, trigger, tile, tile.roomIndex, def, plateTiles, interiorOf, wallPoolOf, MYSTERY_ANNOUNCE_TYPE)
  }

  // Enhanced lock buttons. Strictly after every draw above, so arming this
  // never moves this floor's own ordinary plates — only a later floor's
  // mysteryRand draws (the same promise floor traps and floor bosses already
  // make about the streams after them).
  if (lockMystery === undefined) return

  // Any payload spawn must dodge every lock button too, not just the ordinary
  // plates already placed — added only now, so a floor that mixes mystery
  // plates and a lock WITHOUT enhancement configured keeps placing exactly as
  // it always has.
  // Truncated: a lock tile is an fRand float (buttonSeal.ts draws it like a
  // key), while spawnTiles matches plates against whole-tile slots.
  const lockTiles = level.lockButtons.map((b) => ({ x: Math.trunc(b.x), y: Math.trunc(b.y) }))
  plateTiles.push(...lockTiles)

  // The enhanced buttons are the first `count` entries of level.lockButtons,
  // in the order buttonSeal.ts drew them — which button ends up enhanced is
  // therefore random too, without costing a draw of its own here.
  const enhanced = level.lockButtons.slice(0, lockMystery.count)

  // Phase C: one iRand per enhanced button for its pool entry, all of them
  // before any is emitted — same shape as Phase A.
  const picks = enhanced.map(() => defs[lockMystery.pool[ctx.mysteryRand.iRand(0, lockMystery.pool.length)]])

  // Phase D: emitPayload onto each button's EXISTING trigger, in the same
  // order. The button's own PlaySound and press are already wired by
  // buttonSeal.ts — only the payload nodes are new here, and they still count
  // toward the lock exactly as they always did.
  enhanced.forEach((button, i) => {
    emitPayload(ctx, button.trigger, lockTiles[i], button.roomIndex, picks[i], plateTiles, interiorOf, wallPoolOf, LOCK_PAYLOAD_ANNOUNCE_TYPE)
  })
}
