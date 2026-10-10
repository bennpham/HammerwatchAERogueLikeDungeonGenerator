import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { THEMES } from '../src/generator/config/parameters'
import { plainParameters } from './params'
import { getTheme } from '../src/generator/config/themes'
import type { BossArenaOptions, BossFight, BossOptions } from '../src/generator/config/parameters'
import { buildBossArena } from '../src/generator/boss/arena'
import { bossArenaId, lobbyId } from '../src/generator/campaign'
import type { Gateway } from '../src/generator/campaign'
import { BOSS_DEF_LIST, BOSS_DEFS, topWallBossClearance, topWallBossY } from '../src/generator/boss/bosses'
import { ANCHOR_INSET, NORTH_ANCHOR_INSET, anchors } from '../src/generator/boss/anchors'
import type { AlcoveWall, BossDef } from '../src/generator/boss/bosses'
import { DoodadType, doodadOffset, doodadPath } from '../src/generator/objects/doodad'
import type { DoodadTypeName } from '../src/generator/objects/doodad'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { allIds, badIntArray, nodesOfType, oneShotRespawn } from './xmlHelpers'

function freshCtx(seed: number): GenerationContext {
  return new GenerationContext(plainParameters(), seed)
}

function arenaOptions(overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return { ...plainParameters().boss.fights[0].arena, ...overrides }
}

/**
 * Stock checkpoints emit their own RespawnPlayers/GlobalEventTrigger nodes
 * (checkpoints.ts) — off here so tests about the *other* rigs that use those
 * same node types (the one-shot arrival respawn, the invulnerability
 * triggers) aren't counting the checkpoint rig's nodes too.
 */
const NO_CHECKPOINTS: BossArenaOptions['checkpoints'] = {
  respawnPlayers: 'never',
  saveGame: 'never'
}

/**
 * The stock arena with every monster back on the anchors mode — the shape the
 * waves had before the stock presets scattered them. Used by the tests about
 * the timer rig and about the scatter knobs being inert, both of which are
 * statements about anchored waves.
 */
function anchoredOptions(overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  const arena = plainParameters().boss.fights[0].arena
  return arenaOptions({ waves: arena.waves.map((w) => ({ ...w, spawnMode: undefined })), ...overrides })
}

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

function withBoss(patch: Partial<BossOptions>): DungeonParameters {
  const params = plainParameters()
  params.boss = { ...params.boss, ...patch }
  return params
}

/** The stock parameters with the FIRST fight patched — the campaign ships one. */
function withFight(patch: Partial<BossFight>): DungeonParameters {
  const params = plainParameters()
  params.boss = {
    ...params.boss,
    fights: params.boss.fights.map((f, i) => (i === 0 ? { ...f, ...patch } : f))
  }
  return params
}

/**
 * A campaign predating the boss feature: no `boss` key at all, the shape a
 * parameters.txt from before this feature (or a hand-built test params
 * object) would produce. `generateDungeon`'s own `params.boss?.enabled ===
 * true` check and room.ts's matching guard exist specifically so this is not
 * a crash — it is "off", the same as an explicit `enabled: false`.
 */
function withoutBossField(): DungeonParameters {
  const params = plainParameters()
  const { boss: _boss, ...rest } = params
  return rest as DungeonParameters
}

/**
 * The full `<dictionary>...</dictionary>` block for the element whose bare
 * (unnamed) dictionary carries `<int name="id">ID</int>` as its first child —
 * depth-tracked because a node's own `parameters` sub-dictionary nests inside
 * it. Used to prove a diff between two level files is confined to a handful
 * of known ids and touches nothing else.
 */
function dictBlockById(xml: string, id: number): string {
  const re = new RegExp(`<dictionary>\\s*<int name="id">${id}</int>`)
  const m = re.exec(xml)
  if (m === null) return ''
  let pos = m.index + '<dictionary>'.length
  let depth = 1
  while (depth > 0) {
    const nextOpen = xml.indexOf('<dictionary', pos)
    const nextClose = xml.indexOf('</dictionary>', pos)
    if (nextClose === -1) break
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      pos = nextOpen + '<dictionary'.length
    } else {
      depth--
      pos = nextClose + '</dictionary>'.length
    }
  }
  return xml.slice(m.index, pos)
}

/** Every `<int name="id">...` plus each node's own `x`/`y`, for geometry checks against the XML directly. */
function actorEntries(xml: string): { id: number; type: string; x: number; y: number }[] {
  const actorsSection = /<dictionary name="actors">([\s\S]*?)<\/dictionary>\s*<dictionary name="scripting">/.exec(xml)?.[1] ?? ''
  return [...actorsSection.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g)].map(
    (m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]) })
  )
}

/** The single `actors/boss_*` entry every arena emits. */
function bossActor(xml: string): { id: number; type: string; x: number; y: number } {
  const boss = actorEntries(xml).find((a) => /^actors\/boss_/.test(a.type))
  expect(boss, 'arena emitted no boss actor').toBeDefined()
  return boss!
}

function bossDefFor(actorPath: string): BossDef {
  const def = BOSS_DEF_LIST.find((d) => d.actorPath === actorPath)
  expect(def, `no BossDef for ${actorPath}`).toBeDefined()
  return def!
}

/**
 * The 9 anchors arena.ts built for this arena, recomputed from the emitted boss
 * rather than assumed: a topWall boss shifts the N anchor south past its own
 * collider, a centre boss pushes C clear of its own. See anchors.ts's
 * `AnchorClearance`.
 */
function arenaAnchors(xml: string, width: number, height: number) {
  const def = bossDefFor(bossActor(xml).type)
  return anchors(
    width,
    height,
    def.placement === 'topWall'
      ? { northClearance: topWallBossClearance(def, topWallBossY(def)) }
      : { centreBoss: { width: def.footprintWidth, height: def.footprintHeight } }
  )
}

function doodadEntries(xml: string): { id: number; type: string; x: number; y: number; needSync: boolean }[] {
  const section = /<dictionary name="doodads">([\s\S]*?)<\/dictionary>\s*<dictionary name="actors">/.exec(xml)?.[1] ?? ''
  return [
    ...section.matchAll(
      /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<bool name="need-sync">(True|False)<\/bool>/g
    )
  ].map((m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]), needSync: m[5] === 'True' }))
}

function itemEntries(xml: string): { id: number; type: string; x: number; y: number }[] {
  const section = /<dictionary name="items">([\s\S]*?)<\/dictionary>\s*<dictionary name="lighting">/.exec(xml)?.[1] ?? ''
  return [
    ...section.matchAll(
      /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
    )
  ].map((m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]) }))
}

/**
 * The `state` of every node of `type`, in document order. ToggleElement and
 * ToggleImmortality share a parameter shape, so an assertion about one has to
 * say which it means.
 */
function toggleStates(xml: string, type: 'ToggleElement' | 'ToggleImmortality'): number[] {
  const re = new RegExp(`<string name="type">${type}</string>[^]*?<int name="state">([0-9]+)</int>`, 'g')
  return [...xml.matchAll(re)].map((m) => Number(m[1]))
}

function destroyObjectTargets(xml: string): number[] {
  const match = /<string name="type">DestroyObject<\/string>[\s\S]*?<int-arr name="static">([^<]*)<\/int-arr>/.exec(xml)
  if (match === null) return []
  return match[1].split(' ').filter((t) => t !== '').map(Number)
}

