import { describe, expect, it } from 'vitest'
import { SseChatAccumulator } from '../src/shared/llm/stream'
import { providerById } from '../src/shared/llm/providers'
import { timeoutMessage } from '../src/main/llm/client'

const chunk = (content: string, finish: string | null = null): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`

describe('SseChatAccumulator', () => {
  it('joins deltas and stops at [DONE]', () => {
    const s = new SseChatAccumulator()
    s.push(chunk('Hello '))
    s.push(chunk('world', 'stop'))
    s.push('data: [DONE]\n\n')
    expect(s.text).toBe('Hello world')
    expect(s.finishReason).toBe('stop')
    expect(s.done).toBe(true)
  })

  it('survives a line split across network reads, and CRLF', () => {
    const whole = chunk('levels=4').replace(/\n/g, '\r\n') + chunk('\nboss=1')
    const s = new SseChatAccumulator()
    for (let i = 0; i < whole.length; i += 7) s.push(whole.slice(i, i + 7))
    s.end()
    expect(s.text).toBe('levels=4\nboss=1')
  })

  it('flushes an unterminated last line on end()', () => {
    const s = new SseChatAccumulator()
    s.push(chunk('a').trimEnd())
    expect(s.text).toBe('')
    s.end()
    expect(s.text).toBe('a')
  })

  it('reports length cut-offs, provider errors, and counts reasoning separately', () => {
    const s = new SseChatAccumulator()
    s.push(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'hmm...' } }] })}\n`)
    s.push(chunk('', 'length'))
    s.push(`data: ${JSON.stringify({ error: { message: 'quota exceeded' } })}\n`)
    expect(s.text).toBe('')
    expect(s.reasoningChars).toBe(6)
    expect(s.finishReason).toBe('length')
    expect(s.error).toBe('quota exceeded')
  })

  it('ignores keep-alives, comments and role-only chunks', () => {
    const s = new SseChatAccumulator()
    s.push(': keep-alive\n\ndata: {not json}\n')
    s.push(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n`)
    expect(s.text).toBe('')
    expect(s.reasoningChars).toBe(0)
    expect(s.error).toBeNull()
  })
})

describe('chat timeouts', () => {
  it('say how big the request was', () => {
    const message = timeoutMessage('Gemini', 'did not start answering within 180 s', [
      { role: 'system', content: 'x'.repeat(60000) },
      { role: 'user', content: 'y'.repeat(1234) }
    ])
    expect(message).toContain('Gemini did not start answering within 180 s.')
    expect(message).toContain('61,234 characters')
  })

  it('Gemini caps its thinking the way Pollinations does', () => {
    expect(providerById('gemini').extraBody).toEqual({ reasoning_effort: 'low' })
  })
})
