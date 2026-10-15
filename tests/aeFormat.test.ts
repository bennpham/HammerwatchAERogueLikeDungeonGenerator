import { describe, expect, it } from 'vitest'
import {
  AeLevel,
  P,
  TileLayers,
  decodeRle,
  encodeRle,
  fmtNum,
  parseSval,
  readLevel,
  renderInfoXml,
  renderLevel,
  rleLength,
  scenarioSlug,
  svalGet
} from '../src/generator/ae'
import { HAS_AE, readStockLevel, tilesetSizeFromAssets } from './aeInstall'

describe('SVAL', () => {
  it('parses dicts, arrays, self-closing nulls and escapes', () => {
    const n = parseSval(
      '<dict>\n\t<string name="a">x &amp; y</string>\n\t<array name="b"><int>1</int><null/><bool>t</bool></array>\n</dict>'
    )
    expect(svalGet(n, 'a')?.text).toBe('x & y')
    expect(svalGet(n, 'b')?.children.map((c) => c.tag)).toEqual(['int', 'null', 'bool'])
  })

  it('formats numbers like the AE editor', () => {
    expect(fmtNum(3)).toBe('3')
    expect(fmtNum(-0.0001)).toBe('0')
    expect(fmtNum(1.5)).toBe('1.5')
    expect(fmtNum(2.123456)).toBe('2.123')
  })
})

describe('tile RLE', () => {
  it('round-trips and caps runs at 126', () => {
    const grid = Array.from({ length: 1024 }, (_, i) => i % 300 < 200)
    const hex = encodeRle(grid)
    expect(decodeRle(hex, 32)).toEqual(grid)
    expect(rleLength(hex)).toBe(1024)
    for (let i = 0; i < hex.length; i += 2) {
      const b = Number.parseInt(hex.slice(i, i + 2), 16)
      expect(b === 0x80 || b === 0).toBe(false)
    }
  })

  it('a fully painted 16-px chunk encodes as AE writes it', () => {
    // 1024 cells = 8 runs of 126 + one of 16
    expect(encodeRle(new Array(1024).fill(true))).toBe('7e'.repeat(8) + '10')
  })

  it('TileLayers puts cells on the 512 grid with centre positions', () => {
    const layers = new TileLayers(() => 16)
    layers.paint16('tilesets/prison_tiles.tileset', [
      [0, 0],
      [20, 20]
    ])
    const cells = layers.cells()
    for (const c of cells) {
      expect(Math.abs(c.x % 512)).toBe(0)
      expect(Math.abs(c.y % 512)).toBe(0)
      expect(rleLength(c.datasets[0].rle)).toBe(1024)
    }
  })
})

describe('level writer', () => {
  it('writes the editor layout and reads back the same scripts', () => {
    const level = new AeLevel('effects/lighting/prison_1.env')
    const sensor = level.addRectSensor(100, 50, 32, 64)
    const use = level.addScript('UseTrigger', 0, 0, [P.int('Icon', 6), P.ids('Areas', [sensor.id])], {
      label: 'Exit'
    })
    const all = level.addScript('AllPlayersArea', 0, 0, [P.bool('OnlyAlivePlayers', false)])
    level.link(use, all)
    level.addUnit('doodads/walls/prison/h_32.unit', 32, 16)
    const text = renderLevel(level)
    expect(text.startsWith('<dict>\n\t<dict name="game-mode">')).toBe(true)
    const back = readLevel(text).level
    expect(back.scripts.map((s) => s.cls)).toEqual(['UseTrigger', 'AllPlayersArea'])
    expect(back.scripts[0].connections).toEqual([[all.id, 0]])
    expect(back.scripts[0].label).toBe('Exit')
    expect(back.units.find((u) => u.path === ':Physics_Rectangle')?.state?.size).toEqual({
      kind: 'vec2',
      value: [32, 64]
    })
  })
})

describe('info.xml', () => {
  it('names the start level and lists the stock modifiers', () => {
    const xml = renderInfoXml({ name: 'Dungeon #1', description: '', startLevel: 'levels/d/floor_1.lvl' })
    expect(xml).toContain('<level name="Start level" lvl="levels/d/floor_1.lvl" />')
    expect(xml).toContain('id="LINE_OF_SIGHT"')
    expect(scenarioSlug('Dungeon #42!')).toBe('dungeon_42')
  })

  it('always plays with 0 lives: NO_LIVES forced on, nothing that gives lives back', () => {
    const xml = renderInfoXml({ name: 'Dungeon #1', description: '', startLevel: 'levels/d/floor_1.lvl' })
    expect(xml).toContain('<modifier name=".l.nolives" id="NO_LIVES" forced="true" />')
    expect(xml).not.toContain('INFINITE_LIVES')
    expect(xml).not.toContain('DOUBLE_LIVES')
  })
})

describe.skipIf(!HAS_AE)('stock AE levels', () => {
  it('Castle level_1 reads, every dataset sums to its grid, and re-renders to a re-readable level', () => {
    const text = readStockLevel('castle_hammerwatch/levels/level_1.lvl')
    const { level } = readLevel(text)
    expect(level.scripts.length).toBeGreaterThan(100)
    for (const cell of level.tileCells) {
      expect(Math.abs(cell.x % 512)).toBe(0)
      expect(Math.abs(cell.y % 512)).toBe(0)
      for (const ds of cell.datasets) {
        const side = 512 / tilesetSizeFromAssets(ds.tileset)
        expect(rleLength(ds.rle)).toBe(side * side)
      }
    }
    const again = readLevel(renderLevel(level)).level
    expect(again.units.length).toBe(level.units.length)
    expect(again.scripts.length).toBe(level.scripts.length)
    expect(again.scripts.map((s) => s.cls)).toEqual(level.scripts.map((s) => s.cls))
  })

  it('Castle exits are press-to-use: UseTrigger(Icon 6) -> AllPlayersArea -> LevelExit', () => {
    const { level } = readLevel(readStockLevel('castle_hammerwatch/levels/level_1.lvl'))
    const allPlayers = level.scripts.filter((s) => s.cls === 'AllPlayersArea')
    expect(allPlayers.length).toBeGreaterThan(0)
    for (const ap of allPlayers) {
      const user = level.scripts.find((s) => s.cls === 'UseTrigger' && s.connections.some(([t]) => t === ap.id))
      expect(user?.params.find((p) => p.name === 'Icon')).toEqual({ kind: 'int', name: 'Icon', value: 6 })
      const onTrue = ap.params.find((p) => p.name === 'OnTrue')
      expect(onTrue?.kind).toBe('ids')
      const targets = (onTrue?.value as number[]).map((id) => level.scriptById(id)?.cls)
      expect(targets).toContain('LevelExit')
    }
  })
})
