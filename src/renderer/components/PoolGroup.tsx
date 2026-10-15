import React, { useState } from 'react'

interface PoolGroupProps {
  title: string
  /** How many of this group's members are already in the pool. */
  selected: number
  /** How many members the current filter leaves on screen. */
  total: number
  /**
   * Keep the group open no matter what the user last toggled. The pickers pass
   * this while a filter is narrowing the list — a collapsed group would hide
   * the very matches the search was meant to surface.
   */
  forceOpen?: boolean
  children: React.ReactNode
}

/**
 * One collapsible monster group inside a pool picker. Collapsed by default
 * unless it already holds a pick, so the full roster stops being one long
 * scroll. Session-only UI state: collapsing a group never changes the pool, and
 * a picked monster stays counted in the summary while hidden.
 */
export function PoolGroup({ title, selected, total, forceOpen = false, children }: PoolGroupProps) {
  // null means "follow the default"; a click pins an explicit choice. The
  // override is dropped whenever forceOpen flips, so a group the user collapsed
  // mid-search does not stay collapsed once the search is cleared.
  const [override, setOverride] = useState<boolean | null>(null)
  const [lastForceOpen, setLastForceOpen] = useState(forceOpen)
  if (lastForceOpen !== forceOpen) {
    setLastForceOpen(forceOpen)
    setOverride(null)
  }
  const open = override ?? (forceOpen || selected > 0)

  return (
    <details className="pool-group" open={open} onToggle={(e) => setOverride(e.currentTarget.open)}>
      <summary className="pool-group-title">
        {title}
        <span className="pool-group-count">
          {selected > 0 ? `${selected} picked · ${total}` : total}
        </span>
      </summary>
      {children}
    </details>
  )
}
