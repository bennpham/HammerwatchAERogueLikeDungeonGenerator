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
 * Collision comes from the level's `:Physics_*` shapes and the install's unit
 * files (scripts/lib/aeunit.mjs), each shape as it is: rects, circles as
 * discs, polygons (`:Physics_Freeform` and a unit's `<polygon>`) by non-zero
 * winding plus every cell an edge crosses (map/polygonCells.ts), so a polygon
 * that crosses itself doesn't open a hole. Sensors block nothing. A collider
 * is never shrunk to the player's body, so a gap too narrow to walk through
 * still counts as open: overstating where the party can go is the safe
 * direction for a leak check.
 *
 * Used by scripts/import-stock-towns.ts (an import fails on a leak) and by
 * tests/stockTown.test.ts.
 */
import type { AeLevel, AeUnit, StateValue } from '../src/generator/ae/model'
import type { Box } from '../src/generator/lobby/castleBridge'
import { polygonCells } from '../src/generator/map/polygonCells'
import type { CellGrid, Point } from '../src/generator/map/polygonCells'
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
  /** whether the party can stand anywhere in a px box */
  reachesBox(b: Box): boolean
}

type Rect = [number, number, number, number]

interface UnitShapes {
  rects: Rect[]
  polygons: Point[][]
  circles: Array<[number, number, number]>
}

/** Whether a unit collides at all as placed: hidden, switched-off and sensor shapes don't. */
function active(st: Record<string, StateValue>): boolean {
  return st.hidden?.value !== true && st['physics-active']?.value !== false && st.active?.value !== false
}

/** A unit's solid shapes, unit-relative. */
function shapesOf(u: AeUnit, assets: string): UnitShapes {
  const st = u.state ?? {}
  const none: UnitShapes = { rects: [], polygons: [], circles: [] }
  if (u.path.startsWith(':')) {
    if (st.sensor?.value === true) return none
    if (u.path === ':Physics_Rectangle' && st.size?.kind === 'vec2') {
      const [w, h] = st.size.value
      return { ...none, rects: [[-w / 2, -h / 2, w, h]] }
    }
    if (u.path === ':Physics_Circle' && st.radius?.kind === 'float') return { ...none, circles: [[0, 0, st.radius.value]] }
    if (u.path === ':Physics_Freeform' && st.points?.kind === 'vec2s') return { ...none, polygons: [st.points.value] }
    return none
  }
  const scene = st.start?.kind === 'string' ? st.start.value : undefined
  return (loadUnit(assets, u.path, scene) as { shapes: UnitShapes }).shapes
}

/** Every active collider in the level as a px rect, polygons and circles by their bounding box: for showing what covers a spot. */
export function collidersOf(level: AeLevel, assets: string): Rect[] {
  const out: Rect[] = []
  for (const u of level.units) {
    if (!active(u.state ?? {})) continue
    const s = shapesOf(u, assets)
    for (const [x, y, w, h] of s.rects) out.push([u.x + x, u.y + y, w, h])
    for (const [x, y, r] of s.circles) out.push([u.x + x - r, u.y + y - r, 2 * r, 2 * r])
    for (const pts of s.polygons) {
      const xs = pts.map(([x]) => x)
      const ys = pts.map(([, y]) => y)
      out.push([u.x + Math.min(...xs), u.y + Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
    }
  }
  return out
}

/** Mark every grid cell an active collider blocks. */
export function solidCells(level: AeLevel, assets: string, g: CellGrid): Uint8Array {
  const solid = new Uint8Array(g.w * g.h)
  const mark = (i: number): void => {
    solid[i] = 1
  }
  for (const u of level.units) {
    if (!active(u.state ?? {})) continue
    const s = shapesOf(u, assets)
    for (const [rx, ry, rw, rh] of s.rects) {
      // every cell the rect overlaps by more than a hair
      const cx0 = Math.max(0, Math.floor((u.x + rx - g.x0) / g.cell))
      const cy0 = Math.max(0, Math.floor((u.y + ry - g.y0) / g.cell))
      const cx1 = Math.min(g.w, Math.ceil((u.x + rx + rw - g.x0) / g.cell))
      const cy1 = Math.min(g.h, Math.ceil((u.y + ry + rh - g.y0) / g.cell))
      for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) mark(cx + cy * g.w)
    }
    for (const [ox, oy, r] of s.circles) {
      // a disc, as a 32-sided polygon
      const n = 8
      const pts: Point[] = []
      for (let k = 0; k < 4 * n; k++) pts.push([u.x + ox + r * Math.cos((k * Math.PI) / (2 * n)), u.y + oy + r * Math.sin((k * Math.PI) / (2 * n))])
      polygonCells(pts, g, mark)
    }
    for (const pts of s.polygons) {
      polygonCells(
        pts.map(([x, y]) => [u.x + x, u.y + y] as const),
        g,
        mark
      )
    }
  }
  return solid
}

export function closureOf(level: AeLevel, box: Box, assets: string): Closure {
  const w = Math.ceil((box.x1 - box.x0) / CELL)
  const h = Math.ceil((box.y1 - box.y0) / CELL)
  const solid = solidCells(level, assets, { x0: box.x0, y0: box.y0, cell: CELL, w, h })

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
  const reachesBox = (b: Box): boolean => {
    for (let y = b.y0; y < b.y1; y += CELL) for (let x = b.x0; x < b.x1; x += CELL) if (reaches(x, y)) return true
    return false
  }
  return { leak, reachesExit, area: queue.length * CELL * CELL, reaches, reachesBox }
}