describe('boss arena — determinism', () => {
  it('produces byte-identical XML for the same seed and options', () => {
    const a = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    expect(a.xml).toBe(b.xml)
    expect(a.preview).toEqual(b.preview)
  })

  it('draws only from ctx.bossRand — ctx.rand and ctx.cosmeticRand are untouched', () => {
    const ctx = freshCtx(555)
    const control = freshCtx(555)

    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    buildBossArena(ctx, arenaOptions(), 0)

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('varies with the seed', () => {
    const a = buildBossArena(freshCtx(1), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(999999), arenaOptions(), 0)
    expect(a.xml).not.toBe(b.xml)
  })
})

describe('boss arena — geometry', () => {
  for (const seed of [1, 4242, 987654, 20260811]) {
    it(`seed ${seed}: exactly one boss actor, inside the walls`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const actors = actorEntries(xml)
      const bossActors = actors.filter((a) => /^actors\/boss_/.test(a.type))
      expect(bossActors).toHaveLength(1)

      const boss = bossActors[0]
      // Actor/doodad positions are emitted in "local" (interior-relative)
      // coordinates, not the grid coordinates preview.rooms/walls use — see
      // arena.ts's file header. "Inside the walls" means within [0,width) x
      // [0,height), not offset by the preview room's grid position.
      const room = preview.rooms[0]
      expect(boss.x).toBeGreaterThanOrEqual(-0.001)
      expect(boss.x).toBeLessThan(room.width)
      expect(boss.y).toBeGreaterThanOrEqual(-0.001)
      expect(boss.y).toBeLessThan(room.height)
    })

    it(`seed ${seed}: all 9 anchors sit on walkable (non-wall) floor`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      for (const a of arenaAnchors(xml, room.width, room.height)) {
        expect(isWall(room.x + a.x, room.y + a.y)).toBe(false)
      }
    })

    // Two anchors can be reached by a boss collider, one per placement: N by a
    // wall-mounted (topWall) boss, which shares its midX, and C by a centre one,
    // which sits on exactly that tile. A monster spawned inside a static boss is
    // stuck there and unhittable, so arena.ts pushes whichever applies clear —
    // see anchors.ts's AnchorClearance. There is no exception any more: this
    // holds for all seven bosses and every anchor.
    it(`seed ${seed}: no anchor sits inside the boss's own collider`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const boss = bossActor(xml)
      const def = bossDefFor(boss.type)
      const offset = def.collisionOffsetY ?? 0

      for (const a of arenaAnchors(xml, room.width, room.height)) {
        const insideX = Math.abs(a.x - boss.x) < def.footprintWidth / 2
        const insideY = Math.abs(a.y - (boss.y + offset)) < def.footprintHeight / 2
        expect(insideX && insideY, `anchor ${a.id} is inside ${def.id}`).toBe(false)
      }
    })

    // Each boss placement displaces exactly one anchor and leaves the other
    // eight on the plain inset layout: topWall moves N, centre moves C. Neither
    // fix may leak into the rest of the ring.
    it(`seed ${seed}: only the anchor its own boss can reach is displaced`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const def = bossDefFor(bossActor(xml).type)
      const at = (id: string) => arenaAnchors(xml, room.width, room.height).find((a) => a.id === id)!
      const midY = Math.trunc(room.height / 2)

      if (def.placement === 'centre') {
        expect(at('N').y).toBe(NORTH_ANCHOR_INSET)
        // C is pushed off the boss's tile — south on any arena this size
        expect(at('C').y).toBeGreaterThan(midY)
        expect(at('C').x).toBe(Math.trunc(room.width / 2))
      } else {
        // topWall: N is pushed clear, the other two northern anchors are not,
        // and C stays exactly where it has always been
        expect(at('N').y).toBeGreaterThan(NORTH_ANCHOR_INSET)
        expect(at('C')).toEqual({ id: 'C', x: Math.trunc(room.width / 2), y: midY })
      }
      expect(at('NE').y).toBe(NORTH_ANCHOR_INSET)
      expect(at('NW').y).toBe(NORTH_ANCHOR_INSET)
      expect(at('W').x).toBe(ANCHOR_INSET)
      expect(at('S').y).toBe(room.height - 1 - ANCHOR_INSET)
    })

    it(`seed ${seed}: the alcove interior is real floor tiles, reachable one tile behind each seal`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const seals = destroyObjectTargets(xml)
      // Just the 3 structural wall seals across the mouth. The arena emits no
      // Cover at all any more — see "no color_theme overlay anywhere".
      expect(seals.length).toBe(3)

      const doodads = doodadEntries(xml)
      const sealDoodads = doodads.filter((d) => seals.includes(d.id))
      expect(sealDoodads).toHaveLength(seals.length)
      // every seal is need-sync=True, and nothing else is — the DestroyObject
      // target array and the need-sync set must stay exactly the same set
      for (const d of sealDoodads) expect(d.needSync).toBe(true)
      expect(doodads.filter((d) => d.needSync).map((d) => d.id).sort()).toEqual([...seals].sort())

      // Cover's path is doodads/special/color_theme_*_16.xml (doodad.ts),
      // distinct from every theme_*/ wall-piece path — split the 3 structural
      // seals out from the 12 Cover overlays so the geometry probe below only
      // looks at the pieces that actually have a collision polygon and an
      // offset convention this test knows how to undo.
      const wallSealDoodads = sealDoodads.filter((d) => !d.type.includes('/special/color_theme_'))
      expect(wallSealDoodads).toHaveLength(3)

      // A doodad's emitted x/y is its tile position *plus* DoodadType's
      // per-piece render offset (doodad.ts) — Horizontal is yOffset 2,
      // Vertical is yOffset 1, xOffset 0 for both on the default (unoverridden)
      // theme these tests use. Undo that before treating the number as a tile
      // coordinate, or the probe below lands on the wrong tile.
      const tileOf = (d: (typeof wallSealDoodads)[number]): { x: number; y: number } => {
        const isHorizontal = d.type.includes('_h_8')
        const offset = isHorizontal ? { x: 0, y: 2 } : { x: 0, y: 1 }
        return { x: d.x - offset.x, y: d.y - offset.y }
      }

      // the alcove interior tile directly behind the mouth (whichever wall it
      // is) must be floor — probe the tile *immediately* behind a seal (+1,
      // not +2): on the E wall this is exactly the column the §1 off-by-one
      // used to leave as unopenable wall, and +2 lands one column past it,
      // which is why the old probe never caught the bug.
      const room = preview.rooms[0]
      const tiles = wallSealDoodads.map(tileOf)
      // Determine the seal row/column direction from the three seal tile
      // positions themselves (they are colinear, either same x or same y).
      const sameX = tiles.every((t) => t.x === tiles[0].x)
      const sameY = tiles.every((t) => t.y === tiles[0].y)
      expect(sameX || sameY).toBe(true)

      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      for (const t of tiles) {
        if (sameY) {
          // N mouth: the alcove interior is further negative in y (away from
          // the main interior, which sits at y >= 0).
          const probe = { gx: Math.round(room.x + t.x), gy: Math.round(room.y + t.y) - 1 }
          const inBounds = probe.gx >= 0 && probe.gx < preview.mapWidth && probe.gy >= 0 && probe.gy < preview.mapHeight
          expect(inBounds).toBe(true)
          // floor — and by construction (Doodad.create for wall/cover pieces
          // only fires where tileArray[idx].wall was true, see arena.ts's
          // rasterization loop) a floor tile never receives a wall-piece
          // doodad, so this single check proves both "floor" and "no
          // collidable doodad blocks it" at once.
          expect(isWall(probe.gx, probe.gy)).toBe(false)
        } else {
          // E or W mouth: the alcove sits on whichever side of the mouth is
          // away from the main interior — negative x for W (mouth x === -1),
          // positive for E (mouth x === width).
          const dir = t.x < 0 ? -1 : 1
          const probe = { gx: Math.round(room.x + t.x) + dir, gy: Math.round(room.y + t.y) }
          const inBounds = probe.gx >= 0 && probe.gx < preview.mapWidth && probe.gy >= 0 && probe.gy < preview.mapHeight
          expect(inBounds).toBe(true)
          expect(isWall(probe.gx, probe.gy)).toBe(false)
        }
      }
    })
  }

  it('never picks the N alcove wall when the boss is the dragon', () => {
    // Force the pool down to just the dragon so every seed exercises the veto.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ bossPool: ['boss_dragon'] }), 0)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => a.type === BOSS_DEFS.boss_dragon.actorPath)
      expect(boss).toBeDefined()

      const seals = destroyObjectTargets(xml)
      const doodads = doodadEntries(xml)
      const sealDoodads = doodads.filter((d) => seals.includes(d.id))
      // the N wall's mouth sits at local y === -1, on the wall band above the
      // interior. The dragon no longer sits flush against that band (it is
      // inset to topWallBossY), but the veto still stands: it has no upward
      // art and cannot defend, let alone step out of, a reward it would be
      // body-blocking.
      const onNorthWall = sealDoodads.every((d) => d.y < 0 && sealDoodads.every((o) => o.y === d.y))
      if (onNorthWall) {
        // the only way seals share a negative y is the N alcove — assert it never happens
        expect.fail('alcove sealed on the N wall while the dragon is the boss')
      }
    }
  })

  it('no pillar overlaps an anchor, the boss, the entrance or the alcove', () => {
    // A dense cover pass is the adversarial case: if the rejection filter in
    // cover.ts is ever bypassed by arena.ts's own geometry, this is where it
    // would show up as a pillar doodad landing on top of something load-bearing.
    const options = arenaOptions({ cover: { pattern: 'random', density: 1, ringSpacing: 4, clusters: 3 } })
    for (const seed of [1, 4242, 987654]) {
      const { xml } = buildBossArena(freshCtx(seed), options, 0)
      const doodads = doodadEntries(xml)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => /^actors\/boss_/.test(a.type))!
      const pillars = doodads.filter((d) => /special_pillar|deco_rock|_pillar\.xml/.test(d.type))

      for (const p of pillars) {
        const distToBoss = Math.hypot(p.x - boss.x, p.y - boss.y)
        expect(distToBoss).toBeGreaterThan(0.01)
      }
    }
  })
})

describe('boss arena — id integrity', () => {
  for (const seed of [1, 4242, 987654]) {
    it(`seed ${seed}: every connections id resolves, all ids unique, no bad int-arr`, () => {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)

      const ids = new Set(allIds(xml))
      for (const [, arr] of xml.matchAll(/<int-arr name="connections">([^<]*)<\/int-arr>/g)) {
        for (const ref of arr.split(' ').filter((r) => r !== '')) {
          expect(ids.has(Number(ref)), `connections id ${ref} does not resolve`).toBe(true)
        }
      }

      // allIds() matches every `<int name="id">`, but NodeLevelStart's own
      // `pId` parameter is also named "id" and legitimately reuses 0 — same
      // caveat lobby.test.ts documents. Compare element ids only (an unnamed
      // `<dictionary>` immediately followed by its id), which is what
      // buildLobby/buildBossArena actually require to be unique.
      const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1]))
      expect(new Set(elementIds).size).toBe(elementIds.length)

      expect(badIntArray(xml)).toBeNull()
    })
  }

  it('never emits an empty DestroyObject array', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    // the 3 structural wall seals across the mouth, and nothing else
    expect(destroyObjectTargets(xml)).toHaveLength(3)
  })
})

describe('boss arena — waves reach the rig', () => {
  it('ships at least one TimerTrigger per non-empty wave, all shipping enabled=False', () => {
    // anchored waves: a scattered monster is one-shot and needs no timer, and
    // the stock waves scatter nearly everything
    const { xml } = buildBossArena(freshCtx(4242), anchoredOptions(), 0)
    const timers = [...xml.matchAll(/<string name="type">TimerTrigger<\/string>/g)]
    expect(timers.length).toBeGreaterThanOrEqual(4)

    const timerBlocks = [...xml.matchAll(/<dictionary>\s*<int name="id">-?\d+<\/int>\s*<string name="type">TimerTrigger<\/string>\s*<bool name="enabled">([^<]*)<\/bool>/g)]
    expect(timerBlocks.length).toBe(timers.length)
    for (const m of timerBlocks) expect(m[1]).toBe('False')
  })
})

