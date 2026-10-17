/**
 * The Anniversary Edition WorldScript vocabulary the generator uses.
 *
 * Every class names a real AE WorldScript (`<assets>/scripts/WorldScript/**`)
 * and writes the param names stock levels use — surveyed across Castle
 * Hammerwatch, Shaftlocke Tower and Temple of the Sun with
 * `scripts/dev/script-shapes.ts` (DISCOVERY-LOG "Scripts"). Enum values are
 * from the `.as` sources.
 *
 * Several classes keep their HW1-era names so the rigs that build them read
 * the same (`NodeToggleElement`, `NodeGlobalEventTrigger`, `NodeSpawnObject`);
 * the comment on each says which AE script it really is.
 */
import { P } from '../ae/model'
import type { Param } from '../ae/model'
import { ScriptNode, SensorShape } from './scriptNode'
import type { GenerationContext } from '../core/context'
import { SPREAD_DEGREES_PER_UNIT } from '../traps/slots'

export { SensorShape }

type HasId = { id: number }
const ids = (xs: readonly HasId[]) => xs.map((x) => x.id)

// --- Enums ([VERIFIED] from the WorldScript .as sources) ----------------------

/** `ToggleScripts.State`, `ToggleImmortality.State`: 1 Enable, 2 Disable, 3 Toggle */
export const TOGGLE_ENABLE = 1
export const TOGGLE_DISABLE = 2
export const TOGGLE_TOGGLE = 3

/** `AreaTrigger.Event` */
export const AREA_ON_ENTER = 1
export const AREA_ON_EXIT = 2

/** `AreaTrigger.Filter` / `DangerArea.Filter` flags */
export const FILTER_NEUTRAL = 1
export const FILTER_PLAYER = 2
export const FILTER_ENEMY = 4

/** `ChangeVariables.Function` */
export const CHANGE_VAR_SET = 1
export const CHANGE_VAR_ADD = 2
export const CHANGE_VAR_SUB = 3

/** `CheckVariables.Function` */
export const CHECK_VAR_EQUAL = 1
export const CHECK_VAR_GREATER_EQUAL = 4

/** `ActorHealthTrigger.Function` (FloatCompareFunc): 1 Greater, 2 Less */
export const HEALTH_LESS = 2

/** `UseTrigger.Icon` (UsableIcon in scripts/Behaviors/IUsable.as) */
export const ICON_SHOP = 4
export const ICON_EXIT = 6
export const ICON_BUTTON = 11

/** `ShopArea.Type`: 0 skills, 1 power, 2 equipment */
export const SHOP_SKILLS = 0
export const SHOP_POWER = 1
/** the item shop (category `item`), as the user's AE lobby wires it */
export const SHOP_ITEMS = 2

// --- Triggers ------------------------------------------------------------------

/** `AreaTrigger` — fires when a filtered unit enters (or leaves) its areas. */
export class NodeAreaTrigger extends ScriptNode {
  areas: SensorShape[] = []
  event = AREA_ON_ENTER
  filter = FILTER_PLAYER

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AreaTrigger')
  }

  connectToShape(s: SensorShape): void {
    this.areas.push(s)
  }

  params(): Param[] {
    const out = [P.ids('Areas', ids(this.areas))]
    if (this.event !== AREA_ON_ENTER) out.push(P.int('Event', this.event))
    if (this.filter !== FILTER_PLAYER) out.push(P.int('Filter', this.filter))
    return out
  }
}

/**
 * `UseTrigger` — fires when a player presses the use key (F) inside its areas.
 * Outputs `User`, which `ShopArea.#PlayerTarget` reads.
 */
export class NodeUseTrigger extends ScriptNode {
  areas: SensorShape[] = []

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public icon: number
  ) {
    super(ctx, x, y, 'UseTrigger')
  }

  connectToShape(s: SensorShape): void {
    this.areas.push(s)
  }

  params(): Param[] {
    return [P.int('Icon', this.icon), P.ids('Areas', ids(this.areas))]
  }
}

/**
 * `AllPlayersArea` — a conditional: runs `OnTrue` when every player is inside
 * its area, `OnFalse` otherwise. Has no connections of its own; `connectTo`
 * appends to `OnTrue`.
 */
