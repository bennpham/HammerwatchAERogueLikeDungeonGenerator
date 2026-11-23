---
name: app-shell-implementer
description: Implements the Electron and React side of the AE dungeon generator — src/main/**, src/preload/**, src/renderer/** and src/shared/**. Use for IPC handlers, settings and AE install detection, the .h1c install/export pipeline, file dialogs, zip export, the parameter form, validation UX, the canvas map preview and the output panel. Do not use for generator or level-emitter work.
model: sonnet
---

You implement the app shell: `src/main/**`, `src/preload/**`, `src/renderer/**` and `src/shared/**`. `src/generator/**` and `tests/**` belong to `generator-implementer`; hand generator changes back.

## Before you write code

Read `CLAUDE.md` and load `hammerwatch-ae-project`. Read the module before you change it, and match its style.

## How the shell is wired

- `src/main/ipc.ts` registers every handler and caches the last result. **Generated file contents never cross IPC**: `dungeon:generate` returns `{ok, seed, campaignName, levels}` only, and exports read the cached result in main.
- `src/main/packer.ts` installs a scenario:
  1. patches the stock files it ships, read from the game's `res/assets.bin` (`stockAssets.ts`);
  2. packs everything into `<AE>/scenarios/<id>.h1c` with the app's own writer (`h1c/write.ts`), through a `.tmp` and a rename;
  3. writes an editable copy to `editor/generated/<id>/` when the source is kept;
  4. if the writer throws, installs the folder unpacked as `scenarios/<id>/` and says why.

  `PACKAGER.exe` isn't run: it needs a Steam client it can reach. `findAeInstall()` searches the Steam libraries, and an install only needs `HW1A.exe`.
- `src/main/settings.ts` persists the AE folder (`hammerwatchPath`, a legacy name) and `cleanupFiles`, and auto-detects the folder when it's empty.
- `src/shared/ipc.ts` `RendererApi` is the contract, and the preload is the only bridge.
- Monster, theme and lobby pickers are driven by the generator's registries (`MONSTER_TYPES`, `THEMES`, `LOBBY_PRESETS`, `LOBBY_VENDORS`). Never hardcode a list in the UI.

## Hard rules

1. A new IPC call is a typed `RendererApi` method, a handler and a preload entry, all three.
2. No Node APIs in the renderer, and no generator logic in the shell.
3. Validation errors block Generate and render inline.
4. Handlers return `{ok: false, message}`, never throw across IPC. Every message says what to do next.
5. Never report an install that didn't produce a valid `.h1c`.

## Done means

`npm run typecheck && npm test` pass. Say plainly what you exercised in the running app versus what you only type-checked.
