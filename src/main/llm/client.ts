import { effectiveModel, joinUrl, providerById } from '../../shared/llm/providers'
import type { LlmProviderDef } from '../../shared/llm/providers'
import type { ChatMessage, LlmChatResult, LlmModelsResult } from '../../shared/llm/types'
import { claudeChat, claudeModels } from './anthropic'
import { SseChatAccumulator } from '../../shared/llm/stream'

/**
 * Plain `fetch` against any OpenAI chat-completions compatible endpoint. Claude
 * is the exception and goes through its own SDK in `./anthropic`.
 */

// Replies stream, so a slow answer that is still arriving is not mistaken for a hang:
// a thinking model gets FIRST_BYTE before anything must arrive, then each gap
// between chunks gets IDLE, and TOTAL caps the whole request. Cancel stays available.
export const FIRST_BYTE_TIMEOUT_MS = 180_000
export const IDLE_TIMEOUT_MS = 60_000
export const TOTAL_TIMEOUT_MS = 600_000
const MODELS_TIMEOUT_MS = 15_000

/** The one in-flight chat request; `llm:cancel` aborts it. */
let active: AbortController | null = null

export function cancelChat(): void {
  active?.abort()
}

export interface Endpoint {
  provider: LlmProviderDef
  /** base URL with no path; the custom provider's comes from settings */
  baseUrl: string
  key?: string
}

/** A usable http(s) base URL, or an explanation of why not. */
export function checkBaseUrl(baseUrl: string): string | null {
  if (baseUrl.trim() === '') return 'Enter a base URL first (for example http://localhost:1234/v1).'
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'The base URL must start with http:// or https://.'
  } catch {
    return 'That base URL is not a valid URL.'
  }
  return null
}

function isLocal(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

/** The short human-readable part of an error body: `error.message` if JSON, else a clipped excerpt. */
function bodyExcerpt(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown }
    const inner = typeof json.error === 'string' ? json.error : json.error?.message
    if (typeof inner === 'string' && inner !== '') return inner.slice(0, 200)
    if (typeof json.message === 'string') return json.message.slice(0, 200)
  } catch {
    // not JSON
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Maps an HTTP failure to something a dungeon master can act on. Exported for tests. */
export function describeHttpError(
  providerLabel: string,
  status: number,
  retryAfterHeader: string | null,
  body: string
): { message: string; retryAfterMs?: number } {
  if (status === 401 || status === 403) {
    return { message: `${providerLabel} rejected the API key (HTTP ${status}). Check it in the assistant's settings.` }
  }
  if (status === 402) {
    return {
      message: `${providerLabel} turned the request down (HTTP 402); its free quota is busy or used up. Wait a minute, or switch to a free-key provider such as Groq or Gemini.`
    }
  }
  if (status === 429) {
    const seconds = retryAfterHeader !== null ? Number(retryAfterHeader) : NaN
    if (Number.isFinite(seconds) && seconds > 0) {
      return {
        message: `${providerLabel} is rate-limiting you. Try again in ${Math.ceil(seconds)} s.`,
        retryAfterMs: Math.ceil(seconds) * 1000
      }
    }
    return { message: `${providerLabel} is rate-limiting you. Wait a little and try again.` }
  }
  const excerpt = bodyExcerpt(body)
  return { message: `${providerLabel} returned HTTP ${status}${excerpt !== '' ? `: ${excerpt}` : ''}` }
}

/** Describes a thrown fetch failure, including a refused local connection. */
function describeNetworkError(error: unknown, endpoint: Endpoint): string {
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause
  if (cause?.code === 'ECONNREFUSED' && (endpoint.provider.id === 'ollama' || isLocal(endpoint.baseUrl))) {
    return endpoint.provider.id === 'ollama'
      ? 'Could not connect to Ollama at localhost:11434. Is Ollama running?'
      : `Could not connect to ${endpoint.baseUrl}. Is the server running?`
  }
  const detail = cause?.code ?? (error as Error).message
  return `Could not reach ${endpoint.provider.label}: ${detail}`
}

function headers(key: string | undefined, json: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (key !== undefined && key !== '') h['Authorization'] = `Bearer ${key}`
  return h
}

export async function chatCompletion(
  endpoint: Endpoint,
  model: string,
  messages: ChatMessage[],
  onProgress?: (chars: number) => void
): Promise<LlmChatResult> {
  const { provider } = endpoint
  if (provider.needsKey && (endpoint.key === undefined || endpoint.key === '')) {
    return { ok: false, message: `${provider.label} needs an API key. Add one in the assistant's settings.` }
  }
  const chosen = effectiveModel(provider, model)
  if (chosen === '') return { ok: false, message: 'Choose a model in the assistant\'s settings first.' }

  const controller = new AbortController()
  active = controller
  if (provider.api === 'anthropic') {
    // the SDK owns its own timeout; the controller is only for Cancel
    try {
      return await claudeChat(endpoint.key ?? '', chosen, messages, controller.signal)
    } finally {
      if (active === controller) active = null
    }
  }

  // which limit fired, worded to follow the provider's name
  let timedOut: string | null = null
  let gapTimer: ReturnType<typeof setTimeout> | undefined
  const armGap = (ms: number, why: string): void => {
    clearTimeout(gapTimer)
    gapTimer = setTimeout(() => {
      timedOut = why
      controller.abort()
    }, ms)
  }
  armGap(FIRST_BYTE_TIMEOUT_MS, `did not start answering within ${FIRST_BYTE_TIMEOUT_MS / 1000} s`)
  const totalTimer = setTimeout(() => {
    timedOut = `did not finish within ${TOTAL_TIMEOUT_MS / 60_000} minutes`
    controller.abort()
  }, TOTAL_TIMEOUT_MS)
  try {
    const response = await fetch(joinUrl(endpoint.baseUrl, provider.chatPath), {
      method: 'POST',
      headers: headers(endpoint.key, true),
      body: JSON.stringify({ ...provider.extraBody, model: chosen, messages, stream: true }),
      signal: controller.signal
    })
    if (!response.ok) {
      const raw = await response.text()
      return { ok: false, ...describeHttpError(provider.label, response.status, response.headers.get('retry-after'), raw) }
    }

    let text: unknown
    let finishReason: unknown
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream') && response.body !== null) {
      const stream = new SseChatAccumulator()
      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        stream.push(decoder.decode(value, { stream: true }))
        // a role-only opening chunk can precede minutes of thinking, so the
        // first-byte limit holds until real text or reasoning arrives
        if (stream.text.length + stream.reasoningChars > 0) {
          armGap(IDLE_TIMEOUT_MS, `stopped sending for ${IDLE_TIMEOUT_MS / 1000} s`)
        }
        onProgress?.(stream.text.length)
        if (stream.done) break
      }
      stream.push(decoder.decode())
      stream.end()
      if (stream.error !== null && stream.text.trim() === '') {
        return { ok: false, message: `${provider.label} reported an error: ${stream.error}` }
      }
      text = stream.text
      finishReason = stream.finishReason
    } else {
      // the provider ignored `stream: true` and sent one JSON body
      const raw = await response.text()
      try {
        const choice = (JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> })
          .choices?.[0]
        text = choice?.message?.content
        finishReason = choice?.finish_reason
      } catch {
        return { ok: false, message: `${provider.label} sent a reply that is not valid JSON: ${bodyExcerpt(raw)}` }
      }
    }
    if ((typeof text !== 'string' || text.trim() === '') && finishReason === 'length') {
      return {
        ok: false,
        message: `${provider.label} ran out of reply length before it wrote an answer (reasoning models can spend it all thinking). Try again, a shorter request, or another model.`
      }
    }
    if (typeof text !== 'string' || text.trim() === '') {
      return { ok: false, message: `${provider.label} returned an empty reply. Try again, or pick another model.` }
    }
    return { ok: true, text }
  } catch (error) {
    if (timedOut !== null) return { ok: false, message: timeoutMessage(provider.label, timedOut, messages) }
    if (controller.signal.aborted) return { ok: false, message: 'Cancelled.', cancelled: true }
    return { ok: false, message: describeNetworkError(error, endpoint) }
  } finally {
    clearTimeout(gapTimer)
    clearTimeout(totalTimer)
    if (active === controller) active = null
  }
}

