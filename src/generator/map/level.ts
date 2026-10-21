import { Room, roomSpawnBox } from './room'
import { sealRoomWall, sealRoomWallWithButton, sealRoomWithButton } from './buttonSeal'
import type { LockButton } from './buttonSeal'
import { Passage } from './passage'
import { Tile } from './tile'
import type { Doodad } from '../objects/doodad'
import { GOLD_LOCK_TIER } from '../objects/item'
import { getTheme, themeEnvironment, THEME_DEFS } from '../config/themes'
import { AeLevel } from '../ae/model'
import { TileLayers } from '../ae/tiles'
import { emitCover, emitObjects, emitWalls } from '../ae/emit'
import { emitTorches } from '../lighting/torches'
import { isLineCell } from './aeWalls'
import type { WallGrid } from './aeWalls'
import { tilesetSize } from '../catalog/assets'
import { exitReachable } from './reachability'
import { sealHolds } from './sealCheck'
import type { GenerationContext } from '../core/context'
import type { ScriptNode } from '../objects/scriptNode'

/** The black mask tileset (layer -79, above every floor): hides floor spill outside the wall line. */
const BLACK_TILESET = 'tilesets/__black.tileset'

/**
 * One generated floor: places rooms, connects them with passages, assigns
 * special rooms, rasterizes the tile grid and emits the level XML
 * (ported from Level.java).
 */
export class Level {
  levelNum: number
  width: number
  height: number
  rooms: Room[] = []
  tileArray: Tile[] = []
  passageList: Passage[] = []
  levelValid = true
  theme: string

  /**
   * Which room or corridor owns each cell, parallel to `tileArray`:
   * -1 for wall/void, `i` for `rooms[i]`, `rooms.length + i` for
   * `passageList[i]`. Filled by `buildTileArray` from the same room-first test
   * that decides the wall bit, so the two can never disagree — which matters
   * because `Room.contains` is inclusive and a passage's last cells overlap the
   * room it arrives at.
   *
   * Used only by the mixed themes, to give a whole room one floor surface.
   */
  regionMap: Int32Array = new Int32Array(0)

  /**
   * The destructible wall pieces barring the sealed room's corridor, when this
   * floor has one, so a post-pass can wire whatever opens them.
   *
   * The button path opens its own wall inside `buttonSeal.ts` and leaves this
   * empty; a DUNGEON BOSS floor has no button, and `dungeonBoss/opener.ts`
   * hangs a `Boss Died` trigger off these after the floor is accepted.
   */
  seals: Doodad[] = []

  /**
   * The `AreaTrigger` of each button on a floor that is locked AND hosts a
   * boss (issue #69): the buttons that count toward opening `seals` rather
   * than opening them outright. Empty otherwise — a lock-only floor's button
   * opens its own wall, and a boss-only floor has none.
   */
  sealButtons: ScriptNode[] = []

  /**
   * Every lock button this floor placed (issue #69, and the enhanced-lock-
   * button feature on top of it), in draw order: tile, room index and its own
   * press trigger. Empty on an unlocked floor. Read by `mystery/placement.ts`
   * (so a disguised lock plate is still avoided like an ordinary one) and
   * `mystery/rig.ts` (the first N of them are the enhanced buttons).
   */
  lockButtons: LockButton[] = []

  /**
   * Where this floor's boss(es) stand, when it has any (issue #61, and issue
   * #64 part 1 for more than one). One entry per boss `ctx.floorBoss` calls
   * for — spot 0 is drawn with exactly the pattern a single-boss floor has
   * always used; each further spot repeats the same (room, x, y) draw.
   *
   * Chosen HERE rather than in the post-pass that places the actors, because
   * each is pushed to `ctx.reachTargets` and so has to exist before
   * reachability runs at the end of this constructor. A boss the party cannot
   * walk to is a floor that can never be finished — its sealed way out would
   * never open.
   */
  bossSpots: Array<{ x: number; y: number }> = []

  /**
   * Where the floor's boss statues stand (`boss/statue.ts`), one per boss that
   * has one (the wraith). Filled by the boss rig after construction; read by
   * `mystery/placement.ts` so a plate keeps clear of them.
   */
  bossStatueSpots: Array<{ x: number; y: number }> = []

  private ctx: GenerationContext

