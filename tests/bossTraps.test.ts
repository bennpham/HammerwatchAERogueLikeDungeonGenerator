/**
 * Boss arena traps — the projectile spewers lining the walls
 * (src/generator/boss/traps.ts).
 *
 * Four things are being proved. First the emission shape: a count is SPEWERS,
 * so N means N ProjectileSpewer nodes, each with the engine's direction integer
 * and the row's spread and rate. Second the wiring: tier 0 arrives live with no
 * trigger, every later tier ships disabled behind a GlobalEventTrigger that
 * switches its own set on (`state: 0`) and the previous carrying tier's off
 * (`state: 1`). Third the placement: on the innermost floor tile of the wall it
 * fires away from, clear of the corners, the entrance, the alcove mouth and each
 * other. Fourth, invariant 6 and invariant 2: no tier carrying a trap emits
 * nothing at all AND draws nothing, and because the rig runs last, switching it
 * on cannot move anything else in the same arena.
 *
 * Uses bossWavePickups.test.ts's in-memory pattern — build the rig against a
 * bare context and read `ctx.scriptNodes` — rather than parsing XML, because
 * what matters here is which node points at which and where each one sits.
 */

import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import type { BossTrap, BossTrapDirection, BossWave } from '../src/generator/config/parameters'
import { BOSS_TRAP_DIRECTIONS, MAX_TRAP_COUNT, TRAP_SPREAD_MAX } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { PROJECTILE_DEFS, PROJECTILE_GROUPS, projectileById } from '../src/generator/objects/projectileTypes'
import { buildBossArena } from '../src/generator/boss/arena'
import { TRAP_MIN_SPACING, TRAP_WALL_MARGIN, buildTrapRig, wallCapacity } from '../src/generator/boss/traps'
import type { TrapArena } from '../src/generator/boss/traps'
import { TIER_EVENT_NAMES } from '../src/generator/boss/waves'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

const ARENA_W = 30
const ARENA_H = 40
/** The entrance strip arena.ts would build for an ARENA_W x ARENA_H arena. */
const ENTRANCE = { x: 14, y: ARENA_H - 2, width: 3, height: 2 }

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function arenaOf(overrides: Partial<TrapArena> = {}): TrapArena {
  return {
    width: ARENA_W,
    height: ARENA_H,
    entrance: ENTRANCE,
    alcoveWall: 'N',
    midX: Math.trunc(ARENA_W / 2),
    midY: Math.trunc(ARENA_H / 2),
    ...overrides
  }
}

/** A bare tier carrying any number of trap rows. */
function wave(...traps: BossTrap[]): BossWave {
  const w: BossWave = { monsters: [], monsterMax: {}, defaultIntervalMs: 3000 }
  if (traps.length > 0) w.traps = traps
  return w
}

function trap(
  direction: BossTrapDirection,
  count = 1,
  projectile = 'enemy_axe',
  spread = 0.5,
  spawnRateMs = 100
): BossTrap {
  return { projectile, direction, spread, spawnRateMs, count }
}

const emptyTiers = () => [wave(), wave(), wave(), wave(), wave()]

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

interface SpewerView {
  id: number
  x: number
  y: number
  enabled: boolean
  triggerTimes: number
  projectilePath: string
  direction: number
  spread: number
  spawnRateMs: number
}

function spewers(ctx: GenerationContext): SpewerView[] {
  return nodesOfType(ctx, 'ProjectileSpewer') as unknown as SpewerView[]
}

/** The engine event a GlobalEventTrigger fires on. */
function eventOf(node: ScriptNode): string {
  return (node as unknown as { eventName: string }).eventName
}

function stateOf(node: ScriptNode): number {
  return (node as unknown as { state: number }).state
}

/** Every id in every `connections` array actually exists among ctx.scriptNodes. */
function connectionsResolve(ctx: GenerationContext): boolean {
  const ids = new Set(ctx.scriptNodes.map((n) => n.id))
  return ctx.scriptNodes.every((n) => n.connections.every((c) => ids.has(c.id)))
}

/** The tier triggers, in tier order. */
function triggers(ctx: GenerationContext): ScriptNode[] {
  return nodesOfType(ctx, 'GlobalEventTrigger')
}

