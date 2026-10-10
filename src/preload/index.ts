import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, RendererApi } from '../shared/ipc'
import type { DungeonParameters, PlayerTweaks } from '../generator'
import type { LlmChatRequest, LlmProviderId, LlmSettings } from '../shared/llm/types'

const api: RendererApi = {
  getInitialState: () => ipcRenderer.invoke('app:init'),
  generate: (params: DungeonParameters, seed?: number) => ipcRenderer.invoke('dungeon:generate', params, seed),
  installToHammerwatch: () => ipcRenderer.invoke('dungeon:install'),
  exportFolder: () => ipcRenderer.invoke('dungeon:export-folder'),
  exportZip: () => ipcRenderer.invoke('dungeon:export-zip'),
  pickHammerwatchPath: () => ipcRenderer.invoke('settings:pick-path'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  importParametersTxt: () => ipcRenderer.invoke('params:import'),
  exportParametersTxt: (params: DungeonParameters) => ipcRenderer.invoke('params:export', params),
  importPlayerSettingsTxt: () => ipcRenderer.invoke('playerSettings:import'),
  exportPlayerSettingsTxt: (tweaks: PlayerTweaks) => ipcRenderer.invoke('playerSettings:export', tweaks),
  llmGetConfig: () => ipcRenderer.invoke('llm:get-config'),
  llmSaveConfig: (settings: LlmSettings) => ipcRenderer.invoke('llm:save-config', settings),
  llmSetKey: (provider: LlmProviderId, key: string) => ipcRenderer.invoke('llm:set-key', provider, key),
  llmListModels: (provider: LlmProviderId) => ipcRenderer.invoke('llm:list-models', provider),
  llmChat: (request: LlmChatRequest) => ipcRenderer.invoke('llm:chat', request),
  llmCancel: () => ipcRenderer.invoke('llm:cancel')
}

contextBridge.exposeInMainWorld('api', api)
