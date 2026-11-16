# Claude Generated Open World presets

Date: 2026-11-14. A plan, not built. It needs no generator change: everything here is preset data.

## What it is

A new preset group, **Claude Generated Open World**, for campaigns that put islands in the slot order. No campaign preset uses a world today; the four World-tab presets only patch one island.

A run of nothing but islands would get dull, so each preset uses its islands differently: as the way into a dungeon, the way out of one, a hunting ground, or a race.

## What an island can do today

Every preset below stays inside these limits (`src/generator/world/`, plan in [world-mode.md](world-mode.md)):

- The party arrives at the centre of the island. The exit portal is also at the centre, closed.
- Objectives are **buttons** to find and **bosses** to kill. When all are done, the portal opens. On the last slot of a campaign a victory orb appears instead.
- So "find the dungeon entrance" and "find the way out" are the same mechanic: find the buttons that open the portal. The portal is blue before a floor, town or island, and red before an arena.
- Island bosses must be mobile: no dragons and no queen.
- An island can carry a timer (up to 1800 seconds), packs, ambushes, loot, mystery plates and disguised buttons.
- Shops exist only in town slots, and survival only in arena slots.
- Every island has its own settings, and a floor leads onto an island by its normal stairs.

Limits taken from [world-mode-audit.md](world-mode-audit.md):

