import React from 'react'
import { MONSTER_VARIANT_GROUPS, arenaActorPath, monsterNote, monsterVariantsInGroup } from '../../generator'
import type { MonsterFilter as MonsterFilterState } from './MonsterFilterBar'

/** ` — <note>` for a variant that has a behaviour note, empty string otherwise. */
function noteSuffix(key: string): string {
  const note = monsterNote(key)
  return note ? ` — ${note}` : ''
}

/**
 * The actor path to show in an option's hover title. Twin of WaveEditor's
 * `displayActorPath` — when `arenaTwins` is set (this fight's arena has
 * bodyguard twins on) and `actorPath` has a twin in `ARENA_BODYGUARD_TWINS`,
 * shows the twin path alongside the ordinary one it stands in for. Purely
 * informational: the generator decides the real substitution at build time.
 */
function displayActorPath(actorPath: string, arenaTwins: boolean | undefined): string {
  if (!arenaTwins) return actorPath
  const twin = arenaActorPath(actorPath)
  return twin === actorPath ? actorPath : `${twin} (arena bodyguard version of ${actorPath})`
}

/** The first variant in the first non-empty group — what a fresh row starts on. */
export function firstMonsterKey(): string {
  for (const group of MONSTER_VARIANT_GROUPS) {
    const members = monsterVariantsInGroup(group)
    if (members.length > 0) return members[0].key
  }
  return ''
}

export interface MonsterVariantSelectProps {
  value: string
  filter: MonsterFilterState
  onChange: (key: string) => void
  /**
   * True when this fight's arena has bodyguard twins on
   * (`arenaUsesBodyguards`) — passed down from `SurvivalTab`, which reads it
   * off the fight's own arena. Purely cosmetic, like WaveEditor's identical
   * prop.
   */
  arenaTwins?: boolean
}

/**
 * Every canonical monster variant key, grouped the same way WaveEditor's
 * checkbox roster is — but as a single-select dropdown, because a survival row
 * or a mystery button row names exactly one monster rather than a pool. The currently chosen key always
 * stays in the list even when the filter would otherwise hide it, the same
 * "a pick stays reachable" rule the checkbox roster follows.
 */
export function MonsterVariantSelect({ value, filter, onChange, arenaTwins }: MonsterVariantSelectProps) {
  return (
    <select className="buff-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {MONSTER_VARIANT_GROUPS.map((group) => {
        const members = monsterVariantsInGroup(group).filter(
          (v) => v.key === value || filter.visible(v.type, false, v.key)
        )
        if (members.length === 0) return null
        return (
          <optgroup key={group} label={group}>
            {members.map((v) => (
              <option
                key={v.key}
                value={v.key}
                title={`${displayActorPath(v.actorPath, arenaTwins)}${noteSuffix(v.key)}`}
              >
                {v.key}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
