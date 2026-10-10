import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_PRESETS,
  defaultParameters,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters
} from '../src/generator'
import { buildRepairMessage, buildSystemPrompt } from '../src/shared/llm/prompt'
import { LLM_PROVIDERS, isProviderId, providerById } from '../src/shared/llm/providers'
import { diffParams, expandShorthands, extractParametersBlock, fillPerFloorLists } from '../src/shared/llm/reply'
import { describeHttpError } from '../src/main/llm/client'

const CLAUDE = CAMPAIGN_PRESETS.filter((p) => p.group === 'claude')

describe('extractParametersBlock', () => {
  it('reads a ```parameters fence and ignores the prose around it', () => {
    const reply = 'Sure, here you go.\n```parameters\nlevels=4\nmapWidth=100\n```\nEnjoy!'
    expect(extractParametersBlock(reply)).toBe('levels=4\nmapWidth=100')
  })

  it('accepts an untagged fence and a ```txt fence', () => {
    expect(extractParametersBlock('```\nlevels=3\n```')).toBe('levels=3')
    expect(extractParametersBlock('```txt\nlevels=3\n```')).toBe('levels=3')
  })

  it('falls back to bare key=value lines when there is no fence', () => {
    expect(extractParametersBlock('Here:\nlevels=5\nmapWidth=120\nThat is all.')).toBe('levels=5\nmapWidth=120')
  })

  it('joins several parameters blocks in order, and prefers them over other fences', () => {
    const reply = '```parameters\nlevels=4\n```\ntext\n```parameters\nmapWidth=100\n```\n```\nshopChance=0.5\n```'
    expect(extractParametersBlock(reply)).toBe('levels=4\nmapWidth=100')
  })

  it('returns null for a prose-only reply', () => {
    expect(extractParametersBlock('Which theme do you want? Ice, fire or desert?')).toBeNull()
    expect(extractParametersBlock('')).toBeNull()
  })

  it('handles CRLF line endings and an unclosed fence', () => {
    expect(extractParametersBlock('Hi\r\n```parameters\r\nlevels=4\r\nmapWidth=100\r\n```\r\n')).toBe('levels=4\nmapWidth=100')
    expect(extractParametersBlock('```parameters\nlevels=4\nmapWidth=1')).toBe('levels=4\nmapWidth=1')
  })

  it('ignores prose that merely contains an equals sign mid-sentence', () => {
    expect(extractParametersBlock('Set it so that levels = more is nice')).toBeNull()
  })
})

describe('every Claude preset survives the LLM round trip', () => {
  for (const preset of CLAUDE) {
    it(preset.id, () => {
      const params = preset.build()
      const reply = `Here is the campaign.\n\`\`\`parameters\n${serializeParametersTxt(params)}\n\`\`\``
      const block = extractParametersBlock(reply)
      expect(block).not.toBeNull()
      const parsed = parseParametersTxt(block as string, defaultParameters())
      expect(parsed.unknownKeys).toEqual([])
      expect(validateParameters(parsed.params).errors).toEqual([])
      expect(parsed.params).toEqual(params)
    })
  }
})

describe('diffParams', () => {
  it('is empty for identical parameters', () => {
    expect(diffParams(defaultParameters(), defaultParameters())).toEqual([])
  })

  it('reports only the keys that were touched', () => {
    const before = defaultParameters()
    const after = parseParametersTxt('mapWidth=100\nshopChance=0.5', before).params
    const changes = diffParams(before, after)
    expect(changes.map((c) => c.key).sort()).toEqual(['mapWidth', 'shopChance'])
    const width = changes.find((c) => c.key === 'mapWidth')
    expect(width).toEqual({ key: 'mapWidth', before: '80', after: '100' })
  })

  it('reports a key that appears or disappears with a null side', () => {
    const before = defaultParameters()
    const after = { ...before, mapHeight: 80 }
    expect(diffParams(before, after)).toEqual([{ key: 'mapHeight', before: '60', after: '80' }])
  })
})

describe('buildRepairMessage', () => {
  it('lists every error field and every unknown key', () => {
    const message = buildRepairMessage(
      [
        { field: 'themes', message: 'Floor 2 has no theme.' },
        { field: 'mapWidth', message: 'Map width must be at least 20.' }
      ],
      ['levelz', 'boss9Mode']
    )
    for (const needle of ['themes', 'Floor 2 has no theme.', 'mapWidth', 'at least 20', 'levelz', 'boss9Mode']) {
      expect(message).toContain(needle)
    }
  })

  it('omits a section that has nothing in it', () => {
    expect(buildRepairMessage([], ['levelz'])).not.toContain('Validation errors')
    expect(buildRepairMessage([{ field: 'a', message: 'b' }], [])).not.toContain('did not recognise')
  })
})

