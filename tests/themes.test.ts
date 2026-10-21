/**
 * The AE theme registry, and what generating each theme actually emits:
 * every asset path exists in the install, every wall line gets a piece, and
 * no two wall pieces stand on the same anchor (the bleeding/overlapping walls
 * the hw2ae piratecove port shows).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { THEMES, THEME_DEFS, THEME_GROUPS, getTheme, themeEnvironment } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { doorUnitPath } from '../src/generator/objects/item'
import { resolvePiece, wallUnitPath } from '../src/generator/map/aeWalls'
import { exitDoorway, exitIsPad, resolveDoodad } from '../src/generator/objects/doodad'
import { isWallPiece, levelsOf } from './ae'
import { aeAssetsDir } from './aeInstall'
import { wallCells } from './sealProbe'
import { plainParameters } from './params'

/** The wall pieces every set must be able to resolve (directly or by fallback). */
const REQUIRED_PIECES = ['h_16', 'v_16', 'crn_nw', 'crn_ne', 'crn_sw', 'crn_se', 'x_n', 'x_s', 'x_e', 'x_w', 'x_x', 'cap_h_w', 'cap_h_e', 'cap_v_n', 'cap_v_s']

function generateTheme(theme: string, seed = 4242, tweak?: (p: ReturnType<typeof plainParameters>) => void): DungeonResult {
  const params = plainParameters()
  params.levels = 2
  params.themes = [theme, theme]
  params.levelMonsters = params.levelMonsters.slice(0, 2)
  params.lobbies = []
  params.boss = { ...params.boss, enabled: false }
  tweak?.(params)
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
      for (const type of ['ExitUp', 'ExitDn'] as const) {
        const r = resolveDoodad(type, t.id)
        expect(aeAssetExists(r.path), `${t.id}: ${r.path}`).toBe(true)
      }
    }
  })

  it('gives the bonus sets their own floor pads, as stock bonus levels have, not borrowed stairs', () => {
    for (const t of THEME_DEFS.filter((d) => d.group === 'Bonus')) {
      expect(resolveDoodad('ExitUp', t.id).path, t.id).toBe('doodads/special/bonus_entrance.unit')
      expect(resolveDoodad('ExitDn', t.id).path, t.id).toBe('doodads/special/bonus_exit.unit')
      expect(exitDoorway('ExitDn', t.id).cells, t.id).toBe(0)
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

    it(`${theme}: leaves no gap in the wall beside either stairs`, () => {
      for (const [stem, level] of levelsOf(generateTheme(theme))) {
        const walled = new Set<string>()
        for (const u of level.units) {
          if (isWallPiece(u.path) && !/\/exit_(up|dn)\.unit$/.test(u.path)) {
            for (const [x, y] of wallCells(u)) walled.add(`${x},${y}`)
          }
        }
        if (exitIsPad(theme)) {
          // pads on the floor, no doorway: the wall-coverage sweep proves the wall whole
          expect(level.units.some((u) => u.path === 'doodads/special/bonus_entrance.unit'), `${theme} ${stem}: entrance pad`).toBe(true)
          expect(level.units.some((u) => /\/exit_(up|dn)\.unit$/.test(u.path)), `${theme} ${stem}: no stairs`).toBe(false)
          continue
        }
        const stairs = level.units.filter((u) => /\/exit_(up|dn)\.unit$/.test(u.path))
        expect(stairs.length, `${theme} ${stem}: stairs`).toBeGreaterThan(0)
        for (const u of stairs) {
          const type = u.path.endsWith('exit_up.unit') ? 'ExitUp' : 'ExitDn'
          const ax = Math.round(u.x / 16) - resolveDoodad(type, theme).dx
          const y = Math.round(u.y / 16)
          const door = exitDoorway(type, theme)
          for (const x of [ax + door.from - 1, ax + door.from + door.cells]) {
            expect(walled.has(`${x},${y}`), `${theme} ${stem}: ${u.path} leaves cell ${x},${y} open`).toBe(true)
          }
        }
      }
    }, 60_000)
  }
})

/**
 * A unit's solid collision rects (sensors left out), px from its anchor, as
 * [x0, y0, x1, y1] with a negative size normalised, following `include`s.
 */
const rectCache = new Map<string, Array<[number, number, number, number]>>()
function collisionRects(rel: string): Array<[number, number, number, number]> {
  const cached = rectCache.get(rel)
  if (cached !== undefined) return cached
  const text = readFileSync(join(aeAssetsDir()!, rel), 'utf8')
  const out: Array<[number, number, number, number]> = []
  // an include inside a `%if` branch the game never takes may name no file
  // quoted (`%include "a.inc"`) or bare (`%include a.inc`), both as AE writes them
  for (const inc of text.matchAll(/include\s+"?([^"\s]+)"?/g)) {
    if (existsSync(join(aeAssetsDir()!, inc[1]))) out.push(...collisionRects(inc[1]))
  }
  for (const block of text.matchAll(/<collision[^>]*>([\s\S]*?)<\/collision>/g)) {
    for (const r of block[1].matchAll(/<rect([^>]*)>([^<]*)<\/rect>/g)) {
      if (/sensor="true"/.test(r[1])) continue
      const [x, y, w, h] = r[2].trim().split(/\s+/).map(Number)
      out.push([Math.min(x, x + w), Math.min(y, y + h), Math.max(x, x + w), Math.max(y, y + h)])
    }
  }
  rectCache.set(rel, out)
  return out
}

