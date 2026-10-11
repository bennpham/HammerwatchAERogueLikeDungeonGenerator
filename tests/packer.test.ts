import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  AE_DIR_NAME,
  assetOverrideFiles,
  findAeInstall,
  hasH1cMagic,
  installScenario,
  isAeInstall,
  patchedPowerShop,
  steamLibraryCandidates,
  unpackedAssetsDir,
  writeCampaign
} from '../src/main/packer'
import { generateDungeon } from '../src/generator'
import { playerOverrides, skillKey, statKey } from '../src/generator/players'
import type { DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { AE_ROOT, HAS_AE } from './aeInstall'

describe('packer — files', () => {
  it('writes files with nested folders, decoding base64 ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    await writeCampaign(dir, [
      { path: 'info.xml', content: '<info/>' },
      { path: 'levels/d/floor0.lvl', content: '<dict/>' },
      { path: 'logos.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), encoding: 'base64' }
    ])
    expect(readFileSync(join(dir, 'info.xml'), 'utf-8')).toBe('<info/>')
    expect(readFileSync(join(dir, 'levels/d/floor0.lvl'), 'utf-8')).toBe('<dict/>')
    expect([...readFileSync(join(dir, 'logos.png'))]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('recognises a packed scenario by its HW1S header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    writeFileSync(join(dir, 'good.h1c'), Buffer.concat([Buffer.from('HW1S'), Buffer.alloc(8)]))
    writeFileSync(join(dir, 'bad.h1c'), 'PK\x03\x04')
    expect(hasH1cMagic(join(dir, 'good.h1c'))).toBe(true)
    expect(hasH1cMagic(join(dir, 'bad.h1c'))).toBe(false)
    expect(hasH1cMagic(join(dir, 'missing.h1c'))).toBe(false)
  })
})

describe('packer — finding the install', () => {
  it('needs both HW1A.exe and PACKAGER.exe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    expect(isAeInstall(dir)).toBe(false)
    writeFileSync(join(dir, 'HW1A.exe'), '')
    expect(isAeInstall(dir)).toBe(false)
    writeFileSync(join(dir, 'PACKAGER.exe'), '')
    expect(isAeInstall(dir)).toBe(true)
  })

  it('looks in each Steam library, including the ones libraryfolders.vdf lists', () => {
    const vdf = '"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"Z:\\\\Games\\\\Lib"\n\t}\n}'
    const libs = steamLibraryCandidates('win32', (p) => (p.replace(/\\/g, '/') === 'C:/Program Files (x86)/Steam/steamapps/libraryfolders.vdf' ? vdf : null))
    expect(libs).toContain('C:/Program Files (x86)/Steam')
    expect(libs).toContain('Z:/Games/Lib')
    const found = findAeInstall((p) => p.replace(/\\/g, '/').startsWith(`Z:/Games/Lib/steamapps/common/${AE_DIR_NAME}/`), libs)
    expect(found?.replace(/\\/g, '/')).toBe(`Z:/Games/Lib/steamapps/common/${AE_DIR_NAME}`)
    expect(findAeInstall(() => false, libs)).toBeNull()
  })
})

describe('packer — no extra lives for sale', () => {
  const STOCK = [
    '\t\tm_shopMenu.CloseTooltip();',
    '',
    '%if !MOD_INFINITE_LIVES | !MOD_NO_LIVES',
    '\t\tAddItemToShop("power_life", ".life-uname", ".life-udesc", 350);',
    '%endif',
    '',
    '\t\tAddItemToShop("power_rejuv", ".rejuv-uname", ".rejuv-udesc", 175);'
  ].join('\r\n')

  it('hides the extra life whenever either life modifier is on, and leaves the rest alone', () => {
    const patched = patchedPowerShop(STOCK)!
    expect(patched).toContain('%if !MOD_INFINITE_LIVES\n%if !MOD_NO_LIVES\n\t\tAddItemToShop("power_life"')
    expect(patched).not.toContain('!MOD_INFINITE_LIVES | !MOD_NO_LIVES')
    expect(patched.match(/%endif/g)).toHaveLength(2)
    expect(patched).toContain('AddItemToShop("power_rejuv"')
  })

  it('refuses a script it does not recognise rather than guessing', () => {
    expect(patchedPowerShop('%if SOMETHING_ELSE\nAddItemToShop("power_life")\n%endif')).toBeNull()
  })

  it.skipIf(!HAS_AE)('recognises the install\'s own power shop script', () => {
    const assets = unpackedAssetsDir(AE_ROOT)
    expect(assets).not.toBeNull()
    expect(patchedPowerShop(readFileSync(join(assets!, 'scripts/GUI/Shop/PowerShopMenuContent.as'), 'utf-8'))).not.toBeNull()
  })
})

