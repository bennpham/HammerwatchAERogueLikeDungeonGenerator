/**
 * Save plates: the stock floor checkpoint (`doodads/generic/button_save.unit`),
 * spread over a big island so a death doesn't throw the party back to the
 * start.
 *
 * The plate does all the work itself. Its `SavePoint` behaviour
 * (`scripts/Behaviors/Objects/SavePoint.as`) fires when a player steps on it:
 * it lights the plate, puts out the last one used, sets the respawn StartID
 * to its own `SpawnId` and saves the game. So each plate needs only that
 * `SpawnId`, written as a behaviour parameter as stock writes it
 * (castle_hammerwatch level_1), and a `LevelStart` answering to it on the
 * same spot, where the party comes back.
 *
 * Placed last, from the world's encounter stream after the loot, on ground
 * the arrival reaches: they move nothing else.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import { NodeLevelStart } from '../objects/nodes'
import type { WorldDef } from './options'
import type { Tile } from './grid'
import { WorldGrid } from './grid'
import { freeTile } from './place'

export const SAVE_PLATE = 'doodads/generic/button_save.unit'
/** Island area per automatic save plate: a 192-tile island gets one, a 512 ten. */
const TILES_PER_SAVE = 160 * 160
export const WORLD_MAX_SAVE_PLATES = 64
const SAVE_SPACING = 30
const SAVE_FROM_START = 24
const PLACE_TRIES = 400

/** How many save plates `world` gets on a `width`×`height` island: its own count, or one per 160×160 tiles. */
export function worldSavePlates(world: WorldDef, width: number, height: number): number {
  return world.savePlates ?? Math.min(WORLD_MAX_SAVE_PLATES, Math.floor((width * height) / TILES_PER_SAVE))
}

/** The StartID the `index`th save plate of the level `stem` respawns at. */
export function saveSpawnId(stem: string, index: number): string {
  return `${stem}_save_${index + 1}`
}

export function placeSavePlates(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  count: number,
  hub: Tile,
  reached: Uint8Array,
  avoid: readonly Tile[]
): Tile[] {
  const saves: Tile[] = []
  const ok = (t: Tile) => grid.free(t.x, t.y) && reached[t.y * grid.width + t.x] === 1
  for (let i = 0; i < count; i++) {
    const at = freeTile(rand, grid, hub, SAVE_FROM_START, [...saves, ...avoid], SAVE_SPACING, PLACE_TRIES, ok)
    if (at === null) break
    const id = saveSpawnId(ctx.currentStem, saves.length)
    const plate = Doodad.prop(ctx, at.x + 0.5, at.y + 0.5, SAVE_PLATE)
    plate.behavior = { SpawnId: { kind: 'string', value: id } }
    new NodeLevelStart(ctx, at.x + 0.5, at.y + 0.5, id)
    grid.markDisc(at, 1, WorldGrid.RESERVED)
    saves.push(at)
  }
  return saves
}
