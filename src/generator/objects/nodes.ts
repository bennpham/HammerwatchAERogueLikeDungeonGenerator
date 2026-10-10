import { XMLBool, XMLDictionary, XMLFloat, XMLInt, XMLIntArray, XMLString } from '../xml'
import { ScriptNode } from './scriptNode'
import type { Doodad, DoodadTypeName } from './doodad'
import type { GenerationContext } from '../core/context'
import type { Item } from './item'

/** Ported from NodeAreaTrigger.java */
export class NodeAreaTrigger extends ScriptNode {
  event = 0
  types = 1
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AreaTrigger')
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('event', this.event))
    d.addData(new XMLInt('types', this.types))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

/** Ported from NodeToggleElement.java */
export class NodeToggleElement extends ScriptNode {
  state = 1 // disable
  element = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ToggleElement')
  }

  connectToElement(n: ScriptNode): void {
    this.element = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('state', this.state))
    const eDict = new XMLDictionary('element')
    eDict.addData(new XMLIntArray('static', [this.element]))
    d.addData(eDict)
    return d
  }
}

/**
 * Makes an ACTOR immortal, or takes it back. Same `{state, element:{static:[id]}}`
 * parameter shape as NodeToggleElement, and the same polarity: `state: 0` turns
 * immortality ON, `state: 1` turns it off.
 *
 * `element` holds an **actor** id, not a script-node id — hence setTarget(id)
 * rather than a connectToElement(node). [VERIFIED] 2026-08-22 against the
 * shipped campaign/levels/level_boss_4.xml, where the pair points at the
 * dragon's actor id.
 */
export class NodeToggleImmortality extends ScriptNode {
  state = 0 // 0 = immortal
  element = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ToggleImmortality')
  }

  setTarget(actorId: number): void {
    this.element = actorId
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('state', this.state))
    const eDict = new XMLDictionary('element')
    eDict.addData(new XMLIntArray('static', [this.element]))
    d.addData(eDict)
    return d
  }
}

/**
 * Switches a doodad to one of the named states its asset declares.
 *
 * `object` holds a **doodad** id, not a script-node id — hence `setTarget(d)`
 * rather than a connectTo(node), the same distinction `NodeToggleImmortality`
 * above draws for actor ids. [VERIFIED] 2026-08-24 against the shipped
 * campaign/levels/level_1.xml node 2180, which drives a floor button this way.
 *
 * The state names come from the target asset's `<sprite name="...">` entries and
 * its `<states>` block, so they are per-doodad strings, not an enum.
 */
export class NodeChangeDoodadState extends ScriptNode {
  target = 0

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public state: string
  ) {
    super(ctx, x, y, 'ChangeDoodadState')
  }

  setTarget(d: Doodad): void {
    this.target = d.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('state', this.state))
    const oDict = new XMLDictionary('object')
    oDict.addData(new XMLIntArray('static', [this.target]))
    d.addData(oDict)
    return d
  }
}

/** Ported from NodeAnnounceText.java */
export class NodeAnnounceText extends ScriptNode {
  text = 'You win!!!'
  time = 10000
  textType = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AnnounceText')
  }

  setText(text: string): void {
    this.text = text
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('text', this.text))
    d.addData(new XMLInt('time', this.time))
    d.addData(new XMLInt('type', this.textType))
    return d
  }
}

/** Ported from NodeLevelStart.java */
export class NodeLevelStart extends ScriptNode {
  pId = 0
  pDir = 2

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'LevelStart')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('id', this.pId))
    d.addData(new XMLInt('dir', this.pDir))
    return d
  }
}

/**
 * Ported from NodeLevelExit.java — points at the next level's index.
 *
 * `level` defaults to the next numeric floor, matching the original, but also
 * accepts the string ids the boss feature's extra levels use (`bossprep`,
 * `boss`) — set it after construction, same shape as `NodeGlobalEventTrigger`'s
 * bare-string parameter.
 */
export class NodeLevelExit extends ScriptNode {
  level: number | string
  startId = 0
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'LevelExitArea')
    this.level = ctx.currentLevel + 1
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('level', `${this.level}`))
    d.addData(new XMLInt('start id', this.startId))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

interface ShopTypeDef {
  categories: string
  vendor: DoodadTypeName
}

