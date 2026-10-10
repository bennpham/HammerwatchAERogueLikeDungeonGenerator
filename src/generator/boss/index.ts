/** Public surface of the boss arena module — see arena.ts for the assembler. */

export type { Anchor, AnchorId } from './anchors'
export { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH, NORTH_ANCHOR_INSET, anchors } from './anchors'

export type { AlcoveWall, BossDef, BossId } from './bosses'
export {
  BOSS_DEFS,
  BOSS_DEF_LIST,
  UNIQUE_BOSS_IDS,
  expandLineup,
  isMobileBoss,
  largestBossFootprintArea,
  pickBosses,
  topWallBossClearance,
  topWallBossY
} from './bosses'

export type { CoverArena, CoverBoss, CoverOptions, PlacedPillars, Rect } from './cover'
export { ANCHOR_PILLAR_CLEARANCE, isFree, placeCoverPillars } from './cover'

export { PLACEMENT_ATTEMPTS } from './placement'

export type { SpawnPoint, SpawnPointMap, SpawnPointOptions, SpawnRequest } from './spawnPoints'
export { placeSpawnPoints, spawnPointKey } from './spawnPoints'

export { ARENA_LAYOUT_SLOTS, ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, BOSS_LAYOUT_GAP, arenaBossLayout, coverPillarCount, freeFloorArea, pillarFootprint } from './geometry'
export type { BossPlacement } from './geometry'

export { buildWaveRig, scatterRequests } from './waves'

export { buildInvulnerabilityRig, formatCountdown } from './invulnerability'

export { buildCheckpointRig } from './checkpoints'

export { buildWaveBuffRig } from './waveBuffs'

export type { TrapArena } from './traps'
export { TRAP_MIN_SPACING, TRAP_WALL_MARGIN, buildTrapRig, wallCapacity } from './traps'

export type { BossArenaResult } from './arena'
export { buildBossArena } from './arena'
