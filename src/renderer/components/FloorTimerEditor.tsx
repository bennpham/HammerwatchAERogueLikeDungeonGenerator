import React from 'react'
import { defaultFloorTimer, floorBossCount, isMultiBoss } from '../../generator'
import type { DungeonParameters, FloorTimer, ValidationIssue } from '../../generator'
import { BoolField, NumberField } from './fields'

interface FloorTimerEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * `M:SS`, matching what the countdown announces in game.
 *
 * Exported because SurvivalTab needs the exact same rendering for its own
 * seconds field — a survival round's clock is the same "M:SS" shape.
 */
export function formatSeconds(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '—'
  return `${Math.trunc(total / 60)}:${String(Math.trunc(total) % 60).padStart(2, '0')}`
}

/**
 * Timer mode: after a countdown, the whole floor turns into a damage field.
 *
 * One collapsible block per floor, same shape as MonsterPoolsEditor — every
 * floor carries its own countdown, damage and frequency, and every floor is off
 * until the dungeon master turns it on. "Copy to floors below" exists because
 * the common setup is one policy escalating down the dungeon, and retyping four
 * numbers per floor is the tedious part.
 */
export function FloorTimerEditor({ params, issues, onChange }: FloorTimerEditorProps) {
  const count = Math.max(params.levels, 0) || 0

  /** The array padded out to the floor count, so indexing is always safe. */
  const timers = (): FloorTimer[] => {
    const next = (params.levelTimers ?? []).map((t) => ({ ...t }))
    while (next.length < count) next.push(defaultFloorTimer())
    return next
  }

  const patch = (level: number, change: Partial<FloorTimer>) => {
    const next = timers()
    next[level] = { ...next[level], ...change }
    onChange({ ...params, levelTimers: next })
  }

  const copyDown = (level: number) => {
    const next = timers()
    for (let i = level + 1; i < count; i++) next[i] = { ...next[level] }
    onChange({ ...params, levelTimers: next })
  }

  return (
    <div className="floor-timers">
      <p className="hint">
        After the countdown runs out, the whole floor starts damaging the party every few
        milliseconds until they leave it. Negative damage heals instead. Monsters are never
        affected. Off on every floor by default — a floor left off is byte-for-byte the floor you
        would get without this feature.
      </p>
      {issues
        .filter((i) => i.field === 'levelTimers')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      {Array.from({ length: count }, (_, level) => {
        const timer = params.levelTimers?.[level] ?? defaultFloorTimer()
        const verb = timer.damage < 0 ? 'heal' : 'damage'
        // A boss floor's invulnerability windows announce their own countdown;
        // running the timer's countdown alongside it on the same floor is the
        // exact conflict validation blocks on (levelBoss.<i>.invulnerability).
        // Disabling the toggle here stops a dungeon master introducing that
        // conflict from this side, rather than only catching it after the fact.
        // A multi-boss floor skips invulnerability outright (isMultiBoss), so
        // the two can coexist there and this must not lock the timer out.
        const floorBoss = params.levelBoss?.[level]
        const bossInvulnOn =
          floorBoss?.enabled === true &&
          floorBoss.invulnerability.enabled &&
          !isMultiBoss(floorBossCount(floorBoss))
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">
                {timer.enabled
                  ? `${formatSeconds(timer.seconds)} → ${Math.abs(timer.damage)} ${verb} / ${timer.freqMs}ms`
                  : 'off'}
              </span>
            </summary>
            <div className="section-body">
              <BoolField
                label="Timer on for this floor"
                checked={timer.enabled}
                // Only blocks turning it ON — if a conflict already exists
                // (e.g. from an imported file), the toggle must stay usable so
                // the dungeon master can clear it from this side too.
                disabled={bossInvulnOn && !timer.enabled}
                onChange={(enabled) => patch(level, { enabled })}
                title={
                  bossInvulnOn
                    ? 'Disabled: this floor\'s boss invulnerability is on, and the two cannot announce competing countdowns on one floor. Turn invulnerability off on the Boss tab first.'
                    : 'Arms a floor-wide damage field once the countdown ends'
                }
              />
              {bossInvulnOn && !timer.enabled && (
                <p className="hint">
                  This floor's boss invulnerability is on (see the Dungeon tab's Boss sub-tab), so the
                  timer stays off here.
                </p>
              )}
              {timer.enabled && (
                <>
                  <div className="field-grid">
                    <NumberField
                      label="Countdown (seconds)"
                      field={`levelTimers.${level}.seconds`}
                      value={timer.seconds}
                      onChange={(seconds) => patch(level, { seconds })}
                      issues={issues}
                      min={1}
                      max={3600}
                      title="How long the party has before the floor turns on them"
                    />
                    <NumberField
                      label="Damage per tick"
                      field={`levelTimers.${level}.damage`}
                      value={timer.damage}
                      onChange={(damage) => patch(level, { damage })}
                      issues={issues}
                      min={-10000}
                      max={10000}
                      title="Negative heals instead of hurting"
                    />
                    <NumberField
                      label="Frequency (ms)"
                      field={`levelTimers.${level}.freqMs`}
                      value={timer.freqMs}
                      onChange={(freqMs) => patch(level, { freqMs })}
                      issues={issues}
                      min={50}
                      max={600000}
                      step={50}
                      title="Milliseconds between applications once the field is live"
                    />
                  </div>
                  <BoolField
                    label="Announce the countdown every second"
                    checked={timer.countdown}
                    onChange={(countdown) => patch(level, { countdown })}
                    title="One announce node per second — a long countdown makes a large level file"
                  />
                  {issues
                    .filter((i) => i.field === `levelTimers.${level}.countdown`)
                    .map((issue, i) => (
                      <p key={i} className="field-message">
                        {issue.message}
                      </p>
                    ))}
                </>
              )}
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
