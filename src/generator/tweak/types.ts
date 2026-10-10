/**
 * Model of Hammerwatch's `tweak/*.xml` balance files.
 *
 * A campaign's tweak file *wholly replaces* the base game's file of the same
 * name — it is not a key-level merge. The official Temple of the Sun campaign
 * (editor/campaign2/tweak/shared.xml) proves this: it ships a complete file
 * with 28 upgrade entries against the base file's 34, deleting `pot-invul`.
 *
 * So changing a single value still means emitting the whole file, which is why
 * the complete stock baseline lives in baseline.ts.
 */

export type TweakValueType = 'int' | 'float' | 'bool' | 'string'

/** One `<int name="x">v</int>` style entry. */
export interface TweakParam {
  name: string
  type: TweakValueType
  value: number | boolean | string
}

/** One `<dictionary id="…" cost="…" …>` entry in `<upgrades>`. */
export interface TweakUpgrade {
  id: string
  cost: number
  cat: string
  /** localization key for the display name */
  nameKey: string
  /** localization key for the description */
  descKey: string
  /** id of the upgrade that must be bought first */
  req?: string
  /** extra attributes such as life-cost-scale */
  extra?: Record<string, string>
  /** nested params the upgrade writes when purchased */
  children: TweakParam[]
}

/** knight.xml, priest.xml, …, and shared.xml — `<tweak><params/><upgrades/></tweak>`. */
export interface TweakUnitFile {
  kind: 'unit'
  /** file name inside tweak/, e.g. "knight.xml" */
  file: string
  /** stable id used in override keys, e.g. "knight" */
  id: string
  /** label for the UI */
  label: string
  params: TweakParam[]
  upgrades: TweakUpgrade[]
}

/** One `<dictionary name="easy">` block inside general.xml. */
export interface TweakDifficulty {
  name: string
  values: TweakParam[]
}

/** general.xml — a plain dictionary of per-difficulty dictionaries, no upgrades. */
export interface TweakGeneralFile {
  kind: 'general'
  file: string
  id: string
  label: string
  difficulties: TweakDifficulty[]
}

export type TweakFile = TweakUnitFile | TweakGeneralFile

/** Sparse map of user edits: canonical lowercase key -> numeric value. */
export type PlayerTweaks = Record<string, number>
