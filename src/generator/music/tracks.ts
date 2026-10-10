/**
 * The music cues the two shipped soundbanks expose, read from
 * `assetsExtract/sound/music.xml` and `music_desert.xml`.
 * [VERIFIED] 2026-09-05 — see DISCOVERY-LOG.md.
 *
 * A cue is addressed as `sound/<bank>.xml:<cue>`, not by `.ogg` path —
 * `main.ogg` is `sound/music.xml:main`.
 */

export interface MusicTrack {
  id: string
  label: string
  sound: string
  group: 'Base' | 'Desert'
}

/** Sentinel: "use the game's own default" — emits no PlayMusic node at all. */
export const MUSIC_DEFAULT = 'default'

const base = (id: string, label: string): MusicTrack => ({
  id,
  label,
  sound: `sound/music.xml:${id}`,
  group: 'Base'
})

const desert = (id: string, label: string): MusicTrack => ({
  id,
  label,
  sound: `sound/music_desert.xml:${id}`,
  group: 'Desert'
})

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  base('none', 'Silence'),
  base('main', 'Main theme'),
  base('act1', 'Act 1'),
  base('act2', 'Act 2'),
  base('act3', 'Act 3'),
  base('act4', 'Act 4'),
  base('bonus_1', 'Bonus 1'),
  base('bonus_2', 'Bonus 2'),
  base('boss_1', 'Boss'),
  base('boss_killed', 'Boss killed'),
  base('boss_final', 'Final boss'),
  base('custom_1', 'Custom 1'),
  base('custom_2', 'Custom 2'),
  desert('desert_cavern', 'Desert: cavern'),
  desert('desert_temple', 'Desert: temple'),
  desert('desert_village', 'Desert: village')
]

const TRACKS_BY_ID = new Map(MUSIC_TRACKS.map((t) => [t.id, t]))

/**
 * Resolves a music parameter to the `sound/<bank>.xml:<cue>` string
 * `NodePlayMusic` wants, or `null` when nothing should be emitted — an unset
 * field, the `default` sentinel, or an id validation has already rejected.
 * Never throws: invariant 5 is "validate, don't crash".
 */
export function musicSound(id: string | undefined): string | null {
  if (id === undefined || id === MUSIC_DEFAULT) return null
  return TRACKS_BY_ID.get(id)?.sound ?? null
}

/** True for unset, `MUSIC_DEFAULT`, or a shipped track id — never true for a typo. */
export function isKnownMusicId(id: string | undefined): boolean {
  return id === undefined || id === MUSIC_DEFAULT || TRACKS_BY_ID.has(id)
}
