import {
  bossDeathBuffs,
  defaultFloorBuffs,
  defaultFloorTraps,
  defaultFloorTimer,
  defaultLobby,
  defaultParameters,
  shippedOrder,
  withGatewayLocks,
  escapeFloorTimer,
  escapeFloorTraps,
  scatterWave,
  stockWavePickups,
  SHOOTER_ARROW_TRAPS
} from './parameters'
import { oneOfEachUpgrade } from '../lobby/payout'
import type { BossTrap, BossWave, DungeonParameters, FloorTrap } from './parameters'
import { MUSIC_DEFAULT } from '../music/tracks'
import { BOSS_CAMPAIGNS } from '../boss/bosses'
import { CLAUDE_PRESETS } from './claudePresets'
import { COLOSSEUM_PRESETS } from './colosseumPreset'
import { deepLoot, escapePicks, midLoot, mysteryButton, mysteryKit, shallowLoot } from './presetMystery'
import type { MysteryPicks } from './presetMystery'

/**
 * The headers the preset dialog groups presets under — each rendered as a
 * collapsible section of the renderer's `PresetGuide`, in this order (oldest
 * campaign style first). `label` is the only user-visible text; the id is what
 * a preset's `group` field carries and is never shown.
 */
export type PresetGroupId = 'preAlpha' | 'classic' | 'colosseum' | 'claude'

export const PRESET_GROUPS: readonly { id: PresetGroupId; label: string }[] = [
  { id: 'preAlpha', label: 'Pre-Alpha' },
  { id: 'classic', label: 'Classic' },
  { id: 'colosseum', label: 'Colosseum' },
  { id: 'claude', label: 'Claude Generated' }
]

/**
 * A named starting point for a campaign: length, themes and per-floor monster
 * pools. Everything else (room sizes, chances, multipliers, monster maxes,
 * lobby, player tweaks) comes from `defaultParameters()` — a preset deliberately
 * does not override `monsterMax`, so the global caps keep bounding horde sizes.
 *
 * Pure data. This file is inside the generator, so it may not touch fs/electron
 * or the DOM, and `build()` must draw no random values — the renderer calls it
 * to seed a form, and the same preset must always produce the same parameters.
 */
export interface CampaignPreset {
  /** stable id the preset dialog loads by; never shown to the user */
  id: string
  /** the name the preset dialog lists */
  label: string
  /** one-line description of what the preset is for */
  description: string
  /** which `PRESET_GROUPS` section of the preset dialog this preset sits under */
  group: PresetGroupId
  /** a fresh parameter object every call — never a shared mutable one */
  build(): DungeonParameters
}

/**
 * `defaultParameters()` with the boss arena re-pointed at a preset's own theme
 * and boss line-up. Spread by hand rather than mutated, because `build()` must
 * hand back a fresh object every call and the arena is now three levels deep
 * (`boss` -> `fights` -> `fights[0]` -> `arena`) — a shallow `{...base, boss}`
 * would otherwise share the fight, and its arena, between callers.
 *
 * A preset ships a single fight. The count is a campaign-shaping choice rather
 * than a flavour one, so it is left to the dungeon master.
 *
 * `music` replaces the stock final-boss cue when given.
 */
function withBoss(theme: string, bossPool: string[], waves: BossWave[], music?: string): DungeonParameters['boss'] {
  const boss = defaultParameters().boss
  const fight = boss.fights[0]
  const arena = { ...fight.arena, theme, bossPool, waves }
  if (music !== undefined) arena.music = music
  return { ...boss, fights: [{ ...fight, arena }] }
}

/**
 * A preset's per-floor timers: every floor untimed except the last, which is
 * the escape floor played after the boss and carries the 90-second clock. Same
 * shape in all three presets, so it lives here rather than three times over.
 */
function escapeTimers(levels: number): ReturnType<typeof defaultFloorTimer>[] {
  return [
    ...Array.from({ length: Math.max(0, levels - 1) }, () => defaultFloorTimer()),
    escapeFloorTimer()
  ]
}

/**
 * Desert's wave tiers. Guards alone at 100%, mummies from 75% on, and the
 * fire pillars/floaters held back until the boss is dead. Every entry is
 * scattered — nothing here leaves a blocking wreck, so nothing has to stay on
 * the anchors. The boss-death tier is the send-off: kamikazes, fire and all
 * three desert liches at once — see BOSS_DEATH_WAVE in parameters.ts.
 */
