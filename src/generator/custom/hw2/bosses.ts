/**
 * Hammerwatch 2 bosses (experimental "Load custom"; docs/plans/hammerwatch-2-bosses.md).
 *
 * They fight in the generated arena like AE's bosses. Their HW2 arena levels,
 * which answer the events they raise (Sinkage's cannons, Barrington's levers),
 * aren't ported: a fight that stalls without its set piece is the cue to port
 * one. The copy carries each boss's HW2 script classes (src/main/custom/
 * scriptPlan.ts) and takes out its HW2 loot actions (AE lacks HW2's loot
 * tables). Like AE's own end bosses, they then drop nothing themselves: an
 * arena's loot is the pickups its waves are set to.
 *
 * Some bosses' HW2 fights are gated by their arena, and may stall in ours
 * (docs/plans/hammerwatch-2-bosses.md, step 4): Blight starts immortal,
 * meditating, until his arena raises an event; Doombringer stays immortal in
 * his intro until his arena sets `doombringer_introduced`, and his arena lands
 * him; Barrington vanishes until his arena's levers bring him out; Archibald
 * yields while the formations his arena spawns fight. Shock Widow, Malgar,
 * Dace Arden and Judge Supreme have no arena-gated immortal state.
 *
 * Malgar opens invisible and untargetable (`state_start`), and only moves once
 * the party is over 160 px away while he's at full health: in HW2 his arena
 * walks the party in from afar. In ours, wait or step back, and he starts.
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
  },
  // _boss_shock_widow: body <circle radius="18">
  {
    id: 'hw2_shock_widow',
    actorPath: `${B}/shock_widow/boss_shock_widow.unit`,
    footprintWidth: 36 / 16,
    footprintHeight: 36 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Shock Widow',
    arenaOnly: true,
    label: 'Shock Widow',
    source: 'hw2'
  },
  // body <circle radius="8">
  {
    id: 'hw2_malgar',
    actorPath: `${B}/malgar/boss_malgar.unit`,
    footprintWidth: 16 / 16,
    footprintHeight: 16 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Malgar',
    arenaOnly: true,
    label: 'Malgar',
    source: 'hw2'
  },
  // body <circle radius="9">; starts immortal until his arena raises an event
  {
    id: 'hw2_blight',
    actorPath: `${B}/blight_the_horrible/boss_blight.unit`,
    footprintWidth: 18 / 16,
    footprintHeight: 18 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Blight the Horrible',
    arenaOnly: true,
    // his arena's GlobalEventRanged "event_intro" gives skill_sphere_stop_intro a charge
    startSignals: [{ event: 'event_intro' }],
    // simple mode: the copy makes his immortal opening and sphere mortal (main/custom/hw2/filePatches.ts),
    // since nothing here runs his arena's hellcubes; he stayed invincible without it
    label: 'Blight the Horrible',
    source: 'hw2'
  },
  // a dragon: body circles up to radius 48; immortal until his arena introduces him
  {
    id: 'hw2_doombringer',
    actorPath: `${B}/doombringer/boss_doombringer.unit`,
    footprintWidth: 96 / 16,
    footprintHeight: 96 / 16,
    placement: 'sideWall',
    forbiddenAlcoveWalls: [],
    barName: 'Doombringer',
    arenaOnly: true,
    // his arena sets it after his roar; until then state_intro holds him immortal
    startSignals: [{ flag: 'doombringer_introduced' }],
    // which side of his HW2 arena he's perched on: every attack of his needs it, and only fires
    // into a 45° arc facing in (west faces east, vision 0°). Without it he just stands there.
    sideSignals: { W: [{ flag: 'west_side' }], E: [{ flag: 'east_side' }] },
    label: 'Doombringer',
    source: 'hw2'
  },
  // body <circle radius="7">
  {
    id: 'hw2_dace_arden',
    actorPath: `${B}/dace_arden/boss_dace_arden.unit`,
    footprintWidth: 14 / 16,
    footprintHeight: 14 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Dace Arden',
    arenaOnly: true,
    label: 'Dace Arden',
    source: 'hw2'
  },
  // body <circle radius="12">
  {
    id: 'hw2_judge_supreme',
    actorPath: `${B}/judge_supreme/boss_judge.unit`,
    footprintWidth: 24 / 16,
    footprintHeight: 24 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Judge Supreme',
    arenaOnly: true,
    label: 'Judge Supreme',
    source: 'hw2'
  },
  // body <circle radius="8">; vanishes until the levers of his arena bring him out
  {
    id: 'hw2_barrington',
    actorPath: `${B}/barrington/boss_barrington.unit`,
    footprintWidth: 16 / 16,
    footprintHeight: 16 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Barrington',
    arenaOnly: true,
    label: 'Barrington',
    source: 'hw2'
  },
  // boss_brother: <circle radius="4">; yields while the formations of his arena fight
  {
    id: 'hw2_archibald',
    actorPath: `${B}/archibald_steelwill/boss_brother.unit`,
    footprintWidth: 16 / 16,
    footprintHeight: 16 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: [],
    barName: 'Archibald Steelwill',
    arenaOnly: true,
    hidden: "can't be fought yet: his fight is the formations his own Hammerwatch 2 arena spawns, until he yields",
    label: 'Archibald Steelwill',
    source: 'hw2'
  }
]
