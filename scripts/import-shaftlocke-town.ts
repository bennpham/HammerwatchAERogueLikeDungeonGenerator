/**
 * Import Shaftlocke's town as a lobby template.
 *
 *   node scripts/run-ts.mjs scripts/import-shaftlocke-town.ts
 *
 * Reads the stock `town.lvl` from the AE install (HWAE_ROOT, or the default
 * Steam path), cleans it for a generated campaign (src/generator/lobby/stockTown.ts)
 * and adds it to src/generator/lobby/templates.generated.ts as `shaftlocke_town`.
 * tests/stockTown.test.ts fails when the embedded copy no longer matches what
 * this script would write, so re-run it after changing the cleanup.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AE_ROOT, readStockLevel } from '../tests/aeInstall'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import {
  SHAFTLOCKE_TOWN_DESCRIPTION,
  SHAFTLOCKE_TOWN_ID,
  SHAFTLOCKE_TOWN_LABEL,
  SHAFTLOCKE_TOWN_SOURCE,
  cleanShaftlockeTown
} from '../src/generator/lobby/stockTown'
import { TEMPLATES_REL, writeLobbyTemplate } from './lib/lobbyTemplates.mjs'

const source = join(AE_ROOT, 'scenarios', SHAFTLOCKE_TOWN_SOURCE)
if (!existsSync(source)) {
  console.error(`no stock town at ${source}; set HWAE_ROOT to the Hammerwatch Anniversary Edition folder`)
  process.exit(1)
}
const { level, unknownParams } = readLevel(readStockLevel(SHAFTLOCKE_TOWN_SOURCE))
if (unknownParams.length > 0) console.warn(`dropped ${unknownParams.length} untyped param(s): ${unknownParams.join(' ')}`)
const before = { units: level.units.length, scripts: level.scripts.length }
const lvl = renderLevel(cleanShaftlockeTown(level))
// run-ts bundles this script into the OS temp folder: write relative to the repo it runs from
const count = writeLobbyTemplate(
  { id: SHAFTLOCKE_TOWN_ID, label: SHAFTLOCKE_TOWN_LABEL, description: SHAFTLOCKE_TOWN_DESCRIPTION, lvl },
  process.cwd()
)
console.log(
  `imported ${SHAFTLOCKE_TOWN_SOURCE} as "${SHAFTLOCKE_TOWN_ID}": units ${before.units} -> ${level.units.length}, ` +
    `scripts ${before.scripts} -> ${level.scripts.length}, ${Math.round(lvl.length / 1024)} KB ` +
    `(${count} template(s) in ${TEMPLATES_REL})`
)
