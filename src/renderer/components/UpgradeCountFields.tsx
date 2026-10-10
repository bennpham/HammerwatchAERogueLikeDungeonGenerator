import React from 'react'
import { UPGRADE_COUNT_MAX, UPGRADE_KINDS } from '../../generator'
import type { UpgradeCounts, UpgradeKind, ValidationIssue } from '../../generator'
import { NumberField, Section } from './fields'

interface UpgradeCountFieldsProps {
  /** the room's counts, or undefined for a config written before the feature */
  upgrades: UpgradeCounts | undefined
  /** the validation field both rooms report under, e.g. `lobby.upgrades` */
  field: string
  issues: ValidationIssue[]
  onChange: (upgrades: UpgradeCounts) => void
}

/** What each kind is called in the form, in `UPGRADE_KINDS` order. */
const LABELS: Readonly<Record<UpgradeKind, string>> = {
  damage: 'Damage',
  defense: 'Defense',
  health: 'Health',
  mana: 'Mana',
  damage2: 'Damage II',
  defense2: 'Defense II',
  health2: 'Health II',
  mana2: 'Mana II'
}

const TIER_1 = UPGRADE_KINDS.filter((kind) => !kind.endsWith('2'))
const TIER_2 = UPGRADE_KINDS.filter((kind) => kind.endsWith('2'))

/**
 * The free upgrade pickups a room lays on the floor.
 *
 * The lobby and the boss prep room carry the identical control, so it lives
 * here rather than being written twice — the only differences are which options
 * object it edits and which validation field its messages come back under.
 */
export function UpgradeCountFields({ upgrades, field, issues, onChange }: UpgradeCountFieldsProps) {
  const counts = upgrades ?? (Object.fromEntries(UPGRADE_KINDS.map((k) => [k, 0])) as UpgradeCounts)
  const total = UPGRADE_KINDS.reduce((sum, kind) => sum + (counts[kind] || 0), 0)

  const set = (kind: UpgradeKind, value: number) => onChange({ ...counts, [kind]: value })

  const row = (kinds: readonly UpgradeKind[]) => (
    <div className="field-grid">
      {kinds.map((kind) => (
        <NumberField
          key={kind}
          label={LABELS[kind]}
          // every kind reports under the room's one field, so a message lands
          // on all eight rather than on the wrong one
          field={field}
          value={counts[kind] ?? 0}
          onChange={(value) => set(kind, value)}
          issues={[]}
          min={0}
          max={UPGRADE_COUNT_MAX}
          step={1}
          title={`How many ${LABELS[kind]} pickups lie on the floor`}
        />
      ))}
    </div>
  )

  return (
    <Section title="Free upgrades" badge={`${total}`}>
      <p className="hint">
        Upgrade pickups lying on the floor, free to whoever walks over them — the same items the
        vendors sell, handed out rather than bought. Each kind has one spot in the room, so more
        than one of a kind stacks on that spot; there is no cap. Set a kind to 0 to leave it out
        entirely.
      </p>
      {row(TIER_1)}
      <br/>
      {row(TIER_2)}
      {issues
        .filter((i) => i.field === field)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
    </Section>
  )
}