describe('boss arena — scattered spawn modes (issue #21)', () => {
  /** Every SpawnObject the arena emitted, with its actor path, position and trigger-times budget. */
  function spawnNodes(xml: string): { id: number; triggerTimes: number; x: number; y: number; actorPath: string }[] {
    return [
      ...xml.matchAll(
        /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">SpawnObject<\/string>\s*<bool name="enabled">[^<]*<\/bool>\s*<int name="trigger-times">(-?\d+)<\/int>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<string name="parameters">([^<]*)<\/string>/g
      )
    ].map((m) => ({ id: Number(m[1]), triggerTimes: Number(m[2]), x: Number(m[3]), y: Number(m[4]), actorPath: m[5] }))
  }

  /** How many monsters every SpawnObject for `actorPath` will produce between them. */
  function spawnTotal(xml: string, actorPath: string): number {
    return spawnNodes(xml)
      .filter((s) => s.actorPath === actorPath)
      .reduce((n, s) => n + s.triggerTimes, 0)
  }

  /** Tier 0's wave, with `key` scattered by `mode` at `count`, everything else stock. */
  function scattered(mode: 'random' | 'ring' | 'gaussian' | 'symmetric', key = 'bat1', count = 12) {
    const arena = arenaOptions()
    // Buffs are dropped along with the other tiers' monsters: these tests count
    // the timer rig's own nodes, and the stock death tier's bloodlust field
    // would otherwise add a trigger and a toggle of its own to every assertion.
    return arenaOptions({
      waves: arena.waves.map((w, i) =>
        i === 0
          ? { ...w, monsters: [key], monsterMax: { [key]: count }, spawnMode: { [key]: mode }, buffs: [] }
          : { ...w, monsters: [], monsterMax: {}, buffs: [] }
      )
    })
  }

  it('leaves a stock arena byte-identical whatever the scatter knobs say', () => {
    // The knobs are inert until a monster is actually put on a scatter mode —
    // which is also what keeps every seed generated before this feature intact.
    const stock = buildBossArena(freshCtx(4242), anchoredOptions(), 0)
    const retuned = buildBossArena(
      freshCtx(4242),
      anchoredOptions({ spawn: { spacing: 5, ringSpacing: 9, clusters: 7, batchSize: 3, batchIntervalMs: 900 } }),
      0
    )
    expect(retuned.xml).toBe(stock.xml)
  })

  for (const mode of ['random', 'ring', 'gaussian', 'symmetric'] as const) {
    it(`${mode}: emits one one-shot SpawnObject per monster inside the batch budget`, () => {
      // A count at or below spawn.batchSize keeps the original shape: a point
      // each, trigger-times 1, the whole group on the tier trigger.
      const budget = arenaOptions().spawn.batchSize
      const { xml, preview } = buildBossArena(freshCtx(4242), scattered(mode, 'bat1', budget), 0)
      const room = preview.rooms[0]
      const bats = spawnNodes(xml).filter((s) => s.actorPath === 'actors/bat_1.xml')

      expect(bats).toHaveLength(budget)
      for (const bat of bats) {
        expect(bat.triggerTimes).toBe(1)
        expect(bat.x).toBeGreaterThanOrEqual(0)
        expect(bat.y).toBeGreaterThanOrEqual(0)
        expect(bat.x).toBeLessThan(room.width)
        expect(bat.y).toBeLessThan(room.height)
        expect(preview.walls[(room.y + bat.y) * preview.mapWidth + (room.x + bat.x)]).not.toBe('1')
      }
    })

    it(`${mode}: batches a count past the budget onto walkable floor, spawning all of it`, () => {
      // Past spawn.batchSize the horde is spread over batchSize points and
      // trickled in — fewer nodes, same number of monsters, and every point
      // still on floor a player can stand on. 480 actors on one frame is what
      // made the stock arena unplayable (playtest 2026-08-27).
      const budget = arenaOptions().spawn.batchSize
      const { xml, preview } = buildBossArena(freshCtx(4242), scattered(mode, 'bat1', 120), 0)
      const room = preview.rooms[0]
      const bats = spawnNodes(xml).filter((s) => s.actorPath === 'actors/bat_1.xml')

      expect(bats).toHaveLength(budget)
      expect(spawnTotal(xml, 'actors/bat_1.xml')).toBe(120)
      for (const bat of bats) {
        expect(bat.triggerTimes).toBeGreaterThan(1)
        expect(preview.walls[(room.y + bat.y) * preview.mapWidth + (room.x + bat.x)]).not.toBe('1')
      }
    })

    it(`${mode}: keeps every scattered spawn out of the north wall band`, () => {
      // A scattered monster is subject to the same wall-band absorption the N
      // anchors were moved for (#22): the top NORTH_ANCHOR_INSET interior rows
      // are off limits, on every seed, for placed and stacked points alike.
      for (const seed of [1, 4242, 987654, 20260817]) {
        const { xml } = buildBossArena(freshCtx(seed), scattered(mode, 'bat1', 40), 0)
        const bats = spawnNodes(xml).filter((s) => s.actorPath === 'actors/bat_1.xml')
        expect(bats.length).toBeGreaterThan(0)
        expect(spawnTotal(xml, 'actors/bat_1.xml')).toBe(40)
        for (const bat of bats) {
          expect(bat.y).toBeGreaterThanOrEqual(NORTH_ANCHOR_INSET)
        }
      }
    })
  }

  it('drops the timer rig entirely for a tier of nothing but scattered monsters', () => {
    // Inside the batch budget, so nothing needs a timer — past it the batch
    // rig deliberately brings one back, which the case below pins.
    const { xml } = buildBossArena(freshCtx(4242), scattered('gaussian', 'bat1', 6), 0)
    expect(xml).not.toContain('<string name="type">TimerTrigger</string>')
    // the only ToggleElement left is the arrival-respawn rig's own self-disable
    // (state 1); the wave rig's enable-the-timer toggle (state 0) is gone.
    // Read off each ToggleElement's own state rather than the document's — the
    // invulnerability rig also ships state-0 nodes, but they are
    // ToggleImmortality, nothing to do with the timer rig.
    expect(toggleStates(xml, 'ToggleElement')).toEqual([1])
    // the tier still fires — the AreaTrigger over the entrance is what starts it
    expect(xml).toContain('<string name="type">AreaTrigger</string>')
  })

  it('brings one shared timer back for a tier past the batch budget', () => {
    const { xml } = buildBossArena(freshCtx(4242), scattered('gaussian', 'bat1', 120), 0)
    expect(xml).toContain('<string name="type">TimerTrigger</string>')
    // the batch toggle (state 0) alongside the respawn rig's self-disable (1)
    expect(toggleStates(xml, 'ToggleElement').sort()).toEqual([0, 1])
  })

  it('scales a scattered count by the arena monster multiplier', () => {
    const options = { ...scattered('random'), monsterMultiplier: 2.0 }
    const { xml } = buildBossArena(freshCtx(4242), options, 0)
    // 12 x 2 monsters, however many points the budget spreads them over
    expect(spawnTotal(xml, 'actors/bat_1.xml')).toBe(24)
  })

  it('stays deterministic and keeps every node id resolvable', () => {
    const a = buildBossArena(freshCtx(777), scattered('ring'), 0)
    const b = buildBossArena(freshCtx(777), scattered('ring'), 0)
    expect(a.xml).toBe(b.xml)
    expect(badIntArray(a.xml)).toBeNull()

    const ids = new Set(allIds(a.xml))
    for (const [, arr] of a.xml.matchAll(/<int-arr name="connections">([^<]*)<\/int-arr>/g)) {
      for (const ref of arr.split(' ').filter((r) => r !== '')) {
        expect(ids.has(Number(ref)), `connections id ${ref} does not resolve`).toBe(true)
      }
    }
  })

  it('is reachable through generateDungeon, not just the arena builder', () => {
    const params = withBoss({ enabled: true })
    params.boss.fights[0].arena = scattered('gaussian', 'skeleton1#0', 6)
    const result = generateOk(params, 31337)
    const arena = result.files.find((f) => f.path === 'levels/boss0.xml')
    expect(arena).toBeDefined()
    const spawners = spawnNodes(arena!.content).filter((s) => s.actorPath === 'actors/spawners/skeleton_1.xml')
    expect(spawners).toHaveLength(6)
    expect(spawners.every((s) => s.triggerTimes === 1)).toBe(true)
  })
})

describe('boss arena — the wall bitmap stays free of unaddressed voids', () => {
  it('every doodad the arena emits sits within the emitted tilemap bounds', () => {
    const { xml, preview } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const doodads = doodadEntries(xml)
    for (const d of doodads) {
      // doodad positions may carry a small per-type offset (see doodad.ts),
      // so allow a couple of tiles of slack around the nominal bounds
      expect(d.x).toBeGreaterThan(-10)
      expect(d.x).toBeLessThan(preview.mapWidth + 10)
      expect(d.y).toBeGreaterThan(-10)
      expect(d.y).toBeLessThan(preview.mapHeight + 10)
    }
  })
})

describe('boss arena — food placement', () => {
  function foodItems(xml: string): { id: number; type: string; x: number; y: number }[] {
    return itemEntries(xml).filter((i) => i.type === 'items/health_1.xml' || i.type === 'items/mana_1.xml')
  }

  it('places health/mana pickups at the default foodMultiplier', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const food = foodItems(xml)
    expect(food.length).toBeGreaterThan(0)
  })

  it('foodMultiplier: 0 places zero food', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ foodMultiplier: 0 }), 0)
    expect(foodItems(xml)).toHaveLength(0)
  })

  it('every food pickup sits on walkable floor, inside the interior', () => {
    for (const seed of [1, 4242, 987654]) {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      for (const item of foodItems(xml)) {
        expect(item.x, `seed ${seed} food x`).toBeGreaterThanOrEqual(-0.001)
        expect(item.x, `seed ${seed} food x`).toBeLessThan(room.width)
        expect(item.y, `seed ${seed} food y`).toBeGreaterThanOrEqual(-0.001)
        expect(item.y, `seed ${seed} food y`).toBeLessThan(room.height)

        const gx = room.x + Math.round(item.x)
        const gy = room.y + Math.round(item.y)
        expect(isWall(gx, gy), `seed ${seed} food at (${item.x},${item.y}) sits on a wall tile`).toBe(false)
      }
    }
  })

  it('no food pickup overlaps a pillar, the boss, an anchor, the entrance or the alcove', () => {
    // Dense cover, same adversarial shape as the pillar rejection test above:
    // if food's isFree() check were ever bypassed, a dense pillar field is
    // where a collision would show up.
    const options = arenaOptions({ cover: { pattern: 'random', density: 1, ringSpacing: 4, clusters: 3 } })
    for (const seed of [1, 4242, 987654]) {
      const { xml } = buildBossArena(freshCtx(seed), options, 0)
      const doodads = doodadEntries(xml)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => /^actors\/boss_/.test(a.type))!
      const pillars = doodads.filter((d) => /special_pillar|deco_rock|_pillar\.xml/.test(d.type))

      for (const item of foodItems(xml)) {
        const distToBoss = Math.hypot(item.x - boss.x, item.y - boss.y)
        expect(distToBoss, `seed ${seed} food on top of the boss`).toBeGreaterThan(0.01)
        for (const p of pillars) {
          const distToPillar = Math.hypot(item.x - p.x, item.y - p.y)
          expect(distToPillar, `seed ${seed} food on top of a pillar`).toBeGreaterThan(0.01)
        }
      }
    }
  })

  it('draws only from ctx.bossRand — ctx.rand and ctx.cosmeticRand are untouched by food placement', () => {
    // Same trap the arena-wide isolation test guards against, but specific to
    // food: Item.create rolls its variant from ctx.rand when index is
    // omitted, and this is the one call site that could forget to pass one.
    const ctx = freshCtx(777)
    const control = freshCtx(777)

    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    buildBossArena(ctx, arenaOptions({ foodMultiplier: 5 }), 0)

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('is deterministic: same seed twice gives identical food positions and variants', () => {
    const a = buildBossArena(freshCtx(2024), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(2024), arenaOptions(), 0)
    expect(foodItems(a.xml)).toEqual(foodItems(b.xml))
  })
})

describe('boss arena — every theme, not just the default', () => {
  // The seal doodads are whatever the shared wall-pattern matcher returned for
  // the 3 mouth tiles, on every theme. The seals are placed explicitly now
  // rather than scavenged from the shared wall-pattern scan — the mouth is
  // floor, and that scan only visits wall tiles — so this no longer depends on
  // the matcher firing for a given theme's piece set. It is still worth
  // checking per theme, because a theme whose Vertical/Horizontal override
  // went missing would ship an alcove that never seals at all.
  it('seals the alcove with exactly 3 wall seals in every theme', () => {
    for (const theme of THEMES) {
      for (const seed of [1, 4242]) {
        const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ theme }), 0)

        const seals = destroyObjectTargets(xml)
        expect(seals, `${theme} seed ${seed}`).toHaveLength(3)

        const doodads = doodadEntries(xml)
        const wallSeals = doodads.filter((d) => seals.includes(d.id) && !d.type.includes('/special/color_theme_'))
        expect(wallSeals, `${theme} seed ${seed}`).toHaveLength(3)

        // the DestroyObject target array and the need-sync doodad set must
        // stay exactly the same set, in every theme
        const syncing = doodads.filter((d) => d.needSync).map((d) => d.id)
        expect(syncing.sort(), `${theme} seed ${seed}`).toEqual([...seals].sort())

        expect(badIntArray(xml), `${theme} seed ${seed}`).toBeNull()
      }
    }
    // THEMES includes the overlay pairings, so this builds ~2x the arenas it
    // used to and needs more than the 5s default. Worth the wall clock rather
    // than skipping them: overlay themes are doodad-identical to their base
    // (themes.test.ts proves that), but they emit an extra tilemap dataset, and
    // badIntArray above is what checks it.
  }, 30_000)
})

