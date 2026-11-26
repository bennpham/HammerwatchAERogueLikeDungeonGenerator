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
  /** Hammerwatch Anniversary Edition install folder (contains HW1A.exe, res/assets.bin and scenarios/) */
  hammerwatchPath: string
  /** delete the scenario's source folder after packing; off keeps it in <AE>/editor/generated/ */
  cleanupFiles: boolean
  /** also write a plain-text dungeon_<seed>_description.txt beside the .h1c (or the export) */
  writeDescription: boolean
  /**
   * Hammerwatch 2 install folder for "Load custom" (experimental); empty when
   * none is loaded. Loaded, HW2 themes, monsters and music become available
   * and the install copies the HW2 files a scenario uses into it.
   */
  hw2Path: string
}

/** What the Load custom dialog knows about a Hammerwatch 2 folder. */
export interface Hw2Status {
  path: string
  /** usable: HW2 content is offered and installs can copy from it */
  ok: boolean
  message: string
  /** `res/assets.bin` when the pack was read, else null */
  assets: string | null
  /** the `unpacked_assets_*` extract used beside it, if any */
  unpacked: string | null
  /** `res/assets/sound/music.bank` is there, so HW2 music can be ported */
  music: boolean
}

/** The AE folders the install panel can open: the packed scenarios, and the kept sources' levels. */
export type AeFolder = 'scenarios' | 'generated'

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
  /** custom content sources: the Hammerwatch 2 folder's status, null when none is set */
  custom: { hw2: Hw2Status | null }
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
  /** stop the generation running now; its generate call resolves as cancelled */
  cancelGenerate(): Promise<void>
  installToHammerwatch(): Promise<ActionResult>
  exportFolder(): Promise<ActionResult>
  exportZip(): Promise<ActionResult>
  /** open `<AE>/scenarios` or `<AE>/editor/generated` in the file manager */
  openAeFolder(which: AeFolder): Promise<ActionResult>
  pickHammerwatchPath(): Promise<string | null>
  saveSettings(settings: AppSettings): Promise<void>
  /** Load custom: pick a Hammerwatch 2 folder; saved and returned with its status, null when cancelled */
  pickHw2Path(): Promise<Hw2Status | null>
  /** Load custom: set (or, with '', unload) the Hammerwatch 2 folder; returns its status, null when unloaded */
  setHw2Path(path: string): Promise<Hw2Status | null>
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
  /** Answer characters received so far, while `llmChat` streams; returns an unsubscribe. */
  onLlmProgress(callback: (chars: number) => void): () => void
}
