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
          <span className="field-label">Hammerwatch Anniversary Edition folder</span>
          <div className="path-row">
            <input
              type="text"
              placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\Hammerwatch Anniversary Edition"
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
          Delete the scenario source after packing (off keeps it in editor/generated for hand edits)
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
          title="Writes the scenario into <AE>/scenarios, packs it into a .h1c with PACKAGER.exe and removes the source folder"
        >
          Install into Hammerwatch AE
        </button>
        <button disabled={!hasResult || busy} onClick={onExportFolder} title="Export the raw scenario folder (info.xml, logos.png and the .lvl levels)">
          Export folder…
        </button>
        <button disabled={!hasResult || busy} onClick={onExportZip} title="Export the scenario folder as a .zip">
          Export .zip…
        </button>
      </div>
    </div>
  )
}
