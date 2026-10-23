import React from 'react'
import {
  PLAYER_FIELD_MAP,
  PLAYER_STOCK,
  SHARED_SKILL_PATHS,
  addedCategory,
  addedFieldSpecs,
  addedTiers,
  boughtRoot,
  chainLabel,
  chainLevels,
  classLabel,
  extraKey,
  extraLabel,
  levelsKey,
  playerField,
  setChainLevels,
  shopKey,
  shopPriceLabel,
  skillFileLabel,
  skillKey,
  startingLevelKey,
  statKey,
  tierLabel,
  unlockKey
} from '../../generator'
import type { PlayerChain, PlayerFieldDef, PlayerSkillFile, PlayerTweaks, ValidationIssue } from '../../generator'
import { BoolField, NumberField, Section, Subsection, TierBlock } from './fields'
import { QuickSetup } from './QuickSetup'
import { TierStepper } from './TierStepper'

interface PlayerFormProps {
  tweaks: PlayerTweaks
  issues: ValidationIssue[]
  onChange: (tweaks: PlayerTweaks) => void
}

// combo first: it's the one every class shares, ahead of the two move speeds
const SHARED_FILES = PLAYER_STOCK.skills
  .filter((f) => SHARED_SKILL_PATHS.has(f.path))
  .sort((a, b) => Number(b.stem === 'shared_combo') - Number(a.stem === 'shared_combo'))

// the power shop's potions, and the item shops' per-quality prices (equipment_*)
const POTIONS = PLAYER_STOCK.shop.filter((p) => !p.id.startsWith('equipment_'))
const ITEMS = PLAYER_STOCK.shop.filter((p) => p.id.startsWith('equipment_'))

// skill numbers outside players/: the combo's regen buffs (shared) and the
// warlock's lightning bolt, each shown with the skill it belongs to
const COMBO_KEYS = PLAYER_STOCK.extras.filter((e) => e.id.startsWith('combo_')).map((e) => extraKey(e.id))
const CLASS_EXTRA_KEYS: Record<string, string[]> = {
  warlock: PLAYER_STOCK.extras.filter((e) => e.id.startsWith('lightning_')).map((e) => extraKey(e.id))
}

/** The numbers of a chain's tiers added past stock, with these overrides. */
function addedKeysOf(chain: PlayerChain, tweaks: PlayerTweaks): string[] {
  const names = addedFieldSpecs(chain).map((s) => s.name)
  const keys: string[] = []
  for (let t = chain.tiers.length + 1; t <= chainLevels(chain.key, tweaks); t++) {
    for (const name of names) keys.push(skillKey(chain.key, t, name))
  }
  return keys
}

/** Every all-classes key a skill file holds, for its "n changed" badge. */
function keysOfFile(file: PlayerSkillFile, tweaks: PlayerTweaks): string[] {
  const keys: string[] = []
  for (const chain of file.chains) {
    if (PLAYER_FIELD_MAP.has(startingLevelKey(chain.key))) keys.push(startingLevelKey(chain.key))
    if (PLAYER_FIELD_MAP.has(levelsKey(chain.key))) keys.push(levelsKey(chain.key), ...addedKeysOf(chain, tweaks))
    chain.tiers.forEach((tier, i) => {
      if (tier.cost !== undefined) keys.push(skillKey(chain.key, i + 1, 'cost'))
      for (const name of Object.keys(tier.binds)) keys.push(skillKey(chain.key, i + 1, name))
      for (const name of Object.keys(tier.params ?? {})) keys.push(skillKey(chain.key, i + 1, name))
    })
  }
  return keys
}

/**
 * Editor for AE's player balance: each class's base stats
 * (players/classes.sval) and every skill's prices and numbers, tier by tier
 * (players/<class>/skills/*.sval). A value back at stock is deleted rather
 * than stored, so "nothing changed" stays empty and no player file ships.
 * The install patches the changed lines into the game's own files.
 */
