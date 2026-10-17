import React from 'react'
import { DEFAULT_ITEM_VENDOR_ODDS, DEFAULT_SHOP_KIND_IDS, MAX_ITEM_VENDOR_ODDS, SHOP_KIND_IDS, SHOP_KIND_LABELS } from '../../generator'
import type { DungeonParameters, ItemVendorOdds, ValidationIssue } from '../../generator'
import { BoolField, NumberField } from './fields'
import { RarityLegend, TierPips, tierQualities } from './EquipmentTierRows'

interface ShopRoomVendorsEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

const KIND_TITLES: Record<string, string> = {
  power: 'Potions, extra life and health rejuvenation',
  item: "Equipment: one of AE's five item tiers, rolled per shop by the odds below"
}

/** The three odds bands, and the tiers each one sells. */
const BANDS: ReadonlyArray<{ label: string; tiers: number[]; title: string }> = [
  { label: 'Common/Uncommon', tiers: [1, 2, 3], title: 'Weight for tiers 1–3, split evenly between them' },
  { label: 'Rare', tiers: [4], title: 'Weight for tier 4, the first with rare items' },
  { label: 'Epic', tiers: [5], title: 'Weight for tier 5, which always has one epic item' }
]

/**
 * Which vendors a floor's shop room rolls between, and how the item vendor
 * picks its equipment tier. One vendor per shop room, drawn evenly from the
 * ticked kinds.
 */
export function ShopRoomVendorsEditor({ params, issues, onChange }: ShopRoomVendorsEditorProps) {
  const kinds = params.shopKinds ?? [...DEFAULT_SHOP_KIND_IDS]
  const odds: ItemVendorOdds = params.itemVendorOdds ?? [...DEFAULT_ITEM_VENDOR_ODDS]
  const total = odds.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)

  const toggle = (id: string, on: boolean) => {
    const next = SHOP_KIND_IDS.filter((k) => (k === id ? on : kinds.includes(k)))
    onChange({ ...params, shopKinds: next })
  }
  const setOdds = (i: number, v: number) => {
    const next: ItemVendorOdds = [...odds]
    next[i] = v
    onChange({ ...params, itemVendorOdds: next })
  }

  return (
    <>
      <p className="hint">
        Each floor&apos;s shop room (see Shop chance) has one vendor, drawn evenly from the ones ticked here.
      </p>
      <div className="lobby-columns">
        {SHOP_KIND_IDS.map((id) => (
          <BoolField
            key={id}
            label={SHOP_KIND_LABELS[id]}
            checked={kinds.includes(id)}
            onChange={(on) => toggle(id, on)}
            title={KIND_TITLES[id]}
          />
        ))}
      </div>
      {issues
        .filter((i) => i.field === 'shopKinds')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}

      {kinds.includes('item') && (
        <>
          <p className="hint">
            An item vendor sells one of AE&apos;s equipment tiers (5 items), picked by these odds. Each pip is one
            item slot, coloured by the rarities it can roll.
          </p>
          <div className="item-vendor-odds">
            {BANDS.map((band, i) => (
              <div key={band.label} className="item-vendor-band">
                <NumberField
                  label={band.label}
                  field="itemVendorOdds"
                  value={odds[i]}
                  onChange={(v) => setOdds(i, v)}
                  issues={i === 0 ? issues : []}
                  min={0}
                  max={MAX_ITEM_VENDOR_ODDS}
                  title={band.title}
                />
                <span className="item-vendor-share">{total > 0 ? `${Math.round((odds[i] / total) * 100)}%` : '–'}</span>
                <span className="item-vendor-tiers">
                  {band.tiers.map((t) => (
                    <span key={t} className="item-vendor-tier" title={`Tier ${t}: ${tierQualities(t)}`}>
                      T{t} <TierPips tier={t} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <RarityLegend />
        </>
      )}
    </>
  )
}