describe('boss traps — none means none', () => {
  it('emits nothing at all when no tier runs a trap', () => {
    const ctx = freshCtx()
    const beforeId = ctx.idCounter
    buildTrapRig(ctx, emptyTiers(), arenaOf())

    expect(spewers(ctx)).toHaveLength(0)
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('draws nothing from any RNG stream when no tier runs a trap', () => {
    // Invariant 2: a path with nothing to draw must return BEFORE touching a
    // stream. This is the test that keeps every existing seed byte-identical.
    const ctx = freshCtx(4242)
    buildTrapRig(ctx, emptyTiers(), arenaOf())
    const after = [ctx.rand.nextInt(1e9), ctx.cosmeticRand.nextInt(1e9), ctx.bossRand.nextInt(1e9)]

    const untouched = freshCtx(4242)
    expect(after).toEqual([
      untouched.rand.nextInt(1e9),
      untouched.cosmeticRand.nextInt(1e9),
      untouched.bossRand.nextInt(1e9)
    ])
  })

  it('treats an empty list the same as an absent one', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(), { ...wave(), traps: [] }], arenaOf())
    expect(ctx.scriptNodes).toHaveLength(0)
  })

  it('leaves a whole generated arena byte-identical with no tier trapping', () => {
    const params = defaultParameters()
    const base = params.boss.fights[0].arena
    const cleared = {
      ...base,
      waves: base.waves.map((w) => {
        const next = { ...w }
        delete next.traps
        return next
      })
    }
    const absent = buildBossArena(freshCtx(4242), cleared, 0)

    // the same arena with the lists explicitly empty rather than absent
    const explicit = {
      ...base,
      waves: base.waves.map((w) => ({ ...w, traps: [] as BossTrap[] }))
    }
    expect(buildBossArena(freshCtx(4242), explicit, 0).xml).toBe(absent.xml)

    // the stock arena runs a shooter_arrow rig on its last two tiers (070
    // parameter set) and none on the other three
    expect(base.waves.map((w) => (w.traps ?? []).length > 0)).toEqual([
      false,
      false,
      false,
      true,
      true
    ])
  })
})

describe('boss traps — emission shape', () => {
  it('emits one spewer per copy, carrying the row settings', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 3, 'enemy_axe', 0.5, 100))], arenaOf())

    const placed = spewers(ctx)
    expect(placed).toHaveLength(3)
    for (const s of placed) {
      expect(s.projectilePath).toBe('projectiles/enemy_axe.xml')
      expect(s.spread).toBe(0.5)
      expect(s.spawnRateMs).toBe(100)
      expect(s.triggerTimes).toBe(-1)
    }
  })

  it('maps each direction to the engine integer verified from the shipped campaign', () => {
    // 0 up, 1 down, 2 left, 3 right — campaign/levels/level_10.xml ids 2579-2582.
    const expected: Record<BossTrapDirection, number> = { up: 0, down: 1, left: 2, right: 3 }
    for (const direction of BOSS_TRAP_DIRECTIONS) {
      const ctx = freshCtx()
      buildTrapRig(ctx, [wave(trap(direction))], arenaOf())
      expect(spewers(ctx)[0].direction).toBe(expected[direction])
    }
  })

  it('mixes ammunition on one wall when a tier carries two rows of the same direction', () => {
    const ctx = freshCtx()
    buildTrapRig(
      ctx,
      [wave(trap('up', 3, 'enemy_axe'), trap('up', 2, 'enemy_boss_anubis_fireball', 0, 1500))],
      arenaOf()
    )

    const placed = spewers(ctx)
    expect(placed).toHaveLength(5)
    expect(placed.filter((s) => s.projectilePath.endsWith('enemy_axe.xml'))).toHaveLength(3)
    expect(placed.filter((s) => s.projectilePath.endsWith('enemy_boss_anubis_fireball.xml'))).toHaveLength(2)
    // all on the south wall, none stacked
    expect(placed.every((s) => s.y === ARENA_H - 1 + 0.5)).toBe(true)
    expect(new Set(placed.map((s) => s.x)).size).toBe(5)
  })

  it('skips a row naming an unknown projectile rather than throwing', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 2, 'not_a_projectile'), trap('up', 1))], arenaOf())
    expect(spewers(ctx)).toHaveLength(1)
  })

  it('skips a row asking for no spewers', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 0))], arenaOf())
    expect(ctx.scriptNodes).toHaveLength(0)
  })
})

