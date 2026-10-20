# Castle bridge lobby: handoff for the AE port

**Request (2026-10-20):** port the HW1 remake's **Castle Hammerwatch bridge** lobby
(`castle-bridge`, merged in bennpham/HammerwatchRogueLikeDungeonGeneratorRemake#84) to this
generator.

The machine this was written on has no AE install. The room's source,
`<AE>/scenarios/castle_hammerwatch/levels/level_1.lvl`, couldn't be read there. AE's art is
also reorganised: there's no `theme_a/a_h_16`, the bridge is
`doodads/generic/a_wood_bridge_h_*`, and the portals are `teleport_mt` / `teleport_red`. So the
HW1 room can't be translated piece by piece. This file is the spec. On a machine with the
install, read `level_1.lvl` and build the room in one pass with the steps at the end.

Tags: `[VERIFIED]` was checked in AE files or this repo, `[HW1]` is true of the HW1 remake's
room, and `[UNVERIFIED]` needs the install.

## Built (2026-10-20)

The room is the `castle_bridge` lobby: `src/generator/lobby/castleBridge.ts`, registered in
`STOCK_TOWNS`, tested in `tests/stockTown.test.ts`, the facts in the discovery log
("Castle level_1's bridge"). What only playing can prove is checklist #72–#79.

**Answers to the open questions** (all read from the install):

1. **Layout:** not HW1's. The deck is eight `doodads/walls/prison/hw_bridge.unit` pieces at
   y 162 px, x −896…−448. The piece at −448 starts in scene `2`, the broken gap. There's no
   separate collapse set piece, no ledge plug and no arch at the west end: the deck runs out
   over the void. The arrival is on the walkway east of the gap, (−320, 176). The rails are
   prison walls at y 144 and y 240. The walkway's two north doorways are corridors at
   x −432…−400 (over the gap) and −544…−528 (between two tower walls).
2. **Bridge pieces:** no collider at all. The stock level fences the deck with invisible
   solid `:Physics_Rectangle`s.
3. **Roof:** the castle has its own colour, `doodads/walls/prison/__color_N` (`#26333e`,
   layer 10, over walls and props).
4. **Glass:** `glasswalk.unit` has no collider. level_1 keeps two blue lights at the deck's
   east end, so the "hole" was probably HW1's two-light crop. **No glass is laid**;
   checklist #78 asks.
5. **Portal light:** AE does have free-standing lights: the texture placed as a unit,
   `effects/lights/light_L.png`, with colour and size state. One sits on the teleporter, in
   the castle's own blue.
6. **Music:** level_1's only `PlayMusic` is 6 (the ending's boss track); act 1 is 2.
7. **Closure:** yes, AE takes collision from units alone, as level_1's own invisible fences
   show. `tests/closure.ts` flood-fills the room; the importer fails on a leak.

**Where it differs from this spec:**

- **Coordinates:** everything is placed against AE's layout, not HW1's tile numbers.
- **Repair:** the broken piece is shown whole and a whole piece is laid over the stub; the
  stock fences that cross the deck go, with every other `:Physics_*` shape.
- **Seals:** the north doorways and the walkway's east end each get a `deco_block` backed by
  a solid rectangle; the deck gets a full-length south rail and a stop past its west end.
- **Stalls:** six, not five. The lobby contract has every room sell items, so an item stand
  stands west of the power vendor.
- **Payout:** placed diamond and upgrade spots on the walkway, since the `lobby:payout`
  pattern is taller than the walkway.
- **Music:** the act-1 `PlayMusic` is labelled `lobby:music`, and a lobby's music choice
  rewrites it rather than adding a second rig.
- **Portal colour:** opt-in per template (`redBeforeFight`). Only this room opts in; the
  house and the towns keep their own teleporter.

## The user's decisions

