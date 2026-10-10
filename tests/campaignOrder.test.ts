import { describe, expect, it } from 'vitest'
import {
  bossArenaId,
  campaignOrder,
  defaultOrder,
  gatewayAfter,
  isDefaultOrder,
  lobbyId,
  normalizeOrder,
  parseSlotLabel,
  slotEntryId,
  slotLabel
} from '../src/generator/campaign'
import type { CampaignCounts, CampaignSlot } from '../src/generator/campaign'

/** `1,2,B1,L1` -> slots, so the cases below read the way the UI and the file do. */
const slots = (spec: string): CampaignSlot[] =>
  spec.split(',').map((token) => {
    const slot = parseSlotLabel(token)
    if (slot === null) throw new Error(`bad slot "${token}"`)
    return slot
  })

/** slots -> `1,2,B1,L1`, for readable expectations (no modes, so arenas read as the bare `B`). */
const spec = (order: CampaignSlot[]): string => order.map((slot) => slotLabel(slot)).join(',')

/** `counts(levels, fights, lobbies)` — `lobbies` defaults to 0, the pre-#48 shape. */
const counts = (levels: number, fights: number, lobbies = 0): CampaignCounts => ({ levels, fights, lobbies })

describe('campaign level ids', () => {
  it('numbers the arena per fight and the room per lobby, out of the floors\' id space', () => {
    expect(bossArenaId(0)).toBe('boss0')
    expect(bossArenaId(3)).toBe('boss3')
    expect(lobbyId(0)).toBe('lobby0')
    expect(lobbyId(3)).toBe('lobby3')

    // a floor id is a bare number, so no boss or lobby id can ever collide with one
    for (let i = 0; i < 20; i++) {
      expect(bossArenaId(i)).not.toMatch(/^\d+$/)
      expect(lobbyId(i)).not.toMatch(/^\d+$/)
    }
  })

  it('enters a floor by its own id, a fight by its arena, and a lobby by its own id', () => {
    expect(slotEntryId({ kind: 'floor', index: 3 })).toBe('3')
    expect(slotEntryId({ kind: 'boss', index: 1 })).toBe('boss1')
    expect(slotEntryId({ kind: 'lobby', index: 2 })).toBe('lobby2')
  })

  it('labels slots 1-based, with a B for fights and an L for lobbies', () => {
    expect(slotLabel({ kind: 'floor', index: 0 })).toBe('1')
    expect(slotLabel({ kind: 'boss', index: 0 })).toBe('B1')
    expect(slotLabel({ kind: 'boss', index: 4 })).toBe('B5')
    expect(slotLabel({ kind: 'lobby', index: 0 })).toBe('L1')
    expect(slotLabel({ kind: 'lobby', index: 4 })).toBe('L5')
  })

  it('round-trips a label through parseSlotLabel', () => {
    for (const slot of defaultOrder(counts(4, 3, 2))) {
      expect(parseSlotLabel(slotLabel(slot))).toEqual(slot)
    }
    expect(parseSlotLabel('b2')).toEqual({ kind: 'boss', index: 1 })
    expect(parseSlotLabel('l2')).toEqual({ kind: 'lobby', index: 1 })
    expect(parseSlotLabel(' 3 ')).toEqual({ kind: 'floor', index: 2 })
  })

  it('rejects a malformed or 0-based token rather than guessing', () => {
    for (const bad of ['', '0', 'B0', 'B', 'L0', 'L', 'x', '2.5', '-1', 'B-1', 'L-1', '1B']) {
      expect(parseSlotLabel(bad), bad).toBeNull()
    }
  })
})

describe('campaignOrder', () => {
  it('defaults to every floor then every fight, with no lobbies', () => {
    expect(spec(campaignOrder(counts(3, 2)))).toBe('1,2,3,B1,B2')
    expect(spec(defaultOrder(counts(3, 2)))).toBe('1,2,3,B1,B2')
  })

  it('puts every lobby ahead of the floors and fights when there are any', () => {
    expect(spec(defaultOrder(counts(3, 2, 2)))).toBe('L1,L2,1,2,3,B1,B2')
  })

  it('handles a campaign with no fights, and one with no floors', () => {
    expect(spec(campaignOrder(counts(3, 0)))).toBe('1,2,3')
    expect(spec(campaignOrder(counts(0, 2)))).toBe('B1,B2')
    expect(campaignOrder(counts(0, 0))).toEqual([])
  })

  it('keeps a stored order that already describes the campaign', () => {
    expect(spec(campaignOrder(counts(4, 2), slots('B1,1,2,B2,3,4')))).toBe('B1,1,2,B2,3,4')
    expect(spec(campaignOrder(counts(2, 1, 1), slots('L1,1,B1,2')))).toBe('L1,1,B1,2')
  })

  it('recognises the default order for the round-trip and the stock export', () => {
    expect(isDefaultOrder(slots('1,2,3,B1'), counts(3, 1))).toBe(true)
    expect(isDefaultOrder(slots('B1,1,2,3'), counts(3, 1))).toBe(false)
    // a shorter or longer order is not the default one either
    expect(isDefaultOrder(slots('1,2,3'), counts(3, 1))).toBe(false)
    // with lobbies, the default puts them BEFORE every floor and fight — the
    // shipped order (a lobby right before the boss fight too) is deliberately
    // not this, which is why it is stored explicitly
    expect(isDefaultOrder(slots('L1,L2,1,2,3,B1'), counts(3, 1, 2))).toBe(true)
    expect(isDefaultOrder(slots('L1,1,2,3,L2,B1'), counts(3, 1, 2))).toBe(false)
  })
})

