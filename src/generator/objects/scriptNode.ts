import { XMLBool, XMLDictionary, XMLFloat, XMLInt, XMLIntArray, XMLObject, XMLRaw, XMLString } from '../xml'
import type { GenerationContext } from '../core/context'

export type NodeTypeName =
  | 'ToggleElement'
  | 'AreaTrigger'
  | 'RespawnPlayers'
  | 'ShopArea'
  | 'LevelStart'
  | 'LevelExitArea'
  | 'AnnounceText'
  | 'ObjectEventTrigger'
  | 'RectangleShape'
  | 'GameEnd'
  | 'SpawnObject'
  | 'GlobalEventTrigger'
  | 'TimerTrigger'
  | 'DestroyObject'
  | 'ToggleImmortality'
  | 'DangerArea'
  | 'PlaySound'
  | 'PlayMusic'
  | 'ChangeDoodadState'
  | 'ProjectileSpewer'
  | 'Checkpoint'
  | 'Variable'
  | 'ChangeVariable'
  | 'CheckVariable'

/**
 * Base scripting node (ported from ScriptNode.java). Most subclasses override
 * getParametersDict() to emit their type-specific `<dictionary name="parameters">`
 * block; a few (SpawnObject, GlobalEventTrigger, TimerTrigger) carry a bare
 * scalar instead and override getParametersXML() directly — see the seam below.
 */
export class ScriptNode extends XMLObject {
  id: number
  enabled = true
  triggerTimes = -1
  connections: ScriptNode[] = []

  /**
   * Per-connection delays in milliseconds, or `null` while every connection was
   * made without one — the overwhelmingly common case, and the one that has to
   * keep emitting the legacy `delays` line below byte-for-byte.
   */
  private delaysMs: number[] | null = null

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: NodeTypeName
  ) {
    super()
    this.id = ctx.idCounter++
    ctx.scriptNodes.push(this)
  }

  /**
   * Connects to `n`, optionally after `delayMs` milliseconds.
   *
   * Passing a delay — at any point, even on the tenth connection — switches this
   * node into real-delay mode for good: connections already made are back-filled
   * with 0 and every later one records its own value (0 when omitted). A node
   * that is never given a delay stays in legacy mode and its XML is unchanged.
   */
  connectTo(n: ScriptNode, delayMs?: number): void {
    if (delayMs !== undefined && this.delaysMs === null) {
      this.delaysMs = this.connections.map(() => 0)
    }
    this.connections.push(n)
    if (this.delaysMs !== null) this.delaysMs.push(delayMs ?? 0)
  }

  protected getParametersDict(): XMLDictionary {
    return new XMLDictionary('parameters')
  }

  /**
   * The node's `parameters` element as raw XML.
   *
   * Most nodes emit a `<dictionary name="parameters">`, but SpawnObject,
   * GlobalEventTrigger and TimerTrigger carry a bare scalar instead
   * ([VERIFIED] 2026-08-10, see DISCOVERY-LOG.md), which a dictionary
   * cannot express — hence the seam.
   */
  protected getParametersXML(): string {
    return this.getParametersDict().getXML()
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', this.type))
    dict.addData(new XMLBool('enabled', this.enabled))
    dict.addData(new XMLInt('trigger-times', this.triggerTimes))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    dict.addData(new XMLRaw(this.getParametersXML()))

    if (this.connections.length > 0) {
      const ids = this.connections.map((c) => c.id)
      dict.addData(new XMLIntArray('connections', ids))
      if (this.delaysMs === null) {
        // the original passed the ids array for delays too — kept for output parity
        dict.addData(new XMLIntArray('delays', ids))
      } else {
        // Real delays go out under BOTH names. The generator has always written
        // `delays` (a verbatim id copy, which the engine evidently ignores or
        // rounds off to nothing visible), while the game's own editor writes
        // `connection-delays` with true milliseconds — see the DISCOVERY-LOG's
        // dialect note. Which key the engine actually honours in a *generated*
        // level is unverified, so a node that genuinely needs its timing to land
        // ships the same true values under each. [EMITTED] 2026-08-22
        dict.addData(new XMLIntArray('delays', this.delaysMs))
        dict.addData(new XMLIntArray('connection-delays', this.delaysMs))
      }
    }

    return dict.getXML()
  }
}
