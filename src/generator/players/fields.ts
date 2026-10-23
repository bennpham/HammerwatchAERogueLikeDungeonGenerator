import {
  PLAYER_LEVELS_MAX,
  addedFieldSpecs,
  canAddTiers,
  extendLadder,
  hasUpgrades,
  stockLadderBase,
  templateTier
} from './ladder'
import type { PlayerChain, PlayerSkillFile, PlayerTier, PlayerValue } from './model'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Every number the Players tab can change, keyed the way parameters.txt and
 * playersettings.txt write it:
 *
 *   player.class.<class>.<stat>                 classes.sval, e.g. base-health
 *   player.<chain>.<tier>.<field>               a skill file, for every class
 *   player.<class>@<chain>.<tier>.<field>       a shared skill file, one class
 *   player.<chain>.1.starting-level             levels of a skill owned from the start (1: no need to buy it)
 *   player.<chain>.levels                       how many tiers the chain has, 1 to 99 (stock: as the game ships it)
 *   player.<chain>.<tier>.<field>               past stock too: a tier added by `levels` (`added`)
 *   player.shop.<id>.cost                       a potion or item price (a script, not players/)
 *   player.extra.<id>                           a skill number outside players/ (combo buffs, lightning bolt)
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
   * `unlock` is a chain's starting level, 0 to its level count; `levels` is
   * that count, 1 to `maxLevel`; a `cost` with no `chainKey` is a potion or
   * item price; a `param` is a skill-level number beside the binds
   */
  kind: 'stat' | 'cost' | 'bind' | 'param' | 'unlock' | 'levels'
  /** an `unlock`: the chain's stock level count; `levels`: the most it can have */
  maxLevel?: number
  /**
   * A number of a tier past stock. Its `stock` is what it sets when nothing is
   * edited, but its default follows the tiers below it, so an override is
   * kept whatever its value (while the chain still has the tier).
   */
  added?: true
  /** a `param` that is the end of an ivec2 window: the window's start */
  windowStart?: number
  /** the stock file the value lives in */
  path: string
  line: number
  /** the bind or stat name; `cost` for a cost, `starting-level` for an unlock */
  name: string
  /** a shop price: its id in PLAYER_STOCK.shop */
  shopId?: string
  /** a `param` outside players/: its id in PLAYER_STOCK.extras */
  extraId?: string
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

/** The levels of a chain (a root or modifier skill) owned from the start: AE's `starting-level`. */
export function startingLevelKey(chainKey: string): string {
  return skillKey(chainKey, 1, 'starting-level')
}

/** A bought root skill owned from the start: its starting level, 0 or 1 (or higher, owning its upgrades too). */
export function unlockKey(stem: string): string {
  return startingLevelKey(stem)
}

/** How many tiers a chain has: the skill and its upgrades, past stock or fewer. */
export function levelsKey(chainKey: string): string {
  return `${PLAYER_KEY_PREFIX}${chainKey}.levels`
}

export function shopKey(id: string): string {
  return `${PLAYER_KEY_PREFIX}shop.${id}.cost`
}

export function extraKey(id: string): string {
  return `${PLAYER_KEY_PREFIX}extra.${id}`
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
    // the levels each chain owns from the start: on its own `starting-level`
    // line, else its price's line, where the patch writes one
    for (const chain of file.chains) {
      const first = chain.tiers[0]
      const line = first.startingLevel?.line ?? first.cost?.line
      if (line === undefined) continue
      out.push({
        key: startingLevelKey(chain.key),
        type: 'int',
        stock: first.startingLevel?.stock ?? 0,
        kind: 'unlock',
        maxLevel: chain.tiers.length,
        path: file.path,
        line,
        name: 'starting-level',
        chainKey: chain.key,
        tier: 1
      })
    }
    // how many tiers each chain with upgrades has: fewer than stock, or more
    // when its last upgrade has a number to raise
    for (const chain of file.chains) {
      if (!hasUpgrades(chain)) continue
      out.push({
        key: levelsKey(chain.key),
        type: 'int',
        stock: chain.tiers.length,
        kind: 'levels',
        maxLevel: canAddTiers(chain) ? PLAYER_LEVELS_MAX : chain.tiers.length,
        path: file.path,
        line: templateTier(chain).block!.end,
        name: 'levels',
        chainKey: chain.key
      })
    }
  }
  for (const p of PLAYER_STOCK.shop) {
    out.push({ key: shopKey(p.id), type: 'int', stock: p.stock, kind: 'cost', path: p.path, line: p.line, name: 'cost', shopId: p.id })
  }
  for (const e of PLAYER_STOCK.extras) {
    out.push({ key: extraKey(e.id), type: e.type, stock: e.stock, kind: 'param', path: e.path, line: e.line, name: e.id, extraId: e.id })
  }
  return out
})()

