import { formatTweakLine, parseTweakValue, pruneTweaks } from '../tweak/overrides'
import type { PlayerTweaks } from '../tweak/types'

/**
 * playersettings.txt — the Player tab on its own (issue #77).
 *
 * parameters.txt describes a whole campaign; this file describes only its
 * `player.*` overrides, so a player build can be shared and layered on top of
 * any campaign: import parameters.txt (or load a campaign preset) first, then
 * import playersettings.txt. Same line grammar as parameters.txt, and the same
 * `player.*` keys written by the same `formatTweakLine`.
 *
 * The file states the WHOLE Player tab relative to stock: importing it
 * replaces `playerTweaks` outright, and a key it leaves out is back at stock.
 * That is what makes export-then-import an exact round trip.
 */

const HEADER = [
  '# playersettings.txt — Hammerwatch Dungeon Generator player settings',
  '# Applies to the Player tab only; every key not listed here is stock.',
  '# Import parameters.txt first, then this file, to layer a player build onto a campaign.'
]

export interface ParsedPlayerSettings {
  /** the Player tab this file describes, pruned — `{}` is all stock */
  tweaks: PlayerTweaks
  /** `player.*` keys that name no tweak field, or carry a non-number */
  unknownKeys: string[]
  /** keys that are not `player.*` at all — e.g. a whole parameters.txt imported here */
  ignoredKeys: string[]
}

export function serializePlayerSettingsTxt(tweaks: PlayerTweaks): string {
  const pruned = pruneTweaks(tweaks)
  const lines = Object.keys(pruned)
    .sort()
    .map((key) => formatTweakLine(key, pruned[key]))
  // CRLF, like parameters.txt — both are meant to be opened in Notepad
  return [...HEADER, ...lines].join('\r\n') + '\r\n'
}

/** Never throws: anything it cannot use is reported, not fatal (invariant 5). */
export function parsePlayerSettingsTxt(content: string): ParsedPlayerSettings {
  const tweaks: PlayerTweaks = {}
  const unknownKeys: string[] = []
  const ignoredKeys: string[] = []
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const parts = line.split('=')
    if (parts.length !== 2) continue

    const key = parts[0].trim()
    const keyLower = key.toLowerCase()
    if (!keyLower.startsWith('player.')) {
      ignoredKeys.push(key)
      continue
    }
    const value = parseTweakValue(keyLower, parts[1].trim())
    if (value === undefined) unknownKeys.push(key)
    else if (value === 'stock') delete tweaks[keyLower]
    else tweaks[keyLower] = value
  }
  return { tweaks: pruneTweaks(tweaks), unknownKeys, ignoredKeys }
}
