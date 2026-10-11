import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../shared/ipc'
import { findAeInstall } from './packer'

const DEFAULT_SETTINGS: AppSettings = {
  hammerwatchPath: '',
  cleanupFiles: true
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  let settings: AppSettings = { ...DEFAULT_SETTINGS }
  try {
    if (existsSync(settingsPath())) {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(settingsPath(), 'utf-8')) }
    }
  } catch {
    // corrupt settings fall back to defaults
  }
  // no folder chosen yet: look for the AE install in the usual Steam places
  if (settings.hammerwatchPath === '') settings.hammerwatchPath = findAeInstall() ?? ''
  return settings
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

/**
 * Optional default-override file: a parameters.txt placed in the app's
 * userData folder (or next to the packaged executable) seeds the startup
 * parameters, mirroring how the original tool read its config.
 */
export function findParametersOverride(): string | null {
  const candidates = [join(app.getPath('userData'), 'parameters.txt'), join(process.cwd(), 'parameters.txt')]
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf-8')
      } catch {
        return null
      }
    }
  }
  return null
}