export class NodeAllPlayersArea extends ScriptNode {
  area: SensorShape[] = []
  onTrue: ScriptNode[] = []
  onFalse: ScriptNode[] = []
  onlyAlivePlayers = false

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AllPlayersArea')
  }

  connectTo(n: ScriptNode): void {
    this.onTrue.push(n)
  }

  params(): Param[] {
    return [
      P.bool('OnlyAlivePlayers', this.onlyAlivePlayers),
      P.ids('OnTrue', ids(this.onTrue)),
      P.ids('OnFalse', ids(this.onFalse)),
      P.ids('Area', ids(this.area))
    ]
  }
}

/**
 * HW1's `GlobalEventTrigger`, translated — AE has no engine-wide boss events:
 *
 * - `LevelLoaded` → a `ScriptLink` that executes on level start, once;
 * - `Boss 75%` / `Boss 50%` / `Boss 25%` → `ActorHealthTrigger` (health LESS
 *   than the fraction) over the boss actors, once;
 * - `Boss Died` → `UnitDestroyedTrigger` over the boss actors, once.
 *
 * The boss actors are `ctx.bossActors` at construction, which the arena and
 * the dungeon-boss rig set before building their tier rigs.
 */
export class NodeGlobalEventTrigger extends ScriptNode {
  private units: HasId[]
  private fraction = 0

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public eventName: string
  ) {
    const m = /^Boss (\d+)%$/.exec(eventName)
    super(ctx, x, y, eventName === 'LevelLoaded' ? 'ScriptLink' : m !== null ? 'ActorHealthTrigger' : 'UnitDestroyedTrigger')
    this.units = [...ctx.bossActors]
    if (eventName === 'LevelLoaded') this.executeOnStart = true
    if (m !== null) this.fraction = Number(m[1]) / 100
    this.triggerTimes = 1
  }

  params(): Param[] {
    if (this.cls === 'ScriptLink') return []
    if (this.cls === 'ActorHealthTrigger') {
      return [P.ids('Units', ids(this.units)), P.int('Function', HEALTH_LESS), P.float('Value', this.fraction)]
    }
    return [P.ids('Units', ids(this.units))]
  }
}

/** `UnitDestroyedTrigger` — fires when any listed unit dies or is destroyed (HW1 ObjectEventTrigger). */
export class NodeObjectEventTrigger extends ScriptNode {
  private units: HasId[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'UnitDestroyedTrigger')
  }

  connectItem(i: HasId): void {
    this.units.push(i)
  }

  connectObject(o: HasId): void {
    this.units.push(o)
  }

  params(): Param[] {
    return [P.ids('Units', ids(this.units))]
  }
}

/** `UnitPickedUpTrigger` — fires when a listed pickup is collected. */
export class NodeUnitPickedUpTrigger extends ScriptNode {
  units: HasId[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'UnitPickedUpTrigger')
  }

  params(): Param[] {
    return [P.ids('Units', ids(this.units))]
  }
}

/** `TimerTrigger` — fires every `intervalMs`. Ships disabled; a ToggleScripts enables it. */
export class NodeTimerTrigger extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public intervalMs: number
  ) {
    super(ctx, x, y, 'TimerTrigger')
    this.enabled = false
  }

  params(): Param[] {
    return [P.int('Frequency', this.intervalMs)]
  }
}

/** `ScriptLink` — a relay with no params; fires its connections. */
export class NodeScriptLink extends ScriptNode {
  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ScriptLink')
  }
}

// --- Script control -------------------------------------------------------------

/** What a `ToggleScripts` does to its targets. */
export type ToggleAction = 'enable' | 'disable' | 'toggle'

const TOGGLE_STATE: Record<ToggleAction, number> = {
  enable: TOGGLE_ENABLE,
  disable: TOGGLE_DISABLE,
  toggle: TOGGLE_TOGGLE
}

/**
 * `ToggleScripts` (HW1 ToggleElement). Defaults to disabling its targets, as
 * HW1's did. A named action rather than the raw `State` int: HW1 used 0 for
 * enable and 1 for disable, AE uses 1 and 2, and a number copied across from
 * the old rigs would silently invert them.
 */
