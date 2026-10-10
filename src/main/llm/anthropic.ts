import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, LlmChatResult, LlmModelsResult } from '../../shared/llm/types'

/**
 * Claude through the official SDK — the one provider that is not OpenAI
 * chat-completions shaped. Bring-your-own key only: the Claude API has no free
 * tier, so every request is billed to the user's own Anthropic account.
 */

/** Adaptive thinking on a ~9k-token prompt can outlast the 60 s the other providers get. */
export const CLAUDE_TIMEOUT_MS = 180_000
/** A full 99-floor answer is a few thousand tokens; this leaves room for thinking too. */
const MAX_TOKENS = 16000

/**
 * Models that take server-side refusal fallbacks (`fallbacks: "default"`, beta
 * `server-side-fallback-2026-07-01`). Sending it to any other model is a 400,
 * so a model the user picked from the list but not named here goes without.
 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'])

/** Haiku 4.5 and older reject `output_config.effort`. */
function takesEffort(model: string): boolean {
  return !/^claude-(haiku|3|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0)/.test(model)
}

export async function claudeChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<LlmChatResult> {
  const client = new Anthropic({ apiKey: key, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 })
  // the shared prompt builder puts the system prompt in the message list; Claude takes it top-level
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  try {
    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: turns,
        // the system prompt is the bulk of every request and repeats across a chat
        cache_control: { type: 'ephemeral' },
        ...(takesEffort(model) ? { output_config: { effort: 'medium' as const } } : {}),
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      },
      { signal }
    )

    if (response.stop_reason === 'refusal') {
      return { ok: false, message: 'Claude declined this request. Try rephrasing it.' }
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
    if (text.trim() === '') {
      return response.stop_reason === 'max_tokens'
        ? { ok: false, message: 'Claude ran out of reply length before it wrote an answer. Try a shorter request.' }
        : { ok: false, message: 'Claude returned an empty reply. Try again.' }
    }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, ...describeClaudeError(error) }
  }
}

export async function claudeModels(key: string): Promise<LlmModelsResult> {
  const client = new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 0 })
  try {
    const models: string[] = []
    for await (const model of client.models.list()) models.push(model.id)
    if (models.length === 0) return { ok: false, message: 'Claude returned no models; type a model name.' }
    return { ok: true, models: models.sort() }
  } catch (error) {
    return { ok: false, message: describeClaudeError(error).message }
  }
}

/** Typed SDK errors, most specific first. */
function describeClaudeError(error: unknown): { message: string; cancelled?: boolean; retryAfterMs?: number } {
  if (error instanceof Anthropic.APIUserAbortError) return { message: 'Cancelled.', cancelled: true }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { message: `Claude did not answer within ${CLAUDE_TIMEOUT_MS / 1000} s.` }
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { message: `Claude rejected the API key (HTTP ${error.status}). Check it in the assistant's settings.` }
  }
  if (error instanceof Anthropic.RateLimitError) {
    const seconds = Number(error.headers?.get('retry-after'))
    return Number.isFinite(seconds) && seconds > 0
      ? { message: `Claude is rate-limiting you. Try again in ${Math.ceil(seconds)} s.`, retryAfterMs: Math.ceil(seconds) * 1000 }
      : { message: 'Claude is rate-limiting you. Wait a little and try again.' }
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { message: 'Claude does not know that model name. Pick one with "Refresh models".' }
  }
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    return { message: `Claude returned HTTP ${error.status}: ${error.message.slice(0, 200)}` }
  }
  if (error instanceof Anthropic.APIConnectionError) return { message: `Could not reach Claude: ${error.message}` }
  return { message: `Claude request failed: ${(error as Error).message}` }
}
