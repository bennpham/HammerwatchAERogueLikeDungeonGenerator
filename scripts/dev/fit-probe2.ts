import { arenaBossLayout } from '../../src/generator/boss/geometry'
import { anchors as computeAnchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from '../../src/generator/boss/anchors'
import { BOSS_DEF_LIST, topWallBossClearance, topWallBossY, type BossDef } from '../../src/generator/boss/bosses'
const W = 64, H = 64
const fits = (combo: BossDef[]) => {
  const entrance = { x: Math.trunc(W / 2) - Math.trunc(ENTRANCE_WIDTH / 2), y: H - ENTRANCE_DEPTH, width: ENTRANCE_WIDTH, height: ENTRANCE_DEPTH }
  const topWall = combo.find((d) => d.placement === 'topWall')
  const centre = combo.filter((d) => d.placement !== 'topWall')
  const primary = centre.find((d) => d.id === 'boss_queen') ?? centre[0]
  const anchors = computeAnchors(W, H, { ...(topWall ? { northClearance: topWallBossClearance(topWall, topWallBossY(topWall)) } : {}), ...(primary ? { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } } : {}) })
  return arenaBossLayout(W, H, entrance, anchors, combo) !== null
}
for (const a of BOSS_DEF_LIST) for (const b of BOSS_DEF_LIST) {
  if (a.unique && a === b) continue
  if (a.placement === 'topWall' && b.placement === 'topWall') continue
  if (!fits([a, b])) console.log('pair fails', a.id, b.id)
}
for (const size of [52, 64]) {
  let fails = 0
  const combo: BossDef[] = []
  const rec = (): void => {
    if (combo.length === 5) {
      if (!fitsAt(size, combo)) { if (fails++ < 3) console.log(size, 'fails', combo.map((d) => d.id).join(',')) }
      return
    }
    for (const d of BOSS_DEF_LIST) {
      if (d.unique && combo.includes(d)) continue
      if (d.placement === 'topWall' && combo.some((x) => x.placement === 'topWall')) continue
      combo.push(d); rec(); combo.pop()
    }
  }
  rec()
  console.log(size, 'total fails', fails)
}
function fitsAt(S: number, combo: BossDef[]) {
  const entrance = { x: Math.trunc(S / 2) - Math.trunc(ENTRANCE_WIDTH / 2), y: S - ENTRANCE_DEPTH, width: ENTRANCE_WIDTH, height: ENTRANCE_DEPTH }
  const topWall = combo.find((d) => d.placement === 'topWall')
  const centre = combo.filter((d) => d.placement !== 'topWall')
  const primary = centre.find((d) => d.id === 'boss_queen') ?? centre[0]
  const anchors = computeAnchors(S, S, { ...(topWall ? { northClearance: topWallBossClearance(topWall, topWallBossY(topWall)) } : {}), ...(primary ? { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } } : {}) })
  return arenaBossLayout(S, S, entrance, anchors, combo) !== null
}