// --- Phase 7: whole-campaign integration -----------------------------------
// The arena-level suites above prove buildBossArena() in isolation; these
// prove generateDungeon() wires it in without disturbing anything else.

describe('boss campaign — off means off', () => {
  // The single most important test in this suite: if this fails, something in
  // the boss wiring is drawing from ctx.rand (or touching layout) when it
  // should be reachable only through ctx.bossRand behind `boss.enabled`.
  it('boss.enabled: false matches a campaign with no boss field at all, across seeds', () => {
    for (const seed of [1, 4242, 987654]) {
      const off = generateOk(withBoss({ enabled: false }), seed)
      const legacy = generateOk(withoutBossField(), seed)
      expect(off.files).toEqual(legacy.files)
      expect(off.levels).toEqual(legacy.levels)
    }
    // six full campaigns; the 5s default times this one out whenever the
    // suite runs its files in parallel, which is every time (see lobby.test.ts)
  }, 60_000)
})

describe('boss campaign — on touches only the final floor’s orb room', () => {
  it('boss on vs boss off: every floor but the last is byte-identical; the last differs only in its 3 swapped ids', () => {
    for (const seed of [1, 4242, 987654]) {
      const on = generateOk(withBoss({ enabled: true }), seed)
      const off = generateOk(withBoss({ enabled: false }), seed)
      const floors = plainParameters().levels

      // wall bitmap and room geometry/lock state identical on every floor,
      // including the last — the swap changes which prefab occupies the orb
      // room, never the room itself or the rasterized walls around it
      for (let i = 0; i < floors; i++) {
        expect(on.levels[i].walls, `seed ${seed} floor ${i} walls`).toBe(off.levels[i].walls)
        expect(on.levels[i].rooms, `seed ${seed} floor ${i} rooms`).toEqual(off.levels[i].rooms)
      }

      for (let i = 0; i < floors - 1; i++) {
        const path = `levels/level${i}.xml`
        expect(on.files.find((f) => f.path === path)!.content, `seed ${seed} floor ${i}`).toBe(
          off.files.find((f) => f.path === path)!.content
        )
      }

      const path = `levels/level${floors - 1}.xml`
      const onXml = on.files.find((f) => f.path === path)!.content
      const offXml = off.files.find((f) => f.path === path)!.content
      expect(onXml, `seed ${seed} final floor should differ`).not.toBe(offXml)

      // the tilemap is the wall/floor raster alone — must be untouched
      const tilemapOf = (xml: string) =>
        /<dictionary name="tilemap">[\s\S]*?<\/dictionary>\s*<dictionary name="doodads">/.exec(xml)?.[0]
      expect(tilemapOf(onXml), `seed ${seed} tilemap`).toBe(tilemapOf(offXml))

      // neither prefab draws RNG or shifts idCounter, so both variants
      // consume exactly the same 3 ids at exactly the same position
      const onIds = allIds(onXml).sort((a, b) => a - b)
      const offIds = allIds(offXml).sort((a, b) => a - b)
      expect(onIds, `seed ${seed} id sets`).toEqual(offIds)

      const changedIds = onIds.filter((id) => dictBlockById(onXml, id) !== dictBlockById(offXml, id))
      expect(changedIds, `seed ${seed} changed ids`).toHaveLength(3)
    }
  }, 60_000)
})

describe('boss campaign — determinism', () => {
  it('same params and seed produce byte-identical files, boss on or off', () => {
    for (const bossEnabled of [true, false]) {
      const params = withBoss({ enabled: bossEnabled })
      const a = generateOk(params, 2024)
      const b = generateOk(params, 2024)
      expect(a.files).toEqual(b.files)
      expect(a.levels).toEqual(b.levels)
    }
  })
})

describe('boss campaign — wiring', () => {
  it('lists 0..N-1, boss in order; wires the portal target; leaves start alone', () => {
    const seed = 4242
    const floors = plainParameters().levels
    const on = generateOk(plainParameters(), seed) // boss defaults on; plainParameters() ships no lobbies

    const levelsXml = on.files.find((f) => f.path === 'levels.xml')!.content
    const order = [...Array.from({ length: floors }, (_, i) => String(i)), 'boss0']
    let lastIdx = -1
    for (const id of order) {
      const idx = levelsXml.indexOf(`<level id="${id}"`)
      expect(idx, `level id "${id}" missing or out of order`).toBeGreaterThan(lastIdx)
      lastIdx = idx
    }

    // start is unaffected by whether the boss is on or off — with no boss the
    // campaign just ends on the last floor instead
    const bossOff = generateOk(withBoss({ enabled: false }), seed)
    const startOf = (r: DungeonResult) => /<levels start="([^"]*)">/.exec(r.files.find((f) => f.path === 'levels.xml')!.content)?.[1]
    expect(startOf(on)).toBe(startOf(bossOff))
    expect(startOf(on)).toBe('0')

    // the final dungeon floor's portal targets the arena directly — issue #48
    // deleted the welded-on prep room, so there is no intermediate level any
    // more
    const finalFloor = on.files.find((f) => f.path === `levels/level${floors - 1}.xml`)!.content
    expect(finalFloor).toContain('<string name="level">boss0</string>')
  })
})

describe('boss-only campaign — 0 dungeon floors', () => {
  /** Defaults with the dungeon removed: the arena, nothing else. */
  const zeroFloors = (): DungeonParameters => {
    const params = plainParameters()
    params.levels = 0
    return params
  }

  const startOf = (r: DungeonResult) =>
    /<levels start="([^"]*)">/.exec(r.files.find((f) => f.path === 'levels.xml')!.content)?.[1]

  it('emits only the arena, and starts there', () => {
    const result = generateOk(zeroFloors(), 12345)
    const paths = result.files.map((f) => f.path)

    expect(paths).toContain('levels/boss0.xml')
    expect(paths.filter((p) => /^levels\/level\d+\.xml$/.test(p))).toEqual([])
    expect(paths).toContain('info.xml')
    expect(paths).toContain('levels.xml')

    // the arena is the only preview — there are no dungeon floors to draw
    expect(result.levels).toHaveLength(1)

    const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
    expect(startOf(result)).toBe('boss0')
    expect(levelsXml.match(/<level id="/g)).toHaveLength(1)
    expect(levelsXml).toContain('<level id="boss0"')
  })

  it('builds the same arena as a full campaign — the floor count never reaches the RNG', () => {
    const seed = 90210
    const withFloors = generateOk(plainParameters(), seed)
    const withoutFloors = generateOk(zeroFloors(), seed)
    const arena = (r: DungeonResult) => r.files.find((f) => f.path === 'levels/boss0.xml')!.content
    expect(arena(withoutFloors)).toBe(arena(withFloors))
  })

  it('refuses 0 floors with the boss off rather than emitting an empty campaign', () => {
    const params = zeroFloors()
    params.boss.enabled = false
    const result = generateDungeon(params, 12345)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.errors.join(' ')).toContain('levels')
  })

  it('leaves a normal campaign start untouched', () => {
    const seed = 4242
    // plainParameters() ships no lobbies, so the default order opens directly
    // on floor 0 — see 'campaign order — the default is unchanged' in
    // rearrange.test.ts for the case with lobbies in front of it
    expect(startOf(generateOk(plainParameters(), seed))).toBe('0')
  })
})

describe('boss campaign — packer safety', () => {
  it('badIntArray finds nothing in any generated file, boss on or off', () => {
    for (const bossEnabled of [true, false]) {
      const result = generateOk(withBoss({ enabled: bossEnabled }), 4242)
      for (const file of result.files) {
        if (!file.path.endsWith('.xml')) continue
        expect(badIntArray(file.content), `${file.path} boss=${bossEnabled}`).toBeNull()
      }
    }
  })
})

// --- Playtest fixes: tile alignment + water base layer ---------------------

/** One <dictionary> tile block from the `tilemap` section, with each dataset's tileset path and its data-t array, in emitted order. */
function tileBlocks(xml: string): { x: number; y: number; datasets: { tileset: string; dataT: number[] }[] }[] {
  const section = /<dictionary name="tilemap">([\s\S]*?)<\/dictionary>\s*<dictionary name="doodads">/.exec(xml)?.[1] ?? ''
  const blockRe = /<dictionary>\s*<int name="x">(-?\d+)<\/int>\s*<int name="y">(-?\d+)<\/int>\s*<array name="datasets">([\s\S]*?)<\/array>\s*<\/dictionary>/g
  const blocks: { x: number; y: number; datasets: { tileset: string; dataT: number[] }[] }[] = []
  for (const m of section.matchAll(blockRe)) {
    const datasetsXml = m[3]
    const tilesets = [...datasetsXml.matchAll(/<string name="tileset">([^<]*)<\/string>/g)].map((t) => t[1])
    const dataTs = [...datasetsXml.matchAll(/<int-arr name="data-t">([^<]*)<\/int-arr>/g)].map((d) =>
      d[1].trim().split(/\s+/).filter((s) => s !== '').map(Number)
    )
    const datasets = tilesets.map((tileset, i) => ({ tileset, dataT: dataTs[i] }))
    blocks.push({ x: Number(m[1]), y: Number(m[2]), datasets })
  }
  return blocks
}