describe('normalizeOrder — repairing a stale order', () => {
  it('drops a slot the campaign no longer has', () => {
    // the floor count fell from 5 to 3
    expect(spec(normalizeOrder(slots('1,2,B1,3,4,5'), counts(3, 1)))).toBe('1,2,B1,3')
  })

  it('appends a slot the order never mentioned', () => {
    // a fourth floor and a second fight were added after the order was stored
    expect(spec(normalizeOrder(slots('B1,1,2,3'), counts(4, 2)))).toBe('B1,1,2,3,4,B2')
  })

  it('appends missing lobbies first, matching defaultOrder\'s shape', () => {
    expect(spec(normalizeOrder(slots('1,2'), counts(2, 0, 2)))).toBe('1,2,L1,L2')
  })

  it('drops a duplicate rather than playing a floor twice', () => {
    expect(spec(normalizeOrder(slots('1,B1,1,2'), counts(2, 1)))).toBe('1,B1,2')
  })

  it('ignores entries that are not slots at all', () => {
    const junk = [
      null,
      'floor',
      { kind: 'wat', index: 0 },
      { kind: 'floor', index: 1.5 },
      { kind: 'floor', index: 0 }
    ] as unknown as CampaignSlot[]
    expect(spec(normalizeOrder(junk, counts(2, 1)))).toBe('1,2,B1')
  })

  it('rejects a lobby entry once the campaign has none to place', () => {
    // { kind: 'lobby', index: 0 } is a well-formed slot, but out of range —
    // this campaign was built with lobbies: 0, so it is dropped like any
    // other out-of-range index rather than kept as a real slot
    const junk = [{ kind: 'lobby', index: 0 }, { kind: 'floor', index: 0 }] as CampaignSlot[]
    expect(spec(normalizeOrder(junk, counts(1, 0)))).toBe('1')
  })

  /**
   * The interleaving is the feature and is preserved; the numbering is not
   * negotiable, so out-of-order indices are dealt back into the positions their
   * own kind already occupies.
   */
  it('forces each sequence ascending without disturbing the interleaving', () => {
    expect(spec(normalizeOrder(slots('2,B2,1,B1'), counts(2, 2)))).toBe('1,B1,2,B2')
    expect(spec(normalizeOrder(slots('3,1,B1,2'), counts(3, 1)))).toBe('1,2,B1,3')
    expect(spec(normalizeOrder(slots('L2,1,L1,2'), counts(2, 0, 2)))).toBe('L1,1,L2,2')
  })

  it('is idempotent — repairing a repaired order changes nothing', () => {
    const once = normalizeOrder(slots('3,1,B1,2'), counts(3, 1))
    expect(normalizeOrder(once, counts(3, 1))).toEqual(once)
  })

  it('returns the default order for an empty one', () => {
    expect(spec(normalizeOrder([], counts(2, 1)))).toBe('1,2,B1')
    expect(spec(normalizeOrder([], counts(2, 1, 1)))).toBe('L1,1,2,B1')
  })
})

describe('gatewayAfter', () => {
  const order = slots('1,B1,2')

  it('sends a floor followed by another floor down the stairs', () => {
    expect(gatewayAfter(slots('1,2'), 0)).toEqual({ kind: 'exit', target: '1' })
  })

  it('sends a slot followed by a fight through the red portal, straight into that fight\'s arena', () => {
    expect(gatewayAfter(order, 0)).toEqual({ kind: 'portal', target: 'boss0' })
  })

  // Three visually distinct ways out: stairs, a red portal into a fight, or a
  // blue portal into a lobby — so a floor leading into a lobby gets its own
  // kind rather than falling in with the ordinary dungeon-floor stairs.
  it("sends a floor followed by a lobby through the blue portal, not the stairs", () => {
    expect(gatewayAfter(slots('1,L1,B1'), 0)).toEqual({ kind: 'lobbyPortal', target: 'lobby0' })
  })

  it('sends an arena followed by a floor down that floor\'s stairs', () => {
    expect(gatewayAfter(order, 1)).toEqual({ kind: 'exit', target: '1' })
  })

  it('gives the last slot the orb, whatever kind it is', () => {
    expect(gatewayAfter(order, 2)).toEqual({ kind: 'orb' })
    expect(gatewayAfter(slots('1,B1'), 1)).toEqual({ kind: 'orb' })
  })

  // All four Gateway kinds, named explicitly — the exhaustive case the three
  // shape-specific tests above only sample.
  it('returns each of the four gateway kinds for the slot that earns it', () => {
    expect(gatewayAfter(slots('1,2'), 0)).toEqual({ kind: 'exit', target: '1' })
    expect(gatewayAfter(slots('1,B1'), 0)).toEqual({ kind: 'portal', target: 'boss0' })
    expect(gatewayAfter(slots('1,L1'), 0)).toEqual({ kind: 'lobbyPortal', target: 'lobby0' })
    expect(gatewayAfter(slots('1'), 0)).toEqual({ kind: 'orb' })
  })

  // Every campaign has exactly one way to win, so exactly one slot may end it.
  it('hands out exactly one orb per campaign', () => {
    for (const shape of ['1,2,3,B1', 'B1,1,2,3', '1,B1,2,B2,3', 'L1,1,B1,L2,2']) {
      const parsed = slots(shape)
      const orbs = parsed.filter((_, i) => gatewayAfter(parsed, i).kind === 'orb')
      expect(orbs, shape).toHaveLength(1)
    }
  })
})
