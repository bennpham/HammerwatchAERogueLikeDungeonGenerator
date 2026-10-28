/**
 * One-click monster themes for a world: which campaign's monsters roam the
 * island. Pressing one on the World tab writes its pool into `world.monsters`,
 * which stays editable in the full picker underneath, so a theme is a starting
 * point, not a mode. Every key is a floor-pool key (`tests/world.test.ts`
 * checks them with `isKnownFloorPoolKey`).
 *
 * The Castle acts follow the stock campaign's floors (`defaultParameters()`'s
 * first four pools, towers left out: a world's packs and ambushes stand in the
 * open). `mixed` is every campaign's roaming monsters at once.
 */

import { MONSTER_TYPES } from '../objects/monsterTypes'

export interface MonsterTheme {
  id: string
  label: string
  /** what the button's tooltip says */
  description: string
  monsters: readonly string[]
}

/** The groups a roaming world monster comes from: no towers, mini-bosses, bodyguards or bonus ghosts. */
const ROAMING_GROUPS: readonly string[] = ['Undead', 'Beasts', 'Aberrations', 'Shaftlocke', 'Temple of the Sun']

export const MONSTER_THEMES: readonly MonsterTheme[] = [
  {
    id: 'castle_act1',
    label: 'Castle: Act 1',
    description: "The prison's bats, ticks, maggots and flowers.",
    monsters: ['bat', 'tick', 'maggot', 'flower_small', 'flower_eater', 'slime']
  },
  {
    id: 'castle_act2',
    label: 'Castle: Act 2',
    description: "The armory's skeletons, with maggots and slimes.",
    monsters: ['maggot', 'slime', 'skeleton_warrior', 'skeleton_archer', 'skeleton_runner']
  },
  {
    id: 'castle_act3',
    label: 'Castle: Act 3',
    description: "The archives' eyes, wisps, liches and ghosts.",
    monsters: ['eye', 'wisp', 'wisp#3', 'skeleton_lich#3', 'ghost']
  },
  {
    id: 'castle_act4',
    label: 'Castle: Act 4',
    description: "The chambers' soldiers, rangers and liches.",
    monsters: ['skeleton_soldier', 'skeleton_ranger', 'skeleton_lich', 'wisp', 'eye', 'skull']
  },
  {
    id: 'temple',
    label: 'Temple of the Sun',
    description: 'Mummies, temple guards and scorpions.',
    monsters: ['temple_warrior', 'temple_soldier', 'temple_archer', 'mummy', 'mummy_guard', 'mummy_mage', 'mummy_lich', 'scorpion']
  },
  {
    id: 'shaftlocke',
    label: 'Shaftlocke',
    description: "Shaftlocke's prison and armory troops, crawlers and liches.",
    monsters: [
      'prison_warrior',
      'prison_archer',
      'armory_warrior',
      'armory_archer',
      'skeleton_lancer',
      'shaftlocke_maggot',
      'shaftlocke_maggot_spiky',
      'crawler',
      'guardian',
      'shaftlocke_lich',
      'bannerman_bloodlust'
    ]
  },
  {
    id: 'wilds',
    label: 'Wilds',
    description: 'Beasts only: bats, bugs, scorpions, slimes, flowers and cave trolls.',
    monsters: ['bat', 'tick', 'maggot', 'maggot_spiky', 'scorpion', 'slime', 'flower_small', 'flower_eater', 'troll_cave']
  },
  {
    id: 'frost',
    label: 'Frost',
    description: 'Ice trolls and elementals, ghosts and skeletons: made for a snow island.',
    monsters: ['troll_ice', 'elemental_ice', 'ghost', 'ancient_ghost', 'skeleton_warrior', 'skeleton_archer']
  },
  {
    id: 'bonus',
    label: 'Bonus',
    description: "The bonus levels' demons and ghosts.",
    monsters: ['bonus_demon', 'bonus_ghost']
  },
  {
    id: 'mixed',
    label: 'Mixed',
    description: 'Every campaign at once: every roaming monster AE ships.',
    monsters: MONSTER_TYPES.filter(
      (t) => !t.deprecated && (t.campaigns?.length ?? 0) > 0 && ROAMING_GROUPS.includes(t.group)
    ).map((t) => t.id)
  }
]

/** The theme whose pool `monsters` is exactly (order aside), or undefined. */
export function matchingTheme(monsters: readonly string[]): MonsterTheme | undefined {
  const key = (list: readonly string[]) => [...list].sort().join(',')
  const wanted = key(monsters)
  return MONSTER_THEMES.find((t) => key(t.monsters) === wanted)
}
