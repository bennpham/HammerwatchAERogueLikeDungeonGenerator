/**
 * Can the player reach the orb without pressing the button?
 *
 * The suite's other seal checks are a *proxy* — "the tile past the barrier's end
 * is a wall" — and four separate gating bugs have now been fixed against it, two
 * of which it could not see at all. This walks the floor instead: flood fill
 * from the entrance with the seal modelled as solid, and report whether the orb
 * / boss portal is reached. That is the product requirement.
 *
 * `map/reachability.ts` cannot answer it. `exitReachable` deliberately fills
 * *through* the seal, because the seal is doodads rather than tiles and what it
 * needs to prove is that the button is reachable.
 */
import { doodadOffset } from '../src/generator/objects/doodad'
import type { DoodadTypeName } from '../src/generator/objects/doodad'
import type { LevelPreview } from '../src/generator'

/** Which tile boundary a piece closes, read off its collision polygon. */
type Block =
  /** the whole tile is impassable */
  | 'tile'
  /** the boundary between this tile and its left / upper neighbour */
  | 'left'
  | 'up'
  /** the boundary between this tile and its right / lower neighbour */
  | 'right'
  | 'down'
  /** carries a collider, but not one that stops anybody */
  | 'none'

interface PieceDef {
  type: DoodadTypeName
  block: Block
}

/**
 * Theme h's wall band, read out of
 * `<install>/editor/assetsExtract/doodads/theme_h/`, in the tile space the
 * emitter lands each piece in.
 *
 * Tiles are the wrong model for this theme, and that is the point: its pieces
 * fence one *edge* each, so the player legitimately stands inside a wall tile
 * and a tile-based fill cannot see a barrier that fences the wrong side of its
 * own tile.
 *
 * `h_crn_*_dn` blocking nothing is not an omission — both are ~7x8px nubs in one
 * corner of their tile (`h_crn_r_dn` is `(0,3)(-5,0)(1,-5)(2,0)`), and that hole
 * is exactly what the LEFT-seal walk-around went through.
 */
const THEME_H: Record<string, PieceDef> = {
  h_v_8_l: { type: 'Vertical', block: 'right' }, //     x 10..18 of its own tile
  h_v_8_r: { type: 'TRight', block: 'left' }, //        x -2..6
  h_h_8_dn: { type: 'Horizontal', block: 'up' }, //     y -2..6
  h_h_8_up: { type: 'TUp', block: 'tile' }, //          x 0..16, y 13..32 at yOffset -1
  h_crn_r_up: { type: 'CornerRU', block: 'left' }, //   x -2..6, y 16..32 at yOffset -1
  h_crn_l_up: { type: 'CornerLU', block: 'right' }, //  x 10..18, y 16..32 at yOffset -1
  h_crn_r_dn: { type: 'CornerRD', block: 'none' }, //   a nub in the top-left corner
  h_crn_l_dn: { type: 'CornerLD', block: 'none' }, //   a nub in the top-right corner
  h_h_cap_up_l: { type: 'HCapLeft', block: 'tile' }, // x 6..16, y 6..32 at yOffset -1
  h_h_cap_up_r: { type: 'HCapRight', block: 'tile' } // x 0..14, y 4..32 at yOffset -1
}

interface Doodad {
  /** the asset's basename, e.g. `h_v_8_l` */
  name: string
  x: number
  y: number
  sync: boolean
}

function doodadsIn(xml: string): Doodad[] {
  return [
    ...xml.matchAll(
      /<string name="type">doodads\/([^<]+)\.xml<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<bool name="need-sync">(True|False)<\/bool>/g
    )
  ].map((m) => ({
    name: m[1].replace(/^.*\//, ''),
    x: parseFloat(m[2]),
    y: parseFloat(m[3]),
    sync: m[4] === 'True'
  }))
}

/** The seal is only ever built from these two, on every theme. */
function sealPiece(name: string): DoodadTypeName {
  return /_v_8|_v\b/.test(name) || name.endsWith('_v_8_l') ? 'Vertical' : 'Horizontal'
}

/** The player's movement graph: solid tiles, plus boundaries that cannot be crossed. */
export class Passability {
  private readonly solid: Uint8Array
  /** `blocked[dir][idx]` — 0 left, 1 right, 2 up, 3 down */
  private readonly blocked: Uint8Array[]

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.solid = new Uint8Array(width * height)
    this.blocked = [0, 1, 2, 3].map(() => new Uint8Array(width * height))
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

  /** Close one boundary from both sides, so no fill can cross it either way. */
  private close(x: number, y: number, dir: number, ox: number, oy: number, back: number): void {
    if (this.inside(x, y)) this.blocked[dir][x + y * this.width] = 1
    if (this.inside(x + ox, y + oy)) this.blocked[back][x + ox + (y + oy) * this.width] = 1
  }

  apply(x: number, y: number, block: Block): void {
    switch (block) {
      case 'tile':
        this.setSolid(x, y)
        break
      case 'left':
        this.close(x, y, 0, -1, 0, 1)
        break
      case 'right':
        this.close(x, y, 1, 1, 0, 0)
        break
      case 'up':
        this.close(x, y, 2, 0, -1, 3)
        break
      case 'down':
        this.close(x, y, 3, 0, 1, 2)
        break
      case 'none':
        break
    }
  }

  canLeave(x: number, y: number, dir: number): boolean {
    return this.blocked[dir][x + y * this.width] === 0
  }
}

/**
 * Build the floor's movement graph with the seal treated as intact.
 *
 * Solid-tile themes get the plain reading — a wall tile stops you — and
 * deliberately no `OVERHANG_ROWS`: over-stating where the player can walk is the
 * safe direction for a leak probe, since it can only ever find *more* routes
 * than really exist. A fence theme is read off its doodads instead.
 */
export function passabilityOf(level: LevelPreview, xml: string): Passability {
  const { mapWidth: w, mapHeight: h } = level
  const pass = new Passability(w, h)
  const doodads = doodadsIn(xml)

  if (level.theme === 'h') {
    for (const d of doodads) {
      const piece = THEME_H[d.name]
      if (piece === undefined) continue // decoration, stairs, buttons — no band collider
      const off = doodadOffset(piece.type, level.theme)
      pass.apply(Math.round(d.x - off.x), Math.round(d.y - off.y), piece.block)
    }
    return pass
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (level.walls[x + y * w] === '1') pass.setSolid(x, y)
    }
  }
  // The seal stands on corridor floor, so it has to be added by hand. The button
  // is `need-sync` too — for its *state*, not a collider it does not have — so
  // it is skipped: counting it would both invent an obstacle and, since
  // `sealPiece` would read it as a `Horizontal`, undo a `yOffset` never applied
  // and land that obstacle on the wrong tile.
  for (const d of doodads) {
    // ...and so is a mystery button's plate (issue #67), for the same reason.
    if (!d.sync || d.name === 'boss_door_button' || d.name === 'trigger_button_floor') continue
    const off = doodadOffset(sealPiece(d.name), level.theme)
    pass.setSolid(Math.round(d.x - off.x), Math.round(d.y - off.y))
  }
  return pass
}

