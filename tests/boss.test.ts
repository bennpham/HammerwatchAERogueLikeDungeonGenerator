/**
 * Boss arenas (src/generator/boss/arena.ts), read back from the emitted AE
 * level. Arena objects are placed in arena-local tiles (interior 0..width-1 by
 * 0..height-1); the preview's grid adds the wall band and the alcove, so a
 * local tile is preview tile minus the room's origin.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { THEMES } from '../src/generator/config/themes'
import { getTheme } from '../src/generator/config/themes'
import { plainParameters } from './params'
import type { BossArenaOptions, BossFight, BossOptions } from '../src/generator/config/parameters'
import { buildBossArena } from '../src/generator/boss/arena'
import type { Gateway } from '../src/generator/campaign'
import { BOSS_CAMPAIGNS, BOSS_DEFS, BOSS_DEF_LIST, topWallBossY } from '../src/generator/boss/bosses'
import type { AlcoveWall } from '../src/generator/boss/bosses'
import { arenaActorPath } from '../src/generator/objects/monsterTypes'
import { aeAssetExists } from '../src/generator/catalog/assets'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult, LevelPreview } from '../src/generator'
import type { AeLevel, AeUnit } from '../src/generator/ae/model'
import { allIds, idsParam, intParam, levelsOf, scriptsOf, strParam } from './ae'
import { wallCells } from './sealProbe'

const TILE = 16
const ORB = 'items/pickups/collectable_10_sphere.unit'
const RED_PORTAL = 'doodads/generic/teleport_red.unit'
const BLUE_PORTAL = 'doodads/generic/teleport_mt.unit'
const FOOD = ['items/pickups/health_1.unit', 'items/pickups/mana_1.unit']
const BOSS_PATHS = new Set(BOSS_DEF_LIST.map((d) => d.actorPath))

function freshCtx(seed: number): GenerationContext {
  const ctx = new GenerationContext(plainParameters(), seed, 'dungeon_test')
  ctx.currentStem = 'boss0'
  return ctx
}

function arenaOptions(overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return { ...plainParameters().boss.fights[0].arena, ...overrides }
}

function arena(seed: number, overrides: Partial<BossArenaOptions> = {}, gateway?: Gateway): { level: AeLevel; preview: LevelPreview } {
  return buildBossArena(freshCtx(seed), arenaOptions(overrides), 0, gateway)
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

/** The stock parameters with the FIRST fight patched. */
function withFight(patch: Partial<BossFight>): DungeonParameters {
  const params = plainParameters()
  params.boss = { ...params.boss, fights: params.boss.fights.map((f, i) => (i === 0 ? { ...f, ...patch } : f)) }
  return params
}

const bossUnits = (l: AeLevel): AeUnit[] => l.units.filter((u) => BOSS_PATHS.has(u.path))
const local = (u: { x: number; y: number }) => ({ x: u.x / TILE, y: u.y / TILE })
const room = (p: LevelPreview) => p.rooms[0]

/** Is a local tile on the arena's interior floor? */
function onInterior(p: LevelPreview, x: number, y: number): boolean {
  const r = room(p)
  return x >= 0 && y >= 0 && x < r.width && y < r.height
}

/**
 * Walk from the arrival to the orb (or portal), with the alcove's seal pieces
 * intact or destroyed. Walls come from the preview's grid plus every wall unit
 * standing on open floor (the seals); `open` drops the units the arena's
 * DestroyUnits would remove.
 */
function reachesGateway(level: AeLevel, preview: LevelPreview, open: boolean): boolean {
  const { x: ox, y: oy } = room(preview)
  const w = preview.mapWidth
  const h = preview.mapHeight
  const solid = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) solid[i] = preview.walls[i] === '1' ? 1 : 0
  const destroyed = new Set(open ? scriptsOf(level, 'DestroyUnits').flatMap((d) => idsParam(d, 'Units')) : [])
  for (const u of level.units) {
    if (!u.path.startsWith('doodads/walls/') || destroyed.has(u.id)) continue
    for (const [cx, cy] of wallCells(u)) {
      const gx = cx + ox
      const gy = cy + oy
      if (gx >= 0 && gy >= 0 && gx < w && gy < h) solid[gx + gy * w] = 1
    }
  }
  const start = scriptsOf(level, 'LevelStart')[0]
  const goal = level.units.find((u) => u.path === ORB || u.path === RED_PORTAL || u.path === BLUE_PORTAL)!
  const sx = Math.floor(start.x / TILE) + ox
  const sy = Math.floor(start.y / TILE) + oy
  const tx = Math.floor(goal.x / TILE) + ox
  const ty = Math.floor(goal.y / TILE) + oy
  const seen = new Uint8Array(w * h)
  const stack = [sx + sy * w]
  seen[stack[0]] = 1
  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % w
    const y = Math.trunc(i / w)
    if (Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1) return true
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = nx + ny * w
      if (seen[j] || solid[j]) continue
      seen[j] = 1
      stack.push(j)
    }
  }
  return false
}