- Islands stay at 256 tiles or smaller. Generation freezes the app on big ones (C1).
- At most one boss per island. Several cluster on one side (D1).
- The safe radius stays at the default 20 or lower on islands under 160 tiles (A1).
- No plateaus and no village start. Those are unplayed (boot checklist #102–#115).

## The six presets

Orders are written as slots: L town, W island, a number for a floor, B boss arena, S survival arena.

### 1. The Lost Entrance (about 45 minutes)

*Find the dungeon.* `L1, W1, 1, 2, 3, L2, B1`

- **Island:** grass, 192 tiles. Four buttons, all disguised as mystery plates, among eight real plates. No boss. Trails off, so nothing points the way.
- **Floors:** the portal leads down into `cave_dark`, then `crypt`, then `chambers2`, with one button lock each.
- **Finale:** one boss from the Shaftlocke pool.
- **Why it is different:** the island is a search, and every plate is a gamble on whether it is a button or a trap.

### 2. Breakout (about 35 minutes)

*Escape the dungeon, then the island.* `1, 2, W1, 3`

- **Floors 1–2:** `prison`, with no lobby first. The party starts in the cells with nothing bought.
- **Island:** woods, 160 tiles, reached by the stairs out of floor 2. Three buttons, heavy ambushes, and a 600-second timer. The portal opens when the buttons are found.
- **Floor 3:** the stock escape floor: `escapeFloorTimer()` and `escapeFloorTraps()` (`parameters.ts:675-688`), ending on the orb.
- **Why it is different:** no shop at the start, so the floor shop rooms are the only place to spend gold. The island is the middle of the run, not the start.
- **Variant to consider:** end on the island (`1, 2, 3, W1`), where the orb appears when the last button is pressed. Shorter, and no escape floor.

### 3. Manhunt (about 50 minutes)

*Hunt fugitive bosses across three islands.* `L1, W1, W2, L2, W3, B1`

- **Each island:** no buttons, one boss, trails off, landmarks on. The boss's bar appears only within 10 tiles, so the party must sweep the island to find it. Killing it opens the portal.
- **Island 1:** woods, 160 tiles, `boss_warden`. **Island 2:** marsh, 192 tiles, `boss_wraith`. **Island 3:** ashland, 224 tiles, `boss_golem`.
- Packs get denser and ambushes larger on each island.
- **Finale:** the ringleader, `boss_vampire`, in a `crypt` arena.
- **Why it is different:** the islands have no puzzle at all, only a quarry. Each lineup is fixed, so the fugitives never repeat.
- **Limit:** the boss does not flee or roam. It waits at its site. A boss that runs would be a generator feature and is out of scope.

### 4. Archipelago (about 60 minutes)

*Island hopping, no dungeon at all.* `L1, W1, W2, L2, W3, W4`

- Four small islands (128 to 160 tiles), a different biome and monster theme each: beach with `castle_act1`, desert with `temple`, snow with `frost`, crystal with `mixed`.
- Objectives climb: 2 buttons; 3 buttons; 3 buttons and a boss; 4 buttons and a boss.
- A town sits between islands 2 and 3. The fourth island is last, so its orb ends the run.
- **Why it is different:** it is the pure open-world run, kept short per island so it doesn't drag.

### 5. Surface and Depths (about 75 minutes)

*Each island hides the way into a matching dungeon.* `W1, 1, W2, 2, W3, 3, L1, B1`

- **Desert island → `pyramid_inside` floor.** **Snow island → `cave_crystal` floor.** **Ashland island → `cave_dark` floor.**
- Each island has three buttons. Each floor is a normal floor with one button lock, and its stairs come up onto the next island.
- Monster themes match on both sides of each portal (`temple`, `frost`, `mixed`).
- The only town comes before the finale, a two-boss arena.
- **Why it is different:** it alternates above and below ground six times, and the party goes a long way before its first shop.

### 6. Storm Front (about 30 minutes)

*Outrun the storm.* `L1, W1, W2, W3, S1`

- Three small islands (128 tiles), each on a timer: 300, 240 and 180 seconds, at 1 damage every 500 ms after expiry. Three buttons each, trails **on** so the route is readable at speed.
- Biomes: beach, marsh, autumn.
- **Finale:** a two-minute survival arena built like `clockArena` (`claudePresets.ts:436`).
- **Why it is different:** the only timed open-world run. The hazard is soft on purpose: the balance audit (B1) found the existing hard timers end a run in seconds.

## Shared settings

- **Towns:** `house` unless a preset's theme has its own. Standard gold, 10000 at the start and 20000 before a finale.
- **Monsters:** every island sets its own pool from `world/monsterThemes.ts`. Biomes carry no roster.
- **Mystery plates on islands** need a campaign mystery pool. Presets that use them (1 and 5) set `mysteryButtons` from `presetMystery.ts`.
- **Starts:** `camp` or `bare`. Never `village` or `random` (random can pick the village).

## Building it

- **New file** `src/generator/config/worldCampaignPresets.ts`, exporting `WORLD_CAMPAIGN_PRESETS`.
- **Helpers.** A `W` slot helper beside `L`, `F` and `B`, and an `island()` helper that spreads `defaultWorld()` (`world/options.ts:183`) with overrides, as `lobby()` and `arena()` do. This shares the helper module the [Campaign Mode plan](campaign-mode.md) proposes.
- **The group.** Add `claudeWorld` ("Claude Generated Open World") to `PresetGroupId` and `PRESET_GROUPS` in `config/presets.ts:31-38`, after Claude Generated, and the presets to `CAMPAIGN_PRESETS`. Keep its labels alphabetical, as the Claude group does.
- **World mode must be switched on** in each preset's `world` options. `campaign()` inherits it switched off.

## Tests

The per-preset checks in `tests/presets.test.ts:328-411` apply to any new preset. Add:

- The group exists and every preset in it has at least one island in its order.
- Every island is 256 tiles or smaller, has at most one boss, and doesn't start in a village.
- Each preset's signature: Breakout has no lobby and ends on a timed floor; Manhunt's islands have no buttons and one boss each; Storm Front's islands all have timers that shrink; Surface and Depths alternates island and floor three times.
- Two slot orders that have no test today: an island as the first slot of a mixed campaign (Surface and Depths), and an island followed by a town (Manhunt, Archipelago).

## Play checks

None of these slot orders has been played. Add one row per preset to `docs/BOOT-CHECKLIST.md` when they are built, and check in particular:

- Stairs from a floor arrive at the island's centre, and the island's portal arrives at the next floor's start (Breakout, Surface and Depths).
- An island as the very first level of a campaign, with no town before it (Surface and Depths).
- An island's portal into a town, and a town's teleporter onto an island (Manhunt, Archipelago).
- A lone boss on a 224-tile island can be found in reasonable time without trails (Manhunt).
- The island timers leave enough time on a first attempt (Storm Front, Breakout).

## Ideas that need generator work

Left out on purpose, in rough order of value:

1. **An exit away from the centre**: a cave mouth or a boat at a far site, so the entrance or the escape is a place to reach, not a portal beside the arrival point.
2. **A boss that flees** to another site at each health threshold.
3. **A shop on the island**, so the village start sells something.
4. **Survival waves on an island.**
