import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HW2_ASSETS_MAGIC } from '../src/main/h1c/read'
import { folderSource, packSource } from '../src/main/custom/binSource'
import { detectHw2, hw2Sources } from '../src/main/custom/hw2/detect'
import { AE_ROOT } from './aeInstall'
import { HAS_HW2, HW2_ROOT, hw2AssetsDir } from './hw2Install'

describe('detecting a Hammerwatch 2 folder', () => {
  it('turns down a folder that is not HW2', () => {
    expect(detectHw2('').ok).toBe(false)
    expect(detectHw2(join(AE_ROOT, 'no-such-folder')).ok).toBe(false)
    expect(hw2Sources('')).toBeNull()
  })

  it.skipIf(!HAS_HW2)("turns down AE's own folder", () => {
    const s = detectHw2(AE_ROOT)
    expect(s.ok).toBe(false)
    expect(s.message).toMatch(/No HW2\.exe/)
  })

  it.skipIf(!HAS_HW2)('loads the HW2 install, pack first', () => {
    const s = detectHw2(HW2_ROOT)
    expect(s.ok, s.message).toBe(true)
    expect(s.assets).toBe('res/assets.bin')
    expect(s.unpacked).toMatch(/^unpacked_assets_\d+$/)
    expect(s.music).toBe(true)
    const src = hw2Sources(HW2_ROOT)!
    expect(src.primary.kind).toBe('assets.bin')
    expect(src.unpacked?.kind).toBe('unpacked')
  })
})

describe.skipIf(!HAS_HW2)("reading Hammerwatch 2's assets.bin", () => {
  const pack = packSource(join(HW2_ROOT, 'res', 'assets.bin'), HW2_ASSETS_MAGIC)!

  it('reads the HW2R table', () => {
    expect(pack).not.toBeNull()
    expect(pack.list().length).toBeGreaterThan(10_000)
    expect(packSource(join(HW2_ROOT, 'res', 'assets.bin'), 'HW1R')).toBeNull()
  })

  it('gives text files plain, matching the extract', () => {
    const unit = pack.read('doodads/walls/crypt/h_32.unit')!
    expect(unit.flag).toBe(1)
    const extract = folderSource(hw2AssetsDir()!).read('doodads/walls/crypt/h_32.unit')!
    expect(Buffer.from(unit.data).equals(Buffer.from(extract.data))).toBe(true)
  })

  it('holds textures compiled', () => {
    const png = pack.list().find((p) => p.startsWith('doodads/walls/crypt/') && p.endsWith('.png'))
    expect(png).toBeDefined()
    expect(pack.read(png!)!.flag).toBe(3)
    // the sound banks sit beside the pack: listed, but with no data here
    expect(pack.has('sound/music.bank')).toBe(false)
  })
})
