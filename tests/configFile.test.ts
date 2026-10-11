import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { plainParameters } from './params'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { noUpgrades, oneOfEachUpgrade } from '../src/generator/lobby/payout'
import {
  gatewayLockedFloors,
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  bossDeathBuffs,
  defaultParameters,
  waveBuffs,
  wavePickups
} from '../src/generator/config/parameters'
import { DEFAULT_LOBBY_PRESET_ID } from '../src/generator/lobby/presets'
import {
  applyFullyUpgraded,
  applyGroupFactor,
  prunePlayerTweaks,
  setClassSpeed,
  skillKey,
  statKey
} from '../src/generator/players'

describe('parameters.default.txt', () => {
  // The shipped file documents the defaults, so a default that changes without
  // it is a lie in the repo's most user-facing config. Reading a repo file is
  // fine here: the purity rule binds src/generator, not the test runner.
  const content = readFileSync(
    fileURLToPath(new URL('../parameters.default.txt', import.meta.url)),
    'utf8'
  )

  it('parses back to defaultParameters() with nothing unrecognized', () => {
    const parsed = parseParametersTxt(content)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params).toEqual(defaultParameters())
  })

  it('documents the install path and the cleanup flag', () => {
    const parsed = parseParametersTxt(content)
    expect(parsed.path).toBeDefined()
    expect(parsed.cleanupFiles).toBe(true)
  })
})

const JAVA_FIXTURE = fileURLToPath(new URL('../reference/original-java/parameters.txt', import.meta.url))

// The Java reference was not carried into the AE port; this block only runs where it exists.
describe.skipIf(!existsSync(JAVA_FIXTURE))('reference/original-java/parameters.txt — the Java tool\'s own file', () => {
  // The original, unedited Java tool's export: pre-remake monster names
  // (`bat`, `army1`, `lich2`, …), no lobbies/boss/traps/timers/buffs/music/
  // player tweaks/levelOrder keys at all — everything this port added after
  // the port existed. It must keep importing exactly as it always has: an
  // overlay onto `defaultParameters()` (invariant 5/6, CLAUDE.md "old files
  // must still parse exactly as they do today"). None of this fix's changes
  // touch a code path this file exercises — the explicit-stock-clear rule
  // only fires on a `player.*` line naming the stock value, and the
  // default-parses-to-undefined rule only fires on a `music`/`lobbyMusic`/
  // `bossMusic` line — so this is a straight regression guard, not a new
  // behaviour.
  const content = existsSync(JAVA_FIXTURE) ? readFileSync(JAVA_FIXTURE, 'utf8') : ''

  it('overlays its legacy keys onto defaultParameters(), leaving everything it never mentions untouched', () => {
    const parsed = parseParametersTxt(content)
    const base = defaultParameters()

    // Legacy monster names the port renamed (`bat`->`bat1`, `army1`/`army2`/
    // `lich2` folded away entirely) are not validated at parse time — that is
    // validation.ts's job — so they come through as literal pool strings,
    // same as any other floor pool key.
    expect(parsed.params.levelMonsters).toEqual([
      ['bat', 'tick', 'maggot'],
      ['bat', 'tick', 'slime', 'maggot'],
      ['slime', 'skeleton_warrior', 'maggot'],
      ['eye', 'skeleton_warrior', 'archer', 'archer'],
      ['wisp', 'skeleton_warrior', 'archer', 'eye', 'army1'],
      ['skeleton_warrior', 'archer', 'army1', 'skeleton_soldier', 'wisp'],
      ['skeleton_soldier', 'archer', 'skeleton_lich', 'army1'],
      ['skeleton_soldier', 'army2', 'lich2']
    ])
    // The renamed `max*` keys (`maxBats`, `maxArmy`, `maxLiches1`, …) no
    // longer match any current configKey and are reported, never fatal.
    expect(parsed.unknownKeys).toEqual([
      'maxBats',
      'maxTicks',
      'maxWisps',
      'maxArmy',
      'maxArmy2',
      'maxLiches1',
      'maxLiches2'
    ])

    expect(parsed.path).toBe('C:/Program Files (x86)/Steam/steamapps/common/Hammerwatch')
    expect(parsed.cleanupFiles).toBe(true)
    expect(parsed.params.levels).toBe(8)
    expect(parsed.params.themes).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'])

    // Nothing this file is silent about drifts from the base it overlays
    // onto: no `boss=`/`lobbies=`/`levelOrder=`/`player.*`/`musicN=` line
    // anywhere in it, so all four stay exactly `defaultParameters()`'s own —
    // the shipped two lobbies, the boss on with the shipped order, the stock
    // `player.shared.remove.life` tweak, and the 070 per-floor music.
    expect(parsed.params.boss.enabled).toBe(base.boss.enabled)
    expect(parsed.params.lobbies).toEqual(base.lobbies)
    expect(parsed.params.levelOrder).toEqual(base.levelOrder)
    expect(parsed.params.playerTweaks).toEqual(base.playerTweaks)
    expect(parsed.params.floorMusic).toEqual(base.floorMusic)
    expect(parsed.params.levelTraps).toEqual(base.levelTraps)
    expect(parsed.params.levelTimers).toEqual(base.levelTimers)
  })
})

