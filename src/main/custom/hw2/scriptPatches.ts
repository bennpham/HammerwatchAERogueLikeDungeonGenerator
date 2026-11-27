import type { ScriptPatch } from '../scriptPlan'

/**
 * Edits that let Hammerwatch 2's scripts compile against AE's (experimental
 * "Load custom"). AE compiles a scenario's scripts with its own, and one
 * error stops every script, so each difference the game reports in spike S5
 * (`HW1A.exe.log`, docs/discovery/hammerwatch-2-spikes.md) becomes a patch.
 * Each finds a short piece of HW2's text in one file and replaces it; a carried
 * file a patch no longer matches is an error (HW2 has changed).
 */
export const HW2_SCRIPT_PATCHES: readonly ScriptPatch[] = [
  {
    path: 'scripts/Behaviors/Actors/Enemies/EnemyOwnedActor.as',
    find: 'IOwnedUnitSave(this, sval, 0);',
    replace: 'IOwnedUnitSave(this, sval, GetOwner(), 0);',
    why: "AE's IOwnedUnitSave takes the owner itself: (owned, builder, owner, weaponInfo)"
  },
  {
    path: 'scripts/Behaviors/Actors/Enemies/EnemyOwnedActor.as',
    after: 'class EnemyOwnedStateActor',
    find: 'super(unit);',
    replace: 'super(unit, params);',
    why: "AE's StateActorBehavior has only a (unit, params) constructor"
  },
  {
    path: 'scripts/Behaviors/Actors/Enemies/Movements/SteeringMovement.as',
    find: 'if (m_resetSceneTimeOnActivate)',
    replace: 'if (false)',
    why: "AE's ActorMovement has no m_resetSceneTimeOnActivate"
  }
]
