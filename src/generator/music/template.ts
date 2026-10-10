/**
 * The same music rig as rig.ts, in raw XML for the hand-authored lobby/
 * bossprep templates — the editor dialect `levelTemplate/surgery.ts` uses:
 * `<vec2 name="pos">` instead of a `<float name="x">`/`<float name="y">`
 * pair, and `connection-delays` (zeros) instead of the floors' `delays` (a
 * copy of `connections`). Indented with tabs to sit inside
 * `<array name="nodes">`.
 */

import { LEVEL_LOADED_EVENT } from '../core/events'

/**
 * `idBase` is the trigger's id; `idBase + 1` is the PlayMusic node's.
 */
export function musicRigNodes(idBase: number, x: number, y: number, sound: string): string {
  const trigger = idBase
  const music = idBase + 1

  return `\t\t\t<dictionary>
\t\t\t\t<int name="id">${trigger}</int>
\t\t\t\t<string name="type">GlobalEventTrigger</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<string name="parameters">${LEVEL_LOADED_EVENT}</string>
\t\t\t\t<int-arr name="connections">${music}</int-arr>
\t\t\t\t<int-arr name="connection-delays">0</int-arr>
\t\t\t</dictionary>
\t\t\t<dictionary>
\t\t\t\t<int name="id">${music}</int>
\t\t\t\t<string name="type">PlayMusic</string>
\t\t\t\t<bool name="enabled">True</bool>
\t\t\t\t<int name="trigger-times">-1</int>
\t\t\t\t<vec2 name="pos">${x} ${y}</vec2>
\t\t\t\t<dictionary name="parameters">
\t\t\t\t\t<string name="sound">${sound}</string>
\t\t\t\t\t<bool name="loop">True</bool>
\t\t\t\t</dictionary>
\t\t\t</dictionary>
`
}
