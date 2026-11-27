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
  }
]
