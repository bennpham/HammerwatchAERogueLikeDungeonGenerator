import React from 'react'
import {
  TWEAK_BASELINE,
  TWEAK_FIELDS,
  applyCostCurve,
  applyTiersSold,
  applyValueCurve,
  buildChains,
  countTweaksByFile,
  currentStart,
  deriveCostCurve,
  deriveTiersSold,
  deriveValueCurve
} from '../../generator'
import type {
  CurveMode,
  PlayerTweaks,
  TweakChain,
  TweakFieldDef,
  TweakUnitFile,
  ValidationIssue
} from '../../generator'
import { BoolField, ChainRow, CurveField, NumberField, Section, Subsection, TierBlock } from './fields'
import { QuickSetup } from './QuickSetup'

interface PlayerFormProps {
  tweaks: PlayerTweaks
  issues: ValidationIssue[]
  onChange: (tweaks: PlayerTweaks) => void
}

/**
 * Fields grouped by the file they belong to, in baseline display order.
 *
 * `remove` fields are left out: they are flags the quick-setup section drives,
 * not values, and a stray "removed: 1" input in a stat grid would be a trap.
 */
const FIELDS_BY_FILE = new Map<string, TweakFieldDef[]>(
  TWEAK_BASELINE.map((file) => [
    file.id,
    TWEAK_FIELDS.filter((f) => f.fileId === file.id && f.group !== 'remove')
  ])
)

/** Upgrade ladders per file, so the form can offer a curve instead of 25 inputs. */
const CHAINS_BY_FILE = new Map<string, TweakChain[]>(
  TWEAK_BASELINE.filter((file): file is TweakUnitFile => file.kind === 'unit').map((file) => [
    file.id,
    buildChains(file)
  ])
)

function currentValue(tweaks: PlayerTweaks, field: TweakFieldDef): number {
  const override = tweaks[field.key]
  return override === undefined ? field.stock : override
}

/**
 * Editor for the game's tweak/*.xml balance data. Values equal to the stock
 * game are deleted from the override map rather than stored, so "nothing was
 * changed" stays literally empty and no tweak/ folder gets emitted.
 *
 * Upgrades are shown as ladders rather than loose numbers: each chain gets a
 * first cost, a per-tier cost step and a per-tier step for every stat it writes,
 * with the raw per-tier values behind a disclosure. The stat steps are measured
 * from the class's starting stat, which is both how the stock ladders were built
 * and what keeps an upgrade from becoming a paid downgrade after the starting
 * stat is raised.
 */
