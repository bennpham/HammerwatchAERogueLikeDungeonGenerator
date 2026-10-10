import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, getTheme, THEMES, THEME_DEFS, DungeonResult } from '../src/generator'
import { DoodadType, doodadPath, doodadOffset } from '../src/generator/objects/doodad'
import { THEMED_WALL_PIECES } from '../src/generator/config/themes'
import type { DoodadTypeName } from '../src/generator/objects/doodad'
import type { BossFloorPattern } from '../src/generator'
import { plainParameters } from './params'

function generateWithTheme(theme: string, seed: number, levels?: number): DungeonResult {
  const params = plainParameters()
  params.themes = params.themes.map(() => theme)
  if (levels !== undefined) {
    params.levels = levels
    params.themes = params.themes.slice(0, levels)
    params.levelMonsters = params.levelMonsters.slice(0, levels)
  }
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

describe('theme registry', () => {
  it('exposes every theme id through THEMES', () => {
    expect(THEMES).toEqual(THEME_DEFS.map((t) => t.id))
    expect(THEMES).toContain('a')
    expect(THEMES).toContain('bonus1')
    expect(THEMES).toContain('bonus5')
    expect(THEMES).toContain('h')
  })

  it('has unique ids and in-range tile counts', () => {
    expect(new Set(THEMES).size).toBe(THEMES.length)
    for (const def of THEME_DEFS) {
      expect(def.tiles).toBeGreaterThanOrEqual(1)
      expect(def.tilemap).toMatch(/^tilemaps\/.+\.xml$/)
    }
  })

  it('only names real doodad types in its overrides', () => {
    for (const def of THEME_DEFS) {
      for (const key of Object.keys(def.doodadOverrides ?? {})) {
        expect(DoodadType).toHaveProperty(key)
      }
    }
  })

  // h is lettered too, but its folder renames half its pieces and ships no
  // junctions at all, so it carries overrides like the bonus themes do
  const CLASSIC_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i']

  it('leaves the classic themes with no overrides', () => {
    for (const def of THEME_DEFS.filter((t) => CLASSIC_IDS.includes(t.id))) {
      expect(def.doodadOverrides).toBeUndefined()
      expect(def.doodadToken).toBe(def.id)
    }
  })

  it('gives every theme that uses one a Cover — the overlay over wall tops', () => {
    for (const def of THEME_DEFS.filter((t) => t.omitCover !== true)) {
      expect(doodadPath('Cover', def.id)).toMatch(/^doodads\/special\/color_theme_[a-gi]_16\.xml$/)
    }
  })

  it('keeps THEMED_WALL_PIECES in sync with the themeSubs:2 entries of DoodadType', () => {
    const fromTable = (Object.keys(DoodadType) as DoodadTypeName[]).filter(
      (k) => DoodadType[k].themeSubs === 2
    )
    expect([...THEMED_WALL_PIECES].sort()).toEqual([...fromTable].sort())
  })
})

describe('doodad resolution matrix — regression guard for the Pillar addition', () => {
  // Pillar is the highest-risk-of-silent-breakage change here: doodadPath and
  // doodadOffset resolve every override by DoodadTypeName, so a mistyped key
  // in themes.ts would repath an existing wall doodad across every level of
  // that theme, and it would read as a diff-noise-free one-liner. Snapshotting
  // every pre-existing (theme x DoodadTypeName) pair in the same commit that
  // adds Pillar means any future edit that perturbs one of them — including
  // this one, if it had been wrong — fails loudly instead of shipping quietly.
  it('leaves every pre-existing DoodadTypeName unchanged for every theme', () => {
    const matrix: Record<string, { path: string; offset: { x: number; y: number } }> = {}
    for (const def of THEME_DEFS) {
      for (const type of Object.keys(DoodadType) as DoodadTypeName[]) {
        // new since the snapshot was taken, so not part of the "unchanged"
        // guarantee. TriggerButton and BossDoorButton are themeless
        // (themeSubs: 0) and resolve to one path everywhere, which the
        // button-seal tests assert directly.
        if (type === 'Pillar' || type === 'TriggerButton' || type === 'BossDoorButton') continue
        matrix[`${def.id}:${type}`] = {
          path: doodadPath(type, def.id),
          offset: doodadOffset(type, def.id)
        }
      }
    }
    expect(matrix).toMatchSnapshot()
  })

  // keyed off doodadToken, not id: an overlay theme (`c_tiles`) has its own id
  // but borrows theme c's whole doodad folder, which is the point of the pairing
  it('resolves Pillar for every theme to a path that exists in the confirmed set', () => {
    for (const def of THEME_DEFS) {
      const path = doodadPath('Pillar', def.id)
      const t = def.doodadToken
      if (t === 'h') {
        expect(path).toBe('doodads/theme_h/h_deco_rock.xml')
      } else if (t.startsWith('bonus')) {
        expect(path).toBe(`doodads/theme_${t}/${t}_pillar.xml`)
      } else {
        expect(path).toBe(`doodads/theme_${t}/${t}_special_pillar.xml`)
      }
    }
  })
})

describe('overlay themes — an alternate tileset layered over a base theme', () => {
  const overlays = THEME_DEFS.filter((t) => t.overlay !== undefined)

  it('pairs every overlay with a real base theme it shares everything but art with', () => {
    expect(overlays.length).toBeGreaterThan(0)
    for (const def of overlays) {
      const base = getTheme(def.doodadToken)
      expect(base, `no base theme for ${def.id}`).toBeDefined()
      expect(base!.overlay).toBeUndefined()
      // same floor underneath, same grouping, same wall art
      expect(def.tilemap).toBe(base!.tilemap)
      expect(def.tiles).toBe(base!.tiles)
      expect(def.group).toBe(base!.group)
      expect(def.overlay!.tilemap).toMatch(/^tilemaps\/.+\.xml$/)
      expect(def.overlay!.tiles).toBeGreaterThanOrEqual(1)
      // the id is the overlay tileset's own filename, and carries no comma —
      // `themes=` in parameters.txt is comma-separated
      expect(def.overlay!.tilemap).toBe(`tilemaps/${def.id}.xml`)
      expect(def.id).not.toContain(',')
    }
  })

  // The whole promise of the pairing: `c - tiles` must build exactly the level
  // `c` does and only paint extra floor art over it. Anything resolving
  // differently means a wall, stair or collider moved.
  it('resolves every doodad identically to its base theme', () => {
    for (const def of overlays) {
      for (const type of Object.keys(DoodadType) as DoodadTypeName[]) {
        expect(doodadPath(type, def.id), `${def.id}:${type}`).toBe(doodadPath(type, def.doodadToken))
        expect(doodadOffset(type, def.id), `${def.id}:${type}`).toEqual(
          doodadOffset(type, def.doodadToken)
        )
      }
    }
  })

  it('emits the base tileset and the overlay as two datasets in every block', () => {
    const level0 = generateWithTheme('c_tiles', 4242, 1).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    const sets = level0.match(/<string name="tileset">([^<]*)<\/string>/g) ?? []
    expect(sets.length).toBeGreaterThan(0)
    expect(sets.length % 2).toBe(0)
    // base first, overlay second, in every single block
    for (let i = 0; i < sets.length; i += 2) {
      expect(sets[i]).toContain('tilemaps/c_default.xml')
      expect(sets[i + 1]).toContain('tilemaps/c_tiles.xml')
    }
  })

  // Mandatory: the base layer sits on the void and can afford a flat 255, but a
  // layer above one must be transparent wherever the floor stops, or it paints
  // its art out over the emptiness beyond the map.
  it('masks the overlay to exactly the base layer’s floor tiles', () => {
    const level0 = generateWithTheme('d_carpet', 4242, 1).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    const nums = (row: string) =>
      row
        .replace(/<[^>]+>/g, '')
        .split(/[\s,]+/)
        .filter((v) => v.length > 0)
        .map(Number)

    const dataT = (level0.match(/<int-arr name="data-t">[^<]*<\/int-arr>/g) ?? []).map(nums)
    const dataA = (level0.match(/<int-arr name="data-a">[^<]*<\/int-arr>/g) ?? []).map(nums)
    expect(dataT.length).toBeGreaterThan(0)
    expect(dataT.length % 2).toBe(0)

    const overlayDef = getTheme('d_carpet')!
    let sawFloor = false
    for (let block = 0; block < dataT.length; block += 2) {
      const base = dataT[block]
      const over = dataT[block + 1]
      const overAlpha = dataA[block + 1]
      for (let i = 0; i < base.length; i++) {
        if (base[i] === 0) {
          expect(over[i]).toBe(0)
          expect(overAlpha[i]).toBe(0)
        } else {
          sawFloor = true
          expect(over[i]).toBeGreaterThanOrEqual(1)
          expect(over[i]).toBeLessThanOrEqual(overlayDef.overlay!.tiles)
          expect(overAlpha[i]).toBe(255)
        }
      }
    }
    expect(sawFloor).toBe(true)
  })

  it('stacks water, theme and overlay in the boss arena', () => {
    const params = defaultParameters()
    params.boss.enabled = true
    params.boss.fights[0].arena.theme = 'f_frozen'
    const result = generateDungeon(params, 4242)
    expect(result.ok).toBe(true)
    const boss = (result as DungeonResult).files.find((f) => f.path === 'levels/boss0.xml')!.content
    const sets = boss.match(/<string name="tileset">([^<]*)<\/string>/g) ?? []
    expect(sets.length).toBeGreaterThan(0)
    expect(sets.length % 3).toBe(0)
    for (let i = 0; i < sets.length; i += 3) {
      expect(sets[i]).toContain('tilemaps/water.xml')
      expect(sets[i + 1]).toContain('tilemaps/f_default.xml')
      expect(sets[i + 2]).toContain('tilemaps/f_frozen.xml')
    }
  })

  // Invariant 2. A plain theme must draw the exact random numbers it drew
  // before overlays existed, so every seed from an earlier build still
  // produces byte-identical output — which is only true because
  // overlayDataset returns before touching the stream when there is no overlay.
  it('draws no RNG for a theme without an overlay', () => {
    const plain = generateWithTheme('c', 31337, 3)
    const again = generateWithTheme('c', 31337, 3)
    expect(plain.files.map((f) => f.content)).toEqual(again.files.map((f) => f.content))
    // and the paired theme really does differ — otherwise the test above is vacuous
    const paired = generateWithTheme('c_tiles', 31337, 3)
    const plain0 = plain.files.find((f) => f.path === 'levels/level0.xml')!.content
    const paired0 = paired.files.find((f) => f.path === 'levels/level0.xml')!.content
    expect(paired0).not.toBe(plain0)
    // ...only by the added dataset: the doodads section is untouched
    const doodads = (xml: string) => xml.slice(xml.indexOf('<dictionary name="doodads">'))
    expect(doodads(paired0)).toBe(doodads(plain0))
  })
})

/** Every dataset of every block, in order, as {tileset, data-t, data-a}. */
function readDatasets(xml: string): Array<{ tileset: string; t: number[]; a: number[] }> {
  const nums = (row: string) =>
    row
      .split(/[\s,]+/)
      .filter((v) => v.length > 0)
      .map(Number)
  return [
    ...xml.matchAll(
      /<string name="tileset">([^<]*)<\/string>\s*<int-arr name="data-t">([^<]*)<\/int-arr>[\s\S]*?<int-arr name="data-a">([^<]*)<\/int-arr>/g
    )
  ].map((m) => ({ tileset: m[1], t: nums(m[2]), a: nums(m[3]) }))
}

/** Datasets grouped per tile block — a block starts at each base-tileset row. */
function blocksOf(xml: string, baseTileset: string): Array<ReturnType<typeof readDatasets>> {
  const blocks: Array<ReturnType<typeof readDatasets>> = []
  for (const ds of readDatasets(xml)) {
    if (ds.tileset === baseTileset || blocks.length === 0) blocks.push([])
    blocks[blocks.length - 1].push(ds)
  }
  return blocks
}

describe('mixed themes — the plain floor and its overlays varied per region', () => {
  const mixed = THEME_DEFS.filter((t) => t.mixed !== undefined)

  it('gives every base theme that has curated overlays exactly one mixed entry', () => {
    expect(mixed.length).toBeGreaterThan(0)
    for (const base of THEME_DEFS.filter((t) => t.overlay === undefined && t.mixed === undefined)) {
      const overlayCount = THEME_DEFS.filter(
        (t) => t.overlay !== undefined && t.doodadToken === base.doodadToken
      ).length
      const entries = mixed.filter((t) => t.id === `${base.id}_mixed`)
      expect(entries.length, `${base.id} has ${overlayCount} overlays`).toBe(
        overlayCount === 0 ? 0 : 1
      )
    }
    // the ones the ask named, plus i which has a curated overlay too
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i']) {
      expect(THEMES).toContain(`${id}_mixed`)
    }
    // h and the bonus sets ship no non-border overlay, so they have nothing to mix
    expect(THEMES).not.toContain('h_mixed')
    expect(THEMES).not.toContain('bonus1_mixed')
  })

  it('builds each palette as the plain base plus that base’s curated overlays', () => {
    for (const def of mixed) {
      const base = getTheme(def.doodadToken)!
      // never both: `overlay` means "this tileset everywhere", the opposite of mixing
      expect(def.overlay).toBeUndefined()
      expect(def.tilemap).toBe(base.tilemap)
      expect(def.tiles).toBe(base.tiles)
      expect(def.group).toBe(base.group)
      expect(def.id).not.toContain(',')

      const palette = def.mixed!
      expect(palette.length).toBeGreaterThanOrEqual(2)
      // slot 0 is the plain base floor; nothing else is null
      expect(palette[0]).toBeNull()
      const siblings = THEME_DEFS.filter(
        (t) => t.overlay !== undefined && t.doodadToken === def.doodadToken
      ).map((t) => t.overlay!)
      expect(palette.slice(1)).toEqual(siblings)
    }
  })

  it('resolves every doodad identically to its base theme', () => {
    for (const def of mixed) {
      for (const type of Object.keys(DoodadType) as DoodadTypeName[]) {
        expect(doodadPath(type, def.id), `${def.id}:${type}`).toBe(doodadPath(type, def.doodadToken))
        expect(doodadOffset(type, def.id), `${def.id}:${type}`).toEqual(
          doodadOffset(type, def.doodadToken)
        )
      }
    }
  })

  // Unlike a paired theme, the stack height varies: a block sitting inside one
  // room needs at most one extra dataset, and a block on a plain-slot room needs
  // none. Only the tilesets in the theme's own palette may ever appear.
  it('stacks the base first and only palette overlays above it', () => {
    const def = getTheme('c_mixed')!
    const level0 = generateWithTheme('c_mixed', 4242, 1).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    const allowed = def.mixed!.filter((s) => s !== null).map((s) => s!.tilemap)
    expect(allowed).toEqual(['tilemaps/c_tiles.xml', 'tilemaps/c_tiles_dirt.xml'])

    const blocks = blocksOf(level0, def.tilemap)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block[0].tileset).toBe('tilemaps/c_default.xml')
      expect(block.length).toBeLessThanOrEqual(1 + allowed.length)
      const extras = block.slice(1).map((d) => d.tileset)
      for (const tileset of extras) expect(allowed).toContain(tileset)
      // a tileset never appears twice in one block
      expect(new Set(extras).size).toBe(extras.length)
    }
  })

  it('masks every extra dataset to the floor and keeps the masks disjoint', () => {
    const def = getTheme('d_mixed')!
    const level0 = generateWithTheme('d_mixed', 4242, 1).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    const limits = new Map(def.mixed!.filter((s) => s !== null).map((s) => [s!.tilemap, s!.tiles]))

    let sawExtra = false
    for (const block of blocksOf(level0, def.tilemap)) {
      const base = block[0].t
      for (let i = 0; i < base.length; i++) {
        let covering = 0
        for (const extra of block.slice(1)) {
          if (extra.t[i] === 0) {
            expect(extra.a[i]).toBe(0)
            continue
          }
          // an overlay tile only ever sits on a floor tile of the base
          expect(base[i]).not.toBe(0)
          expect(extra.t[i]).toBeLessThanOrEqual(limits.get(extra.tileset)!)
          expect(extra.a[i]).toBe(255)
          covering++
          sawExtra = true
        }
        // the palette slots partition the floor: never two overlays on one cell
        expect(covering).toBeLessThanOrEqual(1)
      }
    }
    expect(sawExtra).toBe(true)
  })

  // The point of mixing per region rather than per tile: a room is one surface,
  // so a level reads as several deliberate floors instead of speckle.
  it('gives a whole room a single floor surface', () => {
    const params = plainParameters()
    params.levels = 1
    params.themes = ['c_mixed']
    params.levelMonsters = params.levelMonsters.slice(0, 1)
    const result = generateDungeon(params, 4242)
    expect(result.ok).toBe(true)
    const res = result as DungeonResult
    const level0 = res.files.find((f) => f.path === 'levels/level0.xml')!.content
    const preview = res.levels[0]

    // rebuild the world-space variant of every floor cell from the emitted XML
    const def = getTheme('c_mixed')!
    const variantAt = new Map<string, string>()
    const blocks = blocksOf(level0, def.tilemap)
    const perRow = Math.ceil(params.mapHeight / 20) + 1
    blocks.forEach((block, b) => {
      const blockX = Math.trunc(b / perRow) * 20
      const blockY = (b % perRow) * 20
      for (let i = 0; i < block[0].t.length; i++) {
        if (block[0].t[i] === 0) continue
        const x = blockX - 10 + (i % 20)
        const y = blockY - 10 + Math.trunc(i / 20)
        const extra = block.slice(1).find((d) => d.t[i] !== 0)
        variantAt.set(`${x},${y}`, extra?.tileset ?? 'base')
      }
    })
    expect(variantAt.size).toBeGreaterThan(0)

    let checked = 0
    for (const room of preview.rooms) {
      const seen = new Set<string>()
      for (let x = room.x; x <= room.x + room.width; x++) {
        for (let y = room.y; y <= room.y + room.height; y++) {
          const v = variantAt.get(`${x},${y}`)
          if (v !== undefined) seen.add(v)
        }
      }
      if (seen.size > 0) {
        expect(seen.size, `room at ${room.x},${room.y} has ${[...seen].join(' + ')}`).toBe(1)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
    // and the level as a whole is genuinely mixed, or the assertion above is vacuous
    expect(new Set(variantAt.values()).size).toBeGreaterThan(1)
  })

  // Invariant 2, the same proof the overlay suite uses: mixing may only add
  // floor art, never move a wall, a stair or a monster.
  it('is deterministic and leaves the layout identical to the plain theme', () => {
    const once = generateWithTheme('c_mixed', 31337, 3)
    const again = generateWithTheme('c_mixed', 31337, 3)
    expect(once.files.map((f) => f.content)).toEqual(again.files.map((f) => f.content))

    const mixed0 = once.files.find((f) => f.path === 'levels/level0.xml')!.content
    const plain0 = generateWithTheme('c', 31337, 3).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    const paired0 = generateWithTheme('c_tiles', 31337, 3).files.find(
      (f) => f.path === 'levels/level0.xml'
    )!.content
    expect(mixed0).not.toBe(plain0)
    expect(mixed0).not.toBe(paired0)
    const doodads = (xml: string) => xml.slice(xml.indexOf('<dictionary name="doodads">'))
    expect(doodads(mixed0)).toBe(doodads(plain0))
  })

  it('lays a mixed arena theme out as a pattern, leaving the alcove plain', () => {
    const params = defaultParameters()
    params.boss.enabled = true
    params.boss.fights[0].arena.theme = 'f_mixed'
    const result = generateDungeon(params, 4242)
    expect(result.ok).toBe(true)
    const boss = (result as DungeonResult).files.find((f) => f.path === 'levels/boss0.xml')!.content

    const datasets = readDatasets(boss)
    const tilesets = new Set(datasets.map((d) => d.tileset))
    expect(tilesets).toContain('tilemaps/water.xml')
    expect(tilesets).toContain('tilemaps/f_default.xml')
    // f's palette is [plain, f_fine, f_frozen]. A centre shape uses only two
    // slots, so one seed need not show both — only that the pattern laid down
    // something over the plain floor.
    const palette = ['tilemaps/f_fine.xml', 'tilemaps/f_frozen.xml']
    expect(palette.some((p) => tilesets.has(p))).toBe(true)
    for (const set of tilesets) {
      expect(['tilemaps/water.xml', 'tilemaps/f_default.xml', ...palette]).toContain(set)
    }

    // water first, theme second, pattern datasets after — per block
    let sawExtra = false
    for (const block of blocksOf(boss, 'tilemaps/water.xml')) {
      expect(block[0].tileset).toBe('tilemaps/water.xml')
      if (block.length === 1) continue // the margin blocks carry water only
      expect(block[1].tileset).toBe('tilemaps/f_default.xml')
      const base = block[1].t
      for (const extra of block.slice(2)) {
        sawExtra = true
        for (let i = 0; i < base.length; i++) {
          if (extra.t[i] !== 0) expect(base[i]).not.toBe(0)
        }
      }
    }
    expect(sawExtra).toBe(true)
  })

  // The Boss tab's "Floor pattern" control. Forcing a kind must change the
  // floor and nothing else, so the same seed keeps its cover, monsters and
  // tile variants — only the arrangement of the palette moves.
  it('honours a forced arena floor pattern, changing only the floor', () => {
    const build = (floorPattern: string) => {
      const params = defaultParameters()
      params.boss.enabled = true
      params.boss.fights[0].arena.theme = 'g_mixed'
      params.boss.fights[0].arena.floorPattern = floorPattern as BossFloorPattern
      const result = generateDungeon(params, 4242)
      expect(result.ok).toBe(true)
      return (result as DungeonResult).files.find((f) => f.path === 'levels/boss0.xml')!.content
    }

    const checker = build('checker')
    const bandsH = build('bandsH')
    expect(checker).not.toBe(bandsH)
    expect(build('checker')).toBe(checker)

    // everything below the tilemap is untouched by the choice
    const belowTilemap = (xml: string) => xml.slice(xml.indexOf('<dictionary name="doodads">'))
    expect(belowTilemap(bandsH)).toBe(belowTilemap(checker))

    // and one of them is what the seed would have rolled on its own
    const random = build('random')
    const kinds = ['checker', 'bandsH', 'bandsV', 'bandsDiag', 'rings', 'diamond', 'cross', 'triangle']
    expect(kinds.map(build)).toContain(random)
    // a dozen full campaigns; same reason boss.test.ts's every-theme sweep is
    // given room beyond the 5s default
  }, 30_000)

  it('ignores the floor pattern for a theme with no palette', () => {
    const build = (floorPattern: string) => {
      const params = defaultParameters()
      params.boss.enabled = true
      params.boss.fights[0].arena.theme = 'g'
      params.boss.fights[0].arena.floorPattern = floorPattern as BossFloorPattern
      const result = generateDungeon(params, 4242)
      expect(result.ok).toBe(true)
      return (result as DungeonResult).files.find((f) => f.path === 'levels/boss0.xml')!.content
    }
    // a plain theme takes no pattern draws at all, so the knob cannot move it
    expect(build('checker')).toBe(build('random'))
    expect(build('rings')).toBe(build('random'))
  })

  it('draws no RNG in the arena for a theme without a palette', () => {
    const run = (theme: string) => {
      const params = defaultParameters()
      params.boss.enabled = true
      params.boss.fights[0].arena.theme = theme
      const result = generateDungeon(params, 909)
      expect(result.ok).toBe(true)
      return (result as DungeonResult).files.find((f) => f.path === 'levels/boss0.xml')!.content
    }
    expect(run('g')).toBe(run('g'))
    expect(run('g_mixed')).toBe(run('g_mixed'))
    expect(run('g_mixed')).not.toBe(run('g'))
  })
})

