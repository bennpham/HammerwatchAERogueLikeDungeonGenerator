import React from 'react'
import { MAX_BOSS_COUNT, lineupTotal } from '../../generator'
import type { BossId, BossSelection, ValidationIssue } from '../../generator'
import { NumberField, ToggleGroup } from './fields'

/** One checkbox/lineup row's boss — id, display label, and whether it is capped at 1 (dragon/queen). */
export interface BossPoolEntry {
  id: BossId
  label: string
  unique: boolean
}

/** The subset of `BossArenaOptions`/`DungeonBoss` this editor reads and writes. */
export interface BossSelectionPatch {
  bossSelection?: BossSelection
  bossPool?: string[]
  bossCount?: number
  bossLineup?: Partial<Record<BossId, number>>
}

interface BossSelectionEditorProps {
  selection: BossSelection
  bossPool: string[]
  /** The effective count (`arenaBossCount`/`floorBossCount`) — already lineup-aware. */
  bossCount: number
  bossLineup: Partial<Record<BossId, number>> | undefined
  /** The pickable bosses — `BOSS_DEF_LIST` for an arena, mobile-only for a floor. */
  defs: readonly BossPoolEntry[]
  /** validation field root, e.g. `boss.fights.0.arena` or `levelBoss.3` */
  fieldPrefix: string
  issues: ValidationIssue[]
  onChange: (patch: BossSelectionPatch) => void
}

/**
 * Shared "Random from pool / Exact lineup" editor for a boss selection —
 * `BossArenaOptions` (arena, all seven bosses) and `DungeonBoss` (floor,
 * mobile bosses only) both carry the same `bossSelection`/`bossPool`/
 * `bossCount`/`bossLineup` shape, so this is the one place that edits it.
 *
 * Switching modes patches only `bossSelection` (and, the first time INTO
 * lineup mode with nothing stored yet, a seeded `bossLineup`) — `bossPool`,
 * `bossCount` and any existing `bossLineup` are left alone, so flipping back
 * loses nothing (the same losslessness `arenaMode` already promises for a
 * survival fight's boss-only fields).
 */
export function BossSelectionEditor({
  selection,
  bossPool,
  bossCount,
  bossLineup,
  defs,
  fieldPrefix,
  issues,
  onChange
}: BossSelectionEditorProps) {
  const setSelection = (next: BossSelection) => {
    if (next === selection) return
    if (next === 'lineup') {
      // Seed a fresh lineup only when nothing is stored yet (total 0), so a
      // dungeon master switching modes for the first time sees at least one
      // boss instead of an all-zero grid that generates nothing.
      if (lineupTotal(bossLineup) > 0) {
        onChange({ bossSelection: 'lineup' })
      } else {
        const seedId = defs.find((d) => bossPool.includes(d.id))?.id ?? defs[0]?.id
        onChange({
          bossSelection: 'lineup',
          bossLineup: seedId !== undefined ? { ...bossLineup, [seedId]: 1 } : bossLineup
        })
      }
    } else {
      // 'random' is the absent default — storing undefined keeps a
      // random-mode object byte-identical to one that never had the field.
      onChange({ bossSelection: undefined })
    }
  }

  const setLineupCount = (id: BossId, count: number) => {
    const next = { ...bossLineup }
    if (!Number.isFinite(count) || count <= 0) delete next[id]
    else next[id] = Math.trunc(count)
    onChange({ bossLineup: next })
  }

  const toggleBoss = (id: string, on: boolean) => {
    const next = new Set(bossPool)
    if (on) next.add(id)
    else next.delete(id)
    onChange({ bossPool: [...next] })
  }

  return (
    <>
      <ToggleGroup
        label="Selection"
        value={selection}
        onChange={setSelection}
        options={[
          { value: 'random', label: 'Random from pool', title: 'The seed rolls this many bosses from the checked pool' },
          { value: 'lineup', label: 'Exact lineup', title: 'Place exactly these bosses — nothing is rolled' }
        ]}
      />
      {issues
        .filter((i) => i.field === `${fieldPrefix}.bossSelection`)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}

      {selection === 'lineup' ? (
        <>
          <p className="hint">Exactly these bosses appear. Dragon and Queen can appear at most once.</p>
          <div className="field-grid">
            {defs.map((def) => (
              <NumberField
                key={def.id}
                label={def.label}
                field={`${fieldPrefix}.bossLineup.${def.id}`}
                value={bossLineup?.[def.id] ?? 0}
                onChange={(v) => setLineupCount(def.id, v)}
                issues={[]}
                min={0}
                max={def.unique ? 1 : MAX_BOSS_COUNT}
                step={1}
              />
            ))}
          </div>
          <p className="hint">
            <strong>Total: {bossCount} boss{bossCount === 1 ? '' : 'es'}</strong>
          </p>
          {issues
            .filter((i) => i.field === `${fieldPrefix}.bossLineup`)
            .map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
        </>
      ) : (
        <>
          <p className="hint">The seed picks {bossCount === 1 ? 'one boss' : `${bossCount} bosses`} from this pool.</p>
          <NumberField
            label="Number of bosses"
            field={`${fieldPrefix}.bossCount`}
            value={bossCount}
            onChange={(v) => onChange({ bossCount: !Number.isFinite(v) || v === 1 ? undefined : v })}
            issues={issues}
            min={1}
            max={MAX_BOSS_COUNT}
            step={1}
            title="How many bosses this arena rolls at once"
          />
          <p className="hint">Dragon and Queen can appear at most once.</p>
          <div className="pool-checkboxes">
            {defs.map((def) => (
              <label key={def.id} className="pool-checkbox">
                <input
                  type="checkbox"
                  checked={bossPool.includes(def.id)}
                  onChange={(e) => toggleBoss(def.id, e.target.checked)}
                />
                {def.label}
              </label>
            ))}
          </div>
          {issues
            .filter((i) => i.field === `${fieldPrefix}.bossPool`)
            .map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
        </>
      )}
    </>
  )
}
