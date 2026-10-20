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

### Shops need the UseTrigger to fire the ShopArea `[VERIFIED]` (user's lobby.lvl; play-test 2026-10-10)

- The house's working vendors connect `UseTrigger → ShopArea` (connection array), on top of
  the ShopArea's `#PlayerTarget = [useId, "User"]`. The feed only names who pressed. The
  generated floor shops had the feed and no connection: F showed the shop prompt and
  nothing opened.

### AnnounceText styles `[VERIFIED]` source, `[EMITTED]` region_enter / info_event (2026-10-10)

- `scripts/WorldScript/GUI/AnnounceText.as`: `Title`, `Text`, `Style` (default
  `hint_announce`), `TimeOverride`, `FinishTrigger`, `PlayerTarget`. There is no text type.
- Styles live in `gui/variable/announce/announcestyles.sval`:
  - `ui_error`: red, at 0.25 height, replace.
  - `region_enter`: top centre, title font arial24, 2.5 s, replace.
  - `hint_announce`: at 0.75 height, 2 s, replace.
  - `info_event`: top right, green, queue.
  - `countdown`: plays a sword-swing sound, cover.
  - The quest and pickup notification styles.
- `replace` drops whatever is showing in the same style or category. A timed floor ticks
  `hint_announce` once a second, which wiped the seal's "final room opened" line on
  Shell Game. HW1 text types now map to styles: 0/1 → `region_enter`, 2 → default,
  3 → `info_event`. Stock levels never set `Style`; the gather-party line stays default.

### Boss checkpoints removed (user, 2026-10-11)

- AE needs none: co-op players revive each other, and a dead party chooses to respawn
  at the previous lobby or right at the boss fight. The arena and floor-boss
  respawn/save rigs and their settings are gone; old `boss<f>Checkpoints` /
  `bossFloor<i>Checkpoints` lines are read and dropped silently.

### Lighting `[VERIFIED]` stock data, `[EMITTED]` generated (2026-10-10)

- A level's `lighting.environment` (`effects/lighting/*.env`) holds an ambient colour
  (`<ambient value="r g b a">`) and one directional light. Stock themes are very dark:
  `prison_1` is `10 10 30`, `mine_granite_3` is `5 0 0`. The armory envs carry two
  ambients, one per `%if` branch.
- Stock levels are lit by lamps. Castle's level 1 has 69 `doodads/generic/lamps/torch.unit`,
  all in the default scene `n` (or `n-off`): hung on a north wall, light falling south,
  275–300 px. Each sits 16 px below its horizontal wall piece's anchor
  (330 of 338 measured, `scripts/dev/torch-survey.ts`), at x offset 0 or 8 in the cell.
