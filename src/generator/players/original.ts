import { PLAYER_FIELD_MAP, extraKey, prunePlayerTweaks, skillKey } from './fields'
import type { PlayerTweaks } from './fields'
import { PLAYER_STOCK } from './stock.generated'

/**
 * The original Hammerwatch's feel on AE's skills, as on/off switches for the
 * Players tab: each one is a fixed set of `player.*` values, on when every one
 * of them is in place. They are what the original game hard-coded, so they
 * have no tweak file to come from; the numbers are read off the original's
 * `Hammerwatch.exe` (each class's `Player<Class>ActorBehavior.DoUpdate`) and
 * its `actors/player/*.xml` sprites, and AE's skill scripts
 * (`PlayerSkill.as`, `RangerShoot.as`, `PlayerSkillDirectional.as`, `BoltShooter.as`).
 */
export type OriginalToggleId = 'bow-heat' | 'attack-movement' | 'attack-speed' | 'combo' | 'priest-beam' | 'chain-lightning'

export interface OriginalToggle {
  id: OriginalToggleId
  label: string
  description: string
  values: PlayerTweaks
}

const root = (chain: string, field: string, value: number): PlayerTweaks => ({ [skillKey(chain, 1, field)]: value })

/**
 * Walking speed while attacking for the classes the original stops during the
 * attack sprite: the time-averaged speed under held autofire (free for 0.25 of
 * every 1.25 sprite lengths).
 */
const CRAWL = 0.2

/**
 * Each class's primary attack: how long the original's `west-attack` sprite
 * runs (`actors/player/<class>_a.xml`; it attacks again when it ends) and how
 * long AE's attack animation is (the scene's frame times in
 * `players/<class>/<class>.unit`). AE's cycle is the animation ÷
 * `cast-speed-mul` + `cooldown`.
 */
export const ORIGINAL_ATTACKS: readonly { chain: string; originalMs: number; animMs: number }[] = [
  { chain: 'pal_sword', originalMs: 100, animMs: 540 },
  { chain: 'warlock_dagger', originalMs: 120, animMs: 300 },
  { chain: 'wiz_fireball', originalMs: 200, animMs: 300 },
  { chain: 'priest_smite', originalMs: 200, animMs: 240 },
  { chain: 'ran_bow', originalMs: 200, animMs: 400 },
  { chain: 'thief_knives', originalMs: 201, animMs: 530 },
  { chain: 'sorc_shard', originalMs: 240, animMs: 240 }
]

/**
 * The cast speed and cooldown that repeat an attack at the original's rate:
 * if AE's animation already fits, only the wait shrinks; otherwise the
 * animation plays faster and there is no wait.
 */
function originalAttackValues(a: { chain: string; originalMs: number; animMs: number }): PlayerTweaks {
  const speed = PLAYER_FIELD_MAP.get(skillKey(a.chain, 1, 'cast-speed-mul'))!.stock
  const played = a.animMs / speed
  if (played <= a.originalMs) return prunePlayerTweaks(root(a.chain, 'cooldown', Math.round(a.originalMs - played)))
  // a cooldown already 0 (the bow's) is stock and left out
  return prunePlayerTweaks({
    ...root(a.chain, 'cast-speed-mul', Math.round((a.animMs / a.originalMs) * 100) / 100),
    ...root(a.chain, 'cooldown', 0)
  })
}

