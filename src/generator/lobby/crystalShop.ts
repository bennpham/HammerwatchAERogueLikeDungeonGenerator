/**
 * The survival campaign's crystal mines shop (`survival.h1c`,
 * `levels/crystal_mines_shops.lvl`, decoded by scripts/lib/h1c.ts) as a lobby,
 * rebuilt round a red bonus room, after the HW1 remake's `sky-shop` room.
 *
 * In AE the shop is a hub island (`walls/cave_crystal/special_cliff`, a
 * 60×60 top over a cliff face) with one glass walkway (`glasswalk`, 16-px
 * pieces, no collision) leaving each side, out to the stall islands and the
 * teleporter's, all over black void. The void is walkable (collision comes
 * from units alone), so stock fences everything but the island tops and the
 * glass with invisible `:Physics_Freeform` polygons.
 *
 * - **kept:** the arrival, the five in-level stalls (each `ShopArea`, the
 *   `UseTrigger` it names and that trigger's area), the teleporter, the glass,
 *   the islands and everything on them;
 * - **dropped:** the press-F exit rig and its "gather your party" text (the
 *   lobby builder lays its own exit on the teleporter), the arrival's
 *   `marker_spawn`, and every stock fence;
 * - **the item stall:** stock places it as `prefabs/shop_item.pfb`, which
 *   the builder can't rewrite, so it is laid in-level as the prefab has it: the
 *   `shop_item` stand, a sensor circle (r 25), and an equipment `ShopArea`
 *   with the `UseTrigger` it names;
 * - **the red room** replaces the hub island: a 12×12 `bonus_5` floor in a
 *   ring of `bonus5` walls (corners, straight 16-px pieces and a cap either
 *   side of each doorway), a two-tile doorway centred in each side with floor
 *   laid in its notch in the ring, the arrival at the centre on a 2×2 of
 *   `bonus_teleport` pads. The `__black` tiles under the red floor go: they
 *   draw above it (layer -79 against -145);
 * - **the branches:** each walkway moves as one rigid piece with the islands it
 *   reaches and everything on them, so that the edge of glass that touched the
 *   hub meets the doorway on its side. Every offset follows from the geometry;
 * - **the fences:** stock's polygons are shared between walkways (one fills a
 *   whole quadrant between two of them), so they can't move with a branch.
 *   They are laid afresh as invisible solid rectangles round what the party may
 *   walk on: the room, the moved glass, and each island's open top, read from
 *   the stock polygons where it stood. That also closes the 8 px of void either
 *   side of the 16-px glass in a 32-px doorway;
 * - **payout:** fixed spots in the room (`CRYSTAL_SHOP_PAYOUT`).
 *
 * The import fails rather than guess: an arrival not on an island, a side
 * with no walkway or two, walkways that meet, an island two walkways reach or
 * none does, a unit on neither an island nor a walkway, glass that doesn't fit
 * its doorway, glass or a stall stock fences in, a moved island over the room
 * or another island, or a payout spot off the red floor or on a pad. Whether
 * the result is closed is the importer's closure check (tests/closure.ts).
 *
 * Every rule goes by path, class or geometry, never by a stock id.
 */
import type { AeLevel, AeScript, AeUnit, StateValue } from '../ae/model'
import { P } from '../ae/model'
import { CELL, TileLayers, decodeRle, encodeRle, rleLength } from '../ae/tiles'
import { aeAssetExists, tilesetSize } from '../catalog/assets'
import { resolvePiece } from '../map/aeWalls'
import { windingNumber } from '../map/polygonCells'
import type { Point } from '../map/polygonCells'
import type { Box } from './castleBridge'
import { DIAMOND_UNIT, UPGRADE_KINDS, upgradeItemPath, upgradeRows } from './payout'
import type { TownPayout } from './payout'
import { VENDOR_STAND, vendorIdOfShopArea } from './shops'

