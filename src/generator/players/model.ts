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
  /** the line `category` is on */
  categoryLine?: number
  /**
   * A chain's first tier only: the levels owned from the start, when the file
   * writes `starting-level` (the classes' first skills, 1). AE reads it on a
   * root and on a modifier skill alike (`PlayerClass.as`).
   */
  startingLevel?: PlayerValue
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
  /**
   * An upgrade (not a chain's first tier): its `<dict>` … `</dict>` lines, the
   * dict a tier added past stock is copied from and a removed tier drops
   */
  block?: { start: number; end: number }
  /** the shop name (`.hp-uname?lvl=5`) and its line, an upgrade only */
  name?: { line: number; text: string }
  /** the `lvl` line, an upgrade only */
  lvlLine?: number
  /** string binds (`proj-fx`, a combo buff's name), an upgrade only */
  strings?: Record<string, PlayerStringBind>
}

export interface PlayerStringBind {
  line: number
  stock: string
  /** the bind names a numbered buff (`tweak/buffs/buffs.sval:combo_health_regen_level_5`) */
  buff?: PlayerBuffLevel
}

/**
 * A numbered buff an upgrade applies, as its buff file defines it:
 * `%block Combo_health_regen combo_health_regen_level_5 10`. A tier added past
 * stock gets the next number, on a copy of this line with its own arguments.
 */
export interface PlayerBuffLevel {
  path: string
  /** 1-based line of the `%block` */
  line: number
  /** the buff's name without its number, `combo_health_regen_level_` */
  name: string
  level: number
  /** the block's arguments after the name: duration, amount … */
  args: number[]
  /** the arguments of the level below, when the file has it */
  prevArgs?: number[]
  /** the line from the name to its last argument, as written */
  find: string
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

/**
 * A skill number that lives outside `players/`: the combo's regen buffs
 * (`tweak/buffs/buffs.sval`) and the warlock lightning bolt
 * (`players/warlock/projectiles/lightning_bolt.unit`). The line reads
 * `${prefix}${stock}${suffix}` and is rewritten whole.
 */
export interface PlayerExtraValue {
  /** `combo_mana_1`, `lightning_range` … */
  id: string
  path: string
  /** 1-based line in the stock file */
  line: number
  prefix: string
  suffix: string
  type: 'int' | 'float'
  stock: number
}

export interface PlayerStock {
  classes: PlayerClass[]
  skills: PlayerSkillFile[]
  shop: PlayerShopPrice[]
  extras: PlayerExtraValue[]
}

/**
 * One change to one line of a stock file. `value` rewrites the content of the
 * element named `name` on that line (`<int name="cost">600</int>`); `text`
 * replaces the first `find` on that line. An edit whose target is not on its
 * line is reported, never guessed at.
 *
 * Two more add and remove whole tiers: `clone` inserts, after `line`, a copy
 * of the stock file's own lines `from`…`to` with `edits` applied to the copy
 * (numbered as in the stock file), so a tier past stock is the game's last
 * upgrade dict re-valued; `drop` removes lines `line`…`to`. Line numbers
 * always name the stock file, whatever else is inserted or removed.
 */
export type LineEdit =
  | { line: number; kind: 'value'; name: string; value: string }
  | { line: number; kind: 'text'; find: string; replace: string }
  | { line: number; kind: 'clone'; from: number; to: number; edits: LineEdit[] }
  | { line: number; kind: 'drop'; to: number }

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
