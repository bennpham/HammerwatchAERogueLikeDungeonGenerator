import React, { useMemo, useState } from 'react'
import { buildLoadouts } from '../../generator'
import type { PlayerTweaks } from '../../generator'

interface LoadoutSheetProps {
  tweaks: PlayerTweaks
}

const gold = (value: number) => value.toLocaleString('en-US')

const number = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2))

/**
 * Read-only character sheet for the seven classes: what you start with, what
 * you end up with after buying the whole tree, and what that costs — with the
 * user's tweaks applied and anything they changed flagged.
 */
export function LoadoutSheet({ tweaks }: LoadoutSheetProps) {
  const loadouts = useMemo(() => buildLoadouts(tweaks), [tweaks])
  const [active, setActive] = useState(0)
  const loadout = loadouts[Math.min(active, loadouts.length - 1)]

  if (loadout === undefined) return null

  const costDelta = loadout.totalCost - loadout.stockTotalCost

  return (
    <div className="loadout">
      <div className="preview-tabs">
        {loadouts.map((l, index) => (
          <button
            key={l.id}
            className={index === active ? 'tab active' : 'tab'}
            onClick={() => setActive(index)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="loadout-summary">
        <span>
          Gold to buy every upgrade: <strong>{gold(loadout.totalCost)}</strong>
        </span>
        {costDelta !== 0 && (
          <span className="tweaked">
            {costDelta > 0 ? '+' : '−'}
            {gold(Math.abs(costDelta))} vs stock
          </span>
        )}
      </div>

      <div className="loadout-table-wrap">
        <table className="loadout-table">
          <thead>
            <tr>
              <th>Stat</th>
              <th>Start</th>
              <th>Fully upgraded</th>
            </tr>
          </thead>
          <tbody>
            {loadout.stats.map((stat) => (
              <tr key={stat.name} className={stat.changed ? 'tweaked-row' : undefined}>
                <td>{stat.name}</td>
                <td>
                  {number(stat.start)}
                  {stat.changed && (
                    <span className="tweaked" title="changed from the stock game">
                      {' '}
                      ▲
                    </span>
                  )}
                </td>
                <td>{stat.maxed === stat.start ? '—' : number(stat.maxed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint">
        &quot;Fully upgraded&quot; buys every upgrade in the tree; a dash means no upgrade touches that
        stat. Upgrades set values rather than adding to them, so the last tier of a chain wins.
      </p>
    </div>
  )
}
