import React from 'react'
import type { ValidationIssue } from '../../generator'

interface NumberFieldProps {
  label: string
  field: string
  value: number
  onChange: (value: number) => void
  issues: ValidationIssue[]
  min?: number
  max?: number
  step?: number
  title?: string
}

/** Labeled number input with inline validation message. */
export function NumberField({ label, field, value, onChange, issues, min, max, step, title }: NumberFieldProps) {
  const fieldIssues = issues.filter((i) => i.field === field)
  return (
    <label className={`field ${fieldIssues.length > 0 ? 'field-error' : ''}`} title={title}>
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={Number.isNaN(value) ? '' : value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {fieldIssues.map((issue, i) => (
        <span key={i} className="field-message">
          {issue.message}
        </span>
      ))}
    </label>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}

/** Collapsible form section. */
export function Section({ title, children, defaultOpen = false, badge }: SectionProps) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        {title}
        {badge && <span className="section-badge">{badge}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

/** Collapsible group nested inside a {@link Section}. */
export function Subsection({ title, children, defaultOpen = false, badge }: SectionProps) {
  return (
    <details className="subsection" open={defaultOpen}>
      <summary className="subsection-title">
        {title}
        {badge && <span className="section-badge">{badge}</span>}
      </summary>
      <div className="subsection-body">{children}</div>
    </details>
  )
}

interface CurveFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  title?: string
}

/**
 * A bulk knob (a multiplier, a speed). Deliberately not a {@link NumberField}:
 * a knob is a shorthand for a set of per-value overrides, not an override
 * itself, so it carries no key and no inline validation of its own.
 */
export function CurveField({ label, value, onChange, step, title }: CurveFieldProps) {
  return (
    <label className="field curve-field" title={title}>
      <span className="field-label">{label}</span>
      <span className="curve-input">
        <input
          type="number"
          value={Number.isNaN(value) ? '' : value}
          step={step ?? 1}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        />
      </span>
    </label>
  )
}

interface BoolFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  title?: string
  /** extra class, e.g. field-grid-footer to sit a toggle below a field grid */
  className?: string
  disabled?: boolean
}

/** On/off switch, stored as 0/1 where it is a parameter. */
export function BoolField({ label, checked, onChange, title, className, disabled }: BoolFieldProps) {
  return (
    <label className={className ? `bool-field ${className}` : 'bool-field'} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

interface ToggleGroupProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (value: T) => void
}

/**
 * Segmented picker for a small set of mutually exclusive choices. Renders as
 * buttons rather than a `<select>` so a dungeon master can see all the options
 * and switch between them in one click.
 */
export function ToggleGroup<T extends string>({ label, value, options, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="toggle-group">
      <span className="field-label">{label}</span>
      <div className="toggle-group-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`toggle ${option.value === value ? 'active' : ''}`}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TierBlockProps {
  id: string
  children: React.ReactNode
}

/** One tier's own inputs, under its label. */
export function TierBlock({ id, children }: TierBlockProps) {
  return (
    <div className="tier-block">
      <span className="tier-id">{id}</span>
      <div className="field-grid">{children}</div>
    </div>
  )
}
