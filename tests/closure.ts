/**
 * Is a room cut out of a bigger level closed?
 *
 * AE takes collision from units alone: tiles block nothing, so an empty
 * stretch of void is as walkable as a floor (level_1 fences its own bridge
 * with invisible `:Physics_Rectangle`s for that reason). This flood-fills a
 * level from its arrival over a quarter-tile grid, every active collider
 * solid, and reports whether the fill reaches the edge of the box the room
 * was cut from (a leak) and whether it reaches the exit (the teleporter's 3×3
 * sensor, as the lobby builder lays it).
 *
 * Collision comes from the install's unit files (scripts/lib/aeunit.mjs):
 * rects as they are, polygons and circles by their bounding box, sensors
 * left out. A collider is never shrunk to the player's body, so a gap too
 * narrow to walk through still counts as open: overstating where the party
 * can go is the safe direction for a leak check.
 *
 * Used by scripts/import-stock-towns.ts (an import fails on a leak) and by
 * tests/stockTown.test.ts.
 */
import type { AeLevel } from '../src/generator/ae/model'
import type { Box } from '../src/generator/lobby/castleBridge'
// @ts-expect-error untyped dev helper shared with scripts/render-level.mjs
import { loadUnit } from '../scripts/lib/aeunit.mjs'

const CELL = 4
/** The builder's exit sensor: 3×3 tiles centred on the teleporter. */
const EXIT_HALF = 24

export interface Closure {
  /** the first cell on the box's edge the fill reached, px, or null when the room is closed */
  leak: { x: number; y: number } | null
  reachesExit: boolean
  /** how many px² the party can reach */
  area: number
  /** whether the party can stand at a px point */
  reaches(x: number, y: number): boolean
}

type Rect = [number, number, number, number]

/** Every active collider in the level, as px rects. */
export function collidersOf(level: AeLevel, assets: string): Rect[] {
  const out: Rect[] = []
  for (const u of level.units) {
    const st = u.state ?? {}
    if (st.hidden?.value === true || st['physics-active']?.value === false || st.active?.value === false) continue
    if (u.path === ':Physics_Rectangle' || u.path === ':Physics_Circle') {
      if (st.sensor?.value === true) continue
      const size = st.size?.kind === 'vec2' ? st.size.value : undefined
      const r = st.radius?.kind === 'float' ? st.radius.value : undefined
      if (size !== undefined) out.push([u.x - size[0] / 2, u.y - size[1] / 2, size[0], size[1]])
      else if (r !== undefined) out.push([u.x - r, u.y - r, 2 * r, 2 * r])
      continue
    }
    if (u.path.startsWith(':')) continue
    const scene = st.start?.kind === 'string' ? st.start.value : undefined
    const def = loadUnit(assets, u.path, scene) as { rects: Rect[] }
    for (const [x, y, w, h] of def.rects) out.push([u.x + x, u.y + y, w, h])
  }
  return out
}

export function closureOf(level: AeLevel, box: Box, assets: string): Closure {
  const w = Math.ceil((box.x1 - box.x0) / CELL)
  const h = Math.ceil((box.y1 - box.y0) / CELL)
  const solid = new Uint8Array(w * h)
  for (const [rx, ry, rw, rh] of collidersOf(level, assets)) {
    // every cell the rect overlaps by more than a hair
    const cx0 = Math.max(0, Math.floor((rx - box.x0) / CELL))
    const cy0 = Math.max(0, Math.floor((ry - box.y0) / CELL))
    const cx1 = Math.min(w, Math.ceil((rx + rw - box.x0) / CELL))
    const cy1 = Math.min(h, Math.ceil((ry + rh - box.y0) / CELL))
    for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) solid[cx + cy * w] = 1
  }

  const spawn = level.scripts.find((s) => s.cls === 'LevelStart' && (s.label === 'lobby:spawn' || !s.params.some((p) => p.name === 'StartID')))
  const portal = level.units.find((u) => u.path.startsWith('doodads/generic/teleport'))
  if (spawn === undefined) throw new Error('closure: no arrival')
  const start = Math.floor((spawn.x - box.x0) / CELL) + Math.floor((spawn.y - box.y0) / CELL) * w
  const seen = new Uint8Array(w * h)
  const queue = [start]
  seen[start] = 1
  let leak: Closure['leak'] = null
  let reachesExit = false
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const cx = i % w
    const cy = Math.trunc(i / w)
    const px = box.x0 + cx * CELL
    const py = box.y0 + cy * CELL
    if (leak === null && (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1)) leak = { x: px, y: py }
    if (portal !== undefined && Math.abs(px + CELL / 2 - portal.x) < EXIT_HALF && Math.abs(py + CELL / 2 - portal.y) < EXIT_HALF) reachesExit = true
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = nx + ny * w
      if (seen[n] === 1 || solid[n] === 1) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  const reaches = (x: number, y: number): boolean => {
    const cx = Math.floor((x - box.x0) / CELL)
    const cy = Math.floor((y - box.y0) / CELL)
    return cx >= 0 && cy >= 0 && cx < w && cy < h && seen[cx + cy * w] === 1
  }
  return { leak, reachesExit, area: queue.length * CELL * CELL, reaches }
}