describe('boss arena — determinism', () => {
  it('is identical for the same seed and options', () => {
    expect(arena(7)).toEqual(arena(7))
  })

  it('differs across seeds', () => {
    expect(arena(1).level).not.toEqual(arena(2).level)
  })
})

describe('boss arena — geometry', () => {
  it('sizes the interior within the options', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const opts = arenaOptions()
      const r = room(arena(seed).preview)
      expect(r.width).toBeGreaterThanOrEqual(opts.minWidth)
      expect(r.width).toBeLessThanOrEqual(opts.maxWidth)
      expect(r.height).toBeGreaterThanOrEqual(opts.minHeight)
      expect(r.height).toBeLessThanOrEqual(opts.maxHeight)
    }
  })

  it('stands every boss on the interior floor, its whole collider included', () => {
    for (const id of BOSS_DEF_LIST.map((d) => d.id)) {
      const { level, preview } = arena(11, { bossPool: [id] })
      const bosses = bossUnits(level)
      expect(bosses, id).toHaveLength(1)
      const def = BOSS_DEFS[id as keyof typeof BOSS_DEFS]
      const p = local(bosses[0])
      // the layout seats the collider on floor; a top-wall boss's art nudge
      // (the dragon, seated higher by hand) moves only the emitted actor
      const nudge = def.placement === 'topWall' ? (def.artNudgeY ?? 0) : 0
      const top = p.y - nudge + (def.collisionOffsetY ?? 0) - def.footprintHeight / 2
      expect(top, `${id} collider top`).toBeGreaterThanOrEqual(0)
      expect(onInterior(preview, p.x, p.y), `${id} at ${p.x},${p.y}`).toBe(true)
      if (def.placement === 'topWall') expect(p.y, id).toBe(topWallBossY(def) + nudge)
    }
  })

  it('puts the orb behind the alcove wall it rolled, outside the interior', () => {
    const seen = new Set<AlcoveWall>()
    for (let seed = 1; seed <= 30 && seen.size < 3; seed++) {
      const { level, preview } = arena(seed)
      const orb = level.units.find((u) => u.path === ORB)
      expect(orb, `seed ${seed}`).toBeDefined()
      const p = local(orb!)
      const r = room(preview)
      expect(onInterior(preview, p.x, p.y), `seed ${seed}`).toBe(false)
      if (p.y < 0) seen.add('N')
      else if (p.x >= r.width) seen.add('E')
      else if (p.x < 0) seen.add('W')
    }
    expect([...seen].sort()).toEqual(['E', 'N', 'W'])
  })

  it('arrives the party at the bottom of the interior', () => {
    const { level, preview } = arena(3)
    const starts = scriptsOf(level, 'LevelStart').filter((s) => strParam(s, 'StartID') === 'boss0')
    expect(starts).toHaveLength(1)
    const p = local(starts[0])
    expect(onInterior(preview, Math.floor(p.x), Math.floor(p.y))).toBe(true)
    expect(Math.floor(p.y)).toBe(room(preview).height - 1)
  })
})

