import { castleWaves, defaultBossFight, withGatewayLocks } from './parameters'
import type { BossWave, DungeonParameters, FloorMystery, LobbyOptions } from './parameters'
import type { CampaignSlot } from '../campaign'
import type { WorldDef } from '../world/options'
import { MONSTER_THEMES } from '../world/monsterThemes'
import { deepLoot, midLoot, mysteryKit, shallowLoot } from './presetMystery'
import type { MysteryPicks } from './presetMystery'
import { desertWaves, shaftlockeWaves } from './familyWaves'
import { B, F, L, W, bossFight, campaign, island, lightArenaWaves, lobby } from './presetHelpers'
// Type-only: presets.ts imports CAMPAIGN_MODE_PRESETS from this file at
// runtime, so a runtime import of CampaignPreset back would cycle.
import type { CampaignPreset } from './presets'

/**
 * Campaign Mode (docs/plans/campaign-mode.md): each stock campaign played the
 * way the game plays it, in acts. Start in the family's town, clear three
 * floors, reach the town again, fight the act's boss, and on to the next act;
 * the run ends when the last boss dies.
 *
 * Each town sells one more tier of skills and items than the one before:
 * a town's `shopCategories` decides which columns it sells, so that is the
 * whole lock, with no new parameter. The tiers are cumulative, since AE sells
 * a chain's next tier only where a lobby sells its column (validation.ts).
 * Floor shop rooms are not locked: a lucky find underground can be a tier
 * ahead of the town, on purpose.
 *
 * Difficulty climbs by act through the pools, the arena's wave table (light
 * in act 1, the family's own after), the invulnerability windows (15 s in
 * act 1 rising to the stock 30) and the arena's size (32–42 rising to the
 * stock 42–64). The generator has no per-act monster or boss health scaling.
 *
 * Pure data, as every preset: `build()` returns a fresh object and draws no
 * random values.
 */

/** One act: its three floors, their pools, its boss pool and the arena. */
interface Act {
  themes: readonly [string, string, string]
  monsters: readonly [string[], string[], string[]]
  music: string
  bossPool: string[]
  arenaTheme: string
  arenaMusic: string
  /** the mystery plates' threats; the loot tier follows the act's depth */
  threats: MysteryPicks
}

/** One campaign: its town, its acts, the family's full wave table and the tier steps. */
interface CampaignModeDef {
  town: string
  /** the first town's music; the towns before a fight play `boss_1` */
  townMusic: string
  acts: readonly Act[]
  waves: () => BossWave[]
  /** skill tiers on sale in town t (1-based, cumulative from tier 1) */
  skillTiers: readonly number[]
  /** item tiers on sale in town t */
  itemTiers: readonly (readonly number[])[]
  /** an island before the first floor, if the campaign starts outdoors */
  opening?: WorldDef
}

/** The draft town gold: a little more each town, no free upgrades (balance audit B3). */
const TOWN_GOLD = [5000, 10000, 15000, 20000, 25000]

const SKILL_VENDORS = ['combo', 'def', 'misc', 'off'] as const

/** What town `t` sells: every skill column up to `skills`, the power shop, and `items`. */
function townShops(skills: number, items: readonly number[]): string[] {
  const columns: string[] = []
  for (let tier = 1; tier <= skills; tier++) for (const vendor of SKILL_VENDORS) columns.push(`${vendor}${tier}`)
  return [...columns, 'power', ...items.map((tier) => `equipment_${tier}`)]
}

/** A value stepped evenly from `first` at act 0 to `last` at the last act, rounded. */
function ramp(first: number, last: number, act: number, acts: number): number {
  return acts <= 1 ? last : Math.round(first + ((last - first) * act) / (acts - 1))
}

/** The plates' loot for act `act` of `acts`: shallow, then middle, then deep for the last. */
function lootFor(act: number, acts: number): MysteryPicks {
  if (act === acts - 1) return deepLoot(['Defense upgrade II', 'Health upgrade II'])
  return act === 0 ? shallowLoot() : midLoot()
}

