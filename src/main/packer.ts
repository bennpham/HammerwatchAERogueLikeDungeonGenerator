import { execFile } from 'child_process'
import { existsSync, openSync, readSync, closeSync, readFileSync, readdirSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { GeneratedFile } from '../generator'
import { applyLineEdits } from '../generator/players'
import type { PlayerFileOverride } from '../generator/players'
import type { ActionResult } from '../shared/ipc'

/** The game's folder name under a Steam library's steamapps/common. */
export const AE_DIR_NAME = 'Hammerwatch Anniversary Edition'

/** The first four bytes of every packed AE scenario. */
export const H1C_MAGIC = 'HW1S'

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

/** Whether `dir` looks like a Hammerwatch Anniversary Edition install. */
export function isAeInstall(dir: string, exists: (p: string) => boolean = existsSync): boolean {
  return dir !== '' && exists(join(dir, 'HW1A.exe')) && exists(join(dir, 'PACKAGER.exe'))
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
    roots.push(join(home, '.steam/steam'), join(home, '.local/share/Steam'), join(home, 'Library/Application Support/Steam'))
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

/** Where the power shop script sits, scenario-relative and in the unpacked assets. */
export const POWER_SHOP_SCRIPT = 'scripts/GUI/Shop/PowerShopMenuContent.as'

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
 * Returns the patched script, or null when the install has no unpacked copy to
 * patch or the guard is not the one we know. The game's own code is never
 * stored in this repo: the patch is applied to the user's own copy at install.
 */
export function patchedPowerShop(stock: string): string | null {
  if (!LIFE_GUARD.test(stock)) return null
  return stock.replace(LIFE_GUARD, (_m, line: string) => `%if !MOD_INFINITE_LIVES\n%if !MOD_NO_LIVES\n${line}%endif\n%endif`)
}

/** The newest unpacked assets folder in an AE install, or null. */
export function unpackedAssetsDir(aePath: string, list: (dir: string) => string[] = safeList): string | null {
  const dirs = list(aePath)
    .filter((d) => /^unpacked_assets_\d+$/.test(d))
    .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()))
  return dirs.length > 0 ? join(aePath, dirs[0]) : null
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** The power shop override for this install, or null with the reason. */
function powerShopOverride(aePath: string): { content: string } | { reason: string } {
  const assets = unpackedAssetsDir(aePath)
  if (assets === null) return { reason: 'no unpacked_assets_* folder in the AE install to patch' }
  const stock = safeRead(join(assets, POWER_SHOP_SCRIPT))
  if (stock === null) return { reason: `no ${POWER_SHOP_SCRIPT} in ${assets}` }
  const patched = patchedPowerShop(stock)
  return patched === null ? { reason: 'the power shop script changed in this AE version; not patched' } : { content: patched }
}

/**
 * The stock files a scenario ships patched, read from this install's unpacked
 * assets: the power shop (always) and the Players tab's overrides. `notes`
 * says what could not be patched; the scenario still works without it, just
 * with stock values there.
 */
export function assetOverrideFiles(
  aePath: string,
  overrides: readonly PlayerFileOverride[]
): { files: GeneratedFile[]; notes: string[] } {
  const files: GeneratedFile[] = []
  const notes: string[] = []
  const powerShop = powerShopOverride(aePath)
  if ('content' in powerShop) files.push({ path: POWER_SHOP_SCRIPT, content: powerShop.content })
  else notes.push(`the power shop still offers an extra life (${powerShop.reason})`)

  if (overrides.length === 0) return { files, notes }
  const assets = unpackedAssetsDir(aePath)
  if (assets === null) {
    notes.push('the player settings were not applied: no unpacked_assets_* folder in the AE install')
    return { files, notes }
  }
  for (const o of overrides) {
    const stock = safeRead(join(assets, o.source))
    if (stock === null) {
      notes.push(`the player settings for ${o.path} were not applied: no ${o.source} in ${assets}`)
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

/**
 * Install a generated scenario into Hammerwatch Anniversary Edition:
 *
 *   1. write it to `<AE>/scenarios/<id>/` (info.xml, logos.png, levels/<id>/*.lvl);
 *   2. run `PACKAGER.exe -l <id>` from the AE folder, which packs it into
 *      `<AE>/scenarios/<id>.h1c`;
 *   3. check the .h1c starts with `HW1S`;
 *   4. take the source folder out of `scenarios/` — left there, the game lists
 *      the scenario twice. With `keepSource` it moves to `<AE>/editor/generated/<id>/`
 *      for hand edits; otherwise it is deleted.
 */
export async function installScenario(
  aePath: string,
  scenarioId: string,
  files: GeneratedFile[],
  keepSource: boolean,
  overrides: readonly PlayerFileOverride[] = []
): Promise<ActionResult> {
  if (!aePath) return { ok: false, message: 'Set your Hammerwatch Anniversary Edition folder first.' }
  if (!existsSync(aePath)) return { ok: false, message: `Hammerwatch Anniversary Edition folder not found: ${aePath}` }

  const packager = join(aePath, 'PACKAGER.exe')
  if (!existsSync(packager)) {
    return {
      ok: false,
      message: `PACKAGER.exe not found at ${packager}. Check this is the Anniversary Edition folder, or use "Export folder" and pack it yourself.`
    }
  }

  const scenariosDir = join(aePath, 'scenarios')
  const sourceDir = join(scenariosDir, scenarioId)
  const packed = join(scenariosDir, `${scenarioId}.h1c`)
  await rm(sourceDir, { recursive: true, force: true })
  await rm(packed, { force: true })
  await writeCampaign(sourceDir, files)
  // patched stock files: no "buy an extra life" in a 0-lives run (see
  // patchedPowerShop), and the Players tab's class and skill values
  const patched = assetOverrideFiles(aePath, overrides)
  await writeCampaign(sourceDir, patched.files)

  const isWindows = process.platform === 'win32'
  const command = isWindows ? packager : 'wine'
  const args = isWindows ? ['-l', scenarioId] : [packager, '-l', scenarioId]
  // PACKAGER exits non-zero (127) even after writing a good .h1c [VERIFIED
  // 2026-10-10], and logs an error for the optional resources.xml no stock
  // scenario has either. So the produced file, not the exit code, is the test.
  const run = await new Promise<{ spawned: boolean; output: string }>((resolve) => {
    execFile(command, args, { cwd: aePath, timeout: 180_000 }, (error, stdout, stderr) => {
      const notFound = error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
      resolve({ spawned: !notFound, output: `${stdout}${stderr}`.trim() })
    })
  })
  if (!run.spawned) {
    const hint = isWindows ? '' : ' PACKAGER.exe is a Windows tool — install wine, or export the folder and pack on Windows.'
    return { ok: false, message: `Could not run PACKAGER.exe.${hint} The unpacked scenario was left at ${sourceDir}.` }
  }

  if (!existsSync(packed)) {
    const tail = run.output.split(/\r?\n/).filter((l) => /\[(ERR|WRN)\]/.test(l)).slice(-5).join('\n')
    return {
      ok: false,
      message: `PACKAGER ran but ${scenarioId}.h1c was not produced. The scenario folder is at ${sourceDir}.${tail ? `\n${tail}` : ''}`
    }
  }
  if (!hasH1cMagic(packed)) {
    return { ok: false, message: `${packed} is not a packed scenario (no ${H1C_MAGIC} header). The scenario folder is at ${sourceDir}.` }
  }

  if (keepSource) {
    const kept = join(aePath, 'editor', 'generated', scenarioId)
    await rm(kept, { recursive: true, force: true })
    await mkdir(dirname(kept), { recursive: true })
    await rename(sourceDir, kept)
  } else {
    await rm(sourceDir, { recursive: true, force: true })
  }

  return {
    ok: true,
    message:
      `Installed ${scenarioId}.h1c — start it from the scenario list in Hammerwatch Anniversary Edition.` +
      (patched.notes.length > 0 ? ` Note: ${patched.notes.join('; ')}.` : ''),
    outputPath: packed
  }
}
