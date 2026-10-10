/**
 * Buffs per boss wave tier — an arena-wide buff field per health threshold.
 *
 * Each of the five tiers (100 / 75 / 50 / 25% and Boss Died) may carry any
 * number of buffs, each aimed at players, monsters or both, and each getting
 * its own field. Unlike the wave *spawns*, which switch on and never off so
 * that by 25% all four tiers are running at once, the buffs **replace** one
 * another: a tier's trigger switches the previous tier's whole set off as it
 * switches its own on, so only one tier's buffs are ever active. That is what
 * makes the fight read as phases rather than as an accumulating pile of
 * debuffs.
 *
 *   tier 0 (100%)   DangerArea{enabled: True, damage: 0, buff} -> shape
 *                   (live from arena load — no trigger, it IS the opening state)
 *
 *   tier N          GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *                        ├─ ToggleElement{state: 1} -> each previous tier field
 *                        └─ ToggleElement{state: 0} -> each of this tier's
 *
 * `state: 0` ENABLES and `state: 1` disables — the inverted polarity
 * NodeToggleElement documents and prefabs/trap_fire_floor.xml confirms.
 *
 * "The previous tier's field" is the nearest EARLIER tier that actually carries
 * a buff, not `tier - 1`: a campaign that buffs only 100% and 25% must have the
 * 25% trigger switch off the 100% field, and there is no tier-2 field to name.
 *
 * Like waves.ts and invulnerability.ts this module draws **no** random values
 * from any stream — not from `ctx.bossRand` either — and writes no XML
 * directly. It is built after both of those, so switching it on only ever
 * appends ids and no existing arena seed moves.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave, BuffTarget } from '../config/parameters'
import { BUFF_REFRESH_MS, BUFF_TARGET_TYPES, waveBuffs } from '../config/parameters'
import type { BuffDef } from '../objects/buffTypes'
import { buffById } from '../objects/buffTypes'
import { NodeDangerArea, NodeRectangleShape, NodeToggleElement } from '../objects/nodes'
import type { TierSource } from './tierSource'
import { singleBossTierSource } from './tierSource'

/**
 * Slack added to the covering rectangle on each axis, so the field reaches the
 * outermost walkable tile. The arena's own covering shape cannot be reused —
 * that one is the entrance trigger's, and this needs its own `types`.
 */
const COVER_MARGIN = 2

/**
 * Builds the arena's per-tier buff fields. Emits nothing at all — not one node,
 * not one id — when no tier carries a buff, so an arena without them stays
 * byte-identical to the pre-feature output.
 *
 * An entry naming an unknown buff is skipped rather than thrown on;
 * config/validation.ts is the gate.
 */
export function buildWaveBuffRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  arenaWidth: number,
  arenaHeight: number,
  x: number,
  y: number,
  tierSource: TierSource = singleBossTierSource()
): void {
  const carried: { def: BuffDef; target: BuffTarget }[][] = waves.map((wave) =>
    waveBuffs(wave).flatMap((entry) => {
      const def = buffById(entry.buff)
      return def === undefined ? [] : [{ def, target: entry.target }]
    })
  )
  if (carried.every((entries) => entries.length === 0)) return

  // The previous carrying tier's fields, so each trigger knows what to switch
  // off — all of them, since a tier replaces the whole set before it.
  let previous: NodeDangerArea[] = []

  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue
    // Multi-boss (issue #64 part 1): tiers 75/50/25% skipped entirely, before
    // building so much as a DangerArea for them.
    if (tier > 0 && tierSource.skipTier(tier)) continue

    // Nodes are placed off the arena, one column per tier — cosmetic editor
    // markers only, nothing about the rig is positional.
    const col = x + tier
    let row = y

    const fields: NodeDangerArea[] = []
    for (const entry of entries) {
      const shape = new NodeRectangleShape(ctx, arenaWidth / 2, arenaHeight / 2)
      shape.width = arenaWidth + COVER_MARGIN
      shape.height = arenaHeight + COVER_MARGIN
      shape.types = BUFF_TARGET_TYPES[entry.target as BuffTarget]

      const field = new NodeDangerArea(ctx, col, row)
      field.damage = 0
      field.freqMs = BUFF_REFRESH_MS
      field.buff = entry.def.path
      field.connectToShape(shape)
      // The opening tier has nothing to switch it on, so it has to arrive live;
      // every later tier ships disabled and waits for its own threshold. That is
      // also why tier 0 emits no trigger at all.
      field.enabled = tier === 0
      fields.push(field)
      // The first field sits on the tier's own row so a single-buff tier emits
      // exactly the node sequence it did before tiers took lists.
      row += 1
    }
    row -= 1

    if (tier > 0) {
      row += 1
      const trigger = tierSource.tierTrigger(ctx, col, row, tier)

      for (const stale of previous) {
        row += 1
        const off = new NodeToggleElement(ctx, col, row)
        off.state = 1 // 1 disables the target element
        off.connectToElement(stale)
        trigger.connectTo(off)
      }

      for (const field of fields) {
        row += 1
        const on = new NodeToggleElement(ctx, col, row)
        on.state = 0 // 0 enables the target element
        on.connectToElement(field)
        trigger.connectTo(on)
      }
    }

    previous = fields
  }
}
