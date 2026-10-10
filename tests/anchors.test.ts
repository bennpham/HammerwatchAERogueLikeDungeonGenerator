import { describe, expect, it } from 'vitest'
import { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH, NORTH_ANCHOR_INSET, anchors } from '../src/generator/boss/anchors'
import { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH } from '../src/generator/boss/geometry'
import {
  largestBossFootprintArea,
  BOSS_DEF_LIST,
  BOSS_DEFS,
  topWallBossClearance,
  topWallBossY
} from '../src/generator/boss/bosses'

// The parameter range boss.arena allows by default (boss-tab.md §6) plus the
// hard floor validation.ts enforces (ARENA_MIN_WIDTH/HEIGHT).
const SIZES: Array<[number, number]> = [
  [ARENA_MIN_WIDTH, ARENA_MIN_HEIGHT], // the hard floor
  [24, 32], // the old default min — still a legal size, so it must still hold
  [32, 44], // the old default max
  [28, 38], // something in between
  [42, 42], // the default min (both axes)
  [64, 64], // the default max
  [53, 47], // something in between
  [66, 88], // the interim 2026-08-27 range — still legal, so it must still hold
  [88, 88]
]

function entranceRect(width: number, height: number) {
  const midX = Math.trunc(width / 2)
  const left = midX - Math.trunc(ENTRANCE_WIDTH / 2)
  const right = midX + Math.trunc(ENTRANCE_WIDTH / 2)
  const top = height - ENTRANCE_DEPTH
  const bottom = height - 1
  return { left, right, top, bottom }
}

const largestFootprint = Math.max(...BOSS_DEF_LIST.map((d) => Math.max(d.footprintWidth, d.footprintHeight)))

describe('boss arena anchors', () => {
  for (const [width, height] of SIZES) {
    describe(`${width}x${height}`, () => {
      const points = anchors(width, height)

      it('produces exactly 9 anchors, one of each id', () => {
        expect(points).toHaveLength(9)
        expect(new Set(points.map((a) => a.id)).size).toBe(9)
        expect(points.map((a) => a.id).sort()).toEqual(['C', 'E', 'N', 'NE', 'NW', 'S', 'SE', 'SW', 'W'].sort())
      })

      it('all 9 are distinct points', () => {
        const keys = new Set(points.map((a) => `${a.x},${a.y}`))
        expect(keys.size).toBe(9)
      })

      it('all 9 sit strictly inside the wall band, inset by ANCHOR_INSET', () => {
        for (const a of points) {
          expect(a.x).toBeGreaterThanOrEqual(ANCHOR_INSET)
          expect(a.x).toBeLessThanOrEqual(width - 1 - ANCHOR_INSET)
          expect(a.y).toBeGreaterThanOrEqual(ANCHOR_INSET)
          expect(a.y).toBeLessThanOrEqual(height - 1 - ANCHOR_INSET)
          // and strictly away from the boundary tiles touching the wall band
          expect(a.x).toBeGreaterThan(0)
          expect(a.x).toBeLessThan(width - 1)
          expect(a.y).toBeGreaterThan(0)
          expect(a.y).toBeLessThan(height - 1)
        }
      })

      // A tower spawned at ANCHOR_INSET from the north wall fires into the
      // wall band and every projectile is absorbed (issue #19) — the three
      // northern anchors sit at NORTH_ANCHOR_INSET instead. The other six are
      // untouched by that fix, so pin them to ANCHOR_INSET explicitly.
      it('the northern anchors sit at NORTH_ANCHOR_INSET, the rest at ANCHOR_INSET', () => {
        const at = (id: string) => points.find((a) => a.id === id)!
        for (const id of ['N', 'NE', 'NW']) expect(at(id).y).toBe(NORTH_ANCHOR_INSET)
        for (const id of ['S', 'SE', 'SW']) expect(at(id).y).toBe(height - 1 - ANCHOR_INSET)
        for (const id of ['W', 'NW', 'SW']) expect(at(id).x).toBe(ANCHOR_INSET)
        for (const id of ['E', 'NE', 'SE']) expect(at(id).x).toBe(width - 1 - ANCHOR_INSET)
      })

      // The deeper north inset eats into the gap between the N and C rows. At
      // the hard floor (ARENA_MIN_HEIGHT) it must still leave three distinct
      // rows, or N collapses onto C and the arena loses a spawn point.
      it('the north, centre and south rows stay strictly ordered', () => {
        const midY = Math.trunc(height / 2)
        expect(NORTH_ANCHOR_INSET).toBeLessThan(midY)
        expect(midY).toBeLessThan(height - 1 - ANCHOR_INSET)
      })

      it('the S anchor never collides with the entrance mouth', () => {
        const s = points.find((a) => a.id === 'S')!
        const rect = entranceRect(width, height)
        const inside = s.x >= rect.left && s.x <= rect.right && s.y >= rect.top && s.y <= rect.bottom
        expect(inside).toBe(false)
      })

      it('the centre boss footprint never swallows another anchor (all stay reachable)', () => {
        const centre = points.find((a) => a.id === 'C')!
        const halfExtent = largestFootprint / 2
        for (const a of points) {
          if (a.id === 'C') continue
          const dx = Math.abs(a.x - centre.x)
          const dy = Math.abs(a.y - centre.y)
          // a spawn point under the boss's own footprint would be unreachable
          expect(dx > halfExtent || dy > halfExtent).toBe(true)
        }
      })
    })
  }

  it('largestBossFootprintArea is consistent with the per-axis max used above', () => {
    // sanity: area must be <= the square of the largest single-axis extent
    expect(largestBossFootprintArea()).toBeLessThanOrEqual(largestFootprint * largestFootprint)
  })
})

