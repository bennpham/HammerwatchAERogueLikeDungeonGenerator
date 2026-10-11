import type { PlayerChain, PlayerSkillFile, PlayerTier, PlayerValue } from './model'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Every number the Players tab can change, keyed the way parameters.txt and
 * playersettings.txt write it:
 *
 *   player.class.<class>.<stat>                 classes.sval, e.g. base-health
 *   player.<chain>.<tier>.<field>               a skill file, for every class
 *   player.<class>@<chain>.<tier>.<field>       a shared skill file, one class
 *   player.<stem>.1.starting-level              1: a bought skill is owned from the start
 *   player.shop.<id>.cost                       a potion or item price (a script, not players/)
 *
 * `<chain>` is the file stem for the root skill (`warlock_dagger`) or
 * `<stem>:<modifier id>` for a modifier skill
 * (`warlock_dagger:warlock_dagger_dmg`); `<tier>` counts from 1 (the skill
 * itself, then each upgrade); `<field>` is `cost`, a bind name or a
 * skill-level param (`move-speed-mul`, `overheating-max` …; `SKILL_PARAMS`). The
 * `<class>@` form exists only for the files several classes share
 * (`shared_speed`, `shared_speed_melee`, `shared_combo`): it gives that class
 * its own copy of the file, so e.g. one class's move speed can differ from
 * the rest of its group.
 */

export interface PlayerFieldDef {
  key: string
  type: 'int' | 'float'
  stock: number
  /**
   * `unlock` is 0 or 1; a `cost` with no `chainKey` is a potion or item price;
   * a `param` is a skill-level number beside the binds
   */
  kind: 'stat' | 'cost' | 'bind' | 'param' | 'unlock'
  /** a `param` that is the end of an ivec2 window: the window's start */
  windowStart?: number
  /** the stock file the value lives in */
  path: string
  line: number
  /** the bind or stat name; `cost` for a cost, `starting-level` for an unlock */
  name: string
  /** a shop price: its id in PLAYER_STOCK.shop */
  shopId?: string
  /** set for `stat` fields and class-scoped skill fields */
  classId?: string
  chainKey?: string
  /** 1-based */
  tier?: number
}

export type PlayerTweaks = Record<string, number>

export const PLAYER_KEY_PREFIX = 'player.'

export function statKey(classId: string, stat: string): string {
  return `${PLAYER_KEY_PREFIX}class.${classId}.${stat}`
}

export function skillKey(chainKey: string, tier: number, field: string, classId?: string): string {
  return `${PLAYER_KEY_PREFIX}${classId === undefined ? '' : `${classId}@`}${chainKey}.${tier}.${field}`
}

/** A bought skill owned from the start (AE's `starting-level`), 0 or 1. */
export function unlockKey(stem: string): string {
  return skillKey(stem, 1, 'starting-level')
}

export function shopKey(id: string): string {
  return `${PLAYER_KEY_PREFIX}shop.${id}.cost`
}

/** A file's root skill, when it has to be bought (it has a price of its own). */
export function boughtRoot(file: PlayerSkillFile): PlayerChain | undefined {
  const root = file.chains.find((c) => c.key === file.stem)
  return root?.tiers[0]?.cost === undefined ? undefined : root
}

/** Skill files more than one class lists — the ones a class can fork. */
export const SHARED_SKILL_PATHS: ReadonlySet<string> = (() => {
  const owners = new Map<string, number>()
  for (const c of PLAYER_STOCK.classes) for (const s of c.skills) owners.set(s.path, (owners.get(s.path) ?? 0) + 1)
  return new Set([...owners].filter(([, n]) => n > 1).map(([p]) => p))
})()

export const SKILL_FILE_BY_PATH: ReadonlyMap<string, PlayerSkillFile> = new Map(
  PLAYER_STOCK.skills.map((s) => [s.path, s])
)

/** The classes that list a skill file, in classes.sval order. */
export function classesOwning(path: string): string[] {
  return PLAYER_STOCK.classes.filter((c) => c.skills.some((s) => s.path === path)).map((c) => c.id)
}

