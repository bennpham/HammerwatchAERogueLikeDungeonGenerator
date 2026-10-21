// Which stock-town payout spots the closure flood can't reach, and what covers them.
//   node scripts/run-ts.mjs scripts/dev/payout-reach.ts
import { readLevel } from '../../src/generator/ae/levelReader'
import { LOBBY_TEMPLATES } from '../../src/generator/lobby/templates.generated'
import { SHAFTLOCKE_TOWN, SUN_BAZAAR } from '../../src/generator/lobby/stockTown'
import { aeAssetsDir } from '../../tests/aeInstall'
import { closureOf, collidersOf } from '../../tests/closure'

const assets = aeAssetsDir() ?? ''
for (const town of [SHAFTLOCKE_TOWN, SUN_BAZAAR]) {
  const level = readLevel(LOBBY_TEMPLATES.find((t) => t.id === town.id)!.lvl).level
  const xs = level.units.map((u) => u.x)
  const ys = level.units.map((u) => u.y)
  const box = { x0: Math.min(...xs) - 64, y0: Math.min(...ys) - 64, x1: Math.max(...xs) + 64, y1: Math.max(...ys) + 64 }
  const doors = level.units.filter((u) => u.path.startsWith('doodads/doors/'))
  console.log(`  doors: ${[...new Set(doors.map((u) => u.path))].join(' ')} (${doors.length})`)
  // with OPEN_DOORS=1, doors open as in play (`physics-active` off is what collidersOf skips)
  if (process.env.OPEN_DOORS) level.units = level.units.filter((u) => !u.path.startsWith('doodads/doors/'))
  const closure = closureOf(level, box, assets)
  const rects = collidersOf(level, assets)
  const spots = [...town.payout!.diamonds.map((s) => ['diamond', s] as const), ...Object.entries(town.payout!.upgrades).map(([k, s]) => [k, s] as const)]
  console.log(`== ${town.id}: ${spots.length} spots, exit ${closure.reachesExit}`)
  for (const [kind, [tx, ty]] of spots) {
    const px = tx * 16
    const py = ty * 16
    if (closure.reaches(px, py)) continue
    const covering = rects.filter(([x, y, w, h]) => px >= x && px < x + w && py >= y && py < y + h)
    const near = level.units
      .filter((u) => !u.path.startsWith('items/') && Math.abs(u.x - px) <= 24 && Math.abs(u.y - py) <= 24)
      .map((u) => `${u.path}@${u.x},${u.y}`)
    console.log(`  ${kind} ${tx},${ty}: covered by ${covering.length} rect(s) ${JSON.stringify(covering)}; near ${near.join(' ')}`)
  }
}
