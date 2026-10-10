/**
 * Which actors leave a corpse you can walk over and which leave a permanent
 * wall. Pure data, read from the shipped game files under
 * `Hammerwatch/editor/assetsExtract/actors/`.
 *
 * Towers and spawners are the only roster actors that leave a *persistent*
 * doodad behind: a live actor's `<entry name="corpse">` names a `*_razed.xml`,
 * and that razed file's `<collision>` block is what stays on the floor forever
 * after the kill. Ordinary monsters leave gibs with no collision at all.
 *
 * All 30 towers and spawners are solid *while alive*, so passability here is
 * purely a post-death property — it never describes whether a live actor blocks.
 *
 * The table is written out by hand rather than derived from the filename,
 * because "passable" is produced three different ways and no naming rule
 * separates them:
 *
 *   1. The razed file has no `<collision>` at all — most entries.
 *   2. The razed file's `<collision>` block is COMMENTED OUT —
 *      tower_flower_1_razed.xml:8-10, spawners/archer_1_razed.xml:7-15,
 *      spawners/archer_2_razed.xml:7-15. Grepping for the tag finds these and
 *      gets the answer exactly backwards.
 *   3. The live actor's `corpse` entry is itself commented out —
 *      spawners/doomspawn_1.xml:18. doomspawn_1_razed.xml exists and carries a
 *      radius-18 circle, but nothing ever loads it, so a dead doomspawn spawner
 *      leaves nothing on the floor.
 *
 * Two actors share another actor's razed file, so the corpse cannot be looked
 * up by transforming the live path either:
 *   - tower_nova_2.xml            -> tower_nova_1_razed.xml
 *   - tower_battlement_archer_1.xml -> tower_battlement_archer_3_razed.xml
 *
 * Keys are the LIVE actor path, i.e. exactly what appears in
 * `MonsterTypeDef.tiers` — never the razed path.
 */

export type CorpseCollision = 'passable' | 'blocking'

const CORPSE_COLLISION: Record<string, CorpseCollision> = {
  // --- Towers -------------------------------------------------------------
  // Banners: razed frame is a scorch mark, no collision element.
  'actors/tower_banner_1.xml': 'passable',
  'actors/tower_banner_2.xml': 'passable',
  'actors/tower_banner_3.xml': 'passable',
  // Battlements: both archer variants share tower_battlement_archer_3_razed,
  // which is a bare sprite. The live tower_empty has a full 32x32 blocking
  // polygon, but its corpse does not — the rubble is walkable.
  'actors/tower_battlement_archer_1.xml': 'passable',
  'actors/tower_battlement_archer_3.xml': 'passable',
  'actors/tower_battlement_empty.xml': 'passable',
  // Flowers: _1 has its collision commented out, the rest have none.
  'actors/tower_flower_1.xml': 'passable',
  'actors/tower_flower_1_small.xml': 'passable',
  'actors/tower_flower_2.xml': 'passable',
  'actors/tower_flower_3.xml': 'passable',
  // Nova / frost / tracking: the razed sprite keeps a live shoot-through
  // circle, so the wreck is a permanent obstacle you can shoot over but not
  // walk through.
  'actors/tower_nova_1.xml': 'blocking', // circle r=8
  'actors/tower_nova_2.xml': 'blocking', // circle r=8, via tower_nova_1_razed
  'actors/tower_static_frost.xml': 'blocking', // circle r=10
  'actors/tower_tracking_1.xml': 'blocking', // circle r=8
  'actors/tower_tracking_2.xml': 'blocking', // circle r=8
  'actors/tower_tracking_3.xml': 'blocking', // circle r=8

  // --- Spawners -----------------------------------------------------------
  'actors/spawners/archer_1.xml': 'passable', // collision commented out
  'actors/spawners/archer_2.xml': 'passable', // collision commented out
  'actors/spawners/bats.xml': 'blocking', // circle r=8
  'actors/spawners/doomspawn_1.xml': 'passable', // corpse entry commented out
  'actors/spawners/eye_1.xml': 'passable',
  'actors/spawners/maggot_1.xml': 'blocking', // 7-point polygon
  'actors/spawners/mummy_1.xml': 'passable',
  'actors/spawners/mummy_ranged_1.xml': 'passable',
  'actors/spawners/skeleton_1.xml': 'passable',
  'actors/spawners/skeleton_2.xml': 'passable',
  'actors/spawners/tick_1.xml': 'passable',
  'actors/spawners/wisp_1.xml': 'blocking', // circle r=14
  'actors/spawners/bonus/skeleton_1.xml': 'passable', // via skeleton_1_razed

  // --- Other corpse-leaving structures ------------------------------------
  // The slime host is a static hive, not a walker, and leaves a razed doodad
  // like the spawners do.
  'actors/slime_1_host.xml': 'passable'
}

/**
 * What `actorPath` leaves on the floor once it dies, or `undefined` when it is
 * not a corpse-leaving structure — ordinary monsters leave gibs with no
 * collision, so callers deciding whether a tile stays walkable may treat
 * `undefined` the same as `'passable'`.
 */
export function corpseCollision(actorPath: string): CorpseCollision | undefined {
  return CORPSE_COLLISION[actorPath]
}

/** Every actor path the corpse table knows about. Test/introspection helper. */
export function corpseCollisionPaths(): string[] {
  return Object.keys(CORPSE_COLLISION)
}
