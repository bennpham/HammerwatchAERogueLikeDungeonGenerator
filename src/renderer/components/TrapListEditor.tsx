import React from 'react'
import { PROJECTILE_DEFS } from '../../generator'
import type { BossTrap, ValidationIssue } from '../../generator'
import { TrapPicker } from './TrapPicker'

/** What "Add trap" starts a new row on — the first entry of the first group. */
const FIRST_PROJECTILE = PROJECTILE_DEFS[0].id

/** The fields a row's inline messages can be anchored to. */
const ROW_FIELDS = ['projectile', 'direction', 'spread', 'spawnRateMs', 'count']

interface TrapListEditorProps {
  value: BossTrap[]
  onChange: (next: BossTrap[]) => void
  /** What the list hangs off, for the row tooltips: 'tier' today. */
  noun: string
  /**
   * Upper bound on each row's `count`, or `undefined` for none — see
   * TrapPicker. The boss tab passes MAX_TRAP_COUNT (a wall is a fixed
   * rectangle); the floor tab passes `undefined` (a floor's pool is every
   * eligible room on it).
   */
  maxCount: number | undefined
  /** Issue-field prefix, e.g. `boss.fights.0.arena.waves.0.traps`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * One editable list of wall traps: a row per spewer kind, plus "Add trap".
 *
 * The third of the Boss tab's list editors, kept structurally identical to
 * BuffListEditor and PickupListEditor on purpose — "no traps" is an empty list,
 * never a row with nothing selected, and the list itself has no upper bound
 * (each row's *count* is bounded instead, by `maxCount`).
 *
 * Several rows may share a direction, which is how one wall mixes ammunition:
 * three axes and two fireballs firing north is two rows, both `up`.
 */
export function TrapListEditor({ value, onChange, noun, maxCount, issuePrefix, issues }: TrapListEditorProps) {
  const patch = (index: number, change: Partial<BossTrap>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : { ...row })))
  }

  const add = () => {
    onChange([
      ...value.map((row) => ({ ...row })),
      { projectile: FIRST_PROJECTILE, direction: 'up' as const, spread: 0, spawnRateMs: 1000, count: 1 }
    ])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index).map((row) => ({ ...row })))
  }

  return (
    <div className="buff-list">
      {value.map((row, index) => (
        <React.Fragment key={index}>
          <TrapPicker trap={row} onChange={(change) => patch(index, change)} maxCount={maxCount}>
            <button
              type="button"
              className="buff-remove"
              onClick={() => remove(index)}
              title={`Remove this trap from the ${noun}`}
            >
              Remove
            </button>
          </TrapPicker>
          {issues
            .filter((i) => ROW_FIELDS.some((f) => i.field === `${issuePrefix}.${index}.${f}`))
            .map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
        </React.Fragment>
      ))}
      {issues
        .filter((i) => i.field === issuePrefix)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <button type="button" className="copy-down" onClick={add} title={`Run another spewer on this ${noun}`}>
        Add trap
      </button>
    </div>
  )
}
