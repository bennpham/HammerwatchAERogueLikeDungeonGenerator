import type { GeneratedFile } from '../../../generator'
import type { CopiedFile } from '../copyPlan'
import { hw2CopyPlan } from './copy'

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
  const plan = hw2CopyPlan(hw2Path, aePath, customAssets)
  if (plan === null) return { files: [], note: '' }
  if (plan.errors.length > 0) {
    const more = plan.errors.length > 3 ? ` (and ${plan.errors.length - 3} more)` : ''
    return { files: [], note: '', error: `Couldn't copy the Hammerwatch 2 files: ${plan.errors.slice(0, 3).join('; ')}${more}.` }
  }
  const compiled = plan.files.filter((f) => f.flag === 3)
  if (use === 'export' && compiled.length > 0) {
    return {
      files: plan.files.filter((f) => f.flag !== 3).map(asGenerated),
      note:
        ` Left out ${compiled.length} Hammerwatch 2 texture(s): HW2's assets.bin holds them compiled, which only an install can use.` +
        ' Install instead, or keep an unpacked_assets_* extract in the HW2 folder.'
    }
  }
  return { files: plan.files.map(asGenerated), note: ` Carries ${plan.files.length} Hammerwatch 2 file(s).` }
}
