import { defaultParameters, escapeFloorTimer, escapeFloorTraps, withGatewayLocks } from './parameters'
import type { DungeonParameters, FloorTimer } from './parameters'
import type { WorldDef } from '../world/options'
import { WORLD_AMBUSH_LEVELS } from '../world/options'
import { MONSTER_THEMES } from '../world/monsterThemes'
import { BOSS_CAMPAIGNS } from '../boss/bosses'
import { deepLoot, midLoot, mysteryKit, shallowLoot } from './presetMystery'
import {
  B,
  F,
  L,
  W,
  bossFight,
  buttonLocks,
  campaign,
  clockArena,
  island,
  lobby,
  survivalWaveRow
} from './presetHelpers'
// Type-only: presets.ts imports WORLD_CAMPAIGN_PRESETS from this file at
// runtime, so a runtime import of CampaignPreset back would cycle.
import type { CampaignPreset } from './presets'

/**
 * Claude Generated Open World (docs/plans/open-world-presets.md): campaigns
 * that put islands in the slot order, each using them differently — the way
 * into a dungeon, the way out of one, a hunting ground, or a race.
 *
 * Every island keeps to what has been played or audited as safe: 256 tiles
 * or smaller, at most one boss, a camp or bare start (never the village, nor
 * random, which can pick it), the default safe radius, and no plateaus.
 * Islands carry no roster of their own, so each names a monster theme.
 *
 * Pure data, as every preset: `build()` returns a fresh object and draws no
 * random values.
 */

/** A monster theme's roster, fresh. */
function theme(id: string): string[] {
  return [...MONSTER_THEMES.find((t) => t.id === id)!.monsters]
}

/** A square island of `size` tiles: the preset family's limits, then the overrides. */
function isle(size: number, overrides: Partial<WorldDef>): WorldDef {
  return island({
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    hub: 'camp',
    safeRadius: 20,
    trails: false,
    landmarks: true,
    ...overrides
  })
}

/** An island with one named boss and nothing else to find. */
function quarry(boss: string): Partial<WorldDef> {
  return { buttons: 0, bossCount: 1, bossSelection: 'lineup', bossLineup: { [boss]: 1 } }
}

/** A storm on an island: `seconds`, then 1 damage every 500 ms, the countdown shown. */
function storm(seconds: number): FloorTimer {
  return { enabled: true, seconds, damage: 1, freqMs: 500, countdown: true }
}

const HEAVY = WORLD_AMBUSH_LEVELS.find((l) => l.id === 'heavy')!

/**
 * A campaign with no floors keeps one placeholder theme and pool, as the
 * Colosseum does: `parameters.txt` always writes `themes=` and the first
 * pool, so this is the shape that reads back unchanged.
 */
function noFloors(monsters: string[]): Pick<DungeonParameters, 'themes' | 'levelMonsters'> {
  return { themes: ['prison'], levelMonsters: [monsters] }
}

/** `params` with its worlds switched on: `campaign()` inherits them off. */
function withWorlds(params: DungeonParameters, worlds: WorldDef[]): DungeonParameters {
  return { ...params, world: { enabled: true, worlds } }
}

// --- 1. The Lost Entrance ------------------------------------------------------

function lostEntrance(): DungeonParameters {
  const kit = mysteryKit()
  const params = campaign(3, {
    themes: ['cave_dark', 'crypt', 'chambers2'],
    levelMonsters: [
      ['bat', 'spider#0', 'tick', 'crawler'],
      ['armory_warrior', 'armory_archer', 'skeleton_lancer', 'ghost'],
      ['skeleton_footman', 'skeleton_sentry', 'battlemage', 'shaftlocke_lich', 'bannerman']
    ],
    floorMusic: ['act2', 'shaftlocke_20', 'shaftlocke_20'],
    levelLock: buttonLocks([1, 1, 1]),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: [L(0), W(0), F(0), F(1), F(2), L(1), B(0)],
    mysteryButtons: kit.buttons,
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'chambers2',
          bossPool: [...BOSS_CAMPAIGNS.find((c) => c.id === 'shaftlocke')!.bosses],
          music: 'shaftlocke_21'
        })
      ]
    }
  })
  // four real buttons among eight plates that look the same: a search, and every plate a gamble
  const plates = kit.pick(8, shallowLoot(), [
    ['Bat swarm', 3], ['Tick nest', 3], ['Spider nest', 2], ['Arrow storm', 3], ['Fireball ring', 2]
  ])
  return withWorlds(params, [
    isle(192, {
      biome: 'grass',
      buttons: 4,
      bossCount: 0,
      mysteryPlates: plates.count,
      mysteryPool: plates.pool,
      disguise: true,
      monsters: theme('wilds'),
      music: 'act1'
    })
  ])
}