describe('boss traps — tiers replace one another', () => {
  it('brings tier 0 up live with no trigger of its own', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 2))], arenaOf())

    expect(spewers(ctx).every((s) => s.enabled)).toBe(true)
    expect(triggers(ctx)).toHaveLength(0)
  })

  it('ships a later tier disabled behind its own threshold trigger', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(), wave(), wave(trap('up', 2)), wave(), wave()], arenaOf())

    expect(spewers(ctx).every((s) => !s.enabled)).toBe(true)
    const trig = triggers(ctx)
    expect(trig).toHaveLength(1)
    // tier 2 fires on TIER_EVENT_NAMES[1]
    expect(eventOf(trig[0])).toBe(TIER_EVENT_NAMES[1])

    // it switches its own two on and nothing off — no earlier tier carries any
    const toggles = trig[0].connections
    expect(toggles).toHaveLength(2)
    expect(toggles.every((t) => t.type === 'ToggleElement' && stateOf(t) === 0)).toBe(true)
  })

  it('switches the previous carrying tier off as it switches its own on', () => {
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 2)), wave(), wave(trap('down', 3)), wave(), wave()], arenaOf())

    const trig = triggers(ctx)
    expect(trig).toHaveLength(1)
    const toggles = trig[0].connections
    // two off (the opening tier's) then three on (its own)
    expect(toggles.filter((t) => stateOf(t) === 1)).toHaveLength(2)
    expect(toggles.filter((t) => stateOf(t) === 0)).toHaveLength(3)
  })

  it('names the nearest EARLIER carrying tier, not tier - 1', () => {
    // Traps at 100% and 25% only: the 25% trigger must switch the 100% set off,
    // and there is no tier-3 set to name.
    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 2)), wave(), wave(), wave(trap('down', 1)), wave()], arenaOf())

    const trig = triggers(ctx)
    expect(trig).toHaveLength(1)
    expect(eventOf(trig[0])).toBe(TIER_EVENT_NAMES[2])

    const off = trig[0].connections.filter((t) => stateOf(t) === 1)
    expect(off).toHaveLength(2)
    // and they point at the two opening spewers
    const opening = spewers(ctx).filter((s) => s.enabled).map((s) => s.id)
    expect(opening).toHaveLength(2)
    const targets = off.map((t) => (t as unknown as { element: number }).element)
    expect(new Set(targets)).toEqual(new Set(opening))
  })

  it('leaves every connection pointing at a node that exists', () => {
    const ctx = freshCtx()
    buildTrapRig(
      ctx,
      [wave(trap('up', 2)), wave(trap('down', 2)), wave(trap('left', 2)), wave(trap('right', 2)), wave(trap('up', 1))],
      arenaOf()
    )
    expect(connectionsResolve(ctx)).toBe(true)
  })
})

