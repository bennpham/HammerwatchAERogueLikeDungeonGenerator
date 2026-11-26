import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'
import { THEME_DEFS } from '../src/generator/config/themes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { HW2_CONTENT } from './hw2Install'
import { plainParameters } from './params'

function generate(theme: string, content = HW2_CONTENT): DungeonResult {
  const p = plainParameters()
  p.levels = 2
  p.themes = [theme, theme]
  p.levelMonsters = p.levelMonsters.slice(0, 2)
  p.lobbies = []
  p.boss = { ...p.boss, enabled: false }
  const r = generateDungeon(p, 99, content)
  expect(r.ok, r.ok ? '' : r.errors.join('; ')).toBe(true)
  return r as DungeonResult
}

describe('Hammerwatch 2 themes', () => {
  const hw2 = THEME_DEFS.filter((t) => t.source === 'hw2')

  it('are tagged, prefixed and under their source', () => {
    expect(hw2.length).toBeGreaterThan(0)
    for (const t of THEME_DEFS) {
      expect(t.id.startsWith('hw2_'), t.id).toBe(t.source === 'hw2')
    }
    for (const t of hw2) {
      expect(t.group).toBe('Hammerwatch 2')
      expect(t.walls.startsWith('hw2:'), t.walls).toBe(true)
      for (const f of [...t.floor, ...(t.mixed ?? []), ...t.environments]) {
        expect(f.startsWith('hw2/'), f).toBe(true)
        expect(aeAssetExists(f), f).toBe(true)
      }
    }
  })

  it('list the HW2 files they use, every one in the snapshot', () => {
    const r = generate('hw2_crypt')
    expect(r.customAssets).toEqual([...r.customAssets].sort())
    expect(new Set(r.customAssets).size).toBe(r.customAssets.length)
    expect(r.customAssets).toContain('hw2/doodads/walls/crypt/h_32.unit')
    expect(r.customAssets).toContain('hw2/tilesets/crypt_default.tileset')
    expect(r.customAssets.some((p) => p.startsWith('hw2/effects/env/'))).toBe(true)
    for (const p of r.customAssets) expect(aeAssetExists(p), p).toBe(true)
  })

  it('leave a stock campaign with no custom files', () => {
    expect(generate('prison').customAssets).toEqual([])
  })

  it('need Hammerwatch 2 loaded', () => {
    const p = plainParameters()
    p.themes = p.themes.map(() => 'hw2_sewer')
    const r = generateDungeon(p, 1)
    expect(r.ok).toBe(false)
  })
})