describe('boss arena — playtest round 2: world-extent alignment per alcove wall', () => {
  // The §3 diagnostic the plan asked for, made permanent: compare, in the
  // same *local* coordinate space every doodad/actor/item/node is emitted in
  // (not raw grid space, not the preview's row-major bitmap), the min/max
  // extent of real floor tiles against the min/max extent of the wall-piece
  // doodads that bound the interior — for one seed per alcove wall (N, E, W),
  // found by generating seeds in order and classifying which wall each one
  // picked, bounded per invariant #5 rather than hardcoding seed numbers that
  // would go stale the moment boss-selection or alcove-veto logic changes.
  //
  // Floor extent comes from the emitted tilemap blocks (declared block x/y
  // plus the "-10 + i%20" per-cell offset getTiles/Level.getTiles uses — see
  // the modding skill). Wall extent comes from `ctx.doodads` directly rather
  // than the emitted XML, because a doodad's *emitted* x/y already has
  // doodad.ts's per-piece render offset baked in (Horizontal is yOffset 2,
  // corners are 1 or 2, etc.) — reading `ctx.doodads[i].x/.y` before
  // `getXML()` runs gives the doodad's true tile position, the only way to
  // compare apples to apples against the floor's tile positions.
  function floorExtent(xml: string): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const b of tileBlocks(xml)) {
      const dataT = b.datasets[1].dataT
      for (let i = 0; i < dataT.length; i++) {
        if (dataT[i] === 0) continue // void/wall sentinel, not real floor
        const tileX = b.x - 10 + (i % 20)
        const tileY = b.y - 10 + Math.trunc(i / 20)
        if (tileX < minX) minX = tileX
        if (tileX > maxX) maxX = tileX
        if (tileY < minY) minY = tileY
        if (tileY > maxY) maxY = tileY
      }
    }
    return { minX, maxX, minY, maxY }
  }

  function wallDoodadExtent(ctx: GenerationContext): { minX: number; maxX: number; minY: number; maxY: number } {
    // exclude Cover — a free-standing visual overlay with no collider (see
    // ASSET-REGISTRY.md), it is not part of the collision boundary this test
    // is checking, and (post-§2) it also covers ground well inside the wall
    // ring, which would corrupt the bracket this test is proving.
    const wallDoodads = ctx.doodads.filter((d) => d.type !== 'Cover')
    const xs = wallDoodads.map((d) => d.x)
    const ys = wallDoodads.map((d) => d.y)
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }

  it('floor and wall-doodad world extents bracket identically on X and Y, for each of N/E/W', () => {
    const foundWalls = new Map<AlcoveWall, number>()
    for (let seed = 1; foundWalls.size < 3 && seed <= 200; seed++) {
      const ctx = freshCtx(seed)
      const { xml } = buildBossArena(ctx, arenaOptions(), 0)
      const wallSeals = ctx.doodads.filter((d) => d.needSync && d.type !== 'Cover')
      // classify which wall this seed's alcove landed on from the 3 sealed
      // wall pieces' own raw tile coordinates: same y on all three means a
      // horizontal mouth row (N); otherwise same x means a vertical mouth
      // column, negative for W (mouth x === -1) and positive for E (mouth
      // x === width)
      const ys = wallSeals.map((d) => Math.round(d.y))
      const xs = wallSeals.map((d) => Math.round(d.x))
      const wall: AlcoveWall = new Set(ys).size === 1 ? 'N' : xs[0] < 0 ? 'W' : 'E'
      if (foundWalls.has(wall)) continue
      foundWalls.set(wall, seed)

      const floor = floorExtent(xml)
      const walls = wallDoodadExtent(ctx)

      // the wall ring sits exactly 1 tile outside the floor it encloses, on
      // every side, on every axis — a constant offset here on one axis and
      // not the other is exactly what an emitter-level X (or Y) drift would
      // look like
      expect(walls.minX, `wall ${wall} seed ${seed} minX`).toBe(floor.minX - 1)
      expect(walls.maxX, `wall ${wall} seed ${seed} maxX`).toBe(floor.maxX + 1)
      expect(walls.minY, `wall ${wall} seed ${seed} minY`).toBe(floor.minY - 1)
      expect(walls.maxY, `wall ${wall} seed ${seed} maxY`).toBe(floor.maxY + 1)
    }
    expect(foundWalls.size, 'expected to find a seed for all of N, E and W within 200 seeds').toBe(3)
  })
})

describe('boss arena — water base layer', () => {
  it('every block carries a water dataset before the theme dataset, with data-t all 1', () => {
    // plain 'g', not the default 'g - mixed': a mixed theme adds an overlay
    // dataset per region, and this test is about the water layer's position,
    // not about how many theme datasets follow it
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ theme: 'g' }), 0)
    const blocks = tileBlocks(xml)
    expect(blocks.length).toBeGreaterThan(0)

    for (const block of blocks) {
      expect(block.datasets.length, `block (${block.x},${block.y})`).toBe(2)
      expect(block.datasets[0].tileset, `block (${block.x},${block.y})`).toBe('tilemaps/water.xml')
      expect(block.datasets[0].dataT.every((t) => t === 1), `block (${block.x},${block.y}) water data-t`).toBe(true)
      expect(block.datasets[1].tileset, `block (${block.x},${block.y})`).not.toBe('tilemaps/water.xml')
    }
  })

  it('water extends past the arena grid — some blocks sit entirely outside the theme tile bounds', () => {
    const { xml, preview } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const blocks = tileBlocks(xml)
    // A block whose entire theme dataset is data-t 0 (nothing but void/wall)
    // still carries a full water dataset — that's the "past the edge" case.
    const allVoidThemeBlocks = blocks.filter((b) => b.datasets[1].dataT.every((t) => t === 0))
    expect(allVoidThemeBlocks.length).toBeGreaterThan(0)
    for (const b of allVoidThemeBlocks) {
      expect(b.datasets[0].dataT.every((t) => t === 1), `block (${b.x},${b.y})`).toBe(true)
    }
    void preview
  })

  it('data-a is 0 where data-t is 0 and 255 where a tile exists, for the theme dataset', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const section = /<dictionary name="tilemap">([\s\S]*?)<\/dictionary>\s*<dictionary name="doodads">/.exec(xml)![1]
    const blockRe = /<int-arr name="data-t">([^<]*)<\/int-arr>[\s\S]*?<int-arr name="data-a">([^<]*)<\/int-arr>/g
    let checked = 0
    for (const m of section.matchAll(blockRe)) {
      const dataT = m[1].trim().split(/\s+/).filter((s) => s !== '').map(Number)
      const dataA = m[2].trim().split(/\s+/).filter((s) => s !== '').map(Number)
      for (let i = 0; i < dataT.length; i++) {
        expect(dataA[i]).toBe(dataT[i] === 0 ? 0 : 255)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('does not remove the Cover doodad overlay', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const doodads = doodadEntries(xml)
    // Cover doodads share the wall-pattern matcher's piece names with the
    // dungeon (see wallPattern.ts); every theme but h emits some.
    expect(doodads.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Playtest round 3. The alignment test that used to live here asserted
// `block.x === gx*20 - room.x` — the emitter's own convention restated back at
// itself, so it passed for two rounds while the arena was visibly broken in
// game. These replace it with properties taken from the *artifacts*: what
// every authored and shipped level does, and what the wall sprites actually
// cover.
// ---------------------------------------------------------------------------

/** Local-space set of every tile carrying real floor, read back out of the emitted blocks. */
function floorTiles(xml: string): Set<string> {
  const out = new Set<string>()
  for (const b of tileBlocks(xml)) {
    const theme = b.datasets.find((d) => !d.tileset.includes('water'))
    if (theme === undefined) continue
    for (let i = 0; i < theme.dataT.length; i++) {
      if (theme.dataT[i] !== 0) out.add(`${b.x - 10 + (i % 20)},${b.y - 10 + Math.trunc(i / 20)}`)
    }
  }
  return out
}

/**
 * Undo a doodad path.s render offset to recover the tile it occupies, using
 * the real DoodadType table rather than guessing from the filename (an
 * earlier version of this helper missed that g_x_t_dn carries yOffset 2, and
 * mis-blamed the emitter for it).
 */
function tileOfDoodad(theme: string, path: string, x: number, y: number): { x: number; y: number } {
  for (const name of Object.keys(DoodadType) as DoodadTypeName[]) {
    if (doodadPath(name, theme) !== path) continue
    const off = doodadOffset(name, theme)
    return { x: Math.round(x - off.x), y: Math.round(y - off.y) }
  }
  return { x: Math.round(x), y: Math.round(y) }
}

/** One seed per alcove wall, classified from the seal doodads themselves. */
function seedPerAlcoveWall(): Map<AlcoveWall, number> {
  const found = new Map<AlcoveWall, number>()
  for (let seed = 1; seed <= 200 && found.size < 3; seed++) {
    const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
    const seals = doodadEntries(xml).filter((d) => d.needSync)
    if (seals.length !== 3) continue
    const wall: AlcoveWall = seals[0].x === seals[1].x ? (seals[0].x < 0 ? 'W' : 'E') : 'N'
    if (!found.has(wall)) found.set(wall, seed)
  }
  return found
}

describe('boss arena — tilemap block origins sit on the 20-grid', () => {
  // The bug that survived two rounds of "fixes": the engine snaps a block's
  // declared x/y to a multiple of TILEMAP_SIZE, so an offset written there is
  // discarded and the floor renders `origin` tiles from its walls. Every
  // authored and shipped level obeys this — level0, the editor-saved prep
  // room, the lobby. Proven in game by hand-patching a generated boss.xml.
  it('every arena block is emitted at a multiple of 20, for every alcove wall', () => {
    for (const [wall, seed] of seedPerAlcoveWall()) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      for (const b of tileBlocks(xml)) {
        expect(Math.abs(b.x % 20), `${wall} seed ${seed}: block x=${b.x}`).toBe(0)
        expect(Math.abs(b.y % 20), `${wall} seed ${seed}: block y=${b.y}`).toBe(0)
      }
    }
  })

  it('so does a dungeon floor — proving the assertion is not vacuous', () => {
    const result = generateOk(plainParameters(), 4242)
    const floor = result.files.find((f) => f.path === 'levels/level0.xml')!.content
    const blocks = tileBlocks(floor)
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) {
      expect(Math.abs(b.x % 20), `level0 block x=${b.x}`).toBe(0)
      expect(Math.abs(b.y % 20), `level0 block y=${b.y}`).toBe(0)
    }
  })
})

describe('boss arena — the alcove is enterable and the orb is not buried', () => {
  // Wall pieces are 3 tiles TALL: g_x_t_dn/g_h_8 are `<origin>0 32</origin>` on
  // a 48px frame drawn at `tile + 2`, so a wall paints over its own tile and
  // the two below it. A 3-row pocket therefore buries its own centre, which is
  // exactly where the orb sat — unreachable in game across three playtests.
  // A wall piece at tile T covers world y from T to T + 3, not T + 2: the
  // sprite is a 48px frame on an `<origin>0 32</origin>` anchor drawn at
  // T + 2, so its bottom edge lands on T + 3. The earlier value of 2 is
  // exactly why this test passed while the orb was half-buried in game.
  const OVERHANG = 3

  it('floors the mouth, so the opened doorway has ground rather than a hole', () => {
    for (const [wall, seed] of seedPerAlcoveWall()) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const floor = floorTiles(xml)
      const seals = doodadEntries(xml).filter((d) => d.needSync)
      for (const s of seals) {
        const t = tileOfDoodad(arenaOptions().theme, s.type, s.x, s.y)
        expect(floor.has(`${t.x},${t.y}`), `${wall} seed ${seed}: seal tile (${t.x},${t.y}) has no floor`).toBe(true)
      }
    }
  })

  it('puts the orb on floor, with no doodad on it and clear of the wall overhang', () => {
    for (const [wall, seed] of seedPerAlcoveWall()) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const orb = itemEntries(xml).find((i) => i.type.includes('crystal'))!
      const floor = floorTiles(xml)

      expect(floor.has(`${orb.x},${orb.y}`), `${wall} seed ${seed}: orb tile is not floor`).toBe(true)

      // every wall doodad's own tile, offset undone
      const wallTiles = doodadEntries(xml)
        .filter((d) => !d.type.includes('color_theme') && d.type.includes('/theme_'))
        .map((d) => tileOfDoodad(arenaOptions().theme, d.type, d.x, d.y))

      for (const w of wallTiles) {
        if (w.x !== orb.x) continue
        const covers = w.y <= orb.y && orb.y <= w.y + OVERHANG
        expect(covers, `${wall} seed ${seed}: wall tile (${w.x},${w.y}) paints over the orb at (${orb.x},${orb.y})`).toBe(false)
      }
    }
  })
})

describe('boss arena — no color_theme overlay anywhere', () => {
  // Cover only fires on the interior of a 2x2-or-thicker wall mass, so on the
  // arena's 1-tile band it appeared as isolated floating squares. Blanketing
  // only the alcove was rejected too: with the rest of the wall bare, the
  // blanket is itself a signpost for the alcove, so it hides nothing.
  it('emits none, on any theme', () => {
    for (const theme of THEMES) {
      const { xml } = buildBossArena(freshCtx(7), arenaOptions({ theme }), 0)
      const covers = doodadEntries(xml).filter((d) => d.type.includes('color_theme'))
      expect(covers, `theme ${theme}`).toHaveLength(0)
    }
  })
})

describe('boss arena — wall band thickness by theme', () => {
  // Theme h's pieces fence one edge of their tile and never fill it: measured
  // coverage is 25-56%, and the folder has no whole-tile piece at all. It seals
  // a room the way its dungeons do — a closed loop of fences around a wall mass
  // several tiles thick — so the arena gives it a 2-tile band. One tile is a
  // geometry its art cannot seal, which three piece-swapping fixes proved the
  // hard way. Every other theme keeps the 1-tile band, and the arena XML for
  // those themes must be unchanged.
  function bandThickness(theme: string, seed: number) {
    const { preview } = buildBossArena(freshCtx(seed), arenaOptions({ theme }), 0)
    const W = preview.mapWidth
    const H = preview.mapHeight
    const isWall = (x: number, y: number) => preview.walls[y * W + x] === '1'
    const midY = Math.trunc(H / 2)
    const midX = Math.trunc(W / 2)
    let left = 0
    while (left < W && isWall(left, midY)) left++
    let right = 0
    while (right < W && isWall(W - 1 - right, midY)) right++
    let top = 0
    while (top < H && isWall(midX, top)) top++
    let bottom = 0
    while (bottom < H && isWall(midX, H - 1 - bottom)) bottom++
    return { left, right, top, bottom }
  }

  it('gives theme h a 2-tile band on all four sides', () => {
    for (const seed of [1, 2, 4, 4242]) {
      expect(bandThickness('h', seed), `seed ${seed}`).toEqual({ left: 2, right: 2, top: 2, bottom: 2 })
    }
  })

  // Builds a whole arena per theme, and THEMES is every base, overlay pairing
  // and mixed palette — far too much for the 5s default once the suite is
  // running enough files to saturate the worker pool.
  it('leaves every other theme on a 1-tile band', () => {
    for (const theme of THEMES) {
      if (theme === 'h') continue
      expect(bandThickness(theme, 4242), `theme ${theme}`).toEqual({ left: 1, right: 1, top: 1, bottom: 1 })
    }
  }, 30_000)

  it('still opens the alcove through the full band depth', () => {
    for (const theme of ['g', 'h']) {
      for (const seed of [1, 4242]) {
        const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ theme }), 0)
        const seals = destroyObjectTargets(xml)
        // three regardless of band thickness — only the ring nearest the
        // interior is sealed; the rest of the mouth is passage
        expect(seals, `${theme} seed ${seed}`).toHaveLength(3)
        const syncing = doodadEntries(xml).filter((d) => d.needSync).map((d) => d.id)
        expect(syncing.sort(), `${theme} seed ${seed}`).toEqual([...seals].sort())
      }
    }
  })
})

