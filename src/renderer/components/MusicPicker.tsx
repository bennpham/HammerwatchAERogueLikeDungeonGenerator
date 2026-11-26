import React from 'react'
import { MUSIC_DEFAULT, MUSIC_TRACKS } from '../../generator'
import type { ValidationIssue } from '../../generator'
import { GroupedOptions } from '../customContent'

interface MusicPickerProps {
  label: string
  field: string
  value: string | undefined
  onChange: (value: string) => void
  issues: ValidationIssue[]
}

/**
 * A music-track dropdown shared by the per-level, per-lobby and per-boss-fight
 * forms. `MUSIC_DEFAULT` ("Default") emits no `PlayMusic` node at all — see
 * `src/generator/music/`. Hammerwatch 2 tracks are listed only once Load custom
 * has loaded HW2.
 */
export function MusicPicker({ label, field, value, onChange, issues }: MusicPickerProps) {
  const fieldIssues = issues.filter((i) => i.field === field)
  return (
    <label className={`field ${fieldIssues.length > 0 ? 'field-error' : ''}`}>
      <span className="field-label">{label}</span>
      <select value={value ?? MUSIC_DEFAULT} onChange={(e) => onChange(e.target.value)}>
        <option value={MUSIC_DEFAULT}>Default (game decides)</option>
        <GroupedOptions defs={MUSIC_TRACKS} value={value} />
      </select>
      {fieldIssues.map((issue, i) => (
        <span key={i} className="field-message">
          {issue.message}
        </span>
      ))}
    </label>
  )
}
