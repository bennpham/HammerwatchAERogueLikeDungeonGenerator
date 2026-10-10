import React, { useState } from 'react'
import {
  BOSS_SPAWN_MODES,
  DEFAULT_WAVE_MONSTER_MAX,
  MONSTER_VARIANT_GROUPS,
  arenaActorPath,
  corpseCollision,
  defaultTier,
  isScatterMode,
  monsterNote,
  monsterVariantsInGroup,
  resolveActorPath,
  waveSpawnMode
} from '../../generator'
import type { BossSpawnMode, BossWave, ValidationIssue } from '../../generator'
import { NumberField } from './fields'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { PoolGroup } from './PoolGroup'
import { PoolTextField } from './PoolTextField'

/**
 * Whole section titles, not just the threshold: the last tier is keyed to the
 * boss dying rather than to a health percentage, so "Tier boss dead" would read
 * as a fifth threshold that does not exist.
 *
 * Shared by the arena's own five tiers (BossForm) and a dungeon floor's boss
 * (DungeonBossEditor) — both key off the same health thresholds.
 */
export const WAVE_LABELS = ['Tier 100%', 'Tier 75%', 'Tier 50%', 'Tier 25%', 'After the boss dies']

/** ` — <note>` for a variant that has a behaviour note, empty string otherwise. */
function noteSuffix(key: string): string {
  const note = monsterNote(key)
  return note ? ` — ${note}` : ''
}

/**
 * The actor path to show in a hover title. When `arenaTwins` is set (this
 * wave belongs to an arena with bodyguard twins on) and `actorPath` has a twin
 * in `ARENA_BODYGUARD_TWINS`, shows the twin path the arena will actually spawn
 * alongside the ordinary path it stands in for — the substitution itself is
 * decided by the generator at build time (`resolveArenaActorPath`), this is
 * purely informational. Otherwise (a dungeon floor's boss, or no twin) returns
 * `actorPath` unchanged.
 */
function displayActorPath(actorPath: string, arenaTwins: boolean | undefined): string {
  if (!arenaTwins) return actorPath
  const twin = arenaActorPath(actorPath)
  return twin === actorPath ? actorPath : `${twin} (arena bodyguard version of ${actorPath})`
}

interface WaveEditorProps {
  wave: BossWave
  index: number
  /** validation field root of the owning wave list, e.g. `boss.fights.0.arena` or `levelBoss.0` */
  fieldPrefix: string
  issues: ValidationIssue[]
  onWaveChange: (patch: Partial<BossWave>) => void
  /**
   * A dungeon floor's boss has no scatter modes — wave monsters always land on
   * interior room tiles, there being no anchors or arena to scatter across —
   * so the spawn-mode dropdown and its "anchors only" wreck warning are the
   * arena's business alone. Default false (the arena keeps its current shape).
   */
  hideSpawnMode?: boolean
  /**
   * True when this wave's arena has bodyguard twins on (`arenaUsesBodyguards`)
   * — a boss-arena-only setting, never passed from `DungeonBossEditor`, since
   * a floor boss's waves always name the ordinary actor (issue #64 part 2).
   * Purely cosmetic: it only changes what a checkbox's hover title says, never
   * which actor the wave actually names — that substitution happens in the
   * generator at build time, off the arena's own flag.
   */
  arenaTwins?: boolean
}