describe('buildSystemPrompt', () => {
  it('is deterministic', () => {
    expect(buildSystemPrompt(defaultParameters())).toBe(buildSystemPrompt(defaultParameters()))
  })

  it('carries the current settings and the id lists', () => {
    const current = parseParametersTxt('mapWidth=140', defaultParameters()).params
    const prompt = buildSystemPrompt(current)
    expect(prompt).toContain('mapWidth=140')
    expect(prompt).toContain('boss_dragon')
    expect(prompt).toContain('a_mixed')
  })

  it('stays compact enough for a small free model', () => {
    expect(buildSystemPrompt(defaultParameters()).length).toBeLessThan(32000)
  })
})

describe('expandShorthands', () => {
  it('expands floor ranges, keeps suffixes, and pulls out playerFullyUpgraded', () => {
    const { text, fullyUpgraded } = expandShorthands(
      'levels=3\nbossFloor0-2=1|boss_knight|1.0|1\nbossFloor1-2Invuln=off\nplayerFullyUpgraded=1'
    )
    expect(fullyUpgraded).toBe(true)
    expect(text.split('\n')).toEqual([
      'levels=3',
      'bossFloor0=1|boss_knight|1.0|1',
      'bossFloor1=1|boss_knight|1.0|1',
      'bossFloor2=1|boss_knight|1.0|1',
      'bossFloor1Invuln=off',
      'bossFloor2Invuln=off'
    ])
  })

  it('expands lockFloors ranges with their button counts', () => {
    expect(expandShorthands('lockFloors=0-2:2,5').text).toBe('lockFloors=0:2,1:2,2:2,5')
  })

  it('leaves ordinary lines and other keys with dashes alone', () => {
    expect(expandShorthands('themes=a,b\nlockFloors=3,5:2')).toEqual({ text: 'themes=a,b\nlockFloors=3,5:2', fullyUpgraded: false })
  })

  it('a 99-floor boss run written with ranges validates', () => {
    const { text } = expandShorthands(
      'levels=99\nlobbies=0\nboss=0\nlevelOrder=\nthemes=f_frozen\nmonsters0-98=skeleton1,archer1\nbossFloor0-98=1|boss_knight,boss_lich|1.0|1\nlockFloors=0-49:1,50-98:2'
    )
    const { params } = fillPerFloorLists(parseParametersTxt(text, defaultParameters()).params)
    expect(params.levelBoss?.filter((b) => b?.enabled)).toHaveLength(99)
    expect(validateParameters(params).errors).toEqual([])
  })
})

describe('fillPerFloorLists', () => {
  it('turns a short 99-floor, no-lobby answer into a valid campaign', () => {
    const parsed = parseParametersTxt('levels=99\nlobbies=0\nthemes=f_frozen,f_mixed\nmonsters0=bat1\nmonsters1=skeleton1', defaultParameters())
    expect(validateParameters(parsed.params).valid).toBe(false)
    const { params, note } = fillPerFloorLists(parsed.params)
    expect(params.themes).toHaveLength(99)
    expect(params.themes[2]).toBe('f_frozen')
    expect(params.levelMonsters).toHaveLength(99)
    expect(note).toContain('99 floors')
    expect(validateParameters(params).errors).toEqual([])
  })

  it('leaves complete lists alone', () => {
    const params = defaultParameters()
    expect(fillPerFloorLists(params)).toEqual({ params, note: null })
  })
})

describe('LLM_PROVIDERS', () => {
  it('offers Claude as a bring-your-own-key provider on the Anthropic API', () => {
    expect(isProviderId('claude')).toBe(true)
    const claude = providerById('claude')
    expect(claude.api).toBe('anthropic')
    expect(claude.needsKey).toBe(true)
    expect(claude.defaultModel).toBe('claude-opus-5-5')
  })

  it('keeps every other provider on the keyless-or-free OpenAI-compatible path', () => {
    expect(LLM_PROVIDERS.filter((p) => p.api === 'anthropic').map((p) => p.id)).toEqual(['claude'])
    expect(new Set(LLM_PROVIDERS.map((p) => p.id)).size).toBe(LLM_PROVIDERS.length)
  })
})

describe('describeHttpError', () => {
  it('maps the common statuses to actionable text', () => {
    expect(describeHttpError('Groq', 401, null, '').message).toContain('API key')
    expect(describeHttpError('Pollinations', 402, null, '{}').message).toContain('free quota')
    const limited = describeHttpError('Groq', 429, '12', '')
    expect(limited.message).toContain('12 s')
    expect(limited.retryAfterMs).toBe(12000)
    expect(describeHttpError('Groq', 500, null, '{"error":{"message":"boom"}}').message).toContain('boom')
  })
})