const SHOP_TYPES: ShopTypeDef[] = [
  { categories: 'combo1 combo2 combo3 combo4 combo5', vendor: 'VendorCombo' },
  { categories: 'off1 off2 off3 off4 off5', vendor: 'VendorOffense' },
  { categories: 'def1 def2 def3 def4 def5', vendor: 'VendorDefense' },
  { categories: 'misc1 misc2 misc3 misc4 misc5', vendor: 'VendorMisc' }
]

/** Ported from NodeShopArea.java — picks a random shop category set. */
export class NodeShopArea extends ScriptNode {
  shopType: ShopTypeDef
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ShopArea')
    this.shopType = SHOP_TYPES[ctx.rand.iRand(0, SHOP_TYPES.length)]
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('cats', this.shopType.categories))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

/**
 * Ported from NodeObjectEventTrigger.java.
 *
 * Generalised (issue #64 part 1) to watch any object by raw id — an ACTOR's,
 * for the "all bosses died" rig (`boss/tierSource.ts`), [VERIFIED 2026-09-23]
 * to fire on a boss actor's death — not only an
 * `Item`. `itemConnections` and `connectItem` are unchanged so the orb's
 * existing wiring (`objects/objectSet.ts`) emits exactly what it always did;
 * `connectObject` is the same underlying array under a name that does not
 * imply "item".
 */
export class NodeObjectEventTrigger extends ScriptNode {
  event = 'Destroyed'
  itemConnections: Item[] = []
  private objectIds: number[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ObjectEventTrigger')
  }

  connectItem(i: Item): void {
    this.itemConnections.push(i)
  }

  /** Watches any object (an actor, a doodad, …) by its raw id. */
  connectObject(o: { id: number }): void {
    this.objectIds.push(o.id)
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('event', this.event))
    const objectDict = new XMLDictionary('object')
    objectDict.addData(new XMLIntArray('static', [...this.itemConnections.map((i) => i.id), ...this.objectIds]))
    d.addData(objectDict)
    return d
  }
}

/** Ported from NodeGameEnd.java */
export class NodeGameEnd extends ScriptNode {
  text = 'YOU WIN!!'

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'GameEnd')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('text', this.text))
    return d
  }
}

/** Ported from NodeRectangleShape.java */
export class NodeRectangleShape extends ScriptNode {
  width = 1.0
  height = 1.0
  types = 15

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'RectangleShape')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLFloat('w', this.width))
    d.addData(new XMLFloat('h', this.height))
    d.addData(new XMLInt('types', this.types))
    return d
  }
}

/** Spawns one actor per incoming trigger at its own position. */
export class NodeSpawnObject extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public actorPath: string
  ) {
    super(ctx, x, y, 'SpawnObject')
  }

  protected getParametersXML(): string {
    return new XMLString('parameters', this.actorPath).getXML()
  }
}

/**
 * Sets the party's respawn point and, when `saveGame` is true, writes a save.
 * `parameters` is a bare bool — not a dictionary — verified against shipped
 * campaign levels: `True` sets the spawn point AND saves; `False` sets the
 * spawn point only. [VERIFIED] see DISCOVERY-LOG.md.
 */
export class NodeCheckpoint extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public saveGame: boolean
  ) {
    super(ctx, x, y, 'Checkpoint')
  }

  protected getParametersXML(): string {
    return new XMLBool('parameters', this.saveGame).getXML()
  }
}

/** Listens for an engine-wide event, e.g. "Boss 50%" or "Boss Died". */
export class NodeGlobalEventTrigger extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public eventName: string
  ) {
    super(ctx, x, y, 'GlobalEventTrigger')
  }

  protected getParametersXML(): string {
    return new XMLString('parameters', this.eventName).getXML()
  }
}

/** Fires every `intervalMs`. Ships disabled; a ToggleElement{state:0} starts it. */
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

  protected getParametersXML(): string {
    return new XMLInt('parameters', this.intervalMs).getXML()
  }
}

/**
 * Destroys doodads by id. Note: the id array sits DIRECTLY under
 * `parameters`, with no `object`/`element` wrapper dict — unlike
 * ObjectEventTrigger and ToggleElement. [VERIFIED] 2026-08-10
 */