export const PLAYER_FIELD_MAP: ReadonlyMap<string, PlayerFieldDef> = new Map(PLAYER_FIELDS.map((f) => [f.key, f]))

/** Every chain by key, with its file. */
export const CHAIN_BY_KEY: ReadonlyMap<string, { file: PlayerSkillFile; chain: PlayerChain }> = new Map(
  PLAYER_STOCK.skills.flatMap((file) => file.chains.map((chain) => [chain.key, { file, chain }] as const))
)

/**
 * How many tiers a chain has with these overrides (lowercased keys): its
 * `levels`, kept within what the chain allows, else stock.
 */
export function chainLevels(chainKey: string, tweaks: PlayerTweaks): number {
  const stock = CHAIN_BY_KEY.get(chainKey)?.chain.tiers.length ?? 1
  const field = PLAYER_FIELD_MAP.get(levelsKey(chainKey))
  const v = tweaks[levelsKey(chainKey)]
  if (field === undefined || v === undefined || !Number.isFinite(v)) return stock
  return Math.min(field.maxLevel ?? stock, Math.max(1, Math.trunc(v)))
}

const ADDED_KEY = /^player\.([^.@]+)\.(\d+)\.([^.]+)$/

/** A number of a tier past stock (`player.<chain>.<tier>.<field>`, tier above stock), or undefined. */
function addedField(key: string): PlayerFieldDef | undefined {
  const m = ADDED_KEY.exec(key)
  const found = m === null ? undefined : CHAIN_BY_KEY.get(m[1])
  if (m === null || found === undefined || !canAddTiers(found.chain)) return undefined
  const { file, chain } = found
  const tier = Number(m[2])
  if (tier <= chain.tiers.length || tier > PLAYER_LEVELS_MAX || String(tier) !== m[2]) return undefined
  const spec = addedFieldSpecs(chain).find((s) => s.name === m[3])
  if (spec === undefined) return undefined
  const ladder = extendLadder(chain, tier, stockLadderBase(file, chain))
  return {
    key,
    type: spec.type,
    stock: ladder[ladder.length - 1].values[spec.name],
    kind: spec.kind === 'cost' ? 'cost' : 'bind',
    path: file.path,
    line: spec.line,
    name: spec.name,
    chainKey: chain.key,
    tier,
    added: true
  }
}

/** The field a key names (lowercased), a tier past stock included. */
export function playerField(key: string): PlayerFieldDef | undefined {
  return PLAYER_FIELD_MAP.get(key) ?? addedField(key)
}

export function isPlayerKey(key: string): boolean {
  return playerField(key.toLowerCase()) !== undefined
}

/**
 * Keep only real, finite, non-stock overrides of known keys (lowercased). A
 * tier past stock keeps its overrides while the chain still has it.
 */
export function prunePlayerTweaks(tweaks: PlayerTweaks): PlayerTweaks {
  const lower: PlayerTweaks = {}
  for (const [raw, value] of Object.entries(tweaks)) lower[raw.toLowerCase()] = value
  const out: PlayerTweaks = {}
  for (const [key, value] of Object.entries(lower)) {
    const field = playerField(key)
    if (field === undefined || !Number.isFinite(value)) continue
    if (field.added === true ? field.tier! > chainLevels(field.chainKey!, lower) : value === field.stock) continue
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
 * override its base carried; never for a tier past stock, which has no fixed
 * default), else the number (truncated for an int).
 */
export function parsePlayerValue(keyLower: string, raw: string): number | 'stock' | undefined {
  const field = playerField(keyLower)
  const n = Number.parseFloat(raw)
  if (field === undefined || Number.isNaN(n)) return undefined
  if (n === field.stock && field.added !== true) return 'stock'
  return field.type === 'int' ? Math.trunc(n) : n
}
