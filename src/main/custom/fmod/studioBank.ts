/**
 * FMOD Studio banks (`.bank`, a RIFF "FEV " file): which FSB5 samples an event
 * plays, so another game's sound effects can ship the way custom AE scenarios
 * ship theirs (an XML `.sbnk` of `.ogg` files; hw2/sounds.ts). Pure: bytes in
 * through a `ReadAt`, so a 180 MB bank is never read whole: only its metadata
 * chunks are, and the sample data (`SND `) is skipped.
 *
 * Layouts follow CUE4Parse's FMOD reader (FabianFG/CUE4Parse,
 * CUE4Parse/UE4/FMod), for bank version 0x8e (Hammerwatch 2's):
 *
 *   chunk:      fourCC, u32 size, body; a LIST's body is a 4-byte type, then chunks
 *   GUID:       16 bytes, kept here as hex
 *   X16:        u16; with its top bit set, (low & 0x7fff) | (next u16 << 15)
 *   elem list:  X16 raw (count = raw >> 1); when count > 0, a u16 element size, then elements
 *   array24:    X16 count, then count 24-bit LE values
 *
 *   STDT (strings bank): u32 type (1 = 24-bit radix tree), then node list
 *     (u32 keyInfo: low 24 bits a string offset or 0xffffff, u32 childInfo),
 *     GUID list, X16 blob size + blob (NUL-terminated segments), array24 leaf
 *     index per GUID, array24 parent per node. A GUID's path is its leaf's
 *     segments up to the root, joined root first.
 *   EVTB: event GUID, snapshot GUID, timeline GUID, input bus, master track,
 *     i32 polyphony, i32 priority, u8, i32 scheduling, parameter layouts (GUID list)
 *   TLNB: timeline GUID, trigger boxes (GUID, u32 start, u32 length)
 *   PMLB: parameter layout GUID first (instruments on a parameter sheet hang off it)
 *   LIST WAIT/MUIT/SPIT/EVIT: an instrument. Its INST starts with the GUID of
 *     what it sits on (a timeline, a parameter layout), then f32 volume,
 *     f32 pitch, i32 loop count (-1 forever). WAIB: own GUID, waveform GUID.
 *     MUIB/SPIB: own GUID; their PLST: i32 play mode, i32 selection mode,
 *     entries (GUID of a child instrument, f32 weight). EVIB: own GUID, the
 *     nested event's GUID.
 *   WAV: waveform GUID, u16, i32 sound bank (SND chunk) index, i32 subsound index
 *   SNDH: (u32 absolute FSB5 offset, u32 length) per SND chunk
 */

import type { ReadAt } from '../../h1c/read'

/** One event's samples: FSB5 subsound indices, in their sound bank's order. */
export interface EventSamples {
  subsounds: number[]
  /** an instrument it reaches loops forever */
  looping: boolean
}

export interface StudioBank {
  /** where the bank's (first) FSB5 sample block starts, or -1 */
  fsbOffset: number
  /** an event's samples by its GUID, or null when the bank doesn't hold the event */
  samplesOf(eventGuid: string): EventSamples | null
}

const SENTINEL = 0xffffff
/**
 * The all-zero GUID: "none". A wave instrument with no waveform names it, and
 * thousands of playlist entries name it as their parent, so it's never followed.
 */
const NONE = '0'.repeat(32)
/** Bounds a malformed bank's lists; HW2's largest holds ~8,500 entries. */
const MAX_ELEMS = 1 << 20
/** Bounds one event's instrument walk. */
const MAX_WALK = 100_000

class Reader {
  private readonly view: DataView
  pos: number
  constructor(readonly b: Uint8Array, pos = 0) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength)
    this.pos = pos
  }
  u8(): number {
    return this.b[this.pos++]
  }
  u16(): number {
    const v = this.view.getUint16(this.pos, true)
    this.pos += 2
    return v
  }
  u32(): number {
    const v = this.view.getUint32(this.pos, true)
    this.pos += 4
    return v
  }
  i32(): number {
    const v = this.view.getInt32(this.pos, true)
    this.pos += 4
    return v
  }
  skip(n: number): void {
    this.pos += n
  }
  guid(): string {
    if (this.pos + 16 > this.b.length) throw new Error('truncated GUID')
    let s = ''
    for (let i = 0; i < 16; i++) s += this.b[this.pos + i].toString(16).padStart(2, '0')
    this.pos += 16
    return s
  }
  x16(): number {
    const lo = this.u16()
    return lo & 0x8000 ? (lo & 0x7fff) | (this.u16() << 15) : lo
  }
  list<T>(read: (r: Reader) => T): T[] {
    const n = this.x16() >> 1
    if (n <= 0) return []
    if (n > MAX_ELEMS) throw new Error(`a list of ${n}`)
    this.u16()
    const out: T[] = []
    for (let i = 0; i < n; i++) out.push(read(this))
    return out
  }
  array24(): number[] {
    const n = this.x16()
    if (n > MAX_ELEMS) throw new Error(`an array of ${n}`)
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      out.push(this.b[this.pos] | (this.b[this.pos + 1] << 8) | (this.b[this.pos + 2] << 16))
      this.pos += 3
    }
    return out
  }
}

