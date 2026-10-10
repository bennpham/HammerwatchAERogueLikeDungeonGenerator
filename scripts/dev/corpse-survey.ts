// For every tower/spawner in the roster: which corpse unit it leaves and
// whether that corpse has collision. Feeds objects/actorCollision.ts.
import { MONSTER_TYPES } from '../../src/generator/objects/monsterTypes'
// @ts-expect-error untyped dev helper
import { findAeAssets, preprocess } from '../lib/aeunit.mjs'
const { assets } = findAeAssets()
const paths = [...new Set(MONSTER_TYPES.flatMap((m) => m.tiers))].sort()
for (const p of paths) {
  const x: string = preprocess(assets, p)
  const corpse = /(actors\/[^<"]+_razed\.unit)/.exec(x)?.[1]
  if (corpse === undefined) continue
  const raw: string = preprocess(assets, corpse)
  const blocking = /<collision[^>]*>[\s\S]*?<(circle|rect|polygon)/.test(raw)
  console.log(`${p}\t${corpse}\t${blocking ? 'blocking' : 'passable'}`)
}
