/**
 * Hammerwatch 2 monsters (experimental "Load custom" content; custom/sources.ts).
 *
 * Only units a scenario can carry as they are: every script class their whole
 * closure (includes, projectiles, buffs) uses is one AE defines. Checked with
 * `node scripts/run-ts.mjs scripts/dev/probe-hw2-actors.ts --ok`, which plans
 * each unit's copy the way an install does. Most of HW2's roster (wolves,
 * wasps, boars, the empire, the archons, every boss) needs classes AE lacks,
 * such as DashStrike and CompositeActorUtilitySkill, and waits on spike S2
 * (docs/discovery/hammerwatch-2-spikes.md).
 *
 * Their sounds are HW2's FMOD events, which AE's banks mostly lack: the copy
 * blanks those, so these fight quietly. [UNVERIFIED in game] that each one
 * behaves as in HW2: AE shares the class names, not necessarily every parameter.
 */

import type { MonsterTypeDef } from '../../objects/monsterTypes'

const A = 'hw2/actors'

function hw2Monster(name: string, defaultMax: number, upgradeChance: number, tiers: string[]): MonsterTypeDef {
  return {
    id: `hw2_${name}`,
    configKey: `max_hw2_${name}`,
    upgradeChance,
    defaultMax,
    group: 'Hammerwatch 2',
    tiers,
    source: 'hw2'
  }
}

export const HW2_MONSTERS: readonly MonsterTypeDef[] = [
  hw2Monster('troll_brute', 8, 0.3, [`${A}/beasts/trolls/troll_brute.unit`, `${A}/beasts/trolls/troll_brute_elite.unit`]),
  hw2Monster('troll_brute_rotten', 6, 1.0, [`${A}/beasts/trolls/troll_brute_rotten.unit`]),
  hw2Monster('tick', 60, 0.3, [`${A}/beasts/ticks/tick_1_small.unit`, `${A}/beasts/ticks/tick_1.unit`, `${A}/beasts/ticks/tick_1_elite.unit`]),
  hw2Monster('crab', 40, 0.3, [`${A}/beasts/crabs/crab.unit`, `${A}/beasts/crabs/crab_blue.unit`]),
  hw2Monster('bat', 60, 1.0, [`${A}/beasts/bats/bat_black.unit`]),
  hw2Monster('snake_asp', 12, 1.0, [`${A}/beasts/snakes/snake_asp.unit`]),
  hw2Monster('eye_of_confusion', 8, 1.0, [`${A}/aberrations/eye_of_confusion.unit`]),
  hw2Monster('horde_crawler', 40, 1.0, [`${A}/undead/horde/horde_crawler.unit`]),
  hw2Monster('rotten_crawler', 40, 1.0, [`${A}/undead/rotten/rotten_crawler.unit`]),
  hw2Monster('rotten_footman', 30, 1.0, [`${A}/undead/rotten/rotten_footman.unit`]),
  hw2Monster('rotten_defender', 15, 1.0, [`${A}/undead/rotten/rotten_defender.unit`]),
  hw2Monster('rotten_sentry', 15, 1.0, [`${A}/undead/rotten/rotten_sentry.unit`]),
  hw2Monster('rotten_warlock', 10, 1.0, [`${A}/undead/rotten/rotten_warlock.unit`]),
  hw2Monster('rotten_templar', 6, 1.0, [`${A}/undead/rotten/rotten_templar.unit`]),
  hw2Monster('corrupt_vine', 20, 1.0, [`${A}/misc/corrupt_vine/corrupt_vine.unit`])
]
