// How much gold each campaign preset lays on its floors (balance audit B5):
//   node scripts/run-ts.mjs scripts/dev/measure-gold.ts [seeds] [presetId…]
//
// Generates every preset (or the ones named) on `seeds` seeds (default 3),
// reads each floor back and sums the coins and diamonds placed in it, at the
// gold each is worth when picked up (objects/mysteryLoot.ts). Lobby gold is
// the preset's own starting gold. Prints one markdown table per preset and a
// summary table.
//
// Counted: coins and diamonds placed in the level (lair and vault treasure,
// an island's caches). Not counted, because the level file can't show them:
// chests, breakables, monster drops and mystery-plate loot, all of which
// spawn at run time. So the floor figures are a floor, not a ceiling.
import { generateDungeon } from '../../src/generator'
import { readLevel } from '../../src/generator/ae/levelReader'
import { stemOfFileName } from '../../src/generator/campaign'
import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'

const GOLD: Record<string, number> = {
  coin_copper_small: 1,
  coin_copper_medium: 5,
  coin_copper_large: 10,
  coin_silver_small: 3,
  coin_silver_medium: 13,
  coin_silver_large: 25,
  coin_gold_small: 5,
  coin_gold_medium: 27,
  coin_gold_large: 42,
  diamond_small: 50,
  diamond_small_red: 100,
  diamond: 250,
  diamond_red: 500
}

function goldOf(path: string): number {
  const m = /^items\/pickups\/money\/([a-z_]+)\.unit$/.exec(path)
  return m === null ? 0 : (GOLD[m[1]] ?? 0)
}

const [seedArg, ...ids] = process.argv.slice(2)
const seeds = Array.from({ length: seedArg === undefined ? 3 : Number(seedArg) }, (_, i) => 1000 + i)
const presets = ids.length === 0 ? CAMPAIGN_PRESETS : CAMPAIGN_PRESETS.filter((p) => ids.includes(p.id))

const summary: string[] = ['| Preset | Floors | Lobby gold | Floor gold (mean) | Per floor (mean) |', '| --- | --- | --- | --- | --- |']
for (const preset of presets) {
  const params = preset.build()
  const lobbyGold = params.lobbies.reduce((s, l) => s + (l.startingGold ?? 0), 0)
  const perFloor: number[][] = []
  const worlds: number[] = []
  for (const seed of seeds) {
    const r = generateDungeon(params, seed)
    if (!r.ok) {
      console.error(`${preset.id} seed ${seed}: ${r.errors.join(' ')}`)
      continue
    }
    for (const f of r.files) {
      const name = /\/([^/]+)\.lvl$/.exec(f.path)?.[1]
      const stem = name === undefined ? undefined : stemOfFileName(name)
      if (stem === undefined) continue
      const gold = readLevel(f.content).level.units.reduce((s, u) => s + goldOf(u.path), 0)
      const floor = /^floor(\d+)$/.exec(stem)
      if (floor !== null) (perFloor[Number(floor[1])] ??= []).push(gold)
      else if (stem.startsWith('world')) worlds.push(gold)
    }
  }
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length))
  console.log(`\n### ${preset.label} (${preset.id})\n`)
  console.log('| Floor | Theme | Gold on seeds ' + seeds.join(', ') + ' | Mean |')
  console.log('| --- | --- | --- | --- |')
  perFloor.forEach((golds, i) => console.log(`| ${i + 1} | ${params.themes[i]} | ${golds.join(', ')} | ${mean(golds)} |`))
  if (worlds.length > 0) console.log(`| islands | | ${worlds.join(', ')} | ${mean(worlds)} |`)
  const total = mean(seeds.map((_, s) => perFloor.reduce((a, golds) => a + (golds[s] ?? 0), 0)))
  summary.push(`| ${preset.label} | ${params.levels} | ${lobbyGold} | ${total} | ${params.levels === 0 ? 0 : Math.round(total / params.levels)} |`)
}
console.log('\n### Summary\n')
console.log(summary.join('\n'))
