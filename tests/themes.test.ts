/**
 * The AE theme registry, and what generating each theme actually emits:
 * every asset path exists in the install, every wall line gets a piece, and
 * no two wall pieces stand on the same anchor (the bleeding/overlapping walls
 * the hw2ae piratecove port shows).
 */
import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { THEMES, THEME_DEFS, THEME_GROUPS, getTheme, themeEnvironment } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { doorUnitPath } from '../src/generator/objects/item'
import { resolvePiece, wallUnitPath } from '../src/generator/map/aeWalls'
import { levelsOf } from './ae'
import { wallCells } from './sealProbe'
import { plainParameters } from './params'

/** The wall pieces every set must be able to resolve (directly or by fallback). */
const REQUIRED_PIECES = ['h_16', 'v_16', 'crn_nw', 'crn_ne', 'crn_sw', 'crn_se', 'x_n', 'x_s', 'x_e', 'x_w', 'x_x', 'cap_h_w', 'cap_h_e', 'cap_v_n', 'cap_v_s']

function generateTheme(theme: string, seed = 4242): DungeonResult {
  const params = plainParameters()
  params.levels = 2
  params.themes = [theme, theme]
  params.levelMonsters = params.levelMonsters.slice(0, 2)
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  const result = generateDungeon(params, seed)
  expect(result.ok, `${theme}: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

describe('theme registry', () => {
  it('names every theme the way AE does, never a/b/c', () => {
    expect(THEMES.length).toBeGreaterThan(15)
    expect(new Set(THEMES).size).toBe(THEMES.length)
    for (const id of THEMES) expect(id, id).not.toMatch(/^[a-i](_|$)/)
    for (const id of ['prison', 'armory', 'archives', 'chambers', 'crypt', 'mine_granite', 'pyramid_inside', 'cave_desert']) {
      expect(THEMES).toContain(id)
    }
  })

  it('puts every theme in a group the picker renders, with a label', () => {
    for (const t of THEME_DEFS) {
      expect(THEME_GROUPS, t.id).toContain(t.group)
      expect(t.label.length, t.id).toBeGreaterThan(0)
    }
  })

  it('names only assets the install ships', () => {
    for (const t of THEME_DEFS) {
      for (const ts of [...t.floor, ...(t.mixed ?? [])]) expect(aeAssetExists(ts), `${t.id}: ${ts}`).toBe(true)
      for (const env of t.environments) expect(aeAssetExists(env), `${t.id}: ${env}`).toBe(true)
      expect(aeAssetExists(wallUnitPath(t.exitUpSet, 'exit_up')), `${t.id}: exit_up`).toBe(true)
      expect(aeAssetExists(wallUnitPath(t.exitDnSet, 'exit_dn')), `${t.id}: exit_dn`).toBe(true)
    }
  })

  it('resolves every wall piece a floor can need, for every set', () => {
    for (const t of THEME_DEFS) {
      for (const piece of REQUIRED_PIECES) {
        expect(resolvePiece(t.walls, piece, aeAssetExists), `${t.id} ${piece}`).not.toBeNull()
      }
    }
  })

  it('has door art for every metal tier in every theme', () => {
    for (const t of THEME_DEFS) {
      // slots 0-2 horizontal bronze/silver/gold, 3-5 vertical
      for (let slot = 0; slot < 6; slot++) {
        const path = doorUnitPath(slot, t.id)
        expect(aeAssetExists(path), `${t.id} slot ${slot}: ${path}`).toBe(true)
      }
    }
  })

  it('carries a cosmetic caveat only where the art is sparse', () => {
    for (const t of THEME_DEFS) expect(t.cosmeticWarning !== undefined, t.id).toBe(t.sparsePieces === true)
  })

  it('picks an environment by floor index, cycling', () => {
    const t = getTheme('prison2')!
    expect(themeEnvironment(t, 0)).toBe(t.environments[0])
    expect(themeEnvironment(t, t.environments.length)).toBe(t.environments[0])
  })

  it('reports an unknown id as undefined — validation is the gate', () => {
    expect(getTheme('a')).toBeUndefined()
    expect(getTheme('prison')?.id).toBe('prison')
  })
})

describe('generating every theme', () => {
  for (const theme of THEMES) {
    it(`${theme}: ships only real assets, and no two wall pieces share an anchor`, () => {
      const t = getTheme(theme)!
      const allowedTiles = new Set([...t.floor, ...(t.mixed ?? []), 'tilesets/__black.tileset'])
      for (const [stem, level] of levelsOf(generateTheme(theme))) {
        for (const u of level.units) expect(aeAssetExists(u.path), `${theme} ${stem}: ${u.path}`).toBe(true)
        expect(aeAssetExists(level.environment!), `${theme} ${stem}: ${level.environment}`).toBe(true)
        expect(t.environments, `${theme} ${stem}`).toContain(level.environment)

        for (const cell of level.tileCells) {
          for (const d of cell.datasets) expect(allowedTiles.has(d.tileset), `${theme} ${stem}: ${d.tileset}`).toBe(true)
        }

        // the floor's own wall pieces cover each cell once (exit art excepted,
        // it spans its doorway; vertical pieces anchor a row above their cell)
        const covered = new Map<string, string>()
        for (const u of level.units) {
          if (!u.path.startsWith(`doodads/walls/${t.walls}/`) || /\/exit_(up|dn)\.unit$/.test(u.path)) continue
          if (/__color_\d+\.unit$/.test(u.path)) continue
          for (const [x, y] of wallCells(u)) {
            const key = `${x},${y}`
            expect(covered.get(key), `${theme} ${stem}: ${u.path} on top of ${covered.get(key)} at cell ${key}`).toBeUndefined()
            covered.set(key, u.path)
          }
        }
        expect(covered.size, `${theme} ${stem}: some walls`).toBeGreaterThan(0)
      }
    }, 60_000)
  }
})

describe('determinism', () => {
  it('is reproducible for a seed, theme by theme', () => {
    for (const theme of ['prison', 'mine_granite', 'cave_crystal', 'bonus2']) {
      expect(generateTheme(theme, 77).files, theme).toEqual(generateTheme(theme, 77).files)
    }
  }, 120_000)
})