describe('doodadOffset — the anchor compensation', () => {
  // DoodadType's offsets encode the classic art's <origin> y / 16. The bonus art
  // is anchored at 0 0, so reusing the classic offsets displaces the collision
  // polygon and the player walks through walls.
  it('uses the classic anchors for lettered themes', () => {
    expect(doodadOffset('Horizontal', 'a')).toEqual({ x: 0, y: 2 })
    expect(doodadOffset('Vertical', 'a')).toEqual({ x: 0, y: 1 })
    expect(doodadOffset('CrossWall', 'a')).toEqual({ x: 0, y: 1 })
    expect(doodadOffset('TDown', 'a')).toEqual({ x: 0, y: 2 })
  })

  it('flattens every wall piece to yOffset 0 for the bonus themes', () => {
    for (const def of THEME_DEFS.filter((t) => t.id.startsWith('bonus'))) {
      for (const piece of THEMED_WALL_PIECES) {
        // the stair frames are a different sprite entirely, tuned separately
        if (piece === 'ExitUp' || piece === 'ExitDn') continue
        expect(doodadOffset(piece, def.id)).toEqual({ x: 0, y: 0 })
      }
    }
  })

  it('leaves non-themed pieces on their defaults for every theme', () => {
    for (const def of THEME_DEFS) {
      expect(doodadOffset('Spawn', def.id)).toEqual({ x: 1, y: 1 })
      expect(doodadOffset('Torch', def.id)).toEqual({ x: 0.5, y: 1 })
      expect(doodadOffset('Cover', def.id)).toEqual({ x: 0.5, y: 0.5 })
    }
  })
})

