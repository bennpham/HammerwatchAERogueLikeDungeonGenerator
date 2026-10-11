# Discovery log — Hammerwatch Anniversary Edition

Append-only record of what we learned about AE's formats, scripting and assets,
with how each fact was established. Newest at the bottom. Promote anything
`[VERIFIED]` and load-bearing into `ASSET-REGISTRY.md`.

Tags:

- `[VERIFIED]` — confirmed against stock AE data (levels, `.unit`/`.as` files) or in game.
  The entry says which.
- `[EMITTED]` — the generator writes it and the output loads/validates, but nobody has
  watched it work in game yet. The matching row in `docs/BOOT-CHECKLIST.md` is
  `UNCONFIRMED` until someone plays it.
- `[UNVERIFIED]` — inferred or carried over (e.g. from hw2ae or the HW1 remake); do not
  build on it without checking.

Paths: `<AE>` = `D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch Anniversary Edition`,
`<assets>` = `<AE>\unpacked_assets_66`.

---

## 2026-10-09 — Port kickoff: format, wiring, walls

### Level file format `[VERIFIED]` (stock Castle level_1 round-trip, tests/aeFormat.test.ts)

- `.lvl` is SVAL text, LF, tab-indented. Tags: `dict`, `array`, `string`, `int`, `float`,
  `bool` (`t`/`f`), `vec2`, `vec3`, `bytes`, `null`. Dict children carry `name=`.
- Root key order: `game-mode{Class=DungeonGameMode}`, `version`=1,
  `lighting{environment=effects/...env}`, `tiles`, `units`, `scripts`, `prefabs`.
- Coordinates are AE pixels. The generator's 16-px tile (x, y) maps to pixel (16x, 16y).

### Tiles `[VERIFIED]`

- `tiles` is a list of 512-px chunks. `pos` is the chunk CENTRE and is a multiple of 512.
  Each chunk has `datasets: [{tileset, data-rle}]`, painted bottom first.
- `data-rle` holds signed byte runs over a `(512/size)²` row-major presence grid.
  `size` is the `.tileset`'s `size="N"` attribute (4, 8, 16 or 32). Runs are capped at
  ±126. A fully painted 16-px chunk is `7e×8 10`. Every chunk in Castle level_1 sums to
  its grid size (test).
- AE auto-picks variants and borders; the data only says "painted here".
- Stock levels paint the floor under the walls as well. Helper tilesets `__black` and
  `____minimap_*` are layered in too.

### Units `[VERIFIED]`

- `units` is a dict of arrays named by asset path. Entries are either a flat `vec2, int`
  pair, or a wrapped `[vec2, int, (null, null,) dict state]` when the unit carries
  per-instance state.
- Sensors are pseudo-units `:Physics_Rectangle` (`vec2 size`) and `:Physics_Circle`
  (`float radius`), with bools `active/jam-through/sensor/shot-through/aim-through` = t.
- **Rectangles are centred on their position.** The stock exit sensor is 32×16 at
  `exit_up` anchor + (32, 8) — Castle level_2, unit 4052.
- Ids are unique per level across units AND scripts; script arrays (`Areas`, `Units`,
  `Doors`, `OnTrue`…) reference both.

### Scripts `[VERIFIED]`

- Each script is
  `[Class, id, vec3 pos, enabled, trigger-times(-1 = ∞), execute-on-start, (label string), ({params}), ([targetId, delayMs]…)]`.
  `pos` is editor placement only.
- A feed from another script's output is `<array name="#X"><int>id</int><string>Event</string></array>`,
  e.g. `#PlayerTarget = [useTriggerId, "User"]` or `#Units = [spawnId, "AllSpawned"]`.
  Several feeds are written as alternating int/string pairs.
- Survey of every class used in Castle, Shaftlocke and Sun Temple, with param names and
  shapes: `scripts/dev/script-shapes.ts`. Its output is summarised in ASSET-REGISTRY.md
  §Scripts.
