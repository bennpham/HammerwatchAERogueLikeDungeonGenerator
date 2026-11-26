import type { GeneratedFile } from '../../../generator'
import type { CopiedFile } from '../copyPlan'
import { hw2CopyPlan } from './copy'
import { hw2Sources } from './detect'
import { hw2MusicFiles, isHw2MusicPath } from './music'

/**
 * The Hammerwatch 2 files a campaign carries (experimental Load custom), as
 * scenario files for an install or an export, or why there are none.
 *
 * A texture read from HW2's `res/assets.bin` is already compiled for a pack
 * (flag 3): an install packs it as it is; a folder or zip export can't use it
 * (it isn't a PNG), so an export leaves those out and says so. With an
 * `unpacked_assets_*` extract beside the pack, textures come plain and both work.
 */
export interface CustomFiles {
  files: GeneratedFile[]
  /** appended to the action's message; '' when there's nothing to say */
  note: string
  /** set when the action can't go ahead */
  error?: string
}

function asGenerated(f: CopiedFile): GeneratedFile {
  const file: GeneratedFile = { path: f.path, content: Buffer.from(f.data).toString('base64'), encoding: 'base64' }
  if (f.flag === 3) file.packFlag = 3
  return file
}

export function customFiles(customAssets: readonly string[], hw2Path: string, aePath: string, use: 'install' | 'export'): CustomFiles {
  if (customAssets.length === 0) return { files: [], note: '' }
  // music is converted from HW2's music.bank; everything else is copied from its assets
  const music = customAssets.filter(isHw2MusicPath)
  const assets = customAssets.filter((p) => !isHw2MusicPath(p))
  const sources = hw2Sources(hw2Path)
  const plan = sources === null && assets.length === 0 ? null : hw2CopyPlan(hw2Path, aePath, assets)
  const tracks = sources === null ? null : hw2MusicFiles(sources.musicBank, music)
  const errors = [
    ...(plan?.errors ?? []),
    ...(tracks?.errors ?? []),
    ...(sources === null && plan === null ? ['This campaign uses Hammerwatch 2 content: load your Hammerwatch 2 folder with Load custom.'] : [])
  ]
  if (errors.length > 0) {
    const more = errors.length > 3 ? ` (and ${errors.length - 3} more)` : ''
    return { files: [], note: '', error: `Couldn't copy the Hammerwatch 2 files: ${errors.slice(0, 3).join('; ')}${more}.` }
  }
  const all = [...(plan?.files ?? []), ...(tracks?.files ?? [])]
  const compiled = all.filter((f) => f.flag === 3)
  if (use === 'export' && compiled.length > 0) {
    return {
      files: all.filter((f) => f.flag !== 3).map(asGenerated),
      note:
        ` Left out ${compiled.length} Hammerwatch 2 texture(s): HW2's assets.bin holds them compiled, which only an install can use.` +
        ' Install instead, or keep an unpacked_assets_* extract in the HW2 folder.'
    }
  }
  const songs = tracks?.files.length ?? 0
  return {
    files: all.map(asGenerated),
    note: ` Carries ${all.length} Hammerwatch 2 file(s)${songs > 0 ? `, ${songs} of them music` : ''}.`
  }
}
