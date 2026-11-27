import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { extractRefs, resolveRelative } from '../src/main/custom/refs'
import { planCopy } from '../src/main/custom/copyPlan'
import { encodeSval } from '../src/main/h1c/write'
import { bakeTintSheet, parseColorize, readLayeredTif, readTintSheet } from '../src/main/custom/layeredTif'
import { packSource } from '../src/main/custom/binSource'
import { HW2_ASSETS_MAGIC } from '../src/main/h1c/read'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CopyInput, CopySource } from '../src/main/custom/copyPlan'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { BIOME_IDS, defaultWorld, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { THEME_DEFS } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { AE_ROOT } from './aeInstall'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT, danglingPaths, hw2AssetsDir } from './hw2Install'
import { plainParameters } from './params'

const enc = new TextEncoder()
const dec = new TextDecoder()

/** An in-memory source: text files as strings, binaries as byte arrays. */
function mem(files: Record<string, string | number[]>, flag = 1): CopySource {
  return {
    has: (p) => p in files,
    read: (p) => {
      const f = files[p]
      if (f === undefined) return null
      return { flag, data: typeof f === 'string' ? enc.encode(f) : Uint8Array.from(f) }
    }
  }
}

function plan(source: Record<string, string | number[]>, roots: string[], extra: Partial<CopyInput> = {}) {
  return planCopy({
    roots,
    prefix: 'hw2/',
    source: mem(source),
    ae: mem({ 'system/default.mats': 'x', 'gui/minimap.png': [1, 2, 3], 'actors/ae_only.unit': '<unit/>' }),
    aeClasses: new Set(['StateActorBehavior', 'CompositeActorSkill']),
    aeEvents: new Set(['event:/sfx/known']),
    ...extra
  })
}

/** An uncompressed little-endian TIFF the way HW2's TinyTIFFWriter lays one out: one strip, interleaved. */
function layeredTiff(width: number, height: number, channels: number, pixels: number[]): Uint8Array {
  const entries: Array<[tag: number, type: number, value: number]> = [
    [256, 3, width],
    [257, 3, height],
    [258, 3, 8],
    [259, 3, 1],
    [262, 3, 2],
    [273, 4, 0],
    [277, 3, channels],
    [284, 3, 1]
  ]
  const ifdSize = 2 + entries.length * 12 + 4
  const data = 8 + ifdSize
  const out = new Uint8Array(data + pixels.length)
  const v = new DataView(out.buffer)
  out.set([0x49, 0x49, 42, 0])
  v.setUint32(4, 8, true)
  v.setUint16(8, entries.length, true)
  entries.forEach(([tag, type, value], i) => {
    const e = 10 + i * 12
    v.setUint16(e, tag, true)
    v.setUint16(e + 2, type, true)
    v.setUint32(e + 4, 1, true)
    if (type === 3) v.setUint16(e + 8, value, true)
    else v.setUint32(e + 8, tag === 273 ? data : value, true)
  })
  out.set(pixels, data)
  return out
}

/** The RGBA bytes of an unfiltered PNG (encodePng's own output). */
function pngPixels(png: Uint8Array): Uint8Array {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = v.getUint32(16)
  const idat: Uint8Array[] = []
  for (let at = 8; at < png.length; ) {
    const len = v.getUint32(at)
    if (dec.decode(png.subarray(at + 4, at + 8)) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len))
    at += 12 + len
  }
  const rows = inflateSync(Buffer.concat(idat))
  const out: number[] = []
  for (let at = 0; at < rows.length; at += width * 4 + 1) out.push(...rows.subarray(at + 1, at + 1 + width * 4))
  return Uint8Array.from(out)
}

const textOf = (p: ReturnType<typeof plan>, path: string) => dec.decode(p.files.find((f) => f.path === path)!.data)

