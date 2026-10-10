import { Doodad, doodadOffset } from '../objects/doodad'
import type { DoodadTypeName } from '../objects/doodad'
import {
  CHANGE_VAR_SUB,
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodeChangeVariable,
  NodeCheckVariable,
  NodeDestroyObject,
  NodePlaySound,
  NodeRectangleShape,
  NodeVariable
} from '../objects/nodes'
import type { ScriptNode } from '../objects/scriptNode'
import { overhangRows } from './reachability'
import { getTheme } from '../config/themes'
import type { Room } from './room'
import type { Level } from './level'
import type { GenerationContext } from '../core/context'

/**
 * The cue the button plays. A `sound/<bank>.xml:<cue>` pair, and the same one
 * the game's own hatch buttons use. [EMITTED] — taken from a hand-edited
 * level6 that loaded and played it.
 */
export const SEAL_SOUND = 'sound/misc.xml:button_hatch'

/**
 * The state the button is switched to when it fires.
 *
 * `activate` — what the hand-edited level6 that swapped the plate for
 * `boss_door_button.xml` switches it to. [VERIFIED 2026-09-26] in game — see
 * the DISCOVERY-LOG. The old `trigger_button_floor.xml` plate was driven to
 * `pressed`; that belongs to the old asset, do not carry it back.
 */
const SEAL_BUTTON_STATE = 'activate'

/**
 * The state a DISGUISED lock button is driven to instead — the mystery
 * plate's own `pressed` (`mystery/rig.ts`'s `MYSTERY_BUTTON_STATE`), so a
 * disguised floor's buttons all look and animate the same. Duplicated rather
 * than imported: `mystery/rig.ts` already imports `SEAL_SOUND` from this file,
 * and importing back would make the two files circular.
 */
const DISGUISE_BUTTON_STATE = 'pressed'

/** How long the "it opened" banner stays up, in ms. */
const SEAL_ANNOUNCE_MS = 2500

/**
 * AnnounceText `type`, named as the editor's dropdown lists them: 0 Title,
 * 1 Subtitle, 2 Regular, 3 Pickup (owner, 2026-09-27). Regular is the line
 * timer mode ticks on every second, so anything on it flashes by for a split
 * second on a timed floor — the owner's playtest of the countdown below.
 *
 * "It opened" is news for the whole party, so it goes on Subtitle, the global
 * announcement (owner, 2026-09-27).
 */
const SEAL_ANNOUNCE_TYPE = 1

/**
 * "k buttons remain" goes on Title — the style the game's own "<n> more to
 * go" (`ig.more-to-go`) uses across the shipped campaign. Never fires on the
 * same press as the opened line: the last press takes the count to 0, which
 * only the `== 0` check answers.
 */
const REMAINING_ANNOUNCE_TYPE = 0

const SEAL_TEXT = 'The way to the final room has opened!'

/** Same bound the key-spawning loops in level.ts use. */
const MAX_BUTTON_ATTEMPTS = 2000

/** Closest two buttons' tiles may sit on either axis, in tiles. */
const MIN_BUTTON_SPACING = 2

/**
 * One lock button placed on a floor (enhanced lock buttons): its tile, which
 * room it sits in, and its own press trigger — pushed onto `Level.lockButtons`
 * in draw order, in `buildButtonRig`. Read by `mystery/placement.ts` (so a
 * disguised lock plate is still avoided, same as an ordinary one) and
 * `mystery/rig.ts` (which of them fire a mystery payload).
 */
export interface LockButton {
  x: number
  y: number
  roomIndex: number
  trigger: ScriptNode
}

/**
 * Bar a dead-end room's corridor with a destructible wall, and hide the floor
 * button that opens it somewhere else on the floor.
 *
 * This is the keyless alternative to `Room.lockRoom()`'s gold door, and exists
 * because a *key* on the last gate of the campaign can be lost: a party that
 * hoarded gold keys on earlier floors, or spent this floor's key on one of the
 * chance-rolled gold doors, could end up unable to reach the orb at all. A
 * button cannot be spent, dropped or left on another floor.
 *
 * The rig, which mirrors the arena's alcove seals:
 *
 *   RectangleShape (over the button) -> AreaTrigger (one shot)
 *     -> PlaySound         the hatch cue
 *     -> DestroyObject     the wall pieces
 *     -> AnnounceText      so the party knows something opened
 *     -> ChangeDoodadState so the button itself reads as pressed
 *
 * The wall pieces carry `need-sync`, which is what makes their destruction
 * replicate to every client — the same requirement the arena's seals have. So
 * does the button, for the same reason applied to its *state*: the shipped
 * campaign's two floor buttons differ on exactly this, the one driven by a
 * ChangeDoodadState being `True` and the plain one `False`.
 *
 * With `count` buttons (issue #69 part 2) every one of them must be pressed:
 * they count down a `Variable`, each press announces how many remain, and
 * the wall comes down on the last (`buildButtonCountdown`). One button keeps
 * the direct wiring above, node for node.
 *
 * Returns false if the room is not a lockable dead end, or if the floor has
 * nowhere unlocked to hide the buttons — exactly as `lockRoom()` does, in which
 * case the caller re-rolls the floor.
 */