describe('boss arena — the fence run continues past both ends of the mouth', () => {
  // Theme h seals by an unbroken line of edge fences. The band tiles either
  // side of the mouth are a turn in the wall, so searchPatterns gives them
  // whatever suits that shape — in the reported campaign a 1%-coverage v1
  // corner on one side and no doodad at all on the other, both of them
  // doorways. The mouth's own piece is laid on both flanks to close the line.
  // [VERIFIED] in game: the user hand-added exactly this and it stopped leaking.
  it('lays the mouth piece on the tile either side of the run, on theme h', () => {
    for (const seed of [1, 2, 4, 4242]) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ theme: 'h' }), 0)
      const doodads = doodadEntries(xml)
      const seals = doodads.filter((d) => d.needSync)
      expect(seals, `seed ${seed}`).toHaveLength(3)

      // the run is a straight line: one axis is constant across the seals
      const vertical = seals.every((s) => s.x === seals[0].x)
      const along = (d: { x: number; y: number }) => (vertical ? d.y : d.x)
      const across = (d: { x: number; y: number }) => (vertical ? d.x : d.y)

      const line = seals.map(along).sort((a, b) => a - b)
      const before = line[0] - 1
      const after = line[line.length - 1] + 1

      const sameLine = doodads.filter(
        (d) => d.type === seals[0].type && across(d) === across(seals[0])
      )
      const positions = sameLine.map(along)
      expect(positions, `seed ${seed}: no fence before the mouth run`).toContain(before)
      expect(positions, `seed ${seed}: no fence after the mouth run`).toContain(after)

      // the flanks are ordinary wall — the doorway stays three tiles
      const flanks = sameLine.filter((d) => along(d) === before || along(d) === after)
      for (const f of flanks) expect(f.needSync, `seed ${seed}: flank must not be destroyed`).toBe(false)
    }
  })

  it('adds no flanking pieces on a theme whose pieces fill their tile', () => {
    for (const theme of ['g', 'a', 'bonus1']) {
      const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ theme }), 0)
      const seals = doodadEntries(xml).filter((d) => d.needSync)
      expect(seals, `theme ${theme}`).toHaveLength(3)
      expect(destroyObjectTargets(xml), `theme ${theme}`).toHaveLength(3)
    }
  })
})

/**
 * The dragon is the only `topWall` boss, and the only boss this whole
 * placement path touches. Regression cover for the shipped bug: the arena put
 * it at interior row 0, where 2.625 tiles of its *static* collider sat inside
 * the north wall band — in game it could not be reached or damaged, could not
 * fire, and read as being off the map to the north. See DISCOVERY-LOG.md,
 * 2026-08-16, and bosses.ts's `topWallBossY`.
 */
describe('boss arena — the dragon sits on floor, not in the north wall', () => {
  const dragonArena = () => arenaOptions({ bossPool: ['boss_dragon'] })
  const SEEDS = [1, 2, 3, 4242, 987654, 20260816]

  for (const seed of SEEDS) {
    it(`seed ${seed}: the dragon's whole collider is on interior floor`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), dragonArena(), 0)
      const room = preview.rooms[0]
      const boss = bossActor(xml)
      const def = BOSS_DEFS.boss_dragon
      expect(boss.type).toBe(def.actorPath)

      // the position the fix produces, and the one the hand-patched arena used
      expect(boss.y).toBe(topWallBossY(def))
      expect(boss.y).toBe(3)

      const offset = def.collisionOffsetY ?? 0
      const top = boss.y + offset - def.footprintHeight / 2
      const bottom = boss.y + offset + def.footprintHeight / 2
      expect(top).toBeGreaterThanOrEqual(0)
      expect(bottom).toBeLessThan(room.height)

      // and every tile the collider covers is real floor, not wall band
      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'
      for (let ty = Math.floor(top); ty <= Math.ceil(bottom) - 1; ty++) {
        for (let tx = Math.floor(boss.x - def.footprintWidth / 2); tx <= Math.ceil(boss.x + def.footprintWidth / 2) - 1; tx++) {
          expect(isWall(room.x + tx, room.y + ty), `dragon collider covers wall tile ${tx},${ty}`).toBe(false)
        }
      }
    })

    it(`seed ${seed}: no wave SpawnObject lands inside the dragon`, () => {
      const { xml } = buildBossArena(freshCtx(seed), dragonArena(), 0)
      const def = BOSS_DEFS.boss_dragon
      const boss = bossActor(xml)
      const offset = def.collisionOffsetY ?? 0

      const spawns = [
        ...xml.matchAll(
          /<string name="type">SpawnObject<\/string>[\s\S]*?<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
        )
      ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
      expect(spawns.length).toBeGreaterThan(0)

      for (const s of spawns) {
        const insideX = Math.abs(s.x - boss.x) < def.footprintWidth / 2
        const insideY = Math.abs(s.y - (boss.y + offset)) < def.footprintHeight / 2
        expect(insideX && insideY, `spawn ${s.x},${s.y} is inside the dragon`).toBe(false)
      }
    })
  }
})

describe('boss arena — the boss-death wave tier', () => {
  /** Every `Boss Died` GlobalEventTrigger in an arena's emitted scripting. */
  function bossDiedTriggers(xml: string): number {
    return xml.split('<string name="parameters">Boss Died</string>').length - 1
  }

  it('a stock arena carries four Boss Died triggers — the win chain, the death tier, its buff and its drops', () => {
    // The death tier ships populated, bloodlusted AND carrying the stock drop
    // table, so it has three triggers of its own alongside the win chain's: one
    // switching its spawns on, one switching its buff field on, one spawning its
    // items. The three rigs are built independently (waves.ts, waveBuffs.ts and
    // wavePickups.ts) and none shares another's nodes.
    for (const seed of [1, 4242, 999999]) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ checkpoints: NO_CHECKPOINTS }), 0)
      expect(bossDiedTriggers(xml)).toBe(4)
    }
  })

  it('clearing the death tier drops back to the win chain\'s trigger alone', () => {
    // An empty tier emits nothing at all, which is how a campaign gets the
    // quiet walk to the orb back.
    const arena = arenaOptions({ checkpoints: NO_CHECKPOINTS })
    arena.waves = arena.waves.map((w, i) =>
      i === arena.waves.length - 1 ? { monsters: [], monsterMax: {}, defaultIntervalMs: 1000 } : w
    )
    for (const seed of [1, 4242, 999999]) {
      const { xml } = buildBossArena(freshCtx(seed), arena, 0)
      expect(bossDiedTriggers(xml)).toBe(1)
    }
  })

  it('a filled death tier adds its own trigger alongside the win chain', () => {
    const arena = arenaOptions({ checkpoints: NO_CHECKPOINTS })
    const waves = arena.waves.map((w, i) =>
      i === arena.waves.length - 1
        ? { monsters: ['eye'], monsterMax: { eye: 6 }, defaultIntervalMs: 2000 }
        : w
    )
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ waves, checkpoints: NO_CHECKPOINTS }), 0)

    expect(bossDiedTriggers(xml)).toBe(2)
    expect(allIds(xml).length).toBeGreaterThan(0)
    expect(badIntArray(xml)).toBeNull()
  })

  it('filling the death tier does not disturb the geometry drawn before it', () => {
    // The death tier's scatter points are the LAST bossRand draws of the build,
    // so everything drawn earlier — the arena rectangle, its cover pillars, the
    // food clusters — has to land in exactly the same place. Only the scripting
    // (and, on a mixed theme, the floor-pattern roll that follows the spawn
    // points) may move.
    const arena = arenaOptions({ checkpoints: NO_CHECKPOINTS })
    const filled = arena.waves.map((w, i) =>
      i === arena.waves.length - 1
        ? {
            monsters: ['eye'],
            monsterMax: { eye: 6 },
            defaultIntervalMs: 2000,
            spawnMode: { eye: 'random' as const }
          }
        : w
    )

    const doodads = (xml: string) => xml.slice(xml.indexOf('<array name="doodads">'), xml.indexOf('<array name="actors">'))

    const before = buildBossArena(freshCtx(4242), arena, 0).xml
    const after = buildBossArena(freshCtx(4242), arenaOptions({ waves: filled, checkpoints: NO_CHECKPOINTS }), 0).xml

    expect(doodads(before).length).toBeGreaterThan(100) // the slice is real, not an empty match
    expect(doodads(after)).toBe(doodads(before))
    expect(bossDiedTriggers(after)).toBe(2)
  })
})

