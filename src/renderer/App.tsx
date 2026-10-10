import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  arenaMode,
  campaignPresetById,
  defaultParameters,
  floorMystery,
  playerPresetById,
  pruneTweaks,
  validateParameters
} from '../generator'
import type { DungeonParameters, PlayerTweaks } from '../generator'
import type { AppSettings, GenerateResponse } from '../shared/ipc'
import { ParameterForm } from './components/ParameterForm'
import { PlayerForm } from './components/PlayerForm'
import { LobbyForm } from './components/LobbyForm'
import { BossForm } from './components/BossForm'
import { FloorOrderEditor } from './components/FloorOrderEditor'
import { LevelPreview } from './components/LevelPreview'
import { LoadoutSheet } from './components/LoadoutSheet'
import { OutputPanel } from './components/OutputPanel'
import { PresetGuide } from './components/PresetGuide'
import { HeaderGuide } from './components/HeaderGuide'
import { ConfirmButton } from './components/ConfirmButton'
import { PresetChat } from './components/PresetChat'
import type { LlmConfig } from '../shared/llm/types'

interface Toast {
  kind: 'ok' | 'error' | 'info'
  text: string
  /** shown as an Undo button when present */
  undo?: () => void
}

export function App() {
  const [params, setParams] = useState<DungeonParameters>(defaultParameters)
  const [settings, setSettings] = useState<AppSettings>({ hammerwatchPath: '', cleanupFiles: true })
  const [seedInput, setSeedInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  // null until main answers; the chat icon is not drawn before then
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(null)
  // the lobby is where a run starts, so it is where the app opens; the dungeon
  // and player passes are the optional ones
  const [leftTab, setLeftTab] = useState<'lobby' | 'dungeon' | 'boss' | 'order' | 'player'>('lobby')
  const [rightTab, setRightTab] = useState<'preview' | 'loadout'>('preview')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const validation = useMemo(() => validateParameters(params), [params])
  const tweakCount = useMemo(
    () => Object.keys(pruneTweaks(params.playerTweaks ?? {})).length,
    [params.playerTweaks]
  )

  const dungeonTabBadge = useMemo(() => {
    const bossCount = (params.levelBoss ?? []).slice(0, params.levels).filter((b) => b.enabled).length
    const mysteryCount = Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, i) => floorMystery(params, i)).filter(
      (f) => f !== undefined
    ).length
    return [
      `${params.levels} floors`,
      bossCount > 0 && `${bossCount} boss`,
      mysteryCount > 0 && `${mysteryCount} mystery`
    ]
      .filter((p): p is string => p !== false)
      .join(' · ')
  }, [params.levels, params.levelBoss, params.levelMystery, params.mysteryButtons])

  const arenaTabBadge = useMemo(() => {
    if (!params.boss.enabled) return 'off'
    const fights = params.boss.fights ?? []
    if (fights.length === 0) return 'off'
    const bossCount = fights.filter((f) => arenaMode(f) === 'boss').length
    const survivalCount = fights.length - bossCount
    const parts = [
      bossCount > 0 && `${bossCount} boss`,
      survivalCount > 0 && `${survivalCount} survival`
    ].filter((p): p is string => p !== false)
    return parts.join(' · ')
  }, [params.boss])

  const showToast = (kind: Toast['kind'], text: string, undo?: () => void) => {
    setToast({ kind, text, undo })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    window.api.getInitialState().then((initial) => {
      setParams(initial.params)
      setSettings(initial.settings)
      if (initial.paramsSource === 'parameters.txt override') {
        const unknown =
          initial.unknownKeys.length > 0 ? ` (ignored unknown keys: ${initial.unknownKeys.join(', ')})` : ''
        showToast('info', `Loaded defaults from parameters.txt override${unknown}`)
      }
    })
    // reads a local file only; the assistant makes no request until a message is sent
    window.api.llmGetConfig().then(setLlmConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistSettings = (next: AppSettings) => {
    setSettings(next)
    void window.api.saveSettings(next)
  }

  const generate = async () => {
    if (!validation.valid) return
    let seed: number | undefined
    if (seedInput.trim() !== '') {
      seed = Number(seedInput.trim())
      if (!Number.isSafeInteger(seed)) {
        showToast('error', 'Seed must be a whole number.')
        return
      }
    }
    setBusy(true)
    try {
      const response = await window.api.generate(params, seed)
      if (response.ok) {
        setResult(response)
        setSeedInput(String(response.seed))
        showToast('ok', `Generated ${response.levels.length} levels (seed ${response.seed}).`)
      } else {
        setResult(null)
        showToast('error', response.errors.join(' '))
      }
    } finally {
      setBusy(false)
    }
  }

  const rerollSeed = () => {
    setSeedInput(String(Math.floor(Math.random() * 2 ** 31)))
  }

  const setTweaks = (playerTweaks: PlayerTweaks) => {
    setParams({ ...params, playerTweaks })
  }

  /**
   * Resets whichever tab you are looking at, leaving the others alone.
   * Confirmed in `ConfirmButton` first, and the toast still offers an Undo —
   * one tab can hold a lot of careful work.
   */
  const resetDefaults = () => {
    const previous = params
    let next: DungeonParameters
    let message: string
    if (leftTab === 'player') {
      // the default, not `{}`: it carries the extra-life removal, and this
      // generator's campaigns never sell lives
      next = { ...params, playerTweaks: defaultParameters().playerTweaks }
      message = 'Player tweaks reset to defaults — extra lives stay out of the shop.'
    } else if (leftTab === 'lobby') {
      next = { ...params, lobbies: defaultParameters().lobbies }
      message = 'Lobbies reset to defaults.'
    } else if (leftTab === 'boss') {
      next = { ...params, boss: defaultParameters().boss }
      message = 'Arena tab reset to defaults.'
    } else if (leftTab === 'order') {
      // Absent IS the default order, so resetting means dropping the key.
      next = { ...params }
      delete next.levelOrder
      message = 'Floor order reset — every floor, then every boss fight.'
    } else {
      next = { ...defaultParameters(), playerTweaks: params.playerTweaks, lobbies: params.lobbies, boss: params.boss }
      message = 'Dungeon parameters reset to defaults.'
    }
    setParams(next)
    showToast('info', message, () => {
      setParams(previous)
      showToast('info', 'Undid the reset.')
    })
  }

  /** The per-tab Reset's label and the tab name its confirm dialog names. */
  const resetTab = {
    player: { label: 'Reset player tweaks', tab: 'Player' },
    lobby: { label: 'Reset lobbies', tab: 'Lobby' },
    boss: { label: 'Reset arena tab', tab: 'Arena' },
    order: { label: 'Reset floor order', tab: 'Floor order' },
    dungeon: { label: 'Reset defaults', tab: 'Dungeon' }
  }[leftTab]

  /**
   * Every tab back to `defaultParameters()` — what the app opens with when no
   * parameters.txt override exists. Confirmed in `ConfirmButton` first, and
   * the toast still offers an Undo. App settings (the Hammerwatch folder) are
   * not parameters and are left alone.
   */
  const resetAll = () => {
    const previous = params
    setParams(defaultParameters())
    showToast('info', 'Every tab reset to the defaults.', () => {
      setParams(previous)
      showToast('info', 'Restored your settings from before Reset all.')
    })
  }

  /**
   * Presets are a full parameter baseline, not a patch: picking one replaces
   * everything on the Dungeon, Player and Lobby tabs. The header never shows
   * which preset was loaded, because the very next edit to any field would
   * make that label a lie.
   */
  const applyPreset = (id: string) => {
    const preset = campaignPresetById(id)
    if (preset === undefined) return
    const next = preset.build()
    setParams(next)
    const lost = tweakCount > 0 ? ' Player tweaks were cleared.' : ''
    showToast('ok', `Loaded the ${preset.label} preset — ${next.levels} floors.${lost}`)
  }

  /**
   * A player preset replaces only the Player tab — the same shape as importing
   * a playersettings.txt, Undo included.
   */
  const applyPlayerPreset = (id: string) => {
    const preset = playerPresetById(id)
    if (preset === undefined) return
    const previous = params.playerTweaks ?? {}
    setParams({ ...params, playerTweaks: preset.build() })
    showToast('ok', `Loaded the ${preset.label} player preset.`, () => {
      setParams((current) => ({ ...current, playerTweaks: previous }))
      showToast('info', 'Restored the previous player settings.')
    })
  }

  /**
   * The AI assistant's Apply: the same replace-the-params path as a preset, but
   * the toast carries an Undo that puts the previous parameters back.
   */
  const applyAssistantProposal = (next: DungeonParameters, changedKeys: number) => {
    const previous = params
    setParams(next)
    showToast('ok', `Applied the assistant's proposal — ${changedKeys} setting${changedKeys === 1 ? '' : 's'} changed.`, () => {
      setParams(previous)
      showToast('info', 'Undid the assistant\'s changes.')
    })
  }

  const setChatIconHidden = async (hideIcon: boolean) => {
    if (llmConfig === null) return
    setLlmConfig(await window.api.llmSaveConfig({ ...llmConfig, hideIcon }))
  }

  const importParams = async () => {
    const imported = await window.api.importParametersTxt()
    if (imported === null) return
    if (!imported.ok || !imported.params) {
      showToast('error', imported.message)
      return
    }
    setParams(imported.params)
    if (imported.hammerwatchPath !== undefined || imported.cleanupFiles !== undefined) {
      persistSettings({
        hammerwatchPath: imported.hammerwatchPath ?? settings.hammerwatchPath,
        cleanupFiles: imported.cleanupFiles ?? settings.cleanupFiles
      })
    }
    const unknown =
      imported.unknownKeys && imported.unknownKeys.length > 0
        ? ` Ignored unknown keys: ${imported.unknownKeys.join(', ')}.`
        : ''
    showToast('ok', `${imported.message}.${unknown}`)
  }

  const exportParams = async () => {
    const exported = await window.api.exportParametersTxt(params)
    showToast(exported.ok ? 'ok' : 'info', exported.message)
  }

  /**
   * playersettings.txt replaces the Player tab and nothing else, so it layers
   * onto whatever campaign parameters.txt or a preset set up. Undo puts the
   * previous player tweaks back.
   */
  const importPlayerSettings = async () => {
    const imported = await window.api.importPlayerSettingsTxt()
    if (imported === null) return
    if (!imported.ok || !imported.tweaks) {
      showToast('error', imported.message)
      return
    }
    const previous = params.playerTweaks ?? {}
    setParams({ ...params, playerTweaks: imported.tweaks })
    const unknown =
      imported.unknownKeys && imported.unknownKeys.length > 0
        ? ` Ignored unknown keys: ${imported.unknownKeys.join(', ')}.`
        : ''
    const ignored = imported.ignoredKeys?.length ?? 0
    const nonPlayer = ignored > 0 ? ` Skipped ${ignored} non-player key${ignored === 1 ? '' : 's'}.` : ''
    showToast('ok', `${imported.message}.${unknown}${nonPlayer}`, () => {
      setParams((current) => ({ ...current, playerTweaks: previous }))
      showToast('info', 'Restored the previous player settings.')
    })
  }

  const exportPlayerSettings = async () => {
    const exported = await window.api.exportPlayerSettingsTxt(params.playerTweaks ?? {})
    showToast(exported.ok ? 'ok' : 'info', exported.message)
  }

  const runAction = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true)
    try {
      const actionResult = await action()
      showToast(actionResult.ok ? 'ok' : 'error', actionResult.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Hammerwatch Dungeon Generator</h1>
          <p className="subtitle">Rogue-like campaign generator — remake of the classic forum tool</p>
        </div>
        <div className="header-actions">
          <HeaderGuide />
          {llmConfig !== null && !llmConfig.hideIcon && (
            <PresetChat
              params={params}
              config={llmConfig}
              onConfigChange={setLlmConfig}
              onApply={applyAssistantProposal}
              disabled={busy}
            />
          )}
          <PresetGuide onLoad={applyPreset} onLoadPlayer={applyPlayerPreset} disabled={busy} />
          {/* two rows, in the order they layer: the campaign, then a player build on top */}
          <div className="file-actions">
            <button onClick={importParams} disabled={busy}>Import parameters.txt</button>
            <button onClick={exportParams} disabled={busy}>Export parameters.txt</button>
            <button onClick={importPlayerSettings} disabled={busy} title="Replaces only the Player tab">
              Import playersettings.txt
            </button>
            <button onClick={exportPlayerSettings} disabled={busy} title="Saves only the Player tab">
              Export playersettings.txt
            </button>
          </div>
          <div className="reset-actions">
            <ConfirmButton
              label={resetTab.label}
              variant="warning"
              title={`Reset the ${resetTab.tab} tab to the defaults`}
              heading={`Reset the ${resetTab.tab} tab?`}
              body={
                <>
                  This puts everything on the <strong>{resetTab.tab}</strong> tab back to the defaults. The other
                  tabs are left alone. Anything you have not exported will be lost, unless you press Undo right
                  afterwards.
                </>
              }
              confirmLabel={resetTab.label}
              disabled={busy}
              onConfirm={resetDefaults}
            />
            <ConfirmButton
              label="Reset all"
              variant="danger"
              title="Reset every tab to the defaults"
              heading="Reset everything?"
              body="This puts the Lobby, Dungeon, Arena, Floor order and Player tabs back to the defaults. Anything you have not exported to parameters.txt will be lost, unless you press Undo right afterwards."
              confirmLabel="Reset everything"
              disabled={busy}
              onConfirm={resetAll}
            />
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="left-panel">
          <div className="panel-tabs">
            <button
              className={leftTab === 'lobby' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('lobby')}
            >
              Lobby
              {params.lobbies.length > 0 && <span className="tab-count">on</span>}
            </button>
            <button
              className={leftTab === 'dungeon' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('dungeon')}
            >
              Dungeon
              <span className="tab-count">{dungeonTabBadge}</span>
            </button>
            <button
              className={leftTab === 'boss' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('boss')}
            >
              Arena
              <span className="tab-count">{arenaTabBadge}</span>
            </button>
            <button
              className={leftTab === 'order' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('order')}
            >
              Floor order
              {params.levelOrder !== undefined && <span className="tab-count">custom</span>}
            </button>
            <button
              className={leftTab === 'player' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('player')}
            >
              Player
              {tweakCount > 0 && <span className="tab-count">{tweakCount}</span>}
            </button>
          </div>

          {leftTab === 'dungeon' && (
            <ParameterForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'player' && (
            <PlayerForm
              tweaks={params.playerTweaks ?? {}}
              issues={validation.errors}
              onChange={setTweaks}
            />
          )}
          {leftTab === 'lobby' && (
            <LobbyForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'boss' && (
            <BossForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'order' && (
            <FloorOrderEditor params={params} issues={validation.errors} onChange={setParams} />
          )}
        </aside>

        <main className="right-panel">
          <div className="generate-bar">
            <label className="seed-field">
              <span className="field-label">Seed (blank = random)</span>
              <div className="path-row">
                <input
                  type="text"
                  placeholder="random"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                />
                <button onClick={rerollSeed} title="Roll a new random seed">🎲</button>
              </div>
            </label>
            <button className="primary generate-button" disabled={busy || !validation.valid} onClick={generate}>
              {busy ? 'Working…' : 'Generate dungeon'}
            </button>
          </div>

          {validation.errors.length > 0 && (
            <div className="banner banner-error">
              <strong>Fix before generating:</strong>
              <ul>
                {validation.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <div className="banner banner-warning">
              <ul>
                {validation.warnings.map((warning, i) => (
                  <li key={i}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel-tabs">
            <button
              className={rightTab === 'preview' ? 'tab active' : 'tab'}
              onClick={() => setRightTab('preview')}
            >
              Dungeon preview
            </button>
            <button
              className={rightTab === 'loadout' ? 'tab active' : 'tab'}
              onClick={() => setRightTab('loadout')}
            >
              Loadout
              {tweakCount > 0 && <span className="tab-count">{tweakCount}</span>}
            </button>
          </div>

          {rightTab === 'preview' ? (
            <LevelPreview levels={result?.levels ?? []} seed={result?.seed ?? null} />
          ) : (
            <LoadoutSheet tweaks={params.playerTweaks ?? {}} />
          )}

          <OutputPanel
            settings={settings}
            hasResult={result !== null}
            busy={busy}
            onSettingsChange={persistSettings}
            chatIconHidden={llmConfig?.hideIcon ?? null}
            onChatIconHiddenChange={setChatIconHidden}
            onPickPath={async () => {
              const picked = await window.api.pickHammerwatchPath()
              if (picked !== null) persistSettings({ ...settings, hammerwatchPath: picked })
            }}
            onInstall={() => runAction(() => window.api.installToHammerwatch())}
            onExportFolder={() => runAction(() => window.api.exportFolder())}
            onExportZip={() => runAction(() => window.api.exportZip())}
          />
        </main>
      </div>

      {toast && (
        <div className={`toast toast-${toast.kind}`}>
          {toast.text}
          {toast.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                toast.undo?.()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
