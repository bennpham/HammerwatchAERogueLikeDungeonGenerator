import React from 'react'
import { BUFF_DEFS } from '../../generator'
import type { SurvivalBuff, ValidationIssue } from '../../generator'
import { BuffSelect, BuffTargetSelect } from './BuffPicker'

/** What "Add buff" starts a new row on — the first entry of the first group. */
const FIRST_BUFF = BUFF_DEFS[0].id

interface SurvivalBuffListEditorProps {
  value: SurvivalBuff[]
  onChange: (next: SurvivalBuff[]) => void
  /** Issue-field prefix, e.g. `boss.fights.0.survival.buffs`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * Timed buff windows for a survival arena — the boss tier's `BuffListEditor`
 * with a start/end pair bolted on. Windows are independent: unlike a boss
 * tier's buffs they do NOT replace one another, so two overlapping windows
 * both apply and each owns its own on/off pair.
 *
 * Laid out as a card like the wave rows, not on BuffPicker's single line: buff,
 * target, both seconds marks and Remove on one line squeezed the buff name down
 * to a caret in the narrow boss panel.
 */
export function SurvivalBuffListEditor({ value, onChange, issuePrefix, issues }: SurvivalBuffListEditorProps) {
  const patch = (index: number, change: Partial<SurvivalBuff>) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...change } : entry)))
  }

  const add = () => {
    onChange([...value, { buff: FIRST_BUFF, target: 'players', startSeconds: 0, endSeconds: 30 }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="buff-list">
      {value.map((entry, index) => {
        const prefix = `${issuePrefix}.${index}`
        const fieldIssues = (suffix: string) => issues.filter((i) => i.field === `${prefix}.${suffix}`)
        const messages = (suffix: string) =>
          fieldIssues(suffix).map((issue, i) => (
            <span key={i} className="field-message">
              {issue.message}
            </span>
          ))
        return (
          <div key={index} className="trap-row">
            <div className="trap-head">
              <BuffSelect buff={entry.buff} onChange={(buff) => patch(index, { buff })} />
              <button
                type="button"
                className="buff-remove"
                onClick={() => remove(index)}
                title="Remove this buff window"
              >
                Remove
              </button>
            </div>
            {fieldIssues('buff').map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
            <div className="trap-fields">
              <label className="trap-field">
                <span className="field-label">Target</span>
                <BuffTargetSelect target={entry.target} onChange={(target) => patch(index, { target })} />
                {messages('target')}
              </label>
              <label className="trap-field">
                <span className="field-label">Starts at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={entry.startSeconds}
                  onChange={(e) =>
                    patch(index, { startSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })
                  }
                  title="Seconds into the round when this window switches on"
                />
                {messages('startSeconds')}
              </label>
              <label className="trap-field">
                <span className="field-label">Ends at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={entry.endSeconds}
                  onChange={(e) =>
                    patch(index, { endSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })
                  }
                  title="Seconds into the round when this window switches off"
                />
                {messages('endSeconds')}
              </label>
            </div>
          </div>
        )
      })}
      {issues
        .filter((i) => i.field === issuePrefix)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <button type="button" className="copy-down" onClick={add} title="Add another buff window">
        Add buff window
      </button>
    </div>
  )
}
