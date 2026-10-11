import { PLAYER_FIELD_MAP, classesOwning, skillKey } from './fields'
import type { PlayerTweaks } from './fields'
import { PLAYER_STOCK } from './stock.generated'

/**
 * Move speed. AE has no per-class speed stat: every class owns one of two
 * shared passive skills, `shared_speed` (wizard, ranger, sorcerer, priest:
 * ×1.0, shop 1.1/1.2/1.3) or `shared_speed_melee` (paladin, thief, warlock:
 * ×1.2, shop 1.3/1.4/1.5). The original game had one speed for everyone.
 *
 * Three ways to set it, all as ordinary overrides:
 * - `everyone` — both files the same, like the original;
 * - `group` — melee and ranged apart, like AE;
 * - `class` — each class its own, through a per-class copy of its file.
 *
 * A speed is the skill's starting multiplier; the shop's tiers follow it at
 * AE's own step of +0.1 per tier.
 */

export type SpeedMode = 'everyone' | 'group' | 'class'
export type SpeedGroup = 'ranged' | 'melee'

export const SPEED_STEP = 0.1
const BIND = 'movespeed-mul'

export const SPEED_FILES: Readonly<Record<SpeedGroup, string>> = {
  ranged: 'shared_speed',
  melee: 'shared_speed_melee'
}

const pathOf = (group: SpeedGroup): string => `players/shared/skills/${SPEED_FILES[group]}.sval`

export function speedGroupOf(classId: string): SpeedGroup {
  return classesOwning(pathOf('melee')).includes(classId) ? 'melee' : 'ranged'
}

export function classesIn(group: SpeedGroup): string[] {
  return classesOwning(pathOf(group))
}

/** The chain keys and tier numbers that carry the speed, root first. */
function ladder(group: SpeedGroup): Array<{ chain: string; tier: number; stock: number }> {
  const file = PLAYER_STOCK.skills.find((f) => f.stem === SPEED_FILES[group])
  const out: Array<{ chain: string; tier: number; stock: number }> = []
  for (const chain of file?.chains ?? []) {
    chain.tiers.forEach((t, i) => {
      const b = t.binds[BIND]
      if (b !== undefined) out.push({ chain: chain.key, tier: i + 1, stock: b.stock })
    })
  }
  return out
}

const round = (v: number): number => Math.round(v * 1000) / 1000

/** The starting speed of a group, or of one class (its own copy if it has one). */
export function speedOf(tweaks: PlayerTweaks, group: SpeedGroup, classId?: string): number {
  const root = ladder(group)[0]
  const all = tweaks[skillKey(root.chain, root.tier, BIND)] ?? root.stock
  return classId === undefined ? all : (tweaks[skillKey(root.chain, root.tier, BIND, classId)] ?? all)
}

function isSpeedKey(key: string): boolean {
  const f = PLAYER_FIELD_MAP.get(key)
  return f !== undefined && f.name === BIND && f.path.startsWith('players/shared/skills/shared_speed')
}

function writeLadder(out: PlayerTweaks, group: SpeedGroup, start: number, classId?: string): void {
  ladder(group).forEach((t, k) => {
    const key = skillKey(t.chain, t.tier, BIND, classId)
    const value = round(start + k * SPEED_STEP)
    // an all-classes value at stock is no override; a class's own value is
    // always written, because it is what makes the class keep its own copy
    if (classId === undefined && value === t.stock) delete out[key]
    else out[key] = value
  })
}

/** Set a group's speed (every class in it that has no copy of its own). */
export function setGroupSpeed(tweaks: PlayerTweaks, group: SpeedGroup, start: number): PlayerTweaks {
  const out = { ...tweaks }
  writeLadder(out, group, start)
  return out
}

export function setClassSpeed(tweaks: PlayerTweaks, classId: string, start: number): PlayerTweaks {
  const out = { ...tweaks }
  writeLadder(out, speedGroupOf(classId), start, classId)
  return out
}

/** Everyone at one speed: both groups, and no class copies. */
export function setEveryoneSpeed(tweaks: PlayerTweaks, start: number): PlayerTweaks {
  const out = clearClassSpeeds(tweaks)
  writeLadder(out, 'ranged', start)
  writeLadder(out, 'melee', start)
  return out
}

function clearClassSpeeds(tweaks: PlayerTweaks): PlayerTweaks {
  const out: PlayerTweaks = {}
  for (const [k, v] of Object.entries(tweaks)) {
    if (!(isSpeedKey(k) && PLAYER_FIELD_MAP.get(k)!.classId !== undefined)) out[k] = v
  }
  return out
}

export function deriveSpeedMode(tweaks: PlayerTweaks): SpeedMode {
  for (const k of Object.keys(tweaks)) {
    if (isSpeedKey(k) && PLAYER_FIELD_MAP.get(k)!.classId !== undefined) return 'class'
  }
  return speedOf(tweaks, 'ranged') === speedOf(tweaks, 'melee') ? 'everyone' : 'group'
}

/**
 * Switch mode, keeping every class at the speed it has now where the new mode
 * can express it: to `everyone` takes the ranged speed for all; to `group`
 * drops the class copies; to `class` gives every class a copy at its speed.
 */
export function applySpeedMode(mode: SpeedMode, tweaks: PlayerTweaks): PlayerTweaks {
  if (mode === 'everyone') return setEveryoneSpeed(tweaks, speedOf(tweaks, 'ranged'))
  if (mode === 'group') return clearClassSpeeds(tweaks)
  let out = { ...tweaks }
  for (const c of PLAYER_STOCK.classes) {
    out = setClassSpeed(out, c.id, speedOf(tweaks, speedGroupOf(c.id), c.id))
  }
  return out
}
