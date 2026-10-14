/**
 * Reads an OpenAI-style `stream: true` chat reply: server-sent events whose
 * `data:` lines each carry a JSON chunk with `choices[0].delta.content`, ending
 * in `data: [DONE]`. Pure and chunk-boundary safe — a network read can split a
 * line anywhere, so incomplete lines wait in `buffer` for the next push.
 */
export class SseChatAccumulator {
  private buffer = ''
  /** the answer so far */
  text = ''
  /** characters of visible reasoning some providers stream before the answer */
  reasoningChars = 0
  finishReason: string | null = null
  /** an `error` object a provider sent mid-stream */
  error: string | null = null
  /** `[DONE]` arrived */
  done = false

  push(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      this.line(this.buffer.slice(0, newline))
      this.buffer = this.buffer.slice(newline + 1)
      newline = this.buffer.indexOf('\n')
    }
  }

  /** Flushes a last line the stream did not terminate. */
  end(): void {
    if (this.buffer !== '') this.line(this.buffer)
    this.buffer = ''
  }

  private line(raw: string): void {
    const line = raw.replace(/\r$/, '')
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (data === '[DONE]') {
      this.done = true
      return
    }
    let json: {
      error?: { message?: unknown } | string
      choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; finish_reason?: unknown }>
    }
    try {
      json = JSON.parse(data)
    } catch {
      // a keep-alive or a provider's comment line; nothing to read
      return
    }
    if (json.error !== undefined) {
      const message = typeof json.error === 'string' ? json.error : json.error.message
      this.error = typeof message === 'string' && message !== '' ? message : 'unknown error'
    }
    const choice = json.choices?.[0]
    const delta = choice?.delta
    if (typeof delta?.content === 'string') this.text += delta.content
    const reasoning = delta?.reasoning_content ?? delta?.reasoning
    if (typeof reasoning === 'string') this.reasoningChars += reasoning.length
    if (typeof choice?.finish_reason === 'string') this.finishReason = choice.finish_reason
  }
}
