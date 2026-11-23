import { execFile } from 'child_process'
import { existsSync, openSync, readSync, closeSync, readFileSync, readdirSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { descriptionFileName } from '../generator/describe'
import type { GeneratedFile } from '../generator'
import { POWER_SHOP_PATH, applyLineEdits } from '../generator/players'
import type { LineEdit, PlayerFileOverride } from '../generator/players'
import type { ActionResult } from '../shared/ipc'
import { findSystemWine } from './wine'
import type { WineCommand } from './wine'

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

/** Where the power shop script sits, scenario-relative and in the unpacked assets. */
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

/**
 * The power shop override for this install, or null with the reason. The
 * Players tab's potion prices (`edits`) go in first, by the stock line
 * numbers, before the life guard grows the file by two lines.
 */
function powerShopOverride(aePath: string, edits: readonly LineEdit[]): { content: string; missed: number } | { reason: string } {
  const assets = unpackedAssetsDir(aePath)
  if (assets === null) return { reason: 'no unpacked_assets_* folder in the AE install to patch' }
  const stock = safeRead(join(assets, POWER_SHOP_SCRIPT))
  if (stock === null) return { reason: `no ${POWER_SHOP_SCRIPT} in ${assets}` }
  const priced = applyLineEdits(stock, edits)
  const patched = patchedPowerShop(priced.text)
  return patched === null
    ? { reason: 'the power shop script changed in this AE version; not patched' }
    : { content: patched, missed: priced.missed.length }
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
  const potionPrices = overrides.find((o) => o.path === POWER_SHOP_SCRIPT)?.edits ?? []
  const powerShop = powerShopOverride(aePath, potionPrices)
  if ('content' in powerShop) {
    files.push({ path: POWER_SHOP_SCRIPT, content: powerShop.content })
    if (powerShop.missed > 0) notes.push(`${powerShop.missed} potion price(s) did not match this AE version and were skipped`)
  } else {
    notes.push(`the power shop still offers an extra life (${powerShop.reason})`)
    if (potionPrices.length > 0) notes.push('the potion prices were not applied')
  }

  const rest = overrides.filter((o) => o.path !== POWER_SHOP_SCRIPT)
  if (rest.length === 0) return { files, notes }
  const assets = unpackedAssetsDir(aePath)
  if (assets === null) {
    notes.push('the player settings were not applied: no unpacked_assets_* folder in the AE install')
    return { files, notes }
  }
  for (const o of rest) {
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
 *      for hand edits; otherwise it is deleted;
 *   5. with a `description`, write it beside the .h1c as
 *      `scenarios/<id>_description.txt`, outside the packed scenario.
 *
 * Off Windows, PACKAGER runs through wine (system wine, or Steam's Proton
 * wine; see `findWine`). With no wine, or when packing fails there, the
 * scenario is installed unpacked: the game loads a folder in `scenarios/` as
 * it is, so the folder stays and is the install.
 */
export async function installScenario(
  aePath: string,
  scenarioId: string,
  files: GeneratedFile[],
  keepSource: boolean,
  overrides: readonly PlayerFileOverride[] = [],
  description?: string,
  env: InstallEnv = defaultInstallEnv()
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
  // a description from an earlier install of this id would describe another run
  const describedAt = join(scenariosDir, descriptionFileName(scenarioId))
  await rm(describedAt, { force: true })
  await writeCampaign(sourceDir, files)
  // patched stock files: no "buy an extra life" in a 0-lives run (see
  // patchedPowerShop), and the Players tab's class and skill values
  const patched = assetOverrideFiles(aePath, overrides)
  await writeCampaign(sourceDir, patched.files)

  const notes = patched.notes.length > 0 ? ` Note: ${patched.notes.join('; ')}.` : ''
  const isWindows = env.platform === 'win32'
  const wine = isWindows ? null : env.wine()
  if (!isWindows && wine === null) {
    return installUnpacked(sourceDir, packed, describedAt, scenarioId, description, 'no wine or Steam Proton was found to pack it', notes)
  }
  const command = wine === null ? packager : wine.command
  const args = wine === null ? ['-l', scenarioId] : [...wine.args, packager, '-l', scenarioId]
  // PACKAGER exits non-zero (127) even after writing a good .h1c [VERIFIED
  // 2026-10-10], and logs an error for the optional resources.xml no stock
  // scenario has either. So the produced file, not the exit code, is the test.
  // The first run of a fresh Proton prefix sets the prefix up, hence the long timeout.
  const run = await new Promise<{ spawned: boolean; output: string }>((resolve) => {
    const options = { cwd: aePath, timeout: 300_000, env: wine === null ? process.env : { ...process.env, ...wine.env } }
    execFile(command, args, options, (error, stdout, stderr) => {
      const notFound = error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
      resolve({ spawned: !notFound, output: `${stdout}${stderr}`.trim() })
    })
  })

  const failure = !run.spawned
    ? `could not run ${wine === null ? 'PACKAGER.exe' : wine.command}`
    : !existsSync(packed)
      ? `PACKAGER ran but ${scenarioId}.h1c was not produced`
      : !hasH1cMagic(packed)
        ? `${packed} is not a packed scenario (no ${H1C_MAGIC} header)`
        : null
  if (failure !== null) {
    const tail = run.output.split(/\r?\n/).filter((l) => /\[(ERR|WRN)\]/.test(l)).slice(-5).join('\n')
    if (wine !== null) {
      return installUnpacked(sourceDir, packed, describedAt, scenarioId, description, `packing with ${wine.label} failed: ${failure}`, notes, tail)
    }
    return { ok: false, message: `${capitalise(failure)}. The scenario folder is at ${sourceDir}.${tail ? `\n${tail}` : ''}` }
  }

  if (keepSource) {
    const kept = join(aePath, 'editor', 'generated', scenarioId)
    await rm(kept, { recursive: true, force: true })
    await mkdir(dirname(kept), { recursive: true })
    await rename(sourceDir, kept)
  } else {
    await rm(sourceDir, { recursive: true, force: true })
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

/** Where to install from: the platform, and how to find a wine off Windows. */
export interface InstallEnv {
  platform: NodeJS.Platform
  wine: () => WineCommand | null
}

/** This machine. `userData` holds the private Proton prefix. */
export function defaultInstallEnv(userData: string = join(homedir(), '.hwae-generator')): InstallEnv {
  return { platform: process.platform, wine: () => findSystemWine(userData, steamLibraryCandidates()) }
}

/**
 * Finish an install without a .h1c: the scenario folder already written to
 * `scenarios/<id>/` stays there, and the game loads it as it is. `keepSource`
 * does not apply, since the folder is the install; a partial .h1c goes, or
 * the game would list the scenario twice.
 */
async function installUnpacked(
  sourceDir: string,
  packed: string,
  describedAt: string,
  scenarioId: string,
  description: string | undefined,
  reason: string,
  notes: string,
  tail = ''
): Promise<ActionResult> {
  await rm(packed, { force: true })
  if (description !== undefined) await writeFile(describedAt, description, 'utf-8')
  return {
    ok: true,
    message:
      `Installed ${scenarioId} unpacked as scenarios/${scenarioId}/ (${reason}).` +
      ' The game loads unpacked scenarios: start it from the scenario list in Hammerwatch Anniversary Edition.' +
      notes +
      (tail ? `\n${tail}` : ''),
    outputPath: sourceDir
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