export function sealRoomWithButton(room: Room, ctx: GenerationContext, level: Level, count = 1): boolean {
  if (!sealable(room)) return false

  // Before the buttons are placed, so pickButtonTile's locked-room rule
  // excludes the very room this seal is about to close.
  room.locked = true
  room.sealed = true

  // First, because a floor with nowhere to hide a button is discarded whole
  // and there is no point emitting a wall for it. It also has to come before
  // the wall below, which allocates doodad ids: swapping the two would move
  // every id on the floor.
  const tiles = pickButtonTiles(ctx, level.rooms, count)
  if (tiles === null) return false

  const seals = drawSealWall(room, ctx)

  if (tiles.length === 1) {
    buildButtonRig(level, room, ctx, tiles[0], seals)
    return true
  }

  const triggers = tiles.map((tile) => buildButtonRig(level, room, ctx, tile))
  const done = buildButtonCountdown(ctx, triggers)
  openSeal(ctx, done, seals, triggers[0])
  return true
}

/**
 * A wall that needs BOTH the boss(es) dead and every button pressed — a floor
 * that is locked (issue #69) and hosts a boss (issue #61).
 *
 * Draws exactly what `sealRoomWithButton` draws, in the same order (button
 * tiles, then wall), but the buttons do not open the wall themselves. What is
 * returned in `buttons` is the ONE node that fires when the buttons are done —
 * the single button's own `AreaTrigger`, or the button countdown's `== 0`
 * check when there are several — so the boss rig's post-pass
 * (`dungeonBoss/opener.ts`) can feed it and the boss's death into one
 * countdown. Every button still plays its cue and animates when stepped on,
 * and with several each press still announces how many remain.
 *
 * Null when the room is not a lockable dead end or the floor has nowhere to
 * hide the buttons, in which case the floor re-rolls.
 */
export function sealRoomWallWithButton(
  room: Room,
  ctx: GenerationContext,
  level: Level,
  count = 1
): { seals: Doodad[]; buttons: ScriptNode[] } | null {
  if (!sealable(room)) return null

  room.locked = true
  room.sealed = true

  const tiles = pickButtonTiles(ctx, level.rooms, count)
  if (tiles === null) return null

  const seals = drawSealWall(room, ctx)

  const triggers = tiles.map((tile) => buildButtonRig(level, room, ctx, tile))
  return { seals, buttons: [triggers.length === 1 ? triggers[0] : buildButtonCountdown(ctx, triggers)] }
}

/** "2 buttons remain" / "1 button remains" — what each press announces. */
export function buttonsRemainingText(remaining: number): string {
  return remaining === 1 ? '1 button remains' : `${remaining} buttons remain`
}

/**
 * Several buttons, all of which must be pressed:
 *
 *   Variable(N)
 *   per button i:  AreaTrigger(one shot)
 *                    → ChangeVariable(var -= 1)
 *                    → CheckVariable(var == k) for every k in 0..N-1
 *   CheckVariable(== k ≥ 1)  on-true → AnnounceText("k buttons remain")
 *   CheckVariable(== 0)      on-true → whatever the caller connects
 *
 * The per-source ChangeVariable-then-CheckVariable shape is the [VERIFIED]
 * multi-boss rig's (`boss/tierSource.ts`); the checks are shared across the
 * buttons rather than one set per button, since each only tests the value.
 * Which button is pressed first does not matter — the count does.
 * [VERIFIED 2026-09-26] in game, on its own and feeding a boss floor's seal.
 *
 * Returns the `== 0` check. Draws no RNG. The nodes are editor markers only,
 * placed just past the map's east edge, clear of the boss rig's column.
 */