interface Chunk {
  id: string
  /** a LIST's type */
  type?: string
  /** body start (a LIST's: after its type) and end, absolute */
  start: number
  end: number
}

const latin1 = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])

/** Every chunk in [start, end), depth first; `enter` says whether to walk into a LIST. */
function walk(readAt: ReadAt, start: number, end: number, visit: (c: Chunk) => void, enter: (c: Chunk) => boolean, depth = 0): void {
  if (depth > 16) throw new Error('chunks nested too deep')
  let at = start
  while (at + 8 <= end) {
    const h = readAt(at, Math.min(12, end - at))
    const id = latin1(h, 0)
    const size = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(4, true)
    if (at + 8 + size > end) throw new Error(`chunk ${id} at ${at} runs past its parent`)
    if (id === 'LIST' || id === 'RIFF') {
      const c: Chunk = { id: 'LIST', type: latin1(h, 8), start: at + 12, end: at + 8 + size }
      visit(c)
      if (enter(c)) walk(readAt, c.start, c.end, visit, enter, depth + 1)
    } else visit({ id, start: at + 8, end: at + 8 + size })
    at += 8 + size + (size & 1)
  }
}

const body = (readAt: ReadAt, c: Chunk): Reader => new Reader(readAt(c.start, c.end - c.start))

/** Whether a bank starts as an FMOD Studio bank does. */
function isBank(readAt: ReadAt, size: number): boolean {
  if (size < 12) return false
  const h = readAt(0, 12)
  return latin1(h, 0) === 'RIFF' && latin1(h, 8) === 'FEV '
}

/** A strings bank's event paths by GUID (lower case, as written: `event:/SFX/…`). */
export function readStringsBank(readAt: ReadAt, size: number): Map<string, string> {
  if (!isBank(readAt, size)) throw new Error('not an FMOD Studio bank')
  const paths = new Map<string, string>()
  walk(
    readAt,
    12,
    size,
    (c) => {
      if (c.id !== 'STDT') return
      const r = body(readAt, c)
      const type = r.u32()
      if (type !== 1) throw new Error(`string table type ${type} (only the 24-bit radix tree is read)`)
      const nodes = r.list((x) => {
        const key = x.u32() & SENTINEL
        x.u32()
        return key
      })
      const guids = r.list((x) => x.guid())
      const blobSize = r.x16()
      const blob = r.b.subarray(r.pos, r.pos + blobSize)
      r.skip(blobSize)
      const leaf = r.array24()
      const parent = r.array24()
      if (leaf.length !== guids.length || parent.length !== nodes.length) throw new Error('string table sizes disagree')
      const dec = new TextDecoder()
      guids.forEach((guid, i) => {
        const parts: string[] = []
        let node = leaf[i]
        for (let steps = 0; node !== SENTINEL; steps++) {
          if (steps > nodes.length || node >= nodes.length) throw new Error('string table loops')
          const off = nodes[node]
          if (off !== SENTINEL) {
            const end = blob.indexOf(0, off)
            parts.push(dec.decode(blob.subarray(off, end < 0 ? blob.length : end)))
          }
          node = parent[node]
        }
        paths.set(guid, parts.reverse().join(''))
      })
    },
    () => true
  )
  return paths
}

interface Instrument {
  /** waveform GUIDs, child instrument GUIDs or a nested event's GUID */
  refs: string[]
  kind: 'wave' | 'multi' | 'event'
  loops: boolean
}

const INSTRUMENT_LISTS = new Set(['WAIT', 'MUIT', 'SPIT', 'EVIT'])

