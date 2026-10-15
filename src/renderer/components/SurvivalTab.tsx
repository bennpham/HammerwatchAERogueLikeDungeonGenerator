import React from 'react'
import { SURVIVAL_COUNTDOWN_STYLES, SURVIVAL_SECONDS_MAX, arenaUsesBodyguards } from '../../generator'
import type { BossArenaOptions, SurvivalCountdown, SurvivalOptions, ValidationIssue } from '../../generator'
import { NumberField, Section, ToggleGroup } from './fields'
import { formatSeconds } from './FloorTimerEditor'
import { SurvivalWaveListEditor } from './SurvivalWaveListEditor'
import { SurvivalBuffListEditor } from './SurvivalBuffListEditor'
import { SurvivalPickupListEditor } from './SurvivalPickupListEditor'
import { SurvivalTrapListEditor } from './SurvivalTrapListEditor'

/** Sentence-case labels for the countdown style picker. */
const COUNTDOWN_LABELS: Record<SurvivalCountdown, string> = {
  off: 'Off',
  milestones: 'Milestones',
  seconds: 'Every second'
}

/** Tooltips explaining what each countdown style actually announces. */
const COUNTDOWN_TITLES: Record<SurvivalCountdown, string> = {
  off: 'No clock is shown at all.',
  milestones:
    'Announces every minute, then every 10 seconds under a minute, then every second in the last 10 — a fixed handful of nodes however long the round runs.',
  seconds:
    'Announces once per second for the whole round. Fine for a short round; a long one writes hundreds of script nodes.'
}

interface SurvivalTabProps {
  survival: SurvivalOptions
  /**
   * This fight's arena — read only for `arenaUsesBodyguards`, so the wave
   * editor's hover titles can show the bodyguard-twin path. The arena's own
   * fields (size, theme, music, …) are edited by `SharedArenaFields` in
   * BossForm, not here.
   */
  arena: BossArenaOptions
  /** validation field root for this fight's survival config, e.g. `boss.fights.0.survival` */
  fieldPrefix: string
  issues: ValidationIssue[]
  onChange: (patch: Partial<SurvivalOptions>) => void
}

/**
 * The Survival half of the Arena tab. Everything here is keyed to elapsed time
 * rather than to a boss's health, because there is no boss — see
 * `SurvivalOptions` in config/parameters.ts for why the arena runs its own
 * clock instead of the boss tier events.
 *
 * The four lists below are independent: a wave row, a buff window, a pickup
 * drop and a trap window each own their own timestamps, and none of them
 * replaces another the way a boss tier's buffs and traps do.
 */
export function SurvivalTab({ survival, arena, fieldPrefix, issues, onChange }: SurvivalTabProps) {
  return (
    <>
      <Section title="Timer" defaultOpen>
        <p className="hint">
          The party wins by surviving this long — there is no boss to kill, so nothing here is tied to
          a health threshold.
        </p>
        <div className="field-grid">
          <NumberField
            label="Round length (seconds)"
            field={`${fieldPrefix}.seconds`}
            value={survival.seconds}
            onChange={(seconds) => onChange({ seconds })}
            issues={issues}
            min={1}
            max={SURVIVAL_SECONDS_MAX}
            title={`How long the party must last, 1..${SURVIVAL_SECONDS_MAX}`}
          />
        </div>
        <p className="hint">{formatSeconds(survival.seconds)}</p>
        <ToggleGroup
          label="Countdown"
          value={survival.countdown}
          onChange={(countdown) => onChange({ countdown })}
          options={SURVIVAL_COUNTDOWN_STYLES.map((style) => ({
            value: style,
            label: COUNTDOWN_LABELS[style],
            title: COUNTDOWN_TITLES[style]
          }))}
        />
        {issues
          .filter((i) => i.field === `${fieldPrefix}.countdown`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Waves" defaultOpen badge={`${survival.waves.length} row(s)`}>
        <p className="hint">
          Each row spawns a flat count of one monster, starting at a given second and trickling in on
          its own interval from the nine anchors. A row is not a tier — the same monster can appear on
          several rows, and none of them cancels another. "50 bat3 at the start, 200 more two minutes
          in" is two rows naming the same monster.
        </p>
        <SurvivalWaveListEditor
          value={survival.waves}
          onChange={(waves) => onChange({ waves })}
          issuePrefix={`${fieldPrefix}.waves`}
          issues={issues}
          arenaTwins={arenaUsesBodyguards(arena)}
        />
      </Section>

      <Section title="Buffs" badge={survival.buffs.length > 0 ? `${survival.buffs.length} window(s)` : undefined}>
        <p className="hint">
          Each window covers the whole arena between two seconds marks. Windows are independent and may
          overlap — unlike a boss tier's buffs, one window never switches another off.
        </p>
        <SurvivalBuffListEditor
          value={survival.buffs}
          onChange={(buffs) => onChange({ buffs })}
          issuePrefix={`${fieldPrefix}.buffs`}
          issues={issues}
        />
      </Section>

      <Section title="Pickups" badge={survival.pickups.length > 0 ? `${survival.pickups.length} drop(s)` : undefined}>
        <p className="hint">
          Each drop lands on the entrance pickup pad at its own second mark and stays there — like a
          boss tier's drops, these never replace one another.
        </p>
        <SurvivalPickupListEditor
          value={survival.pickups}
          onChange={(pickups) => onChange({ pickups })}
          issuePrefix={`${fieldPrefix}.pickups`}
          issues={issues}
        />
      </Section>

      <Section title="Traps" badge={survival.traps.length > 0 ? `${survival.traps.length} window(s)` : undefined}>
        <p className="hint">
          Each window arms a set of wall spewers between two seconds marks. Windows may overlap and,
          unlike a boss tier's traps, do not switch each other off.
        </p>
        <SurvivalTrapListEditor
          value={survival.traps}
          onChange={(traps) => onChange({ traps })}
          issuePrefix={`${fieldPrefix}.traps`}
          issues={issues}
        />
      </Section>
    </>
  )
}
