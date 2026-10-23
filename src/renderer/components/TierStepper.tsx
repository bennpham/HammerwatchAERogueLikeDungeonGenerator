import React from 'react'
import type { ValidationIssue } from '../../generator'

interface TierStepperProps {
  /** the `player.<chain>.levels` key, for its validation message */
  field: string
  value: number
  stock: number
  max: number
  issues: ValidationIssue[]
  onChange: (value: number) => void
}

/**
 * How many tiers an upgrade chain has: − drops the last one, + adds one past
 * the last (prefilled from the ones below it), and the box takes a count
 * straight away. Reset puts the chain back at what the game ships.
 */
export function TierStepper({ field, value, stock, max, issues, onChange }: TierStepperProps) {
  const fieldIssues = issues.filter((i) => i.field === field)
  const title =
    max === stock
      ? `Stock ${stock}. This skill's last upgrade has no number to raise, so tiers can only be removed.`
      : `Stock ${stock}, up to ${max}. An added tier copies the last one and carries on its step; edit it below.`
  return (
    <div className={`tier-stepper ${fieldIssues.length > 0 ? 'field-error' : ''}`} title={title}>
      <span className="field-label">Tiers</span>
      <button type="button" className="tier-step" aria-label="Remove the last tier" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <input
        type="number"
        aria-label="Number of tiers"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
        }}
      />
      <button type="button" className="tier-step" aria-label="Add a tier" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
      {value !== stock ? (
        <button type="button" className="tier-reset" onClick={() => onChange(stock)}>
          Reset to {stock}
        </button>
      ) : (
        <span className="tier-stock">stock</span>
      )}
      {fieldIssues.map((issue, i) => (
        <span key={i} className="field-message">
          {issue.message}
        </span>
      ))}
    </div>
  )
}
