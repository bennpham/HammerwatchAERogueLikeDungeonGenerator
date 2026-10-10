import type { GeneratedFile } from '../index'
import { TWEAK_BASELINE } from './baseline'
import { chainKeyOf, costKey, editableChildren, effectKey, paramKey, removeKey } from './chains'
import type { PlayerTweaks, TweakFile, TweakParam, TweakUnitFile, TweakValueType } from './types'
import { serializeGeneralFile, serializeUnitFile } from './xml'

/**
 * Maps the flat `player.*` override keys used by the UI and parameters.txt onto
 * positions in the baseline model.
 *
 * Keys are lowercase throughout because configFile.ts lowercases every key it
 * parses. Nothing is lost: within a single scope the stock names are already
 * unique case-insensitively.
 *
 *   player.general.<difficulty>.<key>        player.general.hard.enemydamagebase
 *   player.<unit>.param.<name>               player.knight.param.max-health
 *   player.<unit>.cost.<upgradeId>           player.knight.cost.health-1
 *   player.<unit>.effect.<upgradeId>.<stat>  player.knight.effect.health-1.max-health
 *   player.<unit>.remove.<upgradeId>         player.shared.remove.life
 *
 * The `effect` scope is what an upgrade *does*. An upgrade sets a param to an
 * absolute value rather than adding to it, so leaving these fixed while the
 * starting stats move is how you end up with a `health-1` that costs 600 gold
 * and lowers your health.
 *
 * The `remove` scope is a flag, not a value: 1 drops the upgrade from the
 * emitted file entirely. Values stay numeric so `PlayerTweaks` remains a plain
 * `Record<string, number>` and parameters.txt needs no new syntax; `bool` params
 * ride the same rail as 0/1.
 */

export type TweakFieldGroup = 'difficulty' | 'param' | 'cost' | 'effect' | 'remove'

export interface TweakFieldDef {
  /** canonical lowercase override key */
  key: string
  /** owning file's stable id, e.g. "knight" */
  fileId: string
  /** file name inside tweak/, e.g. "knight.xml" */
  file: string
  group: TweakFieldGroup
  /** sub-heading within the file — difficulty name, or the upgrade's cat */
  section?: string
  /** for upgrades only: heading of the shop grouping this upgrade belongs to */
  shopGroup?: string
  /** for upgrades only: the upgrade this field belongs to */
  upgradeId?: string
  /** for upgrades only: the chain the upgrade belongs to, e.g. "health" */
  chain?: string
  /** for params and effects: the stat name this field writes */
  stat?: string
  /** display label: the raw stock name, which is what modders see in the XML */
  label: string
  type: TweakValueType
  /** stock value, used as the form default and to detect tampering */
  stock: number
  /**
   * For `string` params only: every value the stock data can give this param —
   * its starting value first, then each upgrade's, deduped in file order.
   *
   * A string cannot live in `PlayerTweaks` (it is `Record<string, number>`), so
   * the override stores an *index* into this list. That is not merely a
   * workaround: some skills park their string on `""` until an upgrade fills it
   * in — `combo-nova-projectile` and `aura-buff` both do — and handing a player
   * such a skill with an empty projectile path crashes the game. The index lets
   * the presets advance the string alongside the numbers.
   */
  choices?: string[]
}

/**
 * Splits a file's upgrades into headings small enough to scan.
 *
 * Classes reuse the game's own shop columns, which the `cat` attribute already
 * encodes as off/def/misc tiers. shared.xml can't: it files life, rejuv and all
 * three potions under one `power` cat, so it groups by what the upgrade buys.
 */
function shopGroupOf(fileId: string, upgradeId: string, cat: string): string {
  if (fileId === 'shared') {
    // prefix rules come first so pot-rejuv reads as a potion, not as health
    if (upgradeId.startsWith('pot-')) return 'Potion upgrades'
    if (upgradeId.startsWith('speed-')) return 'Movement speed upgrades'
    if (upgradeId.startsWith('combo')) return 'Combo upgrades'
    if (upgradeId === 'life' || upgradeId === 'rejuv') return 'Health upgrades'
    return 'Other upgrades'
  }
  if (cat.startsWith('misc')) return 'Health & mana upgrades'
  if (cat.startsWith('off')) return 'Offense upgrades'
  if (cat.startsWith('def')) return 'Defense upgrades'
  return 'Other upgrades'
}

/**
 * Every value the stock data gives a string param: its starting value first, then
 * each upgrade's, in file order and deduped. Index 0 is therefore always "stock".
 */
function stringChoices(file: TweakUnitFile, name: string): string[] {
  const seen: string[] = []
  const add = (value: unknown): void => {
    const text = String(value)
    if (!seen.includes(text)) seen.push(text)
  }

  const start = file.params.find((p) => p.name === name && p.type === 'string')
  if (start !== undefined) add(start.value)
  for (const upgrade of file.upgrades) {
    for (const child of upgrade.children) {
      if (child.name === name && child.type === 'string') add(child.value)
    }
  }
  return seen
}

