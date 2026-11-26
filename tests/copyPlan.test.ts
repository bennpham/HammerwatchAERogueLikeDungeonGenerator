import { describe, expect, it } from 'vitest'
import { extractRefs, resolveRelative } from '../src/main/custom/refs'
import { planCopy } from '../src/main/custom/copyPlan'
import type { CopyInput, CopySource } from '../src/main/custom/copyPlan'
import { hw2CopyPlan } from '../src/main/custom/hw2/copy'
import { BIOME_IDS, defaultWorld, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { THEME_DEFS } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { AE_ROOT } from './aeInstall'
import { HAS_HW2, HW2_CONTENT, HW2_ROOT, danglingPaths } from './hw2Install'
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
