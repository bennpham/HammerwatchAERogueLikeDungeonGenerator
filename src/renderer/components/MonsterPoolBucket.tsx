import React, { useState } from 'react'
import type { FloorPoolEntry } from '../../generator'

interface MonsterPoolBucketProps {
  /** The type's "any tier" entry — always rendered; the toggle lives on this row. */
  rolled: FloorPoolEntry
  /** This type's pinned tier entries, in tier order. At least one. */
  tiers: FloorPoolEntry[]
  /**
   * Keep the tier rows open regardless of the last click — mirrors
   * PoolGroup.forceOpen, passed the same `!filter.isDefault` a search or
   * category filter already forces the top-level groups open with.
   */
  forceOpen?: boolean
  /**
   * At least one tier is already pinned in this level's pool. Opens by
   * default so an existing selection can never be hidden, mirroring
   * PoolGroup's own `selected > 0` rule.
   */
  anyPinned: boolean
  /** Renders one row (rolled or pinned tier); `extra` lands after the badge, before the weight input. */
  renderEntry: (entry: FloorPoolEntry, extra?: React.ReactNode) => React.ReactNode
}

/**
 * One monster type's rolled ("any tier") entry plus its collapsible pinned-tier
 * rows, inside a dungeon pool picker's checkbox grid. Collapsed by default,
 * like PoolGroup — a 4-tier type otherwise costs 5 rows every time its group
 * is open (issue #58 follow-up).
 *
 * Not a <details>: that requires a <summary> as its literal first child, which
 * is incompatible with putting the toggle INSIDE the rolled row's own <label>
 * (checkbox, key, badge, toggle, weight — one row). Conditionally not
 * rendering the tier rows, rather than CSS-hiding them, keeps them out of tab
 * order for free.
 */
export function MonsterPoolBucket({
  rolled,
  tiers,
  forceOpen = false,
  anyPinned,
  renderEntry
}: MonsterPoolBucketProps) {
  // null means "follow the default"; a click pins an explicit choice. The
  // override is dropped whenever forceOpen flips, so a bucket the user
  // collapsed mid-search does not stay collapsed once the search is cleared —
  // the same trick PoolGroup uses.
  const [override, setOverride] = useState<boolean | null>(null)
  const [lastForceOpen, setLastForceOpen] = useState(forceOpen)
  if (lastForceOpen !== forceOpen) {
    setLastForceOpen(forceOpen)
    setOverride(null)
  }
  const open = override ?? (forceOpen || anyPinned)

  const toggle = (
    <button
      type="button"
      className="pool-tier-toggle"
      aria-expanded={open}
      title={open ? 'Hide individual tiers' : 'Show individual tiers'}
      onClick={(ev) => {
        // Nested inside the rolled row's <label> — same guard the weight
        // input already uses, or this click would also flip that checkbox.
        ev.preventDefault()
        ev.stopPropagation()
        setOverride(!open)
      }}
    >
      ▸
    </button>
  )

  return (
    <>
      {renderEntry(rolled, toggle)}
      {open && <div className="pool-tier-group">{tiers.map((t) => renderEntry(t))}</div>}
    </>
  )
}
