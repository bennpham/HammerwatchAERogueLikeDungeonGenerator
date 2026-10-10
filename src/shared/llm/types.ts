/** Shared by the renderer, preload and main. No electron, no DOM. */

export type LlmProviderId = 'pollinations' | 'ollama' | 'groq' | 'openrouter' | 'gemini' | 'claude' | 'custom'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Everything about the assistant that is safe to persist and to show the renderer. */
export interface LlmSettings {
  provider: LlmProviderId
  /** the model chosen per provider; blank falls back to the provider's default */
  models: Partial<Record<LlmProviderId, string>>
  /** only read for the `custom` provider */
  customBaseUrl: string
  /** hides the header icon; re-enabled from the output panel */
  hideIcon: boolean
  /** the user has finished the setup screen once, so the dialog opens on the chat */
  configured: boolean
}

/** How a stored key is protected, from Electron's safeStorage. */
export type KeyStorage = 'encrypted' | 'weak' | 'unavailable'

/** What the renderer gets: the settings plus WHETHER a key exists — never the key. */
export interface LlmConfig extends LlmSettings {
  hasKey: Partial<Record<LlmProviderId, boolean>>
  keyStorage: KeyStorage
}

export interface LlmChatRequest {
  provider: LlmProviderId
  model: string
  messages: ChatMessage[]
}

export type LlmChatResult =
  | { ok: true; text: string }
  | { ok: false; message: string; cancelled?: boolean; retryAfterMs?: number }

export type LlmModelsResult = { ok: true; models: string[] } | { ok: false; message: string }

export interface LlmKeyResult {
  ok: boolean
  message: string
  config: LlmConfig
}
