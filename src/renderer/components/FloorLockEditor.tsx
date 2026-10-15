import React from 'react'
import { MAX_LOCK_BUTTONS, bossFights, campaignOrder, defaultFloorLock, floorLockButtons, gatewayAfter } from '../../generator'
import type { DungeonParameters, FloorLock, ValidationIssue } from '../../generator'
import { NumberField } from './fields'

interface FloorLockEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Locked exit rooms, one toggle per floor (issue #69) — the per-floor
 * replacement for the old campaign-wide "Lock final room".
 *
 * Each row says where the floor leads — stairs, boss, lobby or orb — because a
 * locked stairs floor swaps its stairs for the blue teleport (stairs cannot be
 * sealed), which re-rolls that floor's layout.
 */
export function FloorLockEditor({ params, issues, onChange }: FloorLockEditorProps) {
  const count = Math.max(params.levels, 0) || 0

  const order = campaignOrder(
    { levels: count, fights: bossFights(params.boss).length, lobbies: (params.lobbies ?? []).length },
    params.levelOrder
  )
  const leadsTo = new Map<number, string>()
  order.forEach((slot, position) => {
    if (slot.kind !== 'floor') return
    const kind = gatewayAfter(order, position).kind
    leadsTo.set(
      slot.index,
      kind === 'exit' ? 'stairs' : kind === 'orb' ? 'orb' : kind === 'portal' ? 'boss' : 'lobby'
    )
  })

  /** The array padded out to the floor count, so indexing is always safe. */
  const locks = (): FloorLock[] => {
    const next = (params.levelLock ?? []).map((l) => ({ ...l }))
    while (next.length < count) next.push(defaultFloorLock())
    return next.slice(0, count)
  }

  /**
   * One number per floor: 0 unlocks it, anything else locks it with that many
   * buttons. One button stores no count (absent means 1), which is the shape
   * the presets and parameters.txt produce. A half-typed value is kept as-is
   * so validation can flag it rather than the field snapping back.
   */
  const setButtons = (level: number, buttons: number) => {
    const next = locks()
    next[level] =
      buttons === 0 ? { enabled: false } : buttons === 1 ? { enabled: true } : { enabled: true, buttons }
    onChange({ ...params, levelLock: next })
  }

  return (
    <div className="floor-locks">
      <p className="hint">
        Buttons hidden on each floor; pressing all of them opens its walled-off exit. 0 leaves
        the floor unlocked. On a boss floor the wall also waits for the boss.
      </p>
      {issues
        .filter((i) => i.field === 'levelLock')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <div className="field-grid">
        {Array.from({ length: count }, (_, level) => {
          const detail = leadsTo.get(level)
          return (
            <NumberField
              key={level}
              label={`Level ${level + 1}${detail ? ` (${detail})` : ''}`}
              field={`levelLock.${level}.buttons`}
              value={floorLockButtons(params, level)}
              onChange={(v) => setButtons(level, v)}
              issues={issues}
              min={0}
              max={MAX_LOCK_BUTTONS}
              title="Buttons that must all be pressed to open this floor's exit — 0 for none"
            />
          )
        })}
      </div>
    </div>
  )
}
