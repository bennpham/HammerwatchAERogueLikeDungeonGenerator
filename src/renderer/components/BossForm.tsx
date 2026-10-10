import React, { useState } from 'react'
import {
  ARENA_PATTERN_LABELS,
  BOSS_COVER_DENSITY_MAX,
  BOSS_COVER_PATTERNS,
  BOSS_DEATH_WAVE,
  BOSS_DEF_LIST,
  BOSS_FLOOR_PATTERNS,
  MAX_TRAP_COUNT,
  THEME_DEFS,
  buffById,
  pickupById,
  arenaBossCount,
  arenaMode,
  arenaUsesBodyguards,
  bossSelection,
  defaultBossFight,
  defaultSurvivalOptions,
  getTheme,
  isDefaultOrder,
  isMultiBoss,
  normalizeOrder,
  slotLabel,
  waveBuffs,
  wavePickups,
  waveTraps,
  waveSpawnMode,
  isScatterMode
} from '../../generator'
import type {
  ArenaMode,
  ArenaPatternKind,
  BossArenaOptions,
  BossFight,
  BossFloorPattern,
  BossOptions,
  BossSpawnMode,
  BossTrap,
  BossTrapDirection,
  BossWave,
  CampaignCounts,
  DungeonParameters,
  SurvivalOptions,
  ValidationIssue
} from '../../generator'
import { BoolField, NumberField, Section, Subsection, ToggleGroup } from './fields'
import { InfoTip } from './InfoTip'
import { MusicPicker } from './MusicPicker'
import { BuffListEditor } from './BuffListEditor'
import { PickupListEditor } from './PickupListEditor'
import { TrapListEditor } from './TrapListEditor'
import { SurvivalTab } from './SurvivalTab'
import { WaveEditor, WAVE_LABELS } from './WaveEditor'
import { InvulnerabilityEditor, invulnBadge } from './InvulnerabilityEditor'
import { CheckpointsEditor, checkpointBadge } from './CheckpointsEditor'
import { BossSelectionEditor } from './BossSelectionEditor'

interface BossFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/** Themes bucketed by their registry group, in registry order — same reduce ParameterForm uses for the per-level pickers. */
const THEME_GROUPS = THEME_DEFS.reduce<[string, (typeof THEME_DEFS)[number][]][]>((groups, def) => {
  const existing = groups.find(([name]) => name === def.group)
  if (existing) existing[1].push(def)
  else groups.push([def.group, [def]])
  return groups
}, [])

