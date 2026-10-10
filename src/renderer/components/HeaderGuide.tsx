import React, { useRef } from 'react'

/**
 * The (i) at the far left of the header: what every header control does, and
 * above all how parameters.txt and playersettings.txt differ (issue #77) —
 * two buttons that look alike but replace very different amounts of the form.
 * Static text only; same native `<dialog>` shape as `PresetGuide`.
 */
export function HeaderGuide() {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()

  return (
    <>
      <button
        type="button"
        className="preset-guide-button"
        aria-label="What do these buttons do?"
        title="What do these buttons do?"
        onClick={() => dialog.current?.showModal()}
      >
        i
      </button>
      <dialog
        ref={dialog}
        className="preset-guide header-guide"
        aria-labelledby="header-guide-title"
        onClick={(e) => {
          // a click on the dialog element itself is a click on the backdrop
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <div className="preset-guide-head">
            <h2 id="header-guide-title">The header buttons</h2>
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>

          <h3>parameters.txt vs playersettings.txt</h3>
          <table className="header-guide-table">
            <thead>
              <tr>
                <th />
                <th>parameters.txt</th>
                <th>playersettings.txt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Holds</th>
                <td>The whole campaign: Lobby, Dungeon, Arena, Floor order and Player tabs, plus your Hammerwatch folder</td>
                <td>Only the Player tab: class stats, upgrade costs, shop removals, difficulty multipliers</td>
              </tr>
              <tr>
                <th>Importing</th>
                <td>Replaces every tab</td>
                <td>Replaces only the Player tab; anything it does not list goes back to stock</td>
              </tr>
              <tr>
                <th>Use it to</th>
                <td>Save or share a campaign; configs from the original forum tool load here too</td>
                <td>Save or share a player build and drop it onto any campaign</td>
              </tr>
            </tbody>
          </table>
          <p className="header-guide-tip">
            To combine them, import <strong>parameters.txt</strong> (or load a campaign preset) <em>first</em>, then
            import <strong>playersettings.txt</strong> on top. The other way round, the campaign would overwrite
            your player build.
          </p>

          <h3>Load preset…</h3>
          <ul>
            <li>
              <strong>Campaign presets</strong> are ready-made campaigns and replace every tab, like importing a
              parameters.txt.
            </li>
            <li>
              <strong>Player presets</strong> replace only the Player tab, like importing a playersettings.txt.
            </li>
          </ul>

          <h3>Reset and Reset all</h3>
          <ul>
            <li>
              <strong>Reset</strong> (orange) resets only the left-panel tab you are looking at, which is why its
              label changes (Reset lobbies, Reset player tweaks, …). The other tabs are left alone.
            </li>
            <li>
              <strong>Reset all</strong> (red) puts every tab back to the defaults.
            </li>
            <li>
              Both ask before they do anything, and the toast afterwards has an <strong>Undo</strong>. Your
              Hammerwatch folder is kept.
            </li>
          </ul>

          <h3>AI assistant (chat icon)</h3>
          <ul>
            <li>
              Describe a campaign in plain words (“4 icy floors, a boss on the last one, lots of traps”) and it
              proposes the settings.
            </li>
            <li>
              Strictly opt-in: nothing is sent anywhere until you choose a provider and send a message. Ollama runs
              locally; the others send your prompt and current settings to that provider.
            </li>
            <li>
              Its answer is checked like an imported parameters.txt. You see what would change before you press{' '}
              <strong>Apply</strong>, and the toast afterwards has an <strong>Undo</strong>.
            </li>
            <li>
              To remove the icon, tick <em>Hide the chat icon</em> in its setup screen; <em>Show the AI preset
              assistant icon</em> in the bottom panel brings it back.
            </li>
          </ul>

          <h3>Starting defaults</h3>
          <p>
            A parameters.txt placed in the app’s user-data folder is loaded as the starting settings each time the
            app opens.
          </p>
        </div>
      </dialog>
    </>
  )
}
