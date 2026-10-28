import React, { useState } from 'react'
import {
  BIOME_DEFS,
  BOSS_DEF_LIST,
  MUSIC_DEFAULT,
  WORLD_MAX_AMBUSHES,
  WORLD_MAX_BUTTONS,
  WORLD_MAX_GROUP,
  WORLD_MAX_LOOT,
  WORLD_MAX_MARGIN,
  WORLD_MAX_PACKS,
  WORLD_MAX_SAFE_RADIUS,
  WORLD_MAX_SIZE,
  WORLD_MAX_TIMER_SECONDS,
  WORLD_MIN_MARGIN,
  WORLD_MIN_SAFE_RADIUS,
  WORLD_MIN_SIZE,
  bossSelection,
  campaignCounts,
  defaultFloorTimer,
  defaultWorld,
  isDefaultOrder,
  normalizeOrder,
  slotLabel,
  worldBossCount,
  worldSiteCapacity
} from '../../generator'
import type { DungeonParameters, ValidationIssue, WorldDef, WorldOptions } from '../../generator'
import { BoolField, NumberField, Section, ToggleGroup } from './fields'
import { MusicPicker } from './MusicPicker'
import { PoolTextField } from './PoolTextField'
import { BossSelectionEditor } from './BossSelectionEditor'
import { formatSeconds } from './FloorTimerEditor'

