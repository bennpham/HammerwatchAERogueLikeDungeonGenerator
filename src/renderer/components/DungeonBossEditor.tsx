import React, { useState } from 'react'
import {
  BOSS_DEATH_WAVE,
  BOSS_DEF_LIST,
  bossSelection,
  defaultDungeonBoss,
  floorBossCount,
  isMultiBoss,
  pickupById,
  waveBuffs,
  wavePickups,
  waveTraps
} from '../../generator'
import type { DungeonBoss, DungeonParameters, BossWave, ValidationIssue } from '../../generator'
import { NumberField, Section, Subsection } from './fields'
import { BuffListEditor } from './BuffListEditor'
import { TrapListEditor } from './TrapListEditor'
import { PickupListEditor } from './PickupListEditor'
import { WaveEditor, WAVE_LABELS } from './WaveEditor'
import { InvulnerabilityEditor, invulnBadge } from './InvulnerabilityEditor'
import { CheckpointsEditor, checkpointBadge } from './CheckpointsEditor'
import { BossSelectionEditor } from './BossSelectionEditor'

interface DungeonBossEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/** "boss_queen" -> "Queen" for the checkbox grid — same convention as BossForm's bossLabel. */
function bossLabel(id: string): string {
  const name = id.replace(/^boss_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Only bosses that can chase the party across a floor — see MOBILE_BOSS_IDS. */
const MOBILE_BOSS_DEFS = BOSS_DEF_LIST.filter((def) => def.mobile)

/**
 * Dungeon -> Boss: a mobile boss standing on an ordinary dungeon floor
 * (issue #61). Lives in the Dungeon tab's Boss sub-tab, alongside the same
 * Standard controls — this is still that floor, just with a boss added.
 *
 * Shape follows BossForm's arena editor deliberately: an enable toggle per
 * floor, then `Boss 1 … Boss n` sub-tabs over the floors that are enabled,
 * each one reusing WaveEditor / InvulnerabilityEditor / CheckpointsEditor so
 * the two boss surfaces cannot drift on how a tier, an invuln window or a
 * checkpoint preset is edited.
 */
export function DungeonBossEditor({ params, issues, onChange }: DungeonBossEditorProps) {
  // Index into the ENABLED-floor list, not a floor number — mirrors
  // BossForm's fightIndex, clamped rather than reset when the list shrinks.
  const [tabIndex, setTabIndex] = useState(0)

  const count = Math.max(params.levels, 0) || 0

  /** The array padded out to the floor count, so indexing is always safe. */
  const floors = (): DungeonBoss[] => {
    const next = (params.levelBoss ?? []).map((b) => cloneBoss(b))
    while (next.length < count) next.push(defaultDungeonBoss())
    return next.slice(0, count)
  }

  const setFloor = (level: number, patch: Partial<DungeonBoss>) => {
    const next = floors()
    next[level] = { ...next[level], ...patch }
    onChange({ ...params, levelBoss: next })
  }

  const setWave = (level: number, tier: number, patch: Partial<BossWave>) => {
    const boss = floors()[level]
    const waves = boss.waves.map((w, i) => (i === tier ? { ...w, ...patch } : w))
    setFloor(level, { waves })
  }

  const list = floors()
  const enabledLevels = list.reduce<number[]>((acc, boss, level) => {
    if (boss.enabled) acc.push(level)
    return acc
  }, [])
  const active = Math.min(tabIndex, Math.max(0, enabledLevels.length - 1))
  const level = enabledLevels[active]
  const boss = level !== undefined ? list[level] : undefined

  const copyWaveBuffDown = (tier: number) => {
    if (level === undefined || boss === undefined) return
    const source = waveBuffs(boss.waves[tier])
    setFloor(level, {
      waves: boss.waves.map((w, i) => (i > tier ? { ...w, buffs: source.map((b) => ({ ...b })) } : w))
    })
  }

  const copyWavePickupDown = (tier: number) => {
    if (level === undefined || boss === undefined) return
    const source = wavePickups(boss.waves[tier])
    setFloor(level, {
      waves: boss.waves.map((w, i) => (i > tier ? { ...w, pickups: source.map((d) => ({ ...d })) } : w))
    })
  }

  const copyWaveTrapDown = (tier: number) => {
    if (level === undefined || boss === undefined) return
    const source = waveTraps(boss.waves[tier])
    setFloor(level, {
      waves: boss.waves.map((w, i) => (i > tier ? { ...w, traps: source.map((t) => ({ ...t })) } : w))
    })
  }

  return (
    <div className="parameter-form dungeon-boss-form">
      <Section title="Boss floors" defaultOpen badge={enabledLevels.length > 0 ? `${enabledLevels.length}` : undefined}>
        <p className="hint">
          Puts a mobile boss on an ordinary dungeon floor, chasing the party across it. Two things
          follow from turning one on, whatever else you set for the boss:
        </p>
        <ul className="hint hint-list">
          <li>
            <strong>The way out is always sealed</strong> — the exit becomes a red portal that only
            opens once the boss dies, regardless of the campaign-wide "Lock final room" setting.
          </li>
          <li>
            <strong>Enabling (or disabling) a floor's boss moves that floor's layout and every floor
            after it</strong>, for a given seed — the sealed exit is a different room than an
            ordinary stairway, so the floor draws different random numbers to build it. If you liked
            a seed and reroll it after flipping this, that is why it changed.
          </li>
        </ul>
        <div className="dungeon-boss-floor-list">
          {Array.from({ length: count }, (_, i) => {
            const b = list[i]
            return (
              <label key={i} className="bool-field dungeon-boss-floor-toggle">
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={(e) => {
                    setFloor(i, { enabled: e.target.checked })
                    if (e.target.checked) {
                      // Land on the newly-enabled floor's tab rather than
                      // wherever the selector happened to be.
                      const nextEnabled = list.map((x, li) => (li === i ? true : x.enabled))
                      setTabIndex(nextEnabled.slice(0, i + 1).filter(Boolean).length - 1)
                    }
                  }}
                />
                <span>{`Floor ${i + 1}`}</span>
                {b.enabled && (
                  <span className="section-badge">
                    {b.bossPool.length > 0 ? b.bossPool.map(bossLabel).join(', ') : 'no boss picked'}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        {issues
          .filter((i) => i.field === 'levelBoss')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      {level !== undefined && boss !== undefined && (
        <>
          {enabledLevels.length > 1 && (
            <div className="panel-tabs dungeon-boss-tabs">
              {enabledLevels.map((lvl, i) => (
                <button
                  key={lvl}
                  className={i === active ? 'tab active' : 'tab'}
                  onClick={() => setTabIndex(i)}
                >
                  {`Boss ${i + 1}`}
                  <span className="tab-count">{`Floor ${lvl + 1}`}</span>
                </button>
              ))}
            </div>
          )}

          <DungeonBossFloorEditor
            boss={boss}
            level={level}
            issues={issues}
            onChange={(patch) => setFloor(level, patch)}
            onWaveChange={(tier, patch) => setWave(level, tier, patch)}
            onCopyWaveBuffDown={copyWaveBuffDown}
            onCopyWaveTrapDown={copyWaveTrapDown}
            onCopyWavePickupDown={copyWavePickupDown}
          />
        </>
      )}
    </div>
  )
}

/** A deep-enough copy that two floors never share a mutable sub-object. */
function cloneBoss(boss: DungeonBoss): DungeonBoss {
  return JSON.parse(JSON.stringify(boss)) as DungeonBoss
}

interface DungeonBossFloorEditorProps {
  boss: DungeonBoss
  level: number
  issues: ValidationIssue[]
  onChange: (patch: Partial<DungeonBoss>) => void
  onWaveChange: (tier: number, patch: Partial<BossWave>) => void
  onCopyWaveBuffDown: (tier: number) => void
  onCopyWaveTrapDown: (tier: number) => void
  onCopyWavePickupDown: (tier: number) => void
}

/** One floor's whole boss config — the sections BossForm's arena runs, minus the arena geometry. */
function DungeonBossFloorEditor({
  boss,
  level,
  issues,
  onChange,
  onWaveChange,
  onCopyWaveBuffDown,
  onCopyWaveTrapDown,
  onCopyWavePickupDown
}: DungeonBossFloorEditorProps) {
  const fieldPrefix = `levelBoss.${level}`
  const bossCount = floorBossCount(boss)
  // Same multi-boss re-keying as an arena's bossCount (see isMultiBoss) — the
  // generator skips the 75/50/25% tiers, invulnerability and checkpoints
  // whenever this floor rolls more than one boss. Hidden, not disabled — the
  // values stay on the object untouched for a later single-boss flip.
  const multiBoss = isMultiBoss(bossCount)
  const tierHidden = (tier: number) => multiBoss && tier !== 0 && tier !== BOSS_DEATH_WAVE
  const visibleWaves = multiBoss ? boss.waves.filter((_, i) => !tierHidden(i)) : boss.waves

  return (
    <>
      <Section title="Boss" badge={`${boss.bossPool.length}/${MOBILE_BOSS_DEFS.length}`}>
        <p className="hint">
          Only bosses that can move are offered — a stationary one parked in a room could never
          reach the party on an open floor.
        </p>
        {multiBoss && (
          <p className="hint">
            Multiple bosses: 75/50/25% tiers, invulnerability and checkpoints are hidden — they
            come back when you set 1 boss.
          </p>
        )}
        <BossSelectionEditor
          selection={bossSelection(boss)}
          bossPool={boss.bossPool}
          bossCount={bossCount}
          bossLineup={boss.bossLineup}
          defs={MOBILE_BOSS_DEFS.map((def) => ({ id: def.id, label: bossLabel(def.id), unique: def.unique }))}
          fieldPrefix={fieldPrefix}
          issues={issues}
          onChange={(patch) => onChange(patch)}
        />
      </Section>

      {!multiBoss && (
        <Section title="Boss invulnerability" badge={invulnBadge(boss.invulnerability)}>
          {boss.invulnerability.enabled && (
            <p className="hint">
              Cannot run alongside this floor's own Timer mode — both would announce competing
              countdowns. Turning this on disables the Timer toggle for this floor.
            </p>
          )}
          <InvulnerabilityEditor
            invuln={boss.invulnerability}
            fieldPrefix={fieldPrefix}
            issues={issues}
            onChange={(invulnerability) => onChange({ invulnerability })}
          />
          {issues
            .filter((i) => i.field === `${fieldPrefix}.invulnerability`)
            .map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
        </Section>
      )}

      <Section title="Waves" defaultOpen>
        <p className="hint">
          {multiBoss
            ? 'With several bosses only the start tier and the all-bosses-dead tier run.'
            : 'Each health threshold switches its tier\'s spawners on and never off — by 25% health all four are running at once.'}{' '}
          The last tier fires when the boss dies, spawning into the walk to the sealed exit. Unlike
          the arena, monsters here always land on interior room tiles — there is no scatter mode on
          a dungeon floor.
        </p>
        {boss.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={`${wave.monsters.length} monster(s)`}
            >
              <WaveEditor
                wave={wave}
                index={i}
                fieldPrefix={fieldPrefix}
                issues={issues}
                onWaveChange={(patch) => onWaveChange(i, patch)}
                hideSpawnMode
              />
            </Subsection>
          )
        })}
        {issues
          .filter((i) => i.field === `${fieldPrefix}.waves`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section
        title="Wave buffs"
        badge={visibleWaves.some((w) => waveBuffs(w).length > 0) ? 'on' : undefined}
      >
        <p className="hint">
          A tier's buffs cover the whole floor and <strong>replace</strong> the previous tier's, so
          only one tier's are ever live. No tier carries one by default.
        </p>
        {boss.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          const buffs = waveBuffs(wave)
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={buffs.length === 0 ? 'none' : buffs.map((b) => b.buff).join(', ')}
            >
              <BuffListEditor
                value={buffs}
                onChange={(next) => onWaveChange(i, { buffs: next })}
                noun="tier"
                issuePrefix={`${fieldPrefix}.waves.${i}.buffs`}
                issues={issues}
              />
              {i < boss.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => onCopyWaveBuffDown(i)}
                  title="Give every later tier these same buffs and targets"
                >
                  Copy to tiers below
                </button>
              )}
            </Subsection>
          )
        })}
      </Section>

      <Section title="Wave pickups" badge={visibleWaves.some((w) => wavePickups(w).length > 0) ? 'on' : undefined}>
        <p className="hint">
          A tier's drops appear <strong>scattered across the floor's rooms</strong> the moment its
          threshold fires, each copy on its own tile, and stay until somebody walks over them — so
          unlike the buffs above, the tiers do <strong>not</strong> replace one another, and the
          health nobody collected at 50% is still out there at 25%. No tier drops anything by
          default.
        </p>
        {boss.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          const pickups = wavePickups(wave)
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={
                pickups.length === 0
                  ? 'none'
                  : pickups.map((d) => `${d.count}× ${pickupById(d.item)?.label ?? d.item}`).join(', ')
              }
            >
              <PickupListEditor
                value={pickups}
                onChange={(next) => onWaveChange(i, { pickups: next })}
                noun="tier"
                issuePrefix={`${fieldPrefix}.waves.${i}.pickups`}
                issues={issues}
              />
              {i < boss.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => onCopyWavePickupDown(i)}
                  title="Give every later tier these same drops and counts"
                >
                  Copy to tiers below
                </button>
              )}
            </Subsection>
          )
        })}
      </Section>

      <Section title="Traps" badge={visibleWaves.some((w) => waveTraps(w).length > 0) ? 'on' : undefined}>
        <p className="hint">
          These are the same wall spewers as this floor's ordinary traps — the difference is that
          they switch on and off by the boss's health instead of being live from the moment the
          floor loads. Each tier <strong>replaces</strong> the last tier's traps. No tier carries one
          by default.
        </p>
        {boss.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          const traps = waveTraps(wave)
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={traps.length === 0 ? 'none' : `${traps.length} row(s)`}
            >
              <TrapListEditor
                value={traps}
                onChange={(next) => onWaveChange(i, { traps: next })}
                noun="tier"
                maxCount={undefined}
                issuePrefix={`${fieldPrefix}.waves.${i}.traps`}
                issues={issues}
              />
              {i < boss.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => onCopyWaveTrapDown(i)}
                  title="Give every later tier these same spewers"
                >
                  Copy to tiers below
                </button>
              )}
            </Subsection>
          )
        })}
      </Section>

      {!multiBoss && (
        <Section title="Checkpoints / Save game" badge={checkpointBadge(boss.checkpoints)}>
          <CheckpointsEditor
            checkpoints={boss.checkpoints}
            onChange={(checkpoints) => onChange({ checkpoints })}
          />
          {issues
            .filter(
              (i) => i.field === `${fieldPrefix}.checkpoints.respawnPlayers` || i.field === `${fieldPrefix}.checkpoints.saveGame`
            )
            .map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
        </Section>
      )}

      <Section title="Chances & multipliers">
        <div className="field-grid">
          <NumberField
            label="Monster ×"
            field={`${fieldPrefix}.monsterMultiplier`}
            value={boss.monsterMultiplier}
            onChange={(v) => onChange({ monsterMultiplier: v })}
            issues={issues}
            min={0}
            step={0.1}
            title="Scales each wave's spawn budget for this floor's boss, separate from the dungeon's own Monster ×"
          />
        </div>
      </Section>
    </>
  )
}