  constructor(ctx: GenerationContext, level: number) {
    this.ctx = ctx
    const params = ctx.params
    const rand = ctx.rand

    ctx.idCounter = 1
    ctx.currentLevel = level
    this.theme = params.themes[level]
    ctx.currentTheme = this.theme
    this.levelNum = level
    this.width = params.mapWidth
    this.height = params.mapHeight

    // generate rooms
    const roomCount = rand.iRand(params.minRoomCount, params.maxRoomCount)

    for (let i = 0; i < roomCount; i++) {
      for (let attempt = 0; attempt < 1000; attempt++) {
        const newRoom = new Room(ctx, level)
        let conflict = false
        for (const r of this.rooms) {
          if (newRoom.overlap(r)) {
            conflict = true
            break
          }
        }
        if (!conflict) {
          this.rooms.push(newRoom)
          break
        }
      }
    }

    // generate passages: connect unconnected rooms to the connected set
    const doneList: Room[] = [this.rooms[0]]
    const newList: Room[] = this.rooms.slice(1)

    for (let attempt = 0; attempt < 1000; attempt++) {
      if (newList.length === 0) {
        break
      }

      const toRoom = newList[rand.iRand(0, newList.length)]
      const fromRoom = doneList[rand.iRand(0, doneList.length)]
      const newPassage = new Passage(ctx, fromRoom, toRoom)

      let overlap = !newPassage.valid
      if (!overlap) {
        for (const p of this.passageList) {
          if (p.overlapPassage(newPassage)) {
            overlap = true
            break
          }
        }
      }
      if (!overlap) {
        for (const r of this.rooms) {
          if (r !== toRoom && r !== fromRoom && newPassage.overlapRoom(r)) {
            overlap = true
            break
          }
        }
      }

      if (!overlap) {
        newPassage.finish()
        this.passageList.push(newPassage)
        newList.splice(newList.indexOf(toRoom), 1)
        doneList.push(toRoom)
      }
    }

    if (newList.length > 0) {
      this.levelValid = false
    }

    // entrance
    let success = false
    for (let attempt = 0; attempt < 2000; attempt++) {
      const r = this.rooms[rand.iRand(0, this.rooms.length)]
      if (r.transform('Entrance', this.passageList)) {
        success = true
        break
      }
    }
    if (!success) {
      this.levelValid = false
    }

    // Which way out this floor gets is a property of the campaign ORDER, not of
    // the floor's index — see GenerationContext.gateway. Under the default
    // order the two are the same thing (floor `levels - 1` is the last slot, or
    // the one before the first boss fight), which is why this moved without
    // changing any seed.
    // A BOSS floor never takes the stairs branch, whatever comes next (issue
    // #61). Its way out has to be SEALED until the boss dies, and only the
    // orb/portal branch produces a room a seal can close: `transform('Orb')`
    // refuses anything that is not a dead end, `buttonSeal` refuses an Exit
    // room outright, and an ExitDn prefab sits in the very wall band a DOWN
    // corridor's seal line is drawn into. So the stairs become a portal
    // pointing at the same level — exactly what `boss/arena.ts` already does,
    // an arena having no stairs prefab of its own either.
    //
    // This is the one thing about a boss floor that is NOT a post-pass: it is a
    // different branch, taking a different number of `ctx.rand` draws, so
    // arming a boss moves this floor's layout and every floor after it. Free
    // today because no seed predates the feature, and gated so a floor without
    // a boss draws exactly what it always drew.
    //
    // A LOCKED floor (issue #69) takes the same detour for the same reason —
    // stairs cannot be sealed — with the blue teleport standing in for them
    // (see the Orb case in room.ts).
    if (ctx.gateway?.kind === 'exit' && !ctx.floorBoss && !ctx.floorLocked) {
      // exit stairs down to the next floor
      success = false
      for (let attempt = 0; attempt < 2000; attempt++) {
        const r = this.rooms[rand.iRand(0, this.rooms.length)]
        if (r.transform('Exit', this.passageList)) {
          success = true
          break
        }
      }
      if (!success) {
        this.levelValid = false
      }
    } else {
      // Nothing follows, a boss fight does, or a lobby does: the victory orb,
      // or one of the two portals Room.transform swaps in for it (red for a
      // fight, blue for a lobby). Same room selection either way — all three
      // prefabs register the same ids off the same draws.
      success = false
      for (let attempt = 0; attempt < 2000; attempt++) {
        const r = this.rooms[rand.iRand(0, this.rooms.length)]
        if (r.transform('Orb')) {
          success = true
          break
        }
      }
      if (!success) {
        this.levelValid = false
      }
    }

    // shop — always on the first floor while a gargoyle shop is still owed
    const owedGargoyle = params.ensureGargoyleShop === true && !ctx.gargoyleShopPlaced
    if (rand.fRand(0, 1) < params.shopChance || owedGargoyle) {
      for (const r of this.rooms) {
        if (r.transform('Shop')) break
      }
    }

    // vault
    if (rand.fRand(0, 1) < params.vaultChance) {
      for (const r of this.rooms) {
        if (r.transform('Vault')) break
      }
    }

    // locked room
    if (rand.fRand(0, 1) < params.lockChance) {
      for (const r of this.rooms) {
        if (r.lockRoom()) break
      }
    }

    // spawn key
    if (rand.fRand(0, 1) < params.keyChance) {
      for (const r of this.rooms) {
        if (r.spawnKey()) break
      }
    }

    // seal the way out behind a destructible wall — a locked floor (issue #69),
    // a boss floor (issue #61), or both
    //
    // Runs last on purpose: the chance-gated lock above already refuses an Orb
    // room so it can never steal this one, and writing ctx.lastLockType here at
    // the very end of the level cannot leak into a later level.
    // Gates whichever room carries the floor's gateway prefab — the victory
    // orb, a boss portal, or a lobby portal. A locked or boss floor always has
    // one: the stairs branch above is skipped for both.
    // A boss floor is sealed whether or not it is locked: the boss's death is
    // its key. Locking it as well adds a button, and the wall then waits for
    // both.
    if (ctx.floorBoss || ctx.floorLocked) {
      // transform('Orb') already refused every room with more than one
      // passage, so the orb room is a dead end and the seal fits across its
      // single corridor
      const orbRoom = this.rooms.find((r) => r.type === 'Orb')
      // A button, never a key: the last gate before the orb is the one gate a
      // party can lock itself out of, by hoarding gold keys on earlier floors
      // or by spending this floor's key on one of the chance-rolled gold
      // doors. The wall the button destroys cannot be opened wrong.
      let gated = false
      if (orbRoom !== undefined) {
        if (ctx.floorBoss && ctx.floorLocked) {
          // Boss AND button: the button is hidden and wired to animate, but
          // opens nothing by itself — the post-pass feeds it and the boss's
          // death into one countdown (see dungeonBoss/opener.ts).
          const sealed = sealRoomWallWithButton(orbRoom, ctx, this, ctx.floorLockButtons)
          gated = sealed !== null
          if (sealed !== null) {
            this.seals = sealed.seals
            this.sealButtons = sealed.buttons
          }
        } else if (ctx.floorBoss) {
          // No button on a boss floor — the boss's death is the key. The wall
          // is identical; only what opens it differs, and that is wired after
          // the floor is accepted (see dungeonBoss/opener.ts).
          const seals = sealRoomWall(orbRoom, ctx)
          gated = seals !== null
          if (seals !== null) this.seals = seals
        } else {
          gated = sealRoomWithButton(orbRoom, ctx, this, ctx.floorLockButtons)
        }
        // the same consolation powerup, off the same three draws, that
        // lockRoom() grants — see Room.grantLockLoot
        if (gated) orbRoom.grantLockLoot()
      }
      if (!gated) {
        this.levelValid = false
      } else {
        // One gold key per gold door, whatever the chance rolls did.
        //
        // The vault and the chance-gated lock both draw a random tier but only
        // ever produce a single key between them, so a floor can hold two gold
        // doors and one gold key, and spending that key on the wrong door shuts
        // the player out of whatever is behind the other. So count the gold
        // doors actually placed and top the keys up to match.
        //
        // The orb's own gate is never one of them — it is a button-opened wall,
        // not a door — so this often has nothing to top up. The chance-rolled
        // gold doors on this floor are real doors and still need their keys.
        const goldDoors = this.rooms.filter((r) => r.lockTier === GOLD_LOCK_TIER).length
        const goldKeys = () =>
          ctx.items.filter((i) => i.type === 'Key' && i.index === GOLD_LOCK_TIER).length

        // spawnKey refuses locked rooms, so every key lands somewhere the
        // player can reach without a key — any of them opens any gold door
        while (goldKeys() < goldDoors) {
          success = false
          for (let attempt = 0; attempt < 2000; attempt++) {
            const r = this.rooms[rand.iRand(0, this.rooms.length)]
            if (r.spawnKey(GOLD_LOCK_TIER)) {
              success = true
              break
            }
          }
          if (!success) {
            // nowhere unlocked to hide it — re-roll rather than ship a floor
            // the player cannot finish
            this.levelValid = false
            break
          }
        }
      }
    }

    // Where this floor's boss will stand (issue #61).
    //
    // Picked HERE, not in the post-pass that places the actor, for one reason:
    // it is pushed to `ctx.reachTargets` and so must exist before
    // `exitReachable` runs at the end of this constructor. A boss the party
    // cannot walk to never dies, its seal never opens, and the floor can never
    // be finished — the same failure an unreachable button would be, handled
    // the same way. `buttonSeal.ts`'s `pickButtonTile` is the pattern.
    //
    // Drawn from `ctx.rand` rather than the boss rig's own stream because it
    // feeds reachability, which decides whether the floor is re-rolled at all.
    // That is already paid for: a boss floor's layout has moved regardless, by
    // taking the portal branch above.
    if (ctx.floorBoss) {
      // The entrance is where the party materialises blind, the shop is a
      // no-combat room, and the sealed room is behind the wall the boss opens —
      // a boss in there could never be reached. A `locked` vault is excluded
      // too: chaining a gold key in front of the boss would make the floor's
      // one guaranteed gate depend on a chance-rolled one.
      // A room must also be big enough for `roomSpawnBox` to be non-empty, or
      // the draws below would get an inverted range.
      const eligible = this.rooms.filter((r) => {
        if (r.type === 'Entrance' || r.type === 'Shop' || r.sealed || r.locked) return false
        const box = roomSpawnBox(r)
        return box.x0 <= box.x1 && box.y0 <= box.y1
      })
      if (eligible.length === 0) {
        this.levelValid = false
      } else {
        // One (room, x, y) draw per boss the floor hosts. `ctx.floorBoss` is 1
        // for the pre-#64-part-1 shape, so this loop runs exactly once and
        // spot 0 draws exactly what a single-boss floor has always drawn —
        // every further spot repeats the identical pattern.
        for (let i = 0; i < ctx.floorBoss; i++) {
          const room = eligible[rand.iRand(0, eligible.length)]
          // The original's Lair-spawner box, not the bare room: a boss on the
          // tile beside a wall is inside that wall's collision and cannot walk
          // out. The worm burrows, which is why it got away with this.
          const box = roomSpawnBox(room)
          const spot = {
            x: Math.trunc(rand.fRand(box.x0, box.x1)),
            y: Math.trunc(rand.fRand(box.y0, box.y1))
          }
          this.bossSpots.push(spot)
          ctx.reachTargets.push(spot)
        }
      }
    }

    // everything else becomes a monster lair
    for (const r of this.rooms) {
      r.transform('Lair')
    }

    this.buildTileArray()

    // Last, because it reads the finished tile grid: a floor whose exit (or
    // orb, or a key) the player physically cannot walk to is discarded and
    // re-rolled like any other invalid floor. The tile grid alone says such a
    // floor is connected — what seals it is the wall art's overhang, which
    // reachability.ts models. Draws no random values.
    if (!exitReachable(this, ctx)) {
      this.levelValid = false
    }

    // And the other half of that promise: the player must NOT be able to reach
    // the orb without opening the gate. `exitReachable` above walks straight
    // through the seal on purpose — it is proving the *button* is reachable —
    // so nothing checked this until four separate walk-arounds had shipped.
    // Reads the finished tile grid and the placed wall doodads, so it runs last
    // of all. Draws no random values.
    if (!sealHolds(this, ctx)) {
      this.levelValid = false
    }
  }