describe('finding the paths a file names', () => {
  it('reads attributes, element text, includes and replaces, without their tails', () => {
    const t = [
      '%include "doodads/walls/h_32.inc"',
      '%include doodads/bare.inc',
      '%replace SFX_HIT actors/fx/hit.effect',
      '<sprite texture="./base.png" material="system/default.mats:floor"/>',
      '<scene src="./glass.unit:beer"/> <scene src="bread"/>',
      '<x icon="system/icons.png;352;96;32;32"/>',
      '<string name="tileset">tilesets/crypt_tile_white_a 32.tileset</string>',
      '<string name="sound">event:/sfx/a/b</string>'
    ].join('\n')
    const refs = extractRefs(t)
    expect(refs.map((r) => r.path)).toEqual([
      'doodads/walls/h_32.inc',
      'doodads/bare.inc',
      'actors/fx/hit.effect',
      './base.png',
      'system/default.mats',
      './glass.unit',
      'system/icons.png',
      'tilesets/crypt_tile_white_a 32.tileset'
    ])
    for (const r of refs) expect(t.slice(r.start, r.end)).toBe(r.path)
    expect(refs.filter((r) => r.relative).map((r) => r.path)).toEqual(['./base.png', './glass.unit'])
    expect(refs.filter((r) => r.entry !== undefined).map((r) => r.entry)).toEqual(['floor', 'beer'])
  })

  it('reads an include whose quote never closes, as the engine does', () => {
    // HW2's boss_dace_arden.inc, line 100
    const t = '\t%include "actors/bosses/dace_arden/_boss_dace_arden_states.inc\n%include "a/b.inc"'
    const refs = extractRefs(t)
    expect(refs.map((r) => r.path)).toEqual(['actors/bosses/dace_arden/_boss_dace_arden_states.inc', 'a/b.inc'])
    for (const r of refs) expect(t.slice(r.start, r.end)).toBe(r.path)
  })

  it('reads a path with effect arguments, and what follows a `?` is never an entry', () => {
    const t = '<effect src="effects/smoke/smoke_4.effect?scale=0.3"/>'
    const [r] = extractRefs(t)
    expect(r.path).toBe('effects/smoke/smoke_4.effect')
    expect(t.slice(r.start, r.end)).toBe(r.path)
    expect(r.entry).toBeUndefined()
  })

  it('resolves relative paths inside the assets only', () => {
    expect(resolveRelative('doodads/walls/crypt', './base.png')).toBe('doodads/walls/crypt/base.png')
    expect(resolveRelative('doodads/walls/crypt', '.././__guide.png')).toBe('doodads/walls/__guide.png')
    expect(resolveRelative('a', '../../x.png')).toBeNull()
  })
})