describe('boss arena — the alcove', () => {
  it('is sealed until the boss dies, and opens to the orb once its seal is destroyed', () => {
    for (const seed of [1, 4, 9, 13, 21]) {
      const { level, preview } = arena(seed)
      expect(reachesGateway(level, preview, false), `seed ${seed}: sealed`).toBe(false)
      expect(reachesGateway(level, preview, true), `seed ${seed}: opened`).toBe(true)
    }
  })

  it('opens on the boss death: one DestroyUnits on the seal, fired by the death trigger', () => {
    const { level } = arena(5)
    const boss = bossUnits(level)[0]
    const destroys = scriptsOf(level, 'DestroyUnits')
    expect(destroys).toHaveLength(1)
    const death = scriptsOf(level, 'UnitDestroyedTrigger').filter((t) => idsParam(t, 'Units').includes(boss.id))
    expect(death.length).toBeGreaterThan(0)
    expect(death.some((t) => t.connections.some(([id]) => id === destroys[0].id))).toBe(true)
  })

  it('shows the boss bar on arrival, titled for the boss', () => {
    for (const id of ['boss_knight', 'boss_lich', 'boss_warden']) {
      const { level } = arena(2, { bossPool: [id] })
      const bars = scriptsOf(level, 'CreateBossBar')
      expect(bars, id).toHaveLength(1)
      expect(strParam(bars[0], 'Name'), id).toBe(BOSS_DEFS[id as keyof typeof BOSS_DEFS].barName)
      expect(idsParam(bars[0], 'Actors')).toEqual(bossUnits(level).map((u) => u.id))
    }
  })
})

describe('boss arena — integrity', () => {
  it('gives every unit and script a unique id, and resolves every link', () => {
    for (const seed of [1, 2, 3]) {
      const { level } = arena(seed)
      const ids = allIds(level)
      expect(new Set(ids).size, `seed ${seed}`).toBe(ids.length)
      const known = new Set(ids)
      for (const s of level.scripts) {
        for (const [id] of s.connections) expect(known.has(id), `${s.cls} ${s.id} -> ${id}`).toBe(true)
        for (const p of s.params) if (p.kind === 'ids') for (const id of p.value) expect(known.has(id), `${s.cls}.${p.name} -> ${id}`).toBe(true)
      }
    }
  })

  it('watches the boss itself on every health tier', () => {
    const { level } = arena(6)
    const boss = bossUnits(level)[0]
    const tiers = scriptsOf(level, 'ActorHealthTrigger')
    expect(tiers.length).toBeGreaterThan(0)
    for (const t of tiers) expect(idsParam(t, 'Units')).toEqual([boss.id])
    // each tier-keyed rig (waves, invulnerability, checkpoints) builds its own
    expect([...new Set(tiers.map((t) => intParam(t, 'Value')))].sort()).toEqual([0.25, 0.5, 0.75])
  })
})

describe('boss arena — waves and food', () => {
  it('reaches the wave rig: timers armed off the tiers, spawning inside the interior', () => {
    const { level, preview } = arena(8, {
      waves: arenaOptions().waves.map((w) => ({ ...w, spawnMode: undefined }))
    })
    expect(scriptsOf(level, 'TimerTrigger').length).toBeGreaterThan(0)
    const spawns = scriptsOf(level, 'SpawnUnit')
    expect(spawns.length).toBeGreaterThan(0)
    for (const s of spawns) {
      const p = local(s)
      expect(onInterior(preview, Math.floor(p.x), Math.floor(p.y)), `${strParam(s, 'UnitType')} at ${p.x},${p.y}`).toBe(true)
    }
  })

  it('substitutes the arena bodyguard twins in its waves', () => {
    const { level } = arena(8)
    for (const s of scriptsOf(level, 'SpawnUnit')) {
      const path = strParam(s, 'UnitType')!
      expect(arenaActorPath(path), path).toBe(path)
    }
  })

  it('scatters food on interior floor, and none with foodMultiplier 0', () => {
    const { level, preview } = arena(9)
    const food = level.units.filter((u) => FOOD.includes(u.path))
    expect(food.length).toBeGreaterThan(0)
    for (const f of food) {
      const p = local(f)
      expect(onInterior(preview, Math.floor(p.x), Math.floor(p.y))).toBe(true)
    }
    expect(arena(9, { foodMultiplier: 0 }).level.units.filter((u) => FOOD.includes(u.path))).toHaveLength(0)
  })
})

describe('boss arena — every theme', () => {
  for (const theme of THEMES) {
    it(`${theme}: builds with installed assets and its own tilesets`, () => {
      const t = getTheme(theme)!
      const { level } = arena(4, { theme })
      for (const u of level.units) expect(aeAssetExists(u.path), `${theme}: ${u.path}`).toBe(true)
      const allowed = new Set([...t.floor, ...(t.mixed ?? []), 'tilesets/__black.tileset'])
      for (const cell of level.tileCells) for (const d of cell.datasets) expect(allowed.has(d.tileset), `${theme}: ${d.tileset}`).toBe(true)
      expect(t.environments).toContain(level.environment)
    })
  }
})

