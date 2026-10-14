/**
 * Can the player reach the orb without pressing the button?
 *
 * The suite's other seal checks are a *proxy* — "the tile past the barrier's end
 * is a wall". This walks the floor instead: flood fill from the entrance with
 * the seal modelled as solid, and report whether the orb / boss portal is
 * reached. That is the product requirement.
 *
 * `map/reachability.ts` cannot answer it. `exitReachable` deliberately fills
 * *through* the seal, because the seal is units rather than tiles and what it
 * needs to prove is that the button is reachable.
 *
 * Everything here is read back from the emitted `.lvl`, independently of the
 * generator's own seal check (`map/sealCheck.ts`), so a floor the generator
 * believes is sealed but writes out wrong still gets caught.
 */
import type { LevelPreview } from '../src/generator'
import type { AeLevel, AeUnit } from '../src/generator/ae/model'

/** What the probe reads of a level: its units and scripts. */
type LevelData = Pick<AeLevel, 'units' | 'scripts'>

const TILE = 16

/**
 * The cells an AE wall unit stands on, from how `map/aeWalls.ts` lays them out
 * [VERIFIED against stock levels]: the anchor is the cell's top-left corner,
 * vertical pieces anchor one row up, and the 32-px pieces span two cells.
 */
export function wallCells(u: AeUnit): Array<[number, number]> {
  const piece = /\/([a-z0-9_]+)\.unit$/.exec(u.path)?.[1] ?? ''
  const x = Math.round(u.x / TILE)
  const y = Math.round(u.y / TILE)
  // the flat bonus sets: each piece covers its anchor cell, or the cell above
  // it (`0 -16 16 16`), and `v` the two above-and-at
  if (/^doodads\/walls\/bonus\d\//.test(u.path)) {
    if (piece === 'h') return [[x, y], [x + 1, y]]
    if (piece === 'v') return [[x, y - 1], [x, y]]
    if (/^(v_16|x_x|x_t_(up|l|r)|crn_[lr]_up|v_cap_up)$/.test(piece)) return [[x, y - 1]]
    return [[x, y]]
  }
  if (piece === 'v_16') return [[x, y + 1]]
  if (piece === 'v_32' || piece === 'v') return [[x, y + 1], [x, y + 2]]
  if (piece === 'h_32' || piece === 'h') return [[x, y], [x + 1, y]]
  return [[x, y]]
}

/** The player's movement graph: solid tiles. */
export class Passability {
  private readonly solid: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.solid = new Uint8Array(width * height)
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  setSolid(x: number, y: number): void {
    if (this.inside(x, y)) this.solid[x + y * this.width] = 1
  }

  isSolid(x: number, y: number): boolean {
    return !this.inside(x, y) || this.solid[x + y * this.width] === 1
  }
}

/**
 * Build the floor's movement graph with the seal treated as intact: the wall
 * tiles, plus every wall unit that stands on floor (the seal pieces), plus
 * every door. Deliberately no overhang: over-stating where the player can walk
 * is the safe direction for a leak probe.
 */
export function passabilityOf(preview: LevelPreview, level: LevelData): Passability {
  const { mapWidth: w, mapHeight: h } = preview
  const pass = new Passability(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (preview.walls[x + y * w] === '1') pass.setSolid(x, y)
    }
  }
  for (const u of level.units) {
    if (u.path.startsWith('doodads/walls/')) {
      for (const [x, y] of wallCells(u)) pass.setSolid(x, y)
    } else if (/^doodads\/doors\/door_[hv]_32_bonus\.unit$/.test(u.path)) {
      // a bonus door: a 32-px bar at its anchor, 4 px into the cells it closes
      const x = Math.floor(u.x / TILE)
      const y = Math.floor(u.y / TILE)
      const vertical = u.path.includes('door_v_')
      pass.setSolid(x, y)
      pass.setSolid(vertical ? x : x + 1, vertical ? y + 1 : y)
    } else if (u.path.startsWith('doodads/doors/door_')) {
      // a door is anchored one row below the cell it closes
      pass.setSolid(Math.round(u.x / TILE), Math.round(u.y / TILE) - 1)
    }
  }
  return pass
}

/** Tiles reachable from `start`. */
function fill(pass: Passability, start: { x: number; y: number }): Uint8Array {
  const { width, height } = pass
  const seen = new Uint8Array(width * height)
  if (pass.isSolid(start.x, start.y)) return seen
  const stack = [start.x + start.y * width]
  seen[stack[0]] = 1
  for (let guard = 0; stack.length > 0 && guard < width * height; guard++) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = Math.trunc(idx / width)
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (pass.isSolid(nx, ny)) continue
      const nIdx = nx + ny * width
      if (seen[nIdx]) continue
      seen[nIdx] = 1
      stack.push(nIdx)
    }
  }
  return seen
}

/** A tile at or beside the pixel point `(px, py)` the player could stand on, or null. */
function standing(pass: Passability, px: number, py: number): { x: number; y: number } | null {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    if (!pass.isSolid(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy }
  }
  return null
}

export interface SealProbe {
  /** null when there is no seal, or no entrance/target to walk between */
  reachable: boolean | null
  why?: string
}

const ORB = 'items/pickups/collectable_10_sphere.unit'
const PORTALS = ['doodads/generic/teleport_red.unit', 'doodads/generic/teleport_mt.unit']

/**
 * Walk from the entrance to the orb with the seal intact.
 *
 * `reachable: true` is a leak — the party reaches the orb without the button.
 */
export function orbReachableWithoutButton(preview: LevelPreview, level: LevelData): SealProbe {
  const solidAt = (u: AeUnit) => preview.walls[Math.floor(u.x / TILE) + Math.floor(u.y / TILE) * preview.mapWidth] === '1'
  const seals = level.units.filter((u) => u.path.startsWith('doodads/walls/') && !solidAt(u))
  const doors = level.units.filter((u) => u.path.startsWith('doodads/doors/door_'))
  if (seals.length === 0 && doors.length === 0) return { reachable: null, why: 'nothing gates this floor' }
  return walkToTarget(preview, level)
}

/** Whether the arrival point reaches the orb or portal, gated or not. */
export function walkToTarget(preview: LevelPreview, level: LevelData): SealProbe {
  const pass = passabilityOf(preview, level)

  // the arrival point: the LevelStart this floor's own stem names
  const start = level.scripts.find((s) => s.cls === 'LevelStart')
  if (start === undefined) return { reachable: null, why: 'no LevelStart' }

  const target = level.units.find((u) => u.path === ORB || PORTALS.includes(u.path))
  if (target === undefined) return { reachable: null, why: 'no orb or portal' }

  const from = standing(pass, start.x, start.y)
  const to = standing(pass, target.x, target.y)
  if (from === null) return { reachable: null, why: 'entrance is solid' }
  if (to === null) return { reachable: null, why: 'orb is solid' }

  const seen = fill(pass, from)
  return { reachable: seen[to.x + to.y * pass.width] === 1 }
}