function valueFields(
  file: PlayerSkillFile,
  chain: PlayerChain,
  tierIndex: number,
  tier: PlayerTier,
  classId?: string
): PlayerFieldDef[] {
  const out: PlayerFieldDef[] = []
  const add = (name: string, kind: 'cost' | 'bind' | 'param', v: PlayerValue) =>
    out.push({
      key: skillKey(chain.key, tierIndex + 1, name, classId),
      type: v.type,
      stock: v.stock,
      kind,
      path: file.path,
      line: v.line,
      name,
      chainKey: chain.key,
      tier: tierIndex + 1,
      ...(classId === undefined ? {} : { classId }),
      ...(v.vec === undefined ? {} : { windowStart: v.vec.start })
    })
  if (tier.cost !== undefined) add('cost', 'cost', tier.cost)
  for (const [name, v] of Object.entries(tier.binds)) add(name, 'bind', v)
  for (const [name, v] of Object.entries(tier.params ?? {})) add(name, 'param', v)
  return out
}

export const PLAYER_FIELDS: readonly PlayerFieldDef[] = (() => {
  const out: PlayerFieldDef[] = []
  for (const c of PLAYER_STOCK.classes) {
    for (const [stat, v] of Object.entries(c.stats)) {
      out.push({
        key: statKey(c.id, stat),
        type: v.type,
        stock: v.stock,
        kind: 'stat',
        path: 'players/classes.sval',
        line: v.line,
        name: stat,
        classId: c.id
      })
    }
  }
  for (const file of PLAYER_STOCK.skills) {
    const scopes: Array<string | undefined> = [undefined]
    if (SHARED_SKILL_PATHS.has(file.path)) scopes.push(...classesOwning(file.path))
    for (const classId of scopes) {
      for (const chain of file.chains) {
        chain.tiers.forEach((tier, i) => out.push(...valueFields(file, chain, i, tier, classId)))
      }
    }
    // the switch sits on the root's cost line, where the patch writes it
    const root = boughtRoot(file)
    if (root !== undefined) {
      out.push({
        key: unlockKey(file.stem),
        type: 'int',
        stock: 0,
        kind: 'unlock',
        path: file.path,
        line: root.tiers[0].cost!.line,
        name: 'starting-level',
        chainKey: file.stem,
        tier: 1
      })
    }
  }
  for (const p of PLAYER_STOCK.shop) {
    out.push({ key: shopKey(p.id), type: 'int', stock: p.stock, kind: 'cost', path: p.path, line: p.line, name: 'cost', shopId: p.id })
  }
  return out
})()

export const PLAYER_FIELD_MAP: ReadonlyMap<string, PlayerFieldDef> = new Map(PLAYER_FIELDS.map((f) => [f.key, f]))

export function isPlayerKey(key: string): boolean {
  return PLAYER_FIELD_MAP.has(key.toLowerCase())
}

/** Keep only real, finite, non-stock overrides of known keys (lowercased). */
export function prunePlayerTweaks(tweaks: PlayerTweaks): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [raw, value] of Object.entries(tweaks)) {
    const key = raw.toLowerCase()
    const field = PLAYER_FIELD_MAP.get(key)
    if (field === undefined || !Number.isFinite(value) || value === field.stock) continue
    out[key] = field.type === 'int' ? Math.trunc(value) : value
  }
  return out
}

/** `key=value` as both text formats write it. */
export function formatPlayerLine(key: string, value: number): string {
  return `${key}=${value}`
}

/**
 * One `player.*` line's value: `undefined` for an unknown key or a value that
 * is not a number, `'stock'` for the stock value (how a file clears an
 * override its base carried), else the number (truncated for an int).
 */
export function parsePlayerValue(keyLower: string, raw: string): number | 'stock' | undefined {
  const field = PLAYER_FIELD_MAP.get(keyLower)
  const n = Number.parseFloat(raw)
  if (field === undefined || Number.isNaN(n)) return undefined
  if (n === field.stock) return 'stock'
  return field.type === 'int' ? Math.trunc(n) : n
}
