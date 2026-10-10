// Boss actors: collision shapes (→ footprint), static flag, movement class,
// bestiary name (the boss bar title). Feeds src/generator/boss/bosses.ts.
import { findAeAssets, preprocess } from '../lib/aeunit.mjs'
const { assets } = findAeAssets()
const BOSSES = {
  boss_anubis: 'actors/bosses/boss_anubis/boss_anubis.unit',
  boss_dragon: 'actors/bosses/boss_dragon/boss_dragon.unit',
  boss_dragon_hwr: 'actors/bosses/boss_dragon_hwr/dragon.unit',
  boss_eye: 'actors/bosses/boss_eye/eye.unit',
  boss_golem: 'actors/bosses/boss_golem/golem_rock.unit',
  boss_knight: 'actors/bosses/boss_knight/boss_knight.unit',
  boss_krilith: 'actors/bosses/boss_krilith/boss_krilith.unit',
  boss_lich: 'actors/bosses/boss_lich/boss_lich.unit',
  boss_queen: 'actors/bosses/boss_queen/boss_queen.unit',
  boss_seeress: 'actors/beasts/bats/bat_mb_boss.unit',
  boss_vampire: 'actors/bosses/boss_vampire/vampire.unit',
  boss_warden: 'actors/bosses/boss_warden/warden.unit',
  boss_worm: 'actors/bosses/boss_worm/boss_worm.unit',
  boss_wraith: 'actors/bosses/boss_wraith/wraith_mage.unit'
}
for (const [id, path] of Object.entries(BOSSES)) {
  const x = preprocess(assets, path)
  const cls = /<behavior class="([^"]+)"/.exec(x)?.[1]
  const hp = /<int name="hp">(\d+)/.exec(x)?.[1]
  const name = /beastiary-name">([^<]+)/.exec(x)?.[1]
  const mv = /<dict name="movement">\s*<string name="class">([^<]+)/.exec(x)?.[1] ?? '-'
  const col = /<collision([^>]*)>([\s\S]*?)<\/collision>/.exec(x)
  let shape = '-'
  if (col) {
    const c = /<circle([^>]*)\/?>/.exec(col[2])
    const pts = [...col[2].matchAll(/<point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/point>|<rect>\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/g)]
    if (c) shape = `circle${c[1].replace(/\s+/g, ' ')}`
    else if (pts.length) shape = `poly/rect ${pts.length}pts ${pts.slice(0, 4).map((p) => p.slice(1).filter(Boolean).join(',')).join(' ')}`
    shape += ` static=${/static="true"/.test(col[1])}`
  }
  const actorTag = /<unit[^>]*collision="([\d.]+)"/.exec(x)?.[1]
  console.log([id, cls, hp, name, mv, shape, actorTag ?? ''].join(' | '))
}
