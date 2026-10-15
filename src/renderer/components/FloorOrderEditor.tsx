import React from 'react'
import { arenaModes, campaignOrder, isDefaultOrder, slotLabeller } from '../../generator'
import type { CampaignCounts, CampaignSlot, DungeonParameters, ValidationIssue } from '../../generator'
import { Section } from './fields'

interface FloorOrderEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * The campaign's play order, as a row of draggable-by-button chips:
 * `L1 1 2 B1 3`. Its own left-panel tab, between Boss and Player, because the
 * order is a property of the whole campaign rather than of the dungeon
 * floors — plenty of the chips on it are boss fights and lobbies.
 *
 * The constraint the issue asks for — floors stay 1,2,3, boss fights stay
 * B1,B2,B3, lobbies stay L1,L2,L3, and only the interleaving is free — is
 * enforced by *disabling* the arrow rather than by reporting an error
 * afterwards. Two chips of the same kind simply cannot swap with each other,
 * which makes the rule visible in the control instead of in a message under
 * it. The one other illegal move — a lobby ending up last, since it carries
 * no victory orb — is disabled the same way rather than validated after.
 *
 * No drag-and-drop: the repo's runtime dependencies are react, react-dom and
 * jszip, and a reorder this short does not justify a fourth.
 */
export function FloorOrderEditor({ params, issues, onChange }: FloorOrderEditorProps) {
  const fightCount = params.boss?.enabled === true ? (params.boss.fights?.length ?? 0) : 0
  const counts: CampaignCounts = { levels: params.levels, fights: fightCount, lobbies: params.lobbies.length }
  const order = campaignOrder(counts, params.levelOrder)
  // Arena chips read AB1/AS2 — the prefix is that arena's mode, the number its
  // position in the fight list. See campaign.ts's slotLabel. A floor with a
  // boss on it reads 8B. That suffix is display-only: slotLabel itself also
  // names the preview tabs and the `levelOrder=` tokens, which must not change
  // when a boss is toggled.
  const arenaLabel = slotLabeller(arenaModes(params.boss))
  const label = (slot: CampaignSlot): string =>
    arenaLabel(slot) + (slot.kind === 'floor' && params.levelBoss?.[slot.index]?.enabled === true ? 'B' : '')

  // Nothing to interleave when the campaign is only one kind of slot — all
  // floors, all fights, or all lobbies. As a tab it still has to render
  // something — a blank panel reads as a bug, so it says what is missing.
  const kinds = new Set(order.map((s) => s.kind))
  const hasMultipleKinds = kinds.size > 1

  const store = (next: CampaignSlot[]) => {
    // The default order is stored as *absent*, not as an explicit list — that
    // is the shape that guarantees byte-identical output, and it keeps the key
    // out of a stock parameters.txt export.
    const isDefault = isDefaultOrder(next, counts)
    const updated = { ...params }
    if (isDefault) delete updated.levelOrder
    else updated.levelOrder = next
    onChange(updated)
  }

  const swap = (index: number, other: number) => {
    const next = order.map((s) => ({ ...s }))
    const held = next[index]
    next[index] = next[other]
    next[other] = held
    store(next)
  }

  /**
   * Two slots may trade places only if they are different kinds, AND the swap
   * must not leave a lobby in the campaign's last position — a lobby carries
   * no victory orb, so the generator rejects a trailing one. This editor's
   * house rule is that an illegal move is a disabled arrow, never an error
   * reported after the fact.
   */
  const canSwap = (index: number, other: number): boolean => {
    if (other < 0 || other >= order.length) return false
    if (order[index].kind === order[other].kind) return false
    // Whichever side sits in the campaign's last position keeps that position
    // after the swap — so it is the OTHER side's kind that decides whether a
    // lobby would end up there, whichever button triggered the move.
    const lastIndex = order.length - 1
    if (index === lastIndex && order[other].kind === 'lobby') return false
    if (other === lastIndex && order[index].kind === 'lobby') return false
    return true
  }

  const orderIssues = issues.filter((i) => i.field === 'levelOrder')

  return (
    <div className="parameter-form floor-order-form">
      <Section
        title="Floor order"
        defaultOpen
        badge={params.levelOrder === undefined ? 'default' : 'custom'}
      >
        <p className="hint">
          The order the campaign is played in. Arenas are <strong>AB1</strong> (boss) or{' '}
          <strong>AS1</strong> (survival), lobbies are <strong>L1</strong>, <strong>L2</strong>…, and
          a dungeon floor with a boss on it reads <strong>8B</strong>. Arenas and lobbies can go
          anywhere except that a lobby can never be last, since only a dungeon floor or an arena
          carries the victory orb.
          Floors, fights and lobbies each keep their own order; only how the three interleave is up
          to you, so the ◀ ▶ buttons will not move a chip past another of the same kind, or move a
          lobby into the last slot.
        </p>

        {!hasMultipleKinds ? (
          <p className="hint">
            There is nothing to arrange yet: the campaign has only {soleKindNoun(kinds)}. Add a boss
            fight (Boss tab), a lobby (Lobby tab), or more floors (Dungeon tab) to have something to
            interleave.
          </p>
        ) : (
          <FloorOrderChips order={order} label={label} onSwap={swap} canSwap={canSwap} />
        )}

        <div className="boss-prep-actions">
          <button
            type="button"
            className="copy-down"
            onClick={() => store(campaignOrder(counts, undefined))}
            disabled={params.levelOrder === undefined}
          >
            Reset to default order
          </button>
        </div>

        {orderIssues.map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      </Section>
    </div>
  )
}

/** What to call the one kind of slot present, for the "nothing to arrange" hint. */
function soleKindNoun(kinds: Set<CampaignSlot['kind']>): string {
  if (kinds.has('floor')) return 'dungeon floors'
  if (kinds.has('boss')) return 'boss fights'
  if (kinds.has('lobby')) return 'lobbies'
  return 'nothing'
}

interface FloorOrderChipsProps {
  order: CampaignSlot[]
  /** What to call a slot — bound to this campaign's arena modes, so an arena chip reads AB1/AS2. */
  label: (slot: CampaignSlot) => string
  onSwap: (index: number, other: number) => void
  canSwap: (index: number, other: number) => boolean
}

function FloorOrderChips({ order, label, onSwap, canSwap }: FloorOrderChipsProps) {
  return (
    <div className="floor-order">
      {order.map((slot, i) => (
        <span key={`${slot.kind}-${slot.index}`} className={`floor-chip floor-chip-${slot.kind}`}>
          <button
            type="button"
            className="chip-move"
            onClick={() => onSwap(i, i - 1)}
            disabled={!canSwap(i, i - 1)}
            title="Move earlier"
            aria-label={`Move ${label(slot)} earlier`}
          >
            ◀
          </button>
          <span className="chip-label">{label(slot)}</span>
          <button
            type="button"
            className="chip-move"
            onClick={() => onSwap(i, i + 1)}
            disabled={!canSwap(i, i + 1)}
            title="Move later"
            aria-label={`Move ${label(slot)} later`}
          >
            ▶
          </button>
        </span>
      ))}
    </div>
  )
}
