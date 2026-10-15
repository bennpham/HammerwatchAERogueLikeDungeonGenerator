# Hammerwatch AE Dungeon Generator

An Electron app that generates rogue-like campaigns for **Hammerwatch Anniversary Edition only**. It writes AE `.lvl` levels, `info.xml` and `logos.png`, and packs them into a `.h1c` with the game's own `PACKAGER.exe`.

It's a fork of the HW1 remake (`HammerwatchRogueLikeDungeonGeneratorRemake`), and there's no HW1 output and no HW1 parity. The remake's notes are in `docs/reference/hw1-remake/` for history only.

## Gate

```sh
npm run typecheck && npm test
```

Both must pass before every commit. `HWAE_PACK=1 npm test -- tests/packer.test.ts` also packs a real scenario with the local `PACKAGER.exe`, then removes it.

## Layout

- `src/generator/`: the pure generator. No `fs`, `path`, `process`, Electron or DOM.
  - `ae/`: SVAL reader and writer, the `AeLevel` model, tiles (RLE), `info.xml`, and `emit.ts`, which turns context objects into units and scripts.
  - `catalog/`:
    - `aeAssets.generated.ts`: a snapshot of every unit, tileset, environment and prefab. Regenerate it with `node scripts/scan-ae-assets.mjs`.
    - `substitutions.ts`: HW1 id → AE id. Old `parameters.txt` files are translated on load.
  - `map/`: rooms, passages, AE walls (`aeWalls.ts`), reachability and the seal check.
  - `objects/`: the AE script vocabulary (`nodes.ts`), doodads, items, and the monster, projectile and buff rosters.
  - `lighting/`: wall torches and the brightness setting. The brightness setting patches the theme lighting environments, from a snapshot (`envs.generated.ts`; regenerate it with `node scripts/run-ts.mjs scripts/scan-ae-lighting.ts`).
  - `players/`: the Players tab. A snapshot of AE's `players/` balance (`stock.generated.ts`; regenerate it with `node scripts/run-ts.mjs scripts/scan-ae-players.ts`), the `player.*` keys, the quick setup, move speed, presets, and `playerOverrides`, which turns edits into line patches the install applies to the game's own files.
  - `boss/`, `dungeonBoss/`, `survival/`, `traps/`, `timer/`, `buffs/`, `mystery/`, `music/`, `lobby/`: the rigs.
- `src/main/`: Electron main. `packer.ts` does the install and AE detection.
- `src/renderer/`: React UI.
- `tests/`: the suites read emitted levels back through `tests/ae.ts`. `sealProbe.ts` flood-fills levels.
- `scripts/`: the importer `import-ae-lobby.mjs`, the asset scanner, and one-off probes in `scripts/dev/`.

## Invariants

1. **Pure and deterministic.** The same parameters and seed always produce byte-identical files.
2. **Six RNG streams:** `rand` (layout), `cosmeticRand`, `bossRand`, `trapRand`, `floorBossRand`, `mysteryRand`. A feature draws only from its own stream. An optional layer that's switched off draws nothing and allocates no id.
3. **Bounded loops.** Never raise a bound to make bad input work; add a validation rule instead.
4. **Validate, don't crash.** A new parameter needs a validation rule and a test.
5. **Every floor is finishable.** The exit is reachable and every seal opens; `sealCheck` and the reachability check enforce this.
6. **Every emitted asset path exists** in the snapshot (`aeAssetExists`).
7. **Ids are one counter per level**, shared by units and scripts. Wall units take theirs at emit time, after every object.

## AE facts that bit us

The full record is `.claude/skills/hammerwatch-ae-modding/references/DISCOVERY-LOG.md`.

- **There are no engine boss events.** Tier and death triggers are `ActorHealthTrigger` / `UnitDestroyedTrigger` over unit ids. `NodeGlobalEventTrigger` reads `ctx.bossActors` when it's constructed, so register the bosses first.
- **Toggles:** `ToggleScripts.State` is 1 enable, 2 disable. Use `NodeToggleElement.action`, never a number.
- **Exits** are press-F: `UseTrigger` → `AllPlayersArea` → `SetRespawnPoint` + `LevelExit`. AE has no `RespawnPlayers`.
- **Lives:** always 0. `info.xml` forces the `NO_LIVES` modifier; never offer lives back.
- **Player balance** is in `players/` (`classes.sval` plus a `.sval` per skill), not HW1's `tweak/*.xml`. Move speed is two shared skills (melee/ranged), not a class stat. The game's files are never stored in the repo: only line numbers and stock values are.
- **Walls:** vertical pieces anchor one row above their cell, and `h_32`/`v_32` span two cells.
- **`PACKAGER.exe`** exits 127 even on success; judge the install by the `.h1c` and its `HW1S` header.
- **Lobbies** are hand-made AE editor levels: `docs/LOBBY-AUTHORING.md`. The user's `house` is the default.

## Working here

- On this machine, Git Bash heredocs lose backslashes and `node -e` loses backticks. Write edit scripts with the Write tool, or use Edit.
- Things only playing can prove go on `docs/BOOT-CHECKLIST.md`. Facts go in the discovery log with `[VERIFIED]` / `[EMITTED]` / `[UNVERIFIED]`.
- When blocked on something the user must find out in game, write `docs/discovery/<topic>.md`.
- The AE install is at `D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch Anniversary Edition`, with assets unpacked in `unpacked_assets_66/`. Tests that need it skip without it (`tests/aeInstall.ts`).
- Commit in small, area-sized steps, each passing the gate.
