import type { LlmProviderId } from './types'

export interface LlmProviderDef {
  id: LlmProviderId
  /** the wire format: OpenAI chat-completions, or Anthropic's Messages API through its SDK */
  api: 'openai' | 'anthropic'
  label: string
  /** shown under the radio button */
  blurb: string
  /** `custom` takes its base URL from the settings instead */
  baseUrl: string
  /** appended to the base URL; Pollinations' keyless endpoint is not `/chat/completions` */
  chatPath: string
  /** null when the provider has no OpenAI-style model list */
  modelsPath: string | null
  needsKey: boolean
  /** true when a key is accepted but not required (the custom provider) */
  optionalKey?: boolean
  defaultModel: string
  /** where to get a free key, opened in the system browser */
  signupUrl?: string
  /** minimum gap between requests; 0 = none */
  minIntervalMs: number
  /** a one-line notice shown on the setup screen */
  privacyNote: string
  /** extra top-level fields merged into every chat request body */
  extraBody?: Record<string, unknown>
}

/**
 * Pollinations: verified 2026-10-01 with GET requests only (no prompt data sent).
 * `GET https://text.pollinations.ai/models` lists one entry, `openai-fast`
 * (GPT-OSS 20B), `"tier":"anonymous"`, aliases `openai`/`gpt-oss`. `POST
 * https://text.pollinations.ai/openai` is the keyless OpenAI-compatible
 * endpoint. The newer `gen.pollinations.ai/v1` needs a bearer key per APIDOCS.md,
 * so it is not used here. Anonymous limit per the docs: 1 request / 15 s; a
 * busy anonymous quota answers HTTP 402 with an empty `{}` body.
 *
 * The default models below for the other providers are suggestions, not
 * verified against live catalogues; the setup screen's model list overrides them.
 */
export const LLM_PROVIDERS: readonly LlmProviderDef[] = [
  {
    id: 'pollinations',
    api: 'openai',
    label: 'Pollinations (no key)',
    blurb: 'Free, no account. Quality varies; the free model is small.',
    baseUrl: 'https://text.pollinations.ai',
    chatPath: '/openai',
    modelsPath: null,
    needsKey: false,
    defaultModel: 'openai',
    minIntervalMs: 15000,
    privacyNote: 'Your prompts and your current settings are sent to pollinations.ai. Limit: 1 message / 15 s.',
    // The anonymous tier caps a reply at 1500 tokens, and gpt-oss spends them
    // all on hidden reasoning at its default effort with our ~9k-token prompt:
    // finish_reason "length", no content. "low" finished 3 of 3 (2026-10-01).
    extraBody: { reasoning_effort: 'low' }
  },
  {
    id: 'ollama',
    api: 'openai',
    label: 'Ollama (local)',
    blurb: 'Runs on your own machine. Nothing leaves it.',
    baseUrl: 'http://localhost:11434/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    needsKey: false,
    defaultModel: 'llama3.1',
    minIntervalMs: 0,
    privacyNote: 'Sent only to Ollama on this computer (localhost:11434).'
  },
  {
    id: 'groq',
    api: 'openai',
    label: 'Groq (free key)',
    blurb: 'Fast hosted open models on a free tier.',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    needsKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    signupUrl: 'https://console.groq.com/keys',
    minIntervalMs: 0,
    privacyNote: 'Your prompts and your current settings are sent to groq.com.'
  },
  {
    id: 'openrouter',
    api: 'openai',
    label: 'OpenRouter (free key)',
    blurb: 'Many models; pick one ending in ":free".',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    needsKey: true,
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    signupUrl: 'https://openrouter.ai/keys',
    minIntervalMs: 0,
    privacyNote: 'Your prompts and your current settings are sent to openrouter.ai and the model host behind it.'
  },
  {
    id: 'gemini',
    api: 'openai',
    label: 'Google Gemini (free key)',
    blurb: 'Free tier through Google AI Studio.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    needsKey: true,
    defaultModel: 'gemini-2.5-flash',
    signupUrl: 'https://aistudio.google.com/apikey',
    minIntervalMs: 0,
    privacyNote: 'Your prompts and your current settings are sent to Google. Free-tier prompts may be used to improve Google products.'
  },
  {
    id: 'claude',
    api: 'anthropic',
    label: 'Claude (your own key)',
    blurb: 'Anthropic\'s models. Best results, but paid: no free tier, billed to your API account.',
    baseUrl: 'https://api.anthropic.com',
    chatPath: '/v1/messages',
    modelsPath: '/v1/models',
    needsKey: true,
    defaultModel: 'claude-opus-5-5',
    signupUrl: 'https://platform.claude.com/settings/keys',
    minIntervalMs: 0,
    privacyNote: 'Your prompts and your current settings are sent to Anthropic, and each message is billed to your API key.'
  },
  {
    id: 'custom',
    api: 'openai',
    label: 'Custom (OpenAI-compatible)',
    blurb: 'LM Studio, OpenAI, Mistral, or any /chat/completions server.',
    baseUrl: '',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    needsKey: false,
    optionalKey: true,
    defaultModel: '',
    minIntervalMs: 0,
    privacyNote: 'Sent to the base URL you enter below.'
  }
]

export const DEFAULT_LLM_PROVIDER: LlmProviderId = 'pollinations'

export function providerById(id: LlmProviderId): LlmProviderDef {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0]
}

export function isProviderId(value: unknown): value is LlmProviderId {
  return LLM_PROVIDERS.some((p) => p.id === value)
}

/** The model to send: the user's pick, or the provider's default. */
export function effectiveModel(provider: LlmProviderDef, chosen: string | undefined): string {
  const trimmed = (chosen ?? '').trim()
  return trimmed !== '' ? trimmed : provider.defaultModel
}

/** `base` with no trailing slash joined to `path`. */
export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}
