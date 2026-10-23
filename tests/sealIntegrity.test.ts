import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { campaignPresetById } from '../src/generator/config/presets'
import { orbReachableWithoutButton, walkToTarget } from './sealProbe'
import { isWallPiece, levelsOf } from './ae'

/**
 * The floor's actual promise: the orb cannot be had without opening its gate.
 *
 * `map/sealCheck.ts` enforces this inside the generator, off the in-memory
 * rooms and doodads. This asserts it again from the *emitted .lvl*, through an
 * independent reading of the same collision data — so a floor that the
 * generator believes is sealed but writes out wrong still gets caught. The two
 * are deliberately not shared.
 *
 * Every seed below leaked before the check existed. They split into two
 * families, and both are represented: a barrier in the wrong place (29, 37, 59
 * on the lettered themes), and a gated room simply open on a second side, with
 * no barrier position able to help (8, 12, 20, 31, 35, 60).
 */
const ONCE_LEAKED = [8, 12, 20, 21, 29, 31, 35, 37, 55, 59, 60]

describe('the final room cannot be entered without opening its gate', () => {
  for (const theme of ['prison', 'cave_desert', 'bonus1'] as const) {
    it(`holds on theme ${theme}`, () => {
      const seeds = [...new Set([...Array.from({ length: 12 }, (_, i) => i + 1), ...ONCE_LEAKED])]
      let checked = 0

      for (const seed of seeds) {
        const params = plainParameters()
        params.themes = params.themes.map(() => theme)
        // The boss and the lobby cost most of a campaign's generation time and
        // draw from their own streams, so turning them off leaves every
        // floor byte-identical (CLAUDE.md invariant 6) while
        // keeping this sweep cheap enough not to time out its neighbours. The
        // orb room ships a crystal instead of the portal; the probe reads both.
        params.boss.enabled = false
        params.lobbies = []
        const result = generateDungeon(params, seed)
        expect(result.ok, `${theme} seed ${seed} failed to generate`).toBe(true)

        const ok = result as DungeonResult
        const floor = params.levels - 1
        const level = ok.levels[floor]
        const lvl = levelsOf(ok).get(`floor${floor}`)!
        const probe = orbReachableWithoutButton(level, lvl)
        if (probe.reachable === null) continue // nothing gates this floor
        checked++
        expect(
          probe.reachable,
          `${theme} seed ${seed}: orb reachable with the gate intact`
        ).toBe(false)
        // control: with the doors open the same walk must succeed, or the
        // probe is blocking something it should not and proves nothing
        const opened = { ...lvl, units: lvl.units.filter((u) => !u.path.startsWith('doodads/doors/door_')) }
        const sealCells = new Set(
          lvl.units
            .filter((u) => isWallPiece(u.path))
            .filter((u) => level.walls[Math.floor(u.x / 16) + Math.floor(u.y / 16) * level.mapWidth] !== '1')
        )
        opened.units = opened.units.filter((u) => !sealCells.has(u))
        expect(walkToTarget(level, opened).reachable, `${theme} seed ${seed}: control`).toBe(true)
      }

      // a sweep that silently checked nothing would pass forever
      expect(checked, `${theme} checked no sealed floor`).toBeGreaterThan(seeds.length / 2)
    }, 300_000)
  }

  // The sweep above turns lobbies off, so a floor whose way on is the blue
  // lobby portal was never walked: the generator's own checks looked for the
  // orb or the red portal only, found no goal, and passed it unchecked. Frozen
  // Descent's floor 5 at this seed (the boss floor before the boss-prep
  // lobby) shipped with its corridor touching the gated passage below the boss
  // seal, so the party walked round it (dungeon_1428135045, 2026-10-23).
  it('holds on a boss floor that leads into a lobby (Frozen Descent, seed 1428135045)', () => {
    const params = campaignPresetById('claude-frozen-descent')!.build()
    const result = generateDungeon(params, 1428135045)
    expect(result.ok).toBe(true)
    const ok = result as DungeonResult
    const lvls = levelsOf(ok)
    let checked = 0
    for (const preview of ok.levels.filter((l) => /^\d+$/.test(l.label))) {
      const lvl = lvls.get(`floor${Number(preview.label) - 1}`)!
      const probe = orbReachableWithoutButton(preview, lvl)
      if (probe.reachable === null) continue
      checked++
      expect(probe.reachable, `floor ${preview.label}: way on reachable with the seal intact`).toBe(false)
    }
    expect(checked).toBeGreaterThan(0)
  }, 300_000)
})
