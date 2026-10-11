// One-off: turn the user's AE editor lobby into an OG Hammerwatch (HW1) editor
// level, for the HW1 remake. Keeps the AE layout's walkable floor, rebuilds
// walls and tiles with the remake's own HW1 code (theme c, the library), and
// carries over only what has an HW1 counterpart: the spawn, the five skill and
// power vendors, the exit portal and the torches. Everything else is listed in
// a sidecar text file so it can be placed by hand in the HW1 editor.
//
//   node scripts/run-ts.mjs scripts/dev/hw1-lobby-from-ae.ts <ae lobby.lvl> <hw1 out.xml>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readLevel } from '../../src/generator/ae/levelReader'
import type { AeUnit } from '../../src/generator/ae/model'
import { CELL, decodeRle } from '../../src/generator/ae/tiles'
import { tilesetSize } from '../../src/generator/catalog/assets'
import { GenerationContext } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/core/context'
import { defaultParameters } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/config/parameters'
import { Tile } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/map/tile'
import { searchPatterns } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/map/wallPattern'
import { Doodad } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/objects/doodad'
import {
  NodeLevelExit,
  NodeLevelStart,
  NodeRectangleShape,
  NodeShopArea
} from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/objects/nodes'
import { getTheme } from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/config/themes'
import {
  XMLArray,
  XMLBool,
  XMLDictionary,
  XMLFloat,
  XMLInt,
  XMLIntArray,
  XMLObject,
  XMLString
} from '../../../HammerwatchRogueLikeDungeonGeneratorRemake/src/generator/xml'

const [src, out] = process.argv.slice(2)
if (src === undefined || out === undefined) throw new Error('usage: hw1-lobby-from-ae.ts <ae lobby.lvl> <hw1 out.xml>')

const THEME = 'c'
const TILE = 16
const BLOCK = 20
const { level } = readLevel(readFileSync(src, 'utf8'))

// --- the walkable floor: flood from the spawn through everything but walls ----
const cellOf = (u: { x: number; y: number }) => [Math.floor(u.x / TILE), Math.floor(u.y / TILE)] as const
function wallCells(u: AeUnit): Array<readonly [number, number]> {
  const [x, y] = cellOf(u)
  const piece = /\/([a-z0-9_]+)\.unit$/.exec(u.path)?.[1] ?? ''
  if (piece === 'v_16' || piece === 'cap_n' || piece === 'cap_s') return [[x, y + 1]]
  if (piece === 'v_32' || piece === 'v') return [[x, y + 1], [x, y + 2]]
  if (piece === 'h_32' || piece === 'h' || /_32$/.test(piece)) return [[x, y], [x + 1, y]]
  return [[x, y]]
}
const solid = new Set<string>()
for (const u of level.units) if (u.path.startsWith('doodads/walls/')) for (const [x, y] of wallCells(u)) solid.add(`${x},${y}`)

