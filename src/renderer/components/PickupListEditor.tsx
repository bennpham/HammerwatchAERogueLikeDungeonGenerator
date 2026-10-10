import React from 'react'
import { PICKUP_DEFS } from '../../generator'
import type { ValidationIssue, WavePickup } from '../../generator'
import { PickupPicker } from './PickupPicker'
import type { PickupChoice } from './PickupPicker'

interface PickupListEditorProps {
  value: WavePickup[]
  onChange: (next: WavePickup[]) => void
  /** What the list hangs off, for the row tooltips: 'tier' today. */
  noun: string
  /** Issue-field prefix, e.g. `boss.arena.waves.0.pickups`. */
  issuePrefix: string
  issues: ValidationIssue[]
  /** The items to offer — see PickupPicker. Defaults to the arena's PICKUP_DEFS. */
  defs?: readonly PickupChoice[]
  /** The <optgroup> order for `defs`. */
  groups?: readonly string[]
  /** The count field's tooltip — see PickupPicker. */
  countTitle?: string
  /** The add button's label. */
  addLabel?: string
}

/**
 * One editable list of drops: a row per entry, plus "Add pickup".
 *
 * The buff-side twin of BuffListEditor, and kept structurally identical to it
 * on purpose — "no drops" is an empty list, never a row with nothing selected,
 * and the list has no upper bound (each row's *count* is bounded instead; see
 * MAX_PICKUP_COUNT in objects/pickupTypes.ts).
 */
export function PickupListEditor({
  value,
  onChange,
  noun,
  issuePrefix,
  issues,
  defs = PICKUP_DEFS,
  groups,
  countTitle,
  addLabel = 'Add pickup'
}: PickupListEditorProps) {
  const patch = (index: number, change: Partial<WavePickup>) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...change } : { ...entry })))
  }

  const add = () => {
    onChange([...value.map((entry) => ({ ...entry })), { item: defs[0].id, count: 1 }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index).map((entry) => ({ ...entry })))
  }

  return (
    <div className="buff-list">
      {value.map((entry, index) => (
        <React.Fragment key={index}>
          <PickupPicker
            item={entry.item}
            count={entry.count}
            onChange={(change) => patch(index, change)}
            defs={defs}
            groups={groups}
            countTitle={countTitle}
          >
            <button
              type="button"
              className="buff-remove"
              onClick={() => remove(index)}
              title={`Remove this drop from the ${noun}`}
            >
              Remove
            </button>
          </PickupPicker>
          {issues
            .filter(
              (i) =>
                i.field === `${issuePrefix}.${index}.item` || i.field === `${issuePrefix}.${index}.count`
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
      <button type="button" className="copy-down" onClick={add} title={`Drop another item on this ${noun}`}>
        {addLabel}
      </button>
    </div>
  )
}
