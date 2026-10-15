import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_LLM_PROVIDER, LLM_PROVIDERS, isProviderId } from '../../shared/llm/providers'
import type { KeyStorage, LlmConfig, LlmProviderId, LlmSettings } from '../../shared/llm/types'

/**
 * `userData/llm.json`. API keys live here and nowhere else — never in
 * AppSettings, whose whole object is handed to the renderer. Each key is
 * encrypted with Electron's safeStorage and stored as base64.
 */
interface StoredFile {
  settings: LlmSettings
  keys: Partial<Record<LlmProviderId, string>>
}

const DEFAULT_SETTINGS: LlmSettings = {
  provider: DEFAULT_LLM_PROVIDER,
  models: {},
  customBaseUrl: '',
  hideIcon: false,
  configured: false
}

function filePath(): string {
  return join(app.getPath('userData'), 'llm.json')
}

/** Coerces whatever is on disk (or comes over IPC) into a well-formed settings object. */
export function sanitizeSettings(raw: unknown): LlmSettings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const models: LlmSettings['models'] = {}
  if (typeof input.models === 'object' && input.models !== null) {
    for (const provider of LLM_PROVIDERS) {
      const value = (input.models as Record<string, unknown>)[provider.id]
      if (typeof value === 'string') models[provider.id] = value.slice(0, 200)
    }
  }
  return {
    provider: isProviderId(input.provider) ? input.provider : DEFAULT_SETTINGS.provider,
    models,
    customBaseUrl: typeof input.customBaseUrl === 'string' ? input.customBaseUrl.trim().slice(0, 500) : '',
    hideIcon: input.hideIcon === true,
    configured: input.configured === true
  }
}

function read(): StoredFile {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), 'utf-8')) as Record<string, unknown>
      const keys: StoredFile['keys'] = {}
      if (typeof raw.keys === 'object' && raw.keys !== null) {
        for (const provider of LLM_PROVIDERS) {
          const value = (raw.keys as Record<string, unknown>)[provider.id]
          if (typeof value === 'string' && value !== '') keys[provider.id] = value
        }
      }
      return { settings: sanitizeSettings(raw.settings), keys }
    }
  } catch {
    // a corrupt file falls back to defaults, like settings.json
  }
  return { settings: { ...DEFAULT_SETTINGS }, keys: {} }
}

function write(file: StoredFile): void {
  writeFileSync(filePath(), JSON.stringify(file, null, 2), { mode: 0o600 })
}

export function keyStorage(): KeyStorage {
  if (!safeStorage.isEncryptionAvailable()) return 'unavailable'
  // Linux without a keyring: Electron still "encrypts", but with a hard-coded key
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return 'weak'
  return 'encrypted'
}

export function loadSettings(): LlmSettings {
  return read().settings
}

export function loadConfig(): LlmConfig {
  const file = read()
  const hasKey: LlmConfig['hasKey'] = {}
  for (const provider of LLM_PROVIDERS) hasKey[provider.id] = file.keys[provider.id] !== undefined
  return { ...file.settings, hasKey, keyStorage: keyStorage() }
}

export function saveSettings(settings: LlmSettings): LlmConfig {
  const file = read()
  write({ ...file, settings: sanitizeSettings(settings) })
  return loadConfig()
}

/** Decrypts a provider's key for main-process use only. Undefined when none is stored. */
export function getKey(provider: LlmProviderId): string | undefined {
  const stored = read().keys[provider]
  if (stored === undefined) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return undefined
  }
}

/** Stores (or, for an empty string, removes) a key. Refuses when nothing can encrypt it. */
export function setKey(provider: LlmProviderId, key: string): { ok: boolean; message: string } {
  const file = read()
  const trimmed = key.trim()
  if (trimmed === '') {
    delete file.keys[provider]
    write(file)
    return { ok: true, message: 'Key removed.' }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: 'This system has no secure storage for keys, so the key was not saved.' }
  }
  file.keys[provider] = safeStorage.encryptString(trimmed).toString('base64')
  write(file)
  return { ok: true, message: 'Key saved.' }
}
