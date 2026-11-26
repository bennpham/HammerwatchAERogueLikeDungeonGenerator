import React, { useRef, useState } from 'react'
import { BIOME_DEFS, MONSTER_TYPES, MUSIC_TRACKS, THEME_DEFS } from '../../generator'
import type { Hw2Status } from '../../shared/ipc'

interface LoadCustomDialogProps {
  hw2: Hw2Status | null
  /** pick a folder (main saves it); resolves with its status, or null when cancelled */
  onPick: () => Promise<void>
  onUnload: () => Promise<void>
  disabled?: boolean
}

const countHw2 = (defs: ReadonlyArray<{ id: string }>): number => defs.filter((d) => d.id.startsWith('hw2_')).length

/**
 * The header's blue "Load custom" button and its dialog (experimental). For
 * now the one source is a Hammerwatch 2 install: loaded, the Dungeon, Arena
 * and World tabs offer HW2 themes, monsters and music, and installs copy the
 * HW2 files a campaign uses into its pack. Unloaded, none of it is shown.
 * Custom asset folders and presets come later, in this same dialog.
 */
export function LoadCustomDialog({ hw2, onPick, onUnload, disabled }: LoadCustomDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [working, setWorking] = useState(false)
  const close = () => dialog.current?.close()
  const run = (fn: () => Promise<void>) => async () => {
    setWorking(true)
    try {
      await fn()
    } finally {
      setWorking(false)
    }
  }
  const loaded = hw2?.ok === true
  // only what the registries hold so far
  const counts = (
    [
      [countHw2(THEME_DEFS), 'themes'],
      [countHw2(MONSTER_TYPES), 'monsters'],
      [countHw2(BIOME_DEFS), 'World biomes'],
      [countHw2(MUSIC_TRACKS), 'music tracks']
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`)

  return (
    <>
      <button
        type="button"
        className="custom"
        disabled={disabled}
        title="Load content from other games (experimental)"
        onClick={() => dialog.current?.showModal()}
      >
        Load custom{loaded ? ' · HW2' : ''}
      </button>
      <dialog
        ref={dialog}
        className="preset-guide load-custom"
        aria-labelledby="load-custom-title"
        onClick={(e) => {
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <div className="preset-guide-head">
            <h2 id="load-custom-title">Load custom content</h2>
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="preset-guide-note">
            Experimental. Content from another game you own, offered beside AE&apos;s own. A scenario that uses it
            carries copies of the files it needs, read from your install.
          </p>

          <section className="load-custom-source">
            <h3>Hammerwatch 2</h3>
            <p className="preset-guide-note">
              Offers HW2 content beside AE&apos;s: {counts.join(', ')}. Choose the folder with <code>HW2.exe</code>,
              e.g. <code>…\steamapps\common\Hammerwatch 2</code>.
            </p>
            <div className="load-custom-path">
              <input type="text" readOnly value={hw2?.path ?? ''} placeholder="not loaded" aria-label="Hammerwatch 2 folder" />
              <button type="button" disabled={disabled || working} onClick={run(onPick)}>
                Browse…
              </button>
              <button type="button" disabled={disabled || working || hw2 === null} onClick={run(onUnload)}>
                Unload
              </button>
            </div>
            {hw2 !== null && <p className={hw2.ok ? 'load-custom-status ok' : 'load-custom-status bad'}>{hw2.message}</p>}
            {loaded && (
              <p className="preset-guide-note">
                HW2 options now show on the Dungeon and Arena tabs, marked <strong>(HW2)</strong>. Bosses and
                ported music come later: see <code>docs/discovery/hammerwatch-2-spikes.md</code>.
              </p>
            )}
          </section>
        </div>
      </dialog>
    </>
  )
}
