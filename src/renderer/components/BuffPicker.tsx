import React from 'react'
import { BUFF_DEFS, BUFF_GROUPS, BUFF_TARGETS, buffById } from '../../generator'
import type { BuffTarget } from '../../generator'
import { InfoTip } from './InfoTip'

/** Sentence case for the target dropdown; the stored values stay lowercase. */
const TARGET_LABELS: Record<BuffTarget, string> = {
  players: 'Players',
  monsters: 'Monsters',
  both: 'Both'
}

interface BuffPickerProps {
  /** A BUFF_DEFS id from objects/buffTypes.ts. */
  buff: string
  target: BuffTarget
  onChange: (change: { buff?: string; target?: BuffTarget }) => void
  /** Rendered after the target select, e.g. a remove button. */
  children?: React.ReactNode
}

/**
 * One buff choice: which buff, and who it catches.
 *
 * Shared by the per-floor editor and the boss arena's per-tier editor (through
 * BuffListEditor) so the two cannot drift on the group order or the target
 * labels. Every option carries its buff's description as a `title`, so the
 * dropdown explains itself while it is open, and the InfoTip repeats the
 * *selected* buff's description beside the row once it is closed — a dungeon
 * master picking "banner_drain" should not have to open the game's own asset
 * folder to find out what it does.
 *
 * There is no "no buff" option: an empty list is how a floor or a tier says it
 * carries none, so every row here always names a buff.
 */
export function BuffPicker({ buff, target, onChange, children }: BuffPickerProps) {
  return (
    <div className="buff-row">
      <BuffSelect buff={buff} onChange={(next) => onChange({ buff: next })} />
      <BuffTargetSelect className="buff-target" target={target} onChange={(next) => onChange({ target: next })} />
      {children}
    </div>
  )
}

/**
 * BuffPicker's grouped buff dropdown plus its InfoTip, on their own — for an
 * editor that lays the target and its other fields out under the buff rather
 * than beside it (the survival arena's timed windows).
 */
export function BuffSelect({ buff, onChange }: { buff: string; onChange: (buff: string) => void }) {
  const selected = buffById(buff)

  return (
    <>
      <select
        className="buff-select"
        value={buff}
        onChange={(e) => onChange(e.target.value)}
        title={selected?.description ?? 'Pick a buff'}
      >
        {BUFF_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {BUFF_DEFS.filter((def) => def.group === group).map((def) => (
              <option key={def.id} value={def.id} title={def.description}>
                {def.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && <InfoTip text={selected.description} />}
    </>
  )
}

interface BuffTargetSelectProps {
  target: BuffTarget
  onChange: (target: BuffTarget) => void
  className?: string
}

/** Who a buff catches — BuffPicker's second control, on its own for the same reason as BuffSelect. */
export function BuffTargetSelect({ target, onChange, className }: BuffTargetSelectProps) {
  return (
    <select
      className={className}
      value={target}
      onChange={(e) => onChange(e.target.value as BuffTarget)}
      title="Who the field catches. Monsters and players are separate — a buff aimed at the horde never touches the party."
    >
      {BUFF_TARGETS.map((t) => (
        <option key={t} value={t}>
          {TARGET_LABELS[t]}
        </option>
      ))}
    </select>
  )
}
