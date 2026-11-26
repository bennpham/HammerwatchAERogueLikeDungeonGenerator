import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { HW2_MUSIC } from '../src/generator/catalog/hw2Assets.generated'
import { HW2_MUSIC_BANK, HW2_TRACKS, hw2MusicBank } from '../src/generator/custom/hw2/music'
import { MUSIC_TRACKS, musicBankSound, musicSound } from '../src/generator/music/tracks'
import { levelsOf, scriptsOf } from './ae'
import { HW2_CONTENT } from './hw2Install'
import { plainParameters } from './params'

function campaign(floorMusic: string[]) {
  const p = plainParameters()
  p.levels = 2
  p.themes = p.themes.slice(0, 2)
  p.levelMonsters = p.levelMonsters.slice(0, 2)
  p.lobbies = []
  p.boss = { ...p.boss, enabled: false }
  p.floorMusic = floorMusic
  return p
}

describe('Hammerwatch 2 music', () => {
  it('names only tracks the bank holds, all tagged', () => {
    for (const t of HW2_TRACKS) expect(HW2_MUSIC, t.sample).toContain(t.sample)
    const hw2 = MUSIC_TRACKS.filter((t) => t.source === 'hw2')
    expect(hw2.length).toBe(HW2_TRACKS.length)
    for (const t of MUSIC_TRACKS) expect(t.id.startsWith('hw2_'), t.id).toBe(t.source === 'hw2')
    for (const t of hw2) {
      expect(t.group).toBe('Hammerwatch 2')
      expect(musicSound(t.id)).toBe(0)
      expect(musicBankSound(t.id)).toMatch(/^hw2\/music\/music\.sbnk:\w+$/)
    }
    expect(musicBankSound('act1')).toBeNull()
    expect(musicBankSound('default')).toBeNull()
  })

  it('writes the bank the way mistdeep lists its music', () => {
    expect(hw2MusicBank(['crypt', 'boss', 'crypt', 'nope'])).toBe(
      '<soundbank>\n' +
        '  <sound category="music" name="boss" volume="1" is3d="false" looping="true">\n' +
        '    <source res="./Music_BossTheme_115bpm_ts44.ogg" />\n' +
        '  </sound>\n\n' +
        '  <sound category="music" name="crypt" volume="1" is3d="false" looping="true">\n' +
        '    <source res="./Music_Crypt_120bpm.ogg" />\n' +
        '  </sound>\n' +
        '</soundbank>\n'
    )
  })

  it('mutes AE music and loops the track, listing what the install converts', () => {
    const gen = generateDungeon(campaign(['hw2_crypt', 'act2']), 3, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    const levels = levelsOf(r)
    const floor0 = levels.get('floor0')!
    const music = scriptsOf(floor0, 'PlayMusic')
    expect(music.map((s) => s.params.find((p) => p.name === 'Music')?.value)).toEqual([0])
    const sounds = scriptsOf(floor0, 'PlaySound').filter((s) => s.params.some((p) => p.name === 'Sound' && p.value === 'hw2/music/music.sbnk:crypt'))
    expect(sounds.length).toBe(1)
    expect(sounds[0].params.find((p) => p.name === 'Looping')?.value).toBe(true)
    // the AE track on floor 1 is as before: a PlayMusic, no loop
    const floor1 = levels.get('floor1')!
    expect(scriptsOf(floor1, 'PlayMusic').map((s) => s.params.find((p) => p.name === 'Music')?.value)).toEqual([3])
    expect(scriptsOf(floor1, 'PlaySound').some((s) => s.params.some((p) => String(p.value).startsWith('hw2/')))).toBe(false)
    // the bank ships generated; the .ogg is the install's to make
    const bank = r.files.find((f) => f.path === HW2_MUSIC_BANK)!
    expect(bank.content).toContain('name="crypt"')
    expect(r.customAssets).toContain('hw2/music/Music_Crypt_120bpm.ogg')
    expect(r.customAssets).not.toContain(HW2_MUSIC_BANK)
  })

  it('adds no bank to a campaign without HW2 tracks, and needs HW2 loaded', () => {
    const r = generateDungeon(campaign(['act1', 'default']), 3) as DungeonResult
    expect(r.ok).toBe(true)
    expect(r.files.some((f) => f.path.startsWith('hw2/'))).toBe(false)
    expect(generateDungeon(campaign(['hw2_crypt', 'default']), 3).ok).toBe(false)
  })
})