const ISLAND = 'doodads/walls/cave_crystal/special_cliff.unit'
const GLASS = 'doodads/generic/glasswalk.unit'
const PORTAL = 'doodads/generic/teleport_mt.unit'
const SPAWN_MARK = 'doodads/generic/marker_spawn.unit'
const ITEM_PREFAB = 'prefabs/shop_item.pfb'
const ITEM_STAND = 'doodads/generic/shop_item.unit'
const PAD = 'doodads/special/bonus_teleport.unit'
const FLOOR = 'tilesets/bonus_5.tileset'
const BLACK = 'tilesets/__black.tileset'
const WALLS = 'bonus5'

const TILE = 16
/** An island's top: 60×60 round its anchor (the sprite's origin is `30 30`). */
const ISLAND_HALF = 30
const GLASS_HALF = 8
/** How far glass may stand off an island top and still lead onto it (stock: 2 px). */
const TOUCH = 8
/** The room's floor runs -6..5 tiles round the hub, its wall ring one tile further out. */
const FLOOR_HALF = 6
const RING = FLOOR_HALF + 1
/** The two doorway cells in each side, along the side, round the centre line. */
const DOOR = [-1, 0]
/** The stock prefab's item-stall use circle. */
const ITEM_USE_RADIUS = 25
/** `ShopArea.Type` of the equipment shop */
const SHOP_EQUIPMENT = 2

/** The fence grid, and how far past the walkable area the fences reach. */
const FENCE_CELL = 4
const FENCE_REACH = 16

/**
 * The box the closure check fills: the room, the moved branches and a margin
 * past the fences. The import fails when the fill reaches its edge.
 */
export const CRYSTAL_SHOP_CROP: Box = { x0: -352, y0: -320, x1: 352, y1: 320 }

/**
 * The payout, in tiles round the arrival (the room's centre, a tile corner):
 * 16 diamonds on the ring two tiles out (a 5×5 ring less the inner 3×3, the
 * pads inside it), the twelve upgrades in two rows above it with a row free
 * between. Every spot is a tile corner whose four tiles are red floor.
 */
export const CRYSTAL_SHOP_PAYOUT: TownPayout = {
  diamonds: ring(2),
  upgrades: upgradeRows(-3, -5)
}

function ring(r: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = []
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.max(Math.abs(x), Math.abs(y)) === r) out.push([x, y])
  return out
}

type Side = 'n' | 'e' | 's' | 'w'
const SIDES: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }

interface Branch {
  side: Side
  root: AeUnit
  glass: AeUnit[]
  islands: AeUnit[]
  dx: number
  dy: number
}