export class NodeToggleElement extends ScriptNode {
  action: ToggleAction = 'disable'
  elements: ScriptNode[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ToggleScripts')
  }

  connectToElement(n: ScriptNode): void {
    this.elements.push(n)
  }

  params(): Param[] {
    return [P.ids('Scripts', ids(this.elements)), P.int('State', TOGGLE_STATE[this.action])]
  }
}

/** `ToggleImmortality` — `immortal` true makes the actors unkillable. */
export class NodeToggleImmortality extends ScriptNode {
  immortal = true
  actors: HasId[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ToggleImmortality')
  }

  setTarget(actor: HasId | number): void {
    this.actors.push(typeof actor === 'number' ? { id: actor } : actor)
  }

  params(): Param[] {
    return [P.ids('Units', ids(this.actors)), P.int('State', this.immortal ? TOGGLE_ENABLE : TOGGLE_DISABLE)]
  }
}

/** `SetUnitScene` (HW1 ChangeDoodadState) — switches units to a named scene. */
export class NodeChangeDoodadState extends ScriptNode {
  units: HasId[] = []

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public state: string
  ) {
    super(ctx, x, y, 'SetUnitScene')
  }

  setTarget(u: HasId): void {
    this.units.push(u)
  }

  params(): Param[] {
    return [P.ids('Units', ids(this.units)), P.str('State', this.state)]
  }
}

// --- Variables -----------------------------------------------------------------

/** `Variable` — an integer that persists with the level save. */
export class NodeVariable extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public initial: number
  ) {
    super(ctx, x, y, 'Variable')
  }

  params(): Param[] {
    return [P.int('Value', this.initial)]
  }
}

/** `ChangeVariables` — applies `func` (CHANGE_VAR_*) with `value`. */
export class NodeChangeVariable extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public variable: NodeVariable,
    public func: number,
    public value: number
  ) {
    super(ctx, x, y, 'ChangeVariables')
  }

  params(): Param[] {
    return [P.int('Function', this.func), P.ids('Variables', [this.variable.id]), P.int('Value', this.value)]
  }
}

/**
 * `CheckVariables` — compares and runs `OnTrue` / `OnFalse`. Equality by
 * default. `connectTo` appends to `OnTrue` (the array is taken by reference so
 * several checks can share one list). No per-target delay exists.
 */
export class NodeCheckVariable extends ScriptNode {
  func = CHECK_VAR_EQUAL
  onFalse: ScriptNode[] = []

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public variable: NodeVariable,
    public cmpVal: number,
    public onTrue: ScriptNode[] = []
  ) {
    super(ctx, x, y, 'CheckVariables')
  }

  connectTo(n: ScriptNode, delayMs = 0): void {
    if (delayMs !== 0) throw new Error('CheckVariables OnTrue targets cannot carry a delay')
    this.onTrue.push(n)
  }

  params(): Param[] {
    const out = [P.ids('Variable', [this.variable.id]), P.int('Value', this.cmpVal), P.ids('OnTrue', ids(this.onTrue))]
    if (this.func !== CHECK_VAR_EQUAL) out.unshift(P.int('Function', this.func))
    if (this.onFalse.length > 0) out.push(P.ids('OnFalse', ids(this.onFalse)))
    return out
  }
}

// --- Players, levels, campaign -----------------------------------------------------

/** `LevelStart` — where players arrive; no StartID marks the default spawn. */
export class NodeLevelStart extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public startId?: string
  ) {
    super(ctx, x, y, 'LevelStart')
    this.label = startId ?? 'default spawn'
  }

  params(): Param[] {
    return this.startId === undefined ? [] : [P.str('StartID', this.startId)]
  }
}

/** `LevelExit` — sends the party to `level` (scenario-relative .lvl path) at `startId`. */
export class NodeLevelExit extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public level: string,
    public startId: string
  ) {
    super(ctx, x, y, 'LevelExit')
    this.label = startId
  }

  params(): Param[] {
    return [P.str('Level', this.level), P.str('StartID', this.startId)]
  }
}