/**
 * `bossClearance` exists because a wall-mounted (topWall) boss sits ON the
 * arena's midX, exactly where the N anchor is — so its collider swallows that
 * anchor whole and wave monsters would spawn inside the boss. See arena.ts and
 * bosses.ts's `topWallBossClearance`.
 */
describe('boss arena anchors — topWall boss clearance', () => {
  const dragon = BOSS_DEFS.boss_dragon

  for (const [width, height] of SIZES) {
    describe(`${width}x${height}`, () => {
      const bossY = topWallBossY(dragon)
      const clearance = topWallBossClearance(dragon, bossY)
      const plain = anchors(width, height)
      const cleared = anchors(width, height, { northClearance: clearance })

      it('omitting the argument changes nothing at all', () => {
        expect(anchors(width, height, {})).toEqual(plain)
      })

      it('moves only the N anchor', () => {
        for (let i = 0; i < plain.length; i++) {
          if (cleared[i].id === 'N') continue
          expect(cleared[i]).toEqual(plain[i])
        }
        expect(cleared.map((a) => a.id)).toEqual(plain.map((a) => a.id))
      })

      it('pushes N clear of the dragon collider it used to sit inside', () => {
        const n = cleared.find((a) => a.id === 'N')!
        const colliderBottom = bossY + (dragon.collisionOffsetY ?? 0) + dragon.footprintHeight / 2
        expect(n.y).toBeGreaterThan(colliderBottom)
        // and the un-cleared anchor really was the problem — otherwise this
        // whole parameter is dead weight
        expect(plain.find((a) => a.id === 'N')!.y).toBeLessThan(colliderBottom)
      })

      it('never pushes N past the centre row, so the 9 anchors stay distinct', () => {
        const midY = Math.trunc(height / 2)
        const n = cleared.find((a) => a.id === 'N')!
        expect(n.y).toBeLessThanOrEqual(midY)
        expect(n.y).toBeGreaterThanOrEqual(NORTH_ANCHOR_INSET)
      })

      it('an absurd clearance clamps at the centre row rather than escaping the arena', () => {
        const n = anchors(width, height, { northClearance: height * 10 }).find((a) => a.id === 'N')!
        expect(n.y).toBe(Math.trunc(height / 2))
      })

      it('all 9 still sit on interior floor', () => {
        for (const a of cleared) {
          expect(a.x).toBeGreaterThan(0)
          expect(a.x).toBeLessThan(width - 1)
          expect(a.y).toBeGreaterThan(0)
          expect(a.y).toBeLessThan(height - 1)
        }
      })
    })
  }
})

/**
 * The other half of the same problem the topWall clearance above solves, found
 * in the 4-player playtest of 2026-08-27: `arena.ts` puts a `centre` boss at
 * exactly `(midX, midY)`, which is exactly where the C anchor sat, so every
 * monster the anchor rig sent to C spawned inside the boss. Visibly so with the
 * queen, whose collider is the largest of the seven at 5.06 x 5.19 tiles.
 */
describe('boss arena anchors — centre boss clearance', () => {
  const centreBosses = BOSS_DEF_LIST.filter((d) => d.placement === 'centre')

  for (const [width, height] of SIZES) {
    describe(`${width}x${height}`, () => {
      const midX = Math.trunc(width / 2)
      const midY = Math.trunc(height / 2)

      for (const def of centreBosses) {
        const boss = { width: def.footprintWidth, height: def.footprintHeight }
        const cleared = anchors(width, height, { centreBoss: boss })
        const c = cleared.find((a) => a.id === 'C')!

        it(`${def.id}: C is outside the boss collider`, () => {
          const insideX = Math.abs(c.x - midX) < boss.width / 2
          const insideY = Math.abs(c.y - midY) < boss.height / 2
          expect(insideX && insideY).toBe(false)
        })

        it(`${def.id}: C still sits on interior floor, and not on another anchor`, () => {
          expect(c.x).toBeGreaterThan(0)
          expect(c.x).toBeLessThan(width - 1)
          expect(c.y).toBeGreaterThan(0)
          expect(c.y).toBeLessThan(height - 1)
          const others = cleared.filter((a) => a.id !== 'C')
          expect(others.some((a) => a.x === c.x && a.y === c.y)).toBe(false)
        })

        it(`${def.id}: nothing but C moves`, () => {
          const plain = anchors(width, height)
          for (const a of cleared) {
            if (a.id === 'C') continue
            expect(a).toEqual(plain.find((p) => p.id === a.id))
          }
        })
      }

      it('omitting centreBoss leaves C on the arena centre, as it always was', () => {
        const c = anchors(width, height).find((a) => a.id === 'C')!
        expect(c).toEqual({ id: 'C', x: midX, y: midY })
      })

      it('the queen — the largest footprint — clears by at least half of it', () => {
        const queen = BOSS_DEFS.boss_queen
        const c = anchors(width, height, {
          centreBoss: { width: queen.footprintWidth, height: queen.footprintHeight }
        }).find((a) => a.id === 'C')!
        expect(c.y - midY).toBeGreaterThanOrEqual(Math.ceil(queen.footprintHeight / 2))
      })
    })
  }
})
