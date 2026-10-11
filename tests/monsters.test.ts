import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  ARENA_BODYGUARD_TWINS,
  MONSTER_CATEGORIES,
  MONSTER_GROUPS,
  MONSTER_TYPES,
  arenaActorPath,
  defaultParameters,
  monsterCategories,
  monsterTypeById,
  monsterTypesInGroup,
  parseParametersTxt,
  resolveActorPath,
  serializeParametersTxt
} from '../src/generator'
import { isKnownMonsterId } from '../src/generator/objects/monsterTypes'
import { AE_UNIT_SET } from '../src/generator/catalog/assets'
import type { DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { generateOk, lvlText } from './ae'

/** Generate a single floor whose only monster type is `id`, with a usable max. */
function generateWithOnly(id: string, seed: number, max = 60): DungeonResult {
  const params = plainParameters()
  params.levels = 1
  params.themes = ['prison']
  params.levelMonsters = [[id]]
  params.monsterMax = { ...params.monsterMax, [id.split('#')[0]]: max }
  return generateOk(params, seed)
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

  it('falls back to the first roster entry for an unknown id', () => {
    expect(monsterTypeById('bogus')).toBe(MONSTER_TYPES[0])
    expect(MONSTER_TYPES[0].id).toBe('skeleton_warrior')
  })

  it('lists each group alphabetically without reordering the array', () => {
    for (const group of MONSTER_GROUPS) {
      const ids = monsterTypesInGroup(group).map((t) => t.id)
      expect(ids, group).toEqual([...ids].sort())
    }
  })

  it('covers every non-deprecated type across the groups', () => {
    const listed = MONSTER_GROUPS.flatMap((g) => monsterTypesInGroup(g)).map((t) => t.id)
    const expected = MONSTER_TYPES.filter((t) => !t.deprecated).map((t) => t.id)
    expect(listed.sort()).toEqual(expected.sort())
  })

  // A path the game does not ship spawns nothing and logs an error — and no
  // other test looks at what a path points to. This is that test.
  it('references only actor units the AE install ships', () => {
    for (const type of MONSTER_TYPES) {
      for (const path of type.tiers) {
        expect(path).toMatch(/^actors\/[a-z0-9_/]+\.unit$/)
        expect(AE_UNIT_SET.has(path), `${type.id} -> ${path}`).toBe(true)
      }
    }
  })

  it('carries the AE-only campaigns: Shaftlocke and Temple of the Sun types', () => {
    expect(monsterTypesInGroup('Shaftlocke').length).toBeGreaterThan(10)
    expect(monsterTypesInGroup('Temple of the Sun').length).toBeGreaterThan(5)
  })
})

