/**
 * Shaftlocke's town (The Outlook, `scenarios/shaftlocke_tower/levels/hwr/town.lvl`)
 * turned into a lobby template.
 *
 * The stock town is Shaftlocke's hub: thirteen portals to its own levels,
 * stalls whose stock grows with town upgrades bought between runs, and quest
 * givers, guards, signs and tutorials driven by save-game flags. None of that
 * means anything in a generated campaign, so the cleanup keeps the map
 * (tiles, walls, cliffs, buildings, props, doors, roofs) and a short list of
 * scripts, and drops the rest:
 *
 * - kept: the arrival (the `LevelStart` with no StartID); each vendor's
 *   `UseTrigger`, the widest of its tiered `ShopArea`s (labelled
 *   `lobby:vendor:<id>`) and the `PlaySound` greeting it fires; the minimap
 *   reveal (`ExploreMinimap`) and the town region (`RegionArea`);
 * - baked in: every scene a script would switch a unit to, at its top tier
 *   (the stalls fully upgraded, the fountain mended, the teleporter open);
 * - stood up: a stall the stock town spawns on a quest (`SpawnUnit` of a
 *   `doodads/generic/shop_*` unit), the power vendor's;
 * - dropped: every other script; actors (townsfolk, guards, the horse); the
 *   portal selectors (`exit_teleport_switch_*`); pickups; the editor's debug
 *   text labels; any sensor no kept script names.
 *
 * The exit is left to the lobby builder, which lays its press-F rig on the
 * town's teleporter (`doodads/generic/teleport_mt.unit`).
 *
 * Every rule goes by class, path or parameter, never by a stock id.
 */
import type { AeLevel, AeScript, AeUnit } from '../ae/model'
import { vendorIdOfShopArea } from './shops'

/** The stock level, relative to the install's `scenarios/` folder. */
export const SHAFTLOCKE_TOWN_SOURCE = 'shaftlocke_tower/levels/hwr/town.lvl'

/** The template id and label the importer files it under. */
export const SHAFTLOCKE_TOWN_ID = 'shaftlocke_town'
export const SHAFTLOCKE_TOWN_LABEL = 'Shaftlocke town'
export const SHAFTLOCKE_TOWN_DESCRIPTION =
  "Shaftlocke Tower's town, The Outlook, with every stall fully upgraded. Leave through the teleporter in the square."

/** The equipment shop is `Type 2`; `Type 3` is Shaftlocke's town-upgrade shop. */
const TOWN_UPGRADE_SHOP = 3

const DROPPED_UNIT = [
  /^actors\//,
  /^doodads\/generic\/exit_teleport_switch_/,
  /^items\//,
  // the editor's debug text labels ("Combo shop")
  /^gui\//
]

export function cleanShaftlockeTown(level: AeLevel): AeLevel {
  bakeScenes(level)
  standUpSpawnedStalls(level)

  const keep = new Set<AeScript>()
  const spawn = level.scripts.find((s) => s.cls === 'LevelStart' && !s.params.some((p) => p.name === 'StartID'))
  if (spawn !== undefined) keep.add(spawn)
  for (const s of level.scripts) if (s.cls === 'ExploreMinimap' || s.cls === 'RegionArea') keep.add(s)
  keepVendors(level, keep)

  level.scripts = level.scripts.filter((s) => keep.has(s))
  const kept = new Set(level.scripts.map((s) => s.id))
  for (const s of level.scripts) s.connections = s.connections.filter(([id]) => kept.has(id))

  // units: drop the cast, the selectors, pickups and labels, then any sensor
  // only a dropped script used
  const named = new Set<number>()
  for (const s of level.scripts) {
    for (const p of s.params) {
      if (p.kind === 'ids') p.value.forEach((id) => named.add(id))
      else if (p.kind === 'target') named.add(p.value[0])
      else if (p.kind === 'sources') p.value.forEach(([id]) => named.add(id))
    }
  }
  level.units = level.units.filter(
    (u) => !DROPPED_UNIT.some((re) => re.test(u.path)) && (!u.path.startsWith(':') || named.has(u.id))
  )
  level.statics = level.statics.filter((st) => !DROPPED_UNIT.some((re) => re.test(st.path)))
  return level
}

/**
 * Each vendor: the `UseTrigger` the stall's `ShopArea`s name, switched on,
 * with the widest `ShopArea` (most columns; the lobby rewrites them anyway),
 * labelled for the builder and moved onto its stand, where the builder looks
 * for the stall's sign.
 */