  /** The wall grid the AE wall placer and the floor painter read. */
  wallGrid(): WallGrid {
    const { width, height, tileArray } = this
    return {
      width,
      height,
      solid: (x, y) => x < 0 || y < 0 || x >= width || y >= height || tileArray[x + y * width].wall,
      reserved: (x, y) => x >= 0 && y >= 0 && x < width && y < height && tileArray[x + y * width].reserved
    }
  }

  /**
   * The finished floor as an Anniversary Edition level: floor tilesets, every
   * placed object, then the wall pieces computed from the tile grid.
   *
   * Floors: the theme's bottom tileset is painted one cell past the walkable
   * floor so it reaches under the wall line (AE's own levels do the same);
   * further layers cover walkable floor only; a mixed theme gives each room
   * and corridor one surface off the cosmetic stream; and `__black` masks every
   * solid cell that is not part of a wall line, hiding 32-px floor tiles that
   * spill past a wall. Last, the set's `__color_N` cover goes over the solid
   * mass and past the map edge, as stock levels have (`map/aeCover.ts`).
   */
  toAeLevel(): AeLevel {
    const ctx = this.ctx
    const theme = getTheme(this.theme) ?? THEME_DEFS[0]
    const level = new AeLevel(themeEnvironment(theme, this.levelNum))
    const grid = this.wallGrid()
    const { width, height } = this

    const floor: Array<[number, number]> = []
    const roomFloor: Array<[number, number]> = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = this.tileArray[x + y * width]
        if (!t.wall) roomFloor.push([x, y])
        if (!t.wall || t.reserved) floor.push([x, y])
      }
    }
    const layers = new TileLayers(tilesetSize)
    layers.paint16(theme.floor[0], roomFloor, [1, 1, 1, 1])
    for (const ts of theme.floor.slice(1)) layers.paint16(ts, floor)

    // one surface per room and corridor, drawn only when the theme mixes
    const palette = theme.mixed
    if (palette !== undefined && palette.length > 0) {
      const regions = this.rooms.length + this.passageList.length
      const slots = Array.from({ length: regions }, () => Math.trunc(ctx.cosmeticRand.nextFloat() * (palette.length + 1)))
      for (let slot = 1; slot <= palette.length; slot++) {
        const cells = roomFloor.filter(([x, y]) => {
          const r = this.regionMap[x + y * width]
          return r >= 0 && slots[r] === slot
        })
        if (cells.length > 0) layers.paint16(palette[slot - 1], cells)
      }
    }

    const mask: Array<[number, number]> = []
    for (let y = -2; y < height + 2; y++) {
      for (let x = -2; x < width + 2; x++) {
        if (grid.solid(x, y) && !grid.reserved(x, y) && !isLineCell(grid, x, y)) mask.push([x, y])
      }
    }
    layers.paint16(BLACK_TILESET, mask)
    level.tileCells = layers.cells()

    emitObjects(level, ctx)
    this.missingWallPieces = emitWalls(level, ctx, grid, theme)
    emitCover(level, ctx, grid, theme)
    emitTorches(level, ctx, grid, ctx.params.torches ?? 'normal')
    return level
  }

  /** Wall pieces the theme could not supply when the level was last emitted (should be empty). */
  missingWallPieces: string[] = []

  /** Rasterize rooms + passages into the wall/floor grid. */
  private buildTileArray(): void {
    this.tileArray = new Array<Tile>(this.width * this.height)
    this.regionMap = new Int32Array(this.width * this.height).fill(-1)
    for (let i = 0; i < this.width * this.height; i++) {
      const tile = new Tile(false)
      this.tileArray[i] = tile

      const x = i % this.width
      const y = Math.trunc(i / this.width)

      let isWall = true
      for (let r = 0; r < this.rooms.length; r++) {
        if (this.rooms[r].contains(x, y)) {
          isWall = false
          this.regionMap[i] = r
          break
        }
      }

      if (isWall) {
        for (let p = 0; p < this.passageList.length; p++) {
          if (this.passageList[p].contains(x, y)) {
            isWall = false
            this.regionMap[i] = this.rooms.length + p
            break
          }
        }
      }

      tile.wall = isWall

    }

    // exit doorways: wall-line cells the stairs art stands in
    for (const set of this.ctx.objectSets) {
      for (const [x, y] of set.reserved) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.tileArray[x + y * this.width].reserved = true
      }
    }
  }
}
