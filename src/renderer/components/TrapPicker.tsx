import React from 'react'
import { BOSS_TRAP_DIRECTIONS, PROJECTILE_DEFS, PROJECTILE_GROUPS, TRAP_SPREAD_MAX, projectileById } from '../../generator'
import type { BossTrap, BossTrapDirection } from '../../generator'
import { InfoTip } from './InfoTip'

/** Which wall a direction's spewers stand on — the one they fire away from. */
const WALL_OF: Record<BossTrapDirection, string> = {
  up: 'south',
  down: 'north',
  left: 'east',
  right: 'west'
}

interface TrapPickerProps {
  trap: BossTrap
  onChange: (change: Partial<BossTrap>) => void
  /**
   * Upper bound on `count`, or `undefined` for none. Required rather than
   * defaulted so every caller states its own bound on purpose: a boss tier's
   * wall is a fixed rectangle (MAX_TRAP_COUNT), a floor's pool is every
   * eligible room on it and has no comparable ceiling.
   */
  maxCount: number | undefined
  /** Rendered in the header, right of the projectile — e.g. a remove button. */
  children?: React.ReactNode
}

/**
 * One trap row: which projectile, which way it fires, how wide it fans, how
 * often it shoots, and how many spewers of it to place.
 *
 * Unlike BuffPicker and PickupPicker it is a card, not a single flex line: five
 * controls squeezed onto one row inside the boss panel left every field a few
 * characters wide and unlabelled. The projectile select and Remove keep the top
 * line to themselves; the four numbers/enums sit under it in a labelled grid
 * that wraps, so each one says what it is at any panel width.
 *
 * There is no "no projectile" option: an empty list is how a tier says it runs
 * no traps, so every row here always names one.
 */
export function TrapPicker({ trap, onChange, maxCount, children }: TrapPickerProps) {
  const selected = projectileById(trap.projectile)

  return (
    <div className="trap-row">
      <div className="trap-head">
        <select
          className="trap-projectile"
          value={trap.projectile}
          onChange={(e) => onChange({ projectile: e.target.value })}
          title={selected?.description ?? 'Pick a projectile'}
        >
          {PROJECTILE_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {PROJECTILE_DEFS.filter((def) => def.group === group).map((def) => (
                <option key={def.id} value={def.id} title={def.description}>
                  {def.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selected && <InfoTip text={selected.description} />}
        {children}
      </div>

      <div className="trap-fields">
        <label className="trap-field">
          <span className="field-label">Fires</span>
          <select
            value={trap.direction}
            onChange={(e) => onChange({ direction: e.target.value as BossTrapDirection })}
            title={`Which way it fires. It stands on the wall it fires away from — ${WALL_OF[trap.direction]} for "${trap.direction}".`}
          >
            {BOSS_TRAP_DIRECTIONS.map((d) => (
              <option key={d} value={d} title={`Stands on the ${WALL_OF[d]} wall and fires ${d} across the arena.`}>
                {d} (from {WALL_OF[d]})
              </option>
            ))}
          </select>
        </label>

        <label className="trap-field">
          <span className="field-label">Spread</span>
          <input
            type="number"
            min={0}
            max={TRAP_SPREAD_MAX}
            step={0.1}
            value={trap.spread}
            // A blank field would store NaN mid-retype, so it reads as 0 — a single
            // linear stream, which is what "Add trap" starts a row on.
            onChange={(e) => onChange({ spread: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
            title={`How wide it fans, 0..${TRAP_SPREAD_MAX}. 0 is a single straight stream; 0.5 is the reference axe rig; ${TRAP_SPREAD_MAX} is the widest the engine accepts.`}
          />
        </label>

        <label className="trap-field">
          <span className="field-label">Rate (ms)</span>
          <input
            type="number"
            min={1}
            step={50}
            value={trap.spawnRateMs}
            onChange={(e) => onChange({ spawnRateMs: e.target.value === '' ? 1000 : parseInt(e.target.value, 10) })}
            title="Milliseconds between shots. The engine sets no limit — 1000 is a shot a second, 100 is a barrage, and anything under 50 floods the arena."
          />
        </label>

        <label className="trap-field">
          <span className="field-label">Count</span>
          <input
            type="number"
            min={1}
            max={maxCount}
            step={1}
            value={trap.count}
            onChange={(e) => onChange({ count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
            title={
              maxCount === undefined
                ? `How many spewers of this row to place, at least 1. Each gets its own seeded position along the ${WALL_OF[trap.direction]} wall.`
                : `How many spewers of this row to place, 1..${maxCount}. Each gets its own seeded position along the ${WALL_OF[trap.direction]} wall.`
            }
          />
        </label>
      </div>
    </div>
  )
}