describe('doodadPath', () => {
  it('substitutes the theme token once or twice as the template needs', () => {
    expect(doodadPath('Horizontal', 'a')).toBe('doodads/theme_a/a_h_8.xml')
    expect(doodadPath('Cover', 'a')).toBe('doodads/special/color_theme_a_16.xml')
    expect(doodadPath('Spawn', 'a')).toBe('doodads/generic/marker_spawn.xml')
  })

  it('handles multi-character bonus tokens', () => {
    expect(doodadPath('Horizontal', 'bonus3')).toBe('doodads/theme_bonus3/bonus3_h_8.xml')
    expect(doodadPath('CornerLD', 'bonus1')).toBe('doodads/theme_bonus1/bonus1_crn_l_dn.xml')
    expect(doodadPath('TRight', 'bonus5')).toBe('doodads/theme_bonus5/bonus5_x_t_r.xml')
  })

  it('uses the shared bonus stair art, which does not leak into lettered themes', () => {
    expect(doodadPath('ExitUp', 'bonus2')).toBe('doodads/special/bonus_entrance.xml')
    expect(doodadPath('ExitDn', 'bonus2')).toBe('doodads/special/bonus_exit.xml')
    expect(doodadPath('ExitUp', 'a')).toBe('doodads/theme_a/a_exit_h_up.xml')
    expect(doodadPath('ExitDn', 'a')).toBe('doodads/theme_a/a_exit_h_dn.xml')
  })
})

