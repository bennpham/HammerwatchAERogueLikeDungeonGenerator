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
