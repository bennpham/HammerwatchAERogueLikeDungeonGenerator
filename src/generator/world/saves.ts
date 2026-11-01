/**
 * The start's save plate: the stock floor checkpoint
 * (`doodads/generic/button_save.unit`), one per world, beside the arrival by
 * the portal, so a party on a big island can save before setting out.
 *
 * The plate does all the work itself. Its `SavePoint` behaviour
 * (`scripts/Behaviors/Objects/SavePoint.as`) fires when a player steps on it:
 * it lights the plate, sets the respawn StartID to its own `SpawnId` and saves
 * the game. So the plate needs only that `SpawnId`, written as a behaviour
 * parameter as stock writes it (castle_hammerwatch level_1), and a
 * `LevelStart` answering to it on the same spot.
 *
 * Draws nothing: its spot is fixed relative to the portal, clear of the
 * camp's props and the village's square.
 */

import type { GenerationContext } from '../core/context'
import { Doodad } from '../objects/doodad'
import { NodeLevelStart } from '../objects/nodes'
import type { Tile } from './grid'
import { WorldGrid } from './grid'

export const SAVE_PLATE = 'doodads/generic/button_save.unit'
/** Where the plate lies, in tiles from the portal: beside the arrival, three tiles south. */
const SAVE_AT: Tile = { x: -3, y: 3 }

/** The StartID the save plate of the level `stem` respawns at. */
export function saveSpawnId(stem: string): string {
  return `${stem}_save`
}

/** The save plate by the portal at `hub`. Returns its tile. */
export function placeStartSave(ctx: GenerationContext, grid: WorldGrid, hub: Tile): Tile {
  const at = { x: hub.x + SAVE_AT.x, y: hub.y + SAVE_AT.y }
  const id = saveSpawnId(ctx.currentStem)
  const plate = Doodad.prop(ctx, at.x + 0.5, at.y + 0.5, SAVE_PLATE)
  plate.behavior = { SpawnId: { kind: 'string', value: id } }
  new NodeLevelStart(ctx, at.x + 0.5, at.y + 0.5, id)
  grid.markDisc(at, 1, WorldGrid.RESERVED)
  return at
}