describe('parameters.txt parsing', () => {
  it('overrides only the keys present in the file', () => {
    const parsed = parseParametersTxt('levels=4\nmapWidth=100\nthemes=prison,armory,archives,chambers\n')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.params.mapWidth).toBe(100)
    expect(parsed.params.themes).toEqual(['prison', 'armory', 'archives', 'chambers'])
    // untouched keys keep defaults
    expect(parsed.params.maxRoomSize).toBe(20)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('parses path and cleanupFiles as app-level values', () => {
    const parsed = parseParametersTxt('path=C:/Games/Hammerwatch\ncleanupFiles=0\n')
    expect(parsed.path).toBe('C:/Games/Hammerwatch')
    expect(parsed.cleanupFiles).toBe(false)
  })

  it('parses per-level monster pools and monster max counts', () => {
    const parsed = parseParametersTxt('monsters0=bat1,tick1\nmaxBats1=123\nmaxMB_Liches=4\n')
    expect(parsed.params.levelMonsters[0]).toEqual(['bat', 'tick'])
    expect(parsed.params.monsterMax['bat']).toBe(123)
    expect(parsed.params.monsterMax['mb_wizard']).toBe(4)
  })

  it('collects unknown keys instead of failing', () => {
    const parsed = parseParametersTxt('maxBats=200\nsomethingElse=1\n')
    expect(parsed.unknownKeys).toEqual(['maxBats', 'somethingElse'])
  })

  it('handles CRLF files and blank lines', () => {
    const parsed = parseParametersTxt('levels=3\r\n\r\nmapHeight=40\r\n')
    expect(parsed.params.levels).toBe(3)
    expect(parsed.params.mapHeight).toBe(40)
  })

  it('round-trips through serialize + parse', () => {
    const original = defaultParameters()
    original.levels = 5
    original.themes = ['prison', 'crypt', 'mine_granite', 'cave_dark', 'bonus3']
    original.monsterMax['bat'] = 42
    original.shopChance = 0.5

    const text = serializeParametersTxt(original, 'D:/HW', false)
    const parsed = parseParametersTxt(text)

    expect(parsed.path).toBe('D:/HW')
    expect(parsed.cleanupFiles).toBe(false)
    expect(parsed.params.levels).toBe(5)
    expect(parsed.params.themes).toEqual(['prison', 'crypt', 'mine_granite', 'cave_dark', 'bonus3'])
    expect(parsed.params.monsterMax['bat']).toBe(42)
    expect(parsed.params.shopChance).toBeCloseTo(0.5)
    expect(parsed.unknownKeys).toEqual([])
  })

  // A file written by the HW1 remake names themes by letter, overlay tileset
  // (`c_tiles`) or mixed entry (`d_mixed`); each imports as its AE theme.
  it('translates HW1 theme ids, overlays and mixed entries included, to AE themes', () => {
    const parsed = parseParametersTxt('levels=4\nthemes=a,c_tiles,d_mixed,f_frozen\nboss0Theme=g_mixed\n')
    expect(parsed.params.themes).toEqual(['prison', 'archives', 'chambers', 'cave_crystal'])
    expect(parsed.params.boss.fights[0].arena.theme).toBe('pyramid_inside')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips a forced arena floor pattern', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.theme = 'g_mixed'
    original.boss.fights[0].arena.floorPattern = 'bandsDiag'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.boss.fights[0].arena.floorPattern).toBe('bandsDiag')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown floor pattern and keeps the default', () => {
    const parsed = parseParametersTxt('boss0FloorPattern=spiral')
    expect(parsed.params.boss.fights[0].arena.floorPattern).toBe('random')
    expect(parsed.unknownKeys).toEqual(['boss0FloorPattern value "spiral"'])
  })

  it('round-trips the per-floor locks as a lockFloors= list', () => {
    const original = defaultParameters()
    // the stock campaign locks the floor before the boss-prep lobby and the
    // escape floor — the two the old lockFinalRoom flag sealed
    const text = serializeParametersTxt(original)
    expect(text).toContain('lockFloors=6,7')
    expect(text).not.toContain('lockFinalRoom')

    original.levelLock = original.levelLock!.map((_, i) => ({ enabled: i === 2 }))
    const parsed = parseParametersTxt(serializeParametersTxt(original))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelLock!.map((l) => l.enabled)).toEqual([false, false, true, false, false, false, false, false])
  })

  it('writes an empty lockFloors= line so importing it clears a base campaign\'s locks', () => {
    const original = defaultParameters()
    original.levelLock = undefined
    const text = serializeParametersTxt(original)
    expect(text).toMatch(/^lockFloors=\r?$/m)
    // no locks is stored as absent, the same as a campaign that never had any
    expect(parseParametersTxt(text).params.levelLock).toBeUndefined()
  })

  it('writes a button count other than one as floor:count, and round-trips it', () => {
    const original = defaultParameters()
    original.levelLock = original.levelLock!.map((_, i) =>
      i === 2 ? { enabled: true, buttons: 3 } : i === 5 ? { enabled: true, buttons: 0 } : { enabled: i === 7 }
    )
    const text = serializeParametersTxt(original)
    expect(text).toMatch(/^lockFloors=2:3,5:0,7\r?$/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelLock![2]).toEqual({ enabled: true, buttons: 3 })
    expect(parsed.params.levelLock![5]).toEqual({ enabled: true, buttons: 0 })
    // one button stores no count
    expect(parsed.params.levelLock![7]).toEqual({ enabled: true })
    expect(parseParametersTxt('lockFloors=1:1').params.levelLock![1]).toEqual({ enabled: true })
    expect(parseParametersTxt('lockFloors=1:x').unknownKeys).toEqual(['lockFloors floor "1:x"'])
  })

  it('reports lockFloors entries that are not floors of the campaign', () => {
    const parsed = parseParametersTxt('lockFloors=1,x,99')
    expect(parsed.params.levelLock!.map((l) => l.enabled)).toEqual([false, true, false, false, false, false, false, false])
    expect(parsed.unknownKeys).toEqual(['lockFloors floor "x"', 'lockFloors floor "99"'])
  })

  it('reads a legacy lockFinalRoom line as the floors it used to seal', () => {
    const on = parseParametersTxt('lockFinalRoom=1')
    expect(on.unknownKeys).toEqual([])
    expect(on.params.levelLock).toEqual(gatewayLockedFloors(on.params))
    expect(on.params.levelLock!.map((l) => l.enabled)).toEqual([false, false, false, false, false, false, true, true])

    expect(parseParametersTxt('lockfinalroom=0').params.levelLock).toBeUndefined()
    // an explicit list wins over the legacy flag, whatever the line order
    expect(parseParametersTxt('lockFloors=0\nlockFinalRoom=1').params.levelLock![0].enabled).toBe(true)
    expect(parseParametersTxt('lockFloors=0\nlockFinalRoom=1').params.levelLock![7].enabled).toBe(false)
  })

  it('round-trips lobbySaves as 1/0, defaulting to on when the key is absent', () => {
    const original = defaultParameters()
    expect(serializeParametersTxt(original)).toContain('lobbySaves=1')

    original.lobbySaves = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('lobbySaves=0')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.lobbySaves).toBe(false)
    expect(parsed.unknownKeys).toEqual([])
    expect(parseParametersTxt('lobbysaves=0').params.lobbySaves).toBe(false)
    // absent key keeps the default (on) with no unknown-key noise
    const bare = parseParametersTxt('levels=3')
    expect(bare.params.lobbySaves).toBe(true)
    expect(bare.unknownKeys).toEqual([])
  })

  it('no longer writes finalLockMode, and reports it in a legacy file', () => {
    expect(serializeParametersTxt(defaultParameters())).not.toContain('finalLockMode')

    // the gold-key gate is gone; a file that still asks for it imports fine
    // and gets the button seal, with the dead key reported not fatal
    const parsed = parseParametersTxt('levels=3\nfinalLockMode=key')
    expect(parsed.params.levels).toBe(3)
    // the base's locks survive, fitted to the new floor count
    expect(parsed.params.levelLock).toHaveLength(3)
    expect(parsed.unknownKeys).toEqual(['finalLockMode'])
  })

  it('round-trips the boss options', () => {
    const original = defaultParameters()
    original.boss.enabled = true
    original.boss.fights[0].arena.theme = 'cave_desert'
    original.boss.fights[0].arena.minWidth = 20
    original.boss.fights[0].arena.maxWidth = 40
    original.boss.fights[0].arena.minHeight = 24
    original.boss.fights[0].arena.maxHeight = 48
    original.boss.fights[0].arena.bossPool = ['boss_dragon', 'boss_queen']
    original.boss.fights[0].arena.cover = { pattern: 'ring', density: 0.6, ringSpacing: 5, clusters: 2 }
    original.boss.fights[0].arena.invulnerability = { enabled: true, seconds: [30, 45, 60], countdown: false }
    // waves set out in full rather than patched onto the stock ones, which are
    // long and nearly all scattered — this test is about the wire format
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat', 'tick', 'maggot'],
      monsterMax: { bat: 10, tick: 10, maggot: 10 },
      defaultIntervalMs: 3500
    }
    original.boss.fights[0].arena.waves[1] = {
      monsters: ['skeleton_warrior', 'skeleton_archer'],
      monsterMax: { skeleton_warrior: 10, skeleton_archer: 10 },
      defaultIntervalMs: 2500
    }

    const text = serializeParametersTxt(original)
    // the wire contract: fixed camelCase keys, and the four-field wave encoding
    // — no boss0Gold/Shops/Upgrades any more, since a fight carries no prep
    // room of its own (issue #48); see 'round-trips both rooms' counts' below
    // for the lobby keys that replaced them
    expect(text).toContain('boss0Cover=ring,0.6,5,2')
    expect(text).toContain('boss0Invuln=30,45,60')
    expect(text).toContain('boss0InvulnCountdown=0')
    expect(text).toContain('boss0Wave1=bat,tick,maggot|3500|bat:10,tick:10,maggot:10|')

    const parsed = parseParametersTxt(text)
    // whole-struct comparison, not a dozen field asserts — this is what
    // actually catches a lossy field, since the two-field encoding could
    // round-trip the individually-checked fields while silently dropping
    // monsterMax and intervalMs
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('writes boss<f>Count only when it differs from 1, and round-trips it (issue #64 part 1)', () => {
    const stock = defaultParameters()
    // bossCount is absent by default, so a stock export carries no key.
    expect(serializeParametersTxt(stock)).not.toMatch(/boss0Count=/)

    const original = defaultParameters()
    original.boss.fights[0].arena.bossCount = 3
    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Count=3')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.bossCount).toBe(3)
    expect(parsed.unknownKeys).toEqual([])

    // An old file with no boss<f>Count key at all parses to count 1 (absent).
    const legacyText = text.replace(/\nboss0Count=3/, '')
    const legacyParsed = parseParametersTxt(legacyText)
    expect(legacyParsed.params.boss.fights[0].arena.bossCount).toBeUndefined()
  })

  it('writes boss<f>BodyguardVariants only when off, and round-trips it (issue #64 part 2)', () => {
    const stock = defaultParameters()
    // absent means ON, so a stock export carries no key at all.
    expect(serializeParametersTxt(stock)).not.toMatch(/boss0BodyguardVariants=/)

    const original = defaultParameters()
    original.boss.fights[0].arena.bodyguardVariants = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0BodyguardVariants=false')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.bodyguardVariants).toBe(false)
    expect(parsed.unknownKeys).toEqual([])

    // `true` round-trips to absent, the same shape a fresh fight has.
    const onText = text.replace('boss0BodyguardVariants=false', 'boss0BodyguardVariants=true')
    const onParsed = parseParametersTxt(onText)
    expect(onParsed.params.boss.fights[0].arena.bodyguardVariants).toBeUndefined()
    expect(onParsed.unknownKeys).toEqual([])

    // A garbage value is reported, never thrown, and the key is recognized
    // rather than falling into unknownKeys as an unrecognized key name.
    const garbageText = text.replace('boss0BodyguardVariants=false', 'boss0BodyguardVariants=maybe')
    const garbageParsed = parseParametersTxt(garbageText)
    expect(garbageParsed.unknownKeys.some((k) => k.includes('boss0BodyguardVariants'))).toBe(true)
    expect(garbageParsed.params.boss.fights[0].arena.bodyguardVariants).toBeUndefined()

    // An old file with no key at all parses to "on" (absent).
    const legacyText = text.replace(/\nboss0BodyguardVariants=false/, '')
    const legacyParsed = parseParametersTxt(legacyText)
    expect(legacyParsed.params.boss.fights[0].arena.bodyguardVariants).toBeUndefined()
  })

  it('writes boss<f>Selection/Lineup only in lineup mode, in BOSS_IDS order, and round-trips (issue #64 follow-up)', () => {
    const stock = defaultParameters()
    // 'random' is absent by default, so a stock export carries neither key.
    const stockText = serializeParametersTxt(stock)
    expect(stockText).not.toMatch(/boss0Selection=/)
    expect(stockText).not.toMatch(/boss0Lineup=/)

    const original = defaultParameters()
    original.boss.fights[0].arena.bossSelection = 'lineup'
    // Deliberately inserted out of BOSS_IDS order — the line must still come
    // out in BOSS_IDS order (boss_knight before boss_lich).
    original.boss.fights[0].arena.bossLineup = { boss_lich: 1, boss_knight: 3 }
    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Selection=lineup')
    expect(text).toContain('boss0Lineup=boss_knight:3,boss_lich:1')

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.bossSelection).toBe('lineup')
    expect(parsed.params.boss.fights[0].arena.bossLineup).toEqual({ boss_knight: 3, boss_lich: 1 })

    // An old file with neither key parses to 'random' (absent), untouched.
    const legacyText = stockText
    const legacyParsed = parseParametersTxt(legacyText)
    expect(legacyParsed.params.boss.fights[0].arena.bossSelection).toBeUndefined()
    expect(legacyParsed.params.boss.fights[0].arena.bossLineup).toBeUndefined()
  })

  it('reports a malformed boss<f>Lineup entry as an unknown key, never fatal', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.bossSelection = 'lineup'
    const text = serializeParametersTxt(original).replace(
      /boss0Lineup=[^\n]*/,
      'boss0Lineup=boss_knight:3,not_a_boss:1,boss_lich:oops'
    )
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys.length).toBeGreaterThan(0)
    // The one well-formed entry still parses.
    expect(parsed.params.boss.fights[0].arena.bossLineup).toEqual({ boss_knight: 3 })
  })

  it('round-trips per-monster interval overrides and a -1 (endless) monsterMax', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[2] = {
      monsters: ['eye', 'wisp'],
      monsterMax: { eye: -1, wisp: 5 },
      defaultIntervalMs: 2000,
      intervalMs: { eye: 8000 }
    }

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('rebuilds monsterMax from a user-chosen pool, leaving no undefined entries', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[0].monsters = ['bat', 'tick', 'maggot', 'slime']
    original.boss.fights[0].arena.waves[0].monsterMax = { bat: 20, tick: 5, maggot: 5, slime: 5 }

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    for (const id of original.boss.fights[0].arena.waves[0].monsters) {
      expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax[id]).not.toBeUndefined()
    }
    expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax).toEqual(original.boss.fights[0].arena.waves[0].monsterMax)
  })

  it('round-trips the boss-death tier as boss0Wave5', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[BOSS_DEATH_WAVE] = {
      monsters: ['eye', 'wisp'],
      monsterMax: { eye: 12, wisp: -1 },
      defaultIntervalMs: 1500,
      intervalMs: { wisp: 6000 },
      spawnMode: { eye: 'ring' },
      // The stock death tier is buffed, and buffs ride their own boss0WaveBuff5
      // key rather than a boss0Wave5 field — so replacing the wave leaves them
      // alone, and the literal has to carry them for the round trip to match.
      buffs: bossDeathBuffs()
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Wave5=eye,wisp|1500|eye:12,wisp:-1|wisp:6000|eye:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('leaves the boss-death tier empty for a file written before it existed', () => {
    // A parameters.txt from an older build carries boss0Wave1..4 and nothing
    // else. That file described a fight with no death wave, and that is exactly
    // what it must still describe.
    const parsed = parseParametersTxt('boss0Wave1=bat|4000\nbossWave2=tick|3000\nbossWave3=eye|2000\nbossWave4=lich|1000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves).toHaveLength(BOSS_WAVE_COUNT)
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].monsters).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].monsterMax).toEqual({})
  })

  it('reports a boss0Wave beyond the last tier instead of writing off the end of the array', () => {
    const parsed = parseParametersTxt('boss0Wave6=bat|4000\n')
    expect(parsed.unknownKeys).toEqual(['boss0Wave6'])
    expect(parsed.params.boss.fights[0].arena.waves).toHaveLength(BOSS_WAVE_COUNT)
  })

  it('still parses the legacy two-field bosswave form', () => {
    const parsed = parseParametersTxt('bosswave1=bat|4000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[0].monsters).toEqual(['bat'])
    expect(parsed.params.boss.fights[0].arena.waves[0].defaultIntervalMs).toBe(4000)
    // rebuilt from the pool, not left stale or undefined
    expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax).toEqual({ bat: 10 })
    expect(parsed.params.boss.fights[0].arena.waves[0].intervalMs).toBeUndefined()
  })

  it('accepts a boss0Spawn line written before batching existed', () => {
    // Invariant #5: the old three-field form keeps working, and the two fields
    // it predates keep their defaults rather than becoming NaN.
    const parsed = parseParametersTxt('boss0Spawn=3,6,5\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.spawn).toEqual({
      spacing: 3,
      ringSpacing: 6,
      clusters: 5,
      batchSize: defaultParameters().boss.fights[0].arena.spawn.batchSize,
      batchIntervalMs: defaultParameters().boss.fights[0].arena.spawn.batchIntervalMs
    })
  })

  it('round-trips the scatter spawn knobs and per-monster spawn modes', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.spawn = { spacing: 3, ringSpacing: 6, clusters: 5, batchSize: 12, batchIntervalMs: 2500 }
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat', 'tick', 'maggot'],
      monsterMax: { bat: 10, tick: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat: 'gaussian', maggot: 'ring' }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Spawn=3,6,5,12,2500')
    // the fifth wave field, sorted by id like the interval overrides before it
    expect(text).toContain('boss0Wave1=bat,tick,maggot|4000|bat:10,tick:10,maggot:10||bat:gaussian,maggot:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips the arena multipliers, which are not the dungeon\'s', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.monsterMultiplier = 2.5
    original.boss.fights[0].arena.foodMultiplier = 0
    // the dungeon's own multipliers stay put — the whole point of separate keys
    original.monsterMultiplier = 1.0
    original.foodMultiplier = 1.2

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0MonsterMultiplier=2.500000')
    expect(text).toContain('boss0FoodMultiplier=0.000000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.params.monsterMultiplier).toBe(1.0)
    expect(parsed.params.foodMultiplier).toBe(1.2)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed arena multiplier instead of writing NaN', () => {
    const parsed = parseParametersTxt('boss0MonsterMultiplier=lots\nbossFoodMultiplier=1.5\n')
    expect(parsed.unknownKeys).toEqual(['boss0MonsterMultiplier value "lots"'])
    expect(parsed.params.boss.fights[0].arena.monsterMultiplier).toBe(1.0)
    expect(parsed.params.boss.fights[0].arena.foodMultiplier).toBe(1.5)
  })

  it('writes no spawn-mode field while every monster is on the anchors mode', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[0] = {
      monsters: ['bat', 'tick', 'maggot'],
      monsterMax: { bat: 10, tick: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat: 'anchors' }
    }
    expect(serializeParametersTxt(params)).toContain(
      'boss0Wave1=bat,tick,maggot|4000|bat:10,tick:10,maggot:10||\r\n'
    )
  })

  it('drops a spawn mode naming an unknown mode or a monster outside the pool', () => {
    const parsed = parseParametersTxt('bosswave1=bat|4000|||bat:spiral,tick:random\n')
    expect(parsed.params.boss.fights[0].arena.waves[0].spawnMode).toBeUndefined()
    expect(parsed.unknownKeys).toEqual([
      'bosswave1 spawnMode "bat:spiral"',
      'bosswave1 spawnMode "tick:random"'
    ])
  })

  it('reports a malformed bossspawn line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bossspawn=abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(3)
    expect(parsed.params.boss.fights[0].arena.spawn).toEqual(defaultParameters().boss.fights[0].arena.spawn)
  })

  it('reports a malformed bosscover line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bosscover=nonsense,abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(4)
    expect(parsed.params.boss.fights[0].arena.cover).toEqual(defaultParameters().boss.fights[0].arena.cover)
  })

  it('reports an unrecognised boss key without throwing', () => {
    const parsed = parseParametersTxt('bossNonsense=1\nlevels=4')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.unknownKeys).toEqual(['bossNonsense'])
  })

  it('back-fills a default boss block when the base object predates the feature', () => {
    const legacyBase = defaultParameters() as Partial<ReturnType<typeof defaultParameters>>
    delete legacyBase.boss
    const parsed = parseParametersTxt('levels=3\n', legacyBase as ReturnType<typeof defaultParameters>)
    expect(parsed.params.boss).toEqual(defaultParameters().boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('a stock run writes no player lines', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).not.toMatch(/^player\./m)
  })

  it('round-trips player settings: class stats, skill tiers and a class\'s own speed', () => {
    const original = defaultParameters()
    original.playerTweaks = {
      [statKey('warlock', 'base-health')]: 400,
      [skillKey('warlock_dagger:warlock_dagger_dmg', 2, 'dagger-dmg')]: 99,
      [skillKey('warlock_gargoyle', 1, 'cost')]: 0,
      [skillKey('wiz_misc_mana', 3, 'player-mana-regen-set')]: 3.5,
      [skillKey('shared_speed_melee', 1, 'movespeed-mul', 'thief')]: 2
    }
    const text = serializeParametersTxt(original)
    expect(text).toContain('player.class.warlock.base-health=400')
    expect(text).toContain('player.warlock_dagger:warlock_dagger_dmg.2.dagger-dmg=99')
    expect(text).toContain('player.thief@shared_speed_melee.1.movespeed-mul=2')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.playerTweaks).toEqual(original.playerTweaks)
  })

  it('round-trips a whole quick-setup roster', () => {
    const original = defaultParameters()
    original.playerTweaks = setClassSpeed(applyGroupFactor('damage', 2.5, applyFullyUpgraded({})), 'priest', 1.7)
    const parsed = parseParametersTxt(serializeParametersTxt(original))
    expect(parsed.unknownKeys).toEqual([])
    expect(prunePlayerTweaks(parsed.params.playerTweaks)).toEqual(prunePlayerTweaks(original.playerTweaks))
  })

  it('drops player values that equal the stock game', () => {
    const parsed = parseParametersTxt(`${statKey('paladin', 'base-health')}=75`)
    expect(parsed.params.playerTweaks).toEqual({})
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports original-Hammerwatch and unknown player keys without throwing', () => {
    const parsed = parseParametersTxt('player.knight.param.max-health=120\nplayer.bogus.param.nope=5\nlevels=4')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.unknownKeys).toEqual(['player.knight.param.max-health', 'player.bogus.param.nope'])
    expect(parsed.params.playerTweaks).toEqual({})
  })
})