/** `SetRespawnPoint` — where dead players come back (a LevelStart's StartID). */
export class NodeSetRespawnPoint extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public spawnId: string
  ) {
    super(ctx, x, y, 'SetRespawnPoint')
    this.label = spawnId
  }

  params(): Param[] {
    return [P.str('SpawnId', this.spawnId)]
  }
}

/** `AnnounceText` — on-screen text; `Text` is a string or a `.lang.key`. */
/**
 * AE has no text types: it styles an announcement by `Style`
 * (gui/variable/announce/announcestyles.sval), and a `replace` style wipes
 * whatever is showing in the same style. Countdowns tick on the default
 * `hint_announce` once a second, so anything else left there vanished within
 * a second on a timed floor (the seal's "final room" line, 2026-10-10). Each
 * of HW1's slots gets its own AE style instead:
 *   0 Title, 1 Subtitle → `region_enter` (top centre, AE's area banner)
 *   2 Regular           → `hint_announce` (default; the countdown line)
 *   3 Pickup            → `info_event` (top right, queued)
 */
export const ANNOUNCE_STYLE_BY_TYPE: Readonly<Record<number, string | undefined>> = {
  0: 'region_enter',
  1: 'region_enter',
  2: undefined,
  3: 'info_event'
}

export class NodeAnnounceText extends ScriptNode {
  text = ''
  title?: string
  /** how long the text stays up, ms (AE `TimeOverride`); undefined = the style's default */
  time?: number
  /** HW1's text slot, written as an AE `Style` through `ANNOUNCE_STYLE_BY_TYPE` */
  textType = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AnnounceText')
  }

  setText(text: string): void {
    this.text = text
  }

  params(): Param[] {
    const out = [P.str('Text', this.text)]
    if (this.title !== undefined) out.unshift(P.str('Title', this.title))
    const style = ANNOUNCE_STYLE_BY_TYPE[this.textType]
    if (style !== undefined) out.push(P.str('Style', style))
    if (this.time !== undefined) out.push(P.int('TimeOverride', this.time))
    return out
  }
}

/**
 * `ShowGameOver` — ends the run (HW1 GameEnd). With no slideshow `Filename`
 * it pauses, fades out and stops the scenario. [VERIFIED] in game
 * (checklist #22).
 */
export class NodeGameEnd extends ScriptNode {
  showCredits = false

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ShowGameOver')
  }

  params(): Param[] {
    return [P.bool('ShowCredits', this.showCredits)]
  }
}

/**
 * `ShopArea` — opens a shop for the player `#PlayerTarget` names (a
 * UseTrigger's `User`). `categories` are space-separated shop categories
 * (`off1 def2 misc3 combo1`, `power`); `type` 0 skills / 1 power.
 */
export class NodeShopArea extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public use: NodeUseTrigger,
    public categories: string,
    public type = SHOP_SKILLS
  ) {
    super(ctx, x, y, 'ShopArea')
  }

  params(): Param[] {
    const out = [P.target('#PlayerTarget', this.use.id, 'User'), P.str('Categories', this.categories)]
    if (this.type !== SHOP_SKILLS) out.push(P.int('Type', this.type))
    return out
  }
}

/** `DoorController` — opens `doors` when a player carrying `collectable` uses them. */
export class NodeDoorController extends ScriptNode {
  doors: HasId[] = []

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public collectable: string
  ) {
    super(ctx, x, y, 'DoorController')
  }

  params(): Param[] {
    return [P.str('Collectable', this.collectable), P.ids('Doors', ids(this.doors))]
  }
}

/** `CreateBossBar` — shows a health bar over the actors. */
export class NodeCreateBossBar extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public actors: HasId[],
    public name: string
  ) {
    super(ctx, x, y, 'CreateBossBar')
  }

  params(): Param[] {
    return [P.ids('Actors', ids(this.actors)), P.str('Name', this.name)]
  }
}

// --- Units -------------------------------------------------------------------------

