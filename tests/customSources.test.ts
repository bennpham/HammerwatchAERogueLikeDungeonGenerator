import { describe, expect, it } from 'vitest'
import { AE_ONLY, isAvailable, sourceOfId, sourceOfPath, unavailableMessage } from '../src/generator/custom/sources'
import { cliffDir, parseSetKey, wallDir } from '../src/generator/catalog/assetRoot'
import { aeAssetExists, tilesetSize } from '../src/generator/catalog/assets'
import { HW2_MUSIC, HW2_TILESET_SIZES, HW2_UNITS } from '../src/generator/catalog/hw2Assets.generated'
import { wallUnitPath } from '../src/generator/map/aeWalls'
import { coverUnitPath } from '../src/generator/map/aeCover'
import { stairArtRect } from '../src/generator/objects/doodad'
import { coastUnits } from '../src/generator/world/coast'

const HW2 = { sources: ['hw2'] as const }

describe('content sources', () => {
  it('tells custom content by its id and path prefix', () => {
    expect(sourceOfId('hw2_crypt')).toBe('hw2')
    expect(sourceOfId('prison')).toBeNull()
    expect(sourceOfId('hw2crypt')).toBeNull()
    expect(sourceOfPath('hw2/doodads/walls/crypt/h_32.unit')).toBe('hw2')
    expect(sourceOfPath('doodads/walls/prison/h_32.unit')).toBeNull()
  })

  it('makes custom content available only when its source is loaded', () => {
    expect(isAvailable('prison', AE_ONLY)).toBe(true)
    expect(isAvailable('hw2_crypt', AE_ONLY)).toBe(false)
    expect(isAvailable('hw2_crypt', HW2)).toBe(true)
    expect(unavailableMessage('hw2_crypt', HW2, 'theme')).toBeNull()
    expect(unavailableMessage('prison', AE_ONLY, 'theme')).toBeNull()
    expect(unavailableMessage('hw2_crypt', AE_ONLY, 'theme')).toBe(
      '"hw2_crypt" is Hammerwatch 2 content. Load your Hammerwatch 2 folder with Load custom, or pick another theme.'
    )
  })
})

describe('set roots', () => {
  it('keeps stock sets where they were', () => {
    expect(parseSetKey('prison')).toEqual({ source: null, name: 'prison' })
    expect(wallDir('prison')).toBe('doodads/walls/prison')
    expect(cliffDir('basalt')).toBe('doodads/cliffs/basalt')
    expect(wallUnitPath('prison', 'h_32')).toBe('doodads/walls/prison/h_32.unit')
    expect(coverUnitPath('prison', 64)).toBe('doodads/walls/prison/__color_64.unit')
  })

  it('puts a source set under its prefix', () => {
    expect(parseSetKey('hw2:crypt')).toEqual({ source: 'hw2', name: 'crypt' })
    expect(wallDir('hw2:crypt')).toBe('hw2/doodads/walls/crypt')
    expect(cliffDir('hw2:basalt')).toBe('hw2/doodads/cliffs/basalt')
    expect(wallUnitPath('hw2:crypt', 'h_32')).toBe('hw2/doodads/walls/crypt/h_32.unit')
    expect(coverUnitPath('hw2:crypt', 64)).toBe('hw2/doodads/walls/crypt/__color_64.unit')
    // an unknown prefix is not a source: the name is taken whole
    expect(parseSetKey('foo:bar')).toEqual({ source: null, name: 'foo:bar' })
  })

  it('roots cliff pieces and reads stairs under a prefix', () => {
    const land = new Uint8Array(9).fill(1)
    const units = coastUnits('hw2:basalt', 3, 3, land)
    expect(units.length).toBeGreaterThan(0)
    for (const u of units) expect(u.path.startsWith('hw2/doodads/cliffs/basalt/')).toBe(true)
    expect(stairArtRect({ path: 'hw2/doodads/walls/crypt/exit_up.unit', x: 1, y: 1 })).not.toBeNull()
    expect(stairArtRect({ path: 'hw2x/doodads/walls/crypt/exit_up.unit', x: 1, y: 1 })).toBeNull()
  })
})

describe('the Hammerwatch 2 snapshot', () => {
  it('stores paths under hw2/ only', () => {
    for (const p of HW2_UNITS) expect(p.startsWith('hw2/')).toBe(true)
    for (const p of Object.keys(HW2_TILESET_SIZES)) expect(p.startsWith('hw2/')).toBe(true)
    expect(HW2_UNITS.some((p) => p.startsWith('hw2/actors/npcs/'))).toBe(false)
    expect(HW2_MUSIC.length).toBeGreaterThan(0)
  })

  it('answers hw2/ paths from HW2 and stock paths from AE', () => {
    expect(aeAssetExists('hw2/doodads/walls/crypt/h_32.unit')).toBe(true)
    expect(aeAssetExists('hw2/tilesets/crypt_default.tileset')).toBe(true)
    expect(aeAssetExists('hw2/effects/env/crypt_boss.env')).toBe(true)
    expect(aeAssetExists('hw2/doodads/walls/crypt/no_such_piece.unit')).toBe(false)
    // an AE path under the prefix is not an HW2 path
    expect(aeAssetExists('hw2/doodads/walls/archives/h.unit')).toBe(false)
    expect(aeAssetExists('doodads/walls/prison/h_32.unit')).toBe(true)
    expect(tilesetSize('hw2/tilesets/crypt_default.tileset')).toBe(32)
    expect(tilesetSize('hw2/tilesets/crypt_default_8.tileset')).toBe(8)
  })
})
