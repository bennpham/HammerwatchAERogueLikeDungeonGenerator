import type { AeLevel, AeScript, AeUnit, StateValue } from './model'
import { TILE } from './model'
import type { GenerationContext } from '../core/context'
import { placeWalls } from '../map/aeWalls'
import type { WallGrid } from '../map/aeWalls'
import { placeCover } from '../map/aeCover'
import type { CoverRect } from '../map/aeCover'
import { stairArtRect } from '../objects/doodad'
import type { ThemeDef } from '../config/themes'
import { AE_UNIT_SET } from '../catalog/assets'

/**
 * Move everything a level build registered on the context — doodads, items,
 * monsters, sensors, scripts — into an `AeLevel`, keeping every id: scripts
 * reference units and each other by the ids they were created with.
 *
 * Generator coordinates are tiles; AE wants pixels.
 */
export function emitObjects(level: AeLevel, ctx: GenerationContext): void {
  const unit = (path: string, x: number, y: number, id: number, state?: Record<string, StateValue>): AeUnit => {
    const u: AeUnit = { path, x: px(x), y: px(y), id }
    if (state !== undefined) u.state = state
    return u
  }
  for (const d of ctx.doodads) level.units.push(unit(d.path, d.x, d.y, d.id, d.state))
  for (const i of ctx.items) level.units.push(unit(i.path, i.x, i.y, i.id))
  for (const m of ctx.monsters) level.units.push(unit(m.path, m.x, m.y, m.id))
  for (const s of ctx.sensors) {
    const flags: Record<string, StateValue> = {
      active: { kind: 'bool', value: true },
      'jam-through': { kind: 'bool', value: true },
      sensor: { kind: 'bool', value: true },
      'shot-through': { kind: 'bool', value: true },
      'aim-through': { kind: 'bool', value: true }
    }
    if (s.radius !== undefined) {
      level.units.push(unit(':Physics_Circle', s.x, s.y, s.id, { ...flags, radius: { kind: 'float', value: px(s.radius) } }))
    } else {
      level.units.push(
        unit(':Physics_Rectangle', s.x, s.y, s.id, { ...flags, size: { kind: 'vec2', value: [px(s.width), px(s.height)] } })
      )
    }
  }
  for (const u of ctx.extraUnits) level.units.push(unit(u.path, u.x, u.y, ctx.idCounter++))
  for (const n of ctx.scriptNodes) {
    const s: AeScript = {
      cls: n.cls,
      id: n.id,
      x: px(n.x),
      y: px(n.y),
      enabled: n.enabled,
      triggerTimes: n.triggerTimes,
      executeOnStart: n.executeOnStart,
      params: n.params(),
      connections: n.connections.map((c) => [c.node.id, c.delayMs])
    }
    if (n.label !== undefined) s.label = n.label
    level.scripts.push(s)
  }
}

/**
 * Add the theme's wall pieces for `grid`, with ids continuing from
 * `ctx.idCounter` (nothing references a wall by id). Returns the piece names
 * the set could not supply, so the caller can treat a hole as a failure.
 */
export function emitWalls(
  level: AeLevel,
  ctx: GenerationContext,
  grid: WallGrid,
  theme: ThemeDef,
  originX = 0,
  originY = 0
): string[] {
  const missing: string[] = []
  for (const w of placeWalls(grid, theme, (p) => AE_UNIT_SET.has(p), (piece, x, y) => missing.push(`${piece}@${x},${y}`))) {
    // `origin` maps grid cells back to the level's own tile space (the arena
    // indexes a non-negative grid but places its alcove at negative tiles)
    level.units.push({ path: w.path, x: w.x - originX * TILE, y: w.y - originY * TILE, id: ctx.idCounter++ })
  }
  return missing
}

/**
 * Add the wall set's `__color_N` cover over the solid mass and past the map
 * (`map/aeCover.ts`), leaving every stair's art clear. Call it right after
 * `emitWalls` and before optional layers (torches): it is always on, so its
 * ids must not move when an optional layer is switched off. Nothing
 * references a cover unit.
 */
export function emitCover(
  level: AeLevel,
  ctx: GenerationContext,
  grid: WallGrid,
  theme: ThemeDef,
  originX = 0,
  originY = 0
): void {
  const exclude: CoverRect[] = []
  for (const d of ctx.doodads) {
    const r = stairArtRect(d)
    // stairs are placed in level space; the cover works in grid space
    if (r !== null) exclude.push({ ...r, x: r.x + originX * TILE, y: r.y + originY * TILE })
  }
  for (const c of placeCover(grid, theme.walls, (p) => AE_UNIT_SET.has(p), { exclude })) {
    level.units.push({ path: c.path, x: c.x - originX * TILE, y: c.y - originY * TILE, id: ctx.idCounter++ })
  }
}

function px(tiles: number): number {
  // three decimals is all AE writes; rounding here keeps the output stable
  return Math.round(tiles * TILE * 1000) / 1000
}
