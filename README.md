# Hammerwatch AE Dungeon Generator

A desktop app (Electron + React + TypeScript) that generates random rogue-like
campaigns for **Hammerwatch Anniversary Edition**.
Pick your settings, press **Generate**, look at the map preview, and install
the result straight into the game as a scenario.

It is a fork of the Hammerwatch 1 remake,
[HammerwatchRogueLikeDungeonGeneratorRemake](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake),
which is itself a remake of the original terminal Java tool from the Hammerwatch
forums
([archived thread](https://web.archive.org/web/20191207054106/http://hammerwatch.com/forum/index.php?topic=1658.0)).
This fork targets **Anniversary Edition only**. It writes AE's own `.lvl` level
format, uses AE's assets, scripts and player files, and has no Hammerwatch 1
output. Old HW1 `parameters.txt` files still import: their ids are translated.

## What it makes

A campaign is an AE **scenario**. The app writes the folder below, then packs it
into a `.h1c` with the game's own `PACKAGER.exe`:

```
dungeon_<seed>/
├── info.xml                    scenario name, start level, the forced "No lives" modifier
├── logos.png
├── levels/dungeon_<seed>/      one .lvl per slot, numbered in play order
│   ├── 01_lobby1.lvl           a shop lobby (optional, anywhere in the order)
│   ├── 02_floor1.lvl           a dungeon floor
│   ├── …
│   ├── 06_arena_boss1.lvl      a boss arena (or arena_survivalN for a survival round)
│   └── …                       the last slot holds the victory orb
└── players/ scripts/ tweak/ effects/
                                patched copies of the game's own files, only when a
                                setting needs one (player balance, shop prices,
                                lighting brightness, the combo fix)
```

In game, the campaign appears in the scenario list as **Dungeon #&lt;seed&gt;**.

## Requirements

- **Hammerwatch Anniversary Edition** (Steam). The app finds the install itself;
  you can also browse to it. The folder must contain `HW1A.exe` and `PACKAGER.exe`.
- **Windows** to install directly. `PACKAGER.exe` is a Windows tool: on Linux and
  macOS the app runs it through `wine`. Without wine, use **Export folder…** and pack
  it on Windows.
- To build from source: Node.js (current LTS) and npm.

## Using the app

1. **Check the Hammerwatch AE folder** in the bottom panel. It is detected
   automatically and saved for next time.
2. Optionally **load a preset** from the header (see [Presets](#presets)). Campaign
   presets replace your settings; player presets replace only the Player tab.
3. **Set things up** on the tabs on the left:
   - **Lobby**: shop lobbies, their vendors, starting gold and free upgrades.
   - **Dungeon**: floors, rooms, themes, monsters, and per-floor extras (buffs,
     timers, traps, locks, floor bosses, mystery buttons, music).
   - **Arena**: boss fights and survival rounds.
   - **Floor order**: how lobbies, floors and fights interleave.
   - **Player**: class and skill balance.

   Invalid settings show inline errors and disable **Generate**. Cosmetic caveats
   show as warnings and still generate.
4. Optionally enter a **seed**. The same settings and seed always produce the same
   campaign, byte for byte. Leave it blank for a random one.
5. Press **Generate dungeon** and browse the per-floor **Dungeon preview**. The
   **Loadout** tab shows what each class starts with and ends up with after the
   shops, with your Player settings applied.
6. Press **Install into Hammerwatch AE**. That writes the scenario into
   `<AE>/scenarios`, packs it into a `.h1c` and removes the unpacked folder. Or use
   **Export folder…** / **Export .zip…** and pack it yourself.

## What's in a campaign

### Dungeon floors

Each floor is built from the seed:

1. **Rooms and passages.** Rectangular rooms are placed without overlapping and
   joined, spanning-tree style, by straight or L-shaped corridors.
2. **Special rooms.** An entrance and an exit (stairs, or pads on the bonus
   themes); a shop, a locked vault, an extra locked room and keys, each by chance.
   On the last slot there's the victory orb. Every other room is a monster lair.
3. **Population.** Each lair draws a monster from the floor's pool and spawns a
   horde, plus treasure, breakables and food, all scaled by the multipliers.
4. **Walls.** AE wall pieces, chosen per wall set, with corners, junctions, caps and
   32-px runs. Torches go on the north walls.
5. **Checks.** Every floor must be finishable: the exit is reachable and every seal
   opens. A floor that fails is re-rolled, a bounded number of times.

**Themes** are AE's own wall sets, in five groups:
- Castle Hammerwatch: prison, armory, archives, chambers.
- Shaftlocke Tower: prison2, crypt, armory2, archives2, chambers2, battlements,
  mines, challenge.
- Temple of the Sun: pyramid, pyramid fancy.
- Caves: desert, crystal, dark.
- Bonus: bonus1 to bonus5.

The bonus themes use their own flat wall pieces, their own entrance and exit pads,
and their own keyed doors.

**Per-floor extras**, all optional:
- **Buffs:** any of the game's buffs on the whole floor, aimed at players, monsters
  or both.
- **Timers:** a countdown, after which the floor damages (or heals) the party until
  they leave.
- **Traps:** projectile spewers on the walls.
- **Locked floors:** the way out sits behind a destructible wall opened by hidden
  floor buttons. Several buttons are possible, and they can be disguised among
  mystery plates.
- **Floor bosses:** a mobile boss on a dungeon floor.
- **Mystery buttons:** identical plates that spawn loot, monsters or traps, announce
  a message, or do nothing.
- **Music:** per floor.

**Lighting:** **Brightness** (AE stock, Brighter, Bright, Daylight) patches the
themes' lighting. **Wall torches** can be none, sparse, normal or dense.

### Lobbies

Shop rooms you can put anywhere in the campaign order, as many as you like. The
default room is the hand-made **house**. The classic presets shop in their own
campaign's stock room instead: Castle on the Castle Hammerwatch bridge, Desert in
the Temple of the Sun bazaar, Shaftlocke Tower in Shaftlocke's town.
New lobby rooms can be imported from the AE editor (see
[docs/LOBBY-AUTHORING.md](docs/LOBBY-AUTHORING.md)).

Each lobby has:
- **Six vendors:** combo, defense, misc and offense skills, power (potions), and
  items (AE's equipment tiers). Tick the shop columns each one sells. A vendor with
  nothing ticked is removed from the room.
- **Starting gold**, paid out as red diamonds (500 gold each).
- **Free upgrade pickups.**
- **Its own music.**

The exit is a press-F, whole-party portal.

### Arenas

One arena per fight, as many fights as you like. Each fight is a walled room with
cover pillars and a sealed alcove. It runs in one of two modes:

- **Boss mode.** One or more bosses, picked at random from a pool or as an exact
  lineup, from the Castle Hammerwatch and Shaftlocke Tower rosters.
  - Five wave tiers: the boss at 100, 75, 50 and 25% health, plus one when it dies.
    Each tier can add monsters, pickups, arena-wide buffs and wall traps. Buffs and
    traps of a new tier replace the previous tier's.
  - Optional invulnerability windows at each threshold, so a strong party can't
    skip the phases.
  - Killing the boss opens the alcove.
  - The queen and the two dragons never move, so no trap is ever aimed straight at
    them.
  - Only one dragon fits an arena (they share the top-wall slot).
- **Survival mode.** No boss: outlast a clock while timed waves, buffs, pickups and
  traps come and go.

### Floor order

A row of chips such as `L1 1 2 3 AB1 L2 4 5 AS2` (`AB` is a boss arena, `AS` a survival round), rearranged with arrows. Lobbies,
floors and fights each keep their own order; only how they interleave is up to
you. Whatever ends up **last** holds the victory orb, but a lobby can't be last.

### Player balance

The Player tab edits AE's own `players/` files.

**Quick setup:**
- **Multipliers** for prices, damage, health, mana and armor.
- **Move speed:** everyone, melee vs ranged, or per class.
- **Original Hammerwatch feel:** bow heat off, original attack movement and speed,
  original combo rewards, original priest beam cost, original chain lightning.
- **Shortcuts:**
  - *Everything free.*
  - *Fully upgraded:* every class owns every skill and upgrade at its top level from
    the start, so the skill vendors have nothing left to sell.
  - *Reset to AE stock.*

**The per-skill editor** shows every class stat, and every skill's price and
numbers tier by tier.

**Player presets** load complete builds: *Dungeon Rebalanced*, *Original
Hammerwatch* (and a rebalanced version), and Hammerwatch 2 level-1, 10, 25 and 50
bodies.

The repo never contains the game's files. It stores line numbers and stock
values, and the install patches the changed lines into a copy of your own game
files.

## Presets

**Campaign presets**, from **Load preset…** in the header:

| Group | Presets |
| --- | --- |
| Classic | Castle (default), Desert, Bonus Gauntlet |
| Pre-Alpha | Pre-Alpha (the original Java tool's settings) |
| Colosseum | Survival in Colosseum: 16 survival rounds and 4 boss fights, with a lobby before each block |
| Claude Generated | Arena Marathon, Beat the Clock, Boss Rush, Double or Nothing, Frozen Descent, Lunch Break, Pandemonium, Shell Game, The Long Haul, Trap Gauntlet |

The **(i)** in the header explains every header button, including how
`parameters.txt` and `playersettings.txt` differ.

## AE behaviour worth knowing

These are facts about the game that shape what the generator does. Each was
confirmed in game.

- **No lives.** `info.xml` forces AE's *No lives* modifier. A player who dies
  arrives on the next level as a gravestone, and a living player has to revive
  them. AE has revive, not respawn.
- **Exits are press-F and need the whole party.** Stairs, portals and pads all use
  the same rig. On your own, they show the "gather the party" message.
- **Bosses take trap damage in AE**, which they never did in the original. So trap
  lanes avoid the stationary bosses.
- **Combo owned from the start.** AE only counts combo kills for a combo that was
  *bought*. When *Fully upgraded* owns combo from the start, the scenario ships a
  fixed copy of `Player.as` and `GiveCombo.as`.
- **The priest's cripple aura stops mana regen while it's on.** That is stock AE.
  *Fully upgraded* just gives the aura out early.
- **`PACKAGER.exe` exits with code 127 even when it succeeds.** The install is
  judged by the `.h1c` it writes.

## parameters.txt and playersettings.txt

The original tool was configured with a `parameters.txt`, and the format is still
supported:

- **Import / Export parameters.txt** in the header load and save the whole campaign.
- **Import / Export playersettings.txt** do the same for the Player tab alone (its
  `player.*` lines). Load a campaign first, then a player build on top.
- A `parameters.txt` in the app's user-data folder is loaded as the starting
  settings on launch:
  - Windows: `%APPDATA%/hammerwatch-ae-roguelike-dungeon-generator`
  - Linux: `~/.config/hammerwatch-ae-roguelike-dungeon-generator`
  - macOS: `~/Library/Application Support/hammerwatch-ae-roguelike-dungeon-generator`
- [parameters.default.txt](parameters.default.txt) documents the format and every
  default. A test keeps it in step with the code.

### Key reference

Lines are `key=value`. `N` is a 0-based floor, lobby or fight index. Keys for
features that are off are simply absent.

| Keys | What they set |
| --- | --- |
| `levels`, `mapWidth`, `mapHeight`, `minRoomSize`/`maxRoomSize`, `minRoomCount`/`maxRoomCount`, `minPassageWidth`/`maxPassageWidth`, `edgePadding`, `roomPadding` | Floor count and floor geometry |
| `themes` | One AE wall set per floor, comma-separated (`prison`, `cave_desert`, `bonus2`, …) |
| `shopChance`, `vaultChance`, `lockChance`, `keyChance` | Chances of a shop, a vault, an extra locked room and keys per floor |
| `lockFloors` | Floors whose way out is locked behind button-opened walls: `floor` or `floor:buttons` |
| `monsterMultiplier`, `goldMultiplier`, `foodMultiplier` | Horde size, treasure and food scaling |
| `monstersN`, `max_<monster>` | Monster pool per floor (repeat an id to weight it); horde-size cap per type (0 turns it off) |
| `buffN`, `timerN`, `trapN`, `musicN` | Per-floor buffs (`id:target\|…`), timer, traps and music |
| `mysteryButtons`, `mysteryButtonN…`, `mysteryFloorN`, `mysteryLockN`, `mysteryLockDisguiseN` | The mystery-button pool, which floors hide how many plates, and lock buttons that look like mystery plates |
| `bossFloorN…` | A floor boss on floor N: its bosses, lineup, multiplier, invulnerability |
| `brightness`, `torches` | Lighting: `stock`/`brighter`/`bright`/`daylight`; `none`/`sparse`/`normal`/`dense` |
| `lobbies`, `lobbyNPreset`, `lobbyNGold`, `lobbyNShops`, `lobbyNUpgrades`, `lobbyNMusic` | The lobbies: count, room, gold (multiples of 500), shop columns, free upgrades, music |
| `boss`, `bossFights` | Whether there are arenas, and how many |
| `bossNMode` | `boss` or `survival` |
| `bossNTheme`, `bossNWidth`, `bossNHeight`, `bossNFloorPattern`, `bossNCover`, `bossNSpawn`, `bossNMusic` | Arena look, size range, cover pillars and spawn spacing |
| `bossNSelection`, `bossNPool`, `bossNCount`, `bossNLineup` | Which bosses: random from a pool (`bossNCount` of them), or an exact lineup |
| `bossNWaveM`, `bossNWaveBuffM`, `bossNWavePickupM`, `bossNWaveTrapM` | The five wave tiers (M = 1 to 5): monsters, buffs, pickups, traps |
| `bossNInvuln`, `bossNInvulnCountdown`, `bossNMonsterMultiplier`, `bossNFoodMultiplier` | Invulnerability windows, and arena scaling |
| `bossNSurvival…` | A survival round's clock, timed waves, buffs, pickups and traps |
| `levelOrder` | The play order: floors `1`,`2`…, lobbies `L1`…, arenas `AB1` (boss) or `AS2` (survival); plain `B1` still reads. For example `L1,1,2,AB1,3` |
| `player.…` | Player balance overrides; only values that differ from stock are written |

## AI preset assistant (optional)

A chat icon in the header turns a description ("4 icy floors, a boss on the last
one, lots of traps") into settings.

- **Opt-in.** The app makes no network request until you pick a provider and send a
  message.
- **Providers:** Pollinations (no key), Ollama (local), Groq, OpenRouter and Google
  Gemini (free keys), any OpenAI-compatible URL, or Claude with your own Anthropic
  key (paid, but gives the best results).
- **Keys** are stored by the main process only, encrypted with the OS keyring.
- **How it applies changes:** the model writes `parameters.txt` lines. The app
  validates them like an imported file and shows what would change. **Apply** stays
  disabled while there are errors, and the change can be undone.

## Development

```bash
npm install          # once
npm run dev          # run the app with hot reload
npm run typecheck    # strict TypeScript across main, preload, renderer and generator
npm test             # the full Vitest suite
npm run build        # typecheck + production build into out/
npm run dist         # installer for this platform (dist:win / dist:mac / dist:linux)
```

**Gate:** `npm run typecheck && npm test` must pass before every commit.

`HWAE_PACK=1 npm test -- tests/packer.test.ts` also packs a real scenario with
your local `PACKAGER.exe`, then removes it. Tests that read the game install skip
themselves when it isn't present; set `HWAE_ROOT` to point at another install.

### Layout

```
src/
├── generator/     the pure generator: no fs, Electron or DOM; parameters + seed in, files out
│   ├── ae/        AE .lvl reader/writer, tiles, info.xml, emit
│   ├── catalog/   asset snapshot (every unit, tileset, environment), HW1 → AE id translation
│   ├── map/       rooms, passages, AE walls, reachability, seal check
│   ├── objects/   script vocabulary, doodads, items, monster/projectile/buff rosters
│   ├── lighting/  torches and brightness
│   ├── players/   the Player tab: stock snapshot, fields, quick setup, presets, patches
│   ├── boss/ dungeonBoss/ survival/ traps/ timer/ buffs/ mystery/ music/ lobby/
│   └── config/    parameters, presets, parameters.txt, validation
├── main/          Electron main: settings, AE detection, install/PACKAGER, export, AI chat
├── preload/       the typed window.api bridge
├── renderer/      React UI
└── shared/        types shared by main and renderer
tests/             Vitest suites; levels are read back from the emitted .lvl
scripts/           asset and player scanners, the lobby importer, dev probes
docs/              boot checklist, lobby authoring, open questions
```

### Snapshots

The generator never reads the game at run time. It ships snapshots, which tests
check against your install when it's present:

| Snapshot | Regenerate with |
| --- | --- |
| Assets (`catalog/aeAssets.generated.ts`) | `node scripts/scan-ae-assets.mjs` |
| Lighting (`lighting/envs.generated.ts`) | `node scripts/run-ts.mjs scripts/scan-ae-lighting.ts` |
| Player balance (`players/stock.generated.ts`) | `node scripts/run-ts.mjs scripts/scan-ae-players.ts` |
| Lobby templates (`lobby/templates.generated.ts`) | `scripts/import-ae-lobby.mjs` |

### Rules the code keeps

- **Deterministic.** The same parameters and seed produce byte-identical files.
  Each feature draws from its own RNG stream, and a feature that's off draws nothing.
- **Every floor is finishable.** The exit is reachable and every seal opens.
- **Every asset path exists** in the snapshot.
- **Bounded loops, and validate rather than crash.** A new parameter needs a
  validation rule and a test.
- **Geometry is checked against the game.** Wall holes and door gaps are tested
  against the collision boxes in the game's own unit files, not against the
  generator's idea of them.

### Docs

- [CLAUDE.md](CLAUDE.md): the short version of the rules above, and the AE facts that
  bit us.
- [docs/BOOT-CHECKLIST.md](docs/BOOT-CHECKLIST.md): everything that only playing can
  prove, each row verified in game.
- [docs/LOBBY-AUTHORING.md](docs/LOBBY-AUTHORING.md): making a lobby in the AE editor.
- [docs/discovery/](docs/discovery/): write-ups of questions answered (or still open)
  in game.
- `.claude/skills/hammerwatch-ae-modding/references/DISCOVERY-LOG.md`: the full record
  of how AE levels, scripts and assets behave, each fact marked
  `[VERIFIED]`, `[EMITTED]` or `[UNVERIFIED]`.

## Credits

The generator's algorithm comes from the author of the original Hammerwatch forum
tool. This project builds on the
[Hammerwatch 1 remake](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake).
Hammerwatch and Hammerwatch Anniversary Edition belong to Crackshell.

License: MIT.
