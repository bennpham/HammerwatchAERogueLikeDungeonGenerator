import { describe, expect, it } from 'vitest'
import {
  arenaMode,
  bossFights,
  campaignCounts,
  defaultDungeonBoss,
  defaultParameters,
  describeScenario,
  descriptionFileName,
  generateDungeon
} from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { campaignOrder, slotLabeller } from '../src/generator/campaign'
import { plainParameters } from './params'

function generate(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

function describeRun(params: DungeonParameters, seed: number): { text: string; result: DungeonResult } {
  const result = generate(params, seed)
  return { text: describeScenario({ ...result, params }), result }
}

/** The `[label]` of every block header, in order. */
function blockLabels(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('['))
    .map((l) => l.slice(1, l.indexOf(']')))
}

describe('describeScenario', () => {
  it('names the scenario and seed, with one block per level in play order, lobbies included', () => {
    const params = defaultParameters()
    const { text, result } = describeRun(params, 12345)
    expect(text).toContain(`campaign: ${result.campaignName}`)
    expect(text).toContain('In game: Dungeon #12345')
    expect(text).toContain('Seed: 12345')
    expect(text).toContain('Lives: none')

    const order = campaignOrder(campaignCounts(params), params.levelOrder)
    const label = slotLabeller(bossFights(params.boss).map(arenaMode))
    expect(blockLabels(text)).toEqual(order.map(label))
    expect(text).toContain(`Play order: ${order.map(label).join(' > ')}`)
    // every preview has its block
    for (const level of result.levels) expect(blockLabels(text)).toContain(level.label)

    expect(text).toContain('Floor 1:')
    expect(text).toContain('Boss arena 1:')
    expect(text).toContain('Lobby 1:')
    expect(text.match(/victory orb/g)).toHaveLength(1)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('says what each floor holds: a timer, a floor boss and its button lock', () => {
    const params = plainParameters()
    params.levelTimers = Array.from({ length: params.levels }, () => ({ enabled: false, seconds: 180, damage: 1, freqMs: 1000, countdown: true }))
    params.levelTimers[0] = { enabled: true, seconds: 90, damage: 1, freqMs: 100, countdown: true }
    params.levelBoss = Array.from({ length: params.levels }, () => ({ ...defaultDungeonBoss(), enabled: false }))
    params.levelBoss[1] = { ...defaultDungeonBoss(), enabled: true }
    const { text } = describeRun(params, 4242)
    const floor = (n: number): string => {
      const lines = text.split('\n')
      const start = lines.findIndex((l) => l.startsWith(`[${n}] `))
      const end = lines.findIndex((l, i) => i > start && l.startsWith('['))
      return lines.slice(start, end === -1 ? undefined : end).join('\n')
    }
    expect(floor(1)).toContain('a 1:30 timer, then 1 damage every 100 ms')
    expect(floor(2)).toMatch(/floor boss/)
    expect(floor(3)).not.toMatch(/timer|floor boss/)
  })

  it('is deterministic and never changes the generated files', () => {
    const params = defaultParameters()
    const first = describeRun(params, 777)
    const second = describeRun(params, 777)
    expect(first.text).toBe(second.text)
    expect(first.result.files.some((f) => f.path.endsWith('_description.txt'))).toBe(false)
  })

  it('names the file after the scenario', () => {
    expect(descriptionFileName('dungeon_42')).toBe('dungeon_42_description.txt')
  })
})
