/**
 * Per-level music: the `PlayMusic` rig on dungeon floors, boss arenas and
 * lobbies. AE plays music by FMOD music MODE (an int), not by cue path — the
 * stock levels set it with `PlayMusic { Music = N }`.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultLobby, defaultParameters } from '../src/generator/config/parameters'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { validateParameters } from '../src/generator/config/validation'
import { buildMusicRig } from '../src/generator/music/rig'
import { MUSIC_DEFAULT, MUSIC_TRACKS, isKnownMusicId, musicMode } from '../src/generator/music/tracks'
import { DEFAULT_LOBBY_PRESET_ID } from '../src/generator/lobby/presets'
import type { AeLevel } from '../src/generator/ae/model'
import { changedScripts, generateOk, levelsOf, param, placements, scriptsOf } from './ae'
import { plainParameters } from './params'

const SEED = 4242

function bareParams(): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  // "bare" means no music at all, not defaultParameters()'s own cues
  delete params.floorMusic
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

function level(result: DungeonResult, stem: string): AeLevel {
  const l = levelsOf(result).get(stem)
  expect(l, `${stem} missing`).toBeDefined()
  return l!
}

/** The music modes a level's PlayMusic scripts set. */
const modesOf = (l: AeLevel) => scriptsOf(l, 'PlayMusic').map((s) => param(s, 'Music')?.value)

/** Everything about a level except its scripts — the part music must never touch. */
const geometryOf = (l: AeLevel) => ({ tiles: l.tileCells, units: placements(l), env: l.environment })

// --- tracks.ts ---------------------------------------------------------------

describe('music tracks', () => {
  it('unset, MUSIC_DEFAULT, and an unknown id all resolve to no mode', () => {
    expect(musicMode(undefined)).toBeNull()
    expect(musicMode(MUSIC_DEFAULT)).toBeNull()
    expect(musicMode('not-a-track')).toBeNull()
  })

  it('a known id resolves to its AE music mode', () => {
    expect(musicMode('none')).toBe(0)
    expect(musicMode('main')).toBe(1)
    expect(musicMode('act2')).toBe(3)
    expect(musicMode('boss_1')).toBe(6)
    expect(musicMode('temple_hub')).toBe(14)
  })

  it('gives every track a distinct id and a non-negative integer mode', () => {
    expect(new Set(MUSIC_TRACKS.map((t) => t.id)).size).toBe(MUSIC_TRACKS.length)
    for (const t of MUSIC_TRACKS) expect(Number.isInteger(t.mode) && t.mode >= 0, t.id).toBe(true)
  })

  it('isKnownMusicId accepts every shipped id plus unset/default, and nothing else', () => {
    expect(isKnownMusicId(undefined)).toBe(true)
    expect(isKnownMusicId(MUSIC_DEFAULT)).toBe(true)
    for (const t of MUSIC_TRACKS) expect(isKnownMusicId(t.id), t.id).toBe(true)
    expect(isKnownMusicId('nope')).toBe(false)
  })
})

// --- rig.ts, unit level ------------------------------------------------------

describe('music rig — unit', () => {
  const freshCtx = () => new GenerationContext(defaultParameters(), 12345)

  it('emits nothing for unset, default, or an unknown id', () => {
    for (const track of [undefined, MUSIC_DEFAULT, 'not-a-track']) {
      const ctx = freshCtx()
      buildMusicRig(ctx, track)
      expect(ctx.scriptNodes).toHaveLength(0)
    }
  })

  it('fires PlayMusic once, on level load', () => {
    const ctx = freshCtx()
    buildMusicRig(ctx, 'boss_final')
    const [link, play] = ctx.scriptNodes
    expect(ctx.scriptNodes).toHaveLength(2)
    expect(link.cls).toBe('ScriptLink')
    expect(link.executeOnStart).toBe(true)
    expect(link.triggerTimes).toBe(1)
    expect(link.connections.map((c) => c.node)).toEqual([play])
    expect(play.cls).toBe('PlayMusic')
    expect(play.params()).toEqual([{ name: 'Music', kind: 'int', value: musicMode('boss_final') }])
  })
})

// --- dungeon floors, end to end ----------------------------------------------

