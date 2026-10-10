/**
 * The campaign's level ids — the strings that appear as `<level id="...">` in
 * levels.xml and as the `level` parameter of every `LevelExitArea` node.
 *
 * These live here rather than next to the code that emits them because both
 * ends of every link need them: `index.ts` names the files, `objectSet.ts`
 * points the final floor's portal at the next fight's arena, and
 * `lobby/build.ts` points a lobby at whatever slot follows it. A single
 * source stops the two ends drifting.
 *
 * Dungeon floors keep the original's bare numeric ids `0..N-1`, so nothing that
 * reads a floor id has to change; the boss and lobby levels are always suffixed
 * strings, which is what keeps them from ever colliding with a floor.
 */

/** The arena of boss fight `i`. */
export function bossArenaId(i: number): string {
  return `boss${i}`
}

/** Where the arena of boss fight `i` is written. */
export function bossArenaPath(i: number): string {
  return `levels/${bossArenaId(i)}.xml`
}

/** Lobby `i` — one of an arbitrary number of shop rooms the campaign can carry. */
export function lobbyId(i: number): string {
  return `lobby${i}`
}

/** Where lobby `i` is written. */
export function lobbyPath(i: number): string {
  return `levels/${lobbyId(i)}.xml`
}

/**
 * How one dungeon floor (or boss arena) leaves the campaign — three visually
 * distinct ways out, plus the end of the run.
 *
 * `exit` is the original stair-down prefab, into the next dungeon floor.
 * `portal` is the red boss portal, into a fight's arena. `lobbyPortal` is the
 * blue teleport, into a lobby — visually distinct from `portal` precisely so
 * a party can tell "shop" from "boss fight" before stepping through. `orb` is
 * the victory orb that ends the run. Which one a slot gets follows entirely
 * from what comes after it in the campaign order — a floor or arena followed
 * by another floor takes the stairs (an arena never takes stairs; see
 * `boss/arena.ts`), one followed by a lobby takes the blue portal, one
 * followed directly by a boss fight takes the red portal, and the campaign's
 * last slot takes the orb.
 *
 * The three gated kinds carry the level id they lead to, so `map/room.ts`,
 * `boss/arena.ts` and `objects/objectSet.ts` never have to work it out
 * themselves.
 */
export type Gateway =
  | { kind: 'exit'; target: string }
  | { kind: 'portal'; target: string }
  | { kind: 'lobbyPortal'; target: string }
  | { kind: 'orb' }

/**
 * One slot in the campaign's play order: a dungeon floor, a boss fight or a
 * lobby, each by its own index. A boss fight is ONE slot even though its
 * arena is generated geometry — a lobby that shops for it is a separate,
 * independent slot, not part of the fight.
 */
export type CampaignSlot =
  | { kind: 'floor'; index: number }
  | { kind: 'boss'; index: number }
  | { kind: 'lobby'; index: number }

/**
 * The way out of the slot at `position`, given the whole order.
 *
 * The last slot ends the campaign whatever kind it is: a rearranged campaign
 * can finish on a dungeon floor, in which case that floor gets the orb and the
 * arenas before it get portals.
 */
export function gatewayAfter(order: CampaignSlot[], position: number): Gateway {
  const next = order[position + 1]
  if (next === undefined) return { kind: 'orb' }
  if (next.kind === 'boss') return { kind: 'portal', target: slotEntryId(next) }
  if (next.kind === 'lobby') return { kind: 'lobbyPortal', target: slotEntryId(next) }
  return { kind: 'exit', target: slotEntryId(next) }
}

/**
 * How many of each kind of slot the campaign has — what a stored order is
 * repaired and validated against.
 *
 * Deliberately an object rather than a third positional argument: every call
 * site has to name `lobbies` explicitly instead of silently defaulting to
 * zero the moment this type grew a new field.
 */
export interface CampaignCounts {
  levels: number
  fights: number
  lobbies: number
}

/**
 * The campaign's play order: the stored `levelOrder`, or the historical default
 * of every lobby, then every floor, then every boss fight, all in order.
 *
 * `levelOrder` being optional is a byte-identity contract, the same one
 * `levelBuffs` and `levelTimers` carry: absent must reproduce exactly what the
 * generator did before floors could be rearranged. With `counts.lobbies === 0`
 * this is byte-for-byte the order the generator used before lobbies became
 * campaign slots at all.
 */