export function PlayerForm({ tweaks, issues, onChange }: PlayerFormProps) {
  const counts = countTweaksByFile(tweaks)

  const set = (field: TweakFieldDef, value: number) => {
    const next = { ...tweaks }
    if (Number.isNaN(value) || value === field.stock) {
      delete next[field.key]
    } else {
      next[field.key] = value
    }
    onChange(next)
  }

  const badge = (fileId: string): string | undefined => {
    const n = counts[fileId]
    return n === undefined ? undefined : `${n} changed`
  }

  /** Subgroups can start collapsed, so surface any edits hiding inside one. */
  const groupBadge = (fields: TweakFieldDef[]): string | undefined => {
    const n = fields.filter((f) => tweaks[f.key] !== undefined).length
    return n === 0 ? undefined : `${n} changed`
  }

  // "All characters" holds every player file, so its badge counts them all
  const changedFiles = Object.keys(counts).filter((id) => id !== 'general').length
  const quickBadge = changedFiles === 0 ? undefined : `${changedFiles} of 8 files changed`

  const inputs = (fields: TweakFieldDef[]) =>
    fields.map((field) => (
      <NumberField
        key={field.key}
        label={field.label}
        field={field.key}
        value={currentValue(tweaks, field)}
        onChange={(v) => set(field, v)}
        issues={issues}
        step={field.type === 'float' ? 0.05 : 1}
        title={`${field.file} — stock ${field.stock}`}
      />
    ))

  const grid = (fields: TweakFieldDef[]) => <div className="field-grid">{inputs(fields)}</div>

  /** The per-tier inputs of one chain: one labelled block per upgrade. */
  const tierBlocks = (fields: TweakFieldDef[]) => {
    const byUpgrade = new Map<string, TweakFieldDef[]>()
    for (const field of fields) {
      if (field.upgradeId === undefined) continue
      const bucket = byUpgrade.get(field.upgradeId)
      if (bucket === undefined) byUpgrade.set(field.upgradeId, [field])
      else bucket.push(field)
    }
    return [...byUpgrade].map(([id, group]) => (
      <TierBlock key={id} id={id}>
        {inputs(group)}
      </TierBlock>
    ))
  }

  const chainEditor = (file: TweakUnitFile, chain: TweakChain, fields: TweakFieldDef[]) => {
    const blocks = tierBlocks(fields)

    // skill unlocks and everything in shared.xml are single entries — no ladder,
    // but they can still be taken out of the shop
    if (chain.flat) {
      const soldFlat = deriveTiersSold(chain, tweaks)
      return (
        <div className="tier-flat" key={chain.key}>
          <BoolField
            label={`sell ${chain.tiers[0].upgrade.id}`}
            checked={soldFlat.count > 0}
            onChange={(on) => onChange(applyTiersSold(chain, on ? chain.tiers.length : 0, tweaks))}
            title="Unchecked takes this purchase out of the shop entirely"
          />
          {blocks}
        </div>
      )
    }

    const cost = deriveCostCurve(chain, tweaks)
    const irregular = !cost.fits || chain.stats.some((stat) => !deriveValueCurve(file, chain, stat, tweaks).fits)
    const sold = deriveTiersSold(chain, tweaks)

    return (
      <ChainRow
        key={chain.key}
        title={chain.key}
        subtitle={`${chain.tiers.length} tiers${irregular ? ' · custom ladder' : ''}`}
        badge={groupBadge(fields)}
        limit={
          <CurveField
            label={`tiers sold${sold.uniform ? '' : ' · custom'}`}
            value={sold.count}
            step={1}
            onChange={(v) => onChange(applyTiersSold(chain, v, tweaks))}
            title={`How many of the ${chain.tiers.length} tiers the shop offers. Lowering it drops the tiers above, because each one requires the one below.`}
          />
        }
        tiers={blocks}
      >
        <CurveField
          label="first cost"
          value={cost.first}
          onChange={(v) => onChange(applyCostCurve(chain, { ...cost, first: v }, tweaks))}
          title={`Cost of ${chain.tiers[0].upgrade.id}`}
        />
        <CurveField
          label="cost per tier"
          value={cost.step}
          mode={cost.mode}
          step={cost.mode === 'mul' ? 0.05 : 1}
          onChange={(v) => onChange(applyCostCurve(chain, { ...cost, step: v }, tweaks))}
          onModeChange={(mode) => onChange(applyCostCurve(chain, { ...cost, mode }, tweaks))}
          title="How each tier's price grows"
        />
        {chain.stats.map((stat) => {
          const curve = deriveValueCurve(file, chain, stat, tweaks)
          const start = currentStart(file, stat, tweaks)
          return (
            <React.Fragment key={stat}>
              {!curve.fromStart && (
                <CurveField
                  label={`${stat} base`}
                  value={curve.anchor}
                  step={0.05}
                  onChange={(v) => onChange(applyValueCurve(chain, stat, { ...curve, anchor: v }, tweaks))}
                  title="Tier 0 — the value the ladder is measured from"
                />
              )}
              <CurveField
                label={`${stat} per tier`}
                value={curve.step}
                mode={curve.mode}
                step={0.05}
                onChange={(v) => onChange(applyValueCurve(chain, stat, { ...curve, step: v }, tweaks))}
                onModeChange={(mode) => onChange(applyValueCurve(chain, stat, { ...curve, mode }, tweaks))}
                title={
                  curve.fromStart
                    ? `Added to the starting ${stat} of ${start} once per tier`
                    : `Added once per tier, starting from ${curve.anchor}`
                }
              />
            </React.Fragment>
          )
        })}
      </ChainRow>
    )
  }

  return (
    <div className="parameter-form">
      <p className="hint player-intro">
        Starting stats, shop prices and what each upgrade grants, from the game&apos;s{' '}
        <code>tweak/</code> files. Anything you change here is written into the campaign so it applies
        to your dungeon only. Leave everything alone and no tweak files are produced at all.
      </p>

      {/* enemy scaling is the other axis and stays a top-level sibling */}
      {TWEAK_BASELINE.map((file) => {
        const fields = FIELDS_BY_FILE.get(file.id) ?? []
        if (fields.length === 0 || file.kind !== 'general') return null

        return (
          <Section key={file.id} title={file.label} badge={badge(file.id)}>
            <p className="hint">
              Per-difficulty enemy scaling. <code>medium</code> is the 1.0 baseline; lower{' '}
              <code>SpawnFreq</code> means faster spawns.
            </p>
            {file.difficulties.map((difficulty) => {
              const group = fields.filter((f) => f.section === difficulty.name)
              return (
                <Subsection
                  key={difficulty.name}
                  title={difficulty.name}
                  badge={groupBadge(group)}
                  defaultOpen
                >
                  {grid(group)}
                </Subsection>
              )
            })}
          </Section>
        )
      })}

      {/* the roster-wide knobs first, then the eight files they act on, so a
          dungeon master who only wants a quick setup never meets the detail */}
      <Section title="All characters" badge={quickBadge} defaultOpen>
        <QuickSetup tweaks={tweaks} onChange={onChange} />

        {TWEAK_BASELINE.map((file) => {
          const fields = FIELDS_BY_FILE.get(file.id) ?? []
          if (fields.length === 0 || file.kind === 'general') return null

        // bools are the skill-unlock flags (checkboxes, not 0/1 inputs) and strings
        // are stored as an index into their stock values — neither is a number to type
        const params = fields.filter(
          (f) => f.group === 'param' && f.type !== 'bool' && f.type !== 'string'
        )
        const chains = CHAINS_BY_FILE.get(file.id) ?? []
        const fieldsByChain = new Map<string, TweakFieldDef[]>()
        for (const field of fields) {
          if (field.chain === undefined) continue
          const bucket = fieldsByChain.get(field.chain)
          if (bucket === undefined) fieldsByChain.set(field.chain, [field])
          else bucket.push(field)
        }

        // grouped in first-appearance order, which follows the game's shop tiers
        const shopGroups = new Map<string, TweakChain[]>()
        for (const chain of chains) {
          const first = fieldsByChain.get(chain.key)?.[0]
          const title = first?.shopGroup ?? 'Other upgrades'
          const bucket = shopGroups.get(title)
          if (bucket === undefined) shopGroups.set(title, [chain])
          else bucket.push(chain)
        }

        const section = (
          <Section key={file.id} title={file.label} badge={badge(file.id)}>
            {params.length > 0 && (
              <Subsection title="Starting stats" badge={groupBadge(params)} defaultOpen>
                {grid(params)}
              </Subsection>
            )}
            {[...shopGroups].map(([title, group]) => {
              const groupFields = group.flatMap((chain) => fieldsByChain.get(chain.key) ?? [])
              return (
                <Subsection key={title} title={title} badge={groupBadge(groupFields)}>
                  {group.map((chain) => chainEditor(file, chain, fieldsByChain.get(chain.key) ?? []))}
                </Subsection>
              )
            })}
          </Section>
        )

          return section
        })}
      </Section>
    </div>
  )
}
