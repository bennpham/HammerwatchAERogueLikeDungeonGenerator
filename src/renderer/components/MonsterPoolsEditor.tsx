import React from 'react'
import type { DungeonParameters, ValidationIssue } from '../../generator'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { MonsterPoolPicker, weightOf } from './MonsterPoolPicker'

interface MonsterPoolsEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Which monsters each level draws its lairs from. Every lair picks one entry
 * from the pool at random, so an entry's weight is simply how many times it
 * appears in the list.
 */
export function MonsterPoolsEditor({ params, issues, onChange }: MonsterPoolsEditorProps) {
  const filter = useMonsterFilter()

  const commit = (level: number, pool: string[]) => {
    const pools = params.levelMonsters.map((p) => [...p])
    while (pools.length <= level) pools.push([])
    pools[level] = pool
    onChange({ ...params, levelMonsters: pools })
  }

  return (
    <div className="monster-pools">
      <p className="hint">
        Each lair room rolls one entry from its level's pool. Weight is how many slots an entry
        takes, so a 2 is picked twice as often as a 1.
      </p>
      <p className="hint pool-variant-hint">
        A bare name rolls between that monster's tiers; a “#” suffix pins one exact actor, so
        “skeleton1#1” is always the small skeleton and “skeleton1#3” always the elite. A tower
        family like “tower_banner” rolls evenly between separate towers.
        <InfoTip
          text={
            'Each monster type ships one actor per tier — #0 is usually the spawner building, then the small, ordinary and elite versions. The bare name rolls among them the way the original tool did, which is the varied option; pin a tier when a floor needs one specific monster. A tower family is the same idea one level up: it rolls evenly between several separate towers, and expanding it lets you pick one of them instead. Hover an entry to see the exact actor file it spawns.'
          }
        />
      </p>
      {issues
        .filter((i) => i.field === 'levelMonsters')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <MonsterFilterBar filter={filter} />
      {Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, level) => {
        const pool = params.levelMonsters[level] ?? []
        // Distinct entries, in pool order, for the summary line — a weighted
        // pool would otherwise read "maggot, maggot, maggot".
        const picked = [...new Set(pool)]
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">
                {picked.length > 0
                  ? picked.map((k) => (weightOf(pool, k) > 1 ? `${k}×${weightOf(pool, k)}` : k)).join(', ')
                  : '(empty!)'}
              </span>
            </summary>
            <MonsterPoolPicker
              pool={pool}
              filter={filter}
              hint="Comma-separated. Repeat an entry to weight it; paste a list to replace this level's pool."
              onCommit={(next) => commit(level, next)}
            />
          </details>
        )
      })}
    </div>
  )
}
