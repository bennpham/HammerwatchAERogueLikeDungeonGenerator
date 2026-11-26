/**
 * FMOD FSB5 Vorbis samples to Ogg Vorbis files, so another game's music can
 * play in AE the way custom scenarios ship it: `.ogg` files listed in an XML
 * `.sbnk` (docs/discovery/hammerwatch-2-assets.md, finding 6). Pure: bytes in,
 * bytes out, through a `ReadAt` so a 200 MB bank never has to be in memory.
 *
 * FSB5 (python-fsb5, vgmstream's fsb5.c and vorbis_custom_utils_fsb.c):
 *
 *   "FSB5", u32 version (1), u32 sample count, u32 sample-header bytes,
 *   u32 name-table bytes, u32 data bytes, u32 codec (15 = Vorbis), then
 *   reserved bytes to 0x3c (0x40 for version 0). Each sample header is a u64:
 *   bit 0 more chunks follow, bits 1–4 a rate index, bit 5 stereo, bits 6–33
 *   the data offset / 16, bits 34–63 the sample count; then chunks, each a u32
 *   (bit 0 more, bits 1–24 size, bits 25–31 type: 1 channels u8, 2 rate u32,
 *   11 Vorbis: u32 setup CRC32 and a seek table). The name table is u32
 *   offsets, then NUL-terminated names. A sample's data runs to the next
 *   sample's offset (the last to the data size): Vorbis audio packets, each
 *   after a u16 size, with no headers of their own.
 *
 * Rebuilding: an identification packet (channels, rate, blocksizes 256/2048),
 * a comment packet, the setup packet FMOD's encoder always uses for that CRC
 * (./setups.ts), then the audio packets, paged as Ogg with granule positions
 * read off each packet's mode (its blockflag, from the setup's mode table).
 */

import type { ReadAt } from '../../h1c/read'
import { FSB_VORBIS_SETUPS } from './setups'

export interface FsbSample {
  name: string
  rate: number
  channels: number
  /** PCM frames */
  samples: number
  /** the Vorbis setup CRC32, or null for a sample that isn't Vorbis */
  setupCrc: number | null
  /** absolute byte range of its packets in the bank */
  start: number
  end: number
}

const RATES = [4000, 8000, 11000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 96000]
const VORBIS = 15
/** how far into a bank to look for the FSB5 block (HW2's music.bank has it at 91 KB) */
const SEARCH_LIMIT = 8 * 1024 * 1024

const u32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true)

/** Where the first FSB5 block in an FMOD bank starts, or -1. */
export function findFsb5(readAt: ReadAt, size: number): number {
  const chunk = 1 << 20
  for (let at = 0; at < Math.min(size, SEARCH_LIMIT); at += chunk - 3) {
    const b = readAt(at, Math.min(chunk, size - at))
    for (let i = 0; i + 3 < b.length; i++) {
      if (b[i] === 0x46 && b[i + 1] === 0x53 && b[i + 2] === 0x42 && b[i + 3] === 0x35) return at + i
    }
  }
  return -1
}

