import React from 'react'
import { MAX_PICKUP_COUNT, PICKUP_DEFS, PICKUP_GROUPS } from '../../generator'
import { InfoTip } from './InfoTip'

/** What a picker lists — PICKUP_DEFS by default, MYSTERY_LOOT_DEFS for a mystery button. */
export interface PickupChoice {
  id: string
  label: string
  group: string
  description: string
}

/** The drop-pad wording the arena tiers use — what the count tooltip says unless told otherwise. */
const PAD_COUNT_TITLE = `How many copies drop, 1..${MAX_PICKUP_COUNT}. Each copy takes its own tile in this item's lane of the drop pad.`

interface PickupPickerProps {
  /** An id from `defs` — a PICKUP_DEFS id unless `defs` says otherwise. */
  item: string
  /** How many copies drop. */
  count: number
  onChange: (change: { item?: string; count?: number }) => void
  /** Rendered after the count field, e.g. a remove button. */
  children?: React.ReactNode
  /** The items to offer, in dropdown order. Defaults to the arena's PICKUP_DEFS. */
  defs?: readonly PickupChoice[]
  /** The <optgroup> order for `defs`. Defaults to PICKUP_GROUPS. */
  groups?: readonly string[]
  /** The count field's tooltip. Defaults to the arena drop-pad wording. */
  countTitle?: string
}

/**
 * One drop choice: which item, and how many copies of it.
 *
 * Deliberately shaped like BuffPicker — same row layout, same grouped select,
 * same InfoTip repeating the *selected* item's description beside the row — so
 * the two editors under the Boss tab read as one thing. The second control is a
 * count rather than a target because an item has nobody to aim at.
 *
 * There is no "no item" option: an empty list is how a tier says it drops
 * nothing, so every row here always names an item.
 */
export function PickupPicker({
  item,
  count,
  onChange,
  children,
  defs = PICKUP_DEFS,
  groups = PICKUP_GROUPS,
  countTitle = PAD_COUNT_TITLE
}: PickupPickerProps) {
  return (
    <div className="buff-row">
      <PickupSelect item={item} onChange={(next) => onChange({ item: next })} defs={defs} groups={groups} />
      <input
        className="buff-target"
        type="number"
        min={1}
        max={MAX_PICKUP_COUNT}
        step={1}
        value={count}
        // Empty while the field is being retyped would store NaN, so a blank
        // reads as 1 — the same value "Add pickup" starts a row on.
        onChange={(e) => onChange({ count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
        title={countTitle}
      />
      {children}
    </div>
  )
}

interface PickupSelectProps {
  item: string
  onChange: (item: string) => void
  defs?: readonly PickupChoice[]
  groups?: readonly string[]
}

/**
 * PickupPicker's grouped item dropdown plus its InfoTip, on their own — for an
 * editor that lays the count and its other fields out under the item rather
 * than beside it (the survival arena's timed drops).
 */
export function PickupSelect({ item, onChange, defs = PICKUP_DEFS, groups = PICKUP_GROUPS }: PickupSelectProps) {
  const selected = defs.find((def) => def.id === item)

  return (
    <>
      <select
        className="buff-select"
        value={item}
        onChange={(e) => onChange(e.target.value)}
        title={selected?.description ?? 'Pick an item'}
      >
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {defs.filter((def) => def.group === group).map((def) => (
              <option key={def.id} value={def.id} title={def.description}>
                {def.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && <InfoTip text={selected.description} />}
    </>
  )
}