function desertWaves(): BossWave[] {
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
function shaftlockeWaves(): BossWave[] {
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

/**
 * Bonus's wave tiers: the bonus-tileset skeletons and archers first, the
 * castle roster escalating behind them. The anchored tails are the towers whose
 * wrecks keep their collision and so cannot be scattered. The boss-death tier
 * replays the 25% line-up with wisps on top — see BOSS_DEATH_WAVE.
 */
/**
 * Bonus's own boss-death trap rig: purple magicballs on all four walls, wider
 * spread and slower than the shooter-arrow rig castle/desert share.
 */
const MAGICBALL_TRAPS: BossTrap[] = [
  { projectile: 'enemy_magicball_purple', direction: 'up', spread: 1, spawnRateMs: 1500, count: 4 },
  { projectile: 'enemy_magicball_purple', direction: 'down', spread: 1, spawnRateMs: 1500, count: 4 },
  { projectile: 'enemy_magicball_purple', direction: 'left', spread: 1, spawnRateMs: 1500, count: 4 },
  { projectile: 'enemy_magicball_purple', direction: 'right', spread: 1, spawnRateMs: 1500, count: 4 }
]

function bonusWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['bonus_demon', 120],
        ['bonus_ghost', 250],
        ['bonus_ghost#0', 16]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['skeleton_archer', 40],
        ['skeleton_ranger', 10],
        ['temple_archer', 10],
        ['skeleton_warrior', 80],
        ['skeleton_warrior#2', 60],
        ['tower_battlement_archer', 16],
        ['skeleton_warrior#0', 12],
        ['skeleton_archer#0', 6],
        // the knight's own guard (issue #64 part 2) — bodyguards.
        ['knight_guard', 6]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['skeleton_soldier', 60],
        ['skeleton_soldier#2', 80],
        ['skeleton_soldier#3', 40],
        ['skeleton_runner', 20],
        ['skeleton_lich#3', 30],
        ['skeleton_ranger', 15],
        ['temple_archer', 25],
        ['mb_skeleton_guard#0', 8],
        ['tower_battlement_archer_elite', 8],
        ['skeleton_ranger#0', 6],
        ['skeleton_soldier#0', 12],
        // bodyguards — Krilith's mini-boss skeleton and the lich's necromancer guard
        ['krilith_frost_guard', 3],
        ['lich_guard_lich', 3]
      ],
      [['tower_nova_ice', 4]],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['beheaded_kamikaze', 4],
        ['skeleton_lich', 2],
        ['skeleton_lich#0', 6],
        ['skeleton_lich#2', 2],
        ['mb_eye', 4],
        ['mb_wizard', 1],
        ['mb_doomspawner', 2],
        ['banner_bloodlust', 8],
        // bodyguards
        ['lich_guard_lich', 4],
        ['lich_mirror', 2]
      ],
      [
        ['tower_laser_ice', 1],
        ['tower_laser_drain', 1]
      ],
      1000,
      [],
      drops.quarter,
      SHOOTER_ARROW_TRAPS
    ),
    // boss death — the same line-up plus wisps, see BOSS_DEATH_WAVE, and
    // bloodlusted like every preset's send-off, see bossDeathBuffs()
    scatterWave(
      [
        ['skeleton_lich', 1],
        ['skeleton_lich#0', 8],
        ['skeleton_lich#2', 4],
        ['mb_eye', 2],
        ['mb_wizard', 1],
        ['mb_doomspawner', 2],
        ['banner_bloodlust', 8],
        ['wisp', 19],
        ['wisp#2', 10],
        // bodyguards — the Lich's necromancer guard and a last pair of Krilith skeletons
        ['lich_guard_lich', 2],
        ['krilith_frost_guard', 2]
      ],
      [
        ['tower_laser_ice', 1],
        ['tower_laser_fire', 1]
      ],
      1000,
      bossDeathBuffs(),
      drops.death,
      MAGICBALL_TRAPS
    )
  ]
}

// --- mystery buttons ------------------------------------------------------------
// Two plates on every floor and one on the escape floor, themed to each
// preset's acts and ramped by depth — see presetMystery.ts. The plates draw
// only from `ctx.mysteryRand` after a floor is accepted, so arming them moves
// no floor's rooms, walls, actors or items (invariant 8).

/**
 * Castle's plates follow its acts: vermin and flower beds, then the crypt's
 * skeletons and archers, the arcane floors' eyes and wisps, and the liches at
 * the bottom.
 */
function castleMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit()
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(2, shallowLoot(), [
        ['Tick nest', 5], ['Bat swarm', 4], ['Maggot brood', 3], ['Flower bed', 4],
        ['Arrow storm', 3], ['Fireball ring', 3]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Maggot brood', 3], ['Slime pit', 3], ['Skeleton squad', 4], ['Archer volley', 4], ['Tick nest', 2],
        ['Arrow storm', 3], ['Axe mill', 3]
      ]),
      kit.pick(2, midLoot(), [
        ['Eye cluster', 4], ['Wisps', 4], ['Necromancer', 4], ['Nova towers', 3],
        ['Purple drift', 3], ['Fireball ring', 3]
      ]),
      kit.pick(2, midLoot(), [
        ['Skeleton squad', 4], ['Archer volley', 4], ['Necromancer', 3], ['Wisps', 3], ['Drain tracking', 1],
        ['Axe mill', 3], ['Spike gauntlet', 2], ['Big fireball cross', 2]
      ]),
      kit.pick(2, midLoot(), [
        ['Tick nest', 3], ['Gold beetles', 3], ['Bat swarm', 3], ['Maggot brood', 3], ['Flower bed', 3],
        ['Poison nova', 3], ['Boulder run', 2], ['Arrow storm', 2]
      ]),
      kit.pick(2, deepLoot(['Defense upgrade II']), [
        ['Skeleton squad', 4], ['Eye cluster', 4], ['Archer volley', 3], ['Nova towers', 2],
        ['Fire and frost tracking', 2], ['Lich council', 1],
        ['Death orbs', 2], ['Spike gauntlet', 2], ['Purple drift', 3]
      ]),
      kit.pick(2, deepLoot(['Damage upgrade II', 'Health upgrade II']), [
        ['Lich council', 3], ['Necromancer', 3], ['Wisps', 3], ['Eye cluster', 2], ['Nova towers', 2],
        ['Kamikazes', 1], ['Drain tracking', 1],
        ['Death orbs', 3], ["Dragon's breath", 1], ['Purple drift', 2], ['Big fireball cross', 1]
      ]),
      kit.pick(1, escapePicks('Bat swarm'))
    ]
  }
}

/**
 * Desert's plates are a temple's treasury: heavy on coins and diamonds, with
 * scarabs guarding the hoards, temple guards early, and the mummy tomb and
 * Anubis' own fire held back for the last floors before the boss.
 */
function desertMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    mysteryButton('Scarab hoard', 'Scarabs guard a hoard', {
      monsters: [['tick_gold', 4], ['tick_gold#0', 2]],
      loot: [['valuable_8', 2], ['valuable_9', 1]]
    }),
    mysteryButton('Tomb offering', 'An offering to the sun', {
      loot: [['valuable_diamond_small', 2], ['valuable_diamond_small_red', 1]]
    }),
    mysteryButton('Temple guards', 'Temple guards!', {
      monsters: [['mummy_guard', 8], ['mummy_guard', 4]]
    }),
    mysteryButton('Sun priests', 'The priests awaken', {
      monsters: [['mummy_lich', 2], ['mummy_mage', 4]]
    })
  ])
  const treasure: MysteryPicks = [['Tomb offering', 2], ['Gold stash', 1]]
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      // the outdoor bug floor ahead of the temple
      kit.pick(2, shallowLoot(), [
        ['Tick nest', 5], ['Maggot brood', 3], ['Flower bed', 4], ['Bat swarm', 3],
        ['Arrow storm', 3], ['Fireball ring', 3]
      ]),
      kit.pick(2, shallowLoot(), treasure, [
        ['Temple guards', 6], ['Gold beetles', 3], ['Scarab hoard', 3], ['Tick nest', 2],
        ['Arrow storm', 3], ['Big fireball cross', 3]
      ]),
      kit.pick(2, midLoot(), treasure, [
        ['Temple guards', 4], ['Scarab hoard', 3], ['Spider nest', 3], ['Mummy tomb', 2], ['Gold beetles', 3],
        ['Big fireball cross', 3], ['Spike gauntlet', 3]
      ]),
      kit.pick(2, midLoot(), treasure, [
        ['Mummy tomb', 3], ['Sun priests', 3], ['Temple guards', 3], ['Spider nest', 3], ['Scarab hoard', 3],
        ['Boulder run', 2], ['Fireball ring', 2], ['Spike gauntlet', 2]
      ]),
      kit.pick(2, deepLoot(['Damage upgrade II', 'Defense upgrade II']), treasure, [
        ['Mummy tomb', 3], ['Spider nest', 3], ['Fire pillars', 3], ['Fire floaters', 3], ['Sun priests', 2],
        ['Kamikazes', 1],
        ["Anubis' wrath", 2], ['Big fireball cross', 2], ['Boulder run', 2], ['Death orbs', 1]
      ]),
      // the breather floor before the mummy rush — the treasury's richest
      kit.pick(2, deepLoot(['Health upgrade II']), treasure, treasure, [
        ['Gold beetles', 4], ['Scarab hoard', 4], ['Spider nest', 3], ['Tick nest', 3], ['Flower bed', 2],
        ['Arrow storm', 3], ['Fireball ring', 3]
      ]),
      kit.pick(1, escapePicks('Spider nest'))
    ]
  }
}

/**
 * Shaftlocke's plates climb the tower with the floors: the prison's cells and
 * maggot cysts, the crypt's guards and ghosts, the gold beetles and arrow and
 * spike traps of the mines (the stock mines have few traps, all of those
 * kinds), then the archives' eyes and confusion traps and the chambers'
 * footman phalanx and the tower's own lich council.
 */
function shaftlockeMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    mysteryButton('Prison break', 'The cells open', {
      monsters: [['prison_warrior#3', 2], ['prison_warrior#2', 8], ['prison_warrior', 4], ['trapper', 3]]
    }),
    mysteryButton('Crypt guard', 'The crypt stirs', {
      monsters: [['skeleton_lancer', 4], ['guardian', 2], ['armory_archer', 6]]
    }),
    mysteryButton('Haunting', 'Ghosts!', {
      monsters: [['ghost#0', 2], ['ghost#2', 2], ['ghost#4', 2], ['ancient_ghost', 2]]
    }),
    mysteryButton('Phalanx', 'Form ranks!', {
      monsters: [['skeleton_footman#2', 12], ['skeleton_defender', 2], ['skeleton_sentry', 4]]
    }),
    mysteryButton('Cyst bloom', 'Maggots!', {
      monsters: [['maggot_cyst', 2], ['shaftlocke_maggot', 10]]
    }),
    mysteryButton('Tower council', 'The council convenes', {
      monsters: [['mb_shaftlocke_wizard', 1], ['shaftlocke_lich#2', 4], ['shaftlocke_lich', 2], ['shaftlocke_lich#3', 1]]
    })
  ])
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(2, shallowLoot(), [
        ['Cyst bloom', 5], ['Bat swarm', 4], ['Prison break', 3], ['Slime pit', 3],
        ['Arrow storm', 3], ['Fireball ring', 3]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Prison break', 5], ['Cyst bloom', 3], ['Slime pit', 3], ['Bat swarm', 2],
        ['Arrow storm', 3], ['Axe mill', 3]
      ]),
      kit.pick(2, midLoot(), [
        ['Crypt guard', 4], ['Haunting', 4], ['Prison break', 2], ['Bat swarm', 2],
        ['Purple drift', 3], ['Fireball ring', 3]
      ]),
      kit.pick(2, midLoot(), [
        ['Crypt guard', 4], ['Haunting', 3], ['Phalanx', 2], ['Drain tracking', 1],
        ['Axe mill', 3], ['Spike gauntlet', 2], ['Big fireball cross', 2]
      ]),
      // the mines: the gold-beetle breather before the mini-boss floors
      kit.pick(2, midLoot(), [
        ['Gold beetles', 6], ['Tick nest', 3], ['Bat swarm', 3], ['Spider nest', 2], ['Cyst bloom', 2],
        ['Arrow storm', 3], ['Spike gauntlet', 2], ['Boulder run', 2]
      ]),
      kit.pick(2, deepLoot(['Defense upgrade II']), [
        ['Eye cluster', 4], ['Wisps', 4], ['Haunting', 3], ['Phalanx', 2],
        ['Fire and frost tracking', 2], ['Tower council', 1],
        ['Death orbs', 2], ['Confusion', 2], ['Purple drift', 3]
      ]),
      kit.pick(2, deepLoot(['Damage upgrade II', 'Health upgrade II']), [
        ['Phalanx', 4], ['Tower council', 3], ['Eye cluster', 2], ['Wisps', 2],
        ['Kamikazes', 1], ['Drain tracking', 1],
        ['Death orbs', 3], ["Dragon's breath", 1], ['Fireball ring', 2], ['Big fireball cross', 1]
      ]),
      kit.pick(1, escapePicks('Bat swarm'))
    ]
  }
}

/**
 * Bonus's plates stay in the bonus tilesets' castle: an ambush of its own
 * skeletons and archers early, the crypt and the arcane floors after, and the
 * lich council waiting on the last floor before the boss.
 */
function bonusMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    mysteryButton('Bonus ambush', 'Ambush!', {
      monsters: [['bonus_ghost', 14], ['bonus_demon', 6]]
    })
  ])
  return {
    mysteryButtons: kit.buttons,
    levelMystery: [
      kit.pick(2, shallowLoot(), [
        ['Bonus ambush', 6], ['Skeleton squad', 3], ['Archer volley', 3], ['Bat swarm', 3],
        ['Arrow storm', 3], ['Axe mill', 3]
      ]),
      kit.pick(2, shallowLoot(), [
        ['Skeleton squad', 4], ['Archer volley', 4], ['Bonus ambush', 4], ['Necromancer', 2],
        ['Arrow storm', 3], ['Purple drift', 3]
      ]),
      kit.pick(2, midLoot(), [
        ['Skeleton squad', 4], ['Archer volley', 3], ['Necromancer', 3], ['Nova towers', 2],
        ['Fire and frost tracking', 2], ['Bonus ambush', 2],
        ['Axe mill', 3], ['Spike gauntlet', 2], ['Purple drift', 2]
      ]),
      kit.pick(2, deepLoot(['Mana upgrade II']), [
        ['Wisps', 4], ['Necromancer', 3], ['Nova towers', 3], ['Eye cluster', 2], ['Drain tracking', 2],
        ['Lich council', 1],
        ['Purple drift', 3], ['Death orbs', 2], ['Frost wall', 2]
      ]),
      kit.pick(2, deepLoot(['Damage upgrade II', 'Defense upgrade II']), [
        ['Lich council', 3], ['Eye cluster', 3], ['Fire pillars', 2], ['Fire floaters', 2], ['Wisps', 3],
        ['Kamikazes', 2],
        ['Death orbs', 3], ["Dragon's breath", 1], ['Purple drift', 2], ['Big fireball cross', 1]
      ]),
      kit.pick(1, escapePicks('Wisps'))
    ]
  }
}