// --- 2. Breakout ---------------------------------------------------------------

function breakout(): DungeonParameters {
  const params = campaign(3, {
    themes: ['prison', 'prison', 'chambers2'],
    levelMonsters: [
      ['bat', 'tick', 'maggot', 'skeleton_warrior'],
      ['maggot', 'slime', 'skeleton_warrior', 'skeleton_archer'],
      // the escape floor: the classic battlements maze
      [...defaultParameters().levelMonsters[7]]
    ],
    floorMusic: ['act1', 'act1', 'act4'],
    // no town at the start: the floor shop rooms are the only place to spend gold
    lobbies: [],
    levelOrder: [F(0), F(1), W(0), F(2)],
    // no arena: the island and the escape floor are the run
    boss: { ...defaultParameters().boss, enabled: false }
  })
  params.levelTimers![2] = escapeFloorTimer()
  params.levelTraps![2] = escapeFloorTraps()
  return withGatewayLocks(
    withWorlds(params, [
      isle(160, {
        biome: 'woods',
        buttons: 3,
        bossCount: 0,
        ambushes: HEAVY.ambushes,
        ambushSize: HEAVY.ambushSize,
        buttonAmbush: HEAVY.buttonAmbush,
        monsters: theme('castle_act2'),
        timer: storm(600),
        music: 'act2'
      })
    ])
  )
}

// --- 3. Manhunt ----------------------------------------------------------------

function manhunt(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('shaftlocke')),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: [L(0), W(0), W(1), L(1), W(2), B(0)],
    boss: {
      enabled: true,
      fights: [
        // the ringleader, in his own crypt
        bossFight({ theme: 'crypt', bossPool: ['boss_vampire'], music: 'shaftlocke_21' })
      ]
    }
  })
  // each fugitive waits at its site; denser packs and bigger ambushes each island
  return withGatewayLocks(
    withWorlds(params, [
      isle(160, { biome: 'woods', ...quarry('boss_warden'), packs: 20, ambushSize: 4, monsters: theme('shaftlocke'), music: 'shaftlocke_20' }),
      isle(192, { biome: 'marsh', ...quarry('boss_wraith'), packs: 30, ambushSize: 6, monsters: theme('shaftlocke'), music: 'shaftlocke_20' }),
      isle(224, { biome: 'ashland', ...quarry('boss_golem'), packs: 40, ambushSize: 8, monsters: theme('shaftlocke'), music: 'shaftlocke_21' })
    ])
  )
}

// --- 4. Archipelago ------------------------------------------------------------

function archipelago(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('castle_act1')),
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'act3' })],
    levelOrder: [L(0), W(0), W(1), L(1), W(2), W(3)],
    // no arena: the last island's orb ends the run
    boss: { ...defaultParameters().boss, enabled: false }
  })
  return withGatewayLocks(
    withWorlds(params, [
      isle(128, { biome: 'coast', buttons: 2, bossCount: 0, monsters: theme('castle_act1'), music: 'act1' }),
      isle(144, { biome: 'desert', buttons: 3, bossCount: 0, monsters: theme('temple'), music: 'temple_hub' }),
      isle(144, { biome: 'snow', buttons: 3, bossCount: 1, monsters: theme('frost'), music: 'act3' }),
      // the last island: its orb ends the run
      isle(160, { biome: 'crystal', buttons: 4, bossCount: 1, monsters: theme('mixed'), music: 'act4' })
    ])
  )
}

// --- 5. Surface and Depths -----------------------------------------------------

function surfaceAndDepths(): DungeonParameters {
  const kit = mysteryKit()
  const params = campaign(3, {
    themes: ['pyramid_inside', 'cave_crystal', 'cave_dark'],
    levelMonsters: [
      ['mummy_guard', 'temple_warrior', 'mummy', 'scorpion'],
      ['wisp#3', 'skeleton_soldier', 'elemental_ice', 'troll_ice'],
      ['skeleton_soldier', 'skeleton_ranger', 'skeleton_lich', 'eye', 'spider#0']
    ],
    floorMusic: ['temple_boss', 'act3', 'act4'],
    // one button a floor; each floor's stairs come up onto the next island
    levelLock: buttonLocks([1, 1, 1]),
    // the only town, before the finale
    lobbies: [lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: [W(0), F(0), W(1), F(1), W(2), F(2), L(0), B(0)],
    mysteryButtons: kit.buttons,
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'cave_dark',
          bossPool: ['boss_knight', 'boss_lich', 'boss_krilith', 'boss_worm', 'boss_golem'],
          bossCount: 2,
          music: 'boss_final'
        })
      ]
    }
  })
  const plates = (depth: number) => {
    const loot = depth === 0 ? shallowLoot() : depth === 1 ? midLoot() : deepLoot(['Damage upgrade II'])
    return kit.pick(4, loot, [['Mummy tomb', 2], ['Wisps', 2], ['Eye cluster', 2], ['Arrow storm', 2], ['Frost wall', 1]])
  }
  const surface = (depth: number, overrides: Partial<WorldDef>): WorldDef => {
    const p = plates(depth)
    return isle(160, { buttons: 3, bossCount: 0, mysteryPlates: p.count, mysteryPool: p.pool, ...overrides })
  }
  // the same monsters on both sides of each portal
  return withWorlds(params, [
    surface(0, { biome: 'desert', monsters: theme('temple'), music: 'temple_hub' }),
    surface(1, { biome: 'snow', monsters: theme('frost'), music: 'act3' }),
    surface(2, { biome: 'ashland', monsters: theme('mixed'), music: 'act4' })
  ])
}