export function campaignOrder(counts: CampaignCounts, stored?: CampaignSlot[]): CampaignSlot[] {
  if (stored === undefined) return defaultOrder(counts)
  return normalizeOrder(stored, counts)
}

/**
 * Lobbies, then every floor, then every fight — what the campaign was before
 * fights and floors were reorderable, plus lobbies leading the whole thing
 * when there are any. With `lobbies: 0` this is exactly that pre-feature
 * shape, which is the byte-identity contract `campaign.ts` exists to protect.
 */
export function defaultOrder(counts: CampaignCounts): CampaignSlot[] {
  return [
    ...Array.from({ length: Math.max(0, counts.lobbies) }, (_, index) => ({ kind: 'lobby' as const, index })),
    ...Array.from({ length: Math.max(0, counts.levels) }, (_, index) => ({ kind: 'floor' as const, index })),
    ...Array.from({ length: Math.max(0, counts.fights) }, (_, index) => ({ kind: 'boss' as const, index }))
  ]
}

/**
 * Repair an order so it describes exactly the campaign it is attached to.
 *
 * Three things can be wrong with a stored order: it can name a slot that no
 * longer exists (a count shrank), it can be missing one (a count grew), or it
 * can hold a duplicate. All three are recoverable, and recovering beats
 * refusing — a stale order in a settings file or a hand-written
 * `parameters.txt` must never be fatal (invariant #5).
 *
 * What it does NOT repair is the interleaving, which is the whole point of the
 * feature: the slots that are valid keep the positions they were given. Only
 * each sequence's internal order is forced back to ascending, because a
 * campaign whose floors run 1, 3, 2 is not something the UI can label
 * coherently. Missing slots are appended in their own kind's order, lobbies
 * first (matching `defaultOrder`'s shape) then floors then fights.
 *
 * Pure and RNG-free, like every other repair in config/.
 */
export function normalizeOrder(order: CampaignSlot[], counts: CampaignCounts): CampaignSlot[] {
  const limit = (kind: CampaignSlot['kind']): number =>
    kind === 'floor' ? Math.max(0, counts.levels) : kind === 'boss' ? Math.max(0, counts.fights) : Math.max(0, counts.lobbies)

  const seen = new Set<string>()
  const kept: CampaignSlot[] = []
  for (const slot of order) {
    if (slot === null || typeof slot !== 'object') continue
    if (slot.kind !== 'floor' && slot.kind !== 'boss' && slot.kind !== 'lobby') continue
    if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index >= limit(slot.kind)) continue
    const key = slotKey(slot)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push({ kind: slot.kind, index: slot.index })
  }

  // whatever the order failed to mention goes on the end, in its own order
  for (const slot of defaultOrder(counts)) {
    if (!seen.has(slotKey(slot))) kept.push(slot)
  }

  // Force each sequence ascending without disturbing the interleaving: the
  // positions each kind occupies are kept, and that kind's indices are dealt
  // back into them in order. So `2, B2, 1, B1` becomes `1, B1, 2, B2` — the
  // shape the dungeon master arranged, with the numbers made coherent.
  const sorted = new Map<CampaignSlot['kind'], number[]>([
    ['lobby', kept.filter((s) => s.kind === 'lobby').map((s) => s.index).sort((a, b) => a - b)],
    ['floor', kept.filter((s) => s.kind === 'floor').map((s) => s.index).sort((a, b) => a - b)],
    ['boss', kept.filter((s) => s.kind === 'boss').map((s) => s.index).sort((a, b) => a - b)]
  ])
  const next = new Map<CampaignSlot['kind'], number>([
    ['lobby', 0],
    ['floor', 0],
    ['boss', 0]
  ])
  return kept.map((slot) => {
    const cursor = next.get(slot.kind)!
    next.set(slot.kind, cursor + 1)
    return { kind: slot.kind, index: sorted.get(slot.kind)![cursor] }
  })
}

/** Whether an order is already the default one, so a stock export writes no key. */
export function isDefaultOrder(order: CampaignSlot[], counts: CampaignCounts): boolean {
  const wanted = defaultOrder(counts)
  if (order.length !== wanted.length) return false
  return order.every((slot, i) => slot.kind === wanted[i].kind && slot.index === wanted[i].index)
}

/** `floor:3` / `boss:1` / `lobby:0` — an identity for dedup, never emitted anywhere. */
function slotKey(slot: CampaignSlot): string {
  return `${slot.kind}:${slot.index}`
}