/** Says how big the request was, since a large campaign in the prompt is the usual reason. Exported for tests. */
export function timeoutMessage(providerLabel: string, why: string, messages: readonly ChatMessage[]): string {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0)
  return `${providerLabel} ${why}. The request was ${chars.toLocaleString('en-US')} characters, and a big campaign makes a model slower. Try again, switch to a faster provider such as Groq, or start a New chat.`
}

/** `GET {base}/models`. Providers without a list return a message and the UI falls back to a text field. */
export async function listModels(endpoint: Endpoint): Promise<LlmModelsResult> {
  const { provider } = endpoint
  if (provider.modelsPath === null) return { ok: false, message: `${provider.label} has no model list; type a model name.` }
  if (provider.api === 'anthropic') {
    if (endpoint.key === undefined || endpoint.key === '') return { ok: false, message: `Save your ${provider.label} key first.` }
    return claudeModels(endpoint.key)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS)
  try {
    const response = await fetch(joinUrl(endpoint.baseUrl, provider.modelsPath), {
      headers: headers(endpoint.key, false),
      signal: controller.signal
    })
    const raw = await response.text()
    if (!response.ok) {
      return { ok: false, message: describeHttpError(provider.label, response.status, response.headers.get('retry-after'), raw).message }
    }
    const data = (JSON.parse(raw) as { data?: Array<{ id?: unknown }> }).data
    const models = (data ?? [])
      .map((m) => (typeof m.id === 'string' ? m.id.replace(/^models\//, '') : ''))
      .filter((id) => id !== '')
      .sort()
    if (models.length === 0) return { ok: false, message: `${provider.label} returned no models; type a model name.` }
    return { ok: true, models }
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, message: `${provider.label} did not answer the model-list request in time.` }
    return { ok: false, message: describeNetworkError(error, endpoint) }
  } finally {
    clearTimeout(timer)
  }
}

export function endpointFor(providerId: Parameters<typeof providerById>[0], customBaseUrl: string, key: string | undefined): Endpoint {
  const provider = providerById(providerId)
  return { provider, baseUrl: provider.id === 'custom' ? customBaseUrl : provider.baseUrl, key }
}
