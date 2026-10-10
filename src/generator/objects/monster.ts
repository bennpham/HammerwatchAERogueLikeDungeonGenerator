import { XMLDictionary, XMLFloat, XMLInt, XMLObject, XMLString } from '../xml'
import {
  familyMembers,
  floorPoolTier,
  monsterFamilyById,
  monsterTypeById,
  parseMonsterKey,
  MonsterTypeDef
} from './monsterTypes'
import type { MonsterFamilyDef } from './monsterTypes'
import type { GenerationContext } from '../core/context'

/**
 * What a lair's horde is made of, resolved from one floor pool key.
 *
 * Three shapes, because a pool key means three different things and each has a
 * different relationship with the RNG:
 *
 * - `rolled` — a bare type id. Each monster rolls that type's tier ladder
 *   (createRolled), which draws.
 * - `pinned` — `id#tier`. Every monster is that exact actor and the tier costs
 *   NO draw, which is what makes a pin a statement rather than a roll.
 * - `family` — a family id. Each monster draws a member uniformly, then rolls
 *   that member's own ladder.
 */
export type HordeSource =
  | { kind: 'rolled'; type: MonsterTypeDef }
  | { kind: 'pinned'; type: MonsterTypeDef; tier: number }
  | { kind: 'family'; family: MonsterFamilyDef; members: MonsterTypeDef[] }

/** An actor placed on the level (ported from the modified Monster.java). */
export class Monster extends XMLObject {
  id: number

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: MonsterTypeDef,
    public tier: number
  ) {
    super()
    this.id = ctx.idCounter++
  }

  /**
   * The pool key this room's monsters come from. Returns the KEY rather than the
   * resolved type because a floor pool entry may pin a tier (`skeleton1#1`), and
   * the type alone cannot carry that. Exactly one `iRand` either way, so the
   * draw is unchanged from the type-only version.
   */
  static chooseMonsterForLevel(ctx: GenerationContext, level: number): string {
    const pool = ctx.params.levelMonsters[level]
    return pool[ctx.rand.iRand(0, pool.length)]
  }

  /**
   * Split a floor pool key into the type (which owns the `monsterMax` cap and
   * the tier-0 spawner) and the pinned tier, if any. `tier: undefined` means
   * roll the ladder — see createRolled.
   */
  static resolveFloorPoolEntry(key: string): HordeSource {
    // Strip the `#tier` suffix first: monsterTypeById keys off the bare id, so
    // handing it `skeleton1#1` would miss the map and fall back to bat1.
    const id = parseMonsterKey(key).id

    const family = monsterFamilyById(id)
    if (family) {
      const members = familyMembers(family)
      // A family whose members all went missing is a registry bug, not a
      // generation failure — fall through to the bat1 default rather than
      // handing the horde an empty list to draw from (invariant 4).
      if (members.length > 0) return { kind: 'family', family, members }
    }

    const type = monsterTypeById(id)
    const tier = floorPoolTier(key)
    return tier === undefined ? { kind: 'rolled', type } : { kind: 'pinned', type, tier }
  }

  /**
   * The `monsterMax` key a horde's size comes from: the family's own cap when
   * the pool named a family, the type's otherwise. A member's cap is NOT
   * consulted on the family path — one pooled entry, one cap.
   */
  static capId(source: HordeSource): string {
    return source.kind === 'family' ? source.family.id : source.type.id
  }

  /**
   * The type a lair's tier-0 "spawner" props are built from. A family draws a
   * member per prop, so a mixed lair's spawners are mixed too.
   *
   * (For the towers this path never runs — the Lair spawner count is
   * `iRand(0, trunc(cap / 20))`, which is 0 below a cap of 40. Storage rooms
   * reach it at any cap.)
   */
  static spawnerType(ctx: GenerationContext, source: HordeSource): MonsterTypeDef {
    if (source.kind !== 'family') return source.type
    return source.members[ctx.rand.iRand(0, source.members.length)]
  }

  /** Create with an explicit tier (0 = spawner variant for most types). */
  static create(ctx: GenerationContext, x: number, y: number, type: MonsterTypeDef, tier: number): Monster {
    const m = new Monster(ctx, x, y, type, tier)
    ctx.monsters.push(m)
    return m
  }

  /** Create rolling the tier upward with upgradeChance, like the Java overload. */
  static createRolled(ctx: GenerationContext, x: number, y: number, type: MonsterTypeDef): Monster {
    let tier = 1
    while (ctx.rand.fRand(0, 1) < type.upgradeChance && tier < type.tiers.length - 1) {
      tier++
    }
    // Clamped *after* the loop, never inside it: the draw count is unchanged, so
    // no existing seed moves. This only bites single-tier types, where the guard
    // fails immediately and tier stays 1 — those emitted tiers[1] === undefined
    // before, so there is no working output to preserve. (The Java original threw
    // ArrayIndexOutOfBounds here.)
    const m = new Monster(ctx, x, y, type, Math.min(tier, type.tiers.length - 1))
    ctx.monsters.push(m)
    return m
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', this.type.tiers[this.tier]))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    return dict.getXML()
  }
}
