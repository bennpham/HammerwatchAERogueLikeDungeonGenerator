# Authoring a lobby in the AE editor

A lobby is an ordinary AE editor level. The generator copies it into each lobby slot and rewrites a few parts: where the party arrives, where the exit leads, which vendors sell what, and where the starting gold and free upgrades lie.

## Importing

```sh
node scripts/import-ae-lobby.mjs "<AE root>/editor/lobbies/lobby.lvl" --id house --label "House" --description "..."
```

This embeds the level in `src/generator/lobby/templates.generated.ts`. Re-running the command with the same `--id` replaces that lobby. A template with the id `house` becomes the default lobby (`DEFAULT_LOBBY_PRESET_ID`).

## What the generator looks for

Each part is found by its script **label** first. If there is no label, the generator recognises the part by its **structure**. You never have to add a label, but a label always wins.

| Part | Label | Found by structure as | What the generator does |
|---|---|---|---|
| Arrival | `lobby:spawn` on a `LevelStart` | the `LevelStart` with no StartID | Gives it this slot's StartID. In the campaign's first slot, it also adds a default spawn at the same spot. |
| Exit | `lobby:exit` on the `LevelExit` and `SetRespawnPoint` | a `doodads/generic/teleport_*` unit | With labels, it re-points those scripts at the next slot. Without them, it builds the floors' press-F, whole-party exit on a 3x3 sensor centred on the teleporter. |
| Vendors | `lobby:vendor:<id>` on a `ShopArea` (`combo`, `defense`, `misc`, `offense`, `power`, `item`) | the `ShopArea`'s categories (`def*`, `off*`, `misc*`, `combo*`, `power`, `item`) | Sells only the columns the Lobby tab selects. A stall left with nothing to sell is switched off, along with its `UseTrigger`. A `UseTrigger` without `Areas` gets a circle sensor on its nearest `shop_*` stand. |
| Payout | `lobby:payout` on any script | the free floor around the arrival | Lays one red diamond per 500 starting gold and each free upgrade kind on its own cell. It searches outward from the spawn, at most 8 tiles, and stops at walls, doors and props. |

The generator also:
- sets the game mode to `DungeonGameMode`, because the editor saves a level opened from the main menu as `MainMenu`;
- adds the save point (when `lobbySaves` is on) and the lobby's music at the arrival.

## Checklist for a new lobby

- One `LevelStart`, with no StartID.
- A `teleport_*` unit where the party leaves. You don't need to wire it.
- A `ShopArea` for each stall, its `#PlayerTarget` pointing at the stall's `UseTrigger`. You don't need to draw use areas.
- Room around the arrival for the payout. 10,000 gold is 20 diamonds.

## Unconfirmed in game

These are on `docs/BOOT-CHECKLIST.md`:
- **Doors.** The house's `_door_1b` / `_door_1c` doors use AE's plain `Door` behaviour, with no key and no controller. It isn't confirmed that they open for the party on their own. If they don't, the portal room can't be reached.
- **Item vendor.** `ShopArea` `Type 2` (the equipment shop). Its categories must be AE loot tables, `equipment_1`–`equipment_5`; an author's `item` category is rewritten to the selected tiers.
