import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLASSES_PATH,
  PLAYER_FIELDS,
  PLAYER_FIELD_MAP,
  PLAYER_STOCK,
  PLAYER_STOCK_SOURCE,
  SHARED_SKILL_PATHS,
  applyLineEdits,
  parseClasses,
  parseSkillFile,
  playerOverrides,
  prunePlayerTweaks,
  sharedCopyPath,
  skillKey,
  statKey
} from '../src/generator/players'
import type { PlayerTweaks } from '../src/generator/players'
import { aeAssetsDir } from './aeInstall'

const assets = aeAssetsDir()
const readAsset = (rel: string): string => readFileSync(join(assets!, rel), 'utf8')

describe('player snapshot', () => {
  it('covers the seven classes and the shared skill files', () => {
    expect(PLAYER_STOCK.classes.map((c) => c.id)).toEqual([
      'wizard',
      'paladin',
      'ranger',
      'thief',
      'sorcerer',
      'priest',
      'warlock'
    ])
    expect([...SHARED_SKILL_PATHS].sort()).toEqual([
      'players/shared/skills/shared_combo.sval',
      'players/shared/skills/shared_speed.sval',
      'players/shared/skills/shared_speed_melee.sval'
    ])
  })

  it('keys are unique and lowercase', () => {
    expect(PLAYER_FIELD_MAP.size).toBe(PLAYER_FIELDS.length)
    for (const f of PLAYER_FIELDS) expect(f.key).toBe(f.key.toLowerCase())
  })

  it('the warlock gargoyle is bought from def2 for 900', () => {
    const f = PLAYER_FIELD_MAP.get(skillKey('warlock_gargoyle', 1, 'cost'))
    expect(f?.stock).toBe(900)
  })

  it.skipIf(assets === null)('matches the installed assets', () => {
    expect(assets!.endsWith(PLAYER_STOCK_SOURCE)).toBe(true)
    expect(parseClasses(readAsset(CLASSES_PATH))).toEqual(PLAYER_STOCK.classes)
    for (const s of PLAYER_STOCK.skills) expect(parseSkillFile(s.path, readAsset(s.path))).toEqual(s)
  })
})

describe('player overrides', () => {
  it('nothing changed ships nothing', () => {
    expect(playerOverrides({})).toEqual([])
    // stock values and unknown (HW1) keys are dropped too
    expect(playerOverrides({ [statKey('wizard', 'base-health')]: 35, 'player.knight.max-health': 500 })).toEqual([])
  })

  it('a class stat patches classes.sval only', () => {
    const out = playerOverrides({ [statKey('warlock', 'base-health')]: 400 })
    expect(out.map((o) => o.path)).toEqual([CLASSES_PATH])
    expect(out[0].edits).toEqual([
      { line: PLAYER_FIELD_MAP.get(statKey('warlock', 'base-health'))!.line, kind: 'value', name: 'base-health', value: '400' }
    ])
  })

  it('a damage tier rewrites the bind and the shop text that echoes it', () => {
    const key = skillKey('warlock_dagger:warlock_dagger_dmg', 1, 'dagger-dmg')
    const out = playerOverrides({ [key]: 50 })
    expect(out.map((o) => o.path)).toEqual(['players/warlock/skills/warlock_dagger.sval'])
    const texts = out[0].edits.filter((e) => e.kind === 'text')
    // this tier's own "dagger-dmg=14", and the next tier's "curr-dagger-dmg=14"
    expect(texts.map((e) => (e.kind === 'text' ? e.replace : ''))).toEqual(['&dagger-dmg=50', '?curr-dagger-dmg=50'])
  })

  it('a class-scoped edit forks the shared file and repoints that class only', () => {
    const key = skillKey('shared_speed_melee', 1, 'movespeed-mul', 'warlock')
    const out = playerOverrides({ [key]: 2 })
    const copy = sharedCopyPath('players/shared/skills/shared_speed_melee.sval', 'warlock')
    expect(out.map((o) => o.path)).toEqual([CLASSES_PATH, copy])
    expect(out[1].source).toBe('players/shared/skills/shared_speed_melee.sval')
    const repoint = out[0].edits
    expect(repoint).toHaveLength(1)
    const warlock = PLAYER_STOCK.classes.find((c) => c.id === 'warlock')!
    expect(repoint[0].line).toBe(warlock.skills.find((s) => s.path.endsWith('shared_speed_melee.sval'))!.line)
  })

  it('a class override wins over the all-classes one in its copy', () => {
    const all = skillKey('shared_speed', 1, 'movespeed-mul')
    const own = skillKey('shared_speed', 1, 'movespeed-mul', 'wizard')
    const out = playerOverrides({ [all]: 1.5, [own]: 3 })
    const shared = out.find((o) => o.path === 'players/shared/skills/shared_speed.sval')!
    const copy = out.find((o) => o.path === sharedCopyPath('players/shared/skills/shared_speed.sval', 'wizard'))!
    expect(shared.edits.find((e) => e.kind === 'value')).toMatchObject({ value: '1.5' })
    expect(copy.edits.find((e) => e.kind === 'value')).toMatchObject({ value: '3' })
  })

  it('prunes to known, finite, non-stock values and truncates ints', () => {
    const key = skillKey('warlock_gargoyle', 1, 'cost')
    expect(prunePlayerTweaks({ [key.toUpperCase()]: 10.7, [statKey('wizard', 'base-mana')]: Number.NaN })).toEqual({
      [key]: 10
    })
  })

  it.skipIf(assets === null)('every field patches cleanly against the install', () => {
    // every value moved off stock at once, classes forked too
    const tweaks: PlayerTweaks = {}
    for (const f of PLAYER_FIELDS) tweaks[f.key] = f.stock + 1
    for (const o of playerOverrides(tweaks)) {
      const { text, missed } = applyLineEdits(readAsset(o.source), o.edits)
      expect(missed, o.path).toEqual([])
      expect(text.split('\n').length).toBe(readAsset(o.source).split('\n').length)
    }
  })

  it('applyLineEdits reports an edit whose target moved', () => {
    const { text, missed } = applyLineEdits('a\n<int name="cost">5</int>\n', [
      { line: 2, kind: 'value', name: 'cost', value: '9' },
      { line: 1, kind: 'value', name: 'cost', value: '9' }
    ])
    expect(text).toBe('a\n<int name="cost">9</int>\n')
    expect(missed).toHaveLength(1)
  })
})
