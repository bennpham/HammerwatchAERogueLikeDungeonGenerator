/**
 * The item assets a boss wave tier can drop — the roster behind Wave pickups.
 *
 * A pickup is an ordinary item asset the game already ships under
 * `assets/items/`. Nothing here emits an item file; boss/wavePickups.ts only
 * references one by path from a SpawnObject node's `parameters` (objects/
 * nodes.ts), exactly the way the wave rig references a monster actor.
 *
 * This is deliberately NOT objects/item.ts's `ItemType` table. That one groups
 * paths into pools the generator picks from at random (Treasure, Breakable,
 * Food...); this one is a flat, individually addressable list, because a
 * dungeon master picking a tier's drops names the exact item. The two overlap
 * on a few paths and that is fine — they answer different questions.
 *
 * `description` is what the form's tooltips show, so the difference between
 * the three potions is visible without opening the game's files.
 *
 * `lane` is which column of the entrance drop pad the item lands in — see
 * boss/pickupPad.ts. Kept here rather than derived from `group` because the
 * two answer different questions: `group` is a dropdown heading and splits the
 * upgrades across two tiers, `lane` is a floor position and keeps them
 * together.
 *
 * Verification status (see hammerwatch-modding/references/):
 *   [VERIFIED]   health_1, mana_1 — emitted as Food by objects/item.ts
 *   [VERIFIED]   health_4, mana_2, the three potions and the eight upgrades —
 *                present in a boss level resaved by the game's own editor
 *   [VERIFIED]   powerup_health — a flat 250 HP heal, not a potion. Owner's
 *                playtest, 2026-08-28. See DISCOVERY-LOG.md.
 *   [VERIFIED]   powerup_1up — hand-placed by the owner in a level the game's
 *                own editor then resaved.
 *   [VERIFIED]   health_2, health_3 — confirmed in game by the owner,
 *                2026-08-28. See DISCOVERY-LOG.md.
 *   [VERIFIED]   powerup_7up — grants seven lives. Owner, 2026-08-28.
 *   [VERIFIED]   Exact heal/mana/upgrade amounts in each description below —
 *                read from the game's own editor/assetsExtract/items/*.xml,
 *                2026-08-27. See DISCOVERY-LOG.md. Note health_4 (50 HP)
 *                heals less than health_3 (75 HP) despite the label order.
 *
 * Nothing in this roster is [UNVERIFIED] any more.
 */

/**
 * The drop-pad column an item lands in. Four lanes, laid out around the
 * arena entrance so the party always knows where to walk back to.
 */
export type PickupLane = 'health' | 'mana' | 'potion' | 'upgrade'

export interface PickupDef {
  /** Stable id, the asset's filename without its extension. */
  id: string
  /** What NodeSpawnObject.actorPath carries, e.g. 'items/health_4.xml'. */
  path: string
  /** Human label for the dropdown. */
  label: string
  /** Dropdown <optgroup> this pickup sits in. */
  group: string
  /** Which drop-pad column it lands in. See boss/pickupPad.ts. */
  lane: PickupLane
  /** Tooltip text — what the item does when walked over. */
  description: string
}

