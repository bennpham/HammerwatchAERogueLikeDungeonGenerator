import React from 'react'
import { MAX_TRAP_COUNT, PROJECTILE_DEFS } from '../../generator'
import type { SurvivalTrap, ValidationIssue } from '../../generator'
import { TrapPicker } from './TrapPicker'

/** What "Add trap" starts a new row on — the first entry of the first group. */
const FIRST_PROJECTILE = PROJECTILE_DEFS[0].id

/** The fields a row's inline messages can be anchored to. */
const ROW_FIELDS = ['projectile', 'direction', 'spread', 'spawnRateMs', 'count', 'startSeconds', 'endSeconds']

interface SurvivalTrapListEditorProps {
  value: SurvivalTrap[]
  onChange: (next: SurvivalTrap[]) => void
  /** Issue-field prefix, e.g. `boss.fights.0.survival.traps`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * Timed wall-trap windows for a survival arena — the boss tier's `TrapPicker`
 * with a start/end pair bolted underneath. `maxCount` is `MAX_TRAP_COUNT`, the
 * same wall-sized bound a boss tier's traps use, because a survival arena is
 * the same fixed rectangle. Unlike a boss tier's traps these windows do NOT
 * switch each other off — two overlapping windows both fire.
 */
export function SurvivalTrapListEditor({ value, onChange, issuePrefix, issues }: SurvivalTrapListEditorProps) {
  const patch = (index: number, change: Partial<SurvivalTrap>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : row)))
  }

  const add = () => {
    onChange([
      ...value,
      {
        projectile: FIRST_PROJECTILE,
        direction: 'up' as const,
        spread: 0,
        spawnRateMs: 1000,
        count: 1,
        startSeconds: 0,
        endSeconds: 30
      }
    ])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="buff-list">
      {value.map((row, index) => {
        const prefix = `${issuePrefix}.${index}`
        return (
          <React.Fragment key={index}>
            <TrapPicker trap={row} onChange={(change) => patch(index, change)} maxCount={MAX_TRAP_COUNT}>
              <button
                type="button"
                className="buff-remove"
                onClick={() => remove(index)}
                title="Remove this trap window"
              >
                Remove
              </button>
            </TrapPicker>
            <div className="trap-fields survival-trap-window">
              <label className="trap-field">
                <span className="field-label">Starts at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.startSeconds}
                  onChange={(e) =>
                    patch(index, { startSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })
                  }
                  title="Seconds into the round when these spewers switch on"
                />
              </label>
              <label className="trap-field">
                <span className="field-label">Ends at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.endSeconds}
                  onChange={(e) =>
                    patch(index, { endSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })
                  }
                  title="Seconds into the round when these spewers switch off"
                />
              </label>
            </div>
            {ROW_FIELDS.flatMap((f) =>
              issues
                .filter((i) => i.field === `${prefix}.${f}`)
                .map((issue, i) => (
                  <p key={`${f}-${i}`} className="field-message">
                    {issue.message}
                  </p>
                ))
            )}
          </React.Fragment>
        )
      })}
      {issues
        .filter((i) => i.field === issuePrefix)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <button type="button" className="copy-down" onClick={add} title="Run another timed spewer window">
        Add trap window
      </button>
    </div>
  )
}
