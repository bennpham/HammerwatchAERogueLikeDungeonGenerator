import { closeSync, openSync, readSync, statSync } from 'fs'
import { readStringsBank, readStudioBank } from '../fmod/studioBank'
import { findFsb5, fsbSampleToOgg, readFsb5 } from '../vorbis/fsbVorbis'
import type { FsbSample } from '../vorbis/fsbVorbis'
import type { ReadAt } from '../../h1c/read'
import type { SoundSource } from '../copyPlan'

/**
 * Hammerwatch 2's sound effects for the copy (experimental Load custom): its
 * units name FMOD events (`event:/SFX/Actors/…`) that AE's banks mostly lack.
 * Their paths come from `master_bank.strings.bank`, the samples each plays from
 * `sfx.bank` (fmod/studioBank.ts), and those samples become `.ogg` files the
 * way HW2's music does (vorbis/fsbVorbis.ts). The copy lists them in an XML
 * `.sbnk`, as AE's custom scenarios ship sounds (copyPlan.ts).
 */

/** Read in 1 MB blocks: a bank's metadata is ~100,000 small chunks. */
const BLOCK = 1 << 20
const BLOCKS_KEPT = 32

function readerOf(path: string): { readAt: ReadAt; size: number; close(): void } {
  const fd = openSync(path, 'r')
  const size = statSync(path).size
  const blocks = new Map<number, Buffer>()
  const block = (i: number): Buffer => {
    let b = blocks.get(i)
    if (b === undefined) {
      const length = Math.min(BLOCK, size - i * BLOCK)
      b = Buffer.alloc(Math.max(length, 0))
      if (readSync(fd, b, 0, b.length, i * BLOCK) !== b.length) throw new Error(`${path}: short read at ${i * BLOCK}`)
      if (blocks.size >= BLOCKS_KEPT) blocks.delete(blocks.keys().next().value!)
      blocks.set(i, b)
    }
    return b
  }
  return {
    size,
    readAt: (offset, length) => {
      if (offset < 0 || offset + length > size) throw new Error(`${path}: read past the end at ${offset}`)
      const first = Math.floor(offset / BLOCK)
      const last = Math.floor((offset + Math.max(length, 1) - 1) / BLOCK)
      if (first === last) return block(first).subarray(offset - first * BLOCK, offset - first * BLOCK + length)
      const out = Buffer.alloc(length)
      for (let i = first, at = 0; i <= last; i++) {
        const b = block(i)
        const from = i === first ? offset - first * BLOCK : 0
        const n = Math.min(b.length - from, length - at)
        b.copy(out, at, from, from + n)
        at += n
      }
      return out
    },
    close: () => closeSync(fd)
  }
}

interface Loaded {
  key: string
  source: SoundSource | null
}

let cache: Loaded | null = null

/** HW2's sound effects as a copy's sound source; null when either bank is missing or unreadable. */
export function hw2SoundSource(sfxBank: string | null, stringsBank: string | null): SoundSource | null {
  if (sfxBank === null || stringsBank === null) return null
  let key: string
  try {
    const a = statSync(sfxBank)
    const b = statSync(stringsBank)
    key = `${sfxBank}|${a.size}|${a.mtimeMs}|${stringsBank}|${b.size}|${b.mtimeMs}`
  } catch {
    return null
  }
  if (cache?.key === key) return cache.source
  let source: SoundSource | null = null
  try {
    const strings = readerOf(stringsBank)
    let paths: Map<string, string>
    try {
      paths = readStringsBank(strings.readAt, strings.size)
    } finally {
      strings.close()
    }
    const sfx = readerOf(sfxBank)
    let samples: FsbSample[]
    let bank: ReturnType<typeof readStudioBank>
    try {
      bank = readStudioBank(sfx.readAt, sfx.size)
      const base = bank.fsbOffset >= 0 ? bank.fsbOffset : findFsb5(sfx.readAt, sfx.size)
      samples = base < 0 ? [] : readFsb5(sfx.readAt, base)
    } finally {
      sfx.close()
    }
    const byPath = new Map<string, string>()
    for (const [guid, path] of paths) byPath.set(path.toLowerCase(), guid)
    source = {
      resolve(event) {
        const guid = byPath.get(event.toLowerCase())
        const found = guid === undefined ? null : bank.samplesOf(guid)
        if (found === null) return null
        const picked = found.subsounds.filter((i) => i < samples.length).map((i) => ({ index: i, name: samples[i].name }))
        return picked.length === 0 ? null : { samples: picked, looping: found.looping }
      },
      ogg(index) {
        const sample = samples[index]
        if (sample === undefined) throw new Error(`no sample ${index} in sfx.bank`)
        const r = readerOf(sfxBank)
        try {
          return fsbSampleToOgg(r.readAt, sample)
        } finally {
          r.close()
        }
      }
    }
  } catch {
    source = null
  }
  cache = { key, source }
  return source
}
