import React, { useMemo, useState } from 'react'
import {
  DEFAULT_LOBBY_PRESET_ID,
  GOLD_SAFETY_MAX,
  LOBBY_DIAMOND_VALUE,
  LOBBY_PRESETS,
  LOBBY_VENDORS,
  UPGRADE_KINDS,
  defaultLobby,
  diamondCount,
  isDefaultOrder,
  lobbyCategoryCounts,
  normalizeOrder
} from '../../generator'
import type {
  CampaignCounts,
  DungeonParameters,
  LobbyOptions,
  LobbyPresetDef,
  PlayerTweaks,
  ValidationIssue
} from '../../generator'
import { BoolField, NumberField, Section } from './fields'
import { MusicPicker } from './MusicPicker'
import { UpgradeCountFields } from './UpgradeCountFields'

interface LobbyFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

export function LobbyForm({ params, issues, onChange }: LobbyFormProps) {
  // Which lobby the sub-tabs below are editing. Clamped rather than reset when
  // the count shrinks, so trimming the list does not throw away the view — the
  // same rule BossForm's fightIndex follows.
  const [lobbyIndex, setLobbyIndex] = useState(0)
  const lobbies = params.lobbies
  const active = Math.min(lobbyIndex, Math.max(0, lobbies.length - 1))
  const lobby = lobbies[active]

  // Repairs the stored campaign order against the lobby list a patch leaves
  // behind, exactly as ParameterForm.setLevels and BossForm.set do for the
  // floor and fight counts. Zero lobbies is legal and is how the feature is
  // turned off, so unlike boss.fights there is no lower bound here.
  const setLobbies = (nextLobbies: LobbyOptions[]) => {
    const next: DungeonParameters = { ...params, lobbies: nextLobbies }
    if (params.levelOrder !== undefined) {
      const counts: CampaignCounts = {
        levels: params.levels,
        fights: params.boss?.enabled === true ? (params.boss.fights?.length ?? 0) : 0,
        lobbies: nextLobbies.length
      }
      const repaired = normalizeOrder(params.levelOrder, counts)
      if (isDefaultOrder(repaired, counts)) delete next.levelOrder
      else next.levelOrder = repaired
    }
    onChange(next)
  }

  const setLobby = (index: number, patch: Partial<LobbyOptions>) =>
    setLobbies(lobbies.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  // Grow by cloning the LAST lobby, not the stock default — a dungeon master
  // tuning lobby 1 and asking for a second almost always wants a variation on
  // it. Same growth rule BossForm.setFightCount uses.
  const setLobbyCount = (countRaw: number) => {
    const count = Math.max(0, Math.trunc(countRaw))
    if (count === lobbies.length) return
    const next = lobbies.slice(0, count)
    while (next.length < count) next.push(cloneLobby(next[next.length - 1] ?? defaultLobby(DEFAULT_LOBBY_PRESET_ID)))
    setLobbies(next)
    if (active >= count) setLobbyIndex(Math.max(0, count - 1))
  }

  const copyToNext = () => {
    if (active + 1 >= lobbies.length) return
    setLobbies(lobbies.map((l, i) => (i === active + 1 ? cloneLobby(lobby) : l)))
    setLobbyIndex(active + 1)
  }

  const preset = LOBBY_PRESETS.find((p) => p.id === lobby?.preset)

  // what each column is actually worth once the Player tab has had its say, so
  // an emptied ladder is visible here without the two tabs being coupled
  const counts = useMemo(
    () => lobbyCategoryCounts((params.playerTweaks ?? {}) as PlayerTweaks),
    [params.playerTweaks]
  )

  const selected = new Set(lobby?.shopCategories ?? [])
  const toggle = (category: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(category)
    else next.delete(category)
    setLobby(active, { shopCategories: [...next] })
  }

  const setAll = (categories: readonly string[], on: boolean) => {
    const next = new Set(selected)
    for (const c of categories) {
      if (on) next.add(c)
      else next.delete(c)
    }
    setLobby(active, { shopCategories: [...next] })
  }

  return (
    <div className="parameter-form lobby-form">
      <Section title="Lobbies" defaultOpen>
        <p className="hint">
          Shop rooms the campaign master can drop anywhere in the run: gold on the floor, some vendor
          stalls, and a teleport onward. Arrange them on the Floor order tab as <strong>L1</strong>,{' '}
          <strong>L2</strong>… — a lobby may go before the first floor, between two floors, or in
          front of a boss fight, but never last, since it carries no victory orb of its own. Zero
          lobbies reproduces the pre-lobby campaign exactly, the same rule <code>boss.fights</code>{' '}
          already follows for its own list. With saves on, each lobby also carries a save checkpoint
          beside its exit.
        </p>
        <NumberField
          label="Number of lobbies"
          field="lobbies"
          value={lobbies.length}
          issues={issues}
          min={0}
          step={1}
          onChange={setLobbyCount}
        />
        <div style={{ marginTop: '4px' }}>
          <BoolField
            label="Allow save game in lobbies"
            checked={params.lobbySaves}
            onChange={(lobbySaves) => onChange({ ...params, lobbySaves })}
          />
        </div>
      </Section>

      {lobby !== undefined && (
        <>
          {lobbies.length > 1 && (
            <div className="panel-tabs boss-fight-tabs">
              {lobbies.map((_, i) => (
                <button
                  key={i}
                  className={i === active ? 'tab active' : 'tab'}
                  onClick={() => setLobbyIndex(i)}
                >
                  Lobby {i + 1}
                </button>
              ))}
              <button
                type="button"
                className="copy-down"
                onClick={copyToNext}
                disabled={active + 1 >= lobbies.length}
                title="Replace the next lobby's preset, gold, shops and upgrades with this one's"
              >
                Copy to next lobby
              </button>
            </div>
          )}

          <Section title="Preset" defaultOpen>
            <label className="field">
              <span className="field-label">Room</span>
              <select
                value={lobby.preset}
                onChange={(e) => setLobby(active, { preset: e.target.value })}
              >
                {LOBBY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} title={p.description}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">{preset?.description ?? `"${lobby.preset}" is not a known preset.`}</p>
            {issues
              .filter((i) => i.field === `lobbies.${active}.preset`)
              .map((issue, i) => (
                <p key={i} className="field-message">
                  {issue.message}
                </p>
              ))}
          </Section>

          <Section title="Music" defaultOpen>
            <p className="hint">
              Swaps this room's own music. Left on <strong>Default</strong>,
              the lobby plays whatever it was authored with — nothing is
              emitted.
            </p>
            <MusicPicker
              label="Track"
              field={`lobbies.${active}.music`}
              value={lobby.music}
              onChange={(v) => setLobby(active, { music: v })}
              issues={issues}
            />
          </Section>

          <Section title="Starting gold" defaultOpen badge={`${lobby.startingGold}`}>
            <div className="field-grid">
              <NumberField
                label="Gold on the floor"
                field={`lobbies.${active}.startingGold`}
                value={lobby.startingGold}
                onChange={(startingGold) => setLobby(active, { startingGold })}
                issues={issues}
                min={0}
                max={GOLD_SAFETY_MAX}
                step={LOBBY_DIAMOND_VALUE}
                title={`Each ${LOBBY_DIAMOND_VALUE} is one red diamond`}
              />
            </div>
            <p className="hint">{goldDescription(lobby.startingGold, preset?.diamondSlots.length ?? 0)}</p>
          </Section>

          <UpgradeCountFields
            upgrades={lobby.upgrades}
            field={`lobbies.${active}.upgrades`}
            issues={issues}
            onChange={(upgrades) => setLobby(active, { upgrades })}
          />

          <Section title="Shops" defaultOpen badge={`${lobby.shopCategories.length}/21`}>
            <p className="hint">
              Each stall sells whichever shop columns you tick — they are independent columns, not
              tiers, so any subset is legal. A stall with nothing ticked is left out of the level
              entirely. Dungeon shop rooms are unaffected and keep rolling their own random set.
            </p>

            {LOBBY_VENDORS.map((vendor) => {
              const on = vendor.categories.filter((c) => selected.has(c))
              return (
                <div key={vendor.id} className="lobby-vendor">
                  <div className="lobby-vendor-head">
                    <span
                      className="lobby-vendor-name"
                      title={vendor.id === 'power' ? 'Potions, extra life, and health rejuvenation' : undefined}
                    >
                      {vendor.label}
                    </span>
                    <span className="lobby-vendor-badge">
                      {vendor.categories.length === 1
                        ? on.length === 1
                          ? 'open'
                          : 'closed'
                        : `${on.length}/${vendor.categories.length}`}
                    </span>
                    <span className="lobby-vendor-actions">
                      <button type="button" onClick={() => setAll(vendor.categories, true)}>
                        All
                      </button>
                      <button type="button" onClick={() => setAll(vendor.categories, false)}>
                        None
                      </button>
                    </span>
                  </div>
                  <div className="lobby-columns">
                    {vendor.categories.map((category) => (
                      <BoolField
                        key={category}
                        label={`${category} (${counts[category] ?? 0})`}
                        checked={selected.has(category)}
                        onChange={(checked) => toggle(category, checked)}
                        title={`${counts[category] ?? 0} upgrade(s) in this column after the Player tab's edits`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {issues
              .filter((i) => i.field === `lobbies.${active}.shopCategories`)
              .map((issue, i) => (
                <p key={i} className="field-message">
                  {issue.message}
                </p>
              ))}
          </Section>

          {preset !== undefined && (
            <Section title="Layout" defaultOpen>
              <LobbyDiagram preset={preset} lobby={lobby} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

/**
 * A deep-enough copy that two lobbies never share a mutable sub-object — the
 * upgrade counts and shop-category array are edited in place, so a shallow
 * spread would make an edit to one lobby show up in another. Mirrors
 * BossForm's cloneFight.
 */
function cloneLobby(lobby: LobbyOptions): LobbyOptions {
  return JSON.parse(JSON.stringify(lobby)) as LobbyOptions
}

/**
 * Deliberately "gold on the floor", not "you start with N gold".
 *
 * Stacked diamonds pay out in full, but that was only ever tested solo — nobody
 * has confirmed whether a drop is shared by the party or given to each player
 * (open question 12 in the discovery log). Until someone runs it with two
 * players the label must not promise either reading.
 */
function goldDescription(startingGold: number, slots: number): string {
  const diamonds = diamondCount(startingGold)
  if (diamonds === 0) return 'No gold on the floor — the vendors are there for later.'
  if (slots === 0) return `${diamonds} red diamond(s).`

  const noun = diamonds === 1 ? 'red diamond' : 'red diamonds'
  if (diamonds <= slots) return `${diamonds} ${noun} on the floor.`

  const deep = Math.floor(diamonds / slots)
  const remainder = diamonds % slots
  const spots = remainder === 0 ? slots : remainder
  return (
    `${diamonds} ${noun} on the floor, stacked ${remainder === 0 ? deep : deep + 1} deep ` +
    `on ${spots} of the ${slots} spots.`
  )
}

interface LobbyDiagramProps {
  preset: LobbyPresetDef
  lobby: LobbyOptions
}

/**
 * A static diagram of the room, so the numbers above have an obvious meaning.
 *
 * This is why a lobby has no entry in the dungeon preview tab: `LevelPreview`
 * draws generated room and passage geometry, and a hand-authored level has
 * none. The dungeon-prep and boss-prep rooms lay their free-upgrade slots out
 * differently — one back-to-front, the other left-to-right — and the
 * boss-prep room carries 42 diamond slots to the dungeon-prep room's 12, so
 * the diagram is driven off the selected preset's own `diamondSlots` and
 * `upgradeSlots` tables (the same coordinates `buildLobby()` edits by id)
 * rather than assuming every preset is shaped like the original lobby.
 */
function LobbyDiagram({ preset, lobby }: LobbyDiagramProps) {
  const slots = preset.diamondSlots.length
  const diamonds = Math.min(diamondCount(lobby.startingGold), slots)
  const openStalls = LOBBY_VENDORS.filter((v) => v.categories.some((c) => lobby.shopCategories.includes(c)))

  const allPoints = [...preset.diamondSlots, ...UPGRADE_KINDS.map((k) => preset.upgradeSlots[k])]
  const xs = allPoints.map((p) => p[0])
  const ys = allPoints.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  // Coordinates are the template's own — more negative y is further from the
  // entrance in both rooms, so the smallest y naturally lands at the top of
  // the box and the room reads back-to-front top-to-bottom.
  const pos = ([x, y]: readonly [number, number]): React.CSSProperties => ({
    left: `${((x - minX) / spanX) * 100}%`,
    top: `${((y - minY) / spanY) * 100}%`
  })

  return (
    <div className="lobby-diagram" aria-hidden="true">
      <div className="lobby-diagram-scene" style={{ aspectRatio: `${spanX} / ${spanY}` }}>
        {preset.diamondSlots.map((slot, i) => (
          <span
            key={`d${i}`}
            className={i < diamonds ? 'scene-dot diamond on' : 'scene-dot diamond'}
            style={pos(slot)}
          />
        ))}
        {UPGRADE_KINDS.map((kind) => {
          const count = lobby.upgrades?.[kind] ?? 0
          return (
            <span
              key={kind}
              className={count > 0 ? 'scene-dot upgrade on' : 'scene-dot upgrade'}
              style={pos(preset.upgradeSlots[kind])}
              title={`${count} free ${kind} upgrade${count === 1 ? '' : 's'}`}
            >
              {count > 1 ? count : ''}
            </span>
          )
        })}
      </div>
      <div className="lobby-diagram-row lobby-diagram-floor">
        <span className="lobby-spawn">spawn</span>
        <span className="lobby-pad">teleport onward</span>
      </div>
      <div className="lobby-diagram-row lobby-diagram-stalls">
        {LOBBY_VENDORS.map((vendor) => (
          <span
            key={vendor.id}
            className={openStalls.includes(vendor) ? 'stall open' : 'stall'}
            title={openStalls.includes(vendor) ? vendor.label : `${vendor.label} — not in the level`}
          >
            {vendor.label}
          </span>
        ))}
      </div>
    </div>
  )
}
