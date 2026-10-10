import { describe, expect, it } from 'vitest'
import {
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  CAMPAIGN_PRESETS,
  DEFAULT_PRESET_ID,
  PRESET_GROUPS,
  campaignPresetById,
  defaultParameters,
  generateDungeon,
  isDefaultOrder,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters,
  THEMES,
  arenaMode,
  bossFights,
  floorBoss as floorBossAt,
  floorMystery,
  floorLockMystery,
  floorLockButtons,
  floorLockDisguised,
  mysteryStarterPool,
  MOBILE_BOSS_IDS
} from '../src/generator'
import type { BossWave, DungeonParameters } from '../src/generator'
import {
  isKnownFamilyId,
  isKnownFloorPoolKey,
  isKnownMonsterKey,
  monsterTypeById,
  parseMonsterKey,
  resolveActorPath
} from '../src/generator/objects/monsterTypes'
import { corpseCollision } from '../src/generator/objects/actorCollision'
import {
  isScatterMode,
  survivalPickups,
  wavePickups,
  waveSpawnMode
} from '../src/generator/config/parameters'
import { mysteryKit } from '../src/generator/config/presetMystery'
import { COLOSSEUM_PARAMETERS_TXT } from '../src/generator/config/colosseumPreset'
import { projectileById } from '../src/generator/objects/projectileTypes'

const CLASSIC_PRESETS = CAMPAIGN_PRESETS.filter((p) => p.group === 'classic')

/**
 * Every monster a wave carries must be a known key with a positive cap, and a
 * monster whose corpse still blocks movement (the nova/frost/tracking towers)
 * must never be on a scatter mode — a scattered wreck can wall the floor or
 * arena off. Shared by the arena's own waves and a floor boss's, and by every
 * preset's fights, not just the first — see the CLAUDE.md rule this guards.
 */
function expectWaveScatterSafe(wave: BossWave, label: string): void {
  for (const key of wave.monsters) {
    expect(isKnownMonsterKey(key), `${label}: ${key}`).toBe(true)
    // -1 is the endless sentinel — a positive cap or that, never 0.
    const max = wave.monsterMax[key]
    expect(max === -1 || max > 0, `${label}: ${key} capped at ${max}`).toBe(true)
    if (corpseCollision(resolveActorPath(key)) === 'blocking') {
      expect(isScatterMode(waveSpawnMode(wave, key)), `${label}: ${key}`).toBe(false)
    }
  }
}

