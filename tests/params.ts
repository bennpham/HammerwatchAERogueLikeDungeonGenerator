import { defaultParameters, withGatewayLocks } from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import { MUSIC_DEFAULT } from '../src/generator/music/tracks'

/**
 * `defaultParameters()` with the escape floor taken back off: seven floors,
 * every timer off, no lobbies, and no stored campaign order.
 *
 * All three shipped presets now end on one extra dungeon floor played AFTER the
 * boss arena, on a 90-second hazard timer, and open on two stock lobbies
 * (`shippedOrder`). That is preset content rather than anything the feature
 * suites below are about, and the stored `levelOrder` it needs makes a bare
 * `params.levels = 3` invalid on its own — the order still names floor 8 and
 * both lobbies. So tests that want a neutral campaign to mutate start here:
 * no lobbies means the implicit default order (every floor, then every fight)
 * applies the moment `levelOrder` is gone, exactly as it did before lobbies
 * became campaign slots at all. Tests about what the app actually ships keep
 * using `defaultParameters()`.
 */
export function plainParameters(): DungeonParameters {
  const params = defaultParameters()
  const floors = 7
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelBuffs = params.levelBuffs?.slice(0, floors)
  params.levelTraps = params.levelTraps?.slice(0, floors)
  params.levelTimers = params.levelTimers?.slice(0, floors)
  // Reset rather than slice: unlike traps/timers, the default's own act1..act4
  // cues are real values at every one of these indices, so slicing alone would
  // leave a "neutral" campaign quietly carrying music.
  params.floorMusic = params.floorMusic && Array.from({ length: floors }, () => MUSIC_DEFAULT)
  // Same reasoning again: the stock castle boss's last two tiers now run a
  // shooter_arrow rig (070 parameter set), which would leave a "neutral"
  // arena quietly trapped and its arena.music also playing boss_final.
  params.boss = {
    ...params.boss,
    fights: params.boss.fights.map((f) => ({
      ...f,
      arena: {
        ...f.arena,
        music: undefined,
        waves: f.arena.waves.map((w) => {
          const next = { ...w }
          delete next.traps
          return next
        })
      }
    }))
  }
  params.lobbies = []
  delete params.levelOrder
  // The default's locks were derived for its own eight floors and shipped
  // order; re-derive them for this one — the last floor, which leads into the
  // arena, is the one the old campaign-wide lockFinalRoom sealed.
  return withGatewayLocks(params)
}
