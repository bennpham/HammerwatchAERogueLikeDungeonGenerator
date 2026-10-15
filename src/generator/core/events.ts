/**
 * Trigger names shared by every rig that fires off a `GlobalEventTrigger`
 * rather than an `AreaTrigger`.
 */

/**
 * Fires once when the level loads: `NodeGlobalEventTrigger` emits it as a
 * `ScriptLink` with `ExecuteOnStart`. [VERIFIED] in game by survival arenas,
 * whose whole clock hangs off it (checklist #49).
 */
export const LEVEL_LOADED_EVENT = 'LevelLoaded'
