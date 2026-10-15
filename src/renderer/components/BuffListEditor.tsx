import React from 'react'
import { BUFF_DEFS } from '../../generator'
import type { FloorBuff, ValidationIssue } from '../../generator'
import { BuffPicker } from './BuffPicker'

/** What "Add buff" starts a new row on — the first entry of the first group. */
const FIRST_BUFF = BUFF_DEFS[0].id

interface BuffListEditorProps {
  value: FloorBuff[]
  onChange: (next: FloorBuff[]) => void
  /** What the list hangs off, for the row tooltips: 'floor' or 'tier'. */
  noun: string
  /** Issue-field prefix, e.g. `levelBuffs.0` or `boss.arena.waves.0.buffs`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * One editable list of buffs: a row per entry, plus "Add buff".
 *
 * Shared by the per-floor editor and the boss arena's per-tier editor so the
 * two cannot drift on the row layout or the add/remove behaviour — the same
 * reason BuffPicker itself is shared. "No buff" is an empty list in both
 * places, never a row with nothing selected, and the list has no upper bound:
 * see the note beside FloorBuff in config/parameters.ts.
 */
export function BuffListEditor({ value, onChange, noun, issuePrefix, issues }: BuffListEditorProps) {
  const patch = (index: number, change: Partial<FloorBuff>) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...change } : { ...entry })))
  }

  const add = () => {
    onChange([...value.map((entry) => ({ ...entry })), { buff: FIRST_BUFF, target: 'players' }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index).map((entry) => ({ ...entry })))
  }

  return (
    <div className="buff-list">
      {value.map((entry, index) => (
        <React.Fragment key={index}>
          <BuffPicker buff={entry.buff} target={entry.target} onChange={(change) => patch(index, change)}>
            <button
              type="button"
              className="buff-remove"
              onClick={() => remove(index)}
              title={`Remove this buff from the ${noun}`}
            >
              Remove
            </button>
          </BuffPicker>
          {issues
            .filter(
              (i) =>
                i.field === `${issuePrefix}.${index}.buff` || i.field === `${issuePrefix}.${index}.target`
            )
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
      <button type="button" className="copy-down" onClick={add} title={`Hang another buff on this ${noun}`}>
        Add buff
      </button>
    </div>
  )
}
