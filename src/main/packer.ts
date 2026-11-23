import { existsSync, openSync, readSync, closeSync, readFileSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { descriptionFileName } from '../generator/describe'
import type { GeneratedFile } from '../generator'
import { POWER_SHOP_PATH, applyLineEdits } from '../generator/players'
import type { LineEdit, PlayerFileOverride } from '../generator/players'
import type { ActionResult } from '../shared/ipc'
import { H1C_MAGIC } from './h1c/read'
import { toPackFiles, writeH1c } from './h1c/write'
import type { PackFile } from './h1c/write'
import { stockSource } from './stockAssets'

export { H1C_MAGIC }

/** The game's folder name under a Steam library's steamapps/common. */
export const AE_DIR_NAME = 'Hammerwatch Anniversary Edition'

/** Write the scenario files into a target folder, creating subfolders. */
export async function writeCampaign(targetDir: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const fullPath = join(targetDir, file.path)
    await mkdir(dirname(fullPath), { recursive: true })
    // the generator is pure and hands back strings only, so a binary file
    // (the scenario logo) arrives base64 and is decoded here
    await writeFile(
      fullPath,
      file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content,
      file.encoding === 'base64' ? undefined : 'utf-8'
    )
  }
}

/**
 * Whether `dir` looks like a Hammerwatch Anniversary Edition install. Only
 * the game itself is needed: the app packs scenarios on its own, so
 * PACKAGER.exe (which needs a running Steam) is not.
 */
export function isAeInstall(dir: string, exists: (p: string) => boolean = existsSync): boolean {
  return dir !== '' && exists(join(dir, 'HW1A.exe'))
}

/**
 * Steam library roots to look in: the usual install spots on every drive, plus
 * every library Steam's own `libraryfolders.vdf` lists.
 */
export function steamLibraryCandidates(
  platform: NodeJS.Platform = process.platform,
  read: (p: string) => string | null = safeRead
): string[] {
  const roots: string[] = []
  if (platform === 'win32') {
    for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      for (const sub of ['Program Files (x86)/Steam', 'Program Files/Steam', 'SteamLibrary', 'Steam', 'Games/Steam', 'Games/SteamLibrary']) {
        roots.push(`${drive}:/${sub}`)
      }
    }
  } else {
    const home = homedir()
    roots.push(
      join(home, '.steam/steam'),
      join(home, '.local/share/Steam'),
      join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
      join(home, 'snap/steam/common/.local/share/Steam'),
      join(home, 'Library/Application Support/Steam')
    )
  }
  // libraries Steam itself knows about, from each candidate's vdf
  for (const root of [...roots]) {
    const vdf = read(join(root, 'steamapps', 'libraryfolders.vdf'))
    if (vdf === null) continue
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '/'))
  }
  return [...new Set(roots)]
}

/** The AE install folder, or null when none of the usual places has one. */
export function findAeInstall(
  exists: (p: string) => boolean = existsSync,
  libraries: string[] = steamLibraryCandidates()
): string | null {
  for (const lib of libraries) {
    const dir = join(lib, 'steamapps', 'common', AE_DIR_NAME)
    if (isAeInstall(dir, exists)) return dir
  }
  return null
}

/** Whether `file` starts with the packed-scenario magic. */
export function hasH1cMagic(file: string): boolean {
  try {
    const fd = openSync(file, 'r')
    const head = Buffer.alloc(4)
    readSync(fd, head, 0, 4, 0)
    closeSync(fd)
    return head.toString('latin1') === H1C_MAGIC
  } catch {
    return false
  }
}

/** Where the power shop script sits, scenario-relative and in the game's assets. */
export const POWER_SHOP_SCRIPT = POWER_SHOP_PATH

/** The stock guard around the extra-life offer — true unless BOTH life modifiers are on. */
const LIFE_GUARD = /^%if !MOD_INFINITE_LIVES \| !MOD_NO_LIVES[ \t]*\r?\n([^\r\n]*power_life[^\r\n]*\r?\n)%endif/m

