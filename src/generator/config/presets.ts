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
  scatterWave,
  stockWavePickups,
  SHOOTER_ARROW_TRAPS
} from './parameters'
import { oneOfEachUpgrade } from '../levelTemplate/surgery'
import type { BossTrap, BossWave, DungeonParameters, FloorTrap } from './parameters'
import { MUSIC_DEFAULT } from '../music/tracks'
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
 */
function withBoss(theme: string, bossPool: string[], waves: BossWave[]): DungeonParameters['boss'] {
  const boss = defaultParameters().boss
  const fight = boss.fights[0]
  return { ...boss, fights: [{ ...fight, arena: { ...fight.arena, theme, bossPool, waves } }] }
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
        ['guard_desert', 120],
        ['guard_desert_range', 60]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['guard_desert', 60],
        ['guard_desert_range', 30],
        ['mummy_desert', 80],
        ['mummy_desert#2', 120],
        ['mummy_ranged', 60],
        ['mummy_desert#0', 4],
        ['mummy_ranged#0', 2]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['mummy_desert', 120],
        ['mummy_desert#2', 60],
        ['mummy_desert#3', 40],
        ['mummy_ranged', 40],
        ['mummy_ranged#2', 60],
        ['mummy_desert#0', 8],
        ['mummy_ranged#0', 4],
        ['spider', 13],
        ['mb_mummy', 4]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['special_beheaded_kamikaze', 4],
        ['mummy_desert#3', 80],
        ['mummy_ranged#2', 60],
        ['spider', 60],
        ['mb_mummy', 8],
        ['lich_desert#0', 4],
        ['lich_desert#2', 24]
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
        ['special_beheaded_kamikaze', 40],
        ['pillar_fire', 30],
        ['floater_fire', 60],
        ['spider', 30],
        ['lich_desert', 6],
        ['lich_desert#0', 6],
        ['lich_desert#2', 6]
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
        ['bonus_archer1', 120],
        ['bonus_skeleton1', 250],
        ['bonus_skeleton1#0', 16]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['archer1', 40],
        ['archer2', 10],
        ['archer3', 10],
        ['skeleton1', 80],
        ['skeleton1#2', 60],
        ['tower_archer1', 16],
        ['skeleton1#0', 12],
        ['archer1#0', 6],
        // the knight's own guard (issue #64 part 2) — bodyguards.
        ['knight_guard', 6]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['skeleton2', 60],
        ['skeleton2#2', 80],
        ['skeleton2#3', 40],
        ['skeleton3', 20],
        ['lich#3', 30],
        ['archer2', 15],
        ['archer3', 25],
        ['mb_skeleton', 8],
        ['tower_archer3', 8],
        ['archer2#0', 6],
        ['skeleton2#0', 12],
        // bodyguards — Krilith's mini-boss skeleton and the lich's necromancer guard
        ['krilith_mb_skeleton', 3],
        ['lich_guard_lich', 3]
      ],
      [['tower_nova1', 4]],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['special_beheaded_kamikaze', 4],
        ['lich', 2],
        ['lich#0', 6],
        ['lich#2', 2],
        ['mb_eye', 4],
        ['mb_lich', 1],
        ['mb_doomspawn', 2],
        ['tower_banner1', 8],
        // bodyguards
        ['lich_guard_lich', 4],
        ['lich_mirror', 2]
      ],
      [
        ['tower_tracking2', 1],
        ['tower_tracking3', 1]
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
        ['lich', 1],
        ['lich#0', 8],
        ['lich#2', 4],
        ['mb_eye', 2],
        ['mb_lich', 1],
        ['mb_doomspawn', 2],
        ['tower_banner1', 8],
        ['wisp1', 19],
        ['wisp1#2', 10],
        // bodyguards — the Lich's necromancer guard and a last pair of Krilith skeletons
        ['lich_guard_lich', 2],
        ['krilith_mb_skeleton', 2]
      ],
      [
        ['tower_tracking2', 1],
        ['tower_tracking1', 1]
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
      monsters: [['tick2', 4], ['tick2#0', 2]],
      loot: [['valuable_8', 2], ['valuable_9', 1]]
    }),
    mysteryButton('Tomb offering', 'An offering to the sun', {
      loot: [['valuable_diamond_small', 2], ['valuable_diamond_small_red', 1]]
    }),
    mysteryButton('Temple guards', 'Temple guards!', {
      monsters: [['guard_desert', 8], ['guard_desert_range', 4]]
    }),
    mysteryButton('Sun priests', 'The priests awaken', {
      monsters: [['lich_desert', 2], ['mummy_ranged', 4]]
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
 * Bonus's plates stay in the bonus tilesets' castle: an ambush of its own
 * skeletons and archers early, the crypt and the arcane floors after, and the
 * lich council waiting on the last floor before the boss.
 */
function bonusMystery(): Pick<DungeonParameters, 'mysteryButtons' | 'levelMystery'> {
  const kit = mysteryKit([
    mysteryButton('Bonus ambush', 'Ambush!', {
      monsters: [['bonus_skeleton1', 14], ['bonus_archer1', 6]]
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
        [
          { projectile: 'shooter_fireball', direction: 'down', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'up', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 1000, count: 8 }
        ]
      ] satisfies FloorTrap[][],
      levelTimers: escapeTimers(7),
      // floors 5-6 have no musicN line in the 070 parameter set, so 6 (the
      // escape floor) is left on the MUSIC_DEFAULT sentinel. An export writes
      // `music6=default` for it explicitly, since castle's floor 6 is `act4`
      // and an absent line would inherit that on re-import.
      floorMusic: [
        'desert_temple',
        'desert_temple',
        'desert_cavern',
        'desert_cavern',
        'desert_cavern',
        'desert_cavern',
        MUSIC_DEFAULT
      ],
      // the seventh is the escape floor, played after the boss — see levelOrder
      themes: ['g_mixed', 'h', 'i', 'i_symbols', 'i_mixed', 'g_mixed', 'i_mixed'],
      levelOrder: shippedOrder(7),
      ...desertMystery(),
      boss: withBoss('i_mixed', ['boss_anubis', 'boss_worm'], desertWaves()),
      lobbies: [
        { ...defaultLobby('BETA-dungeon-prep'), music: 'desert_village' },
        { ...defaultLobby('BETA-boss-prep'), music: 'boss_1' }
      ],
      monsterMax: {
        ...defaultParameters().monsterMax,
        // tower_flower1's roster defaultMax is 0 (see the TODO on the escape
        // floor's pool below) — this preset is the first to actually pool it
        // (floor 0), so it needs a real cap or it can never spawn.
        tower_flower1: 6,
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
        ['tick1', 'maggot', 'tower_flower1_small', 'tower_flower1', 'bat1', 'mb_tick', 'mb_maggot'],
        ['guard_desert', 'guard_desert_range', 'tower_archer'],
        ['mummy_desert', 'mummy_ranged', 'guard_desert', 'guard_desert_range', 'tower_banner'],
        [
          'mummy_desert',
          'mummy_ranged',
          'guard_desert',
          'guard_desert_range',
          'lich_desert',
          'tower_banner',
          'tower_tracking'
        ],
        [
          'mb_mummy',
          'spider',
          'floater_fire',
          'pillar_fire',
          'special_beheaded_kamikaze',
          'mummy_desert',
          'mummy_ranged',
          'lich_desert',
          'tower_tracking'
        ],
        // a second breather floor before the mummy mini-boss rush
        ['tick2', 'mb_tick', 'spider', 'tower_flower3', 'tower_tracking'],
        // the escape floor — battlements to wall the route off, and the
        // quickest things in the desert roster to chase the party out. The
        // battlement count holds them at ~4 lairs in 9 against a roster this
        // long; see the castle escape pool in parameters.ts for why.
        [
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'mummy_desert',
          'lich_desert',
          'spider',
          'floater_fire',
          'mb_mummy',
          // the swarm tiers and the flower turrets on top of them
          'tick1',
          'maggot',
          'mummy_ranged',
          // TODO: 'tower_flower1' belongs here too, but its roster defaultMax is
          // 0 — a horde is trunc(fRand(cap/5, cap)), so at 0 it can never spawn
          // and the "every pooled monster has a non-zero cap" test rejects it.
          // Add it back together with the cap that makes it real.
          'tower_flower2',
          'tower_flower3',
          'tower_flower1_small',
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
        [
          { projectile: 'shooter_fireball', direction: 'up', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'down', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 1000, count: 8 },
          { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 1000, count: 8 }
        ]
      ] satisfies FloorTrap[][],
      levelTimers: escapeTimers(6),
      floorMusic: ['bonus_1', 'bonus_1', 'bonus_1', 'bonus_2', 'bonus_2', 'bonus_2'],
      // bonus5 twice: the escape floor after the boss stays on the last tileset
      themes: ['bonus1', 'bonus2', 'bonus3', 'bonus4', 'bonus5', 'bonus5'],
      levelOrder: shippedOrder(6),
      ...bonusMystery(),
      boss: withBoss(
        'bonus5',
        ['boss_knight', 'boss_lich', 'boss_krilith', 'boss_dragon'],
        bonusWaves()
      ),
      lobbies: [
        { ...defaultLobby('BETA-dungeon-prep'), music: 'custom_1' },
        {
          ...defaultLobby('BETA-boss-prep'),
          music: 'custom_2',
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
        // bonus never pools tower_flower1 — this only exists so the shipped
        // cap matches the tuned export exactly; it is inert either way.
        tower_flower1: 0
      },
      // Re-tuned in the app after the tier-roll and tower-family fixes
      // (issue #58) — see the comment on defaultParameters().levelMonsters in
      // parameters.ts.
      levelMonsters: [
        ['bonus_archer1', 'bonus_skeleton1'],
        ['archer1', 'archer2', 'skeleton1', 'skeleton2'],
        ['archer1', 'archer2', 'skeleton1', 'skeleton2', 'skeleton3', 'mb_skeleton', 'tower_archer'],
        ['wisp1', 'wisp2', 'lich#3', 'tower_banner', 'tower_nova'],
        [
          'mb_lich',
          'mb_doomspawn',
          'mb_eye',
          'eye',
          'lich',
          'floater_fire',
          'pillar_fire',
          'special_beheaded_kamikaze',
          'wisp2',
          'wisp1'
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
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'bonus_skeleton1',
          'eye',
          'wisp2',
          'pillar_fire',
          'mb_doomspawn',
          'wisp1',
          'special_beheaded_kamikaze',
          'mb_skeleton',
          'skeleton2',
          'skeleton3',
          'tower_archer',
          'tower_tracking',
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
 * of themes a-d, the Java monster caps, and nothing else — no lobbies, no boss,
 * no traps, timers, buffs, music or player tweaks, and no barred final room.
 *
 * Every per-floor layer is spelled out as an all-off array rather than left
 * absent: `parseParametersTxt` overlays onto `defaultParameters()`, so this is
 * the shape a re-imported export comes back as.
 *
 * Three Java pool names no longer exist and are split into today's types:
 * `army1` (skeleton_1 + archer_1 tiers) -> `skeleton1`, `archer1`; `army2`
 * (skeleton_2, archer_2, lich_1/2) -> `skeleton2`, `archer2`, `lich`; and
 * `lich2` (the lich ladder at a 0.5 upgrade chance) -> `lich`. The plain
 * renames are `bat` -> `bat1`, `tick` -> `tick1`, `archer` -> `archer1`,
 * `wisp` -> `wisp1`. `maxLiches2` folds into `lich`'s cap, which keeps
 * `maxLiches1`'s 20.
 */
function preAlpha(): DungeonParameters {
  const base = defaultParameters()
  const levels = 8
  return {
    ...base,
    levels,
    themes: ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
    // The original tool had no locked rooms at all.
    levelLock: undefined,
    levelMonsters: [
      ['bat1', 'tick1', 'maggot'],
      ['bat1', 'tick1', 'slime', 'maggot'],
      ['slime', 'skeleton1', 'maggot'],
      ['eye', 'skeleton1', 'archer1', 'archer1'],
      ['wisp1', 'skeleton1', 'archer1', 'eye', 'skeleton1', 'archer1'],
      ['skeleton1', 'archer1', 'skeleton1', 'archer1', 'skeleton2', 'wisp1'],
      ['skeleton2', 'archer1', 'lich', 'skeleton1', 'archer1'],
      ['skeleton2', 'skeleton2', 'archer2', 'lich', 'lich']
    ],
    levelBuffs: Array.from({ length: levels }, () => defaultFloorBuffs()),
    levelTraps: Array.from({ length: levels }, () => defaultFloorTraps()),
    levelTimers: Array.from({ length: levels }, () => defaultFloorTimer()),
    floorMusic: Array.from({ length: levels }, () => MUSIC_DEFAULT),
    levelOrder: undefined,
    monsterMax: {
      ...base.monsterMax,
      bat1: 200,
      tick1: 100,
      maggot: 80,
      slime: 300,
      skeleton1: 100,
      skeleton2: 80,
      archer1: 40,
      archer2: 30,
      eye: 50,
      wisp1: 25,
      lich: 20
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
      "The original Java tool's parameters.txt: 8 floors of themes a-d, no lobbies, no boss, no extras.",
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
