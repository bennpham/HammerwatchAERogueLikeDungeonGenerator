import { join } from 'path'
import { ASSETS_MAGIC } from '../../h1c/read'
import { folderSource, newestUnpacked, packSource } from '../binSource'
import type { BinSource } from '../binSource'
import { planCopy } from '../copyPlan'
import type { CopyPlan } from '../copyPlan'
import { AE_SCRIPT_CLASSES, AE_SOUND_EVENTS } from '../aeRuntime.generated'
import { hw2Sources } from './detect'

const AE_CLASSES: ReadonlySet<string> = new Set(AE_SCRIPT_CLASSES)
const AE_EVENTS: ReadonlySet<string> = new Set(AE_SOUND_EVENTS)

/** AE's own files: its pack, else its extract; null when neither is readable. */
export function aeBinSource(aePath: string): BinSource | null {
  if (aePath === '') return null
  const pack = packSource(join(aePath, 'res', 'assets.bin'), ASSETS_MAGIC)
  if (pack !== null) return pack
  const extract = newestUnpacked(aePath)
  return extract === null ? null : folderSource(extract)
}

/**
 * The Hammerwatch 2 files a scenario must carry for the `hw2/` paths it uses
 * (`DungeonResult.customAssets`), read from the user's own HW2 install.
 * Null when there's nothing to copy; a plan with one error when HW2 isn't
 * usable.
 */
export function hw2CopyPlan(hw2Path: string, aePath: string, roots: readonly string[]): CopyPlan | null {
  if (roots.length === 0) return null
  const hw2 = hw2Sources(hw2Path)
  if (hw2 === null) {
    return {
      files: [],
      keptAe: [],
      notes: [],
      errors: ['This campaign uses Hammerwatch 2 content: load your Hammerwatch 2 folder with Load custom.']
    }
  }
  return planCopy({
    roots,
    prefix: 'hw2/',
    source: hw2.primary,
    plain: hw2.unpacked,
    ae: aeBinSource(aePath),
    aeClasses: AE_CLASSES,
    aeEvents: AE_EVENTS
  })
}