function buildFields(): TweakFieldDef[] {
  const fields: TweakFieldDef[] = []

  for (const file of TWEAK_BASELINE) {
    if (file.kind === 'general') {
      for (const difficulty of file.difficulties) {
        for (const value of difficulty.values) {
          fields.push({
            key: `player.general.${difficulty.name}.${value.name}`.toLowerCase(),
            fileId: file.id,
            file: file.file,
            group: 'difficulty',
            section: difficulty.name,
            label: value.name,
            type: value.type,
            stock: Number(value.value)
          })
        }
      }
      continue
    }

    for (const param of file.params) {
      fields.push({
        key: paramKey(file.id, param.name),
        fileId: file.id,
        file: file.file,
        group: 'param',
        label: param.name,
        stat: param.name,
        type: param.type,
        // bools ride the numeric rail as 0/1, strings as an index into `choices`,
        // so PlayerTweaks stays Record<string, number>
        stock: param.type === 'bool' ? (param.value === true ? 1 : 0) : param.type === 'string' ? 0 : Number(param.value),
        choices: param.type === 'string' ? stringChoices(file, param.name) : undefined
      })
    }

    for (const upgrade of file.upgrades) {
      const shared = {
        fileId: file.id,
        file: file.file,
        section: upgrade.cat,
        shopGroup: shopGroupOf(file.id, upgrade.id, upgrade.cat),
        upgradeId: upgrade.id,
        chain: chainKeyOf(upgrade.id)
      }

      fields.push({
        ...shared,
        key: costKey(file.id, upgrade.id),
        group: 'cost',
        label: 'cost',
        type: 'int',
        stock: upgrade.cost
      })

      fields.push({
        ...shared,
        key: removeKey(file.id, upgrade.id),
        group: 'remove',
        label: 'removed',
        type: 'bool',
        stock: 0
      })

      // what the upgrade actually grants — `lvl`, strings and bools are excluded
      // for the same reason params are: they are structure, not balance
      for (const child of editableChildren(upgrade)) {
        fields.push({
          ...shared,
          key: effectKey(file.id, upgrade.id, child.name),
          group: 'effect',
          label: child.name,
          stat: child.name,
          type: child.type,
          stock: Number(child.value)
        })
      }
    }
  }

  return fields
}

/** Every editable field, derived from the baseline so UI/parser/validator agree. */
export const TWEAK_FIELDS: TweakFieldDef[] = buildFields()

export const TWEAK_FIELD_MAP: Map<string, TweakFieldDef> = new Map(
  TWEAK_FIELDS.map((field) => [field.key, field])
)

/** True when `key` names a real editable tweak field. */
export function isTweakKey(key: string): boolean {
  return TWEAK_FIELD_MAP.has(key.toLowerCase())
}

/** Drops entries equal to their stock value, so "no change" really means empty. */
export function pruneTweaks(tweaks: PlayerTweaks): PlayerTweaks {
  const pruned: PlayerTweaks = {}
  for (const [rawKey, value] of Object.entries(tweaks)) {
    const key = rawKey.toLowerCase()
    const field = TWEAK_FIELD_MAP.get(key)
    if (field === undefined) continue
    if (!Number.isFinite(value)) continue
    if (value === field.stock) continue
    pruned[key] = value
  }
  return pruned
}

/**
 * One override as a `key=value` line. parameters.txt and playersettings.txt
 * both write through this, so the two files cannot disagree on a value.
 */
export function formatTweakLine(key: string, value: number): string {
  const field = TWEAK_FIELD_MAP.get(key)
  return `${key}=${field?.type === 'float' ? value.toFixed(6) : value}`
}

/**
 * Reads one `player.*` line's value the way both text formats do: `undefined`
 * for an unknown key or a value that is not a number, `'stock'` for the stock
 * value (which is how a file clears an override its base object carried), and
 * otherwise the number, truncated for an int field.
 */
export function parseTweakValue(keyLower: string, raw: string): number | 'stock' | undefined {
  const field = TWEAK_FIELD_MAP.get(keyLower)
  const n = parseFloat(raw)
  if (field === undefined || Number.isNaN(n)) return undefined
  if (n === field.stock) return 'stock'
  return field.type === 'int' ? Math.trunc(n) : n
}

/** File ids that have at least one real override. */
export function changedFileIds(tweaks: PlayerTweaks): string[] {
  const ids = new Set<string>()
  for (const key of Object.keys(pruneTweaks(tweaks))) {
    const field = TWEAK_FIELD_MAP.get(key)
    if (field !== undefined) ids.add(field.fileId)
  }
  return [...ids]
}

