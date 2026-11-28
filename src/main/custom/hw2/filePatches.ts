import type { FilePatch } from '../copyPlan'

/**
 * Edits to Hammerwatch 2's own unit files as a scenario carries them
 * (experimental "Load custom"), for what a generated arena can't do in place
 * of the boss's own HW2 arena. Each names a file by its HW2 path; a carried
 * file a patch no longer matches is an error (HW2 has changed).
 */
export const HW2_FILE_PATCHES: readonly FilePatch[] = [
  {
    path: 'actors/bosses/blight_the_horrible/_boss_blight_states.inc',
    find: '<bool name="immortal">true</bool>',
    replace: '<bool name="immortal">false</bool>',
    why:
      "Blight's meditating opening (state_start) and his sphere (state_sphere) are immortal until his HW2 arena " +
      'moves him on (its intro trigger, and hellcubes that clear the flag event_sphere). A generated arena has ' +
      'neither, and he stayed invincible in game (S8), so both states are mortal: simple mode, asked 2026-11-27.'
  },
  // Doombringer's take-off skills (when the party is 700 px away, or every 45-60 s) put him in
  // state_flying_transition: immortal, untargetable, flying along his HW2 arena's waypoints, which
  // land him again. A generated arena or island has none, so he hung in the air invincible for
  // good (2026-11-27). Without them he stays perched and fights with his ground attacks.
  ...['Near', 'Far', 'Timer'].flatMap((kind) =>
    ['east', 'west'].map((side) => ({
      path: 'actors/bosses/doombringer/boss_doombringer.unit',
      find: `%block SkillTakeFlight${kind} ${side}`,
      replace: '',
      why: `Doombringer never takes flight (skill_take_flight_${kind.toLowerCase()}_${side}): his flight needs his HW2 arena's waypoints to land.`
    }))
  )
]
