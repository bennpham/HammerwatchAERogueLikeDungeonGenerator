// Print the Players tab's labels for every file and chain.
//   node scripts/run-ts.mjs scripts/dev/player-labels.ts
import { PLAYER_STOCK, chainLabel, skillFileLabel } from '../../src/generator/players'

for (const f of PLAYER_STOCK.skills) {
  console.log(`${f.stem} -> ${skillFileLabel(f)}: ${f.chains.map((c) => chainLabel(f, c)).join(' / ')}`)
}
