import React from 'react'
import {
  PLAYER_FIELD_MAP,
  PLAYER_STOCK,
  SHARED_SKILL_PATHS,
  chainLabel,
  classLabel,
  skillFileLabel,
  skillKey,
  statKey,
  tierLabel
} from '../../generator'
import type { PlayerFieldDef, PlayerSkillFile, PlayerTweaks, ValidationIssue } from '../../generator'
import { NumberField, Section, Subsection, TierBlock } from './fields'
import { QuickSetup } from './QuickSetup'

interface PlayerFormProps {
  tweaks: PlayerTweaks
  issues: ValidationIssue[]
  onChange: (tweaks: PlayerTweaks) => void
}

const SHARED_FILES = PLAYER_STOCK.skills.filter((f) => SHARED_SKILL_PATHS.has(f.path))

/** Every all-classes key a skill file holds, for its "n changed" badge. */
function keysOfFile(file: PlayerSkillFile): string[] {
  const keys: string[] = []
  for (const chain of file.chains) {
    chain.tiers.forEach((tier, i) => {
      if (tier.cost !== undefined) keys.push(skillKey(chain.key, i + 1, 'cost'))
      for (const name of Object.keys(tier.binds)) keys.push(skillKey(chain.key, i + 1, name))
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

  const skillEditor = (file: PlayerSkillFile) => (
    <Subsection key={file.path} title={skillFileLabel(file)} badge={badge(keysOfFile(file))}>
      {file.chains.map((chain) => (
        <div key={chain.key} className="player-chain">
          {file.chains.length > 1 && <span className="player-chain-title">{chainLabel(file, chain)}</span>}
          {chain.tiers.map((tier, i) => (
            <TierBlock key={i} id={tierLabel(tier, i)}>
              {tier.cost !== undefined && input(skillKey(chain.key, i + 1, 'cost'), 'cost')}
              {Object.keys(tier.binds).map((name) => input(skillKey(chain.key, i + 1, name), name))}
            </TierBlock>
          ))}
        </div>
      ))}
    </Subsection>
  )

  const allKeys = Object.keys(tweaks).filter((k) => PLAYER_FIELD_MAP.has(k))

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
        const classKeys = [
          ...statKeys,
          ...own.flatMap(keysOfFile),
          ...allKeys.filter((k) => PLAYER_FIELD_MAP.get(k)?.classId === c.id && !statKeys.includes(k))
        ]
        return (
          <Section key={c.id} title={classLabel(c.id)} badge={badge(classKeys)}>
            <Subsection title="Base stats" badge={badge(statKeys)} defaultOpen>
              <div className="field-grid">{statKeys.map((key) => input(key, PLAYER_FIELD_MAP.get(key)!.name))}</div>
            </Subsection>
            {own.map(skillEditor)}
          </Section>
        )
      })}

      <Section title="Shared skills" badge={badge(SHARED_FILES.flatMap(keysOfFile))}>
        <p className="hint">
          Skills several classes own. A change here applies to every class that has the skill; a class with its own move
          speed (set under <strong>All characters</strong>) keeps its own.
        </p>
        {SHARED_FILES.map(skillEditor)}
      </Section>
    </div>
  )
}
