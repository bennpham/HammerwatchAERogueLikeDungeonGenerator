import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import {
  AE_DIR_NAME,
  POWER_SHOP_SCRIPT,
  assetOverrideFiles,
  findAeInstall,
  hasH1cMagic,
  installScenario,
  isAeInstall,
  patchedPowerShop,
  steamLibraryCandidates,
  writeCampaign
} from '../src/main/packer'
import { stockSource, unpackedAssetsDir } from '../src/main/stockAssets'
import { readH1c, levelText } from '../src/main/h1c/read'
import { lz4Compress, writeH1c } from '../src/main/h1c/write'
import type { PackFile } from '../src/main/h1c/write'
import { BIOME_IDS, defaultLobby, defaultWorld, generateDungeon } from '../src/generator'
import { renderInfoXml } from '../src/generator/ae/scenario'
import { parseSval } from '../src/generator/ae/sval'
import { applyEverythingFree, applyGroupFactor, playerOverrides, shopKey, skillKey, statKey } from '../src/generator/players'
import type { DungeonResult, GeneratedFile } from '../src/generator'
import { plainParameters } from './params'
import { svalDiff } from './svalDiff'
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
  it('needs HW1A.exe, and not PACKAGER.exe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    expect(isAeInstall(dir)).toBe(false)
    writeFileSync(join(dir, 'HW1A.exe'), '')
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

const STOCK_SHOP = [
  '\t\tm_shopMenu.CloseTooltip();',
  '',
  '%if !MOD_INFINITE_LIVES | !MOD_NO_LIVES',
  '\t\tAddItemToShop("power_life", ".life-uname", ".life-udesc", 350);',
  '%endif',
  '',
  '\t\tAddItemToShop("power_rejuv", ".rejuv-uname", ".rejuv-udesc", 175);'
].join('\r\n')

describe('packer — no extra lives for sale', () => {
  it('hides the extra life whenever either life modifier is on, and leaves the rest alone', () => {
    const patched = patchedPowerShop(STOCK_SHOP)!
    expect(patched).toContain('%if !MOD_INFINITE_LIVES\n%if !MOD_NO_LIVES\n\t\tAddItemToShop("power_life"')
    expect(patched).not.toContain('!MOD_INFINITE_LIVES | !MOD_NO_LIVES')
    expect(patched.match(/%endif/g)).toHaveLength(2)
    expect(patched).toContain('AddItemToShop("power_rejuv"')
  })

  it('refuses a script it does not recognise rather than guessing', () => {
    expect(patchedPowerShop('%if SOMETHING_ELSE\nAddItemToShop("power_life")\n%endif')).toBeNull()
  })

  it.skipIf(!HAS_AE)("recognises the install's own power shop script", () => {
    const stock = stockSource(AE_ROOT)!.read(POWER_SHOP_SCRIPT)
    expect(stock).not.toBeNull()
    expect(patchedPowerShop(stock!)).not.toBeNull()
  })
})

/** A minimal `res/assets.bin` (HW1R) holding `files`, LZ4-packed as the game's is. */
function fakeAssetsBin(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [Buffer.from('HW1R'), Buffer.from([3])]
  const u32 = (v: number): Buffer => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(v)
    return b
  }
  parts.push(u32(0), u32(0), u32(Object.keys(files).length + 1))
  for (const [path, text] of Object.entries(files)) {
    const raw = Buffer.from(text)
    const packed = Buffer.from(lz4Compress(raw))
    parts.push(u32(path.length), Buffer.from(path), Buffer.from([1]), u32(raw.length), u32(packed.length), packed)
  }
  // a sound bank entry: flag 0xff, size 0xffffffff, no data
  parts.push(u32(14), Buffer.from('sound/sfx.bank'), Buffer.from([0xff]), u32(0xffffffff))
  return Buffer.concat(parts)
}