describe('arena bodyguard twins', () => {
  it('keeps every boss add in the Bodyguards group, all under actors/bosses/ or a boss-only unit', () => {
    const ids = monsterTypesInGroup('Bodyguards').map((t) => t.id)
    expect(ids).toEqual(
      expect.arrayContaining(['knight_guard', 'krilith_frost_guard', 'lich_guard_lich', 'lich_mirror', 'vampire_thrall', 'eye_add'])
    )
    for (const id of ids) {
      for (const path of monsterTypeById(id).tiers) expect(path, id).toMatch(/^actors\/bosses\//)
    }
  })

  it('maps every twin key to a roster tier and every value to a shipped boss_* unit', () => {
    for (const [from, to] of Object.entries(ARENA_BODYGUARD_TWINS)) {
      const usedAsATier = MONSTER_TYPES.some((t) => t.tiers.includes(from))
      expect(usedAsATier, `${from} is not any roster tier`).toBe(true)
      expect(AE_UNIT_SET.has(to), to).toBe(true)
      expect(to, to).toMatch(/^actors\/bosses\/boss_/)
    }
  })

  it('leaves a non-twin path unchanged', () => {
    expect(arenaActorPath(resolveActorPath('bat'))).toBe(resolveActorPath('bat'))
    expect(arenaActorPath(resolveActorPath('tick'))).toBe(resolveActorPath('tick'))
  })

  it('substitutes exactly the twinned actors', () => {
    for (const from of Object.keys(ARENA_BODYGUARD_TWINS)) {
      expect(arenaActorPath(from)).toBe(ARENA_BODYGUARD_TWINS[from])
    }
  })

  it('gives every bodyguard type a real, non-deprecated home', () => {
    for (const id of ['knight_guard', 'lich_guard_lich', 'lich_mirror', 'krilith_frost_guard']) {
      expect(isKnownMonsterId(id), id).toBe(true)
      const type = monsterTypeById(id)
      expect(type.group).toBe('Bodyguards')
      expect(type.deprecated).toBeFalsy()
    }
  })
})

describe('campaign categories', () => {
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

  it('routes the campaign groups to their own campaign', () => {
    for (const type of MONSTER_TYPES) {
      if (type.group === 'Shaftlocke') expect(monsterCategories(type), type.id).toEqual(['Shaftlocke Tower'])
      if (type.group === 'Temple of the Sun') expect(monsterCategories(type), type.id).toEqual(['Temple of the Sun'])
      if (type.group === 'Bonus') expect(monsterCategories(type), type.id).toEqual(['Other'])
    }
  })

  it('places the familiar monsters where AE uses them', () => {
    const categoriesOf = (id: string) => monsterCategories(monsterTypeById(id))
    expect(categoriesOf('bat')).toEqual(['Castle Hammerwatch'])
    expect(categoriesOf('skeleton_lich')).toEqual(['Castle Hammerwatch'])
    expect(categoriesOf('mb_mummy')).toEqual(['Temple of the Sun'])
    expect(categoriesOf('prison_warrior')).toEqual(['Shaftlocke Tower'])
    expect(categoriesOf('vampire_bat')).toEqual(['Shaftlocke Tower'])
    // untagged by design: no stock campaign level places them
    expect(categoriesOf('tower_battlement_empty')).toEqual(['Other'])
  })

  it('is presentation only — no parameters.txt key and no default-pool change', () => {
    const params = defaultParameters()
    const text = serializeParametersTxt(params)
    expect(text).not.toContain('campaigns')
    expect(parseParametersTxt(text).unknownKeys).toHaveLength(0)
    expect(parseParametersTxt(text).params.levelMonsters).toEqual(params.levelMonsters)
  })
})

describe('single-tier monsters', () => {
  // createRolled starts at tier 1 and can never walk down, so a one-tier type
  // used to index past its own array and emit an undefined path.
  for (const id of ['temple_archer', 'skeleton_runner', 'tower_battlement_empty', 'scorpion', 'battlemage']) {
    it(`emits a real actor path for ${id}, never undefined`, () => {
      const text = lvlText(generateWithOnly(id, 4242), 'floor0')
      const type = monsterTypeById(id)
      expect(type.tiers).toHaveLength(1)
      expect(text).toContain(type.tiers[0])
      expect(text).not.toContain('undefined')
    })
  }
})

describe('bonus monsters', () => {
  it('emits the bonus ghost actor', () => {
    const text = lvlText(generateWithOnly('bonus_ghost', 909, 300), 'floor0')
    expect(text).toContain('actors/special/bonus/bonus_ghost.unit')
    expect(text).not.toContain('undefined')
  })

  it('leaves stock seeds untouched — the bonus types are opt-in', () => {
    const params = defaultParameters()
    for (const pool of params.levelMonsters) {
      expect(pool).not.toContain('bonus_ghost')
      expect(pool).not.toContain('bonus_demon')
    }
    expect(params.monsterMax.bonus_ghost).toBe(300)
    expect(params.monsterMax.bonus_demon).toBe(60)
  })
})

describe('the escape floor', () => {
  it('pools the runner and the empty battlements only on the last floor', () => {
    const params = defaultParameters()
    for (const pool of params.levelMonsters.slice(0, -1)) {
      expect(pool).not.toContain('skeleton_runner')
      expect(pool).not.toContain('tower_battlement_empty')
    }
    const escape = params.levelMonsters[params.levelMonsters.length - 1]
    expect(escape).toContain('skeleton_runner')
    // a share rather than a count, so lengthening the roster beside them can't
    // silently thin the maze — see the same assertion in presets.test.ts
    const share = escape.filter((id) => id === 'tower_battlement_empty').length / escape.length
    expect(share).toBeGreaterThan(0.4)
    expect(share).toBeLessThan(0.5)

    expect(params.monsterMax.skeleton_runner).toBe(100)
    // the campaign raises the battlement cap; the roster's own default stays put
    expect(monsterTypeById('tower_battlement_empty').defaultMax).toBe(24)
    expect(params.monsterMax.tower_battlement_empty).toBe(150)
  })

  it('pins the layout RNG stream for a seed', () => {
    // WHAT THIS GUARDS: that nothing reaches `ctx.rand` by accident. A failure
    // here means some change moved the layout stream (or the floor emitter's
    // output), and that is only ever acceptable deliberately — re-baseline it
    // in the same commit that causes it and say so in the commit message.
    //
    // Baselined on the AE port; re-baselined 2026-10-10 for the shop's
    // UseTrigger→ShopArea connection and the AnnounceText Style lines (no
    // layout change: scripts/dev/layout-hash.ts, dump-floors.ts). Only the
    // floor `.lvl` files are hashed, over a
    // fixed literal plan with every optional layer off, so a change to the
    // shipped default campaign does not move it.
    const expected: Record<number, string> = {
      1234: '1ed254114fc6685b9c3dca06ca805fbf2dcca86578f8bb4e06c979a6aceacb6b',
      987654: '70cab70a57ed8b17b2021287dd87e2e93a29d3ad87ae51e4c4038e03cee50950'
    }
    for (const [seed, hash] of Object.entries(expected)) {
      const params = defaultParameters()
      params.levelLock = undefined
      params.boss.enabled = false
      params.levelTimers = undefined
      params.levelTraps = undefined
      params.floorMusic = undefined
      params.lobbies = []
      delete params.levelOrder
      params.levels = 8
      params.themes = ['prison', 'prison', 'armory', 'armory', 'archives', 'archives', 'chambers', 'chambers']
      params.levelMonsters = [
        ['bat', 'tick', 'maggot'],
        ['bat', 'tick', 'slime', 'maggot'],
        ['slime', 'skeleton_warrior', 'maggot'],
        ['eye', 'skeleton_warrior', 'skeleton_archer', 'skeleton_ranger'],
        ['wisp', 'skeleton_warrior', 'skeleton_ranger', 'eye'],
        ['skeleton_warrior', 'skeleton_ranger', 'skeleton_soldier', 'wisp'],
        ['skeleton_soldier', 'skeleton_ranger', 'skeleton_lich'],
        ['skeleton_soldier', 'skeleton_lich']
      ]
      const result = generateOk(params, Number(seed))
      const digest = createHash('sha256')
      for (const file of result.files) {
        if (!/\/floor\d+\.lvl$/.test(file.path)) continue
        digest.update(`${file.path} ${file.content} `)
      }
      expect(digest.digest('hex'), `seed ${seed}`).toBe(hash)
    }
  })
})
