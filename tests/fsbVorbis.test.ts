import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findFsb5, fsbSampleToOgg, readFsb5, setupModeBlockflags } from '../src/main/custom/vorbis/fsbVorbis'
import { FSB_VORBIS_SETUPS } from '../src/main/custom/vorbis/setups'
import { HW2_MUSIC } from '../src/generator/catalog/hw2Assets.generated'
import { HAS_HW2, HW2_ROOT } from './hw2Install'

const setup = (crc: number) => Uint8Array.from(atob(FSB_VORBIS_SETUPS[crc]), (c) => c.charCodeAt(0))

/** The Ogg pages of a stream: header type, granule, packets (lacing joined). */
function pages(ogg: Uint8Array) {
  const out: Array<{ flags: number; granule: bigint; seq: number; packets: number[] }> = []
  let at = 0
  while (at < ogg.length) {
    expect(new TextDecoder().decode(ogg.subarray(at, at + 4))).toBe('OggS')
    const v = new DataView(ogg.buffer, ogg.byteOffset + at)
    const segs = ogg[at + 26]
    const lacing = ogg.subarray(at + 27, at + 27 + segs)
    const packets: number[] = []
    let cur = 0
    for (const l of lacing) {
      cur += l
      if (l < 255) {
        packets.push(cur)
        cur = 0
      }
    }
    out.push({ flags: ogg[at + 5], granule: v.getBigUint64(6, true), seq: v.getUint32(18, true), packets })
    at += 27 + segs + lacing.reduce((s, l) => s + l, 0)
  }
  expect(at).toBe(ogg.length)
  return out
}

describe('the vendored Vorbis setups', () => {
  it('are whole setup packets with a mode table', () => {
    for (const crc of [0xa4f666fc, 0xc55efa16]) {
      const s = setup(crc)
      expect(new TextDecoder().decode(s.subarray(0, 7))).toBe('\x05vorbis')
      const modes = setupModeBlockflags(s)
      // FMOD's encoder: one short-block and one long-block mode
      expect(modes).toEqual([false, true])
    }
  })
})

describe.skipIf(!HAS_HW2)("Hammerwatch 2's music bank", () => {
  const bank = join(HW2_ROOT, 'res', 'assets', 'sound', 'music.bank')
  const fd = openSync(bank, 'r')
  const readAt = (offset: number, length: number) => {
    const b = Buffer.alloc(length)
    readSync(fd, b, 0, length, offset)
    return b
  }
  const size = statSync(bank).size
  const base = findFsb5(readAt, size)
  const samples = readFsb5(readAt, base)

  it('lists the snapshot\'s tracks, all Vorbis', () => {
    expect(base).toBeGreaterThan(0)
    expect(samples.map((s) => s.name).sort()).toEqual([...HW2_MUSIC])
    for (const s of samples) {
      expect(s.setupCrc).toBe(0xa4f666fc)
      expect([s.channels, s.rate]).toEqual([2, 48000])
      expect(s.end).toBeGreaterThan(s.start)
    }
  })

  it('rebuilds a track as a well-formed Ogg Vorbis stream', () => {
    const s = samples.find((x) => x.name === 'Music_Crypt_120bpm')!
    const ogg = fsbSampleToOgg(readAt, s)
    const ps = pages(ogg)
    // id page (beginning of stream), comment + setup page, then audio to the end of stream
    expect(ps[0].flags).toBe(0x02)
    expect(ps[0].packets).toEqual([30])
    expect(ps[1].packets.length).toBe(2)
    expect(ps.at(-1)!.flags).toBe(0x04)
    ps.forEach((p, i) => expect(p.seq).toBe(i))
    for (let i = 3; i < ps.length; i++) expect(ps[i].granule >= ps[i - 1].granule).toBe(true)
    expect(ps.at(-1)!.granule).toBe(BigInt(s.samples))
    // the same sample always gives the same bytes
    expect(Buffer.from(fsbSampleToOgg(readAt, s)).equals(Buffer.from(ogg))).toBe(true)
  })
})
