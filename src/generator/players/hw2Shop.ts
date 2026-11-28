import { CHAIN_BY_KEY, holdKey, levelsKey, unlockKey } from './fields'
import type { PlayerTweaks } from './fields'
import { addedFieldSpecs, canAddTiers } from './ladder'
import { PLAYER_STOCK } from './stock.generated'

/**
 * What the Hammerwatch 2 player presets do to AE's shop (asked 2026-11-28):
 * each class owns its skills 2 and 3 from the start, and the upgrades that
 * make a character tougher or hit harder sell up to {@link HW2_SHOP_TIERS}
 * tiers, while what would break the game stays where stock leaves it.
 * Pure data over the stock snapshot; no Hammerwatch 2 files are read.
 */

/** How many tiers an HW2 preset's growing upgrades sell. */
export const HW2_SHOP_TIERS = 99

/**
 * Each class's skills 2 and 3 (counting from 0, in AE's `players/classes.sval`
 * order): the two active skills a class otherwise buys. Their upgrades, and the
 * class's passives, stay for sale.
 */
export const HW2_OWNED_SKILLS: Readonly<Record<string, readonly [string, string]>> = {
  wizard: ['wiz_fire_nova', 'wiz_meteor'],
  paladin: ['pal_healing', 'pal_whirlwind'],
  ranger: ['ran_growth', 'ran_flurry'],
  thief: ['thief_smoke', 'thief_chain'],
  sorcerer: ['sorc_nova', 'sorc_ice_orb'],
  priest: ['priest_draining_field', 'priest_cripple_aura'],
  warlock: ['warlock_gargoyle', 'warlock_storm']
}

/**
 * The numbers an added tier may raise: health, mana, armor, their regen,
 * damage and healing amounts, the combo timer and the combo regen buffs.
 */
export const GROWING_NUMBERS: ReadonlySet<string> = new Set([
  // the character
  'player-max-health-set',
  'player-max-mana-set',
  'player-armor-set',
  'player-mana-regen-set',
  'player-health-regen-set',
  // damage and healing
  'proj-damage',
  'proj-dmg',
  'sword-dmg',
  'knives-dmg',
  'dagger-dmg',
  'smite-dmg',
  'beam-damage',
  'beam-heal',
  'bomb-damage',
  'cloud-damage',
  'combustion-damage',
  'comet-damage',
  'field-damage',
  'meteor-damage',
  'charge-dmg-multiplier',
  'whirl-dmg-multiplier',
  'dmg-per-mana',
  'heal',
  'mana-amount',
  // the poison's damage per tick (tweak/buffs/buffs.sval Warlock_poison NAME DMG)
  'dagger-poison',
  // combo: its window, and the regen its buffs give
  'combo-timer',
  'combo-heal-buff',
  'combo-mana-buff'
])

/**
 * The numbers an added tier keeps at the stock top: a chance (100% dodge is
 * never being hit), a count of projectiles or spawns (lag), a speed (running
 * too fast to pick things up), a reach, a lifetime or duration, a slow.
 */
export const HELD_NUMBERS: ReadonlySet<string> = new Set([
  // chances
  'bash-chance',
  'block-chance',
  'crit-chance',
  'dodge-chance',
  'trigger-chance',
  // projectile and spawn counts
  'combo-nova-parts',
  'fan-projectiles',
  'flurry-waves',
  'flurry-per-revolution',
  'nova-flames',
  'proj-bolts',
  'projectiles-count',
  'sword-rays',
  'field-max-count',
  'proj-penetration',
  'fervor-buff',
  // speeds
  'movespeed-mul',
  'move-speed-mul',
  'proj-speed',
  'smite-speed-pen',
  'flurry-proj-delay',
  // reach
  'beam-range',
  'chain-range',
  'charge-dist',
  'growth-radius',
  'proj-radius',
  'smite-radius',
  'smoke-radius',
  'shield-arc',
  'sword-angledelta',
  'sword-angleoffset',
  'fan-spread',
  // lifetimes, durations and slows
  'proj-ttl',
  'unit-ttl',
  'whirl-duration',
  'cloud-duration',
  'intensity',
  'chain-buff',
  'combustion-buff',
  'cripple-buff',
  'growth-buff',
  'slow-buff',
  'nova-buff-1',
  'nova-buff-2'
])

/**
 * The shop of an HW2 preset: skills 2 and 3 owned; every chain with a growing
 * number sells {@link HW2_SHOP_TIERS} tiers, its held numbers flat past stock;
 * a chain with only held numbers stays at its stock tiers. A number in neither
 * set is held (tests keep both sets covering the snapshot).
 */
export function hw2Shop(): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const stems of Object.values(HW2_OWNED_SKILLS)) for (const stem of stems) out[unlockKey(stem)] = 1
  for (const file of PLAYER_STOCK.skills) {
    for (const chain of file.chains) {
      if (!canAddTiers(chain)) continue
      const numbers = addedFieldSpecs(chain).filter((s) => s.kind !== 'cost')
      if (!numbers.some((s) => GROWING_NUMBERS.has(s.name))) continue
      out[levelsKey(chain.key)] = HW2_SHOP_TIERS
      for (const s of numbers) if (!GROWING_NUMBERS.has(s.name)) out[holdKey(chain.key, s.name)] = 1
    }
  }
  return out
}

/** Whether a chain key names a skill file root (sanity for {@link HW2_OWNED_SKILLS}). */
export function isRootChain(stem: string): boolean {
  return CHAIN_BY_KEY.get(stem)?.file.stem === stem
}