- Enums, read from `<assets>/scripts/WorldScript/**/*.as`:
  - `ToggleScripts.State` and `ToggleImmortality.State`: 1 Enable, 2 Disable, 3 Toggle.
  - `HideUnit.State`: 1 Hide, 2 Show, 3 Toggle.
  - `AreaTrigger.Event`: 1 OnEnter (default), 2 OnExit.
  - `AreaTrigger.Filter` (flags, default 2): 1 neutral, 2 player, 4 enemy,
    8 player projectile, 16 enemy projectile, 32 trap projectile, 64 other.
  - `ChangeVariables.Function`: 1 Set, 2 Add, 3 Subtract (10+ arithmetic, 20+ bitwise).
  - `CheckVariables.Function`: 1 Equal (default), 2 Greater, 3 Less, 4 ≥, 5 ≤, 6 ≠.
  - `ActorHealthTrigger.Function` (FloatCompareFunc): 1 Greater, 2 Less (default), 3 ≥, 4 ≤.
    `Value` is a fraction, e.g. 0.75.
  - `UsableIcon` (`scripts/Behaviors/IUsable.as`): 0 None, 1 Generic, 2 Cross, 3 Key,
    4 Shop, 5 Speech, 6 Exit, 7 Question, 8 Revive, 9 Light, 10 Lockpick, 11 Button,
    12 NoKey, 13 Talk.

### Floor exits: press F with the whole party `[VERIFIED]` (Castle level_1/level_2; test in tests/aeFormat.test.ts)

```
:Physics_Rectangle sensor (32×16 centred at exit_up anchor + (32, 8))
UseTrigger "Exit"  Icon=6  Areas=[sensor]           ── connection ──▶ AllPlayersArea
AllPlayersArea     OnlyAlivePlayers=f  Area=[sensor]
                   OnTrue  = [SetRespawnPoint(SpawnId=X), LevelExit(Level=levels/…/next.lvl, StartID=X)]
                   OnFalse = [AnnounceText(Text=".meta.info.gatherparty")]
next level:        LevelStart(StartID=X), placed at its own exit_up anchor + (32, 16)
```

- "Use" is bound to `f` / `gp_a` (`<AE>/res/controls_default.cfg`).
- `.meta.info.gatherparty` reads "You must gather your party before venturing forth."
- A new game spawns at the start level's `LevelStart` that has **no** StartID (label it
  "default spawn"). Without one, players spawn at 0,0 (hw2ae).
- Converted HW1 levels (hw2ae, piratecove, dungeon_*) use a walk-in `AreaTrigger` instead.
  **The user wants press-F**, so we follow Castle.

### No RespawnPlayers in AE `[VERIFIED]`

- There is no `RespawnPlayers` WorldScript. The closest equivalents are `SetRespawnPoint`
  (SpawnId) and `SuperCheckPoint` (checkpoint save). Dead players come back through AE's
  lives system. The HW1 generator's "revive on arrival" rig therefore has no AE equivalent
  and is dropped.

### Walls `[VERIFIED]` (render of stock levels + scripts/render-level.mjs; in-game: UNCONFIRMED)

- Wall units live under `doodads/walls/<set>/`. A piece's file is a one-line
  `%include "doodads/walls/<piece>.inc"`; the art comes from `./base.png` in the set's
  folder.