export function cleanCrystalShop(level: AeLevel): AeLevel {
  // --- anchors ---------------------------------------------------------------
  const starts = level.scripts.filter((s) => s.cls === 'LevelStart')
  if (starts.length !== 1) throw new Error(`crystal shop: expected one LevelStart, found ${starts.length}`)
  const spawn = starts[0]
  const allIslands = level.units.filter((u) => u.path === ISLAND)
  const hub = allIslands.find((u) => inBox(top(u), spawn.x, spawn.y))
  if (hub === undefined) throw new Error('crystal shop: the arrival is on no island')
  if (hub.x % TILE !== 0 || hub.y % TILE !== 0) throw new Error(`crystal shop: the hub at ${hub.x},${hub.y} is off the tile grid`)
  const islands = allIslands.filter((u) => u !== hub)
  const glass = level.units.filter((u) => u.path === GLASS)
  const fences = level.units
    .filter((u) => u.path === ':Physics_Freeform' && u.state?.sensor?.value !== true && u.state?.points?.kind === 'vec2s')
    .map((u) => (u.state!.points!.value as Array<[number, number]>).map(([x, y]) => [u.x + x, u.y + y] as const))
  const itemPrefabs = level.prefabs.filter((p) => p.path === ITEM_PREFAB)
  const strayPrefabs = level.prefabs.filter((p) => p.path !== ITEM_PREFAB)
  if (itemPrefabs.length !== 1) throw new Error(`crystal shop: expected one ${ITEM_PREFAB}, found ${itemPrefabs.length}`)
  if (strayPrefabs.length > 0) throw new Error(`crystal shop: unexpected prefab ${strayPrefabs[0].path}`)
  const item = itemPrefabs[0]

  // --- scripts: the arrival and the stalls -----------------------------------
  const vendors: Array<{ use: AeScript; area: AeScript; sensor: AeUnit }> = []
  for (const area of level.scripts.filter((s) => s.cls === 'ShopArea')) {
    const target = area.params.find((p) => p.name === '#PlayerTarget')
    const use = target?.kind === 'target' ? level.scripts.find((s) => s.id === target.value[0]) : undefined
    const areas = use?.params.find((p) => p.name === 'Areas')
    const sensor = areas?.kind === 'ids' ? level.units.find((u) => u.id === areas.value[0]) : undefined
    const id = vendorIdOfShopArea(stringParam(area, 'Categories'))
    if (use === undefined || sensor === undefined || id === undefined) throw new Error(`crystal shop: stall ${area.id} has no trigger, area or vendor`)
    area.label = `lobby:vendor:${id}`
    area.enabled = true
    use.enabled = true
    if (!use.connections.some(([c]) => c === area.id)) use.connections.push([area.id, 0])
    vendors.push({ use, area, sensor })
  }
  level.scripts = [spawn, ...vendors.flatMap((v) => [v.use, v.area])]
  const keptIds = new Set(level.scripts.map((s) => s.id))
  for (const s of level.scripts) s.connections = s.connections.filter(([id]) => keptIds.has(id))
  const named = new Set(vendors.map((v) => v.sensor.id))

  // --- branches ----------------------------------------------------------------
  const roots = glass.filter((g) => gap(box(g, GLASS_HALF), top(hub)) <= TOUCH)
  const branches: Branch[] = []
  for (const side of Object.keys(SIDES) as Side[]) {
    const onSide = roots.filter((g) => sideOf(g, hub) === side)
    if (onSide.length !== 1) throw new Error(`crystal shop: ${onSide.length} walkways leave the hub ${side}`)
    branches.push({ side, root: onSide[0], glass: [], islands: [], dx: 0, dy: 0 })
  }
  const owner = new Map<AeUnit, Branch>()
  for (const b of branches) {
    const queue = [b.root]
    owner.set(b.root, b)
    for (let head = 0; head < queue.length; head++) {
      const g = queue[head]
      b.glass.push(g)
      for (const n of glass) {
        if (!adjacent(g, n)) continue
        const seen = owner.get(n)
        if (seen !== undefined && seen !== b) throw new Error(`crystal shop: the ${seen.side} and ${b.side} walkways meet`)
        if (seen !== undefined) continue
        owner.set(n, b)
        queue.push(n)
      }
    }
  }
  for (const island of islands) {
    const by = branches.filter((b) => b.glass.some((g) => gap(box(g, GLASS_HALF), top(island)) <= TOUCH))
    if (by.length !== 1) throw new Error(`crystal shop: the island at ${island.x},${island.y} is reached by ${by.length} walkways`)
    by[0].islands.push(island)
    owner.set(island, by[0])
  }
  const islandOf = new Map<AeUnit, AeUnit>()
  for (const u of level.units) {
    if (owner.has(u) || u === hub || u.path === ':Physics_Freeform' || u.path === SPAWN_MARK) continue
    if (u.path.startsWith(':') && !named.has(u.id)) continue
    const on = islands.find((i) => inBox(top(i), u.x, u.y))
    if (on !== undefined) {
      owner.set(u, owner.get(on)!)
      islandOf.set(u, on)
      continue
    }
    const walk = glass.find((g) => owner.has(g) && inBox(box(g, GLASS_HALF), u.x, u.y))
    if (walk === undefined) throw new Error(`crystal shop: ${u.path} at ${u.x},${u.y} is on neither an island nor a walkway`)
    owner.set(u, owner.get(walk)!)
  }
  const itemIsland = islands.find((i) => inBox(top(i), item.x, item.y))
  if (itemIsland === undefined) throw new Error('crystal shop: the item stall is on no island')

  // --- what the party may walk on, read from the stock fences ---------------
  const fenced = (x: number, y: number): boolean => fences.some((pts) => windingNumber(pts as Point[], x, y) !== 0)
  for (const g of glass) {
    if (fenced(g.x - 2, g.y - 2) || fenced(g.x + 2, g.y + 2)) throw new Error(`crystal shop: stock fences in the glass at ${g.x},${g.y}`)
  }
  for (const v of vendors) {
    if (fenced(v.sensor.x, v.sensor.y)) throw new Error(`crystal shop: stock fences in the ${v.area.label} stall's use area`)
  }
  /**
   * each island's open cells, by the stock fences where it stood: the cells
   * the stock fences leave open that join its centre, within its top and the
   * strip round it up to where glass may stop short of it (stock leaves 2 px).
   * Open void past the stock fences' outer edge joins nothing, so stays out.
   */
  const openTop = new Map<AeUnit, Array<[number, number]>>()
  for (const island of islands) {
    const t = box(island, ISLAND_HALF + TOUCH)
    const open = (cx: number, cy: number): boolean => {
      const px = (cx + 0.5) * FENCE_CELL
      const py = (cy + 0.5) * FENCE_CELL
      return inBox(t, px, py) && !fenced(px, py)
    }
    const start: [number, number] = [Math.floor(island.x / FENCE_CELL), Math.floor(island.y / FENCE_CELL)]
    if (!open(...start)) throw new Error(`crystal shop: the island at ${island.x},${island.y} is fenced over`)
    const seen = new Set([`${start[0]},${start[1]}`])
    const cells: Array<[number, number]> = [start]
    for (let head = 0; head < cells.length; head++) {
      const [cx, cy] = cells[head]
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        if (seen.has(`${nx},${ny}`) || !open(nx, ny)) continue
        seen.add(`${nx},${ny}`)
        cells.push([nx, ny])
      }
    }
    openTop.set(island, cells)
  }

  // --- move the branches to the doorways --------------------------------------
  // the ring's outer edge from the centre: the ring is tiles -RING and RING - 1
  const outer = RING * TILE
  const room: Box = { x0: hub.x - outer, y0: hub.y - outer, x1: hub.x + outer, y1: hub.y + outer }
  for (const b of branches) {
    const [ax, ay] = SIDES[b.side]
    // along the side's axis: from the glass edge that faced the hub to the ring's outer edge
    const along = ax !== 0 ? b.root.x - hub.x : b.root.y - hub.y
    const sign = ax + ay
    const shift = sign * outer - (along - sign * GLASS_HALF)
    const across = ax !== 0 ? b.root.y - hub.y : b.root.x - hub.x
    if (Math.abs(across) + GLASS_HALF > TILE) throw new Error(`crystal shop: the ${b.side} walkway is off its doorway by ${across} px`)
    if (shift % FENCE_CELL !== 0) throw new Error(`crystal shop: the ${b.side} walkway moves ${shift} px, off the fence grid`)
    // `shift` is signed already: the axis only says which coordinate moves
    b.dx = ax !== 0 ? shift : 0
    b.dy = ay !== 0 ? shift : 0
  }
  for (const [u, b] of owner) {
    u.x += b.dx
    u.y += b.dy
  }
  const itemBranch = owner.get(itemIsland)!
  item.x += itemBranch.dx
  item.y += itemBranch.dy
  const moved = islands.map((i) => ({ i, t: top(i) }))
  for (const { i, t } of moved) {
    if (overlap(t, room)) throw new Error(`crystal shop: the island at ${i.x},${i.y} lands on the room`)
    for (const { i: j, t: u } of moved) if (i !== j && overlap(t, u)) throw new Error(`crystal shop: islands at ${i.x},${i.y} and ${j.x},${j.y} overlap`)
  }

  // --- drop the hub and the stock fences; the arrival to the room's centre ----
  level.units = level.units.filter(
    (u) => u !== hub && u.path !== SPAWN_MARK && u.path !== ':Physics_Freeform' && (!u.path.startsWith(':') || named.has(u.id))
  )
  level.prefabs = []
  spawn.params = []
  spawn.label = 'lobby:spawn'
  spawn.x = hub.x
  spawn.y = hub.y
  const portals = level.units.filter((u) => u.path === PORTAL)
  if (portals.length !== 1) throw new Error(`crystal shop: expected one teleporter, found ${portals.length}`)
  portals[0].state = { ...portals[0].state, start: { kind: 'string', value: 'open' } }

  // --- the stalls: each trigger on its stand; the item stall laid in-level ------
  const stand = level.addUnit(ITEM_STAND, item.x, item.y)
  const circle = level.addCircleSensor(item.x, item.y, ITEM_USE_RADIUS)
  const use = level.addScript('UseTrigger', item.x, item.y, [P.ids('Areas', [circle.id])])
  const area = level.addScript(
    'ShopArea',
    item.x,
    item.y,
    [P.target('#PlayerTarget', use.id, 'User'), P.str('Categories', 'equipment_5'), P.int('Type', SHOP_EQUIPMENT)],
    { label: 'lobby:vendor:item' }
  )
  level.link(use, area)
  const stands = level.units.filter((u) => VENDOR_STAND.test(u.path) && u !== stand)
  for (const v of vendors) {
    const at = nearest(stands, v.sensor.x, v.sensor.y)
    if (at === undefined) throw new Error(`crystal shop: no stand for ${v.area.label}`)
    for (const s of [v.use, v.area]) {
      s.x = at.x
      s.y = at.y
    }
  }

  // --- the red room -------------------------------------------------------------
  const tx0 = hub.x / TILE
  const ty0 = hub.y / TILE
  const red = new Set<string>()
  const pads = new Set<string>()
  for (let y = -FLOOR_HALF; y < FLOOR_HALF; y++) for (let x = -FLOOR_HALF; x < FLOOR_HALF; x++) red.add(`${tx0 + x},${ty0 + y}`)
  for (const d of DOOR) {
    red.add(`${tx0 + d},${ty0 - RING}`)
    red.add(`${tx0 + d},${ty0 + RING - 1}`)
    red.add(`${tx0 - RING},${ty0 + d}`)
    red.add(`${tx0 + RING - 1},${ty0 + d}`)
  }
  for (const y of [-1, 0]) for (const x of [-1, 0]) pads.add(`${tx0 + x},${ty0 + y}`)
  const redTiles = [...red].map((k) => k.split(',').map(Number) as [number, number])
  clearUnder(level, BLACK, red)
  const layers = new TileLayers(tilesetSize)
  layers.paint16(FLOOR, redTiles)
  for (const cell of layers.cells()) {
    const at = level.tileCells.find((c) => c.x === cell.x && c.y === cell.y)
    if (at === undefined) level.tileCells.push(cell)
    else at.datasets.unshift(...cell.datasets)
  }
  for (const { x, y, piece } of ringPieces()) {
    const r = resolvePiece(WALLS, piece, aeAssetExists)
    if (r === null) throw new Error(`crystal shop: ${WALLS} has no ${piece}`)
    level.addUnit(r.path, (tx0 + x) * TILE, (ty0 + y + r.dy) * TILE)
  }
  for (const k of pads) {
    const [x, y] = k.split(',').map(Number)
    level.addUnit(PAD, x * TILE, y * TILE)
  }

  // --- fences round the walkable area -----------------------------------------
  const walk = new Set<string>()
  const cellKey = (cx: number, cy: number) => `${cx},${cy}`
  const per = TILE / FENCE_CELL
  for (const [x, y] of redTiles) for (let b = 0; b < per; b++) for (let a = 0; a < per; a++) walk.add(cellKey(x * per + a, y * per + b))
  for (const g of glass) {
    const cx0 = Math.floor((g.x - GLASS_HALF) / FENCE_CELL)
    const cy0 = Math.floor((g.y - GLASS_HALF) / FENCE_CELL)
    for (let b = 0; b < per; b++) for (let a = 0; a < per; a++) walk.add(cellKey(cx0 + a, cy0 + b))
  }
  for (const island of islands) {
    const b = owner.get(island)!
    for (const [cx, cy] of openTop.get(island)!) walk.add(cellKey(cx + b.dx / FENCE_CELL, cy + b.dy / FENCE_CELL))
  }
  layFences(level, walk, room)

  // --- payout ------------------------------------------------------------------
  const payout = CRYSTAL_SHOP_PAYOUT
  const spots = [...payout.diamonds, ...UPGRADE_KINDS.map((k) => payout.upgrades[k])]
  for (const [x, y] of spots) {
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const k = `${tx0 + x + ox},${ty0 + y + oy}`
      if (!red.has(k) || pads.has(k)) throw new Error(`crystal shop: the payout spot ${x},${y} touches ${red.has(k) ? 'a pad' : 'no red floor'}`)
    }
  }
  for (const [x, y] of payout.diamonds) level.addUnit(DIAMOND_UNIT, hub.x + x * TILE, hub.y + y * TILE)
  for (const kind of UPGRADE_KINDS) {
    const [x, y] = payout.upgrades[kind]
    level.addUnit(upgradeItemPath(kind), hub.x + x * TILE, hub.y + y * TILE)
  }
  return level
}

