import React from 'react'
import { MUSIC_DEFAULT, MUSIC_TRACKS } from '../../generator'
import type { ValidationIssue } from '../../generator'

interface MusicPickerProps {
  label: string
  field: string
  value: string | undefined
  onChange: (value: string) => void
  issues: ValidationIssue[]
}

const MUSIC_GROUPS: readonly [string, typeof MUSIC_TRACKS[number][]][] = (() => {
  const groups = new Map<string, typeof MUSIC_TRACKS[number][]>()
  for (const track of MUSIC_TRACKS) {
    const list = groups.get(track.group) ?? []
    list.push(track)
    groups.set(track.group, list)
  }
  return [...groups.entries()]
})()

/**
 * A music-track dropdown shared by the per-level, per-lobby and per-boss-fight
 * forms. `MUSIC_DEFAULT` ("Default") emits no `PlayMusic` node at all — see
 * `src/generator/music/`.
 */
export function MusicPicker({ label, field, value, onChange, issues }: MusicPickerProps) {
  const fieldIssues = issues.filter((i) => i.field === field)
  return (
    <label className={`field ${fieldIssues.length > 0 ? 'field-error' : ''}`}>
      <span className="field-label">{label}</span>
      <select value={value ?? MUSIC_DEFAULT} onChange={(e) => onChange(e.target.value)}>
        <option value={MUSIC_DEFAULT}>Default (game decides)</option>
        {MUSIC_GROUPS.map(([group, tracks]) => (
          <optgroup key={group} label={group}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {fieldIssues.map((issue, i) => (
        <span key={i} className="field-message">
          {issue.message}
        </span>
      ))}
    </label>
  )
}
