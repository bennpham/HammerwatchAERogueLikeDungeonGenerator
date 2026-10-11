import type { PlayerChain, PlayerSkillFile, PlayerTier } from './model'

/**
 * Names for the Players tab. AE's skill files carry localisation keys
 * (`.wardmg-uname?lvl=1`) whose text is packed away, so the labels are made
 * from the file and skill ids instead.
 */

const CLASS_LABELS: Record<string, string> = {
  wizard: 'Wizard',
  paladin: 'Paladin',
  ranger: 'Ranger',
  thief: 'Thief',
  sorcerer: 'Sorcerer',
  priest: 'Priest',
  warlock: 'Warlock'
}

export function classLabel(id: string): string {
  return CLASS_LABELS[id] ?? id
}

const WORDS: Record<string, string> = {
  dmg: 'damage',
  misc: '',
  wiz: '',
  pal: '',
  ran: '',
  sorc: '',
  rng: 'range',
  num: 'count',
  dur: 'duration'
}

function words(id: string): string {
  const text = id
    .split('_')
    .map((w) => WORDS[w] ?? w)
    .filter((w) => w !== '')
    .join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const FILE_LABELS: Record<string, string> = {
  shared_speed: 'Move speed (ranged classes)',
  shared_speed_melee: 'Move speed (melee classes)',
  shared_combo: 'Combo'
}

/** `warlock_dagger` → "Dagger", `wiz_misc_health` → "Health". */
export function skillFileLabel(file: PlayerSkillFile): string {
  const fixed = FILE_LABELS[file.stem]
  if (fixed !== undefined) return fixed
  const stem = file.stem.replace(/^(wiz|pal|ran|thief|sorc|priest|warlock)_/, '')
  return words(stem)
}

/** The root skill is "Skill"; a modifier is named by what its id adds to the file's. */
export function chainLabel(file: PlayerSkillFile, chain: PlayerChain): string {
  if (chain.key === file.stem) return 'Skill'
  if (chain.id === 'shared_misc_speed_modifier') return 'Speed upgrades'
  if (chain.id === chain.key) return 'Upgrades' // a modifier with no id of its own
  // what the id adds to the file's name: `warlock_dagger_dmg` → dmg,
  // `sorc_orb_time` (in sorc_ice_orb) → time
  const stemWords = new Set(file.stem.split('_'))
  const own = chain.id.split('_')
  while (own.length > 1 && stemWords.has(own[0])) own.shift()
  return words(own.join('_'))
}

const SHOP_LABELS: Record<string, string> = {
  power_rejuv: 'Rejuvenation (refill)',
  potion_damage: 'Damage potion',
  potion_rejuv: 'Rejuvenation potion',
  potion_invul: 'Invulnerability potion',
  potion_speed: 'Speed potion',
  equipment_common: 'Common item',
  equipment_uncommon: 'Uncommon item',
  equipment_rare: 'Rare item',
  equipment_epic: 'Epic item',
  equipment_unique: 'Unique item'
}

/** A potion or item price, by its id in PLAYER_STOCK.shop. */
export function shopPriceLabel(id: string): string {
  return SHOP_LABELS[id] ?? words(id)
}

/** "Start" for a tier owned from the start, else "Tier n · column". */
export function tierLabel(tier: PlayerTier, index: number): string {
  if (tier.cost === undefined) return 'Start'
  return `Tier ${index + 1}${tier.category === undefined ? '' : ` · ${tier.category}`}`
}