/**
 * The wall ring's pieces, in tiles round the centre: a corner at each end of a
 * side, straight 16-px runs, and a cap either side of the side's doorway.
 */
function ringPieces(): Array<{ x: number; y: number; piece: string }> {
  const out: Array<{ x: number; y: number; piece: string }> = []
  const lo = -RING
  const hi = RING - 1
  // the north and south sides, corners included; a cap is named for the end it is
  for (const y of [lo, hi]) {
    for (let x = lo; x <= hi; x++) {
      if (DOOR.includes(x)) continue
      let piece = 'h_16'
      if (x === lo) piece = y === lo ? 'crn_nw' : 'crn_sw'
      else if (x === hi) piece = y === lo ? 'crn_ne' : 'crn_se'
      else if (x === DOOR[0] - 1) piece = 'cap_h_e'
      else if (x === DOOR[DOOR.length - 1] + 1) piece = 'cap_h_w'
      out.push({ x, y, piece })
    }
  }
  // the west and east sides between the corners
  for (const x of [lo, hi]) {
    for (let y = lo + 1; y < hi; y++) {
      if (DOOR.includes(y)) continue
      let piece = 'v_16'
      if (y === DOOR[0] - 1) piece = 'cap_v_s'
      else if (y === DOOR[DOOR.length - 1] + 1) piece = 'cap_v_n'
      out.push({ x, y, piece })
    }
  }
  return out
}