describe('boss traps — placement', () => {
  /**
   * The tile a spewer stands on. Emitted coordinates are tile CENTRES — an
   * integer is a corner in this dialect, and on a minimum-edge wall that corner
   * sits on the boundary with the band, which is what killed the projectiles in
   * the 2026-09-02 playtest. Every assertion below is about tiles, so they go
   * back through here rather than reading `s.x`/`s.y` raw.
   */
  const tileX = (s: SpewerView): number => s.x - 0.5
  const tileY = (s: SpewerView): number => s.y - 0.5

  /**
   * The row a north-wall trap stands on for a themeless test arena: not 0, but
   * clear of the two rows the lettered themes' wall art buries.
   */
  const NORTH_ROW = 2

  /** The wall a direction's spewers must stand on. */
  function onCorrectWall(s: SpewerView, direction: BossTrapDirection): boolean {
    if (direction === 'up') return tileY(s) === ARENA_H - 1
    if (direction === 'down') return tileY(s) === NORTH_ROW
    if (direction === 'left') return tileX(s) === ARENA_W - 1
    return tileX(s) === 0
  }

  it('emits every spewer on its tile centre, never on the integer corner', () => {
    const ctx = freshCtx(99)
    buildTrapRig(ctx, [wave(trap('up', 3), trap('down', 3), trap('left', 3), trap('right', 3))], arenaOf())
    const placed = spewers(ctx)
    expect(placed.length).toBeGreaterThan(0)
    for (const s of placed) {
      expect(s.x % 1).toBe(0.5)
      expect(s.y % 1).toBe(0.5)
    }
  })

  it('drops the north wall clear of its overhang, but only on a theme that has one', () => {
    // A lettered theme buries the two floor rows under any wall mass.
    const lettered = freshCtx(4)
    buildTrapRig(lettered, [wave(trap('down', 3))], arenaOf({ theme: 'a' }))
    for (const s of spewers(lettered)) expect(tileY(s)).toBe(2)

    // Theme h anchors its art on its own tile and buries nothing, so row 0 is
    // the innermost tile there in fact as well as in name.
    const flat = freshCtx(4)
    buildTrapRig(flat, [wave(trap('down', 3))], arenaOf({ theme: 'h' }))
    for (const s of spewers(flat)) expect(tileY(s)).toBe(0)
  })

  it('stands each spewer on the innermost floor tile of the wall it fires away from', () => {
    for (const direction of BOSS_TRAP_DIRECTIONS) {
      const ctx = freshCtx(99)
      buildTrapRig(ctx, [wave(trap(direction, 4))], arenaOf())
      const placed = spewers(ctx)
      expect(placed.length).toBeGreaterThan(0)
      expect(placed.every((s) => onCorrectWall(s, direction))).toBe(true)
    }
  })

  it('keeps clear of the corners, the entrance, the alcove mouth and each other', () => {
    // A sweep, because placement is seeded: one seed proving it is luck.
    for (let seed = 0; seed < 200; seed++) {
      for (const alcoveWall of ['N', 'E', 'W'] as const) {
        const ctx = freshCtx(seed)
        const arena = arenaOf({ alcoveWall })
        buildTrapRig(
          ctx,
          [wave(trap('up', 3), trap('down', 3), trap('left', 3), trap('right', 3))],
          arena
        )

        const placed = spewers(ctx)
        for (const s of placed) {
          const vertical = tileX(s) === 0 || tileX(s) === ARENA_W - 1
          const along = vertical ? tileY(s) : tileX(s)
          const span = vertical ? ARENA_H : ARENA_W

          // corners
          expect(along).toBeGreaterThanOrEqual(TRAP_WALL_MARGIN)
          expect(along).toBeLessThanOrEqual(span - 1 - TRAP_WALL_MARGIN)

          // the entrance strip, on the south wall only
          if (tileY(s) === ARENA_H - 1) {
            const clearOfEntrance =
              along < ENTRANCE.x - TRAP_WALL_MARGIN || along > ENTRANCE.x + ENTRANCE.width - 1 + TRAP_WALL_MARGIN
            expect(clearOfEntrance).toBe(true)
          }

          // the alcove mouth, on whichever wall took it
          const mouthMid = alcoveWall === 'N' ? arena.midX : arena.midY
          const onAlcoveWall =
            (alcoveWall === 'N' && tileY(s) === NORTH_ROW) ||
            (alcoveWall === 'E' && tileX(s) === ARENA_W - 1) ||
            (alcoveWall === 'W' && tileX(s) === 0)
          if (onAlcoveWall) {
            const clearOfMouth =
              along < mouthMid - 1 - TRAP_WALL_MARGIN || along > mouthMid + 1 + TRAP_WALL_MARGIN
            expect(clearOfMouth).toBe(true)
          }
        }

        // no two spewers closer than the spacing
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            const gap = Math.abs(placed[i].x - placed[j].x) + Math.abs(placed[i].y - placed[j].y)
            expect(gap).toBeGreaterThanOrEqual(TRAP_MIN_SPACING)
          }
        }
      }
    }
  })

  it('carries one slot pool per wall across all five tiers', () => {
    // Tier 3's spewers must not land on tier 0's.
    const ctx = freshCtx(7)
    buildTrapRig(
      ctx,
      [wave(trap('up', 3)), wave(), wave(trap('up', 3)), wave(trap('up', 2)), wave()],
      arenaOf()
    )
    const placed = spewers(ctx)
    expect(placed).toHaveLength(8)
    expect(new Set(placed.map((s) => `${s.x},${s.y}`)).size).toBe(8)
  })

  it('skips a slot a cover pillar stands on', () => {
    // Bury the whole south wall except a three-tile window; every spewer must
    // land inside it.
    const walkable = new Uint8Array(ARENA_W * ARENA_H).fill(1)
    const row = ARENA_H - 1
    for (let x = 0; x < ARENA_W; x++) walkable[x + row * ARENA_W] = 0
    for (const x of [5, 6, 7]) walkable[x + row * ARENA_W] = 1

    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 4))], arenaOf({ walkable }))
    for (const s of spewers(ctx)) {
      expect([5, 6, 7]).toContain(tileX(s))
    }
  })

  it('stops placing rather than stacking when a wall runs out of room', () => {
    // A wall buried end to end has no legal slot at all.
    const walkable = new Uint8Array(ARENA_W * ARENA_H).fill(1)
    const row = ARENA_H - 1
    for (let x = 0; x < ARENA_W; x++) walkable[x + row * ARENA_W] = 0

    const ctx = freshCtx()
    buildTrapRig(ctx, [wave(trap('up', 6))], arenaOf({ walkable }))
    expect(spewers(ctx)).toHaveLength(0)
    // and nothing was drawn for the spewers that could not be placed
    expect(ctx.scriptNodes.filter((n) => n.type === 'ProjectileSpewer')).toHaveLength(0)
  })

  it('never places more on a wall than wallCapacity promises', () => {
    for (const direction of BOSS_TRAP_DIRECTIONS) {
      const ctx = freshCtx(3)
      buildTrapRig(ctx, [wave(trap(direction, MAX_TRAP_COUNT))], arenaOf())
      expect(spewers(ctx).length).toBeLessThanOrEqual(wallCapacity(ARENA_W, ARENA_H, direction))
    }
  })
})

