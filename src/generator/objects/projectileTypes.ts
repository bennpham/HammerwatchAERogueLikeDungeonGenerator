/**
 * The projectiles a trap (`ProjectileSpewer`) can fire — Anniversary Edition
 * units, referenced by path from the spewer's `Projectile` parameter.
 *
 * Every stat here was read off the unit itself with
 * `scripts/dev/projectile-survey.mjs` (2026-10-09): behaviour class, speed,
 * physical damage and the buff its hit applies.
 *
 * Ids are kept from the HW1 remake wherever AE ships a counterpart, so a saved
 * pool or preset keeps meaning the same trap. Where AE has no exact match the
 * nearest AE projectile stands in, and `substitutes` says for what — the
 * user's rule: a missing projectile is replaced, never dropped.
 *
 * Verification:
 *   [VERIFIED] the ten `Traps` entries are what AE's own levels put in their
 *              ProjectileSpewers and ProjectileShooters (Castle, Shaftlocke and
 *              Temple of the Sun use 668 of them between them).
 *   [UNVERIFIED] the monster and boss projectiles have not been fired from a
 *              wall spewer yet — docs/BOOT-CHECKLIST.md "traps".
 */

export interface ProjectileDef {
  /** Stable id used in pools and presets. */
  id: string
  /** The AE unit the spewer fires. */
  path: string
  label: string
  /** Dropdown <optgroup>. */
  group: string
  /** Physical damage per hit. */
  damage: number
  /** Travel speed, from the unit's `speed`. Compare against each other, not to a unit. */
  speed: number
  /** The AE behaviour class: Projectile, RayProjectile, BeamProjectile, NewProjectile… */
  behavior: string
  /** The buff a hit applies (`actors/buffs.sval:<name>`), if any. */
  buff?: string
  /** The HW1 projectile this stands in for, when AE has no exact counterpart. */
  substitutes?: string
  description: string
}

function p(
  id: string,
  path: string,
  label: string,
  group: string,
  damage: number,
  speed: number,
  behavior: string,
  description: string,
  extra: { buff?: string; substitutes?: string } = {}
): ProjectileDef {
  const def: ProjectileDef = { id, path, label, group, damage, speed, behavior, description }
  if (extra.buff !== undefined) def.buff = `actors/buffs.sval:${extra.buff}`
  if (extra.substitutes !== undefined) def.substitutes = extra.substitutes
  return def
}

const TRAPS = 'Traps'
const MONSTERS = 'Monsters'
const TOWERS = 'Towers'
const BOSSES = 'Bosses'

