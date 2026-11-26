// Dev tool: install the Hammerwatch 2 spike scenarios (docs/discovery/hammerwatch-2-spikes.md)
// into the local AE, through the app's own generate → copy → pack → install path.
//
//   node scripts/run-ts.mjs scripts/dev/hw2-spikes.ts [--remove]
//
//   dungeon_11260001  S1 + S3: HW2 themes, monsters and music on floors 1–3 (floor 2 on
//                     default music, to hear AE's return), an HW2 arena and lobby track.
//                     Textures plain, from the unpacked extract.
//   dungeon_11260002  S1 + S3 on a World: an HW2 Highlands island with HW2 monsters and music.
//   dungeon_11260004  S2: floor 1 has three of HW2's grey wolves, and the scenario ships HW2's DashStrike.as.
//   dungeon_11260003  S4: dungeon_11260001's campaign, but every texture taken compiled from
//                     HW2's res/assets.bin and packed as is.
//
// --remove deletes the four .h1c files (and description .txt files) again.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { defaultParameters, defaultWorld, generateDungeon } from '../../src/generator'
import type { DungeonParameters, DungeonResult, GeneratedFile } from '../../src/generator'
import { parseSlotLabel } from '../../src/generator/campaign'
import { installScenario } from '../../src/main/packer'
import { customFiles } from '../../src/main/custom/hw2/files'
import { aeBinSource } from '../../src/main/custom/hw2/copy'
import { hw2Sources } from '../../src/main/custom/hw2/detect'
import { hw2MusicFiles, isHw2MusicPath } from '../../src/main/custom/hw2/music'
import { planCopy } from '../../src/main/custom/copyPlan'
import { AE_SCRIPT_CLASSES, AE_SOUND_EVENTS } from '../../src/main/custom/aeRuntime.generated'
import { readLevel } from '../../src/generator/ae/levelReader'
import { renderLevel } from '../../src/generator/ae/levelWriter'

const AE = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const HW2 = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const SEEDS = [11260001, 11260002, 11260003, 11260004]

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

function floorsCampaign(): DungeonParameters {
  const p = defaultParameters()
  p.themes = p.themes.map((t, i) => (i === 0 ? 'hw2_crypt' : i === 1 ? 'hw2_sewer' : i === 2 ? 'hw2_cave_dark' : t))
  p.floorMusic = p.themes.map((_, i) => (i === 0 ? 'hw2_crypt' : i === 2 ? 'hw2_caves_dark' : 'default'))
  p.levelMonsters = p.levelMonsters.map((pool, i) =>
    i === 0 ? ['hw2_troll_brute', 'hw2_tick'] : i === 1 ? ['hw2_rotten_footman', 'hw2_crab', 'hw2_rotten_sentry'] : i === 2 ? ['hw2_bat', 'hw2_horde_crawler', 'hw2_snake_asp'] : pool
  )
  p.lobbies = p.lobbies.map((l, i) => (i === 0 ? { ...l, music: 'hw2_town_day' } : l))
  p.boss = { ...p.boss, fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, arena: { ...f.arena, theme: 'hw2_obsidian', music: 'hw2_boss' } } : f)) }
  return p
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
  return p
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

/**
 * S2: a stock campaign whose first floor has three of its monsters swapped
 * for HW2's grey wolf, which needs only DashStrike, a class AE lacks. The
 * scenario ships HW2's own DashStrike.as at its HW2 path (AE has no file
 * there). If AE compiles a scenario's scripts, the wolves dash at the party.
 */
async function installScriptSpike(seed: number): Promise<void> {
  const WOLF = 'hw2/actors/beasts/wolves/wolf_grey.unit'
  const SCRIPT = 'scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as'
  const p = defaultParameters()
  const gen = generateDungeon(p, seed)
  if (!gen.ok) throw new Error(gen.errors.join('; '))
  const r = gen as DungeonResult
  const sources = hw2Sources(HW2)!
  const plan = planCopy({
    roots: [WOLF],
    prefix: 'hw2/',
    source: sources.primary,
    plain: sources.unpacked,
    ae: aeBinSource(AE),
    aeClasses: new Set([...AE_SCRIPT_CLASSES, 'DashStrike']),
    aeEvents: new Set(AE_SOUND_EVENTS)
  })
  if (plan.errors.length > 0) throw new Error(plan.errors.join('; '))
  const script = sources.primary.read(SCRIPT)
  if (script === null) throw new Error(`HW2 has no ${SCRIPT}`)
  // the first floor: three monster actors become wolves, ids and spots kept
  // stem floor0 is written in play order as `NN_floor1.lvl`
  const floor = r.files.find((f) => /[/_]floor1\.lvl$/.test(f.path))!
  const parsed = readLevel(floor.content).level
  const actors = parsed.units.filter((u) => u.path.startsWith('actors/') && !u.path.includes('spawner'))
  for (const u of actors.slice(0, 3)) u.path = WOLF
  console.log(`  S2: ${Math.min(3, actors.length)} wolves on floor 1, ${plan.files.length} HW2 files, ${SCRIPT}`)
  const files: GeneratedFile[] = [
    ...r.files.map((f) => (f === floor ? { ...f, content: renderLevel(parsed) } : f)),
    ...plan.files.map((f) => ({ path: f.path, content: Buffer.from(f.data).toString('base64'), encoding: 'base64' as const })),
    { path: SCRIPT, content: Buffer.from(script.data).toString('base64'), encoding: 'base64' }
  ]
  const result = await installScenario(AE, r.campaignName, files, false, r.assetOverrides)
  console.log(`${r.campaignName}: ${result.message}`)
}

await install(SEEDS[0], floorsCampaign(), false)
await install(SEEDS[1], worldCampaign(), false)
await install(SEEDS[2], floorsCampaign(), true)
await installScriptSpike(SEEDS[3])