/** Tiles reachable from `start`, honouring both solidity and fenced boundaries. */
function fill(pass: Passability, start: { x: number; y: number }): Uint8Array {
  const { width, height } = pass
  const seen = new Uint8Array(width * height)
  if (pass.isSolid(start.x, start.y)) return seen
  const stack = [start.x + start.y * width]
  seen[stack[0]] = 1
  const steps = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ]
  for (let guard = 0; stack.length > 0 && guard < width * height; guard++) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = Math.trunc(idx / width)
    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = steps[dir]
      const nx = x + dx
      const ny = y + dy
      if (!pass.inside(nx, ny) || pass.isSolid(nx, ny)) continue
      if (!pass.canLeave(x, y, dir)) continue
      const nIdx = nx + ny * width
      if (seen[nIdx]) continue
      seen[nIdx] = 1
      stack.push(nIdx)
    }
  }
  return seen
}

/** A tile at or beside `(x, y)` the player could stand on, or null. */
function standing(pass: Passability, x: number, y: number): { x: number; y: number } | null {
  const tx = Math.trunc(x)
  const ty = Math.trunc(y)
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

/**
 * Walk from the entrance to the orb with the seal intact.
 *
 * `reachable: true` is a leak — the party reaches the orb without the button.
 */
export function orbReachableWithoutButton(level: LevelPreview, xml: string): SealProbe {
  const doodads = doodadsIn(xml)
  const doors = [
    ...xml.matchAll(
      /<string name="type">items\/door_[a-z]+_([a-z]+)_(h_v2|v)\.xml<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
    )
  ].map((m) => ({ vertical: m[2] === 'v', x: parseFloat(m[3]), y: parseFloat(m[4]) }))

  if (!doodads.some((d) => d.sync) && doors.length === 0) {
    return { reachable: null, why: 'nothing gates this floor' }
  }

  const pass = passabilityOf(level, xml)

  // A door is a solid one-tile-wide collider standing on corridor floor; the two
  // variants differ only in how far up they reach — `_h_v2` is y -16..0 px, `_v`
  // is y -32..+8. Every door closes, not just the orb's: a route that crosses
  // any door is a gated route, which is the question being asked.
  for (const d of doors) {
    const x = Math.trunc(d.x)
    for (let up = 0; up < (d.vertical ? 3 : 2); up++) pass.setSolid(x, d.y - up)
  }

  const start =
    /<string name="type">LevelStart<\/string>[\s\S]*?<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/.exec(
      xml
    )
  if (start === null) return { reachable: null, why: 'no LevelStart' }

  const portal = doodads.find((d) => d.name === 'exit_teleport_boss')
  const orb =
    /<string name="type">items\/crystal_[a-z]+\.xml<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/.exec(
      xml
    )
  const target =
    portal !== undefined
      ? { x: portal.x, y: portal.y }
      : orb !== null
        ? { x: parseFloat(orb[1]), y: parseFloat(orb[2]) }
        : null
  if (target === null) return { reachable: null, why: 'no orb or portal' }

  const from = standing(pass, parseFloat(start[1]), parseFloat(start[2]))
  const to = standing(pass, target.x, target.y)
  if (from === null) return { reachable: null, why: 'entrance is solid' }
  if (to === null) return { reachable: null, why: 'orb is solid' }

  const seen = fill(pass, from)
  return { reachable: seen[to.x + to.y * pass.width] === 1 }
}
