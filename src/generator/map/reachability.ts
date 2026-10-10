import { getTheme } from '../config/themes'
import type { Level } from './level'
import type { GenerationContext } from '../core/context'
import type { ObjectSet } from '../objects/objectSet'

/**
 * How many rows below a wall tile its art physically occupies.
 *
 * The lettered wall pieces are three tiles TALL: `f_x_t_dn.xml` (and every
 * other theme's `_x_t_dn` / `_crn_*_dn`) is `<origin>0 32</origin>` on a
 * `16 48` frame with a 40px collision polygon, and doodad.ts emits it at
 * `yOffset: 2`. A wall at tile `T` therefore fills `T`, `T + 1` and most of
 * `T + 2` — the two floor rows under any wall mass are dead space the player
 * cannot stand in. [VERIFIED] in game; the boss arena already compensates for
 * the same fact (see boss/arena.ts's alcove geometry).
 *
 * Nothing in the tilemap records this, which is how a floor could ship with a
 * corridor that looks open in the preview and in `data-t` while being sealed
 * in game: the corridor's only shared row with the room it reaches sat inside
 * the overhang of the wall above it.
 */
export const OVERHANG_ROWS = 2

/**
 * How many rows *this theme's* wall art buries beneath itself.
 *
 * `OVERHANG_ROWS` is the lettered themes' figure. Theme h and every bonus theme
 * anchor their pieces on their own tile and bury nothing (`flatWalls`), so
 * anything placed to clear a doorway's own art — the button seal's DOWN line,
 * `lockRoom`'s DOWN doors — must ask rather than assume. Assuming 2 there puts
 * the barrier two rows past the corridor mouth and, where the corridor is
 * shorter than that, inside the next room where it can be walked around.
 * [VERIFIED] 2026-08-24 in game, theme h.
 *
 * `blockedGrid` below deliberately does NOT use this: it models the overhang on
 * every theme, which is over-conservative on a flat one but only ever rejects a
 * floor that would have been fine. Making it theme-aware would change which
 * floors get re-rolled, and with them every flat-theme seed's layout.
 */
export function overhangRows(theme: string): number {
  return getTheme(theme)?.flatWalls === true ? 0 : OVERHANG_ROWS
}

/**
 * Cells the player can actually stand on: floor that is not buried by the
 * overhang of a wall above it. `1` means blocked, matching floodFill.
 *
 * Rows above the map edge count as open rather than as wall — a floor tile in
 * the top two rows is only reachable if the level put floor there at all, and
 * treating the void beyond the map as a ceiling would reject floors the game
 * plays fine.
 */
export function blockedGrid(level: Level): Uint8Array {
  const { width, height } = level
  const blocked = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dead = level.tileArray[x + y * width].wall
      for (let d = 1; d <= OVERHANG_ROWS && !dead; d++) {
        const above = y - d
        if (above >= 0 && level.tileArray[x + above * width].wall) dead = true
      }
      blocked[x + y * width] = dead ? 1 : 0
    }
  }

  return blocked
}

/** 4-way flood fill from `start`, bounded by the grid's own cell count. */
export function floodFill(
  blocked: Uint8Array,
  width: number,
  height: number,
  start: { x: number; y: number }
): Uint8Array {
  const visited = new Uint8Array(width * height)
  const sx = clamp(Math.round(start.x), 0, width - 1)
  const sy = clamp(Math.round(start.y), 0, height - 1)
  const startIdx = sx + sy * width
  if (blocked[startIdx]) return visited

  const stack: number[] = [startIdx]
  visited[startIdx] = 1
  const maxSteps = width * height // every cell visited at most once

  for (let steps = 0; stack.length > 0 && steps < maxSteps; steps++) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = Math.trunc(idx / width)
    const neighbours: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ]
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nIdx = nx + ny * width
      if (visited[nIdx] || blocked[nIdx]) continue
      visited[nIdx] = 1
      stack.push(nIdx)
    }
  }

  return visited
}

