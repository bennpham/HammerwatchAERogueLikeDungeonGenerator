---
name: hammerwatch-project
description: "Architecture, conventions, invariants and review bar for the Hammerwatch Rogue-like Dungeon Generator remake (Electron + React + Vite + TypeScript). Load this before making ANY change to this repo — before editing src/generator, src/main, src/preload, src/renderer, src/shared, tests, or the build config; before planning work or splitting it across subagents; and when answering questions about how the app is wired, what the parameters mean, how generation flows from GUI to .hwm, how player tweaks (class stats, upgrade costs, difficulty multipliers) become tweak/*.xml, or which module owns a behaviour. Also covers the commands that gate a change (npm run typecheck, npm test) and the module boundary rules that must not be broken."
---

# Project: Hammerwatch Rogue-like Dungeon Generator (remake)

A desktop app that generates random rogue-like campaigns for Hammerwatch and
installs them into the game. It is a TypeScript port of a Java forum tool
(`reference/original-java/`), wrapped in a GUI with live map preview and
up-front parameter validation.

## The one-paragraph mental model

`generateDungeon(params, seed)` is a **pure function**. It builds N `Level`
objects — each of which places rooms, connects them with passages, assigns
special rooms, rasterizes a wall grid, pattern-matches wall doodads, and
serializes itself into Hammerwatch's XML dialect — and returns an array of
`{path, content}` files (`info.xml`, `levels.xml`, `levels/levelN.xml`, plus
`levels/lobby<i>.xml` (one per lobby slot), `levels/boss<i>.xml` (one per boss
fight) and `tweak/*.xml`
for whichever optional layers are on) plus per-floor preview geometry. Electron's main process does everything else:
writes those files into `<Hammerwatch>/editor/<name>/`, runs
`LevelPacker.exe`, moves the resulting `.hwm` into `<Hammerwatch>/levels/`.
The renderer is a thin React form + canvas preview talking over a typed
`window.api` bridge.

## Module map

```
src/
├── generator/            PURE. No electron / fs / path / child_process / DOM.
│   ├── core/
│   │   ├── rand.ts       java.util.Random-compatible 48-bit LCG
│   │   └── context.ts    GenerationContext — replaces the Java statics
│   ├── config/
│   │   ├── parameters.ts DungeonParameters + defaultParameters() + THEMES
│   │   ├── presets.ts    CAMPAIGN_PRESETS — castle (the default + plates) /
│   │   │                 desert / bonus. Each build() returns a fresh object
│   │   ├── presetMystery.ts mysteryKit — the presets' mystery pools, picked
│   │   │                 by button NAME with weights; loot-tier pick lists
│   │   ├── claudePresets.ts CLAUDE_PRESETS — the 10 "Claude Generated" presets
│   │   ├── themes.ts     THEME_DEFS — tileset path, tile count, doodad token
│   │   ├── configFile.ts parameters.txt parse/serialize (original format)
│   │   ├── playerSettingsFile.ts playersettings.txt — the Player tab's
│   │   │                 `player.*` lines alone; import REPLACES playerTweaks
│   │   └── validation.ts every crash path of the original, as a rule
│   ├── campaign.ts       the campaign's PLAY ORDER and level ids —
│   │                     CampaignSlot (floor | boss | lobby), CampaignCounts,
│   │                     campaignOrder/normalizeOrder, the four-kind Gateway,
│   │                     gatewayAfter, slotEntryId/slotLabel, and
│   │                     bossArenaId/lobbyId with their paths. Shared,
│   │                     because both ends of every link need them (index.ts
│   │                     names the files, level.ts/room.ts/objectSet.ts and
│   │                     boss/arena.ts read the gateway, lobby/build.ts
│   │                     points a lobby's teleport at the next slot)
│   ├── xml/              XMLDictionary/Array/Int/Float/Bool/String/IntArray
│   ├── map/              level.ts, room.ts, passage.ts, tile.ts,
│   │                     wallPattern.ts, posDir.ts, reachability.ts,
│   │                     buttonSeal.ts (a locked floor's keyless gate)
│   │                     (overhang-aware flood fill), tilemapOverlay.ts
│   │                     (overlay + mixed floor datasets), coverShape.ts
│   │                     (the whole-map RectangleShape buffs and timer share)
│   ├── objects/          monsterTypes.ts (roster data + variants),
│   │                     buffTypes.ts (the 41 shipped buffs),
│   │                     pickupTypes.ts (PICKUP_DEFS + MAX_PICKUP_COUNT —
│   │                     the items a wave tier can drop), monster.ts,
│   │                     item.ts, doodad.ts, nodes.ts, scriptNode.ts,
│   │                     objectSet.ts, actorCollision.ts (which wrecks block)
│   ├── levelTemplate/    surgery.ts — shared id-targeted edits for the
│   │                     hand-authored levels (both lobby templates and the
│   │                     arena's borrowed rig), plus UPGRADE_KINDS and
│   │                     upgradeArrays() for the free upgrade pickups and
│   │                     respawnOnEntryNodes() for the arrival revive
│   ├── lobby/            the campaign's shop rooms — hand-authored levels,
│   │   │                 NOT generated geometry, any number of them
│   │   ├── presets.ts    LobbyPresetDef / LOBBY_PRESETS / lobbyPresetById —
│   │   │                 one descriptor per committed room (template, its
│   │   │                 vendor ids, exit node, diamond/upgrade slots, id
│   │   │                 bases, assets). `BETA-dungeon-prep` and
│   │   │                 `BETA-boss-prep`; adding a room is an entry here
│   │   ├── template.ts   the dungeon-prep XML verbatim (generated+committed)
│   │   ├── assets.ts     custom files it references, base64 when binary
│   │   ├── shops.ts      the five vendor stalls and their shop columns
│   │   └── build.ts      buildLobby(preset, options, exitTarget, saves) — surgical
│   │                     edits only, no RNG, no per-preset branching
│   ├── bossprep/         template.ts ONLY — the boss-prep room's committed
│   │                     XML, imported by lobby/presets.ts. It stays here
│   │                     because scripts/import-bossprep-assets.mjs
│   │                     regenerates it; its build.ts and index.ts are gone
│   ├── buffs/            field.ts — buff auras, the optional per-floor buff
│   │                     fields. Appends always-on DangerAreas after a floor
│   │                     is built; no RNG, no files of its own
│   ├── timer/            hazard.ts — timer mode, the optional per-floor timed
│   │                     damage field. Appends nodes after a floor is built;
│   │                     no RNG, no files of its own
│   ├── music/            tracks.ts (MUSIC_TRACKS + MUSIC_DEFAULT — the two
│   │                     stock soundbanks' cues), template.ts, rig.ts — the
│   │                     optional per-floor / per-lobby / per-arena music
│   │                     swap. One PlayMusic node appended after a level is
│   │                     built; no RNG, no files of its own. `default` emits
│   │                     nothing and leaves the template's own music alone
│   ├── traps/            per-floor wall traps — the ONLY per-floor layer that
│   │   │                 draws, and it draws from ctx.trapRand alone
│   │   ├── slots.ts      spewer primitives shared with boss/traps.ts —
│   │   │                 SPEWER_DIRECTION, TILE_CENTRE, the margin/spacing
│   │   │                 constants, takeSlot(rand, pool), wallCapacity.
│   │   │                 boss/traps.ts imports these and re-exports the three
│   │   │                 that validation.ts and its suite already named
│   │   └── floor.ts      buildFloorTrapRig() — spewers on room walls, live
│   │                     from load, no tiers and no triggers
│   ├── boss/             the GENERATED arena — the only new geometry since the
│   │   │                 port, and the only consumer of ctx.bossRand
│   │   ├── arena.ts      buildBossArena() — the assembler
│   │   ├── geometry.ts   arena minimums, pillar footprints, free-floor area
│   │   ├── anchors.ts    the nine spawn anchors (N/S/E/W/corners/centre)
│   │   ├── bosses.ts     BOSS_DEFS — the seven end bosses and their alcoves
│   │   ├── cover.ts      pillar patterns + the connectivity prune
│   │   ├── spawnPoints.ts scatter-mode spawn placement
│   │   ├── arenaPattern.ts geometric floor patterns for a `- mixed` arena
│   │   ├── placement.ts  shared rect/perimeter/gaussian helpers
│   │   ├── waves.ts      the five-tier spawn rig (health tiers + Boss Died)
│   │   ├── waveBuffs.ts  one arena-wide buff field per tier; they replace one
│   │   │                 another rather than stacking
│   │   ├── wavePickups.ts item drops per tier, onto the entrance drop pad;
│   │   │                 these do NOT replace one another
│   │   ├── pickupPad.ts  the pad's lane geometry (health/mana/potion/upgrade)
│   │   └── traps.ts      per-tier ProjectileSpewers along the walls; these DO
│   │                     replace one another, and are the only optional boss
│   │                     rig that draws from ctx.bossRand
│   ├── dungeonBoss/     a boss standing on an ORDINARY DUNGEON FLOOR (issue
│   │   │                 #61). Thinner than survival/, and for the opposite
│   │   │                 reason: a floor WITH a boss actor gets the `Boss ...`
│   │   │                 events for free, so boss/invulnerability.ts and
│   │   │                 boss/checkpoints.ts are called verbatim and the tier
│   │   │                 wiring of boss/waves.ts and boss/traps.ts is reused.
│   │   │                 What is new is PLACEMENT
│   │   ├── placement.ts interior free-floor tiles of a finished level — the
│   │   │                 one thing nothing else enumerated (traps/floor.ts
│   │   │                 only finds wall-adjacent slots)
│   │   ├── actor.ts     the boss itself; one draw, which boss
│   │   ├── waves.ts     boss/waves.ts's anchors path with the nine anchors
│   │   │                 swapped for floor-wide points  <- draws
│   │   ├── traps.ts     traps/floor.ts placement + boss/traps.ts tier wiring
│   │   │                 <- draws
│   │   ├── opener.ts    Boss Died -> DestroyObject on the floor's seals
│   │   └── index.ts     buildFloorBossRig() — the fixed call order
│   ├── mystery/         MYSTERY BUTTONS (issue #67) — floor plates that fire a
│   │   │                 pool button's loot/monsters/traps/text on press. The
│   │   │                 only consumer of ctx.mysteryRand; last per-floor rig
│   │   ├── placement.ts plate tiles (reachable, plate rooms, clear of items,
│   │   │                 lock plates and boss tiles), spawn rings, capacity
│   │   └── rig.ts       buildMysteryButtonRig() — the fixed draw order
│   ├── survival/        the SURVIVAL arena's rig — everything boss/'s tier
│   │   │                 rigs do, re-keyed from boss health to elapsed time.
│   │   │                 Exists because the engine fires the `Boss ...` events
│   │   │                 only for an actor in the actors/boss_* folders, so an
│   │   │                 arena with no boss gets none of them
│   │   ├── clock.ts     the one GlobalEventTrigger("LevelLoaded") everything
│   │   │                 hangs off, plus the three countdown styles
│   │   ├── waves.ts     timed spawn rows; anchors only, never scattered
│   │   ├── buffs.ts     timed aura windows — they do NOT replace one another
│   │   ├── pickups.ts   timed drops onto the same entrance pad
│   │   ├── traps.ts     timed spewer windows — the ONLY survival rig that
│   │   │                 draws, and it draws from ctx.bossRand
│   │   ├── opener.ts    DestroyObject on the alcove seals, at `seconds`
│   │   └── index.ts     buildSurvivalRig() — the fixed call order
│   ├── tweak/            player balance (tweak/*.xml) — NOT level generation
│   │   ├── types.ts      TweakFile/TweakParam/TweakUpgrade, PlayerTweaks
│   │   ├── baseline.ts   full stock transcription of the 9 game tweak files
│   │   ├── overrides.ts  TWEAK_FIELDS, applyTweaks(), emitTweakFiles()
│   │   ├── chains.ts     upgrade ladders + the curves the form edits them by
│   │   ├── bulk.ts       whole-roster knobs: stat factors, shop policy,
│   │   │                 skill unlocks, fully-upgraded preset, removals
│   │   ├── loadout.ts    buildLoadouts() — start/maxed character sheets
│   │   ├── presets.ts    PLAYER_PRESETS — named player builds for the preset
│   │   │                 dialog's Player tab, in PLAYER_PRESET_GROUPS
│   │   │                 (Generic, Anniversary Edition, Hammerwatch 2)
│   │   ├── genericPresets.ts Dungeon Rebalanced: buffs the weak classes
│   │   │                 (priest, warlock, thief, sorcerer), nerfs nothing
│   │   ├── presetParts.ts ladder()/costs() + aeMovementAndCombo(), shared
│   │   │                 by more than one preset (no import cycle)
│   │   ├── hw2Presets.ts the four Hammerwatch 2 presets: HW2 class bodies
│   │   │                 at levels 1/10/25/50 + the skill values that carry over
│   │   └── xml.ts        the tweak XML dialect (separate from xml/)
│   └── index.ts          generateDungeon() + all public types
├── main/                 index.ts (window), ipc.ts (handlers + last-result
│                         cache), packer.ts (write/pack/install), settings.ts
├── preload/              contextBridge → window.api
├── renderer/             App.tsx (Lobby|Dungeon|Boss|Floor order|Player and
│                         Preview|Loadout tabs), components/{ParameterForm,
│                         PlayerForm, QuickSetup, LobbyForm, BossForm,
│                         FloorOrderEditor,
│                         LevelPreview, LoadoutSheet, MonsterPoolsEditor,
│                         PoolGroup, PoolTextField, MonsterFilterBar,
│                         MonsterMaxTable, FloorTimerEditor, FloorBuffEditor,
                         FloorTrapEditor,
│                         BuffPicker, BuffListEditor, PickupListEditor,
│                         PickupPicker, TrapListEditor, TrapPicker,
│                         MusicPicker (Settings/Lobby/Boss music dropdowns),
│                         UpgradeCountFields, InfoTip,
│                         OutputPanel, fields},
│                         styles/app.css
└── shared/ipc.ts         types shared across the bridge
tests/                    vitest, 39 suites / 1548 tests: rand, context,
                          music, bossCheckpoints,
                          configFile, validation, generation, reachability,
                          sealIntegrity, themes (+ a
                          snapshot), presets, monsters, monsterVariants,
                          doodad, nodes, objectSet, actorCollision,
                          lobby (both presets and the slot model), boss,
                          bossWaves, bossCover, bossInvulnerability,
                          bossWaveBuffs, bossWavePickups, bossTraps,
                          campaignOrder, rearrange, floorTimer, floorBuffs,
                          floorTraps,
                          bossGeometry, bossSpawnPoints, bosses, anchors,
                          arenaPattern, packer, tweak, tweakChains, tweakBulk.
                          Helpers (not suites): params.ts — plainParameters(),
                          the default-order, NO-LOBBY base every suite that
                          mutates `levels`, the fight count or the lobby list
                          must build on — plus sealProbe.ts and xmlHelpers.ts
reference/original-java/  the Java original (read-only reference)
reference/hammerwatch-tweak-stats.md
                          human-readable tables of the same stock balance data
                          that baseline.ts encodes; both verified against a
                          real install (see the modding skill's DISCOVERY-LOG)
```

## Invariants — breaking one of these is a bug, not a tradeoff

1. **Purity of `src/generator/**`.** No Node/Electron/DOM imports. It must stay
   runnable in a plain browser or a test runner. If you need a path or a file,
   the caller in `src/main/**` supplies it.
