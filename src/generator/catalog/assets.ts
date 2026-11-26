import { AE_ENVIRONMENTS, AE_TILESET_SIZES, AE_UNITS } from './aeAssets.generated'
import { HW2_ENVIRONMENTS, HW2_TILESET_SIZES, HW2_UNITS } from './hw2Assets.generated'

/** Every AE unit path the snapshot knows, for O(1) existence checks. */
export const AE_UNIT_SET: ReadonlySet<string> = new Set(AE_UNITS)

const ENV_SET: ReadonlySet<string> = new Set(AE_ENVIRONMENTS)

/**
 * Hammerwatch 2's paths, already under the `hw2/` prefix a scenario ships them
 * at (custom/sources.ts, scripts/scan-hw2-assets.mjs).
 */
const HW2_UNIT_SET: ReadonlySet<string> = new Set(HW2_UNITS)
const HW2_ENV_SET: ReadonlySet<string> = new Set(HW2_ENVIRONMENTS)

const isHw2 = (path: string): boolean => path.startsWith('hw2/')

/** Tile size in px of a tileset (16 when the snapshot does not know it). */
export function tilesetSize(tileset: string): number {
  return (isHw2(tileset) ? HW2_TILESET_SIZES[tileset] : AE_TILESET_SIZES[tileset]) ?? 16
}

/**
 * Whether an asset path the generator emits exists, per the snapshots: AE's
 * (`scripts/scan-ae-assets.mjs`) for stock paths, Hammerwatch 2's
 * (`scripts/scan-hw2-assets.mjs`) for `hw2/` paths, which the install copies in.
 * Pseudo-units (`:Physics_*`) are engine built-ins and always exist.
 */
export function aeAssetExists(path: string): boolean {
  if (path.startsWith(':')) return true
  if (isHw2(path)) {
    if (path.endsWith('.tileset')) return path in HW2_TILESET_SIZES
    if (path.endsWith('.env')) return HW2_ENV_SET.has(path)
    return HW2_UNIT_SET.has(path)
  }
  if (path.endsWith('.tileset')) return path in AE_TILESET_SIZES
  if (path.endsWith('.env')) return ENV_SET.has(path)
  return AE_UNIT_SET.has(path)
}
