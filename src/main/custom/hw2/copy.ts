import { join } from 'path'
import { ASSETS_MAGIC } from '../../h1c/read'
import { folderSource, newestUnpacked, packSource } from '../binSource'
import type { BinSource } from '../binSource'
import { planCopy } from '../copyPlan'
import type { CopyPlan } from '../copyPlan'
import { AE_SCRIPT_CLASSES, AE_SOUND_EVENTS } from '../aeRuntime.generated'
import { indexScripts, scriptBase } from '../scriptPlan'
import type { ScriptBase, ScriptIndex, ScriptPatch } from '../scriptPlan'
import { HW2_SCRIPT_PATCHES } from './scriptPatches'
import { HW2_FILE_PATCHES } from './filePatches'
import { hw2Sources } from './detect'
import { hw2SoundSource } from './sounds'

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

const scriptIndexes = new Map<string, ScriptIndex>()

/** Every `scripts/*.as` a source holds, indexed by declaration; cached per source. */
export function scriptIndexOf(source: BinSource): ScriptIndex {
  let index = scriptIndexes.get(source.label)
  if (index === undefined) {
    const dec = new TextDecoder('utf-8', { ignoreBOM: true })
    const files: { path: string; text: string }[] = []
    for (const path of source.list()) {
      if (!path.startsWith('scripts/') || !path.endsWith('.as')) continue
      const f = source.read(path)
      if (f !== null) files.push({ path, text: dec.decode(f.data) })
    }
    index = indexScripts(files)
    scriptIndexes.set(source.label, index)
  }
  return index
}

/** HW2's scripts and the user's own AE's, for carrying the classes HW2 units need; null without AE. */
export function hw2Scripts(hw2: BinSource, ae: BinSource | null): { source: ScriptIndex; ae: ScriptBase; patches: readonly ScriptPatch[] } | null {
  if (ae === null) return null
  return { source: scriptIndexOf(hw2), ae: scriptBase(scriptIndexOf(ae)), patches: HW2_SCRIPT_PATCHES }
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
  const ae = aeBinSource(aePath)
  return planCopy({
    roots,
    prefix: 'hw2/',
    source: hw2.primary,
    plain: hw2.unpacked,
    ae,
    aeClasses: AE_CLASSES,
    aeEvents: AE_EVENTS,
    scripts: hw2Scripts(hw2.primary, ae),
    filePatches: HW2_FILE_PATCHES,
    sounds: hw2SoundSource(hw2.sfxBank, hw2.stringsBank)
  })
}