describe('parameters.txt — boss wave variant keys (issue #20)', () => {
  it('round-trips variant keys through the wave encoding', () => {
    // `#` has to survive the |, `,` and `:` separators of the wave grammar.
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat', 'bat#0', 'skeleton_archer#2'],
      monsterMax: { bat: 10, 'bat#0': 3, 'skeleton_archer#2': 5 },
      defaultIntervalMs: 4000,
      intervalMs: { 'bat#0': 5000 }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Wave1=bat,bat#0,skeleton_archer#2|4000|bat:10,bat#0:3,skeleton_archer#2:5|bat#0:5000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.waves[0]).toEqual(original.boss.fights[0].arena.waves[0])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('re-serializes a parsed variant wave byte-identically', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[2].monsters = ['skeleton_warrior#0', 'skeleton_lich#3']
    original.boss.fights[0].arena.waves[2].monsterMax = { 'skeleton_warrior#0': -1, 'skeleton_lich#3': 2 }

    const text = serializeParametersTxt(original)
    expect(serializeParametersTxt(parseParametersTxt(text).params)).toBe(text)
  })
})

describe('parameters.txt — boss invulnerability', () => {
  it('writes `off` and keeps the window lengths out of the file entirely', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.invulnerability.enabled = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Invuln=off')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.invulnerability.enabled).toBe(false)
    // the lengths come back at their defaults, exactly as for a file that never
    // mentioned them
    expect(parsed.params.boss.fights[0].arena.invulnerability.seconds).toEqual([30, 30, 30])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reads one value as "same for every threshold"', () => {
    const parsed = parseParametersTxt('boss0Invuln=45')
    expect(parsed.params.boss.fights[0].arena.invulnerability).toEqual({ enabled: true, seconds: [45, 45, 45], countdown: true })
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed segment and keeps that one threshold at its default', () => {
    const parsed = parseParametersTxt('boss0Invuln=10,nope,20')
    expect(parsed.params.boss.fights[0].arena.invulnerability.seconds).toEqual([10, 30, 20])
    expect(parsed.unknownKeys).toEqual(['boss0Invuln value "nope"'])
  })

  it('reads the countdown flag', () => {
    expect(parseParametersTxt('boss0InvulnCountdown=0').params.boss.fights[0].arena.invulnerability.countdown).toBe(false)
    expect(parseParametersTxt('boss0InvulnCountdown=1').params.boss.fights[0].arena.invulnerability.countdown).toBe(true)
  })

  it('leaves a legacy file with no invulnerability keys on the stock windows', () => {
    const parsed = parseParametersTxt('boss=1\nbossGold=500')
    expect(parsed.params.boss.fights[0].arena.invulnerability).toEqual({ enabled: true, seconds: [30, 30, 30], countdown: true })
  })
})

