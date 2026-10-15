import { buffById } from '../../generator'
import type { DungeonParameters, FloorBuff, ValidationIssue } from '../../generator'
import { BuffListEditor } from './BuffListEditor'

interface FloorBuffEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Buff auras: a floor can wear any number of the game's buffs, each aimed at
 * players, monsters or both.
 *
 * One collapsible block per floor, same shape as FloorTimerEditor beneath it —
 * and, like it, every floor starts empty, so a campaign that ignores this
 * section is byte-for-byte the campaign you would get without the feature.
 * "Copy to floors below" exists for the same reason it does there: the common
 * setup is one policy escalating down the dungeon.
 */
export function FloorBuffEditor({ params, issues, onChange }: FloorBuffEditorProps) {
  const count = Math.max(params.levels, 0) || 0

  /** The array padded out to the floor count, so indexing is always safe. */
  const floors = (): FloorBuff[][] => {
    const next = (params.levelBuffs ?? []).map((list) => list.map((b) => ({ ...b })))
    while (next.length < count) next.push([])
    return next
  }

  const setFloor = (level: number, buffs: FloorBuff[]) => {
    const next = floors()
    next[level] = buffs
    onChange({ ...params, levelBuffs: next })
  }

  const copyDown = (level: number) => {
    const next = floors()
    for (let i = level + 1; i < count; i++) next[i] = next[level].map((b) => ({ ...b }))
    onChange({ ...params, levelBuffs: next })
  }

  return (
    <div className="floor-buffs">
      <p className="hint">
        A buff aura covers the whole floor and is live from the moment the party arrives — there is
        no countdown, and it never switches off. Pick who it catches: a buff aimed at the horde never
        touches the party, and vice versa. No floor carries one by default.
      </p>
      {issues
        .filter((i) => i.field === 'levelBuffs')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      {Array.from({ length: count }, (_, level) => {
        const buffs = params.levelBuffs?.[level] ?? []
        const summary =
          buffs.length === 0
            ? 'none'
            : buffs.map((b) => buffById(b.buff)?.label ?? b.buff).join(', ')
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">{summary}</span>
            </summary>
            <div className="section-body">
              <BuffListEditor
                value={buffs}
                onChange={(next) => setFloor(level, next)}
                noun="floor"
                issuePrefix={`levelBuffs.${level}`}
                issues={issues}
              />
              {level < count - 1 && (
                <button type="button" className="copy-down" onClick={() => copyDown(level)}>
                  Copy to floors below
                </button>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