describe('planning a copy', () => {
  const walls = {
    'doodads/walls/crypt/h_32.unit': '%define SKOSKO\n%include "doodads/walls/h_32.inc"',
    'doodads/walls/h_32.inc':
      '<unit>%include "doodads/walls/header.inc"\n<sprite texture="./base.png" material="system/default.mats:wall"/>\n' +
      '%if EDITOR\n<sprite texture=".././__guide.png"/>\n%endif\n<minimap texture="gui/minimap.png"/></unit>',
    'doodads/walls/header.inc': '<scenes>',
    'doodads/walls/crypt/base.png': [9, 9],
    'gui/minimap.png': [1, 2, 3]
  }

  it("ships a unit's closure under the prefix, its includes rewritten, relatives left alone", () => {
    const p = plan(walls, ['hw2/doodads/walls/crypt/h_32.unit'])
    expect(p.errors).toEqual([])
    expect(p.files.map((f) => f.path)).toEqual([
      'hw2/doodads/walls/crypt/base.png',
      'hw2/doodads/walls/crypt/h_32.unit',
      'hw2/doodads/walls/h_32.inc',
      'hw2/doodads/walls/header.inc'
    ])
    expect(textOf(p, 'hw2/doodads/walls/crypt/h_32.unit')).toBe('%define SKOSKO\n%include "hw2/doodads/walls/h_32.inc"')
    const inc = textOf(p, 'hw2/doodads/walls/h_32.inc')
    expect(inc).toContain('%include "hw2/doodads/walls/header.inc"')
    expect(inc).toContain('texture="./base.png"')
    // the engine's materials stay AE's; a texture AE has byte for byte isn't carried twice
    expect(inc).toContain('material="system/default.mats:wall"')
    expect(inc).toContain('texture="gui/minimap.png"')
    expect(p.keptAe).toEqual(['gui/minimap.png', 'system/default.mats'])
    // the editor-only guide is missing from the source: noted, not an error
    expect(p.notes).toEqual(['not in the source: doodads/walls/__guide.png'])
  })

  it("resolves a shared include's relative paths per unit", () => {
    const p = plan(
      {
        ...walls,
        'doodads/walls/sewer/h_32.unit': '%include "doodads/walls/h_32.inc"',
        'doodads/walls/sewer/base.png': [7]
      },
      ['hw2/doodads/walls/crypt/h_32.unit', 'hw2/doodads/walls/sewer/h_32.unit']
    )
    expect(p.files.map((f) => f.path)).toContain('hw2/doodads/walls/sewer/base.png')
    expect(p.files.map((f) => f.path)).toContain('hw2/doodads/walls/crypt/base.png')
  })

  it("strips the other game's tables and unknown sounds from units, and refuses missing classes", () => {
    const p = plan(
      {
        'actors/troll.unit':
          '%replace SFX_HURT event:/sfx/troll_hurt\n%replace SFX_OK event:/sfx/known\n<behavior class="StateActorBehavior">\n' +
          '\t<string name="team">trolls</string>\n\t<string name="loot">troll</string>\n\t<string name="gore">boar</string>\n' +
          '\t<int name="hp">10</int>\n<dict><string name="class">DashStrike</string></dict>\n<string name="p">actors/ae_only.unit</string>'
      },
      ['hw2/actors/troll.unit']
    )
    const t = textOf(p, 'hw2/actors/troll.unit')
    expect(t).not.toMatch(/team|loot|gore/)
    expect(t).toContain('%replace SFX_HURT \n')
    expect(t).toContain('%replace SFX_OK event:/sfx/known')
    // a file only AE has stays AE's
    expect(t).toContain('<string name="p">actors/ae_only.unit</string>')
    expect(p.errors).toEqual(["hw2/actors/troll.unit: needs the script class DashStrike, which AE doesn't have"])
  })

  it('follows effect paths with arguments, keeping the arguments', () => {
    // HW2's particles_smoke.unit names `smoke_4.effect?scale=0.3`; AE uses the same form
    const p = plan(
      { 'fx/smoke.unit': '<effect src="fx/smoke_4.effect?scale=0.3"/>', 'fx/smoke_4.effect': '<effect/>' },
      ['hw2/fx/smoke.unit']
    )
    expect(p.files.map((f) => f.path)).toEqual(['hw2/fx/smoke.unit', 'hw2/fx/smoke_4.effect'])
    expect(textOf(p, 'hw2/fx/smoke.unit')).toBe('<effect src="hw2/fx/smoke_4.effect?scale=0.3"/>')
  })

  it("ships the materials AE's pinned .mats lacks, and points only those references at them", () => {
    const mats = (names: string[]) =>
      `%// base\n<materials>\n${names.map((n) => `\t<material name="${n}">\n\t\t<color value="1 2 3 4" />\n\t</material>`).join('\n')}\n</materials>\n`
    const p = plan(
      {
        'fx/smoke.unit':
          '<sprite material="system/default.mats:default"/>\n<sprite material="system/default.mats:particle-storm"/>\n' +
          '<sprite material="system/default.mats:ghost"/>',
        'system/default.mats': mats(['default', 'particle-storm', 'unused'])
      },
      ['hw2/fx/smoke.unit'],
      { ae: mem({ 'system/default.mats': mats(['default']) }) }
    )
    expect(p.errors).toEqual([])
    expect(p.files.map((f) => f.path)).toEqual(['hw2/fx/smoke.unit', 'hw2/system/default.mats'])
    expect(textOf(p, 'hw2/fx/smoke.unit')).toBe(
      '<sprite material="system/default.mats:default"/>\n<sprite material="hw2/system/default.mats:particle-storm"/>\n' +
        '<sprite material="system/default.mats:ghost"/>'
    )
    const shipped = textOf(p, 'hw2/system/default.mats')
    expect(shipped).toBe('<materials>\n\t<material name="particle-storm">\n\t\t<color value="1 2 3 4" />\n\t</material>\n</materials>\n')
    expect(p.notes).toContain('fx/smoke.unit: no material system/default.mats:ghost')
  })

  it('draws a .tif sheet from the .png beside it, and ships one it cannot read as is', () => {
    // HW2's troll_brute.tif sits beside HW2's own troll_brute.png; AE can't draw the .tif
    const p = plan(
      {
        'a/troll.unit': '<sprite texture="./troll/sheet.tif"/>\n<sprite texture="a/walk.tif"/>\n<sprite texture="a/lone.tif"/>',
        'a/troll/sheet.tif': [1],
        'a/troll/sheet.png': [2],
        'a/walk.tif': [3],
        'a/walk.png': [4],
        'a/lone.tif': [5]
      },
      ['hw2/a/troll.unit'],
      { plain: mem({ 'a/lone.tif': [9, 9, 9], 'a/troll/sheet.png': [6] }) }
    )
    expect(p.files.map((f) => f.path)).toEqual(['hw2/a/lone.tif', 'hw2/a/troll.unit', 'hw2/a/troll/sheet.png', 'hw2/a/walk.png'])
    expect(textOf(p, 'hw2/a/troll.unit')).toBe(
      '<sprite texture="./troll/sheet.png"/>\n<sprite texture="hw2/a/walk.png"/>\n<sprite texture="hw2/a/lone.tif"/>'
    )
    // a .png still comes plain from the extract; a .tif never does
    expect([...p.files.find((f) => f.path === 'hw2/a/troll/sheet.png')!.data]).toEqual([6])
    expect([...p.files.find((f) => f.path === 'hw2/a/lone.tif')!.data]).toEqual([5])
    expect(p.notes).toContain('hw2/a/lone.tif: not a sheet the copy can read, shipped as is; AE may not draw it')
  })

  const wolfUnit =
    '<array name="colorize">\n\t<i>0</i><a><s>#000000ff</s><s>#808080ff</s><s>#ff0000ff</s></a>\n</array>\n' +
    '<sprite texture="./wolf/wolf.tif"/>\n<sprite texture="a/wolf/wolf.tif"/>'

  it('bakes a .png from a packed sheet with no .png beside it, tinted by the unit that uses it', () => {
    // HW2's assets.bin form: width, height, slot count; then 4 bytes a pixel. Pixel 0 is a
    // tinted white of slot 0, pixel 1 a plain green at half alpha (64 = 128 / 2).
    const packed = [2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 64]
    const p = plan({ 'a/wolf.unit': wolfUnit }, ['hw2/a/wolf.unit'], {
      source: {
        has: (q) => q === 'a/wolf.unit' || q === 'a/wolf/wolf.tif',
        read: (q) =>
          q === 'a/wolf.unit' ? { flag: 1, data: enc.encode(wolfUnit) } : q === 'a/wolf/wolf.tif' ? { flag: 3, data: Uint8Array.from(packed) } : null
      },
      // an extract's copy is never read for a sheet, so the bytes don't depend on having one
      plain: mem({ 'a/wolf/wolf.tif': [...layeredTiff(2, 1, 5, [0, 0, 0, 255, 255, 0, 0, 0, 255, 0])] })
    })
    expect(p.files.map((f) => f.path)).toEqual(['hw2/a/wolf.unit', 'hw2/a/wolf/wolf.png'])
    expect(textOf(p, 'hw2/a/wolf.unit')).toContain('<sprite texture="./wolf/wolf.png"/>\n<sprite texture="hw2/a/wolf/wolf.png"/>')
    expect([...pngPixels(p.files.find((f) => f.path === 'hw2/a/wolf/wolf.png')!.data)]).toEqual([255, 0, 0, 255, 0, 255, 0, 128])
  })

  it('bakes a .png from an unpacked sheet when the source is an extract', () => {
    // 2×1 pixels, 5 channels: RGBA + one colorize mask. Pixel 0 is masked white, pixel 1 unmasked.
    const sheet = layeredTiff(2, 1, 5, [255, 255, 255, 255, 255, 10, 20, 30, 255, 0])
    const unit = wolfUnit
    const p = plan({ 'a/wolf.unit': unit, 'a/wolf/wolf.tif': [...sheet] }, ['hw2/a/wolf.unit'])
    expect(p.files.map((f) => f.path)).toEqual(['hw2/a/wolf.unit', 'hw2/a/wolf/wolf.png'])
    expect(textOf(p, 'hw2/a/wolf.unit')).toContain('<sprite texture="./wolf/wolf.png"/>\n<sprite texture="hw2/a/wolf/wolf.png"/>')
    const png = p.files.find((f) => f.path === 'hw2/a/wolf/wolf.png')!.data
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    // white under the mask takes the slot's light colour; the unmasked pixel keeps its own
    expect([...pngPixels(png)]).toEqual([255, 0, 0, 255, 10, 20, 30, 255])
  })

  it("gives movement one speed, as AE's MeleeMovement reads", () => {
    const p = plan(
      {
        'a/troll.unit':
          '%replace MOVE_SPEED "1.7 2.0"\n%replace MOVE_WEB_SPEED "2.1 2.3"\n%replace MOVE_SPEED_PATROL 1.2\n' +
          '<vec2 name="speed">%%SPEED%%</vec2>\n<vec2 name="speed">0.85 1.15</vec2>\n<vec2 name="jitter">1 2</vec2>'
      },
      ['hw2/a/troll.unit']
    )
    expect(textOf(p, 'hw2/a/troll.unit')).toBe(
      '%replace MOVE_SPEED 1.85\n%replace MOVE_WEB_SPEED 2.2\n%replace MOVE_SPEED_PATROL 1.2\n' +
        '<float name="speed">%%SPEED%%</float>\n<float name="speed">1</float>\n<vec2 name="jitter">1 2</vec2>'
    )
  })

  it("keeps a font AE has at AE's path, and follows one it lacks to its .ttf", () => {
    // HW2's gui/fonts/arial11.fnt draws from a 23 MB arialuni.ttf; AE has its own arial11.fnt
    const p = plan(
      {
        'fx/text.unit': '<text font="gui/fonts/arial11.fnt"/><text font="gui/fonts/hw8.fnt"/>',
        'gui/fonts/arial11.fnt': '{\nfile="./arialuni.ttf"\n}',
        'gui/fonts/arialuni.ttf': [1],
        'gui/fonts/hw8.fnt': '{\nfile="./lana.ttf"\n}',
        'gui/fonts/lana.ttf': [2]
      },
      ['hw2/fx/text.unit'],
      { ae: mem({ 'gui/fonts/arial11.fnt': '{}' }) }
    )
    expect(p.files.map((f) => f.path)).toEqual(['hw2/fx/text.unit', 'hw2/gui/fonts/hw8.fnt', 'hw2/gui/fonts/lana.ttf'])
    expect(textOf(p, 'hw2/fx/text.unit')).toBe('<text font="gui/fonts/arial11.fnt"/><text font="hw2/gui/fonts/hw8.fnt"/>')
    expect(p.keptAe).toContain('gui/fonts/arial11.fnt')
  })

  it("ships a compiled prefab as text, its paths followed and rewritten", () => {
    // HW2's pack holds every .pfb as binary SVAL; shipped as text it read as garbage in AE
    // ("PrefabLoader: XML error! expected <")
    const pfb = '<dict>\n\t<int name="version">1</int>\n\t<string name="unit">fx/coin.unit</string>\n</dict>\n'
    const compiled = [...encodeSval(pfb)]
    const p = plan({ 'a/boss.unit': '<string name="loot">a/loot.pfb</string><x src="a/loot.pfb"/>', 'fx/coin.unit': '<unit/>' }, ['hw2/a/boss.unit'], {
      source: {
        has: (q) => ['a/boss.unit', 'a/loot.pfb', 'fx/coin.unit'].includes(q),
        read: (q) =>
          q === 'a/loot.pfb'
            ? { flag: 3, data: Uint8Array.from(compiled) }
            : q === 'a/boss.unit'
              ? { flag: 1, data: enc.encode('<x src="a/loot.pfb"/>') }
              : q === 'fx/coin.unit'
                ? { flag: 1, data: enc.encode('<unit/>') }
                : null
      }
    })
    expect(p.files.map((f) => f.path)).toEqual(['hw2/a/boss.unit', 'hw2/a/loot.pfb', 'hw2/fx/coin.unit'])
    const text = textOf(p, 'hw2/a/loot.pfb')
    expect(text.startsWith('<')).toBe(true)
    expect(text).toContain('<string name="unit">hw2/fx/coin.unit</string>')
    expect(p.files.find((f) => f.path === 'hw2/a/loot.pfb')!.flag).toBe(1)
  })

  it("writes HW2's `tag has` condition the way AE reads it, and notes a `tag hasnt`", () => {
    // Shock Widow's spew_web.unit: AE's Conditional.as reads `tag <tags>`, always "has"
    const p = plan(
      {
        'a/web.unit': '<array name="conditional">\n\t<s>tag</s><s>has</s><a><s>player</s></a>\n</array>',
        'a/necro.unit': '<array name="conditional"><s>tag</s><s>hasnt</s><a><s>undead</s></a></array>'
      },
      ['hw2/a/web.unit', 'hw2/a/necro.unit']
    )
    expect(textOf(p, 'hw2/a/web.unit')).toBe('<array name="conditional">\n\t<s>tag</s><a><s>player</s></a>\n</array>')
    expect(p.notes).toContain('hw2/a/necro.unit: a "tag hasnt" condition, which AE can\'t read')
  })

  it('ships the textures a model names, beside it', () => {
    const fbx = [...enc.encode('\u0000\u0016crystal.png\u0000D:\\Projects\\HW2\\fx\\crystal.png\u0000')]
    const p = plan({ 'fx/a.effect': '<mesh src="fx/m/crystal.fbx"/>', 'fx/m/crystal.fbx': fbx, 'fx/m/crystal.png': [7] }, ['hw2/fx/a.effect'])
    expect(p.files.map((f) => f.path)).toEqual(['hw2/fx/a.effect', 'hw2/fx/m/crystal.fbx', 'hw2/fx/m/crystal.png'])
  })

  it('prefers plain textures, follows cycles once, and refuses roots it cannot find', () => {
    const p = plan(
      { 'a.unit': '"b.inc" "t.png"', 'b.inc': '"a.unit"', 't.png': [1] },
      ['hw2/a.unit', 'hw2/nope.unit', 'a.unit'],
      { plain: mem({ 't.png': [5, 5] }) }
    )
    expect(p.files.map((f) => f.path)).toEqual(['hw2/a.unit', 'hw2/b.inc', 'hw2/t.png'])
    expect([...p.files.find((f) => f.path === 'hw2/t.png')!.data]).toEqual([5, 5])
    expect(p.errors).toEqual(['a.unit is not under hw2/', 'hw2/nope.unit: not in the source'])
  })
})