/** Every projectile a trap can spew, in dropdown order (grouped). */
export const PROJECTILE_DEFS: readonly ProjectileDef[] = [
  // --- Traps: the ammunition AE's own levels load into wall shooters ---------
  p('shooter_arrow', 'doodads/generic/trap_shooter_arrow_projectile_normal.unit', 'Trap arrow', TRAPS, 13, 5.5, 'Projectile', '13 damage, fast. The standard arrow trap.'),
  p('shooter_arrow_poison', 'doodads/generic/trap_shooter_arrow_projectile_poison.unit', 'Trap arrow (poison)', TRAPS, 15, 5.5, 'Projectile', '15 damage and poison.', { buff: 'poison' }),
  p('shooter_spike', 'doodads/generic/trap_shooter_blade_projectile_normal.unit', 'Trap blade', TRAPS, 75, 10, 'Projectile', '75 damage at speed 10 — the fastest, hardest-hitting trap; near a one-shot for an unupgraded party.', { substitutes: 'HW1 shooter_spike' }),
  p('shooter_fireball', 'doodads/generic/trap_shooter_fire_projectile_normal.unit', 'Trap fireball', TRAPS, 25, 2.5, 'Projectile', '25 damage and burning. The classic corridor fireball.', { buff: 'burning' }),
  p('shooter_fireball_2', 'doodads/generic/trap_shooter_fire_projectile_big.unit', 'Trap fireball (large)', TRAPS, 50, 3, 'Projectile', '50 damage and strong burning.', { buff: 'burning_strong' }),
  p('shooter_flame', 'doodads/generic/trap_turret_flame_projectile.unit', 'Flame jet', TRAPS, 5, 2, 'Projectile', '5 damage per puff plus fire spray — a short flamethrower.', { buff: 'trap_firespray' }),
  p('shooter_flame_long', 'doodads/generic/trap_turret_flame_projectile_long.unit', 'Flame jet (long)', TRAPS, 5, 2, 'Projectile', 'The long-reach flamethrower.', { buff: 'trap_firespray' }),
  p('shooter_light_bolt', 'doodads/traps/projectiles/bolt_light.unit', 'Light bolt', TRAPS, 13, 5, 'RayProjectile', "13 damage. Shaftlocke's light-bolt traps."),
  p('shooter_light_bolt_queen', 'doodads/traps/bolt_light_queen.unit', 'Light bolt (strong)', TRAPS, 25, 6, 'RayProjectile', '25 damage, faster.'),
  p('shooter_stone_ball', 'doodads/traps/trap_indie_ball.unit', 'Rolling boulder', TRAPS, 200, 2.5, 'RayProjectile', '200 damage and a stun — a slow boulder you must get out of the way of.', { buff: 'boulder_stun', substitutes: 'HW1 shooter_stone_ball' }),
  p('shooter_dark_beam', 'doodads/generic/trap_beam_projectile.unit', 'Dark beam', TRAPS, 50, 2.5, 'RayProjectile', '50 magical damage and darkness.', { buff: 'darkness' }),

  // --- Monsters --------------------------------------------------------------
  p('enemy_arrow_1', 'actors/undead/archer_1_arrow.unit', 'Skeleton arrow', MONSTERS, 5, 5, 'RayProjectile', '5 damage. A skeleton archer\'s arrow.'),
  p('enemy_arrow_2', 'actors/undead/archer_2_arrow.unit', 'Ranger arrow', MONSTERS, 15, 6, 'RayProjectile', '15 damage.'),
  p('enemy_arrow_3', 'actors/undead/archer_3_arrow_fire.unit', 'Fire arrow', MONSTERS, 20, 7, 'RayProjectile', '20 damage and burning.', { buff: 'burning' }),
  p('boss_enemy_arrow_3', 'actors/undead/archer_mb_arrow.unit', 'Sharpshooter arrow', MONSTERS, 15, 8, 'RayProjectile', '15 damage, very fast.'),
  p('enemy_axe', 'actors/special/hellcube/projectile_armory.unit', 'Armory bolt', MONSTERS, 25, 4, 'RayProjectile', '25 damage in a straight line. Stands in for the HW1 axe, which matched it on damage; a good fit for a fast spewer with spread.', { substitutes: 'HW1 enemy_axe' }),
  p('tower_ballista_bolt', 'actors/towers/ballista_arrow.unit', 'Ballista bolt', TOWERS, 70, 6.5, 'RayProjectile', '70 damage, piercing — a heavy ballista bolt.'),
  p('enemy_lich_1', 'actors/undead/lich_1_projectile.unit', 'Lich orb', MONSTERS, 20, 3, 'RayProjectile', '20 damage.'),
  p('enemy_lich_1_elite', 'actors/undead/lich_1_elite_projectile.unit', 'Elite lich orb', MONSTERS, 45, 3, 'RayProjectile', '45 damage.'),
  p('enemy_lich_1_mb', 'actors/undead/lich_1_mb_fireball.unit', 'Wizard fireball', MONSTERS, 50, 2.85, 'NewProjectile', '50 damage and burning.', { buff: 'lich_1_mb_burn' }),
  p('enemy_magicball_death', 'actors/undead/lich_1_projectile.unit', 'Death orb', MONSTERS, 20, 3, 'RayProjectile', '20 damage — the lich orb.', { substitutes: 'HW1 enemy_magicball_death' }),
  p('enemy_magicball_purple', 'actors/aberrations/wisps/wisp_purple_projectile.unit', 'Purple orb', MONSTERS, 32, 2.4, 'RayProjectile', '32 damage — the purple wisp\'s orb.', { substitutes: 'HW1 enemy_magicball_purple' }),
  p('enemy_wisp_1_small', 'actors/aberrations/wisps/wisp_green_projectile.unit', 'Green wisp orb', MONSTERS, 20, 2.1, 'RayProjectile', '20 damage.'),
  p('enemy_wisp_1', 'actors/aberrations/wisps/wisp_blue_projectile.unit', 'Blue wisp orb', MONSTERS, 24, 2.2, 'RayProjectile', '24 damage.'),
  p('enemy_wisp_2', 'actors/aberrations/wisps/wisp_red_projectile.unit', 'Red wisp orb', MONSTERS, 32, 2.4, 'RayProjectile', '32 damage.'),
  p('enemy_lich_desert_1', 'actors/undead/mummies/mummy_lich_ice_projectile.unit', 'Ice lich bolt', MONSTERS, 25, 2, 'RayProjectile', '25 damage and frost.', { buff: 'frost' }),
  p('enemy_lich_desert_2', 'actors/undead/mummies/mummy_lich_fire_projectile.unit', 'Fire lich bolt', MONSTERS, 20, 2, 'RayProjectile', '20 damage and the fire lich\'s daze.', { buff: 'enemy_mummy_lich_fire' }),
  p('enemy_mummy_ranged_1', 'actors/undead/mummies/mummy_mage_projectile.unit', 'Mummy mage bolt', MONSTERS, 10, 2, 'RayProjectile', '10 damage plus a curse.', { buff: 'enemy_mummy_ranged_1' }),
  p('enemy_mummy_ranged_2', 'actors/undead/mummies/mummy_wizard_projectile.unit', 'Mummy wizard bolt', MONSTERS, 15, 2, 'RayProjectile', '15 damage and burning.', { buff: 'burning' }),
  p('enemy_mummy_1_mb', 'actors/undead/mummies/mummy_royal_projectile.unit', 'Royal mummy flies', MONSTERS, 5, 2, 'RayProjectile', '5 damage and a swarm of flies.', { buff: 'trap_flies' }),
  p('enemy_maggot_1_mb', 'actors/beasts/maggots/maggot_1_mb_projectile.unit', 'Maggot spit', MONSTERS, 20, 3.75, 'Projectile', '20 damage and poison.', { buff: 'maggot_poison' }),
  p('battlemage_fireball', 'actors/undead/skeletons/shaftlocke/skeleton_wizard_fireball.unit', 'Battlemage fireball', MONSTERS, 60, 2.85, 'Projectile', '60 damage. Shaftlocke\'s battlemage.'),
  p('lich_frost_shard', 'actors/undead/skeletons/shaftlocke/lich_frost_shard.unit', 'Frost shard', MONSTERS, 30, 4.5, 'RayProjectile', '30 damage and freezing.', { buff: 'freezing' }),

  // --- Towers ------------------------------------------------------------------
  p('enemy_tower_firebeam', 'actors/towers/projectile_tower_laser_fire.unit', 'Fire beam', TOWERS, 4, 12, 'BeamProjectile', '4 damage per tick and burning.', { buff: 'enemy_tower_firebeam' }),
  p('enemy_tower_firebeam_overload', 'actors/towers/projectile_tower_laser_fire_overload.unit', 'Fire beam (overload)', TOWERS, 4, 4, 'RayProjectile', '4 damage and burning.', { buff: 'burning' }),
  p('enemy_tower_icebeam', 'actors/towers/projectile_tower_laser_ice.unit', 'Ice beam', TOWERS, 4, 12, 'BeamProjectile', '4 damage per tick and slowing ice.', { buff: 'enemy_tower_icebeam' }),
  p('enemy_tower_icebeam_overload', 'actors/towers/projectile_tower_laser_ice_overload.unit', 'Ice beam (overload)', TOWERS, 4, 4, 'RayProjectile', '4 damage and freezing.', { buff: 'freezing' }),
  p('enemy_tower_drainbeam', 'actors/towers/projectile_tower_laser_drain.unit', 'Drain beam', TOWERS, 4, 12, 'BeamProjectile', '4 damage per tick and mana drain.', { buff: 'enemy_tower_drainbeam' }),
  p('enemy_tower_drainbeam_overload', 'actors/towers/projectile_tower_laser_drain_overload.unit', 'Drain beam (overload)', TOWERS, 4, 4, 'RayProjectile', '4 damage and drain.', { buff: 'drain' }),
  p('enemy_tower_iceball', 'actors/towers/projectile_tower_nova_ice.unit', 'Ice nova shard', TOWERS, 25, 3, 'RayProjectile', '25 damage and frost.', { buff: 'frost' }),
  p('enemy_tower_iceball_large', 'actors/towers/projectile_tower_nova_frost.unit', 'Frost nova shard', TOWERS, 35, 1.5, 'RayProjectile', '35 damage and frost, slow.', { buff: 'frost' }),
  p('enemy_tower_fireball', 'actors/towers/projectile_tower_nova_fire.unit', 'Fire nova shard', TOWERS, 35, 1.5, 'RayProjectile', '35 damage and strong burning, slow.', { buff: 'burning_strong' }),

  // --- Bosses ----------------------------------------------------------------
  p('enemy_boss_anubis_fireball', 'actors/bosses/boss_anubis/projectile_anubis_fireball_large.unit', 'Anubis fireball', BOSSES, 50, 6, 'Projectile', '50 damage and strong burning.', { buff: 'burning_strong' }),
  p('enemy_boss_anubis_fireball_small', 'actors/bosses/boss_anubis/projectile_anubis_fireball_small.unit', 'Anubis fireball (small)', BOSSES, 25, 5, 'NewProjectile', '25 damage and burning.', { buff: 'burning' }),
  p('enemy_boss_dragon_fireball', 'actors/bosses/boss_dragon/boss_dragon_fireball_projectile.unit', 'Dragon fireball', BOSSES, 30, 3, 'Projectile', '30 damage and burning.', { buff: 'burning' }),
  p('enemy_boss_krilith_frostball', 'actors/bosses/boss_krilith/projectile_krilith_frostball.unit', 'Krilith frostball', BOSSES, 30, 3, 'RayProjectile', '30 damage and Krilith\'s chill.', { buff: 'enemy_boss_krilith_v2' }),
  p('enemy_boss_krilith_wave', 'actors/bosses/boss_krilith/projectile_krilith_wave.unit', 'Krilith wave', BOSSES, 10, 5, 'Projectile', '10 damage and strong freezing.', { buff: 'freezing_strong' }),
  p('enemy_boss_krilith_confusion', 'actors/bosses/boss_krilith/projectile_krilith_confusion.unit', 'Krilith confusion', BOSSES, 20, 3, 'RayProjectile', '20 damage and confusion — inverts your controls.', { buff: 'enemy_lich_desert_2' }),
  p('enemy_boss_lich', 'actors/bosses/boss_lich/projectile_boss_lich.unit', 'Lich boss orb', BOSSES, 75, 3, 'NewProjectile', '75 damage.'),
  p('boss_knight_shard', 'actors/bosses/boss_knight/projectile_boss_knight_shard.unit', 'Knight shard', BOSSES, 12, 2.75, 'Projectile', '12 damage.'),
  p('boss_queen_spit', 'actors/bosses/boss_queen/projectile_boss_queen.unit', 'Queen spit', BOSSES, 15, 3, 'NewProjectile', '15 damage and strong poison.', { buff: 'boss_maggot_poison' }),
  p('boss_warden_arrow', 'actors/bosses/boss_warden/arrow.unit', 'Warden arrow', BOSSES, 20, 5.5, 'NewProjectile', '20 damage.')
]

export const PROJECTILE_GROUPS: readonly string[] = PROJECTILE_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const BY_ID = new Map(PROJECTILE_DEFS.map((d) => [d.id, d]))

/** The projectile with this id, or undefined. */
export function projectileById(id: string): ProjectileDef | undefined {
  return BY_ID.get(id)
}