function keepVendors(level: AeLevel, keep: Set<AeScript>): void {
  const byUse = new Map<number, AeScript[]>()
  for (const s of level.scripts) {
    if (s.cls !== 'ShopArea') continue
    const type = s.params.find((p) => p.name === 'Type')
    if (type?.kind === 'int' && type.value === TOWN_UPGRADE_SHOP) continue
    const target = s.params.find((p) => p.name === '#PlayerTarget')
    if (target?.kind !== 'target') continue
    byUse.set(target.value[0], [...(byUse.get(target.value[0]) ?? []), s])
  }
  const stands = level.units.filter((u) => /^doodads\/generic\/shop_[a-z_]+\.unit$/.test(u.path))
  for (const [useId, areas] of byUse) {
    const use = level.scripts.find((s) => s.id === useId)
    const widest = areas.reduce((best, s) => (columns(s) > columns(best) ? s : best))
    const vendorId = vendorIdOfShopArea(categoriesOf(widest))
    if (use === undefined || vendorId === undefined) continue
    widest.enabled = true
    widest.label = `lobby:vendor:${vendorId}`
    use.enabled = true
    keep.add(use)
    keep.add(widest)
    for (const [id] of use.connections) {
      const next = level.scripts.find((s) => s.id === id)
      if (next?.cls === 'PlaySound') keep.add(next)
    }
    const area = useArea(level, use)
    const stand = area === undefined ? undefined : nearest(stands, area.x, area.y)
    if (stand !== undefined) {
      for (const s of [use, widest]) {
        s.x = stand.x
        s.y = stand.y
      }
    }
  }
}

/**
 * Bake every scene change a script makes into the unit's starting scene, at
 * its top tier: the highest-numbered state (`5`, `hwr5`, `tier-2`), or the
 * only one when the states carry no number (`open`). A unit switched between
 * several unnumbered states (`activate` / `deactivate`) is left alone.
 */
function bakeScenes(level: AeLevel): void {
  const states = new Map<number, Set<string>>()
  for (const s of level.scripts) {
    if (s.cls !== 'SetUnitScene') continue
    const state = s.params.find((p) => p.name === 'State')
    const units = s.params.find((p) => p.name === 'Units')
    if (state?.kind !== 'string' || units?.kind !== 'ids') continue
    for (const id of units.value) states.set(id, (states.get(id) ?? new Set()).add(state.value))
  }
  for (const u of level.units) {
    const top = topState([...(states.get(u.id) ?? [])])
    if (top !== undefined) u.state = { ...u.state, start: { kind: 'string', value: top } }
  }
}

function topState(states: string[]): string | undefined {
  const numbered = states
    .map((s) => ({ s, n: /(\d+)$/.exec(s)?.[1] }))
    .filter((e): e is { s: string; n: string } => e.n !== undefined)
    .sort((a, b) => Number(a.n) - Number(b.n) || (a.s < b.s ? -1 : 1))
  if (numbered.length > 0) return numbered[numbered.length - 1].s
  return states.length === 1 ? states[0] : undefined
}

/** A stall the stock town only spawns on a quest gets its stand placed for good. */
function standUpSpawnedStalls(level: AeLevel): void {
  for (const s of level.scripts) {
    if (s.cls !== 'SpawnUnit') continue
    const type = s.params.find((p) => p.name === 'UnitType')
    if (type?.kind !== 'string' || !/^doodads\/generic\/shop_[a-z_]+\.unit$/.test(type.value)) continue
    level.addUnit(type.value, s.x, s.y)
  }
}

function useArea(level: AeLevel, use: AeScript): AeUnit | undefined {
  const areas = use.params.find((p) => p.name === 'Areas')
  if (areas?.kind !== 'ids') return undefined
  return level.units.find((u) => u.id === areas.value[0])
}

function categoriesOf(s: AeScript): string {
  const c = s.params.find((p) => p.name === 'Categories')
  return c?.kind === 'string' ? c.value : ''
}

function columns(s: AeScript): number {
  return categoriesOf(s).split(/\s+/).filter(Boolean).length
}

function nearest(units: readonly AeUnit[], x: number, y: number): AeUnit | undefined {
  let best: AeUnit | undefined
  let bestD = Infinity
  for (const u of units) {
    const d = (u.x - x) ** 2 + (u.y - y) ** 2
    if (d < bestD) {
      best = u
      bestD = d
    }
  }
  return best
}