/** Number of overrides per file id, for the section badges. */
export function countTweaksByFile(tweaks: PlayerTweaks): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const key of Object.keys(pruneTweaks(tweaks))) {
    const field = TWEAK_FIELD_MAP.get(key)
    if (field !== undefined) counts[field.fileId] = (counts[field.fileId] ?? 0) + 1
  }
  return counts
}

function cloneParam(param: TweakParam): TweakParam {
  return { name: param.name, type: param.type, value: param.value }
}

function cloneFile(file: TweakFile): TweakFile {
  if (file.kind === 'general') {
    return {
      ...file,
      difficulties: file.difficulties.map((difficulty) => ({
        name: difficulty.name,
        values: difficulty.values.map(cloneParam)
      }))
    }
  }
  return {
    ...file,
    params: file.params.map(cloneParam),
    upgrades: file.upgrades.map((upgrade) => ({
      ...upgrade,
      extra: upgrade.extra === undefined ? undefined : { ...upgrade.extra },
      children: upgrade.children.map(cloneParam)
    }))
  }
}

/** A stored number turned back into whatever the XML expects for that param. */
function decode(
  param: TweakParam,
  value: number,
  field: TweakFieldDef
): number | boolean | string {
  if (param.type === 'bool') return value !== 0
  if (param.type === 'string') {
    // out-of-range indices keep the stock value rather than writing "undefined"
    return field.choices?.[value] ?? param.value
  }
  return value
}

/**
 * Drops `ids` and everything that depends on them.
 *
 * An upgrade names its prerequisite by id, so removing a rung without removing
 * the rungs above it would leave a `req` pointing at an upgrade the file no
 * longer contains. The loop repeats until nothing new is caught, which handles
 * ladders of any depth.
 */
function removeUpgrades(file: TweakUnitFile, ids: Set<string>): void {
  if (ids.size === 0) return

  const doomed = new Set(ids)
  let growing = true
  while (growing) {
    growing = false
    for (const upgrade of file.upgrades) {
      if (doomed.has(upgrade.id)) continue
      if (upgrade.req !== undefined && doomed.has(upgrade.req)) {
        doomed.add(upgrade.id)
        growing = true
      }
    }
  }

  file.upgrades = file.upgrades.filter((upgrade) => !doomed.has(upgrade.id))
}

/** Baseline with the user's overrides applied, leaving the baseline untouched. */
export function applyTweaks(tweaks: PlayerTweaks): TweakFile[] {
  const pruned = pruneTweaks(tweaks)
  const files = TWEAK_BASELINE.map(cloneFile)
  const byId = new Map(files.map((file) => [file.id, file]))
  const removals = new Map<string, Set<string>>()

  for (const [key, value] of Object.entries(pruned)) {
    const field = TWEAK_FIELD_MAP.get(key)
    if (field === undefined) continue
    const file = byId.get(field.fileId)
    if (file === undefined) continue

    if (file.kind === 'general') {
      const difficulty = file.difficulties.find((d) => d.name === field.section)
      const target = difficulty?.values.find((v) => v.name === field.label)
      if (target !== undefined) target.value = value
      continue
    }

    if (field.group === 'param') {
      const target = file.params.find((p) => p.name === field.stat)
      if (target !== undefined) target.value = decode(target, value, field)
      continue
    }

    // collected first: removal has to run after every value is in place, or a
    // later override would look up an upgrade that is already gone
    if (field.group === 'remove') {
      if (field.upgradeId === undefined) continue
      const bucket = removals.get(file.id)
      if (bucket === undefined) removals.set(file.id, new Set([field.upgradeId]))
      else bucket.add(field.upgradeId)
      continue
    }

    // labels repeat across groups now, so upgrades are addressed by their id
    const upgrade = file.upgrades.find((u) => u.id === field.upgradeId)
    if (upgrade === undefined) continue

    if (field.group === 'cost') {
      upgrade.cost = value
    } else if (field.group === 'effect') {
      const target = upgrade.children.find((k) => k.name === field.stat)
      if (target !== undefined) target.value = decode(target, value, field)
    }
  }

  for (const [fileId, ids] of removals) {
    const file = byId.get(fileId)
    if (file !== undefined && file.kind === 'unit') removeUpgrades(file, ids)
  }

  return files
}

/**
 * The tweak/*.xml files to add to the campaign — only those the user actually
 * changed. Returns [] when nothing was touched, so a stock run emits no
 * tweak/ folder at all.
 */
export function emitTweakFiles(tweaks: PlayerTweaks | undefined): GeneratedFile[] {
  if (tweaks === undefined) return []
  const changed = new Set(changedFileIds(tweaks))
  if (changed.size === 0) return []

  return applyTweaks(tweaks)
    .filter((file) => changed.has(file.id))
    .map((file) => ({
      path: `tweak/${file.file}`,
      content: file.kind === 'general' ? serializeGeneralFile(file) : serializeUnitFile(file)
    }))
}
