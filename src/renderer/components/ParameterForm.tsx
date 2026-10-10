import React, { useState } from 'react'
import { MUSIC_DEFAULT, THEME_DEFS, defaultDungeonBoss, defaultFloorLock, defaultFloorLockMystery, defaultFloorMystery, defaultFloorTimer, floorMystery, isDefaultOrder, normalizeOrder } from '../../generator'
import type { CampaignCounts, DungeonParameters, FloorLockMystery, ValidationIssue } from '../../generator'
import { NumberField, Section } from './fields'
import { MusicPicker } from './MusicPicker'
import { MonsterPoolsEditor } from './MonsterPoolsEditor'
import { MonsterMaxTable } from './MonsterMaxTable'
import { FloorTimerEditor } from './FloorTimerEditor'
import { FloorLockEditor } from './FloorLockEditor'
import { FloorBuffEditor } from './FloorBuffEditor'
import { FloorTrapEditor } from './FloorTrapEditor'
import { DungeonBossEditor } from './DungeonBossEditor'
import { MysteryButtonsEditor } from './MysteryButtonsEditor'

/** Themes bucketed by their registry group, in registry order. */
const THEME_GROUPS = THEME_DEFS.reduce<[string, (typeof THEME_DEFS)[number][]][]>((groups, def) => {
  const existing = groups.find(([name]) => name === def.group)
  if (existing) existing[1].push(def)
  else groups.push([def.group, [def]])
  return groups
}, [])

interface ParameterFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