/** Clear a tileset wherever it paints inside the given 16-px tiles (`"x,y"`), dropping datasets left empty. */
function clearUnder(level: AeLevel, tileset: string, tiles: ReadonlySet<string>): void {
  const half = CELL / 2
  for (const cell of level.tileCells) {
    cell.datasets = cell.datasets.filter((ds) => {
      if (ds.tileset !== tileset) return true
      const side = Math.round(Math.sqrt(rleLength(ds.rle)))
      const size = CELL / side
      const grid = decodeRle(ds.rle, side).map((on, i) => {
        const x = cell.x - half + (i % side) * size
        const y = cell.y - half + Math.trunc(i / side) * size
        return on && !tiles.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`)
      })
      ds.rle = encodeRle(grid)
      return grid.some(Boolean)
    })
  }
}

/**
 * Invisible solid rectangles over every cell within `FENCE_REACH` of the
 * walkable area that isn't walkable itself, outside the walled room (its walls
 * collide). Rows are merged greedily into rectangles, top-left first.
 */
function layFences(level: AeLevel, walk: ReadonlySet<string>, room: Box): void {
  const reach = FENCE_REACH / FENCE_CELL
  const need = new Set<string>()
  for (const k of walk) {
    const [cx, cy] = k.split(',').map(Number)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const n = `${cx + dx},${cy + dy}`
        const px = (cx + dx + 0.5) * FENCE_CELL
        const py = (cy + dy + 0.5) * FENCE_CELL
        if (!walk.has(n) && !inBox(room, px, py)) need.add(n)
      }
    }
  }
  const cells = [...need].map((k) => k.split(',').map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const done = new Set<string>()
  const free = (x: number, y: number) => need.has(`${x},${y}`) && !done.has(`${x},${y}`)
  for (const [x, y] of cells) {
    if (!free(x, y)) continue
    let w = 1
    while (free(x + w, y)) w++
    let h = 1
    while ([...Array(w).keys()].every((i) => free(x + i, y + h))) h++
    for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) done.add(`${x + a},${y + b}`)
    const [px, py, pw, ph] = [x * FENCE_CELL, y * FENCE_CELL, w * FENCE_CELL, h * FENCE_CELL]
    level.addUnit(':Physics_Rectangle', px + pw / 2, py + ph / 2, fenceState(pw, ph))
  }
}

/** A solid fence, flagged as stock's are: shots, aim and jams pass over the void. */
function fenceState(w: number, h: number): Record<string, StateValue> {
  return {
    active: { kind: 'bool', value: true },
    sensor: { kind: 'bool', value: false },
    'jam-through': { kind: 'bool', value: true },
    'shot-through': { kind: 'bool', value: true },
    'aim-through': { kind: 'bool', value: true },
    size: { kind: 'vec2', value: [w, h] }
  }
}

function stringParam(s: AeScript, name: string): string {
  const p = s.params.find((q) => q.name === name)
  return p?.kind === 'string' ? p.value : ''
}

function box(u: { x: number; y: number }, half: number): Box {
  return { x0: u.x - half, y0: u.y - half, x1: u.x + half, y1: u.y + half }
}

function top(island: { x: number; y: number }): Box {
  return box(island, ISLAND_HALF)
}

function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
}

function overlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

/** The gap between two boxes along the axis they're furthest apart on; 0 when they touch or overlap. */
function gap(a: Box, b: Box): number {
  return Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1)
}

/** Two glass pieces side by side (or one over the other) on the 16-px grid. */
function adjacent(a: AeUnit, b: AeUnit): boolean {
  if (a === b) return false
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return (dx === 0 && dy <= TILE) || (dy === 0 && dx <= TILE)
}

function sideOf(g: AeUnit, hub: AeUnit): Side {
  const dx = g.x - hub.x
  const dy = g.y - hub.y
  if (Math.abs(dx) === Math.abs(dy)) throw new Error(`crystal shop: the glass at ${g.x},${g.y} leaves the hub diagonally`)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w'
  return dy > 0 ? 's' : 'n'
}

function nearest(units: readonly AeUnit[], x: number, y: number): AeUnit | undefined {
  let best: AeUnit | undefined
  let bestD = Infinity
  for (const u of units) {
    const d = (u.x - x) ** 2 + (u.y - y) ** 2
    if (d < bestD) {
      best = u
      bestD = d
    }
  }
  return best
}
