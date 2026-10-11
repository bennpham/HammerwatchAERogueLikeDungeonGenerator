---
name: hammerwatch-ae-project
description: Architecture and review bar for the Hammerwatch AE Dungeon Generator — the generation pipeline, the RNG streams, how a level becomes an AE .lvl, campaign slots and wiring, and what a change must not break. Load before planning or changing code in this repo.
---

# Hammerwatch AE Dungeon Generator — project

## Pipeline

`generateDungeon(params, seed)` (`src/generator/index.ts`) builds the campaign:

1. **Validate** (`config/validation.ts`). Invalid parameters return `{ok:false, errors}` and generation never starts.
2. **Campaign order** (`campaign.ts`): slots are floors (`floorN`), boss fights (`bossN`) and lobbies (`lobbyN`). A slot's **stem** is its file name and its arrival StartID: `levels/<scenarioId>/<stem>.lvl`. The scenario id is `dungeon_<seed>`.
3. **Floors** (`map/level.ts`): rooms, passages, room types (Entrance, Exit/Orb, Shop, vaults), then the optional layers in a fixed order: floor bosses, traps, timer, buffs, mystery plates, music. `toAeLevel()` paints tiles and emits objects, then walls.
4. **Arenas** (`boss/arena.ts`), **survival** (`survival/`), **lobbies** (`lobby/build.ts`: the generated stand-in or an imported template).
5. **Files**: one `.lvl` per slot, plus `info.xml` (start level and modifiers, with `NO_LIVES` forced) and `logos.png`.

## Emission

- Objects live in `GenerationContext` (`core/context.ts`): `doodads`, `items`, `monsters`, `sensors`, `extraUnits` and `scriptNodes`, all in 16-px tiles. `ae/emit.ts` turns them into AE units and scripts in pixels.
- Ids come from one counter per level (`ctx.idCounter`), shared by units and scripts. `emitWalls` allocates wall ids last.
- A script is a `ScriptNode` subclass in `objects/nodes.ts` whose `params()` resolves target ids at emit time. Trigger areas are `SensorShape` units (`:Physics_Rectangle` / `:Physics_Circle`), not scripts.
- Walls (`map/aeWalls.ts`): each wall-line cell gets a piece chosen by its connection mask. Runs merge into 32-px pieces. Vertical pieces anchor one row up.

## RNG streams

`rand` handles layout and population. The others each serve one layer: `cosmeticRand` (tile variants), `bossRand` (arenas), `floorBossRand`, `trapRand` and `mysteryRand`.

A layer draws only from its own stream. When it's off, it draws nothing and allocates no id. That's why turning a layer on for one floor leaves every other floor identical; the tests check this for each layer.

## Review bar

Reject a change that has any of these:
- Node, Electron or DOM in `src/generator`;
- `Math.random`, `Date`, or object key order deciding output;
- an RNG draw change that wasn't flagged;
- a new parameter without validation and a test;
- an unbounded loop;
- file contents crossing IPC;
- an asset path not in the snapshot;
- a guessed AE script enum or parameter name;
- a rig that builds boss triggers before registering `ctx.bossActors`;
- a numeric `ToggleScripts` state.

## Tests

`tests/ae.ts` reads results back: `levelsOf` gives stem → `AeLevel`, plus `scriptsOf`, `param`/`intParam`/`strParam`/`idsParam`, `placements`, `changedScripts`, `allIds` and `lvlText`. Assert on structure:
- "nothing else moved" means the same `tileCells` and `placements`, and `changedScripts(before, after)` is empty;
- an "append only" rig uses `changedScriptsBeyondAppends`.

The gate is `npm run typecheck && npm test`.
