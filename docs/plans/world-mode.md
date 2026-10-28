# World mode — plan

Status: **pass 1 implemented and verified in game** (2026-10-28, `docs/BOOT-CHECKLIST.md` #96–#101). Pass 1 covers
the slot, the World tab, five biomes, the cliff coast and fence, sites, trails (off by default), scatter, buttons
and bosses, the portal frame and the orb, packs, ambushes, loot, the timer, music, and the `camp`/`bare` starts.
**Pass 2** is implemented (2026-10-28, checklist #102–#107): monster themes, mystery plates and the treasure hunt,
ambush shortcuts and types, whole-world presets, the village start and landmarks. PR #15 stays open until the World
content is done. The in-game questions are in `docs/discovery/world-mode.md`.

**Custom content is out of scope until after the 1.0 release** (the user's call, 2026-10-28): no custom tilesets,
doodads, content packs or defs loaded from disk. Don't plan or build it before 1.0.

Where pass 1 differs from the design below: the coast is drawn at tile resolution (cleaned until every coast cell
has a piece), not on a 32-px grid; the hub is `random | camp | bare`; ambushes attack at once; and the portal is
always the empty frame (the `appear` style below was dropped, 2026-10-28).

## Context

Before the full release, the user wants a third campaign kind beside **Dungeon** and **Arena**: **World**, an open
island to explore. The party starts at the center beside an empty portal frame. Around the island are objectives,
floor buttons to press and bosses to kill. When the last one is done, the portal appears at the center and the party
walks back to it ("a treasure hunt, and monsters are lurking"). The island's edge is cliffs with water beyond.

Run the phases below in order, one area-sized commit each. Each commit passes `npm run typecheck && npm test`. Start
with P0: the in-game answers decide the edge set and the collision belt.

### What the user decided

- **World is a new slot kind** (`W1`, `W2`, …). Floor order can place it anywhere, and there can be several. Its
  portal leads to the next slot, or ends the campaign with the victory orb when it's last.
- **Size:** 192×192 tiles by default. Very large maps are allowed (validated cap, see below).
- **One biome per world**, picked by the player. The biomes are grass, woods, desert and mud, plus snow.
- **Walk back** to the portal once everything is done. There are no recall pads.
- **Not rooms and passages.** A terrain generator builds the world.
- **The start varies.** It's a village, a tent camp, or the middle of nowhere.
- **Encounters:**
  - floor buttons that spawn monsters or loot;
  - **ambush tripwires**, where walking through a spot makes monsters jump the party;
  - roaming packs;
  - boss sites;
  - an optional **timer**.
- **The portal is an empty frame** that comes alive when the objectives are done.
- **Stock AE assets only.** mistdeep is layout reference only. Custom tilesets and doodads are post-1.0 (see the
  status above).
- The user will plan the same feature for original Hammerwatch separately. There, desert and pyramids, HW1 theme `h`,
  is likely the only outdoor set.

### From the discovery answers (2026-10-27, `docs/discovery/world-mode.md`)

These are preferences, not in-game proof. The probe still has to show them.

- **Portal:** the default is `frame` (`closed` → `open`). The user observed that a hidden portal doesn't react to F.
- **Ambushes:** monsters attack straight away, with no wait period.
- **Shore:** the cliff face alone, with no shore doodads at first. The user will give feedback once it's built.
- **Biomes:** all five ship (grass, woods, desert, mud, snow).
- **Coast look, performance and the minimap:** unanswered. Build it and see.

## Research findings (evidence)

### Proven stock patterns to copy

- **Portal reveal (the stock pre-boss pattern).** `scenarios/castle_hammerwatch/levels/level_12.lvl:9769` places a
  `doodads/generic/teleport_mt.unit` (id 2134) with `hidden: t`. Line 27490 has a `HideUnit` node with `State 2`, and
  `scripts/WorldScript/Units/HideUnit.as` says 1 hides, **2 shows** and 3 toggles.
- **The empty frame.** `teleport_mt.unit` has a `closed` scene: the base, an empty arch frame and the minimap
  `teleport_off`. It also has `open`, which adds the swirl, a light, the blue front effect and `teleport_on`.
  Lobbies already switch it to `open` through `NodeChangeDoodadState` (`SetUnitScene`) in
  `src/generator/objects/nodes.ts:313`.
- **The two reveal styles** become a parameter:
  - `frame` (default): `closed` → `open`.
  - `appear`: hidden → `HideUnit` Show.
- **Ambush tripwire.** In the HW1 `Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_yard.xml`, an
  `AreaTrigger` sits on a thin `RectangleShape` (15×1, types 15). It fires `PlaySound` and about a dozen
  `SpawnObject`s, each with trigger-times 1, placed around the strip (monsters and `actors/spawners/*`). The AE
  equivalent already exists as the mystery-plate payload (`src/generator/mystery/rig.ts:179–235`, `SpawnUnit`
  around a point). That file has 1,462 `SpawnObject`s, so heavy scripted spawning is fine.
- **The map edge in stock outdoor levels.**
  - Shaftlocke `town.lvl` rims a plateau with `doodads/cliffs/granite2` faces (1,148 `s_32`) plus
    `granite/___shadow`, and fences it with 121 `:Physics_Freeform` and 11 rectangles.
  - The sun-temple hub uses `walls/desert` (cliff-look) and `walls/pyramid_outside`.
  - mistdeep closes everything with dense non-colliding trees over void, plus solid and sensor physics shapes.
- **The water edge.**
  - `tilesets/water_clear` and `water_river_clear` are 8 px, layer −40, and **block nothing**.
  - The shore art is `doodads/ledges/___water/water_clear_*` and `terrain/water_coastline`, `water_rock_*`,
    `water_seagrass`, `flower_lily_pad`.
  - Collision comes from units only (CLAUDE.md), so the coast must be fenced.

### Stock asset pool for biomes (`unpacked_assets_66/`)

- **Cliff sets** `doodads/cliffs/{granite,granite2,basalt,silt}` are complete mask sets:
  - `n/s/e/w_16|_32`;
  - outer corners `ne/nw/se/sw`;
  - inner corners `*_i`;
  - caps, ramps, `_stairs` and `_exit*`.

  `s_32` collides as a shoot-through rect `0 -40 32 40`.
- **Ground:**
  - grass: `grass_{1..4}_*`, `outlook_grass_*`;
  - woods: `moss`, `leaf_dry`, `mud_*`;
  - desert: `desert_*`, `beach_*`;
  - mud: `mud_1..7`;
  - snow: `snow`, `snow_grass_tall`;
  - paths: `stone_cobble`, `outlook_dirt`, `cold_dirt`;
  - minimap helpers: `____minimap_{bright,forest,road,ground}`.
- **Scatter:**
  - trees `terrain/tree_{oak,ash,fir,pine,palm,…}` (colliders: oak r14 circle, palm r5.5, fir polygon);
  - `bush_*`, `fern`, `clover`, `grass_*` tufts, `flower_*`, `mushroom_*`, `log`, `rock*`.
- **Landmarks:**
  - `generic/pyramid`, `pyramid_2`, `pyramid_small` (192–384 px colliders);
  - `dune_*` (polygons), `cactus`, `quicksand`;
  - `tent_{desert,snow,shaman}`, `campfire`, `well_*`;
  - `fence_{palisade,stone,wood}_*`, `statue_*`, `gravestone`;
  - `generic/a_wood_bridge_*`, `dock_wood_*`, `boat*`;
  - `prefabs/theme_town/` (98 buildings).
- **Hub towns already imported.** `lobby/templates.generated.ts` has the Shaftlocke town (a **snowy** plateau) and
  the sun-temple bazaar (**desert**). A grass, woods or mud village must therefore be composed from
  `prefabs/theme_town` buildings, not taken from a stock town.

### Engine facts that shape the design

- **Actors are dormant past range.** An actor updates only while a player is within `SetUpdateDistanceLimit`
  (300 px by default; discovery log ~l.1004). Roaming packs on a big map sleep until approached. That's good for
  performance, and ambushes must spawn near the player, which tripwires do.
- **Sizes seen in practice.**
  - mistdeep runs at **832×736 tiles with about 693k units**.
  - The largest stock unit counts are about 15k (`ending_passage`).
  - No engine size limit is recorded.
  - 192² tiles is 6×6 tile cells of 512 px.
- **AE has no parallax** (discovery log). The water must be painted out to the map border.

### Generator facts (from the codebase map)

- **Slots.** `CampaignSlot` is defined in `src/generator/campaign.ts:60`, with `gatewayAfter` at :72,
  `defaultOrder` at :115, `normalizeOrder` at :141, and labels, file names and parsing at :198–:317. The kind checks
  are hard-coded and need a `world` branch.
- **Assembly** is `generateDungeon` in `src/generator/index.ts:329`, with one loop per kind and `MAX_LEVEL_ATTEMPTS`
  at :321. There are six RNG streams, seeded in `src/generator/core/context.ts:213–218`.
- **The Arena tab pattern to copy.**
  - Types: `BossFight`/`BossOptions` (`config/parameters.ts:1098`, `:1315`). Defaults: `defaultBossFight` (:1691).
  - Validation: `validateBoss`/`validateBossFight` (`config/validation.ts:791`, `:834`), with keys like
    `boss.fights.N.*`.
  - parameters.txt: `boss{f}*` keys (`config/configFile.ts:701`, `:2374`).
- **The room and passage generator does not scale.** It has a global cap of 1,000 connect attempts
  (`map/level.ts:138`) and an O(n²) `Passage.overlapPassage`. World mode skips it entirely.
- **Reusable pieces:**
  - Button rig and countdown: `buildButtonRig` / `buildButtonCountdown`, `map/buttonSeal.ts:211`, `:372`.
  - Exit rig: `buildExitRig` / `addArrival` (`objects/objectSet.ts:95`, `:124`). Victory orb: :249.
  - Boss death: `NodeGlobalEventTrigger` (register `ctx.bossActors` first).
  - Monster packs: `Room.transform('Lair')` (`room.ts:170`).
  - Timer: `timer/hazard.ts`, a countdown, then a whole-map `DangerArea`.
  - Emission: `ae/emit.ts emitObjects` and `TileLayers`/RLE (`ae/tiles.ts`).
  - Walls: the mask→piece table pattern in `map/aeWalls.ts:55,78`.
  - Stamping a stock chunk: the id-remap pattern in `lobby/stockTown.ts:186`, plus `cropTiles`
    (`lobby/castleBridge.ts:283`).
  - Collider closure: `tests/closure.ts`, which reads the install and so runs only in tests.
- **Missing script node:** `HideUnit`. Add `NodeHideUnit` with a `HideState` enum, following the
  `NodeToggleElement.action` style. Don't use a raw number.

## Design

### Module layout: `src/generator/world/` (pure, like every other rig)

| File | Role |
|---|---|
| `defs.ts` | Plain, JSON-serialisable definition types: `BiomeDef`, `EdgeSetDef`, `ScatterDef`, `LandmarkDef`, `HubDef`, `StampDef`. |
| `biomes.ts` | Stock biome table: `grass`, `woods`, `desert`, `mud`, `snow`. |
| `edgeSets.ts` | Cliff mask→piece tables for `granite`, `granite2`, `basalt`, `silt` (built like `aeWalls.ts`). |
| `landmarks.ts`, `hubs.ts` | Stock landmark and hub compositions. |
| `island.ts` | Island mask: noise plus radial falloff, then the largest component, hole fill and bounded smoothing. |
| `grid.ts` | `WorldGrid`: per-tile land/water/edge/solid/reserved bits. Used for placement and reachability. |
| `place.ts` | Poisson-disk site placement across angle sectors. |
| `paths.ts` | Trails from the hub to each site, as a bounded walk on the land grid. |
| `scatter.ts` | Clumped scatter of trees, rocks and tufts, kept off the hub, the sites and the trails. |
| `stamp.ts` | Stamps a `StampDef` into the level: id remap, pixel offset, tile copy, footprint marked in the grid. |
| `objectives.ts` | Buttons and bosses feed one countdown, which reveals the portal or orb and enables its use trigger. |
| `encounters.ts` | Roaming packs, ambush tripwires, mystery plates, loot caches. |
| `build.ts` | `buildWorld(ctx, worldDef, gateway)` runs the whole pipeline and returns the `Level` (or `AeLevel`). |

**Data-driven.**

- Every biome, edge set, landmark and hub is a def object keyed by string id. All asset paths live in those tables,
  and a test runs every path through `aeAssetExists`.
- Defs are plain data: no functions, only weights, footprints and anchors.
- `StampDef` (units + scripts + tiles + footprint + named anchors) is the single "composition" format. The village
  hamlets and the stock-town crops both use it.

### Generation pipeline (`buildWorld`)

1. **Size and island.** The size is W×H tiles: default 192, min 96, cap 512, with a warning above 384. Draw an island
   mask from a deterministic value noise (permutation seeded from `worldRand`) with a radial falloff and a
   `coastRoughness` knob. Keep the largest component, fill lakes inside it, and smooth with a bounded number of
   cellular passes until each edge cell matches a shape the edge-set table covers. If that never happens, the attempt
   is rejected. Keep a water margin of at least `waterMargin` tiles (default 8) to the border.
2. **Ground tiles.**
   - The biome's base tileset covers the land.
   - Variation layers are painted by a second noise field.
   - The water tileset fills everything else out to the border.
   - A minimap helper layer goes underneath.

   All of it goes through `TileLayers`.
3. **The edge.** Every land cell touching water gets a cliff piece by its 8-neighbour mask from the biome's
   `EdgeSetDef`, and the biome's shore doodads go on the water side. **Collision belt:** merged invisible solid
   `:Physics_Rectangle` runs just outside the cliff line, as in the `crystalShop.ts` precedent, so the coast is sealed
   even where a corner piece's collider leaves a gap.
4. **The hub at the center.** Clear a radius, then stamp the hub. The hub kind is `village | camp | bare | random`
   (default random):
   - **Village:** desert uses a bazaar crop, snow a Shaftlocke crop, and grass, woods and mud a hamlet composed from
     `prefabs/theme_town` buildings.
   - **Camp:** a tent, a campfire and a few crates.
   - **Bare:** only the frame.

   In every case the portal frame (`teleport_mt`, `closed`) is at the center, and the arrival comes from `addArrival`.
5. **Sites.** Poisson-disk points on land, at least `minSiteDistance` from the hub and from each other, spread across
   angle sectors so they surround the island. Each objective site gets a landmark from the biome's list (pyramid,
   dune field, grove, ruins, pond, camp) and its anchor spots.
6. **Trails (optional).** A path tileset is painted from the hub to each site. Trails stay clear of solid scatter, so
   the island is easy to reach. Ambush tripwires prefer trail cells.
7. **Scatter.** Clumped density from noise: forests in woods, sparse oaks in grass, dunes and cacti in desert, reeds
   and puddles in mud. A separate fork of the world stream (`worldRand.fork('scatter')`) draws the scatter, so changing
   scatter density never moves the objectives.
8. **Objectives.** N buttons and M bosses (validated: N+M ≥ 1).
   - **Button:** reuse `buildButtonRig` with no seal walls. Each press steps the shared countdown
     (`buildButtonCountdown`) and may carry a mystery payload (spawn monsters, loot or spewers).
   - **Boss:** an actor from the arena boss roster on the site's boss anchor. Its `UnitDestroyedTrigger` steps the
     same countdown. Register `ctx.bossActors` before building `NodeGlobalEventTrigger`.
   - **At zero:** `AnnounceText` "The portal has opened", `PlaySound`, then either `SetUnitScene open` (frame) or
     `HideUnit Show` (appear). Then `ToggleScripts` enables the exit `UseTrigger`, which **ships disabled**.
   - **If the world is the campaign's last slot:** the hidden victory orb is shown instead (`HideUnit Show`, orb rig
     from `objectSet.ts:249`).
9. **Encounters** (none of these count toward the portal):
   - **Roaming packs:** `Lair`-style groups from the world's monster pool, outside a `safeRadius` around the hub. They
     sleep until approached.
   - **Ambush tripwires:** a thin `RectangleShape` across a trail cell → `AreaTrigger` (once) → `PlaySound` + a ring
     of `SpawnUnit`s from the pool. This is the mansion `test_yard` pattern.
   - **Mystery plates:** reused from `mystery/rig.ts`.
   - **Loot caches:** item clusters from the existing item roster.
   - **Timer (optional):** `timer/hazard.ts` on the world level, with seconds capped by validation, since the rig emits
     one node per second.
10. **Finishable check (invariant 5).** Flood the `WorldGrid` from the arrival over non-solid land. It must reach
    every button tile, every boss anchor, every tripwire, and the portal's use area. On failure, clear the scatter
    blocking the trail, a bounded number of times, then retry the whole attempt, up to `MAX_LEVEL_ATTEMPTS`. A static
    check also confirms that the countdown's start value equals the number of objectives.
11. **Emit and ids.** Objects and scripts go through `emitObjects`. Cliff pieces and the collision belt take ids after
    every object, the same rule as walls (invariant 7).

### Campaign, params, RNG

- **`campaign.ts`.**
  - `CampaignSlot` gains `{ kind: 'world', index }`, with label `W{n}`, file name `world_{n}.lvl` and
    `parseSlotLabel` support.
  - `defaultOrder` is lobbies, worlds, floors, fights.
  - The incoming gateway is the arrival; the outgoing one comes from `gatewayAfter` (portal, lobbyPortal or orb).
  - `validateLevelOrder` and `FloorOrderEditor` learn the new kind.
- **RNG.** Add a **seventh stream, `worldRand`**, in `core/context.ts`, forked per world index the way arenas use
  `bossRand`. With no worlds, nothing is drawn and no ids are allocated. Update CLAUDE.md's invariant 2.
- **`parameters.ts`:**
  - `WorldOptions { worlds: WorldDef[] }`.
  - `WorldDef`: `biome`, `width`/`height` (min, max), `coastRoughness`, `waterMargin`, `hub`, `portalReveal`
    (`frame | appear`), `objectives { buttons, bosses, bossPool }`, `monsters { pool, packDensity, safeRadius }`,
    `ambushes { count, size }`, `mysteryPlates`, `lootCaches`, `trails`, `scatterDensity`,
    `timer { enabled, seconds, damage }`, `music`, `brightness`.
  - `defaultWorld()` follows the "absent means default" helpers, as `arenaMode` does.
- **`validation.ts`.** `validateWorld` uses keys `world.worlds.N.*`, with one rule and one test for every field.
  The rules include:
  - min ≤ max;
  - size 96–512;
  - N+M ≥ 1, and sites ≤ what the area can fit (capacity estimate);
  - a timer seconds cap;
  - unit-budget warnings.
- **`configFile.ts`.** `worlds=`, then `world{w}Biome/Width/Height/Hub/Buttons/Bosses/...`, mirroring the `boss{f}`
  key parser and writer, with a round-trip test.

### UI (`src/renderer/`)

- **`App.tsx`:** a `'world'` tab between Arena and Floor order, with a badge ("2 worlds"), and reset-tab logic.
- **`components/WorldForm.tsx`:** copies the `BossForm.tsx` structure. Sections:
  - World (count);
  - Biome (one picker per world);
  - Size and coast;
  - Start (hub);
  - Objectives;
  - Encounters;
  - Timer;
  - Look (music, brightness).
- **`FloorOrderEditor.tsx`:** handles `W` slots.
- **Preview:** a downsampled world canvas showing land, water, cliffs, the hub, sites (button and boss icons),
  trails and tripwires.

## Phases (each one area-sized commit, gate green)

- **P0 — discovery probe.**
  - Add `scripts/dev/world-probe.ts` (a dev-only script). It emits a 192² and a 384² grass island with a cliff ring,
    water, a hidden `teleport_mt` and a `closed` frame, plus a button that reveals both.
  - Write `docs/discovery/world-mode.md` with what the user checks in game: see the list below.
- **P1 — plumbing.**
  - The `world` slot kind, params, defaults, validation, parameters.txt and the seventh stream.
  - `buildWorld` emits a flat rectangular grass field with the arrival and an already-open portal.
  - Tests: determinism, stream isolation (the same seed's dungeon bytes are unchanged with a world added), validation.
- **P2 — terrain.**
  - Island mask, water fill, edge sets, collision belt, `WorldGrid`.
  - Tests: every edge mask resolves to a piece; `closure.ts` on the emitted island shows no leak to the water
    (skipped without the install).
- **P3 — biomes and scatter.**
  - The five stock `BiomeDef`s, scatter, trails, the reachability flood.
  - Test: every def asset passes `aeAssetExists`.
- **P4 — objectives and the portal.**
  - `NodeHideUnit`; buttons and bosses on one countdown; `frame` and `appear` reveals; the exit trigger enabled at
    zero; the orb when the world is last.
  - Tests read the rig back through `tests/ae.ts` (count start = objectives; use trigger disabled at start).
- **P5 — encounters.** Packs, tripwire ambushes, mystery plates, loot, the timer.
- **P6 — hubs.**
  - `stamp.ts`, sharing the id-remap code with `stockTown.ts`; then the bare, camp and village hubs.
  - The composed hamlets for grass, woods and mud get a footprint/closure test.
- **P7 — landmarks.** Pyramids, dune fields, groves, ruins, ponds and camps, as `StampDef`s with anchors.
- **P8 — UI.** The World tab, the floor order editor, the preview.
- **P9 — docs.**
  - CLAUDE.md: the `world/` layout and seven streams.
  - `hammerwatch-ae-project` and `-modding` skills.
  - Discovery log entries (`[EMITTED]`/`[VERIFIED]`), and boot checklist items.
- **Later, not in scope:**
  - teleport shortcuts between sites;
  - rivers, shallow lakes and bridges;
  - raised plateaus using the cliff sets' ramps and `_stairs`;
  - more biomes.

## Pass 2 (implemented 2026-10-28)

The user's direction after playing pass 1:
- It's hard to customise a world's **monster theme** (which campaign's monsters roam it), its **ambushes** and its
  **loot**. They want the control the Dungeon and Arena tabs give a dungeon master: **simple presets first, advanced
  customisation after**.
- Loot should work like the **mystery buttons**: mystery plates scattered round the island. The real portal buttons
  can be **disguised as mystery plates**, so finding them is a treasure hunt. The user calls this "one of the charms
  of the island".

Order: **A1 → A3 → A2 → A4**, then **B**, then **C**. Each step is one area-sized commit with its tests and a boot
checklist entry. Stock assets only.

### A. Dungeon-master control

Every section uses the same UI pattern: one-click **shortcut buttons** that write ordinary values, which stay
editable underneath (`QuickSetup.tsx`, `.quick-setup-presets`). Whole-world presets get a confirm step, as
`PresetGuide` does, since a misclick must not wipe tuned work (issue #77).

**A1 — Monster theme.**
- **Simple:** shortcut buttons fill `world.monsters`:
  - Castle Act 1–4 (`defaultParameters().levelMonsters[0..3]`);
  - Temple of the Sun (the Desert preset's pools in `config/presets.ts`);
  - Shaftlocke;
  - Bonus;
  - Mixed: from `MonsterTypeDef.campaigns`, skipping deprecated types, mini-bosses and bodyguards.

  The pools live in one table, `world/monsterThemes.ts`. A test checks every key with `isKnownFloorPoolKey`.
- **Advanced:** the Dungeon tab's own picker.
  - Lift `MonsterPoolsEditor`'s per-floor body into `MonsterPoolPicker({ pool, onCommit, filter })`: checkboxes,
    weights and `PoolTextField`, with no generator change.
  - The Dungeon tab maps floors onto it; WorldForm mounts it in place of its bare `PoolTextField`.
  - Group sizes stay bounded by `packSize` and `ambushSize`. No per-monster caps.

**A3 — Mystery plates and disguised portal buttons** (the treasure hunt).
- **New fields:** `WorldDef.mystery: { plates: number; disguise: boolean }`.
  - `plates`: mystery plates scattered on reachable ground.
  - `disguise`: the real portal buttons drawn with the mystery plate's art (`TriggerButton`, `pressed`), as the
    floors' disguise tickbox does (`ctx.floorLockDisguise`, `map/buttonSeal.ts`).
- **Payloads:** come from the campaign's shared mystery pool (`params.mysteryButtons`, edited on the Dungeon tab).
  No second pool to maintain. A disguised real button may carry one too.
- **Refactor:** export `mystery/rig.ts`'s payload builder (`emitPayload`) and pass it the `Rand` to draw from.
  - Floors keep passing `ctx.mysteryRand`, so their output is unchanged; an isolation test proves it.
  - Worlds pass their `encounters` stream.
- **Simple shortcuts:**
  - Off: no plates, plain buttons.
  - Some: a handful of plates.
  - Treasure hunt: many plates, real buttons disguised.

  The coin caches stay as "Loose coins".
- **Advanced:** the plate count, the disguise tickbox, a link to the Mystery pool, and optionally which pool buttons
  this world may use (a subset by index, default all).
- **Validation and keys:**
  - plates > 0 needs a non-empty pool;
  - a capacity estimate covering plates plus sites;
  - keys `world<i>MysteryPlates` and `world<i>Disguise`.

**A2 — Ambushes.**
- **Simple:** Off, Light, Normal and Heavy shortcuts. Each sets the tripwire count, monsters per ambush, and the
  button-ambush chance.
- **Advanced:** **ambush types**, a list of `{ weight, monsters: MysteryMonster[] }` (exact monsters and counts).
  - Each tripwire picks a type by weight from the world's `encounters` stream.
  - Reuse `MonsterCountListEditor` (`MysteryButtonsEditor.tsx`): export it with a `fieldPrefix` prop.
  - An empty list keeps today's behaviour: random monsters from the pool, `ambushSize` of them.
- **Out:** traps (spewers need walls; an island has none).

**A4 — Whole-world presets.**
- Named starting points as shortcut buttons with a confirm step:
  - Explorer: sparse monsters, plenty of loot.
  - Treasure hunt: disguised buttons, many plates.
  - Monster island: dense packs, heavy ambushes.
  - Speedrun: small, a timer on.
- Each is a plain `Partial<WorldDef>` in `world/presets.ts`, so it serialises like any world.

### B. Village start (done 2026-10-28)

**Built differently from the design above.** The stock town's houses (`prefabs/theme_town/building_*`) are made of
`doodads/walls/city_outlook_*`, which exist only inside Shaftlocke Tower's own scenario, not in the base assets, so a
generated campaign can't use them; the asset test caught it. Cropping the bazaar or Shaftlocke town hits the same
wall. So the village is composed from base-game props, per biome (`BiomeDef.village`):
- a fountain or well north of the portal;
- a ring of eight tents: shaman, desert, or snow tents by biome;
- market props between them: carts, barrels, crates, lanterns or braziers, signposts.

`random` picks it a third of the time on islands of 128 tiles and up; validation refuses `village` below that.

### C. Landmarks at sites (done 2026-10-28)

`world/landmarks.ts`: a small composition of base-game units beside each objective site, picked from those its
biome suits. Pyramid and oasis (desert); shrine (any); ruins; graveyard; a ring of the biome's own trees (grove); a
stone circle (snow); a pond (mud). Pieces keep off the path to the site, the coast and other props, so a site is
never cut off, and they draw from the layout stream after the trails, so they move nothing else. Dune fields are
left out: their 512-px colliders would wall off whole stretches of island. `world<i>Landmarks=0` switches them off.

### In-game questions for `docs/discovery/world-mode.md`

1. Does a ring of `cliffs/granite2` (and the basalt and silt sets) over `water_clear` look like a coast from all four
   sides? Do north-facing pieces read correctly? Does the collision belt stop the party at every corner?
2. How do 192² and 384² levels load and play: load time, frame rate with the scatter, and the minimap
   (`ExploreMinimap`, the `____minimap_*` layers)?
3. `teleport_mt` placed `hidden` and then shown with `HideUnit` State 2: does it collide or use while hidden? Does
   the `closed` → `open` frame read as "the portal came alive"?
4. Do ambush spawns wake immediately? Do roaming packs stay asleep until approached at 300 px?
5. Which stock environment and lighting reads best outdoors for each biome?

## Critical files

- **New:** `src/generator/world/*`, `src/renderer/components/WorldForm.tsx`, `tests/world*.test.ts`,
  `scripts/dev/world-probe.ts`, `docs/plans/world-mode.md`, `docs/discovery/world-mode.md`.
- **Changed:** `src/generator/campaign.ts`, `src/generator/index.ts`, `src/generator/core/context.ts`,
  `config/parameters.ts`, `config/validation.ts`, `config/configFile.ts`, `objects/nodes.ts` (`NodeHideUnit`),
  `lobby/stockTown.ts` (shared remap), `src/renderer/App.tsx`, `components/FloorOrderEditor.tsx`, the preview
  component, and `CLAUDE.md`.

## Verification

- **Gate:** `npm run typecheck && npm test` for every phase.
- **New suites:**
  - determinism (byte-identical output per seed);
  - stream isolation;
  - validation per field;
  - parameters.txt round trip;
  - asset existence for every def;
  - reachability from the arrival to every objective and the portal;
  - countdown start equals objectives, and the exit trigger starts disabled;
  - closure of the coast with the install's colliders.
- **Visual:** `node scripts/render-level.mjs <world.lvl> out.png --collision` for each biome.
- **Real pack:** `HWAE_PACK=1 npm test -- tests/packer.test.ts` with a world slot in the order.
- **In game:** the probe items above, then boot checklist entries for each phase, verified by the user.