function acts(def: CampaignModeDef): DungeonParameters {
  const n = def.acts.length
  const levels = n * 3
  const kit = mysteryKit()

  const order: CampaignSlot[] = [L(0)]
  if (def.opening !== undefined) order.push(W(0))
  def.acts.forEach((_, a) => order.push(F(a * 3), F(a * 3 + 1), F(a * 3 + 2), L(a + 1), B(a)))

  // the first town, then one before each fight; lobby 1 sets its music
  // explicitly, or a re-imported parameters.txt gives it the default's boss_1
  const lobbies: LobbyOptions[] = Array.from({ length: n + 1 }, (_, t) =>
    lobby('BETA-dungeon-prep', {
      preset: def.town,
      startingGold: TOWN_GOLD[t],
      shopCategories: townShops(def.skillTiers[t], def.itemTiers[t]),
      music: t === 0 ? def.townMusic : 'boss_1'
    })
  )

  const stock = defaultBossFight().arena
  const fights = def.acts.map((act, a) => {
    const seconds = ramp(15, stock.invulnerability.seconds[0], a, n)
    return bossFight({
      theme: act.arenaTheme,
      bossPool: [...act.bossPool],
      waves: a === 0 ? lightArenaWaves() : def.waves(),
      music: act.arenaMusic,
      invulnerability: { ...stock.invulnerability, seconds: stock.invulnerability.seconds.map(() => seconds) },
      minWidth: ramp(32, stock.minWidth, a, n),
      maxWidth: ramp(42, stock.maxWidth, a, n),
      minHeight: ramp(32, stock.minHeight, a, n),
      maxHeight: ramp(42, stock.maxHeight, a, n)
    })
  })

  // one plate on an act's first floor, two on the others
  const levelMystery: FloorMystery[] = def.acts.flatMap((act, a) =>
    [1, 2, 2].map((count) => kit.pick(count, lootFor(a, n), act.threats))
  )

  return withGatewayLocks(
    campaign(levels, {
      themes: def.acts.flatMap((act) => [...act.themes]),
      levelMonsters: def.acts.flatMap((act) => act.monsters.map((pool) => [...pool])),
      floorMusic: def.acts.flatMap((act) => [act.music, act.music, act.music]),
      lobbies,
      levelOrder: order,
      mysteryButtons: kit.buttons,
      levelMystery,
      boss: { enabled: true, fights },
      ...(def.opening === undefined ? {} : { world: { enabled: true, worlds: [def.opening] } })
    })
  )
}

/** Skills tiers 1–5 over five towns, items climbing a tier a town. */
const FIVE_TOWNS = {
  skillTiers: [1, 2, 3, 4, 5],
  itemTiers: [[1], [1, 2], [2, 3], [3, 4], [4, 5]]
}

function castleCampaign(): DungeonParameters {
  return acts({
    town: 'castle_bridge',
    townMusic: 'act1',
    waves: castleWaves,
    ...FIVE_TOWNS,
    acts: [
      {
        themes: ['prison', 'prison', 'prison'],
        monsters: [
          ['bat', 'tick', 'maggot', 'flower_small', 'flower_eater'],
          ['bat', 'tick', 'maggot', 'flower', 'skeleton_warrior'],
          ['maggot', 'slime', 'skeleton_warrior', 'skeleton_archer']
        ],
        music: 'act1',
        bossPool: ['boss_queen'],
        arenaTheme: 'prison',
        arenaMusic: 'boss_1',
        threats: [['Bat swarm', 4], ['Tick nest', 3], ['Maggot brood', 3], ['Flower bed', 2], ['Arrow storm', 3]]
      },
      {
        themes: ['armory', 'armory', 'armory'],
        monsters: [
          ['skeleton_warrior', 'skeleton_archer', 'skeleton_soldier', 'slime'],
          ['skeleton_soldier', 'skeleton_ranger', 'skeleton_archer', 'temple_archer'],
          ['skeleton_soldier', 'skeleton_ranger', 'temple_archer', 'skeleton_lich', 'tower_nova']
        ],
        music: 'act2',
        bossPool: ['boss_knight'],
        arenaTheme: 'armory',
        arenaMusic: 'boss_1',
        threats: [['Skeleton squad', 4], ['Archer volley', 3], ['Slime pit', 2], ['Arrow storm', 3], ['Axe mill', 2]]
      },
      {
        themes: ['archives', 'archives', 'archives'],
        monsters: [
          ['eye', 'wisp', 'skeleton_ranger', 'skeleton_soldier'],
          ['eye', 'wisp', 'skeleton_lich#3', 'wisp#3', 'tower_nova'],
          ['eye', 'wisp#3', 'skeleton_lich', 'mb_eye', 'tower_nova']
        ],
        music: 'act3',
        bossPool: ['boss_lich'],
        arenaTheme: 'archives',
        arenaMusic: 'boss_1',
        threats: [['Eye cluster', 4], ['Wisps', 4], ['Necromancer', 2], ['Fireball ring', 3], ['Purple drift', 2]]
      },
      {
        themes: ['chambers', 'chambers', 'chambers'],
        monsters: [
          ['mb_tick', 'mb_maggot', 'bat', 'tick_gold', 'maggot', 'flower'],
          ['mb_skeleton_guard#0', 'mb_eye', 'skeleton_ranger', 'skeleton_soldier', 'tower_nova'],
          ['mb_wizard', 'mb_doomspawner', 'skeleton_lich', 'wisp#3', 'tower_nova_frost']
        ],
        music: 'act4',
        bossPool: ['boss_dragon'],
        arenaTheme: 'chambers',
        arenaMusic: 'boss_final',
        threats: [['Lich council', 2], ['Eye cluster', 3], ['Necromancer', 3], ['Death orbs', 2], ['Big fireball cross', 2]]
      }
    ]
  })
}

