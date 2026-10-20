/**
 * Import the stock towns as lobby templates: Shaftlocke's town, the Temple of
 * the Sun bazaar and the Castle Hammerwatch bridge.
 *
 *   node scripts/run-ts.mjs scripts/import-stock-towns.ts [id ...]
 *
 * Reads each stock level from the AE install (HWAE_ROOT, or the default Steam
 * path), cleans it for a generated campaign (src/generator/lobby/stockTown.ts)
 * and adds it to src/generator/lobby/templates.generated.ts under its id. A
 * room cut out of a bigger level (the bridge) must also pass the closure
 * check (tests/closure.ts), or nothing is written.
 * With ids, only those towns are imported. tests/stockTown.test.ts fails when
 * an embedded copy no longer matches what this script would write, so re-run
 * it after changing the cleanup.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AE_ROOT, aeAssetsDir, readStockLevel } from '../tests/aeInstall'
import { closureOf } from '../tests/closure'
import { readLevel } from '../src/generator/ae/levelReader'
import { renderLevel } from '../src/generator/ae/levelWriter'
import { STOCK_TOWNS } from '../src/generator/lobby/stockTown'
import { TEMPLATES_REL, writeLobbyTemplate } from './lib/lobbyTemplates.mjs'

const wanted = process.argv.slice(2)
const unknown = wanted.filter((id) => !STOCK_TOWNS.some((t) => t.id === id))
if (unknown.length > 0) {
  console.error(`no stock town ${unknown.join(', ')}; known: ${STOCK_TOWNS.map((t) => t.id).join(', ')}`)
  process.exit(1)
}
for (const town of STOCK_TOWNS.filter((t) => wanted.length === 0 || wanted.includes(t.id))) {
  const source = join(AE_ROOT, 'scenarios', town.source)
  if (!existsSync(source)) {
    console.error(`no stock town at ${source}; set HWAE_ROOT to the Hammerwatch Anniversary Edition folder`)
    process.exit(1)
  }
  const { level, unknownParams } = readLevel(readStockLevel(town.source))
  if (unknownParams.length > 0) console.warn(`dropped ${unknownParams.length} untyped param(s): ${unknownParams.join(' ')}`)
  const before = { units: level.units.length, scripts: level.scripts.length }
  const lvl = renderLevel(town.clean(level))
  if (town.closedWithin !== undefined) {
    // a room cut out of a bigger level must be closed by its own colliders
    const { leak, reachesExit } = closureOf(readLevel(lvl).level, town.closedWithin, aeAssetsDir() ?? '')
    if (leak !== null || !reachesExit) {
      console.error(`"${town.id}" is not closed: ${leak !== null ? `the party walks out at ${leak.x},${leak.y}` : 'the exit is out of reach'}`)
      process.exit(1)
    }
  }
  const template = { id: town.id, label: town.label, description: town.description, lvl, ...(town.redBeforeFight === true ? { redBeforeFight: true } : {}) }
  // run-ts bundles this script into the OS temp folder: write relative to the repo it runs from
  const count = writeLobbyTemplate(template, process.cwd())
  console.log(
    `imported ${town.source} as "${town.id}": units ${before.units} -> ${level.units.length}, ` +
      `scripts ${before.scripts} -> ${level.scripts.length}, ${Math.round(lvl.length / 1024)} KB ` +
      `(${count} template(s) in ${TEMPLATES_REL})`
  )
}
