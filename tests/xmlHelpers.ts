/**
 * Assertions shared by every suite that reads generated level XML.
 *
 * These started life inside `lobby.test.ts`; the prep room and the boss arena
 * need exactly the same two checks, and three private copies would drift.
 */

/** Every `<int name="id">` in the file, in document order. */
export function allIds(xml: string): number[] {
  return [...xml.matchAll(/<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1]))
}

/**
 * The first `<int-arr>` that would crash `LevelPacker.exe`, or null if the file
 * is clean. An empty one is the real-world failure — the packer parses what is
 * inside the element and throws on nothing ([VERIFIED] 2026-07-31) — so every
 * emitter omits the whole element instead of shipping it empty.
 *
 * Returns the first offender rather than running one `expect()` per token: the
 * tilemap arrays hold hundreds of thousands of integers apiece, and the
 * assertion overhead alone times the calling test out.
 */
export function badIntArray(xml: string): string | null {
  for (const [, name, body] of xml.matchAll(/<int-arr name="([^"]*)">([^<]*)<\/int-arr>/g)) {
    if (body === '') return `<int-arr name="${name}"> is empty`
    const bad = body.split(' ').find((token) => !/^-?\d+$/.test(token))
    if (bad !== undefined) return `<int-arr name="${name}"> holds "${bad}"`
  }
  return null
}

/**
 * Every scripting node of one `type`, as `{ id, body }` in document order.
 *
 * Dialect-agnostic: the hand-authored templates (lobby, boss prep) save a
 * node's position as `<vec2 name="pos">` and the generated levels as a
 * `<float name="x">`/`<float name="y">` pair, so nothing here looks past the
 * id/type header. A node's `body` runs to the start of the next element, which
 * is enough to read its parameters back without counting nesting.
 */
export function nodesOfType(xml: string, type: string): { id: number; body: string }[] {
  const header = /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>/g
  const found: { id: number; type: string; from: number }[] = []
  for (const m of xml.matchAll(header)) {
    found.push({ id: Number(m[1]), type: m[2], from: m.index })
  }

  return found
    .map((node, i) => ({ ...node, body: xml.slice(node.from, found[i + 1]?.from ?? xml.length) }))
    .filter((node) => node.type === type)
    .map(({ id, body }) => ({ id, body }))
}

/** The ids `<int-arr name="{name}">` holds inside `body`, or null if absent. */
function intArr(body: string, name: string): number[] | null {
  const found = new RegExp(`<int-arr name="${name}">([^<]*)</int-arr>`).exec(body)
  return found === null ? null : found[1].split(' ').map(Number)
}

/**
 * The ids of the level's one-shot arrival-respawn rig, or a string saying what
 * is wrong with it.
 *
 * The rig every dungeon floor's `ExitUp` prefab carries and which the lobby,
 * the boss prep room and the boss arena now carry too: an `AreaTrigger` over
 * the spawn point fires `RespawnPlayers` — so a player who died on the way in
 * arrives alive — and a `ToggleElement` whose `element` is the trigger's *own*
 * id switches the trigger off, so it can never fire a second time. Returns the
 * offending description rather than asserting, so each suite can name the level
 * it was checking.
 */
export function oneShotRespawn(
  xml: string
): { shape: number; trigger: number; respawn: number; disable: number } | string {
  const respawns = nodesOfType(xml, 'RespawnPlayers')
  if (respawns.length !== 1) return `expected exactly one RespawnPlayers, found ${respawns.length}`
  const respawn = respawns[0].id

  const trigger = nodesOfType(xml, 'AreaTrigger').find((n) =>
    (intArr(n.body, 'connections') ?? []).includes(respawn)
  )
  if (trigger === undefined) return `no AreaTrigger connects to RespawnPlayers ${respawn}`

  const shape = intArr(trigger.body, 'static')
  if (shape === null || shape.length !== 1) return `AreaTrigger ${trigger.id} has no single shape`
  if (!nodesOfType(xml, 'RectangleShape').some((n) => n.id === shape[0])) {
    return `AreaTrigger ${trigger.id} points at missing shape ${shape[0]}`
  }

  const disable = nodesOfType(xml, 'ToggleElement').find(
    (n) => /<int name="state">1<\/int>/.test(n.body) && (intArr(n.body, 'static') ?? []).includes(trigger.id)
  )
  if (disable === undefined) return `nothing disables AreaTrigger ${trigger.id} after it fires`
  if (!(intArr(trigger.body, 'connections') ?? []).includes(disable.id)) {
    return `AreaTrigger ${trigger.id} never fires its own ToggleElement ${disable.id}`
  }

  return { shape: shape[0], trigger: trigger.id, respawn, disable: disable.id }
}