describe('parameters.txt — boss checkpoints', () => {
  it('round-trips the stock defaults', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).toContain('boss0Checkpoints=75-50-25-dead,50')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '75-50-25-dead',
      saveGame: '50'
    })
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reads both presets independently', () => {
    const parsed = parseParametersTxt('boss0Checkpoints=never,75-50-25')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: 'never',
      saveGame: '75-50-25'
    })
  })

  it('reports an unknown respawn preset and keeps that field at its default', () => {
    const parsed = parseParametersTxt('boss0Checkpoints=nope,50')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '75-50-25-dead',
      saveGame: '50'
    })
    expect(parsed.unknownKeys).toEqual(['boss0Checkpoints value "nope"'])
  })

  it('reports an unknown save preset and keeps that field at its default', () => {
    const parsed = parseParametersTxt('boss0Checkpoints=50,nope')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '50',
      saveGame: '50' // default kept
    })
    expect(parsed.unknownKeys).toEqual(['boss0Checkpoints value "nope"'])
  })

  it('a legacy three-field line reports the stray third segment and keeps saveGame at its default', () => {
    // boss0Checkpoints=75-50-25,1,1 is what the one-checkbox-pair build wrote —
    // "1" is not a valid preset id, so it is reported and saveGame keeps its default
    const parsed = parseParametersTxt('boss0Checkpoints=75-50-25,1,1')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '75-50-25',
      saveGame: '50'
    })
    expect(parsed.unknownKeys).toEqual(['boss0Checkpoints value "1"'])
  })

  it('handles a second fight independently', () => {
    const parsed = parseParametersTxt('bossFights=2\nboss1Checkpoints=50,never')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '75-50-25-dead',
      saveGame: '50'
    })
    expect(parsed.params.boss.fights[1].arena.checkpoints).toEqual({
      respawnPlayers: '50',
      saveGame: 'never'
    })
  })

  it('leaves a legacy file with no checkpoint key on the stock defaults', () => {
    const parsed = parseParametersTxt('boss=1\nbossGold=500')
    expect(parsed.params.boss.fights[0].arena.checkpoints).toEqual({
      respawnPlayers: '75-50-25-dead',
      saveGame: '50'
    })
  })
})

describe('bossWavePickupN — per-tier item drops', () => {
  it('writes no wave-pickup line at all while no tier drops anything', () => {
    // The stock defaults drop on three tiers, so this has to strip them first —
    // the point of the test is that a dropless arena emits no key.
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map(({ pickups: _pickups, ...w }) => w)
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/^boss0WavePickup\d=/m)
  })

  it('writes the stock drop table and reads it back', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).toContain('boss0WavePickup3=powerup_health:1|mana_2:2')
    expect(text).toContain('boss0WavePickup4=potion_2:1')
    expect(text).toContain('boss0WavePickup5=powerup_health:2|mana_2:4')
    expect(text).not.toMatch(/^boss0WavePickup[12]=/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].pickups).toEqual([
      { item: 'powerup_health', count: 2 },
      { item: 'mana_2', count: 4 }
    ])
  })

  it('writes one line per dropping tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 0) return { ...w, pickups: [{ item: 'potion_1', count: 3 }] }
      return { ...w, pickups: [] }
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WavePickup1=potion_1:3')
    expect(text).not.toMatch(/^boss0WavePickup[2-5]=/m)

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'potion_1', count: 3 }])
  })

  it('drops the stock table for a tier the file describes without a pickup line', () => {
    // A file written before pickups existed describes a fight with no drops.
    // Inheriting the stock table would hand it three tiers of loot it never had.
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].pickups).toBeUndefined()
    // untouched tiers keep theirs
    expect(wavePickups(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE])).toHaveLength(2)
  })

  it('accepts the two keys in either order', () => {
    const pickupFirst = parseParametersTxt('boss0WavePickup3=mana_2:2\r\nbossWave3=eye|2000|eye:10')
    const waveFirst = parseParametersTxt('boss0Wave3=eye|2000|eye:10\r\nbossWavePickup3=mana_2:2')
    expect(pickupFirst.params.boss.fights[0].arena.waves[2].pickups).toEqual([{ item: 'mana_2', count: 2 }])
    expect(waveFirst.params.boss.fights[0].arena.waves[2].pickups).toEqual([{ item: 'mana_2', count: 2 }])
  })

  it('reads a bare item with no count as one copy', () => {
    const parsed = parseParametersTxt('boss0WavePickup1=health_4')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'health_4', count: 1 }])
  })

  it('reports an unknown item and a junk count without failing the import', () => {
    const parsed = parseParametersTxt('boss0WavePickup1=no_such_item:2|health_4:lots|mana_2:3')
    expect(parsed.unknownKeys).toEqual([
      'boss0WavePickup1 item "no_such_item"',
      'boss0WavePickup1 count "lots"'
    ])
    expect(parsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'mana_2', count: 3 }])
  })

  it('leaves the bossWaveN lines byte-identical — no trailing sixth field', () => {
    // The drops ride their own key precisely so an export written before the
    // feature still round-trips to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w) => ({
      ...w,
      pickups: [{ item: 'health_1', count: 2 }]
    }))
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    expect(after).toEqual(before)
  })
})

