import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { levelText, readH1c } from '../scripts/lib/h1c'
import type { H1c } from '../scripts/lib/h1c'

/**
 * Where the tests look for a Hammerwatch Anniversary Edition install. Tests that
 * read stock levels or assets skip themselves when none is found, so CI (which
 * has no game) still passes; set `HWAE_ROOT` to point elsewhere.
 */
export const AE_ROOT =
  process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'

export const HAS_AE = existsSync(join(AE_ROOT, 'scenarios', 'castle_hammerwatch', 'levels', 'level_1.lvl'))

/** The newest `unpacked_assets_*` folder, or null. */
export function aeAssetsDir(): string | null {
  if (!existsSync(AE_ROOT)) return null
  const dirs = readdirSync(AE_ROOT)
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(AE_ROOT, dirs[0]) : null
}

/**
 * A stock level's text, by its path under `scenarios/`: a file
 * (`castle_hammerwatch/levels/level_1.lvl`), or a level inside a pack as
 * `<pack>.h1c:<path>` (`survival.h1c:levels/crystal_mines_shops.lvl`), which is
 * decoded to text SVAL (scripts/lib/h1c.ts).
 */
export function readStockLevel(rel: string): string {
  const packed = /^([^:]+\.h1c):(.+)$/.exec(rel)
  if (packed === null) return readFileSync(join(AE_ROOT, 'scenarios', rel), 'utf8')
  const file = readStockPack(packed[1]).files.get(packed[2])
  if (file === undefined) throw new Error(`${packed[1]} has no ${packed[2]}`)
  return levelText(file)
}

const packs = new Map<string, H1c>()

/** A stock `.h1c` under `scenarios/`, read once per run. */
export function readStockPack(name: string): H1c {
  let pack = packs.get(name)
  if (pack === undefined) {
    pack = readH1c(readFileSync(join(AE_ROOT, 'scenarios', name)))
    packs.set(name, pack)
  }
  return pack
}

export function tilesetSizeFromAssets(tileset: string): number {
  const dir = aeAssetsDir()
  if (dir === null) return 16
  try {
    const m = /<tileset[^>]*\bsize="(\d+)"/.exec(readFileSync(join(dir, tileset), 'utf8'))
    return m === null ? 16 : Number(m[1])
  } catch {
    return 16
  }
}
