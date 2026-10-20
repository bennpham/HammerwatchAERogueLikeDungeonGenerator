---
name: hammerwatch-ae-modding
description: How Hammerwatch Anniversary Edition levels, scripts, assets and scenarios work, as this generator emits them — SVAL .lvl format, the WorldScript vocabulary and enums, press-F exits, shops, doors, boss triggers, walls, lives, PACKAGER.exe packing, and lobby templates. Load before emitting units/scripts/asset paths or touching scenario packaging. The append-only DISCOVERY-LOG.md holds the evidence.
---

# Hammerwatch AE modding — what the generator relies on

The evidence for every line is in `references/DISCOVERY-LOG.md`. Add new findings there, tagged `[VERIFIED]` / `[EMITTED]` / `[UNVERIFIED]`. Anything only playing can prove goes on `docs/BOOT-CHECKLIST.md`.

## Files

- **`.lvl`** is SVAL text. The root keys, in order: `game-mode {Class=DungeonGameMode}`, `version` 1, `lighting {environment}`, `tiles`, `units`, `scripts`, `prefabs`. Positions are pixels; a tile is 16 px.
- **Tiles** are 512-px chunks (`pos` is the centre) holding `datasets [{tileset, data-rle}]`. `__black` masks solid rock.
- **Wall-top cover** is the wall set's `__color_N` squares (layer 10, over walls and actors): the solid mass lifted 32 px and pulled in 8 px, plus a margin past the map, with the stairs' art cut out (`map/aeCover.ts`, DISCOVERY-LOG "Wall-top cover"). The bonus sets have none.
- **Units** are grouped by path: `[pos, id]` or `[pos, id, {state}]`.
- **Scripts** are `[Class, id, vec3, enabled, triggerTimes, execOnStart, label?, {params}?, [targetId, delayMs]…]`.
- **A scenario** is `scenarios/<id>/` holding `info.xml`, `logos.png` and `levels/<id>/*.lvl`. Never write `info.sval`; PACKAGER compiles it.

## Script vocabulary (`src/generator/objects/nodes.ts`)

Enums and parameter names come from `<assets>/scripts/WorldScript/**/*.as`; never guess them.

| Need | AE script | Key params |
|---|---|---|
| Arrive | `LevelStart` | `StartID` (none means the new-game spawn) |
| Leave | `UseTrigger`(Icon 6) → `AllPlayersArea` → `SetRespawnPoint` + `LevelExit` | `Areas`; `OnTrue`/`OnFalse`; `SpawnId`; `Level` + `StartID` |
| Shop | `UseTrigger`(Icon 4) → `ShopArea` | `Categories`, `Type` (0 skills, 1 power, 2 items), `#PlayerTarget` |
| Enable or disable scripts | `ToggleScripts` | `Scripts`, `State` (**1 enable, 2 disable**, 3 toggle) |
| Boss health tier | `ActorHealthTrigger` | `Units` (the boss), `Function` 2 (less), `Value` 0.75… |
| Death | `UnitDestroyedTrigger` | `Units` |
| Counting | `Variable` / `ChangeVariables` / `CheckVariables` | `Value`; `Function` (3 subtract), `Variables`; `Variable` (singular), `OnTrue` |
| Animate a unit | `SetUnitScene` | `Units`, `State` (scene) |
| Remove units | `DestroyUnits` | `Units` |
| Spawn | `SpawnUnit` | `UnitType`, `AggroEnemy` |
| Hazard / buff field | `DangerArea` | `Areas`, `Damage`, `Frequency`, `Filter` (2 players, 4 enemies, 6 both), `Buff` |
| Wall trap | `ProjectileSpewer` | `Projectile` (unit), `Direction` (degrees: 0 E, 90 S, 180 W, 270 N), `Spread` (degrees), `Frequency` (ms) |
| Music | `PlayMusic` | `Music` (FMOD mode int) |
| Save | `SuperCheckPoint` | `Name` |
| Boss bar | `CreateBossBar` | `Actors`, `Name` |
| End | `ShowGameOver` | |

There are **no engine-wide boss events**: every boss trigger lists the boss unit ids.

## Assets

- `src/generator/catalog/aeAssets.generated.ts` is the snapshot (every actor, item and doodad unit, tileset, env and prefab). Use `aeAssetExists(path)` to check a path.
- An HW1 id with no AE counterpart gets a row in `catalog/substitutions.ts`, with the reason.
- Walls are `doodads/walls/<set>/<piece>.unit`. The pieces are `h_16`/`h_32`, `v_16`/`v_32` (anchored a row up), `crn_*`, `x_*`, `cap_*` and `exit_up`/`exit_dn`. Legacy sets use `h`/`v`/`cap_n`… and the bonus sets fall back to `x_x`.

## Lives

`info.xml`'s `NO_LIVES` modifier defines `MOD_NO_LIVES`, so the party starts with 0 lives. We force it (`forced="true"`) and offer nothing that gives lives back.

## Packing

From `<AE>`, run `PACKAGER.exe -l <id>`, which writes `scenarios/<id>.h1c` (header `HW1S`). It exits 127 even on success. Remove the source folder afterwards, or the game lists the scenario twice.

## Lobbies

A lobby is an AE editor level imported with `scripts/import-ae-lobby.mjs`. Its parts are found by label or by structure (`docs/LOBBY-AUTHORING.md`). The user's `house` is the default.
