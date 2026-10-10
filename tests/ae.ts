/**
 * Helpers for suites that inspect generated Anniversary Edition levels: they
 * read each emitted `.lvl` back with the same reader that round-trips the
 * stock Castle levels, then query scripts and units structurally.
 */
import { readLevel } from '../src/generator/ae/levelReader'
import type { AeLevel, AeScript, AeUnit, Param } from '../src/generator/ae/model'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult, GeneratedFile } from '../src/generator'

/** Generate, failing the test with the generator's own errors if it refuses. */
export function generateOk(params: DungeonParameters, seed = 1): DungeonResult {
  const r = generateDungeon(params, seed)
  if (!r.ok) throw new Error(`generation failed: ${r.errors.join('; ')}`)
  return r
}

/** Every `.lvl` in a result, read back, keyed by stem (`floor0`, `boss0`, `lobby1`). */
export function levelsOf(result: DungeonResult): Map<string, AeLevel> {
  const out = new Map<string, AeLevel>()
  for (const f of result.files) {
    const m = /\/([a-z]+\d+)\.lvl$/.exec(f.path)
    if (m !== null) out.set(m[1], readLevel(f.content).level)
  }
  return out
}

export function fileOf(result: DungeonResult, path: string): GeneratedFile | undefined {
  return result.files.find((f) => f.path === path)
}

export function scriptsOf(level: AeLevel, cls: string): AeScript[] {
  return level.scripts.filter((s) => s.cls === cls)
}

export function unitsOf(level: AeLevel, pred: (u: AeUnit) => boolean): AeUnit[] {
  return level.units.filter(pred)
}

export function param(s: AeScript, name: string): Param | undefined {
  return s.params.find((p) => p.name === name)
}

export function strParam(s: AeScript, name: string): string | undefined {
  const p = param(s, name)
  return p?.kind === 'string' ? p.value : undefined
}

export function idsParam(s: AeScript, name: string): number[] {
  const p = param(s, name)
  return p?.kind === 'ids' ? p.value : []
}

/** Ids every script of the level fires through connections and id-array params. */
export function referencedIds(level: AeLevel): number[] {
  const out: number[] = []
  for (const s of level.scripts) {
    for (const [id] of s.connections) out.push(id)
    for (const p of s.params) {
      if (p.kind === 'ids') out.push(...p.value)
      if (p.kind === 'target') out.push(p.value[0])
      if (p.kind === 'sources') out.push(...p.value.map(([id]) => id))
    }
  }
  return out
}

/** Every unit and script id in the level. */
export function allIds(level: AeLevel): number[] {
  return [...level.units.map((u) => u.id), ...level.scripts.map((s) => s.id)]
}

/** A level's raw `.lvl` text by stem, for plain contains-checks. */
export function lvlText(result: DungeonResult, stem: string): string {
  const f = result.files.find((file) => file.path.endsWith(`/${stem}.lvl`))
  if (f === undefined) throw new Error(`no level ${stem}`)
  return f.content
}

/** Stems of every emitted level, in file order. */
export function stemsOf(result: DungeonResult): string[] {
  return result.files.flatMap((f) => /\/([a-z]+\d+)\.lvl$/.exec(f.path)?.[1] ?? [])
}

/**
 * A level's units without their ids. Wall units draw their ids at emit time,
 * after every object and script, so a rig that adds scripts renumbers the
 * walls without moving anything — compare placements, not ids.
 */
export function placements(level: AeLevel): string[] {
  return level.units.map((u) => `${u.path}@${u.x},${u.y}${u.state === undefined ? '' : JSON.stringify(u.state)}`)
}

/** The scripts of `before` that `after` lost or changed (by id), for an append-only check. */
export function changedScripts(before: AeLevel, after: AeLevel): number[] {
  const byId = new Map(after.scripts.map((s) => [s.id, JSON.stringify(s)]))
  return before.scripts.filter((s) => byId.get(s.id) !== JSON.stringify(s)).map((s) => s.id)
}

export function intParam(s: AeScript, name: string): number | undefined {
  const p = param(s, name)
  return p?.kind === 'int' || p?.kind === 'float' ? p.value : undefined
}

export function scriptById(level: AeLevel, id: number): AeScript | undefined {
  return level.scripts.find((s) => s.id === id)
}

export function unitById(level: AeLevel, id: number): AeUnit | undefined {
  return level.units.find((u) => u.id === id)
}

/** A rectangle sensor's `[w, h]` in pixels, or undefined for anything else. */
export function sensorSizePx(u: AeUnit): [number, number] | undefined {
  const size = u.state?.size
  return size?.kind === 'vec2' ? [size.value[0], size.value[1]] : undefined
}

/** The `Text` of every AnnounceText in the level, in script order. */
export function textsOf(level: AeLevel): string[] {
  return scriptsOf(level, 'AnnounceText').map((s) => strParam(s, 'Text') ?? '')
}

/** The scripts `s` fires, with their delays. */
export function firedBy(level: AeLevel, s: AeScript): Array<{ script: AeScript; delayMs: number }> {
  return s.connections.flatMap(([id, delayMs]) => {
    const script = scriptById(level, id)
    return script === undefined ? [] : [{ script, delayMs }]
  })
}

/**
 * Like `changedScripts`, but a script that only GAINED connections at the end
 * (a rig hanging its payload off an existing trigger) counts as unchanged.
 */
export function changedScriptsBeyondAppends(before: AeLevel, after: AeLevel): number[] {
  const byId = new Map(after.scripts.map((s) => [s.id, s]))
  return before.scripts
    .filter((s) => {
      const a = byId.get(s.id)
      if (a === undefined) return true
      const trimmed = { ...a, connections: a.connections.slice(0, s.connections.length) }
      return JSON.stringify(trimmed) !== JSON.stringify(s)
    })
    .map((s) => s.id)
}
