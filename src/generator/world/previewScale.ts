/**
 * A smaller copy of a big world's preview, for the window.
 *
 * A world preview is one character per tile, twice over (the map and the
 * walls): 8 MB for a 2048 island, all sent from the generator to the
 * renderer. The canvas never shows more than about 760 pixels across, so a
 * preview past `maxSide` tiles is sent as blocks of `k`×`k` tiles instead,
 * each block the character most of its tiles have. Marks and the start are
 * moved onto the block grid; `world.scale` and `world.size` keep the real
 * size for the info line.
 *
 * Only the copy sent to the window is shrunk: the generator's own result,
 * which the tests read, stays one character per tile. Pure, no RNG.
 */

import type { LevelPreview } from '../index'

/** Past this many tiles a side, the window gets a downsampled preview. */
export const PREVIEW_MAX_SIDE = 512

export function downsamplePreview(preview: LevelPreview, maxSide = PREVIEW_MAX_SIDE): LevelPreview {
  const world = preview.world
  const { mapWidth: w, mapHeight: h } = preview
  if (world === undefined || Math.max(w, h) <= maxSide) return preview
  const k = Math.ceil(Math.max(w, h) / maxSide)
  const sw = Math.ceil(w / k)
  const sh = Math.ceil(h / k)
  const shrink = (src: string): string => {
    const out = new Uint8Array(sw * sh)
    const counts = new Map<number, number>()
    for (let by = 0; by < sh; by++) {
      for (let bx = 0; bx < sw; bx++) {
        counts.clear()
        for (let y = by * k; y < Math.min(h, (by + 1) * k); y++) {
          for (let x = bx * k; x < Math.min(w, (bx + 1) * k); x++) {
            const c = src.charCodeAt(y * w + x)
            counts.set(c, (counts.get(c) ?? 0) + 1)
          }
        }
        // the commonest character; ties go to the lower code, so the result is stable
        let best = 0
        let most = -1
        for (const [c, n] of counts) if (n > most || (n === most && c < best)) [best, most] = [c, n]
        out[by * sw + bx] = best
      }
    }
    return new TextDecoder().decode(out)
  }
  const cell = <T extends { x: number; y: number }>(t: T): T => ({ ...t, x: Math.floor(t.x / k), y: Math.floor(t.y / k) })
  return {
    ...preview,
    mapWidth: sw,
    mapHeight: sh,
    walls: shrink(preview.walls),
    world: {
      ...world,
      map: shrink(world.map),
      hub: cell(world.hub),
      sites: world.sites.map(cell),
      scale: k,
      size: { width: w, height: h }
    }
  }
}