function shaftlockeCampaign(): DungeonParameters {
  return acts({
    town: 'shaftlocke_town',
    townMusic: 'shaftlocke_20',
    waves: shaftlockeWaves,
    ...FIVE_TOWNS,
    // seven bosses over four acts: the warden opens, then one of two an act, none twice
    acts: [
      {
        themes: ['prison2', 'prison2', 'prison2'],
        monsters: [
          ['bat', 'shaftlocke_maggot', 'slime', 'prison_warrior', 'flower_eater'],
          ['bat', 'shaftlocke_maggot', 'shaftlocke_maggot_spiky', 'prison_warrior', 'prison_archer'],
          ['prison_warrior', 'prison_warrior#3', 'prison_archer', 'trapper', 'maggot_cyst', 'tick_exploding']
        ],
        music: 'shaftlocke_20',
        bossPool: ['boss_warden'],
        arenaTheme: 'prison2',
        arenaMusic: 'shaftlocke_21',
        threats: [['Bat swarm', 3], ['Maggot brood', 3], ['Skeleton squad', 2], ['Arrow storm', 3], ['Axe mill', 2]]
      },
      {
        themes: ['crypt', 'crypt', 'mine_granite'],
        monsters: [
          ['armory_warrior', 'armory_archer', 'skeleton_lancer', 'ghost', 'crawler'],
          ['armory_warrior', 'guardian', 'skeleton_lancer', 'ancient_ghost', 'shaftlocke_lich', 'bannerman'],
          ['mb_tick', 'mb_shaftlocke_maggot', 'bat', 'tick_gold', 'tick_gold', 'tick', 'spider#1']
        ],
        music: 'shaftlocke_20',
        bossPool: ['boss_wraith', 'boss_golem'],
        arenaTheme: 'crypt',
        arenaMusic: 'shaftlocke_21',
        threats: [['Gold beetles', 4], ['Tick nest', 3], ['Spider nest', 2], ['Spike gauntlet', 2], ['Boulder run', 2]]
      },
      {
        themes: ['armory2', 'archives2', 'archives2'],
        monsters: [
          ['skeleton_footman', 'skeleton_sentry', 'trapper', 'bannerman', 'skeleton_archer#2'],
          ['eye', 'eye_add', 'wisp', 'ghost', 'gargoyle#0', 'bannerman_bloodlust'],
          ['mb_shaftlocke_guard', 'mb_eye', 'mb_sharpshooter#0', 'eye', 'wisp', 'tower_beamo']
        ],
        music: 'shaftlocke_20',
        bossPool: ['boss_eye', 'boss_vampire'],
        arenaTheme: 'archives2',
        arenaMusic: 'shaftlocke_21',
        threats: [['Skeleton squad', 3], ['Archer volley', 3], ['Eye cluster', 2], ['Purple drift', 2], ['Spike gauntlet', 2]]
      },
      {
        themes: ['chambers2', 'chambers2', 'battlement'],
        monsters: [
          ['skeleton_footman', 'skeleton_defender', 'battlemage', 'bannerman', 'tower_ballista'],
          ['mb_shaftlocke_wizard', 'mb_templar', 'skeleton_sentry', 'shaftlocke_lich', 'vampire_thrall', 'bannerman'],
          ['mb_sharpshooter', 'mb_doomspawner', 'battlemage', 'skeleton_defender', 'troll_ice', 'tower_beamo']
        ],
        music: 'shaftlocke_20',
        bossPool: ['boss_seeress', 'boss_dragon_hwr'],
        arenaTheme: 'chambers2',
        arenaMusic: 'shaftlocke_21',
        threats: [['Lich council', 3], ['Eye cluster', 2], ['Wisps', 2], ['Death orbs', 2], ['Confusion', 1]]
      }
    ]
  })
}

