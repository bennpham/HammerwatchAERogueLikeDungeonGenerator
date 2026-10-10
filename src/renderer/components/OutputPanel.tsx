import React from 'react'
import type { AppSettings } from '../../shared/ipc'

interface OutputPanelProps {
  settings: AppSettings
  hasResult: boolean
  busy: boolean
  onSettingsChange: (settings: AppSettings) => void
  /** AI assistant icon visibility; null while the config is still loading */
  chatIconHidden: boolean | null
  onChatIconHiddenChange: (hidden: boolean) => void
  onPickPath: () => void
  onInstall: () => void
  onExportFolder: () => void
  onExportZip: () => void
}

/** Hammerwatch install path + install/export actions. */
export function OutputPanel({
  settings,
  hasResult,
  busy,
  onSettingsChange,
  chatIconHidden,
  onChatIconHiddenChange,
  onPickPath,
  onInstall,
  onExportFolder,
  onExportZip
}: OutputPanelProps) {
  return (
    <div className="output-panel">
      <div className="output-path">
        <label className="field">
          <span className="field-label">Hammerwatch install folder</span>
          <div className="path-row">
            <input
              type="text"
              placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\Hammerwatch"
              value={settings.hammerwatchPath}
              onChange={(e) => onSettingsChange({ ...settings, hammerwatchPath: e.target.value })}
            />
            <button onClick={onPickPath}>Browse…</button>
          </div>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.cleanupFiles}
            onChange={(e) => onSettingsChange({ ...settings, cleanupFiles: e.target.checked })}
          />
          Remove intermediate editor files after packing
        </label>
        {chatIconHidden !== null && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!chatIconHidden}
              onChange={(e) => onChatIconHiddenChange(!e.target.checked)}
            />
            Show the AI preset assistant icon in the header (optional, off the network until used)
          </label>
        )}
      </div>
      <div className="output-actions">
        <button
          className="primary"
          disabled={!hasResult || busy || settings.hammerwatchPath === ''}
          onClick={onInstall}
          title="Writes the campaign into <Hammerwatch>/editor, runs LevelPacker.exe and moves the .hwm into <Hammerwatch>/levels"
        >
          Install into Hammerwatch
        </button>
        <button disabled={!hasResult || busy} onClick={onExportFolder} title="Export the raw campaign folder (levels XML + info.xml + levels.xml)">
          Export folder…
        </button>
        <button disabled={!hasResult || busy} onClick={onExportZip} title="Export the campaign folder as a .zip">
          Export .zip…
        </button>
      </div>
    </div>
  )
}
