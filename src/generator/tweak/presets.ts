import { paramKey, removeKey } from './chains'
import { GENERIC_PRESETS } from './genericPresets'
import { HW2_PRESETS } from './hw2Presets'
import { aeMovementAndCombo, costs, ladder } from './presetParts'
import type { PlayerTweaks } from './types'

/**
 * A named player build — the Player tab's counterpart of a `CampaignPreset`
 * (issue #77). Listed on the preset dialog's "Player presets" tab. Loading one
 * replaces `playerTweaks` and nothing else, exactly like importing a
 * playersettings.txt, so it layers onto whatever campaign is loaded.
 *
 * Pure data, like the campaign presets: `build()` must return a fresh, sparse
 * (pruned) record every call and draw no random values. Every key must be a
 * `TWEAK_FIELD_MAP` key — `tests/playerSettings.test.ts` holds each entry to
 * that and to validating cleanly on top of `defaultParameters()`.
 *
 * Every preset must keep `player.shared.remove.life`: this generator's
 * campaigns never sell extra lives, and since loading a preset replaces the
 * Player tab, a preset without it would put lives back in the shop. A test
 * enforces it.
 */
export type PlayerPresetGroupId = 'generic' | 'anniversary' | 'hw2'

/**
 * The collapsible sections the preset dialog's Player tab groups presets under,
 * in this order — the Player tab's counterpart of `PRESET_GROUPS`. Generic
 * (builds not modelled on another game) leads; then one section
 * per game a build is modelled on.
 */
export const PLAYER_PRESET_GROUPS: readonly { id: PlayerPresetGroupId; label: string }[] = [
  { id: 'generic', label: 'Generic' },
  { id: 'anniversary', label: 'Anniversary Edition' },
  { id: 'hw2', label: 'Hammerwatch 2' }
]

export interface PlayerPreset {
  /** stable id the preset dialog loads by; never shown to the user */
  id: string
  /** the name the preset dialog lists */
  label: string
  /** one-line description of what the build is for */
  description: string
  /** which `PLAYER_PRESET_GROUPS` section this preset sits under */
  group: PlayerPresetGroupId
  /** a fresh override record every call — never a shared mutable one */
  build(): PlayerTweaks
}

/**
 * Hammerwatch Anniversary Edition's player balance, ported onto the original.
 * Source: AE's `unpacked_assets_66/players/` — `classes.sval` and each class's
 * `skills/*.sval`; the full comparison is `reference/hammerwatch-ae-comparison.md`.
 *
 * Only values whose AE number means the same thing in the original are copied
 * (enemy HP is identical in both games, so AE damage carries over 1:1). Left
 * out on purpose:
 * - anything AE builds differently — flame spray, ranges and projectile
 *   speeds, charge distance, the lightning orb and falloff, the gargoyle's
 *   projectile fan, the smoke stun's length;
 * - AE values that contradict AE's own description text (knight whirl-dur
 *   tier 2, priest smite-speed tier 5 and mana-regen tier 5) — the original
 *   number stays;
 * - moving while casting: per-skill AE data with no original tweak key.
 *
 * Movement and combo come from `aeMovementAndCombo()` (shared with Dungeon
 * Rebalanced), which documents the 1.1 move-speed split.
 */
function anniversaryEdition(): PlayerTweaks {
  return {
    ...aeMovementAndCombo(),
    // PowerShopMenuContent.as
    ...costs('shared', { 'pot-dmg': 1000 }),
    // AE sells extra lives (350g), but this generator's campaigns never do —
    // a preset replaces the whole Player tab, so it must carry the removal
    // `defaultParameters()` ships, or loading it would reopen the life shop
    [removeKey('shared', 'life')]: 1,

    // paladin/skills/ — AE's paladin is the original's knight
    [paramKey('knight', 'sword-dmg')]: 13,
    ...ladder('knight', 'sword-dmg', { dmg1: 20, dmg2: 26, dmg3: 33, dmg4: 40, dmg5: 46 }),
    ...costs('knight', { dmg1: 600, arc1: 200, 'health-2': 1000, 'health-3': 2200, 'health-4': 2900, 'health-5': 3600 }),
    ...ladder('knight', 'dmg-reduction', { 'armor-4': 10, 'armor-5': 12 }),
    // AE regen is per second (1.1/1.2/1.3/1.4); the original's is ms per point
    ...ladder('knight', 'mana-regen', { 'mana-2': 909, 'mana-3': 833, 'mana-4': 769, 'mana-5': 714 }),

    // thief/skills/
    ...ladder('thief', 'knives-dmg', { dmg1: 7, dmg2: 11, dmg3: 15 }),
    ...costs('thief', { dmg1: 700, aspeed1: 150 }),

    // wizard/skills/ — AE's fireball has no separate splash damage, so its
    // proj-damage is the original's fireball-dmg
    [paramKey('wizard', 'fireball-dmg')]: 16,
    ...ladder('wizard', 'fireball-dmg', { dmg1: 21, dmg2: 26, dmg3: 30, dmg4: 35, dmg5: 40 }),
    ...costs('wizard', { dmg1: 650, rng1: 400, 'health-2': 1000 }),

    // sorcerer/skills/
    ...costs('sorcerer', { dmg1: 700, rng1: 450, 'health-2': 1000 }),

    // priest/skills/
    ...costs('priest', { dmg1: 500, sspeed1: 150 }),

    // ranger/skills/
    ...costs('ranger', { dmg1: 700, pen1: 550, 'armor-3': 1800, 'armor-4': 2400 }),

    // warlock/skills/
    ...costs('warlock', { dmg1: 700, dmg4: 3900, dmg5: 5200, poison1: 200 }),
    [paramKey('warlock', 'lightning-mana-cost')]: 20,
    ...ladder('warlock', 'lightning-mana-cost', {
      lightningtrg1: 23,
      lightningtrg2: 26,
      lightningtrg3: 29,
      lightningtrg4: 32
    })
  }
}

/** Every player preset, in the order the dialog lists them within each group. */
export const PLAYER_PRESETS: readonly PlayerPreset[] = [
  ...GENERIC_PRESETS,
  {
    id: 'anniversary',
    label: 'AE player balance',
    group: 'anniversary',
    description:
      'Approximates Hammerwatch Anniversary Edition’s player balance: everyone moves faster, AE’s stronger sword, knives and fireball, a longer combo window and AE’s shop prices. Moving while casting is AE-only and not included.',
    build: anniversaryEdition
  },
  ...HW2_PRESETS
]

export function playerPresetById(id: string): PlayerPreset | undefined {
  return PLAYER_PRESETS.find((preset) => preset.id === id)
}
