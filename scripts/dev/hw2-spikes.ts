// Dev tool: install the Hammerwatch 2 spike scenarios (docs/discovery/hammerwatch-2-spikes.md)
// into the local AE, through the app's own generate → copy → pack → install path.
//
//   node scripts/run-ts.mjs scripts/dev/hw2-spikes.ts [--remove]
//
//   dungeon_11260001  S1 + S3: HW2 themes, monsters and music on floors 1–3 (floor 2 on
//                     default music, to hear AE's return), an HW2 arena and lobby track.
//                     Textures plain, from the unpacked extract.
//   dungeon_11260002  S1 + S3 on a World: an HW2 Highlands island with HW2 monsters and music.
//   dungeon_11260004  S2: floor 1 has three of HW2's grey wolves; the copy carries the HW2
//                     scripts they need (DashStrike.as, and easeSineOut in Hw2Compat.as).
//   dungeon_11260005  S5: every HW2 boss's scripts, to see them all compile, and a first look
//                     at Commodore Sinkage on floor 1 (not S6: no arena).
//   dungeon_11260006  S6: Commodore Sinkage as the first arena's boss, right after the first
//                     lobby: the generated arena, our boss bar.
//   dungeon_11260007  S7, one boss each, its arena right after the first lobby: Blight.
//   dungeon_11260008  … Doombringer.
//   dungeon_11260009  … Barrington.
//   dungeon_11260010  … Archibald. (The other five HW2 bosses are confirmed.)
//   dungeon_11260011  Doombringer on a World island right after the first lobby, perched on
//                     the island's west or east end.
//   dungeon_11260012  Blight away from an arena: a World island right after the first lobby
//                     holds him at a site, and floor 1's boss is Blight, waiting in a room.
//   dungeon_11260013  The wider HW2 roster, with HW2's own sound effects: floor 1 beasts,
//                     floor 2 humans, floor 3 undead, on HW2 themes.
//   dungeon_11260014  Doombringer's arena again (#157), to get a verdict: no cover pillars, and a
//                     pile of upgrades and potions dropped as the party arrives.
//   dungeon_11260015  HW2 bosses as floor bosses: floor 1 Sinkage, 2 Shock Widow, 3 Dace Arden,
//                     4 Barrington (Malgar and Judge, confirmed in arenas, left out on request).
//   dungeon_11260003  S4: dungeon_11260001's campaign, but every texture taken compiled from
//                     HW2's res/assets.bin and packed as is.
//
// Each starts with the Hammerwatch 2 level-50 player preset, fully upgraded.
//
// --remove deletes the fifteen .h1c files (and description .txt files) again.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { applyFullyUpgraded, defaultBossFight, defaultDungeonBoss, defaultParameters, defaultWorld, generateDungeon, playerPresetById } from '../../src/generator'
import type { DungeonParameters, DungeonResult, GeneratedFile } from '../../src/generator'
import { parseSlotLabel } from '../../src/generator/campaign'
import { installScenario } from '../../src/main/packer'
import { customFiles } from '../../src/main/custom/hw2/files'
import { aeBinSource, hw2CopyPlan } from '../../src/main/custom/hw2/copy'
import { hw2Sources } from '../../src/main/custom/hw2/detect'
import { hw2MusicFiles, isHw2MusicPath } from '../../src/main/custom/hw2/music'
import { planCopy } from '../../src/main/custom/copyPlan'
import { AE_SCRIPT_CLASSES, AE_SOUND_EVENTS } from '../../src/main/custom/aeRuntime.generated'
import { readLevel } from '../../src/generator/ae/levelReader'
import { renderLevel } from '../../src/generator/ae/levelWriter'

const AE = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const HW2 = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const SEEDS = [11260001, 11260002, 11260003, 11260004, 11260005, 11260006, 11260007, 11260008, 11260009, 11260010, 11260011, 11260012, 11260013, 11260014, 11260015]

if (process.argv.includes('--remove')) {
  for (const seed of SEEDS) {
    for (const f of [`dungeon_${seed}.h1c`, `dungeon_${seed}_description.txt`]) {
      const p = join(AE, 'scenarios', f)
      if (existsSync(p)) {
        rmSync(p)
        console.log(`removed ${p}`)
      }
    }
  }
  process.exit(0)
}

