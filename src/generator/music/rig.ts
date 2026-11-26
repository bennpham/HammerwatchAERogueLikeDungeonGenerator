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
 *
 * A soundbank track (custom content, music/tracks.ts `bank`) plays the way
 * custom scenarios ship music: the same `PlayMusic`, at 0, mutes AE's own
 * music, and a looping `PlaySound` on the bank's sound plays the track.
 */

import type { GenerationContext } from '../core/context'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { NodeGlobalEventTrigger, NodePlayMusic, NodePlaySound } from '../objects/nodes'
import { musicBankSound, musicSound } from './tracks'

/**
 * Builds one level's music rig. `x`/`y` are editor-canvas positions only —
 * they carry no gameplay meaning — so the origin is fine.
 */
export function buildMusicRig(ctx: GenerationContext, trackId: string | undefined, x = 0, y = 0): void {
  const mode = musicSound(trackId)
  if (mode === null) return

  const trigger = new NodeGlobalEventTrigger(ctx, x, y, LEVEL_LOADED_EVENT)
  trigger.connectTo(new NodePlayMusic(ctx, x, y, mode))
  const bank = musicBankSound(trackId)
  if (bank !== null) trigger.connectTo(loopingSound(ctx, bank, x, y))
}

/**
 * Just the soundbank loop, for a level whose own `PlayMusic` already mutes
 * AE's music (a lobby template's authored node, set to 0). Nothing for AE's
 * own tracks.
 */
export function buildMusicLoop(ctx: GenerationContext, trackId: string | undefined, x = 0, y = 0): void {
  const bank = musicBankSound(trackId)
  if (bank === null) return
  new NodeGlobalEventTrigger(ctx, x, y, LEVEL_LOADED_EVENT).connectTo(loopingSound(ctx, bank, x, y))
}

function loopingSound(ctx: GenerationContext, sound: string, x: number, y: number): NodePlaySound {
  const node = new NodePlaySound(ctx, x, y + 1, sound)
  node.looping = true
  return node
}