2. **Determinism.** `(params, seed)` ⇒ byte-identical files. Forbidden inside
   the generator: `Math.random()`, `Date`, `crypto`, iteration over an object
   whose key order isn't fixed, `Array.sort` without a total comparator.
3. **Six RNG streams, never mixed.** (The sixth, `ctx.mysteryRand`
   (seed + 5), drives the per-floor mystery buttons — see *Mystery buttons*
   below; it follows the trap stream's post-acceptance rules exactly.) `ctx.rand` (seed) drives layout and
   population — the stream that must match the Java original.
   `ctx.cosmeticRand` (seed + 1) drives floor-tile variants, overlay tilesets
   and mixed-palette slots. `ctx.bossRand` (seed + 2) drives everything in the
   boss arena, which is generated after the floors precisely so it can draw as
   much as it likes. `ctx.trapRand` (seed + 3) drives the per-floor wall traps, and
   `ctx.floorBossRand` (seed + 4) the per-floor boss,
   one `iRand` per placed spewer, for the same reason: they are placed onto a
   finished floor, and drawing them from `rand` would shift every *later*
   floor's whole layout the moment any earlier floor were trapped. Drawing from
   the wrong stream shifts the ones after it and silently changes every saved
   seed. A module with nothing to draw must return **before** touching a
   stream, not draw and discard (`overlayDataset`, `mixedDatasets`,
   `buildFloorTrapRig`).
4. **Bounded loops.** `MAX_LEVEL_ATTEMPTS = 60` in `generator/index.ts`; 1000
   attempts for room placement and passage connection, 2000 for special-room
   assignment in `level.ts`; `PLACEMENT_ATTEMPTS = 40` per arena rect. Never
   make a loop unbounded, and never raise a bound to "fix" a layout that
   validation should have rejected.
5. **Validate, don't crash.** New parameters need a rule in `validation.ts`
   and a case in `tests/validation.test.ts`. Validation returns
   `{errors, warnings, valid}`; errors block generation and render inline in
   the form, warnings are advisory.
6. **`parameters.txt` stays compatible.** Keys are matched case-insensitively
   (`configFile.ts` lowercases). Unrecognized keys go into `unknownKeys` and
   are surfaced to the user — never thrown.
7. **IPC payloads stay small.** Generated file contents live in `lastResult`
   in `src/main/ipc.ts` and are *stripped* from the renderer response; the
   renderer only ever receives previews. Don't send megabytes of XML over the
   bridge.
8. **Tweaks, the lobbies and timer mode never touch the RNG.** `src/generator/tweak/**` draws no random
   values and is called *after* every level is built. A stock run (no player
   edits) must emit exactly the files it emitted before the feature existed —
   no `tweak/` folder at all. Adding a tweak field must not change any seed's
   dungeon. The same holds for `src/generator/lobby/**`: both committed rooms
   are edited by surgery after the floor loop *and* the fight loop, no random
   values, so adding, removing or reordering lobbies leaves a seed's
   `levels/level*.xml` byte-identical — only which extra files exist, and which
   level id a gateway names, may change. The one thing that *does* move a floor
   is the **kind** of gateway it gets, which is invariant 9's business, not
   this one's. An empty `lobbies` list emits no `levels/lobby*.xml` at all, and
   a preset's `assets` ship only when some lobby actually uses that preset,
   deduped by path so two dungeon-prep lobbies push each file once.
   `src/generator/boss/**` is the exception that proves the rule — it
   *does* draw, but only from `ctx.bossRand`, so turning the boss on or off
   still leaves every dungeon floor byte-identical.
   `src/generator/timer/**`, `src/generator/buffs/**` and
   `src/generator/traps/**` are the optional
   layers that deliberately *do* change a floor's XML — that is the whole
   feature — but only by appending script nodes after the floor is complete:
   its tilemap, doodads, actors, items and every pre-existing id must come out
   byte-identical, and a floor with neither configured must emit nothing at
   all. They share the floor loop, so each emitting **nothing** when its floor
   is unconfigured is also what keeps the others' ids from shifting. Traps are
   the one of the three that draws, and it draws from `ctx.trapRand` alone —
   never from `rand` — which is what keeps arming a floor from moving any
   floor's dungeon, its own included.
   Both lobby templates' **free upgrade pickups** and their two extra
   lights are on the RNG-free side of this line too: however many upgrades a
   room hands out, every `levels/level*.xml` stays byte-identical, and a kind
   left at 0 emits no item array at all. The arena's bodyguard-twin swap
   (`arenaUsesBodyguards`, `BossArenaOptions.bodyguardVariants` — absent
   means on) is the same shape again: a no-draw path substitution
   (`resolveArenaActorPath`) on which actor a wave/row names, arena-only,
   never on a dungeon floor or a floor boss's own waves.
9. **The campaign order changes links, never generation.** `levelOrder`
   (`campaign.ts`) decides where each level leads, what `levels.xml` lists and
   in what order, and which slot carries the victory orb — through
   `ctx.gateway`, which `map/level.ts`, `map/room.ts`, `objects/objectSet.ts`
   and `boss/arena.ts` read. A slot is a floor, a boss fight or a lobby; a
   fight is entered at its **arena**, and a lobby may never be the last slot
   because it has no orb. `gatewayAfter` yields four kinds — `exit` (stairs to
   a floor), `portal` (red, to an arena), `lobbyPortal` (blue, to a lobby) and
   `orb`. The three non-stairs kinds share one room-selection branch in
   `level.ts` and one three-id, zero-draw prefab contract, so swapping among
   **them** shifts nothing; swapping to or from `exit` is not free and moves
   that floor and every floor after it. Floors are still built in numeric
   order off `ctx.rand` and arenas in list order off `ctx.bossRand`. An absent
   `levelOrder` **with no lobbies** is byte-identical to the pre-feature
   generator, so that default order is stored as **absent** — but the shipped
   campaign's order is not the default one, so `defaultParameters()` and every
   preset store theirs explicitly.
10. **A floor the player cannot finish is invalid.** `map/reachability.ts`
   flood-fills the finished grid and rejects a floor unless the entrance
   reaches the exit (or orb/portal) and every key. Tile connectivity is not
   enough: lettered wall pieces are three tiles tall, so the two rows under any
   wall mass are dead space (`OVERHANG_ROWS = 2`) and a corridor that meets a
   room only inside that band is sealed in game while looking open in the
   tilemap. The fix for a sealed floor is the existing re-roll — never loosen
   the check, and never model fewer than `OVERHANG_ROWS` rows.

## Parameters (the app's whole surface)

`DungeonParameters` in `src/generator/config/parameters.ts`. Defaults mirror
`parameters.default.txt`.

| Field | Default | Notes / hard constraints |
| --- | --- | --- |
| `levels` | 8 | needs one theme AND one monster pool per level. The stock eight is seven floors, the boss fight, then the **escape floor** — see *Campaign presets* |
| `mapWidth` × `mapHeight` | 80 × 60 | ≥ 20; multiples of 20 align with tilemap blocks (warning otherwise) |
| `minRoomSize`–`maxRoomSize` | 6–20 | ≥ 3; **`maxRoomSize` ≥ 7** (stair prefab is 6 wide); height rolls up to `maxRoomSize + 2` |
| `minRoomCount`–`maxRoomCount` | 12–15 | ≥ 2 |
| `minPassageWidth`–`maxPassageWidth` | 3–6 | **`maxPassageWidth` ≤ `minRoomSize`** or doors land outside rooms |
| `edgePadding` / `roomPadding` | 2 / 2 | ≥ 0 |
| `themes` | `a_mixed`…`g_mixed` | one per level; any id in `THEME_DEFS` — bases `a`–`i`, `bonus1`–`bonus5`, each base's overlay pairings (`c_tiles`) and its `_mixed` palette. Registry in `config/themes.ts`; see *Themes* below |
| `levelLock[i]` | derived | per floor (issue #69; `lockFloors=` in parameters.txt, absent = none). A locked floor's gateway room sits in a dead-end behind a destructible wall, with a floor button hidden elsewhere on the floor, placed like a key (`map/buttonSeal.ts`). No key exists, so one cannot be hoarded or spent on the wrong door. A locked floor whose gateway is stairs takes the orb/portal branch with the **blue** `LobbyPortal` pointing at the next floor (a gateway-kind change: moves that floor and every later one). A locked BOSS floor needs the boss(es) AND the button: `dungeonBoss/opener.ts` feeds both into `boss/tierSource.ts`'s `buildCountdown`. `defaultParameters()` and every preset but Pre-Alpha derive it with `withGatewayLocks` — exactly the non-stairs, non-boss floors the old campaign-wide `lockFinalRoom` sealed, so their seeds did not move. All-unlocked is stored as absent. `buttons` (absent = 1, 0..`MAX_LOCK_BUTTONS` 20, `floorLockButtons`): N ≥ 2 builds `buttonSeal.ts`'s `buildButtonCountdown` — `Variable(N)`, per-button subtract, shared `CheckVariable(== k)` announcing "k buttons remain", `== 0` opening the wall (or feeding the boss seal countdown); 0 = no lock. `lockFloors=2:3,7` in parameters.txt |
| `shopChance` / `vaultChance` / `lockChance` / `keyChance` | 1.0 / 0.3 / 0.8 / 1.0 | 0–1 inclusive |
| `monsterMultiplier` / `goldMultiplier` / `foodMultiplier` | 1.0 / 1.1 / 1.2 | ≥ 0 |
| `levelMonsters[i]` | see defaults | non-empty; each entry is a **floor pool key** — a bare id rolls the type's tiers, `id#tier` pins one actor, a `MONSTER_FAMILIES` id rolls evenly between several whole types (`isKnownFloorPoolKey`, a deliberate sibling of the arena's stricter `isKnownMonsterKey`); repeat an entry to weight it, which is all the form's weight spinner does |
| `monsterMax[id]` | per-type | integer ≥ 0; **0 disables the type entirely** |
| `levelBuffs[i]` | absent / all empty | buff auras, one `FloorBuff[]` per floor: each `{buff, target}` where `buff` is a `BUFF_DEFS` id and `target` is `players`/`monsters`/`both`. No cap on how many a floor carries. Empty on every floor reproduces the pre-feature campaign exactly. See *Buff auras* below |
| `levelTraps[i]` | present, empty on every floor | wall traps, one `FloorTrap[]` per floor: each `{projectile, direction, spread, spawnRateMs, count}`, the same five fields a boss tier's trap row carries. `count` is spewers on the **floor**, spread over every eligible room's wall of that direction — not per room — and unlike a wave tier's `count` it has **no upper bound** (`MAX_TRAP_COUNT` applies only to `arena.waves[i].traps`): a floor's pool spans every eligible room on it, not one fixed-size arena wall, so a very large count just runs the pool dry, which validation only warns about. Always live, no tiers and no trigger. Empty on every floor reproduces the pre-feature campaign exactly. `trapN=<projectile>:<dir>:<spread>:<rate>:<count>|…` in `parameters.txt`. See *Traps per dungeon floor* below |
| `levelTimers[i]` | all off but the escape floor (90s, 1 dmg / 100ms) | timer mode, one `FloorTimer` per floor: `enabled`, `seconds` (1–3600), `damage` (−10000–10000, **negative heals**), `freqMs` (50–600000), `countdown`. Off on every floor reproduces the pre-feature campaign exactly. See *Timer mode* below |
| `floorMusic[i]` | castle: `act1,act2,act2,act3,act3,act4,act4,act4`; absent otherwise | music mode, one track id per floor (`MUSIC_TRACKS` in `music/tracks.ts` — the base `music.xml` cues plus the desert bank). `default` (`MUSIC_DEFAULT`) emits no `PlayMusic` node and leaves the template's music untouched. `musicN=<track>` in `parameters.txt`, written only for floors that swapped — **but** a file carrying any `musicN=` line rebuilds the whole array from scratch (`explicitMusic` map, `configFile.ts`), so a base object's own per-floor tracks never bleed into an index a shorter import leaves unmentioned. `lobbies[i].music` / `fights[i].arena.music` are the same knob per lobby / per arena (`lobby<i>Music`, `boss<i>Music`). See *Music* below |
| `mysteryButtons` | absent | the campaign-wide mystery-button POOL (issue #67), `MysteryButton[]`, unbounded (only the parameters.txt importer stops at `MYSTERY_PARSE_LIMIT` = 10000): each `{name?, text?, loot: WavePickup[] (MYSTERY_LOOT_DEFS ids), monsters: {monster, count}[] (arena key grammar, ≤ 100/row, unscaled), traps: BossTrap[] (≤ MAX_TRAP_COUNT, on the plate room's walls), trapSeconds?}`. Name ≤ 40 / text ≤ 120 chars, never `= < > &` or a line break (XML is unescaped; `=` breaks the line split). Empty is stored absent. `mysteryButtons=N`, `mysteryButton<i>Name/Text/Loot/Monsters/Traps/TrapSeconds` |
| `levelMystery[i]` | absent | per floor `{count ≤ 200, pool: number[]}` — 0-based pool indices repeated to weight, drawn WITH replacement; read through `floorMystery`. Absent/all-zero = none. `mysteryFloorN=<count>:<i,i,j>` |
| `levelLockMystery[i]` | absent | **enhanced lock buttons**: `{count, pool: number[], disguise?}` — up to `count` (clamped to `floorLockButtons`) of a locked floor's own lock buttons ALSO fire a mystery payload from `pool`, a separate per-floor pick list from `levelMystery`; read through `floorLockMystery` (undefined off an unlocked floor, an empty/dangling pool, or `count ≤ 0`). `disguise` (absent = off, read through `floorLockDisguised`) draws that floor's lock buttons as `TriggerButton`/`pressed` instead of `BossDoorButton`/`activate`, at construction time off zero draws. Purely ADDITIVE like `levelMystery`: draws only from `ctx.mysteryRand`, strictly after every ordinary plate draw on the floor. `mysteryLockN=<count>:<i,j,k>`, `mysteryLockDisguiseN=1` |
| `lobbySaves` | **`true`** | campaign-wide: every generated lobby gets one `items/trigger_button_save.xml` by its exit. Items-only, no RNG, `levels/level*.xml` byte-identical either way. `lobbySaves=1` in `parameters.txt`. See *Free upgrades and the arrival revive* |
| `playerTweaks` | `{ 'player.shared.remove.life': 1 }` | sparse `Record<lowercase key, number>` of player-balance overrides; empty = no `tweak/` folder. See below |
| `lobbies` | **two** — `BETA-dungeon-prep` at 10000g and `BETA-boss-prep` at 20000g, both selling all 21 columns, no free upgrades | the campaign's shop rooms, `LobbyOptions[]`. A lobby exists iff it is in this list: there is no `enabled` flag any more, and `lobbies: []` reproduces the pre-lobby campaign exactly — the same rule `boss.fights` already followed. Any number, each independently placed by `levelOrder`. `lobbies=N` in `parameters.txt`. See *Lobbies* below |
| `lobbies[i].preset` | `BETA-dungeon-prep` for a freshly added lobby (`DEFAULT_LOBBY_PRESET_ID`) | which committed room this slot edits — an id from `LOBBY_PRESETS`. `BETA-dungeon-prep` is the campaign's original starting lobby, `BETA-boss-prep` the larger room that used to be welded to every fight. `lobby<i>Preset` in `parameters.txt`; an id that is not in the registry is an error, not a fallback |
| `lobbies[i].startingGold` | 10000 / 20000 by preset | whole multiple of `LOBBY_DIAMOND_VALUE` (500) — one red diamond each — and ≤ `GOLD_SAFETY_MAX`, which is an emission limit rather than a game one. `lobby<i>Gold` |
| `lobbies[i].shopCategories` | all 21, `power` included | the shop columns this room's five stalls sell; a stall left with nothing is removed outright, shape included. Buyable lives are safe because the stock `player.shared.remove.life` tweak deletes that upgrade. `lobby<i>Shops` |
| `lobbies[i].upgrades` | every kind 0 | free upgrade pickups on that lobby's floor, one count per `UPGRADE_KINDS` entry (`damage`, `defense`, `health`, `mana`, then the four `*2` tiers). Whole number 0…`UPGRADE_COUNT_MAX` (10000) each; **0 emits no item array**. One authored slot per kind **per preset**, so a count above one *stacks* on that slot rather than needing the room's layout to grow. `lobby<i>Upgrades` in `parameters.txt`. See *Free upgrades* below |
| `boss` | **on** | the finale: `{enabled, fights}`, **one** appended level per fight — the arena. A shop before a fight is an ordinary lobby slot now, not part of the fight. See the sub-table below and *Boss finale* |
| `levelOrder` | the shipped order (**not** absent): `L1,1,…,7,L2,B1,8` | the campaign's play order, one `CampaignSlot` per lobby, per floor and per boss **fight**. Absent = every lobby, then every floor, then every fight; with `lobbies: []` that is the pre-feature shape and the only value guaranteed byte-identical. All three sequences stay ascending; only the interleaving is free, and a **lobby may never be last** (it carries no victory orb). `levelOrder=L1,1,2,B1,3` in `parameters.txt`, written only when it differs from the default. See *Campaign order* |

`BossOptions` (`config/parameters.ts`) is `{enabled, fights: BossFight[]}`, and a
`BossFight` is `{mode?, arena: BossArenaOptions, survival?}` — an arena and nothing else since
issue #48 took the prep room out of the fight (`BossPrepOptions` is deleted;
`defaultLobby('BETA-boss-prep')` placed before `B1` in `levelOrder` is what
replaces it). Defaults from
`defaultBossOptions()`, one fight from `defaultBossFight()`; read the list
through `bossFights(boss)`, which returns `[]` for a disabled or absent boss.
`boss.fights` itself defaults to one stock fight: ordered, at least one when
enabled, **no upper bound** (mirrors `levels`), written as `bossFights` in
`parameters.txt`. The table below describes one fight — `fights[i].arena`:

| Field | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | off reproduces the pre-boss campaign; the final floor keeps its own orb room. Top-level, like `fights` below |
| `arena.theme` | `g_mixed` | any `THEME_DEFS` id, independent of the floors' themes |
| `arena.floorPattern` | `random` | one of `BOSS_FLOOR_PATTERNS`; only meaningful for a `- mixed` theme |
| `arena.minWidth`–`maxWidth` | 42–64 | `boss<i>Width=42,64` in `parameters.txt`; ≥ `ARENA_MIN_WIDTH` (14). Found from both ends: 24–32 was too small to hold the horde, the 2026-08-27 interim 66–88 was so open a scattered wave never re-formed and got picked off piecemeal |
| `arena.minHeight`–`maxHeight` | 42–64 | `boss<i>Height=42,64`; ≥ `ARENA_MIN_HEIGHT` (18); same story as the width |
| `arena.bossPool` | the 4 castle bosses | non-empty subset of `BOSS_IDS` (7); the seed picks one per campaign |
| `arena.waves` | 5 populated tiers | exactly `BOSS_WAVE_COUNT`; see *Boss finale* |
| `arena.waves[i].buffs` | tier 5 only: `bloodlust` on `monsters` | any number of arena-wide buffs per tier, each `{buff, target}` aimed at `players`/`monsters`/`both`. Tiers **replace** one another rather than stacking. The pre-list fields `buff`/`buffTarget` still parse — read a tier through `waveBuffs(wave)`, never off the raw field. `boss<i>WaveBuffN` in `parameters.txt`. Every preset ships `bossDeathBuffs()` on the boss-death tier and nothing on the other four, so the walk to the orb is fought against a strengthened horde. See *Buffs per boss wave tier* |
| `arena.cover` | `symmetric`, 0.08, 4, 3 | `boss<i>Cover=symmetric,0.08,4,3` in `parameters.txt`. `density` is the fraction of free floor filled and is capped at `BOSS_COVER_DENSITY_MAX` (0.25). Playtest preference, 2026-08-28; every preset inherits it |
| `arena.spawn` | spacing 2, ring 4, clusters 3, batchSize 8, batchIntervalMs 1500 | `boss<i>Spawn=2,4,3,8,1500` — five comma fields, `spacing,ringSpacing,clusters,batchSize,batchIntervalMs`; the older three-field form still parses. Tuning for the scatter modes only; deliberately separate from `cover`. `batchSize` caps how many of one monster may appear at once, the rest trickling in every `batchIntervalMs` — see *Boss finale* |
| `arena.waves[i].pickups` | 50%: 1× `powerup_health` + 2× `mana_2`; 25%: 1× `potion_2`; boss dead: double the 50% table | item drops per health tier, each `{item, count}` with `item` in `PICKUP_DEFS` and `count` 1..`MAX_PICKUP_COUNT` (64). Unlike the buffs the tiers do **not** replace one another — drops accumulate on the entrance drop pad (`boss/pickupPad.ts`). `boss<i>WavePickupN=<item>:<count>|…` in `parameters.txt`, on its own key so older files round-trip unchanged; a tier a file describes without a pickup line drops nothing. See *Item drops per boss wave tier* |
| `arena.waves[i].traps` | castle/desert: arrow rig on 25% + death; bonus: magicball rig on death; empty for a hand-built arena | wall traps per health tier, each `{projectile, direction, spread, spawnRateMs, count}` with `projectile` in `PROJECTILE_DEFS` (45 assets; the 22 zero-damage ones and the crashing `sorcerer_ice_orb` are cut), `direction` one of `up`/`down`/`left`/`right`, `spread` a decimal 0..2 and `count` 1..`MAX_TRAP_COUNT` (24). A trap stands on the wall it fires *away* from. Like the buffs and unlike the drops, tiers **replace** one another. `boss<i>WaveTrapN=<projectile>:<dir>:<spread>:<rate>:<count>|…` in `parameters.txt`, on its own key so older files round-trip unchanged. The only optional boss rig that draws from `ctx.bossRand`. See *Wall traps per boss wave tier* |
| `arena.invulnerability` | on, `[30, 30, 30]`, countdown on | seconds of boss immortality per health threshold (`BOSS_INVULN_THRESHOLDS`: 75/50/25%); 0 disables one threshold, `boss<i>Invuln` / `boss<i>InvulnCountdown` in `parameters.txt`. Independent of `waves` — see *Boss finale* |
| `arena.checkpoints` | `{ respawnPlayers: '75-50-25-dead', saveGame: '50' }` | two independent milestone presets keyed to the same `Boss 75/50/25%` / `Boss Died` events. **Respawn player** pulls dead/lagging players into the arena; **Save game** moves the respawn point and writes a save (the `Checkpoint` node). Presets: `never`, `50`, `75-50-25`, `75-50-25-dead` (`BOSS_CHECKPOINT_PRESETS`). A milestone both pick shares one `GlobalEventTrigger`; both `never` emits nothing at all. Independent of `invulnerability` and the wave rig — own triggers, no `connections` touched. Draws no RNG. `boss<i>Checkpoints=<respawnPreset>,<saveGamePreset>`. See *Boss finale* |
| `arena.music` | preset: `boss_final`; else absent | per-arena music swap, same knob as `floorMusic`. `boss<i>Music=<track>`. `defaultBossFight()` ships `boss_final`; `withBoss()` spreads the arena before overriding theme/pool/waves, so all three presets inherit it |
| `arena.monsterMultiplier` | 1.0 | scales each tier's `monsterMax`; `-1`/endless stays endless. `boss<i>MonsterMultiplier` in `parameters.txt`, separate from the dungeon's |
| `arena.foodMultiplier` | 1.2 | scales the arena's health/mana pickup clusters; `boss<i>FoodMultiplier` in `parameters.txt` |

### Campaign presets

**Four groups.** Every `CampaignPreset` carries a `group`. Presets load only
from the header's **Load preset…** button, which opens `PresetGuide`'s dialog
(issue #77 removed the quick dropdown: one misclick there replaced a parameter
set before it was exported). The dialog renders one native `<details>` per
`PRESET_GROUPS` entry, in that array's order, Classic open and the rest collapsed on open, each row
a description and a Load button. That is the dialog's **Campaign presets** tab;
its **Player presets** tab lists `PLAYER_PRESETS` (`tweak/presets.ts` — `{id,
label, description, build(): PlayerTweaks}`), whose Load replaces only
`playerTweaks`, the same as importing a playersettings.txt.
`tests/playerSettings.test.ts` holds each entry to fresh/pruned/real keys/
validates. The first entry, `anniversary`, ports Hammerwatch Anniversary
Edition's player balance (shared move-speed 1.1 — AE splits it 1.0 ranged /
1.2 melee, the original has one key — plus AE's damage and prices, 61 keys);
`reference/hammerwatch-ae-comparison.md` records the full AE comparison, what
was copied, what was skipped as not comparable, and AE's data bugs.
The **Generic** group (`tweak/genericPresets.ts`) leads with **Dungeon
Rebalanced**: buffs-only (owner's call) for the priest (most), warlock (early
only — storm untouched, so the maxed ceiling doesn't rise), thief and sorcerer,
nothing for the consensus-strong paladin/ranger/wizard, plus
`aeMovementAndCombo()` (`tweak/presetParts.ts`, shared with the AE preset so
the two cannot drift). The research — forum, Steam, patch history, numbers —
is `reference/hammerwatch-class-balance.md`.
The tab groups presets in collapsible `PLAYER_PRESET_GROUPS` sections, all
collapsed on open (every
preset carries a `group`). The **Hammerwatch 2** group (`tweak/hw2Presets.ts`)
holds four presets — levels 1, 10, 25 and 50. HW2 is an RPG, so only class
*bodies* carry over: `hw2Body` derives health/mana/mana-regen from HW2's
`classes.inc` and its attribute formulas (points split in proportion to the
base attributes, largest remainder), and `bodyOverrides` shifts the class's own
health/mana ladders by the start's delta and scales its mana-regen ladder by
the start's ratio, read off `TWEAK_BASELINE`, so no tier becomes a downgrade.
Priest and sorcerer have no HW2 class: `HW2_ANCHORED` scales both off HW2's
wizard by their stock ratios to it (sorcerer = the wizard's twin; priest
frailest), and takes their mana-regen LADDER from the wizard's tier by tier ×
that ratio so the priest stays the fastest-regen class even fully upgraded
(owner's call — the stock priest ladder tops out slower than the wizard's).
A dozen HW2 skill values are copied faithfully (even where weaker), removing
original tiers HW2 lacks. Every preset must add **no** validation warning over
the stock Player tab (test-enforced); that is why `removalCascade` no longer
counts a dependent the user removed explicitly too.
`reference/hammerwatch-2-comparison.md` has the research. `preAlpha` ("Pre-Alpha") holds
`pre-alpha`: the Java original's `parameters.txt` with every remake layer off,
and `army1`/`army2`/`lich2` split into today's types. `classic`
("Classic") holds castle / desert / bonus. Castle stays at index 0 of
`CAMPAIGN_PRESETS` because it is the app default. `colosseum` ("Colosseum")
holds `colosseum`, labelled "Survival in Colosseum" after the Steam workshop map
(`config/colosseumPreset.ts`): the dungeon master's own `parameters.txt`,
embedded verbatim and parsed by `build()` — zero floors, eight lobbies, sixteen
survival arenas and four boss arenas. A zero-floor preset keeps one theme and
one monster pool, as the form does. `claude` ("Claude Generated") holds the ten presets in
`config/claudePresets.ts`: Lunch Break, Beat the Clock, Boss Rush, Arena
Marathon, Trap Gauntlet, Frozen Descent, Pandemonium, The Long Haul, Double or
Nothing and Shell Game. They
show off floor bosses, multi-boss lineups, survival arenas, chained arenas and
per-floor traps, timers and buffs. Beat the Clock, Boss Rush, Frozen Descent,
The Long Haul and Trap Gauntlet also hide extra lock buttons (`buttonLocks`) and
are registered WITHOUT `withGatewayLocks`, which would overwrite them. The other
three keep the derived single-button locks. Lunch Break, Boss Rush, Frozen
Descent, The Long Haul and Trap Gauntlet also carry mystery data through
`presetMystery.ts`. Boss Rush uses reward-only enhanced lock buttons. Trap
Gauntlet has trap-room plates plus trapped lock buttons from floor 2 on. Every
preset carrying plates runs the `moves no floor` test.

Two presets are built around the buttons themselves. **Double or Nothing**
leaves its lock buttons visible and safe and fills each floor with 3–5
plates from a high-stakes custom pool. That pool includes tier-II bundles, a
Jackpot and an Extra life (`powerup_1up`), set against Double trouble, Death
trap and Inferno, and a test checks that the harsh share rises every floor.
**Shell Game** disguises every lock button (`disguise: true`) and enhances
some of them. It adds decoy plates and runs a Beat the Clock–style timer
(damage 3) whose seconds per lock button fall every locked floor. Both are
registered WITHOUT `withGatewayLocks`.

The two clock presets (Beat the Clock, Shell Game) share an ending
(`huntFloorBoss`, `clockArena`). Their last timed floor is a **hunt**: one
random mobile boss, no lock buttons, 180 s. The boss-prep lobby follows it.
Beat the Clock then ends in a 120 s survival arena led by minibosses (no boss
arena). Shell Game plays a boss arena with invulnerability OFF (small anchored
adds plus arrow traps on each tier), then the same kind of survival arena.
Neither preset runs boss invulnerability anywhere: playtesters disliked it
under a clock. Instead, three `bloodlust`-on-monsters enrage windows (`enrage()`)
give the late fight its spike: the hunt boss's 25% tier, Shell Game's arena 25%
tier, and the last 30 s of each survival arena. Each lands together with fresh
minions, because a boss actor does NOT catch a monsters-only buff field
(`[VERIFIED]`, DISCOVERY-LOG 2026-10-01). Shell Game's boss arena never revives
players and never saves mid-fight (both checkpoints `'never'`). Both survival arenas count down every
second (`countdown: 'seconds'`), because `milestones` read as no goal at all.
Their filler rows use the toughest regulars (`skeleton3`, `archer3`,
`bat2#2`, `lich#2`), since an upgraded party clears the easy ones instantly. The header text lives only in
`PRESET_GROUPS`. The escape-floor / shared-arena-size tests in
`tests/presets.test.ts` apply to the `classic` group only. Every preset in every
group must validate, generate, stay deterministic and round-trip through
`parameters.txt`.

`config/presets.ts` holds `CAMPAIGN_PRESETS` — `castle` (8 floors,
`a_mixed`–`g_mixed` then `f_mixed`; `defaultParameters()` plus its mystery
plates — the default itself stays plate-free),
`desert` (**7 floors** since the 070 parameter set —
`g_mixed,h,i,i_symbols,i_mixed,g_mixed,i_mixed`; an outdoor bug floor now
opens it and a tick/tower breather sits before the mummy rush) and `bonus`
(6 floors, `bonus1`–`bonus5` then `bonus5`). A preset overrides `levels`,
`themes`, `levelMonsters`, `levelTimers`, `levelTraps`, `floorMusic`,
`levelOrder`, `lobbies` (`defaultLobby(...)` plus a `music` cue per room) and
— via the `withBoss` helper — the **first fight's** arena `theme`, `bossPool`
and `waves` (`withBoss` leaves `arena.music` at `defaultBossFight()`'s
`boss_final`). `shippedOrder(levels)` still names `L1` and `L2`. `monsterMax`
is otherwise left at the global defaults so the caps keep bounding horde
sizes; the exceptions are `tower_empty`, raised to 150 in
`defaultParameters()` for the escape floor, and — in the desert preset —
`tower_flower1` raised to 6 because floor 0 is the first floor of any preset
to pool it.

**Mystery plates in the presets.** Every classic hides two mystery plates per
floor and one on the escape floor, themed to its acts (desert and bonus add
custom buttons: `Scarab hoard`, `Tomb offering`, `Temple guards`, `Sun
priests`, `Bonus ambush`). A preset's pool is `mysteryStarterPool()`
unchanged, followed by its custom buttons; floors pick by NAME through
`presetMystery.ts`'s `mysteryKit().pick`, which throws on an unknown name.
The weights follow the owner's rule: risk and reward ramp together with depth.
No lich council, kamikazes, death orbs or boss fire in the first half of a
classic (a test enforces it). Plates are purely additive (invariant 8). The
test `moves no floor` compares each floor's tilemap with and without them.

**The 070 preset content (`944e81d`).** All three presets now arm their
**escape floor** with a four-wall spewer rig (`shooter_fireball` ×8/wall on
castle and bonus, `shooter_fireball_2`/`shooter_fireball` on desert's last
two floors) and carry per-floor / per-lobby / per-arena `floorMusic`.
Castle's and desert's arenas run `SHOOTER_ARROW_TRAPS` (`parameters.ts`) on
the **25% and boss-death** tiers; bonus runs its own `MAGICBALL_TRAPS`
(`presets.ts`) on the death tier only. So a stock arena is **not** trapless
any more. A few castle/bonus wave counts and the castle floor-1 pool were
retuned in the same change. All of it is content, not an RNG-order change,
but it does move what the *default* and the presets produce for a seed.

**The escape floor** is that last floor, and all three presets ship it: one
extra dungeon floor played **after** the boss arena (`shippedOrder`, which also
opens the campaign on `L1` and puts `L2` between the last ordinary floor and
the fight), on a
90-second hazard timer (`escapeFloorTimer` — 1 damage every 100ms, countdown
on), with `tower_empty` four times over in a nine-entry pool so a couple of
hundred breakable 450-HP battlements wall its routes off, plus (since the 070
set) a four-wall projectile-spewer rig and its own music track. It is built
entirely from shipped features — the campaign order, timer mode, pool
weighting, `levelTraps` and `floorMusic` — so nothing in the generator knows
it exists. Two consequences worth remembering:
the arena's alcove holds a portal to it instead of the victory orb (verified in
game) — the **red** one, because an arena has no stairs prefab of its own, so
`gatewayAfter`'s `exit` still renders `BossPortal` there — and because the
stored order is not the default one, mutating `levels`, the fight count or the
lobby list on a preset's parameters **without repairing the order** produces a
validation error — which is why `ParameterForm.setLevels`, `BossForm.set` and
`LobbyForm.setLobbies` all run `normalizeOrder`, and why the test suites build
on `tests/params.ts`'s `plainParameters()` rather than `defaultParameters()`. Every preset ships a single fight: the count shapes the campaign rather
than flavouring it, so it is left to the dungeon master. `withBoss` spreads
three levels deep on purpose (`boss` -> the `fights` array -> `fights[0]` ->
`arena`): a shallow `{...base, boss}` would share one `arena` object between
callers. All three presets ship the boss-death tier
**populated**. `build()` must return a
fresh object every call and draw no random values — the preset dialog's Load
button (`App.tsx`'s `applyPreset`) calls it to replace the whole parameter set. Changing a preset's pools
is a content change, not an RNG change: it does not move any seed generated with
explicitly-supplied parameters, but it does change what the *default* produces.

Plus two app settings that are *not* generator parameters:
`hammerwatchPath` and `cleanupFiles` (persisted in Electron userData via
`src/main/settings.ts`).

## Generation pipeline (per floor)

1. **Rooms** — `iRand(minRoomCount, maxRoomCount)` rooms; each tries up to
   1000 random placements, rejecting overlap (`roomPadding` apart,
   `edgePadding` from the border).
2. **Passages** — spanning-tree: pick a random unconnected room, connect to a
   random connected one with a straight or L-shaped corridor of random width;
   reject if it cuts another room or passage. If rooms remain unconnected
   after 1000 tries, `levelValid = false` and the whole floor is re-rolled.
3. **Special rooms** — `Entrance` (ExitUp prefab), then `Exit` (ExitDn) when
   the next slot is another floor, or the `Orb`/`BossPortal`/`LobbyPortal`
   prefab when it is anything else (one room branch, one three-id contract —
   see *Campaign order*); then `Shop`, `Vault`, an extra locked room and its
   `Key` by chance. Everything left becomes a `Lair`. On a locked floor, the
   orb room is gated last — always by `buttonSeal.ts`'s wall-and-button rig,
   never by a door (`Room.lockRoom()` refuses an `Orb` room outright).
   The wall spans the corridor's whole cross-section plus one tile of wall band
   at each end — do not shorten it back to the walkable rows, the flat-anchored
   themes (`h`, every `bonus<n>`) overhang nothing and the player walks around a
   short seal. The button is hidden **like a key**: a random unlocked room, same
   draws as `Room.spawnKey()`, so it can be anywhere on the floor and
   `ctx.reachTargets` is what proves the player can get to it. The room grants
   a consolation powerup (`Room.grantLockLoot`). PR #54 removed the old
   `finalLockMode` "Opened by" choice — a chance-rolled gold door as the
   alternative — because a party could hoard or misspend gold keys and lock
   itself out of that gate, the wall-and-button it cannot. A file still
   carrying `finalLockMode` imports fine, key reported as unknown; `button`
   was already the default, so no seed moved. Chance-rolled gold doors
   elsewhere on a floor are untouched and still get their keys.
4. **Population** — per lair: a monster type from that floor's pool, a horde
   of `trunc(fRand(max/5, max) * monsterMultiplier)`, `iRand(0, max/20)`
   spawners, treasure/breakables scaled by `goldMultiplier`, food by
   `foodMultiplier`. Monsters drift in clusters rather than being uniform.
5. **Walls** — rasterize rooms+passages into `Tile[]`, then run the 3×5
   pattern matcher (`wallPattern.ts`) over every cell to pick the wall doodad
   (corner / T / cap / cross / straight). Tiles claimed by a stair prefab are
   marked `wallSet` and skipped.
6. **Reachability** — `reachability.ts` flood-fills the finished grid and
   rejects the floor if the player cannot walk from the entrance stairs to the
   exit (or orb/portal) and to every key. Tile connectivity is not enough: the
   lettered wall pieces are three tiles tall, so the two rows under any wall
   mass are dead space (`OVERHANG_ROWS`), and a corridor whose only shared row
   with the room it reaches sits in that band is sealed in game while looking
   open in the tilemap and the preview. ~6% of first rolls are discarded here.
7. **XML** — `Level.getXML()` emits, in order: `tilemap` (20×20 blocks),
   `doodads`, `actors`, `scripting`, `items`, `lighting`.

Failure of any floor after 60 attempts returns a friendly `DungeonError`
suggesting fewer/smaller rooms, narrower passages, or a larger map.

## Themes (`config/themes.ts`)

Three kinds of theme id, all built from the same `BASE_THEME_DEFS`:

- **base** — `a`–`i`, `bonus1`–`bonus5`. One tileset, `tiles` floor variants.
- **overlay pairing** — `overlayOf(base, file)` spreads the base and sets
  `overlay: {tilemap, tiles}`, a second tileset drawn over the floor at full
  coverage (`c_tiles`, `d_carpet`, `f_frozen`, …). Draw order is the `level`
  attribute in the tileset's own XML, not the dataset order.
- **mixed** — `mixedOf(base)` sets `mixed: [null, ...that base's overlays]`,
  slot 0 being the plain base. Mutually exclusive with `overlay`. On a dungeon
  floor each room and each corridor rolls one slot, so a level reads as several
  related surfaces; the arena, having no regions, lays the palette out in a
  geometric pattern (`BOSS_FLOOR_PATTERNS`, `boss/arenaPattern.ts`).

`THEME_DEFS` is derived by flat-mapping each base to `[base, ...overlays,
mixed]`, which is also the dropdown order the renderer's `<optgroup>`s follow.
Emission lives in `map/tilemapOverlay.ts` (`overlayDataset`, `mixedDatasets`),
shared by dungeon floors and the arena so the two cannot drift. Two rules:
the extra layers' `data-a` is the 0/255 floor mask (never a flat 255, or the
art paints over the void), and a theme with no overlay/palette must return
**before drawing anything** — hoisting a draw above that check moves every
existing seed's floor. The stock campaign is `a_mixed`…`g_mixed`, so mixed is
the common path.

## Monster variants (`objects/monsterTypes.ts`)

A pool entry is a **variant key**, not a bare monster id: `variantKey(type,
tier)` produces `bat1#0` (the bats spawner), `archer1#2` (the elite archer).
The bare id stays canonical for the type's pinned tier, which is what keeps
every pre-variant `parameters.txt`, preset and saved config parsing unchanged —
`slime` and `slime#<pinned>` are the same monster, and validation rejects
writing both. `monsterVariants()` / `monsterVariantsInGroup()` drive the pool
pickers; `MONSTER_VARIANT_GROUPS` adds a `Spawners` group on top of
`MONSTER_GROUPS`, membership by `MonsterVariant.role` rather than actor folder.

**Families (`MONSTER_FAMILIES`).** A floor pool key may also name a *family* —
one entry spanning several whole TYPES, e.g. `tower_banner` rolling evenly
between `tower_banner1/2/3`. Five ship, all towers; `tower_empty` and
`tower_static_frost` are standalone barriers and deliberately in none.

They live in their **own registry, outside `MONSTER_TYPES`**, and that placement
is load-bearing: `monsterVariantsInGroup` builds the arena picker off
`MONSTER_TYPES`, so a family in that list would offer a second checkbox for
actors its members already own. There is no "hide from the arena" flag, so
staying out of the list *is* the mechanism. They are dungeon-floor only.

A family is NOT a `tiers` array. `createRolled` starts at tier 1 and only climbs,
so index 0 is unreachable by rolling — a two-member family expressed as tiers
would emit its second member every time and its first never (issue #58's bug
from the other direction). Instead `Monster.resolveFloorPoolEntry` returns a
`HordeSource` (`rolled` | `pinned` | `family`) and `createHorde` draws a member
uniformly per monster, then rolls that member's own ladder.

A family carries its **own cap** (`Monster.capId`), so a member's cap is not
consulted on that path — pooling `tower_flower` spawns `tower_flower1` even
though it ships at 0. Families are in no default or preset pool, so they add no
draw to an existing seed; `monsters.test.ts`'s digests are the proof and must
keep passing unchanged.

**Two key grammars, deliberately different.** An arena wave speaks the canonical
variant key above, where a bare id IS a pin at `defaultTier` — so
`isKnownMonsterKey` rejects `skeleton1#1`, because two spellings of one actor
would give it two max counts. A **dungeon floor** speaks a floor pool key
(`isKnownFloorPoolKey`, `floorPoolTier`, `floorPoolEntries`), where a bare id
means **roll the type's ladder** and `id#tier` pins one actor — so `skeleton1`
and `skeleton1#1` are genuinely different things and both are legal. Never
"unify" these by relaxing the arena's rule; add to the floor's sibling helpers
instead. `floorPoolEntries` is what the dungeon picker lists (rolled entry first,
then one per tier); `monsterVariants` is what the arena picker lists.

Where the key resolves differs by level kind, and this is load-bearing: a
dungeon floor's **rolled** entry climbs tiers with `upgradeChance`
(`Monster.createRolled`, consuming `ctx.rand`), while a **pinned** entry and
everything in the arena resolve to one actor path with **no draw** — a pin is a
statement about what spawns, and the wave rig is structure, not a roll.

`upgradeChance` carries the ORIGINAL tool's per-type values (0.2-0.5). They were
`1.0` across the board until issue #58, which — since `fRand(0, 1)` returns
[0, 1) — made the roll a tautology that always landed on the TOP tier, so the
middle tiers had never been emitted at all. It is a **variety** control, not a
difficulty one: a `tiers` array is authoring order, and `lich`'s top tier is the
necromancer, which plays softer than the tiers below it. Pin a key when a floor
needs a specific monster, and never reorder a `tiers` array — the order is the
wire format for `#N` and `defaultTier`.

## Buff auras (`src/generator/buffs/`)

Optional, per floor, empty by default. A floor can wear any number of the game's
41 buffs (`objects/buffTypes.ts`), each aimed at **players**, **monsters** or
**both**. Unlike timer mode there is no countdown: the field is live from the
moment the floor loads and never switches off, so a buff is a property of the
floor rather than an event on it.

The rig, built by `buildFloorBuffRig` and ported from the hand-authored
`test_buff.xml`:

- one `RectangleShape` covering the whole map **per distinct target** used on
  that floor — three player-facing buffs cost four nodes, not six. Shapes are
  created lazily in first-use order, so a floor's ids depend only on its own
  list. `types` comes from `BUFF_TARGET_TYPES`: 1 players, 2 monsters, 3 both;
  bit 2 is still `[UNVERIFIED]`, see the DISCOVERY-LOG;
- one `DangerArea` per buff, shipped **`enabled: True`** with `damage: 0`,
  `freq: BUFF_REFRESH_MS` (100) and the buff's path. `NodeDangerArea`'s
  constructor ships it *disabled* for timer mode's benefit — an aura has no
  trigger, so the rig has to set it back.

`BUFF_DEFS` is the registry: id, path, label, group and a **description**
written from the asset's own numbers, which is what the form's dropdown and
`InfoTip` show. A test asserts `path === 'buffs/{id}.xml'` for every entry, so
the registry cannot drift from the asset folder. An entry naming an unknown buff
is *skipped* by the rig rather than thrown on — `validation.ts` is the gate.

Called from the floor loop in `index.ts` **before** `buildFloorHazardRig`, in
the order the form lists the two sections. Both return before allocating an id
when their floor is unconfigured, which is what stops one moving the other's.

`parameters.txt` carries `buffN=<id>:<target>|<id>:<target>`, and **only for
floors carrying at least one** — a stock export has no `buff` line at all. An
omitted `:target` parses as `players`; an unknown id or target lands in
`unknownKeys` and the rest of the line still parses.

### Buffs per boss wave tier (`boss/waveBuffs.ts`)

The same aura, per arena health tier. Each of the five `BossWave`s may carry a
`buffs: FloorBuff[]` — any number, like a floor. The pre-list single pair
`buff`/`buffTarget` is still read, so every wave literal and every
`parameters.txt` written before the list existed still loads; go through
`waveBuffs(wave)` (`config/parameters.ts`) rather than either field, or the
legacy shape silently stops applying.

Where this differs from everything else in the arena: the tiers **replace** one
another rather than accumulating. Tier 0's field ships `enabled: True` — it *is*
the opening state and has no trigger at all. Every later tier with a buff gets a
`GlobalEventTrigger(TIER_EVENT_NAMES[tier - 1])` fanning out to a
`ToggleElement{state: 1}` on the previous field and a `{state: 0}` on its own.
"The previous field" is the nearest **earlier tier that actually carries a
buff**, not `tier - 1`: a campaign buffing only 100% and 25% needs the 25%
trigger to clear the 100% field, and there is no tier-2 field to name.

`TIER_EVENT_NAMES` is exported from `waves.ts` and shared, so the two rigs
cannot drift on the event strings. Built in `arena.ts` after `buildWaveRig` and
`buildInvulnerabilityRig`, draws from **no** stream — `ctx.bossRand` included —
so the arena's fixed draw order is untouched and no arena seed moves.

`parameters.txt` carries `boss<i>WaveBuffN=<id>:<target>|<id>:<target>` on its **own key**, not
as a sixth `boss<i>WaveN` field: appending one would put a trailing `|` on every
stock export and break byte-compatibility with files written before the
feature. Its parse branch must be tested **before** `boss<i>WaveN`'s, or
`boss0wavebuff1` falls through to `unknownKeys`.

### Item drops per boss wave tier (`boss/wavePickups.ts`)

The loot half of the same five tiers. Each `BossWave` may carry
`pickups: WavePickup[]`, a list of `{ item, count }` rows naming an item from
`PICKUP_DEFS` (`objects/pickupTypes.ts`). Read it through `wavePickups(wave)`.
The stock table (all three presets) resupplies at 50%, drops one rejuvenation
potion at 25%, and doubles the resupply on the boss-death tier.

Three things separate it from `waveBuffs.ts`, which it is otherwise a twin of:

- **The tiers do not replace one another.** An item is an object on the floor,
  not a live effect — there is nothing to switch off, and the health nobody
  collected at 50% is still lying there at 25%. So no `ToggleElement` chain.
- **A count is copies.** A `SpawnObject` spawns one actor per incoming trigger
  and a tier trigger fires once, so `trigger-times: N` would drop one item and
  bank N-1. N copies means N nodes, each `trigger-times: 1` — and that bound
  still matters on tier 0, whose `AreaTrigger` re-fires whenever a player walks
  back over the entrance.
- **It builds its own tier trigger** rather than sharing `waves.ts`'s: a tier
  with drops but no monsters is legal, and `waves.ts` skips a monsterless tier.

Placement is `pickupPad.ts`, **not** the 9 spawn anchors. The anchors were the
first attempt and were wrong: they are chosen to be far apart so a horde
surrounds the party, which put the 50% heal on a wall midpoint ~25 tiles away
behind the wave that had just spawned there (playtest 2026-08-28 — that heal and
the 25% potion were never found). Drops now land on a fixed pad just inside the
entrance: health up the left column, mana up the right, the eight upgrades in
the 2-wide middle block, and the consumables — potions plus the two extra-life
pickups — in the row nearest the door. Same layout every
seed, so it can be learnt once.

One cursor per lane, carried across **all** tiers rather than reset per tier, so
the 50% drops and the boss-death drops fill a column side by side instead of
landing on one tile. Cover pillars do land on the pad, so each lane is two
columns wide and a buried slot is skipped for the lane's next one; the
reachability mask is **read**, never written, so no pillar moves and no
`ctx.bossRand` draw shifts. Built last in `arena.ts`, draws from **no** stream.

`parameters.txt` carries `boss<i>WavePickupN=<item>:<count>|…` on its own key, for
the same byte-compatibility reason as `boss<i>WaveBuffN`, and its parse branch must
likewise be tested **before** `boss<i>WaveN`'s. One difference worth knowing: a
tier the file describes with a `boss<i>WaveN` line but **no** `boss<i>WavePickupN`
line ends up with no drops — a post-pass clears the stock table, so importing a
file written before the feature does not silently hand it three tiers of loot.
(Order-independent by design: the two keys may appear either way round.)

### Wall traps per boss wave tier (`boss/traps.ts`)

The hazard half of the same five tiers. Each `BossWave` may carry
`traps: BossTrap[]`, rows of
`{ projectile, direction, spread, spawnRateMs, count }` naming a projectile from
`PROJECTILE_DEFS` (`objects/projectileTypes.ts`, 45 of the 68 the game ships —
the 22 with `damage: 0` are decoration from a spewer, and `sorcerer_ice_orb`
crashes the game from a spewer; all 23 are cut). Read a
tier through `waveTraps(wave)`. Since the 070 parameter set castle and desert
ship `SHOOTER_ARROW_TRAPS` on the 25% and boss-death tiers and bonus ships
`MAGICBALL_TRAPS` on the death tier (both constants live next to the wave
builders); a hand-built arena still starts trapless.

Each row places `count` `ProjectileSpewer` nodes; several rows may share a
direction, which is how one wall mixes ammunition ("3 axes and 2 fireballs
firing north" is two `up` rows).

- **Direction picks the wall.** A trap stands on the wall it fires *away* from:
  `up` on the south wall shooting north, `down` on the north wall, `left` on the
  east, `right` on the west. The engine integers are `0/1/2/3` in that order —
  `[VERIFIED]`, see DISCOVERY-LOG 2026-09-01.
- **Tiers replace one another**, like `waveBuffs.ts` and unlike
  `wavePickups.ts`: a tier's trigger switches the previous *carrying* tier's
  whole set off (`state: 1`) as it switches its own on (`state: 0`), so the
  hazard changes with the phase instead of accumulating into an uncrossable
  crossfire. Tier 0 arrives `enabled: true` with no trigger at all.
- **Placement is seeded, on the innermost floor tile** of its wall — never on
  the wall band, where projectiles would spawn inside collision. Legal slots are
  enumerated first and then drawn from (no unbounded loop), keeping
  `TRAP_WALL_MARGIN` from each corner, clear of the entrance strip and the
  alcove mouth, off any tile a cover pillar stands on, and `TRAP_MIN_SPACING`
  apart. The slot pool is per wall and carried across all five tiers. A wall
  that runs out simply stops placing; validation warns first.
- **It is the one optional boss rig that DRAWS.** `waves.ts`, `waveBuffs.ts`,
  `wavePickups.ts` and `invulnerability.ts` take no random values; this one
  takes one `ctx.bossRand.iRand` per placed spewer. Two consequences, both
  load-bearing:
  1. It **must** return before touching the stream when no tier carries a trap
     (invariant 2). That is what keeps every existing seed byte-identical.
  2. `arena.ts` calls it after every *layout* draw — size, boss, alcove wall,
     cover, food, spawn points, floor pattern — so turning traps on cannot move
     the arena's layout. It is **not** last overall: `getArenaXML` rolls floor
     tile variants and the overlay/mixed palettes afterwards, so traps do shift
     those cosmetics and (like any arena knob) a later fight's stream. Do not
     move the call earlier to "fix" that — ahead of `placeCoverPillars` or
     `placeSpawnPoints` it would move the layout, which is what actually
     matters.

`spread` is a float `0..TRAP_SPREAD_MAX` (2) — 0 is a single straight stream.
`spawnRateMs` has no engine floor; validation warns below
`TRAP_FAST_SPAWN_RATE_MS` (50) rather than rejecting, because a deliberate
barrage is legitimate. `boss<i>WaveTrapN` in `parameters.txt`, one line per
trapped tier, absent for the rest.

## Traps per dungeon floor (`src/generator/traps/`)

Optional, per floor, empty by default. `ProjectileSpewer` nodes standing on room
walls, firing across the room from the moment the floor loads. The arena's rig
(`boss/traps.ts`) one level up, sharing every playtested constant through
`traps/slots.ts`, and differing in exactly four ways:

- **No tiers, no triggers.** An arena has health thresholds to switch hazard
  sets between; a floor has nothing to switch on, so every spewer ships
  `enabled: True`, exactly as `buffs/field.ts`'s aura does. A floor's rig is N
  spewer nodes and *nothing else* — no `GlobalEventTrigger`, no
  `ToggleElement`. A copy-paste of the arena's tier wiring here would be a bug,
  and the suite asserts its absence.
- **`count` is counted over the FLOOR.** A tier's row places `count` spewers
  along one arena wall; a floor's row places `count` over every eligible room's
  wall of that direction. A dungeon master asking for six arrow traps wants
  six, not six per room on a floor whose room count is itself a roll.
- **One flat pool per direction**, built by walking `level.rooms` in index
  order and carried across every row. Bigger rooms contribute more slots and so
  attract proportionally more traps.
- **`count` has no upper bound.** `BossTrap.count` is capped at
  `MAX_TRAP_COUNT` because it is spent on one fixed-size arena wall; a floor's
  `count` is spread across every eligible room on the floor, which has no
  comparable ceiling, so the cap would be arbitrary. Validation still rejects
  non-integers and anything below 1; a count the floor's pools cannot satisfy
  just runs dry gracefully (see `floorTrapCapacity`, a warning, not an error).

**Geometry.** `Room.contains` is inclusive, so a room's interior is
`[r.x, r.x + r.width] x [r.y, r.y + r.height]` and its wall band is the ring
outside that. A spewer sits on the innermost interior floor tile of the wall it
fires away from: `up` at `r.y + r.height`, `down` at `r.y + overhangRows(theme)`,
`left` at `r.x + r.width`, `right` at `r.x` — always emitted on the tile CENTRE.
Both corrections are the arena's, re-anchored on the room.

**The band is the room's edge ring, not one step out from the slot.** This is
the trap the first implementation fell into: a `down` spewer stands
`overhangRows` tiles clear of its band, with ordinary room floor in between, so
stepping one tile north from it lands on floor and never on wall. Reading that
as "a doorway is here" silently rejected every `down` slot on every lettered
theme. `bandLine()` returns `r.y - 1` for `down`, and `slotClear` walks from the
band inward to the slot: the band must be wall (that is the passage-mouth test,
one grid read instead of a walk over `room.passages`), and every tile from the
room's edge in to the slot must be this room's floor, unclaimed by a prefab.
Everything is checked over a window widened by `TRAP_WALL_MARGIN`, because a
spewer two tiles from a doorway still fires down it.

**Rooms skipped whole:** `Entrance` (the party materialises there, blind),
`Shop` (a fixed stand-still target) and `sealed` (the button-gated victory
room). A `locked` vault is deliberately **kept** — a trapped reward room is the
point, and a spewer never blocks a door.

**Why it is a post-pass in `index.ts` and not in the `Level` constructor.** The
retry loop builds up to `MAX_LEVEL_ATTEMPTS` candidates and `ctx.clearLevel()`s
the rejects, but nothing can rewind a `Rand`. A rig drawing in the constructor
would burn draws on discarded candidates, tying a floor's trap positions to how
many times reachability happened to reject it — and any layout parameter that
changed the *attempt count* would silently move every later floor's traps.
Drawing only after acceptance makes the draw count a function of the trap config
alone. It is called last of the four per-floor rigs, so arming traps cannot move
a buff, timer or music node's id.

**RNG.** One `ctx.trapRand.iRand` per *placed* spewer — a copy the pool cannot
place draws nothing. It returns before touching the stream when the floor
carries no usable row. Because the stream is its own, arming any floor moves no
floor's dungeon; the one thing it carries between floors is its own draws, so
arming floor 0 moves floor 1's **trap positions** and nothing else about floor 1.

`floorTrapCapacity(params, direction)` is what validation warns against: the
smallest rollable floor, `minRoomCount` rooms whose walls span `minRoomSize + 1`
by `minRoomSize + 3`. Deliberately optimistic — the exclusions can only reduce
it — so overshooting is a warning, not an error; the rig stops placing
gracefully either way.

## Mystery buttons (`src/generator/mystery/`, issue #67)

Optional, per floor, absent by default. A campaign-wide POOL of button kinds
(`mysteryButtons`) and, per floor, how many plates to hide and which pool
buttons they may be (`levelMystery`, weighted, with replacement). Stepping on a
plate presses it for good and fires everything its button carries at once.
UI: the Dungeon tab's second sub-tab (between Standard and Boss), `MysteryButtonsEditor.tsx`.

- **The rig** (transcribed from the owner's `test_mystery_button_simple.xml`):
  a need-sync `TriggerButton` (`trigger_button_floor.xml`) → w1 h1
  `RectangleShape` → one-shot `AreaTrigger` → `PlaySound button_hatch`,
  `ChangeDoodadState` **`pressed`** (not the lock's `activate`: the plate
  must STAY down, `activate` bobs back up — owner, 2026-09-26), `AnnounceText`
  only when `text` is non-empty (type 3, Pickup — local to the plate), one `SpawnObject{trigger-times 1}` per
  loot/monster copy, and per spewer a disabled `ProjectileSpewer` +
  `ToggleElement{state 0}`; with `trapSeconds` a `ToggleElement{state 1}` per
  spewer connected LAST with a real delay (the trigger enters real-delay mode).
- **Placement.** Plates: `roomInteriorSlots` of every room but Entrance, Shop,
  `sealed` and `locked`, reachable per `entranceReach` (extracted from
  `exitReachable`), ≥ 2 tiles from any floor item, ≥ 4 from a lock plate or boss
  tile, and `MYSTERY_BUTTON_SPACING` (4, Chebyshev, `takeSpacedSlot`) apart.
  Loot/monsters: zero-draw — the plate room's interior sorted by distance then
  y then x, loot ≥ 2 and monsters ≥ 3 tiles out. Traps: `roomWallSlots` of the
  plate's room, one pool per room+direction shared by every plate, clear of
  spewers already on the floor.
- **RNG.** `ctx.mysteryRand` only, after every other per-floor rig (index.ts).
  Per plate: `iRand` for the tile, then `iRand` for the pool button; then per
  plate in order, one `iRand` per placed spewer. Returns before any draw or id
  when unconfigured or when no tile qualifies. A plate the pool cannot place
  draws nothing.
- **Loot registry** `objects/mysteryLoot.ts`: `MYSTERY_LOOT_DEFS` = four chests,
  the 500-gold red diamond, `valuable_1..9`, then every `PICKUP_DEFS` entry
  (lane dropped). Kept apart from `PICKUP_DEFS` so the arena's pad is untouched.
- **parameters.txt** writes nothing for a campaign without them. A file that
  mentions the pool states the whole pool; any `mysteryFloorN` line rebuilds
  `levelMystery` from scratch; a dangling floor index is dropped and reported.

### Enhanced lock buttons

Built on the pool above AND on a locked floor's own buttons
(`map/buttonSeal.ts`, issue #69): up to `count` (`levelLockMystery[i]`,
clamped to `floorLockButtons` — read through `floorLockMystery`) of a locked
floor's `BossDoorButton` plates ALSO fire a mystery payload, on top of
counting toward the lock as they always have. A separate per-floor pick list
from `levelMystery` — the dungeon master picks the plate squads and the lock
squads independently, since pressing a lock button cannot be avoided the way
a mystery plate can.

- **`Level.lockButtons`** — `buttonSeal.ts`'s `buildButtonRig` pushes
  `{x, y, roomIndex, trigger}` onto it, in draw order, for every lock button a
  floor places (zero extra draws — `roomIndex` is the same `iRand` the tile
  itself already used). `mystery/placement.ts` reads it (instead of scanning
  for `BossDoorButton` doodads) so a disguised lock plate is still avoided by
  ordinary mystery plates, and `mystery/rig.ts` reads it to find the enhanced
  buttons: the first `count` entries, in placement order.
- **The payload** is exactly what a mystery plate fires
  (`mystery/rig.ts`'s `emitPayload`, extracted from the per-plate body): the
  announcement, loot/monster `SpawnObject`s, and disabled `ProjectileSpewer`s
  with their toggles — wired onto the lock button's OWN `AreaTrigger`. One
  thing to know: its text is a Pickup line (`type` 3, local to the plate —
  `LOCK_PAYLOAD_ANNOUNCE_TYPE`), the same as a plate's, so players pressing
  different buttons each see their own result. The
  button's `PlaySound` and press are already there; only the payload nodes are
  new, and they sit beside the lock countdown's `ChangeVariable`/
  `CheckVariable` without touching them.
- **RNG.** Phase C: one `ctx.mysteryRand.iRand` per enhanced button for its
  pool entry, all of them before any is emitted. Phase D: `emitPayload` on
  each in the same order (one `iRand` per placed spewer) — same shape as the
  ordinary plates' phase A/B, run strictly AFTER them, so arming the
  enhancement never moves this floor's own plates, only a later floor's
  mysteryRand draws. A floor with neither ordinary plates nor lock
  enhancements configured returns before touching the stream or allocating an
  id.
- **Disguise** (`levelLockMystery[i].disguise`, read through
  `floorLockDisguised`) draws that floor's lock buttons with the mystery
  plate's own `TriggerButton` art and `pressed` state instead of
  `BossDoorButton`/`activate`, so every plate on the floor looks the same.
  Construction time, zero draws, same id count either way — a lossless art
  swap, the same shape as the arena's bodyguard-twin substitution.
  `DISGUISE_BUTTON_STATE` in `buttonSeal.ts` duplicates the `'pressed'`
  literal rather than importing `mystery/rig.ts`'s `MYSTERY_BUTTON_STATE`,
  because `mystery/rig.ts` already imports `SEAL_SOUND` from `buttonSeal.ts`
  and the reverse import would cycle.
- **A lock button may sit in an Entrance or Shop room** — `pickButtonTile`
  only refuses locked rooms — and the payload spawns there anyway. That is
  documented, and it is part of the gamble.
- **parameters.txt**: `mysteryLockN=<count>:<i,j,k>` (`parsePoolLine`, shared
  with `mysteryFloorN`), `mysteryLockDisguiseN=1`. Either line on a floor
  rebuilds `levelLockMystery` from scratch, the same rule `mysteryFloorN`
  follows; a dangling pool index is dropped and reported. All-empty (no
  enhancement anywhere, no disguise) is stored absent.

## Timer mode (`src/generator/timer/`)

Optional, per floor, off by default. After `seconds` of play the whole floor
becomes a damage field: `damage` health every `freqMs` milliseconds until the
party leaves. A **negative** damage heals, which is a supported use, not an
accident — the same feature covers "the floor turns hostile" and "the floor
starts healing you".

The rig, built by `buildFloorHazardRig` and ported from the hand-authored
`test_damage_player_timer.xml`:

- a `RectangleShape` covering the whole map with `types: 1`, **players only** —
  monsters are never damaged;
- a `DangerArea`, shipped `enabled: False`, carrying `damage`, `freq` and an
  empty `buff` — timer mode is a *damage* field, and the buff feature above is
  a separate rig rather than a knob on this one;
- a `GlobalEventTrigger("LevelLoaded")` whose per-connection delays drive one
  `AnnounceText` per second of countdown and, at `seconds * 1000`, the
  `ToggleElement{state: 0}` that switches the field on. `state: 0` enables —
  the same inverted polarity the boss rig uses.

It is called from the floor loop in `index.ts` **after** the floor is built and
validated, so `ctx.idCounter` has already handed out every dungeon id and the
rig can only append. `countdown: false` drops the announce nodes; a 3-minute
countdown is 181 of them on that one floor, which is what the validation
warning at `TIMER_COUNTDOWN_NODE_WARN` is about.

`parameters.txt` carries `timerN=enabled|seconds|damage|freqMs|countdown`, and
**only for floors whose timer is on** — a stock export has no `timer` line at
all.

## Music (`src/generator/music/`)

Optional per-floor / per-lobby / per-arena music swap (PR #53). One
`PlayMusic` script node appended after a level is built — no RNG, no files of
its own, on the same RNG-free side of the line as tweaks, buffs and timer
mode (invariant 8). `tracks.ts` is the registry: `MUSIC_TRACKS` (the base
`sound/music.xml` cues — `none/main/act1`–`act4/bonus_1/bonus_2/boss_1/boss_final/`
`boss_killed/custom_1/custom_2` — plus the `sound/music_desert.xml` bank:
`desert_cavern/desert_temple/desert_village`), and `MUSIC_DEFAULT = 'default'`,
the sentinel that emits **nothing** and leaves the hand-authored template's
own music untouched — so every level built before the feature round-trips
byte-for-byte. `musicSound(id)` maps an id to `sound/<bank>.xml:<cue>`,
`isKnownMusicId` gates the parser.

- `rig.ts` `buildMusicRig(ctx, trackId, x, y)` returns before allocating an id
  when the track is `default`/unknown, same as every other optional rig.
- Wired from the floor loop in `index.ts` (after traps, so arming music
  cannot move a trap node's id), from `lobby/build.ts` for a lobby's
  `music`, and from `boss/arena.ts` for the arena's.
- `parameters.txt`: `musicN=<track>` (floors), `lobby<i>Music`, `boss<i>Music`,
  each written only when the level swapped. **The one gotcha:** a file with
  *any* `musicN=` line rebuilds `params.floorMusic` from scratch
  (`explicitMusic` map + the `highestMusicIndex` post-pass in `configFile.ts`),
  because the stock default now ships real per-floor tracks that would
  otherwise bleed into an index a shorter import leaves unmentioned. A file
  with no `musicN=` at all leaves the base's `floorMusic` untouched.

## Campaign order (`campaign.ts`)

The campaign is an ordered list of **slots**, and there are three kinds: a
dungeon floor, a boss fight (one slot, one level — the arena; since issue #48
the shop in front of a fight is a separate lobby slot, not part of it) and a
lobby. `levelOrder` stores the arrangement; absent means every lobby, then
every floor, then every fight, and *with no lobbies* that is the historical
order the byte-identity contract is written against — so the form and the
importer store a default order as **absent** rather than as an explicit list.
The counts a stored order is repaired and validated against travel as a
`CampaignCounts` object (`{levels, fights, lobbies}`), deliberately not
positional arguments: every call site has to name `lobbies` instead of
silently defaulting it to zero.

Two things follow from position in that list, and nothing else does:

- **Where each level leads.** `gatewayAfter(order, position)` returns the one
  `Gateway` a slot gets, decided purely by what comes next — `exit` (the stairs
  prefab, into the next dungeon floor), `portal` (the red boss portal, into a
  fight's arena), `lobbyPortal` (the blue teleport
  `doodads/generic/exit_teleport.xml`, into a lobby — visually distinct from
  the red one so a party can tell "shop" from "boss fight" before stepping
  through) or `orb` (the campaign ends here). Each gated kind carries the level
  id it leads to. The generator writes it
  to `ctx.gateway` before each `new Level()`, and `map/level.ts`,
  `map/room.ts`, `objects/objectSet.ts` and `boss/arena.ts` read it there. That
  is why the
  finality tests `level < params.levels - 1` and `level === params.levels - 1`
  are gone: a rearranged campaign can end on a dungeon floor, and several floors
  can lead into fights. Locks are per floor (`levelLock`), not floor
  `levels - 1`; a locked stairs floor swaps its stairs for the blue teleport.

  **`Orb`, `BossPortal` and `LobbyPortal` are one branch and one contract.**
  `level.ts` picks the room for all three the same way, and each prefab
  registers exactly three `ctx` ids off zero RNG draws, so swapping among the
  three is layout-neutral: the fight-adjacent floor of an existing seed differs
  from its pre-#48 self in exactly two lines, the portal art and its target.
  Swapping to or from `exit` is a different matter — that is the other room
  branch — and moves that floor and every floor generated after it. An arena
  has no stairs prefab of its own, so `arena.ts` renders `exit` as the **red**
  portal too; only `orb` and `lobbyPortal` differ there.
- **What `levels.xml` lists, and in what order** — plus the `lvl.floor?floor=`
  label, which counts positions rather than floor indices. Every kind of slot
  is exactly one level and consumes exactly one label (a fight used to take
  two). The preview array's entries carry a `label` (`3`, `B2`) from
  `slotLabel`; a lobby contributes **no** preview, having no generated
  geometry — `LobbyForm`'s diagram is its stand-in.

What does **not** follow from it: how anything is generated. Floors are still
built in numeric order off `ctx.rand` and arenas in list order off
`ctx.bossRand`, and each is stashed and emitted afterwards in campaign order.
Rearranging is a linking change; generating in a different sequence would move
every seed.

`slotLabel`/`parseSlotLabel` are the whole vocabulary: `3` for a floor, `B2`
for a fight, `L2` for a lobby, all 1-based because a person reads them, and
those are exactly the tokens `levelOrder=` carries in `parameters.txt`.

**A lobby may never be the campaign's last slot** — it has no victory orb, so a
campaign ending on one cannot be finished. `validation.ts` rejects it, and
`FloorOrderEditor` disables any arrow that would produce it, checking **both**
sides of the swap: the back arrow on the last chip pulls whatever is there into
the last slot just as the forward arrow on the second-to-last pushes one there.
The generator still falls back to `'0'` rather than throwing if a hand-edited
file gets one there anyway (invariant 5).

The editor is its own left-panel tab (`FloorOrderEditor`), sitting between Boss
and Player rather than inside the Dungeon form: its chips are boss fights and
lobbies as well as floors, so it belongs to none of the tabs it could live
under. Its "nothing to arrange" gate counts all three kinds, so a
lobbies-and-floors campaign with the boss off still gets an editor.

`normalizeOrder` repairs a stale order — drops slots that no longer exist,
appends missing ones (in `defaultOrder`'s shape: lobbies, then floors, then
fights), drops duplicates, and deals each kind's indices back into
the positions that kind already occupies so the interleaving survives while the
numbering is made ascending. The importer, `ParameterForm.setLevels`,
`BossForm.set` and `LobbyForm.setLobbies` all use
it, so a stale file or a changed floor, fight or lobby count is never fatal.
`validation.ts`
still reports a broken stored order, because the form edits the value directly
and must not have it silently rewritten underneath.

## Lobbies (`src/generator/lobby/`)

A lobby is a **hand-authored level, not generated geometry**: a committed XML
template edited by id through `levelTemplate/surgery.ts`, with no RNG in scope
at all. The campaign can carry any number of them, each an independently
placeable `CampaignSlot`, and `lobbies: []` is how the feature is switched off
— there is no `enabled` flag, the same rule `boss.fights` follows.

**One builder, one descriptor per room.** Before issue #48 the starting lobby
and the boss prep room were two features doing the same job: a name-normalised
diff of their two `build.ts` files differed only in an import path and a default
argument. `presets.ts` now holds one `LobbyPresetDef` per committed room and
`buildLobby(preset, options, exitTarget, saves)` reads every coordinate and id off it —
template text, vendor ids, exit node, diamond slots, upgrade slots, the two id
bases, the respawn id base, the extra asset files, and the label surgery's error
messages use. There is **no per-preset branching** anywhere in the builder, and
adding a third room means regenerating a template and adding an entry, nothing
else. Two ship:

- `BETA-dungeon-prep` — the campaign's original starting lobby, five vendor
  stalls around a teleport. Ships `LOBBY_ASSETS`, the custom files its template
  references.
- `BETA-boss-prep` — the larger room that used to be welded to every fight, now
  placeable anywhere. Stock assets only (`[VERIFIED]` 2026-08-10), which is why
  its `assets` is `[]`.

The preset id is stored in `LobbyOptions.preset` and written to
`parameters.txt` as `lobby<i>Preset`, so it is a compatibility surface: an id
that is not in `LOBBY_PRESETS` is a validation error on the parameter object
and an `unknownKeys` entry on import, never a silent fallback.
`bossprep/template.ts` stays where it is rather than moving under `lobby/` —
it is generated data (`scripts/import-bossprep-assets.mjs` rewrites it), and
`presets.ts` is simply another importer of it.

**Emission** (`index.ts`). Lobbies are built after the floor loop *and* the
fight loop, drawing from neither stream, so which lobbies exist and where they
sit cannot move a seed's dungeon (invariant 8). Each lobby slot in the campaign
order emits one `levels/lobby<i>.xml`, and its single `LevelExitArea` is
repointed at `slotEntryId` of whatever slot follows it — a floor, a fight's
arena, or another lobby. A preset's `assets` are pushed once per *used* preset,
deduped by path, so two dungeon-prep lobbies ship each file once and an unused
preset ships none.

**`parameters.txt`.** `lobbies=N` is the count, and every other key is fully
indexed — `lobby<i>Preset`, `lobby<i>Gold`, `lobby<i>Shops`,
`lobby<i>Upgrades` — mirroring the `boss<i>` keys. The count may be declared
before or after the indexed keys, and an explicit `lobbies=0` clears the base
object's lobbies (reporting the keys of any lobby it drops). The old singular
`lobby`, `lobbyGold`, `lobbyShops`, `lobbyUpgrades` and the fight-scoped
`boss<i>Gold`/`boss<i>Shops`/`boss<i>Upgrades` are a **deliberate pre-release
break**: they land in `unknownKeys` and are reported, never aliased to lobby 0
and never fatal. Note that `lobbyGold` has no digit after `lobby`, so it falls
past the `^lobby(\d+)(.+)$` dispatcher to the catch-all on purpose.

**The form.** The Lobby tab carries a lobby count, `Lobby 1 … Lobby n` sub-tabs
with a copy-to-next button (the same shape as the fight tabs) and a preset
dropdown per lobby; the Boss tab's Prep room sub-tab is gone with the concept.
Growing the list clones the **last** lobby rather than the
stock default — a dungeon master tuning lobby 1 and asking for a second almost
always wants a variation on it. The diagram plots the selected preset's own
diamond and upgrade slot tables instead of hardcoding the dungeon room's grid,
so a new preset draws whatever its tables describe with no UI change.

## Dungeon floors that host a boss (`dungeonBoss/`, issue #61)

`levelBoss[i]` puts a boss on an ordinary floor. The floor keeps every standard
control — rooms, passages, theme, pools, multipliers — and gains a boss, a
sealed way out, and the arena's health-tier rigs.

**The exit becomes a portal, and that is the whole trick.** A boss floor's way
out has to be SEALED until the boss dies, and only the orb/portal branch of
`map/level.ts` produces a room a seal can close. Sealing a stairs room instead
would mean: `transform('Exit')` has no dead-end guard, `sealRoomWithButton`
refuses an `Exit` room, an ExitDn prefab sits at `room.y - 2` in the very wall
band a `DOWN` corridor's seal line is drawn into, and `sealHolds` — which looks
for `type === 'Orb'` and a goal prefab of `Orb`/`BossPortal` — would pass every
such floor silently. So a boss floor takes the orb/portal branch whatever
`ctx.gateway.kind` says, and `map/room.ts` renders the red `BossPortal` at
`gateway.target`. `boss/arena.ts` already does exactly this, an arena having no
stairs prefab of its own. The dead-end guard, the seal wall and `sealHolds` all
work **unchanged**.

**Two RNG effects, only one of them new.** Taking the portal branch is a
different number of `ctx.rand` draws (`transform('Exit')` rolls a prefab x per
attempt then runs `transform('Lair')` on the room — hundreds; `transform('Orb')`
draws zero), so **enabling a boss moves that floor and every floor after it**.
That is invariant 9's gateway-kind cost, paid knowingly, and free today because
no seed predates the feature — but a floor with `enabled: false` must draw
exactly what it always drew. Everything after acceptance draws from
`ctx.floorBossRand` (`seed + 4`) alone: not `trapRand`, which would move an
armed floor's always-on spewers, and not `bossRand`, which would move every
arena.

**The boss's tile is chosen during construction, not in the rig.** It is pushed
to `ctx.reachTargets`, because the way out opens only on the boss's death — an
unreachable boss is an unfinishable floor, exactly as an unreachable button
would be. `buttonSeal.ts`'s `pickButtonTile` is the pattern it copies. The rig
proper runs post-acceptance and only places the actor at the tile already
chosen.

**Only mobile bosses.** `MOBILE_BOSS_IDS` (`config/parameters.ts`) is
**authored**, not derived: `<collision static="...">` describes the collider,
not locomotion, and is `true` for the worm, which burrows across a whole arena,
while anubis and krilith carry no `<collision>` child at all. Out are the dragon
(pinned to a top wall, no upward-facing art) and the queen. `boss/bosses.ts`
derives each def's `mobile` flag from that list; the list lives in
`parameters.ts` because `bosses.ts` imports from there and not the reverse.

**Other rules.** The seal is built whether or not the floor is locked — the
boss's death is its key. Locking it too adds a button, and the wall then waits
for a `Variable` countdown of (boss death or all-died check) + button press. Wave monsters
spawn from `FLOOR_SPAWN_POINTS` (9) interior points pooled across every eligible
room, the same count the arena's anchors give and for the same
too-many-actors-in-one-frame reason. Per-tier traps replace one another and
share `traps/floor.ts`'s placement, so they are the always-on floor traps made
switchable. Invulnerability may not share a floor with timer mode: both announce
countdowns on one level.

**Placement keeps off the walls, and teleports land on LevelStart.** Both
rules came from the 2026-09-22 playtest (DISCOVERY-LOG).
- Wave spawns and the boss's own tile use `roomSpawnBox` (`map/room.ts`): the
  original's Lair-spawner box, `x+2 … x+w-2, y+4 … y+h-2`. A tile next to a
  wall is open floor in the tile map but inside the wall's collision, and
  anything spawned there is stuck.
- `Checkpoint` and `RespawnPlayers` teleport the party to **their own
  position**, so the floor passes its `LevelStart` as `buildCheckpointRig`'s
  `respawnAt`. Only the triggers go in the marker column past the east edge.

**Per-tier item drops scatter across the floor** (`dungeonBoss/pickups.ts`).
The arena drops on a fixed pad by its entrance, and a floor has no such spot,
so each copy gets its own random interior tile: the same `floorInteriorSlots`
and `takeSlot` the wave monsters use, from a pool of its own that is refilled
if a big table empties it. The wiring is the arena's: one
`SpawnObject{trigger-times: 1}` per copy off the tier trigger, with tier 0 on
`LevelLoaded`. It is built **last** in `buildFloorBossRig`, so turning drops
on only appends ids and `floorBossRand` draws and moves nothing already on
the floor. `bossFloorN WavePickup<T>=item:count|…` in `parameters.txt`
shares `parsePickupRows` with the arena's `boss<f>WavePickupN`.

## Arena mode: Boss or Survival (`survival/`, issue #61)

Every arena slot is one of two kinds, stored as `BossFight.mode` — **absent
means `'boss'`**, which is the byte-identity contract that keeps every
pre-feature parameter object and `parameters.txt` unchanged. Read it through
`arenaMode(fight)`, never off the field.

**Why survival needs its own rig rather than a flag on the boss one.** The
engine fires `Boss 75% / 50% / 25% / Died` for any actor in the `actors/boss_*`
folders and for **nothing else** — this repo never sends them. A survival arena
places no boss actor, so none of those events ever fire, and every rig listening
for one (wave tiers 1-4, the per-tier buffs, traps and drops, the checkpoints,
the invulnerability windows, **and the alcove opener**) would emit a trigger
nothing pulls. `survival/` re-keys the same jobs to elapsed time: one
`GlobalEventTrigger("LevelLoaded")` with a per-connection millisecond delay per
event, the `timer/hazard.ts` pattern.

**What the two modes share is the ROOM.** `arena: BossArenaOptions` is read by
both — size, theme, floor pattern, cover, food, music, multipliers, the entrance
and the arrival respawn are all identical. The boss-only fields (`bossPool`,
`waves`, `invulnerability`, `checkpoints`, `spawn`) stay on the object in
survival mode, simply unread, so **flipping a fight's mode is lossless in both
directions**. `validation.ts` gates the boss-only rules on the mode for the same
reason — blocking generation over a field nothing reads would be wrong.

**Three differences from the boss rig that are deliberate, not oversights:**

- **Windows do not replace one another.** A boss tier switches the previous
  tier's buffs and traps off as it switches its own on, because tiers are phases
  of one fight. A survival window is a span on a timeline, so two overlapping
  windows both apply and each owns exactly one on/off pair.
- **No scattered spawns.** A wave row always spawns from the nine anchors, so
  `arena.ts` hands `placeSpawnPoints` an empty request list in survival mode and
  the arena makes **no draw** there.
- **Endless rows stop at the end.** `count: -1` is the same sentinel a boss
  tier's `monsterMax` uses — every anchor gets an unbounded `SpawnObject`, and
  `scaledMax` keeps `monsterMultiplier` from scaling it. But a boss fight is
  unbounded and a survival round is not, so an endless row also gets a
  `ToggleElement{state: 1}` on the clock tick that opens the alcove. Without it
  a lingering party is fed ~18 actors/second forever. Finite rows need no stop:
  they self-limit through `trigger-times`.

**RNG.** A survival arena draws a DIFFERENT NUMBER of `ctx.bossRand` values than
a boss one — no boss pick, no scatter points — so flipping a fight's mode moves
every arena **after** it, exactly as adding or removing a fight does. No dungeon
floor moves (separate stream) and no earlier arena moves (earlier position); the
suite asserts both. Survival's own fixed order: width, height, alcove wall
(all three of N/E/W, since no boss vetoes one), cover, food, floor pattern, one
`iRand` per placed trap spewer, then `getArenaXML`'s cosmetics.

**Labels.** An arena slot is `AB{n}` or `AS{n}` — the **prefix is the mode**, the
**number is the index in the `fights` array**. One boss and one survival arena
read `AB1`, `AS2`. Numbering by array index rather than per mode is what keeps
`normalizeOrder` untouched and stops a mode flip renumbering other chips.
`slotLabeller(arenaModes(boss))` is what every call site with the fight list
uses. `parseSlotLabel` accepts `B1`, `AB1` and `AS1` alike: the prefix in a token
is **informational**, and `boss<i>Mode` is the single source of truth, so a
hand-edited mismatch is not an error — the mode key wins and the next export
rewrites the token.

`parameters.txt` carries `boss<i>Mode`, `boss<i>Survival=<seconds>,<countdown>`,
and `boss<i>SurvivalWaves` / `SurvivalBuffs` / `SurvivalPickups` /
`SurvivalTraps`, each a `|`-separated row list on its own key. A **boss-mode
fight writes not one of them**, `boss<i>Mode` included. Read the four lists
through `survivalWaves`/`survivalBuffs`/`survivalPickups`/`survivalTraps`, never
off the object — a hand-edited file can leave any of them out, and both the rig
and the validator treat absent as empty rather than throwing (invariant 5).

## Boss finale (`boss/`)

**One** level per fight when `boss.enabled` — the arena — generated after every
numeric floor. A fight used to drag a prep room along with it; since issue #48
a shop in front of a boss is an ordinary lobby slot the dungeon master places,
which is exactly what `defaultParameters()` does (`L2` immediately before `B1`
in `shippedOrder`).

**The chain follows the campaign order, not the fight list.** A fight is
entered at its arena (`slotEntryId` returns `bossArenaId(i)`), and where the
arena leads is `gatewayAfter`'s answer for its position, exactly like a floor's
stairs: the next fight directly, a lobby if a shop was put between them, a
dungeon floor, or the victory `Orb` if it is the campaign's last slot — and a
campaign has exactly one `Orb` and one `GameEnd` however the slots are
arranged. `BossPortal` and `LobbyPortal` are deliberately the
same three-id shape as `Orb` (`objectSet.ts`) so whichever lands in the alcove
shifts nothing allocated after it and makes no `ctx.bossRand` draw. Level ids
and paths come
from `src/generator/campaign.ts` (`bossArenaId`/`bossArenaPath`, `boss<i>` and
`levels/boss<i>.xml`) — a single source, because both ends of every link need
them.

**One `ctx.bossRand`, shared in list order.** Fight 0 draws exactly what a
single-fight campaign always drew, and each later fight continues the stream
after it, so adding a fight can never move an earlier one or any dungeon floor.

- Both lobby templates, and the arena, also carry the **one-shot arrival
  respawn**
  every dungeon floor's `ExitUp` prefab emits — an `AreaTrigger` over the
  spawn point firing `RespawnPlayers` plus a `ToggleElement` that disables the
  trigger. Without it a player who died on the previous slot arrives dead and
  cannot shop. The templates get it inserted at build time by
  `respawnOnEntryNodes()`/`insertNodes()` (ids from 9000), never by editing
  `template.ts`, which the import scripts regenerate.
- **Arena** (`boss/arena.ts`) — generated, but not a `Level`: no rooms, no
  passages. It reuses `Tile`, `Doodad`, `Item`, `Monster`, `ObjectSet` and the
  XML layer and emits the same section order. **Fixed `ctx.bossRand` draw
  order**: width, height, boss pick, alcove wall, cover pillars, food clusters,
  then scatter spawn points last — last precisely because an all-`anchors`
  campaign makes no draws there, which is what kept older arenas
  byte-identical. Reordering these is a breaking change for every arena seed.

**Waves.** Exactly `BOSS_WAVE_COUNT` (5) tiers: the health thresholds 100 / 75
/ 50 / 25, then `BOSS_DEATH_WAVE`, keyed to the engine's `Boss Died` event
instead. Tiers switch on and never off — no timer is ever disabled, a tier
stops only when its `SpawnObject` budgets run out — so by 25% all four health
tiers spawn at once. The death tier spawns into the walk from the dead boss to
the orb; that spawns do fire after death is `[VERIFIED]` in game (2026-08-19).
An empty tier emits no nodes and requests no scatter points, which is how a
campaign gets the quiet walk back.

**Invulnerability windows** (`boss/invulnerability.ts`). Independent of the
waves and built after them, so switching them on only ever appends nodes. On
each of `BOSS_INVULN_THRESHOLDS` (75/50/25%) one `GlobalEventTrigger` fans out
to a `ToggleImmortality{state: 0}` at delay 0, one `AnnounceText` per second of
countdown, and a `ToggleImmortality{state: 1}` at the end of the window —
`state: 0` is immortal, the same inverted polarity `ToggleElement` uses, and
`element` is the boss's **actor** id. Default 30s on every threshold; 0 disables
one; the whole feature can be switched off. Draws no RNG.

**Checkpoints / save game** (`boss/checkpoints.ts`, PR #52). Two independent
milestone presets on `arena.checkpoints` — `respawnPlayers` and `saveGame`,
each one of `BOSS_CHECKPOINT_PRESETS` (`never` / `50` / `75-50-25` /
`75-50-25-dead`). **Respawn player** pulls dead or lagging players into the
arena; **Save game** moves the respawn point and writes the save (`Checkpoint`
node). A milestone both presets name gets **one shared** `GlobalEventTrigger`,
never two; a respawn-only milestone emits a bare `RespawnPlayers` with no
`Checkpoint`; both at `never` emits nothing at all — no trigger, no node.
Listens to the same `Boss 75/50/25%` / `Boss Died` events as the invuln and
wave rigs but wires its **own** triggers, so neither of their `connections`
arrays is touched. Draws no RNG. Defaults: respawn `75-50-25-dead`, save `50`.
`boss<i>Checkpoints=<respawnPreset>,<saveGamePreset>` in `parameters.txt`.
`Checkpoint`'s `parameters` is a bare bool, not a dictionary — see the
modding skill's DISCOVERY-LOG (2026-09-05).

This is the only rig in the repo that needs **real per-connection delays**:
`ScriptNode.connectTo(node, delayMs)` opts a node into writing true
milliseconds under both `delays` and `connection-delays`. Every other node keeps
the Java original's `delays` line (a verbatim copy of `connections`) untouched —
see the DISCOVERY-LOG for why both names are written.

**Spawn modes** (`waveSpawnMode`, `isScatterMode`). Default `anchors`: the
monster trickles in on a timer from the nine anchors, split round-robin.
The four scatter modes (`random`, `ring`, `gaussian`, `symmetric`) skip the
toggle/timer rig entirely — one `SpawnObject{trigger-times: 1}` per monster,
hung straight off the tier trigger, so the group appears at once and both
interval fields are ignored. Two constraints that must not be relaxed:

- A monster whose **wreck still blocks movement** (the nova / frost / tracking
  towers — `objects/actorCollision.ts`) may not be scattered; validation
  rejects it, because a scattered wreck can wall the arena off. That is the
  only reason the stock presets keep an anchored tail on some tiers.
- `monsterMax` `-1` means **endless** and is never scaled by
  `arena.monsterMultiplier` and never scattered (a one-shot spawn has no
  meaning for an endless budget).

**Cover** (`boss/cover.ts`). `density` is the fraction of *free floor* filled,
capped at `BOSS_COVER_DENSITY_MAX` (0.25) — the original 0.5 playtested as
physically impassable. Whatever the pattern, `pruneForConnectivity` guarantees
the boss, all nine anchors and the alcove stay reachable from the entrance;
pillars that would wall something off are removed. It also exports
`reachableMask` / `reachableTiles` / `rectReachable`, the post-prune walkable
floor, which is what keeps a scattered monster out of a pocket the pillars
sealed off — that guarantee covers the boss, the anchors and the alcove, not
every tile.

**The batch budget** (`arena.spawn.batchSize`, `batchIntervalMs`). A scattered
monster used to get one `SpawnObject` per monster, all fired off the tier
trigger at once. The 2026-08-27 playtest put ~480 actors on the floor in one
frame at the 100% tier and the arena never recovered, so a count past
`batchSize` now gets `batchSize` points with the count split round-robin over
them on a shared per-tier timer — the same mechanism the anchor rig uses for its
9 anchors. A count at or below the budget keeps the old one-shot shape and emits
byte-identical XML. Placement follows: `placeSpawnPoints` resets its `placed`
list per tier (tiers fire at different times and have no claim on each other's
floor), retries a short request at `spacing: 1`, and pads a shortfall onto real
spare floor — the 9 anchors are the last resort now, not the first.

**Anchors and the boss** (`boss/anchors.ts`). `anchors()` takes an
`AnchorClearance`: a `topWall` boss passes `northClearance` (N is pushed south
past its collider), a `centre` boss passes `centreBoss` (C is pushed south past
its collider, clamped clear of S). Each placement displaces exactly one anchor;
the other eight always sit at their plain insets. Before 2026-08-27 the centre
case did not exist and every monster sent to C spawned inside the boss.

## Free upgrades and the arrival revive (`levelTemplate/surgery.ts`)

Two things both hand-authored rooms — the `BETA-dungeon-prep` and
`BETA-boss-prep` lobby templates — gained after they shipped, neither drawing
from any stream. Both are per-preset data on `LobbyPresetDef` now, which is
what lets one `buildLobby()` serve either room.

**Free upgrade pickups.** `UPGRADE_KINDS` is the fixed eight-entry order
(`damage`, `defense`, `health`, `mana`, `damage2`, `defense2`, `health2`,
`mana2`) and it is load-bearing three times over: it is the order ids are handed
out in, the order `parameters.txt` writes the counts in, and the order the form
shows them in. `upgradeArrays(counts, slots, idBase)` emits one `ItemSection`
per kind with a count above 0; a kind at 0 emits **no** array, for the same
reason zero gold emits no diamond array (LevelPacker throws on an empty one).
Each template has exactly one slot per kind (`LOBBY_UPGRADE_SLOTS`,
`BOSSPREP_UPGRADE_SLOTS`, reached as `preset.upgradeSlots`), so a count above
one **stacks** on that slot — which
is why the count needs no gameplay cap, only `UPGRADE_COUNT_MAX` (10000) to stop
a typo emitting an unserializable pile. `upgradeItemPath` maps `mana2` to
`items/upgrade_mana_2.xml`: the `2` is the game's own second-tier pickup, not a
second copy.

The id base is **derived, not round**: `*_UPGRADE_ID_BASE = *_ITEM_ID_BASE +
MAX_DIAMOND_COUNT`, the first id no diamond can reach however much gold is
asked for. Raising the gold cap moves the upgrade ids with it instead of
silently colliding. Both rooms' two extra lights had to be renumbered into the
authored range for the same reason: a light entry references nothing, so its id
is never rewritten at build time, and the ids the source levels carried
(10020/10021, 10047/10048) sat inside the span a deep diamond payout walks.
The lights are unconditional and have no parameter.

**Save checkpoint.** `params.lobbySaves` (campaign-wide, `defaultParameters()`
ships it **on**) makes `buildLobby` append one `items/trigger_button_save.xml`
entry to the items body, at `preset.saveButtonSlot` with id `preset.saveButtonId`
(9500 — in the gap between the respawn rig at 9000–9003 and the diamond base at
10000). It is a stock `behavior="checkpoint"` item, so this is items-only: no
scripting node, and `levels/level*.xml` stay byte-identical whatever the toggle
is (invariant 6). `saveButtonArray()` in `surgery.ts` returns `[]` when off.
Slots are Crackshell's own: `[7, -4]` (dungeon prep, by the exit teleport),
`[0, -11]` (boss prep, in front of the portal).

**Arrival revive.** `respawnOnEntryNodes()` + `insertNodes()` (ids from 9000,
`preset.respawnIdBase`)
give both lobby templates and the arena the one-shot `RespawnPlayers` rig
every dungeon floor's `ExitUp` prefab already emitted — an `AreaTrigger` over
the spawn point, then a `ToggleElement` that disables the trigger, so dying
mid-fight stays permanent. Inserted at **build** time, never by editing
`template.ts`, which the import scripts regenerate.

## Player tweaks (`src/generator/tweak/`)

A second, independent axis of the app: the campaign can ship its own copies of
Hammerwatch's `tweak/*.xml` balance files, which override class stats, upgrade
costs and per-difficulty enemy multipliers. This has **nothing to do with
level generation** — it runs after it, consumes no RNG, and is bolted onto the
same `GeneratedFile[]` the levels produce.

- **The baseline is the whole file.** A campaign's tweak file *replaces* the
  base game's file wholesale; it is not a key-level merge. Verified in game
  2026-07-30: deleting upgrades from a campaign's file removes them from the
  shop. So `baseline.ts` holds a complete transcription of all nine stock files
  — `general.xml`, `shared.xml`, and one per class (`TWEAK_CLASS_IDS`: knight,
  priest, ranger, sorcerer, thief, warlock, wizard) — and one edited value
  still means emitting that entire file.
- **`TWEAK_FIELDS` is derived, not hand-written.** `overrides.ts` walks the
  baseline and produces one `TweakFieldDef` per editable value, so the form,
  the `parameters.txt` parser, the validator and the loadout sheet can never
  disagree about what exists. Adding a field means editing `baseline.ts`.
- **Key format** (lowercase throughout, because `configFile.ts` lowercases
  every key it parses):

  ```
  player.general.<difficulty>.<key>        player.general.hard.enemydamagebase
  player.<unit>.param.<name>               player.knight.param.max-health
  player.<unit>.cost.<upgradeId>           player.knight.cost.health-1
  player.<unit>.effect.<upgradeId>.<stat>  player.knight.effect.health-1.max-health
  player.<unit>.remove.<upgradeId>         player.shared.remove.life
  ```

  The `effect` scope is what an upgrade grants — the `children` of its
  `<dictionary>`. It carries an extra dot segment; nothing may parse these keys
  by splitting on `.`.

  The `remove` scope is a flag, not a value: `1` drops the upgrade from the
  emitted file, which is how an upgrade is taken out of the shop entirely.
  Removal **cascades** — `applyTweaks` also drops anything whose `req` chain
  reaches a removed id, so a file never ships a dangling `req`.
- **Sparse and pruned.** `pruneTweaks()` drops anything equal to its stock
  value, so "changed nothing" is literally `{}`. `emitTweakFiles()` returns
  `[]` in that case and no `tweak/` folder is written.
- **`PlayerTweaks` is `Record<string, number>` and stays that way.** `bool`
  params (the skill-unlock flags) and `remove` flags ride the numeric rail as
  `0`/`1`, so `parameters.txt` needs no new syntax and validation has one rule
  for both. Only `string` params are excluded from `TWEAK_FIELDS` outright, along
  with an upgrade's `lvl`.
- **Round-trip.** `serializeParametersTxt` appends the pruned overrides in
  sorted key order (floats as `toFixed(6)`); the parser routes any `player.*`
  key through `TWEAK_FIELD_MAP` and reports unrecognized ones in `unknownKeys`.
  Both directions go through `formatTweakLine` / `parseTweakValue`
  (`tweak/overrides.ts`), which **playersettings.txt** shares
  (`config/playerSettingsFile.ts`, issue #77): the same `player.*` lines on
  their own, CRLF, behind a `#` header. Unlike parameters.txt it is **not** an
  overlay — importing it *replaces* `playerTweaks` (a key it omits is stock), so
  export-then-import is exact. Non-`player.*` keys land in `ignoredKeys`, so a
  whole parameters.txt imported there yields just its player half. IPC is
  `playerSettings:import` / `playerSettings:export`, carrying only the tweak
  record; the header shows the two buttons as the second row of a 2×2 grid
  under the parameters.txt pair. `HeaderGuide.tsx` (the header's leftmost (i))
  explains the two files side by side — keep it in step if either changes.
- **Upgrades set, they don't add.** An upgrade writes an absolute value, so a
  ladder left at stock while its starting stat is raised turns into a paid
  downgrade. `chains.ts` groups upgrades into ladders and derives a
  first-cost/per-tier-step curve for each (measured from the starting stat where
  it fits), which the form edits and expands back into per-tier overrides —
  the curve is a UI shorthand, never stored. `validation.ts` warns, without
  blocking, whenever an upgrade lands on the wrong side of its starting stat,
  in both directions (`mana-regen` is a period in ms, so lower is better).
- **Bulk editing is derived, not stored** (`bulk.ts`). The "Quick setup — all
  characters" section scales the whole roster at once: a master `×` knob plus one
  per stat group (health, mana, damage, defense, utility, costs), a shop policy
  (stock prices / all free / no upgrades at all / one custom price), skill
  pre-unlocking, and a fully-upgraded preset. It writes only the ordinary `player.*` keys above, so
  nothing else in the pipeline knows it exists. Three rules keep it honest:
  - **Factors measure from stock, never from the current value.** That makes them
    idempotent and lets `deriveStatFactor` recover the knob's value by anchoring
    on the largest stock in the group and re-applying to check the fit —
    `uniform: false` is the same idea as `CostCurve.fits`. ×1 writes nothing.
  - **Direction is per stat, not per group.** `mana-regen` and the `*-cost` stats
    are divided rather than multiplied, so "higher ×" always means stronger.
    Sentinel stock values (`-1` locked, `9999` unaffordable) and `0` are skipped;
    scaling a sentinel would corrupt it. A test asserts every numeric stat lands
    in exactly one group, so a new baseline stat cannot escape the editor.
  - **Pre-unlocking a skill applies the whole unlock upgrade — strings included.**
    The flag alone leaves `whirl-dur` at `-1`, and dropping the *string* children
    left `combo-nova-projectile` empty, which crashed the game mid-combat. String
    params are overridden by index into `TweakFieldDef.choices`, so the map stays
    numeric and an unshipped path cannot be emitted. `applyFullyUpgraded` is a one-shot action, not a
    toggle, and reads the *tweaked* files so it composes with the factors.
  - **The `req` cascade *is* the tier mechanism.** Every multi-tier chain links tier
    N to tier N-1 by `req`, and `applyTweaks` drops anything whose `req` chain
    reaches a removed upgrade — so `applyTiersSold` writes exactly **one** boundary
    flag per ladder and the cascade does the rest. Do not add per-tier flags.
  - **An upgrade with no editable children can never be judged dead.** `life`,
    `rejuv` and the three potions carry no stats, so `isDeadUpgrade` returns false
    and they survive the fully-upgraded preset. Same for an upgrade whose payload
    has no starting param to compare against — the Priest's cripple aura writes
    `slow`, which the Priest cannot start with, so it stays buyable.
  - **Direction comes from the ladder before the starting value.** `directionOf`
    consults the stock ladder's slope first, because a starting value can lie twice
    over: it may be the `-1`/`9999` sentinel, or a plain `0` meaning *disabled*
    rather than *worst*. Priest `hp-regen` starts at 0 but its ladder descends
    (5 -> 1.25) because it is a period in seconds.
  - **"No upgrades" removes, it does not overprice.** An omitted upgrade is
    genuinely absent from the shop (verified), so the lockout empties
    `<upgrades>` rather than pricing at `SHOP_PRICE_MAX`. That constant survives
    only as a clamp: `999999` is the most the shop can display, and a *negative*
    price pays the player, which is supported on purpose.
- **UI.** `PlayerForm.tsx` (left panel, "Player" tab) renders `QuickSetup.tsx`
  between the shared stats and the first class, then starting stats as a plain
  grid, skill flags as checkboxes, and each upgrade ladder as a curve row with the
  raw tiers behind an "Edit tiers" disclosure, grouped by the game's shop columns
  and badged with per-file and per-group change counts; `LoadoutSheet.tsx` (right
  panel, "Loadout" tab) shows `buildLoadouts()` — each class's start value, its
  value after buying every upgrade, and a flag where the user diverged from stock.
  That is why `maxedParams` buys in `req`-depth order and lets later purchases
  overwrite earlier ones, and why `bulk.ts` reuses it rather than reimplementing.
- **Warnings that a bulk policy would fire hundreds of times get collapsed.**
  A bounty shop sets all 372 prices negative and the fully-upgraded preset removes
  104 ladders; each is one warning naming the count, not hundreds of identical ones. Same principle as the exemption below — apply it
  to any new per-field warning a quick-setup control can trigger en masse.
- **The downgrade warnings have an exemption.** A starting stat sitting exactly on
  a rung of its own ladder is a character deliberately created fully upgraded, so
  `ladderAbsorbed` suppresses both downgrade warnings for it — otherwise the
  fully-upgraded preset buries the panel in hundreds of correct-but-unwanted
  messages. A start that merely *overshoots* its ladder still warns, because that
  is the typed-a-big-number mistake the messages exist for.
- Emitted XML is *not* the level dialect — see the `hammerwatch-modding` skill.

## AI preset assistant (`src/shared/llm/`, `src/main/llm/`, issue #74)

Optional chat that turns a description into `parameters.txt` lines. Boundaries:

- **Pure helpers in `src/shared/llm/`** (`providers.ts`, `prompt.ts`, `reply.ts`,
  `types.ts`) — no electron, no DOM; they import the generator only for its
  exports. `buildSystemPrompt` is deterministic and built from the registries
  (`THEMES`, `MONSTER_TYPES`, `BOSS_IDS`, ...), so it cannot drift from the parser.
- **Network and keys live in `src/main/llm/` only** (`client.ts` is plain
  `fetch` for every OpenAI-compatible provider; `anthropic.ts` is Claude through
  `@anthropic-ai/sdk`, the one dependency the feature adds, chosen by the
  provider's `api: 'anthropic'`; `store.ts` is `userData/llm.json` with `safeStorage`). Keys
  never go in `AppSettings` and never cross IPC; `llm:get-config` returns
  `hasKey` booleans. The renderer sends the messages, main adds the auth header.
- **LLM output enters the app only as parameters.txt text**:
  `extractParametersBlock` -> `parseParametersTxt(block, currentParams)` ->
  `validateParameters`, then the user's Apply through `setParams`. No new schema,
  and nothing under `src/generator/**` knows the feature exists.
- Opt-in is a contract: no request until the user sends a message or presses
  Refresh models. Do not add a startup or on-open fetch.
- Pollinations' keyless endpoint (`text.pollinations.ai/openai`, model `openai`)
  was verified 2026-10-01; its newer `gen.pollinations.ai` needs a key.

## Working rules

- **Match the surrounding style.** No linter is configured. 2-space indent, no
  semicolons, single quotes, named exports, `type`-only imports where the
  import is types-only. Comments explain *why* (especially parity decisions),
  not *what*.
- **Every generator change needs a test.** `tests/` covers RNG parity vectors,
  `parameters.txt` round-tripping (including that `parameters.default.txt`
  parses back to `defaultParameters()`), the validation matrix, fixed-seed
  generation (determinism, bounds, entrance/exit/orb presence, XML sections),
  reachability, theme snapshots, the arena (geometry, anchors, cover
  connectivity, spawn points, wave rig, floor patterns), and the tweak layer
  (baseline integrity, whole-file emission, no-change-no-file, loadout
  ceilings, and the bulk knobs' stat-group coverage and derive round-trip).
- **An optional level's on/off switch must not move the dungeon.** The suites
  assert it directly: emptying `lobbies`, flipping `boss` or changing any tweak
  leaves every `levels/level*.xml` byte-identical for a seed. Moving a lobby
  around the order is the one case with a caveat: it is byte-identical too
  *unless* it changes some floor's gateway KIND between `exit` and the portal/
  orb family, which picks a different room.
- **Changing the RNG draw order is a breaking change.** It invalidates every
  seed users have saved. If a fix requires it, say so explicitly in the PR
  body — do not slip it in.
- **Gate:** `npm run typecheck && npm test` must pass before handing work back.
- **Don't add dependencies** without a stated reason; the runtime deps are
  exactly `react`, `react-dom`, `jszip`.

## Review bar for returned work

Reject or fix a diff that: imports Node APIs into `src/generator`; adds
unseeded randomness; changes RNG draw order without flagging it; draws arena
randomness from `ctx.rand`/`ctx.cosmeticRand` instead of `ctx.bossRand`, or
floor-trap randomness from anything but `ctx.trapRand`, or mystery-button
randomness from anything but `ctx.mysteryRand`; draws trap randomness
from inside the `Level` constructor, where the retry loop's discarded
candidates would spend it; draws
before the early return in a no-op theme path; adds a parameter without a
validation rule; adds an unbounded loop; sends file contents through IPC;
weakens `reachability.ts` instead of letting a bad floor re-roll; generates
floors or arenas in campaign order instead of their own fixed sequences, or
stores the default `levelOrder` as an explicit list rather than as absent;
branches on a lobby preset id inside `lobby/build.ts` instead of reading the
`LobbyPresetDef`; adds a gateway kind or a gateway prefab that does not
register exactly three ids off zero draws; or
lands generator behaviour without a test.

Tweak-specific: reject a diff that hand-writes a `TweakFieldDef` instead of
deriving it from `baseline.ts`; mutates `TWEAK_BASELINE` in place (`applyTweaks`
clones — the baseline is shared, exported and read by the UI); emits a partial
tweak file; emits a `tweak/` folder for a stock run; stores an override equal to
its stock value; stores a *curve* rather than the per-tier overrides it expands
to; or derives an upgrade's tier from its id instead of its `lvl` child.
