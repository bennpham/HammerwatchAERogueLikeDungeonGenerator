/**
 * Hammerwatch 2 monsters (experimental "Load custom" content; custom/sources.ts).
 *
 * Every unit here copies whole into a scenario: its closure (includes,
 * projectiles, buffs) uses only script classes AE defines or classes the copy
 * carries from HW2's own scripts (main/custom/scriptPlan.ts). Checked with
 * `node scripts/run-ts.mjs scripts/dev/probe-hw2-actors.ts --ok`, which plans
 * each unit's copy the way an install does. Left out: spawners, nests, turrets
 * facing one way (cannons, haunted armor and gargoyles), boss parts and summons,
 * the Kingdom's soldiers (the Empire's, recoloured), and units made for one HW2
 * arena (`*_archibald`, `*_sinkage`).
 *
 * Their sounds ship with them, converted from HW2's own banks
 * (main/custom/hw2/sounds.ts). [UNVERIFIED in game] that each behaves as in
 * HW2: AE shares the class names, not necessarily every parameter.
 *
 * A tier list runs weakest first, the way AE's own monsters upgrade. The
 * default cap follows HW2's health (actors/_actor_stats.inc): swarms of the
 * weak, a few of the big.
 */

import type { MonsterGroup, MonsterTypeDef } from '../../objects/monsterTypes'

const A = 'hw2/actors'

function hw2Monster(group: MonsterGroup, name: string, defaultMax: number, upgradeChance: number, tiers: string[]): MonsterTypeDef {
  return {
    id: `hw2_${name}`,
    configKey: `max_hw2_${name}`,
    upgradeChance,
    defaultMax,
    group,
    tiers,
    source: 'hw2'
  }
}

const BEASTS: MonsterGroup = 'Hammerwatch 2: Beasts'
const HUMANS: MonsterGroup = 'Hammerwatch 2: Humans'
const UNDEAD: MonsterGroup = 'Hammerwatch 2: Undead'
const OTHER: MonsterGroup = 'Hammerwatch 2: Other'

/** One type per unit, or a weakest-first tier list (an elite after its plain self). */
const one = (group: MonsterGroup, name: string, max: number, path: string) => hw2Monster(group, name, max, 1.0, [`${A}/${path}.unit`])
const tiers = (group: MonsterGroup, name: string, max: number, paths: string[]) =>
  hw2Monster(group, name, max, 0.3, paths.map((p) => `${A}/${p}.unit`))
const withElite = (group: MonsterGroup, name: string, max: number, path: string) => tiers(group, name, max, [path, `${path}_elite`])