describe('packer — patched stock files', () => {
  it('always tries the power shop, and says why when it cannot', () => {
    const out = assetOverrideFiles(join(tmpdir(), 'no-such-ae'), [])
    expect(out.files).toEqual([])
    expect(out.notes.join(' ')).toMatch(/extra life.*res\/assets\.bin/)
  })

  it("reads the game's own res/assets.bin when there is no unpacked_assets_* folder", () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    try {
      mkdirSync(join(dir, 'res'))
      writeFileSync(join(dir, 'res', 'assets.bin'), fakeAssetsBin({ [POWER_SHOP_SCRIPT]: STOCK_SHOP, 'players/classes.sval': '<dict>\n</dict>\n' }))
      expect(unpackedAssetsDir(dir)).toBeNull()
      const out = assetOverrideFiles(dir, [])
      expect(out.notes).toEqual([])
      expect(out.files.find((f) => f.path === POWER_SHOP_SCRIPT)?.content).toContain('%if !MOD_NO_LIVES')
      expect(stockSource(dir)!.read('players/classes.sval')).toBe('<dict>\n</dict>\n')
      expect(stockSource(dir)!.read('sound/sfx.bank')).toBeNull()
      expect(stockSource(dir)!.read('no/such/file')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to an unpacked_assets_* folder when assets.bin is unreadable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    try {
      mkdirSync(join(dir, 'res'))
      writeFileSync(join(dir, 'res', 'assets.bin'), 'not a pack')
      mkdirSync(join(dir, 'unpacked_assets_7', 'scripts', 'GUI', 'Shop'), { recursive: true })
      writeFileSync(join(dir, 'unpacked_assets_7', POWER_SHOP_SCRIPT), STOCK_SHOP)
      expect(assetOverrideFiles(dir, []).notes).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!HAS_AE)('reads the same bytes from assets.bin as from unpacked_assets_*', () => {
    const assets = unpackedAssetsDir(AE_ROOT)
    if (assets === null) return
    const fromBin = stockSource(AE_ROOT)!
    expect(fromBin.label).toMatch(/assets\.bin$/)
    for (const path of [POWER_SHOP_SCRIPT, 'scripts/Data/Misc.as', 'players/classes.sval', 'players/warlock/skills/warlock_gargoyle.sval']) {
      expect(fromBin.read(path), path).toBe(readFileSync(join(assets, path), 'utf-8'))
    }
  })

  it.skipIf(!HAS_AE)("patches the Players tab's values into the install's own files", () => {
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

  it.skipIf(!HAS_AE)('prices the potions in the same power shop copy that drops the extra life', () => {
    const overrides = playerOverrides({ [shopKey('potion_damage')]: 0, [shopKey('equipment_common')]: 0 })
    const { files, notes } = assetOverrideFiles(AE_ROOT, overrides)
    expect(notes).toEqual([])
    const shops = files.filter((f) => f.path === POWER_SHOP_SCRIPT)
    expect(shops).toHaveLength(1)
    expect(shops[0].content).toContain('AddItemToShop("potion_damage", ".pot-dmg-uname", ".pot-dmg-udesc", 0);')
    expect(shops[0].content).toContain('%if !MOD_NO_LIVES')
    expect(files.find((f) => f.path === 'scripts/Data/Misc.as')?.content).toContain('EquipmentCommonBaseCost = 0;')
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
})

/** A scenario the writer packs: info.xml, a logo and one level. */
const SCENARIO: GeneratedFile[] = [
  { path: 'info.xml', content: renderInfoXml({ name: 'Dungeon #1', description: 'd', startLevel: 'levels/dungeon_1/01.lvl' }) },
  { path: 'logos.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), encoding: 'base64' },
  { path: 'levels/dungeon_1/01.lvl', content: '<dict>\n\t<int name="version">5</int>\n</dict>\n' }
]

describe('packer — installing (no PACKAGER.exe, no Steam)', () => {
  /** A temp AE folder: the game exe, scenarios/, and no PACKAGER.exe at all. */
  function fakeAe(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hwae-'))
    mkdirSync(join(dir, 'scenarios'))
    writeFileSync(join(dir, 'HW1A.exe'), '')
    return dir
  }

  it('packs the scenario into a .h1c, clears what an earlier install left, and writes the description beside it', async () => {
    const dir = fakeAe()
    try {
      mkdirSync(join(dir, 'scenarios', 'dungeon_1'))
      writeFileSync(join(dir, 'scenarios', 'dungeon_1_description.txt'), 'an older run')
      const result = await installScenario(dir, 'dungeon_1', SCENARIO, false, [], 'this run')
      expect(result.ok, result.message).toBe(true)
      const packed = join(dir, 'scenarios', 'dungeon_1.h1c')
      expect(result.outputPath).toBe(packed)
      expect(result.message).toContain('Installed dungeon_1.h1c and dungeon_1_description.txt')
      expect(hasH1cMagic(packed)).toBe(true)
      expect(existsSync(join(dir, 'scenarios', 'dungeon_1'))).toBe(false)
      expect(existsSync(`${packed}.tmp`)).toBe(false)
      expect(readFileSync(join(dir, 'scenarios', 'dungeon_1_description.txt'), 'utf-8')).toBe('this run')
      const pack = readH1c(readFileSync(packed))
      expect([...pack.files.keys()]).toEqual(['levels/dungeon_1/01.lvl', 'info.xml'])
      expect(levelText(pack.files.get('levels/dungeon_1/01.lvl')!)).toContain('<int name="version">5</int>')
      expect([...pack.logo]).toEqual([0x89, 0x50, 0x4e, 0x47])
      // no assets.bin in this fake install, so the power shop can't be patched, and says so
      expect(result.message).toMatch(/Note: the power shop still offers an extra life/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('packs the patched stock files with the scenario', async () => {
    const dir = fakeAe()
    try {
      mkdirSync(join(dir, 'res'))
      writeFileSync(join(dir, 'res', 'assets.bin'), fakeAssetsBin({ [POWER_SHOP_SCRIPT]: STOCK_SHOP }))
      const result = await installScenario(dir, 'dungeon_1', SCENARIO, false)
      expect(result.ok, result.message).toBe(true)
      expect(result.message).not.toMatch(/Note:/)
      const pack = readH1c(readFileSync(join(dir, 'scenarios', 'dungeon_1.h1c')))
      expect(new TextDecoder().decode(pack.files.get(POWER_SHOP_SCRIPT)!.data)).toContain('%if !MOD_NO_LIVES')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps an editable copy in editor/generated/, never in scenarios/', async () => {
    const dir = fakeAe()
    try {
      const result = await installScenario(dir, 'dungeon_1', SCENARIO, true)
      expect(result.ok).toBe(true)
      expect(readFileSync(join(dir, 'editor', 'generated', 'dungeon_1', 'levels', 'dungeon_1', '01.lvl'), 'utf-8')).toContain('version')
      expect(existsSync(join(dir, 'editor', 'generated', 'dungeon_1', 'logos.png'))).toBe(true)
      expect(existsSync(join(dir, 'scenarios', 'dungeon_1'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('installs unpacked, saying why, when the writer refuses the scenario', async () => {
    const dir = fakeAe()
    try {
      writeFileSync(join(dir, 'scenarios', 'dungeon_1.h1c'), 'stale')
      const refuse = (): Uint8Array => {
        throw new Error('no binary form known for <ivec2>')
      }
      const result = await installScenario(dir, 'dungeon_1', SCENARIO, true, [], 'this run', refuse)
      expect(result.ok).toBe(true)
      expect(result.message).toContain('unpacked')
      expect(result.message).toContain('no binary form known for <ivec2>')
      expect(result.outputPath).toBe(join(dir, 'scenarios', 'dungeon_1'))
      expect(readFileSync(join(dir, 'scenarios', 'dungeon_1', 'info.xml'), 'utf-8')).toContain('<info>')
      expect(existsSync(join(dir, 'scenarios', 'dungeon_1.h1c'))).toBe(false)
      expect(readFileSync(join(dir, 'scenarios', 'dungeon_1_description.txt'), 'utf-8')).toBe('this run')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * Installs into the real game folder. Opt-in (HWAE_PACK=1), because it
 * writes into the game's scenarios folder; it removes what it made.
 */
describe.skipIf(!HAS_AE || process.env.HWAE_PACK !== '1')('packer — real install', () => {
  it('packs a generated scenario into a .h1c and leaves no source folder behind', async () => {
    const params = plainParameters()
    params.levels = 1
    params.themes = ['prison']
    params.levelMonsters = [['bat']]
    params.boss = { ...params.boss, enabled: false }
    // with player settings, including a class's own move speed
    params.playerTweaks = {
      ...applyGroupFactor('damage', 3, applyEverythingFree({})),
      [skillKey('shared_speed', 1, 'movespeed-mul', 'priest')]: 2
    }
    const result = generateDungeon(params, 99001) as DungeonResult
    expect(result.ok).toBe(true)
    const packed = join(AE_ROOT, 'scenarios', `${result.campaignName}.h1c`)
    const described = join(AE_ROOT, 'scenarios', `${result.campaignName}_description.txt`)
    try {
      const install = await installScenario(AE_ROOT, result.campaignName, result.files, false, result.assetOverrides, 'described')
      expect(install.ok, install.message).toBe(true)
      expect(hasH1cMagic(packed)).toBe(true)
      // the description lies beside the .h1c, not in it
      expect(readFileSync(described, 'utf-8')).toBe('described')
      expect(readFileSync(packed).includes(Buffer.from('_description.txt'))).toBe(false)
      const pack = readH1c(readFileSync(packed))
      // the patched power shop travels inside the scenario
      expect(pack.files.has(POWER_SHOP_SCRIPT)).toBe(true)
      // ...and so do the patched player files and the priest's own speed skill
      expect(install.message).not.toMatch(/Note:/)
      // ...and the brightness setting's copy of the floor's lighting environment
      const env = result.assetOverrides.find((o) => o.path.endsWith('.env'))!.path.split('/').pop()!
      const names = [...pack.files.keys()].map((p) => p.split('/').pop())
      for (const name of ['classes.sval', 'warlock_dagger.sval', 'shared_speed_priest.sval', env]) expect(names, name).toContain(name)
      expect(existsSync(join(AE_ROOT, 'scenarios', result.campaignName))).toBe(false)
    } finally {
      rmSync(packed, { force: true })
      rmSync(described, { force: true })
      rmSync(join(AE_ROOT, 'scenarios', result.campaignName), { recursive: true, force: true })
    }
  }, 180_000)

  it('packs a world of every biome, and the stock rooms as lobbies', async () => {
    const params = plainParameters()
    params.levels = 3
    params.themes = ['prison', 'prison', 'prison']
    params.levelMonsters = [['bat'], ['bat'], ['bat']]
    params.boss = { ...params.boss, enabled: false }
    params.world = { enabled: true, worlds: BIOME_IDS.map((biome) => ({ ...defaultWorld(), biome })) }
    params.lobbies = [defaultLobby('sun_bazaar'), defaultLobby('shaftlocke_town'), defaultLobby('castle_bridge')]
    const result = generateDungeon(params, 99003) as DungeonResult
    expect(result.ok).toBe(true)
    const packed = join(AE_ROOT, 'scenarios', `${result.campaignName}.h1c`)
    try {
      const install = await installScenario(AE_ROOT, result.campaignName, result.files, false, result.assetOverrides)
      expect(install.ok, install.message).toBe(true)
      expect(hasH1cMagic(packed)).toBe(true)
      expect(existsSync(join(AE_ROOT, 'scenarios', result.campaignName))).toBe(false)
    } finally {
      rmSync(packed, { force: true })
      rmSync(join(AE_ROOT, 'scenarios', result.campaignName), { recursive: true, force: true })
    }
  }, 180_000)
})

/** Every file under `dir`, scenario-relative with forward slashes. */
function folderFiles(dir: string): PackFile[] {
  const out: PackFile[] = []
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push({ path: relative(dir, p).replace(/\\/g, '/'), data: readFileSync(p) })
    }
  }
  walk(dir)
  return out
}

/**
 * The writer against the game's own PACKAGER.exe on a fresh scenario. Opt-in
 * (HWAE_PACK=1) and Windows only; PACKAGER also needs a Steam client it can
 * reach, so it stops on a "Steam must be running" dialog when started from a
 * sandboxed shell. It removes what it made.
 */
describe.skipIf(!HAS_AE || process.env.HWAE_PACK !== '1' || process.platform !== 'win32')('packer — the writer against PACKAGER.exe', () => {
  it('packs what PACKAGER packs: files, order, flags, text, level trees and info', async () => {
    const params = plainParameters()
    params.levels = 2
    params.themes = ['prison', 'prison']
    params.levelMonsters = [['bat'], ['bat']]
    const result = generateDungeon(params, 99004) as DungeonResult
    expect(result.ok).toBe(true)
    const id = result.campaignName
    const src = join(AE_ROOT, 'scenarios', id)
    const packed = join(AE_ROOT, 'scenarios', `${id}.h1c`)
    try {
      await writeCampaign(src, [...result.files, ...assetOverrideFiles(AE_ROOT, result.assetOverrides).files])
      try {
        execFileSync(join(AE_ROOT, 'PACKAGER.exe'), ['-l', id], { cwd: AE_ROOT, stdio: 'pipe', timeout: 170_000 })
      } catch {
        // exits 127 even on success; the .h1c is the test
      }
      expect(existsSync(packed), 'PACKAGER made no .h1c (can it reach Steam?)').toBe(true)
      const theirs = readH1c(readFileSync(packed))
      const mine = readH1c(writeH1c(id, folderFiles(src)))
      expect([...mine.files.keys()]).toEqual([...theirs.files.keys()])
      expect(Buffer.compare(Buffer.from(mine.logo), Buffer.from(theirs.logo))).toBe(0)
      for (const [path, f] of theirs.files) {
        const m = mine.files.get(path)!
        expect(m.flag, path).toBe(f.flag)
        if (path.endsWith('.lvl')) expect(svalDiff(parseSval(levelText(m)), parseSval(levelText(f))), path).toBeNull()
        else expect(Buffer.compare(Buffer.from(m.data), Buffer.from(f.data)), path).toBe(0)
      }
      const strip = (s: string) => parseSval(s.replace(/<int name="ID">-?\d+<\/int>/, '<int name="ID">0</int>'))
      expect(svalDiff(strip(mine.info), strip(theirs.info))).toBeNull()
    } finally {
      rmSync(packed, { force: true })
      rmSync(src, { recursive: true, force: true })
    }
  }, 180_000)
})
