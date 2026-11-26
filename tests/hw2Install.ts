import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the tests look for a Hammerwatch 2 install (experimental "Load custom"
 * content). Tests that read HW2's own files skip themselves when none is found,
 * as the AE ones do (aeInstall.ts); set `HW2_ROOT` to point elsewhere.
 */
export const HW2_ROOT = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'

/** The newest `unpacked_assets_*` folder, or null. */
export function hw2AssetsDir(): string | null {
  if (!existsSync(HW2_ROOT)) return null
  const dirs = readdirSync(HW2_ROOT)
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(HW2_ROOT, dirs[0]) : null
}

export const HAS_HW2 = hw2AssetsDir() !== null

/** The run context with Hammerwatch 2 loaded, for generating HW2 content. */
export const HW2_CONTENT = { sources: ['hw2' as const] }
