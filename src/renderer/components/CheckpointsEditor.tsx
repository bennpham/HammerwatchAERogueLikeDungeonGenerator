import React from 'react'
import type { BossCheckpointPreset } from '../../generator'

/**
 * Shape shared by an arena's `BossArenaOptions['checkpoints']` and a dungeon
 * floor's `DungeonBoss['checkpoints']` — the same two milestone presets.
 */
export interface Checkpoints {
  respawnPlayers: BossCheckpointPreset
  saveGame: BossCheckpointPreset
}

/** Dropdown order for both fields — Never first, then presets in increasing scope. */
export const CHECKPOINT_PRESET_IDS: BossCheckpointPreset[] = ['never', '50', '75-50-25', '75-50-25-dead']

export const CHECKPOINT_PRESET_LABELS: Record<BossCheckpointPreset, string> = {
  never: 'Never',
  '50': '50% only',
  '75-50-25': '75%, 50%, 25%',
  '75-50-25-dead': '75%, 50%, 25%, boss dead'
}

/** Short form for the section badge — same ids, tighter text. */
export const CHECKPOINT_PRESET_SHORT: Record<BossCheckpointPreset, string> = {
  never: 'never',
  '50': '50%',
  '75-50-25': '75/50/25',
  '75-50-25-dead': '75/50/25/dead'
}

/** Section-header summary: `off`, or whichever of the two fields are on. */
export function checkpointBadge(checkpoints: Checkpoints): string {
  const parts = [
    checkpoints.respawnPlayers !== 'never' && `respawn ${CHECKPOINT_PRESET_SHORT[checkpoints.respawnPlayers]}`,
    checkpoints.saveGame !== 'never' && `save ${CHECKPOINT_PRESET_SHORT[checkpoints.saveGame]}`
  ].filter((s): s is string => s !== false)
  return parts.length === 0 ? 'off' : parts.join(' · ')
}

interface CheckpointsEditorProps {
  checkpoints: Checkpoints
  onChange: (checkpoints: Checkpoints) => void
}

/**
 * Two independent milestone presets: which ones pull dead/lagging players
 * back into the fight, and which ones move the respawn point and write a
 * save. A milestone picked by both gets one shared trigger. Both set to
 * "Never" emits nothing at all — no trigger, no Checkpoint node.
 */
export function CheckpointsEditor({ checkpoints, onChange }: CheckpointsEditorProps) {
  return (
    <>
      <p className="hint">
        Respawn will teleport all players back to dungeon start point with full health and mana once the boss health reaches the designated threshold.<br/><br/>Save game may have a bug where if you previously die at the previous threshold, the host loading the game will load you dead instead of respawned (this is a game limitation). If you want to avoid this, set the save game to "Never" and only use respawn although you'll start the boss fight from the beginning of the fight instead of the threshold you set.
      </p>
      <label className="field">
        <span className="field-label">Respawn player</span>
        <select
          value={checkpoints.respawnPlayers}
          onChange={(e) => onChange({ ...checkpoints, respawnPlayers: e.target.value as BossCheckpointPreset })}
        >
          {CHECKPOINT_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {CHECKPOINT_PRESET_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="field checkpoint-fields">
        <span className="field-label">Save game</span>
        <select
          value={checkpoints.saveGame}
          onChange={(e) => onChange({ ...checkpoints, saveGame: e.target.value as BossCheckpointPreset })}
        >
          {CHECKPOINT_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {CHECKPOINT_PRESET_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
