import type { AeLevel } from '../ae/model'
import { TILE } from '../ae/model'
import type { GenerationContext } from '../core/context'
import type { WallGrid } from '../map/aeWalls'

/**
 * Wall torches, hung the way stock AE levels hang them [VERIFIED Castle
 * levels 1, 2, 4, 6: scripts/dev/torch-survey.ts]:
 *
 * - `doodads/generic/lamps/torch.unit` in its default scene `n` (every stock
 *   torch but the `n-off` ones): a torch on a room's NORTH wall, its light
 *   falling south into the room;
 * - 16 px below the horizontal wall piece's anchor, i.e. at the top edge of
 *   the floor row under the wall, in the wall cell's column (here its middle,
 *   Castle's commonest x offset after 0).
 *
 * Castle's first level hangs 69. Here every horizontal run of north wall
 * (solid cell, floor below, wall either side) gets torches at a fixed spacing,
 * centred on the run, never on a corner or next to anything already on
 * the wall. No RNG: the same grid always gets the same torches, and with
 * torches off nothing is placed and no id is taken. Torches take their ids
 * after the walls, so every object and wall keeps its id.
 */

export type TorchDensity = 'none' | 'sparse' | 'normal' | 'dense'

export const TORCH_DENSITIES: readonly TorchDensity[] = ['none', 'sparse', 'normal', 'dense']

export const TORCH_LABELS: Readonly<Record<TorchDensity, string>> = {
  none: 'None',
  sparse: 'Sparse',
  normal: 'Normal',
  dense: 'Dense'
}

/** Cells between torches along a wall. */
export const TORCH_SPACING: Readonly<Record<TorchDensity, number>> = { none: 0, sparse: 16, normal: 7, dense: 4 }

export const TORCH_UNIT = 'doodads/generic/lamps/torch.unit'

export function isTorchDensity(value: string): value is TorchDensity {
  return (TORCH_DENSITIES as readonly string[]).includes(value)
}

/** A north-wall cell a torch can hang on: wall here and to each side, floor below. */
function mountable(g: WallGrid, x: number, y: number): boolean {
  return (
    g.solid(x, y) &&
    g.solid(x - 1, y) &&
    g.solid(x + 1, y) &&
    !g.solid(x, y + 1) &&
    !g.solid(x - 1, y + 1) &&
    !g.solid(x + 1, y + 1) &&
    !g.reserved(x, y)
  )
}

/**
 * The wall cells (grid coordinates) that get a torch. `blocked` marks cells
 * something else already uses (an exit, a door, a trap shooter, a seal); a
 * torch keeps one cell clear of them on either side.
 */
export function torchCells(g: WallGrid, spacing: number, blocked: (x: number, y: number) => boolean): Array<[number, number]> {
  if (spacing <= 0) return []
  const near = (x: number, y: number): boolean => {
    for (let dx = -2; dx <= 2; dx++) {
      if (g.reserved(x + dx, y)) return true
      for (let dy = 0; dy <= 1; dy++) if (blocked(x + dx, y + dy)) return true
    }
    return false
  }
  const out: Array<[number, number]> = []
  for (let y = 0; y < g.height - 1; y++) {
    let x = 0
    while (x < g.width) {
      if (!mountable(g, x, y)) {
        x++
        continue
      }
      let end = x
      while (end + 1 < g.width && mountable(g, end + 1, y)) end++
      // `mountable` already keeps off the corners (floor below both neighbours)
      const first = x
      const length = end - first + 1
      if (length >= 1) {
        const count = Math.floor((length - 1) / spacing) + 1
        const start = first + Math.floor((length - 1 - (count - 1) * spacing) / 2)
        for (let k = 0; k < count; k++) {
          const cx = start + k * spacing
          if (!near(cx, y)) out.push([cx, y])
        }
      }
      x = end + 1
    }
  }
  return out
}

/**
 * Hang the floor's torches. Call after the walls, so torches take the last
 * ids. `originX/Y` maps grid cells back to the level's tile space, as for the
 * walls (an arena's grid is shifted).
 */
export function emitTorches(
  level: AeLevel,
  ctx: GenerationContext,
  grid: WallGrid,
  density: TorchDensity,
  originX = 0,
  originY = 0
): number {
  const spacing = TORCH_SPACING[density]
  if (spacing <= 0) return 0
  // cells the level's own doodads stand on (exits, doors, seals, shooters…)
  const used = new Set<string>()
  for (const d of ctx.doodads) used.add(`${Math.floor(d.x) + originX},${Math.floor(d.y) + originY}`)
  const cells = torchCells(grid, spacing, (x, y) => used.has(`${x},${y}`))
  for (const [cx, cy] of cells) {
    level.units.push({
      path: TORCH_UNIT,
      x: (cx - originX) * TILE + TILE / 2,
      y: (cy - originY + 1) * TILE,
      id: ctx.idCounter++
    })
  }
  return cells.length
}
