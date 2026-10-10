import React from 'react'
import { MONSTER_FAMILIES, MONSTER_GROUPS, monsterTypesInGroup } from '../../generator'
import type { DungeonParameters } from '../../generator'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'

interface MonsterMaxTableProps {
  params: DungeonParameters
  onChange: (params: DungeonParameters) => void
}

/**
 * Max horde size per monster type — a lair spawns between max/5 and max of
 * its chosen type (times the monster multiplier).
 */
export function MonsterMaxTable({ params, onChange }: MonsterMaxTableProps) {
  const filter = useMonsterFilter()

  const setMax = (id: string, value: number) => {
    onChange({ ...params, monsterMax: { ...params.monsterMax, [id]: value } })
  }

  return (
    <div className="monster-max">
      <p className="hint">
        Horde size cap per monster type. A lair spawns roughly max/5 to max of its type, scaled by the
        monster multiplier. One cap covers every tier of its type, pinned or rolled. Types set to 0
        spawn nothing — avoid them in pools. A tower family has its own cap, which is the one that
        applies when you pool the family rather than a member.
      </p>
      <MonsterFilterBar filter={filter} label="monster types" />
      {MONSTER_GROUPS.map((group) => {
        // A type with a non-zero cap is pinned, the same way an in-pool type is
        // pinned in the editor: you can always find and reset what you changed.
        // Families sit beside the types whose caps they shadow, so a group's
        // caps are all in one place. Their members keep their own rows: those
        // still govern the arena and a pool that names a member directly.
        const families = MONSTER_FAMILIES.filter((f) => f.group === group)
        const members = monsterTypesInGroup(group).filter((t) =>
          filter.visible(t, (params.monsterMax[t.id] ?? 0) > 0)
        )
        if (members.length === 0 && families.length === 0) return null
        return (
          <details key={group} className="max-group" open={group === 'Classic'}>
            <summary>{group}</summary>
            <div className="max-grid">
              {families.map((f) => (
                <label key={f.id} className="max-item" title={`Cap for the ${f.id} family: ${f.members.join(', ')}`}>
                  <span>{f.id}</span>
                  <input
                    type="number"
                    min={0}
                    value={params.monsterMax[f.id] ?? 0}
                    onChange={(e) => setMax(f.id, e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                </label>
              ))}
              {members.map((t) => {
                const off = filter.offFilter(t)
                return (
                  <label
                    key={t.id}
                    className={off ? 'max-item off-filter' : 'max-item'}
                    title={off ? 'Has a cap set, but hidden by the current filter' : undefined}
                  >
                    <span>{t.id}</span>
                    <input
                      type="number"
                      min={0}
                      value={params.monsterMax[t.id] ?? 0}
                      onChange={(e) => setMax(t.id, e.target.value === '' ? 0 : Number(e.target.value))}
                    />
                  </label>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