/** The samples of the FSB5 block at `base`. */
export function readFsb5(readAt: ReadAt, base: number): FsbSample[] {
  const head = readAt(base, 0x40)
  if (new TextDecoder().decode(head.subarray(0, 4)) !== 'FSB5') throw new Error('fsb5: no FSB5 header')
  const version = u32(head, 4)
  const count = u32(head, 8)
  const shdrSize = u32(head, 12)
  const nameSize = u32(head, 16)
  const dataSize = u32(head, 20)
  const codec = u32(head, 24)
  const headSize = version === 0 ? 0x40 : 0x3c
  if (count > 100_000) throw new Error(`fsb5: ${count} samples`)
  const shdr = readAt(base + headSize, shdrSize)
  const names = nameSize > 0 ? readAt(base + headSize + shdrSize, nameSize) : new Uint8Array(0)
  const dataStart = base + headSize + shdrSize + nameSize
  const view = new DataView(shdr.buffer, shdr.byteOffset, shdr.byteLength)
  const raw: Array<Omit<FsbSample, 'end' | 'name'> & { offset: number }> = []
  let p = 0
  for (let i = 0; i < count; i++) {
    const lo = view.getUint32(p, true)
    const hi = view.getUint32(p + 4, true)
    p += 8
    let more = lo & 1
    let rate = RATES[(lo >>> 1) & 0xf] ?? 44100
    let channels = ((lo >>> 5) & 1) + 1
    // bits 6–33: (lo >>> 6) gives 26 bits, the 2 lowest bits of hi the rest
    const offset = ((lo >>> 6) + (hi & 0x3) * 0x4000000) * 16
    const samples = hi >>> 2
    let setupCrc: number | null = null
    while (more) {
      const c = view.getUint32(p, true)
      p += 4
      more = c & 1
      const size = (c >>> 1) & 0xffffff
      const type = (c >>> 25) & 0x7f
      if (type === 1) channels = shdr[p]
      else if (type === 2) rate = view.getUint32(p, true)
      else if (type === 11) setupCrc = view.getUint32(p, true)
      p += size
    }
    raw.push({ rate, channels, samples, setupCrc: codec === VORBIS ? setupCrc : null, offset, start: dataStart + offset })
  }
  return raw.map((s, i) => {
    let name = `sample_${i}`
    if (nameSize > 0) {
      const o = u32(names, i * 4)
      let e = o
      while (e < names.length && names[e] !== 0) e++
      name = new TextDecoder('latin1').decode(names.subarray(o, e))
    }
    const end = i + 1 < raw.length ? raw[i + 1].start : dataStart + dataSize
    return { name, rate: s.rate, channels: s.channels, samples: s.samples, setupCrc: s.setupCrc, start: s.start, end }
  })
}

/**
 * Each mode's blockflag from a setup packet, read backwards from its end the
 * way ffmpeg's vorbis_parser does: the modes are the setup's last field (a
 * 6-bit count, then per mode a blockflag bit, 16-bit window type 0, 16-bit
 * transform type 0 and an 8-bit mapping), before the framing bit.
 */
export function setupModeBlockflags(setup: Uint8Array): boolean[] {
  // the bitstream read backwards: byte order reversed, each byte MSB first
  const total = setup.length * 8
  const bitAt = (pos: number): number => {
    const byte = setup[setup.length - 1 - (pos >> 3)]
    return (byte >> (7 - (pos & 7))) & 1
  }
  let pos = 0
  const bits = (n: number): number => {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 1) | bitAt(pos++)
    return v
  }
  // skip to the framing bit
  let framing = -1
  while (total - pos > 97) {
    if (bits(1) === 1) {
      framing = pos
      break
    }
  }
  if (framing < 0) throw new Error('vorbis setup: no framing bit')
  let modeCount = 0
  let lastCount = 0
  while (total - pos >= 97) {
    if (bits(8) > 63 || bits(16) !== 0 || bits(16) !== 0) break
    bits(1)
    modeCount++
    if (modeCount > 64) break
    const save = pos
    if (bits(6) + 1 === modeCount) lastCount = modeCount
    pos = save
  }
  if (lastCount === 0) throw new Error('vorbis setup: no mode table')
  pos = framing
  const flags = new Array<boolean>(lastCount)
  for (let i = lastCount - 1; i >= 0; i--) {
    bits(40)
    flags[i] = bits(1) === 1
  }
  return flags
}

// --- Ogg --------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

function oggCrc(b: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < b.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b[i]) & 0xff]) >>> 0
  return crc
}

class OggWriter {
  private pages: Uint8Array[] = []
  private seq = 0
  private pending: Uint8Array[] = []
  private pendingSegments = 0

  constructor(private serial: number) {}

  /** a page per call holding whole packets; `granule` is the position after its last packet */
  page(packets: Uint8Array[], granule: bigint, flags: number): void {
    const lacing: number[] = []
    for (const p of packets) {
      let n = p.length
      while (n >= 255) {
        lacing.push(255)
        n -= 255
      }
      lacing.push(n)
    }
    if (lacing.length > 255) throw new Error('ogg: too many segments for one page')
    const body = packets.reduce((s, p) => s + p.length, 0)
    const page = new Uint8Array(27 + lacing.length + body)
    const v = new DataView(page.buffer)
    page.set([0x4f, 0x67, 0x67, 0x53], 0)
    page[4] = 0
    page[5] = flags
    v.setBigUint64(6, granule, true)
    v.setUint32(14, this.serial, true)
    v.setUint32(18, this.seq++, true)
    page[26] = lacing.length
    page.set(lacing, 27)
    let at = 27 + lacing.length
    for (const p of packets) {
      page.set(p, at)
      at += p.length
    }
    v.setUint32(22, oggCrc(page), true)
    this.pages.push(page)
  }