describe('bossWaveBuffN — per-tier arena buffs', () => {
  it('writes no wave-buff line at all while no tier carries one', () => {
    // The stock defaults buff the boss-death tier, so this has to strip them
    // first — the point of the test is that an unbuffed arena emits no key.
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map(({ buffs: _buffs, ...w }) => w)
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/^boss0WaveBuff\d=/m)
  })

  it('writes the stock boss-death bloodlust and reads it back', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).toContain('boss0WaveBuff5=bloodlust:monsters')
    expect(text).not.toMatch(/^boss0WaveBuff[1-4]=/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].buffs).toEqual([
      { buff: 'bloodlust', target: 'monsters' }
    ])
  })

  it('writes one line per buffed tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 0) return { ...w, buffs: [{ buff: 'bloodlust', target: 'monsters' as const }] }
      if (i === 3) return { ...w, buffs: [{ buff: 'frost', target: 'players' as const }] }
      return w
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WaveBuff1=bloodlust:monsters')
    expect(text).toContain('boss0WaveBuff4=frost:players')
    expect(text).not.toContain('boss0WaveBuff2=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[0])).toEqual([
      { buff: 'bloodlust', target: 'monsters' }
    ])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[3])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[1])).toEqual([])
  })

  it('round-trips several buffs on one tier', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 0
        ? {
            ...w,
            buffs: [
              { buff: 'bloodlust', target: 'monsters' as const },
              { buff: 'frost', target: 'players' as const }
            ]
          }
        : w
    )

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WaveBuff1=bloodlust:monsters|frost:players')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[0])).toEqual([
      { buff: 'bloodlust', target: 'monsters' },
      { buff: 'frost', target: 'players' }
    ])
  })

  it('reads a line written when a tier could only carry one buff', () => {
    const parsed = parseParametersTxt('boss0WaveBuff1=frost:monsters')
    expect(parsed.unknownKeys).toEqual([])
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[0])).toEqual([{ buff: 'frost', target: 'monsters' }])
  })

  it('reads a tier stored in the legacy single-buff fields', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[0].buff = 'frost'
    params.boss.fights[0].arena.waves[0].buffTarget = 'both'
    expect(serializeParametersTxt(params)).toContain('boss0WaveBuff1=frost:both')
  })

  it('leaves the bossWaveN lines byte-identical — no trailing sixth field', () => {
    // The buff rides its own key precisely so an export written before the
    // feature still round-trips to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w) => ({
      ...w,
      buffs: [{ buff: 'frost', target: 'both' as const }]
    }))
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    expect(after).toEqual(before)
  })

  it('reports an unknown buff id and leaves the tier alone', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=no_such_buff:players')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 buff "no_such_buff"'])
  })

  it('reports an unknown target and leaves the tier alone', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=frost:everyone')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 target "everyone"'])
  })

  it('keeps the good entries when one segment of a tier is bad', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=frost:players|no_such_buff:both')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 buff "no_such_buff"'])
  })

  it('reports a tier index outside the wave count', () => {
    const parsed = parseParametersTxt('boss0WaveBuff9=frost:players')
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff9'])
  })

  it('defaults an omitted target to players', () => {
    const parsed = parseParametersTxt('boss0WaveBuff1=frost')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[0])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual([])
  })
  // The serializer writes no line for a buff-less tier, so the parser has to
  // read a described tier with no buff line as "none" — or the stock death
  // tier's bloodlust came back on every import of a fight that had removed it.
  it('round-trips a death tier whose stock buff was removed', () => {
    const params = defaultParameters()
    delete params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].buffs
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/^boss0WaveBuff\d=/m)
    const reparsed = parseParametersTxt(text)
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE])).toEqual([])
    expect(reparsed.params).toEqual(params)
  })

  it('keeps the stock death-tier buff when the file says nothing about that tier', () => {
    const parsed = parseParametersTxt('boss0Wave1=bat|1000|bat:10||')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE])).toEqual([
      { buff: 'bloodlust', target: 'monsters' }
    ])
  })
})

describe('buffN — per-floor buff auras', () => {
  it('writes no buff line at all while every floor is empty', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).not.toMatch(/^buff\d+=/m)
  })

  it('writes one line per buffed floor and round-trips it', () => {
    const params = defaultParameters()
    const levelBuffs = params.levelBuffs!
    levelBuffs[0] = [
      { buff: 'frost', target: 'players' },
      { buff: 'bloodlust', target: 'monsters' }
    ]
    levelBuffs[3] = [{ buff: 'slime_poison', target: 'both' }]

    const text = serializeParametersTxt(params)
    expect(text).toContain('buff0=frost:players|bloodlust:monsters')
    expect(text).toContain('buff3=slime_poison:both')
    expect(text).not.toContain('buff1=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.levelBuffs).toEqual(levelBuffs)
  })

  it('leaves a file written before buffs existed with every floor empty', () => {
    const parsed = parseParametersTxt('levels=7')
    expect(parsed.params.levelBuffs?.every((list) => list.length === 0)).toBe(true)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown buff id and keeps the rest of the line', () => {
    const parsed = parseParametersTxt('levels=2\nbuff0=frost:players|no_such_buff:both')
    expect(parsed.params.levelBuffs?.[0]).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual(['buff0 buff "no_such_buff"'])
  })

  it('reports an unknown target and keeps the rest of the line', () => {
    const parsed = parseParametersTxt('levels=2\nbuff0=frost:everyone|cripple:monsters')
    expect(parsed.params.levelBuffs?.[0]).toEqual([{ buff: 'cripple', target: 'monsters' }])
    expect(parsed.unknownKeys).toEqual(['buff0 target "everyone"'])
  })

  it('defaults an omitted target to players', () => {
    const parsed = parseParametersTxt('levels=2\nbuff1=frost')
    expect(parsed.params.levelBuffs?.[1]).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('pads unmentioned floors with an empty list', () => {
    const parsed = parseParametersTxt('levels=4\nbuff2=frost:players')
    expect(parsed.params.levelBuffs).toHaveLength(4)
    expect(parsed.params.levelBuffs?.map((list) => list.length)).toEqual([0, 0, 1, 0])
  })
})

describe('timerN — per-floor timer mode', () => {
  it('writes no timer line at all while every floor is off', () => {
    const text = serializeParametersTxt(plainParameters())
    expect(text).not.toMatch(/^timer\d+=/m)
  })

  // The shipped campaign arms exactly one floor — the escape floor after the
  // boss — so its export carries that one line and no other.
  it('writes the shipped escape floor\'s timer, and only that one', () => {
    const params = defaultParameters()
    const text = serializeParametersTxt(params)
    expect(text.match(/^timer\d+=.*$/gm)).toEqual([`timer${params.levels - 1}=1|90|1|100|1`])
  })

  it('writes one line per armed floor and round-trips it', () => {
    const params = defaultParameters()
    const timers = params.levelTimers!
    timers[0] = { enabled: true, seconds: 90, damage: 4, freqMs: 500, countdown: true }
    timers[3] = { enabled: true, seconds: 30, damage: -2, freqMs: 2000, countdown: false }

    const text = serializeParametersTxt(params)
    expect(text).toContain('timer0=1|90|4|500|1')
    expect(text).toContain('timer3=1|30|-2|2000|0')
    expect(text).not.toContain('timer1=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.levelTimers).toEqual(timers)
  })

  it('leaves a file written before timer mode existed entirely on the defaults', () => {
    const parsed = parseParametersTxt('levels=7')
    expect(parsed.params.levelTimers?.every((t) => !t.enabled)).toBe(true)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('explicitly clears castle\'s escape-floor timer when it is turned off, and round-trips it', () => {
    // The bug this guards: the base `parseParametersTxt(content)` (no base)
    // overlays onto — `defaultParameters()` — arms its LAST floor (the escape
    // floor) with a 90s timer. Turning that floor's timer off used to write
    // nothing (the old "only when enabled" rule), so re-importing silently
    // turned it back on.
    const params = defaultParameters()
    params.levelTimers![params.levels - 1].enabled = false

    const text = serializeParametersTxt(params)
    expect(text).toMatch(new RegExp(`^timer${params.levels - 1}=0\\|`, 'm'))

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelTimers?.[params.levels - 1].enabled).toBe(false)
    expect(parsed.params.levelTimers).toEqual(params.levelTimers)
  })

  it('reports a malformed segment and keeps only that field at its default', () => {
    const parsed = parseParametersTxt('levels=2\ntimer0=1|nope|5|250|1')
    expect(parsed.params.levelTimers?.[0]).toEqual({
      enabled: true,
      seconds: 180,
      damage: 5,
      freqMs: 250,
      countdown: true
    })
    expect(parsed.unknownKeys).toEqual(['timer0 seconds "nope"'])
  })

  it('pads unmentioned floors with a disabled timer', () => {
    const parsed = parseParametersTxt('levels=4\ntimer2=1|10|1|100|1')
    expect(parsed.params.levelTimers).toHaveLength(4)
    expect(parsed.params.levelTimers?.map((t) => t.enabled)).toEqual([false, false, true, false])
  })
})

describe('musicN — per-floor music', () => {
  it('explicitly clears every floor\'s inherited base track when they are all reset to default', () => {
    // plainParameters() resets floorMusic to `default` at every floor, but
    // the base parseParametersTxt(content) (no base) overlays onto —
    // defaultParameters() — carries a real act1..act4 track at all 7 of
    // these indices. Omitting the line would silently inherit those back, so
    // every floor needs its own explicit `musicN=default` line — the same
    // fix pre-alpha's round trip needs.
    const params = plainParameters()
    const text = serializeParametersTxt(params)
    expect(text.match(/^music\d+=default$/gm)).toHaveLength(params.levels)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.floorMusic).toEqual(params.floorMusic)
  })

  it('a stock export carries one music line per floor — the 070 parameter set', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text.match(/^music\d+=/gm)).toHaveLength(8)
  })

  it('writes one line per floor whenever it differs from the inherited base track, and round-trips it', () => {
    const params = defaultParameters()
    params.floorMusic = params.themes.map(() => 'default')
    params.floorMusic[0] = 'act1'
    params.floorMusic[3] = 'boss_final'

    const text = serializeParametersTxt(params)
    expect(text).toContain('music0=act1')
    expect(text).toContain('music3=boss_final')
    // Every other floor is explicitly cleared to `default` too: the base
    // (defaultParameters() itself here) carries a real track at each of
    // these indices, so omitting the line would silently inherit it back.
    for (const i of [1, 2, 4, 5, 6, 7]) {
      expect(text).toContain(`music${i}=default`)
    }

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.floorMusic).toEqual(params.floorMusic)
  })

  it('leaves a file written before music existed entirely on the defaults', () => {
    // No base is passed, so parsing starts from defaultParameters() — the
    // 070 parameter set, which carries its own floorMusic. With no musicN
    // line in the file at all, that inherited array is left as-is (padded/
    // trimmed to the declared floor count), same as the legacy buff/trap/
    // timer arrays above.
    const parsed = parseParametersTxt('levels=7')
    expect(parsed.params.floorMusic).toEqual(defaultParameters().floorMusic?.slice(0, 7))
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown track id and keeps the default', () => {
    const parsed = parseParametersTxt('levels=2\nmusic0=not-a-track')
    expect(parsed.params.floorMusic?.[0]).toBe('default')
    expect(parsed.unknownKeys).toEqual(['music0 value "not-a-track"'])
  })

  it('pads unmentioned floors with the default sentinel', () => {
    const parsed = parseParametersTxt('levels=4\nmusic2=act2')
    expect(parsed.params.floorMusic).toHaveLength(4)
    expect(parsed.params.floorMusic).toEqual(['default', 'default', 'act2', 'default'])
  })
})