/** A metadata/sample bank's event-to-sample links. */
export function readStudioBank(readAt: ReadAt, size: number): StudioBank {
  if (!isBank(readAt, size)) throw new Error('not an FMOD Studio bank')
  const events = new Map<string, string[]>() // event → its timeline and parameter layouts
  const triggerBoxes = new Map<string, string[]>() // timeline → trigger box GUIDs
  const onParent = new Map<string, string[]>() // timeline/layout → instruments on it
  const instruments = new Map<string, Instrument>()
  const waves = new Map<string, number>() // waveform → subsound (sound bank 0 only)
  const fsbOffsets: number[] = []
  walk(
    readAt,
    12,
    size,
    (c) => {
      if (c.id === 'LIST' && INSTRUMENT_LISTS.has(c.type!)) {
        let parent: string | null = null
        let loops = false
        let inst: { guid: string; kind: Instrument['kind']; refs: string[] } | null = null
        const children: string[] = []
        walk(
          readAt,
          c.start,
          c.end,
          (k) => {
            if (k.id === 'INST') {
              const r = body(readAt, k)
              parent = r.guid()
              r.skip(8)
              loops = r.i32() === -1
            } else if (k.id === 'WAIB') {
              const r = body(readAt, k)
              inst = { guid: r.guid(), kind: 'wave', refs: [r.guid()] }
            } else if (k.id === 'MUIB' || k.id === 'SPIB') {
              inst = { guid: body(readAt, k).guid(), kind: 'multi', refs: [] }
            } else if (k.id === 'EVIB') {
              const r = body(readAt, k)
              inst = { guid: r.guid(), kind: 'event', refs: [r.guid()] }
            } else if (k.id === 'PLST') {
              const r = body(readAt, k)
              r.skip(8)
              children.push(
                ...r.list((x) => {
                  const g = x.guid()
                  x.skip(4)
                  return g
                })
              )
            }
          },
          () => false
        )
        const found = inst as { guid: string; kind: Instrument['kind']; refs: string[] } | null
        if (found === null) return
        instruments.set(found.guid, { kind: found.kind, refs: [...found.refs, ...children], loops })
        if (parent !== null) {
          const list = onParent.get(parent) ?? []
          list.push(found.guid)
          onParent.set(parent, list)
        }
      } else if (c.id === 'EVTB') {
        const r = body(readAt, c)
        const guid = r.guid()
        r.skip(16)
        const timeline = r.guid()
        r.skip(32 + 4 + 4 + 1 + 4)
        events.set(guid, [timeline, ...r.list((x) => x.guid())])
      } else if (c.id === 'TLNB') {
        const r = body(readAt, c)
        const guid = r.guid()
        triggerBoxes.set(
          guid,
          r.list((x) => {
            const g = x.guid()
            x.skip(8)
            return g
          })
        )
      } else if (c.id === 'WAV ') {
        const r = body(readAt, c)
        const guid = r.guid()
        r.u16()
        const bank = r.i32()
        const sub = r.i32()
        if (bank === 0) waves.set(guid, sub)
      } else if (c.id === 'SNDH') {
        const r = body(readAt, c)
        fsbOffsets.push(
          ...r.list((x) => {
            const off = x.u32()
            x.u32()
            return off
          })
        )
      }
    },
    // the instrument lists are read whole above; SND is sample data
    (c) => !INSTRUMENT_LISTS.has(c.type!) && c.type !== 'SND '
  )

  const samplesOf = (eventGuid: string): EventSamples | null => {
    const start = events.get(eventGuid)
    if (start === undefined) return null
    const subsounds = new Set<number>()
    let looping = false
    const seen = new Set<string>()
    const stack = [...start]
    for (let steps = 0; stack.length > 0; steps++) {
      if (steps > MAX_WALK) throw new Error(`event ${eventGuid} reaches too much`)
      const g = stack.pop()!
      if (seen.has(g) || g === NONE) continue
      seen.add(g)
      stack.push(...(onParent.get(g) ?? []), ...(triggerBoxes.get(g) ?? []))
      const nested = events.get(g)
      if (nested !== undefined && g !== eventGuid) stack.push(...nested)
      const inst = instruments.get(g)
      if (inst === undefined) continue
      if (inst.loops) looping = true
      for (const ref of inst.refs) {
        const sub = waves.get(ref)
        if (sub !== undefined) subsounds.add(sub)
        // a wave instrument names only a waveform (one this bank lacks plays nothing)
        else if (inst.kind !== 'wave') stack.push(ref)
      }
    }
    return { subsounds: [...subsounds].sort((a, b) => a - b), looping }
  }
  return { fsbOffset: fsbOffsets[0] ?? -1, samplesOf }
}