/** Every pickup a wave tier can drop, in dropdown order (grouped). */
export const PICKUP_DEFS: readonly PickupDef[] = [
  // --- Health --------------------------------------------------------------
  // Ordered smallest to biggest, which is also the order the pad's health lane
  // fills. powerup_health is the biggest of the five despite its filename
  // living with the potions: it is a flat 250 HP heal, not a timed powerup.
  {
    id: 'health_1',
    path: 'items/health_1.xml',
    label: 'Health (Small)',
    group: 'Health',
    lane: 'health',
    description: 'Heals 10 HP — the one scattered around the arena as food.'
  },
  {
    id: 'health_2',
    path: 'items/health_2.xml',
    label: 'Health (Medium)',
    group: 'Health',
    lane: 'health',
    description: 'Heals 25 HP.'
  },
  {
    id: 'health_3',
    path: 'items/health_3.xml',
    label: 'Health (Large)',
    group: 'Health',
    lane: 'health',
    description: 'Heals 75 HP.'
  },
  {
    id: 'health_4',
    path: 'items/health_4.xml',
    label: 'Health (XLarge)',
    group: 'Health',
    lane: 'health',
    description: 'Heals 50 HP — despite the name, less than Health (Large); it is the game\'s own numbering.'
  },
  {
    id: 'powerup_health',
    path: 'items/powerup_health.xml',
    label: 'Health (Huge)',
    group: 'Health',
    lane: 'health',
    description: 'A flat 250 HP heal — the largest single heal in the game, and the stock resupply drop.'
  },
  // --- Mana ----------------------------------------------------------------
  {
    id: 'mana_1',
    path: 'items/mana_1.xml',
    label: 'Mana (Small)',
    group: 'Mana',
    lane: 'mana',
    description: 'Restores 15 MP.'
  },
  {
    id: 'mana_2',
    path: 'items/mana_2.xml',
    label: 'Mana (Large)',
    group: 'Mana',
    lane: 'mana',
    description: 'Restores 50 MP.'
  },
  // --- Potions -------------------------------------------------------------
  {
    id: 'potion_1',
    path: 'items/powerup_potion1.xml',
    label: 'Potion — invincibility',
    group: 'Potions',
    lane: 'potion',
    description: 'Invincibility potion.'
  },
  {
    id: 'potion_2',
    path: 'items/powerup_potion2.xml',
    label: 'Potion — rejuvenation',
    group: 'Potions',
    lane: 'potion',
    description: 'Rejuvenation potion — restores health and mana.'
  },
  {
    id: 'potion_3',
    path: 'items/powerup_potion3.xml',
    label: 'Potion — damage',
    group: 'Potions',
    lane: 'potion',
    description: 'Damage potion.'
  },
  // --- Upgrades I ----------------------------------------------------------
  {
    id: 'upgrade_damage',
    path: 'items/upgrade_damage.xml',
    label: 'Damage upgrade I',
    group: 'Upgrades I',
    lane: 'upgrade',
    description: 'A free +5% damage upgrade.'
  },
  {
    id: 'upgrade_defense',
    path: 'items/upgrade_defense.xml',
    label: 'Defense upgrade I',
    group: 'Upgrades I',
    lane: 'upgrade',
    description: 'A free +1 armor upgrade.'
  },
  {
    id: 'upgrade_health',
    path: 'items/upgrade_health.xml',
    label: 'Health upgrade I',
    group: 'Upgrades I',
    lane: 'upgrade',
    description: 'A free +5 max-health upgrade.'
  },
  {
    id: 'upgrade_mana',
    path: 'items/upgrade_mana.xml',
    label: 'Mana upgrade I',
    group: 'Upgrades I',
    lane: 'upgrade',
    description: 'A free +10 max-mana upgrade.'
  },
  // --- Upgrades II ---------------------------------------------------------
  {
    id: 'upgrade_damage_2',
    path: 'items/upgrade_damage_2.xml',
    label: 'Damage upgrade II',
    group: 'Upgrades II',
    lane: 'upgrade',
    description: 'A free +10% damage upgrade.'
  },
  {
    id: 'upgrade_defense_2',
    path: 'items/upgrade_defense_2.xml',
    label: 'Defense upgrade II',
    group: 'Upgrades II',
    lane: 'upgrade',
    description: 'A free +2 armor upgrade.'
  },
  {
    id: 'upgrade_health_2',
    path: 'items/upgrade_health_2.xml',
    label: 'Health upgrade II',
    group: 'Upgrades II',
    lane: 'upgrade',
    description: 'A free +10 max-health upgrade.'
  },
  {
    id: 'upgrade_mana_2',
    path: 'items/upgrade_mana_2.xml',
    label: 'Mana upgrade II',
    group: 'Upgrades II',
    lane: 'upgrade',
    description: 'A free +20 max-mana upgrade.'
  },
  // --- Lives ---------------------------------------------------------------
  // Never in the stock table: an extra life is a real swing in a fight the
  // campaign means to be final, so it is opt-in and drops nothing by default.
  // These share the potion lane rather than getting one of their own — the
  // bottom row by the door is the consumables row, and lives belong in it.
  {
    id: 'powerup_1up',
    path: 'items/powerup_1up.xml',
    label: 'Extra life (1up)',
    group: 'Lives',
    lane: 'potion',
    description: 'One extra life.'
  },
  {
    id: 'powerup_7up',
    path: 'items/powerup_7up.xml',
    label: 'Extra lives (7up)',
    group: 'Lives',
    lane: 'potion',
    description: 'Seven extra lives in one pickup.'
  }
]

/**
 * The <optgroup> order, derived from PICKUP_DEFS so a new pickup cannot land in
 * a group the dropdown does not render. First-seen order, like BUFF_GROUPS.
 */
export const PICKUP_GROUPS: readonly string[] = PICKUP_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const PICKUP_BY_ID = new Map(PICKUP_DEFS.map((def) => [def.id, def]))

/** Looks a pickup up by id. Undefined for an unknown id — validation is the gate. */
export function pickupById(id: string): PickupDef | undefined {
  return PICKUP_BY_ID.get(id)
}

/**
 * The most copies of one item a single tier row may ask for.
 *
 * Every copy is its own SpawnObject node (see boss/wavePickups.ts for why a
 * count cannot be folded into `trigger-times`), so an unbounded count is an
 * unbounded node count in the emitted XML. 64 is far past any sane drop and
 * still nowhere near a size the editor struggles with.
 */
export const MAX_PICKUP_COUNT = 64