/**
 * The level id a slot is ENTERED through — a floor's own numeric id, a boss
 * fight's arena (the prep room is gone; a lobby that wants to shop before a
 * fight is its own preceding slot now), or a lobby's own id.
 */
export function slotEntryId(slot: CampaignSlot): string {
  if (slot.kind === 'floor') return String(slot.index)
  if (slot.kind === 'boss') return bossArenaId(slot.index)
  return lobbyId(slot.index)
}

/**
 * Which kind of arena a `boss` slot is (issue #61) — a boss fight, or a
 * survival round cleared by outlasting a clock.
 *
 * It lives here, next to the labels, rather than in config/parameters.ts with
 * the rest of the parameter types, because parameters.ts imports THIS file and
 * not the other way round. `parameters.ts` re-exports it, which is where the
 * rest of the app reads it from.
 */
export type ArenaMode = 'boss' | 'survival'

/** The two arena modes, in the order the Arena tab's sub-tabs list them. */
export const ARENA_MODES = ['boss', 'survival'] as const

/**
 * What the preview tabs, the reorder UI and `levelOrder=` call a slot: `3` for
 * the third dungeon floor, `L2` for the second lobby, and for an arena
 * `AB2`/`AS2` — the PREFIX is its mode, the NUMBER is its position in the
 * `fights` array. All 1-based, because they are shown to a person.
 *
 * Numbering the arenas by array index rather than per mode is deliberate. The
 * two modes share one ordered `fights` array, and `normalizeOrder` repairs an
 * order by dealing each kind's indices back into the positions that kind
 * already occupies. Per-mode counters ("the second survival arena") would need
 * a second numbering space that is not the array index, so flipping one
 * arena's mode would silently renumber every later chip and a token would no
 * longer map to a slot. With the prefix carrying the mode and the number
 * carrying the position, one boss and one survival arena read `AB1`, `AS2`,
 * and flipping either changes one letter and nothing else.
 *
 * `mode` is optional, and omitting it yields the historical `B2`. That is what
 * `parameters.txt` files written before survival mode existed carry, and
 * `parseSlotLabel` still reads.
 */
export function slotLabel(slot: CampaignSlot, mode?: ArenaMode): string {
  if (slot.kind === 'floor') return String(slot.index + 1)
  if (slot.kind === 'boss') {
    const prefix = mode === undefined ? 'B' : mode === 'survival' ? 'AS' : 'AB'
    return `${prefix}${slot.index + 1}`
  }
  return `L${slot.index + 1}`
}

/**
 * A `slotLabel` bound to one campaign's arena modes — what every call site that
 * has the fight list actually wants, instead of repeating the index lookup.
 *
 * An index past the end of `modes` falls back to the bare `B` spelling rather
 * than guessing, which is the right answer for a stale order: the slot does not
 * exist, and `normalizeOrder` is about to drop it.
 */
export function slotLabeller(modes: readonly ArenaMode[]): (slot: CampaignSlot) => string {
  return (slot) => slotLabel(slot, slot.kind === 'boss' ? modes[slot.index] : undefined)
}

/**
 * Parse one `parameters.txt` order token — `3`, `L2`, and for an arena any of
 * `B2`, `AB2` or `AS2`. All 1-based. Null when malformed.
 *
 * All three arena spellings resolve to the same `{kind: 'boss', index}`: the
 * `AB`/`AS` distinction in a token is INFORMATIONAL, so a file stays readable
 * at a glance, and `boss<i>Mode` is the single source of truth for what an
 * arena actually is. A hand-edited file whose token disagrees with its mode key
 * is not an error — the token's prefix is simply ignored, and the next export
 * rewrites it to match (invariant 5: recover, never throw).
 */
export function parseSlotLabel(token: string): CampaignSlot | null {
  const trimmed = token.trim()
  const boss = /^(?:[Aa][BbSs]|[Bb])(\d+)$/.exec(trimmed)
  if (boss !== null) {
    const index = parseInt(boss[1], 10) - 1
    return index >= 0 ? { kind: 'boss', index } : null
  }
  const lobby = /^[Ll](\d+)$/.exec(trimmed)
  if (lobby !== null) {
    const index = parseInt(lobby[1], 10) - 1
    return index >= 0 ? { kind: 'lobby', index } : null
  }
  if (!/^\d+$/.test(trimmed)) return null
  const index = parseInt(trimmed, 10) - 1
  return index >= 0 ? { kind: 'floor', index } : null
}