/** The cells whose centre a unit's real collision covers. */
function coveredCells(units: ReadonlyArray<{ path: string; x: number; y: number }>): Set<string> {
  const out = new Set<string>()
  for (const u of units) {
    for (const [x0, y0, x1, y1] of collisionRects(u.path)) {
      for (let cy = Math.floor((u.y + y0) / 16) - 1; cy <= Math.ceil((u.y + y1) / 16); cy++) {
        for (let cx = Math.floor((u.x + x0) / 16) - 1; cx <= Math.ceil((u.x + x1) / 16); cx++) {
          const px = cx * 16 + 8
          const py = cy * 16 + 8
          if (px >= u.x + x0 && px < u.x + x1 && py >= u.y + y0 && py < u.y + y1) out.add(`${cx},${cy}`)
        }
      }
    }
  }
  return out
}

describe.skipIf(aeAssetsDir() === null)('stair art', () => {
  /** The x-span, in px from the anchor, of a unit's first collision rect. */
  function collisionSpan(rel: string): [number, number] {
    const rects = collisionRects(rel)
    expect(rects.length, `${rel}: collision rect`).toBeGreaterThan(0)
    return [rects[0][0], rects[0][2]]
  }

  it('closes exactly the doorway cells the generator leaves open, in every theme', () => {
    for (const t of THEME_DEFS) {
      for (const type of ['ExitUp', 'ExitDn'] as const) {
        const r = resolveDoodad(type, t.id)
        if (exitIsPad(t.id)) {
          // a floor pad: nothing to walk into, no doorway to close
          expect(collisionRects(r.path), `${t.id} ${r.path}`).toEqual([])
          expect(exitDoorway(type, t.id).cells).toBe(0)
          continue
        }
        const [x0, x1] = collisionSpan(r.path)
        const door = exitDoorway(type, t.id)
        expect([r.dx + x0 / 16, r.dx + x1 / 16], `${t.id} ${r.path}`).toEqual([door.from, door.from + door.cells])
      }
    }
  })
})

describe('determinism', () => {
  it('is reproducible for a seed, theme by theme', () => {
    for (const theme of ['prison', 'mine_granite', 'cave_crystal', 'bonus2']) {
      expect(generateTheme(theme, 77).files, theme).toEqual(generateTheme(theme, 77).files)
    }
  }, 120_000)
})

describe.skipIf(aeAssetsDir() === null)('walls hold, by the game\'s own collision', () => {
  // Every solid cell beside the floor (orthogonally: a diagonal squeeze
  // between two blocked cells is no way through) has a wall unit whose real
  // collision rect, read from the install, covers the cell's centre. This is
  // the "can't walk off the map" guarantee for every set, independent of the
  // generator's own idea of where each piece reaches.
  for (const theme of THEMES) {
    it(`${theme}: no hole in any wall`, () => {
      const result = generateTheme(theme)
      const files = levelsOf(result)
      result.levels.forEach((preview, i) => {
        const level = files.get(`floor${i}`)!
        const { mapWidth: w, mapHeight: h, walls } = preview
        const blocked = coveredCells(level.units.filter((u) => isWallPiece(u.path)))
        const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || walls[x + y * w] === '1'
        const holes: string[] = []
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (solid(x, y)) continue
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
              if (solid(nx, ny) && !blocked.has(`${nx},${ny}`)) holes.push(`${nx},${ny}`)
            }
          }
        }
        expect([...new Set(holes)].slice(0, 10), `${theme} floor${i}: open wall cells`).toEqual([])
      })
    }, 60_000)
  }
})

describe.skipIf(aeAssetsDir() === null)("locked doors hold, by the game's own collision", () => {
  // Each DoorController's doors must close one straight, unbroken line of
  // cells, walled (or solid rock) at both ends, so there is no squeezing past
  // a locked door. Every floor rolls its locks, on every theme.
  for (const theme of THEMES) {
    it(`${theme}: every locked door closes its passage`, () => {
      const result = generateTheme(theme, 4242, (p) => {
        p.lockChance = 1
      })
      const files = levelsOf(result)
      let checked = 0
      result.levels.forEach((preview, i) => {
        const level = files.get(`floor${i}`)!
        const { mapWidth: w, mapHeight: h, walls } = preview
        const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || walls[x + y * w] === '1'
        const walled = coveredCells(level.units.filter((u) => isWallPiece(u.path)))
        const shut = (x: number, y: number) => solid(x, y) || walled.has(`${x},${y}`)
        for (const controller of level.scripts.filter((s) => s.cls === 'DoorController')) {
          const ids = controller.params.find((p) => p.name === 'Doors')
          const doors = level.units.filter((u) => ids?.kind === 'ids' && ids.value.includes(u.id))
          expect(doors.length, `${theme} floor${i}: controller ${controller.id} doors`).toBeGreaterThan(0)
          const cells = [...coveredCells(doors)].map((k) => k.split(',').map(Number) as [number, number])
          const label = `${theme} floor${i}: ${doors[0].path} x${doors.length}`
          expect(cells.length, label).toBeGreaterThan(0)
          const row = cells.every(([, y]) => y === cells[0][1])
          const col = cells.every(([x]) => x === cells[0][0])
          expect(row || col, `${label}: one straight line`).toBe(true)
          const along = cells.map(([x, y]) => (row ? x : y)).sort((a, b) => a - b)
          along.forEach((v, k) => expect(v, `${label}: unbroken`).toBe(along[0] + k))
          const [ex, ey] = cells[0]
          const before: [number, number] = row ? [along[0] - 1, ey] : [ex, along[0] - 1]
          const after: [number, number] = row ? [along.at(-1)! + 1, ey] : [ex, along.at(-1)! + 1]
          expect(shut(...before), `${label}: open at ${before}`).toBe(true)
          expect(shut(...after), `${label}: open at ${after}`).toBe(true)
          checked++
        }
      })
      expect(checked, `${theme}: some locked doors`).toBeGreaterThan(0)
    }, 60_000)
  }
})