describe('boss campaign', () => {
  it('off: no arena, the last floor ends on the orb', () => {
    const result = generateOk(withBoss({ enabled: false }), 42)
    const levels = levelsOf(result)
    expect([...levels.keys()].some((s) => s.startsWith('boss'))).toBe(false)
    const last = levels.get(`floor${plainParameters().levels - 1}`)!
    expect(last.units.some((u) => u.path === ORB)).toBe(true)
  })

  it('a campaign with no boss field at all is the same as boss off', () => {
    const params = plainParameters()
    const { boss: _boss, ...rest } = params
    const absent = generateDungeon(rest as DungeonParameters, 42)
    expect(absent.ok).toBe(true)
    expect((absent as DungeonResult).files).toEqual(generateOk(withBoss({ enabled: false }), 42).files)
  })

  it('on: the last floor leads through the red portal into the arena, which ends the game', () => {
    const result = generateOk(plainParameters(), 42)
    const levels = levelsOf(result)
    const last = levels.get(`floor${plainParameters().levels - 1}`)!
    expect(last.units.some((u) => u.path === RED_PORTAL)).toBe(true)
    expect(last.units.some((u) => u.path === ORB)).toBe(false)
    expect(scriptsOf(last, 'LevelExit').map((s) => strParam(s, 'StartID'))).toContain('boss0')
    const arenaLevel = levels.get('boss0')!
    expect(arenaLevel.units.some((u) => u.path === ORB)).toBe(true)
    expect(scriptsOf(arenaLevel, 'ShowGameOver').length).toBeGreaterThan(0)
  })

  it('chains two fights: the first arena leads into the second', () => {
    const params = plainParameters()
    const fight = params.boss.fights[0]
    params.boss = { ...params.boss, fights: [fight, JSON.parse(JSON.stringify(fight)) as BossFight] }
    const levels = levelsOf(generateOk(params, 42))
    const first = levels.get('boss0')!
    expect(first.units.some((u) => u.path === RED_PORTAL)).toBe(true)
    expect(scriptsOf(first, 'LevelExit').map((s) => strParam(s, 'StartID'))).toEqual(['boss1'])
    expect(scriptsOf(levels.get('boss1')!, 'ShowGameOver').length).toBeGreaterThan(0)
  })

  it('a boss-only campaign starts in the arena', () => {
    const params = plainParameters()
    params.levels = 0
    params.lobbies = []
    const result = generateOk(params, 42)
    const arenaLevel = levelsOf(result).get('boss0')!
    expect(scriptsOf(arenaLevel, 'LevelStart').some((s) => strParam(s, 'StartID') === undefined)).toBe(true)
    expect(/lvl="([^"]+)"/.exec(result.files.find((f) => f.path === 'info.xml')!.content)?.[1]).toBe(
      `levels/${result.campaignName}/01_arena_boss1.lvl`
    )
  })

  it('moves no dungeon floor when the arena options change', () => {
    const a = levelsOf(generateOk(plainParameters(), 42))
    const b = levelsOf(generateOk(withFight({ arena: arenaOptions({ theme: 'crypt', minWidth: 50, maxWidth: 50 }) }), 42))
    for (let i = 0; i < plainParameters().levels; i++) expect(b.get(`floor${i}`)).toEqual(a.get(`floor${i}`))
    expect(b.get('boss0')).not.toEqual(a.get('boss0'))
  })
})

describe('boss campaigns and the dragon seat', () => {
  it('files every boss under exactly one AE campaign', () => {
    const listed = BOSS_CAMPAIGNS.flatMap((c) => c.bosses)
    expect([...listed].sort()).toEqual([...BOSS_DEF_LIST.map((d) => d.id)].sort())
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('seats the dragon 24 px above its collider-safe row, as the user placed it by hand', () => {
    const { level } = arena(7, { bossSelection: 'lineup', bossLineup: { boss_dragon: 1 } })
    const dragon = level.units.find((u) => u.path === BOSS_DEFS.boss_dragon.actorPath)!
    expect(dragon.y).toBe(topWallBossY(BOSS_DEFS.boss_dragon) * TILE - 24)
  })
})