describe('boss traps — determinism', () => {
  it('produces the same placements for the same seed', () => {
    const build = () => {
      const ctx = freshCtx(31337)
      buildTrapRig(ctx, [wave(trap('up', 4), trap('left', 3))], arenaOf())
      return spewers(ctx).map((s) => `${s.x},${s.y},${s.direction}`)
    }
    expect(build()).toEqual(build())
  })

  it('moves the positions but not the count on a different seed', () => {
    const build = (seed: number) => {
      const ctx = freshCtx(seed)
      buildTrapRig(ctx, [wave(trap('up', 4))], arenaOf())
      return spewers(ctx).map((s) => s.x)
    }
    const a = build(1)
    const b = build(2)
    expect(a).toHaveLength(4)
    expect(b).toHaveLength(4)
    expect(a).not.toEqual(b)
  })

  it('draws after every layout draw, so traps cannot move the arena layout', () => {
    // Cover pillars, the boss actor, the food and the orb are all decided before
    // the trap draws, so those sections must be byte-identical whether or not
    // traps are on. The tilemap is NOT: getArenaXML rolls its floor-tile
    // variants after this rig, so those shift. That is cosmetic and documented
    // in traps.ts — what must never move is the layout, which this asserts.
    const params = defaultParameters()
    const base = params.boss.fights[0].arena
    const without = {
      ...base,
      waves: base.waves.map((w) => {
        const next = { ...w }
        delete next.traps
        return next
      })
    }
    const withTraps = {
      ...without,
      waves: without.waves.map((w, i) => (i === 2 ? { ...w, traps: [trap('up', 3)] } : w))
    }

    const plain = buildBossArena(freshCtx(555), without, 0)
    const trapped = buildBossArena(freshCtx(555), withTraps, 0)

    // Doodads (the cover pillars and the alcove seals) and actors (the boss),
    // which sit between the tilemap and the scripting section.
    const layoutOf = (xml: string) =>
      xml.slice(xml.indexOf('<dictionary name="doodads">'), xml.indexOf('<dictionary name="scripting">'))
    expect(layoutOf(trapped.xml)).toBe(layoutOf(plain.xml))

    // Items — the scattered food and the victory orb — come after scripting.
    const itemsOf = (xml: string) => xml.slice(xml.indexOf('<dictionary name="items">'))
    expect(itemsOf(trapped.xml)).toBe(itemsOf(plain.xml))

    // And the wall/floor geometry itself, which the preview carries verbatim.
    expect(JSON.stringify(trapped.preview.rooms)).toBe(JSON.stringify(plain.preview.rooms))

    expect(trapped.xml).not.toBe(plain.xml)
    expect(trapped.xml).toContain('ProjectileSpewer')
  })
})

