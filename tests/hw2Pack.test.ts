import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonResult, GeneratedFile } from '../src/generator'
import { readH1c } from '../src/main/h1c/read'
import { toPackFiles, writeH1c } from '../src/main/h1c/write'
import { customFiles } from '../src/main/custom/hw2/files'
import { AE_ROOT } from './aeInstall'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT } from './hw2Install'
import { plainParameters } from './params'

/** A real scenario's info.xml: the pack writer reads it. */
const INFO: GeneratedFile = (generateDungeon(plainParameters(), 1) as DungeonResult).files.find((f) => f.path === 'info.xml')!

describe('packing files that arrive compiled', () => {
  it('packs a flag-3 file as it is, and plain files as flag 1', () => {
    const compiled: GeneratedFile = { path: 'hw2/t.png', content: Buffer.from([1, 2, 3, 4]).toString('base64'), encoding: 'base64', packFlag: 3 }
    const plain: GeneratedFile = { path: 'hw2/a.unit', content: '<unit/>' }
    const pack = readH1c(writeH1c('t', toPackFiles([INFO, compiled, plain])))
    expect(pack.files.get('hw2/t.png')).toEqual({ flag: 3, data: Uint8Array.from([1, 2, 3, 4]) })
    expect(pack.files.get('hw2/a.unit')?.flag).toBe(1)
  })
})

describe('copying Hammerwatch 2 files for a campaign', () => {
  it('copies nothing for a stock campaign, and refuses HW2 content without HW2', () => {
    expect(customFiles([], '', AE_ROOT, 'install')).toEqual({ files: [], note: '' })
    const none = customFiles(['hw2/tilesets/crypt_default.tileset'], '', AE_ROOT, 'install')
    expect(none.files).toEqual([])
    expect(none.error).toMatch(/load your Hammerwatch 2 folder with Load custom/)
  })

  it.skipIf(!HAS_HW2)('carries a campaign\'s HW2 files into its pack', () => {
    const p = plainParameters()
    p.levels = 2
    p.themes = ['hw2_crypt', 'hw2_sewer']
    p.levelMonsters = p.levelMonsters.slice(0, 2)
    p.lobbies = []
    p.boss = { ...p.boss, enabled: false }
    const gen = generateDungeon(p, 11, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    const custom = customFiles(r.customAssets, HW2_ROOT, AE_ROOT, 'install')
    expect(custom.error).toBeUndefined()
    expect(custom.note).toMatch(/Carries \d+ Hammerwatch 2 file/)
    const pack = readH1c(writeH1c(r.campaignName, toPackFiles([...r.files, ...custom.files])))
    for (const path of r.customAssets) expect(pack.files.has(path), path).toBe(true)
    // with the extract beside the pack, textures come plain, so an export keeps them too
    const png = [...pack.files.keys()].find((k) => k.startsWith('hw2/') && k.endsWith('.png'))!
    expect(pack.files.get(png)!.flag).toBe(1)
    expect(Buffer.from(pack.files.get(png)!.data.subarray(1, 4)).toString()).toBe('PNG')
    expect(customFiles(r.customAssets, HW2_ROOT, AE_ROOT, 'export').files.length).toBe(custom.files.length)
  }, 120_000)

  it.skipIf(!HAS_HW2)("carries a campaign's HW2 music, converted, beside its bank", () => {
    const p = plainParameters()
    p.levels = 2
    p.themes = p.themes.slice(0, 2)
    p.levelMonsters = p.levelMonsters.slice(0, 2)
    p.lobbies = []
    p.boss = { ...p.boss, enabled: false }
    p.floorMusic = ['hw2_crypt', 'hw2_boss']
    const gen = generateDungeon(p, 12, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    expect(r.customAssets).toEqual(['hw2/music/Music_BossTheme_115bpm_ts44.ogg', 'hw2/music/Music_Crypt_120bpm.ogg'])
    const custom = customFiles(r.customAssets, HW2_ROOT, AE_ROOT, 'install')
    expect(custom.error).toBeUndefined()
    expect(custom.note).toMatch(/2 of them music/)
    const pack = readH1c(writeH1c(r.campaignName, toPackFiles([...r.files, ...custom.files])))
    expect(new TextDecoder().decode(pack.files.get('hw2/music/music.sbnk')!.data)).toContain('./Music_Crypt_120bpm.ogg')
    const ogg = pack.files.get('hw2/music/Music_Crypt_120bpm.ogg')!
    expect(new TextDecoder().decode(ogg.data.subarray(0, 4))).toBe('OggS')
    // without HW2 there is no bank to convert from
    expect(customFiles(r.customAssets, '', AE_ROOT, 'install').error).toMatch(/Load custom/)
  }, 120_000)
})
