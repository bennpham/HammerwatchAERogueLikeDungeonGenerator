import { describe, expect, it } from 'vitest'
import {
  ARENA_PATTERN_KINDS,
  isShapePattern,
  patternVariant,
  pickArenaPattern
} from '../src/generator/boss/arenaPattern'
import type { ArenaPattern, ArenaPatternKind } from '../src/generator/boss/arenaPattern'
import { BOSS_FLOOR_PATTERNS } from '../src/generator/config/parameters'
import { Rand } from '../src/generator/core/rand'

const W = 33
const H = 27

function everyCell(p: ArenaPattern, fn: (v: number, x: number, y: number) => void): void {
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) fn(patternVariant(p, x, y, W, H), x, y)
  }
}

function pattern(kind: ArenaPatternKind, slots = 3): ArenaPattern {
  return { kind, scale: 3, inside: 1, outside: 0, slots }
}

describe('arena patterns', () => {
  // Collected rather than asserted per cell: this sweeps ~100k cells, and one
  // expect() each is slow enough to blow the default timeout.
  it('keeps every cell inside the palette for every kind and scale', () => {
    const bad: string[] = []
    for (const kind of ARENA_PATTERN_KINDS) {
      for (let slots = 2; slots <= 4; slots++) {
        for (let scale = 2; scale <= 5; scale++) {
          const p: ArenaPattern = { kind, scale, inside: slots - 1, outside: 0, slots }
          everyCell(p, (v, x, y) => {
            if (!Number.isInteger(v) || v < 0 || v >= slots) {
              bad.push(`${kind} slots=${slots} scale=${scale} @${x},${y} -> ${v}`)
            }
          })
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('is a pure function of its inputs', () => {
    const bad: string[] = []
    for (const kind of ARENA_PATTERN_KINDS) {
      const p = pattern(kind)
      everyCell(p, (v, x, y) => {
        if (patternVariant(p, x, y, W, H) !== v) bad.push(`${kind} @${x},${y}`)
      })
    }
    expect(bad).toEqual([])
  })

  // A pattern that paints one slot everywhere is indistinguishable from a plain
  // theme, which would make the whole feature invisible on the arena.
  it('uses more than one slot on an arena-sized floor', () => {
    for (const kind of ARENA_PATTERN_KINDS) {
      const seen = new Set<number>()
      everyCell(pattern(kind), (v) => seen.add(v))
      expect(seen.size, kind).toBeGreaterThan(1)
    }
  })

  it('cycles the whole palette for the field patterns', () => {
    for (const kind of ['checker', 'bandsH', 'bandsV', 'bandsDiag', 'rings'] as ArenaPatternKind[]) {
      const seen = new Set<number>()
      everyCell(pattern(kind, 3), (v) => seen.add(v))
      expect([...seen].sort(), kind).toEqual([0, 1, 2])
    }
  })

  it('keeps a centre shape to two slots, contiguous around the middle', () => {
    for (const kind of ['diamond', 'cross', 'triangle'] as ArenaPatternKind[]) {
      const p: ArenaPattern = { kind, scale: 3, inside: 2, outside: 0, slots: 3 }
      const seen = new Set<number>()
      everyCell(p, (v) => seen.add(v))
      expect([...seen].sort(), kind).toEqual([0, 2])
      // the shape covers the centre and not the corners
      expect(patternVariant(p, Math.trunc(W / 2), Math.trunc(H / 2), W, H), kind).toBe(2)
      expect(patternVariant(p, 0, 0, W, H), kind).toBe(0)
    }
  })

  // Drawn from one long-lived stream rather than a fresh Rand per seed:
  // java.util.Random barely diffuses its seed into the first output, so
  // consecutive small seeds all land on the same kind. The arena's ctx.bossRand
  // is hundreds of draws deep by the time it gets here, which this matches.
  it('reaches every kind over a long stream, and draws deterministically', () => {
    const seen = new Set<ArenaPatternKind>()
    const stream = new Rand(4242)
    for (let i = 0; i < 300; i++) {
      const p = pickArenaPattern(stream, 3)
      expect(p.slots).toBe(3)
      expect(p.scale).toBeGreaterThanOrEqual(2)
      expect(p.scale).toBeLessThanOrEqual(5)
      expect(p.inside).toBeGreaterThanOrEqual(0)
      expect(p.inside).toBeLessThan(3)
      expect(p.outside).toBeGreaterThanOrEqual(0)
      expect(p.outside).toBeLessThan(3)
      seen.add(p.kind)
    }
    expect([...seen].sort()).toEqual([...ARENA_PATTERN_KINDS].sort())

    // same stream position, same pattern
    expect(pickArenaPattern(new Rand(31337), 3)).toEqual(pickArenaPattern(new Rand(31337), 3))
  })

  // A shape whose inside and outside are the same slot paints a uniform floor,
  // which is the one outcome that makes the whole feature invisible. The
  // two-slot case is the one that regressed: `(inside % (slots - 1)) + 1` is
  // always 1 when slots is 2, which is exactly `inside`.
  it('never rolls a shape whose two slots collide, at any palette size', () => {
    for (let slots = 2; slots <= 4; slots++) {
      const stream = new Rand(99)
      for (let i = 0; i < 300; i++) {
        const p = pickArenaPattern(stream, slots)
        if (isShapePattern(p.kind)) {
          expect(p.inside, `slots=${slots} draw ${i}`).not.toBe(p.outside)
        }
      }
    }
  })

  // Choosing a pattern in the Boss tab must change only the pattern: the roll
  // still happens and is discarded, so every later bossRand consumer — cover,
  // monsters, tile variants — sees the identical stream.
  it('takes the same number of draws whether or not a kind is forced', () => {
    for (const kind of ARENA_PATTERN_KINDS) {
      const free = new Rand(4242)
      const forced = new Rand(4242)
      pickArenaPattern(free, 3)
      pickArenaPattern(forced, 3, kind)
      expect(free.nextFloat(), kind).toBe(forced.nextFloat())
    }
  })

  it('honours a forced kind and leaves everything else as rolled', () => {
    for (const kind of ARENA_PATTERN_KINDS) {
      const rolled = pickArenaPattern(new Rand(777), 3)
      const forced = pickArenaPattern(new Rand(777), 3, kind)
      expect(forced.kind).toBe(kind)
      expect(forced.scale).toBe(rolled.scale)
      expect(forced.inside).toBe(rolled.inside)
      expect(forced.outside).toBe(rolled.outside)
    }
  })

  // config/ spells the list out rather than importing boss/ at runtime.
  it('keeps BOSS_FLOOR_PATTERNS in sync with the kinds', () => {
    expect([...BOSS_FLOOR_PATTERNS]).toEqual(['random', ...ARENA_PATTERN_KINDS])
  })
})
