import { AE_ENVIRONMENTS, AE_TILESET_SIZES, AE_UNITS } from './aeAssets.generated'

/** Every AE unit path the snapshot knows, for O(1) existence checks. */
export const AE_UNIT_SET: ReadonlySet<string> = new Set(AE_UNITS)

const ENV_SET: ReadonlySet<string> = new Set(AE_ENVIRONMENTS)

/** Tile size in px of a tileset (16 when the snapshot does not know it). */
export function tilesetSize(tileset: string): number {
  return AE_TILESET_SIZES[tileset] ?? 16
}

/**
 * Whether an asset path the generator emits exists in the installed game,
 * per the snapshot (`scripts/scan-ae-assets.mjs`). Pseudo-units (`:Physics_*`)
 * are engine built-ins and always exist.
 */
export function aeAssetExists(path: string): boolean {
  if (path.startsWith(':')) return true
  if (path.endsWith('.tileset')) return path in AE_TILESET_SIZES
  if (path.endsWith('.env')) return ENV_SET.has(path)
  return AE_UNIT_SET.has(path)
}