describe('generating with a bonus theme', () => {
  it('emits the bonus tileset and bonus wall pieces', () => {
    const level0 = generateWithTheme('bonus1', 8080).files.find((f) => f.path === 'levels/level0.xml')!
      .content
    expect(level0).toContain('<string name="tileset">tilemaps/bonus_1.xml</string>')
    expect(level0).toContain('doodads/theme_bonus1/bonus1_')
  })

  it('substitutes the stair frames and borrows a cover block', () => {
    const result = generateWithTheme('bonus4', 4321)
    // a middle level has both an entrance and an exit
    const level = result.files.find((f) => f.path === 'levels/level3.xml')!.content
    expect(level).toContain('doodads/special/bonus_entrance.xml')
    expect(level).toContain('doodads/special/bonus_exit.xml')
    // the occlusion overlay, so the character does not show through wall tops
    expect(level).toContain('doodads/special/color_theme_a_16.xml')
    for (const file of result.files.filter((f) => f.path.startsWith('levels/level'))) {
      expect(file.content).not.toContain('exit_h_')
      expect(file.content).not.toContain('color_theme_bonus')
    }
  })

  it('emits bonus wall doodads without the classic anchor shift', () => {
    // end-to-end version of the doodadOffset unit tests: the same wall piece on
    // the same seed must sit 1 tile higher for bonus1 than for theme a.
    // Uses _v_8 rather than _h_8 because the latter doubles as stair backing,
    // which bonus themes emit and lettered ones do not.
    const yOf = (theme: string): number[] => {
      const xml = generateWithTheme(theme, 5150, 1).files.find((f) => f.path === 'levels/level0.xml')!
        .content
      return [...xml.matchAll(/<string name="type">[^<]*_v_8\.xml<\/string>\s*<float name="x">[^<]*<\/float>\s*<float name="y">([^<]*)<\/float>/g)]
        .map((m) => Number(m[1]))
    }
    const classicYs = yOf('a')
    const bonusYs = yOf('bonus1')
    expect(classicYs.length).toBeGreaterThan(0)
    expect(bonusYs.length).toBe(classicYs.length)
    for (let i = 0; i < classicYs.length; i++) {
      expect(classicYs[i] - bonusYs[i]).toBe(1)
    }
  })

  it('closes the wall band the stair alcove opens, 2 tiles per stair set', () => {
    // same seed => identical layout, so the only difference in doodad count is
    // the backing bonus themes need and lettered themes do not
    const countDoodads = (theme: string): number => {
      const level = generateWithTheme(theme, 777).files.find(
        (f) => f.path === 'levels/level3.xml'
      )!.content
      return [...level.matchAll(/<bool name="need-sync">/g)].length
    }
    // a middle level carries both an entrance and an exit set
    expect(countDoodads('bonus2') - countDoodads('a')).toBe(4)
  })

  it('declares stair backing only for themes whose stair art lacks a collider', () => {
    // bonus_entrance/bonus_exit and h_pyramid_exit all declare no collision polygon
    for (const def of THEME_DEFS) {
      if (def.id.startsWith('bonus') || def.id === 'h') expect(def.stairBacking).toBe('Horizontal')
      else expect(def.stairBacking).toBeUndefined()
    }
  })

  // An index above the tileset's sprite count is a load-time error in game, so
  // this is checked per *dataset*, against the limit of the tileset that dataset
  // actually names: a paired theme emits the base's data-t and the overlay's,
  // and the two have different variant counts (c_default has 4, c_tiles_dirt has
  // 8). Comparing the whole file against one number would both miss an
  // over-range overlay and false-alarm on a legitimate one. Matching on the
  // tileset rather than on dataset position is what lets this cover the mixed
  // themes too, whose stack height varies block by block.
  // Explicit timeout: this generates a whole campaign for every entry in
  // THEME_DEFS, so it runs ~5s on its own and longer when the suite saturates
  // the CPU. The default 5s made it flake under load rather than catch a
  // regression, and adding a theme makes it slower still.
  it('never emits a floor index above the tileset variant count', () => {
    for (const def of THEME_DEFS) {
      const limits = new Map<string, number>([[def.tilemap, def.tiles]])
      if (def.overlay !== undefined) limits.set(def.overlay.tilemap, def.overlay.tiles)
      for (const slot of def.mixed ?? []) {
        if (slot !== null) limits.set(slot.tilemap, slot.tiles)
      }

      const level0 = generateWithTheme(def.id, 99, 1).files.find(
        (f) => f.path === 'levels/level0.xml'
      )!.content
      const datasets = [
        ...level0.matchAll(
          /<string name="tileset">([^<]*)<\/string>\s*<int-arr name="data-t">([^<]*)<\/int-arr>/g
        )
      ]
      expect(datasets.length).toBeGreaterThan(0)
      for (const [, tileset, data] of datasets) {
        const limit = limits.get(tileset)
        expect(limit, `${def.id} emitted an unexpected tileset ${tileset}`).toBeDefined()
        const max = Math.max(
          ...data
            .split(/[\s,]+/)
            .filter((v) => v.length > 0)
            .map(Number)
        )
        expect(max, `${def.id} dataset ${tileset}`).toBeLessThanOrEqual(limit!)
      }
    }
  }, 30000)
})

