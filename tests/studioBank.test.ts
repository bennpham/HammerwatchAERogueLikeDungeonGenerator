import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readStringsBank, readStudioBank } from '../src/main/custom/fmod/studioBank'
import type { ReadAt } from '../src/main/h1c/read'
import { hw2SoundSource } from '../src/main/custom/hw2/sounds'
import { HAS_HW2, HW2_ROOT } from './hw2Install'

// FMOD Studio banks, built by hand in the layout fmod/studioBank.ts reads (bank version 0x8e)

const bytes = (...parts: Array<Uint8Array | number[]>): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const i32 = u32
const f32 = (v: number) => Array.from(new Uint8Array(new Float32Array([v]).buffer))
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
const guid = (n: number) => [n, ...new Array<number>(15).fill(0xa0)]
const hex = (n: number) => Buffer.from(guid(n)).toString('hex')
/** an element list: X16 count << 1, then the element size and the elements */
const elems = (size: number, items: number[][]) => (items.length === 0 ? u16(0) : [...u16(items.length << 1), ...u16(size), ...items.flat()])
const arr24 = (items: number[]) => [...u16(items.length), ...items.flatMap((v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff])]

function chunk(id: string, body: Uint8Array | number[]): Uint8Array {
  const b = Uint8Array.from(body)
  return bytes(ascii(id), u32(b.length), b, b.length & 1 ? [0] : [])
}
const list = (type: string, ...children: Uint8Array[]) => chunk('LIST', bytes(ascii(type), ...children))
const riff = (...children: Uint8Array[]) => {
  const b = bytes(ascii('FEV '), chunk('FMT ', [...i32(0x8e), ...i32(0x8c)]), ...children)
  return bytes(ascii('RIFF'), u32(b.length), b)
}
const reader = (b: Uint8Array): ReadAt => (offset, length) => b.subarray(offset, offset + length)

/** the all-zero GUID, "none": what a playlist's entries sit on, and a waveform-less wave instrument names */
const NONE = -1
const guidOrNone = (n: number) => (n === NONE ? new Array<number>(16).fill(0) : guid(n))
const inst = (parent: number, loop = 0) => chunk('INST', [...guidOrNone(parent), ...f32(0), ...f32(0), ...i32(loop), 0, 0, 0, 0])
const evtb = (id: number, timeline: number) =>
  list('EVNT', chunk('EVTB', [...guid(id), ...guid(0), ...guid(timeline), ...guid(0), ...guid(0), ...i32(0), ...i32(0), 0, ...i32(0), ...elems(16, [])]))
const tlnb = (id: number) => list('TMLN', chunk('TLNB', [...guid(id), ...u16(0)]))
const wav = (id: number, bank: number, sub: number) => chunk('WAV ', [...guid(id), ...u16(8), ...i32(bank), ...i32(sub)])

