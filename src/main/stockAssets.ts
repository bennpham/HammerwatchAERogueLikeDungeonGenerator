import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { entryData, readHw1rIndex } from './h1c/read'
import type { PackEntry, ReadAt } from './h1c/read'

/**
 * The game's own copy of a stock file, by its asset path
 * (`players/classes.sval`), as text; null when the install doesn't have it.
 */
export interface StockSource {
  read: (path: string) => string | null
  /** for messages: where the files come from */
  label: string
}

/**
 * Where an AE install's stock files are read from, for the patches a
 * scenario ships (the power shop, the Players tab):
 *
 *   1. `res/assets.bin`, the pack the game itself runs from (`HW1R`, see
 *      h1c/read.ts). Every install has it;
 *   2. the newest `unpacked_assets_*` folder, which only some installs have
 *      (an extract someone made), when assets.bin can't be read.
 *
 * Null when neither is there. [VERIFIED] the files the patches read are
 * byte-identical in both on the dev machine (tests/h1c.test.ts).
 */
export function stockSource(aePath: string): StockSource | null {
  const assets = assetsBinSource(join(aePath, 'res', 'assets.bin'))
  if (assets !== null) return assets
  const dir = unpackedAssetsDir(aePath)
  if (dir === null) return null
  return {
    label: dir,
    read: (path) => {
      try {
        return readFileSync(join(dir, path), 'utf-8')
      } catch {
        return null
      }
    }
  }
}

/** assets.bin's file table, read once per path and size. */
const indexes = new Map<string, { size: number; mtime: number; entries: Map<string, PackEntry> }>()

function assetsBinSource(file: string): StockSource | null {
  let size: number
  let mtime: number
  try {
    const st = statSync(file)
    size = st.size
    mtime = st.mtimeMs
  } catch {
    return null
  }
  const withFile = <T>(fn: (readAt: ReadAt) => T): T => {
    const fd = openSync(file, 'r')
    try {
      return fn((offset, length) => {
        const b = Buffer.alloc(length)
        const got = readSync(fd, b, 0, length, offset)
        if (got !== length) throw new Error(`assets.bin: short read at ${offset}`)
        return b
      })
    } finally {
      closeSync(fd)
    }
  }
  let cached = indexes.get(file)
  if (cached === undefined || cached.size !== size || cached.mtime !== mtime) {
    try {
      cached = { size, mtime, entries: withFile((readAt) => readHw1rIndex(readAt, size)) }
    } catch {
      return null
    }
    indexes.set(file, cached)
  }
  const entries = cached.entries
  return {
    label: file,
    read: (path) => {
      const entry = entries.get(path)
      if (entry === undefined || entry.flag !== 1) return null
      try {
        // keep a BOM, as readFileSync does, so a patched copy is the stock file plus the edits
        return new TextDecoder('utf-8', { ignoreBOM: true }).decode(withFile((readAt) => entryData(entry, readAt)))
      } catch {
        return null
      }
    }
  }
}

/** The newest unpacked assets folder in an AE install, or null. */
export function unpackedAssetsDir(aePath: string, list: (dir: string) => string[] = safeList): string | null {
  const dirs = list(aePath)
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(aePath, dirs[0]) : null
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
