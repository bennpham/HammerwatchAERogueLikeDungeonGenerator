import { existsSync } from 'fs'
import { basename, join } from 'path'
import { HW2_ASSETS_MAGIC } from '../../h1c/read'
import { folderSource, newestUnpacked, packSource } from '../binSource'
import type { BinSource } from '../binSource'
import type { Hw2Status } from '../../../shared/ipc'

/**
 * Finding a Hammerwatch 2 install for "Load custom" (experimental).
 *
 * A folder is HW2 when it holds `HW2.exe`. Its files are read from
 * `res/assets.bin` (magic `HW2R`, every install has it) and from the newest
 * `unpacked_assets_*` extract when there is one (made by HW2's PACKAGER.exe,
 * "Extract base resources"; some dev machines). Nothing needs the extract: the
 * copy reads HW2's tinted sprite sheets from the pack itself (layeredTif.ts), and
 * an install packs compiled textures as they are. It only gives an export plain
 * PNGs (docs/discovery/hammerwatch-2-spikes.md, S4). Music comes from
 * `res/assets/sound/music.bank` beside the pack, sound effects from `sfx.bank`
 * with `master_bank.strings.bank` naming its events.
 */
export interface Hw2Sources {
  /** assets.bin when readable, else the extract */
  primary: BinSource
  /** the extract, when there is one */
  unpacked: BinSource | null
  /** `res/assets/sound/music.bank`, when present */
  musicBank: string | null
  /** `res/assets/sound/sfx.bank` and `master_bank.strings.bank` (its event names), when both are present */
  sfxBank: string | null
  stringsBank: string | null
}

/** The HW2 sources in `dir`, or null when it isn't a usable HW2 install. */
export function hw2Sources(dir: string): Hw2Sources | null {
  if (dir === '' || !existsSync(join(dir, 'HW2.exe'))) return null
  const pack = packSource(join(dir, 'res', 'assets.bin'), HW2_ASSETS_MAGIC)
  const extract = newestUnpacked(dir)
  const unpacked = extract === null ? null : folderSource(extract)
  const primary = pack ?? unpacked
  if (primary === null) return null
  const sound = (name: string): string | null => {
    const p = join(dir, 'res', 'assets', 'sound', name)
    return existsSync(p) ? p : null
  }
  const sfx = sound('sfx.bank')
  const strings = sound('master_bank.strings.bank')
  const both = sfx !== null && strings !== null
  return { primary, unpacked, musicBank: sound('music.bank'), sfxBank: both ? sfx : null, stringsBank: both ? strings : null }
}

/** What the Load custom dialog shows for a chosen folder. */
export function detectHw2(dir: string): Hw2Status {
  if (dir === '') return { path: dir, ok: false, message: 'No Hammerwatch 2 folder chosen.', assets: null, unpacked: null, music: false }
  if (!existsSync(dir)) return { path: dir, ok: false, message: `${dir} doesn't exist.`, assets: null, unpacked: null, music: false }
  if (!existsSync(join(dir, 'HW2.exe'))) {
    return {
      path: dir,
      ok: false,
      message: 'No HW2.exe here. Choose the Hammerwatch 2 install folder (the one with HW2.exe and res/).',
      assets: null,
      unpacked: null,
      music: false
    }
  }
  const sources = hw2Sources(dir)
  if (sources === null) {
    return {
      path: dir,
      ok: false,
      message: "Found HW2.exe, but res/assets.bin couldn't be read and there's no unpacked_assets_* folder.",
      assets: null,
      unpacked: null,
      music: false
    }
  }
  const assets = sources.primary.kind === 'assets.bin' ? 'res/assets.bin' : null
  const unpacked = sources.unpacked === null ? null : basename(sources.unpacked.label)
  const from = [assets, unpacked].filter((s) => s !== null).join(' and ')
  return {
    path: dir,
    ok: true,
    message: `Hammerwatch 2 loaded from ${from}.${sources.musicBank === null ? ' No music.bank found: HW2 music is unavailable.' : ''}`,
    assets,
    unpacked,
    music: sources.musicBank !== null
  }
}