interface WorldFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/** "boss_queen" -> "Queen", as the other boss pickers write it. */
function bossLabel(id: string): string {
  const name = id.replace(/^boss_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Bosses that can roam a world: the floors' mobile list. */
const MOBILE_BOSS_DEFS = BOSS_DEF_LIST.filter((def) => def.mobile)

/**
 * The World tab: open islands, each its own `W` slot in the campaign. Built
 * like the Arena tab — a count (0 switches worlds off and keeps the list),
 * sub-tabs per world, "Copy to next world" — and every edit repairs the
 * stored floor order the way BossForm's does.
 */
export function WorldForm({ params, issues, onChange }: WorldFormProps) {
  const [worldIndex, setWorldIndex] = useState(0)
  const options: WorldOptions = params.world ?? { enabled: false, worlds: [defaultWorld()] }
  const worlds = options.worlds ?? []
  const count = options.enabled ? worlds.length : 0
  const active = Math.min(worldIndex, Math.max(0, worlds.length - 1))
  const world = worlds[active]
  const prefix = `world.worlds.${active}`

  const set = (patch: Partial<WorldOptions>) => {
    const next: DungeonParameters = { ...params, world: { ...options, ...patch } }
    if (params.levelOrder !== undefined) {
      const counts = campaignCounts(next)
      const repaired = normalizeOrder(params.levelOrder, counts)
      if (isDefaultOrder(repaired, counts)) delete next.levelOrder
      else next.levelOrder = repaired
    }
    onChange(next)
  }
  const setWorld = (patch: Partial<WorldDef>) => set({ worlds: worlds.map((w, i) => (i === active ? { ...w, ...patch } : w)) })

  // Zero switches worlds off and keeps the list, so 0 -> 1 gives back the
  // world already tuned; growing clones the last one, as the arenas do.
  const setCount = (raw: number) => {
    const n = Math.max(0, Math.trunc(raw))
    if (Number.isNaN(n)) return
    if (n === 0) {
      if (options.enabled) set({ enabled: false })
      return
    }
    const next = worlds.slice(0, n)
    while (next.length < n) next.push(clone(next[next.length - 1] ?? defaultWorld()))
    set({ enabled: true, worlds: next })
    if (active >= n) setWorldIndex(n - 1)
  }

  const copyToNext = () => {
    if (active + 1 >= worlds.length) return
    set({ worlds: worlds.map((w, i) => (i === active + 1 ? clone(world) : w)) })
    setWorldIndex(active + 1)
  }

  const fieldIssues = (field: string) => issues.filter((i) => i.field === `${prefix}.${field}`)

  return (
    <div className="parameter-form world-form">
      <Section title="World" defaultOpen>
        <p className="hint">
          An open island to explore instead of rooms and passages. The party starts at the center beside
          an empty portal frame; floor buttons and bosses lie round the island, and when the last is done
          the portal comes alive. Each world draws from its own RNG stream, so the dungeon itself is
          identical with or without one, for the same seed.
        </p>
        <NumberField label="Number of worlds" field="world.worlds" value={count} issues={issues} min={0} step={1} onChange={setCount} />
        <p className="hint">Place each world among the floors and arenas on the Floor order tab.</p>
      </Section>

      {count > 0 && world !== undefined && (
        <>
          {worlds.length > 1 && (
            <div className="panel-tabs boss-fight-tabs">
              {worlds.map((_, i) => (
                <button key={i} className={i === active ? 'tab active' : 'tab'} onClick={() => setWorldIndex(i)}>
                  {slotLabel({ kind: 'world', index: i })}
                </button>
              ))}
              <button
                type="button"
                className="copy-down"
                onClick={copyToNext}
                disabled={active + 1 >= worlds.length}
                title="Replace the next world's whole config with this one's"
              >
                Copy to next world
              </button>
            </div>
          )}

          <Section title="Biome" defaultOpen badge={BIOME_DEFS.find((b) => b.id === world.biome)?.label}>
            <label className={`field ${fieldIssues('biome').length > 0 ? 'field-error' : ''}`}>
              <span className="field-label">Ground, trees and cliffs</span>
              <select value={world.biome} onChange={(e) => setWorld({ biome: e.target.value })}>
                {BIOME_DEFS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              {fieldIssues('biome').map((i, k) => (
                <span key={k} className="field-message">
                  {i.message}
                </span>
              ))}
            </label>
            <NumberField
              label="Scatter density (%)"
              field={`${prefix}.scatter`}
              value={world.scatter}
              issues={issues}
              min={0}
              max={100}
              onChange={(scatter) => setWorld({ scatter })}
              title="How thick the trees, rocks and ground cover grow"
            />
            <BoolField label="Dirt trails from the start to each site" checked={world.trails} onChange={(trails) => setWorld({ trails })} />
          </Section>

          <Section title="Size and coast" badge={`${world.minWidth}×${world.minHeight}`}>
            <div className="field-grid">
              <NumberField label="Min width" field={`${prefix}.minWidth`} value={world.minWidth} issues={issues} min={WORLD_MIN_SIZE} max={WORLD_MAX_SIZE} onChange={(minWidth) => setWorld({ minWidth })} />
              <NumberField label="Max width" field={`${prefix}.maxWidth`} value={world.maxWidth} issues={issues} min={WORLD_MIN_SIZE} max={WORLD_MAX_SIZE} onChange={(maxWidth) => setWorld({ maxWidth })} />
            </div>
            <div className="field-grid">
              <NumberField label="Min height" field={`${prefix}.minHeight`} value={world.minHeight} issues={issues} min={WORLD_MIN_SIZE} max={WORLD_MAX_SIZE} onChange={(minHeight) => setWorld({ minHeight })} />
              <NumberField label="Max height" field={`${prefix}.maxHeight`} value={world.maxHeight} issues={issues} min={WORLD_MIN_SIZE} max={WORLD_MAX_SIZE} onChange={(maxHeight) => setWorld({ maxHeight })} />
            </div>
            <p className="hint">In tiles. 192 is about four Shaftlocke towns; above 384 is untested in game.</p>
            <NumberField label="Coast roughness (%)" field={`${prefix}.coast`} value={world.coast} issues={issues} min={0} max={100} onChange={(coast) => setWorld({ coast })} />
            <NumberField label="Water to the map edge" field={`${prefix}.waterMargin`} value={world.waterMargin} issues={issues} min={WORLD_MIN_MARGIN} max={WORLD_MAX_MARGIN} onChange={(waterMargin) => setWorld({ waterMargin })} />
          </Section>

          <Section title="Start">
            <ToggleGroup
              label="Start"
              value={world.hub}
              onChange={(hub) => setWorld({ hub })}
              options={[
                { value: 'random', label: 'Random', title: 'A camp or nothing, per seed' },
                { value: 'camp', label: 'Camp', title: "The biome's tent, campfire and a few props round the portal" },
                { value: 'bare', label: 'Bare', title: 'The middle of nowhere: only the portal frame' }
              ]}
            />
          </Section>

          <Section title="Objectives" defaultOpen badge={`${world.buttons + worldBossCount(world)}`}>
            <p className="hint">
              Every button pressed and every boss killed counts toward the portal. This size fits about{' '}
              {worldSiteCapacity(world.minWidth, world.minHeight, world.waterMargin)}.
            </p>
            <NumberField label="Floor buttons" field={`${prefix}.buttons`} value={world.buttons} issues={issues} min={0} max={WORLD_MAX_BUTTONS} onChange={(buttons) => setWorld({ buttons })} />
            <BossSelectionEditor
              selection={bossSelection(world)}
              bossPool={world.bossPool}
              bossCount={worldBossCount(world)}
              bossLineup={world.bossLineup}
              defs={MOBILE_BOSS_DEFS.map((def) => ({ id: def.id, label: bossLabel(def.id), unique: def.unique }))}
              fieldPrefix={prefix}
              issues={issues}
              onChange={(patch) => setWorld(patch)}
            />
          </Section>

          <Section title="Monsters" badge={`${world.packs} packs`}>
            <PoolTextField
              label="Monster pool"
              value={world.monsters}
              onCommit={(monsters) => setWorld({ monsters })}
              hint="Pool keys, as a floor's: repeat one to weight it, or pin a tier with #."
            />
            {fieldIssues('monsters').map((i, k) => (
              <span key={k} className="field-message">
                {i.message}
              </span>
            ))}
            <div className="field-grid">
              <NumberField label="Roaming packs" field={`${prefix}.packs`} value={world.packs} issues={issues} min={0} max={WORLD_MAX_PACKS} onChange={(packs) => setWorld({ packs })} />
              <NumberField label="Most per pack" field={`${prefix}.packSize`} value={world.packSize} issues={issues} min={1} max={WORLD_MAX_GROUP} onChange={(packSize) => setWorld({ packSize })} />
            </div>
            <NumberField
              label="Safe radius round the start"
              field={`${prefix}.safeRadius`}
              value={world.safeRadius}
              issues={issues}
              min={WORLD_MIN_SAFE_RADIUS}
              max={WORLD_MAX_SAFE_RADIUS}
              onChange={(safeRadius) => setWorld({ safeRadius })}
              title="No pack, ambush or objective closer than this, in tiles"
            />
          </Section>

          <Section title="Ambushes and loot" badge={`${world.ambushes} ambush`}>
            <p className="hint">An ambush is a tripwire on a trail: the first player through it springs a ring of monsters round the party.</p>
            <div className="field-grid">
              <NumberField label="Tripwires" field={`${prefix}.ambushes`} value={world.ambushes} issues={issues} min={0} max={WORLD_MAX_AMBUSHES} onChange={(ambushes) => setWorld({ ambushes })} />
              <NumberField label="Monsters each" field={`${prefix}.ambushSize`} value={world.ambushSize} issues={issues} min={1} max={WORLD_MAX_GROUP} onChange={(ambushSize) => setWorld({ ambushSize })} />
            </div>
            <NumberField
              label="Chance a button springs one (%)"
              field={`${prefix}.buttonAmbush`}
              value={world.buttonAmbush}
              issues={issues}
              min={0}
              max={100}
              onChange={(buttonAmbush) => setWorld({ buttonAmbush })}
            />
            <NumberField label="Loot caches" field={`${prefix}.loot`} value={world.loot} issues={issues} min={0} max={WORLD_MAX_LOOT} onChange={(loot) => setWorld({ loot })} />
          </Section>

          <Section title="Timer" badge={world.timer?.enabled === true ? formatSeconds(world.timer.seconds) : 'off'}>
            <BoolField
              label="A countdown, then the whole island hurts"
              checked={world.timer?.enabled === true}
              onChange={(enabled) => setWorld({ timer: { ...(world.timer ?? defaultFloorTimer()), enabled } })}
            />
            {world.timer?.enabled === true && (
              <>
                <NumberField
                  label="Seconds"
                  field={`${prefix}.timer.seconds`}
                  value={world.timer.seconds}
                  issues={issues}
                  min={1}
                  max={WORLD_MAX_TIMER_SECONDS}
                  onChange={(seconds) => setWorld({ timer: { ...world.timer!, seconds } })}
                />
                <NumberField
                  label="Damage per tick (negative heals)"
                  field={`${prefix}.timer.damage`}
                  value={world.timer.damage}
                  issues={issues}
                  onChange={(damage) => setWorld({ timer: { ...world.timer!, damage } })}
                />
                <NumberField
                  label="Tick (ms)"
                  field={`${prefix}.timer.freqMs`}
                  value={world.timer.freqMs}
                  issues={issues}
                  onChange={(freqMs) => setWorld({ timer: { ...world.timer!, freqMs } })}
                />
              </>
            )}
          </Section>

          <Section title="Music">
            <MusicPicker
              label="Track"
              field={`${prefix}.music`}
              value={world.music}
              issues={issues}
              onChange={(music) => setWorld({ music: music === MUSIC_DEFAULT ? undefined : music })}
            />
          </Section>
        </>
      )}
    </div>
  )
}

/** A deep copy, so two worlds never share a pool or a timer. */
function clone(world: WorldDef): WorldDef {
  return JSON.parse(JSON.stringify(world)) as WorldDef
}
