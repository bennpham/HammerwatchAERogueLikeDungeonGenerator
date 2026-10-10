import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import JSZip from 'jszip'
import {
  defaultParameters,
  generateDungeon,
  parseParametersTxt,
  parsePlayerSettingsTxt,
  serializeParametersTxt,
  serializePlayerSettingsTxt,
  DungeonParameters,
  DungeonResult,
  PlayerTweaks
} from '../generator'
import { findParametersOverride, loadSettings, saveSettings } from './settings'
import { installCampaign, writeCampaign } from './packer'
import type {
  ActionResult,
  AppSettings,
  ImportParamsResult,
  ImportPlayerSettingsResult,
  InitialState
} from '../shared/ipc'
import { isProviderId } from '../shared/llm/providers'
import type { ChatMessage, LlmChatRequest, LlmChatResult, LlmKeyResult, LlmModelsResult, LlmProviderId, LlmSettings } from '../shared/llm/types'
import { cancelChat, chatCompletion, checkBaseUrl, endpointFor, listModels } from './llm/client'
import * as llmStore from './llm/store'

/** The last successful generation, kept in main so exports don't re-send MBs over IPC. */
let lastResult: DungeonResult | null = null

function requireResult(): DungeonResult | ActionResult {
  if (lastResult === null) {
    return { ok: false, message: 'Generate a dungeon first.' }
  }
  return lastResult
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:init', (): InitialState => {
    const settings = loadSettings()
    const override = findParametersOverride()
    if (override !== null) {
      const parsed = parseParametersTxt(override)
      if (parsed.path !== undefined && settings.hammerwatchPath === '') {
        settings.hammerwatchPath = parsed.path
      }
      if (parsed.cleanupFiles !== undefined) {
        settings.cleanupFiles = parsed.cleanupFiles
      }
      return {
        params: parsed.params,
        settings,
        paramsSource: 'parameters.txt override',
        unknownKeys: parsed.unknownKeys
      }
    }
    return { params: defaultParameters(), settings, paramsSource: 'defaults', unknownKeys: [] }
  })

  ipcMain.handle('dungeon:generate', (_event, params: DungeonParameters, seed?: number) => {
    const result = generateDungeon(params, seed)
    if (result.ok) {
      lastResult = result
      // strip the file contents from the renderer payload
      return { ok: true, seed: result.seed, campaignName: result.campaignName, levels: result.levels }
    }
    return result
  })

  ipcMain.handle('dungeon:install', async (): Promise<ActionResult> => {
    const result = requireResult()
    if (!('files' in result)) return result
    const settings = loadSettings()
    return installCampaign(settings.hammerwatchPath, result.campaignName, result.files, settings.cleanupFiles)
  })

  ipcMain.handle('dungeon:export-folder', async (): Promise<ActionResult> => {
    const result = requireResult()
    if (!('files' in result)) return result

    const window = getWindow()
    if (!window) return { ok: false, message: 'No window.' }
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose where to export the campaign folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, message: 'Export cancelled.' }
    }

    const targetDir = join(picked.filePaths[0], result.campaignName)
    await writeCampaign(targetDir, result.files)
    return {
      ok: true,
      message: `Exported campaign folder. Copy it into Hammerwatch's editor folder and run LevelPacker on it.`,
      outputPath: targetDir
    }
  })

  ipcMain.handle('dungeon:export-zip', async (): Promise<ActionResult> => {
    const result = requireResult()
    if (!('files' in result)) return result

    const window = getWindow()
    if (!window) return { ok: false, message: 'No window.' }
    const picked = await dialog.showSaveDialog(window, {
      title: 'Save campaign zip',
      defaultPath: `${result.campaignName}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }]
    })
    if (picked.canceled || !picked.filePath) {
      return { ok: false, message: 'Export cancelled.' }
    }

    const zip = new JSZip()
    for (const file of result.files) {
      zip.file(`${result.campaignName}/${file.path}`, file.content, {
        base64: file.encoding === 'base64'
      })
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await writeFile(picked.filePath, buffer)
    return { ok: true, message: 'Exported campaign zip.', outputPath: picked.filePath }
  })

  ipcMain.handle('settings:pick-path', async (): Promise<string | null> => {
    const window = getWindow()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, {
      title: 'Select your Hammerwatch install folder',
      properties: ['openDirectory']
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    return picked.filePaths[0]
  })

  ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
    saveSettings(settings)
  })

  ipcMain.handle('params:import', async (): Promise<ImportParamsResult | null> => {
    const window = getWindow()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, {
      title: 'Import parameters.txt',
      filters: [{ name: 'Parameters', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) return null

    try {
      const content = await readFile(picked.filePaths[0], 'utf-8')
      const parsed = parseParametersTxt(content)
      return {
        ok: true,
        message: `Imported ${picked.filePaths[0]}`,
        params: parsed.params,
        hammerwatchPath: parsed.path,
        cleanupFiles: parsed.cleanupFiles,
        unknownKeys: parsed.unknownKeys
      }
    } catch (error) {
      return { ok: false, message: `Could not read file: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('params:export', async (_event, params: DungeonParameters): Promise<ActionResult> => {
    const window = getWindow()
    if (!window) return { ok: false, message: 'No window.' }
    const picked = await dialog.showSaveDialog(window, {
      title: 'Export parameters.txt',
      defaultPath: 'parameters.txt',
      filters: [{ name: 'Parameters', extensions: ['txt'] }]
    })
    if (picked.canceled || !picked.filePath) {
      return { ok: false, message: 'Export cancelled.' }
    }

    const settings = loadSettings()
    const content = serializeParametersTxt(params, settings.hammerwatchPath || undefined, settings.cleanupFiles)
    await writeFile(picked.filePath, content, 'utf-8')
    return { ok: true, message: 'Exported parameters.txt.', outputPath: picked.filePath }
  })

  // playersettings.txt — the Player tab on its own. The payload is the sparse
  // tweak record, so it stays small however large the campaign is.
  ipcMain.handle('playerSettings:import', async (): Promise<ImportPlayerSettingsResult | null> => {
    const window = getWindow()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, {
      title: 'Import playersettings.txt',
      filters: [{ name: 'Player settings', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) return null

    try {
      const content = await readFile(picked.filePaths[0], 'utf-8')
      const parsed = parsePlayerSettingsTxt(content)
      return {
        ok: true,
        message: `Imported player settings from ${picked.filePaths[0]}`,
        tweaks: parsed.tweaks,
        unknownKeys: parsed.unknownKeys,
        ignoredKeys: parsed.ignoredKeys
      }
    } catch (error) {
      return { ok: false, message: `Could not read file: ${(error as Error).message}` }
    }
  })

  ipcMain.handle('playerSettings:export', async (_event, tweaks: PlayerTweaks): Promise<ActionResult> => {
    const window = getWindow()
    if (!window) return { ok: false, message: 'No window.' }
    const picked = await dialog.showSaveDialog(window, {
      title: 'Export playersettings.txt',
      defaultPath: 'playersettings.txt',
      filters: [{ name: 'Player settings', extensions: ['txt'] }]
    })
    if (picked.canceled || !picked.filePath) {
      return { ok: false, message: 'Export cancelled.' }
    }

    await writeFile(picked.filePath, serializePlayerSettingsTxt(tweaks), 'utf-8')
    return { ok: true, message: 'Exported playersettings.txt.', outputPath: picked.filePath }
  })

  // AI preset assistant. Handlers return messages, never throw across IPC, and
  // no key value ever leaves main.
  ipcMain.handle('llm:get-config', () => llmStore.loadConfig())

  ipcMain.handle('llm:save-config', (_event, settings: LlmSettings) => llmStore.saveSettings(settings))

  ipcMain.handle('llm:set-key', (_event, provider: LlmProviderId, key: string): LlmKeyResult => {
    if (!isProviderId(provider) || typeof key !== 'string') {
      return { ok: false, message: 'Unknown provider.', config: llmStore.loadConfig() }
    }
    const outcome = llmStore.setKey(provider, key)
    return { ...outcome, config: llmStore.loadConfig() }
  })

  ipcMain.handle('llm:list-models', async (_event, provider: LlmProviderId): Promise<LlmModelsResult> => {
    if (!isProviderId(provider)) return { ok: false, message: 'Unknown provider.' }
    const endpoint = endpointFor(provider, llmStore.loadSettings().customBaseUrl, llmStore.getKey(provider))
    if (provider === 'custom') {
      const problem = checkBaseUrl(endpoint.baseUrl)
      if (problem !== null) return { ok: false, message: problem }
    }
    return listModels(endpoint)
  })

  ipcMain.handle('llm:chat', async (_event, request: LlmChatRequest): Promise<LlmChatResult> => {
    if (!isProviderId(request?.provider) || !Array.isArray(request.messages)) {
      return { ok: false, message: 'Malformed chat request.' }
    }
    const messages: ChatMessage[] = request.messages.filter(
      (m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    const endpoint = endpointFor(request.provider, llmStore.loadSettings().customBaseUrl, llmStore.getKey(request.provider))
    if (request.provider === 'custom') {
      const problem = checkBaseUrl(endpoint.baseUrl)
      if (problem !== null) return { ok: false, message: problem }
    }
    return chatCompletion(endpoint, String(request.model ?? ''), messages)
  })

  ipcMain.handle('llm:cancel', () => {
    cancelChat()
  })
}