describe.skipIf(!HAS_HW2)("reading Hammerwatch 2's sprite sheets from its assets.bin", () => {
  // HW2's PACKAGER.exe unpacks these sheets to layered TIFFs; the app reads the packed form
  // itself, so a plain Steam install needs no unpacking. Both must bake to the same pixels.
  it.each([
    ['actors/beasts/trolls/troll_brute/troll_brute.tif', 'actors/beasts/trolls/troll_brute.unit'],
    ['actors/beasts/wolves/wolf_grey/wolf_grey.tif', 'actors/beasts/wolves/wolf_grey.unit']
  ])('%s', (tif, unit) => {
    const pack = packSource(join(HW2_ROOT, 'res', 'assets.bin'), HW2_ASSETS_MAGIC)!
    const extract = hw2AssetsDir()!
    const packed = readTintSheet(pack.read(tif)!)!
    const raw = readLayeredTif(readFileSync(join(extract, tif)))!
    expect([packed.width, packed.height]).toEqual([raw.width, raw.height])
    const colorize = parseColorize(readFileSync(join(extract, unit), 'utf8'))
    expect(colorize.size).toBeGreaterThan(0)
    const a = bakeTintSheet(packed, colorize)
    const b = bakeTintSheet(raw, colorize)
    let worst = 0
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
    // the pack keeps alpha in 7 bits and colour in linear light: a level or two apart
    expect(worst).toBeLessThanOrEqual(2)
  }, 60_000)
})

