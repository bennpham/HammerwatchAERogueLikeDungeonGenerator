// Print each HW2 preset's base health / mana per class, and the health and
// mana upgrade ladders, to match an in-game HUD against a preset.
//   node scripts/run-ts.mjs scripts/dev/hw2-bodies.ts
import { PLAYER_PRESETS, PLAYER_STOCK, skillKey, statKey } from '../../src/generator/players'

for (const preset of PLAYER_PRESETS.filter((p) => p.group === 'hw2')) {
  const t = preset.build()
  console.log(`# ${preset.label}`)
  for (const c of PLAYER_STOCK.classes) {
    const v = (stat: string) => t[statKey(c.id, stat)] ?? c.stats[stat]?.stock
    const ladder = (kind: string, bind: string) => {
      const path = c.skills.find((s) => s.path.endsWith(`_misc_${kind}.sval`))!.path
      const chain = PLAYER_STOCK.skills.find((f) => f.path === path)!.chains[0]
      return chain.tiers.map((tier, i) => t[skillKey(chain.key, i + 1, bind)] ?? tier.binds[bind]?.stock).join('/')
    }
    console.log(
      `  ${c.id.padEnd(9)} hp ${v('base-health')} (${ladder('health', 'player-max-health-set')})  mana ${v('base-mana')} (${ladder('mana', 'player-max-mana-set')})`
    )
  }
}
