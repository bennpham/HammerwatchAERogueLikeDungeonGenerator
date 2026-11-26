/**
 * Hammerwatch 2 music (experimental "Load custom" content; custom/sources.ts).
 *
 * HW2's tracks are named samples in `<HW2>/res/assets/sound/music.bank`, which
 * AE never loads. A track used by a campaign is converted to `.ogg` at install
 * (main/custom/vorbis) and listed in a generated `hw2/music/music.sbnk`, the way
 * custom scenarios ship music (`scenarios/mistdeep`): the level mutes AE's own
 * music and loops a `PlaySound` on `hw2/music/music.sbnk:<name>`
 * (docs/discovery/hammerwatch-2-assets.md, finding 6).
 *
 * Only whole loops are offered: the intro stems (`…_Intro`), the fishing and
 * minigame jingles, and the win stinger are left out.
 */

/** The bank file a campaign's HW2 tracks are listed in. */
export const HW2_MUSIC_BANK = 'hw2/music/music.sbnk'

export interface Hw2Track {
  /** content id: `hw2_<name>` */
  id: string
  /** the entry name in the .sbnk */
  name: string
  label: string
  /** the sample in HW2's music.bank (and the .ogg's file name) */
  sample: string
}

const track = (name: string, label: string, sample: string): Hw2Track => ({ id: `hw2_${name}`, name, label, sample })

export const HW2_TRACKS: readonly Hw2Track[] = [
  track('main_theme', 'Main theme (HW2)', 'Music_MainTheme_102bpm_ts68'),
  track('boss', 'Boss (HW2)', 'Music_BossTheme_115bpm_ts44'),
  track('crypt', 'Crypt (HW2)', 'Music_Crypt_120bpm'),
  track('prison', 'Prison (HW2)', 'Music_Prison_135bpm'),
  track('sewers', 'Sewers (HW2)', 'Music_Sewers_130bpm'),
  track('caves_light', 'Caves, light (HW2)', 'Music_Caves_Light_110bpm'),
  track('caves_dark', 'Caves, dark (HW2)', 'Music_Caves_Dark_135bpm'),
  track('cave_variant', 'Caves, variant (HW2)', 'Music_Cave_Variant_105bpm_44_C#min_Loop'),
  track('spider_cave', 'Spider cave (HW2)', 'Music_SpiderCave_105bpm'),
  track('pirate_cave', 'Pirate cave (HW2)', 'Music_PirateCave_135bpm'),
  track('obsidian_spire', 'Obsidian Spire (HW2)', 'Music_ObsidianSpire_120bpm'),
  track('thieves_tower', 'Thieves tower (HW2)', 'Music_ThievesTower_bpm130'),
  track('corrupted_maze', 'Corrupted maze (HW2)', 'Music_CorruptedMaze_110bpm'),
  track('superbia_dungeon', 'Castle Superbia dungeon (HW2)', 'Music_CastleSuperbia_Dungeon_Normal_120bpm'),
  track('superbia_corrupt', 'Castle Superbia, corrupt (HW2)', 'Music_CastleSuperbia_Dungeon_Corrupt_120bpm'),
  track('superbia_friendly', 'Castle Superbia, friendly (HW2)', 'Music_CastleSuperbia_Friendly_100bpm'),
  track('church', 'Church (HW2)', 'Music_Church_80bpm'),
  track('swamp', 'Swamp (HW2)', 'Music_SwampTheme_125bpm'),
  track('desert', 'Desert (HW2)', 'Music_DesertTheme_125bpm'),
  track('snow', 'Snow (HW2)', 'Music_SnowTheme_125bpm'),
  track('paradise', 'Paradise (HW2)', 'Music_ParadiseTheme_150bpm'),
  track('fog_town', 'Fog town (HW2)', 'Music_FogTown_120bpm'),
  track('town_day', 'Town, day (HW2)', 'Music_Town_Day_110bpm'),
  track('town_night', 'Town, night (HW2)', 'Music_Town_Night_110bpm'),
  track('town_general', 'Town, general (HW2)', 'Music_Town_General_Day_130bpm'),
  track('town_eerie', 'Town, eerie (HW2)', 'Music_Town_General_Eerie_60bpm_44_Gm_Loop'),
  track('castle_city_day', 'Castle city, day (HW2)', 'Music_CastleCity_Day_125bpm'),
  track('castle_city_night', 'Castle city, night (HW2)', 'Music_CastleCity_Night_125bpm'),
  track('blackbarrow_day', 'Blackbarrow, day (HW2)', 'Music_Blackbarrow_Day_106bpm'),
  track('blackbarrow_night', 'Blackbarrow, night (HW2)', 'Music_Blackbarrow_Night_106bpm'),
  track('fallowfields_day', 'Fallowfields, day (HW2)', 'Music_Fallowfields_Day_130bpm'),
  track('fallowfields_night', 'Fallowfields, night (HW2)', 'Music_Fallowfields_Night_130bpm'),
  track('highlands_day', 'Highlands, day (HW2)', 'Music_Highlands_Day_95bpm'),
  track('highlands_night', 'Highlands, night (HW2)', 'Music_Highlands_Night_95bpm'),
  track('outside_day', 'Outside, day (HW2)', 'Music_Outside_Day_115bpm'),
  track('outside_night', 'Outside, night (HW2)', 'Music_Outside_Night_115bpm'),
  track('sacred_garden_day', 'Sacred garden, day (HW2)', 'Music_SacredGarden_Day_110bpm'),
  track('sacred_garden_night', 'Sacred garden, night (HW2)', 'Music_SacredGarden_Night_110bpm'),
  track('at_the_gates', 'At the gates (HW2)', 'At_The_Gates_Calm_Loop'),
  track('subtle_deception', 'Subtle deception (HW2)', 'Music_Subtle_Deception_88bpm_44_F#m_Loop'),
  track('demolite_theme', 'Main theme, Demolite version (HW2)', 'Hammerwatch_Main_Theme_Demolite_Version')
]

/** The .ogg a track ships as, beside the bank. */
export function hw2TrackOgg(t: Hw2Track): string {
  return `hw2/music/${t.sample}.ogg`
}

/**
 * The generated bank for the tracks `names` (sbnk entry names), sorted, one
 * looping music sound each: the format mistdeep's `music/music.sbnk` uses.
 */
export function hw2MusicBank(names: Iterable<string>): string {
  const byName = new Map(HW2_TRACKS.map((t) => [t.name, t]))
  const used = [...new Set(names)].filter((n) => byName.has(n)).sort()
  const sounds = used.map((n) => {
    const t = byName.get(n)!
    return (
      `  <sound category="music" name="${t.name}" volume="1" is3d="false" looping="true">\n` +
      `    <source res="./${t.sample}.ogg" />\n` +
      '  </sound>\n'
    )
  })
  return `<soundbank>\n${sounds.join('\n')}</soundbank>\n`
}
