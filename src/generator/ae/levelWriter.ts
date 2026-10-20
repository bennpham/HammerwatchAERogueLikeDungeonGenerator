import { SvalWriter } from './sval'
import type { AeLevel, AeScript, AeUnit, Param, StateValue } from './model'

/**
 * Serialise an `AeLevel` as an AE `.lvl` (SVAL text) in the layout the AE
 * editor saves: game-mode, version, lighting, tiles, units, statics (when
 * there are any), scripts, prefabs.
 * Ported from hw2ae's `ae/level_writer.py`.
 *
 * Deterministic: units are grouped by path in sorted path order and keep their
 * insertion order within a group; scripts and prefabs keep insertion order.
 */
export function renderLevel(level: AeLevel): string {
  const w = new SvalWriter()
  w.open('dict')

  w.open('dict', 'game-mode')
  w.string(level.gameMode, 'Class')
  w.close('dict')
  w.int(1, 'version')
  if (level.environment !== null) {
    w.open('dict', 'lighting')
    w.string(level.environment, 'environment')
    w.close('dict')
  }

  w.open('array', 'tiles')
  const cells = [...level.tileCells].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const cell of cells) {
    w.open('dict')
    w.vec2(cell.x, cell.y, 'pos')
    w.open('array', 'datasets')
    for (const ds of cell.datasets) {
      w.open('dict')
      w.string(ds.tileset, 'tileset')
      w.bytes(ds.rle, 'data-rle')
      w.close('dict')
    }
    w.close('array')
    w.close('dict')
  }
  w.close('array')

  const groups = new Map<string, AeUnit[]>()
  for (const u of level.units) {
    const g = groups.get(u.path)
    if (g === undefined) groups.set(u.path, [u])
    else g.push(u)
  }
  w.open('dict', 'units')
  for (const path of [...groups.keys()].sort()) {
    w.open('array', path)
    for (const u of groups.get(path)!) writeUnit(w, u)
    w.close('array')
  }
  w.close('dict')

  if (level.statics.length > 0) {
    const statics = new Map<string, typeof level.statics>()
    for (const st of level.statics) statics.set(st.path, [...(statics.get(st.path) ?? []), st])
    w.open('dict', 'statics')
    for (const path of [...statics.keys()].sort()) {
      w.open('array', path)
      for (const st of statics.get(path)!) {
        w.vec2(st.x, st.y)
        if (st.state !== undefined) {
          w.open('dict')
          for (const [name, v] of Object.entries(st.state)) writeState(w, name, v)
          w.close('dict')
        }
      }
      w.close('array')
    }
    w.close('dict')
  }

  w.open('array', 'scripts')
  for (const s of level.scripts) writeScript(w, s)
  w.close('array')

  w.open('array', 'prefabs')
  for (const p of level.prefabs) {
    w.string(p.path)
    w.vec3(p.x, p.y, 0)
  }
  w.close('array')

  w.close('dict')
  return w.text()
}

function writeState(w: SvalWriter, name: string, v: StateValue): void {
  switch (v.kind) {
    case 'bool':
      w.bool(v.value, name)
      break
    case 'int':
      w.int(v.value, name)
      break
    case 'float':
      w.float(v.value, name)
      break
    case 'vec2':
      w.vec2(v.value[0], v.value[1], name)
      break
    case 'strings':
      w.open('array', name)
      for (const s of v.value) w.string(s)
      w.close('array')
      break
    default:
      w.string(v.value, name)
  }
}

function writeUnit(w: SvalWriter, u: AeUnit): void {
  if (u.state === undefined) {
    w.vec2(u.x, u.y)
    w.int(u.id)
    return
  }
  w.open('array')
  w.vec2(u.x, u.y)
  w.int(u.id)
  w.open('dict')
  for (const [name, v] of Object.entries(u.state)) writeState(w, name, v)
  w.close('dict')
  w.close('array')
}

function writeParam(w: SvalWriter, p: Param): void {
  switch (p.kind) {
    case 'ids':
      w.open('array', p.name)
      for (const id of p.value) w.int(id)
      w.close('array')
      break
    case 'target':
      w.open('array', p.name)
      w.int(p.value[0])
      w.string(p.value[1])
      w.close('array')
      break
    case 'sources':
      w.open('array', p.name)
      for (const [id, source] of p.value) {
        w.int(id)
        w.string(source)
      }
      w.close('array')
      break
    case 'strings':
      w.open('array', p.name)
      for (const s of p.value) w.string(s)
      w.close('array')
      break
    case 'bool':
      w.bool(p.value, p.name)
      break
    case 'int':
      w.int(p.value, p.name)
      break
    case 'float':
      w.float(p.value, p.name)
      break
    default:
      w.string(p.value, p.name)
  }
}

function writeScript(w: SvalWriter, s: AeScript): void {
  w.open('array')
  w.string(s.cls)
  w.int(s.id)
  w.vec3(s.x, s.y, 0)
  w.bool(s.enabled)
  w.int(s.triggerTimes)
  w.bool(s.executeOnStart)
  if (s.label !== undefined && s.label !== '') w.string(s.label)
  if (s.params.length > 0) {
    w.open('dict')
    for (const p of s.params) writeParam(w, p)
    w.close('dict')
  }
  if (s.connections.length > 0) {
    w.open('array')
    for (const [target, delay] of s.connections) {
      w.int(target)
      w.int(delay)
    }
    w.close('array')
  }
  w.close('array')
}
