/**
 * Whole-world starting points for the World tab. Each is a plain patch onto
 * the world being edited, so after pressing one every value stays editable and
 * the world serialises like any other. The biome, size and music are left as
 * they were unless the preset is about them (Speedrun's small island).
 *
 * A preset with mystery plates needs a mystery pool; the World tab adds the
 * starter pool when the campaign has none (`needsMysteryPool`).
 */

import { MONSTER_THEMES } from './monsterThemes'
import type { WorldDef } from './options'

export interface WorldPreset {
  id: string
  label: string
  description: string
  patch: Partial<WorldDef>
  /** true when the patch scatters mystery plates, which need a pool */
  needsMysteryPool: boolean
}

const mixed = MONSTER_THEMES.find((t) => t.id === 'mixed')!.monsters

export const WORLD_PRESETS: readonly WorldPreset[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'A calm island to wander: few, small packs, light ambushes, plenty of coins and mystery plates.',
    patch: {
      packs: 12,
      packSize: 4,
      ambushes: 2,
      ambushSize: 4,
      buttonAmbush: 0,
      ambushTypes: [],
      loot: 16,
      mysteryPlates: 8,
      disguise: false,
      scatter: 60
    },
    needsMysteryPool: true
  },
  {
    id: 'treasure_hunt',
    label: 'Treasure hunt',
    description:
      'Six real buttons hidden among twenty mystery plates, every one looking the same. No boss: the hunt is the goal.',
    patch: {
      buttons: 6,
      bossCount: 0,
      bossSelection: 'random',
      mysteryPlates: 20,
      disguise: true,
      packs: 20,
      ambushes: 6,
      buttonAmbush: 0,
      loot: 10
    },
    needsMysteryPool: true
  },
  {
    id: 'monster_island',
    label: 'Monster island',
    description: 'Every campaign\'s monsters, in big packs and heavy ambushes, with two bosses to kill.',
    patch: {
      monsters: [...mixed],
      packs: 60,
      packSize: 10,
      ambushes: 16,
      ambushSize: 10,
      buttonAmbush: 100,
      ambushTypes: [],
      bossCount: 2,
      bossSelection: 'random',
      mysteryPlates: 0,
      disguise: false
    },
    needsMysteryPool: false
  },
  {
    id: 'speedrun',
    label: 'Speedrun',
    description: 'A small island, three buttons and a boss, against a five-minute clock.',
    patch: {
      minWidth: 128,
      maxWidth: 128,
      minHeight: 128,
      maxHeight: 128,
      buttons: 3,
      bossCount: 1,
      bossSelection: 'random',
      packs: 15,
      ambushes: 4,
      timer: { enabled: true, seconds: 300, damage: 2, freqMs: 1000, countdown: true }
    },
    needsMysteryPool: false
  }
]
