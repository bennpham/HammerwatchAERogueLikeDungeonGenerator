/**
 * Which roster actors leave a solid wreck behind when they die.
 *
 * Towers and spawners are the only roster actors that leave a persistent
 * doodad: each names a `*_razed.unit` (directly, or via a `_destroy.unit`
 * effect that spawns one) and that unit's collision is what stays on the
 * floor. Ordinary monsters leave gibs with no collision.
 *
 * [VERIFIED] 2026-10-09 by scripts/dev/corpse-survey.ts against
 * unpacked_assets_66. AE differs from HW1 here: the nova and laser towers'
 * wrecks are bare sprites (passable) where HW1's kept an r=8 circle. Only two
 * roster wrecks block:
 *
 * - `tower_static_frost` → `_destroy` → `_razed`, which keeps a collision shape;
 * - the Shaftlocke lich spawner → `spawner_lich_razed`, a Breakable with an
 *   r=18 circle — solid until someone smashes it, so treat it as blocking.
 *
 * Keys are the LIVE actor path, exactly as it appears in `MonsterTypeDef.tiers`.
 */

export type CorpseCollision = 'passable' | 'blocking'

const BLOCKING = new Set(['actors/towers/tower_static_frost.unit', 'actors/spawners/shaftlocke/spawner_lich.unit'])

/** Prefixes whose actors leave a wreck (everything else leaves gibs). */
const WRECK_PREFIXES = ['actors/spawners/', 'actors/towers/', 'actors/banners/', 'actors/aberrations/flowers/']

/**
 * What `actorPath` leaves on the floor once it dies, or `undefined` when it is
 * not a wreck-leaving structure — callers may treat `undefined` like
 * `'passable'`.
 */
export function corpseCollision(actorPath: string): CorpseCollision | undefined {
  if (BLOCKING.has(actorPath)) return 'blocking'
  return WRECK_PREFIXES.some((p) => actorPath.startsWith(p)) ? 'passable' : undefined
}

/** The actor paths known to leave a blocking wreck. Test/introspection helper. */
export function corpseCollisionPaths(): string[] {
  return [...BLOCKING]
}