/**
 * The presets, in the order the preset dialog lists them. `castle` is `defaultParameters()` plus its
 * mystery plates; the app itself opens on the plate-free `defaultParameters()`.
 */
const CLASSIC_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'castle',
    label: 'Castle (default)',
    description:
      '7 floors through the mixed castle themes — four act floors, then three boss rushes, with two mystery buttons hidden on every floor.',
    group: 'classic',
    build: () => ({ ...defaultParameters(), ...castleMystery() })
  },
  {
    id: 'desert',
    label: 'Desert',
    description:
      '7 floors from the outdoor bug swarms through Temple of the Sun mobs and a mummy mini-boss rush, then Anubis or the worm, with the temple treasury hidden under mystery buttons.',
    group: 'classic',
    // Floor 0 is an outdoor bug/beast floor ahead of the desert proper. The
    // two guard floors mob the party in numbers but barely scratch it, so the
    // opening reads as busy rather than dangerous. The mummies arrive with
    // the indoor themes on floor 3, which is where the preset starts
    // actually hurting; floor 5 (tick2/tracking towers) is a second breather
    // before the mummy mini-boss rush on floor 6.
    build: () => withGatewayLocks({
      ...defaultParameters(),
      levels: 7,
      levelBuffs: Array.from({ length: 7 }, () => defaultFloorBuffs()),
      levelTraps: [
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        [
          { projectile: 'shooter_fireball_2', direction: 'down', spread: 0, spawnRateMs: 1000, count: 3 },
          { projectile: 'shooter_fireball_2', direction: 'up', spread: 0, spawnRateMs: 1000, count: 3 },
          { projectile: 'shooter_fireball_2', direction: 'left', spread: 0, spawnRateMs: 1000, count: 3 },
          { projectile: 'shooter_fireball_2', direction: 'right', spread: 0, spawnRateMs: 1000, count: 3 }
        ],
        escapeFloorTraps()
      ] satisfies FloorTrap[][],
      levelTimers: escapeTimers(7),
      // floors 5-6 have no musicN line in the 070 parameter set, so 6 (the
      // escape floor) is left on the MUSIC_DEFAULT sentinel. An export writes
      // `music6=default` for it explicitly, since castle's floor 6 is `act4`
      // and an absent line would inherit that on re-import.
      floorMusic: [
        'temple_hub',
        'temple_hub',
        'temple_boss',
        'temple_boss',
        'temple_boss',
        'temple_boss',
        MUSIC_DEFAULT
      ],
      // the seventh is the escape floor, played after the boss — see levelOrder
      themes: ['pyramid_inside', 'cave_desert', 'pyramid_fancy', 'pyramid_fancy', 'pyramid_fancy', 'pyramid_inside', 'pyramid_fancy'],
      levelOrder: shippedOrder(7),
      ...desertMystery(),
      boss: withBoss('pyramid_fancy', ['boss_anubis', 'boss_worm'], desertWaves()),
      lobbies: [
        { ...defaultLobby('BETA-dungeon-prep'), music: 'temple_hub' },
        { ...defaultLobby('BETA-boss-prep'), music: 'boss_1' }
      ],
      monsterMax: {
        ...defaultParameters().monsterMax,
        // this preset pools the eater flower from floor 0, so it carries a
        // cap of its own
        flower_eater: 6,
        // Re-tuned in the same post-#58 playtest pass as parameters.ts's
        // defaultParameters() — this preset's own value where it differs from
        // castle's (102).
        tower_static_frost: 99
      },
      // Re-tuned in the app after the tier-roll and tower-family fixes
      // (issue #58) — see the comment on defaultParameters().levelMonsters in
      // parameters.ts. Applied verbatim from that pass; no adjustment needed
      // here, unlike castle's and bonus's escape floors.
      levelMonsters: [
        // the outdoor bug floor ahead of the desert proper
        ['tick', 'maggot', 'flower_small', 'flower_eater', 'bat', 'mb_tick', 'mb_maggot'],
        ['mummy_guard', 'mummy_guard', 'tower_battlement'],
        ['mummy', 'mummy_mage', 'mummy_guard', 'mummy_guard', 'banner'],
        [
          'mummy',
          'mummy_mage',
          'mummy_guard',
          'mummy_guard',
          'mummy_lich',
          'banner',
          'tower_laser'
        ],
        [
          'mb_mummy',
          'spider#0',
          'wisp#3',
          'pillar_fire',
          'beheaded_kamikaze',
          'mummy',
          'mummy_mage',
          'mummy_lich',
          'tower_laser'
        ],
        // a second breather floor before the mummy mini-boss rush
        ['tick_gold', 'mb_tick', 'spider#0', 'flower_bloodrose', 'tower_laser'],
        // the escape floor — battlements to wall the route off, and the
        // quickest things in the desert roster to chase the party out. The
        // battlement count holds them at ~4 lairs in 9 against a roster this
        // long; see the castle escape pool in parameters.ts for why.
        [
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'mummy',
          'mummy_lich',
          'spider#0',
          'wisp#3',
          'mb_mummy',
          // the swarm tiers and the flower turrets on top of them
          'tick',
          'maggot',
          'mummy_mage',
          // TODO: 'flower_eater' belongs here too, but its roster defaultMax is
          // 0 — a horde is trunc(fRand(cap/5, cap)), so at 0 it can never spawn
          // and the "every pooled monster has a non-zero cap" test rejects it.
          // Add it back together with the cap that makes it real.
          'flower_blood',
          'flower_bloodrose',
          'flower_small',
          'mb_tick',
          'mb_maggot',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost'
        ]
      ]
    })
  },
  {
    id: 'shaftlocke',
    label: 'Shaftlocke Tower',
    description:
      '7 floors up Shaftlocke Tower — prison, crypt, the gold-beetle mines, archives and chambers — then a random Shaftlocke boss and an escape back through the chambers, with two mystery buttons hidden on every floor.',
    group: 'classic',
    // Castle's shape on Shaftlocke's own tilesets, music and roster: the same
    // 8 levels, order, escape-floor timer and fireball rig (inherited from
    // defaultParameters()), two act floors each for the prison and the crypt
    // (the stock armory), the mines as Castle's floor-5 gold-beetle breather,
    // then the archives and chambers as the mini-boss rushes. The escape floor
    // runs back through the chambers, as Castle's does: the battlements' snow
    // tiles hid the lock buttons (playtest, 2026-10-16).
    // Every stock Shaftlocke level plays music mode 20; the arena gets the
    // dragon's mode 21 whichever Shaftlocke boss it rolls.
    build: () => withGatewayLocks({
      ...defaultParameters(),
      themes: ['prison2', 'prison2', 'crypt', 'crypt', 'mine_granite', 'archives2', 'chambers2', 'chambers2'],
      floorMusic: Array.from({ length: 8 }, () => 'shaftlocke_20'),
      ...shaftlockeMystery(),
      boss: withBoss(
        'chambers2',
        [...(BOSS_CAMPAIGNS.find((c) => c.id === 'shaftlocke')?.bosses ?? [])],
        shaftlockeWaves(),
        'shaftlocke_21'
      ),
      lobbies: [
        { ...defaultLobby('BETA-dungeon-prep'), music: 'shaftlocke_20' },
        { ...defaultLobby('BETA-boss-prep'), music: 'shaftlocke_20' }
      ],
      // Castle's slot shape (see defaultParameters().levelMonsters): the
      // prison's maggots and skeletons, then its cells, two harder act floors,
      // the breather, two mini-boss rushes, then the escape floor's battlement
      // maze. The prison floors carry the stock prison's skeletons from the
      // start and an elite warrior on the second (the vermin-only opening
      // playtested too easy), and the bannermen — buff carriers like the
      // static banners, but mobile — march with the crypt, archives and
      // chambers packs.
      //
      // Every enemy stock Shaftlocke places on these acts is pooled: the
      // castle elite archer in the prison and crypt, the bat mini-boss in the
      // mines, the sharpshooter, the Eye's adds and the ghosts in the
      // archives, and the thralls and doomspawners in the chambers.
      // Mini-bosses still wait for floor 5, as Castle's do. The mines pool
      // tick_gold three times (the pool weights by repetition), so the
      // beetles fill about a third of its lairs: one in six left one run in
      // eight with none (2026-10-16).
      //
      // `#n` pins the stock actor where the roll would land elsewhere: the
      // imp gargoyle the archives use, the plain 800 hp sharpshooter in the
      // archives (its 1200 hp twin rolls in the chambers), and the fast weak
      // footman as the escape's chaser.
      // `spider#1` is the white spider the stock mines use, spelled pinned
      // because a bare `spider` reads back from parameters.txt as the HW1
      // id (catalog/substitutions.ts), the poison one.
      levelMonsters: [
        ['bat', 'shaftlocke_maggot', 'shaftlocke_maggot_spiky', 'slime', 'flower_eater', 'prison_warrior', 'prison_archer'],
        ['prison_warrior', 'prison_warrior#3', 'prison_archer', 'skeleton_archer#2', 'trapper', 'maggot_cyst', 'tick_exploding', 'bannerman_bloodlust'],
        ['armory_warrior', 'armory_archer', 'skeleton_lancer', 'ghost', 'crawler', 'bannerman'],
        ['armory_warrior', 'guardian', 'skeleton_lancer', 'ancient_ghost', 'shaftlocke_lich', 'skeleton_archer#2', 'bannerman_bloodlust'],
        ['mb_tick', 'mb_shaftlocke_maggot', 'mb_bat', 'bat', 'tick_gold', 'tick_gold', 'tick_gold', 'tick', 'spider#1'],
        ['mb_shaftlocke_guard', 'mb_eye', 'mb_sharpshooter#0', 'eye', 'eye_add', 'wisp', 'ghost', 'gargoyle#0', 'tower_beamo', 'bannerman'],
        [
          'mb_shaftlocke_wizard',
          'mb_templar',
          'mb_sharpshooter',
          'mb_doomspawner',
          'skeleton_footman',
          'skeleton_sentry',
          'skeleton_archer#2',
          'shaftlocke_lich',
          'battlemage',
          'vampire_thrall',
          'bannerman'
        ],
        // the escape floor — 8 battlements in 19 hold it at ~4 lairs in 9,
        // like castle's; see the castle escape pool in parameters.ts
        [
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          // the chasers and ranged pressure that punish standing still
          'skeleton_footman#1',
          'bat',
          'skeleton_sentry',
          'troll_ice',
          'crawler',
          // the ice-troll champion and the tower's turret line
          'mb_ice_troll',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost',
          'mb_shaftlocke_wizard',
          'tower_beamo'
        ]
      ]
    })
  },
  {
    id: 'bonus',
    label: 'Bonus Gauntlet',
    description:
      '5 floors of the bonus tilesets, escalating from bonus mobs to a mixed boss floor, with two mystery buttons hidden on every floor.',
    group: 'classic',
    build: () => withGatewayLocks({
      ...defaultParameters(),
      levels: 6,
      levelBuffs: Array.from({ length: 6 }, () => defaultFloorBuffs()),
      levelTraps: [
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        defaultFloorTraps(),
        escapeFloorTraps()
      ] satisfies FloorTrap[][],
      levelTimers: escapeTimers(6),
      floorMusic: ['bonus', 'bonus', 'bonus', 'bonus', 'bonus', 'bonus'],
      // bonus5 twice: the escape floor after the boss stays on the last tileset
      themes: ['bonus1', 'bonus2', 'bonus3', 'bonus4', 'bonus5', 'bonus5'],
      // the bonus lighting is bright enough without wall torches
      torches: 'none',
      levelOrder: shippedOrder(6),
      ...bonusMystery(),
      boss: withBoss(
        'bonus5',
        ['boss_knight', 'boss_lich', 'boss_krilith', 'boss_dragon'],
        bonusWaves()
      ),
      lobbies: [
        { ...defaultLobby('BETA-dungeon-prep'), music: 'main' },
        {
          ...defaultLobby('BETA-boss-prep'),
          music: 'main',
          startingGold: 25000,
          upgrades: oneOfEachUpgrade()
        }
      ],
      // Re-tuned in the same post-#58 playtest pass as parameters.ts's
      // defaultParameters() — this preset had no monsterMax override at all
      // before; it needs one now for the two values that differ from
      // castle's (102/4).
      monsterMax: {
        ...defaultParameters().monsterMax,
        tower_static_frost: 100,
        // bonus never pools the eater flower; the cap is inert either way
        flower_eater: 0
      },
      // Re-tuned in the app after the tier-roll and tower-family fixes
      // (issue #58) — see the comment on defaultParameters().levelMonsters in
      // parameters.ts.
      levelMonsters: [
        ['bonus_demon', 'bonus_ghost'],
        ['skeleton_archer', 'skeleton_ranger', 'skeleton_warrior', 'skeleton_soldier'],
        ['skeleton_archer', 'skeleton_ranger', 'skeleton_warrior', 'skeleton_soldier', 'skeleton_runner', 'mb_skeleton_guard#0', 'tower_battlement'],
        ['wisp', 'wisp#3', 'skeleton_lich#3', 'banner', 'tower_nova'],
        [
          'mb_wizard',
          'mb_doomspawner',
          'mb_eye',
          'eye',
          'skeleton_lich',
          'wisp#3',
          'pillar_fire',
          'beheaded_kamikaze',
          'wisp#3',
          'wisp'
        ],
        // the escape floor — battlements plus the bonus roster's chasers. The
        // battlement count holds them at ~4 lairs in 9 against a roster this
        // long; see the castle escape pool in parameters.ts for why.
        //
        // tower_static_frost is 5 copies here, not the 6 the playtest export
        // had — at 6 the tower_empty share lands at exactly 12/30 = 0.4,
        // which fails the strict lower bound below (tests/monsters.test.ts,
        // tests/presets.test.ts); 5 copies clears it at 12/29 ≈ 0.414 while
        // keeping every other count from the export untouched.
        [
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'tower_battlement_empty',
          'bonus_ghost',
          'eye',
          'wisp#3',
          'pillar_fire',
          'mb_doomspawner',
          'wisp',
          'beheaded_kamikaze',
          'mb_skeleton_guard#0',
          'skeleton_soldier',
          'skeleton_runner',
          'tower_battlement',
          'tower_laser',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost',
          'tower_static_frost'
        ]
      ]
    })
  }
]

