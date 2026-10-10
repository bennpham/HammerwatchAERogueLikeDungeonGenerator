/**
 * The projectile assets a boss-arena trap can spew — the roster behind Traps.
 *
 * A projectile is an ordinary asset the game already ships under
 * `assets/projectiles/`. Nothing here emits a projectile file; boss/traps.ts
 * only references one by path from a ProjectileSpewer node's `projectile`
 * parameter (objects/nodes.ts), exactly the way the wave rig references a
 * monster actor and wavePickups references an item.
 *
 * Modelled on objects/pickupTypes.ts: a flat, individually addressable list,
 * because a dungeon master picking a trap's ammunition names the exact
 * projectile. `description` is what the form's tooltips show.
 *
 * `damage`, `speed`, `directions` and `behavior` are read verbatim off each
 * file's root `<projectile>` element. They are carried as data rather than
 * folded into the description alone so the form can sort and warn on them.
 *
 * ## A curated subset, not the whole folder
 *
 * The folder holds 68 `.xml` files. **45 are listed here**; the other 23 were
 * cut after the 2026-09-02 playtest, and the rules for the cut are worth
 * keeping because they decide any future addition too:
 *
 *   1. **A projectile with `damage: 0` is not a trap.** Those are fired by a
 *      weapon that supplies the damage from the character's stats — every
 *      `player_*` entry, the sorcerer shards, the Warlock lightning and
 *      lifesteal shards, the dragon blood splatters, and `shooter_valuables`,
 *      the coin spray. A spewer has no stats, so from a wall they are a light
 *      show and nothing else. Offering them made the picker confusing (22 of
 *      68 options carrying a "this does nothing" warning), and at least one —
 *      a combo nova — lodged in the wall rather than flying. Do not add them
 *      back without a reason better than "it looks nice".
 *   2. **`sorcerer_ice_orb` crashes the game.** [VERIFIED] 2026-09-02 in game:
 *      a `System.NullReferenceException` inside
 *      `TiltedEngine.WorldObjects.WorldObjectProducers.BehaviorData.Get`,
 *      reached from `ARPGGame.Behaviors.Projectiles.NeutralBehavior..ctor` —
 *      the resource bank has no behavior data for it when a spewer produces
 *      it, rather than the Sorcerer's own cast. It was the Sorcerer group's
 *      only damaging entry, so the whole group is gone with it. See
 *      DISCOVERY-LOG 2026-09-02 for the full trace and the sweep that cleared
 *      every other `behavior: 'neutral'` survivor of suspicion.
 *
 * Two things the tooltips still have to say:
 *
 * 1. **`directions: 1` means one sprite angle.** The tower beams and most magic
 *    balls draw the same frame whichever way they travel; they still fly
 *    correctly, they just do not rotate. 26 of the 45 are like this.
 * 2. **`behavior` does not survive the spewer.** A projectile fired from a wall
 *    travels in a straight line whatever its behavior says — homing is the
 *    *monster's* aim, not the projectile's, so a `seeker` shot from a spewer
 *    will not chase anybody; that aim only ever belongs to the boss/monster
 *    that fires its own attack, never to a spewer. It still hurts on contact.
 *    [VERIFIED] 2026-09-02 in game on the lich family and
 *    `enemy_boss_krilith_confusion`. Descriptions must not promise otherwise.
 *
 * Verification status (see hammerwatch-modding/references/):
 *   [VERIFIED] Every id, path and stat below — read directly from the root
 *              `<projectile>` element of each file in
 *              `editor/assetsExtract/projectiles/` on a real Hammerwatch
 *              install, 2026-09-01.
 *   [VERIFIED] `projectiles/enemy_axe.xml`,
 *              `projectiles/enemy_boss_anubis_fireball.xml`, the three
 *              `enemy_tower_*_overload` beams, both wisps, `boss_maggot_nova`,
 *              `enemy_boss_dragon_fireball` and `enemy_boss_krilith_confusion`
 *              all fire cleanly from a generated arena, 2026-09-02.
 *   [VERIFIED] `shooter_fireball`, `shooter_fireball_2`, `shooter_arrow`,
 *              `shooter_spike`, `shooter_stone_ball`, both `enemy_magicball_*`
 *              and `enemy_boss_krilith_frostball` fire cleanly from the mystery
 *              starter set's trap rooms (owner playtest, 2026-09-27).
 *   [EMITTED]  The rest are the same asset kind referenced the same way, and
 *              have not been fired from a generated spewer yet. Nothing further
 *              is suspected of the `sorcerer_ice_orb` crash — see DISCOVERY-LOG.
 */

