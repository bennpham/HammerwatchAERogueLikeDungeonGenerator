import { describe, expect, it } from 'vitest'
import { CAMPAIGN_PRESETS } from '../src/generator/config/presets'
import type { DungeonResult, PreviewRoom } from '../src/generator'
import { generateOk, levelsOf } from './ae'

/**
 * Every plate the party must find — a lock button, a disguised lock button, a
 * mystery plate — stands on floor they can see. A room's floor runs down to
 * row `y + height`, and the south wall's art covers that row and the one
 * above it (room.ts visibleDropY); dungeon_336053618's floor-7 lock button
 * was hidden there.
 */
const PLATES: Record<string, number> = {
  // anchored top-left: the unit's position is the plate's tile
  'doodads/doors/boss_door_button.unit': 0,
  // centred: emitted half a tile in
  'doodads/generic/button_round.unit': 0.5
}

interface Plate {
  stem: string
  x: number
  y: number
  room?: PreviewRoom
}

function platesOf(result: DungeonResult): Plate[] {
  const plates: Plate[] = []
  for (const [stem, level] of levelsOf(result)) {
    const m = /^floor(\d+)$/.exec(stem)
    if (m === null) continue
    // floorN is the preview's level N, label N + 1
    const preview = result.levels.find((l) => l.label === String(Number(m[1]) + 1))
    for (const unit of level.units) {
      const inset = PLATES[unit.path]
      if (inset === undefined) continue
      const x = unit.x / 16 - inset
      const y = unit.y / 16 - inset
      const room = preview?.rooms.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)
      plates.push({ stem, x, y, room })
    }
  }
  return plates
}

describe('plates the party must find stand on visible floor', () => {
  for (const id of ['castle', 'shaftlocke']) {
    it(`${id}: every lock button and mystery plate clears the south wall's art`, () => {
      const preset = CAMPAIGN_PRESETS.find((p) => p.id === id)
      expect(preset, id).toBeDefined()
      let checked = 0
      for (const seed of [1, 2, 3, 336053618]) {
        for (const plate of platesOf(generateOk(preset!.build(), seed))) {
          const where = `seed ${seed} ${plate.stem} plate at ${plate.x.toFixed(2)},${plate.y.toFixed(2)}`
          expect(plate.room, `${where}: in no room`).toBeDefined()
          // the plate covers y .. y + 1; the last visible row ends at y + height - 1
          expect(plate.y + 1, where).toBeLessThanOrEqual(plate.room!.y + plate.room!.height - 1)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    }, 300_000)
  }
})
