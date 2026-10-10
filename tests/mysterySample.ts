import type { MysteryButton } from '../src/generator/config/parameters'

/**
 * The owner's hand-built `test_mystery_button_simple.xml`, as a pool: a
 * treasure button, a dud, an ambush and a trap room. The mystery tests index
 * into it (0 treasure, 1 dud, 2 ambush with `mb_skeleton`, 3 trap room), so it
 * is frozen here rather than borrowed from `mysteryStarterPool()`, which is
 * tuned for play and may change. Fresh every call.
 */
export function samplePool(): MysteryButton[] {
  return [
    {
      name: 'Treasure',
      text: 'You got treasure',
      loot: [
        { item: 'chest_red', count: 3 },
        { item: 'upgrade_damage_2', count: 2 }
      ],
      monsters: [],
      traps: []
    },
    { name: 'Nothing', text: 'Nothing happened', loot: [], monsters: [], traps: [] },
    { name: 'Ambush', text: 'Monsters appear', loot: [], monsters: [{ monster: 'mb_skeleton', count: 4 }], traps: [] },
    {
      name: 'Trap room',
      text: 'Traps activated',
      loot: [],
      monsters: [],
      traps: [
        { projectile: 'shooter_fireball_2', direction: 'left', spread: 0.5, spawnRateMs: 500, count: 1 },
        { projectile: 'shooter_fireball_2', direction: 'right', spread: 0.5, spawnRateMs: 500, count: 1 }
      ]
    }
  ]
}
