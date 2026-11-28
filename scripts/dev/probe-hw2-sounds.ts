// Dev probe: the sound effects an HW2 unit's copy carries (experimental Load custom).
//   node scripts/run-ts.mjs scripts/dev/probe-hw2-sounds.ts [unit path ...]
// Prints the copy's sounds.sbnk and each .ogg's channels, rate, length and size; the default
// unit is a troll brute.
import { hw2CopyPlan } from '../../src/main/custom/hw2/copy'

const hw2Dir = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'
const aeDir = process.env.HWAE_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch Anniversary Edition'
const roots = process.argv.slice(2)
const plan = hw2CopyPlan(hw2Dir, aeDir, roots.length > 0 ? roots : ['hw2/actors/beasts/trolls/troll_brute.unit'])!
const dec = new TextDecoder()
const bank = plan.files.find((f) => f.path === 'hw2/sounds/sounds.sbnk')
console.log(bank === undefined ? '(no sounds.sbnk)' : dec.decode(bank.data))
const oggs = plan.files.filter((f) => f.path.endsWith('.ogg'))
console.log(`${oggs.length} .ogg files, ${(oggs.reduce((n, f) => n + f.data.length, 0) / 1024).toFixed(0)} KB`)
for (const f of oggs) {
  // the identification packet: "\x01vorbis", u32 version, u8 channels, u32 rate (first page, after its segment table)
  const d = f.data
  const segs = d[26]
  const at = 27 + segs
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const ok = dec.decode(d.subarray(0, 4)) === 'OggS' && dec.decode(d.subarray(at + 1, at + 7)) === 'vorbis'
  const channels = d[at + 11]
  const rate = view.getUint32(at + 12, true)
  // the last page's granule position: the length in frames
  let last = d.length - 4
  while (last > 0 && !(d[last] === 0x4f && d[last + 1] === 0x67 && d[last + 2] === 0x67 && d[last + 3] === 0x53)) last--
  const granule = Number(view.getBigInt64(last + 6, true))
  console.log(`  ${f.path.replace('hw2/sounds/', '')} ${ok ? '' : 'BAD HEADER '}${channels}ch ${rate} Hz ${(granule / rate).toFixed(2)} s ${f.data.length} B`)
}
console.log('errors:', plan.errors)
