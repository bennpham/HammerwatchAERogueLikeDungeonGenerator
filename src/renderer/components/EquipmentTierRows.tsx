import React from 'react'
import { EQUIPMENT_TIER_IDS, QUALITY_LABELS, SOLD_QUALITIES, itemsOfQuality, qualityPrice, tierSummary } from '../../generator'
import type { EquipmentQuality, EquipmentSlot, PlayerTweaks } from '../../generator'

/** The rarity colours, as CSS tokens in app.css. */
const QUALITY_VAR: Record<EquipmentQuality, string> = {
  common: 'var(--q-common)',
  uncommon: 'var(--q-uncommon)',
  rare: 'var(--q-rare)',
  epic: 'var(--q-epic)',
  unique: 'var(--q-unique)'
}

function slotOdds(slot: EquipmentSlot): string {
  const total = slot.reduce((n, d) => n + d.weight, 0)
  return slot.map((d) => `${Math.round((d.weight / total) * 100)}% ${QUALITY_LABELS[d.quality]}`).join(' · ')
}

/** A slot's pip: one colour, or a hard-stop gradient split by the odds. */
function slotBackground(slot: EquipmentSlot): string {
  if (slot.length === 1) return QUALITY_VAR[slot[0].quality]
  const total = slot.reduce((n, d) => n + d.weight, 0)
  let at = 0
  const stops = slot.map((d) => {
    const from = at
    at += (d.weight / total) * 100
    return `${QUALITY_VAR[d.quality]} ${from}% ${at}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function priceRange(min: number, max: number): string {
  return min === max ? `${min} g each` : `${min}–${max} g`
}

/** The five slot pips of one tier. */
export function TierPips({ tier }: { tier: number }) {
  const { slots } = tierSummary(tier)
  return (
    <span className="tier-pips">
      {slots.map((slot, i) => (
        <span key={i} className="tier-pip" style={{ background: slotBackground(slot) }} title={`Slot ${i + 1}: ${slotOdds(slot)}`} />
      ))}
    </span>
  )
}

/** "Common, Uncommon" — what a tier can roll, for a one-line summary. */
export function tierQualities(tier: number): string {
  return tierSummary(tier)
    .qualities.map((q) => QUALITY_LABELS[q])
    .join(', ')
}

export function RarityLegend() {
  return (
    <span className="rarity-legend">
      {SOLD_QUALITIES.map((q) => (
        <span key={q}>
          <span className="tier-pip" style={{ background: QUALITY_VAR[q] }} /> {QUALITY_LABELS[q]}
        </span>
      ))}
    </span>
  )
}

/** Every sellable item, by quality, with its effect, plus where uniques come from. */
export function EquipmentItemList({ tweaks }: { tweaks?: PlayerTweaks }) {
  return (
    <details className="equipment-items">
      <summary>What's in each rarity</summary>
      {SOLD_QUALITIES.map((q) => {
        const items = itemsOfQuality(q)
        const price = qualityPrice(q, tweaks)
        return (
          <div key={q} className="equipment-quality">
            <h4>
              <span className="tier-pip" style={{ background: QUALITY_VAR[q] }} /> {QUALITY_LABELS[q]} ({items.length}) ·{' '}
              {price} g
            </h4>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>: {item.effect}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <p className="hint">
        Unique items ({itemsOfQuality('unique').length}) are never sold. They only drop from a mystery plate whose loot
        names one.
      </p>
    </details>
  )
}

interface EquipmentTierRowsProps {
  selected: ReadonlySet<string>
  onToggle: (category: string, checked: boolean) => void
  tweaks?: PlayerTweaks
}

/**
 * The item stall's tiers as readable rows: each `equipment_<n>` loot table
 * is five item slots, drawn as five pips coloured by the rarity each slot
 * can roll, with the price range the Players tab sets.
 */
export function EquipmentTierRows({ selected, onToggle, tweaks }: EquipmentTierRowsProps) {
  return (
    <div className="equipment-tiers">
      {EQUIPMENT_TIER_IDS.map((category, i) => {
        const s = tierSummary(i + 1, tweaks)
        return (
          <label key={category} className="equipment-tier" title={`${category}: 5 items, ${tierQualities(i + 1)}`}>
            <input type="checkbox" checked={selected.has(category)} onChange={(e) => onToggle(category, e.target.checked)} />
            <span className="equipment-tier-name">
              Tier {s.tier} <span className="dim">{s.name}</span>
            </span>
            <TierPips tier={s.tier} />
            <span className="equipment-tier-price">{priceRange(s.minPrice, s.maxPrice)}</span>
          </label>
        )
      })}
      <RarityLegend />
      <EquipmentItemList tweaks={tweaks} />
    </div>
  )
}