- **The collision rect is the piece's footprint, and the sprite is that footprint drawn
  32 px higher.**
  - Horizontal pieces (`h_16`, `h_32`, corners, T's, caps): collision `0 0 16 16`
    (`h_32` is 32 wide) at the anchor. The sprite has origin `0 32`, so a 48-px face
    piece covers anchor−32 … anchor+16.
  - Vertical pieces (`v_16`, `v_32`): collision `0 16 16 32`. Their footprint therefore
    starts ONE CELL BELOW the anchor: anchor a vertical run one row above its first
    footprint cell.
- Which directions a piece connects is encoded by the 2-px extensions of its collision
  rects:

  | piece | connects | art |
  |---|---|---|
  | `h_16` / `h_32` | W+E | face |
  | `v_16` / `v_32` | N+S | cap strip |
  | `crn_nw` | E+S | cap only |
  | `crn_ne` | W+S | cap only |
  | `crn_sw` | E+N | face |
  | `crn_se` | W+N | face |
  | `x_n` | W+E+S | cap |
  | `x_s` | W+E+N | face |
  | `x_e` | W+N+S | cap |
  | `x_w` | E+N+S | cap |
  | `x_x` | all four | cap |
  | `cap_h_w` | E | face |
  | `cap_h_e` | W | face |
  | `cap_v_n` | S | cap |
  | `cap_v_s` | N | face |
  | `h_single` / `single` | none | face |

- Stock runs chain `h_32` every 32 px and `v_32` every 32 px, using `_16` for odd
  lengths. Every structural piece sits on the 16-px grid (mod 0,0).
- `__color_N` pieces are flat cover (black for the set) with origin `0 16`.
- A ring of pieces around a rectangular room (corners plus h/v runs, verticals anchored
  one row up) renders like a stock room. Checked by rendering
  `scripts/dev/wall-experiment.ts`.
- South walls show their full face over the two floor rows behind them (walk-behind with
  x-ray, the usual Hammerwatch look). The collision is only the footprint row.
- Converter warning (user report, 2026-10-09): hw2ae's piratecove port is beatable but
  has bleeding and overlapping walls. Its HW1→AE piece offsets (e.g. `v_16`→`v_32` dy −16,
  `crn_l_up`→`crn_nw` dy +16) are **not** to be trusted. We derive placement from stock
  levels instead.

### Exits in the wall `[VERIFIED]` (Castle level_2 exit_up at −432,−112)

- `exit_up` is 64 px wide (4 cells). Its anchor row is the wall row. Its collision
  `0 −16 64 16` is recessed one row above the anchor. The 4 cells in front of it, on the
  wall row, are walkable doorway.
- Arrival `LevelStart` is at anchor + (32, 16). The exit's sensor is centred at
  anchor + (32, 8).

### Scenario packaging `[VERIFIED]` for the folder layout, `[UNVERIFIED]` for our PACKAGER run

- A scenario folder holds `info.xml`, `logos.png` (128×128) and
  `levels/<scenario-id>/*.lvl`. Level paths share ONE namespace with every scenario and
  the base game, so each scenario keeps its own subfolder.
- `info.xml` matches the stock layout. Modifiers are the Shaftlocke/Sun Temple list;
  Castle adds `LEGACY`, which only its own levels check. Do NOT write `info.sval`:
  PACKAGER compiles it, and a stray one would be packed as a plain file.
- `.h1c` magic is `HW1S` (checked on stock files). Pack with `PACKAGER.exe -l <id>` and
  cwd at `<AE>`. It packs `<AE>/scenarios/<id>/` into `<AE>/scenarios/<id>.h1c`. Then
  remove the folder or the scenario is listed twice (hw2ae `pack.py`).
- The game also loads an unpacked folder directly from `<AE>/scenarios/` (HW1A log).

### Shops `[VERIFIED]` (stock levels)

- Shop unit `doodads/generic/shop_{offense,defense,combo,health,potion}.unit`, plus
  optional deco `deco_vendor_carpet_1`, `deco_vendor_cart`.
- Wiring: `UseTrigger(Icon=4, Areas=[:Physics_Circle r16])`, then
  `ShopArea(#PlayerTarget=[useId,"User"], Categories="off1 def1 …", Type=0 skills | 1 power | 2 equipment)`.
- Categories: `off1-5`, `def1-5`, `misc1-5`, `combo1-5`, `power` (Type 1),
  `equipment_N` (Type 2).
- Avoid the stock `prefabs/shop_*.pfb` and `prefabs/shops/shop_dungeon_*`: their stock
  is gated by campaign progression flags (hw2ae; `[UNVERIFIED]` by us).

### Warlock gargoyle `[VERIFIED]` (`<assets>/players/warlock/skills/warlock_gargoyle.sval`)

- In AE the gargoyle is a purchasable skill, not a class unlock: category `def2`, cost
  900, mana 35. Upgrades are in `def3`/`def4` (2000 and 3000).
- A warlock can only buy it from a skill `ShopArea` whose `Categories` include `def2`.
  The generator's "gargoyle purchasable" option guarantees that.

### Doors and keys `[VERIFIED]` (stock levels)

- Door art: `doodads/doors/door_{h|v}_{mid|cap_l|cap_r|cap_u|cap_d}_{bronze|silver|gold|ace|boss}_{prison|armory|archives|chambers}.unit`.
- Doors open only through `DoorController(Doors=[ids], Collectable=key_bronze|key_silver|key_gold|key_ace|key_bonus)`.
- Keys are `items/pickups/key_*.unit`.

### Persistent counters `[VERIFIED]` (stock usage; hw2ae note)

- Use `Variable(Value)` with `ChangeVariables(Variables, Function, Value)` and
  `CheckVariables(Variable, Function, Value, OnTrue, OnFalse)`. Stock `Counter` keeps no
  saved state.

### Themes (AE ids) `[VERIFIED]` (environment / walls / tilesets per stock level, Castle + Shaftlocke + Sun Temple)

See ASSET-REGISTRY.md §Themes. Shaftlocke's "armory" floors are the `crypt` wall set with
crypt tiles.

### Out of scope

- Custom/workshop content (Mistdeep, the `swamp` walls) and scenario-local custom art.
  We use stock `unpacked_assets_66` only.

### Carried over, unverified by us

- AE fixes starting lives at 2. A scenario-local `scripts/Modules/PartyRecord.as`
  (`m_lives = N;`) changes that (hw2ae; the dungeon_129790047 output shipped one).
- AE player collision radius is 5.5 px (HW1: 3.5) (hw2ae).
- Scenario-local overrides: a file in the scenario folder at a stock path replaces the
  stock file for that scenario only (hw2ae; dungeon_129790047 shipped
  `PowerShopMenuContent.as`).
- The hw1-ported `trigger_button_floor.unit` logs "no scenes in set 'pressed'". Use stock
  AE button units.

---

## 2026-10-10 — Test migration, lives, packing, the user's lobby

### Script enums `[VERIFIED]` (`<assets>/scripts/WorldScript/*.as`)

- `ToggleScripts.State`: 1 enable, 2 disable, 3 toggle. The HW1 rigs used 0 = enable,
  1 = disable; ported literally, every "disable" became an enable. `NodeToggleElement`
  now takes a named `action`.
- `ChangeVariables`: `Function` (ChangeFunc: 1 Set, 2 Add, 3 Subtract, 10 Multiply…),
  `Value`, `Variables` (plural). `CheckVariables` (file `CheckVariable.as`): `Function`
  (CompareFunc: 1 Equal default, 2 Greater, 3 Less, 4 GreaterOrEqual…), `Value`,
  `Variable` (singular, max 1), `OnTrue`, `OnFalse`. `Variable`: `Value`.
- `SetUnitScene`: `Units`, `State` (scene name), `ResetTime` (default true).
  Stock example: castle level_1 id 4425 drives a plate to `on`.
- `PlayMusic`: `Music` int (FMOD mode). Castle level_1 id 4803 sets `Music = 6`.
- `ProjectileSpewer`: `Projectile` (unit path), `Direction` (int, degrees; Castle
  level_10's flame turrets fire west at 180), `Spread` (float, degrees), `Frequency`
  (int ms, default 50), `SoundLoop`.

### There are no engine-wide boss events `[VERIFIED]` (generator bug found by tests)

- Every tier/death trigger is an `ActorHealthTrigger` / `UnitDestroyedTrigger` over
  explicit boss unit ids. A dungeon-floor boss rig built before its bosses were
  registered watched nothing, so the floor's seal could never open. Fixed: the floor
  rig sets `ctx.bossActors` first. Arena and floor both raise a `CreateBossBar`.

### Lives `[VERIFIED in assets]`, forcing them `[UNVERIFIED in game]`

- `scripts/Modules/PartyRecord.as`: `%if MOD_NO_LIVES m_lives = 0 %else m_lives = 2`.
  The HUD (`HUDResourceBar.as`), the power shop and the extra-life pickups all honour
  `MOD_NO_LIVES`. It is defined by the scenario modifier `NO_LIVES` (info.xml).
- HW1A.exe's info.xml modifier attributes: `name`, `id`, `tooltip`, `locked-by`,
  `forced`, `default-on`, `radio`, `header` (strings in the exe). The generator writes
  `<modifier … id="NO_LIVES" forced="true" />` and drops INFINITE_LIVES/DOUBLE_LIVES.
  Whether `"true"` is the accepted value is on the boot checklist. This replaces the
  scenario-local PartyRecord.as override (which would copy game code).

### PACKAGER.exe `[VERIFIED]` (local install, tests/packer.test.ts with HWAE_PACK=1)

- `PACKAGER.exe -l <id>` from `<AE>` packs `scenarios/<id>/` into
  `scenarios/<id>.h1c` (magic `HW1S`) — and exits **127** even on success.
- It logs `[ERR] Failed to parse XML tree: "" (source: scenarios/<id>/resources.xml)`:
  an optional file no stock scenario has. Harmless.
- It also lists every scenario, warning about duplicates (a folder beside its `.h1c`).

### Hand-made lobby (`<AE>/editor/lobbies/lobby.lvl`) `[VERIFIED]` by reading it

- Saved by the editor with `game-mode Class = MainMenu`; the generator writes the copy
  as `DungeonGameMode`. No `lighting` block.
- Its six `UseTrigger`s (Icon 4) had no `Areas` — the editor leaves the use area to be
  drawn. The generator adds a circle sensor on the nearest `shop_*` stand.
- The item vendor is `ShopArea { Categories = "item", Type = 2 }` on `shop_item.unit`.
- Doors `_door_1b_h` / `_door_1c_h|v` are behavior `Door`, collision 32x16 from the
  anchor, no controller. Whether they open for the party unassisted: boot checklist.

### Asset snapshot

- `scripts/scan-ae-assets.mjs` now records every `doodads/**.unit` (6273 units): a
  hand-made lobby may use any prop or decorative wall piece (`_deco_shelf_books_32`).

### `statics` section `[VERIFIED]` (user's lobby.lvl, 2026-10-10)

- Between `units` and `scripts` the editor writes `<dict name="statics">`: one array per
  unit path of bare `<vec2>` positions, each optionally followed by a state `<dict>`
  (e.g. `layer`). No ids — units no script refers to (hand-placed pickups, deco).
  Stock scenario levels have none, so the stock round-trip tests never saw it; the
  reader and writer ignored it and the lobby lost every hand-placed diamond, upgrade
  and stove deco. Now read into `AeLevel.statics` and written back.
- AE ships twelve upgrade pickups: damage, defense, health, mana, speed, attackspeed,
  each plain and `_2`.
- The equipment (item) shop's `Categories` are loot tables from
  `tweak/shops/equipment.sval`: `equipment_1`–`equipment_5` (common → epic),
  `st_equipment_1`–`3` (Sun Temple). `item` is not one; the shop came up empty.
- `PowerShopMenuContent.as` offers "extra life" under `%if !MOD_INFINITE_LIVES | !MOD_NO_LIVES`
  (true unless both are on), and `PartyRecord.GiveLife` is a no-op under NO_LIVES.
  The installer ships a patched copy (nested %ifs) as a scenario-local override.
