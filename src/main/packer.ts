import { execFile } from 'child_process'
import { existsSync, openSync, readSync, closeSync, readFileSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { GeneratedFile } from '../generator'
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
  keepSource: boolean
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
    message: `Installed ${scenarioId}.h1c — start it from the scenario list in Hammerwatch Anniversary Edition.`,
    outputPath: packed
  }
}
