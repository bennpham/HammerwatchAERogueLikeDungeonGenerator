// Scratch: run the real wall placer (src/generator/map/aeWalls.ts) over a
// hand-drawn grid and write a .lvl for scripts/render-level.mjs.
//   node scripts/run-ts.mjs scripts/dev/wall-test.ts out.lvl [theme]
import { writeFileSync } from 'node:fs'
import { AeLevel, TileLayers, renderLevel } from '../../src/generator/ae'
import { isLineCell, placeWalls } from '../../src/generator/map/aeWalls'
import { getTheme } from '../../src/generator/config/themes'
import { AE_TILESET_SIZES, AE_UNITS } from '../../src/generator/catalog/aeAssets.generated'

const out = process.argv[2] ?? 'wall-test.lvl'
const theme = getTheme(process.argv[3] ?? 'prison')!
// '.' floor, '#' solid, 'D' doorway (reserved wall line, walkable), 'X' solid under exit art
const map = [
  '##########################################',
  '##########XXXX############################',
  '##########DDDD############################',
  '###...................######################',
  '###...................######################',
  '###.....##............#########.......####',
  '###.....##............#########.......####',
  '###...................#########.......####',
  '###...................................####',
  '###...................................####',
  '###...................#########.......####',
  '#########..############################',
  '#########..############################',
  '#########..#####...........############',
  '#########......................########',
  '#########......................########',
  '################...........############',
  '##########################################'
]
const H = map.length
const Wd = Math.max(...map.map((r) => r.length))
const at = (x: number, y: number) => (y >= 0 && y < H && x >= 0 ? (map[y][x] ?? '#') : '#')
const units = new Set(AE_UNITS)
const level = new AeLevel(theme.environments[0])
const walls = placeWalls(
  {
    width: Wd,
    height: H,
    solid: (x, y) => at(x, y) !== '.',
    reserved: (x, y) => at(x, y) === 'D'
  },
  theme,
  (p) => units.has(p),
  (piece, x, y) => console.warn(`missing ${piece} at ${x},${y}`)
)
for (const w of walls) level.addUnit(w.path, w.x, w.y)
// the exit art over the doorway: anchor = left doorway cell
for (let y = 0; y < H; y++) {
  const x = map[y].indexOf('DDDD')
  if (x >= 0) level.addUnit(`doodads/walls/${theme.exitDnSet}/exit_dn.unit`, x * 16, y * 16)
}
const layers = new TileLayers((ts) => AE_TILESET_SIZES[ts] ?? 16)
const floor: Array<[number, number]> = []
for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) if (at(x, y) === '.' || at(x, y) === 'D') floor.push([x, y])
layers.paint16(theme.floor[0], floor, [1, 1, 1, 1])
for (const ts of theme.floor.slice(1)) layers.paint16(ts, floor)
// __black (layer -79) draws above every floor tileset: mask coarse-tile spill outside the wall line
const solidOff: Array<[number, number]> = []
for (let y = -2; y < H + 2; y++) for (let x = -2; x < Wd + 2; x++) if (at(x, y) !== '.' && at(x, y) !== 'D' && !isLineCell({ width: Wd, height: H, solid: (a, b) => at(a, b) !== '.', reserved: (a, b) => at(a, b) === 'D' }, x, y)) solidOff.push([x, y])
layers.paint16('tilesets/__black.tileset', solidOff)
level.tileCells = layers.cells()
writeFileSync(out, renderLevel(level))
console.log(`wrote ${out}: ${walls.length} wall units`)
