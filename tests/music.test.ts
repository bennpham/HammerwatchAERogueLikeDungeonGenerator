/**
 * Per-level music (src/generator/music/**) — the PlayMusic rig on dungeon
 * floors and boss arenas, and the raw-XML splice into lobby templates.
 *
 * Same invariant-6 discipline as floorTimer.test.ts and floorBuffs.test.ts: an
 * unset/`default` track must leave the file byte-identical to before this
 * feature existed, and setting one may only APPEND — it can never move a
 * dungeon id, wall, doodad, monster or item.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters, defaultLobby } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { MUSIC_DEFAULT, MUSIC_TRACKS, isKnownMusicId, musicSound } from '../src/generator/music/tracks'
import { buildMusicRig } from '../src/generator/music/rig'
import { buildLobby } from '../src/generator/lobby/build'
import { LOBBY_PRESETS } from '../src/generator/lobby/presets'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult, LobbyOptions } from '../src/generator'
import { allIds, nodesOfType, oneShotRespawn } from './xmlHelpers'
import { plainParameters } from './params'

const SEED = 4242

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

function bareParams(): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  // "bare" means no music at all, not defaultParameters()'s own act1/act2 cues
  delete params.floorMusic
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  params.playerTweaks = {}
  return params
}

function levelXml(result: DungeonResult, index: number): string {
  const file = result.files.find((f) => f.path === `levels/level${index}.xml`)
  expect(file, `levels/level${index}.xml missing`).toBeDefined()
  return (file as { content: string }).content
}

function sectionOf(xml: string, name: string): string | undefined {
  return new RegExp(`<dictionary name="${name}">[\\s\\S]*?\\n\\t</dictionary>`).exec(xml)?.[0]
}

// --- tracks.ts ---------------------------------------------------------------

describe('music tracks', () => {
  it('unset, MUSIC_DEFAULT, and an unknown id all resolve to no sound', () => {
    expect(musicSound(undefined)).toBeNull()
    expect(musicSound(MUSIC_DEFAULT)).toBeNull()
    expect(musicSound('not-a-track')).toBeNull()
  })

  it('a known id resolves to sound/<bank>.xml:<cue>', () => {
    expect(musicSound('main')).toBe('sound/music.xml:main')
    expect(musicSound('act2')).toBe('sound/music.xml:act2')
    expect(musicSound('desert_temple')).toBe('sound/music_desert.xml:desert_temple')
    // 'none' is a real cue — deliberate silence — distinct from the 'default' sentinel
    expect(musicSound('none')).toBe('sound/music.xml:none')
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
  function freshCtx(seed = 12345): GenerationContext {
    return new GenerationContext(defaultParameters(), seed)
  }

  it('emits nothing for unset, default, or an unknown id', () => {
    for (const track of [undefined, MUSIC_DEFAULT, 'not-a-track']) {
      const ctx = freshCtx()
      buildMusicRig(ctx, track)
      expect(ctx.scriptNodes).toHaveLength(0)
    }
  })

  it('wires a GlobalEventTrigger("LevelLoaded") to a PlayMusic node with the right cue', () => {
    const ctx = freshCtx()
    buildMusicRig(ctx, 'boss_final')
    const triggers = ctx.scriptNodes.filter((n) => n.type === 'GlobalEventTrigger')
    const music = ctx.scriptNodes.filter((n) => n.type === 'PlayMusic')
    expect(triggers).toHaveLength(1)
    expect(music).toHaveLength(1)
    expect((triggers[0] as { eventName: string } & typeof triggers[0]).eventName).toBe('LevelLoaded')
    expect(triggers[0].connections).toEqual([music[0]])
    expect((music[0] as { sound: string } & typeof music[0]).sound).toBe('sound/music.xml:boss_final')
  })
})

// --- dungeon floors, end to end ----------------------------------------------

describe('floor music — off means off', () => {
  it('every floor unset matches a campaign with no floorMusic field at all', () => {
    const off = generateOk(bareParams(), SEED)
    const legacy = bareParams()
    delete legacy.floorMusic
    const before = generateOk(legacy, SEED)
    expect(off.files).toEqual(before.files)
  })

  it('a floor with no track set emits no PlayMusic node', () => {
    const xml = levelXml(generateOk(bareParams(), SEED), 0)
    expect(nodesOfType(xml, 'PlayMusic')).toHaveLength(0)
  })
})

describe('floor music — one floor set leaves the others alone', () => {
  function withMusic(index: number, track: string): DungeonParameters {
    const params = bareParams()
    params.floorMusic = params.themes.map(() => MUSIC_DEFAULT)
    params.floorMusic[index] = track
    return params
  }

  it('moves no other floor, and no floor geometry at all', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withMusic(1, 'act2'), SEED)

    for (const i of [0, 2]) {
      expect(levelXml(on, i)).toBe(levelXml(off, i))
    }
    expect(on.levels).toEqual(off.levels)
  })

  it('appends to the chosen floor without moving one existing id, or touching any other section', () => {
    const off = generateOk(bareParams(), SEED)
    const on = generateOk(withMusic(1, 'act2'), SEED)
    const offXml = levelXml(off, 1)
    const onXml = levelXml(on, 1)

    for (const section of ['tilemap', 'doodads', 'actors', 'items']) {
      expect(sectionOf(onXml, section), section).toBe(sectionOf(offXml, section))
    }

    const offIds = allIds(offXml)
    const onIds = allIds(onXml)
    const highest = Math.max(...offIds)
    expect(onIds.filter((id) => id <= highest)).toEqual(offIds)
    // one GlobalEventTrigger + one PlayMusic
    expect(onIds.filter((id) => id > highest)).toHaveLength(2)

    expect(nodesOfType(onXml, 'PlayMusic')).toHaveLength(1)
    expect(nodesOfType(onXml, 'PlayMusic')[0].body).toContain('sound/music.xml:act2')
  })

  it('emits the right cue for every shipped track id', () => {
    for (const track of MUSIC_TRACKS) {
      const xml = levelXml(generateOk(withMusic(0, track.id), SEED), 0)
      const nodes = nodesOfType(xml, 'PlayMusic')
      expect(nodes, track.id).toHaveLength(1)
      expect(nodes[0].body, track.id).toContain(track.sound)
      expect(nodes[0].body, track.id).toContain('<bool name="loop">True</bool>')
    }
  })
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

  function arenaXml(result: DungeonResult): string {
    const file = result.files.find((f) => f.path === 'levels/boss0.xml')
    expect(file, 'levels/boss0.xml missing').toBeDefined()
    return (file as { content: string }).content
  }

  it('unset emits no PlayMusic node', () => {
    const xml = arenaXml(generateOk(withArenaMusic(MUSIC_DEFAULT), SEED))
    expect(nodesOfType(xml, 'PlayMusic')).toHaveLength(0)
  })

  it('a chosen track appends last, after checkpoints, without moving any earlier id', () => {
    const off = generateOk(withArenaMusic(MUSIC_DEFAULT), SEED)
    const on = generateOk(withArenaMusic('boss_1'), SEED)
    const offXml = arenaXml(off)
    const onXml = arenaXml(on)

    const offIds = allIds(offXml)
    const onIds = allIds(onXml)
    const highest = Math.max(...offIds)
    expect(onIds.filter((id) => id <= highest)).toEqual(offIds)

    const nodes = nodesOfType(onXml, 'PlayMusic')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].body).toContain('sound/music.xml:boss_1')
    // the new PlayMusic + its GlobalEventTrigger both sit above every id the
    // off-arena already used, so the rig only ever appends
    expect(nodes[0].id).toBeGreaterThan(highest)
  })
})

// --- lobbies, direct buildLobby ------------------------------------------------

describe('lobby music', () => {
  const EXIT_TARGET = 'some-level'

  function lobbyOptions(preset: string, music?: string): LobbyOptions {
    return { ...defaultLobby(preset), music }
  }

  for (const preset of LOBBY_PRESETS) {
    it(`${preset.id}: unset leaves the template's own music untouched (no PlayMusic added)`, () => {
      const before = preset.template
      const xml = buildLobby(preset, lobbyOptions(preset.id), EXIT_TARGET, false)
      const beforeMusic = nodesOfType(before, 'PlayMusic').length
      expect(nodesOfType(xml, 'PlayMusic')).toHaveLength(beforeMusic)
    })

    it(`${preset.id}: a chosen track adds one GlobalEventTrigger/PlayMusic pair at the reserved ids`, () => {
      const xml = buildLobby(preset, lobbyOptions(preset.id, 'main'), EXIT_TARGET, false)
      const music = nodesOfType(xml, 'PlayMusic')
      expect(music).toHaveLength(1)
      expect(music[0].id).toBe(preset.musicIdBase + 1)
      expect(music[0].body).toContain('sound/music.xml:main')

      const trigger = nodesOfType(xml, 'GlobalEventTrigger').find((n) => n.id === preset.musicIdBase)
      expect(trigger).toBeDefined()
      expect(trigger?.body).toContain('LevelLoaded')

      // the arrival-respawn net is still exactly where it always was
      const respawn = oneShotRespawn(xml)
      expect(typeof respawn, JSON.stringify(respawn)).toBe('object')
    })
  }
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
    params.boss.fights = params.boss.fights.map((f, i) =>
      i === 0 ? { ...f, arena: { ...f.arena, music: 'nope' } } : f
    )
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