describe('packer — patched stock files', () => {
  it('always tries the power shop, and says why when it cannot', () => {
    const out = assetOverrideFiles(join(tmpdir(), 'no-such-ae'), [])
    expect(out.files).toEqual([])
    expect(out.notes.join(' ')).toMatch(/extra life/)
  })

  it.skipIf(!HAS_AE)('patches the Players tab\'s values into the install\'s own files', () => {
    const overrides = playerOverrides({
      [statKey('warlock', 'base-health')]: 400,
      [skillKey('warlock_gargoyle', 1, 'cost')]: 0,
      [skillKey('shared_speed_melee', 1, 'movespeed-mul', 'paladin')]: 2
    })
    const { files, notes } = assetOverrideFiles(AE_ROOT, overrides)
    expect(notes).toEqual([])
    const byPath = new Map(files.map((f) => [f.path, f.content]))
    expect(byPath.get('players/classes.sval')).toMatch(/<int name="base-health">400<\/int>/)
    expect(byPath.get('players/classes.sval')).toContain('players/shared/skills/shared_speed_melee_paladin.sval')
    expect(byPath.get('players/warlock/skills/warlock_gargoyle.sval')).toMatch(/<int name="cost">0<\/int>/)
    expect(byPath.get('players/shared/skills/shared_speed_melee_paladin.sval')).toMatch(/<float name="movespeed-mul">2<\/float>/)
    // the shared file itself is untouched, so no stock-path copy ships
    expect(byPath.has('players/shared/skills/shared_speed_melee.sval')).toBe(false)
  })
})

describe('packer — install guards', () => {
  it('refuses an empty or missing folder', async () => {
    const noPath = await installScenario('', 'dungeon_1', [], false)
    expect(noPath.ok).toBe(false)
    expect(noPath.message).toContain('Set your Hammerwatch Anniversary Edition folder')

    const missing = await installScenario('/definitely/not/here', 'dungeon_1', [], false)
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('not found')
  })

  it('reports a missing PACKAGER.exe and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    mkdirSync(join(dir, 'scenarios'))
    const result = await installScenario(dir, 'dungeon_1', [{ path: 'info.xml', content: '<info/>' }], false)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('PACKAGER.exe not found')
    expect(existsSync(join(dir, 'scenarios', 'dungeon_1'))).toBe(false)
  })
})

/**
 * Real packing against the local install. Opt-in (HWAE_PACK=1), because it
 * writes into the game's scenarios folder; it removes what it made.
 */
describe.skipIf(!HAS_AE || process.env.HWAE_PACK !== '1')('packer — real PACKAGER.exe', () => {
  it('packs a generated scenario into a .h1c and leaves no source folder behind', async () => {
    const params = plainParameters()
    params.levels = 1
    params.themes = ['prison']
    params.levelMonsters = [['bat']]
    params.boss = { ...params.boss, enabled: false }
    const result = generateDungeon(params, 99001) as DungeonResult
    expect(result.ok).toBe(true)
    const packed = join(AE_ROOT, 'scenarios', `${result.campaignName}.h1c`)
    try {
      const install = await installScenario(AE_ROOT, result.campaignName, result.files, false)
      expect(install.ok, install.message).toBe(true)
      expect(hasH1cMagic(packed)).toBe(true)
      // the patched power shop travels inside the scenario
      expect(readFileSync(packed).includes(Buffer.from('PowerShopMenuContent'))).toBe(true)
      expect(existsSync(join(AE_ROOT, 'scenarios', result.campaignName))).toBe(false)
    } finally {
      rmSync(packed, { force: true })
      rmSync(join(AE_ROOT, 'scenarios', result.campaignName), { recursive: true, force: true })
    }
  }, 180_000)
})