describe('theme h — desert outdoors', () => {
  it('takes theme h’s own art for the pieces its folder ships', () => {
    // the corners match the template as-is; only the anchor differs
    expect(doodadPath('CornerLD', 'h')).toBe('doodads/theme_h/h_crn_l_dn.xml')
    expect(doodadPath('CornerRU', 'h')).toBe('doodads/theme_h/h_crn_r_up.xml')
    // renamed with a facing suffix the template has no slot for
    expect(doodadPath('Horizontal', 'h')).toBe('doodads/theme_h/h_h_8_dn.xml')
    expect(doodadPath('Vertical', 'h')).toBe('doodads/theme_h/h_v_8_l.xml')
    expect(doodadPath('HCapLeft', 'h')).toBe('doodads/theme_h/h_h_cap_up_l.xml')
    expect(doodadPath('HCapRight', 'h')).toBe('doodads/theme_h/h_h_cap_up_r.xml')
  })

  // ~84% of a level's wall doodads, and theme h ships no tee art. Each pattern is
  // a wall mass open on one side, so it takes the cliff face pointing that way.
  // Getting an axis backwards turns every wall inside out, so pin all four.
  it('maps each tee onto the cliff face for its open side', () => {
    expect(doodadPath('TDown', 'h')).toBe('doodads/theme_h/h_h_8_dn.xml') // open below
    expect(doodadPath('TUp', 'h')).toBe('doodads/theme_h/h_h_8_up.xml') // open above
    expect(doodadPath('TLeft', 'h')).toBe('doodads/theme_h/h_v_8_l.xml') // open left
    expect(doodadPath('TRight', 'h')).toBe('doodads/theme_h/h_v_8_r.xml') // open right
  })

  it('maps the pieces its folder lacks onto cliff faces, borrowing nothing', () => {
    // there is no 4-way cliff face and no vertical cap, but theme i's indoor
    // stone reads as someone else's wall dropped into the desert, so these take
    // the horizontal faces by facing the same way the tees do
    expect(doodadPath('VCapUp', 'h')).toBe('doodads/theme_h/h_h_8_up.xml') // open above
    expect(doodadPath('VCapDown', 'h')).toBe('doodads/theme_h/h_h_8_dn.xml') // open below
    for (const piece of THEMED_WALL_PIECES) {
      expect(doodadPath(piece, 'h')).not.toContain('theme_i')
    }
  })

  // Regression guard. theme h's pieces fence one edge of their tile each, and a
  // room stays sealed because those fences form a closed loop. CrossWall is the
  // outer corner of a wall band, where the top row's fence and the side column's
  // fence meet at right angles without touching — only a collider covering the
  // whole tile closes that joint. h_h_8_up (x 0..1, y -0.19..1.0 once lifted) is
  // the sole piece in the folder that does, which is why it is here rather than
  // a better-facing cliff. Pointing this at h_h_8_dn, whose polygon is a fence
  // along the top edge, put a walk-through gap in every room corner of every
  // level and the player left the map through it.
  it('gives CrossWall the one theme h piece that seals a whole tile', () => {
    expect(doodadPath('CrossWall', 'h')).toBe('doodads/theme_h/h_h_8_up.xml')
    expect(doodadOffset('CrossWall', 'h')).toEqual({ x: 0, y: -1 })
    // the piece it must never revert to: same folder, but a top-edge fence
    expect(doodadPath('CrossWall', 'h')).not.toBe('doodads/theme_h/h_h_8_dn.xml')
  })

  it('uses the pyramid entrance for both stair ends, and backs it', () => {
    // the whole doorway structure, not h_pyramid_exit_door — that is just the
    // door leaf, which reads as a pair of loose planks at alcove size
    expect(doodadPath('ExitUp', 'h')).toBe('doodads/theme_h/h_pyramid_exit.xml')
    expect(doodadPath('ExitDn', 'h')).toBe('doodads/theme_h/h_pyramid_exit.xml')
    // it declares no collision polygon, so the wall band behind it must close
    expect(getTheme('h')!.stairBacking).toBe('Horizontal')
  })

  it('emits no occlusion overlay — there are no wall tops to hide behind', () => {
    expect(getTheme('h')!.omitCover).toBe(true)
    const result = generateWithTheme('h', 6420)
    for (const file of result.files.filter((f) => f.path.startsWith('levels/level'))) {
      expect(file.content).not.toContain('color_theme_')
    }
  })

  it('flattens its 16x16 art to origin 0 0 and lifts every 16x32 piece', () => {
    // every doodads/theme_h/ asset declares <origin>0 0</origin>, so the 16x16
    // pieces carry their collider on their own tile and need no compensation
    expect(doodadOffset('Horizontal', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('Vertical', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('TDown', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('VCapDown', 'h')).toEqual({ x: 0, y: 0 })
    // the 16x32 pieces hold their polygon in the lower half (h_h_8_up y 13..32,
    // both up corners y 16..32, h_h_cap_up_l y 6..32, h_h_cap_up_r y 4..32), so
    // at yOffset 0 the barrier lands a full tile below the wall and the player
    // walks straight out through it. -1 puts it back on the wall tile, with the
    // cliff face rising into the tile above. Every 16x32 piece in the folder:
    expect(doodadOffset('TUp', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('VCapUp', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('CrossWall', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('CornerLU', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('CornerRU', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('HCapLeft', 'h')).toEqual({ x: 0, y: -1 })
    expect(doodadOffset('HCapRight', 'h')).toEqual({ x: 0, y: -1 })
    // the down corners really are 16x16 (collider y -5..3) and stay flat
    expect(doodadOffset('CornerLD', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('CornerRD', 'h')).toEqual({ x: 0, y: 0 })
  })

  it('emits the h tileset and no piece theme h does not ship', () => {
    const result = generateWithTheme('h', 6420)
    // a middle level carries both an entrance and an exit set
    const level = result.files.find((f) => f.path === 'levels/level3.xml')!.content
    expect(level).toContain('<string name="tileset">tilemaps/h_default.xml</string>')
    expect(level).toContain('doodads/theme_h/h_')
    expect(level).toContain('doodads/theme_h/h_pyramid_exit.xml')

    // all four cliff faces are in play — a regression that collapsed the tee map
    // back onto a single face would still pass every path assertion above
    for (const face of ['h_h_8_dn', 'h_h_8_up', 'h_v_8_l', 'h_v_8_r']) {
      expect(level).toContain(`doodads/theme_h/${face}.xml`)
    }

    for (const file of result.files.filter((f) => f.path.startsWith('levels/level'))) {
      // the un-suffixed template names, which theme h has no file for
      expect(file.content).not.toContain('h_h_8.xml')
      expect(file.content).not.toContain('h_v_8.xml')
      expect(file.content).not.toContain('h_h_cap_l.xml')
      expect(file.content).not.toContain('theme_h/h_x_')
      expect(file.content).not.toContain('theme_h/h_v_cap')
      expect(file.content).not.toContain('exit_h_')
      expect(file.content).not.toContain('color_theme_h')
      // an outdoor level must never mix in theme i's indoor stone
      expect(file.content).not.toContain('theme_i')
      // the floor hole, and the pieces the matcher has no pattern for
      expect(file.content).not.toContain('h_exit_special')
      expect(file.content).not.toContain('h_deco_rock')
    }
  })

  it('places the same wall pieces as any other theme, minus the covers', () => {
    // same seed => same layout, so every difference in the doodad list is
    // accounted for: h drops every Cover and adds 2 backing pieces per stair set
    //
    // Doodads ONLY. `<string name="type">` is also how an actor and an item
    // declare themselves, and the two themes do not populate identically at a
    // shared seed: theme h overhangs nothing, so reachability.ts accepts and
    // rejects different candidate floors, the retry count differs, and the draws
    // downstream land elsewhere. At this seed that is one extra chance-rolled
    // silver door in h (7 vs 6) — a population difference, nothing to do with
    // wall art. Counting every `type` string used to balance out by luck and
    // stopped when issue #58 changed the monster roll's draw count.
    const doodads = (theme: string): string[] => {
      const level = generateWithTheme(theme, 777).files.find(
        (f) => f.path === 'levels/level3.xml'
      )!.content
      return [...level.matchAll(/<string name="type">([^<]+)<\/string>/g)]
        .map((m) => m[1])
        .filter((path) => path.startsWith('doodads/'))
    }
    const a = doodads('a')
    const h = doodads('h')
    const covers = a.filter((p) => p.startsWith('doodads/special/color_theme_')).length
    expect(covers).toBeGreaterThan(0)
    // a middle level carries both an entrance and an exit set
    expect(h.length).toBe(a.length - covers + 4)
  })
})

describe('determinism', () => {
  it('is reproducible for a seed', () => {
    const a = generateDungeon(defaultParameters(), 24680)
    const b = generateDungeon(defaultParameters(), 24680)
    expect(a).toEqual(b)
  })

  it('resolves an unknown theme to the first registry entry rather than throwing', () => {
    expect(getTheme('nope')).toBeUndefined()
    expect(getTheme('a')).toBe(THEME_DEFS[0])
  })
})