describe('parameters.txt — free upgrades', () => {
  it('round-trips both stock lobbies\' counts independently', () => {
    const original = defaultParameters()
    original.lobbies[0].upgrades = { ...noUpgrades(), damage: 3, mana2: 12 }
    original.lobbies[1].upgrades = { ...oneOfEachUpgrade(), health: 0 }

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.lobbies[0].upgrades).toEqual(original.lobbies[0].upgrades)
    expect(parsed.params.lobbies[1].upgrades).toEqual(original.lobbies[1].upgrades)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('writes the counts in UPGRADE_KINDS order', () => {
    const original = defaultParameters()
    original.lobbies[0].upgrades = { ...noUpgrades(), damage: 1, mana2: 8 }
    const text = serializeParametersTxt(original)
    expect(text).toContain('lobby0Upgrades=1 0 0 0 0 0 0 8')
  })

  // a file written before the feature existed carries no key at all
  it('leaves the defaults alone when the key is absent', () => {
    const parsed = parseParametersTxt('levels=3\n')
    expect(parsed.params.lobbies).toEqual(defaultParameters().lobbies)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed count without dropping the rest of the line', () => {
    const parsed = parseParametersTxt('lobby0Upgrades=2 -1 x 4 5 6 7 8\n')
    expect(parsed.params.lobbies[0].upgrades).toEqual({
      ...noUpgrades(),
      damage: 2,
      mana: 4,
      damage2: 5,
      defense2: 6,
      health2: 7,
      mana2: 8
    })
    expect(parsed.unknownKeys).toEqual(['lobby0Upgrades value "-1"', 'lobby0Upgrades value "x"'])
  })

  it('reads an 8-value line from before speed/attack speed, the new kinds at zero', () => {
    const parsed = parseParametersTxt('lobby0Upgrades=1 1 1 1 1 1 1 1\n')
    expect(parsed.params.lobbies[0].upgrades).toEqual({ ...oneOfEachUpgrade(), speed: 0, attackspeed: 0, speed2: 0, attackspeed2: 0 })
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports values past the twelve kinds, and takes the twelve it knows', () => {
    const parsed = parseParametersTxt('lobby1Upgrades=1 1 1 1 1 1 1 1 1 1 1 1 1 2\n')
    expect(parsed.params.lobbies[1].upgrades).toEqual(oneOfEachUpgrade())
    expect(parsed.unknownKeys).toEqual([
      'lobby1Upgrades extra value "1"',
      'lobby1Upgrades extra value "2"'
    ])
  })

  it('leaves the kinds a short list does not reach at zero', () => {
    const parsed = parseParametersTxt('lobby0Upgrades=4 5\n')
    expect(parsed.params.lobbies[0].upgrades).toEqual({ ...noUpgrades(), damage: 4, defense: 5 })
    expect(parsed.unknownKeys).toEqual([])
  })

  // Issue #48 is a HARD BREAK on the old keys: the campaign's one lobby
  // (`lobby`/`lobbyGold`/`lobbyShops`/`lobbyUpgrades`) and a fight's welded-on
  // prep room (`boss<i>Gold`/`Shops`/`Upgrades`) are both gone. None of them
  // is aliased onto the new shape — a file naming them reports every one as
  // unknown, but still imports (invariant #5).
  it('reports the old singular lobby keys and boss<i>Upgrades as unknown, never fatal', () => {
    const parsed = parseParametersTxt(
      ['lobby=1', 'lobbyGold=5000', 'lobbyShops=power', 'lobbyUpgrades=1 0 0 0 0 0 0 0', 'boss0Upgrades=1 0 0 0 0 0 0 0'].join(
        '\n'
      )
    )
    expect(parsed.unknownKeys.slice().sort()).toEqual(
      ['boss0Upgrades', 'lobby', 'lobbyGold', 'lobbyShops', 'lobbyUpgrades'].sort()
    )
    // and the defaults are untouched — no silent lobby-0 alias
    expect(parsed.params.lobbies).toEqual(defaultParameters().lobbies)
  })
})

describe('parameters.txt — lobbies (issue #48)', () => {
  it('round-trips preset, gold and shops for several lobbies', () => {
    // mutates the two stock lobbies in place — the STOCK COUNT, so the
    // shipped levelOrder (which names exactly these two) stays valid and the
    // round trip does not have to reconcile a stale base against a changed
    // lobby count (see the config file's own note on why base + diff files
    // must be re-parsed against the object they were exported from)
    const original = defaultParameters()
    original.lobbies[0].startingGold = 2500
    original.lobbies[0].preset = 'standin'
    original.lobbies[1].shopCategories = ['misc1', 'power']
    original.lobbies[1].startingGold = 15000

    const text = serializeParametersTxt(original)
    expect(text).toContain('lobbies=2')
    expect(text).toContain('lobby0Preset=standin')
    expect(text).toContain('lobby0Gold=2500')
    expect(text).toContain('lobby1Shops=misc1 power')
    expect(text).toContain('lobby1Gold=15000')

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toEqual(original.lobbies)
    expect(parsed.params.levelOrder).toEqual(original.levelOrder)
  })

  it('overwrites a named lobby without a `lobbies=` count, and never trims', () => {
    // index 1 already exists (the base object's second stock lobby is
    // 'standin'); naming it a different preset proves the key was
    // actually read rather than just already matching the default
    const text = ['lobby1Preset=standin'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toHaveLength(2)
    expect(parsed.params.lobbies[1].preset).toBe('standin')
  })

  it('grows past the base object\'s own lobbies when a higher index is named', () => {
    const text = ['lobby3Gold=5000'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toHaveLength(4)
    expect(parsed.params.lobbies[3].startingGold).toBe(5000)
    // the gap is filled with the stock preset, not left undefined
    expect(parsed.params.lobbies[2].preset).toBe(DEFAULT_LOBBY_PRESET_ID)
  })

  it('an explicit `lobbies=0` clears the list entirely', () => {
    const parsed = parseParametersTxt('lobbies=0')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toEqual([])
  })

  it('reports keys for a lobby past `lobbies` instead of adding one', () => {
    const text = ['lobbies=1', 'lobby0Preset=standin', 'lobby1Preset=standin'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.params.lobbies).toHaveLength(1)
    expect(parsed.unknownKeys).toEqual(['lobby1Preset'])
  })

  it('reports an unknown preset id and keeps the default', () => {
    const parsed = parseParametersTxt('lobby0Preset=nonsense')
    expect(parsed.unknownKeys).toEqual(['lobby0Preset value "nonsense"'])
    expect(parsed.params.lobbies[0].preset).toBe(defaultParameters().lobbies[0].preset)
  })

  it('reports malformed gold instead of throwing', () => {
    const parsed = parseParametersTxt('lobby0Gold=abc')
    expect(parsed.unknownKeys).toEqual(['lobby0Gold'])
    expect(parsed.params.lobbies[0].startingGold).toBe(defaultParameters().lobbies[0].startingGold)
  })

  it('reports a malformed shop column instead of throwing', () => {
    const parsed = parseParametersTxt('lobby0Shops=misc1 nonsense power')
    expect(parsed.params.lobbies[0].shopCategories).toEqual(['misc1', 'power'])
    expect(parsed.unknownKeys).toEqual(['lobby0Shops value "nonsense"'])
  })

  it('explicitly clears an inherited lobby music line when unset, and round-trips one that is set', () => {
    const original = defaultParameters()
    // the stock boss-prep lobby (index 1) already carries its own music
    // ('boss_1', the 070 parameter set) — clearing it back to unset has to
    // say so explicitly, or `parseParametersTxt(content)` (no base) — which
    // overlays onto defaultParameters(), the same object `original` started
    // from — would silently inherit that stock 'boss_1' back.
    original.lobbies[1].music = undefined
    let text = serializeParametersTxt(original)
    expect(text).toMatch(/^lobby1Music=default$/m)
    expect(text).not.toMatch(/^lobby0Music=/m)

    let parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toEqual(original.lobbies)

    original.lobbies[1].music = 'boss_1'
    text = serializeParametersTxt(original)
    expect(text).toContain('lobby1Music=boss_1')
    expect(text).not.toMatch(/^lobby0Music=/m)

    parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.lobbies).toEqual(original.lobbies)
  })

  it('reports an unknown lobby music id and keeps it unset', () => {
    const parsed = parseParametersTxt('lobby0Music=nope')
    expect(parsed.unknownKeys).toEqual(['lobby0Music value "nope"'])
    expect(parsed.params.lobbies[0].music).toBeUndefined()
  })
})

describe('parameters.txt — multiple boss fights (issue #43)', () => {
  it('writes one full indexed block per fight and reads it back', () => {
    const original = defaultParameters()
    const stock = original.boss.fights[0]
    original.boss.fights = [
      JSON.parse(JSON.stringify(stock)),
      JSON.parse(JSON.stringify(stock)),
      JSON.parse(JSON.stringify(stock))
    ]
    original.boss.fights[1].arena.theme = 'cave_desert'
    original.boss.fights[1].arena.bossPool = ['boss_anubis']
    original.boss.fights[2].arena.cover = { pattern: 'ring', density: 0.2, ringSpacing: 5, clusters: 2 }
    original.boss.fights[2].arena.waves[0].defaultIntervalMs = 7000

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossFights=3')
    expect(text).toContain('boss1Theme=cave_desert')
    expect(text).toContain('boss1Pool=boss_anubis')
    expect(text).toContain('boss2Cover=ring,0.2,5,2')
    expect(text).toMatch(/^boss2Wave1=[^|]*\|7000\|/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss).toEqual(original.boss)
  })

  it('derives the fight count from the highest index when bossFights is absent', () => {
    const text = ['boss=1', 'boss1Theme=cave_desert'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights).toHaveLength(2)
    expect(parsed.params.boss.fights[1].arena.theme).toBe('cave_desert')
    // the fight it never mentioned is the stock one
    expect(parsed.params.boss.fights[0]).toEqual(defaultParameters().boss.fights[0])
  })

  it('reports keys for a fight past bossFights instead of adding one', () => {
    // boss1Width is a real, recognized suffix — the point is that its INDEX
    // is past the declared count, not that the suffix itself is unknown
    const text = ['boss=1', 'bossFights=1', 'boss1Theme=cave_desert', 'boss1Width=10,20'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights).toHaveLength(1)
    expect(parsed.unknownKeys).toEqual(['boss1Theme', 'boss1Width'])
  })

  it('keeps the per-fight wave post-passes from leaking across fights', () => {
    // fight 0's tiers are fully described (so its stock pickups are cleared);
    // fight 1 is never mentioned and must keep the stock drop table intact
    const stock = defaultParameters().boss.fights[0]
    const lines = ['boss=1', 'bossFights=2']
    for (let i = 0; i < BOSS_WAVE_COUNT; i++) {
      lines.push(`boss0Wave${i + 1}=bat|2000|bat:5||`)
    }
    const parsed = parseParametersTxt(lines.join('\r\n'))

    expect(wavePickups(parsed.params.boss.fights[0].arena.waves[2])).toEqual([])
    expect(wavePickups(parsed.params.boss.fights[1].arena.waves[2])).toEqual(
      wavePickups(stock.arena.waves[2])
    )
  })

  it('still imports the unprefixed arena keys older files used, as fight 0', () => {
    const text = ['boss=1', 'bossTheme=cave_desert', 'bossGold=1500', 'bossWave1=bat|2500|bat:9||'].join('\r\n')
    const parsed = parseParametersTxt(text)

    // bossTheme and bossWave1 still land on fight 0, unprefixed form and all
    expect(parsed.params.boss.fights).toHaveLength(1)
    expect(parsed.params.boss.fights[0].arena.theme).toBe('cave_desert')
    expect(parsed.params.boss.fights[0].arena.waves[0].monsters).toEqual(['bat'])
    // bossGold named the fight's old welded-on prep room, gone since issue
    // #48 — not aliased onto a lobby, so it is reported like any other key
    // this parser no longer recognizes (invariant #5: never fatal)
    expect(parsed.unknownKeys).toEqual(['bossGold'])
  })

  it('explicitly clears an inherited boss music line when unset, and round-trips one that is set', () => {
    const original = defaultParameters()
    // the stock default already carries its own arena music (070 parameter
    // set, 'boss_final') — clearing it back to unset has to say so
    // explicitly, or `parseParametersTxt(content)` (no base) — which overlays
    // onto defaultParameters(), the same object `original` started from —
    // would silently inherit that stock 'boss_final' back.
    original.boss.fights[0].arena.music = undefined
    let text = serializeParametersTxt(original)
    expect(text).toMatch(/^boss0Music=default$/m)

    let parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss).toEqual(original.boss)

    original.boss.fights[0].arena.music = 'boss_final'
    text = serializeParametersTxt(original)
    expect(text).toContain('boss0Music=boss_final')

    parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss).toEqual(original.boss)
  })

  it('reports an unknown boss music id and leaves the stock default in place', () => {
    // parsing with no explicit base starts from defaultParameters(), whose
    // stock fight already carries 'boss_final' — an unknown id is reported
    // but does not clear it, same as every other music field's parsing.
    const parsed = parseParametersTxt('boss=1\nboss0Music=nope')
    expect(parsed.unknownKeys).toEqual(['boss0Music value "nope"'])
    expect(parsed.params.boss.fights[0].arena.music).toBe('boss_final')
  })
})