function buildButtonCountdown(ctx: GenerationContext, triggers: readonly ScriptNode[]): ScriptNode {
  const x = ctx.params.mapWidth + 8
  const y = 0
  const remaining = new NodeVariable(ctx, x, y, triggers.length)
  const changes = triggers.map((_, i) => new NodeChangeVariable(ctx, x + 1, y + 1 + i, remaining, CHANGE_VAR_SUB, 1))
  const checks = triggers.map((_, k) => new NodeCheckVariable(ctx, x + 2, y + 1 + k, remaining, k, []))
  for (let k = 1; k < checks.length; k++) {
    const announce = new NodeAnnounceText(ctx, x + 3, y + 1 + k)
    announce.setText(buttonsRemainingText(k))
    announce.time = SEAL_ANNOUNCE_MS
    announce.textType = REMAINING_ANNOUNCE_TYPE
    checks[k].connectTo(announce)
  }
  triggers.forEach((trigger, i) => {
    trigger.connectTo(changes[i])
    for (const check of checks) trigger.connectTo(check)
  })
  return checks[0]
}

/** DestroyObject on `seals` plus the "it opened" line, fired from `from`. */
function openSeal(ctx: GenerationContext, from: ScriptNode, seals: Doodad[], at: { x: number; y: number }): void {
  const mid = seals[Math.trunc(seals.length / 2)]
  const destroy = new NodeDestroyObject(ctx, mid.x, mid.y)
  for (const s of seals) destroy.connectDoodad(s)
  const announce = new NodeAnnounceText(ctx, at.x, at.y)
  announce.setText(SEAL_TEXT)
  announce.time = SEAL_ANNOUNCE_MS
  announce.textType = SEAL_ANNOUNCE_TYPE
  from.connectTo(destroy)
  from.connectTo(announce)
}

/**
 * The same destructible wall, with no button to open it — what a DUNGEON BOSS
 * floor gets (issue #61), where the key is the boss's death rather than
 * anything the party can stand on.
 *
 * Returns the wall pieces so the caller can wire them to whatever opens them;
 * `dungeonBoss/opener.ts` hangs the arena's own
 * `GlobalEventTrigger('Boss Died') -> DestroyObject` off exactly this set.
 * Null when the room is not a lockable dead end, in which case the floor
 * re-rolls, same as the button path.
 *
 * Draws NO random value — there is no button to hide. That is the whole
 * difference between this and `sealRoomWithButton`.
 */
export function sealRoomWall(room: Room, ctx: GenerationContext): Doodad[] | null {
  if (!sealable(room)) return null

  room.locked = true
  room.sealed = true

  return drawSealWall(room, ctx)
}

/**
 * Whether a room can carry a seal at all: a dead end, not already locked, and
 * not one of the two rooms whose stair prefab owns the wall band the seal would
 * be drawn into.
 *
 * The `Exit` clause is load-bearing rather than inherited. An ExitDn prefab
 * sits at `room.y - 2`, inside the north wall band, and a DOWN corridor's seal
 * line is drawn at `entrance.y + 1 + overhangRows(theme)` — the same rows. They
 * would be emitted over each other. A boss floor sidesteps this entirely by
 * taking the orb/portal branch instead of the stairs branch, which is why
 * `sealRoomWall` can share this guard unchanged.
 */
function sealable(room: Room): boolean {
  return !(room.passages.length !== 1 || room.locked || room.type === 'Entrance' || room.type === 'Exit')
}

