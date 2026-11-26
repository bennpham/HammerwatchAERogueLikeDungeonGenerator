import { closeSync, openSync, readSync, statSync } from 'fs'
import { findFsb5, fsbSampleToOgg, readFsb5 } from '../vorbis/fsbVorbis'
import type { CopiedFile } from '../copyPlan'

/** Where a campaign's HW2 tracks ship: `hw2/music/<sample>.ogg` (generator/custom/hw2/music.ts). */
const OGG = /^hw2\/music\/([^/]+)\.ogg$/

export function isHw2MusicPath(path: string): boolean {
  return OGG.test(path)
}

/**
 * The `.ogg` files for a campaign's Hammerwatch 2 tracks, converted from the
 * user's own `res/assets/sound/music.bank` (main/custom/vorbis). Errors name
 * what's missing; nothing is half done.
 */
export function hw2MusicFiles(bank: string | null, paths: readonly string[]): { files: CopiedFile[]; errors: string[] } {
  if (paths.length === 0) return { files: [], errors: [] }
  if (bank === null) return { files: [], errors: ["Hammerwatch 2's res/assets/sound/music.bank wasn't found, so its music can't be copied"] }
  let fd: number
  try {
    fd = openSync(bank, 'r')
  } catch (e) {
    return { files: [], errors: [`couldn't open ${bank}: ${(e as Error).message}`] }
  }
  try {
    const readAt = (offset: number, length: number): Uint8Array => {
      const b = Buffer.alloc(length)
      const got = readSync(fd, b, 0, length, offset)
      if (got !== length) throw new Error(`${bank}: short read at ${offset}`)
      return b
    }
    const base = findFsb5(readAt, statSync(bank).size)
    if (base < 0) return { files: [], errors: [`${bank} has no FSB5 sample block`] }
    const samples = new Map(readFsb5(readAt, base).map((s) => [s.name, s]))
    const files: CopiedFile[] = []
    const errors: string[] = []
    for (const path of [...paths].sort()) {
      const name = OGG.exec(path)?.[1]
      const sample = name === undefined ? undefined : samples.get(name)
      if (sample === undefined) {
        errors.push(`${path}: no such track in music.bank`)
        continue
      }
      try {
        files.push({ path, data: fsbSampleToOgg(readAt, sample), flag: 1 })
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`)
      }
    }
    return { files, errors }
  } catch (e) {
    return { files: [], errors: [`couldn't read ${bank}: ${(e as Error).message}`] }
  } finally {
    closeSync(fd)
  }
}