/** One health-tier's monster pool, max-count table and spawn interval — the MonsterPoolsEditor/MonsterMaxTable idiom, but scoped to a single wave instead of the whole dungeon. */
export function WaveEditor({ wave, index, fieldPrefix, issues, onWaveChange, hideSpawnMode, arenaTwins }: WaveEditorProps) {
  const filter = useMonsterFilter()
  // Session-only, like the act filter — nothing here reaches DungeonParameters,
  // so hiding an option can never change generated output.
  const [passableOnly, setPassableOnly] = useState(false)
  const prefix = `${fieldPrefix}.waves.${index}`

  const toggleMonster = (id: string) => {
    const has = wave.monsters.includes(id)
    const monsters = has ? wave.monsters.filter((m) => m !== id) : [...wave.monsters, id]
    const monsterMax = { ...wave.monsterMax }
    if (!has && monsterMax[id] === undefined) monsterMax[id] = DEFAULT_WAVE_MONSTER_MAX
    onWaveChange({ monsters, monsterMax })
  }

  // Replaces the whole pool at once — the paste path. Seeds a max for anything
  // newly added and leaves the maxes, spawn modes and interval overrides of
  // removed monsters alone, exactly like toggleMonster: re-adding a monster
  // restores what you had set for it, and validation and configFile both ignore
  // entries whose monster is no longer in the pool.
  const setPool = (monsters: string[]) => {
    const monsterMax = { ...wave.monsterMax }
    for (const id of monsters) {
      if (monsterMax[id] === undefined) monsterMax[id] = DEFAULT_WAVE_MONSTER_MAX
    }
    onWaveChange({ monsters, monsterMax })
  }

  const setMax = (id: string, value: number) => {
    onWaveChange({ monsterMax: { ...wave.monsterMax, [id]: value } })
  }

  const setOverride = (id: string, value: number) => {
    const intervalMs = { ...(wave.intervalMs ?? {}) }
    if (Number.isNaN(value)) {
      delete intervalMs[id]
    } else {
      intervalMs[id] = value
    }
    onWaveChange({ intervalMs: Object.keys(intervalMs).length > 0 ? intervalMs : undefined })
  }

  // Only monsters still on the timer rig have an interval to override — a
  // scattered one spawns once, so showing it a box would invite a number the
  // fight ignores. A floor has no scatter modes at all, so every monster on it
  // is "timed" in this sense.
  const timedMonsters = hideSpawnMode
    ? wave.monsters
    : wave.monsters.filter((id) => !isScatterMode(waveSpawnMode(wave, id)))

  const setSpawnMode = (id: string, mode: BossSpawnMode) => {
    const spawnMode = { ...(wave.spawnMode ?? {}) }
    if (isScatterMode(mode)) spawnMode[id] = mode
    else delete spawnMode[id]

    // A scattered monster has no timer, so its interval override would sit in
    // parameters.txt doing nothing — drop it with the mode change rather than
    // leaving a value the fight ignores.
    const intervalMs = { ...(wave.intervalMs ?? {}) }
    if (isScatterMode(mode)) delete intervalMs[id]

    onWaveChange({
      spawnMode: Object.keys(spawnMode).length > 0 ? spawnMode : undefined,
      intervalMs: Object.keys(intervalMs).length > 0 ? intervalMs : undefined
    })
  }

  return (
    <div className="boss-wave">
      {issues
        .filter((i) => i.field === `${prefix}.monsters`)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <MonsterFilterBar filter={filter} />
      <label className="pool-passable-toggle">
        <input type="checkbox" checked={passableOnly} onChange={() => setPassableOnly(!passableOnly)} />
        Passable only
        <span className="hint">
          Hides towers and spawners whose wreck keeps its collision, so clearing the arena can never wall it off.
        </span>
      </label>
      <p className="hint pool-variant-hint">
        A “#” suffix picks a different tier of the same monster: bare “archer1” is its ordinary
        form, “archer1#2” its elite.
        <InfoTip
          text={
            'Each monster type ships one actor per tier, weakest first. #0 is usually the spawner building that keeps producing that monster, then the small, ordinary and elite versions. The bare name with no # is always the ordinary form, so old parameter files keep spawning what they always did. Hover a checkbox to see the exact actor file it spawns.'
          }
        />
      </p>
      <div className="pool-groups">
        {MONSTER_VARIANT_GROUPS.map((group) => {
          const members = monsterVariantsInGroup(group).filter((v) => {
            const picked = wave.monsters.includes(v.key)
            // A pick always stays reachable so it can be un-picked, even when
            // the act filter or the passable toggle would otherwise hide it.
            if (picked) return true
            if (passableOnly && v.corpse === 'blocking') return false
            return filter.visible(v.type, false, v.key)
          })
          if (members.length === 0) return null
          return (
            <PoolGroup
              key={group}
              title={group}
              selected={members.filter((v) => wave.monsters.includes(v.key)).length}
              total={members.length}
              forceOpen={!filter.isDefault || passableOnly}
            >
              <div className="pool-checkboxes">
                {members.map((v) => {
                  const hiddenByFilter = filter.offFilter(v.type, v.key)
                  const hiddenByPassable = passableOnly && v.corpse === 'blocking'
                  const off = hiddenByFilter || hiddenByPassable
                  return (
                    <label
                      key={v.key}
                      className={off ? 'pool-checkbox off-filter' : 'pool-checkbox'}
                      title={
                        off
                          ? 'In this wave, but hidden by the current filter'
                          : v.tier === defaultTier(v.type)
                            ? `${displayActorPath(v.actorPath, arenaTwins)} — the ordinary ${v.type.id}${noteSuffix(v.key)}`
                            : `${displayActorPath(v.actorPath, arenaTwins)} — tier ${v.tier} of ${v.type.id}, ${
                                v.role === 'spawner' ? 'a spawner building' : 'a creature'
                              }${noteSuffix(v.key)}`
                      }
                    >
                      <input
                        type="checkbox"
                        checked={wave.monsters.includes(v.key)}
                        onChange={() => toggleMonster(v.key)}
                      />
                      {v.key}
                      {v.corpse && (
                        <span
                          className={v.corpse === 'blocking' ? 'pool-badge blocks' : 'pool-badge'}
                          title={
                            v.corpse === 'blocking'
                              ? 'Leaves a wreck that still blocks movement after it dies'
                              : 'Its wreck can be walked over once it dies'
                          }
                        >
                          {v.corpse === 'blocking' ? 'blocks' : 'passable'}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </PoolGroup>
          )
        })}
      </div>

      <PoolTextField
        label="Pool list (advanced)"
        value={wave.monsters}
        dedupe
        hint="Comma-separated variant keys. Copy a tier you like and paste it here to reuse it — pasting replaces this tier's pool. Spawn modes stay on the rows below."
        onCommit={setPool}
      />

      <div className="field-grid">
        <NumberField
          label="Spawn every (ms)"
          field={`${prefix}.defaultIntervalMs`}
          value={wave.defaultIntervalMs}
          onChange={(defaultIntervalMs) => onWaveChange({ defaultIntervalMs })}
          issues={issues}
          min={100}
          max={60000}
          step={100}
          title="Shared spawn interval for every monster in this tier, unless overridden below"
        />
      </div>

      {wave.monsters.length > 0 && (
        <div className="max-grid">
          {wave.monsters.map((id) => {
            const value = wave.monsterMax[id] ?? DEFAULT_WAVE_MONSTER_MAX
            const field = `${prefix}.monsterMax.${id}`
            const modeField = `${prefix}.spawnMode.${id}`
            const fieldIssues = issues.filter((i) => i.field === field || (!hideSpawnMode && i.field === modeField))
            const mode = waveSpawnMode(wave, id)
            // A wreck that keeps its collision is permanent geometry, so
            // scattering it can wall the arena off — validation refuses it and
            // the options are disabled here so it never gets picked by hand.
            // `disabled` alone says "no" without saying why, and it is nearly
            // invisible on this theme, so the restriction is also spelled out
            // twice in words: a badge on the name line for the closed row, and
            // an optgroup label for the open dropdown. None of this applies on
            // a dungeon floor, which has no scatter modes at all.
            const blocks = !hideSpawnMode && corpseCollision(resolveActorPath(id)) === 'blocking'
            return (
              <label key={id} className={fieldIssues.length > 0 ? 'max-item field-error' : 'max-item'}>
                <span className="max-item-name">
                  <span className="max-item-id">{id}</span>
                  {blocks && (
                    <span
                      className="pool-badge blocks"
                      title="Leaves a wreck that still blocks movement — scattering those can wall the arena off, so only the anchors mode is allowed"
                    >
                      anchors only
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={-1}
                  value={Number.isNaN(value) ? '' : value}
                  title="-1 means endless — the spawner never runs out of this monster"
                  onChange={(e) => setMax(id, e.target.value === '' ? 0 : Number(e.target.value))}
                />
                {!hideSpawnMode && (
                  <BossSpawnModeSelect id={id} mode={mode} blocks={blocks} onChange={setSpawnMode} />
                )}
                {fieldIssues.map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
            )
          })}
        </div>
      )}

      {timedMonsters.length > 0 && (
        <details className="boss-wave-advanced">
          <summary>Advanced — per-monster interval overrides</summary>
          <div className="max-grid">
            {timedMonsters.map((id) => {
              const value = wave.intervalMs?.[id]
              const field = `${prefix}.intervalMs.${id}`
              const fieldIssues = issues.filter((i) => i.field === field)
              return (
                <label key={id} className={fieldIssues.length > 0 ? 'max-item field-error' : 'max-item'}>
                  <span>{id}</span>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    step={100}
                    placeholder={`${wave.defaultIntervalMs}`}
                    value={value ?? ''}
                    title="Blank uses the tier's shared interval above"
                    onChange={(e) => setOverride(id, e.target.value === '' ? NaN : Number(e.target.value))}
                  />
                  {fieldIssues.map((issue, i) => (
                    <span key={i} className="field-message">
                      {issue.message}
                    </span>
                  ))}
                </label>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

/** The spawn-mode select for one monster's row — split out to keep WaveEditor's body flat. */
function BossSpawnModeSelect({
  id,
  mode,
  blocks,
  onChange
}: {
  id: string
  mode: BossSpawnMode
  blocks: boolean
  onChange: (id: string, mode: BossSpawnMode) => void
}) {
  return (
    <select
      className="spawn-mode"
      value={mode}
      title={
        blocks
          ? 'Only the anchors mode: this one leaves a wreck that still blocks movement, and scattering those can wall the arena off'
          : 'anchors trickles this monster out of the nine spawn points on the tier timer; the others place its whole count across the arena and spawn it once'
      }
      onChange={(e) => onChange(id, e.target.value as BossSpawnMode)}
    >
      {BOSS_SPAWN_MODES.filter((m: BossSpawnMode) => !blocks || !isScatterMode(m)).map((m: BossSpawnMode) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      {blocks && (
        <optgroup label="Unavailable — wreck blocks the arena">
          {BOSS_SPAWN_MODES.filter(isScatterMode).map((m: BossSpawnMode) => (
            <option key={m} value={m} disabled>
              {m}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