function desertCampaign(): DungeonParameters {
  const temple = MONSTER_THEMES.find((t) => t.id === 'temple')!
  return acts({
    town: 'sun_bazaar',
    townMusic: 'temple_hub',
    waves: desertWaves,
    // three acts and four towns: two tiers to start, the fifth before Anubis
    skillTiers: [2, 3, 4, 5],
    itemTiers: [[1], [1, 2], [2, 3], [4, 5]],
    // Temple of the Sun starts outdoors: three buttons in the sand open the way down
    opening: island({
      biome: 'desert',
      minWidth: 128,
      maxWidth: 128,
      minHeight: 128,
      maxHeight: 128,
      hub: 'camp',
      buttons: 3,
      bossCount: 0,
      monsters: [...temple.monsters],
      packs: 12,
      packSize: 4,
      ambushes: 4,
      ambushSize: 4,
      buttonAmbush: 25,
      music: 'temple_hub'
    }),
    acts: [
      {
        themes: ['cave_desert', 'cave_desert', 'cave_desert'],
        monsters: [
          ['tick', 'maggot', 'bat', 'scorpion', 'flower_small'],
          ['tick', 'scorpion', 'spider#0', 'mb_tick', 'flower_eater'],
          ['mummy_guard', 'scorpion', 'tick_gold', 'mb_maggot', 'spider#0']
        ],
        music: 'temple_hub',
        bossPool: ['boss_worm'],
        arenaTheme: 'cave_desert',
        arenaMusic: 'temple_boss',
        threats: [['Tick nest', 3], ['Spider nest', 3], ['Bat swarm', 2], ['Arrow storm', 3], ['Spike gauntlet', 1]]
      },
      {
        themes: ['cave_crystal', 'cave_crystal', 'cave_crystal'],
        monsters: [
          ['wisp#3', 'tick_gold', 'skeleton_soldier'],
          ['skeleton_soldier', 'wisp', 'elemental_ice', 'eye'],
          ['skeleton_lich', 'troll_ice', 'wisp#3', 'tower_static_frost']
        ],
        music: 'act3',
        bossPool: ['boss_krilith'],
        arenaTheme: 'cave_crystal',
        arenaMusic: 'temple_boss',
        threats: [['Wisps', 4], ['Nova towers', 2], ['Eye cluster', 2], ['Frost wall', 2], ['Confusion', 1]]
      },
      {
        themes: ['pyramid_inside', 'pyramid_fancy', 'pyramid_fancy'],
        monsters: [
          ['mummy_guard', 'temple_warrior', 'mummy', 'tower_battlement_archer_desert'],
          ['mummy', 'mummy_mage', 'temple_soldier', 'mummy_guard', 'banner'],
          ['mb_mummy', 'mummy_lich', 'mummy_mage', 'spider#0', 'pillar_fire', 'tower_laser']
        ],
        music: 'temple_boss',
        bossPool: ['boss_anubis'],
        arenaTheme: 'pyramid_fancy',
        arenaMusic: 'temple_final_boss',
        threats: [['Mummy tomb', 4], ['Fire pillars', 2], ['Kamikazes', 1], ["Anubis' wrath", 1], ['Spike gauntlet', 2]]
      }
    ]
  })
}

/** The Campaign Mode group, in the order the stock campaigns came out. */
export const CAMPAIGN_MODE_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'campaign-castle',
    label: 'Castle Campaign',
    description:
      "Castle Hammerwatch in four acts: three floors each, then back to the castle bridge, whose shops sell one more tier of skills and items, then the act's boss — the queen, the knight, the lich and the dragon. About 3 to 4 hours.",
    group: 'campaign',
    build: castleCampaign
  },
  {
    id: 'campaign-shaftlocke',
    label: 'Shaftlocke Campaign',
    description:
      "Shaftlocke Tower in four acts, from the prison to the battlements: three floors each, then back to the town, whose shops sell one more tier, then the act's boss — the warden, then one of two great bosses an act. About 3 to 4 hours.",
    group: 'campaign',
    build: shaftlockeCampaign
  },
  {
    id: 'campaign-desert',
    label: 'Desert Campaign',
    description:
      "The Temple of the Sun in three acts. Find three buttons on a desert island to open the way down, then the caves, the ice caves and the pyramid: three floors each, then back to the bazaar, whose shops sell one more tier, then the worm, Krilith and Anubis. About 2½ to 3 hours.",
    group: 'campaign',
    build: desertCampaign
  }
]
