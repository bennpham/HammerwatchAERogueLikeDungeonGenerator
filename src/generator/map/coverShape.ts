/**
 * The whole-floor RectangleShape both optional field rigs bind to — timer
 * mode's hazard (timer/hazard.ts) and the buff auras (buffs/field.ts).
 *
 * Shared rather than copied because the geometry is subtle in two ways: a
 * RectangleShape's position is its **centre**, not a corner (see the 3x3
 * BossPortal shape in objects/objectSet.ts), and the rectangle is oversized so
 * it reaches the outermost walkable tile however the map rounds. Getting either
 * wrong leaves a strip of floor outside the field, which is invisible in the
 * preview and only shows up in game.
 */

import type { GenerationContext } from '../core/context'
import { NodeRectangleShape } from '../objects/nodes'

/**
 * Slack added to a covering rectangle on each axis. Cheap: the rectangle is a
 * shape, not geometry, and nothing outside the map can be standing in it.
 */
export const COVER_MARGIN = 2

/**
 * A RectangleShape covering the whole map, catching the entity types in
 * `types` (see BUFF_TARGET_TYPES in config/parameters.ts for the bitmask).
 */
export function coveringShape(
  ctx: GenerationContext,
  mapWidth: number,
  mapHeight: number,
  types: number
): NodeRectangleShape {
  const shape = new NodeRectangleShape(ctx, mapWidth / 2, mapHeight / 2)
  shape.width = mapWidth + COVER_MARGIN
  shape.height = mapHeight + COVER_MARGIN
  shape.types = types
  return shape
}
