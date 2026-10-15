// Scratch experiment: hand-placed AE wall rings around simple rooms, written as
// a .lvl so scripts/render-level.mjs can show whether the placement rules read
// like stock AE walls. Not part of the generator.
import { writeFileSync } from 'node:fs'
import { AeLevel, TileLayers, renderLevel } from '../../src/generator/ae'

const out = process.argv[2] ?? 'wall-experiment.lvl'
const theme = process.argv[3] ?? 'prison'
const level = new AeLevel(`effects/lighting/${theme}_1.env`)
const W = (piece: string) => `doodads/walls/${theme}/${piece}.unit`
const at = (piece: string, cx: number, cy: number) => level.addUnit(W(piece), cx * 16, cy * 16)

// room floor cells [fx0..fx1] x [fy0..fy1]
function room(fx0: number, fy0: number, fx1: number, fy1: number, layers: TileLayers) {
  const cells: Array<[number, number]> = []
  for (let x = fx0; x <= fx1; x++) for (let y = fy0; y <= fy1; y++) cells.push([x, y])
  layers.paint16(`tilesets/${theme}_tiles.tileset`, cells)
  // top ring
  at('crn_nw', fx0 - 1, fy0 - 1)
  at('crn_ne', fx1 + 1, fy0 - 1)
  let x = fx0
  while (x <= fx1) {
    if (x + 1 <= fx1) {
      at('h_32', x, fy0 - 1)
      x += 2
    } else {
      at('h_16', x, fy0 - 1)
      x += 1
    }
  }
  // bottom ring
  at('crn_sw', fx0 - 1, fy1 + 1)
  at('crn_se', fx1 + 1, fy1 + 1)
  x = fx0
  while (x <= fx1) {
    if (x + 1 <= fx1) {
      at('h_32', x, fy1 + 1)
      x += 2
    } else {
      at('h_16', x, fy1 + 1)
      x += 1
    }
  }
  // side columns: v_32 footprint is its anchor row +1, +2
  for (const cx of [fx0 - 1, fx1 + 1]) {
    let y = fy0 - 1
    while (y < fy1) {
      if (y + 2 <= fy1) {
        at('v_32', cx, y)
        y += 2
      } else {
        at('v_16', cx, y)
        y += 1
      }
    }
  }
}

const layers = new TileLayers((ts) => (ts.endsWith('prison_dirt.tileset') ? 32 : 16))
room(4, 4, 23, 15, layers)
room(30, 6, 39, 11, layers)
level.tileCells = layers.cells()
writeFileSync(out, renderLevel(level))
console.log(`wrote ${out}`)
