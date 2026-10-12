import { Rand } from './rand'
import type { DungeonParameters } from '../config/parameters'
import type { Monster } from '../objects/monster'
import type { Item } from '../objects/item'
import type { Doodad } from '../objects/doodad'
import type { ScriptNode, SensorShape } from '../objects/scriptNode'
import type { ObjectSet } from '../objects/objectSet'
import type { Gateway } from '../campaign'

/**
 * Per-generation state. The original Java kept all of this in static fields
 * (Monster.monsters, Level.idCounter, Room.lastLockType, …) cleared between
 * levels; here it lives in one object threaded through the pipeline so
 * nothing is global and generations are isolated and reproducible.
 */
export class GenerationContext {
  readonly params: DungeonParameters
  /** drives the layout — matches the original tool's seeded java.util.Random */
  readonly rand: Rand
  /**
   * drives only the cosmetic floor-tile variants. The original used an
   * unseeded Math.random() for those; a second seeded stream keeps our
   * output fully deterministic without disturbing the layout stream.
   */
  readonly cosmeticRand: Rand
  /**
   * drives the boss arena (cover placement, wave rolls, …). A third stream —
   * not `rand`, not `cosmeticRand` — because the arena is generated after the
   * dungeon floors but has no Java original to stay parallel with: it is free
   * to draw as much randomness as it wants without perturbing the layout
   * stream (`rand`) or the cosmetic stream (`cosmeticRand`). Drawing arena
   * randomness from either of those would shift every existing seed's
   * dungeon the moment the boss feature is enabled.
   */
  readonly bossRand: Rand
  /**
   * drives the optional per-floor traps (`traps/floor.ts`). A fourth stream,
   * for the same reason `bossRand` is a third: floor traps are placed onto a
   * finished floor and must not move it. Drawing them from `rand` would work —
   * the rig runs after every layout draw — but only until the NEXT floor,
   * whose whole layout would shift the moment any earlier floor were trapped.
   * A stream of its own makes the feature purely additive: arming traps
   * anywhere leaves every floor's rooms, walls, doodads, actors, items and
   * pre-existing ids byte-identical, on every existing seed.
   *
   * That is only safe because a trap is a script node, which carries no
   * collision: it cannot seal a route, so a floor `map/reachability.ts` has
   * already accepted stays valid however it is trapped. The one thing this
   * stream does carry between floors is its own draws — arming floor 0 moves
   * floor 1's TRAP POSITIONS, and nothing else about floor 1.
   */
  readonly trapRand: Rand

  /**
   * drives the optional per-floor BOSS (`dungeonBoss/`, issue #61) — where its
   * wave monsters land and where its per-tier spewers stand. A fifth stream,
   * for the same reason `trapRand` is a fourth: the rig is a post-pass onto a
   * finished floor, and giving it a stream of its own is what stops arming a
   * boss from moving an armed floor's TRAP positions or any arena's layout.
   *
   * Note the one thing this does NOT protect, because it cannot: a boss floor
   * takes a different branch of `map/level.ts` (a sealed portal room instead
   * of a stairs room), and that branch is chosen during construction, off
   * `rand`. So enabling a boss does move that floor's layout and every floor
   * after it. This stream keeps everything that happens AFTER acceptance from
   * adding to that.
   */
  readonly floorBossRand: Rand

  /**
   * drives the optional per-floor MYSTERY BUTTONS (`mystery/`, issue #67) —
   * which tile each plate lands on, which pool button it becomes, and where
   * the spewers a trap button arms stand. A sixth stream, for the same reason
   * `trapRand` is a fourth: the rig is a post-pass onto a finished, accepted
   * floor, and a stream of its own is what keeps arming buttons from moving
   * any floor's dungeon, any floor's always-on traps, or any floor boss.
   * Arming floor 0 moves floor 1's BUTTON positions and nothing else.
   */
  readonly mysteryRand: Rand

  currentLevel = 0
  /**
   * The single per-level id counter units and scripts share (AE resolves script
   * arrays against both). Starts at 1: AE's own levels never use id 0.
   */
  idCounter = 1

  /**
   * The scenario id — the folder name and the `levels/<id>/` namespace every
   * level path in this campaign lives under (level paths are global across all
   * scenarios and the base game).
   */
  readonly scenarioId: string

  /**
   * The boss actors of the arena or floor whose rigs are being built — what
   * `NodeGlobalEventTrigger` turns "Boss 75%" / "Boss Died" into AE's
   * `ActorHealthTrigger` / `UnitDestroyedTrigger` over. Empty otherwise.
   */
  bossActors: Array<{ id: number }> = []

  /**
   * The stem of the level being built (`floor2`, `boss0`) — its file name and
   * the StartID its arrival LevelStart answers to. Set by the generator.
   */
  currentStem = ''
  /**
   * Each stem's play-order file name (`campaignFileNames`), set once before the
   * first level is built; a stem not in it keeps its own name.
   */
  levelFiles: ReadonlyMap<string, string> = new Map()

  /**
   * Whether the level being built is the campaign's first: it also gets the
   * default spawn (a LevelStart with no StartID), where a new game puts the
   * party. Without one AE spawns players at 0,0. Set by the generator.
   */
  isStartLevel = false