export class NodeDestroyObject extends ScriptNode {
  targets: Doodad[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'DestroyObject')
  }

  connectDoodad(d: Doodad): void {
    this.targets.push(d)
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    // zero targets must omit the <int-arr> entirely — LevelPacker.exe throws
    // on an empty one (same rule as the lobby's diamonds(), lobby/build.ts)
    if (this.targets.length > 0) {
      d.addData(new XMLIntArray('static', this.targets.map((t) => t.id)))
    }
    return d
  }
}

/**
 * Plays one sound cue. `sound` is a `sound/<bank>.xml:<cue>` pair, not a file
 * path — the bank XML names the cues.
 *
 * `play3d` false means the cue is heard at full volume anywhere on the floor,
 * which is what a "something just opened elsewhere" cue wants; `range3d` is
 * then unused but still written, matching what the game's editor emits.
 * [EMITTED] 2026-08-24 — parameter shape copied from an editor-saved level.
 */
export class NodePlaySound extends ScriptNode {
  loop = false
  play3d = false
  range3d = 5

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public sound: string
  ) {
    super(ctx, x, y, 'PlaySound')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('sound', this.sound))
    d.addData(new XMLBool('loop', this.loop))
    d.addData(new XMLBool('play3d', this.play3d))
    d.addData(new XMLFloat('range3d', this.range3d))
    return d
  }
}

/**
 * Swaps the level's music track. `sound` is a `sound/<bank>.xml:<cue>` pair,
 * same dialect as `NodePlaySound.sound` — e.g. `sound/music.xml:act2`.
 *
 * Unlike `NodePlaySound` this carries no `play3d`/`range3d` — music is not
 * positional. [EMITTED] 2026-09-05 — parameter shape copied from a
 * hand-placed editor node (`PlayMusic`, `sound/music.xml:boss_final`, `loop:
 * True`); see DISCOVERY-LOG.md.
 */
export class NodePlayMusic extends ScriptNode {
  loop = true

  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public sound: string
  ) {
    super(ctx, x, y, 'PlayMusic')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('sound', this.sound))
    d.addData(new XMLBool('loop', this.loop))
    return d
  }
}

/**
 * A damage-over-time field bound to a shape. Ships **disabled** — the floor-timer
 * rig switches it on with a NodeToggleElement{state:0} once its countdown ends.
 *
 * `damage` is applied every `freq` milliseconds to every entity the shape's
 * `types` bitmask admits (the rig uses `types: 1`, players only). A **negative**
 * damage heals, which is a deliberate use of this node, not an accident.
 *
 * `buff` is emitted even when empty — `<string name="buff"></string>` is what the
 * shipped campaign/levels/level_2.xml writes for a pure-damage field.
 * [VERIFIED] 2026-08-23
 */
export class NodeDangerArea extends ScriptNode {
  damage = 1
  freqMs = 1000
  /** A `buffs/*.xml` path, or '' for pure damage. Reserved for the buff feature. */
  buff = ''
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'DangerArea')
    this.enabled = false
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('damage', this.damage))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    d.addData(new XMLInt('freq', this.freqMs))
    d.addData(new XMLString('buff', this.buff))
    return d
  }
}

/**
 * Fires a stream of projectiles in one cardinal direction, forever, from the
 * tile it sits on. This is what the boss arena's traps are made of — see
 * boss/traps.ts.
 *
 * Parameter shape [VERIFIED] 2026-09-01 against three sources that agree:
 * `campaign/levels/level_10.xml`, `campaign2/levels/level_temple_3.xml`, and a
 * test level the owner hand-built and loaded in game.
 *
 *   direction   int    0 up, 1 down, 2 left, 3 right (see boss/traps.ts)
 *   projectile  str    a `projectiles/*.xml` path
 *   spread      float  0..2 — 0 is a single linear stream, 2 the widest fan
 *   spawn-rate  int    milliseconds between shots
 *
 * Ships disabled, like NodeTimerTrigger and NodeDangerArea, because the tier
 * rig switches it on with a ToggleElement; the opening tier flips `enabled`
 * back to true itself. A disabled spewer waiting on a toggle is exactly the
 * shape the owner's test level uses, so the engine is known to accept it.
 */