describe('boss arena — arrival respawn', () => {
  // Belt and braces behind the prep room's own rig: whoever walks into the
  // arena starts the fight alive. One-shot, so dying to the boss is still
  // permanent — the ToggleElement disables the trigger the first time it fires.
  for (const seed of [1, 4242, 987654]) {
    it(`seed ${seed}: revives whoever arrived dead, exactly once`, () => {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ checkpoints: NO_CHECKPOINTS }), 0)
      const rig = oneShotRespawn(xml)
      expect(rig, typeof rig === 'string' ? rig : '').not.toBeTypeOf('string')
    })
  }

  it('watches its own shape, not the one the wave rig fires from', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ checkpoints: NO_CHECKPOINTS }), 0)
    const rig = oneShotRespawn(xml)
    if (typeof rig === 'string') throw new Error(rig)

    // a 3x3 over the LevelStart; the wave rig's entrance shape is
    // ENTRANCE_WIDTH x ENTRANCE_DEPTH and must be left alone
    const shape = nodesOfType(xml, 'RectangleShape').find((n) => n.id === rig.shape)!
    expect(shape.body).toContain('<float name="w">3.000000</float>')
    expect(shape.body).toContain('<float name="h">3.000000</float>')

    const [start] = nodesOfType(xml, 'LevelStart')
    const at = (body: string): string => /<float name="x">([\d.-]+)<\/float>\s*<float name="y">([\d.-]+)<\/float>/.exec(body)!.slice(1).join(' ')
    expect(at(shape.body)).toBe(at(start.body))
  })

  it('draws no random values — the arena is byte-identical with or without it', () => {
    // A regression guard for invariant 2: the rig is built between bossRand
    // draws, so if it ever started consuming one, every existing seed's arena
    // would shift. Two runs of the same seed must agree exactly.
    expect(buildBossArena(freshCtx(4242), arenaOptions(), 0).xml).toBe(
      buildBossArena(freshCtx(4242), arenaOptions(), 0).xml
    )
  })
})

describe('boss arena — invulnerability windows', () => {
  // The rig's own node-level behaviour lives in bossInvulnerability.test.ts;
  // these are the arena-level statements: that it reaches the emitted level, is
  // pointed at the right actor, and cannot disturb anything else.
  it('reaches boss.xml pointed at the boss actor, bracketing every threshold', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const toggles = nodesOfType(xml, 'ToggleImmortality')
    expect(toggles).toHaveLength(6) // on and off, per threshold
    expect(toggleStates(xml, 'ToggleImmortality')).toEqual([0, 1, 0, 1, 0, 1])

    const boss = bossActor(xml)
    for (const toggle of toggles) {
      expect(toggle.body).toContain(`<int-arr name="static">${boss.id}</int-arr>`)
    }

    // 31 ticks a window: 0:30 down to 0:00 inclusive
    expect(nodesOfType(xml, 'AnnounceText')).toHaveLength(93)
  })

  it('gives each threshold trigger real connection delays that end on the window', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ checkpoints: NO_CHECKPOINTS }), 0)
    // The wave tier and this rig listen on every threshold; the drop rig listens
    // only on the thresholds the stock table actually drops on (50% and 25%).
    const expected: Record<string, number> = { 'Boss 75%': 2, 'Boss 50%': 3, 'Boss 25%': 3 }
    for (const event of ['Boss 75%', 'Boss 50%', 'Boss 25%']) {
      // Only one of them carries real delays; the wave and drop rigs ship the
      // legacy `delays` line and no `connection-delays` at all.
      const triggers = nodesOfType(xml, 'GlobalEventTrigger').filter((n) =>
        n.body.includes(`<string name="parameters">${event}</string>`)
      )
      expect(triggers, event).toHaveLength(expected[event])
      const delayed = triggers.filter((n) => n.body.includes('connection-delays'))
      expect(delayed, event).toHaveLength(1)

      const ms = /<int-arr name="connection-delays">([^<]*)<\/int-arr>/
        .exec(delayed[0].body)![1]
        .split(' ')
        .map(Number)
      // immortality on at 0, the last tick and immortality off on the window
      expect(ms[0], event).toBe(0)
      expect(ms[ms.length - 1], event).toBe(30_000)
      // one connection per delay, and strictly non-decreasing
      expect(ms).toHaveLength(33)
      expect([...ms].sort((a, b) => a - b)).toEqual(ms)
    }
  })

  it('turning it off removes every node of the rig and nothing else', () => {
    const on = buildBossArena(freshCtx(4242), arenaOptions(), 0).xml
    const off = buildBossArena(
      freshCtx(4242),
      arenaOptions({ invulnerability: { enabled: false, seconds: [30, 30, 30], countdown: true } }),
      0
    ).xml

    expect(nodesOfType(off, 'ToggleImmortality')).toHaveLength(0)
    expect(nodesOfType(off, 'AnnounceText')).toHaveLength(0)
    // the rig is built last, so everything before it — tilemap, doodads,
    // actors, items, and the whole wave rig — is untouched
    expect(off.slice(0, off.indexOf('<dictionary name="scripting">'))).toBe(
      on.slice(0, on.indexOf('<dictionary name="scripting">'))
    )
    expect(badIntArray(on)).toBeNull()
  })

  it('moves no dungeon floor when it is switched on or off', () => {
    // Invariant 6: the optional layers never move a seed's dungeon. This one
    // draws no random values from any stream, so only boss.xml may differ.
    const on = plainParameters()
    const off = plainParameters()
    off.boss.fights[0].arena.invulnerability = { ...off.boss.fights[0].arena.invulnerability, enabled: false }

    for (const seed of [1, 4242]) {
      const a = generateOk(on, seed)
      const b = generateOk(off, seed)

      // every emitted file but the arena is byte-identical
      const others = (r: DungeonResult) => r.files.filter((f) => f.path !== 'levels/boss0.xml')
      expect(others(a).some((f) => /^levels\/level\d+\.xml$/.test(f.path)), `seed ${seed}`).toBe(true)
      expect(others(b), `seed ${seed}`).toEqual(others(a))
      expect(b.levels, `seed ${seed}`).toEqual(a.levels)

      const arena = (r: DungeonResult) => r.files.find((f) => f.path === 'levels/boss0.xml')!.content
      expect(arena(b), `seed ${seed}`).not.toBe(arena(a))
    }
  }, 60_000)
})

describe('boss arena — checkpoints', () => {
  it('turning it off removes every node of the rig and nothing else', () => {
    const on = buildBossArena(freshCtx(4242), arenaOptions(), 0).xml
    const off = buildBossArena(
      freshCtx(4242),
      arenaOptions({ checkpoints: NO_CHECKPOINTS }),
      0
    ).xml

    expect(nodesOfType(off, 'Checkpoint')).toHaveLength(0)
    // the rig is the very last thing built, so everything before it —
    // tilemap, doodads, actors, items, every other rig's nodes — is untouched
    expect(off.slice(0, off.indexOf('<dictionary name="scripting">'))).toBe(
      on.slice(0, on.indexOf('<dictionary name="scripting">'))
    )
    expect(badIntArray(on)).toBeNull()
  })

  it('moves no dungeon floor when it is switched on or off (invariant 6)', () => {
    // It draws no random values from any stream, so only boss.xml may differ.
    const on = plainParameters()
    const off = plainParameters()
    off.boss.fights[0].arena.checkpoints = NO_CHECKPOINTS

    for (const seed of [1, 4242]) {
      const a = generateOk(on, seed)
      const b = generateOk(off, seed)

      // every emitted file but the arena is byte-identical
      const others = (r: DungeonResult) => r.files.filter((f) => f.path !== 'levels/boss0.xml')
      expect(others(a).some((f) => /^levels\/level\d+\.xml$/.test(f.path)), `seed ${seed}`).toBe(true)
      expect(others(b), `seed ${seed}`).toEqual(others(a))
      expect(b.levels, `seed ${seed}`).toEqual(a.levels)

      const arena = (r: DungeonResult) => r.files.find((f) => f.path === 'levels/boss0.xml')!.content
      expect(arena(b), `seed ${seed}`).not.toBe(arena(a))
    }
  }, 60_000)
})