export function BossForm({ params, issues, onChange }: BossFormProps) {
  // Which fight the sub-tabs below are editing. Clamped rather than reset
  // when the count shrinks, so trimming the list does not throw away the view.
  const [fightIndex, setFightIndex] = useState(0)
  const boss = params.boss
  const fights = boss.fights ?? []
  const active = Math.min(fightIndex, Math.max(0, fights.length - 1))
  const fight = fights[active]
  // What the count field shows, and the single thing that means "there are no
  // arenas". `fights` is kept intact while the campaign is off, so the stored
  // length is not the answer on its own.
  const arenaCount = boss.enabled ? fights.length : 0

  // Repairs the stored campaign order against the fight list the patch leaves
  // behind, exactly as ParameterForm.setLevels does for the floor count. The
  // shipped presets store an order that names the boss fight (the campaign ends
  // on an escape floor played after it), so turning the boss off — or trimming
  // the fight list — would otherwise leave the order naming a fight that no
  // longer exists, which validation blocks on. A valid order normalizes to
  // itself, so every other patch through here is unaffected.
  const set = (patch: Partial<BossOptions>) => {
    const nextBoss = { ...boss, ...patch }
    const next: DungeonParameters = { ...params, boss: nextBoss }
    if (params.levelOrder !== undefined) {
      const counts: CampaignCounts = {
        levels: params.levels,
        fights: nextBoss.enabled ? (nextBoss.fights?.length ?? 0) : 0,
        lobbies: params.lobbies.length
      }
      const repaired = normalizeOrder(params.levelOrder, counts)
      if (isDefaultOrder(repaired, counts)) delete next.levelOrder
      else next.levelOrder = repaired
    }
    onChange(next)
  }
  const setFight = (index: number, patch: Partial<BossFight>) =>
    set({ fights: fights.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  const setArena = (patch: Partial<BossArenaOptions>) =>
    setFight(active, { arena: { ...fight.arena, ...patch } })
  const setWave = (index: number, patch: Partial<BossWave>) => {
    const waves = fight.arena.waves.map((w, i) => (i === index ? { ...w, ...patch } : w))
    setArena({ waves })
  }
  // Flipping the mode never discards the other half's config — the generator
  // ignores whichever half is unused rather than deleting it, so a dungeon
  // master can flip back and forth while tuning without losing work. The
  // first flip TO survival seeds a fresh config; every flip after that reuses
  // whatever is already stored on the fight.
  const setMode = (mode: ArenaMode) =>
    setFight(active, mode === 'survival' ? { mode, survival: fight.survival ?? defaultSurvivalOptions() } : { mode })
  const setSurvival = (patch: Partial<SurvivalOptions>) =>
    setFight(active, { survival: { ...(fight.survival ?? defaultSurvivalOptions()), ...patch } })

  // Grow by cloning the LAST fight, not the default one: a dungeon master who
  // has tuned fight 1 and asks for a second almost always wants a variation on
  // it rather than the stock castle arena back. Same growth rule the per-floor
  // arrays use in ParameterForm.setLevels.
  //
  // Zero is how the campaign turns arenas off — there is no separate checkbox.
  // It clears the flag and deliberately KEEPS the fight list, so 0 -> 1 hands
  // back the arena that was already tuned rather than a stock castle. Same
  // losslessness setMode relies on above when it flips boss <-> survival.
  const setFightCount = (countRaw: number) => {
    const count = Math.max(0, Math.trunc(countRaw))
    // Zero is checked before the no-op guard: a hand-written file can carry
    // `boss=1` with no fight blocks, which already reads 0 here and raises the
    // "no fights configured" error. Typing 0 has to be able to clear the flag
    // and settle that, rather than short-circuit as "already 0".
    if (count === 0) {
      if (boss.enabled) set({ enabled: false })
      return
    }
    if (count === arenaCount) return
    const next = fights.slice(0, count)
    while (next.length < count) next.push(cloneFight(next[next.length - 1] ?? defaultBossFight()))
    set({ enabled: true, fights: next })
    if (active >= count) setFightIndex(count - 1)
  }

  // Copies the whole fight's arena — general layout, boss pool, waves, buffs,
  // pickups and traps. The waves are the expensive part to set up, and a fight
  // that differs only in its boss pool is the common reason to ask for this.
  const copyToNext = () => {
    if (active + 1 >= fights.length) return
    setFight(active + 1, cloneFight(fight))
    setFightIndex(active + 1)
  }

  return (
    <div className="parameter-form boss-form">
      <Section title="Arena" defaultOpen>
        <p className="hint">
          Appends a generated arena after the last dungeon floor — a boss fight or a survival round,
          picked per arena below. Zero arenas reproduces the pre-boss campaign exactly, the same rule{' '}
          <code>lobbies</code> follows for its own list — each arena draws from its own RNG stream, so
          the dungeon itself is identical either way, for the same seed. Put a lobby right in front of
          one, from the Lobby tab, if the party should shop first.
        </p>
        <NumberField
          label="Number of arenas"
          field="boss.fights"
          value={arenaCount}
          issues={issues}
          min={0}
          step={1}
          onChange={setFightCount}
        />
        <p className="hint">
          Each arena is independent — its own layout, its own mode. Arrange several arenas — and any
          lobbies between them — on the Floor order tab; only the campaign's last slot carries the
          victory orb.
        </p>
      </Section>

      {arenaCount > 0 && fight !== undefined && (
        <>
          {fights.length > 1 && (
            <div className="panel-tabs boss-fight-tabs">
              {fights.map((f, i) => (
                <button
                  key={i}
                  className={i === active ? 'tab active' : 'tab'}
                  onClick={() => setFightIndex(i)}
                >
                  {slotLabel({ kind: 'boss', index: i }, arenaMode(f))}
                </button>
              ))}
              <button
                type="button"
                className="copy-down"
                onClick={copyToNext}
                disabled={active + 1 >= fights.length}
                title="Replace the next arena's whole config with this one's"
              >
                Copy to next arena
              </button>
            </div>
          )}

          <Section title="Mode" defaultOpen>
            <ToggleGroup
              label="Arena mode"
              value={arenaMode(fight)}
              onChange={setMode}
              options={[
                { value: 'boss', label: 'Boss', title: 'Fight one of the boss pool; the horde spawns on health thresholds' },
                { value: 'survival', label: 'Survival', title: 'No boss — outlast a clock while timed waves, buffs, drops and traps run' }
              ]}
            />
            <p className="hint">
              Flipping modes never discards the other one's setup — a fight kept in Boss mode still
              remembers a Survival config you built earlier, and vice versa.
            </p>
          </Section>

          <SharedArenaFields
            arena={fight.arena}
            fieldPrefix={`boss.fights.${active}.arena`}
            issues={issues}
            setArena={setArena}
          />

          {arenaMode(fight) === 'survival' ? (
            <SurvivalTab
              survival={fight.survival ?? defaultSurvivalOptions()}
              arena={fight.arena}
              fieldPrefix={`boss.fights.${active}.survival`}
              issues={issues}
              onChange={setSurvival}
            />
          ) : (
            <BossOnlyArenaFields
              arena={fight.arena}
              fieldPrefix={`boss.fights.${active}.arena`}
              issues={issues}
              setArena={setArena}
              setWave={setWave}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * A deep-enough copy that two fights never share a mutable sub-object. The
 * arrays and records inside a wave are edited in place by the pool pickers, so
 * a shallow spread would make an edit to one fight show up in the other.
 */
function cloneFight(fight: BossFight): BossFight {
  return JSON.parse(JSON.stringify(fight)) as BossFight
}

interface SharedArenaFieldsProps {
  arena: BossArenaOptions
  /** validation field root for this fight, e.g. `boss.fights.0.arena` */
  fieldPrefix: string
  issues: ValidationIssue[]
  setArena: (patch: Partial<BossArenaOptions>) => void
}

/**
 * The sections that mean the same thing whether a boss is standing in the
 * arena or a clock is running: size, multipliers, theme, music and cover.
 * Rendered once per arena regardless of `arenaMode` — only the sections below
 * it branch on mode.
 */
function SharedArenaFields({ arena, fieldPrefix, issues, setArena }: SharedArenaFieldsProps) {
  return (
    <>
      <Section title="General" defaultOpen>
        <div className="field-grid">
          <NumberField
            label="Min width"
            field={`${fieldPrefix}.minWidth`}
            value={arena.minWidth}
            onChange={(minWidth) => setArena({ minWidth })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Max width"
            field={`${fieldPrefix}.maxWidth`}
            value={arena.maxWidth}
            onChange={(maxWidth) => setArena({ maxWidth })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Min height"
            field={`${fieldPrefix}.minHeight`}
            value={arena.minHeight}
            onChange={(minHeight) => setArena({ minHeight })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Max height"
            field={`${fieldPrefix}.maxHeight`}
            value={arena.maxHeight}
            onChange={(maxHeight) => setArena({ maxHeight })}
            issues={issues}
            min={1}
          />
        </div>
        <BoolField
          className="field-grid-footer"
          label="Use bodyguard versions in this arena"
          checked={arenaUsesBodyguards(arena)}
          onChange={(checked) => setArena({ bodyguardVariants: checked ? undefined : false })}
          title="Swaps five roster actors for their boss-folder twins whenever this arena's waves name them"
        />
        <p className="hint">
          On by default. When on, this arena's waves swap five roster actors for their boss-folder
          twins: the boss-folder archer1, skeleton1 (small and ordinary), skeleton3 and the ranged
          mummy (mummy_ranged#2) replace them here.
          <InfoTip
            text={
              'None of the five twins drops loot. The knight\'s archer and skeletons aggro from 30 tiles instead of 10-12. The lich\'s skeleton is slower (0.65 vs 1.1 speed) with 25 HP instead of 20. Spawner buildings (#0) still spawn the ordinary monsters — only the creature actors themselves are swapped. Dungeon floors always use the ordinary monsters; this only ever affects an arena.'
            }
          />
        </p>
        {issues
          .filter((i) => i.field === `${fieldPrefix}.bodyguardVariants`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Chances & multipliers">
        <div className="field-grid">
          <NumberField
            label="Monster ×"
            field={`${fieldPrefix}.monsterMultiplier`}
            value={arena.monsterMultiplier}
            onChange={(v) => setArena({ monsterMultiplier: v })}
            issues={issues}
            min={0}
            step={0.1}
            title="Scales each wave's spawn budget (endless monsters, -1, are never scaled)"
          />
          <NumberField
            label="Food ×"
            field={`${fieldPrefix}.foodMultiplier`}
            value={arena.foodMultiplier}
            onChange={(v) => setArena({ foodMultiplier: v })}
            issues={issues}
            min={0}
            step={0.1}
            title="Scales the health/mana pickups scattered around the arena"
          />
        </div>
      </Section>

      <Section title="Theme">
        <p className="hint">
          Entries like <strong>f - frozen</strong> layer an alternate tileset over
          the theme’s floor. A <strong>- mixed</strong> entry picks between the
          plain floor and those alternates — the arena is one open room, so it
          lays them out in a geometric pattern rather than per room, which the
          seed picks unless you choose one below. The orb alcove and the
          entrance stay on the plain floor either way.
        </p>
        <label className="field">
          <span className="field-label">Arena theme</span>
          <select value={arena.theme} onChange={(e) => setArena({ theme: e.target.value })}>
            {THEME_GROUPS.map(([group, defs]) => (
              <optgroup key={group} label={group}>
                {defs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {issues
          .filter((i) => i.field === `${fieldPrefix}.theme`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
        {/* only a mixed theme has a palette to arrange, so the choice is
            meaningless — and misleading — for every other theme */}
        {getTheme(arena.theme)?.mixed !== undefined && (
          <label className="field">
            <span className="field-label">Floor pattern</span>
            <select
              value={arena.floorPattern}
              onChange={(e) => setArena({ floorPattern: e.target.value as BossFloorPattern })}
            >
              <option value="random">random (the seed picks)</option>
              {BOSS_FLOOR_PATTERNS.filter((p) => p !== 'random').map((p) => (
                <option key={p} value={p}>
                  {ARENA_PATTERN_LABELS[p as ArenaPatternKind]}
                </option>
              ))}
            </select>
          </label>
        )}
        {issues
          .filter((i) => i.field === `${fieldPrefix}.floorPattern`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Music">
        <p className="hint">
          Swaps this fight's own music. Left on <strong>Default</strong>, the
          arena plays whatever the game falls back to — nothing is emitted.
        </p>
        <MusicPicker
          label="Track"
          field={`${fieldPrefix}.music`}
          value={arena.music}
          onChange={(v) => setArena({ music: v })}
          issues={issues}
        />
      </Section>

      <Section title="Cover">
        <ToggleGroup
          label="Pattern"
          value={arena.cover.pattern}
          onChange={(pattern) => setArena({ cover: { ...arena.cover, pattern } })}
          options={BOSS_COVER_PATTERNS.map((p) => ({ value: p, label: p }))}
        />
        {issues
          .filter((i) => i.field === `${fieldPrefix}.cover.pattern`)
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
        <div className="field-grid">
          <NumberField
            label="Density"
            field={`${fieldPrefix}.cover.density`}
            value={arena.cover.density}
            onChange={(density) => setArena({ cover: { ...arena.cover, density } })}
            issues={issues}
            min={0}
            max={BOSS_COVER_DENSITY_MAX}
            step={0.01}
            title="Fraction of the free arena floor cover pillars try to fill"
          />
          {arena.cover.pattern === 'ring' && (
            <NumberField
              label="Ring spacing"
              field={`${fieldPrefix}.cover.ringSpacing`}
              value={arena.cover.ringSpacing}
              onChange={(ringSpacing) => setArena({ cover: { ...arena.cover, ringSpacing } })}
              issues={issues}
              min={1}
              title="Gap between pillars around the ring, so it stays walkable rather than a second wall"
            />
          )}
          {arena.cover.pattern === 'gaussian' && (
            <NumberField
              label="Clusters"
              field={`${fieldPrefix}.cover.clusters`}
              value={arena.cover.clusters}
              onChange={(clusters) => setArena({ cover: { ...arena.cover, clusters } })}
              issues={issues}
              min={1}
              title="Number of seeded cluster centres pillars scatter around"
            />
          )}
        </div>
      </Section>
    </>
  )
}

interface BossOnlyArenaFieldsProps {
  arena: BossArenaOptions
  /** validation field root for this fight, e.g. `boss.fights.0.arena` */
  fieldPrefix: string
  issues: ValidationIssue[]
  setArena: (patch: Partial<BossArenaOptions>) => void
  setWave: (index: number, patch: Partial<BossWave>) => void
}

/**
 * Everything that only means something when a boss is actually in the
 * arena — the pool, its invulnerability windows, the five health-tier rigs
 * and the scatter-spawn tuning. Rendered only in Boss mode; Survival mode
 * renders `SurvivalTab` instead.
 */
function BossOnlyArenaFields({ arena, fieldPrefix, issues, setArena, setWave }: BossOnlyArenaFieldsProps) {
  // Which scatter modes any wave actually uses, so the knobs that only matter
  // for `ring` and `gaussian` stay hidden until they mean something — the same
  // conditional shape the Cover section uses for its own two knobs.
  const scatterModesInUse = new Set(
    arena.waves.flatMap((wave) => wave.monsters.map((id) => waveSpawnMode(wave, id)).filter(isScatterMode))
  )

  const bossCount = arenaBossCount(arena)
  // With 2+ bosses the engine's Boss 75/50/25% events can't tell them apart,
  // so the generator skips those three tiers, invulnerability and checkpoints
  // entirely (see isMultiBoss's doc comment) — hidden below, never disabled,
  // because the settings stay on the object untouched for a later
  // single-boss flip; there is simply nothing on screen to scroll past.
  const multiBoss = isMultiBoss(bossCount)
  const tierHidden = (tier: number) => multiBoss && tier !== 0 && tier !== BOSS_DEATH_WAVE
  // A tier's own badge counts only what is actually shown when tiers are
  // hidden, so "on"/count badges don't advertise a hidden 75%/50%/25% row.
  const visibleWaves = multiBoss ? arena.waves.filter((_, i) => !tierHidden(i)) : arena.waves

  /**
   * Gives every later tier this tier's buffs. Copying the *previous* tier is
   * the common setup — the buffs replace one another, so a fight that wants one
   * aura for its whole second half has to repeat it on each tier that would
   * otherwise clear it.
   */
  const copyWaveBuffDown = (index: number) => {
    const source = waveBuffs(arena.waves[index])
    setArena({
      waves: arena.waves.map((wave, i) =>
        i > index ? { ...wave, buffs: source.map((b) => ({ ...b })) } : wave
      )
    })
  }

  /** Gives every later tier this tier's drops. Twin of copyWaveBuffDown. */
  const copyWavePickupDown = (index: number) => {
    const source = wavePickups(arena.waves[index])
    setArena({
      waves: arena.waves.map((wave, i) =>
        i > index ? { ...wave, pickups: source.map((d) => ({ ...d })) } : wave
      )
    })
  }

  const copyWaveTrapDown = (index: number) => {
    const source = waveTraps(arena.waves[index])
    setArena({
      waves: arena.waves.map((wave, i) =>
        i > index ? { ...wave, traps: source.map((t) => ({ ...t })) } : wave
      )
    })
  }

  return (
    <>
      <Section title="Boss" badge={`${arena.bossPool.length}/${BOSS_DEF_LIST.length}`}>
        {multiBoss && (
          <p className="hint">
            Multiple bosses: 75/50/25% tiers, invulnerability and checkpoints are hidden — they
            come back when you set 1 boss.
          </p>
        )}
        <BossSelectionEditor
          selection={bossSelection(arena)}
          bossPool={arena.bossPool}
          bossCount={bossCount}
          bossLineup={arena.bossLineup}
          defs={BOSS_DEF_LIST.map((def) => ({ id: def.id, label: bossLabel(def.id), unique: def.unique }))}
          fieldPrefix={fieldPrefix}
          issues={issues}
          onChange={(patch) => setArena(patch)}
        />
      </Section>

      {!multiBoss && (
        <Section title="Boss invulnerability" badge={invulnBadge(arena.invulnerability)}>
          <InvulnerabilityEditor
            invuln={arena.invulnerability}
            fieldPrefix={fieldPrefix}
            issues={issues}
            onChange={(invulnerability) => setArena({ invulnerability })}
          />
        </Section>
      )}

      <Section title="Waves" defaultOpen>
        <p className="hint">
          {multiBoss
            ? 'With several bosses only the start tier and the all-bosses-dead tier run.'
            : 'Each health threshold switches its tier\'s spawners on and never off — by 25% health all four are running at once. A tier only stops once its own monster budgets run out.'}{' '}
          The last tier fires when the boss dies: the fight is over, but the campaign is not, and it
          spawns into the walk to the orb. It is empty unless you fill it.
        </p>
        {arena.waves.map((wave, i) => {
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
                onWaveChange={(patch) => setWave(i, patch)}
                arenaTwins={arenaUsesBodyguards(arena)}
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
          A tier's buffs cover the whole arena and <strong>replace</strong> the previous tier's, so
          only one tier's are ever live — the fight reads as phases rather than as a growing pile of
          debuffs. The 100% buffs are on from the moment the fight starts. Pick who each catches: a
          buff aimed at the horde never touches the party, and vice versa. No tier carries one by
          default.
        </p>
        {arena.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          const buffs = waveBuffs(wave)
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={
                buffs.length === 0
                  ? 'none'
                  : buffs.map((b) => buffById(b.buff)?.label ?? b.buff).join(', ')
              }
            >
              <BuffListEditor
                value={buffs}
                onChange={(next) => setWave(i, { buffs: next })}
                noun="tier"
                issuePrefix={`${fieldPrefix}.waves.${i}.buffs`}
                issues={issues}
              />
              {i < arena.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => copyWaveBuffDown(i)}
                  title="Give every later tier these same buffs and targets"
                >
                  Copy to tiers below
                </button>
              )}
            </Subsection>
          )
        })}
      </Section>

      <Section
        title="Wave pickups"
        badge={visibleWaves.some((w) => wavePickups(w).length > 0) ? 'on' : undefined}
      >
        <p className="hint">
          A tier's drops appear on the <strong>drop pad</strong> just inside the arena entrance the
          moment its threshold fires, and stay on the floor until somebody walks over them — so
          unlike the buffs above, the tiers do <strong>not</strong> replace one another, and the
          health nobody collected at 50% is still there at 25%. The pad is laid out the same way on
          every seed — health up the left, mana up the right, upgrades in the middle, potions and
          extra lives in the row by the door — so the party can learn it once and run back to it. By default the fight
          resupplies at 50%, hands out one rejuvenation potion at 25%, and doubles the resupply for
          the walk to the orb.
        </p>
        {arena.waves.map((wave, i) => {
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
                onChange={(next) => setWave(i, { pickups: next })}
                noun="tier"
                issuePrefix={`${fieldPrefix}.waves.${i}.pickups`}
                issues={issues}
              />
              {i < arena.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => copyWavePickupDown(i)}
                  title="Give every later tier these same drops and counts"
                >
                  Copy to tiers below
                </button>
              )}
            </Subsection>
          )
        })}
      </Section>

      <Section
        title="Traps"
        badge={visibleWaves.some((w) => waveTraps(w).length > 0) ? 'on' : undefined}
      >
        <p className="hint">
          A trap is a <strong>projectile spewer</strong> against a wall, firing straight across the
          arena. The direction picks the wall: <code>up</code> fires north from the south wall, and
          so on. The seed places it, clear of the corners, the entrance and the alcove.
        </p>
        <ul className="hint hint-list">
          <li>
            <strong>Spread</strong> 0–2. 0 is one straight stream, 0.5 sprays a cone.
          </li>
          <li>
            <strong>Rate</strong> is milliseconds between shots — low numbers flood the room.
          </li>
          <li>Each tier <strong>replaces</strong> the last tier's traps, so the hazard changes.</li>
          <li>Several rows, same direction = mixed ammunition on one wall.</li>
        </ul>
        <p className="hint">No tier carries a trap by default.</p>
        {arena.waves.map((wave, i) => {
          if (tierHidden(i)) return null
          const traps = waveTraps(wave)
          return (
            <Subsection
              key={i}
              title={WAVE_LABELS[i] ?? `Tier ${i + 1}`}
              badge={traps.length === 0 ? 'none' : trapBadge(traps)}
            >
              <TrapListEditor
                value={traps}
                onChange={(next) => setWave(i, { traps: next })}
                noun="tier"
                maxCount={MAX_TRAP_COUNT}
                issuePrefix={`${fieldPrefix}.waves.${i}.traps`}
                issues={issues}
              />
              {i < arena.waves.length - 1 && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() => copyWaveTrapDown(i)}
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
        <Section title="Checkpoints / Save game" badge={checkpointBadge(arena.checkpoints)}>
          <CheckpointsEditor
            checkpoints={arena.checkpoints}
            onChange={(checkpoints) => setArena({ checkpoints })}
          />
        </Section>
      )}

      <Section title="Scattered spawns">
        <p className="hint">
          Tuning for monsters set to a scatter mode in the waves above — those spread across the arena
          instead of trickling out of the nine anchors on the tier's timer. Nothing here matters while
          every monster is on <code>anchors</code>.
        </p>
        <div className="field-grid">
          <NumberField
            label="Spacing"
            field={`${fieldPrefix}.spawn.spacing`}
            value={arena.spawn.spacing}
            onChange={(spacing) => setArena({ spawn: { ...arena.spawn, spacing } })}
            issues={issues}
            min={1}
            title="Tiles kept between two scattered spawn points, so a horde does not materialise stacked on one square"
          />
          {scatterModesInUse.has('ring') && (
            <NumberField
              label="Ring spacing"
              field={`${fieldPrefix}.spawn.ringSpacing`}
              value={arena.spawn.ringSpacing}
              onChange={(ringSpacing) => setArena({ spawn: { ...arena.spawn, ringSpacing } })}
              issues={issues}
              min={1}
              title="Gap between neighbouring spawns around the ring — it also caps how many the ring can hold"
            />
          )}
          {scatterModesInUse.has('gaussian') && (
            <NumberField
              label="Clusters"
              field={`${fieldPrefix}.spawn.clusters`}
              value={arena.spawn.clusters}
              onChange={(clusters) => setArena({ spawn: { ...arena.spawn, clusters } })}
              issues={issues}
              min={1}
              title="Number of seeded cluster centres scattered monsters gather around"
            />
          )}
          <NumberField
            label="Batch size"
            field={`${fieldPrefix}.spawn.batchSize`}
            value={arena.spawn.batchSize}
            onChange={(batchSize) => setArena({ spawn: { ...arena.spawn, batchSize } })}
            issues={issues}
            min={1}
            title="Most of one monster that may appear at once. A bigger count is spread over this many points and trickles in on the batch interval instead of landing on a single frame"
          />
          <NumberField
            label="Batch interval (ms)"
            field={`${fieldPrefix}.spawn.batchIntervalMs`}
            value={arena.spawn.batchIntervalMs}
            onChange={(batchIntervalMs) => setArena({ spawn: { ...arena.spawn, batchIntervalMs } })}
            issues={issues}
            min={100}
            max={60000}
            step={100}
            title="How often a batched scatter spawn releases its next monster per point"
          />
        </div>
      </Section>
    </>
  )
}

/** "boss_queen" -> "Queen" for the checkbox grid. */
function bossLabel(id: string): string {
  const name = id.replace(/^boss_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}


/**
 * A tier's trap list as one line: how many spewers on which wall, e.g.
 * "3 south, 2 north". Counts rather than projectile names, because the wall is
 * what a dungeon master is checking at a glance and the names are long.
 */
function trapBadge(traps: BossTrap[]): string {
  const wall: Record<BossTrapDirection, string> = { up: 'south', down: 'north', left: 'east', right: 'west' }
  const totals = new Map<string, number>()
  for (const t of traps) {
    const side = wall[t.direction] ?? t.direction
    totals.set(side, (totals.get(side) ?? 0) + (Number.isFinite(t.count) ? t.count : 0))
  }
  return [...totals].map(([side, n]) => `${n} ${side}`).join(', ')
}
