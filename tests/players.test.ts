import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLASSES_PATH,
  COMBO_BUFFS_PATH,
  COMBO_OWNED_FIXES,
  OWNED_CATEGORY,
  LIGHTNING_BOLT_PATH,
  PLAYER_FIELDS,
  PLAYER_FIELD_MAP,
  PLAYER_STOCK,
  PLAYER_STOCK_SOURCE,
  POWER_SHOP_PATH,
  SHARED_SKILL_PATHS,
  SHOP_CONSTANTS_PATH,
  applyLineEdits,
  extraKey,
  parseExtras,
  parseClasses,
  parseShopPrices,
  parseSkillFile,
  playerOverrides,
  prunePlayerTweaks,
  sharedCopyPath,
  shopKey,
  skillKey,
  startingLevelKey,
  statKey,
  unlockKey
} from '../src/generator/players'
import type { PlayerTweaks } from '../src/generator/players'
import { parseSval, svalGet, svalInt } from '../src/generator/ae/sval'
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
    expect(parseShopPrices(readAsset(POWER_SHOP_PATH), readAsset(SHOP_CONSTANTS_PATH))).toEqual(PLAYER_STOCK.shop)
    expect(parseExtras(readAsset(COMBO_BUFFS_PATH), readAsset(LIGHTNING_BOLT_PATH))).toEqual(PLAYER_STOCK.extras)
  })

  it('has the power shop potions and the five item qualities, but not the extra life', () => {
    expect(PLAYER_STOCK.shop.map((p) => p.id)).toEqual([
      'power_rejuv',
      'potion_damage',
      'potion_rejuv',
      'potion_invul',
      'potion_speed',
      'equipment_common',
      'equipment_uncommon',
      'equipment_rare',
      'equipment_epic',
      'equipment_unique'
    ])
    expect(PLAYER_FIELD_MAP.get(shopKey('potion_damage'))?.stock).toBe(1000)
  })

  it('offers a starting level for every skill and modifier, up to its level count', () => {
    // bought, so none owned; a class's first skill, owned at level 1 as AE ships it
    expect(PLAYER_FIELD_MAP.get(unlockKey('wiz_meteor'))).toMatchObject({ kind: 'unlock', stock: 0 })
    expect(PLAYER_FIELD_MAP.get(unlockKey('wiz_fireball'))).toMatchObject({ kind: 'unlock', stock: 1, maxLevel: 1 })
    expect(PLAYER_FIELD_MAP.get(startingLevelKey('shared_combo:shared_combo_nova'))).toMatchObject({ kind: 'unlock', stock: 0, maxLevel: 5 })
    expect(PLAYER_FIELD_MAP.get(unlockKey('shared_combo'))?.maxLevel).toBe(1)
  })

  it('has the combo regen buffs and the lightning bolt outside players/', () => {
    const stock = (id: string) => PLAYER_FIELD_MAP.get(extraKey(id))?.stock
    expect([1, 2, 3, 4, 5].map((t) => stock(`combo_mana_${t}`))).toEqual([4, 6, 8, 10, 12])
    expect([1, 2, 3, 4, 5].map((t) => stock(`combo_heal_${t}`))).toEqual([2, 4, 6, 8, 10])
    expect(stock('lightning_range')).toBe(50)
    expect(stock('lightning_repeat_mul')).toBe(0.75)
    expect(PLAYER_FIELD_MAP.get(extraKey('lightning_range'))?.kind).toBe('param')
  })

  it('reads the skill-level params beside the binds', () => {
    const stock = (key: string) => PLAYER_FIELD_MAP.get(key)
    expect(stock(skillKey('ran_bow', 1, 'overheating-max'))).toMatchObject({ kind: 'param', stock: 5 })
    expect(stock(skillKey('ran_bow', 1, 'move-speed-mul'))?.stock).toBe(0.25)
    expect(stock(skillKey('pal_sword', 1, 'cast-speed-mul'))?.stock).toBe(2)
    expect(stock(skillKey('pal_sword', 1, 'cooldown'))?.stock).toBe(200)
    expect(stock(skillKey('ran_flurry', 1, 'speed-mul'))?.stock).toBe(0.33)
    // upgrades carry their own heat recovery directly
    expect([1, 2, 3, 4, 5].map((t) => stock(skillKey('ran_bow:ran_bow_damage', t, 'overheating-recovery'))?.stock)).toEqual([
      4, 5, 6, 7, 8
    ])
    // the end of the move-speed window, with its start
    expect(stock(skillKey('wiz_meteor', 1, 'move-speed-until'))).toMatchObject({ kind: 'param', stock: 260, windowStart: 0 })
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

  it('an unlock writes starting-level beside the skill\'s own price', () => {
    const out = playerOverrides({ [unlockKey('wiz_meteor')]: 1 })
    expect(out.map((o) => o.path)).toEqual(['players/wizard/skills/wiz_meteor.sval'])
    expect(out[0].edits).toEqual([
      {
        line: PLAYER_FIELD_MAP.get(skillKey('wiz_meteor', 1, 'cost'))!.line,
        kind: 'text',
        find: '<int name="cost">',
        replace: '<int name="starting-level">1</int> <int name="cost">'
      }
    ])
  })

  it.skipIf(assets === null)('an unlocked skill reads back with starting-level 1 at its root', () => {
    const path = 'players/wizard/skills/wiz_meteor.sval'
    const [o] = playerOverrides({ [unlockKey('wiz_meteor')]: 1, [skillKey('wiz_meteor', 1, 'cost')]: 0 })
    const root = parseSval(applyLineEdits(readAsset(path), o.edits).text)
    expect(svalInt(svalGet(root, 'starting-level'))).toBe(1)
    expect(svalInt(svalGet(root, 'cost'))).toBe(0)
  })

  it('a starting level rewrites one the file already has', () => {
    // the wizard's fireball, which AE ships owned at level 1
    const field = PLAYER_FIELD_MAP.get(unlockKey('wiz_fireball'))!
    const out = playerOverrides({ [field.key]: 0 })
    expect(out[0].edits).toEqual([{ line: field.line, kind: 'value', name: 'starting-level', value: '0' }])
  })

  it('a modifier owned at its top level leaves the shop; one below it stays on sale', () => {
    const nova = startingLevelKey('shared_combo:shared_combo_nova')
    const nova1 = PLAYER_STOCK.skills.find((s) => s.stem === 'shared_combo')!.chains.find((c) => c.key.endsWith('nova'))!.tiers[0]
    const top = playerOverrides({ [nova]: 5 })[0].edits
    expect(top).toContainEqual({ line: nova1.categoryLine, kind: 'value', name: 'category', value: OWNED_CATEGORY })
    const partway = playerOverrides({ [nova]: 2 })[0].edits
    expect(partway.some((e) => e.kind === 'value' && e.name === 'category')).toBe(false)
  })

  it.skipIf(assets === null)('a maxed modifier reads back at its top level, in no vendor\'s column', () => {
    const path = 'players/shared/skills/shared_combo.sval'
    const [o] = playerOverrides({ [startingLevelKey('shared_combo:shared_combo_nova')]: 5 })
    const nova = svalGet(parseSval(applyLineEdits(readAsset(path), o.edits).text), 'modifier-skills')!.children.find(
      (m) => svalGet(m, 'id')?.text === 'shared_combo_nova'
    )!
    expect(svalInt(svalGet(nova, 'starting-level'))).toBe(5)
    expect(svalGet(nova, 'category')?.text).toBe(OWNED_CATEGORY)
  })

  it('combo owned from the start patches AE\'s two bought-only combo checks; a bought one does not', () => {
    const owned = playerOverrides({ [unlockKey('shared_combo')]: 1 })
    for (const fix of COMBO_OWNED_FIXES) {
      expect(owned.find((o) => o.path === fix.path)?.edits, fix.path).toEqual([
        { line: fix.line, kind: 'text', find: fix.find, replace: fix.replace }
      ])
    }
    const bought = playerOverrides({ [skillKey('shared_combo', 1, 'cost')]: 0 })
    for (const fix of COMBO_OWNED_FIXES) expect(bought.some((o) => o.path === fix.path), fix.path).toBe(false)
  })

  it.skipIf(assets === null)('the combo checks sit on the lines AE ships them on', () => {
    for (const fix of COMBO_OWNED_FIXES) {
      expect(readAsset(fix.path).split('\n')[fix.line - 1], fix.path).toContain(fix.find)
    }
  })

  it('a param patches its own element; a window end keeps the window start', () => {
    const out = playerOverrides({
      [skillKey('wiz_meteor', 1, 'move-speed-mul')]: 0,
      [skillKey('wiz_meteor', 1, 'move-speed-until')]: 1000
    })
    expect(out.map((o) => o.path)).toEqual(['players/wizard/skills/wiz_meteor.sval'])
    expect(out[0].edits).toEqual([
      { line: PLAYER_FIELD_MAP.get(skillKey('wiz_meteor', 1, 'move-speed-mul'))!.line, kind: 'value', name: 'move-speed-mul', value: '0' },
      { line: PLAYER_FIELD_MAP.get(skillKey('wiz_meteor', 1, 'move-speed-until'))!.line, kind: 'value', name: 'move-speed', value: '0 1000' }
    ])
  })

  it.skipIf(assets === null)('a patched skill reads back with its new params', () => {
    const path = 'players/wizard/skills/wiz_meteor.sval'
    const [o] = playerOverrides({
      [skillKey('wiz_meteor', 1, 'move-speed-mul')]: 0,
      [skillKey('wiz_meteor', 1, 'move-speed-until')]: 1000
    })
    const skill = svalGet(parseSval(applyLineEdits(readAsset(path), o.edits).text), 'skill')
    expect(svalGet(skill, 'move-speed-mul')?.text.trim()).toBe('0')
    expect(svalGet(skill, 'move-speed')?.text.trim()).toBe('0 1000')
  })

  it('an extra value rewrites its whole number, nothing else on the line', () => {
    const out = playerOverrides({ [extraKey('combo_mana_4')]: 20, [extraKey('lightning_repeat_mul')]: 1 })
    expect(out.map((o) => o.path)).toEqual([LIGHTNING_BOLT_PATH, COMBO_BUFFS_PATH])
    expect(out[0].edits).toEqual([
      { line: 8, kind: 'text', find: '<float name="consecutive-mul">0.75</float>', replace: '<float name="consecutive-mul">1</float>' }
    ])
    // "level_4 10": the tier digit is not the value
    expect(out[1].edits).toEqual([
      {
        line: 233,
        kind: 'text',
        find: '%block Combo_mana_regen combo_mana_regen_level_4 10',
        replace: '%block Combo_mana_regen combo_mana_regen_level_4 20'
      }
    ])
  })

  it('potion and item prices patch the shop scripts', () => {
    const out = playerOverrides({ [shopKey('potion_damage')]: 0, [shopKey('equipment_rare')]: 10 })
    expect(out).toEqual([
      { path: SHOP_CONSTANTS_PATH, source: SHOP_CONSTANTS_PATH, edits: [{ line: 83, kind: 'text', find: '= 750;', replace: '= 10;' }] },
      { path: POWER_SHOP_PATH, source: POWER_SHOP_PATH, edits: [{ line: 79, kind: 'text', find: ', 1000);', replace: ', 0);' }] }
    ])
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