/**
 * A tile the player can stand on at or next to `(x, y)`, or null.
 *
 * Every target below is a script node or an item, and those sit wherever the
 * prefab put them — the exit's trigger shares its row with the stair marker,
 * a key lands on a fractional coordinate. Accepting a neighbour keeps the
 * check about "can the player get here" rather than about one exact tile.
 */
function standingTile(blocked: Uint8Array, width: number, height: number, x: number, y: number): number | null {
  const tx = Math.trunc(x)
  const ty = Math.trunc(y)
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = tx + dx
    const ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    const idx = nx + ny * width
    if (!blocked[idx]) return idx
  }
  return null
}

/** The prefab's own coordinates for the tile the player uses it from. */
function prefabTarget(s: ObjectSet): { x: number; y: number } {
  switch (s.type) {
    // both stair prefabs sit at `room.y - 2`, so the wall band is `y + 1` and
    // its overhang buries `y + 2` and `y + 3`. `y + 4` is the marker row, the
    // first row the player can stand on, and where the exit trigger lives.
    case 'ExitUp':
    case 'ExitDn':
      return { x: s.x + 3, y: s.y + 4 }
    // the orb and the portal that replaces it are placed on their own tile
    default:
      return { x: s.x, y: s.y }
  }
}

/**
 * Can the player walk from the entrance stairs to everything the floor needs
 * them to touch — the exit (or the orb / boss portal), and every key?
 *
 * Draws no random values, so calling it costs the RNG stream nothing and a
 * rejected floor re-rolls exactly as a floor that failed any other validity
 * rule does.
 */
export function exitReachable(level: Level, ctx: GenerationContext): boolean {
  const { width, height } = level
  const sets = ctx.objectSets
  const reach = entranceReach(level, ctx)
  if (reach === null) return false
  const { blocked, visited } = reach

  const targets: Array<{ x: number; y: number }> = []
  for (const s of sets) {
    if (s.type === 'ExitDn' || s.type === 'Orb' || s.type === 'BossPortal') targets.push(prefabTarget(s))
  }
  // A key the player cannot reach locks them out of the door it opens just as
  // surely as an unreachable exit does.
  for (const item of ctx.items) {
    if (item.type === 'Key') targets.push({ x: item.x, y: item.y })
  }
  // Whatever else this floor decided the player has to touch — the final
  // floor's orb button, and nothing else today. The seal it opens is doodads,
  // not tiles, so the fill above walks straight through it: what this asserts
  // is that the button is standable and connected, which together with the
  // rig's own geometry (the button sits on the corridor side of the seal) is
  // what makes the orb reachable in game.
  for (const t of ctx.reachTargets) targets.push(t)

  if (targets.length === 0) return false

  for (const t of targets) {
    const idx = standingTile(blocked, width, height, t.x, t.y)
    if (idx === null || !visited[idx]) return false
  }

  return true
}

/**
 * Every tile the player can walk to from the entrance stairs, overhang
 * modelled — the flood `exitReachable` runs, exposed for the post-acceptance
 * rigs that must only place things the party can get to (`mystery/`). Null
 * when the floor has no entrance or its entrance is not standable. Draws
 * nothing.
 *
 * Doors and seals are items and doodads, not tiles, so the fill walks through
 * them: a caller that must avoid a locked vault or the sealed exit room has to
 * exclude those rooms itself.
 */
export function entranceReach(
  level: Level,
  ctx: GenerationContext
): { blocked: Uint8Array; visited: Uint8Array } | null {
  const { width, height } = level
  const entrance = ctx.objectSets.find((s) => s.type === 'ExitUp')
  if (entrance === undefined) return null

  const blocked = blockedGrid(level)
  const from = prefabTarget(entrance)
  const start = standingTile(blocked, width, height, from.x, from.y)
  if (start === null) return null

  return { blocked, visited: floodFill(blocked, width, height, { x: start % width, y: Math.trunc(start / width) }) }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