describe.skipIf(!HAS_HW2)('copying Hammerwatch 2 themes from the install', () => {
  it('carries every HW2 theme whole', () => {
    const p = plainParameters()
    const hw2 = THEME_DEFS.filter((t) => t.source === 'hw2').map((t) => t.id)
    p.levels = hw2.length
    p.themes = hw2
    p.levelMonsters = Array.from({ length: hw2.length }, () => p.levelMonsters[0])
    p.lobbies = []
    p.boss = { ...p.boss, enabled: false }
    const gen = generateDungeon(p, 5, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    const copy = hw2CopyPlan(HW2_ROOT, AE_ROOT, r.customAssets)!
    expect(copy.errors).toEqual([])
    const shipped = new Set(copy.files.map((f) => f.path))
    for (const root of r.customAssets) expect(shipped.has(root), root).toBe(true)
    // every absolute path a shipped text names is shipped, AE's, or noted missing
    const kept = new Set(copy.keptAe)
    const noted = copy.notes.join('\n')
    for (const f of copy.files) {
      if (!/\.(unit|inc|tileset|effect|env|sval)$/.test(f.path)) continue
      for (const ref of extractRefs(dec.decode(f.data))) {
        if (ref.relative) continue
        const ok = shipped.has(ref.path) || kept.has(ref.path) || aeAssetExists(ref.path) || noted.includes(ref.path)
        expect(ok, `${f.path} names ${ref.path}`).toBe(true)
      }
    }
    expect(danglingPaths(copy, AE_ROOT)).toEqual([])
    // nothing of HW2's lands at an AE path
    for (const f of copy.files) expect(f.path.startsWith('hw2/')).toBe(true)
  }, 120_000)

  it('carries every HW2 World biome whole', () => {
    const p = plainParameters()
    p.world = { enabled: true, worlds: BIOME_IDS.filter((b) => b.startsWith('hw2_')).map((biome) => ({ ...defaultWorld(), biome })) }
    const gen = generateDungeon(p, 6, HW2_CONTENT)
    expect(gen.ok, gen.ok ? '' : gen.errors.join('; ')).toBe(true)
    const r = gen as DungeonResult
    expect(r.customAssets.some((a) => a.startsWith('hw2/doodads/terrain/'))).toBe(true)
    expect(r.customAssets.some((a) => a.startsWith('hw2/tilesets/'))).toBe(true)
    const copy = hw2CopyPlan(HW2_ROOT, AE_ROOT, r.customAssets)!
    expect(copy.errors).toEqual([])
    const shipped = new Set(copy.files.map((f) => f.path))
    for (const root of r.customAssets) expect(shipped.has(root), root).toBe(true)
    expect(danglingPaths(copy, AE_ROOT)).toEqual([])
  }, 120_000)
})