/** The wall itself: the pieces barring the room's single corridor. */
function drawSealWall(room: Room, ctx: GenerationContext): Doodad[] {
  const p = room.passages[0]
  const entrance = p.path[0]

  // The wall spans the corridor's whole cross-section, plus one tile into the
  // wall band at each end.
  //
  // The full span matters: it is tempting to skip the two rows nearest the wall
  // above, since the lettered themes' art overhangs and buries them
  // (`OVERHANG_ROWS`, reachability.ts) — but theme h and every bonus theme
  // anchor their wall pieces at `yOffset: 0` and overhang nothing, so those rows
  // are walkable there and a short seal is one the player simply walks around.
  // [VERIFIED] 2026-08-24 in game, theme h. On the lettered themes the extra
  // pieces sit under the overhang and merely make the barrier read full-height.
  const seals: Doodad[] = []

  switch (entrance.dir.name) {
    case 'UP':
    case 'DOWN': {
      // a vertical corridor occupies columns entrance.x .. entrance.x + width - 1
      //
      // UP bars the doorway row itself; DOWN has to clear the doorway's own art
      // first, which is what the offset buys — one row past the wall, plus
      // however many rows that wall buries beneath it. On the lettered themes
      // that is the 3 it has always been; on a flat theme it is 1, and assuming
      // 3 there overshoots the corridor mouth. Where the corridor is shorter
      // than the overshoot the barrier lands inside the room it is supposed to
      // gate — seven tiles of wall across a fifteen-tile room, walked around at
      // either end. [VERIFIED] 2026-08-24 in game, theme h.
      const lineY =
        entrance.dir.name === 'UP' ? entrance.y : entrance.y + 1 + overhangRows(room.theme)
      for (let xOffset = -1; xOffset <= p.width; xOffset++) {
        seals.push(Doodad.create(ctx, entrance.x + xOffset, lineY, 'Horizontal', room.theme))
      }
      break
    }

    case 'LEFT':
    case 'RIGHT': {
      // a horizontal corridor occupies rows entrance.y .. entrance.y + width + 1
      // (Passage.contains walks width + 2 rows for a horizontal leg)
      //
      // Which column, and why the two directions differ. `entrance.x` is the
      // room's own wall column either way (`placePassageDoor` puts a LEFT door at
      // `r.x - 1` and a RIGHT one at `r.x + r.width + 1`), but a
      // `directionalFences` theme's pieces fence one *edge* of their tile, and
      // the band uses a different piece on each side:
      //
      //   RIGHT door -> band is TLeft  -> h_v_8_l, polygon x 0.63..1.13 -> right edge
      //   LEFT  door -> band is TRight -> h_v_8_r, polygon x -0.13..0.38 -> left edge
      //
      // The seal is always `Vertical` -> h_v_8_l, a right-edge fence. That is the
      // band's own line for a RIGHT door and one tile off it for a LEFT one, so
      // the LEFT column has to start a tile earlier to land on the same line.
      // Get it wrong and the barrier stops the sideways step into the room but
      // not the one *up* into the doorway tile and around — the corner piece
      // there (h_crn_r_dn) is a 7x8px nub, not a full edge. [VERIFIED]
      // 2026-08-24 in game, theme h. Solid-tile themes seal from either column,
      // so they keep the doorway column and their art stays put.
      const fenced = getTheme(room.theme)?.directionalFences === true
      const lineX = entrance.dir.name === 'LEFT' && fenced ? entrance.x - 1 : entrance.x
      for (let yOffset = -1; yOffset <= p.width + 2; yOffset++) {
        seals.push(Doodad.create(ctx, lineX, entrance.y + yOffset, 'Vertical', room.theme))
      }
      break
    }
  }

  for (const s of seals) s.needSync = true

  return seals
}

/**
 * The button half: the plate, its reachability claim, and the one-shot trigger
 * that plays the cue, animates the plate and — when `seals` is given —
 * destroys them. Split from the wall above so a dungeon boss floor can take
 * the wall alone (`sealRoomWall`), or the wall plus a button that only counts
 * down toward opening it (`sealRoomWallWithButton`).
 *
 * Returns the button's `AreaTrigger`, the node that fires on the press.
 *
 * Pushes `{ x, y, roomIndex, trigger }` onto `level.lockButtons` in draw
 * order — every lock button a floor places, whether or not it turns out to be
 * enhanced (`mystery/rig.ts` reads the first N of them for that) and however
 * it looks (see `disguise` below).
 */
