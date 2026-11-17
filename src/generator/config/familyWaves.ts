/**
 * The Temple of the Sun's and Shaftlocke's arena wave tables, shared by the
 * classic presets (`presets.ts`) and Campaign Mode (`campaignModePresets.ts`).
 * Castle's own table is `castleWaves()` in `parameters.ts`. Kept apart from
 * `presets.ts`, which imports every preset module, so a preset module can
 * import these without a cycle.
 */

import { scatterWave, stockWavePickups, bossDeathBuffs, SHOOTER_ARROW_TRAPS } from './parameters'
import type { BossWave } from './parameters'

/**
 * Desert's wave tiers. Guards alone at 100%, mummies from 75% on, and the
 * fire pillars/floaters held back until the boss is dead. Every entry is
 * scattered — nothing here leaves a blocking wreck, so nothing has to stay on
 * the anchors. The boss-death tier is the send-off: kamikazes, fire and all
 * three desert liches at once — see BOSS_DEATH_WAVE in parameters.ts.
 */
export function desertWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['mummy_guard', 120],
        ['mummy_guard', 60]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['mummy_guard', 60],
        ['mummy_guard', 30],
        ['mummy', 80],
        ['mummy', 120],
        ['mummy_mage', 60],
        ['mummy#0', 4],
        ['mummy_mage#0', 2]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['mummy', 120],
        ['mummy', 60],
        ['mummy#3', 40],
        ['mummy_mage', 40],
        ['mummy_mage#2', 60],
        ['mummy#0', 8],
        ['mummy_mage#0', 4],
        ['spider#0', 13],
        ['mb_mummy', 4]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['beheaded_kamikaze', 4],
        ['mummy#3', 80],
        ['mummy_mage#2', 60],
        ['spider#0', 60],
        ['mb_mummy', 8],
        ['mummy_lich#0', 4],
        ['mummy_lich#2', 24]
      ],
      [],
      1000,
      [],
      drops.quarter,
      SHOOTER_ARROW_TRAPS
    ),
    // boss death — the fire pillars and floaters wait for the kill, see
    // BOSS_DEATH_WAVE, and the whole send-off is bloodlusted, see bossDeathBuffs()
    scatterWave(
      [
        ['beheaded_kamikaze', 40],
        ['pillar_fire', 30],
        ['wisp#3', 60],
        ['spider#0', 30],
        ['mummy_lich', 6],
        ['mummy_lich#0', 6],
        ['mummy_lich#2', 6]
      ],
      [],
      1000,
      bossDeathBuffs(),
      drops.death,
      SHOOTER_ARROW_TRAPS
    )
  ]
}

/**
 * Shaftlocke's wave tiers: castleWaves() entry for entry. A Shaftlocke unit
 * with the castle one's stats keeps its count (the prison warriors and
 * archers, the footmen, the maggots); anything else is swapped for a
 * Shaftlocke unit of similar hp and role, scaled where it hits harder:
 *
 * - the sentry is the ranger firing every 450ms instead of 750, so 0.6× the count;
 * - the lich ladder starts at its spawner (`#0`, whose wreck blocks — never
 *   in a wave), so castle `skeleton_lich#n` is `shaftlocke_lich#(n+1)`, and
 *   its sorcerer has 250 hp to the castle's 75, so a third of the count;
 * - the guardian (150 hp) stands in for the knight's 150 hp guard, the
 *   Eye's adds and the Vampire's thralls and bats for the castle bosses'
 *   bodyguards, the battlemage for the elite battlements and imps for the
 *   flower beds;
 * - a pair of bannermen rides with each tier from 75% to 25%, the stock
 *   chambers' mobile banners.
 *
 * The anchored tail is the beamo tower, kept off the scatter like castle's novas.
 */
export function shaftlockeWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['bat', 42],
        ['bat', 24],
        ['shaftlocke_maggot', 20],
        ['shaftlocke_maggot#2', 12],
        ['shaftlocke_maggot#3', 6],
        ['tick', 24],
        ['tick#2', 16],
        ['tick#0', 2],
        ['flower_small', 6]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['prison_archer', 14],
        ['skeleton_sentry', 4],
        ['prison_warrior', 24],
        ['prison_warrior#2', 28],
        ['slime', 44],
        ['trapper', 4],
        ['mb_tick', 3],
        ['mb_shaftlocke_maggot', 1],
        ['prison_warrior#0', 2],
        ['prison_archer#0', 2],
        ['slime#0', 6],
        ['guardian', 4],
        ['bannerman_bloodlust', 2]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['eye', 44],
        ['eye#2', 30],
        ['wisp', 12],
        ['wisp#2', 4],
        ['wisp#3', 8],
        ['shaftlocke_lich#4', 8],
        ['gargoyle#0', 3],
        ['mb_shaftlocke_guard', 4],
        ['mb_eye', 1],
        ['bannerman_protection', 2],
        ['bannerman_healing', 2],
        // bodyguards — the Eye's own adds
        ['eye_add', 4]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['shaftlocke_lich#2', 4],
        ['shaftlocke_lich', 4],
        ['shaftlocke_lich#3', 2],
        ['mb_eye', 2],
        ['mb_shaftlocke_wizard', 1],
        ['battlemage', 3],
        ['eye#0', 5],
        ['skeleton_sentry#0', 4],
        ['skeleton_footman#0', 4],
        ['bannerman_drain', 2],
        // bodyguards — the Vampire's thrall and bats
        ['vampire_thrall', 1],
        ['vampire_bat', 4]
      ],
      [['tower_beamo', 3]],
      1000,
      [],
      drops.quarter,
      SHOOTER_ARROW_TRAPS
    ),
    // boss death — the arena keeps fighting after the kill, bloodlusted, see
    // BOSS_DEATH_WAVE and bossDeathBuffs()
    scatterWave(
      [
        ['shaftlocke_lich#3', 2],
        ['shaftlocke_lich#2', 2],
        ['shaftlocke_lich', 2],
        ['mb_shaftlocke_wizard', 1],
        ['mb_doomspawner', 2],
        ['vampire_thrall', 1]
      ],
      [['tower_beamo', 2]],
      1000,
      bossDeathBuffs(),
      drops.death,
      SHOOTER_ARROW_TRAPS
    )
  ]
}