const content = { sources: ['hw2' as const] }

/**
 * Every spike starts maxed out: the Players tab's Hammerwatch 2 "Endgame
 * (level 50)" bodies with every skill bought, since HW2's monsters hit far
 * harder than AE's and the spikes test loading, not balance.
 */
function maxed(p: DungeonParameters): DungeonParameters {
  return { ...p, playerTweaks: applyFullyUpgraded(playerPresetById('hw2-level-50')!.build()) }
}

function floorsCampaign(): DungeonParameters {
  const p = defaultParameters()
  p.themes = p.themes.map((t, i) => (i === 0 ? 'hw2_crypt' : i === 1 ? 'hw2_sewer' : i === 2 ? 'hw2_cave_dark' : t))
  p.floorMusic = p.themes.map((_, i) => (i === 0 ? 'hw2_crypt' : i === 2 ? 'hw2_caves_dark' : 'default'))
  p.levelMonsters = p.levelMonsters.map((pool, i) =>
    i === 0 ? ['hw2_troll_brute', 'hw2_tick'] : i === 1 ? ['hw2_rotten_footman', 'hw2_crab', 'hw2_rotten_sentry'] : i === 2 ? ['hw2_bat', 'hw2_horde_crawler', 'hw2_snake_asp'] : pool
  )
  p.lobbies = p.lobbies.map((l, i) => (i === 0 ? { ...l, music: 'hw2_town_day' } : l))
  p.boss = { ...p.boss, fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, theme: 'hw2_obsidian', music: 'hw2_boss' } } : f)) }
  return maxed(p)
}

function worldCampaign(): DungeonParameters {
  const p = defaultParameters()
  p.world = {
    enabled: true,
    worlds: [{ ...defaultWorld(), biome: 'hw2_highlands', music: 'hw2_highlands_day', monsters: ['hw2_troll_brute', 'hw2_crab', 'hw2_tick'] }]
  }
  // the island right after the first lobby
  const order = p.levelOrder ?? []
  p.levelOrder = [...order.slice(0, 1), parseSlotLabel('W1')!, ...order.slice(1)]
  return maxed(p)
}

/** A maxed stock campaign with a World island right after the first lobby, its one boss `id`. */
function worldFor(id: string): DungeonParameters {
  const p = defaultParameters()
  p.world = { enabled: true, worlds: [{ ...defaultWorld(), buttons: 1, bossCount: 1, bossPool: [id] }] }
  const order = p.levelOrder ?? []
  p.levelOrder = [...order.slice(0, 1), parseSlotLabel('W1')!, ...order.slice(1)]
  return maxed(p)
}

/** `arenaFor(id)` with no cover pillars, and a pile of upgrades and potions on arrival (tier 0). */
function arenaLoadedFor(id: string): DungeonParameters {
  const p = arenaFor(id)
  const drops = [
    { item: 'upgrade_damage_2', count: 64 },
    { item: 'upgrade_defense_2', count: 40 },
    { item: 'upgrade_health_2', count: 20 },
    { item: 'upgrade_attackspeed_2', count: 20 },
    { item: 'potion_1', count: 10 },
    { item: 'potion_3', count: 10 },
    { item: 'health_4', count: 20 }
  ]
  p.boss = {
    ...p.boss,
    fights: p.boss.fights.map((f, i) =>
      i === 0
        ? {
            ...f,
            arena: {
              ...f.arena,
              cover: { ...f.arena.cover, density: 0 },
              waves: f.arena.waves.map((w, t) => (t === 0 ? { ...w, pickups: drops } : w))
            }
          }
        : f
    )
  }
  return p
}

/** A maxed stock campaign whose floors 1.. are each held by one of `ids`. */
function floorBosses(ids: string[]): DungeonParameters {
  const p = defaultParameters()
  p.levelBoss = Array.from({ length: p.levels }, (_, i) =>
    i < ids.length ? { ...defaultDungeonBoss(), enabled: true, bossPool: [ids[i]] } : defaultDungeonBoss()
  )
  return maxed(p)
}