export function PlayerForm({ tweaks, issues, onChange }: PlayerFormProps) {
  const set = (field: PlayerFieldDef, value: number) => {
    const next = { ...tweaks }
    if (Number.isNaN(value) || value === field.stock) delete next[field.key]
    else next[field.key] = value
    onChange(next)
  }

  const badge = (keys: string[]): string | undefined => {
    const n = keys.filter((k) => tweaks[k] !== undefined).length
    return n === 0 ? undefined : `${n} changed`
  }

  const input = (key: string, label: string) => {
    const field = PLAYER_FIELD_MAP.get(key)
    if (field === undefined) return null
    const step = field.kind === 'cost' ? 50 : field.type === 'float' ? 0.05 : 1
    return (
      <NumberField
        key={key}
        label={label}
        field={key}
        value={tweaks[key] ?? field.stock}
        step={step}
        issues={issues}
        title={`stock ${field.stock}`}
        onChange={(v) => set(field, v)}
      />
    )
  }

  const unlock = (file: PlayerSkillFile) => {
    const field = PLAYER_FIELD_MAP.get(unlockKey(file.stem))
    if (field === undefined || boughtRoot(file) === undefined) return null
    return (
      <BoolField
        label="Owned from the start"
        title="Every character of the class starts with this skill instead of buying it in a shop"
        checked={(tweaks[field.key] ?? field.stock) >= 1}
        onChange={(on) => set(field, on ? 1 : 0)}
      />
    )
  }

  /** A number of a tier added past stock: shown at its default until edited, which follows the tiers below. */
  const addedInput = (key: string, label: string, value: number, def: number, type: 'int' | 'float') => (
    <NumberField
      key={key}
      label={label}
      field={key}
      value={value}
      step={label === 'cost' ? 50 : type === 'float' ? 0.05 : 1}
      issues={issues}
      title={`default ${def}, carrying on the tiers below`}
      onChange={(v) => {
        const next = { ...tweaks }
        if (Number.isNaN(v) || v === def) delete next[key]
        else next[key] = type === 'int' ? Math.trunc(v) : v
        onChange(next)
      }}
    />
  )

  const chainEditor = (file: PlayerSkillFile, chain: PlayerChain) => {
    const levelsField = PLAYER_FIELD_MAP.get(levelsKey(chain.key))
    const levels = chainLevels(chain.key, tweaks)
    const specs = addedFieldSpecs(chain)
    const category = addedCategory(chain)
    return (
      <div key={chain.key} className="player-chain">
        {(file.chains.length > 1 || levelsField !== undefined) && (
          <div className="player-chain-head">
            {file.chains.length > 1 && <span className="player-chain-title">{chainLabel(file, chain)}</span>}
            {levelsField !== undefined && (
              <TierStepper
                field={levelsField.key}
                value={levels}
                stock={levelsField.stock}
                max={levelsField.maxLevel ?? levelsField.stock}
                issues={issues}
                onChange={(n) => onChange(setChainLevels(tweaks, chain.key, n))}
              />
            )}
          </div>
        )}
        {chain.tiers.slice(0, levels).map((tier, i) => (
          <TierBlock key={i} id={tierLabel(tier, i)}>
            {tier.cost !== undefined && input(skillKey(chain.key, i + 1, 'cost'), 'cost')}
            {Object.keys(tier.binds).map((name) => input(skillKey(chain.key, i + 1, name), name))}
            {Object.keys(tier.params ?? {}).map((name) => input(skillKey(chain.key, i + 1, name), name))}
          </TierBlock>
        ))}
        {addedTiers(chain.key, tweaks).map((a) => (
          <TierBlock key={`added-${a.tier}`} id={`Tier ${a.tier}${category === undefined ? '' : ` · ${category}`} · added`}>
            {specs.map((s) => addedInput(skillKey(chain.key, a.tier, s.name), s.name, a.values[s.name], a.defaults[s.name], s.type))}
          </TierBlock>
        ))}
      </div>
    )
  }

  const skillEditor = (file: PlayerSkillFile) => (
    <Subsection key={file.path} title={skillFileLabel(file)} badge={badge(keysOfFile(file, tweaks))} lazy>
      {unlock(file)}
      {file.chains.map((chain) => chainEditor(file, chain))}
    </Subsection>
  )

  const allKeys = Object.keys(tweaks).filter((k) => playerField(k) !== undefined)

  return (
    <div className="parameter-form">
      <p className="hint player-intro">
        Base stats, shop prices and what every skill and upgrade does, from the game&apos;s <code>players/</code> files.
        The install patches what you change into the scenario&apos;s own copy of those files (read from your AE folder), so it
        applies to this dungeon only. Leave everything alone and nothing is patched.
      </p>

      <Section title="All characters" badge={allKeys.length > 0 ? `${allKeys.length} changed` : undefined} defaultOpen>
        <QuickSetup tweaks={tweaks} onChange={onChange} />
      </Section>

      {PLAYER_STOCK.classes.map((c) => {
        const own = c.skills
          .filter((s) => !SHARED_SKILL_PATHS.has(s.path))
          .map((s) => PLAYER_STOCK.skills.find((f) => f.path === s.path))
          .filter((f): f is PlayerSkillFile => f !== undefined && f.chains.length > 0)
        const statKeys = Object.keys(c.stats).map((stat) => statKey(c.id, stat))
        const extraKeys = CLASS_EXTRA_KEYS[c.id] ?? []
        const classKeys = [
          ...statKeys,
          ...extraKeys,
          ...own.flatMap((f) => keysOfFile(f, tweaks)),
          ...allKeys.filter((k) => PLAYER_FIELD_MAP.get(k)?.classId === c.id && !statKeys.includes(k))
        ]
        return (
          <Section key={c.id} title={classLabel(c.id)} badge={badge(classKeys)}>
            <Subsection title="Base stats" badge={badge(statKeys)} defaultOpen>
              <div className="field-grid">{statKeys.map((key) => input(key, PLAYER_FIELD_MAP.get(key)!.name))}</div>
            </Subsection>
            {own.map(skillEditor)}
            {extraKeys.length > 0 && (
              <Subsection title="Lightning bolt" badge={badge(extraKeys)}>
                <p className="hint">
                  Where the lightning orb lands, its bolts strike enemies within this reach, one at a time; hitting the same
                  enemy again in a row does this much of the damage. From <code>players/warlock/projectiles/lightning_bolt.unit</code>.
                </p>
                <div className="field-grid">{extraKeys.map((key) => input(key, extraLabel(PLAYER_FIELD_MAP.get(key)!.name)))}</div>
              </Subsection>
            )}
          </Section>
        )
      })}

      <Section title="Shared skills" badge={badge([...SHARED_FILES.flatMap((f) => keysOfFile(f, tweaks)), ...COMBO_KEYS])}>
        <p className="hint">
          Skills several classes own. A change here applies to every class that has the skill; a class with its own move
          speed (set under <strong>All characters</strong>) keeps its own.
        </p>
        {SHARED_FILES.map(skillEditor)}
        <Subsection title="Combo regen" badge={badge(COMBO_KEYS)}>
          <p className="hint">
            Mana and health per second while combo is on, by the tier of each combo upgrade. They live in the game&apos;s{' '}
            <code>tweak/buffs/buffs.sval</code>; the install patches the scenario&apos;s copy. A tier added to the combo heal or
            mana upgrade sets its own, in that tier.
          </p>
          <div className="field-grid">{COMBO_KEYS.map((key) => input(key, extraLabel(PLAYER_FIELD_MAP.get(key)!.name)))}</div>
        </Subsection>
      </Section>

      <Section title="Potions" badge={badge(POTIONS.map((p) => shopKey(p.id)))}>
        <p className="hint">
          What the power shop charges for each potion. It lives in the game&apos;s shop script rather than{' '}
          <code>players/</code>; the install patches the scenario&apos;s copy the same way.
        </p>
        <div className="field-grid">{POTIONS.map((p) => input(shopKey(p.id), shopPriceLabel(p.id)))}</div>
      </Section>

      <Section title="Items" badge={badge(ITEMS.map((p) => shopKey(p.id)))}>
        <p className="hint">
          What an item costs at each quality, in every item shop. It lives in the game&apos;s shop constants; the install
          patches the scenario&apos;s copy the same way.
        </p>
        <div className="field-grid">{ITEMS.map((p) => input(shopKey(p.id), shopPriceLabel(p.id)))}</div>
      </Section>
    </div>
  )
}