export interface ProjectileDef {
  /** Stable id, the asset's filename without its extension. */
  id: string
  /** What NodeProjectileSpewer.projectilePath carries, e.g. 'projectiles/enemy_axe.xml'. */
  path: string
  /** Human label for the dropdown. */
  label: string
  /** Dropdown <optgroup> this projectile sits in. */
  group: string
  /** Damage per hit, from the file's `damage=""`. 0 = the firer supplies it. */
  damage: number
  /** Travel speed, from `speed=""`. Compare these against each other, not to a unit. */
  speed: number
  /** Sprite angles, from `directions=""`. 1 = one frame whichever way it flies. */
  directions: number
  /** From `behavior=""` when present — 'seeker', 'penetrating', 'explode', … */
  behavior?: string
  /** Tooltip text. */
  description: string
}

/** Every projectile a trap can spew, in dropdown order (grouped). */
export const PROJECTILE_DEFS: readonly ProjectileDef[] = [
  // --- Traps & shooters ------------------------------------------------------
  // The game's own trap ammunition, and the group to reach for first: these are
  // the only projectiles designed to come out of a wall rather than a monster,
  // and every one of them carries real damage.
  {
    id: 'shooter_arrow',
    path: 'projectiles/shooter_arrow.xml',
    label: 'Trap arrow',
    group: 'Traps & shooters',
    damage: 13,
    speed: 1.75,
    directions: 4,
    description: '13 damage, speed 1.75. The standard arrow-trap bolt — cheap, fast, easy to dodge one at a time.'
  },
  {
    id: 'shooter_spike',
    path: 'projectiles/shooter_spike.xml',
    label: 'Trap spike',
    group: 'Traps & shooters',
    damage: 75,
    speed: 4,
    directions: 4,
    description: '75 damage, speed 4 — the fastest thing in the roster and one of the hardest hitting. A spike lane is close to a one-shot for an unupgraded party.'
  },
  {
    id: 'shooter_fireball',
    path: 'projectiles/shooter_fireball.xml',
    label: 'Trap fireball',
    group: 'Traps & shooters',
    damage: 25,
    speed: 1.1,
    directions: 4,
    behavior: 'neutral',
    description: '25 damage, speed 1.1. Slow and clearly telegraphed — the classic corridor fireball.'
  },
  {
    id: 'shooter_fireball_2',
    path: 'projectiles/shooter_fireball_2.xml',
    label: 'Trap fireball (large)',
    group: 'Traps & shooters',
    damage: 50,
    speed: 1.8,
    directions: 8,
    behavior: 'penetrating',
    description: '50 damage, speed 1.8, penetrating — it does not stop on the first player it hits, so it sweeps a whole lane.'
  },
  {
    id: 'shooter_stone_ball',
    path: 'projectiles/shooter_stone_ball.xml',
    label: 'Rolling boulder',
    group: 'Traps & shooters',
    damage: 1000,
    speed: 1.5,
    directions: 1,
    behavior: 'penetrating',
    description: '1000 damage, speed 1.5, penetrating, 13-wide collision. An instant kill that cannot be outlived — use it only if you mean the lane to be lethal.'
  },

  // --- Enemy -----------------------------------------------------------------
  {
    id: 'enemy_axe',
    path: 'projectiles/enemy_axe.xml',
    label: 'Axe',
    group: 'Enemy',
    damage: 25,
    speed: 1.75,
    directions: 8,
    description: '25 damage, speed 1.75. Spins as it flies and reads well at a distance, which makes it a good fit for a fast spewer with spread.'
  },
  {
    id: 'enemy_arrow_1',
    path: 'projectiles/enemy_arrow_1.xml',
    label: 'Arrow (weak)',
    group: 'Enemy',
    damage: 5,
    speed: 1.5,
    directions: 8,
    description: '5 damage, speed 1.5. The gentlest projectile that still hurts — good for a high-rate spewer meant to pressure rather than kill.'
  },
  {
    id: 'enemy_arrow_2',
    path: 'projectiles/enemy_arrow_2.xml',
    label: 'Arrow (fast)',
    group: 'Enemy',
    damage: 10,
    speed: 2.25,
    directions: 8,
    description: '10 damage, speed 2.25.'
  },
  {
    id: 'enemy_arrow_3',
    path: 'projectiles/enemy_arrow_3.xml',
    label: 'Arrow (strong)',
    group: 'Enemy',
    damage: 12,
    speed: 1.75,
    directions: 8,
    description: '12 damage, speed 1.75.'
  },
  {
    id: 'enemy_magicball_purple',
    path: 'projectiles/enemy_magicball_purple.xml',
    label: 'Magic ball (purple)',
    group: 'Enemy',
    damage: 10,
    speed: 0.5,
    directions: 8,
    description: '10 damage, speed 0.5 — very slow, so a stream of them becomes a drifting wall rather than a shot.'
  },
  {
    id: 'enemy_magicball_death',
    path: 'projectiles/enemy_magicball_death.xml',
    label: 'Magic ball (death)',
    group: 'Enemy',
    damage: 50,
    speed: 1.75,
    directions: 1,
    description: '50 damage, speed 1.75. One sprite angle.'
  },
  {
    id: 'enemy_spider_1',
    path: 'projectiles/enemy_spider_1.xml',
    label: 'Spider web',
    group: 'Enemy',
    damage: 5,
    speed: 0.85,
    directions: 8,
    behavior: 'seeker',
    description: '5 damage, speed 0.85. Tagged seeker, but from a spewer it flies straight like everything else â the homing is the spider’s aim, not the shot’s.'
  },
  {
    id: 'enemy_maggot_1',
    path: 'projectiles/enemy_maggot_1.xml',
    label: 'Maggot spit',
    group: 'Enemy',
    damage: 5,
    speed: 0.75,
    directions: 8,
    behavior: 'neutral',
    description: '5 damage, speed 0.75. Poison hit.'
  },
  {
    id: 'enemy_maggot_1_small',
    path: 'projectiles/enemy_maggot_1_small.xml',
    label: 'Maggot spit (small)',
    group: 'Enemy',
    damage: 5,
    speed: 0.65,
    directions: 8,
    description: '5 damage, speed 0.65. Poison hit.'
  },
  {
    id: 'enemy_maggot_1_mb',
    path: 'projectiles/enemy_maggot_1_mb.xml',
    label: 'Maggot spit (miniboss)',
    group: 'Enemy',
    damage: 20,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '20 damage, speed 1, 5-wide collision. Poison hit. One sprite angle.'
  },
  {
    id: 'enemy_wisp_1',
    path: 'projectiles/enemy_wisp_1.xml',
    label: 'Wisp bolt',
    group: 'Enemy',
    damage: 30,
    speed: 0.75,
    directions: 1,
    behavior: 'neutral',
    description: '30 damage, speed 0.75. One sprite angle.'
  },
  {
    id: 'enemy_wisp_1_small',
    path: 'projectiles/enemy_wisp_1_small.xml',
    label: 'Wisp bolt (small)',
    group: 'Enemy',
    damage: 25,
    speed: 0.65,
    directions: 1,
    behavior: 'neutral',
    description: '25 damage, speed 0.65. One sprite angle.'
  },
  {
    id: 'enemy_wisp_2',
    path: 'projectiles/enemy_wisp_2.xml',
    label: 'Wisp bolt (greater)',
    group: 'Enemy',
    damage: 40,
    speed: 0.85,
    directions: 1,
    behavior: 'neutral',
    description: '40 damage, speed 0.85. One sprite angle.'
  },

  // --- Enemy towers ----------------------------------------------------------
  // Beams: low damage per hit but fast and penetrating, so they tick repeatedly
  // through everything in the lane. Each `_overload` variant is the same beam
  // with the penetration removed.
  {
    id: 'enemy_tower_firebeam',
    path: 'projectiles/enemy_tower_firebeam.xml',
    label: 'Tower firebeam',
    group: 'Enemy towers',
    damage: 4,
    speed: 1.75,
    directions: 1,
    behavior: 'penetrating',
    description: '4 damage, speed 1.75, penetrating. A beam segment — meant to be fired continuously at a low spawn rate so it reads as a solid line of fire.'
  },
  {
    id: 'enemy_tower_firebeam_overload',
    path: 'projectiles/enemy_tower_firebeam_overload.xml',
    label: 'Tower firebeam (overload)',
    group: 'Enemy towers',
    damage: 4,
    speed: 1.75,
    directions: 1,
    behavior: 'neutral',
    description: '4 damage, speed 1.75. The firebeam without penetration — it stops on the first thing it hits.'
  },
  {
    id: 'enemy_tower_icebeam',
    path: 'projectiles/enemy_tower_icebeam.xml',
    label: 'Tower icebeam',
    group: 'Enemy towers',
    damage: 2,
    speed: 2,
    directions: 1,
    behavior: 'penetrating',
    description: '2 damage, speed 2, penetrating. The lightest hit in the roster.'
  },
  {
    id: 'enemy_tower_icebeam_overload',
    path: 'projectiles/enemy_tower_icebeam_overload.xml',
    label: 'Tower icebeam (overload)',
    group: 'Enemy towers',
    damage: 2,
    speed: 2,
    directions: 1,
    behavior: 'neutral',
    description: '2 damage, speed 2. The icebeam without penetration.'
  },
  {
    id: 'enemy_tower_drainbeam',
    path: 'projectiles/enemy_tower_drainbeam.xml',
    label: 'Tower drainbeam',
    group: 'Enemy towers',
    damage: 3,
    speed: 2.5,
    directions: 1,
    behavior: 'penetrating',
    description: '3 damage, speed 2.5, penetrating.'
  },
  {
    id: 'enemy_tower_drainbeam_overload',
    path: 'projectiles/enemy_tower_drainbeam_overload.xml',
    label: 'Tower drainbeam (overload)',
    group: 'Enemy towers',
    damage: 3,
    speed: 2.5,
    directions: 1,
    behavior: 'neutral',
    description: '3 damage, speed 2.5. The drainbeam without penetration.'
  },
  {
    id: 'enemy_tower_iceball',
    path: 'projectiles/enemy_tower_iceball.xml',
    label: 'Tower iceball',
    group: 'Enemy towers',
    damage: 25,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '25 damage, speed 1. One sprite angle.'
  },
  {
    id: 'enemy_tower_iceball_large',
    path: 'projectiles/enemy_tower_iceball_large.xml',
    label: 'Tower iceball (large)',
    group: 'Enemy towers',
    damage: 35,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '35 damage, speed 1, 5.5-wide collision — hard to sidestep in a narrow lane.'
  },

  // --- Lich & mummy ----------------------------------------------------------
  {
    id: 'enemy_lich_1',
    path: 'projectiles/enemy_lich_1.xml',
    label: 'Lich bolt',
    group: 'Lich & mummy',
    damage: 30,
    speed: 0.75,
    directions: 1,
    description: '30 damage, speed 0.75. One sprite angle.'
  },
  {
    id: 'enemy_lich_1_elite',
    path: 'projectiles/enemy_lich_1_elite.xml',
    label: 'Lich bolt (elite)',
    group: 'Lich & mummy',
    damage: 20,
    speed: 0.8,
    directions: 1,
    behavior: 'penetrating',
    description: '20 damage, speed 0.8, penetrating — passes through the whole party rather than stopping on the front one.'
  },
  {
    id: 'enemy_lich_1_mb',
    path: 'projectiles/enemy_lich_1_mb.xml',
    label: 'Lich bolt (miniboss)',
    group: 'Lich & mummy',
    damage: 50,
    speed: 2,
    directions: 8,
    behavior: 'penetrating',
    description: '50 damage, speed 2, penetrating, 6.9-wide collision. One of the nastiest things you can put in a lane.'
  },
  {
    id: 'enemy_lich_desert_1',
    path: 'projectiles/enemy_lich_desert_1.xml',
    label: 'Desert lich bolt',
    group: 'Lich & mummy',
    damage: 25,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '25 damage, speed 1. One sprite angle.'
  },
  {
    id: 'enemy_lich_desert_2',
    path: 'projectiles/enemy_lich_desert_2.xml',
    label: 'Desert lich bolt (greater)',
    group: 'Lich & mummy',
    damage: 20,
    speed: 0.95,
    directions: 1,
    behavior: 'neutral',
    description: '20 damage, speed 0.95. One sprite angle.'
  },
  {
    id: 'enemy_lich_frostspray',
    path: 'projectiles/enemy_lich_frostspray.xml',
    label: 'Lich frostspray',
    group: 'Lich & mummy',
    damage: 12,
    speed: 2,
    directions: 1,
    behavior: 'spray',
    description: '12 damage, speed 2, spray behaviour — it fans out on its own, on top of whatever spread the spewer adds.'
  },
  {
    id: 'enemy_mummy_ranged_1',
    path: 'projectiles/enemy_mummy_ranged_1.xml',
    label: 'Mummy spit',
    group: 'Lich & mummy',
    damage: 10,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '10 damage, speed 1. Poison hit. One sprite angle.'
  },
  {
    id: 'enemy_mummy_ranged_2',
    path: 'projectiles/enemy_mummy_ranged_2.xml',
    label: 'Mummy spit (greater)',
    group: 'Lich & mummy',
    damage: 15,
    speed: 1.2,
    directions: 1,
    behavior: 'neutral',
    description: '15 damage, speed 1.2. One sprite angle.'
  },
  {
    id: 'enemy_mummy_1_mb',
    path: 'projectiles/enemy_mummy_1_mb.xml',
    label: 'Mummy bolt (miniboss)',
    group: 'Lich & mummy',
    damage: 5,
    speed: 0.8,
    directions: 1,
    behavior: 'seeker',
    description: '5 damage, speed 0.8. Tagged seeker, but a spewer fires it in a straight line.'
  },

  // --- Boss ------------------------------------------------------------------
  {
    id: 'enemy_boss_anubis_fireball',
    path: 'projectiles/enemy_boss_anubis_fireball.xml',
    label: 'Anubis fireball',
    group: 'Boss',
    damage: 50,
    speed: 2,
    directions: 8,
    behavior: 'seeker',
    description: '50 damage, speed 2, 3.25-wide collision â the hardest-hitting boss shot here. Tagged seeker, but from a wall it flies straight; the wide collision is what makes a single stream dangerous.'
  },
  {
    id: 'enemy_boss_anubis_fireball_small',
    path: 'projectiles/enemy_boss_anubis_fireball_small.xml',
    label: 'Anubis fireball (small)',
    group: 'Boss',
    damage: 25,
    speed: 2,
    directions: 8,
    behavior: 'neutral',
    description: '25 damage, speed 2. The non-homing half of the Anubis pair.'
  },
  {
    id: 'enemy_boss_dragon_fireball',
    path: 'projectiles/enemy_boss_dragon_fireball.xml',
    label: 'Dragon fireball',
    group: 'Boss',
    damage: 30,
    speed: 1.45,
    directions: 8,
    behavior: 'explode',
    description: '30 damage, speed 1.45, explodes on impact — the blast catches players standing near whoever it hits.'
  },
  {
    id: 'enemy_boss_krilith_frostball',
    path: 'projectiles/enemy_boss_krilith_frostball.xml',
    label: 'Krilith frostball',
    group: 'Boss',
    damage: 30,
    speed: 0.6,
    directions: 1,
    behavior: 'seeker',
    description: '30 damage, speed 0.6 â slow enough to walk beside. Tagged seeker, but a spewer fires it straight, so a lane of them is a wall to time rather than a chase.'
  },
  {
    id: 'enemy_boss_krilith_wave',
    path: 'projectiles/enemy_boss_krilith_wave.xml',
    label: 'Krilith wave',
    group: 'Boss',
    damage: 10,
    speed: 2.5,
    directions: 8,
    behavior: 'penetrating',
    description: '10 damage, speed 2.5, penetrating, 7-wide collision — a wide fast sheet that is very hard to sidestep.'
  },
  {
    id: 'enemy_boss_krilith_confusion',
    path: 'projectiles/enemy_boss_krilith_confusion.xml',
    label: 'Krilith confusion',
    group: 'Boss',
    damage: 20,
    speed: 0.35,
    directions: 1,
    behavior: 'seeker',
    description: '20 damage, speed 0.35 â the slowest thing in the roster bar the ice orb. Tagged seeker; fired from a wall it does not home.'
  },
  {
    id: 'enemy_boss_lich',
    path: 'projectiles/enemy_boss_lich.xml',
    label: 'Lich boss bolt',
    group: 'Boss',
    damage: 75,
    speed: 0.75,
    directions: 1,
    behavior: 'penetrating',
    description: '75 damage, speed 0.75, penetrating, 4-wide collision. Slow enough to dodge, brutal if you do not.'
  },
  {
    id: 'boss_enemy_arrow_3',
    path: 'projectiles/boss_enemy_arrow_3.xml',
    label: 'Boss arrow',
    group: 'Boss',
    damage: 10,
    speed: 1.75,
    directions: 8,
    description: '10 damage, speed 1.75.'
  },
  {
    id: 'boss_knight_shard',
    path: 'projectiles/boss_knight_shard.xml',
    label: 'Knight shard',
    group: 'Boss',
    damage: 12,
    speed: 1.75,
    directions: 8,
    description: '12 damage, speed 1.75.'
  },
  {
    id: 'boss_maggot_nova',
    path: 'projectiles/boss_maggot_nova.xml',
    label: 'Maggot nova',
    group: 'Boss',
    damage: 15,
    speed: 1,
    directions: 1,
    behavior: 'neutral',
    description: '15 damage, speed 1, 5-wide collision. Poison hit.'
  }
]

/**
 * The <optgroup> order, derived from PROJECTILE_DEFS so a new projectile cannot
 * land in a group the dropdown does not render. First-seen order, like
 * PICKUP_GROUPS.
 */
export const PROJECTILE_GROUPS: readonly string[] = PROJECTILE_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const BY_ID = new Map(PROJECTILE_DEFS.map((d) => [d.id, d]))

/** The projectile with this id, or undefined. */
export function projectileById(id: string): ProjectileDef | undefined {
  return BY_ID.get(id)
}