/**
 * AE's power shop offers "buy an extra life" unless BOTH MOD_INFINITE_LIVES and
 * MOD_NO_LIVES are on (`!A | !B`), so a forced NO_LIVES scenario still sells a
 * life — and PartyRecord.GiveLife is a no-op under NO_LIVES, so the party pays
 * 350 gold for nothing. The fix is that one guard, as two nested %ifs (the
 * preprocessor's nesting is what stock PartyRecord.as uses; its `&` is
 * unproven).
 *
 * Returns the patched script, or null when the guard is not the one we know.
 * The game's own code is never stored in this repo: the patch is applied to
 * the user's own copy at install.
 */
export function patchedPowerShop(stock: string): string | null {
  if (!LIFE_GUARD.test(stock)) return null
  return stock.replace(LIFE_GUARD, (_m, line: string) => `%if !MOD_INFINITE_LIVES\n%if !MOD_NO_LIVES\n${line}%endif\n%endif`)
}

const NO_STOCK = 'no res/assets.bin (or unpacked_assets_* folder) in the AE install to read'

/**
 * The power shop override for this install, or null with the reason. The
 * Players tab's potion prices (`edits`) go in first, by the stock line
 * numbers, before the life guard grows the file by two lines.
 */
function powerShopOverride(read: ((path: string) => string | null) | null, edits: readonly LineEdit[]): { content: string; missed: number } | { reason: string } {
  if (read === null) return { reason: NO_STOCK }
  const stock = read(POWER_SHOP_SCRIPT)
  if (stock === null) return { reason: `no ${POWER_SHOP_SCRIPT} in the game's assets` }
  const priced = applyLineEdits(stock, edits)
  const patched = patchedPowerShop(priced.text)
  return patched === null
    ? { reason: 'the power shop script changed in this AE version; not patched' }
    : { content: patched, missed: priced.missed.length }
}

/**
 * The stock files a scenario ships patched, read from this install's own
 * assets (`stockSource`): the power shop (always) and the Players tab's
 * overrides. `notes` says what could not be patched; the scenario still works
 * without it, just with stock values there.
 */
export function assetOverrideFiles(
  aePath: string,
  overrides: readonly PlayerFileOverride[]
): { files: GeneratedFile[]; notes: string[] } {
  const files: GeneratedFile[] = []
  const notes: string[] = []
  const read = stockSource(aePath)?.read ?? null
  const potionPrices = overrides.find((o) => o.path === POWER_SHOP_SCRIPT)?.edits ?? []
  const powerShop = powerShopOverride(read, potionPrices)
  if ('content' in powerShop) {
    files.push({ path: POWER_SHOP_SCRIPT, content: powerShop.content })
    if (powerShop.missed > 0) notes.push(`${powerShop.missed} potion price(s) did not match this AE version and were skipped`)
  } else {
    notes.push(`the power shop still offers an extra life (${powerShop.reason})`)
    if (potionPrices.length > 0) notes.push('the potion prices were not applied')
  }

  const rest = overrides.filter((o) => o.path !== POWER_SHOP_SCRIPT)
  if (rest.length === 0) return { files, notes }
  if (read === null) {
    notes.push(`the player settings were not applied: ${NO_STOCK}`)
    return { files, notes }
  }
  for (const o of rest) {
    const stock = read(o.source)
    if (stock === null) {
      notes.push(`the player settings for ${o.path} were not applied: no ${o.source} in the game's assets`)
      continue
    }
    const { text, missed } = applyLineEdits(stock, o.edits)
    if (missed.length > 0) notes.push(`${missed.length} player setting(s) in ${o.path} did not match this AE version and were skipped`)
    files.push({ path: o.path, content: text })
  }
  return { files, notes }
}

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

/** Packs a scenario's files into `.h1c` bytes; `writeH1c` unless a test swaps it. */
export type PackWriter = (scenarioId: string, files: PackFile[]) => Uint8Array