/**
 * The original Java tool's own `parameters.txt`, as it shipped before any of
 * the remake's edits (`reference/original-java/parameters.txt`): eight floors
 * from prison to chambers, the Java monster caps, and nothing else — no lobbies, no boss,
 * no traps, timers, buffs, music or player tweaks, and no barred final room.
 *
 * Every per-floor layer is spelled out as an all-off array rather than left
 * absent: `parseParametersTxt` overlays onto `defaultParameters()`, so this is
 * the shape a re-imported export comes back as.
 *
 * The Java pools are spelled in AE ids: `army1` -> skeleton_warrior +
 * skeleton_archer, `army2` -> skeleton_soldier + skeleton_ranger +
 * skeleton_lich, `lich2` -> skeleton_lich.
 */
function preAlpha(): DungeonParameters {
  const base = defaultParameters()
  const levels = 8
  return {
    ...base,
    levels,
    themes: ['prison', 'prison', 'armory', 'armory', 'archives', 'archives', 'chambers', 'chambers'],
    // The original tool had no locked rooms at all.
    levelLock: undefined,
    levelMonsters: [
      ['bat', 'tick', 'maggot'],
      ['bat', 'tick', 'slime', 'maggot'],
      ['slime', 'skeleton_warrior', 'maggot'],
      ['eye', 'skeleton_warrior', 'skeleton_archer', 'skeleton_archer'],
      ['wisp', 'skeleton_warrior', 'skeleton_archer', 'eye', 'skeleton_warrior', 'skeleton_archer'],
      ['skeleton_warrior', 'skeleton_archer', 'skeleton_warrior', 'skeleton_archer', 'skeleton_soldier', 'wisp'],
      ['skeleton_soldier', 'skeleton_archer', 'skeleton_lich', 'skeleton_warrior', 'skeleton_archer'],
      ['skeleton_soldier', 'skeleton_soldier', 'skeleton_ranger', 'skeleton_lich', 'skeleton_lich']
    ],
    levelBuffs: Array.from({ length: levels }, () => defaultFloorBuffs()),
    levelTraps: Array.from({ length: levels }, () => defaultFloorTraps()),
    levelTimers: Array.from({ length: levels }, () => defaultFloorTimer()),
    floorMusic: Array.from({ length: levels }, () => MUSIC_DEFAULT),
    levelOrder: undefined,
    monsterMax: {
      ...base.monsterMax,
      bat: 200,
      tick: 100,
      maggot: 80,
      slime: 300,
      skeleton_warrior: 100,
      skeleton_soldier: 80,
      skeleton_archer: 40,
      skeleton_ranger: 30,
      eye: 50,
      wisp: 25,
      skeleton_lich: 20
    },
    playerTweaks: {},
    lobbies: [],
    boss: { ...base.boss, enabled: false }
  }
}

const PRE_ALPHA_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'pre-alpha',
    label: 'Pre-Alpha',
    description:
      "The original Java tool's parameters.txt: 8 floors from prison to chambers, no lobbies, no boss, no extras.",
    group: 'preAlpha',
    build: preAlpha
  }
]

/**
 * Every campaign preset the preset dialog offers: the three classics first (castle
 * is the app's default and stays at index 0), then Colosseum — see
 * `colosseumPreset.ts` — then the ten Claude-generated ones — see
 * `claudePresets.ts` — then Pre-Alpha. `PRESET_GROUPS` is what the renderer
 * groups and orders them by; this array's order is the fallback within each
 * group.
 */
export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  ...CLASSIC_PRESETS,
  ...COLOSSEUM_PRESETS,
  ...CLAUDE_PRESETS,
  ...PRE_ALPHA_PRESETS
]

/** The preset the app opens with — `defaultParameters()` by another name. */
export const DEFAULT_PRESET_ID = 'castle'

export function campaignPresetById(id: string): CampaignPreset | undefined {
  return CAMPAIGN_PRESETS.find((p) => p.id === id)
}