- The generator placed no lamps, so floors were nearly black. Now there are torches along
  every north-wall run (`lighting/torches.ts`, no RNG, ids after the walls), and the
  brightness setting ships scenario copies of the used envs with the ambient lifted
  toward grey (`lighting/envs.ts`; snapshot `scripts/scan-ae-lighting.ts`).
  `[UNVERIFIED]` that a scenario env copy replaces the stock one (checklist #30).

### Player balance lives in `players/`, not `tweak/` `[VERIFIED]` (unpacked_assets_66, 2026-10-10)

- `players/classes.sval` (loader `PlayerClass::LoadMultiple`, order 1): per class `id`,
  `unit`, the list of skill files, `base-health`/`base-mana`/`base-*-regen` (regen in
  points per second). The `level-*` twins are all 0 and `base-str/dex/int` are 0: AE has
  no character levels.
- One file per skill, `players/<class>/skills/*.sval`: a root skill (`starting-level` →
  owned; else `category` + `cost` → bought), its `upgrades` array, and
  `modifier-skills` each with their own `category`/`cost`/`binds` and `upgrades`.
  Numbers sit in `binds` (int/float; string binds are buff refs). Upgrades **set** a
  value (`Modifiers::AttribSet`, `player-max-health-set`), they do not add.
- Move speed is not a class stat: two shared passive skills,
  `shared_speed` (wizard, ranger, sorcerer, priest: 1.0, shop 1.1/1.2/1.3) and
  `shared_speed_melee` (paladin, thief, warlock: 1.2, shop 1.3/1.4/1.5), both bind
  `movespeed-mul` and share the skill id `shared_misc_speed_base`. `shared_combo` is
  owned by every class; the combo window is in ms (1000 → 2250).
- Shop descriptions carry the numbers as arguments named the HW1 way
  (`.hp-udesc?curr-max-health=75&max-health=90`), not after the bind.
- 67 skill files, 369 prices, 843 editable values: `src/generator/players/stock.generated.ts`
  (`scripts/scan-ae-players.ts`).

### Player overrides as scenario files `[EMITTED]` (2026-10-10)

- The Players tab's edits become line edits on the install's own `players/` files, written
  into the scenario at the stock path (like the power shop). A class with its own move
  speed gets `players/shared/skills/shared_speed(_melee)_<class>.sval` and its line in a
  patched `players/classes.sval`.
- `[VERIFIED 2026-10-10]` a scenario copy of a skill `.sval` replaces the stock one, and a
  scenario copy of `classes.sval` is read too. On the HW2 Endgame preset the HUD showed
  384 health (the patched first health tier; stock max is 300) and 366 mana (no stock
  class gets past 200 without it). Per-class move speed (checklist #28) rides on the same
  classes.sval and is still to be seen.

### Unlocking bought skills, and potion and item prices `[EMITTED]` (2026-10-10)

- A class owns a skill at the start when the skill file's root has `starting-level`
  (`PlayerClass.as` reads it per skill and per modifier; `PlayerRecord.as` adds it to the
  picked level, and `SkillShopMenuContent.as` lists a skill with `starting-level > 0` by its
  upgrades instead of selling it). Only the first skills carry it in stock. The Players
  tab's **Owned from the start** (`player.<stem>.1.starting-level`) writes
  `<int name="starting-level">1</int>` onto the root's `cost` line in the scenario copy.
  Checklist #31.
- Potion and item prices are not in `players/`: the power shop's offers are literals in
  `scripts/GUI/Shop/PowerShopMenuContent.as` (`AddItemToShop(id, name, desc, cost)`:
  rejuvenation 175, damage potion 1000, the other three potions 300; the extra life is a
  formula and is left alone), and every item vendor prices by quality from
  `Tweak::Equipment{Common,Uncommon,Rare,Epic,Unique}BaseCost` (200/350/750/1200/1500) in
  `scripts/Data/Misc.as`. Every shop multiplies by `GetPriceMultiplier()` (0.995 per
  vendor coin). The tab's `player.shop.<id>.cost` keys patch those lines; the potion
  edits go into the same power shop copy as the life guard, before it, by stock line.
  Checklist #32.

### Skill-level params, bow heat and the original's attack feel (2026-10-11)

- `[VERIFIED]` (read off the original `Hammerwatch.exe` IL with a reflection-only
  disassembler, no game run needed) The original hard-codes movement while attacking in
  each `Player<Class>ActorBehavior.DoUpdate`: velocity = input × `speedMul` × `speed` ×
  0.005, then × 0 while `actor.Attacking` for the knight, wizard and warlock, × 0.5 for the
  ranger (× 0 during flurry waves), × 0.33 for the sorcerer (× 0 while `castingComet`),
  × `smite-speed` for the priest and + `knives-speed-mod` for the thief. The wizard is also
  × 0 while `meteorCounter > 0` (the whole volley) and × 0.33 while spraying. Only the
  primary attack (and the sorcerer's skills, the ranger's growth, the priest's area/aura)
  sets `Attacking`; wizard fire nova and warlock lightning/gargoyle don't stop you.
  `speedMul` = (1 + 0.25 × run-time ramp over 15–30 s) × 1.4 in combo × buffs.
- `[VERIFIED]` The original's attack is gated on `!Attacking`, deals its damage inside
  `Attack()` at once, and sets `Attacking` to the attack sprite's length; held autofire
  repeats every `attackLength` × 1.25 (`west-attack`). The knight's attack sprite is
  2 × 50 ms (`editor/assetsExtract/actors/player/knight_a.xml`).
- `[EMITTED]` AE: `PlayerSkill` reads `move-speed-mul` and applies it while
  `move-speed.x ≤ castingT < move-speed.y`; `castingT` runs at the skill's cast speed
  (`cast-speed-mul` × attack-speed mods), and a directional cast lasts
  `max(anim, timeline)` (meteor ≈ 1000 ms at every meteor tier, while its window ends at
  260). `Whirlnova`/`SpewProjectiles` use `speed-mul` instead. `Player.as` halves every
  slow under 1 while combo is on.
- `[EMITTED]` AE's `RangerShoot` heat: +1 per arrow, capped at `overheating-max`, drains at
  `overheating-recovery`/1000 per ms when not shooting; above `cooldown-heating.x` (2) it
  lerps `cooldown-add` (0–300 ms) into the cooldown, above `spread-heating.x` (3) it lerps
  `spread` (0–15°). Nothing else reads it (no HUD). `overheating-max` 0 pins heat at 0.
- The Players tab now edits these skill-level numbers (`SKILL_PARAMS` in
  `players/parse.ts`; the window as `move-speed-until`, patched as `<start> <end>`), and
  `players/original.ts` bundles the original's values as three switches. Checklist
  #33–35.
- The repo's SVAL reader treated `ivec2` as a container and dropped its text; `ivec2/3/4`
  are scalars now.

### Why the warlock, priest and sorcerer feel weaker than the original (2026-10-12)

- Context: the Steam thread "Wizard is OP" (Oct 2025) ranks wizard S, thief/paladin/ranger A,
  sorcerer B (mana), warlock C (mana, weak), priest "useless". A developer says AE's balance is
  meant to match the original. The tweak numbers do match (regen, mana ladders, costs,
  lightning and beam damage); the differences are mechanics.
- `[VERIFIED]` (original IL) Combo: `PlayerActorBehavior.Update` adds `comboMana` mana and
  `comboHeal` health every 500 ms while `comboActive`. AE `[EMITTED]`: `PlayerBase.as`
  re-applies the combo effects every 1000 ms, and the mana/health effect is a 1000 ms
  `AttribAdd` regen buff of the same number (`tweak/buffs/buffs.sval`), so half the amount.
- `[VERIFIED]` (original IL) Priest beam: 5 parallel rays, damage tick every 200 ms
  (`beamCounter`), `beamCost` (3) taken per tick, stops at the first enemy, heals players it
  crosses. AE `[EMITTED]`: `ShootBeam` damages every `interval` 200 ms but
  `PlayerSkillDirectionalChannelling` takes `mana-cost` every `castpoint` (100 ms), so 30
  mana/s against the original's 15. `castpoint` 200 restores the original's drain.
- `[VERIFIED]` (original IL) Warlock lightning: `WarlockLightningStrike.Update` every 50 ms
  picks a random already-hit target, queries ±2 tiles around it for the best next one, hits
  everything in ±0.65 tiles of that one for `lightningDmg / (1 + times already hit)`. AE
  `[EMITTED]`: the orb (10 flat damage on hit) spawns a `BoltShooter` that fires
  `proj-bolts` bolts over 500 ms from the impact point at random enemies within `range` 50,
  one each, `consecutive-mul` 0.75 on a repeat. No travel, no splash.
- `[VERIFIED]` Attack sprites (`editor/assetsExtract/actors/player/*_a.xml`, `west-attack`):
  knight 100, warlock 120, wizard/priest/ranger 200, thief 201, sorcerer 240 ms. AE's primary
  cycles are 1.1–4.7× longer (see the comparison doc).
- AE data bug: `priest_smite_speed` tier 5 `smite-speed-pen` 0.4 (ladder 0.2–0.5; text says 40).
- The generator now patches `tweak/buffs/buffs.sval` and
  `players/warlock/projectiles/lightning_bolt.unit` (`player.extra.*`). Whether the game reads
  scenario copies of those two files is checklist #36–37.

### Level file names and StartIDs are independent (2026-10-12)

- `[EMITTED]` A level's file is now named by play order (`03_floor2.lvl`, `04_arena_boss1.lvl`)
  while its `LevelStart` StartID stays the stem (`floor1`, `boss0`). `LevelExit` takes `Level`
  (the scenario-relative file path) and `StartID` as separate parameters, and info.xml's start
  level is a path, so nothing requires them to match. `[VERIFIED]` stock does the same:
  castle `level_1.lvl` exits to `levels/level_2.lvl` with StartIDs `level_2a` / `level_3b`.
  Our own files in game: checklist #39.

### Narrow stair art leaves a hole beside the stairs (2026-10-14)

- `[VERIFIED]` (unit files) The shared `doodads/walls/exit_up.inc` / `exit_dn.inc` collide
  `0 -16 64 16` (four cells from the anchor). Three sets ship their own, two cells wide:
  cave_desert and cave_crystal `exit_up`/`exit_dn` collide `0 0 32 -24` (anchor cell and
  the next), battlement `exit_up` collides `-16 -16 32 16` (centred on the anchor).
  cave_dark borrows cave_desert's stairs.
- The generator reserved a four-cell doorway for every stair, so these themes left two or
  three wall cells open next to the art and players walked off the map (user report,
  `dungeon_441147059` floor 5). `[EMITTED]` `exitDoorway` now reserves the middle two cells
  for a narrow set, the art is anchored over them, and the wall placer fills the rest.
  `tests/themes.test.ts` checks every theme's stair rect against the reserve.

### Owning skills from the start: starting-level and the shop (2026-10-14)

- `[VERIFIED]` (`PlayerClass.as`) `starting-level` is read on a root skill *and* on each
  `modifier-skills` entry. A skill's level is `picked + starting-level`
  (`PlayerRecord.GetSkillLevel`); `SkillUp` refuses once that reaches the level count.
- `[VERIFIED]` (`PlayerBase.LoadSkills`) A skill's binds come from level 1 and the current
  level only: `[mod level N, mod level 1, …, root level N, root level 1]`, first match wins.
  A modifier only counts once its root's level is above 0.
- `[VERIFIED]` (`SkillShopMenuContent.BuildList`) A root with `starting-level` > 0 lists only
  its next upgrade (none at the top). But `AddModifiersToShop` lists any modifier nobody has
  *picked*, whatever its `starting-level`, at its level-1 price, and buying one at its top
  does nothing. So a maxed modifier has to leave the shop by `category`.
- The old "Fully upgraded" copied each bind's top value into level 1 and only unlocked the
  roots. Every modifier stayed on sale, and combo broke: the root got `combo-nova-parts` 22
  with an empty `combo-nova-projectile` (a string, never copied). `[EMITTED]` It now sets
  each chain's `starting-level` to its level count and moves maxed modifiers to the
  `owned` column, which no ShopArea sells. In game: checklist #31.

### In game: Fully upgraded, and the dead across an exit (2026-10-14)

- `[VERIFIED]` (user, checklist #31) Fully upgraded works: every skill and modifier is owned
  at its top level, the skill vendors list nothing, and combo works. So AE reads
  `starting-level` above 1 and on modifier skills from a scenario copy, and a modifier in
  the `owned` column is listed by no vendor.
- `[VERIFIED]` (user, checklist #25) A player still dead when the party exits arrives on the
  next level as a gravestone. AE has revive, not respawn: a living player must revive them.
  `SetRespawnPoint` in the exit rig does not bring them back by itself.
- `[VERIFIED]` (user) Also confirmed in game: the final-room button (#13), Everything free
  for potions and items, so a scenario copy of `scripts/Data/Misc.as` is read (#32), original
  attack movement (#34), the warlock lightning reach, so a scenario copy of a projectile unit
  is read (#37), closed lobby vendors losing their sign (#40), the Colosseum's vendors (#41)
  and the narrow-stair walls (#42). The bonus themes still have wall holes everywhere.

### The bonus sets: flat walls with their own anchors, and floor pads (2026-10-14)

- `[VERIFIED]` (unit files, `base.png`) bonus1–5 are flat 16-px tiles, and they do ship
  corners, T-junctions and caps under their own names: `crn_l_up` NW, `crn_r_up` NE,
  `crn_l_dn` SW, `crn_r_dn` SE; `x_t_dn` (stem down), `x_t_up`, `x_t_l`, `x_t_r`; `h_cap_r`
  is a *west* end and `v_cap_dn` a *top* end (named for the way the wall runs on). Each
  collides over one cell: its anchor (`0 0 16 16`) or the cell above it (`0 -16 16 16`:
  `v_16`, `x_x`, `x_t_up/l/r`, `crn_*_up`, `v_cap_up`; `v` is `0 -16 16 32`). So those are
  anchored a row *below* their footprint, the opposite of the other sets' vertical pieces.
- The generator treated the bonus sets as having no corners or junctions (falling back to
  `x_x`) and anchored their vertical pieces a row up. Most pieces landed one or two rows
  off, leaving holes everywhere (user report). `[EMITTED]` `FLAT_CANDIDATES` in aeWalls.ts.
- `[VERIFIED]` (castle `level_bonus_1..4`, sun temple `level_bonus_5`) Stock bonus levels
  have no stairs: the way in is `doodads/special/bonus_entrance.unit` and the way out is
  `bonus_exit.unit`, 24-px floor pads with no collision (the exit's first scene is
  `inactive`; `active` shows it lit). The exit has the same press-F `UseTrigger` →
  `AllPlayersArea` → `LevelExit` rig as ours. `[EMITTED]` Bonus themes now use the pads
  inside the room, under an unbroken wall, the exit started `active`; previously they
  borrowed prison stairs. Their doors are button doors (`door_*_32_bonus`) with no key
  tiers, so locked doors stay prison art.
- `tests/themes.test.ts` "walls hold" checks every theme against the game's own collision
  rects: every solid cell beside the floor must be covered.
- **Correction:** the bonus doors *are* keyed. `[VERIFIED]` Every stock bonus level locks its
  `door_h_32_bonus` / `door_v_32_bonus` doors with `DoorController(Collectable=key_bonus)`.
  They are 32×8 (8×32) bars that collide and draw at the anchor (`origin 0 0`), so one closes
  two cells, unlike the one-cell `door_*_mid_*` pieces anchored a row below. `[EMITTED]` The
  bonus themes now use them (door style `bonus`), one per two cells anchored 4 px into the
  row or column they close; an odd count ends with one shifted back a cell. Keys stay
  bronze/silver/gold (the lock tiers), so the bonus doors open with those. The prison doors
  had looked shifted up on bonus floors because their art is drawn ~32 px above their
  collision, like prison walls, while bonus walls are flat.

### Combo owned from the start never counts a kill (2026-10-14)

- `[VERIFIED]` (user) With Fully upgraded, combo never started. `[VERIFIED]` (scripts) AE's
  only two "has combo" checks read `pickedSkills["shared_misc_combo"]`, the times the combo
  was *bought*, not `GetSkillLevel` (which adds `starting-level`):
  `Player.as:183` (`KilledActor` counts combo kills) and `GiveCombo.as:38` (`CanApply`). No
  other skill is checked that way.
- `[EMITTED]` When combo is owned from the start, the scenario ships both scripts with the
  check rewritten to `GetSkillLevel(...)` (`COMBO_OWNED_FIXES`). In game: checklist #44.

### In game: bonus themes, owned combo, buff fields (2026-10-14)

- `[VERIFIED]` (user, #43) Bonus floors: whole walls, the entrance and exit pads, and the
  bonus doors lined up and opened by the tier keys (a DoorController opens bonus doors
  whatever its Collectable).
- `[VERIFIED]` (user, #44) Combo owned from the start works with the patched `Player.as` and
  `GiveCombo.as`, so a scenario copy of a core player script is read.
- `[VERIFIED]` (user, #17) Buff fields apply to the targets they name, players and monsters.

### Priest cripple aura stops mana regen (2026-10-14)

- `[VERIFIED]` (stock files) `priest_cripple_aura` is a `ToggleableSkill` with a
  `ConvertStat ManaRegen→ManaRegen mul 0` modifier, active only while the aura is on
  (`ToggleableSkill.GetModifiers`): the priest regenerates no mana while it runs. The top
  upgrade (`mana-drain` 0) removes the aura's drain, not the regen block. Fully upgraded
  owns the aura from the start, which is how a "no mana regen" priest showed up (user
  report). Stock AE, not a generator bug. `docs/discovery/priest-mana-regen.md`.

### Every boot-checklist row verified (2026-10-14)

- `[VERIFIED]` (user, #28) Per-class move speed works: each class's own copy of the speed
  skill, pointed to through the scenario's `classes.sval`, is read.
- `[VERIFIED]` (user, #38) The original beam mana cost (`castpoint` 200) halves the priest
  beam's drain, judged with cripple aura off.
- No row of `docs/BOOT-CHECKLIST.md` is left UNCONFIRMED.

### AE bosses take trap damage; no trap lane aims at a stationary boss (2026-10-14)

- `[VERIFIED]` (user) In AE, bosses take damage from trap projectiles; in the original
  Hammerwatch they never did. A trap aimed at the queen or a dragon, which can't move,
  wears it down on its own for the whole fight.
- `[EMITTED]` `boss/traps.ts` `wallSlots` drops every slot whose straight lane (through the
  tile centre) passes within a stationary boss's collision circle plus 0.5 tile, with the
  boss ahead of the spewer. The circles come from `arena.ts` (actor position, art nudge
  and collision offsets; the queen's circle sits 15 px left, `collisionOffsetX`). Spread
  may still clip a stationary boss now and then; mobile bosses are fair game. Validation's
  over-asked-wall warning says a queen or dragon takes lanes too.
- **Correction (user, in game):** left and right traps still hit the red dragon. A boss's
  hittable shape is not one circle: `[VERIFIED]` (unit files) every scene lists several
  `<collision>` circles, body plus head sensors (`shoot-through="false"`) that move
  between animations. The dragon's reach 53 px below its anchor and 45 px to each side,
  the frost dragon's 121 px below, and the queen has a second circle (`20 -35 r50`).
  `[EMITTED]` `BossDef.hitCircles` holds the union over all scenes for the three stationary
  bosses (a test holds it to the unit files), and every trap lane keeps off all of them.

### Traps verified; frost dragon seated 16 px higher (2026-10-14)

- `[VERIFIED]` (user, #45) Trap lanes now spare the queen and both dragons.
- `[EMITTED]` The frost dragon (`boss_dragon_hwr`) gets `artNudgeY` −16 px, from the user's
  hand edit of `04_arena_boss3.lvl` (y 32 against the generator's 48: north wall line at
  y −16, `topWallBossY` row 3). Art only, like the red dragon's −24 px. In game: checklist #46.
- `[EMITTED]` Validation: a boss lineup naming both dragons is an error (the arena has one
  top-wall slot, so they would spawn on top of each other). Random picks never roll both.
- `[VERIFIED]` (user) The frost dragon's 16 px seat (#46), Bonus Gauntlet without wall
  torches (#47), and the both-dragons lineup error (#48).

### Post-port sweep: open entries closed (2026-10-15)

- `[VERIFIED]` (checklist #2) Forcing lives: `forced="true"` on `NO_LIVES` is the value the
  engine accepts; "No lives" is locked on. Closes "Lives ... forcing them [UNVERIFIED in game]".
- `[VERIFIED]` (user, #49) `LevelLoaded` (a `ScriptLink` with `ExecuteOnStart`) fires on
  arrival: Colosseum survival rounds run, played several times in co-op.
- `[VERIFIED]` (user, #50) A floor boss's tier 0 wave arms on `LevelLoaded`.
- `[VERIFIED]` (user, #51) Monster and boss projectiles fire from wall spewers, not only
  the ten stock trap projectiles.
- `[VERIFIED]` (user, #52) Mystery plates spawn `valuable_diamond_small`,
  `valuable_diamond_small_red` and `valuable_diamond` through `SpawnObject`.
- `[VERIFIED]` (#25) Dead players are not respawned: they arrive as gravestones and a
  living player revives them (AE's revive system).
- Still `[UNVERIFIED]`: the names given to music modes 20/21 (`music/tracks.ts`).

### Shaftlocke roster sweep against the stock levels (2026-10-15)

Every `actors/...unit` placed in `scenarios/shaftlocke_tower/levels/hwr/*.lvl` (219 paths)
checked against the roster.

- `[VERIFIED]` (unit files) `shaftlocke/skeleton_wizard.unit` is not the castle wizard:
  `Miniboss` behaviour, 1750 hp (castle 1200), `evade-magical` 0.25, a `BossScatterBurstSkill`
  of `skeleton_wizard_fireball`, glyph traps and a `BlinkSkill`. Only it fires that fireball;
  the battlemage throws `battlemage_lurker(_seeking)`. Added as `mb_shaftlocke_wizard`.
- `[VERIFIED]` (unit files) `shaftlocke/skeleton_guard.unit` differs from the castle guard only
  in its coat colours (blue); `beasts/maggots/shaftlocke/maggot_mb.unit` spawns the Shaftlocke
  grubs and halves `mp-scale-fact`. Added as `mb_shaftlocke_guard` / `mb_shaftlocke_maggot`.
- `[VERIFIED]` (unit files) Every `challenge/` unit keeps its original's hp and skills; they
  differ only in `loot` emptied, aggro range ×100 (map-wide) and a higher `mp-scale-fact`.
  Not separate enemies.
- Not roster material: NPCs, boss parts and effects, the eye boss's `add_eye_*_boss`
  (they suicide without the boss), the golem arena's map-aggro bats, the armory ghost-key
  statues (`ghosts/statue_*`), and razed spawners.

### Shaftlocke campaign census and the Shaftlocke Tower preset (2026-10-15)

Read from `scenarios/shaftlocke_tower/levels/hwr/*.lvl`. Units are grouped by path in a
level (`<array name="actors/...unit">` then `<vec2>`/`<int>` pairs per instance, sometimes
all on one line), so instance counts are the pairs, not the path's occurrences. Scripted
spawns are `UnitType` strings on spawn scripts (the battlements' trolls are all scripted).

- `[VERIFIED]` (level files) Act order from the `LevelExit` targets: Prison 1–3 → Warden →
  Armory 1–3 (crypt tilesets) → Wraith → Archives 1–3 → Eye → Chambers 1–2 → Vampire →
  Battlements 1–2 → bridge → frost Dragon. The Mines branch off Prison 1 and end at the Golem.
- `[VERIFIED]` (level files) No gold beetles anywhere; the mines' treasure is ore deposits.
  The mines carry almost no traps (2–8 spikes and arrow shooters per level, against 250+
  fire traps in Chambers 1).
- `[VERIFIED]` (level files) Every music cue is `PlayMusic` mode 20, the dragon's level
  adds 21. The battlements also write `Music` = `event:/music/battlements`, a string in
  `PlayMusic`'s int field (`scripts/WorldScript/Sound/PlayMusic.as`), so it is dead data.
- `[VERIFIED]` (unit files, resolved with `scripts/lib/aeunit.mjs`; melee damage is the
  `DMG` argument of `%block SkillMelee CD CP DMG`) Stat twins: prison and armory warriors =
  castle warriors (10/40/120 hp, 15/20/25), their archers = castle archers, footmen = soldiers
  (20/40/210 hp, 15/25/40), Shaftlocke maggots = castle maggots. The sentry is the ranger
  (40 hp) firing every 450 ms instead of 750. The Shaftlocke lich ladder starts at
  `spawner_lich` and its sorcerer has 250 hp (castle 75). Shaftlocke-only: lancer 45 hp
  (40/30), defender 210 hp (35/25), guardian 150 hp (30 + charge-jump), battlemage 275 hp
  (40-damage seeking bolts), trapper 70 hp (root bolas), crawler 15 hp (explodes for 40).
- `[EMITTED]` The **Shaftlocke Tower** classic preset: Castle's shape on prison2, crypt,
  mine_granite (the gold-beetle floor), archives2, chambers2 and a battlement escape floor;
  music 20 everywhere but the arena (21); a random Shaftlocke boss in a chambers2 arena.
  Caps lowered from the stats above: footman 100, sentry 20, lancer 30, defender 12,
  Shaftlocke lich 20. In game: checklist #53–#55.
- A bare `spider` in `parameters.txt` is read as the HW1 id (the poison spider, `spider#0`),
  so a preset that means the white one writes `spider#1`.

### Shaftlocke Tower playtest: escape floor and bannermen (2026-10-16)

- `[VERIFIED]` (user) The Shaftlocke Tower preset plays balanced from floor 3 on; floors 1–2
  played too easy with a vermin-only opening.
- `[VERIFIED]` (user) The Battlements theme's snow tiles (`outlook_snow_16`) hide the lock
  buttons. The Shaftlocke escape floor moved to `chambers2`; the theme itself is unchanged.
- `[VERIFIED]` (user) The classic escape rig (`shooter_fireball` ×8 per wall at 1000 ms, the
  HW1 070 set's) is far too dense in AE. Stock AE never runs an always-on fireball spewer, so
  there is no stock rate to copy. `[EMITTED]` Every classic preset now fires it at 2000 ms
  (`ESCAPE_TRAP_RATE_MS`), still 8 per wall. In game: checklist #56.
- `[VERIFIED]` (user) Bannermen are welcome in numbers: they carry a banner's buff and have
  no attack. `[EMITTED]` Caps 6 → 10 (each and the family). They now join the crypt, archives
  and chambers pools and one pair rides each arena tier from 75% to 25%.
- `[EMITTED]` (2026-10-16, second pass) The Shaftlocke preset pools every enemy the stock acts
  place: castle elite archer (prison, crypt), bat mini-boss (mines), sharpshooter, the Eye's
  adds and ghosts (archives), sharpshooter t2, thralls and doomspawners (chambers). The mines
  pool `tick_gold` 3 times in 9: over 60 seeds floor 5 averages 23 golden ticks (Castle 11)
  and 2 runs in 60 have none (Castle 8). At one entry in 6 both presets averaged 11–16 and
  about one run in eight had none, which is what playtested as "fewer beetles".
- `[VERIFIED]` (user, 2026-10-16) After the second pass the Shaftlocke preset plays fair through
  to the arena. The escape floor (chambers, slower fireballs, checklist #56) is still
  unplayed: the run stopped at the Warden, which plays hard.

### Equipment: item tiers, the item stand's badge, SpawnEquipment (2026-10-16)

- `[VERIFIED]` (files) An item vendor (`ShopArea` Type 2) sells AE's loot tables from
  `tweak/shops/equipment.sval`. Each `equipment_<n>` table is 5 pools; each pool rolls a
  quality, then an unsold item of it (`unique-in-pool`, `ignore-shop-blocked` false). Tier 1
  is 5 common. Tier 2 is 3 common, 1 common/uncommon, 1 uncommon. Tier 3 is 3 common/uncommon
  and 2 uncommon. Tier 4 is 2 common/uncommon, 1 uncommon, 1 uncommon/rare and 1 rare. Tier 5
  is 2 common/uncommon/rare, 1 uncommon, 1 rare and 1 epic. No table rolls `unique`.
  `specific_1` and `st_equipment_1..3` also exist and are unused here. Snapshot:
  `catalog/equipment.generated.ts` (`scripts/scan-ae-equipment.ts`).
- `[VERIFIED]` (files) The items: `tweak/items/{common,uncommon,rare,epic,unique}.sval`
  (7/10/11/7/5). Names and effects come from `res/language/english/items.lang` (outside
  `unpacked_assets`). Prices are per quality in `scripts/Data/Misc.as`: 200/350/750/1200/1500.
  4 of the 5 uniques are `shop-blocked` (all but `summoner_book`).
- `[VERIFIED]` (files) Stock dungeon vendors pair an item stand with a potion stand
  (`prefabs/shops/shop_dungeonvendor_*.pfb`): mines t1, prison t2, armory t3, archives t4,
  chambers t5.
- `[EMITTED]` The item stand's tier badge: `shop_item.unit` has scenes `none` and `1`–`5`,
  and the stock `prefabs/shop_item_t<n>.pfb` set `start="<n>"`. The generator sets `start` to
  the highest tier a stand sells, in lobbies and floor shops. In game: checklist #57–#58.
- `[VERIFIED]` (files) `Item::Quality` is a flag enum: Common 1, Uncommon 2, Rare 4, Epic 8,
  Legendary 16, Quest 32, Unique 64 (`scripts/Items/Item.as`). `GetRandomQualityEquipment`
  skips shop-blocked items, so a random unique by quality can only give `summoner_book`.
- `[EMITTED]` `SpawnEquipment` (`scripts/WorldScript/SpawnEquipment.as`) on a mystery plate:
  `ID` for a named item (`Item::Get`, which ignores shop-blocking) or `Quality` for a random
  one, serialised like `prefabs/puzzles/bullsandcows.pfb`. A "random unique" is picked by the
  generator from `mysteryRand` and emitted by `ID`. In game: checklist #59.

### Hidden lock buttons: the south wall's art covers a room's last two rows (2026-10-16)

- `[VERIFIED]` (user, dungeon_336053618, Shaftlocke) Floor 7's lock button could not be found.
  It stood at tile y 24.5 in a room whose floor ends on row 25. The south wall's pieces
  (`chambers2/h.unit`, anchored at row 26) collide on their own row but draw 32 px up, over
  rows 24–25. That floor is walkable (the party goes behind the wall) but nothing on it can
  be seen. Reproduced byte-identically from the preset and seed.
- Cause: lock buttons, keys and lock powerups drew y with the HW1 original's
  `fRand(y + 2, y + height)`. In HW1 wall art hangs *down* over the north rows (hence the
  `+ 2`), so the south end was safe; in AE it reaches *up* over the south rows.
  `[EMITTED]` `room.ts visibleDropY` keeps a plate's whole tile above `y + height - 1`, with
  the same single draw. Mystery plates skip tiles below `y + height - 3`. Test:
  `tests/visiblePlates.test.ts` (failed on Castle and Shaftlocke seeds before the fix).
  In game: checklist #60.
- `[UNVERIFIED]` The earlier "Battlements snow tiles hide the lock buttons" (Shaftlocke
  playtest, same day) was probably this bug, not the snow: `outlook_snow_16` draws at layer
  −25 and `boss_door_button`'s sprites at −9/−1, so the snow cannot cover a button. The
  Battlements theme may be fine for an escape floor after all.

### Visible plates confirmed; escape fireballs at 1.5 s (2026-10-17)

- `[VERIFIED]` (user) Reinstalled Shaftlocke seed 336053618: floor 7's lock button stands in
  plain sight and the run finishes (checklist #60). The user puts the earlier "impossible"
  escape floor down to the fast fireballs together with a hidden mystery plate.
- `[VERIFIED]` (user) Escape fireballs at 2000 ms play fair but "a bit slow". `[EMITTED]`
  `ESCAPE_TRAP_RATE_MS` 2000 → 1500, still 8 per wall. In game: checklist #56.

### Shaftlocke's town as a lobby (2026-10-17)

- `[VERIFIED]` (read) `scenarios/shaftlocke_tower/levels/hwr/town.lvl` (The Outlook,
  `outlook.env`): 6,941 units, 660 scripts, about 209×110 tiles. The game mode carries
  `SlideShow intro_hwr`, which `readLevel` drops. Thirteen `LevelExit`s lead to
  `levels/hwr/*.lvl`. The north gate (`UseTrigger "Exit"`) goes to `mines_1`, and the
  central `teleport_mt` (start `closed`, opened by `SetUnitScene "open"`) goes to the other
  twelve, which are chosen with `exit_teleport_switch_outlook_*` and `hub_teleport_*` flags.
- `[VERIFIED]` (read) Its stalls are tiered. Each vendor `UseTrigger` names 4–6 `ShopArea`s
  (`off0`, `off1`, `off1 off2`, … `off1..off5`), and town upgrades switch between them:
  `GlobalEventTrigger shop_<kind>_<n>` → `SetFlag` + `SetUnitScene "<n>"` on the stand,
  plus `CheckFlag` → `ToggleScripts` when the vendor is used. The stands' scenes are `1`–`5`
  (`shop_offense`, `shop_health`, `shop_combo`, `shop_item_hwr`) and `hwr1`–`hwr5`
  (`shop_defense`). `shop_item_hwr` has the same `none`/`1`–`5` badge scenes as
  `shop_item`. `ShopArea Type 3`, category `shaftlocke`, is the town-upgrade shop. The
  power stall (`shop_potion`) is only spawned by a quest (`SpawnUnit`). The defense, misc
  and item stands start with an NPC actor standing on them, which a `TEMP` `AreaTrigger`
  removes.
- `[VERIFIED]` (read) The rest of the scripts are story: dialogs, tutorials, player voice
  lines, guard rotations, prisoner and elevator counters, Steam stats (`PlatformStat`
  `HWRShop`, `HWRElevator`, `HWRQuest*`), and five `gui/fonts/arial14.fnt` units (the
  editor's debug labels, which aren't in the asset snapshot).
- `[EMITTED]` `src/generator/lobby/stockTown.ts` keeps the map and these scripts: the
  StartID-less `LevelStart`, each vendor `UseTrigger` with its widest `ShopArea` (labelled
  `lobby:vendor:<id>`, moved onto its stand) and its `PlaySound`, `ExploreMinimap`, and
  `RegionArea "town"`. It bakes every scripted scene at its top tier (stalls `5`/`hwr5`,
  fountain `tier-2`, teleporter `open`) and places the quest-spawned power stand. It drops
  actors, the portal selectors, pickups, the debug labels and orphaned sensors. The lobby
  builder lays its press-F exit on `teleport_mt`. The importer is
  `scripts/import-shaftlocke-town.ts`, and it's the `shaftlocke_town` lobby option
  (479 KB). In game: checklist #61–#63.

### Boss hp, attack speed and the clock presets' hunts (2026-10-18)

- `[VERIFIED]` (unit files and their `.inc`s) Boss `hp` / `mp-scale-fact`: Krilith 850 / 0.5,
  worm 750 and 1000 / 0.5, wraith 1200 / 1.25, golem 1600 / 1.25, knight 2500 / 0.65, queen
  2500 / 0.5, warden 3000 / 1.25, seeress (`bat_mb_boss`) 3750 / 0.85, lich 4000 / 0.65, eye
  8000 / 1.5, Anubis 12000 and 9000 / 0.5, vampire 14000 / 1.25, both dragons 15000 / 0.65
  and 1.35. The Shaftlocke bosses scale up per extra co-op player about twice as hard as the
  Castle and Temple ones.
- `[VERIFIED]` (user) In AE, stock attacks are slower than the original's: the archer and
  paladin can't rapid-fire or rapid-slash the way they did. A paladin and archer party (the
  paladin built for tanking) couldn't kill a plain knight inside the old 180 s hunt. The
  Original Hammerwatch attack switches or a mage make it easier, but the presets are tuned
  for stock.
- `[EMITTED]` The clock presets hunt for 300 s and draw the boss from `HUNT_BOSS_IDS`
  (claudePresets.ts): every mobile boss with 2500 hp or less. The floor timer's countdown
  warning moved from 200 s to 300 s. Measured on Beat the Clock seed 4242, 300 ticks cost
  about 35 KB more than 180 on a 105 KB floor. In game: checklist #65.
- `[VERIFIED]` (`PartyRecord.GiveLife`, see the Lives entry) An extra-life pickup is a no-op
  under forced No Lives, so Double or Nothing's top prize is now the Heirloom (random unique
  plus a red diamond). A preset test holds every Claude preset to no life drops.
- `[VERIFIED]` (unit files) AE-only pickups: `upgrade_speed(_2)` and
  `upgrade_attackspeed(_2)` give `speed_1/2` and `attackspeed_1/2`, shown as +5 % and
  +10 %. `powerup_potion_4_spd` is the `potion_speed` usable potion: `tweak/buffs/buffs.sval`
  gives it `speed-mul`, `cast-speed` and `attack-speed` 2 for 10000 ms. `[EMITTED]` as pickups
  `upgrade_speed(_2)`, `upgrade_attackspeed(_2)` and `potion_4`, and as five starter plate
  buttons appended last. In game: checklist #64.
- `[VERIFIED]` (unit files) The wraith is a `TransferDamageActor` with `immortal` true and
  the golem a `CompositeActorBehavior`. Both died to the party in an arena (checklist #54),
  so both are hunt bosses.

### Start-scene lists; the Temple of the Sun bazaar as a lobby (2026-10-18)

- `[VERIFIED]` (stock levels) A unit's `start` can be an array of scenes shown at once:
  `<array name="start"><string>vendor7</string><string>icon-combo</string><string>1</string></array>`.
  Shaftlocke's town has 13 single-scene lists (`window_1a-white`, `window_1a-white_inside`
  on `stone_5/h_32` walls); the Sun hub's 8 shopkeepers are `[body, icon, tier]`. The level
  reader used to turn these into an empty string, so the `shaftlocke_town` embed lost its
  window scenes. `[EMITTED]` `StateValue` `strings` round-trips them; the town was re-imported
  and the 13 walls are the only change. In game: checklist #71.
- `[VERIFIED]` (`scripts/WorldScript/Units/SetUnitScene.as`) `SetUnitScene` *replaces* a
  unit's scene (`SetUnitScene(set[id])`, one scene). Baking a scripted tier into a list start
  must replace only the matching element, not the whole list.
- `[VERIFIED]` (read) The Sun hub (`sun_temple/levels/sun_temple/level_hub.lvl`, the campaign's
  start level; env `cityofstone.env`): the arrival is the StartID-less `LevelStart` at the SE
  road gate (tile 34.5, 42.5). Vendors are `doodads/generic/npc_dungeonvendor_desert.unit`
  shopkeepers, not `shop_*` stands; its scenes are bodies `vendor1`–`7`, icons `icon-off`,
  `icon-def`, `icon-vit` (misc), `icon-combo`, `icon-item`, `icon-pow`, a quest `puzzle`
  marker, tier numerals `0`–`5`, and empty `none*`. Each vendor's `UseTrigger` (Icon 4) has
  its `Areas` circle on the shopkeeper. Tiers: `off0`/`def0`… to `…5`, `misc1..`, `combo1..`,
  raised by depositing vendor coins (`collectable_2_vendor_coin`, key `ore`) in the
  `deco_vendor_basket` beside each stall. The power vendor is `ShopArea Type 1` behind a
  quest (`puzzle` → `icon-pow`). The equipment shop is `Type 2`, categories
  `st_equipment_1/2/3`, reached from its `UseTrigger` only through `CheckFlag boss_2_killed`.
  The square's `teleport_mt` (start `closed`) sits under the portal selector
  `exit_teleport_switch_desert`; a `teleport_red` boss pad stands in the guard-boss courtyard.
- `[EMITTED]` `stockTown.ts` now holds both towns (`STOCK_TOWNS`), cleaned by one routine:
  it also wires each kept vendor `UseTrigger` straight to its `ShopArea`, and bakes a list
  start by scene kind (tier numeral, `icon-*`/`puzzle`). The Sun bazaar drops `teleport_red`.
  The builder treats `npc_dungeonvendor_desert` as a stand (`VENDOR_STAND`), sets a
  shopkeeper's tier numeral to the highest column the stall sells, and removes the
  shopkeeper of a stall that sells nothing. `st_equipment_*` maps to the item vendor. The
  importer is now `scripts/import-stock-towns.ts`; the `sun_bazaar` lobby is 190 KB
  (3072 → 2982 units, 691 → 14 scripts). In game: checklist #68–#70.
- `[VERIFIED]` (played, 2026-10-18, checklist #68–#70) The `sun_bazaar` lobby boots, and the
  party walks from the south-east gate into the square. The shopkeepers show body, icon and
  tier numeral, so AE accepts a `strings` start list written by our level writer, not just
  stock's. Each stall sells the Lobby tab's columns, and press F on `teleport_mt` moves the
  party to the first floor.