- **Opt-in:** never the default, and no preset uses it. `house` stays the default (CLAUDE.md).
- **Scope:** the castle bridge only. The Sun bazaar is already here (#8).
- **Route:** build it from the stock level with a cleanup, the way the Shaftlocke town and
  the Sun bazaar are built (`src/generator/lobby/stockTown.ts`). Don't hand-make it in the
  editor.

## What the room is `[HW1]`

It's the opening bridge of Castle Hammerwatch, the one that collapses under the party,
repaired and closed off as a shop. It reads like Hammerwatch 2's ruined-castle hub.
Reference code: `scripts/import-castle-bridge.mjs` in the HW1 remake. HW1 tile coordinates
are below. Check them against AE's `level_1.lvl` before trusting them: the remaster may
keep the layout, but nothing here proves it.

1. **Crop:** x −108…−52, y −14…8. Drop every script, actor, item and prefab, and the puzzle
   props, floor signs and editor markers.
2. **Repair the bridge.**
   - Remove the collapse set piece. In HW1 that's three doodads at y −3.875: the surviving
     stub at −74.5, the fallen span at −94, and the party standing on it.
   - Remove the story's ledge plug: the `TogglePhysics` target that stops anyone walking
     back onto the stub.
   - Lay an intact bridge of walkable pieces over the same span, x −94…−72.
   - Drop any stock collider that crosses the deck. In HW1 that's the chasm channel's
     ledges at x −77 and −75.5.
   - Add the support post the collapse left out of the row, at x −77.375.
3. **Stalls:** five along the bridge's north rail, east to west: combo, offense, defense,
   misc, power (x −77.5, −80.5, −83.5, −86.5, −89.5; y −2). Each shop's circle sits on the
   deck's lower lane (y −1.5).
4. **Arrival:** on the walkway just off the bridge's east end, (−69.5, −2), facing west.
5. **Way out:**
   - A portal at the bridge's west end, under the arch the bridge always led to: (−92.5, −1).
   - A 3×3 exit sensor over the deck, at (−92.5, −1.5).
   - The portal is **red into a boss fight and blue otherwise**, the rule floors follow.
6. **Seals:** close the room by colliders alone (see the closure check, item 11):
   - stone blocks in the walkway's two north doorways (arches at x −69 and −61) and across
     its east end;
   - a ledge plug in the half-tile slot between the bridge's south rail and the walkway's
     ledge.
7. **Roof:**
   - Cover everything outside a VISIBLE outline. The outline is the north wall's face from
     just under its cap row (y −5.5) down to the south wall's rim (y 0.5), plus the walkway
     with a 2-tile strip of chasm under it.
   - Drop every stock unit that lies wholly under the roof: the cut-off halls north of the
     wall, the room past the walkway, the pocket under the bridge.
   - The roof hides the wall's cap row and the arch tops, so the wall meets the roof in one
     straight line. The user asked for that after a playtest.
8. **Glass over the deck's east end:**
   - The deck from the combo stall to the walkway (x −79…−72, y −3…0) reads as a hole in game,
     though it's walkable. Its planks rendered intact, so the cause is probably unlit
     patches, since the crop keeps only two lights.
   - Lay glass panels on the whole-tile grid there. Panels never overlap (overlapping glass
     draws doubled borders) and never cover a stall's art.
9. **Portal light:** one blue light on the portal's art, so the way out is easy to see.
   HW1 values: mul 5 153 225, range 13.8; add 6 163 184, range 4.9.
10. **Music:** defaults to the level's own act-1 track.
11. **Closure check:**
    - Flood-fill from the arrival over a quarter-tile grid, treating every collider as solid
      and the exit sensor as the way out.
    - The import fails if the fill reaches the crop's edge, or never reaches the exit.
    - In HW1 the engine takes collision from doodads alone, so empty space is walkable.
12. **Payout:** starting gold and free upgrades go on the walkway, never on the narrow deck.

## Mapping onto this repo `[VERIFIED]` (as of 0bf8bdf)

- **Cleanup:**
  - Add a pure cleanup beside `cleanStockTown` in `src/generator/lobby/stockTown.ts`, with
    an entry in `STOCK_TOWNS` (id `castle_bridge`, source
    `castle_hammerwatch/levels/level_1.lvl`).
  - `scripts/import-stock-towns.ts castle_bridge` then embeds it in `templates.generated.ts`.
  - `tests/stockTown.test.ts` already holds every stock town to its contract: labelled
    stalls, triggers wired to shops, no NPCs or pickups, one open exit, no dangling ids, the
    embed matching the importer. The new room joins it.
  - The castle room crops and patches, so most of that contract will need new checks on
    top.
- **Labels `build.ts` looks for** (`docs/LOBBY-AUTHORING.md`):
  - `lobby:spawn` on the arrival `LevelStart`;
  - `lobby:exit` on the `LevelExit` and `SetRespawnPoint`, or a `doodads/generic/teleport_*`
    unit, which gets the floors' press-F, whole-party rig on a 3×3 sensor;
  - `lobby:vendor:<id>` on each `ShopArea`;
  - `lobby:payout` on the walkway.
- **Units** (all in `src/generator/catalog/aeAssets.generated.ts`):
  - **Stalls:** `doodads/generic/shop_offense`, `shop_defense`, `shop_combo`,
    `shop_health` (misc) and `shop_potion` (power). These are the `Vendor*` cases in
    `objects/doodad.ts`, which offset them `dy 0.25`.
  - **Portal:** `doodads/generic/teleport_mt.unit` (blue) and `teleport_red.unit`. These
    are the `LobbyPortal` and `BossPortal` cases in `objects/doodad.ts`.
  - **Glass:** `doodads/generic/glasswalk.unit`. There are also
    `prefabs/theme_battlements/glasswalk_ledge_h.pfb` and `_v.pfb`.
  - **Bridge:** `doodads/generic/a_wood_bridge_h_16`, `_32`, `_48` and `_64` (also `_8_*`).
    The `a_wood_bridge_h_broken_*` pieces are likely the collapse set piece.
  - **Seals:** `doodads/generic/deco_block.unit`, `_v2` and `_v3`.
  - **Roof:** the discovery log describes `doodads/walls/______dev/__color_N.unit` (N = 16…1024)
    as flat black cover with origin `0 16`. That's the likely counterpart of HW1's
    `color_theme_a_*`.
  - **Lights:** stock levels light with lamp units (`doodads/generic/lamps/torch.unit`,
    scene `n`); see the discovery log's Lighting section.
- **New code:** the portal colour.
  - `buildFromTemplate` (`src/generator/lobby/build.ts`) finds the room's teleporter but
    always keeps its art.
  - It needs to know whether the next slot is a boss fight, and swap `teleport_mt` →
    `teleport_red` when it is, the same rule `ObjectSet` gives floors.
  - The other template rooms can stay as they are, or opt in. Ask.
- **AE rules:** exits are press-F, there's no `RespawnPlayers`, lives are always 0, and ids
  are one counter per level (CLAUDE.md).

## Open questions (need the install) `[UNVERIFIED]`

1. **Layout:**
   - Does AE's `level_1.lvl` keep HW1's layout?
   - What are the units, positions (AE works in px on a 16-px grid) and labels of the bridge,
     the collapse set piece, the story's ledge plug, the arches, the walkway and its
     doorways?
   - Dump it with `node scripts/render-level.mjs <AE>/scenarios/castle_hammerwatch/levels/level_1.lvl out.png --crop … --collision`.
2. **Bridge pieces:** do the walkable `a_wood_bridge_h_*` pieces' colliders leave the deck
   open, as HW1's two railings do?
3. **Roof:**
   - Does `__color_N` draw over walls and props (HW1's roof squares are layer 90)?
   - Is there a roof unit in the castle's own colour rather than black?
4. **Glass:** does `glasswalk.unit` have a collider? HW1's `ground_glasswalk` has none. Does
   the deck's east end even look like a hole in AE, or was that a HW1 lighting artefact? If
   AE renders it fine, ask before adding glass.
5. **Portal light:** AE has no free-standing light in the snapshot. Is a lamp unit right, or
   is there a light unit or a portal scene that glows? Ask the user what "easy to see" needs.
6. **Music:** what's the act-1 `PlayMusic` value? The discovery log notes castle level_1
   id 4803 sets `Music = 6`.
7. **Closure:** does AE also take collision from units alone (empty space walkable)? The
   closure check depends on it. `tests/sealProbe.ts` flood-fills emitted levels already.

## Steps on the machine with the install

1. **Render and read.**
   - Render `level_1.lvl` around the bridge, with collision on.
   - Answer the open questions above. Record the answers in
     `.claude/skills/hammerwatch-ae-modding/references/DISCOVERY-LOG.md`.
2. **Write the cleanup** in `stockTown.ts`.
   - Locate every anchor by unit path and position.
   - Throw when one is missing, as HW1's importer does, so a changed level can't misplace a
     seal.
3. **Import:** run `node scripts/run-ts.mjs scripts/import-stock-towns.ts castle_bridge`.
4. **Wire the portal colour** in `build.ts`, with a test (blue before a floor, red before a
   fight).
5. **Tests:** the stock-town contract, plus:
   - one exit and the arrival;
   - no collapse pieces;
   - the room closed (flood fill);
   - glass on the grid and off the stalls;
   - the portal light;
   - the payout on the walkway.
6. **Gate:**
   - `npm run typecheck && npm test`;
   - `HWAE_PACK=1 npm test -- tests/packer.test.ts` with the room in a campaign;
   - render the emitted lobby with `scripts/render-level.mjs` and compare it to the HW1
     screenshots.
7. **Boot checklist:** add items to `docs/BOOT-CHECKLIST.md`:
   - arrival;
   - stalls sell the ticked columns;
   - seals hold;
   - deck walkable end to end;
   - portal leads on, red into a fight;
   - roof line straight;
   - no level_1 stubs at the edges.