describe('floor music', () => {
  function withMusic(index: number, track: string): DungeonParameters {
    const params = bareParams()
    params.floorMusic = params.themes.map(() => MUSIC_DEFAULT)
    params.floorMusic[index] = track
    return params
  }

  it('every floor unset matches a campaign with no floorMusic field at all', () => {
    const unset = bareParams()
    unset.floorMusic = unset.themes.map(() => MUSIC_DEFAULT)
    expect(generateOk(unset, SEED).files).toEqual(generateOk(bareParams(), SEED).files)
  })

  it('a floor with no track set emits no PlayMusic', () => {
    expect(modesOf(level(generateOk(bareParams(), SEED), 'floor0'))).toEqual([])
  })

  it('moves no other floor, and no floor geometry at all', () => {
    const off = levelsOf(generateOk(bareParams(), SEED))
    const on = levelsOf(generateOk(withMusic(1, 'act2'), SEED))
    for (const stem of ['floor0', 'floor2']) expect(on.get(stem)).toEqual(off.get(stem))
    expect(geometryOf(on.get('floor1')!)).toEqual(geometryOf(off.get('floor1')!))
  })

  it('adds two scripts to the chosen floor and changes no existing one', () => {
    const off = level(generateOk(bareParams(), SEED), 'floor1')
    const on = level(generateOk(withMusic(1, 'act2'), SEED), 'floor1')
    expect(changedScripts(off, on)).toEqual([])
    // one ScriptLink + one PlayMusic
    expect(on.scripts.length - off.scripts.length).toBe(2)
    expect(modesOf(on)).toEqual([musicMode('act2')])
  })

  it('emits the right mode for every shipped track id', () => {
    for (const track of MUSIC_TRACKS) {
      expect(modesOf(level(generateOk(withMusic(0, track.id), SEED), 'floor0')), track.id).toEqual([track.mode])
    }
  }, 120_000)
})

// --- boss arena, end to end ---------------------------------------------------

describe('boss arena music', () => {
  function withArenaMusic(track: string): DungeonParameters {
    const params = plainParameters()
    params.boss = {
      ...params.boss,
      enabled: true,
      fights: params.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, music: track } } : f))
    }
    return params
  }

  it('unset emits no PlayMusic', () => {
    expect(modesOf(level(generateOk(withArenaMusic(MUSIC_DEFAULT), SEED), 'boss0'))).toEqual([])
  })

  it('a chosen track adds its rig and moves nothing else in the arena', () => {
    const off = level(generateOk(withArenaMusic(MUSIC_DEFAULT), SEED), 'boss0')
    const on = level(generateOk(withArenaMusic('boss_1'), SEED), 'boss0')
    expect(changedScripts(off, on)).toEqual([])
    expect(placements(on)).toEqual(placements(off))
    expect(modesOf(on)).toEqual([musicMode('boss_1')])
  })
})

// --- lobbies, end to end -------------------------------------------------------

describe('lobby music', () => {
  function withLobbyMusic(music?: string): DungeonParameters {
    const params = bareParams()
    params.lobbies = [{ ...defaultLobby(DEFAULT_LOBBY_PRESET_ID), music }]
    return params
  }

  it('unset adds no PlayMusic to the lobby', () => {
    expect(modesOf(level(generateOk(withLobbyMusic(), SEED), 'lobby0'))).toEqual([])
  })

  it('a chosen track plays on load, and the lobby keeps its arrival point', () => {
    const lobby = level(generateOk(withLobbyMusic('main'), SEED), 'lobby0')
    expect(modesOf(lobby)).toEqual([musicMode('main')])
    expect(scriptsOf(lobby, 'LevelStart').length).toBeGreaterThan(0)
  })
})

// --- validation ---------------------------------------------------------------

describe('music validation', () => {
  it('accepts the defaults', () => {
    expect(validateParameters(defaultParameters()).errors).toEqual([])
  })

  it('rejects an unknown floorMusic id', () => {
    const params = defaultParameters()
    params.floorMusic = params.themes.map(() => MUSIC_DEFAULT)
    params.floorMusic[0] = 'nope'
    const result = validateParameters(params)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('floorMusic.0')
  })

  it('rejects an unknown lobby music id', () => {
    const params = defaultParameters()
    params.lobbies = params.lobbies.map((l, i) => (i === 0 ? { ...l, music: 'nope' } : l))
    const result = validateParameters(params)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('lobbies.0.music')
  })

  it('rejects an unknown boss fight music id', () => {
    const params = defaultParameters()
    params.boss.fights = params.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, music: 'nope' } } : f))
    const result = validateParameters(params)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.fights.0.arena.music')
  })

  it('accepts every shipped track id in all three places', () => {
    for (const track of MUSIC_TRACKS) {
      const params = defaultParameters()
      params.floorMusic = params.themes.map(() => track.id)
      params.lobbies = params.lobbies.map((l) => ({ ...l, music: track.id }))
      params.boss.fights = params.boss.fights.map((f) => ({ ...f, arena: { ...f.arena, music: track.id } }))
      expect(validateParameters(params).errors, track.id).toEqual([])
    }
  })
})
