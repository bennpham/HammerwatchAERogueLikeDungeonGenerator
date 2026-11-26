// Dev tool: write Hammerwatch 2 music tracks as .ogg (the converter the install uses), to listen or probe.
//   node scripts/run-ts.mjs scripts/dev/hw2-music-ogg.ts <out dir> [track name ...] [--hw2 <dir>]
// With no track names it lists the bank's tracks.
import { closeSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findFsb5, fsbSampleToOgg, readFsb5 } from '../../src/main/custom/vorbis/fsbVorbis'

const args = process.argv.slice(2)
const hw2At = args.indexOf('--hw2')
const hw2 = hw2At >= 0 ? args.splice(hw2At, 2)[1] : 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const [out, ...names] = args
const bank = join(hw2, 'res', 'assets', 'sound', 'music.bank')
const fd = openSync(bank, 'r')
const readAt = (offset: number, length: number) => {
  const b = Buffer.alloc(length)
  readSync(fd, b, 0, length, offset)
  return b
}
const samples = readFsb5(readAt, findFsb5(readAt, statSync(bank).size))
if (names.length === 0 || out === undefined) {
  for (const s of samples) console.log(`${s.name}  ${(s.samples / s.rate).toFixed(1)}s  ${s.channels}ch ${s.rate}Hz`)
} else {
  mkdirSync(out, { recursive: true })
  for (const name of names) {
    const s = samples.find((x) => x.name === name)
    if (s === undefined) {
      console.log(`no track ${name}`)
      continue
    }
    const file = join(out, `${name}.ogg`)
    writeFileSync(file, fsbSampleToOgg(readAt, s))
    console.log(`${file}  ${(s.samples / s.rate).toFixed(2)}s`)
  }
}
closeSync(fd)
