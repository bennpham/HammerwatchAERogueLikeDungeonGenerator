/**
 * AE's player balance, as the Players tab edits it.
 *
 * AE keeps it in `players/` (not `tweak/`, which is the HW1 layout):
 * - `players/classes.sval` — each class's base health, mana and regen, and
 *   the list of skill files the class owns;
 * - `players/<class>/skills/*.sval` and `players/shared/skills/*.sval` — one
 *   file per skill: a root skill (owned from the start, or bought), its
 *   `upgrades`, and any `modifier-skills` with their own upgrades. Every
 *   purchase has a `category` (the shop column), a `cost` and the `binds` it
 *   sets.
 *
 * A scenario that ships a file at a stock path replaces it, so an edit is
 * written as a patched copy of the stock file. Each editable number records
 * the line it sits on in the stock file, and the install patches that line of
 * the install's own copy (`applyLineEdits`), so the rest of the file —
 * actions, effects, comments — is the game's, untouched.
 */

export interface PlayerValue {
  /** 1-based line in the stock file */
  line: number
  type: 'int' | 'float'
  stock: number
  /**
   * The value is the end of an ivec2 window rather than an element of its
   * own: `<ivec2 name="move-speed">0 260</ivec2>` is `move-speed-until` 260,
   * written back as `${start} ${value}` into `element`.
   */
  vec?: { element: string; start: number }
}

/** One purchase (or the starting skill) in a chain. */
export interface PlayerTier {
  /** shop level shown in the name, when the file has one */
  lvl?: number
  /** shop column, e.g. `off1`; absent on a skill owned from the start */
  category?: string
  /** absent on a skill owned from the start */
  cost?: PlayerValue
  /** numeric binds this tier sets, by bind name */
  binds: Record<string, PlayerValue>
  /**
   * Skill-level numbers beside the binds (`SKILL_PARAMS`): how fast the
   * character walks while the skill casts, and the ranger bow's heat. Kept
   * apart from `binds` because no description echoes them and bulk scaling
   * leaves them alone.
   */
  params?: Record<string, PlayerValue>
  /** the description line, whose `?a=1&b=2` arguments echo the binds */
  description?: { line: number; text: string }
}

/** A root skill or a modifier skill, and its upgrades in order. */
export interface PlayerChain {
  /** `<file stem>` for the root skill, `<file stem>:<modifier id>` otherwise */
  key: string
  /** the skill id inside the file */
  id: string
  /** display name, or the localisation key AE shows (`.wardmg-uname?lvl=1`) */
  name: string
  tiers: PlayerTier[]
}

export interface PlayerSkillFile {
  /** path inside the assets, e.g. `players/warlock/skills/warlock_dagger.sval` */
  path: string
  /** file name without `.sval`; unique across `players/` */
  stem: string
  chains: PlayerChain[]
}

export interface PlayerClass {
  id: string
  /** the class's skill files, in classes.sval order, with the line naming each */
  skills: Array<{ path: string; line: number }>
  /** base-* numbers (health, mana, regen …) by name */
  stats: Record<string, PlayerValue>
}

/**
 * A potion or item price. These are not in `players/`: the power shop writes
 * its potion prices as literals in `scripts/GUI/Shop/PowerShopMenuContent.as`,
 * and every item vendor prices by quality from the `Equipment*BaseCost`
 * constants in `scripts/Data/Misc.as`.
 */
export interface PlayerShopPrice {
  /** `potion_damage`, `power_rejuv`, `equipment_common` … */
  id: string
  /** the script, as the scenario ships it */
  path: string
  /** 1-based line in the stock script */
  line: number
  /** the price as the line writes it (`, 1000);`, `= 200;`), replaced whole */
  find: string
  stock: number
}

export interface PlayerStock {
  classes: PlayerClass[]
  skills: PlayerSkillFile[]
  shop: PlayerShopPrice[]
}

/**
 * One change to one line of a stock file. `value` rewrites the content of the
 * element named `name` on that line (`<int name="cost">600</int>`); `text`
 * replaces the first `find` on that line. An edit whose target is not on its
 * line is reported, never guessed at.
 */
export type LineEdit =
  | { line: number; kind: 'value'; name: string; value: string }
  | { line: number; kind: 'text'; find: string; replace: string }

/**
 * A file the scenario ships: `source` read from the install's assets, `edits`
 * applied, written at `path` (the same path, or a per-class copy of a shared
 * skill file).
 */
export interface PlayerFileOverride {
  path: string
  source: string
  edits: LineEdit[]
}