// floor only where the author painted tiles (the yard outside has no walls,
// just the edge of the painted ground)
const painted = new Set<string>()
for (const cell of level.tileCells) {
  for (const d of cell.datasets) {
    if (d.tileset.endsWith('__black.tileset')) continue
    const size = tilesetSize(d.tileset)
    const side = CELL / size
    decodeRle(d.rle, side).forEach((on, i) => {
      if (!on) return
      const px = cell.x - CELL / 2 + (i % side) * size
      const py = cell.y - CELL / 2 + Math.trunc(i / side) * size
      painted.add(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`)
    })
  }
}

const spawn = level.scripts.find((s) => s.cls === 'LevelStart' && !s.params.some((p) => p.name === 'StartID'))
if (spawn === undefined) throw new Error('no StartID-less LevelStart in the AE lobby')
const [sx, sy] = cellOf(spawn)
const floor = new Set<string>([`${sx},${sy}`])
const queue: Array<[number, number]> = [[sx, sy]]
for (let head = 0; head < queue.length; head++) {
  const [x, y] = queue[head]
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const key = `${x + dx},${y + dy}`
    if (floor.has(key) || solid.has(key) || !painted.has(key) || Math.abs(x + dx - sx) > 120 || Math.abs(y + dy - sy) > 120) continue
    floor.add(key)
    queue.push([x + dx, y + dy])
  }
}
if (floor.size > 20000) throw new Error(`the floor leaked out of the building (${floor.size} cells)`)

const cells = [...floor].map((k) => k.split(',').map(Number))
const MARGIN = 3
const minX = Math.min(...cells.map((c) => c[0])) - MARGIN
const minY = Math.min(...cells.map((c) => c[1])) - MARGIN
const width = Math.max(...cells.map((c) => c[0])) - minX + MARGIN + 1
const height = Math.max(...cells.map((c) => c[1])) - minY + MARGIN + 1
const local = (x: number, y: number) => ({ x: x - minX, y: y - minY })

// --- HW1 grid, walls, tiles -------------------------------------------------------
const ctx = new GenerationContext(defaultParameters(), 1)
const tiles: Tile[] = Array.from({ length: width * height }, (_, i) => {
  const x = (i % width) + minX
  const y = Math.trunc(i / width) + minY
  return new Tile(!floor.has(`${x},${y}`))
})
const theme = getTheme(THEME)!
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const wall = searchPatterns(x, y, tiles, width, true)
    if (wall !== null) Doodad.create(ctx, x, y, wall, THEME)
    if (theme.omitCover === true) continue
    const cover = searchPatterns(x, y, tiles, width, false)
    if (cover !== null) Doodad.create(ctx, x, y, cover, THEME)
  }
}

// --- the objects that map ---------------------------------------------------------
const placed: string[] = []
const dropped = new Map<string, Array<{ x: number; y: number }>>()
const drop = (path: string, x: number, y: number) => {
  const at = local(x, y)
  dropped.set(path, [...(dropped.get(path) ?? []), at])
}

const start = local(sx, sy)
new NodeLevelStart(ctx, start.x, start.y)
placed.push(`spawn at ${start.x},${start.y}`)

/** A doodad at an explicit HW1 path (for art the remake has no type for). */
class RawDoodad extends XMLObject {
  id: number
  constructor(public path: string, public x: number, public y: number) {
    super()
    this.id = ctx.idCounter++
    ctx.doodads.push(this as unknown as Doodad)
  }
  getXML(): string {
    const d = new XMLDictionary('')
    d.addData(new XMLInt('id', this.id))
    d.addData(new XMLString('type', this.path))
    d.addData(new XMLFloat('x', this.x))
    d.addData(new XMLFloat('y', this.y))
    d.addData(new XMLBool('need-sync', false))
    return d.getXML()
  }
}

const VENDOR_ART: Record<string, string> = {
  combo: 'doodads/special/vendor_combo.xml',
  off: 'doodads/special/vendor_offense.xml',
  def: 'doodads/special/vendor_defense.xml',
  misc: 'doodads/special/vendor_misc.xml',
  power: 'doodads/special/vendor_power.xml'
}
const stands = level.units.filter((u) => /^doodads\/generic\/shop_[a-z]+\.unit$/.test(u.path))
const usedStands = new Set<AeUnit>()
for (const shop of level.scripts.filter((s) => s.cls === 'ShopArea')) {
  const cats = (shop.params.find((p) => p.name === 'Categories')?.value as string | undefined) ?? ''
  const key = cats === 'power' ? 'power' : (/^(combo|off|def|misc)/.exec(cats)?.[1] ?? '')
  const use = shop.params.find((p) => p.name === '#PlayerTarget')
  const trigger = use?.kind === 'target' ? level.scripts.find((s) => s.id === use.value[0]) : undefined
  const at = trigger ?? shop
  const stand = stands.reduce<AeUnit | undefined>((best, u) => {
    const d = (u.x - at.x) ** 2 + (u.y - at.y) ** 2
    return best === undefined || d < (best.x - at.x) ** 2 + (best.y - at.y) ** 2 ? u : best
  }, undefined)
  if (stand === undefined) continue
  usedStands.add(stand)
  const [cx, cy] = cellOf(stand)
  if (VENDOR_ART[key] === undefined) {
    drop(`${stand.path} (ShopArea "${cats}" — no HW1 vendor sells this)`, cx, cy)
    continue
  }
  const p = local(cx, cy)
  const area = new NodeRectangleShape(ctx, p.x + 0.5, p.y + 0.5)
  area.width = 2
  area.height = 2
  const node = new NodeShopArea(ctx, p.x + 0.5, p.y + 1.5)
  ;(node as unknown as { shopType: { categories: string; vendor: string } }).shopType = { categories: cats, vendor: 'VendorMisc' }
  node.connectToShape(area)
  new RawDoodad(VENDOR_ART[key], p.x, p.y)
  placed.push(`${key} vendor (${cats}) at ${p.x},${p.y}`)
}

const portal = level.units.find((u) => u.path.startsWith('doodads/generic/teleport'))
if (portal !== undefined) {
  const [cx, cy] = cellOf(portal)
  const p = local(cx, cy)
  const area = new NodeRectangleShape(ctx, p.x, p.y)
  area.width = 3
  area.height = 3
  const exit = new NodeLevelExit(ctx, p.x, p.y + 2)
  exit.level = '1'
  exit.connectToShape(area)
  Doodad.create(ctx, p.x, p.y, 'LobbyPortal', THEME)
  placed.push(`exit portal at ${p.x},${p.y} (LevelExitArea -> level "1": point it at your next level)`)
}

for (const u of level.units) {
  if (u.path.startsWith('doodads/walls/') || u.path.startsWith(':') || usedStands.has(u) || u === portal) continue
  const [cx, cy] = cellOf(u)
  if (!floor.has(`${cx},${cy}`) && !floor.has(`${cx},${cy + 1}`)) continue // outside the building
  if (u.path === 'doodads/generic/lamp_torch.unit') {
    const p = local(cx, cy)
    Doodad.create(ctx, p.x, p.y - 1, 'Torch', THEME)
    continue
  }
  drop(u.path, cx, cy)
}

// --- write the HW1 level ------------------------------------------------------------
const tiledata = new XMLArray('tiledata')
for (let bx = 0; bx <= Math.ceil(width / BLOCK); bx++) {
  for (let by = 0; by <= Math.ceil(height / BLOCK); by++) {
    const dataT: number[] = []
    for (let i = 0; i < BLOCK * BLOCK; i++) {
      const x = bx * BLOCK - 10 + (i % BLOCK)
      const y = by * BLOCK - 10 + Math.trunc(i / BLOCK)
      const open = x >= 0 && y >= 0 && x < width && y < height && !tiles[x + y * width].wall
      dataT.push(open ? Math.trunc(ctx.cosmeticRand.nextFloat() * theme.tiles) + 1 : 0)
    }
    const full = () => new Array<number>(BLOCK * BLOCK).fill(255)
    const set = new XMLDictionary('')
    set.addData(new XMLString('tileset', theme.tilemap))
    set.addData(new XMLIntArray('data-t', dataT))
    for (const c of ['data-r', 'data-g', 'data-b', 'data-a']) set.addData(new XMLIntArray(c, full()))
    const sets = new XMLArray('datasets')
    sets.addData(set)
    const block = new XMLDictionary('')
    block.addData(new XMLInt('x', bx * BLOCK))
    block.addData(new XMLInt('y', by * BLOCK))
    block.addData(sets)
    tiledata.addData(block)
  }
}
const section = (name: string, arrayName: string, items: XMLObject[]) => {
  const arr = new XMLArray(arrayName)
  for (const it of items) arr.addData(it)
  const d = new XMLDictionary(name)
  d.addData(arr)
  return d
}
const color = (name: string, v: number) => {
  const d = new XMLDictionary(name)
  for (const c of ['r', 'g', 'b']) d.addData(new XMLInt(c, v))
  d.addData(new XMLInt('a', name === 'ambient-color' ? 255 : 128))
  return d
}
const tilemap = new XMLDictionary('tilemap')
tilemap.addData(tiledata)
const lighting = new XMLDictionary('lighting')
lighting.addData(new XMLArray('lights'))
lighting.addData(color('ambient-color', 255))
lighting.addData(color('shadow-color', 128))
const root = new XMLDictionary('')
root.addData(tilemap)
root.addData(section('doodads', 'doodads', ctx.doodads))
root.addData(section('actors', 'actors', []))
root.addData(section('scripting', 'nodes', ctx.scriptNodes))
root.addData(section('items', 'items', []))
root.addData(lighting)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, root.getXML())

const notes = [
  `HW1 lobby converted from ${src}`,
  `map ${width} x ${height} tiles, theme ${THEME} (library). AE tile (x, y) = HW1 (x - ${minX}, y - ${minY}) here.`,
  '',
  'Placed:',
  ...placed.map((p) => `  ${p}`),
  '',
  'Not mapped — place an HW1 equivalent by hand if you want it (HW1 tile positions):',
  ...[...dropped].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, at]) => `  ${at.length} x ${path}: ${at.slice(0, 8).map((p) => `${p.x},${p.y}`).join(' ')}${at.length > 8 ? ' …' : ''}`),
  '',
  'Doors were left as open doorways (HW1 has no plain doors). The AE item vendor has no HW1 counterpart.'
]
writeFileSync(out.replace(/\.xml$/, '_unmapped.txt'), notes.join('\n') + '\n')
console.log(notes.join('\n'))
