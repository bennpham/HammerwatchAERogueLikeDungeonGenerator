/**
 * Hammerwatch 2 bosses (experimental "Load custom"; docs/plans/hammerwatch-2-bosses.md).
 *
 * They fight in the generated arena like AE's bosses. Their HW2 arena levels,
 * which answer the events they raise (Sinkage's cannons, Barrington's levers),
 * aren't ported: a fight that stalls without its set piece is the cue to port
 * one. The copy carries each boss's HW2 script classes (src/main/custom/
 * scriptPlan.ts) and takes out its HW2 loot actions, so the arena's own reward
 * stands in, as for AE bosses.
 *
 * Like AE's bosses they set `hide-health`, so their health shows only in our
 * `CreateBossBar`. HW2 names them by language keys AE doesn't have, so the bar
 * shows a plain name.
 */
import type { BossDef } from '../../boss/bosses'

const B = 'hw2/actors/bosses'

export const HW2_BOSS_DEFS: Omit<BossDef, 'mobile' | 'unique'>[] = [
  // boss_sinkage.inc: <circle radius="8">, not static
  {
    id: 'hw2_sinkage',
    actorPath: `${B}/commodore_sinkage/boss_sinkage.unit`,
    footprintWidth: 16 / 16,
    footprintHeight: 16 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Commodore Sinkage',
    arenaOnly: true,
    label: 'Commodore Sinkage',
    source: 'hw2'
  }
]