export class NodeProjectileSpewer extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public projectilePath: string,
    public direction: number,
    public spread: number,
    public spawnRateMs: number
  ) {
    super(ctx, x, y, 'ProjectileSpewer')
    this.enabled = false
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('direction', this.direction))
    d.addData(new XMLString('projectile', this.projectilePath))
    d.addData(new XMLFloat('spread', this.spread))
    d.addData(new XMLInt('spawn-rate', this.spawnRateMs))
    return d
  }
}

/**
 * An integer script variable, read and written by `ChangeVariable` and
 * `CheckVariable` — the counter of the "all bosses died" rig
 * (`boss/tierSource.ts`), initialised to the boss count.
 *
 * [VERIFIED 2026-09-23] — shape copied from the user's editor-saved, playtested
 * `level0_fixed.xml`: the initial value is a bare `<int name="parameters">`
 * (hence the scalar seam, like `NodeGlobalEventTrigger`), and the editor saved
 * it with `trigger-times` 1, which is kept here.
 */
export class NodeVariable extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public initial: number
  ) {
    super(ctx, x, y, 'Variable')
    this.triggerTimes = 1
  }

  protected getParametersXML(): string {
    return new XMLInt('parameters', this.initial).getXML()
  }
}

/** `ChangeVariable`'s `mod` for "subtract `value`" — [VERIFIED 2026-09-23]. */
export const CHANGE_VAR_SUB = 2

/**
 * Applies `mod` with `value` to a `NodeVariable` each time it is triggered.
 *
 * [VERIFIED 2026-09-23] — shape from `level0_fixed.xml`: `vars` wraps the
 * variable's id in a `static` array, then `mod`, `round` and `value`. Only
 * `mod` 2 (subtract) is known; `round` is always 0 there.
 */
export class NodeChangeVariable extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public variable: NodeVariable,
    public mod: number,
    public value: number
  ) {
    super(ctx, x, y, 'ChangeVariable')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    const vars = new XMLDictionary('vars')
    vars.addData(new XMLIntArray('static', [this.variable.id]))
    d.addData(vars)
    d.addData(new XMLInt('mod', this.mod))
    d.addData(new XMLInt('round', 0))
    d.addData(new XMLInt('value', this.value))
    return d
  }
}

/** `CheckVariable`'s `cmp-func` for "equals `cmp-val`" — [VERIFIED 2026-09-23]. */
export const CHECK_VAR_EQUAL = 0

/**
 * Compares a `NodeVariable` against `cmpVal` each time it is triggered and
 * fires its `on-true` targets when the comparison holds. It has no
 * `connections` of its own.
 *
 * [VERIFIED 2026-09-23] — shape from `level0_fixed.xml`, where `on-true`
 * listed the seal's `DestroyObject` and the "bosses are dead" `AnnounceText`
 * and an empty `on-false` dictionary loaded fine.
 *
 * `connectTo` appends to `onTrue` instead of `connections`, so a rig that
 * "connects from" this node — as every death-tier rig does from a
 * `TierSource` trigger — lands in `on-true` without knowing the difference.
 * `on-true` carries no per-target delay, so a delayed connection is refused.
 * The array is taken by reference: the all-bosses-died rig hands the same one
 * to every boss's CheckVariable, so wiring one wires them all.
 */
export class NodeCheckVariable extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public variable: NodeVariable,
    public cmpVal: number,
    public onTrue: ScriptNode[] = []
  ) {
    super(ctx, x, y, 'CheckVariable')
  }

  connectTo(n: ScriptNode, delayMs?: number): void {
    if (delayMs !== undefined && delayMs !== 0) {
      throw new Error('CheckVariable on-true targets cannot carry a delay')
    }
    this.onTrue.push(n)
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    const vars = new XMLDictionary('vars')
    vars.addData(new XMLIntArray('static', [this.variable.id]))
    d.addData(vars)
    d.addData(new XMLInt('cmp-func', CHECK_VAR_EQUAL))
    d.addData(new XMLInt('cmp-val', this.cmpVal))
    // An empty `<int-arr>` crashes LevelPacker.exe, so an `on-true` with
    // nothing wired to it ships as an empty dictionary — the same shape the
    // editor itself saved for `on-false`.
    const onTrue = new XMLDictionary('on-true')
    if (this.onTrue.length > 0) onTrue.addData(new XMLIntArray('static', this.onTrue.map((n) => n.id)))
    d.addData(onTrue)
    d.addData(new XMLDictionary('on-false'))
    return d
  }
}