describe('campaign presets', () => {
  it('has unique ids, the castle preset first, and every preset in a known group', () => {
    const ids = CAMPAIGN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 3)).toEqual(['castle', 'desert', 'bonus'])
    expect(ids[0]).toBe(DEFAULT_PRESET_ID)

    const groupIds = PRESET_GROUPS.map((g) => g.id)
    for (const preset of CAMPAIGN_PRESETS) {
      expect(groupIds, preset.id).toContain(preset.group)
    }
  })

  it('lists the Claude-generated presets alphabetically by label', () => {
    const labels = CAMPAIGN_PRESETS.filter((p) => p.group === 'claude').map((p) => p.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('gives every PRESET_GROUPS entry at least one preset', () => {
    for (const group of PRESET_GROUPS) {
      expect(CAMPAIGN_PRESETS.some((p) => p.group === group.id), group.id).toBe(true)
    }
  })

  // These shapes are specific to the three beta-classic presets — they all
  // share one arena size/cover figure and ship a populated boss-death tier by
  // convention, not by any rule the Claude-generated presets are bound to.
  describe('classic presets share one arena shape', () => {
    it('gives every preset the full set of wave tiers, including a populated boss-death one', () => {
      for (const preset of CLASSIC_PRESETS) {
        const waves = preset.build().boss.fights[0].arena.waves
        expect(waves, preset.id).toHaveLength(BOSS_WAVE_COUNT)
        // The arena keeps fighting after the kill, so this tier ships full. Its
        // scatter points are extra bossRand draws, which is why every saved
        // seed's arena moved when it was filled in.
        expect(waves[BOSS_DEATH_WAVE].monsters.length, preset.id).toBeGreaterThan(0)
      }
    })

    it('gives every preset the same arena size and cover — a preset overrides neither', () => {
      // withBoss() re-points only theme, pool and waves, so the 2026-08-28
      // playtest figures have to reach all three presets unchanged.
      const arena = defaultParameters().boss.fights[0].arena
      expect([arena.minWidth, arena.maxWidth, arena.minHeight, arena.maxHeight]).toEqual([42, 64, 42, 64])
      expect(arena.cover).toEqual({ pattern: 'symmetric', density: 0.08, ringSpacing: 4, clusters: 3 })

      for (const preset of CLASSIC_PRESETS) {
        const a = preset.build().boss.fights[0].arena
        expect(
          [a.minWidth, a.maxWidth, a.minHeight, a.maxHeight],
          preset.id
        ).toEqual([arena.minWidth, arena.maxWidth, arena.minHeight, arena.maxHeight])
        expect(a.cover, preset.id).toEqual(arena.cover)
        expect(a.spawn, preset.id).toEqual(arena.spawn)
      }
    })

    // The escape floor: one extra dungeon floor played AFTER the boss arena, on
    // a 90-second hazard timer, stuffed with breakable battlements. All three
    // classic presets ship it, and it is what makes the last slot a run for
    // the exit rather than another floor to clear. The Claude-generated
    // presets are not bound to this shape (only Long Haul happens to echo it,
    // checked separately below).
    describe('the escape floor', () => {
      for (const preset of CLASSIC_PRESETS) {
        const params = preset.build()
        const last = params.levels - 1

        it(`${preset.id}: plays it last, after the boss fight`, () => {
          expect(params.levelOrder).toBeDefined()
          const counts = { levels: params.levels, fights: params.boss.fights.length, lobbies: params.lobbies.length }
          expect(isDefaultOrder(params.levelOrder!, counts)).toBe(false)
          expect(params.levelOrder!.at(-1)).toEqual({ kind: 'floor', index: last })
          expect(params.levelOrder!.at(-2)).toEqual({ kind: 'boss', index: 0 })
        })

        it(`${preset.id}: arms 90 seconds at 1 damage per 100ms, and only there`, () => {
          const timers = params.levelTimers!
          expect(timers).toHaveLength(params.levels)
          expect(timers[last]).toEqual({
            enabled: true,
            seconds: 90,
            damage: 1,
            freqMs: 100,
            countdown: true
          })
          for (const timer of timers.slice(0, last)) expect(timer.enabled).toBe(false)
        })

        it(`${preset.id}: fills it with breakable battlements, pooled nowhere else`, () => {
          const pool = params.levelMonsters[last]
          const share = pool.filter((id) => id === 'tower_empty').length / pool.length
          expect(share).toBeGreaterThan(0.4)
          expect(share).toBeLessThan(0.5)
          expect(params.monsterMax.tower_empty).toBe(150)
          for (const earlier of params.levelMonsters.slice(0, last)) {
            expect(earlier).not.toContain('tower_empty')
          }
        })

        it(`${preset.id}: ends the campaign on it — the arena leads there instead`, () => {
          const result = generateDungeon(preset.build(), 4242)
          expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
          if (!result.ok) return

          const escape = result.files.find((f) => f.path === `levels/level${last}.xml`)!.content
          const arena = result.files.find((f) => f.path === 'levels/boss0.xml')!.content
          expect(escape).toContain('>GameEnd<')
          expect(arena).not.toContain('>GameEnd<')
          expect(arena).toContain(`<string name="level">${last}</string>`)
          expect(escape).toContain('>DangerArea<')
          for (let i = 0; i < last; i++) {
            expect(result.files.find((f) => f.path === `levels/level${i}.xml`)!.content).not.toContain(
              '>DangerArea<'
            )
          }
          const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
          const ids = [...levelsXml.matchAll(/<level id="([^"]+)"/g)].map((m) => m[1])
          expect(ids.slice(-3)).toEqual(['lobby1', 'boss0', String(last)])
        })
      }
    })

    describe('mystery buttons', () => {
      for (const preset of CLASSIC_PRESETS) {
        const params = preset.build()
        const last = params.levels - 1

        it(`${preset.id}: hides two plates on every floor and one on the escape floor`, () => {
          expect(params.levelMystery).toHaveLength(params.levels)
          for (let i = 0; i < last; i++) expect(floorMystery(params, i)?.count, `floor ${i + 1}`).toBe(2)
          expect(floorMystery(params, last)?.count).toBe(1)
        })

        it(`${preset.id}: keeps the starter set intact at the front of its pool`, () => {
          const starter = mysteryStarterPool()
          expect(params.mysteryButtons!.slice(0, starter.length)).toEqual(starter)
        })

        it(`${preset.id}: ramps the risk — no lich council, kamikazes or boss fire in the first half`, () => {
          const names = params.mysteryButtons!.map((b) => b.name)
          const harsh = ['Lich council', 'Kamikazes', "Dragon's breath", "Anubis' wrath", 'Death orbs']
          for (let i = 0; i < Math.floor(last / 2); i++) {
            const picked = new Set(floorMystery(params, i)!.pool.map((n) => names[n]))
            for (const name of harsh) expect(picked.has(name), `floor ${i + 1}: ${name}`).toBe(false)
          }
        })
      }
    })
  })

  // Scatter safety is a hard invariant, not a classic-preset habit — it
  // applies to every fight of every preset (not just the first) and to every
  // dungeon floor boss's own wave tiers.
  it('only puts scatter-safe monsters on a scatter mode, in every fight and every floor boss of every preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const params = preset.build()
      for (const fight of bossFights(params.boss)) {
        for (const [i, wave] of fight.arena.waves.entries()) {
          expectWaveScatterSafe(wave, `${preset.id} arena wave ${i + 1}`)
        }
      }
      for (let level = 0; level < params.levels; level++) {
        const boss = floorBossAt(params, level)
        if (boss === undefined) continue
        for (const [i, wave] of boss.waves.entries()) {
          expectWaveScatterSafe(wave, `${preset.id} floor ${level + 1} boss wave ${i + 1}`)
        }
      }
    }
  })

  // Playtest rule (2026-09-28): an always-on floor trap may fire a lethal
  // projectile (spike, large fireball, boulder) in straight lanes the party
  // can time, never fanned out — a spray of them cannot be dodged. Mystery
  // buttons are exempt (pressing one is a gamble), but their traps must
  // switch off again so a deadly room never stays sealed for good.
  it('fires lethal projectiles on floor traps only in timeable lanes, and never arms a mystery trap forever', () => {
    const LETHAL_DAMAGE = 50
    for (const preset of CAMPAIGN_PRESETS) {
      const params = preset.build()
      const rows = [
        ...(params.levelTraps ?? []).flatMap((traps, i) => traps.map((row) => ({ row, at: `floor ${i + 1}` }))),
        ...(params.levelBoss ?? []).flatMap((boss, i) =>
          boss.enabled ? boss.waves.flatMap((wave) => (wave.traps ?? []).map((row) => ({ row, at: `floor ${i + 1} boss` }))) : []
        )
      ]
      for (const { row, at } of rows) {
        const label = `${preset.id} ${at}: ${row.projectile} ${row.direction}`
        if (projectileById(row.projectile)!.damage < LETHAL_DAMAGE) continue
        expect(row.count, label).toBeLessThanOrEqual(row.spread > 0 ? 1 : 3)
      }
      for (const button of params.mysteryButtons ?? []) {
        if (button.traps.length > 0) expect(button.trapSeconds ?? 0, `${preset.id}: ${button.name}`).toBeGreaterThan(0)
      }
    }
  })

  it('resolves by id, and reports an unknown id rather than guessing', () => {
    expect(campaignPresetById('desert')?.label).toBe('Desert')
    expect(campaignPresetById('claude-lunch-break')?.label).toBe('Lunch Break')
    expect(campaignPresetById('nope')).toBeUndefined()
  })

  it('makes the castle preset the built-in default plus its mystery plates, and nothing else', () => {
    const { mysteryButtons, levelMystery, ...rest } = campaignPresetById('castle')!.build()
    expect(mysteryButtons).toBeDefined()
    expect(levelMystery).toBeDefined()
    expect(rest).toEqual(defaultParameters())
    // the app opens on the plate-free default, and parameters.txt imports onto it
    expect(defaultParameters().mysteryButtons).toBeUndefined()
    expect(defaultParameters().levelMystery).toBeUndefined()
  })

  it('resolves mystery picks by button name, and throws on an unknown one', () => {
    const kit = mysteryKit()
    const nothing = kit.buttons.findIndex((b) => b.name === 'Nothing')
    expect(kit.pick(2, [['Nothing', 3]])).toEqual({ count: 2, pool: [nothing, nothing, nothing] })
    expect(() => kit.pick(1, [['No such button', 1]])).toThrow(/No such button/)
    expect(() => mysteryKit([{ name: 'Nothing', loot: [], monsters: [], traps: [] }])).toThrow(/unique/)
  })

  it('builds a fresh object every call, so the form cannot mutate a preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const a = preset.build()
      const b = preset.build()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      a.levelMonsters[0].push('bat1')
      a.monsterMax.bat1 = 1
      if (a.lobbies.length > 0) a.lobbies[0].shopCategories.push('power')
      expect(preset.build()).toEqual(b)
    }
  })

  for (const preset of CAMPAIGN_PRESETS) {
    describe(`preset: ${preset.id}`, () => {
      const params = preset.build()

      // A zero-floor campaign (Colosseum) keeps one of each, as the form does:
      // it never shrinks the per-floor lists below one entry.
      it('has one theme and one monster pool per level', () => {
        expect(params.themes).toHaveLength(Math.max(params.levels, 1))
        expect(params.levelMonsters).toHaveLength(Math.max(params.levels, 1))
      })

      it('names only real, non-deprecated themes and monsters', () => {
        for (const theme of params.themes) expect(THEMES).toContain(theme)
        for (const pool of params.levelMonsters) {
          expect(pool.length).toBeGreaterThan(0)
          for (const key of pool) {
            expect(isKnownFloorPoolKey(key), `unknown pool key "${key}"`).toBe(true)
            const { id } = parseMonsterKey(key)
            if (isKnownFamilyId(id)) continue
            expect(monsterTypeById(id).deprecated, `deprecated monster id "${key}"`).toBeFalsy()
          }
        }
      })

      it('leaves every pooled monster with a non-zero cap, or it would never spawn', () => {
        for (const pool of params.levelMonsters) {
          for (const key of pool) {
            const { id } = parseMonsterKey(key)
            expect(params.monsterMax[id], `${key} is pooled but capped at 0`).toBeGreaterThan(0)
          }
        }
      })

      it('passes validation with no errors', () => {
        const result = validateParameters(params)
        expect(result.errors).toEqual([])
        expect(result.valid).toBe(true)
      })

      it('generates a campaign for a fixed seed', () => {
        const result = generateDungeon(preset.build(), 4242)
        expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
        if (!result.ok) return
        // Every fight is its own arena level in the preview — a chained-arena
        // preset like Arena Marathon has more than one, so the historical
        // "+1" only held because every preset shipped exactly one fight.
        expect(result.levels).toHaveLength(params.levels + bossFights(params.boss).length)
        for (let i = 0; i < params.levels; i++) {
          expect(result.files.map((f) => f.path)).toContain(`levels/level${i}.xml`)
        }
      })

      it('is deterministic — the same seed twice is byte-identical', () => {
        const a = generateDungeon(preset.build(), 4242)
        const b = generateDungeon(preset.build(), 4242)
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        expect(a.files).toEqual(b.files)
        expect(a.levels).toEqual(b.levels)
      })

      // Plates and enhanced lock buttons are purely additive (invariant 8):
      // stripping them must leave every floor's tilemap byte-identical.
      it.runIf(params.mysteryButtons !== undefined)('moves no floor — its mystery plates are added after each floor is built', () => {
        const plain = { ...params, mysteryButtons: undefined, levelMystery: undefined, levelLockMystery: undefined }
        const a = generateDungeon(plain, 4242)
        const b = generateDungeon(params, 4242)
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        const tilemap = (xml: string) => xml.slice(0, xml.indexOf('<dictionary name="doodads">'))
        for (let i = 0; i < params.levels; i++) {
          const path = `levels/level${i}.xml`
          const before = a.files.find((f) => f.path === path)!.content
          const after = b.files.find((f) => f.path === path)!.content
          expect(tilemap(after), path).toBe(tilemap(before))
        }
      })

      it('round-trips through parameters.txt unchanged', () => {
        const reparsed = parseParametersTxt(serializeParametersTxt(params))
        expect(reparsed.unknownKeys).toEqual([])
        expect(reparsed.params.levelMonsters).toEqual(params.levelMonsters)
        expect(reparsed.params).toEqual(params)
      })
    })
  }

  // --- Claude-generated presets: per-preset checks that show off the hook
  // each one exists to demonstrate ---
  describe('Claude-generated presets', () => {
    function floorBossEnabled(params: DungeonParameters, level: number): boolean {
      return floorBossAt(params, level) !== undefined
    }

    it('Boss Rush: every floor carries an enabled floor boss', () => {
      const params = campaignPresetById('claude-boss-rush')!.build()
      for (let level = 0; level < params.levels; level++) {
        expect(floorBossEnabled(params, level), `floor ${level + 1}`).toBe(true)
      }
    })

    it('Pandemonium: every floor carries an enabled, multi-boss floor boss', () => {
      const params = campaignPresetById('claude-pandemonium')!.build()
      for (let level = 0; level < params.levels; level++) {
        const boss = floorBossAt(params, level)
        expect(boss, `floor ${level + 1}`).toBeDefined()
        expect(boss!.bossPool.every((id) => (MOBILE_BOSS_IDS as readonly string[]).includes(id)), `floor ${level + 1}`).toBe(true)
      }
    })

    it('Beat the Clock: every floor is timed', () => {
      const params = campaignPresetById('claude-beat-the-clock')!.build()
      expect(params.levelTimers).toHaveLength(params.levels)
      for (const timer of params.levelTimers!) expect(timer.enabled).toBe(true)
    })

    // the clock presets end on a hunt: the last timed floor hides one random
    // mobile boss (and no lock), then every arena runs with no invulnerability
    // and the campaign ends in a survival arena
    for (const id of ['claude-beat-the-clock', 'claude-shell-game']) {
      it(`${id}: hunt the last floor's boss, no invulnerability, end on survival`, () => {
        const params = campaignPresetById(id)!.build()
        const last = params.levels - 1
        const hunt = floorBossAt(params, last)
        expect(hunt).toBeDefined()
        expect(hunt!.invulnerability.enabled).toBe(false)
        expect(hunt!.bossPool.every((b) => (MOBILE_BOSS_IDS as readonly string[]).includes(b))).toBe(true)
        expect(params.levelTimers![last].enabled).toBe(true)
        expect(floorLockButtons(params, last)).toBe(0)
        for (let level = 0; level < last; level++) expect(floorBossAt(params, level), `floor ${level + 1}`).toBeUndefined()

        const fights = bossFights(params.boss)
        expect(hunt!.checkpoints.respawnPlayers).toBe('never')
        for (const fight of fights) {
          if (arenaMode(fight) !== 'boss') continue
          expect(fight.arena.invulnerability.enabled).toBe(false)
          // no revives in a clock preset's boss fight (playtest: too easy)
          expect(fight.arena.checkpoints.respawnPlayers).toBe('never')
          expect(fight.arena.checkpoints.saveGame).toBe('never')
        }
        expect(arenaMode(fights.at(-1)!)).toBe('survival')

        // enrage windows, each landing with fresh minions in case the boss
        // itself does not catch a monsters-only field
        const enraged = (buffs: readonly { buff: string; target: string }[] | undefined) =>
          (buffs ?? []).some((b) => b.buff === 'bloodlust' && b.target === 'monsters')
        expect(enraged(hunt!.waves[3].buffs)).toBe(true)
        expect(hunt!.waves[3].monsters.length).toBeGreaterThan(0)
        const survival = fights.at(-1)!.survival!
        // a visible clock every second — milestones left the goal unclear
        expect(survival.countdown).toBe('seconds')
        expect(survival.buffs.some((b) => b.buff === 'bloodlust' && b.target === 'monsters' && b.startSeconds === 90 && b.endSeconds === survival.seconds)).toBe(true)
        expect(survival.waves.some((w) => w.atSeconds === 90)).toBe(true)
        for (const fight of fights) {
          if (arenaMode(fight) !== 'boss') continue
          expect(enraged(fight.arena.waves[3].buffs)).toBe(true)
          expect(fight.arena.waves[3].monsters.length).toBeGreaterThan(0)
        }
        const order = params.levelOrder!
        expect(order.at(-1)).toEqual({ kind: 'boss', index: fights.length - 1 })
        // the boss-prep lobby comes right after the hunt
        expect(order.findIndex((s) => s.kind === 'lobby' && s.index === 1)).toBe(
          order.findIndex((s) => s.kind === 'floor' && s.index === last) + 1
        )
      })
    }

    it('Arena Marathon: chains a survival fight and a boss fight', () => {
      const params = campaignPresetById('claude-arena-marathon')!.build()
      const modes = bossFights(params.boss).map(arenaMode)
      expect(modes).toContain('survival')
      expect(modes).toContain('boss')
    })

    // A finite row is dealt over the 9 arena anchors, one spawn per anchor per
    // interval, so it runs for ceil(count / 9) intervals from its start.
    it('Arena Marathon: survival rounds run in phases that never go quiet or run past the clock', () => {
      const params = campaignPresetById('claude-arena-marathon')!.build()
      const rounds = bossFights(params.boss).filter((fight) => arenaMode(fight) === 'survival')
      expect(rounds.length).toBe(2)
      for (const fight of rounds) {
        const survival = fight.survival!
        expect(survival.countdown).toBe('seconds')
        expect(fight.arena.maxWidth).toBeLessThanOrEqual(24)
        expect(fight.arena.monsterMultiplier).toBe(1)
        const windows = survival.waves.map((row) => {
          expect(row.count).toBeGreaterThan(0) // no endless row
          return { from: row.atSeconds, to: row.atSeconds + (Math.ceil(row.count / 9) * row.intervalMs) / 1000 }
        })
        for (const window of windows) expect(window.to).toBeLessThanOrEqual(survival.seconds)
        for (let slice = 0; slice < survival.seconds; slice += 30) {
          expect(windows.some((w) => w.from <= slice && w.to >= slice + 30 - 1)).toBe(true)
        }
        expect(survival.waves.some((row) => row.monster.startsWith('mb_'))).toBe(true)
      }
    })

    it('Trap Gauntlet: plates on every floor, and trapped lock buttons from floor 2 on', () => {
      const params = campaignPresetById('claude-trap-gauntlet')!.build()
      for (let level = 0; level < params.levels; level++) {
        expect(floorMystery(params, level)?.count, `floor ${level + 1}`).toBe(2)
        const lock = floorLockMystery(params, level)
        if (level === 0) {
          expect(lock).toBeUndefined()
          continue
        }
        expect(lock, `floor ${level + 1}`).toBeDefined()
        expect(lock!.count).toBeLessThanOrEqual(floorLockButtons(params, level))
        // the lock can pay out as well as fire, so it is a gamble, not a tax
        const picked = lock!.pool.map((n) => params.mysteryButtons![n])
        expect(picked.some((b) => b.traps.length > 0), `floor ${level + 1}`).toBe(true)
        expect(picked.some((b) => b.traps.length === 0), `floor ${level + 1}`).toBe(true)
      }
    })

    it('Boss Rush: every lock button drops supplies and never a squad or a trap', () => {
      const params = campaignPresetById('claude-boss-rush')!.build()
      for (let level = 0; level < params.levels; level++) {
        const lock = floorLockMystery(params, level)
        expect(lock?.count, `floor ${level + 1}`).toBe(1)
        for (const n of lock!.pool) {
          const button = params.mysteryButtons![n]
          expect(button.loot.length, button.name).toBeGreaterThan(0)
          expect(button.monsters, button.name).toEqual([])
          expect(button.traps, button.name).toEqual([])
        }
      }
    })

    it('Double or Nothing: visible locks, and more plates with worse odds the deeper you go', () => {
      const params = campaignPresetById('claude-double-or-nothing')!.build()
      const harsh = new Set(['Lich council', 'Double trouble', 'Kamikazes', 'Death trap', 'Inferno', "Dragon's breath", "Anubis' wrath", 'Death orbs'])
      let lastCount = 0
      let lastShare = 0
      for (let level = 0; level < params.levels; level++) {
        expect(floorLockButtons(params, level), `floor ${level + 1}`).toBeGreaterThan(0)
        expect(floorLockDisguised(params, level), `floor ${level + 1}`).toBe(false)
        const floor = floorMystery(params, level)!
        expect(floor.count).toBeGreaterThanOrEqual(lastCount)
        const share = floor.pool.filter((n) => harsh.has(params.mysteryButtons![n].name!)).length / floor.pool.length
        expect(share, `floor ${level + 1}`).toBeGreaterThan(lastShare)
        lastCount = floor.count
        lastShare = share
      }
      // the top prize exists, and only on the last two floors
      const extraLife = params.mysteryButtons!.findIndex((b) => b.name === 'Extra life')
      for (let level = 0; level < params.levels; level++) {
        expect(floorMystery(params, level)!.pool.includes(extraLife), `floor ${level + 1}`).toBe(level >= 3)
      }
    })

    it('Shell Game: every lock is disguised and partly enhanced, among decoys, against a clock', () => {
      const params = campaignPresetById('claude-shell-game')!.build()
      // every floor but the last, the hunt, which has a boss instead of a lock
      const locked = params.levels - 1
      for (let level = 0; level < params.levels; level++) {
        expect(floorMystery(params, level)?.count, `floor ${level + 1}`).toBeGreaterThan(0)
        expect(params.levelTimers![level].enabled, `floor ${level + 1}`).toBe(true)
        if (level >= locked) continue
        expect(floorLockDisguised(params, level), `floor ${level + 1}`).toBe(true)
        expect(floorLockMystery(params, level)?.count, `floor ${level + 1}`).toBeGreaterThan(0)
      }
      // less time per button on every locked floor than the one before it
      const perButton = params.levelTimers!.slice(0, locked).map((t, level) => t.seconds / floorLockButtons(params, level))
      for (let level = 1; level < locked; level++) expect(perButton[level]).toBeLessThan(perButton[level - 1])

      // a disguised lock button is drawn with the plate's art, never the red button's
      const result = generateDungeon(params, 4242)
      expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
      if (!result.ok) return
      for (let level = 0; level < locked; level++) {
        const xml = result.files.find((f) => f.path === `levels/level${level}.xml`)!.content
        expect(xml, `floor ${level + 1}`).not.toContain('boss_door_button.xml')
        expect(xml, `floor ${level + 1}`).toContain('trigger_button_floor.xml')
      }
    })

    it('Long Haul: 13 floors, ending on the escape floor', () => {
      const params = campaignPresetById('claude-long-haul')!.build()
      expect(params.levels).toBe(13)
      // plates on every floor but the escape floor, where the clock is pressure enough
      for (let level = 0; level < 12; level++) expect(floorMystery(params, level), `floor ${level + 1}`).toBeDefined()
      expect(floorMystery(params, 12)).toBeUndefined()
      expect(params.levelOrder!.at(-1)).toEqual({ kind: 'floor', index: 12 })

      const result = generateDungeon(params, 4242)
      expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
      if (!result.ok) return
      const escape = result.files.find((f) => f.path === 'levels/level12.xml')!.content
      expect(escape).toContain('>GameEnd<')
      const finalArena = result.files.find((f) => f.path === 'levels/boss1.xml')!.content
      expect(finalArena).not.toContain('>GameEnd<')
      expect(finalArena).toContain('<string name="level">12</string>')
    })
  })

  // The dungeon master's own all-arena parameters.txt, shipped as a preset.
  describe('Colosseum', () => {
    const params = campaignPresetById('colosseum')!.build()
    const fights = bossFights(params.boss)
    const BOSS_ROOMS = [4, 9, 14, 19]

    it('parses its embedded file with no unknown keys', () => {
      expect(parseParametersTxt(COLOSSEUM_PARAMETERS_TXT).unknownKeys).toEqual([])
    })

    it('has no dungeon floors: 8 lobbies, 16 survival arenas, 4 boss arenas', () => {
      expect(params.levels).toBe(0)
      expect(params.lobbies).toHaveLength(8)
      expect(fights).toHaveLength(20)
      fights.forEach((fight, i) => {
        expect(arenaMode(fight), `fight ${i}`).toBe(BOSS_ROOMS.includes(i) ? 'boss' : 'survival')
      })
      expect(serializeParametersTxt(params)).toContain(
        'levelOrder=L1,AS1,AS2,AS3,AS4,L2,AB5,L3,AS6,AS7,AS8,AS9,L4,AB10,L5,AS11,AS12,AS13,AS14,L6,AB15,L7,AS16,AS17,AS18,AS19,L8,AB20'
      )
    })

    it('drops 4 Health (Large) and 4 Mana (Large) on every survival arena but the first', () => {
      fights.forEach((fight, i) => {
        if (BOSS_ROOMS.includes(i)) return
        const expected =
          i > 0
            ? [
                { item: 'health_3', count: 4, atSeconds: 0 },
                { item: 'mana_2', count: 4, atSeconds: 0 }
              ]
            : []
        expect(survivalPickups(fight.survival), `fight ${i}`).toEqual(expected)
      })
    })

    it('stocks every boss room at the start of the fight, and drops the dead death-tier buff', () => {
      for (const i of BOSS_ROOMS) {
        const waves = fights[i].arena.waves
        expect(wavePickups(waves[0]), `fight ${i}`).toEqual([
          { item: 'health_3', count: 8 },
          { item: 'mana_2', count: 8 },
          { item: 'potion_2', count: 4 }
        ])
        expect(waves[BOSS_DEATH_WAVE].buffs ?? [], `fight ${i}`).toEqual([])
      }
      const warnings = validateParameters(params).warnings.map((w) => w.field)
      expect(warnings.filter((f) => /waves\.\d+\.buffs/.test(f))).toEqual([])
    })
  })

  // The original Java tool's parameters.txt — reference/original-java/ — with
  // none of the remake's layers on top.
  describe('Pre-Alpha', () => {
    const params = campaignPresetById('pre-alpha')!.build()

    it("matches the Java file's campaign shape", () => {
      expect(params.levels).toBe(8)
      expect(params.themes).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'])
      expect([params.minRoomSize, params.maxRoomSize, params.minRoomCount, params.maxRoomCount]).toEqual([6, 20, 12, 15])
      expect([params.mapWidth, params.mapHeight]).toEqual([80, 60])
      expect([params.goldMultiplier, params.foodMultiplier, params.vaultChance]).toEqual([1.1, 1.2, 0.3])
      expect(params.monsterMax.lich).toBe(20)
    })

    it('carries no lobby, boss, per-floor layer or player tweak', () => {
      expect(params.lobbies).toEqual([])
      expect(bossFights(params.boss)).toEqual([])
      expect(params.levelOrder).toBeUndefined()
      expect(params.levelLock).toBeUndefined()
      expect(params.playerTweaks).toEqual({})
      for (let i = 0; i < params.levels; i++) {
        expect(params.levelBuffs![i], `floor ${i + 1}`).toEqual([])
        expect(params.levelTraps![i], `floor ${i + 1}`).toEqual([])
        expect(params.levelTimers![i].enabled, `floor ${i + 1}`).toBe(false)
        expect(floorBossAt(params, i), `floor ${i + 1}`).toBeUndefined()
      }
    })

    it('generates dungeon floors only, ending on the orb', () => {
      const result = generateDungeon(params, 4242)
      expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
      if (!result.ok) return
      const levelFiles = result.files.map((f) => f.path).filter((p) => p.startsWith('levels/'))
      expect(levelFiles).toEqual(Array.from({ length: 8 }, (_, i) => `levels/level${i}.xml`))
      expect(result.files.some((f) => f.path.startsWith('tweak/'))).toBe(false)
      expect(result.files.find((f) => f.path === 'levels/level7.xml')!.content).toContain('>GameEnd<')
    })
  })
})