/** Floors 1–3 on HW2 themes, each with a third of the wider roster. */
function rosterCampaign(): DungeonParameters {
  const p = defaultParameters()
  p.themes = p.themes.map((t, i) => (i === 0 ? 'hw2_cave_dark' : i === 1 ? 'hw2_sewer' : i === 2 ? 'hw2_crypt' : t))
  const pools = [
    ['wolf_grey', 'boar', 'beetle_green', 'beetle_frost_ranged', 'spider_black', 'wasp', 'troll_shaman', 'maggot_giant', 'shambler_small', 'worg'],
    ['empire_footman', 'empire_crossbowman', 'empire_sage', 'pirate_raider', 'pirate_scout', 'thief_bandit', 'thief_hunter', 'thief_mage', 'corsair_captain'],
    ['horde_warrior', 'horde_ranger', 'horde_sorcerer', 'horde_necromancer', 'archon_punisher', 'archon_sniper', 'archon_wizard', 'wisp_fire', 'horde_guard']
  ]
  p.levelMonsters = p.levelMonsters.map((pool, i) => (i < pools.length ? pools[i].map((m) => `hw2_${m}`) : pool))
  return maxed(p)
}

/** `worldFor(id)`, and floor 1's boss `id` too. */
function floorAndWorldFor(id: string): DungeonParameters {
  const p = worldFor(id)
  p.levelBoss = Array.from({ length: p.levels }, (_, i) => ({ ...defaultDungeonBoss(), enabled: i === 0, bossPool: [id] }))
  return p
}

/** A maxed stock campaign whose first arena fights HW2 boss `id`, right after the first lobby. */
function arenaFor(id: string): DungeonParameters {
  const p = defaultParameters()
  p.boss = {
    ...p.boss,
    enabled: true,
    fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, bossSelection: 'random', bossPool: [id], bossCount: 1 } } : f))
  }
  const order = p.levelOrder ?? []
  const ab1 = order.find((slot) => JSON.stringify(slot) === JSON.stringify(parseSlotLabel('AB1')))
  if (ab1 !== undefined) p.levelOrder = [order[0], ab1, ...order.slice(1).filter((slot) => slot !== ab1)]
  return maxed(p)
}

/** customFiles' copy, but every texture from assets.bin as compiled (S4). */
function compiledFiles(r: DungeonResult): GeneratedFile[] {
  const sources = hw2Sources(HW2)!
  const assets = r.customAssets.filter((p) => !isHw2MusicPath(p))
  const plan = planCopy({
    roots: assets,
    prefix: 'hw2/',
    source: sources.primary,
    plain: null,
    ae: aeBinSource(AE),
    aeClasses: new Set(AE_SCRIPT_CLASSES),
    aeEvents: new Set(AE_SOUND_EVENTS)
  })
  const music = hw2MusicFiles(sources.musicBank, r.customAssets.filter(isHw2MusicPath))
  const errors = [...plan.errors, ...music.errors]
  if (errors.length > 0) throw new Error(errors.join('; '))
  const compiled = plan.files.filter((f) => f.flag === 3).length
  console.log(`  S4: ${compiled} of ${plan.files.length} HW2 files arrive compiled`)
  return [...plan.files, ...music.files].map((f) => {
    const g: GeneratedFile = { path: f.path, content: Buffer.from(f.data).toString('base64'), encoding: 'base64' }
    if (f.flag === 3) g.packFlag = 3
    return g
  })
}

async function install(seed: number, params: DungeonParameters, compiled: boolean): Promise<void> {
  const gen = generateDungeon(params, seed, content)
  if (!gen.ok) throw new Error(`${seed}: ${gen.errors.join('; ')}`)
  const r = gen as DungeonResult
  let extra: GeneratedFile[]
  if (compiled) extra = compiledFiles(r)
  else {
    const custom = customFiles(r.customAssets, HW2, AE, 'install')
    if (custom.error !== undefined) throw new Error(custom.error)
    extra = custom.files
  }
  const result = await installScenario(AE, r.campaignName, [...r.files, ...extra], false, r.assetOverrides)
  console.log(`${r.campaignName}: ${result.message} (${r.customAssets.length} HW2 roots, ${extra.length} HW2 files)`)
}

const asGenerated = (f: { path: string; data: Uint8Array }): GeneratedFile => ({
  path: f.path,
  content: Buffer.from(f.data).toString('base64'),
  encoding: 'base64'
})

