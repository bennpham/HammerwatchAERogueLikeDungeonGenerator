/**
 * The generated-floor / boss-arena music rig: one `GlobalEventTrigger`
 * listening for `LevelLoaded`, wired to one `PlayMusic`.
 *
 * Like buffs/field.ts and timer/hazard.ts this draws no random values from any
 * stream and writes no XML directly — the nodes self-register on
 * `ctx.scriptNodes` and Level.getXML()/arena.ts drain them. It runs after the
 * floor/arena is fully built, so it only appends ids: a seed's dungeon is
 * unchanged whether music is set or not.
 *
 * Emits nothing at all — not one node, not one id — when the track is unset,
 * `default`, or unrecognised, so an unconfigured floor stays byte-identical.
 */

import type { GenerationContext } from '../core/context'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { NodeGlobalEventTrigger, NodePlayMusic } from '../objects/nodes'
import { musicSound } from './tracks'

/**
 * Builds one level's music rig. `x`/`y` are editor-canvas positions only —
 * they carry no gameplay meaning — so the origin is fine.
 */
export function buildMusicRig(ctx: GenerationContext, trackId: string | undefined, x = 0, y = 0): void {
  const sound = musicSound(trackId)
  if (sound === null) return

  const trigger = new NodeGlobalEventTrigger(ctx, x, y, LEVEL_LOADED_EVENT)
  trigger.connectTo(new NodePlayMusic(ctx, x, y, sound))
}