  /** queue an audio packet; flushes a page when the next one wouldn't fit */
  audio(packet: Uint8Array, granuleAfter: bigint, last: boolean): void {
    const segs = Math.floor(packet.length / 255) + 1
    if (this.pendingSegments + segs > 255 || this.pendingBytes() + packet.length > 4096) this.flush(this.lastGranule, false)
    this.pending.push(packet)
    this.pendingSegments += segs
    this.lastGranule = granuleAfter
    if (last) this.flush(granuleAfter, true)
  }

  private lastGranule = 0n

  private pendingBytes(): number {
    return this.pending.reduce((s, p) => s + p.length, 0)
  }

  private flush(granule: bigint, eos: boolean): void {
    if (this.pending.length === 0) return
    this.page(this.pending, granule, eos ? 0x04 : 0)
    this.pending = []
    this.pendingSegments = 0
  }

  bytes(): Uint8Array {
    const total = this.pages.reduce((s, p) => s + p.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const p of this.pages) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
}

function identification(channels: number, rate: number): Uint8Array {
  const b = new Uint8Array(30)
  const v = new DataView(b.buffer)
  b.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 0)
  v.setUint32(7, 0, true)
  b[11] = channels
  v.setUint32(12, rate, true)
  // bitrates 0; blocksizes: short 256 (2^8) low nibble, long 2048 (2^11) high
  b[28] = 0xb8
  b[29] = 1
  return b
}

function comment(): Uint8Array {
  const vendor = new TextEncoder().encode('hwae-dungeon-generator')
  const b = new Uint8Array(7 + 4 + vendor.length + 4 + 1)
  const v = new DataView(b.buffer)
  b.set([0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 0)
  v.setUint32(7, vendor.length, true)
  b.set(vendor, 11)
  v.setUint32(11 + vendor.length, 0, true)
  b[b.length - 1] = 1
  return b
}

/** A stable stream serial per sample name, so the same sample always gives the same bytes. */
function serialOf(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0
  return h
}

/** Bounds the packet walk on a malformed bank: a 5-minute track is ~10,000 packets. */
const MAX_PACKETS = 2_000_000

/** One FSB5 Vorbis sample as an Ogg Vorbis file. */
export function fsbSampleToOgg(readAt: ReadAt, sample: FsbSample): Uint8Array {
  if (sample.setupCrc === null) throw new Error(`${sample.name}: not a Vorbis sample`)
  const b64 = FSB_VORBIS_SETUPS[sample.setupCrc]
  if (b64 === undefined) throw new Error(`${sample.name}: unknown Vorbis setup ${sample.setupCrc.toString(16)}`)
  const setup = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const flags = setupModeBlockflags(setup)
  const modeBits = Math.max(0, Math.ceil(Math.log2(flags.length)))
  const data = readAt(sample.start, sample.end - sample.start)

  const ogg = new OggWriter(serialOf(sample.name))
  ogg.page([identification(sample.channels, sample.rate)], 0n, 0x02)
  ogg.page([comment(), setup], 0n, 0)

  // the packets, then each one's size from its mode
  const packets: Uint8Array[] = []
  let p = 0
  while (p + 2 <= data.length && packets.length < MAX_PACKETS) {
    const size = data[p] | (data[p + 1] << 8)
    if (size === 0 || size === 0xffff || p + 2 + size > data.length) break
    packets.push(data.subarray(p + 2, p + 2 + size))
    p += 2 + size
  }
  if (packets.length === 0) throw new Error(`${sample.name}: no audio packets`)
  let granule = 0n
  let prev = -1
  const end = BigInt(sample.samples)
  packets.forEach((packet, i) => {
    const mode = modeBits === 0 ? 0 : (packet[0] >> 1) & ((1 << modeBits) - 1)
    const block = flags[mode] ? 2048 : 256
    if (prev >= 0) granule += BigInt(prev / 4 + block / 4)
    prev = block
    const last = i === packets.length - 1
    // the last page's granule is the true length: the decoder trims the tail to it
    ogg.audio(packet, last ? end : granule < end ? granule : end, last)
  })
  return ogg.bytes()
}
