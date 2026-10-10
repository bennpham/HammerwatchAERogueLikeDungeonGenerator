import React from 'react'
import { MAX_PICKUP_COUNT, PICKUP_DEFS } from '../../generator'
import type { SurvivalPickup, ValidationIssue } from '../../generator'
import { PickupSelect } from './PickupPicker'

/** What "Add drop" starts a new row on — the first entry of the first group. */
const FIRST_PICKUP = PICKUP_DEFS[0].id

interface SurvivalPickupListEditorProps {
  value: SurvivalPickup[]
  onChange: (next: SurvivalPickup[]) => void
  /** Issue-field prefix, e.g. `boss.fights.0.survival.pickups`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * Timed item drops for a survival arena — the boss tier's `PickupListEditor`
 * with a drop time bolted on. Rows never replace one another: an item left
 * uncollected from an earlier drop is still on the pad when a later one lands.
 *
 * Laid out as a card like the wave rows above it, not on PickupPicker's single
 * line: item, count, drop time and Remove on one line squeezed the item name
 * down to a caret in the narrow boss panel.
 */
export function SurvivalPickupListEditor({ value, onChange, issuePrefix, issues }: SurvivalPickupListEditorProps) {
  const patch = (index: number, change: Partial<SurvivalPickup>) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...change } : entry)))
  }

  const add = () => {
    onChange([...value, { item: FIRST_PICKUP, count: 1, atSeconds: 0 }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="buff-list">
      {value.map((entry, index) => {
        const prefix = `${issuePrefix}.${index}`
        const fieldIssues = (suffix: string) => issues.filter((i) => i.field === `${prefix}.${suffix}`)
        return (
          <div key={index} className="trap-row">
            <div className="trap-head">
              <PickupSelect item={entry.item} onChange={(item) => patch(index, { item })} />
              <button
                type="button"
                className="buff-remove"
                onClick={() => remove(index)}
                title="Remove this drop"
              >
                Remove
              </button>
            </div>
            {fieldIssues('item').map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
            <div className="trap-fields">
              <label className="trap-field">
                <span className="field-label">Count</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_PICKUP_COUNT}
                  step={1}
                  value={entry.count}
                  // A blank reads as 1 — the same value "Add drop" starts a row on.
                  onChange={(e) => patch(index, { count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
                  title={`How many copies drop, 1..${MAX_PICKUP_COUNT}. Each copy takes its own tile in this item's lane of the drop pad.`}
                />
                {fieldIssues('count').map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
              <label className="trap-field">
                <span className="field-label">Drops at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={entry.atSeconds}
                  onChange={(e) => patch(index, { atSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
                  title="Seconds into the round when this drop lands"
                />
                {fieldIssues('atSeconds').map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
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
      <button type="button" className="copy-down" onClick={add} title="Add another timed drop">
        Add drop
      </button>
    </div>
  )
}