export const HW2_MONSTERS: readonly MonsterTypeDef[] = [
  // the first fifteen, ids kept (MONSTER_TYPES is append-only)
  hw2Monster(BEASTS, 'troll_brute', 8, 0.3, [`${A}/beasts/trolls/troll_brute.unit`, `${A}/beasts/trolls/troll_brute_elite.unit`]),
  hw2Monster(BEASTS, 'troll_brute_rotten', 6, 1.0, [`${A}/beasts/trolls/troll_brute_rotten.unit`]),
  hw2Monster(BEASTS, 'tick', 60, 0.3, [`${A}/beasts/ticks/tick_1_small.unit`, `${A}/beasts/ticks/tick_1.unit`, `${A}/beasts/ticks/tick_1_elite.unit`]),
  hw2Monster(BEASTS, 'crab', 40, 0.3, [`${A}/beasts/crabs/crab.unit`, `${A}/beasts/crabs/crab_blue.unit`]),
  hw2Monster(BEASTS, 'bat', 60, 1.0, [`${A}/beasts/bats/bat_black.unit`]),
  hw2Monster(BEASTS, 'snake_asp', 12, 1.0, [`${A}/beasts/snakes/snake_asp.unit`]),
  hw2Monster(OTHER, 'eye_of_confusion', 8, 1.0, [`${A}/aberrations/eye_of_confusion.unit`]),
  hw2Monster(UNDEAD, 'horde_crawler', 40, 1.0, [`${A}/undead/horde/horde_crawler.unit`]),
  hw2Monster(UNDEAD, 'rotten_crawler', 40, 1.0, [`${A}/undead/rotten/rotten_crawler.unit`]),
  hw2Monster(UNDEAD, 'rotten_footman', 30, 1.0, [`${A}/undead/rotten/rotten_footman.unit`]),
  hw2Monster(UNDEAD, 'rotten_defender', 15, 1.0, [`${A}/undead/rotten/rotten_defender.unit`]),
  hw2Monster(UNDEAD, 'rotten_sentry', 15, 1.0, [`${A}/undead/rotten/rotten_sentry.unit`]),
  hw2Monster(UNDEAD, 'rotten_warlock', 10, 1.0, [`${A}/undead/rotten/rotten_warlock.unit`]),
  hw2Monster(UNDEAD, 'rotten_templar', 6, 1.0, [`${A}/undead/rotten/rotten_templar.unit`]),
  hw2Monster(OTHER, 'corrupt_vine', 20, 1.0, [`${A}/misc/corrupt_vine/corrupt_vine.unit`]),

  // beasts
  tiers(BEASTS, 'beetle_green', 60, ['beasts/beetles/beetle_green_small', 'beasts/beetles/beetle_green', 'beasts/beetles/beetle_green_massive']),
  one(BEASTS, 'beetle_green_ranged', 30, 'beasts/beetles/beetle_green_ranged'),
  tiers(BEASTS, 'beetle_black', 40, ['beasts/beetles/beetle_black_small', 'beasts/beetles/beetle_black', 'beasts/beetles/beetle_black_massive']),
  one(BEASTS, 'beetle_black_ranged', 30, 'beasts/beetles/beetle_black_ranged'),
  tiers(BEASTS, 'beetle_frost', 40, ['beasts/beetles/beetle_frost_small', 'beasts/beetles/beetle_frost', 'beasts/beetles/beetle_frost_massive']),
  one(BEASTS, 'beetle_frost_ranged', 30, 'beasts/beetles/beetle_frost_ranged'),
  tiers(BEASTS, 'boar', 10, ['beasts/boars/boar_razorback', 'beasts/boars/boar_grand', 'beasts/boars/boar_warthog']),
  tiers(BEASTS, 'boar_rotten', 6, ['beasts/boars/boar_razorback_rotten', 'beasts/boars/boar_grand_rotten', 'beasts/boars/boar_warthog_rotten']),
  one(BEASTS, 'maggot_grub', 40, 'beasts/maggots/maggot_grub'),
  withElite(BEASTS, 'maggot_giant', 30, 'beasts/maggots/maggot_giant'),
  one(BEASTS, 'maggot_giant_spiked', 20, 'beasts/maggots/maggot_giant_spiked'),
  one(BEASTS, 'maggot_devourer', 12, 'beasts/maggots/maggot_devour'),
  withElite(BEASTS, 'shambler_small', 8, 'beasts/shamblers/shambler_small'),
  one(BEASTS, 'shambler_big', 6, 'beasts/shamblers/shambler_big'),
  tiers(BEASTS, 'shambler_rotten', 6, ['beasts/shamblers/shambler_small_rotten', 'beasts/shamblers/shambler_big_rotten']),
  one(BEASTS, 'spider_hatchling', 40, 'beasts/spiders/spider_hatchling'),
  withElite(BEASTS, 'spider_black', 15, 'beasts/spiders/spider_black'),
  withElite(BEASTS, 'spider_white', 15, 'beasts/spiders/spider_white'),
  tiers(BEASTS, 'spider_rotten', 15, ['beasts/spiders/spider_hatchling_rotten', 'beasts/spiders/spider_black_rotten']),
  withElite(BEASTS, 'troll_shaman', 8, 'beasts/trolls/troll_shaman'),
  one(BEASTS, 'troll_shaman_rotten', 6, 'beasts/trolls/troll_shaman_rotten'),
  one(BEASTS, 'troll_ruler', 4, 'beasts/trolls/troll_ruler'),
  one(BEASTS, 'troll_ruler_rotten', 4, 'beasts/trolls/troll_ruler_rotten'),
  tiers(BEASTS, 'wasp', 20, ['beasts/wasps/yellow_jacket', 'beasts/wasps/red_jacket', 'beasts/wasps/black_jacket']),
  one(BEASTS, 'wasp_rotten', 15, 'beasts/wasps/black_jacket_rotten'),
  withElite(BEASTS, 'wolf_grey', 40, 'beasts/wolves/wolf_grey'),
  withElite(BEASTS, 'wolf_black', 20, 'beasts/wolves/wolf_black'),
  one(BEASTS, 'wolf_rotten', 12, 'beasts/wolves/wolf_black_rotten'),
  withElite(BEASTS, 'wolf_demon', 15, 'beasts/wolves/wolf_demon'),
  tiers(BEASTS, 'worg', 6, ['beasts/wolves/wolf_worg', 'beasts/wolves/wolf_worg_demon']),
  one(BEASTS, 'worg_rotten', 4, 'beasts/wolves/wolf_worg_rotten'),

  // aberrations
  one(OTHER, 'wisp_fire', 10, 'aberrations/wisp_fire'),
  one(OTHER, 'wisp_ice', 10, 'aberrations/wisp_ice'),
  one(OTHER, 'wisp_lightning', 10, 'aberrations/wisp_lightning'),

  // humans
  withElite(HUMANS, 'empire_footman', 10, 'humans/empire/empire_footman'),
  withElite(HUMANS, 'empire_defender', 10, 'humans/empire/empire_defender'),
  withElite(HUMANS, 'empire_pikeman', 20, 'humans/empire/empire_pikeman'),
  withElite(HUMANS, 'empire_sentry', 10, 'humans/empire/empire_sentry'),
  withElite(HUMANS, 'empire_crossbowman', 20, 'humans/empire/empire_crossbowman'),
  withElite(HUMANS, 'empire_sage', 20, 'humans/empire/empire_sage'),
  withElite(HUMANS, 'empire_warlock', 10, 'humans/empire/empire_warlock'),
  one(HUMANS, 'empire_templar', 4, 'humans/empire/empire_templar'),
  withElite(HUMANS, 'pirate_raider', 30, 'humans/pirates/pirate_raider'),
  withElite(HUMANS, 'pirate_scout', 30, 'humans/pirates/pirate_scout'),
  one(HUMANS, 'pirate_captain', 15, 'humans/pirates/pirate_captain'),
  one(HUMANS, 'corsair_raider', 12, 'humans/pirates/corsair_raider'),
  one(HUMANS, 'corsair_scout', 12, 'humans/pirates/corsair_scout'),
  one(HUMANS, 'corsair_captain', 6, 'humans/pirates/corsair_captain'),
  withElite(HUMANS, 'thief_bandit', 20, 'humans/thieves/thief_bandit'),
  withElite(HUMANS, 'thief_brute', 20, 'humans/thieves/thief_brute'),
  withElite(HUMANS, 'thief_hunter', 20, 'humans/thieves/thief_hunter'),
  withElite(HUMANS, 'thief_mage', 20, 'humans/thieves/thief_mage'),
  one(HUMANS, 'thief_chieftain', 8, 'humans/thieves/thief_chieftain'),

  // undead
  one(UNDEAD, 'archon_advocate', 4, 'undead/archons/archon_advocate'),
  withElite(UNDEAD, 'archon_occultist', 8, 'undead/archons/archon_occultist'),
  withElite(UNDEAD, 'archon_punisher', 8, 'undead/archons/archon_punisher'),
  withElite(UNDEAD, 'archon_sniper', 8, 'undead/archons/archon_sniper'),
  withElite(UNDEAD, 'archon_wizard', 8, 'undead/archons/archon_wizard'),
  withElite(UNDEAD, 'horde_warrior', 20, 'undead/horde/horde_warrior'),
  withElite(UNDEAD, 'horde_soldier', 20, 'undead/horde/horde_soldier'),
  withElite(UNDEAD, 'horde_ranger', 20, 'undead/horde/horde_ranger'),
  withElite(UNDEAD, 'horde_sorcerer', 15, 'undead/horde/horde_sorcerer'),
  withElite(UNDEAD, 'horde_necromancer', 15, 'undead/horde/horde_necromancer'),
  one(UNDEAD, 'horde_guard', 6, 'undead/horde/horde_guard')
]
