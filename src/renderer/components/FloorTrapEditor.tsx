import { projectileById } from '../../generator'
import type { DungeonParameters, FloorTrap, ValidationIssue } from '../../generator'
import { TrapListEditor } from './TrapListEditor'

interface FloorTrapEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Wall traps per floor: projectile spewers standing on room walls, firing
 * across the room from the moment the party arrives.
 *
 * One collapsible block per floor, the same shape as FloorBuffEditor above it,
 * and reusing the Boss tab's TrapListEditor for the rows — a floor's trap row
 * and a wave tier's carry the same five fields, so the two must not drift on
 * what they look like or how they are edited. The one deliberate divergence is
 * `maxCount={undefined}`: a wave tier's count is capped at MAX_TRAP_COUNT
 * because it is spent on one fixed-size arena wall, but a floor's count is
 * spread across every eligible room on the whole floor, which has no
 * comparable ceiling — running the pool dry is a graceful, warned-about stop,
 * not something validation needs to pre-empt.
 *
 * Every floor starts empty, so a campaign that ignores this section is
 * byte-for-byte the campaign you would get without the feature.
 */
export function FloorTrapEditor({ params, issues, onChange }: FloorTrapEditorProps) {
  const count = Math.max(params.levels, 0) || 0

  /** The array padded out to the floor count, so indexing is always safe. */
  const floors = (): FloorTrap[][] => {
    const next = (params.levelTraps ?? []).map((list) => list.map((t) => ({ ...t })))
    while (next.length < count) next.push([])
    return next
  }

  const setFloor = (level: number, rows: FloorTrap[]) => {
    const next = floors()
    next[level] = rows
    onChange({ ...params, levelTraps: next })
  }

  const copyDown = (level: number) => {
    const next = floors()
    for (let i = level + 1; i < count; i++) next[i] = next[level].map((t) => ({ ...t }))
    onChange({ ...params, levelTraps: next })
  }

  return (
    <div className="floor-traps">
      <p className="hint">
        A trap stands on the wall it fires <em>away</em> from — one firing north sits along a room's
        south wall and shoots across it. The count is spewers on the whole floor, spread over every
        room that can take one; the entrance, the shop and the sealed final room are always left
        alone, and so are doorways and the stairs. They are live from the moment the floor loads. No
        floor carries one by default.
      </p>
      {issues
        .filter((i) => i.field === 'levelTraps')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      {Array.from({ length: count }, (_, level) => {
        const rows = params.levelTraps?.[level] ?? []
        const summary =
          rows.length === 0
            ? 'none'
            : rows.map((t) => projectileById(t.projectile)?.label ?? t.projectile).join(', ')
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">{summary}</span>
            </summary>
            <div className="section-body">
              {issues
                .filter((i) => i.field === `levelTraps.${level}`)
                .map((issue, i) => (
                  <p key={i} className="field-message">
                    {issue.message}
                  </p>
                ))}
              <TrapListEditor
                value={rows}
                onChange={(next) => setFloor(level, next)}
                noun="floor"
                maxCount={undefined}
                issuePrefix={`levelTraps.${level}`}
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
