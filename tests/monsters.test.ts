import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  ARENA_BODYGUARD_TWINS,
  MONSTER_CATEGORIES,
  MONSTER_GROUPS,
  MONSTER_TYPES,
  arenaActorPath,
  defaultParameters,
  generateDungeon,
  monsterCategories,
  monsterTypeById,
  monsterTypesInGroup,
  parseParametersTxt,
  resolveActorPath,
  serializeParametersTxt
} from '../src/generator'
import { isKnownMonsterId } from '../src/generator/objects/monsterTypes'
import type { DungeonResult } from '../src/generator'
import { plainParameters } from './params'

/** The hand-maintained snapshot of actor paths that exist in a stock install. */
const KNOWN_ACTOR_PATHS = new Set(
  readFileSync(join(__dirname, 'fixtures/actor-paths.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
)

/** Generate a single floor whose only monster type is `id`, with a usable max. */
function generateWithOnly(id: string, seed: number, max = 60): DungeonResult {
  const params = plainParameters()
  params.levels = 1
  params.themes = ['a']
  params.levelMonsters = [[id]]
  params.monsterMax = { ...params.monsterMax, [id]: max }
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

function levelXML(result: DungeonResult): string {
  const file = result.files.find((f) => f.path === 'levels/level0.xml')
  expect(file).toBeDefined()
  return file!.content
}

describe('monster roster', () => {
  it('places every type in a group the GUI renders', () => {
    for (const type of MONSTER_TYPES) {
      expect(MONSTER_GROUPS).toContain(type.group)
    }
  })

  it('has unique ids and case-insensitively unique config keys', () => {
    const ids = MONSTER_TYPES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const keys = MONSTER_TYPES.map((t) => t.configKey.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps bat1 at index 3 for the unknown-id fallback', () => {
    expect(MONSTER_TYPES[3].id).toBe('bat1')
  })

  it('lists each group alphabetically without reordering the array', () => {
    // The array is append-only, so a new type lands at the end wherever it
    // belongs alphabetically — monsterTypesInGroup is what makes the GUI read
    // in order. skeleton3 and tower_empty are exactly that case.
    for (const group of MONSTER_GROUPS) {
      const ids = monsterTypesInGroup(group).map((t) => t.id)
      expect(ids, group).toEqual([...ids].sort())
    }
    const classic = monsterTypesInGroup('Classic').map((t) => t.id)
    expect(classic.indexOf('skeleton3')).toBe(classic.indexOf('skeleton2') + 1)
    const towers = monsterTypesInGroup('Towers').map((t) => t.id)
    expect(towers.indexOf('tower_empty')).toBe(towers.indexOf('tower_flower1') - 1)
  })

  it('covers every non-deprecated type across the groups', () => {
    const listed = MONSTER_GROUPS.flatMap((g) => monsterTypesInGroup(g)).map((t) => t.id)
    const expected = MONSTER_TYPES.filter((t) => !t.deprecated).map((t) => t.id)
    expect(listed.sort()).toEqual(expected.sort())
  })

  // The roster shipped actors/tower_battlement_archer_2.xml — a file the game
  // never had — and every existing test passed, because none of them looked at
  // what a path pointed to. This is that test.
  it('references no actor path that does not exist in the game', () => {
    for (const type of MONSTER_TYPES) {
      for (const path of type.tiers) {
        expect(path).toMatch(/^actors\/[a-z0-9_/]+\.xml$/)
        expect(KNOWN_ACTOR_PATHS, `${type.id} -> ${path}`).toContain(path)
      }
    }
  })
})

describe('arena bodyguard twins (issue #64 part 2)', () => {
  it('lists the 4 live bodyguards in their own group', () => {
    const ids = monsterTypesInGroup('Bodyguards').map((t) => t.id)
    expect(ids.sort()).toEqual(
      [
        'knight_guard',
        'krilith_mb_skeleton',
        'lich_guard_lich',
        'lich_mirror'
      ].sort()
    )
  })

  it('maps every twin key to a roster tier and every value to a known boss_* path', () => {
    for (const [from, to] of Object.entries(ARENA_BODYGUARD_TWINS)) {
      const usedAsATier = MONSTER_TYPES.some((t) => t.tiers.includes(from))
      expect(usedAsATier, `${from} is not any roster tier`).toBe(true)
      expect(KNOWN_ACTOR_PATHS, to).toContain(to)
      expect(to, to).toMatch(/^actors\/boss_/)
    }
  })

  it('leaves a non-twin path unchanged', () => {
    expect(arenaActorPath('actors/bat_1.xml')).toBe('actors/bat_1.xml')
    expect(arenaActorPath(resolveActorPath('tick1'))).toBe(resolveActorPath('tick1'))
  })

  it('never emits a knight lich guard: every skill lacks a sound and crashes the engine', () => {
    for (const n of [1, 2, 3]) {
      const crasher = `actors/boss_knight/knight_guard_lich_${n}.xml`
      expect(MONSTER_TYPES.some((t) => t.tiers.includes(crasher)), crasher).toBe(false)
    }
    expect(isKnownMonsterId('knight_guard_lich1')).toBe(false)
  })

  it('substitutes exactly the 5 twinned actors', () => {
    for (const from of Object.keys(ARENA_BODYGUARD_TWINS)) {
      expect(arenaActorPath(from)).toBe(ARENA_BODYGUARD_TWINS[from])
    }
  })

  it('gives every bodyguard type a real, non-deprecated home', () => {
    for (const id of [
      'knight_guard',
      'lich_guard_lich',
      'lich_mirror',
      'krilith_mb_skeleton'
    ]) {
      expect(isKnownMonsterId(id), id).toBe(true)
      const type = monsterTypeById(id)
      expect(type.group).toBe('Bodyguards')
      expect(type.deprecated).toBeFalsy()
    }
  })
})

describe('act categories', () => {
  // The GUI filter hides anything whose categories are all switched off, so a
  // type with no category would be unreachable in every filter state.
  it('gives every type at least one category the filter bar renders', () => {
    for (const type of MONSTER_TYPES) {
      const categories = monsterCategories(type)
      expect(categories.length, type.id).toBeGreaterThan(0)
      for (const category of categories) {
        expect(MONSTER_CATEGORIES, type.id).toContain(category)
      }
      expect(new Set(categories).size, type.id).toBe(categories.length)
    }
  })

  it('routes the whole Desert group to Temple of the Sun and Bonus to Bonus', () => {
    for (const type of MONSTER_TYPES) {
      if (type.group === 'Desert') expect(monsterCategories(type), type.id).toEqual(['Temple of the Sun'])
      if (type.group === 'Bonus') expect(monsterCategories(type), type.id).toEqual(['Bonus'])
    }
  })

  it('never tags a Desert or Bonus type with an act', () => {
    // Those groups are their own category, so acts would silently do nothing.
    for (const type of MONSTER_TYPES) {
      if (type.group === 'Desert' || type.group === 'Bonus') {
        expect(type.acts, type.id).toBeUndefined()
      }
    }
  })

  it('keeps acts in range, unique and ascending', () => {
    for (const type of MONSTER_TYPES) {
      if (!type.acts) continue
      expect(new Set(type.acts).size, type.id).toBe(type.acts.length)
      expect(type.acts, type.id).toEqual([...type.acts].sort())
      for (const act of type.acts) expect([1, 2, 3, 4], type.id).toContain(act)
    }
  })

  it('matches the wiki mapping quoted in issue #4', () => {
    const categoriesOf = (id: string) => monsterCategories(MONSTER_TYPES.find((t) => t.id === id)!)
    expect(categoriesOf('bat1')).toEqual(['Act 1'])
    expect(categoriesOf('tick1')).toEqual(['Act 1'])
    expect(categoriesOf('maggot')).toEqual(['Act 1', 'Act 2'])
    expect(categoriesOf('slime')).toEqual(['Act 2'])
    expect(categoriesOf('lich')).toEqual(['Act 3', 'Act 4'])
    expect(categoriesOf('tower_nova1')).toEqual(['Act 2', 'Act 3', 'Act 4'])
    // mini-bosses inherit their base monster's acts
    expect(categoriesOf('mb_tick')).toEqual(['Act 1'])
    expect(categoriesOf('mb_skeleton')).toEqual(['Act 2', 'Act 4'])
    // the desert mini-boss sits in Bosses, so it needs the explicit override
    expect(categoriesOf('mb_mummy')).toEqual(['Temple of the Sun'])
    expect(categoriesOf('mummy_desert')).toEqual(['Temple of the Sun'])
    expect(categoriesOf('bonus_archer1')).toEqual(['Bonus'])
    // untagged by design — the wiki places neither
    expect(categoriesOf('spider')).toEqual(['Other'])
    expect(categoriesOf('tower_empty')).toEqual(['Other'])
  })

  it('is presentation only — no parameters.txt key and no default-pool change', () => {
    // acts must never reach the config format or the generator's params.
    const params = defaultParameters()
    const text = serializeParametersTxt(params)
    expect(text).not.toContain('acts')
    expect(parseParametersTxt(text).unknownKeys).toHaveLength(0)
    expect(parseParametersTxt(text).params.levelMonsters).toEqual(params.levelMonsters)
  })
})

describe('single-tier monsters', () => {
  // createRolled starts at tier 1 and can never walk down, so a one-tier type
  // used to index past its own array and emit <string name="type">undefined.
  for (const id of ['bonus_archer1', 'spider', 'archer3', 'wisp2', 'skeleton3', 'tower_empty']) {
    it(`emits a real actor path for ${id}, never undefined`, () => {
      const xml = levelXML(generateWithOnly(id, 4242))
      const type = MONSTER_TYPES.find((t) => t.id === id)!
      expect(type.tiers).toHaveLength(1)
      expect(xml).toContain(type.tiers[0])
      expect(xml).not.toContain('>undefined<')
    })
  }
})

describe('bonus monsters', () => {
  it('emits both the spawner and the actor for bonus_skeleton1', () => {
    const xml = levelXML(generateWithOnly('bonus_skeleton1', 909, 300))
    expect(xml).toContain('actors/bonus/skeleton_1.xml')
    expect(xml).toContain('actors/spawners/bonus/skeleton_1.xml')
    expect(xml).not.toContain('>undefined<')
  })

  it('leaves stock seeds untouched — the bonus types are opt-in', () => {
    const params = defaultParameters()
    for (const pool of params.levelMonsters) {
      expect(pool).not.toContain('bonus_skeleton1')
      expect(pool).not.toContain('bonus_archer1')
    }
    expect(params.monsterMax.bonus_skeleton1).toBe(300)
    expect(params.monsterMax.bonus_archer1).toBe(60)
  })
})

describe('skeleton3 and tower_empty', () => {
  it('are both pooled only on the escape floor, the campaign\'s last', () => {
    const params = defaultParameters()
    // Neither reaches the campaign proper. They arrived as opt-in ceilings and
    // stayed that way until the escape floor — the extra dungeon floor played
    // after the boss — put both in its pool: skeleton3 to chase, tower_empty
    // repeated often enough to wall the route off.
    for (const pool of params.levelMonsters.slice(0, -1)) {
      expect(pool).not.toContain('skeleton3')
      expect(pool).not.toContain('tower_empty')
    }
    const escape = params.levelMonsters[params.levelMonsters.length - 1]
    expect(escape).toContain('skeleton3')
    // a share rather than a count, so lengthening the roster beside them can't
    // silently thin the maze — see the same assertion in presets.test.ts
    const share = escape.filter((id) => id === 'tower_empty').length / escape.length
    expect(share).toBeGreaterThan(0.4)
    expect(share).toBeLessThan(0.5)

    expect(params.monsterMax.skeleton3).toBe(100)
    // A horde is trunc(fRand(cap/5, cap)) per lair, so the cap is what makes
    // the escape floor a maze of battlements. The roster's own defaultMax is
    // untouched at 24 — this is the preset overriding it, and tower_empty is
    // pooled nowhere else in any preset, so no other floor can see it.
    expect(monsterTypeById('tower_empty').defaultMax).toBe(24)
    expect(params.monsterMax.tower_empty).toBe(150)
  })

  it('pins the layout RNG stream for a seed', () => {
    // WHAT THIS GUARDS: that nothing reaches `ctx.rand` by accident. A failure
    // here means some change moved the layout stream, and that is only ever
    // acceptable deliberately — re-baseline it in the same commit that causes
    // it, say so in the PR body, and never just to make the suite green.
    //
    // REBASELINED BY ISSUE #58. The hashes below are NOT c494670's any more.
    // Restoring the per-type `upgradeChance` changed how many values the tier
    // roll draws per monster (a 1.0 chance always climbed to the top tier and
    // burned tiers.length - 1 draws; a real chance stops early), so every seed's
    // population and every later floor's layout moved. That was the accepted,
    // stated cost of fixing the always-elite bug.
    //
    // REBASELINED AGAIN by the post-#58 monster-pool/cap playtest pass
    // (parameters.ts/presets.ts). This test inherits `monsterMax` from
    // `defaultParameters()` rather than freezing it — deliberately, so a
    // registry-level cap change is exactly the kind of thing it should catch —
    // and that pass raised `skeleton2` (80→100) and lowered `lich` (30→20),
    // both pooled in the literal floors below. A cap change moves a lair's
    // horde-size draw, which shifts every later floor's stream, same mechanism
    // as the #58 rebaseline above, different cause.
    //
    // Its ORIGINAL purpose still holds and is still tested: the two opt-in types
    // this describe block covers are absent from every pool below, so if adding
    // a type to the roster ever reaches the RNG, these hashes move again.
    //
    // Only `levels/level*.xml` is hashed — those are the RNG's output, and the
    // rest of the campaign is not. The original digest covered every file, so
    // it broke the moment the Lobby tab added `levels/lobby.xml` and a line to
    // `levels.xml`, neither of which draws a random value. The subset is
    // unchanged from c494670's; only the expected digests moved (see above).
    //
    // The floor plan is c494670's defaultParameters() frozen as a literal, not
    // today's default. `defaultParameters()` is now the Castle preset (7 floors,
    // themes a..g) — a deliberate content change, and reading it here would turn
    // this RNG-stability check into a test of whatever the shipped default
    // happens to be. Everything the RNG consumes is spelled out below; the rest
    // (monsterMax ceilings, lobby, tweaks) does not reach the layout stream.
    const expected: Record<number, string> = {
      1234: '599f0bd3773f09b546987259862a1eb380de74aed05738c7e89ada59e1c09647',
      987654: '88023710004c21b45b12fe9a71587b22e246f9d4f1f45b84c5ad9f5ae062bfad'
    }
    for (const [seed, hash] of Object.entries(expected)) {
      // the baseline predates the final-room lock, which now defaults on and reshapes
      // the last floor — hash the same open-orb dungeon it was measured over.
      // It also predates the boss feature, which — also on by default — would
      // otherwise swap the final floor's Orb prefab for a BossPortal; turn it
      // off so this stays a test of the RNG layout stream, not the boss's.
      const params = defaultParameters()
      params.levelLock = undefined
      params.boss.enabled = false
      // and the escape floor's 90-second hazard, its wall traps, and the
      // per-floor music cues — all three the shipped preset now arms on top of
      // c494670's layout, and all three append nodes to a floor's XML, which
      // this digest covers. Same reasoning as the two resets above: the
      // baseline predates them, so hash the campaign it was measured over.
      params.levelTimers = undefined
      params.levelTraps = undefined
      params.floorMusic = undefined
      delete params.levelOrder
      params.levels = 8
      params.themes = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd']
      params.levelMonsters = [
        ['bat1', 'tick1', 'maggot'],
        ['bat1', 'tick1', 'slime', 'maggot'],
        ['slime', 'skeleton1', 'maggot'],
        ['eye', 'skeleton1', 'archer1', 'archer2'],
        ['wisp1', 'skeleton1', 'archer2', 'eye'],
        ['skeleton1', 'archer2', 'skeleton2', 'wisp1'],
        ['skeleton2', 'archer2', 'lich'],
        ['skeleton2', 'lich']
      ]
      const result = generateDungeon(params, Number(seed))
      expect(result.ok).toBe(true)
      const digest = createHash('sha256')
      for (const file of (result as DungeonResult).files) {
        if (!/^levels\/level\d+\.xml$/.test(file.path)) continue
        digest.update(`${file.path} ${file.content} `)
      }
      expect(digest.digest('hex'), `seed ${seed}`).toBe(hash)
    }
  })
})

describe('deprecated monster types', () => {
  it('hides tower_archer2 from what the GUI renders', () => {
    const rendered = MONSTER_GROUPS.flatMap((g) => monsterTypesInGroup(g)).map((t) => t.id)
    expect(rendered).not.toContain('tower_archer2')
    expect(rendered).toContain('tower_empty')
    expect(rendered).toContain('skeleton3')
    // hidden from the lists, still a real type everywhere else
    expect(MONSTER_TYPES.some((t) => t.id === 'tower_archer2')).toBe(true)
  })

  it('still round-trips through parameters.txt', () => {
    // A user's existing file names maxTowers_Archer2; hiding the type in the
    // GUI must not make that key vanish on save.
    const params = defaultParameters()
    params.monsterMax = { ...params.monsterMax, tower_archer2: 7 }
    const text = serializeParametersTxt(params)
    expect(text).toContain('maxTowers_Archer2=7')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toHaveLength(0)
    expect(parsed.params.monsterMax.tower_archer2).toBe(7)
  })

  it('emits a real actor for tower_archer2 instead of the phantom path', () => {
    const xml = levelXML(generateWithOnly('tower_archer2', 555))
    expect(xml).toContain('actors/tower_battlement_empty.xml')
    expect(xml).not.toContain('tower_battlement_archer_2')
    expect(xml).not.toContain('>undefined<')
  })
})
