import type { DungeonError, DungeonParameters, LevelPreview, PlayerTweaks } from '../generator'
import type {
  LlmChatRequest,
  LlmChatResult,
  LlmConfig,
  LlmKeyResult,
  LlmModelsResult,
  LlmProviderId,
  LlmSettings
} from './llm/types'

/** App-level settings persisted in the Electron userData folder. */
export interface AppSettings {
  /** Hammerwatch install folder (contains editor/ and levels/) */
  hammerwatchPath: string
  /** remove the intermediate editor folder after packing, like the original */
  cleanupFiles: boolean
}

/** What the renderer gets back from a generate call (files stay cached in main). */
export interface GenerateResponse {
  ok: true
  seed: number
  campaignName: string
  levels: LevelPreview[]
}

export interface InitialState {
  params: DungeonParameters
  settings: AppSettings
  /** where the startup parameters came from */
  paramsSource: 'defaults' | 'parameters.txt override'
  /** unknown keys found in the override file, if any */
  unknownKeys: string[]
}

export interface ActionResult {
  ok: boolean
  message: string
  /** path of whatever was written, when ok */
  outputPath?: string
}

export interface ImportParamsResult {
  ok: boolean
  message: string
  params?: DungeonParameters
  hammerwatchPath?: string
  cleanupFiles?: boolean
  unknownKeys?: string[]
}

/** An imported playersettings.txt — it replaces the Player tab and nothing else. */
export interface ImportPlayerSettingsResult {
  ok: boolean
  message: string
  tweaks?: PlayerTweaks
  unknownKeys?: string[]
  /** non-player keys the file carried (e.g. a whole parameters.txt), skipped */
  ignoredKeys?: string[]
}

/** The API exposed to the renderer through the preload bridge. */
export interface RendererApi {
  getInitialState(): Promise<InitialState>
  generate(params: DungeonParameters, seed?: number): Promise<GenerateResponse | DungeonError>
  installToHammerwatch(): Promise<ActionResult>
  exportFolder(): Promise<ActionResult>
  exportZip(): Promise<ActionResult>
  pickHammerwatchPath(): Promise<string | null>
  saveSettings(settings: AppSettings): Promise<void>
  importParametersTxt(): Promise<ImportParamsResult | null>
  exportParametersTxt(params: DungeonParameters): Promise<ActionResult>
  importPlayerSettingsTxt(): Promise<ImportPlayerSettingsResult | null>
  exportPlayerSettingsTxt(tweaks: PlayerTweaks): Promise<ActionResult>
  /** AI preset assistant. Opt-in: nothing here touches the network except chat and listModels. */
  llmGetConfig(): Promise<LlmConfig>
  llmSaveConfig(settings: LlmSettings): Promise<LlmConfig>
  /** an empty key removes it; the key itself is never sent back */
  llmSetKey(provider: LlmProviderId, key: string): Promise<LlmKeyResult>
  llmListModels(provider: LlmProviderId): Promise<LlmModelsResult>
  llmChat(request: LlmChatRequest): Promise<LlmChatResult>
  llmCancel(): Promise<void>
}