/**
 * A maxed stock campaign whose first floor has some monsters swapped for HW2
 * units (ids and spots kept), carrying their copy, and the scripts of
 * `scriptsOf` too. The copy carries the HW2 script classes the units need
 * (scriptPlan.ts): AE compiles a scenario's scripts with its own, so if they
 * compile the units run.
 */
async function installUnitSpike(seed: number, label: string, swaps: Array<{ unit: string; count: number }>, scriptsOf: readonly string[] = []): Promise<void> {
  const p = maxed(defaultParameters())
  const gen = generateDungeon(p, seed)
  if (!gen.ok) throw new Error(gen.errors.join('; '))
  const r = gen as DungeonResult
  const plan = hw2CopyPlan(HW2, AE, swaps.map((s) => s.unit))!
  if (plan.errors.length > 0) throw new Error(plan.errors.join('; '))
  let files = plan.files
  if (scriptsOf.length > 0) {
    // every listed unit's scripts, in place of the swapped units' own (a superset)
    const scripts = hw2CopyPlan(HW2, AE, scriptsOf)!
    if (scripts.errors.length > 0) throw new Error(scripts.errors.join('; '))
    files = [...files.filter((x) => !x.path.startsWith('scripts/')), ...scripts.files.filter((x) => x.path.startsWith('scripts/'))]
  }
  // stem floor0 is written in play order as `NN_floor1.lvl`
  const floor = r.files.find((f) => /[/_]floor1\.lvl$/.test(f.path))!
  const parsed = readLevel(floor.content).level
  const actors = parsed.units.filter((u) => u.path.startsWith('actors/') && !u.path.includes('spawner'))
  let at = 0
  for (const { unit, count } of swaps) for (let i = 0; i < count && at < actors.length; i++) actors[at++].path = unit
  const scripts = files.filter((x) => x.path.startsWith('scripts/')).map((x) => x.path)
  console.log(`  ${label}: ${at} units swapped on floor 1, ${files.length} files, scripts: ${scripts.join(', ')}`)
  const out: GeneratedFile[] = [...r.files.map((f) => (f === floor ? { ...f, content: renderLevel(parsed) } : f)), ...files.map(asGenerated)]
  const result = await installScenario(AE, r.campaignName, out, false, r.assetOverrides)
  console.log(`${r.campaignName}: ${result.message}`)
}

const BOSSES = [
  'archibald_steelwill/boss_brother.unit', 'barrington/boss_barrington.unit', 'blight_the_horrible/boss_blight.unit',
  'commodore_sinkage/boss_sinkage.unit', 'dace_arden/boss_dace_arden.unit', 'doombringer/boss_doombringer.unit',
  'judge_supreme/boss_judge.unit', 'malgar/boss_malgar.unit', 'shock_widow/boss_shock_widow.unit'
].map((b) => `hw2/actors/bosses/${b}`)

await install(SEEDS[0], floorsCampaign(), false)
await install(SEEDS[1], worldCampaign(), false)
await install(SEEDS[2], floorsCampaign(), true)
await installUnitSpike(SEEDS[3], 'S2', [{ unit: 'hw2/actors/beasts/wolves/wolf_grey.unit', count: 3 }])
await installUnitSpike(SEEDS[4], 'S5', [{ unit: 'hw2/actors/bosses/commodore_sinkage/boss_sinkage.unit', count: 1 }], BOSSES)
await install(SEEDS[5], arenaFor('hw2_sinkage'), false)
// the four likely to stall without their HW2 arena, one scenario each: a boss that can't
// be killed keeps its arena's exit shut, and would block any arena after it
await install(SEEDS[6], arenaFor('hw2_blight'), false)
await install(SEEDS[7], arenaFor('hw2_doombringer'), false)
await install(SEEDS[8], arenaFor('hw2_barrington'), false)
await install(SEEDS[9], arenaFor('hw2_archibald'), false)
await install(SEEDS[10], worldFor('hw2_doombringer'), false)
await install(SEEDS[11], floorAndWorldFor('hw2_blight'), false)
await install(SEEDS[12], rosterCampaign(), false)
await install(SEEDS[13], arenaLoadedFor('hw2_doombringer'), false)
await install(SEEDS[14], floorBosses(['hw2_sinkage', 'hw2_shock_widow', 'hw2_dace_arden', 'hw2_barrington']), false)
