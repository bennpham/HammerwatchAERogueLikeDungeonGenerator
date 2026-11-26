# Load custom → Hammerwatch 2 content (experimental branch)

## Context

You asked for a blue **Load custom** header button. It lets someone point the app at their Hammerwatch 2 install (yours is `D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch 2\`). Once HW2 is loaded, the Dungeon, Arena and World tabs gain HW2 themes, tilesets, doodads, monsters, bosses and music. With no HW2, **none** of it is shown. Install copies the HW2 files it needs into the `.h1c`, the way the custom AE scenario `scenarios/mistdeep` ships its own `actors/`, `doodads/`, `sounds/` and `music/`. This lives on the `experimental` branch (it exists locally and is checked out, at the same commit as `main`) and isn't part of 1.0. Custom asset folders and premade presets come later and use the same "custom source" slot.

Decisions you made: bosses wait for an in-game spike. HW2 audio is ported the mistdeep way (`.sbnk` + `.ogg`). HW2 files are copied into the `.h1c` with no export restriction. HW2 assets are read from `res/assets.bin` first, then from the newest `unpacked_assets_*` folder.

---

## Discovery report: Hammerwatch 2 assets (`unpacked_assets_137`)

On execution this becomes `docs/discovery/hammerwatch-2-assets.md`, with tags added to the discovery log.

### Same engine family as AE [VERIFIED by file comparison]
- The `.unit` XML is the same, with the same `%include/%define/%replace/%block` preprocessor, and so are `.tileset`, `.effect`, `.env`, `.pfb` and the SVAL `.lvl` XML (both `.lvl` files open with `<dict><dict name="game-mode">…<int name="version">1`).
- `res/assets.bin` has the same pack layout. The magic is `HW2R` where AE has `HW1R`, and the header fields match, so `readHw1rIndex` in `src/main/h1c/read.ts` should read it with the magic relaxed.
- AE already defines `StateActorBehavior`, `CompositeActorBehavior`, `CompositeActorSkill` and so on. AE has 973 script classes and HW2 has 1,195.

### What's there
| Folder | HW2 files | Notes |
|---|---|---|
| actors | 2,196 (772 `.unit`) | beasts (trolls, wolves, spiders, wasps, beetles, boars, maggots, shamblers…), humans (empire, pirates, thieves, cult), undead (archons, horde, rotten, ghost), aberrations, critters, misc (ballista, cannon, haunted armor/gargoyle, slime, hellcube…), 9 bosses |
| doodads | 4,353 (3,261 `.unit`) | 3,159 are plain sprite/collision units with no script. Wall sets: cave_dark, cave_light, corrupted, crypt, earth, hedge_corrupt, hedge_rough, hedge_trimmed, jade, obsidian, prison, pyramid_inside, ruins, ruins_corrupt, sewer, stone_1…7, throne_room. Also cliffs (basalt, granite, silt) and ledges |
| tilesets | 244 `.tileset` (flat) | crypt_*, sewer_*, obsidian_*, pyramid_inside_*, prison_*, grass_1…4, mud_1…7, desert_*, beach_*, snow, moss, marble, wood_*, water_clear/corrupt, … |
| effects/env | 31 `.env` | crypt_boss, prison, sewers, spidercave, thievestower, wolfcave, obsidian_spire, grotto, outside, and _day/_evening/_morning/_night with rain and snow variants |
| prefabs | 2,296 `.pfb` | 2,021 of them are level pieces (`__levels`), plus houses, traps, enemies, loot, … |
| levels | 11 `.lvl` | `boss_repeat/` arenas for all 9 bosses |
| res/assets/sound | FMOD banks | `music.bank` (194 MB), `sfx.bank` (179 MB), `ambience.bank` |

### Compatibility findings
1. **Paths collide with AE, so HW2 files ship under a `hw2/` prefix.** Many HW2 files share a path with an AE file but have different content: doodads 624, tilesets 181, scripts 338, effects 65, gui 59, players 33. Shipping them at their own paths would override AE's files for the whole scenario. So every reference inside a copied file is rewritten: `%include`, `texture=`, and `.unit`/`.png`/`.effect`/`.sval`/`.tileset`/`.env` paths. A file keeps its AE path only when it and everything it references are byte-identical to AE's, which covers most of `system/`. [EMITTED once built; that the engine accepts a top-level `hw2/` folder is UNVERIFIED, so it's spike S1]
2. **Wall sets fit `aeWalls.ts` as they are.** Every HW2 wall set uses the new-style pieces (`h_32`, `v_32`, `h_16`, `cap_h_e/w`, `cap_v_n/s`, `crn_*`, `x_*`, `__color_N`), which the emitter already supports. The only change is that `wallUnitPath` needs an asset root.
3. **Monsters:** about 190 of HW2's enemy units only use script classes AE also has. Counted with the full `%include` chain: critters 12/12, misc 53/70, beasts 36/98, undead 31/58, humans 28/76, aberrations 5/9, arena 6/19. The other units need the missing classes listed in finding 4. HW2 units also declare a `team` (e.g. `trolls`, from HW2's `tweak/actor_teams.sval`, which AE doesn't have) and HW2 `loot` tables, so the copier strips or rewrites both. [UNVERIFIED in game: AE ignores parameters it doesn't read, but where HW2 and AE share a class name the parameters may differ]
4. **Bosses: none are drop-in.** Every boss needs at least one HW2-only class. These are CompositeActorUtilitySkill, DashStrike, ChannelingSpewSkill, CompositeActorDamagedPeriodTriggeredSkill, ResistBuffSkill, ChainAction (with ChainActionHitscanLink and ChainActionAreaCircleLink), ClearAggro, ClearPointOfInterestOccupants, EnemyOwnedActor/EnemyOwnedStateActor and SteeringMovement: 14 classes in 12 files, about 2,700 lines. There's one hint that scenario scripts work: the installed community pack `scenarios/starcraft_campaign.h1c` ships `scripts/GUI/Shop/PowerShopMenuContent.as`, which overrides a stock script. Whether *new* script files (new class names) compile from a scenario is still spike S2. The 9 bosses are Archibald Steelwill, Barrington, Commodore Sinkage, Shock Widow, Dace Arden, Malgar, Judge Supreme, Doombringer and Blight.
5. **Sound:** HW2 units use FMOD `event:/sfx/…` names. Only about 13% of the ones HW2 actors use also show up in AE's assets (75 of 590 for actors, 13 of 202 for bosses), so most HW2 monsters would be silent unless their sounds are ported.
6. **Music can be ported the mistdeep way.** mistdeep ships `music/music.sbnk`, an XML soundbank of `.ogg` files, e.g. `<sound category="music" name="swamp" is3d="false" looping="true"><source res="./MoM_Swamp.ogg"/></sound>`. Its level mutes the stock music with `PlayMusic` (no value) and then runs a looping `PlaySound` on `music/music.sbnk:swamp`. Its units point their sounds at `sounds/sounds.sbnk:wasp_hurt` the same way. HW2's `music.bank` holds one FSB5 block of **54 named, unencrypted Vorbis tracks**, all stereo at 48 kHz with a single Vorbis setup header (CRC `a4f666fc`). Examples: Music_Crypt_120bpm, Music_Prison_135bpm, Music_Sewers_130bpm, Music_SpiderCave_105bpm, Music_BossTheme_115bpm_ts44, Music_ObsidianSpire_120bpm, Music_ThievesTower_bpm130, Music_SwampTheme_125bpm, Music_DesertTheme_125bpm, Music_SnowTheme_125bpm, Music_CorruptedMaze_110bpm, Music_CastleSuperbia_Dungeon_Normal/Corrupt_120bpm and Hammerwatch_Main_Theme_Demolite_Version. `sfx.bank` holds 5,900 named samples with two setup CRCs (`c55efa16` and `a4f666fc`). Turning FSB5 Vorbis into `.ogg` only means rebuilding the Vorbis id, comment and setup headers. Both setup headers can be vendored from vgmstream's table, which is ISC-licensed, with attribution.
7. **Tilesets** reference `tilesets/layers.inc` (layer draw order) and `system/default.mats`. HW2's `layers.inc` is copied under `hw2/`. If an HW2 layer value matches an AE one, borders between AE and HW2 floors may blend oddly. [UNVERIFIED, boot checklist]

### Spikes the app can't settle (go in `docs/discovery/hammerwatch-2-spikes.md` and on the boot checklist)
- **S1 – the `hw2/` prefix:** install a test scenario where one HW2 wall set, one tileset and one sprite doodad sit under `hw2/`, packed in `.h1c`. Do they render and collide?
- **S2 – scenario scripts:** ship `scripts/…/DashStrike.as` in a test scenario with a unit that uses it. Does it compile and run? This decides whether bosses can be done.
- **S3 – audio inside a `.h1c`:** mistdeep ships as a folder. Does an `.sbnk` with `.ogg` files packed raw (flag 1) in a `.h1c` play? If not, the install falls back to an unpacked folder.
- **S4 – compiled textures:** a texture read from HW2's `assets.bin` is already compiled (flag 3). Does passing it straight through into the `.h1c` render?

---

## Implementation plan

### Shape
- **HW2 content is curated data in the repo:** paths and ids only, never HW2 file contents. It sits in `src/generator/custom/hw2/{themes,biomes,monsters,music}.ts` and is appended to the stock lists: `THEME_DEFS`, `MONSTER_TYPES` (still append-only), `BIOME_DEFS` and `MUSIC_TRACKS`. Each entry is tagged `source: 'hw2'` and its id starts `hw2_`. The prefix is `hw2_` rather than `hw2:` because `:` already separates keys in parameters.txt.
- **A path snapshot** `src/generator/catalog/hw2Assets.generated.ts` (`HW2_UNITS`, `HW2_TILESET_SIZES`, `HW2_ENVIRONMENTS`, `HW2_MUSIC`) is produced by a new `scripts/scan-hw2-assets.mjs`. `aeAssetExists` and `tilesetSize` in `catalog/assets.ts` check `hw2/…` paths against it, which keeps invariant 6.
- **Whether HW2 is loaded is context, not a parameter.** `src/generator/custom/sources.ts` adds `ContentContext { sources: ('hw2')[] }` and `AE_ONLY`. The calls become `validateParameters(p, content = AE_ONLY)` and `generateDungeon(params, seed, content = AE_ONLY)`, and the worker gets `{ params, seed, sources }`. The output bytes never depend on `content`; it only decides what's valid. That keeps invariant 1.
- **A `requireSource(field, id)` rule** covers every id field: themes, `arena.theme`, `world.biome`, every monster list, and every music field. When HW2 isn't loaded, the error appears inline on that field: *"`hw2_crypt` is Hammerwatch 2 content. Load your HW2 folder with Load custom, or pick another."* Defaults and presets never use `hw2_` ids, and a test checks that.
- **Wall and cliff sets keep their string names, with an internal `hw2:crypt` key** that `catalog/assetRoot.ts` `wallDir()` and `cliffDir()` resolve to `hw2/doodads/walls/crypt`. That touches `aeWalls.ts:155` `wallUnitPath`, `aeCover.ts:48`, `doodad.ts:139/176/180/184`, `world/coast.ts:117` and the `stairArtRect` regex. The three direct `AE_UNIT_SET.has` calls (`emit.ts:80`, `emit.ts:109`, `doodad.ts:50`) switch to `aeAssetExists`. HW2 themes borrow AE doors and stair art at first.
- **The generator returns `DungeonResult.customAssets`**, the sorted `hw2/` root paths it emitted, collected from unit paths, tilesets, envs and music cues. It also writes `hw2/music/music.sbnk` itself, as deterministic XML listing the tracks it used. Main supplies only the files.
- **Music:** `MusicTrack.cue` becomes `{kind:'mode', mode} | {kind:'bank', sound:'hw2/music/music.sbnk:crypt', sample:'Music_Crypt_120bpm'}`. For a bank cue, `buildMusicRig` (`music/rig.ts`) emits LevelLoaded → `PlayMusic` (mute) + `PlaySound` with `looping = true`, which is mistdeep's pattern. For the mute, `NodePlayMusic.music` becomes `number | null` (`objects/nodes.ts:753`). `NodePlaySound` already has `looping`. AE tracks emit exactly what they emit today.

### Main side: `src/main/custom/hw2/`
- `detect.ts` checks for `HW2.exe`, then `res/assets.bin` with magic `HW2R`, then the newest `unpacked_assets_*`.
- `source.ts` reads binaries the same way `stockSource` does. `readHw1rIndex` in `h1c/read.ts` takes a `magic` parameter. The index is cached by size and mtime.
- `refs.ts` (pure) collects quoted tokens and element values, `%include`, and `%replace NAME value`. It splits `file.mats:name` and `.sbnk:name`. Relative `./` and `../` references resolve against the **root unit's** folder, as the shared wall `.inc` files need. A token counts as a reference only if the source has the file or it's an `event:/…`.
- `closure.ts` (pure, sources injected): `planCopy(roots, hw2, ae, policy)` does a sorted breadth-first walk bounded by a visited set. A file keeps its AE path when it and its whole closure are byte-identical to AE's, worked out by repeating until nothing changes. `system/` is always pinned to AE; a material name AE lacks falls back to `default` with a note.
- `rewrite.ts` (pure):
  - It prefixes absolute references that ship with `hw2/` and leaves relative ones alone.
  - It strips `team`, `loot` and `gore` from units.
  - It blanks `event:/` sounds that aren't in AE's list.
  - It rejects any `class="X"` missing from an AE script-class snapshot.
- `music.ts` extracts FSB5 Vorbis from `res/assets/sound/music.bank` to `.ogg`. It rebuilds the id, comment and setup packets; the setup header comes from vgmstream's table (ISC, credited). Results are cached in `userData/custom/hw2/music/<fingerprint>/`.
- **Writer:** `PackFile.flag?: 1|3` lets already-compiled textures from `assets.bin` pass through (`h1c/write.ts`).
- **Install:** `installScenario(…, custom)` in `packer.ts` merges the HW2 files after the patched stock files. The exports in `ipc.ts` do the same. If textures only exist compiled, the export says so.
- **Settings and IPC:** `AppSettings.hw2Path` (`src/shared/ipc.ts`, `settings.ts`), `custom:pick-hw2-path` and `custom:detect-hw2`, the preload bridge, and `InitialState.custom.hw2` status.

### Renderer
- **Button:** a blue **Load custom** header button (`button.custom`, using `--q-rare #4a8fe0`) in `App.tsx:342-399`. It opens `LoadCustomDialog.tsx`, which shows the Hammerwatch 2 folder, Browse, Unload, and the detection status: the source found, and how many themes, monsters and tracks are available.
- **Hiding:** a `ContentSourcesContext` hides every HW2 option when HW2 isn't loaded. That covers ParameterForm and BossForm themes, MonsterPoolPicker, MonsterMaxTable and MonsterFilterBar (group "Hammerwatch 2"), WorldForm biomes and MusicPicker. An imported value that isn't available still shows, as "(Hammerwatch 2, not loaded)", next to its inline error.
- **parameters.txt:** HW2 monster max keys at their default are left out, so an AE user's export doesn't change.

### Commits (on `experimental`, each passing `npm run typecheck && npm test`)
0. **Docs.** `docs/discovery/hammerwatch-2-assets.md` (the report above), `docs/discovery/hammerwatch-2-spikes.md` (S1–S4), new discovery-log entries, and boot checklist items.
1. **Catalog plumbing.** `sources.ts`, `assetRoot.ts`, the scan script and snapshot, and the `aeAssetExists`/`tilesetSize` lookup. AE output doesn't change.
2. **Set-name roots.** The seven template sites and the stair regex.
3. **Content context.** Thread it through validation, generation and the worker, plus `requireSource` with tests.
4. **HW2 themes.** 2–3 sets (`hw2_crypt`, `hw2_sewer`, `hw2_obsidian`) and `customAssets`.
5. **Main.** Settings, detection, the HW2 source and the IPC.
6. **Closure and rewrite.** Plus tests on fake in-memory sources and HW2-gated tests (`tests/hw2Install.ts`, mirroring `tests/aeInstall.ts`).
7. **Install and export hook.** The flag-3 passthrough and the gated end-to-end pack test. **→ Pause here so you can run spikes S1, S3 and S4 in game.**
8. **Renderer.** The Load custom button and dialog, and the gating.
9. **HW2 monsters.** A curated subset, checked by the scan; the copier's team, loot, gore and sfx rules; the picker filters.
10. **HW2 World.** Biomes from HW2 tilesets and scatter, and cliffs `hw2:basalt`, `hw2:granite` and `hw2:silt`.
11. **HW2 music.** The FSB5→Ogg extractor, the `MusicCue` union, the rig, the `.sbnk`, and the "Hammerwatch 2" group in MusicPicker.
12. **Bosses.** Run spike S2 (scenario `scripts/*.as`). If it passes, a later plan ports the 14 missing classes and adds HW2 bosses to `BOSS_IDS`/`BOSS_DEFS`. HW2 sfx ported into `hw2/sounds/sounds.sbnk` also comes later.

### Risks to watch
- **Textures:** compiled HW2 textures may not work in AE (S4), and raw PNGs in a `.h1c` may not either (S1). An `assets.bin`-only user has no PNGs to export.
- **Shared class names:** HW2 units can share a class name with AE and still read different parameters. Keep the monster list small and verify each one in game.
- **Macro-built paths** can't be seen statically. The gated "every reference resolves" test plus a boot check guard them.
- **Muted music** might carry into a later `default` floor. If it does, emit an explicit AE mode on the next floor.
- **The Vorbis rebuild** is checked structurally in tests (Ogg pages, three headers, rising granule positions) and by ear in game.

## Verification
- **Gate:** `npm run typecheck && npm test` on every commit. HW2-gated suites skip without `HW2_ROOT`, the same way AE ones skip without the AE install.
- **Determinism:** AE-only parameters give byte-identical output with and without `sources: ['hw2']`. An AE parameters.txt round-trips unchanged.
- **Generated HW2 content:** generate a campaign using every HW2 theme, monster and track, pack it, read it back with `readH1c`, and check that every level path resolves inside the pack or in AE.
- **In the app** (the `run` skill): with no HW2 folder, no HW2 options appear. After Load custom with your HW2 path, they appear. Importing a parameters.txt that uses `hw2_` ids without HW2 loaded shows inline errors and blocks Generate.
- **In game:** the S1–S4 spikes and the boot-checklist items, i.e. walls render and collide, monsters fight, music loops and stops, and the next floor's music is right.