describe('parameters.txt — levelOrder (issue #43)', () => {
  const rearranged = () => {
    const p = defaultParameters()
    p.levels = 3
    p.themes = p.themes.slice(0, 3)
    p.levelMonsters = p.levelMonsters.slice(0, 3)
    p.levelBuffs = p.levelBuffs?.slice(0, 3)
    p.levelTimers = p.levelTimers?.slice(0, 3)
    // this describe block is about floor/fight interleaving specifically —
    // clear the two stock lobbies defaultParameters() ships, or the repair
    // below would append them onto every hand-written order here
    p.lobbies = []
    p.levelOrder = [
      { kind: 'boss', index: 0 },
      { kind: 'floor', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'floor', index: 2 }
    ]
    return p
  }

  it('writes a rearranged order and reads it back', () => {
    const original = rearranged()
    const text = serializeParametersTxt(original)
    expect(text).toContain('levelOrder=AB1,1,2,3')

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelOrder).toEqual(original.levelOrder)
  })

  // Absent is the shape that guarantees byte-identical output, so a campaign
  // in the default order must not gain a key — an export from before the
  // feature has to keep round-tripping to the same bytes.
  it('writes no key for the default order', () => {
    expect(serializeParametersTxt(plainParameters())).not.toMatch(/^levelOrder=/m)
  })

  // The shipped campaign is not in the default order — which would put BOTH
  // stock lobbies ahead of every floor — so an export of it does carry the
  // key: the dungeon-prep lobby opens the campaign, the boss-prep lobby sits
  // right before the fight, and the escape floor is played after it.
  it('writes the shipped order, escape floor last', () => {
    expect(serializeParametersTxt(defaultParameters())).toMatch(/^levelOrder=L1,1,2,3,4,5,6,7,L2,AB1,8$/m)
  })

  // The bug this guards: with no lobbies and the boss off, the campaign's own
  // order genuinely IS the plain "every floor, then the (disabled) fight"
  // default shape — but OMITTING the line does not reconstruct that. The
  // base `parseParametersTxt(content)` (no base) overlays onto —
  // `defaultParameters()` — ships the SHIPPED order (`L1,1..7,L2,B1,8`), and
  // repairing THAT against a lobby-less, boss-off campaign's own counts drops
  // the lobbies but keeps the escape floor played AFTER the fight, which is
  // not the same as the naive default (every floor, then the fight) this
  // campaign actually wants. An explicit `levelOrder=` line naming the true
  // default is the only way to say so.
  it('writes an explicit default order when the base\'s own shipped order would repair to something else', () => {
    const params = defaultParameters()
    params.boss.enabled = false
    params.lobbies = []
    params.levelOrder = undefined

    const text = serializeParametersTxt(params)
    expect(text).toMatch(/^levelOrder=1,2,3,4,5,6,7,8,AB1$/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelOrder).toBeUndefined()
    expect(parsed.params).toEqual(params)
  })

  // Every case below parses with no `base`, so it starts from
  // `defaultParameters()` — which ships two stock lobbies. `lobbies=0` clears
  // them so this stays a test of floor/fight interleaving specifically; each
  // is what the repair pass would otherwise append them onto every order.
  it('stores an explicitly-default order as absent, not as a list', () => {
    const parsed = parseParametersTxt(['levels=3', 'lobbies=0', 'levelOrder=1,2,3,B1'].join('\r\n'))
    expect(parsed.params.levelOrder).toBeUndefined()
  })

  it('repairs a stale order against the campaign it is attached to', () => {
    // names floor 5 of a 3-floor campaign, and never mentions floor 3
    const parsed = parseParametersTxt(['levels=3', 'lobbies=0', 'levelOrder=1,B1,5,2'].join('\r\n'))
    expect(parsed.params.levelOrder).toEqual([
      { kind: 'floor', index: 0 },
      { kind: 'boss', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'floor', index: 2 }
    ])
  })

  it('reports a malformed token and keeps the rest of the line', () => {
    const parsed = parseParametersTxt(['levels=3', 'lobbies=0', 'levelOrder=1,nope,B1,2,3'].join('\r\n'))
    expect(parsed.unknownKeys).toEqual(['levelOrder value "nope"'])
    expect(parsed.params.levelOrder?.map((s) => s.kind)).toEqual(['floor', 'boss', 'floor', 'floor'])
  })

  it('falls back to the default order rather than failing on a garbage line', () => {
    const parsed = parseParametersTxt(['levels=3', 'lobbies=0', 'levelOrder=???'].join('\r\n'))
    expect(parsed.unknownKeys).toEqual(['levelOrder value "???"'])
    expect(parsed.params.levelOrder).toBeUndefined()
  })
})