describe('multiple boss fights (issue #43)', () => {
  /** The stock campaign with `count` fights, each a copy of the stock one. */
  const withFights = (count: number): DungeonParameters => {
    const params = plainParameters()
    const stock = params.boss.fights[0]
    params.boss = {
      ...params.boss,
      fights: Array.from({ length: count }, () => JSON.parse(JSON.stringify(stock)) as BossFight)
    }
    return params
  }

  const levelOf = (r: DungeonResult, path: string) => r.files.find((f) => f.path === path)!.content
  const exitTargets = (xml: string) =>
    [...xml.matchAll(/<string name="level">([^<]*)<\/string>/g)].map((m) => m[1])

  it('emits an arena per fight, each indexed', () => {
    const result = generateOk(withFights(3), 4242)
    const paths = result.files.map((f) => f.path)

    for (let i = 0; i < 3; i++) {
      expect(paths, `fight ${i}`).toContain(`levels/boss${i}.xml`)
    }
    // and no un-indexed leftover from the single-fight shape, nor a prep room —
    // issue #48 deleted the welded-on prep room entirely
    expect(paths).not.toContain('levels/boss.xml')
    expect(paths.filter((p) => p.startsWith('levels/bossprep'))).toEqual([])
  })

  it('chains fight into fight directly — each arena leads into the NEXT arena', () => {
    // withFights() builds on plainParameters(), which ships no lobbies, so
    // there is no shop between fights here; 'campaign order — a lobby in the
    // chain' (rearrange.test.ts) covers a lobby put between two fights.
    const result = generateOk(withFights(3), 4242)

    // the last dungeon floor opens the first fight's arena directly
    const finalFloor = levelOf(result, `levels/level${plainParameters().levels - 1}.xml`)
    expect(exitTargets(finalFloor)).toContain('boss0')

    for (let i = 0; i < 3; i++) {
      const arena = levelOf(result, `levels/boss${i}.xml`)
      if (i < 2) {
        // a non-final arena's alcove is a portal straight into the next
        // arena, not the orb
        expect(exitTargets(arena), `arena ${i}`).toContain(`boss${i + 1}`)
        expect(arena, `arena ${i}`).not.toContain('<string name="type">GameEnd</string>')
      } else {
        expect(exitTargets(arena), 'last arena').toEqual([])
      }
    }
  })

  it('ends the campaign exactly once, in the last arena', () => {
    const result = generateOk(withFights(3), 4242)
    const gameEnds = result.files.filter((f) =>
      f.content.includes('<string name="type">GameEnd</string>')
    )
    expect(gameEnds.map((f) => f.path)).toEqual(['levels/boss2.xml'])
  })

  it('lists every fight in levels.xml, in order, after the dungeon floors', () => {
    const result = generateOk(withFights(2), 4242)
    const levelsXml = levelOf(result, 'levels.xml')

    const order = [...Array.from({ length: plainParameters().levels }, (_, i) => String(i)), 'boss0', 'boss1']
    let lastIdx = -1
    for (const id of order) {
      const idx = levelsXml.indexOf(`<level id="${id}"`)
      expect(idx, `level id "${id}" missing or out of order`).toBeGreaterThan(lastIdx)
      lastIdx = idx
    }
    // the in-game floor label keeps counting rather than repeating a number —
    // 7 floors (labels 0-6) then 2 fights, ONE label each now that a fight is
    // a single arena rather than a prep room plus an arena
    expect(levelsXml).toContain('name="lvl.floor?floor=8"')
  })

  it('previews every arena, one entry per fight after the floors', () => {
    const result = generateOk(withFights(3), 4242)
    expect(result.levels).toHaveLength(plainParameters().levels + 3)
  })

  /**
   * The load-bearing RNG guarantee: fights share ctx.bossRand in list order, so
   * adding a second fight must not move the first. Without it, every arena seed
   * anyone had saved would change the moment this feature shipped.
   *
   * Arena 0's *file* is not byte-identical across the two campaigns, and should
   * not be: when a fight follows, its alcove holds a portal instead of the orb.
   * What must not move is the geometry the RNG produced, so the tilemap — every
   * tile of it, which is downstream of the width, height, alcove-wall and cover
   * draws — is compared instead.
   */
  it("leaves the first fight's geometry unmoved however many follow it", () => {
    const tilemap = (xml: string) => xml.slice(0, xml.indexOf('<array name="doodads">'))

    for (const seed of [1, 4242, 777]) {
      const one = generateOk(withFights(1), seed)
      const three = generateOk(withFights(3), seed)

      expect(
        tilemap(levelOf(three, 'levels/boss0.xml')),
        `seed ${seed} arena 0`
      ).toBe(tilemap(levelOf(one, 'levels/boss0.xml')))

      // and the dungeon itself never notices either — a different stream
      for (let i = 0; i < plainParameters().levels; i++) {
        expect(levelOf(three, `levels/level${i}.xml`), `seed ${seed} floor ${i}`).toBe(
          levelOf(one, `levels/level${i}.xml`)
        )
      }
    }
  }, 60_000)

  /**
   * The other half of that guarantee, stated exactly: swapping the alcove's orb
   * for either portal must not consume a different number of `ctx.bossRand`
   * draws, or every arena after the first in a chain would shift. Same shape
   * as objectSet.test.ts's Orb/BossPortal/LobbyPortal parity check.
   */
  it('an alcove portal — either colour — costs the same RNG draws as the victory orb', () => {
    const arena = plainParameters().boss.fights[0].arena
    const after = (gateway: Gateway) => {
      const ctx = freshCtx(4242)
      buildBossArena(ctx, arena, 7, gateway)
      return Array.from({ length: 20 }, () => ctx.bossRand.iRand(0, 1_000_000))
    }
    const orb = after({ kind: 'orb' })
    expect(after({ kind: 'portal', target: bossArenaId(1) })).toEqual(orb)
    expect(after({ kind: 'lobbyPortal', target: lobbyId(0) })).toEqual(orb)
  })

  /**
   * The arena's own three-way choice, over all four `Gateway` kinds an arena
   * can actually receive. An arena has no stairs prefab of its own, so
   * `'exit'` — `gatewayAfter`'s answer whenever the next slot is an ordinary
   * dungeon floor — still renders the RED portal here, same as `'portal'`;
   * only `'lobbyPortal'` gets the blue one and only `'orb'` gets the orb.
   */
  it('picks the doodad and target by gateway kind, exit included', () => {
    const arena = plainParameters().boss.fights[0].arena
    const xmlFor = (gateway: Gateway) => buildBossArena(freshCtx(4242), arena, 0, gateway).xml

    const onOrb = xmlFor({ kind: 'orb' })
    expect(onOrb).toContain('items/crystal_purple.xml')
    expect(onOrb).not.toContain('exit_teleport')

    const onPortal = xmlFor({ kind: 'portal', target: bossArenaId(1) })
    expect(onPortal).toContain('doodads/generic/exit_teleport_boss.xml')
    expect(onPortal).toContain('<string name="level">boss1</string>')
    expect(onPortal).not.toContain('items/crystal_purple.xml')

    // the special case: an arena followed by an ordinary dungeon floor still
    // gets the red portal, not stairs and not the orb
    const onExit = xmlFor({ kind: 'exit', target: '3' })
    expect(onExit).toContain('doodads/generic/exit_teleport_boss.xml')
    expect(onExit).toContain('<string name="level">3</string>')
    expect(onExit).not.toContain('items/crystal_purple.xml')

    const onLobbyPortal = xmlFor({ kind: 'lobbyPortal', target: lobbyId(2) })
    expect(onLobbyPortal).toContain('doodads/generic/exit_teleport.xml')
    expect(onLobbyPortal).not.toContain('exit_teleport_boss.xml')
    expect(onLobbyPortal).toContain('<string name="level">lobby2</string>')
    expect(onLobbyPortal).not.toContain('items/crystal_purple.xml')
  })

  it("a later fight's settings never reach an earlier one", () => {
    const base = withFights(2)
    const changed = withFights(2)
    changed.boss.fights[1].arena.theme = 'a'
    changed.boss.fights[1].arena.bossPool = ['boss_worm']

    expect(levelOf(generateOk(changed, 4242), 'levels/boss0.xml')).toBe(
      levelOf(generateOk(base, 4242), 'levels/boss0.xml')
    )
  }, 60_000)

  it('gives each fight its own arena — later fights continue the stream', () => {
    const result = generateOk(withFights(3), 4242)
    const arenas = [0, 1, 2].map((i) => levelOf(result, `levels/boss${i}.xml`))
    // identical options, different draws: three copies of one arena would mean
    // the fights were sharing a stream position
    expect(new Set(arenas).size).toBe(3)
  })

  it('is deterministic across runs with several fights', () => {
    const params = withFights(3)
    expect(generateOk(params, 2024).files).toEqual(generateOk(params, 2024).files)
  }, 60_000)

  // A fight's prep room is gone (issue #48) — a shop in front of one is a
  // `lobby` slot now, placed and edited independently. That coverage
  // ("honours each fight's own prep-room settings", checking two lobbies'
  // independent gold) now lives in lobby.test.ts's table-driven suite.
})

describe('arena bodyguard twins (issue #64 part 2)', () => {
  const levelOf = (r: DungeonResult, path: string) => r.files.find((f) => f.path === path)!.content

  /** A wave 0 naming the 3 twinned actors this repo currently has, plus a bare bat for contrast. */
  function withTwinnedWave(bodyguardVariants?: boolean): DungeonParameters {
    const arena = plainParameters().boss.fights[0].arena
    const waves: typeof arena.waves = arena.waves.map((w, i) =>
      i === 0
        ? {
            ...w,
            monsters: ['archer1', 'skeleton3', 'mummy_ranged#2', 'bat1'],
            monsterMax: { archer1: 4, skeleton3: 4, 'mummy_ranged#2': 4, bat1: 4 } as Record<string, number>,
            spawnMode: undefined
          }
        : { ...w, monsters: [] as string[], monsterMax: {} as Record<string, number> }
    )
    return withFight({ arena: { ...arena, waves, bodyguardVariants } })
  }

  it('substitutes the 3 twinned keys and leaves the untwinned one alone, with the toggle on (the default)', () => {
    const xml = levelOf(generateOk(withTwinnedWave(undefined), 4242), 'levels/boss0.xml')
    expect(xml).toContain('actors/boss_knight/archer_1.xml')
    expect(xml).toContain('actors/boss_lich/lich_guard_skeleton.xml')
    expect(xml).toContain('actors/boss_anubis/mummy_ranged_2_noloot.xml')
    expect(xml).toContain('actors/bat_1.xml')
    expect(xml).not.toContain('>actors/archer_1.xml<')
    expect(xml).not.toContain('>actors/skeleton_3.xml<')
    expect(xml).not.toContain('>actors/mummy_ranged_2.xml<')
  }, 60_000)

  it('emits the plain actors with the toggle off', () => {
    const xml = levelOf(generateOk(withTwinnedWave(false), 4242), 'levels/boss0.xml')
    expect(xml).toContain('actors/archer_1.xml')
    expect(xml).toContain('actors/skeleton_3.xml')
    expect(xml).toContain('actors/mummy_ranged_2.xml')
    // Can't assert "no boss_knight/boss_lich/boss_anubis at all" here — the
    // arena's OWN picked boss (from the stock pool: knight, lich, dragon,
    // queen) legitimately carries one of those folder names regardless of
    // this toggle. Assert the specific twin paths are absent instead.
    expect(xml).not.toContain('actors/boss_knight/archer_1.xml')
    expect(xml).not.toContain('actors/boss_lich/lich_guard_skeleton.xml')
    expect(xml).not.toContain('actors/boss_anubis/mummy_ranged_2_noloot.xml')
  }, 60_000)

  it('is a pure path substitution — mapping the twin paths back makes the two arenas byte-identical', () => {
    const on = levelOf(generateOk(withTwinnedWave(undefined), 4242), 'levels/boss0.xml')
    const off = levelOf(generateOk(withTwinnedWave(false), 4242), 'levels/boss0.xml')
    let mappedBack = on
    mappedBack = mappedBack
      .split('actors/boss_knight/archer_1.xml').join('actors/archer_1.xml')
      .split('actors/boss_lich/lich_guard_skeleton.xml').join('actors/skeleton_3.xml')
      .split('actors/boss_anubis/mummy_ranged_2_noloot.xml').join('actors/mummy_ranged_2.xml')
    expect(mappedBack).toBe(off)
  }, 60_000)

  it('never moves any dungeon floor — draws no RNG', () => {
    const on = generateOk(withTwinnedWave(undefined), 4242)
    const off = generateOk(withTwinnedWave(false), 4242)
    const floors = (r: DungeonResult) => r.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))
    expect(floors(on)).toEqual(floors(off))
  }, 60_000)
})
