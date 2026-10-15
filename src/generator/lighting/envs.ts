import type { LineEdit, PlayerFileOverride } from '../players/model'
import { ENV_SNAPSHOT } from './envs.generated'

/**
 * Floor brightness. A level's light is its lighting environment
 * (`effects/lighting/*.env`): an ambient colour plus one directional light.
 * Stock levels are dark by design and lit by the lamps placed in them;
 * generated floors also get torches (`torches.ts`), and this lifts the
 * ambient so monsters stay visible away from them.
 *
 * The scenario ships its own copy of each environment its levels use, at the
 * stock path, with every `ambient` line lifted part of the way toward a
 * neutral grey, keeping the theme's tint. Like the player files, the copy is
 * the install's own file with lines patched (`PlayerFileOverride`). Pure.
 */

export interface EnvSnapshot {
  /** e.g. `effects/lighting/prison_1.env` */
  path: string
  /** every `<ambient value="r g b a">` line (some envs have one per `%if` branch) */
  ambients: Array<{ line: number; text: string; value: number[] }>
}

export type Brightness = 'stock' | 'brighter' | 'bright' | 'daylight'

export const BRIGHTNESS_LEVELS: readonly Brightness[] = ['stock', 'brighter', 'bright', 'daylight']

export const BRIGHTNESS_LABELS: Readonly<Record<Brightness, string>> = {
  stock: 'AE stock (dark)',
  brighter: 'Brighter',
  bright: 'Bright',
  daylight: 'Daylight'
}

/** How far toward `LIFT_TARGET` each level moves the ambient colour. */
const LIFT: Readonly<Record<Brightness, number>> = { stock: 0, brighter: 0.3, bright: 0.55, daylight: 0.85 }
const LIFT_TARGET = 200

export function isBrightness(value: string): value is Brightness {
  return (BRIGHTNESS_LEVELS as readonly string[]).includes(value)
}

/** `r g b a` lifted toward grey; the fourth value is kept as it is. */
export function liftedAmbient(value: readonly number[], brightness: Brightness): number[] {
  const k = LIFT[brightness]
  return value.map((c, i) => (i < 3 ? Math.round(c + (LIFT_TARGET - c) * k) : c))
}

const BY_PATH = new Map(ENV_SNAPSHOT.map((e) => [e.path, e]))

/** The environment files to ship for these levels' environments. */
export function environmentOverrides(environments: Iterable<string>, brightness: Brightness): PlayerFileOverride[] {
  if (LIFT[brightness] === 0) return []
  const out: PlayerFileOverride[] = []
  for (const path of [...new Set(environments)].sort()) {
    const env = BY_PATH.get(path)
    if (env === undefined || env.ambients.length === 0) continue
    const edits: LineEdit[] = env.ambients.map((a) => ({
      line: a.line,
      kind: 'text',
      find: `ambient value="${a.text}"`,
      replace: `ambient value="${liftedAmbient(a.value, brightness).join(' ')}"`
    }))
    out.push({ path, source: path, edits })
  }
  return out
}
