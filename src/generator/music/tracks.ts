/**
 * Anniversary Edition music. AE's `PlayMusic` WorldScript sets the FMOD
 * parameter `parameter:/MusicMode` to an int (scripts/WorldScript/Sound/
 * PlayMusic.as); there is no enum in the scripts, so the values below are the
 * ones the stock levels write, with names from where they are used:
 *
 * - Castle Hammerwatch [VERIFIED usage]: 2–5 on the act 1–4 levels, 6 on the
 *   three boss levels, 7 beside 6 on the final boss (hw2ae paired HW1's
 *   music cues with the same numbers, plus 0 none, 1 main, 8 bonus);
 * - Temple of the Sun [VERIFIED usage]: 12 on boss levels 1–2, 13 on boss 3,
 *   14 on the hub;
 * - Shaftlocke Tower: 20 on its boss levels and several regular ones, 21 on
 *   the dragon. The NAMES of 20/21 are a guess [UNVERIFIED].
 */

import { HW2_MUSIC_BANK, HW2_TRACKS } from '../custom/hw2/music'
import type { ContentSource } from '../custom/sources'

export interface MusicTrack {
  id: string
  label: string
  /** the `PlayMusic.Music` value (0, silence, for a bank track: it mutes AE's own music) */
  mode: number
  group: 'Castle Hammerwatch' | 'Temple of the Sun' | 'Shaftlocke Tower' | 'Hammerwatch 2'
  /**
   * Set for custom content (custom/sources.ts): usable only with that source
   * loaded, and played from a scenario soundbank rather than AE's music:
   * `bank` is the `PlaySound` sound (`hw2/music/music.sbnk:crypt`) and
   * `sample` the `.ogg` it lists.
   */
  source?: ContentSource
  bank?: { sound: string; sample: string }
}

/** Sentinel: "use the level's own default" — emits no PlayMusic at all. */
export const MUSIC_DEFAULT = 'default'

const castle = (id: string, label: string, mode: number): MusicTrack => ({ id, label, mode, group: 'Castle Hammerwatch' })
const temple = (id: string, label: string, mode: number): MusicTrack => ({ id, label, mode, group: 'Temple of the Sun' })
const shaftlocke = (id: string, label: string, mode: number): MusicTrack => ({ id, label, mode, group: 'Shaftlocke Tower' })

/** Hammerwatch 2's tracks (custom/hw2/music.ts), each muting AE's music and looping its own. */
const HW2_MUSIC: readonly MusicTrack[] = HW2_TRACKS.map((t) => ({
  id: t.id,
  label: t.label,
  mode: 0,
  group: 'Hammerwatch 2',
  source: 'hw2',
  bank: { sound: `${HW2_MUSIC_BANK}:${t.name}`, sample: t.sample }
}))

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  castle('none', 'Silence', 0),
  castle('main', 'Main theme', 1),
  castle('act1', 'Act 1 (prison)', 2),
  castle('act2', 'Act 2 (armory)', 3),
  castle('act3', 'Act 3 (archives)', 4),
  castle('act4', 'Act 4 (chambers)', 5),
  castle('boss_1', 'Boss', 6),
  castle('boss_final', 'Final boss', 7),
  castle('bonus', 'Bonus', 8),
  temple('temple_boss', 'Temple: boss', 12),
  temple('temple_final_boss', 'Temple: final boss', 13),
  temple('temple_hub', 'Temple: hub', 14),
  shaftlocke('shaftlocke_20', 'Shaftlocke: tower (mode 20)', 20),
  shaftlocke('shaftlocke_21', 'Shaftlocke: dragon (mode 21)', 21),
  ...HW2_MUSIC
]

const TRACKS_BY_ID = new Map(MUSIC_TRACKS.map((t) => [t.id, t]))

/**
 * The `PlayMusic.Music` value for a music parameter, or null when nothing
 * should be emitted — unset, the `default` sentinel, or an id validation has
 * already rejected. Never throws.
 */
export function musicMode(id: string | undefined): number | null {
  if (id === undefined || id === MUSIC_DEFAULT) return null
  return TRACKS_BY_ID.get(id)?.mode ?? null
}

/**
 * The soundbank sound a track loops (`hw2/music/music.sbnk:crypt`), or null
 * for AE's own music, unset, `default` or an unknown id.
 */
export function musicBankSound(id: string | undefined): string | null {
  if (id === undefined || id === MUSIC_DEFAULT) return null
  return TRACKS_BY_ID.get(id)?.bank?.sound ?? null
}

/** Kept under its HW1-era name for the call sites; returns the music MODE now. */
export const musicSound = musicMode

/** True for unset, `MUSIC_DEFAULT`, or a known track id — never true for a typo. */
export function isKnownMusicId(id: string | undefined): boolean {
  return id === undefined || id === MUSIC_DEFAULT || TRACKS_BY_ID.has(id)
}
