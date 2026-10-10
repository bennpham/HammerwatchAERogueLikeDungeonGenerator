/**
 * Boss arena checkpoints: on chosen boss health milestones, pull downed
 * players back into the fight and/or move the party's respawn point and
 * write a save.
 *
 * The two behaviours are scheduled independently — a dungeon master
 * typically wants players revived often (every tier, and after the boss
 * dies) but a save written only once, so `respawnPlayers` and `saveGame`
 * each carry their own preset rather than sharing one threshold list. When
 * both presets land on the same milestone, that milestone gets ONE trigger
 * carrying both children, never two triggers listening on the same event.
 *
 * Shape, repeated once per milestone either preset actually uses:
 *
 *   GlobalEventTrigger("Boss 50%")
 *        ├─ Checkpoint{parameters: True}    // only if saveGame's preset includes this milestone
 *        └─ RespawnPlayers                  // only if respawnPlayers' preset includes this milestone
 *
 * `parameters` on Checkpoint is a bare bool — not a dictionary — verified
 * against shipped campaign levels: `True` sets the respawn point AND writes a
 * save. It is only ever emitted here as `True` — the save-game dropdown's
 * whole meaning is "write a save at this milestone" — a respawn-only
 * milestone gets no Checkpoint node at all. See DISCOVERY-LOG.md.
 *
 * Both `Checkpoint` and `RespawnPlayers` are POSITIONAL: the party is
 * teleported to the node's own position. Only the triggers are editor
 * markers. The arena gets away with walking them all out from its entrance
 * shape because that shape sits beside its own LevelStart, inside the arena;
 * a dungeon floor has no such spot near its marker column, so it passes
 * `respawnAt` — a node placed past the map edge strands the party outside
 * the dungeon (playtest 2026-09-22).
 *
 * Independent of `invulnerability` and `waves.ts`'s wave rig: it listens to
 * the same engine events but wires its own dedicated triggers, so turning
 * either preset on or off never touches another rig's `connections` array.
 * Like invulnerability.ts, it draws NO random values from any stream and
 * writes no XML directly — the nodes self-register on `ctx.scriptNodes`.
 *
 * Both presets at `'never'` emits nothing at all — no trigger, no Checkpoint
 * node, no RespawnPlayers node — so a disabled feature cannot append so much
 * as an id.
 */

import type { GenerationContext } from '../core/context'
import type { BossArenaOptions } from '../config/parameters'
import { BOSS_CHECKPOINT_EVENTS, BOSS_CHECKPOINT_PRESETS } from '../config/parameters'
import { NodeCheckpoint, NodeGlobalEventTrigger } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'

/**
 * Builds the checkpoint rig for every milestone either preset uses.
 *
 * `(x, y)` is where the nodes walk out from, one column per milestone and one
 * row per node. `respawnAt`, when given, is where every `Checkpoint` and
 * `RespawnPlayers` goes instead — stacked on one point, because that point is
 * where the party lands. Omitted, they walk with the triggers as they always
 * have, which is what keeps the arena's output unchanged.
 */
export function buildCheckpointRig(
  ctx: GenerationContext,
  checkpoints: BossArenaOptions['checkpoints'],
  x: number,
  y: number,
  respawnAt?: { x: number; y: number }
): void {
  const respawnEvents: readonly string[] = BOSS_CHECKPOINT_PRESETS[checkpoints.respawnPlayers] ?? []
  const saveEvents: readonly string[] = BOSS_CHECKPOINT_PRESETS[checkpoints.saveGame] ?? []
  if (respawnEvents.length === 0 && saveEvents.length === 0) return

  let col = x
  for (const event of BOSS_CHECKPOINT_EVENTS) {
    const wantsRespawn = respawnEvents.includes(event)
    const wantsSave = saveEvents.includes(event)
    if (!wantsRespawn && !wantsSave) continue

    let row = y
    const trigger = new NodeGlobalEventTrigger(ctx, col, row, event)

    if (wantsSave) {
      row += 1
      const checkpoint = new NodeCheckpoint(ctx, respawnAt?.x ?? col, respawnAt?.y ?? row, true)
      trigger.connectTo(checkpoint)
    }

    if (wantsRespawn) {
      row += 1
      const respawn = new ScriptNode(ctx, respawnAt?.x ?? col, respawnAt?.y ?? row, 'RespawnPlayers')
      trigger.connectTo(respawn)
    }

    col += 1
  }
}