describe('bossWaveTrapN — per-tier wall traps', () => {
  it('the stock default arms only the 25% and boss-death tiers', () => {
    // The 070 parameter set runs a shooter_arrow rig on the castle boss's
    // last two tiers; the other three carry no traps.
    const text = serializeParametersTxt(defaultParameters())
    expect(text.match(/^boss0WaveTrap\d=/gm)).toEqual(['boss0WaveTrap4=', 'boss0WaveTrap5='])
  })

  it('writes one line per trapped tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 2) {
        return {
          ...w,
          traps: [
            { projectile: 'enemy_axe', direction: 'up' as const, spread: 0.5, spawnRateMs: 100, count: 3 },
            {
              projectile: 'enemy_boss_anubis_fireball',
              direction: 'left' as const,
              spread: 0,
              spawnRateMs: 1500,
              count: 2
            }
          ]
        }
      }
      return w
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain(
      'boss0WaveTrap3=enemy_axe:up:0.5:100:3|enemy_boss_anubis_fireball:left:0:1500:2'
    )
    // tiers 4/5 keep the stock default's own shooter_arrow rig; only 1, 2 stay bare
    expect(text).not.toMatch(/^boss0WaveTrap[12]=/m)

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.boss.fights[0].arena.waves[2].traps).toEqual([
      { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 100, count: 3 },
      { projectile: 'enemy_boss_anubis_fireball', direction: 'left', spread: 0, spawnRateMs: 1500, count: 2 }
    ])
  })

  it('reads a bare projectile as one linear spewer firing north every second', () => {
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10\r\nboss0WaveTrap3=shooter_spike')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].traps).toEqual([
      { projectile: 'shooter_spike', direction: 'up', spread: 0, spawnRateMs: 1000, count: 1 }
    ])
  })

  it('clears the tier for a file that describes it without a trap line', () => {
    // Symmetrical with the pickup rule: a file written before traps existed
    // describes a fight with none, and must not inherit any.
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].traps).toBeUndefined()
  })

  it('reports an unknown projectile or direction without failing the import', () => {
    const parsed = parseParametersTxt(
      'boss0WaveTrap1=not_a_projectile:up:0:100:1|enemy_axe:sideways:0:100:1|enemy_axe:down:0:100:2'
    )
    expect(parsed.unknownKeys).toHaveLength(2)
    expect(parsed.params.boss.fights[0].arena.waves[0].traps).toEqual([
      { projectile: 'enemy_axe', direction: 'down', spread: 0, spawnRateMs: 100, count: 2 }
    ])
  })

  it('leaves the bossWavePickupN lines byte-identical', () => {
    // Traps are their own key, so an export from before they existed must still
    // round-trip to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => l.startsWith('boss0WavePickup'))
    expect(before.length).toBeGreaterThan(0)

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 0
        ? { ...w, traps: [{ projectile: 'enemy_axe', direction: 'up' as const, spread: 1, spawnRateMs: 250, count: 2 }] }
        : w
    )
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => l.startsWith('boss0WavePickup'))
    expect(after).toEqual(before)
  })
})

describe('trapN — per-floor wall traps', () => {
  it('the stock default ships exactly one armed floor — the escape floor', () => {
    // The 070 parameter set arms the escape floor (the last one) with a
    // fireball spewer on all four walls; every other floor stays unarmed.
    const text = serializeParametersTxt(defaultParameters())
    expect(text.match(/^trap\d+=/gm)).toEqual(['trap7='])
  })

  it('explicitly clears castle\'s escape-floor traps when they are cleared, and round-trips it', () => {
    // Same bug as the timer test above: `defaultParameters()`'s last floor
    // (the escape floor) ships a four-wall fireball rig. Clearing it back to
    // empty used to write nothing (the old "only when non-empty" rule), so
    // re-importing silently restored the stock rig.
    const params = defaultParameters()
    params.levelTraps![params.levels - 1] = []

    const text = serializeParametersTxt(params)
    expect(text).toMatch(new RegExp(`^trap${params.levels - 1}=$`, 'm'))

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelTraps?.[params.levels - 1]).toEqual([])
    expect(parsed.params.levelTraps).toEqual(params.levelTraps)
  })

  it('writes one line per trapped floor and round-trips it', () => {
    const params = plainParameters()
    params.levelTraps = Array.from({ length: params.levels }, () => [])
    params.levelTraps[2] = [
      { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 100, count: 3 },
      { projectile: 'shooter_spike', direction: 'left', spread: 0, spawnRateMs: 1500, count: 2 }
    ]

    const text = serializeParametersTxt(params)
    expect(text).toContain('trap2=shooter_arrow:up:0.5:100:3|shooter_spike:left:0:1500:2')
    expect(text).not.toMatch(/^trap[01345]=/m)

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.levelTraps?.[2]).toEqual(params.levelTraps[2])
    expect(reparsed.params.levelTraps?.[0]).toEqual([])
  })

  it('reads a bare projectile as one linear spewer firing north every second', () => {
    const parsed = parseParametersTxt('trap0=shooter_spike')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelTraps?.[0]).toEqual([
      { projectile: 'shooter_spike', direction: 'up', spread: 0, spawnRateMs: 1000, count: 1 }
    ])
  })

  it('reports a malformed segment without failing the import', () => {
    const parsed = parseParametersTxt(
      'trap1=not_a_projectile:up:0:100:1|shooter_arrow:sideways:0:100:1|shooter_arrow:down:0:100:2'
    )
    expect(parsed.unknownKeys).toHaveLength(2)
    expect(parsed.params.levelTraps?.[1]).toEqual([
      { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 100, count: 2 }
    ])
  })

  it('keeps a floor trap and a wave trap in the same file apart', () => {
    // `boss0WaveTrap1` is consumed by the `boss…` dispatcher long before the
    // anchored `^trap(\d+)$` branch, so the two keys cannot collide.
    const parsed = parseParametersTxt(
      'trap0=shooter_arrow:up:0:500:2\r\nboss0WaveTrap1=shooter_spike:down:0:100:3'
    )
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelTraps?.[0]).toEqual([
      { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 500, count: 2 }
    ])
    expect(parsed.params.boss.fights[0].arena.waves[0].traps).toEqual([
      { projectile: 'shooter_spike', direction: 'down', spread: 0, spawnRateMs: 100, count: 3 }
    ])
  })

  it('serialize -> parse -> serialize is a fixed point', () => {
    const params = plainParameters()
    params.levelTraps = Array.from({ length: params.levels }, () => [])
    params.levelTraps[0] = [{ projectile: 'shooter_fireball', direction: 'right', spread: 2, spawnRateMs: 250, count: 7 }]

    const once = serializeParametersTxt(params)
    // Re-parse against the same neutral base `once` was built from — the
    // 070 parameter set means `defaultParameters()` (parseParametersTxt's own
    // fallback base) carries its own real floorMusic, which is exactly the
    // ambiguity a base exists to resolve: a file with no musicN line at all
    // cannot tell "never had the feature" from "explicitly all default"
    // without one.
    const twice = serializeParametersTxt(parseParametersTxt(once, params).params)
    expect(twice).toBe(once)
  })

  it('pads a sparse file up to the floor count and trims past it', () => {
    const parsed = parseParametersTxt('levels=4\r\ntrap1=shooter_arrow')
    expect(parsed.params.levelTraps).toHaveLength(4)
    expect(parsed.params.levelTraps?.[0]).toEqual([])
    expect(parsed.params.levelTraps?.[1]).toHaveLength(1)
    expect(parsed.params.levelTraps?.[3]).toEqual([])
  })
})