/**
 * Install a generated scenario into Hammerwatch Anniversary Edition, on any
 * OS and with or without Steam running:
 *
 *   1. patch the stock files the scenario ships (`assetOverrideFiles`);
 *   2. pack everything into `<AE>/scenarios/<id>.h1c` with the app's own
 *      writer (`h1c/write.ts`). PACKAGER.exe is not used: it needs a running
 *      Steam client it can reach, which wine, Proton and sandboxes don't give
 *      it (docs/discovery/linux-packager-steam.md);
 *   3. with `keepSource`, also write the folder to `<AE>/editor/generated/<id>/`
 *      for hand edits (never into `scenarios/`, where the game would list the
 *      scenario twice);
 *   4. with a `description`, write it beside the .h1c as
 *      `scenarios/<id>_description.txt`, outside the packed scenario.
 *
 * If the writer refuses the scenario, it is installed unpacked: the game loads
 * a folder in `scenarios/` as it is, so the folder is the install.
 */
export async function installScenario(
  aePath: string,
  scenarioId: string,
  files: GeneratedFile[],
  keepSource: boolean,
  overrides: readonly PlayerFileOverride[] = [],
  description?: string,
  pack: PackWriter = writeH1c
): Promise<ActionResult> {
  if (!aePath) return { ok: false, message: 'Set your Hammerwatch Anniversary Edition folder first.' }
  if (!existsSync(aePath)) return { ok: false, message: `Hammerwatch Anniversary Edition folder not found: ${aePath}` }

  const scenariosDir = join(aePath, 'scenarios')
  const sourceDir = join(scenariosDir, scenarioId)
  const packed = join(scenariosDir, `${scenarioId}.h1c`)
  await mkdir(scenariosDir, { recursive: true })
  await rm(sourceDir, { recursive: true, force: true })
  await rm(packed, { force: true })
  // a description from an earlier install of this id would describe another run
  const describedAt = join(scenariosDir, descriptionFileName(scenarioId))
  await rm(describedAt, { force: true })

  // patched stock files: no "buy an extra life" in a 0-lives run (see
  // patchedPowerShop), and the Players tab's class and skill values. A patched
  // copy replaces a generated file at the same path.
  const patched = assetOverrideFiles(aePath, overrides)
  const byPath = new Map<string, GeneratedFile>()
  for (const f of [...files, ...patched.files]) byPath.set(f.path, f)
  const all = [...byPath.values()]
  const notes = patched.notes.length > 0 ? ` Note: ${patched.notes.join('; ')}.` : ''

  let bytes: Uint8Array
  try {
    bytes = pack(scenarioId, toPackFiles(all))
  } catch (e) {
    await writeCampaign(sourceDir, all)
    return installUnpacked(sourceDir, describedAt, scenarioId, description, `it could not be packed: ${(e as Error).message}`, notes)
  }
  // a whole file or none: the game never sees half a pack
  const partial = `${packed}.tmp`
  await writeFile(partial, bytes)
  await rename(partial, packed)

  if (keepSource) {
    const kept = join(aePath, 'editor', 'generated', scenarioId)
    await rm(kept, { recursive: true, force: true })
    await writeCampaign(kept, all)
  }

  if (description !== undefined) await writeFile(describedAt, description, 'utf-8')

  return {
    ok: true,
    message:
      `Installed ${scenarioId}.h1c${description !== undefined ? ` and ${descriptionFileName(scenarioId)}` : ''}` +
      ' — start it from the scenario list in Hammerwatch Anniversary Edition.' +
      notes,
    outputPath: packed
  }
}

/**
 * Finish an install without a .h1c: the scenario folder already written to
 * `scenarios/<id>/` stays there, and the game loads it as it is. `keepSource`
 * does not apply, since the folder is the install.
 */
async function installUnpacked(
  sourceDir: string,
  describedAt: string,
  scenarioId: string,
  description: string | undefined,
  reason: string,
  notes: string
): Promise<ActionResult> {
  if (description !== undefined) await writeFile(describedAt, description, 'utf-8')
  return {
    ok: true,
    message:
      `Installed ${scenarioId} unpacked as scenarios/${scenarioId}/ (${reason}).` +
      ' The game loads unpacked scenarios: start it from the scenario list in Hammerwatch Anniversary Edition.' +
      notes,
    outputPath: sourceDir
  }
}