// --- 6. Storm Front ------------------------------------------------------------

function stormFront(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('castle_act1')),
    // one town, then three islands back to back and the arena: the default
    // order for one lobby, three worlds and one fight, so none is stored
    lobbies: [lobby('BETA-dungeon-prep')],
    levelOrder: undefined,
    boss: {
      enabled: true,
      fights: [
        clockArena([
          survivalWaveRow('bat#3', 16, 0, 1000),
          survivalWaveRow('tick#2', 12, 0, 800),
          survivalWaveRow('skeleton_runner', 12, 30, 1200),
          survivalWaveRow('skeleton_ranger', 6, 30),
          survivalWaveRow('mb_skeleton_guard#0', 2, 45, 3000),
          survivalWaveRow('skeleton_lich', 6, 60),
          survivalWaveRow('mb_wizard', 1, 90),
          survivalWaveRow('skeleton_runner', 12, 75, 2000)
        ])
      ]
    }
  })
  // a soft hazard on purpose: the hard clocks end a run in seconds (balance audit B1)
  return withGatewayLocks(
    withWorlds(params, [
      isle(128, { biome: 'coast', buttons: 3, bossCount: 0, trails: true, monsters: theme('castle_act1'), timer: storm(300), music: 'act1' }),
      isle(128, { biome: 'marsh', buttons: 3, bossCount: 0, trails: true, monsters: theme('castle_act2'), timer: storm(240), music: 'act2' }),
      isle(128, { biome: 'autumn', buttons: 3, bossCount: 0, trails: true, monsters: theme('castle_act3'), timer: storm(180), music: 'act3' })
    ])
  )
}

/** The Claude Generated Open World group, alphabetical by label as the Claude group is. */
export const WORLD_CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'world-archipelago',
    label: 'Archipelago',
    description:
      'Island hopping and no dungeon at all: four small islands, each its own biome and monsters, with more to find on each and a boss on the last two, and a town halfway — about 60 minutes.',
    group: 'claudeWorld',
    build: archipelago
  },
  {
    id: 'world-breakout',
    label: 'Breakout',
    description:
      'Escape the dungeon, then the island: two prison floors with nothing bought, an ambush-heavy wooded island on a ten-minute storm, then the escape floor — about 35 minutes.',
    group: 'claudeWorld',
    build: breakout
  },
  {
    id: 'world-manhunt',
    label: 'Manhunt',
    description:
      "Hunt three fugitive bosses across three islands, no buttons and no trails — the warden, the wraith, the golem — then their ringleader, the vampire, in his crypt — about 50 minutes.",
    group: 'claudeWorld',
    build: manhunt
  },
  {
    id: 'world-storm-front',
    label: 'Storm Front',
    description:
      'Outrun the storm: three small islands on shrinking timers (5, 4 and 3 minutes), trails showing the way, then two minutes in a survival arena — about 30 minutes.',
    group: 'claudeWorld',
    build: stormFront
  },
  {
    id: 'world-surface-and-depths',
    label: 'Surface and Depths',
    description:
      'Each island hides the way into a dungeon below it, and each floor climbs out onto the next island: desert to pyramid, snow to the ice caves, ash to the dark caves, then the only town and a two-boss finale — about 75 minutes.',
    group: 'claudeWorld',
    build: surfaceAndDepths
  },
  {
    id: 'world-lost-entrance',
    label: 'The Lost Entrance',
    description:
      'Find the dungeon: four buttons hidden among eight mystery plates that look the same on a grassy island, then three floors down to a Shaftlocke boss — about 45 minutes.',
    group: 'claudeWorld',
    build: lostEntrance
  }
]
