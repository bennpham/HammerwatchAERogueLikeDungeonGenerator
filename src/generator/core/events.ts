/**
 * Engine global-event names, shared by every rig that fires off a
 * `GlobalEventTrigger` rather than an `AreaTrigger`.
 */

/**
 * The engine event that fires once the floor is loaded. [VERIFIED 2026-09-24]
 * by a user-played survival arena, whose whole clock hangs off it — first
 * taken from the authored test_damage_player_timer.xml; see DISCOVERY-LOG.md.
 */
export const LEVEL_LOADED_EVENT = 'LevelLoaded'
