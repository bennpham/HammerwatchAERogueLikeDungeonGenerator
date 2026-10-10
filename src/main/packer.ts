import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { GeneratedFile } from '../generator'
import type { ActionResult } from '../shared/ipc'

/** Write the campaign files into a target folder, creating subfolders. */
export async function writeCampaign(targetDir: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const fullPath = join(targetDir, file.path)
    await mkdir(dirname(fullPath), { recursive: true })
    // the generator is pure and hands back strings only, so a binary asset
    // (the lobby ships its own art) arrives base64 and is decoded here
    await writeFile(
      fullPath,
      file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content,
      file.encoding === 'base64' ? undefined : 'utf-8'
    )
  }
}

/**
 * The original pipeline: write the campaign into <hw>/editor/<name>/, run
 * <hw>/editor/LevelPacker.exe on it, then move the produced .hwm into
 * <hw>/levels/. LevelPacker is a Windows tool shipped with the game.
 */
export async function installCampaign(
  hammerwatchPath: string,
  campaignName: string,
  files: GeneratedFile[],
  cleanupFiles: boolean
): Promise<ActionResult> {
  if (!hammerwatchPath) {
    return { ok: false, message: 'Set your Hammerwatch install folder first.' }
  }
  if (!existsSync(hammerwatchPath)) {
    return { ok: false, message: `Hammerwatch folder not found: ${hammerwatchPath}` }
  }

  const packerPath = join(hammerwatchPath, 'editor', 'LevelPacker.exe')
  if (!existsSync(packerPath)) {
    return {
      ok: false,
      message:
        `LevelPacker.exe not found at ${packerPath}. ` +
        'Check that this is a Hammerwatch install with the editor tools, or use "Export folder" and pack manually.'
    }
  }

  const editorDir = join(hammerwatchPath, 'editor')
  const campaignDir = join(editorDir, campaignName)
  await writeCampaign(campaignDir, files)

  // LevelPacker is a Windows executable; on Linux/Mac try wine as a courtesy
  const isWindows = process.platform === 'win32'
  const command = isWindows ? packerPath : 'wine'
  // The folder MUST be passed as a bare name with cwd = <hw>/editor. LevelPacker
  // stores whatever path it is handed as the resource key for every file it does
  // not compile, so an absolute path produces entries like
  // "Z:/home/.../editor/<name>/levels.xml". The game then can't find "levels.xml",
  // falls back to assets/levels.xml, and dies in LevelList..ctor with a
  // NullReferenceException the moment you press Start.
  const args = isWindows ? [campaignName] : [packerPath, campaignName]

  const packResult = await new Promise<{ ok: boolean; message: string }>((resolve) => {
    execFile(command, args, { cwd: editorDir, timeout: 120_000 }, (error) => {
      if (error) {
        const hint = isWindows
          ? ''
          : ' (LevelPacker.exe is a Windows tool — install wine, or use "Export folder" and pack on Windows)'
        resolve({ ok: false, message: `LevelPacker failed: ${error.message}${hint}` })
      } else {
        resolve({ ok: true, message: 'packed' })
      }
    })
  })

  if (!packResult.ok) {
    return { ok: false, message: `${packResult.message}. The unpacked campaign was left at ${campaignDir}.` }
  }

  const producedHwm = join(hammerwatchPath, 'editor', `${campaignName}.hwm`)
  const targetHwm = join(hammerwatchPath, 'levels', `${campaignName}.hwm`)
  if (!existsSync(producedHwm)) {
    return {
      ok: false,
      message: `LevelPacker ran but ${campaignName}.hwm was not produced. The campaign folder is at ${campaignDir}.`
    }
  }
  await mkdir(dirname(targetHwm), { recursive: true })
  await rename(producedHwm, targetHwm)

  if (cleanupFiles) {
    await rm(campaignDir, { recursive: true, force: true })
  }

  return {
    ok: true,
    message: `Installed ${campaignName}.hwm — pick it from the level list in Hammerwatch.`,
    outputPath: targetHwm
  }
}