function buildButtonRig(
  level: Level,
  room: Room,
  ctx: GenerationContext,
  button: { x: number; y: number; roomIndex: number },
  seals?: Doodad[]
): ScriptNode {
  // Enhanced lock buttons' optional disguise (issue's per-floor tickbox):
  // draw the plate with the mystery button's own art and end state instead of
  // the ordinary BossDoorButton/activate pair, so every plate on the floor
  // looks and behaves the same. Zero draws — this is a construction-time
  // art choice, read straight off ctx, exactly like ctx.floorLockButtons is.
  const disguise = ctx.floorLockDisguise
  const doodadType: DoodadTypeName = disguise ? 'TriggerButton' : 'BossDoorButton'
  const state = disguise ? DISGUISE_BUTTON_STATE : SEAL_BUTTON_STATE

  // `need-sync` because a script changes its state below — without it the press
  // would only be seen by the client who stepped on it. [VERIFIED] against
  // campaign/levels/level_1.xml, whose two floor buttons differ on exactly this
  // point: the one with a ChangeDoodadState is True (line 9804), the plain one
  // False (7111). It is NOT part of the barrier — the asset declares no
  // collision element at all — so anything treating `need-sync` as "blocks the
  // player" has to exclude it (see map/sealCheck.ts).
  const plate = Doodad.create(ctx, button.x, button.y, doodadType, room.theme)
  plate.needSync = true

  // A button the party cannot walk to is as fatal as an unreachable key, and
  // the flood fill cannot see the wall (it is doodads, not tiles) — so say so
  // explicitly and let a bad roll be discarded like any other invalid floor.
  // The raw tile, not the node position below: this is a lookup into the map
  // array, not a world-space trigger.
  ctx.reachTargets.push({ x: button.x, y: button.y })

  // Where the rig's nodes go. A doodad's position is its art anchor — the
  // top-left corner, for a flat 16x16 decal like this one — while a
  // RectangleShape's is its **centre** (see timer/hazard.ts), so a 1x1 box that
  // covers the button sits half a tile further on than the art. Hence the
  // doodad's own offset plus 0.5, which is exactly the relationship the shipped
  // campaign's button rigs use: campaign/levels/level_1.xml has a
  // trigger_button_floor at `-20 -25` driven by a w1 h1 RectangleShape at
  // `-19.5 -24.5`. [VERIFIED] 2026-08-24 — the previous code anchored the shape
  // at the raw tile and the box landed diagonally off the button. The
  // hand-edited level6 that swapped in boss_door_button kept the same
  // relationship (doodad `43 28`, shape `43.5 28.5`).
  const art = doodadOffset(doodadType, room.theme)
  const nodeX = button.x + art.x + 0.5
  const nodeY = button.y + art.y + 0.5

  const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
  const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
  trigger.triggerTimes = 1 // one shot: the wall is gone, there is nothing to re-fire
  trigger.connectToShape(shape)

  const sound = new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND)
  trigger.connectTo(sound)

  // Only when this button opens the wall by itself. The node order — sound,
  // destroy, announce, press — is what a lock-only floor has always emitted,
  // so the two opener nodes sit in the middle rather than moving to the end.
  if (seals !== undefined) {
    // purely cosmetic placement — put the node on the wall it destroys
    const mid = seals[Math.trunc(seals.length / 2)]
    const destroy = new NodeDestroyObject(ctx, mid.x, mid.y)
    for (const s of seals) destroy.connectDoodad(s)
    const announce = new NodeAnnounceText(ctx, nodeX, nodeY)
    announce.setText(SEAL_TEXT)
    announce.time = SEAL_ANNOUNCE_MS
    announce.textType = SEAL_ANNOUNCE_TYPE
    trigger.connectTo(destroy)
    trigger.connectTo(announce)
  }

  const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, state)
  press.setTarget(plate)
  trigger.connectTo(press)

  level.lockButtons.push({ x: button.x, y: button.y, roomIndex: button.roomIndex, trigger })

  return trigger
}

/**
 * Where the button hides: a random spot in a random room, drawn exactly the way
 * `Room.spawnKey()` draws a key's — the same room roll the key loops in level.ts
 * run, and the same `fRand(x, x + width)` / `fRand(y + 2, y + height)` pair.
 *
 * Locked rooms are refused, which is the rule that keeps the button out of the
 * seal it opens (the caller marks that room locked first) and out of any
 * chance-rolled gold-door room. Null means the floor has nowhere to put it.
 */
function pickButtonTile(
  ctx: GenerationContext,
  rooms: Room[],
  taken: ReadonlyArray<{ x: number; y: number }> = []
): { x: number; y: number; roomIndex: number } | null {
  for (let attempt = 0; attempt < MAX_BUTTON_ATTEMPTS; attempt++) {
    // Captured alongside the room it draws — no extra draw, just remembering
    // which index this iRand already picked, for Level.lockButtons.
    const roomIndex = ctx.rand.iRand(0, rooms.length)
    const r = rooms[roomIndex]
    if (r.locked) continue
    const tile = {
      x: ctx.rand.fRand(r.x, r.x + r.width),
      y: ctx.rand.fRand(r.y + 2, r.y + r.height),
      roomIndex
    }
    // Two plates overlapping would be one press for two buttons. The rule
    // cannot fire for the first button, so a one-button floor draws exactly
    // what it always drew.
    if (taken.some((t) => Math.abs(t.x - tile.x) < MIN_BUTTON_SPACING && Math.abs(t.y - tile.y) < MIN_BUTTON_SPACING)) continue
    return tile
  }
  return null
}

/** `count` button tiles, drawn one after another; null if any cannot be placed. */
function pickButtonTiles(
  ctx: GenerationContext,
  rooms: Room[],
  count: number
): Array<{ x: number; y: number; roomIndex: number }> | null {
  const tiles: Array<{ x: number; y: number; roomIndex: number }> = []
  for (let i = 0; i < count; i++) {
    const tile = pickButtonTile(ctx, rooms, tiles)
    if (tile === null) return null
    tiles.push(tile)
  }
  return tiles
}
