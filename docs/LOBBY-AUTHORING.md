# Authoring a lobby in the AE editor

A lobby is an ordinary AE editor level. The generator copies it into each lobby slot and rewrites a few parts: where the party arrives, where the exit leads, which vendors sell what, and where the starting gold and free upgrades lie.

## Importing

```sh
node scripts/import-ae-lobby.mjs "<AE root>/editor/lobbies/lobby.lvl" --id house --label "House" --description "..."
```

This embeds the level in `src/generator/lobby/templates.generated.ts`. Re-running the command with the same `--id` replaces that lobby. A template with the id `house` becomes the default lobby (`DEFAULT_LOBBY_PRESET_ID`).

### Stock levels

A stock level isn't a lobby as it stands: it carries its campaign's exits, quests and flags. The stock towns have their own importer, which cleans them first (`src/generator/lobby/stockTown.ts`):

```sh
node scripts/run-ts.mjs scripts/import-stock-towns.ts            # all of them
node scripts/run-ts.mjs scripts/import-stock-towns.ts sun_bazaar # one
```

It reads each level from the install (`HWAE_ROOT`, or the default Steam path):
- Shaftlocke's `town.lvl` as the `shaftlocke_town` lobby;
- Temple of the Sun's `level_hub.lvl` as the `sun_bazaar` lobby;
- Castle Hammerwatch's `level_1.lvl` as the `castle_bridge` lobby.

The towns keep their map, vendors and arrival. The castle bridge is cut out of a dungeon level, so its cleanup (`src/generator/lobby/castleBridge.ts`) crops it, mends the bridge, closes the room and builds the shop. AE takes collision from units alone, so a room cut out of a bigger level must be closed by its own colliders: the importer flood-fills it from the arrival (`tests/closure.ts`) and writes nothing if the party could walk out or couldn't reach the exit.

Re-run the importer after changing a cleanup: `tests/stockTown.test.ts` fails while an embedded copy is out of date. To add another stock room, add a `StockTown` to `STOCK_TOWNS`.

To see a level, render it with `node scripts/render-level.mjs <level.lvl> <out.png> --crop x y w h [--collision] [--scale n]`.

## What the generator looks for

Each part is found by its script **label** first. If there is no label, the generator recognises the part by its **structure**. You never have to add a label, but a label always wins.

| Part | Label | Found by structure as | What the generator does |
|---|---|---|---|
| Arrival | `lobby:spawn` on a `LevelStart` | the `LevelStart` with no StartID | Gives it this slot's StartID. In the campaign's first slot, it also adds a default spawn at the same spot. |
| Exit | `lobby:exit` on the `LevelExit` and `SetRespawnPoint` | a `doodads/generic/teleport_*` unit | With labels, it re-points those scripts at the next slot. Without them, it builds the floors' press-F, whole-party exit on a 3x3 sensor centred on the teleporter. |
| Vendors | `lobby:vendor:<id>` on a `ShopArea` (`combo`, `defense`, `misc`, `offense`, `power`, `item`) | the `ShopArea`'s categories (`def*`, `off*`, `misc*`, `combo*`, `power`, `item`, `equipment_*`, `st_equipment_*`) | Sells only the columns the Lobby tab selects. A stall left with nothing to sell is switched off, along with its `UseTrigger`, and its stand comes down. A `UseTrigger` without `Areas` gets a circle sensor on its nearest stand: a `shop_*` stall or a Sun `npc_dungeonvendor_desert` shopkeeper, whose tier numeral becomes the highest column it sells. |
| Payout | placed red diamonds and upgrade pickups, else `lobby:payout` on any script | the free floor around the arrival | Lays one red diamond per 500 starting gold and each free upgrade kind on its own cell. Placed pickups win: they're removed, and their spots become the slots (diamonds cycle over theirs and stack; each upgrade kind lands on its own pickup's spot). A marker lays rows of six diamonds and the upgrades beside them. Otherwise it searches outward from the spawn, at most 8 tiles, and stops at walls, doors and props. |
| Music | `lobby:music` on a `PlayMusic` | (none) | The room's own track. The Lobby tab's music choice rewrites its value; without the label, a choice adds its own music rig at the arrival. |

The generator also:
- sets the game mode to `DungeonGameMode`, because the editor saves a level opened from the main menu as `MainMenu`;
- adds the lobby's music at the arrival, unless the room labels its own (no save point: AE saves on arriving at a level);
- swaps the room's blue teleporter (`teleport_mt`) for the red one when a fight follows the lobby, the way a floor's portal works. Only the castle bridge opts in (`redBeforeFight` on its template); the other rooms keep their own teleporter.

## Checklist for a new lobby

- One `LevelStart`, with no StartID.
- A `teleport_*` unit where the party leaves. You don't need to wire it.
- A `ShopArea` for each stall, its `#PlayerTarget` pointing at the stall's `UseTrigger`. You don't need to draw use areas.
- Room around the arrival for the payout. 10,000 gold is 20 diamonds.

## Unconfirmed in game

These are on `docs/BOOT-CHECKLIST.md`:
- **Doors.** The house's `_door_1b` / `_door_1c` doors use AE's plain `Door` behaviour, with no key and no controller. It isn't confirmed that they open for the party on their own. If they don't, the portal room can't be reached.
- **Item vendor.** `ShopArea` `Type 2` (the equipment shop). Its categories must be AE loot tables, `equipment_1`–`equipment_5`; an author's `item` category is rewritten to the selected tiers.