export const ORIGINAL_TOGGLES: readonly OriginalToggle[] = [
  {
    id: 'bow-heat',
    label: 'Ranger bow never overheats',
    description:
      'The original bow fires as fast as you hold it. AE builds heat with every arrow, which adds up to 0.3 s between shots and up to 15° of spread; a heat cap of 0 turns that off.',
    values: root('ran_bow', 'overheating-max', 0)
  },
  {
    id: 'attack-movement',
    label: 'Original movement while attacking',
    description:
      'The paladin, wizard and warlock crawl at a fifth of their speed while attacking, so you can still kite, and meteor locks the wizard until the last one lands; the ranger walks at half speed while shooting and stands still for flurry; the sorcerer slows to a third. Fire nova, lightning and the gargoyle no longer stop you. Priest and thief already match.',
    values: {
      // The original stops these three only while the attack sprite plays, and
      // held autofire waits 1.25× the sprite between attacks, so a fifth of the
      // time you move at full speed: about ×0.2 on average, enough to kite.
      // AE at the original attack speed has no such gap, so ×0 would pin you.
      ...root('pal_sword', 'move-speed-mul', CRAWL),
      ...root('wiz_fireball', 'move-speed-mul', CRAWL),
      // the cast runs as long as its meteor timeline, 1000 ms at every tier
      ...root('wiz_meteor', 'move-speed-mul', 0),
      ...root('wiz_meteor', 'move-speed-until', 1000),
      ...root('wiz_fire_nova', 'move-speed-mul', 1),
      ...root('warlock_dagger', 'move-speed-mul', CRAWL),
      ...root('warlock_lightning', 'move-speed-mul', 1),
      ...root('warlock_gargoyle', 'move-speed-mul', 1),
      ...root('ran_bow', 'move-speed-mul', 0.5),
      ...root('ran_flurry', 'speed-mul', 0),
      ...root('sorc_shard', 'move-speed-mul', 0.33),
      ...root('sorc_nova', 'move-speed-mul', 0.33),
      ...root('sorc_ice_orb', 'move-speed-mul', 0.33)
    }
  },
  {
    id: 'attack-speed',
    label: 'Original attack speed',
    description:
      'The original attacks the moment you press and again as soon as the attack sprite ends: the paladin every 0.1 s, the warlock 0.12 s, the wizard, priest, ranger and thief 0.2 s, the sorcerer 0.24 s. AE plays a longer animation and then waits; this speeds each primary attack up to the original rate.',
    values: Object.assign({}, ...ORIGINAL_ATTACKS.map(originalAttackValues)) as PlayerTweaks
  },
  {
    id: 'combo',
    label: 'Original combo rewards',
    description:
      'The original combo gives its mana and health every half second; AE gives the same amounts once a second. This doubles the combo’s mana and health regen at every tier.',
    values: Object.fromEntries(
      PLAYER_STOCK.extras.filter((e) => e.id.startsWith('combo_')).map((e) => [extraKey(e.id), e.stock * 2])
    )
  },
  {
    id: 'priest-beam',
    label: 'Original beam mana cost',
    description:
      'The original beam costs 3 mana per damage tick, every 0.2 s (15 mana/s). AE charges the 3 mana every 0.1 s instead, twice as much for the same damage.',
    values: root('priest_beam', 'castpoint', 200)
  },
  {
    id: 'chain-lightning',
    label: 'Original chain lightning reach',
    description:
      'The original lightning hops from enemy to enemy, up to two tiles each time, through a whole pack. AE’s bolts only strike within 50 px of where the orb lands; this widens that to 96 px, about three of the original’s hops.',
    values: { [extraKey('lightning_range')]: 96 }
  }
]

function toggle(id: OriginalToggleId): OriginalToggle {
  return ORIGINAL_TOGGLES.find((t) => t.id === id)!
}

/** On when every one of the toggle's values is in place (stock counts). */
export function isOriginalToggleOn(id: OriginalToggleId, tweaks: PlayerTweaks): boolean {
  return Object.entries(toggle(id).values).every(([key, value]) => (tweaks[key] ?? PLAYER_FIELD_MAP.get(key)!.stock) === value)
}

/** Switch a toggle: on writes its values, off puts those fields back to stock. */
export function setOriginalToggle(id: OriginalToggleId, on: boolean, tweaks: PlayerTweaks): PlayerTweaks {
  const out = { ...tweaks }
  for (const [key, value] of Object.entries(toggle(id).values)) {
    if (on) out[key] = value
    else delete out[key]
  }
  return prunePlayerTweaks(out)
}

/** Every toggle's values, for a preset that wants all of them. */
export function allOriginalToggles(): PlayerTweaks {
  return Object.assign({}, ...ORIGINAL_TOGGLES.map((t) => t.values)) as PlayerTweaks
}