export function ParameterForm({ params, issues, onChange }: ParameterFormProps) {
  // Standard vs Boss are two views of the SAME dungeon parameters, shown one at
  // a time: Boss holds only the per-floor boss editor, because several of its
  // sections share names with standard ones and the two read as one form when
  // stacked. Session state only, like every other sub-tab selector here.
  // Mystery Buttons (issue #67) is another view, between the two: a
  // campaign-wide pool plus a per-floor pick, neither of which belongs to any
  // one Standard section.
  const [dungeonTab, setDungeonTab] = useState<'standard' | 'boss' | 'mystery'>('standard')

  const set = <K extends keyof DungeonParameters>(key: K, value: DungeonParameters[K]) => {
    onChange({ ...params, [key]: value })
  }

  /** Changing the level count resizes the per-level theme, monster, buff and timer lists. */
  const setLevels = (levels: number) => {
    const next = { ...params, levels }
    if (Number.isInteger(levels) && levels >= 1 && levels <= 50) {
      const themes = [...params.themes]
      while (themes.length < levels) themes.push(themes[themes.length - 1] ?? 'a')
      next.themes = themes.slice(0, Math.max(levels, 1))

      const pools = params.levelMonsters.map((p) => [...p])
      while (pools.length < levels) pools.push([...(pools[pools.length - 1] ?? ['bat1'])])
      next.levelMonsters = pools.slice(0, Math.max(levels, 1))

      const levelBuffs = (params.levelBuffs ?? []).map((list) => list.map((b) => ({ ...b })))
      while (levelBuffs.length < levels)
        levelBuffs.push((levelBuffs[levelBuffs.length - 1] ?? []).map((b) => ({ ...b })))
      next.levelBuffs = levelBuffs.slice(0, Math.max(levels, 1))

      const levelTraps = (params.levelTraps ?? []).map((list) => list.map((t) => ({ ...t })))
      while (levelTraps.length < levels)
        levelTraps.push((levelTraps[levelTraps.length - 1] ?? []).map((t) => ({ ...t })))
      next.levelTraps = levelTraps.slice(0, Math.max(levels, 1))

      const timers = (params.levelTimers ?? []).map((t) => ({ ...t }))
      while (timers.length < levels) timers.push({ ...(timers[timers.length - 1] ?? defaultFloorTimer()) })
      next.levelTimers = timers.slice(0, Math.max(levels, 1))

      const floorMusic = [...(params.floorMusic ?? [])]
      while (floorMusic.length < levels) floorMusic.push(MUSIC_DEFAULT)
      next.floorMusic = floorMusic.slice(0, Math.max(levels, 1))

      // Unlike levelBuffs/levelTraps/levelTimers, a new floor pads with a
      // fresh disabled boss rather than cloning the last floor's — the same
      // shape floorMusic uses for its own default sentinel. Cloning would mean
      // growing the floor count silently seals a new floor's exit too.
      //
      // And it stays ABSENT while it was absent: `levelBoss` is the one
      // per-floor array `defaultParameters()` does not ship, and its doc
      // comment reads "a params object without it ... is byte-identical to the
      // pre-feature generator". Materialising a row of disabled bosses just
      // because the floor count changed would make that sentence false for
      // every campaign that merely got resized, even though nothing downstream
      // would notice.
      if (params.levelBoss !== undefined) {
        const levelBoss = params.levelBoss.map((b) => JSON.parse(JSON.stringify(b)))
        while (levelBoss.length < levels) levelBoss.push(defaultDungeonBoss())
        next.levelBoss = levelBoss.slice(0, Math.max(levels, 1))
      }

      // A stored order names floors that may no longer exist, or may now be
      // missing one. Repairing keeps the arrangement the dungeon master made
      // instead of throwing it away every time the count changes; an order that
      // repairs back to the default is dropped, since absent IS the default.
      // Same rule as levelBoss above: a new floor pads UNLOCKED rather than
      // cloning the last floor's lock — growing the floor count must not
      // silently seal a new floor's exit — and an absent array stays absent.
      if (params.levelLock !== undefined) {
        const levelLock = params.levelLock.map((l) => ({ ...l }))
        while (levelLock.length < levels) levelLock.push(defaultFloorLock())
        next.levelLock = levelLock.slice(0, Math.max(levels, 1))
      }

      // Mystery buttons pad the same way: a new floor hides none, and an
      // absent list stays absent.
      if (params.levelMystery !== undefined) {
        const levelMystery = params.levelMystery.map((f) => ({ count: f.count, pool: [...f.pool] }))
        while (levelMystery.length < levels) levelMystery.push(defaultFloorMystery())
        next.levelMystery = levelMystery.slice(0, Math.max(levels, 1))
      }

      // Enhanced lock buttons: same padding rule, absent stays absent.
      if (params.levelLockMystery !== undefined) {
        const levelLockMystery = params.levelLockMystery.map((f): FloorLockMystery => ({ count: f.count, pool: [...f.pool], ...(f.disguise ? { disguise: true } : {}) }))
        while (levelLockMystery.length < levels) levelLockMystery.push(defaultFloorLockMystery())
        next.levelLockMystery = levelLockMystery.slice(0, Math.max(levels, 1))
      }

      if (params.levelOrder !== undefined) {
        const counts: CampaignCounts = {
          levels,
          fights: params.boss?.enabled === true ? (params.boss.fights?.length ?? 0) : 0,
          lobbies: params.lobbies.length
        }
        const repaired = normalizeOrder(params.levelOrder, counts)
        if (isDefaultOrder(repaired, counts)) delete next.levelOrder
        else next.levelOrder = repaired
      }
    }
    onChange(next)
  }

  const setTheme = (index: number, theme: string) => {
    const themes = [...params.themes]
    themes[index] = theme
    set('themes', themes)
  }

  const setFloorMusic = (index: number, track: string) => {
    const floorMusic = [...(params.floorMusic ?? params.themes.map(() => MUSIC_DEFAULT))]
    floorMusic[index] = track
    set('floorMusic', floorMusic)
  }

  const enabledBossFloors = (params.levelBoss ?? []).slice(0, params.levels).filter((b) => b.enabled).length
  // The Mystery Buttons tab now covers two independent configs — plates
  // (levelMystery) and enhanced lock buttons (levelLockMystery) — so the tab
  // badge counts a floor once whichever (or both) it uses.
  const levelCount = Math.max(params.levels, 0) || 0
  const mysteryFloors = Array.from({ length: levelCount }, (_, i) => {
    const lock = params.levelLockMystery?.[i]
    return floorMystery(params, i) !== undefined || (lock !== undefined && (lock.count > 0 || lock.disguise))
  }).filter(Boolean).length

  return (
    <div className="parameter-form">
      <div className="panel-tabs dungeon-sub-tabs">
        <button
          className={dungeonTab === 'standard' ? 'tab active' : 'tab'}
          onClick={() => setDungeonTab('standard')}
        >
          Standard Settings
        </button>
        <button className={dungeonTab === 'mystery' ? 'tab active' : 'tab'} onClick={() => setDungeonTab('mystery')}>
          Mystery Buttons
          {mysteryFloors > 0 && <span className="tab-count">{mysteryFloors}</span>}
        </button>
        <button className={dungeonTab === 'boss' ? 'tab active' : 'tab'} onClick={() => setDungeonTab('boss')}>
          Boss Settings
          {enabledBossFloors > 0 && <span className="tab-count">{enabledBossFloors}</span>}
        </button>
      </div>

      {dungeonTab === 'boss' && <DungeonBossEditor params={params} issues={issues} onChange={onChange} />}

      {dungeonTab === 'mystery' && <MysteryButtonsEditor params={params} issues={issues} onChange={onChange} />}

      {dungeonTab === 'standard' && (
        <>
          <Section title="General" defaultOpen>
            <div className="field-grid">
              <NumberField label="Levels" field="levels" value={params.levels} onChange={setLevels} issues={issues} min={0} max={50} title="Number of floors in the campaign — 0 means a boss-only campaign (needs the boss fight on, and usually a lobby to shop from first)" />
              <NumberField label="Map width" field="mapWidth" value={params.mapWidth} onChange={(v) => set('mapWidth', v)} issues={issues} min={20} step={20} title="In tiles — multiples of 20 recommended" />
              <NumberField label="Map height" field="mapHeight" value={params.mapHeight} onChange={(v) => set('mapHeight', v)} issues={issues} min={20} step={20} title="In tiles — multiples of 20 recommended" />
              <NumberField label="Edge padding" field="edgePadding" value={params.edgePadding} onChange={(v) => set('edgePadding', v)} issues={issues} min={0} title="Empty border around the map" />
              <NumberField label="Room padding" field="roomPadding" value={params.roomPadding} onChange={(v) => set('roomPadding', v)} issues={issues} min={0} title="Minimum gap between rooms" />
            </div>
          </Section>

          <Section title="Rooms & passages" defaultOpen>
            <div className="field-grid">
              <NumberField label="Min room size" field="minRoomSize" value={params.minRoomSize} onChange={(v) => set('minRoomSize', v)} issues={issues} min={3} />
              <NumberField label="Max room size" field="maxRoomSize" value={params.maxRoomSize} onChange={(v) => set('maxRoomSize', v)} issues={issues} min={3} />
              <NumberField label="Min room count" field="minRoomCount" value={params.minRoomCount} onChange={(v) => set('minRoomCount', v)} issues={issues} min={2} />
              <NumberField label="Max room count" field="maxRoomCount" value={params.maxRoomCount} onChange={(v) => set('maxRoomCount', v)} issues={issues} min={2} />
              <NumberField label="Min passage width" field="minPassageWidth" value={params.minPassageWidth} onChange={(v) => set('minPassageWidth', v)} issues={issues} min={1} />
              <NumberField label="Max passage width" field="maxPassageWidth" value={params.maxPassageWidth} onChange={(v) => set('maxPassageWidth', v)} issues={issues} min={1} />
            </div>
          </Section>

          <Section title="Chances & multipliers">
            <div className="field-grid">
              <NumberField label="Shop chance" field="shopChance" value={params.shopChance} onChange={(v) => set('shopChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of a shop room" />
              <NumberField label="Vault chance" field="vaultChance" value={params.vaultChance} onChange={(v) => set('vaultChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of a locked treasure vault" />
              <NumberField label="Lock chance" field="lockChance" value={params.lockChance} onChange={(v) => set('lockChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of an extra locked room" />
              <NumberField label="Key chance" field="keyChance" value={params.keyChance} onChange={(v) => set('keyChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level that a key spawns for the last lock" />
              <NumberField label="Monster ×" field="monsterMultiplier" value={params.monsterMultiplier} onChange={(v) => set('monsterMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales monster horde sizes" />
              <NumberField label="Gold ×" field="goldMultiplier" value={params.goldMultiplier} onChange={(v) => set('goldMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales treasure amounts" />
              <NumberField label="Food ×" field="foodMultiplier" value={params.foodMultiplier} onChange={(v) => set('foodMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales health/mana drops" />
            </div>
          </Section>

          <Section title="Locked rooms" badge={(params.levelLock ?? []).slice(0, params.levels).some((l) => l.enabled) ? 'on' : undefined}>
            <FloorLockEditor params={params} issues={issues} onChange={onChange} />
          </Section>

          <Section title="Themes" badge={params.themes.slice(0, params.levels).join(', ')}>
            <p className="hint">
              Tileset per level:<br/>
              &nbsp;&nbsp;<strong>a–d</strong> classic dungeon<br/>
              &nbsp;&nbsp;<strong>e–g</strong> castle<br/>
              &nbsp;&nbsp;<strong>h</strong>–<strong>i</strong> desert (h outdoors, i indoors)<br/>
              <br/>
              Bonus levels 1–5 are Gauntlet easter eggs theme:<br/>
              &nbsp;&nbsp;1 = asphalt<br/>
              &nbsp;&nbsp;2 = brown crack dirt<br/>
              &nbsp;&nbsp;3 = black/brown diagonal squares<br/>
              &nbsp;&nbsp;4 = brown/tan checker tiles<br/>
              &nbsp;&nbsp;5 = red tiles.<br/>
              <br/>
              Entries like <strong>c - tiles</strong> are that same theme with an
              alternate tileset layered over its floor. Same rooms, walls and
              stairs — only the floor art changes.<br/>
              <br/>
              <strong>c - mixed</strong> varies that choice across the level: every
              room and every corridor picks its own surface from the plain theme and
              its alternates, so a carpeted hall can lead into a dirt-floored vault.
            </p>
            <div className="theme-grid">
              {Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, i) => (
                <label key={i} className="theme-item">
                  <span>Level {i + 1}</span>
                  <select value={params.themes[i] ?? 'a'} onChange={(e) => setTheme(i, e.target.value)}>
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
              ))}
            </div>
            {issues
              .filter((i) => i.field === 'themes')
              .map((issue, i) => (
                <p key={i} className="field-message">
                  {issue.message}
                </p>
              ))}
          </Section>

          <Section title="Music per level">
            <p className="hint">
              Swaps a floor's own music track. Left on <strong>Default</strong>,
              a floor plays whatever the game falls back to — nothing is emitted.
            </p>
            <div className="field-grid">
              {Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, i) => (
                <MusicPicker
                  key={i}
                  label={`Level ${i + 1}`}
                  field={`floorMusic.${i}`}
                  value={params.floorMusic?.[i]}
                  onChange={(v) => setFloorMusic(i, v)}
                  issues={issues}
                />
              ))}
            </div>
          </Section>

          <Section title="Monster pools per level">
            <MonsterPoolsEditor params={params} issues={issues} onChange={onChange} />
          </Section>

          <Section title="Monster max counts">
            <MonsterMaxTable params={params} onChange={onChange} />
          </Section>

          <Section title="Buffs per floor" badge={(params.levelBuffs ?? []).slice(0, params.levels).some((b) => b.length > 0) ? 'on' : undefined}>
            <FloorBuffEditor params={params} issues={issues} onChange={onChange} />
          </Section>
          <Section title="Traps per floor" badge={(params.levelTraps ?? []).slice(0, params.levels).some((t) => t.length > 0) ? 'on' : undefined}>
            <FloorTrapEditor params={params} issues={issues} onChange={onChange} />
          </Section>

          <Section title="Timer mode" badge={(params.levelTimers ?? []).slice(0, params.levels).some((t) => t.enabled) ? 'on' : undefined}>
            <FloorTimerEditor params={params} issues={issues} onChange={onChange} />
          </Section>
        </>
      )}
    </div>
  )
}