describe('boss traps — the projectile roster', () => {
  it('gives every entry a unique id and a projectiles/ path', () => {
    const ids = PROJECTILE_DEFS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const def of PROJECTILE_DEFS) {
      expect(def.path).toBe(`projectiles/${def.id}.xml`)
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
      expect(projectileById(def.id)).toBe(def)
    }
  })

  it('offers nothing that does zero damage from a spewer', () => {
    // The 2026-09-02 playtest cut 22 entries on this rule: a spewer has no
    // character stats, so a projectile whose damage comes from the weapon that
    // normally fires it is a light show, not a trap. Asserting it here means a
    // future "these look nice, put them back" has to argue with a test.
    for (const def of PROJECTILE_DEFS) {
      expect(def.damage).toBeGreaterThan(0)
    }
    expect(PROJECTILE_GROUPS).not.toContain('Player (no damage)')
    expect(PROJECTILE_GROUPS).not.toContain('Misc')
  })

  it('resolves every entry through the rig', () => {
    for (const def of PROJECTILE_DEFS) {
      const ctx = freshCtx()
      buildTrapRig(ctx, [wave(trap('up', 1, def.id))], arenaOf())
      expect(spewers(ctx)[0].projectilePath).toBe(def.path)
    }
  })
})

describe('boss traps — validation', () => {
  function paramsWithTrap(patch: Partial<BossTrap>) {
    const params = defaultParameters()
    const arena = params.boss.fights[0].arena
    arena.waves = arena.waves.map((w, i) =>
      i === 0 ? { ...w, traps: [{ ...trap('up', 1), ...patch }] } : w
    )
    return params
  }

  const errorsFor = (patch: Partial<BossTrap>) =>
    validateParameters(paramsWithTrap(patch)).errors.filter((e) => e.field.includes('.traps.'))
  const warningsFor = (patch: Partial<BossTrap>) =>
    validateParameters(paramsWithTrap(patch)).warnings.filter((w) => w.field.includes('traps'))

  it('accepts a well-formed row', () => {
    expect(errorsFor({})).toEqual([])
  })

  it('rejects an unknown projectile', () => {
    expect(errorsFor({ projectile: 'nope' })[0].field).toContain('.projectile')
  })

  it('rejects a direction that is not one of the four', () => {
    expect(errorsFor({ direction: 'sideways' as BossTrapDirection })[0].field).toContain('.direction')
  })

  it('rejects a spread outside 0..2 but accepts the decimals between', () => {
    expect(errorsFor({ spread: -0.1 })[0].field).toContain('.spread')
    expect(errorsFor({ spread: TRAP_SPREAD_MAX + 0.1 })[0].field).toContain('.spread')
    expect(errorsFor({ spread: 0 })).toEqual([])
    expect(errorsFor({ spread: 0.25 })).toEqual([])
    expect(errorsFor({ spread: 1.75 })).toEqual([])
    expect(errorsFor({ spread: TRAP_SPREAD_MAX })).toEqual([])
  })

  it('rejects a non-positive or fractional spawn rate', () => {
    expect(errorsFor({ spawnRateMs: 0 })[0].field).toContain('.spawnRateMs')
    expect(errorsFor({ spawnRateMs: 12.5 })[0].field).toContain('.spawnRateMs')
  })

  it('warns rather than errors on a very fast spawn rate', () => {
    expect(errorsFor({ spawnRateMs: 10 })).toEqual([])
    expect(warningsFor({ spawnRateMs: 10 })).toHaveLength(1)
    expect(warningsFor({ spawnRateMs: 1000 })).toEqual([])
  })

  it('bounds the count', () => {
    expect(errorsFor({ count: 0 })[0].field).toContain('.count')
    expect(errorsFor({ count: MAX_TRAP_COUNT + 1 })[0].field).toContain('.count')
    expect(errorsFor({ count: MAX_TRAP_COUNT })).toEqual([])
  })

  it('warns when one wall is asked for more spewers than it can hold', () => {
    const params = defaultParameters()
    const arena = params.boss.fights[0].arena
    // every tier crams the maximum onto the same wall
    arena.waves = arena.waves.map((w) => ({ ...w, traps: [trap('up', MAX_TRAP_COUNT)] }))
    const warnings = validateParameters(params).warnings.filter((w) => w.message.includes('spewers'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('south wall')
  })

  it('leaves the stock parameters clean', () => {
    const result = validateParameters(defaultParameters())
    expect(result.errors.filter((e) => e.field.includes('trap'))).toEqual([])
    expect(result.warnings.filter((w) => w.field.includes('trap'))).toEqual([])
  })
})
