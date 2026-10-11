import { PLAYER_FIELD_MAP, prunePlayerTweaks, skillKey } from './fields'
import type { PlayerTweaks } from './fields'

/**
 * The original Hammerwatch's feel on AE's skills, as on/off switches for the
 * Players tab: each one is a fixed set of `player.*` values, on when every one
 * of them is in place. They are what the original game hard-coded, so they
 * have no tweak file to come from; the numbers are read off the original's
 * `Hammerwatch.exe` (each class's `Player<Class>ActorBehavior.DoUpdate`) and
 * its `actors/player/*.xml` sprites, and AE's skill scripts
 * (`PlayerSkill.as`, `RangerShoot.as`, `PlayerSkillDirectional.as`).
 */
export type OriginalToggleId = 'bow-heat' | 'attack-movement' | 'paladin-swing'

export interface OriginalToggle {
  id: OriginalToggleId
  label: string
  description: string
  values: PlayerTweaks
}

const root = (chain: string, field: string, value: number): PlayerTweaks => ({ [skillKey(chain, 1, field)]: value })

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
      'The paladin, wizard and warlock stand still to attack and meteor locks the wizard until the last one lands; the ranger walks at half speed while shooting and stands still for flurry; the sorcerer slows to a third. Fire nova, lightning and the gargoyle no longer stop you. Priest and thief already match.',
    values: {
      ...root('pal_sword', 'move-speed-mul', 0),
      ...root('wiz_fireball', 'move-speed-mul', 0),
      // the cast runs as long as its meteor timeline, 1000 ms at every tier
      ...root('wiz_meteor', 'move-speed-mul', 0),
      ...root('wiz_meteor', 'move-speed-until', 1000),
      ...root('wiz_fire_nova', 'move-speed-mul', 1),
      ...root('warlock_dagger', 'move-speed-mul', 0),
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
    id: 'paladin-swing',
    label: 'Original paladin swing speed',
    description:
      'The original sword hits the moment you press and swings again 0.1 s later. AE plays a 540 ms swing at double speed, then waits 0.2 s: this plays it at ×5.4 with no wait.',
    values: { ...root('pal_sword', 'cast-speed-mul', 5.4), ...root('pal_sword', 'cooldown', 0) }
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
