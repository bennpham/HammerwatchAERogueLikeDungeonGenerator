import React, { useMemo, useState } from 'react'
import { MONSTER_CATEGORIES, monsterCategories } from '../../generator'
import type { MonsterCategory, MonsterTypeDef } from '../../generator'

/**
 * Decides what a monster list shows. `visible` is the only thing the panels
 * call: a type shows when one of its categories is on and its id matches the
 * search box — or when it is pinned, which is how a monster the user has
 * already picked stays reachable after its act is switched off.
 */
export interface MonsterFilter {
  active: Set<MonsterCategory>
  query: string
  setActive: (next: Set<MonsterCategory>) => void
  setQuery: (next: string) => void
  /**
   * `searchKey` is what the search box matches, defaulting to `type.id`. A
   * variant picker passes the variant key (`bat1#0`) so searching "spawner" or
   * a tier suffix finds it; the plain type pickers pass nothing.
   */
  visible: (type: MonsterTypeDef, pinned?: boolean, searchKey?: string) => boolean
  /** True when the type only shows because it is pinned — render it dimmed. */
  offFilter: (type: MonsterTypeDef, searchKey?: string) => boolean
  /** Every category on and an empty search: the pre-filter view. */
  isDefault: boolean
}

/**
 * Filter state for one monster panel. Session-only React state — nothing here
 * reaches DungeonParameters, so a filter can never change generated output or
 * what a saved parameters.txt contains.
 */
export function useMonsterFilter(): MonsterFilter {
  const [active, setActive] = useState<Set<MonsterCategory>>(() => new Set(MONSTER_CATEGORIES))
  const [query, setQuery] = useState('')

  return useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = (type: MonsterTypeDef, searchKey?: string) =>
      monsterCategories(type).some((c) => active.has(c)) &&
      (needle === '' || (searchKey ?? type.id).toLowerCase().includes(needle))
    return {
      active,
      query,
      setActive,
      setQuery,
      visible: (type, pinned = false, searchKey) => pinned || matches(type, searchKey),
      offFilter: (type, searchKey) => !matches(type, searchKey),
      isDefault: needle === '' && active.size === MONSTER_CATEGORIES.length
    }
  }, [active, query])
}

interface MonsterFilterBarProps {
  filter: MonsterFilter
  /** What the search box filters, e.g. "monsters" — used for the placeholder. */
  label?: string
}

/**
 * Show/hide chips for the Hammerwatch act a monster belongs to, plus a search
 * box. Sticks to the top of its panel so it stays reachable while scrolling
 * through level sections.
 */
export function MonsterFilterBar({ filter, label = 'monsters' }: MonsterFilterBarProps) {
  const { active, query, setActive, setQuery } = filter

  const toggle = (category: MonsterCategory) => {
    const next = new Set(active)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    setActive(next)
  }

  return (
    <div className="monster-filter">
      <div className="monster-filter-row">
        <span className="field-label">
          Show {active.size}/{MONSTER_CATEGORIES.length}
        </span>
        <div className="monster-filter-chips">
          {MONSTER_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`toggle ${active.has(category) ? 'active' : ''}`}
              aria-pressed={active.has(category)}
              onClick={() => toggle(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="monster-filter-actions">
          <button type="button" onClick={() => setActive(new Set(MONSTER_CATEGORIES))}>
            All
          </button>
          <button type="button" onClick={() => setActive(new Set())}>
            None
          </button>
        </div>
      </div>
      <input
        type="search"
        className="monster-filter-search"
        placeholder={`Search ${label}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  )
}
