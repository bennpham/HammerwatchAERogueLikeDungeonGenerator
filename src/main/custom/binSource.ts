import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { entryData, readHw1rIndex } from '../h1c/read'
import type { PackEntry, ReadAt } from '../h1c/read'

/**
 * A game's asset files by path, as bytes with the pack flag they're stored
 * under: 1 for a plain file, 3 for one the game's packer compiled (textures,
 * levels). Read from a `res/assets.bin` pack, or from an `unpacked_assets_*`
 * extract, where every file is plain.
 *
 * The stock patches (stockAssets.ts) read AE's files as text. Custom content
 * (custom/sources.ts) copies another game's files into a scenario, textures
 * included, so it reads bytes.
 */
export interface BinFile {
  flag: number
  data: Uint8Array
}

export interface BinSource {
  kind: 'assets.bin' | 'unpacked'
  /** for messages: where the files come from */
  label: string
  has(path: string): boolean
  read(path: string): BinFile | null
  /** every path, sorted */
  list(): readonly string[]
}

/** A pack's file table, read once per magic, path, size and mtime. */
const indexes = new Map<string, { size: number; mtime: number; entries: Map<string, PackEntry>; sorted: string[] }>()

/** A `res/assets.bin`-style pack (`HW1R` for AE, `HW2R` for Hammerwatch 2), or null when unreadable. */
export function packSource(file: string, magic: string): BinSource | null {
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
        if (got !== length) throw new Error(`${file}: short read at ${offset}`)
        return b
      })
    } finally {
      closeSync(fd)
    }
  }
  const key = `${magic}:${file}`
  let cached = indexes.get(key)
  if (cached === undefined || cached.size !== size || cached.mtime !== mtime) {
    try {
      const entries = withFile((readAt) => readHw1rIndex(readAt, size, magic))
      cached = { size, mtime, entries, sorted: [...entries.keys()].sort() }
    } catch {
      return null
    }
    indexes.set(key, cached)
  }
  const { entries, sorted } = cached
  return {
    kind: 'assets.bin',
    label: file,
    // the sound banks are listed with no data (flag 0xff): they live beside the pack
    has: (path) => {
      const e = entries.get(path)
      return e !== undefined && (e.flag === 1 || e.flag === 3)
    },
    read: (path) => {
      const entry = entries.get(path)
      if (entry === undefined || (entry.flag !== 1 && entry.flag !== 3)) return null
      try {
        return { flag: entry.flag, data: withFile((readAt) => entryData(entry, readAt)) }
      } catch {
        return null
      }
    },
    list: () => sorted
  }
}

/** An extracted assets folder: every file plain (flag 1). */
export function folderSource(dir: string): BinSource {
  let listing: string[] | null = null
  const walk = (rel: string, out: string[]): void => {
    let names: import('fs').Dirent[]
    try {
      names = readdirSync(join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of names) {
      const r = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.isDirectory()) walk(r, out)
      else out.push(r)
    }
  }
  const list = (): string[] => {
    if (listing === null) {
      const out: string[] = []
      walk('', out)
      listing = out.sort()
    }
    return listing
  }
  return {
    kind: 'unpacked',
    label: dir,
    has: (path) => {
      try {
        return statSync(join(dir, path)).isFile()
      } catch {
        return false
      }
    },
    read: (path) => {
      try {
        return { flag: 1, data: readFileSync(join(dir, path)) }
      } catch {
        return null
      }
    },
    list
  }
}

/** The newest `unpacked_assets_*` folder in a game folder, or null. */
export function newestUnpacked(gameDir: string): string | null {
  let names: string[]
  try {
    names = readdirSync(gameDir)
  } catch {
    return null
  }
  const dirs = names
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(gameDir, dirs[0]) : null
}