/** `SpawnUnit` (HW1 SpawnObject) — spawns `unitPath` where the script stands. */
export class NodeSpawnObject extends ScriptNode {
  aggro = true

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public actorPath: string
  ) {
    super(ctx, x, y, 'SpawnUnit')
  }

  params(): Param[] {
    const out = [P.str('UnitType', this.actorPath)]
    if (this.aggro && this.actorPath.startsWith('actors/')) out.push(P.bool('AggroEnemy', true))
    return out
  }
}

/**
 * `SpawnEquipment` — drops one equipment pickup where the script stands
 * (scripts/WorldScript/SpawnEquipment.as). With `ID` set it is that item;
 * otherwise a random item of `Quality` (equipment.ts ITEM_QUALITY), which skips shop-blocked items, so a
 * specific unique must be named by id. Serialised like the stock
 * prefabs/puzzles/bullsandcows.pfb. [EMITTED]
 */
export class NodeSpawnEquipment extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public item: { id: string } | { quality: number }
  ) {
    super(ctx, x, y, 'SpawnEquipment')
  }

  params(): Param[] {
    return 'id' in this.item ? [P.str('ID', this.item.id)] : [P.int('Quality', this.item.quality)]
  }
}

/** `DestroyUnits` (HW1 DestroyObject) — removes units (seal walls, props). */
export class NodeDestroyObject extends ScriptNode {
  targets: HasId[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'DestroyUnits')
  }

  connectDoodad(d: HasId): void {
    this.targets.push(d)
  }

  params(): Param[] {
    return [P.ids('Units', ids(this.targets))]
  }
}

/** `DangerArea` — damage (or a buff) every `freqMs` to filtered units in its areas. Ships disabled. */
export class NodeDangerArea extends ScriptNode {
  damage = 1
  freqMs = 1000
  /** `actors/buffs.sval:<name>` or '' for pure damage */
  buff = ''
  filter = FILTER_PLAYER
  areas: SensorShape[] = []
  canKill = true

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'DangerArea')
    this.enabled = false
  }

  connectToShape(s: SensorShape): void {
    this.areas.push(s)
  }

  params(): Param[] {
    const filter = this.areas.find((a) => a.types !== undefined)?.types ?? this.filter
    const out = [
      P.ids('Areas', ids(this.areas)),
      P.int('Damage', this.damage),
      P.int('Frequency', this.freqMs),
      P.int('Filter', filter)
    ]
    if (this.buff !== '') out.push(P.str('Buff', this.buff))
    if (!this.canKill) out.push(P.bool('CanKill', false))
    return out
  }
}

/**
 * `ProjectileSpewer` — fires `projectile` (a unit path) every `frequencyMs`
 * from where it stands, toward `directionDeg` (0 east, 90 south, 180 west,
 * 270 north — screen y points down) within a fan of `spread` units (the trap
 * parameter, 0..2; SPREAD_DEGREES_PER_UNIT degrees each). Ships disabled.
 */
export class NodeProjectileSpewer extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public projectilePath: string,
    public directionDeg: number,
    public spread: number,
    public frequencyMs: number
  ) {
    super(ctx, x, y, 'ProjectileSpewer')
    this.enabled = false
  }

  params(): Param[] {
    return [
      P.str('Projectile', this.projectilePath),
      P.int('Direction', Math.round(this.directionDeg)),
      P.float('Spread', this.spread * SPREAD_DEGREES_PER_UNIT),
      P.int('Frequency', this.frequencyMs)
    ]
  }
}

// --- Sound -------------------------------------------------------------------------

/** `PlaySound` — an FMOD event (`event:/SFX/...`). */
export class NodePlaySound extends ScriptNode {
  looping = false

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public sound: string
  ) {
    super(ctx, x, y, 'PlaySound')
  }

  params(): Param[] {
    const out = [P.str('Sound', this.sound)]
    if (this.looping) out.push(P.bool('Looping', true))
    return out
  }
}

/** `PlayMusic` — switches the music mode (an int; see music/tracks.ts). */
export class NodePlayMusic extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public music: number
  ) {
    super(ctx, x, y, 'PlayMusic')
  }

  params(): Param[] {
    return [P.int('Music', this.music)]
  }
}

/** HW1's `RectangleShape` is an AE sensor unit; the old name keeps the rigs readable. */
export { SensorShape as NodeRectangleShape }
