/**
 * Buff auras: the optional per-floor buff fields.
 *
 * A floor can wear any number of buffs, each aimed at players, monsters or
 * both. Each one is a DangerArea covering the whole map with `damage: 0`,
 * carrying a `buffs/*.xml` path — the node's damage is not the point, the buff
 * is. Ported from the hand-authored test_buff.xml:
 *
 *   RectangleShape(types, whole map)             // one per distinct target
 *   DangerArea{enabled: True, damage: 0, freq: 100, buff: "buffs/frost.xml"}
 *        -> that shape
 *
 * Unlike timer mode there is **no trigger and no countdown**: the field ships
 * `enabled: True` and is live from the moment the floor loads. That is why this
 * rig is two nodes per buff rather than timer mode's dozens — a buff is a
 * property of the floor, not an event on it.
 *
 * One shape is shared by every buff on the floor aiming at the same target, so
 * three player-facing buffs cost four nodes, not six.
 *
 * Like timer/hazard.ts, waves.ts and invulnerability.ts this module draws **no**
 * random values from any stream and writes no XML directly — the nodes
 * self-register on `ctx.scriptNodes` and Level.getXML() drains them. It runs
 * after the floor is fully built, so every dungeon id is already allocated and
 * the rig only appends ids: a seed's dungeon is untouched whether a floor
 * carries buffs or not.
 */

import type { GenerationContext } from '../core/context'
import type { BuffTarget, FloorBuff } from '../config/parameters'
import { BUFF_REFRESH_MS, BUFF_TARGET_TYPES } from '../config/parameters'
import { COVER_MARGIN, coveringShape } from '../map/coverShape'
import { buffById } from '../objects/buffTypes'
import { NodeDangerArea, NodeRectangleShape } from '../objects/nodes'

/**
 * Builds one floor's buff fields. Emits nothing at all — not one node, not one
 * id — when the floor has no buffs, so a floor without them stays
 * byte-identical to the pre-feature output.
 *
 * An entry naming an unknown buff is skipped rather than thrown on:
 * config/validation.ts is the gate, and a generator that crashes on bad input
 * is the bug the port exists to fix.
 */
export function buildFloorBuffRig(
  ctx: GenerationContext,
  buffs: readonly FloorBuff[] | undefined,
  mapWidth: number,
  mapHeight: number
): void {
  if (buffs === undefined || buffs.length === 0) return

  const known = buffs.filter((entry) => buffById(entry.buff) !== undefined)
  if (known.length === 0) return

  // The nodes are placed off the east edge of the map, one column, one row per
  // node — cosmetic editor markers only, nothing about the rig is positional.
  const col = mapWidth + COVER_MARGIN
  let row = 0

  // Created lazily and in first-use order, so the ids a floor allocates depend
  // only on its own buff list.
  const shapes = new Map<BuffTarget, NodeRectangleShape>()
  const shapeFor = (target: BuffTarget): NodeRectangleShape => {
    let shape = shapes.get(target)
    if (shape === undefined) {
      shape = coveringShape(ctx, mapWidth, mapHeight, BUFF_TARGET_TYPES[target])
      shapes.set(target, shape)
    }
    return shape
  }

  for (const entry of known) {
    const shape = shapeFor(entry.target)

    const field = new NodeDangerArea(ctx, col, row)
    // NodeDangerArea ships disabled for timer mode's benefit; a buff aura has
    // nothing to switch it on, so it has to arrive live.
    field.enabled = true
    field.damage = 0
    field.freqMs = BUFF_REFRESH_MS
    field.buff = buffById(entry.buff)!.path
    field.connectToShape(shape)

    row += 1
  }
}