describe('reading FMOD Studio banks', () => {
  it("names an event from a strings bank's radix tree", () => {
    const blob = ascii('event:/a/\0x\0y\0')
    const stdt = chunk('STDT', [
      ...u32(1),
      ...elems(8, [
        [...u32(0xff000000 | 0), ...u32(0)],
        [...u32(10), ...u32(0)],
        [...u32(12), ...u32(0)]
      ]),
      ...elems(16, [guid(1), guid(2)]),
      ...u16(blob.length),
      ...blob,
      ...arr24([1, 2]),
      ...arr24([0xffffff, 0, 0])
    ])
    const bank = riff(list('PROJ', stdt))
    const names = readStringsBank(reader(bank), bank.length)
    expect([...names]).toEqual([
      [hex(1), 'event:/a/x'],
      [hex(2), 'event:/a/y']
    ])
  })

  it('follows an event to every sample it may play, through playlists and nested events', () => {
    const bank = riff(
      list(
        'PROJ',
        list('EVTS', evtb(1, 11), evtb(2, 12)),
        list('TLNS', tlnb(11), tlnb(12)),
        list('MUIS', list('MUIT', inst(11), chunk('MUIB', guid(21)), chunk('PLST', [...i32(1), ...i32(1), ...elems(20, [[...guid(31), ...f32(1)], [...guid(32), ...f32(1)]])]))),
        list(
          'WAIS',
          list('WAIT', inst(NONE), chunk('WAIB', [...guid(31), ...guid(41)])),
          list('WAIT', inst(NONE, -1), chunk('WAIB', [...guid(32), ...guid(42)])),
          list('WAIT', inst(12), chunk('WAIB', [...guid(33), ...guid(43)])),
          // a wave instrument with no waveform names "none", which every playlist entry sits on:
          // following it reached every sample in HW2's bank
          list('WAIT', inst(11), chunk('WAIB', [...guid(35), ...guidOrNone(NONE)])),
          list('WAIT', inst(NONE), chunk('WAIB', [...guid(36), ...guid(45)]))
        ),
        list('EVIS', list('EVIT', inst(12), chunk('EVIB', [...guid(34), ...guid(1)]))),
        list('MUIS', list('MUIT', inst(NONE), chunk('MUIB', guid(22)), chunk('PLST', [...i32(1), ...i32(1), ...elems(20, [[...guid(36), ...f32(1)]])]))),
        list('WAVS', wav(41, 0, 5), wav(42, 0, 2), wav(43, 0, 9), wav(44, 1, 3), wav(45, 0, 77)),
        chunk('SNDH', elems(8, [[...u32(1234), ...u32(0)]]))
      ),
      list('SND ', chunk('JUNK', [1, 2, 3, 4]))
    )
    const b = readStudioBank(reader(bank), bank.length)
    expect(b.fsbOffset).toBe(1234)
    // its multi-instrument's two waveforms; one of them loops
    expect(b.samplesOf(hex(1))).toEqual({ subsounds: [2, 5], layers: [[2, 5]], looping: true })
    // its own waveform, and the event it nests
    expect(b.samplesOf(hex(2))).toEqual({ subsounds: [2, 5, 9], layers: [[9], [2, 5]], looping: true })
    expect(b.samplesOf(hex(9))).toBeNull()
  })

  it('refuses a file that is not a bank, and a chunk that runs past its parent', () => {
    const notBank = Uint8Array.from(ascii('RIFFxxxxWAVE'))
    expect(() => readStudioBank(reader(notBank), notBank.length)).toThrow(/not an FMOD Studio bank/)
    const bad = riff(list('PROJ', chunk('EVTB', [1, 2, 3])))
    bad.set(u32(9999), 12 + 4 + 16 + 12 + 4)
    expect(() => readStudioBank(reader(bad), bad.length)).toThrow()
  })
})

describe.skipIf(!HAS_HW2)("Hammerwatch 2's own sound banks", () => {
  const sound = join(HW2_ROOT, 'res', 'assets', 'sound')

  it('name its events and resolve the ones its monsters use to their samples', () => {
    const strings = join(sound, 'master_bank.strings.bank')
    const fd = openSync(strings, 'r')
    let names: Map<string, string>
    try {
      const readAt: ReadAt = (o, n) => {
        const b = Buffer.alloc(n)
        readSync(fd, b, 0, n, o)
        return b
      }
      names = readStringsBank(readAt, statSync(strings).size)
    } finally {
      closeSync(fd)
    }
    expect(names.size).toBeGreaterThan(3000)
    expect([...names.values()]).toContain('event:/SFX/Actors/aberrations/eye/eye_aggro')

    const source = hw2SoundSource(join(sound, 'sfx.bank'), strings)!
    expect(source).not.toBeNull()
    const eye = source.resolve('event:/SFX/Actors/aberrations/eye/eye_melee')!
    expect(eye.samples.map((s) => s.name).sort()).toEqual(['eye_melee-001', 'eye_melee-002', 'eye_melee-003', 'eye_melee-004'])
    // FMOD paths ignore case, as HW2's units write them either way
    expect(source.resolve('event:/sfx/actors/aberrations/eye/eye_melee')).toEqual(eye)
    expect(source.resolve('event:/SFX/nothing/here')).toBeNull()
    const ogg = source.ogg(eye.samples[0].index)
    expect(new TextDecoder().decode(ogg.subarray(0, 4))).toBe('OggS')
  })
})