  /** The banner shown as the party arrives ("Floor 3"). Set by the generator. */
  currentBanner = ''

  /**
   * Whether an ACCEPTED floor of this run already carries a shop selling the
   * Warlock gargoyle (`def2`) — see `DungeonParameters.ensureGargoyleShop`.
   * Run-wide; committed by the generator only once a floor is accepted, from
   * `levelGargoyleShop`, so a discarded candidate floor never counts.
   */
  gargoyleShopPlaced = false
  /** The floor being built placed a `def2` shop (reset per candidate). */
  levelGargoyleShop = false

  /** The theme of the level being built — what door art and seal walls resolve against. */
  currentTheme = ''

  lastLockType = 0

  /**
   * How the floor currently being built leaves the campaign — set by the
   * generator before each `new Level()`.
   *
   * Which prefab a floor's way out gets, and where it points, is a property of
   * the campaign ORDER rather than of the floor's own index: with the order
   * rearranged, a mid-campaign floor can lead into a boss fight and the last
   * dungeon floor need not be the campaign's last level at all. So the decision
   * is made once, by the caller that knows the order, and read here by
   * `map/level.ts` and `map/room.ts`.
   *
   * Null while nothing is being built, and for the boss arena, which is not a
   * `Level` and carries its own exit target.
   */
  gateway: Gateway | null = null

  /**
   * How many bosses the floor currently being built hosts (issue #61; a count
   * rather than a flag since issue #64 part 1) — set by the generator before
   * each `new Level()`, exactly as `gateway` is, and for the same reason:
   * `map/level.ts` and `map/room.ts` read it while choosing the floor's way
   * out. 0 means no boss; every truthy check elsewhere in the port (`if
   * (ctx.floorBoss)`) still works unchanged against a positive count.
   *
   * A boss floor's exit is a sealed portal room rather than a stairs room, so
   * this has to be known before the room is picked, not after.
   */
  floorBoss = 0

  /**
   * Whether the floor being built has its exit room locked behind a button
   * (issue #69, `DungeonParameters.levelLock`). Set before each `new Level()`
   * alongside `floorBoss`, for the same reason: a locked floor's way out is a
   * sealed portal room, never stairs, and that is decided during construction.
   */
  floorLocked = false

  /**
   * How many buttons that lock needs (issue #69 part 2) — 0 when the floor
   * is not locked. Set alongside `floorLocked`.
   */
  floorLockButtons = 0

  /**
   * Whether this floor's lock buttons are disguised as mystery plates
   * (enhanced lock buttons, per-floor `disguise` tickbox) — `TriggerButton`
   * art driven to `pressed` instead of `BossDoorButton`/`activate`. Set
   * alongside `floorLockButtons`; construction-time only, and read straight
   * off this field rather than re-deriving it, exactly like `floorLocked`.
   */
  floorLockDisguise = false

  monsters: Monster[] = []
  items: Item[] = []
  doodads: Doodad[] = []
  scriptNodes: ScriptNode[] = []
  /** trigger areas (AE :Physics_Rectangle / :Physics_Circle units) */
  sensors: SensorShape[] = []
  /** plain units nothing references (lobby diamonds, upgrade pickups); ids assigned at emit */
  extraUnits: Array<{ path: string; x: number; y: number }> = []
  objectSets: ObjectSet[] = []
  /**
   * Extra tiles the player must be able to walk to for this floor to be
   * finishable, on top of the exit/orb/keys `reachability.ts` always checks.
   *
   * Currently only the final floor's orb button uses it: the button is the
   * only way past the wall sealing the orb room, so a button the player cannot
   * reach is exactly as fatal as an unreachable key. Empty on every other
   * floor, which is why adding it changed no existing seed.
   */
  reachTargets: Array<{ x: number; y: number }> = []

  constructor(params: DungeonParameters, seed: number, scenarioId = `dungeon_${seed}`) {
    this.params = params
    this.scenarioId = scenarioId
    this.rand = new Rand(seed)
    this.cosmeticRand = new Rand(seed + 1)
    this.bossRand = new Rand(seed + 2)
    this.trapRand = new Rand(seed + 3)
    this.floorBossRand = new Rand(seed + 4)
    this.mysteryRand = new Rand(seed + 5)
  }

  /**
   * Scenario-relative path of the level a slot stem (`floor2`, `boss0`,
   * `lobby1`) is written to: its play-order file (`03_floor3.lvl`), or the stem
   * itself when the campaign hasn't named it.
   */
  levelPath(stem: string): string {
    return `levels/${this.scenarioId}/${this.levelFiles.get(stem) ?? stem}.lvl`
  }

  /** Equivalent of the Clear() calls between levels in HammerwatchGen.main */
  clearLevel(): void {
    this.monsters = []
    this.items = []
    this.doodads = []
    this.scriptNodes = []
    this.sensors = []
    this.extraUnits = []
    this.objectSets = []
    this.reachTargets = []
    this.bossActors = []
    this.levelGargoyleShop = false
    this.idCounter = 1
  }
}
