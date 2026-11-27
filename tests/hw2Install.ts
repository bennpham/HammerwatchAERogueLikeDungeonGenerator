import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CopyPlan } from '../src/main/custom/copyPlan'
import { aeBinSource } from '../src/main/custom/hw2/copy'
import { aeAssetExists } from '../src/generator/catalog/assets'

/**
 * Where the tests look for a Hammerwatch 2 install (experimental "Load custom"
 * content). Tests that read HW2's own files skip themselves when none is found,
 * as the AE ones do (aeInstall.ts); set `HW2_ROOT` to point elsewhere.
 */
export const HW2_ROOT = process.env.HW2_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch 2'

/** The newest `unpacked_assets_*` folder, or null. */
export function hw2AssetsDir(): string | null {
  if (!existsSync(HW2_ROOT)) return null
  const dirs = readdirSync(HW2_ROOT)
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(HW2_ROOT, dirs[0]) : null
}

export const HAS_HW2 = hw2AssetsDir() !== null

/** The run context with Hammerwatch 2 loaded, for generating HW2 content. */
export const HW2_CONTENT = { sources: ['hw2' as const] }

/** Anything path-shaped, found without the copier's own reader (refs.ts), so a form it misses shows here. */
const PATHLIKE = /[\w./-]+\.(?:unit|inc|png|effect|sval|tileset|env|mats|pfb|tif|sbnk|ogg)\b(?::([\w-]+))?/g
const MATERIAL_NAME = /<material name="([^"]+)"/g

/**
 * What the shipped text files of a copy name that the game won't find: a path
 * neither shipped nor AE's, or a `.mats:name` neither the shipped `.mats` nor
 * AE's own defines. Paths the copy noted as missing from HW2 itself (editor-only
 * guides) are let through. The game reports these as "Couldn't find …" at load.
 */
export function danglingPaths(copy: CopyPlan, aeRoot: string): string[] {
  const dec = new TextDecoder()
  const ae = aeBinSource(aeRoot)
  const shipped = new Map(copy.files.map((f) => [f.path, f]))
  const noted = copy.notes.join('\n')
  const matsCache = new Map<string, Set<string> | null>()
  const materials = (path: string): Set<string> | null => {
    if (!matsCache.has(path)) {
      const f = shipped.get(path) ?? ae?.read(path) ?? null
      matsCache.set(path, f === null ? null : new Set([...dec.decode(f.data).matchAll(MATERIAL_NAME)].map((m) => m[1])))
    }
    return matsCache.get(path)!
  }
  const out = new Set<string>()
  // a compiled prefab shipped as if it were text reads as garbage in AE
  for (const f of copy.files) if (f.path.endsWith('.pfb') && f.flag === 1 && dec.decode(f.data.subarray(0, 1)) !== '<') out.add(`${f.path} is not text`)
  for (const f of copy.files) {
    if (!/\.(unit|inc|tileset|effect|env|sval|pfb)$/.test(f.path)) continue
    // comments aren't read: XML ones and the preprocessor's `%//` lines
    const text = dec.decode(f.data).replace(/<!--[\s\S]*?-->/g, '').replace(/^[ \t]*%\/\/.*$/gm, '')
    for (const m of text.matchAll(PATHLIKE)) {
      const path = m[0].replace(/:[\w-]+$/, '')
      if (path.startsWith('.') || path.startsWith('event:')) continue
      if (noted.includes(path.replace(/^hw2\//, ''))) continue
      if (!shipped.has(path) && !aeAssetExists(path) && ae?.has(path) !== true) {
        out.add(`${f.path} names ${path}`)
        continue
      }
      // an upper-case entry is a macro (`colors.mats:THEME`, set by `%replace THEME crypt`)
      if (path.endsWith('.mats') && m[1] !== undefined && !/^[A-Z_]+$/.test(m[1]) && materials(path)?.has(m[1]) !== true) {
        out.add(`${f.path} names material ${path}:${m[1]}`)
      }
    }
  }
  return [...out].sort()
}
