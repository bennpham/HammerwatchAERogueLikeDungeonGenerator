import type { Rand } from '../core/rand'

/**
 * How a mixed theme lays its palette out across the boss arena.
 *
 * The dungeon floors mix per room and per corridor, but the arena is one open
 * rectangle — region granularity would paint the whole fight floor a single
 * variant and the theme would look no different from a plain pairing. So the
 * arena gets a geometric pattern instead, rolled once per generation.
 *
 * Everything here is a pure function of the pattern and a cell's *local* arena
 * coordinates. `pickArenaPattern` is the only part that touches a `Rand`, and
 * the caller must only reach it for a theme that actually has a palette — see
 * the determinism note in `arena.ts`.
 */

/**
 * Field patterns tile the whole floor and cycle through every palette slot;
 * centre shapes are two-state, an inlay of one slot on a ground of another.
 */
export type ArenaPatternKind =
  | 'checker'
  | 'bandsH'
  | 'bandsV'
  | 'bandsDiag'
  | 'rings'
  | 'diamond'
  | 'cross'
  | 'triangle'

export const ARENA_PATTERN_KINDS: readonly ArenaPatternKind[] = [
  'checker',
  'bandsH',
  'bandsV',
  'bandsDiag',
  'rings',
  'diamond',
  'cross',
  'triangle'
]

const SHAPE_KINDS: readonly ArenaPatternKind[] = ['diamond', 'cross', 'triangle']

/**
 * Whether a kind is a two-state centre inlay rather than a repeating field.
 * The Boss tab groups its dropdown by this.
 */
export function isShapePattern(kind: ArenaPatternKind): boolean {
  return SHAPE_KINDS.includes(kind)
}

/** Dropdown text for each kind, in `ARENA_PATTERN_KINDS` order. */
export const ARENA_PATTERN_LABELS: Readonly<Record<ArenaPatternKind, string>> = {
  checker: 'checkerboard',
  bandsH: 'horizontal bands',
  bandsV: 'vertical bands',
  bandsDiag: 'diagonal bands',
  rings: 'concentric rings',
  diamond: 'centre diamond',
  cross: 'centre cross',
  triangle: 'centre triangle'
}

export interface ArenaPattern {
  kind: ArenaPatternKind
  /** cell size of a check / band / ring, or the half-width of a cross arm */
  scale: number
  /** slot painted inside a centre shape; unused by the field patterns */
  inside: number
  /** slot painted outside a centre shape; unused by the field patterns */
  outside: number
  /** how many palette slots there are, so `patternVariant` needs no extra arg */
  slots: number
}

/**
 * Roll a pattern for one arena. Draws from `rand` — call only when the theme
 * has a `mixed` palette, or a plain arena's tile variants shift and every
 * existing boss seed changes.
 *
 * `forced` pins the kind to the one the user chose in the Boss tab; the roll
 * still happens and is discarded. That fixed draw count is deliberate: picking
 * a pattern instead of leaving it random must change *only* the floor pattern,
 * leaving the same seed's monsters, cover, tile variants and every other
 * bossRand consumer byte-identical.
 */
export function pickArenaPattern(
  rand: Rand,
  slots: number,
  forced?: ArenaPatternKind
): ArenaPattern {
  const rolled = ARENA_PATTERN_KINDS[Math.trunc(rand.nextFloat() * ARENA_PATTERN_KINDS.length)]
  const scale = 2 + Math.trunc(rand.nextFloat() * 4)

  // A shape reads as an inlay only if its ground is the plain base most of the
  // time, so `outside` is biased to slot 0 and `inside` is any other slot.
  // Drawn whatever the kind — a field pattern ignores both, but skipping the
  // draws would make the stream depend on the kind and so on the user's choice.
  const inside = 1 + Math.trunc(rand.nextFloat() * (slots - 1))
  const secondChoice = rand.nextFloat()
  // With only two slots the alternative to 0 *is* `inside`, and a shape whose
  // ground matches its inlay is a uniform floor — so the two-slot palettes
  // (themes a and i) always ground on the plain base.
  const outside = secondChoice < 0.75 || slots < 3 ? 0 : (inside % (slots - 1)) + 1

  return { kind: forced ?? rolled, scale, inside, outside, slots }
}

/**
 * The palette slot for one arena cell, in local arena coordinates — the space
 * the fight rectangle spans `0..w-1` x `0..h-1`, so a pattern is centred on the
 * floor the fight happens on rather than on the padded tile grid.
 */
export function patternVariant(
  p: ArenaPattern,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  const n = p.slots
  const s = p.scale
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2

  switch (p.kind) {
    case 'checker':
      return (Math.floor(x / s) + Math.floor(y / s)) % n
    case 'bandsH':
      return Math.floor(y / s) % n
    case 'bandsV':
      return Math.floor(x / s) % n
    case 'bandsDiag':
      return Math.floor((x + y) / s) % n
    case 'rings':
      // Chebyshev distance, so the rings are squares that follow the arena's
      // own shape rather than circles cut off by its corners.
      return Math.floor(Math.max(Math.abs(x - cx), Math.abs(y - cy)) / s) % n
    case 'diamond': {
      const radius = Math.min(w, h) * 0.35
      return Math.abs(x - cx) + Math.abs(y - cy) <= radius ? p.inside : p.outside
    }
    case 'cross': {
      const arm = Math.max(1, s - 1)
      return Math.abs(x - cx) <= arm || Math.abs(y - cy) <= arm ? p.inside : p.outside
    }
    case 'triangle': {
      // Apex at the top centre, widening towards the bottom edge.
      const slope = w / (2 * Math.max(1, h))
      return Math.abs(x - cx) <= y * slope ? p.inside : p.outside
    }
  }
}
