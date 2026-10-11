import React from 'react'
import {
  PLAYER_STOCK,
  STAT_GROUPS,
  applyEverythingFree,
  applyFullyUpgraded,
  applyGroupFactor,
  applySpeedMode,
  classLabel,
  classesIn,
  deriveGroupFactor,
  deriveSpeedMode,
  setClassSpeed,
  setEveryoneSpeed,
  setGroupSpeed,
  speedGroupOf,
  speedOf,
  totalShopCost
} from '../../generator'
import type { PlayerTweaks, SpeedMode } from '../../generator'
import { CurveField, Subsection, ToggleGroup } from './fields'

interface QuickSetupProps {
  tweaks: PlayerTweaks
  onChange: (tweaks: PlayerTweaks) => void
}

const gold = (value: number): string => value.toLocaleString('en-US')

const SPEED_MODES: Array<{ value: SpeedMode; label: string; title: string }> = [
  {
    value: 'everyone',
    label: 'Everyone',
    title: 'One speed for every class, like the original Hammerwatch'
  },
  {
    value: 'group',
    label: 'Melee vs ranged',
    title: 'Melee classes (paladin, thief, warlock) and ranged classes apart, like AE ships'
  },
  {
    value: 'class',
    label: 'Per class',
    title: 'Each class its own speed; the generator gives each class its own copy of the speed skill'
  }
]

/**
 * Whole-roster knobs above the per-class sections. It owns no state: every
 * knob reads its value back out of `tweaks` and writes ordinary `player.*`
 * overrides, so what it sets shows (and stays editable) in the sections below
 * and exports to parameters.txt. Multipliers are measured from stock, so ×2
 * set twice is still ×2.
 */
export function QuickSetup({ tweaks, onChange }: QuickSetupProps) {
  const speedMode = deriveSpeedMode(tweaks)

  return (
    <>
      <p className="hint">
        Multiplies a stat everywhere it appears: the class&apos;s start, every skill and every upgrade tier, across all
        seven classes. <code>×1</code> is stock and stores nothing. Switch to the <strong>Loadout</strong> tab to see what a
        character ends up with.
      </p>

      <Subsection title="Multipliers" defaultOpen>
        <div className="field-grid">
          {STAT_GROUPS.map((group) => {
            const factor = deriveGroupFactor(group.id, tweaks)
            return (
              <CurveField
                key={group.id}
                label={`${group.label} ×${factor === null ? ' · custom' : ''}`}
                value={factor ?? 1}
                step={0.1}
                onChange={(v) => {
                  if (Number.isFinite(v) && v >= 0) onChange(applyGroupFactor(group.id, v, tweaks))
                }}
                title={group.description}
              />
            )
          })}
        </div>
        <p className="hint">Gold to buy every skill and upgrade, all classes: {gold(totalShopCost(tweaks))}.</p>
      </Subsection>

      <Subsection title="Move speed" defaultOpen>
        <ToggleGroup
          label="set speed for"
          value={speedMode}
          options={SPEED_MODES}
          onChange={(mode) => onChange(applySpeedMode(mode, tweaks))}
        />
        <div className="field-grid">
          {speedMode === 'everyone' && (
            <CurveField
              label="everyone"
              value={speedOf(tweaks, 'ranged')}
              step={0.05}
              onChange={(v) => Number.isFinite(v) && onChange(setEveryoneSpeed(tweaks, v))}
            />
          )}
          {speedMode === 'group' &&
            (['melee', 'ranged'] as const).map((group) => (
              <CurveField
                key={group}
                label={`${group} (${classesIn(group).map(classLabel).join(', ')})`}
                value={speedOf(tweaks, group)}
                step={0.05}
                onChange={(v) => Number.isFinite(v) && onChange(setGroupSpeed(tweaks, group, v))}
              />
            ))}
          {speedMode === 'class' &&
            PLAYER_STOCK.classes.map((c) => (
              <CurveField
                key={c.id}
                label={classLabel(c.id)}
                value={speedOf(tweaks, speedGroupOf(c.id), c.id)}
                step={0.05}
                onChange={(v) => Number.isFinite(v) && onChange(setClassSpeed(tweaks, c.id, v))}
              />
            ))}
        </div>
        <p className="hint">
          A multiplier on the base walking speed. AE ships ranged classes at 1.0 and melee classes at 1.2; the original game
          had 0.9 for everyone. The three speed upgrades in the shop follow at +0.1 each.
        </p>
      </Subsection>

      <Subsection title="Shortcuts" defaultOpen>
        <div className="quick-setup-presets">
          <button type="button" onClick={() => onChange(applyEverythingFree(tweaks))}>
            Everything free
          </button>
          <button type="button" onClick={() => onChange(applyFullyUpgraded(tweaks))}>
            Fully upgraded
          </button>
          <button type="button" onClick={() => onChange({})}>
            Reset to AE stock
          </button>
        </div>
        <p className="hint">
          <strong>Everything free</strong> sets every price to 0: skills, upgrades, potions and items.{' '}
          <strong>Fully upgraded</strong> gives every class every one of its skills from the start, each at the top of its
          own ladder, starts it at its best health and mana, and makes everything free. <strong>Reset</strong> clears every
          player setting.
        </p>
      </Subsection>
    </>
  )
}
