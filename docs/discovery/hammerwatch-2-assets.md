# Hammerwatch 2 assets: what's there and what AE can use

**Request (2026-11-25):** a blue **Load custom** button (on the `experimental` branch only, not 1.0)
where a player points the app at their Hammerwatch 2 install. Loaded, the Dungeon, Arena and
World tabs gain HW2 themes, tilesets, doodads, monsters, bosses and music. Not loaded, none of it
shows. The install copies the HW2 files a scenario uses into its `.h1c`, the way the custom AE
scenario `scenarios/mistdeep` ships its own `actors/`, `doodads/`, `sounds/` and `music/`.

The plan is `docs/plans/hammerwatch-2-content.md`. The in-game checks this can't settle are in
`hammerwatch-2-spikes.md`.

Read from `<HW2>/unpacked_assets_137` (a dev-machine extract, like AE's `unpacked_assets_66`)
and `<HW2>/res/`, against AE's `unpacked_assets_66`. The probes were throwaway Node scripts.
Tags: `[VERIFIED]` was checked in the files, `[UNVERIFIED]` needs the game.

## Same engine family as AE `[VERIFIED]`

- `.unit` XML with the same `%include / %define / %replace / %block` preprocessor, and the same
  `.tileset`, `.effect`, `.env`, `.pfb` and SVAL `.lvl` XML (both `.lvl`s open with
  `<dict><dict name="game-mode">…<int name="version">1`).
- `res/assets.bin` has AE's layout with magic `HW2R` for `HW1R`: u8 3, u32 hash, u32 0, u32
  count, then entries starting `actors/…`. `readHw1rIndex` (`src/main/h1c/read.ts`) should read
  it once the magic is a parameter.
- AE already defines the main actor classes: `StateActorBehavior`, `CompositeActorBehavior`,
  `CompositeActorSkill`. AE's scripts declare 973 classes and HW2's 1,195.
- Music is chosen the same way in both: `PlayMusic` sets FMOD `parameter:/MusicMode` to an int,
  but each game's int selects music inside its own `res/assets/sound/music.bank`.

## What's there

| Folder | HW2 files | Notes |
|---|---|---|
| actors | 2,196 (772 `.unit`) | beasts (trolls, wolves, spiders, wasps, beetles, boars, maggots, shamblers, bats, crabs, snakes, ticks), humans (empire, pirates, thieves, cult, kingdom), undead (archons, horde, rotten, ghost), aberrations, critters, misc (ballista, cannon, haunted armor/gargoyle, slime, hellcube, oblivion crystal, crypt tower…), 9 bosses, many NPCs |
| doodads | 4,353 (3,261 `.unit`) | 3,159 units are sprite/collision only, with no script behavior. Wall sets in `doodads/walls/`: cave_dark, cave_light, corrupted, crypt, earth, hedge_corrupt, hedge_rough, hedge_trimmed, jade, obsidian, prison, pyramid_inside, ruins, ruins_corrupt, sewer, stone_1…7, throne_room. Cliffs: basalt, granite, silt. Ledges for most wall sets |
| tilesets | 244 `.tileset`, flat in `tilesets/` | crypt_*, sewer_*, obsidian_*, pyramid_inside_*, prison_*, grass_1…4, mud_1…7, desert_*, beach_*, snow, moss, marble_1…3, wood_*, web_*, water_clear, water_corrupt… |
| effects/env | 31 `.env` | crypt_boss, prison, sewers, spidercave, thievestower, wolfcave, obsidian_spire, grotto, outside, and _day/_evening/_morning/_night with rain and snow variants |
| prefabs | 2,296 `.pfb` | 2,021 are level pieces (`__levels`), the rest houses, traps, enemies, loot… |
| levels | 11 `.lvl` | `boss_repeat/` arenas for all 9 bosses |
| res/assets/sound | FMOD banks | `music.bank` 194 MB, `sfx.bank` 179 MB, `ambience.bank` 27 MB |

## Findings

1. **Paths collide, so HW2 files ship under `hw2/`.** These are the files whose path exists in
   both games, and how many of them differ in content:

   | Folder | HW2 files | Same path in AE | Content differs |
   |---|---|---|---|
   | doodads | 4,353 | 2,146 | 624 |
   | tilesets | 354 | 296 | 181 |
   | scripts | 839 | 635 | 338 |
   | effects | 613 | 152 | 65 |
   | gui | 161 | 72 | 59 |
   | prefabs | 2,296 | 58 | 40 |
   | players | 593 | 82 | 33 |
   | system | 1,399 | 1,397 | 5 |

   A file a scenario ships at a stock path replaces the stock file for that scenario, so HW2 files
   at their own paths would change AE's own walls and tilesets. Each copied file therefore moves
   under `hw2/`, and every absolute reference inside it is rewritten to match. Relative
   references (`./base.png` in the shared wall `.inc`s) resolve against the including unit's
   folder and are left alone. A file keeps its AE path only when it and everything it references
   are byte-identical to AE's. `system/` stays AE's. Whether the engine accepts a top-level
   `hw2/` folder is `[UNVERIFIED]` (spike S1).
2. **HW2 wall sets fit `aeWalls.ts` as they are.** Every HW2 set uses the new-style pieces
   (`h_32`, `v_32`, `h_16`, `v_16`, `cap_h_e/w`, `cap_v_n/s`, `crn_*`, `x_*`, `__color_N`), which
   the emitter already handles for AE's stone_1 and stone_5. A piece is a two-line unit, e.g.
   `crypt/h_32.unit` is `%define SKOSKO` + `%include "doodads/walls/h_32.inc"`. HW2 sets have
   `_exit_n/e/s/w` but no `exit_up` / `exit_dn`, so HW2 themes borrow AE stair art and doors at
   first.
3. **About 190 HW2 enemies only use script classes AE has.** Counted per unit over its whole
   `%include` chain:

   | Group | Units using only AE's classes |
   |---|---|
   | critters | 12 of 12 |
   | misc | 53 of 70 |
   | beasts | 36 of 98 |
   | undead | 31 of 58 |
   | humans | 28 of 76 |
   | aberrations | 5 of 9 |
   | arena | 6 of 19 |

   The rest use the classes in finding 4. HW2 units also declare a `team` (`trolls`, from HW2's
   `tweak/actor_teams.sval`; AE has no teams file and its monsters mostly omit the key), and
   name HW2 `loot` and `gore` tables. The copier strips all three. `[UNVERIFIED]` where HW2 and AE
   share a class name, the parameters it reads may still differ.
4. **No HW2 boss is drop-in.** Every boss's main unit needs at least one class AE doesn't define.
   There are 14 such classes in 12 files, about 2,700 lines:
   - CompositeActorUtilitySkill, DashStrike, ChannelingSpewSkill,
     CompositeActorDamagedPeriodTriggeredSkill, ResistBuffSkill;
   - ChainAction, ChainActionHitscanLink, ChainActionAreaCircleLink;
   - ClearAggro, ClearPointOfInterestOccupants;
   - EnemyOwnedActor, EnemyOwnedStateActor, SteeringMovement, GivePercentageStamina.

   The bosses are Archibald Steelwill, Barrington, Commodore Sinkage, Shock Widow, Dace Arden,
   Malgar, Judge Supreme, Doombringer and Blight. There's one hint that scenario scripts work: the
   community pack `scenarios/starcraft_campaign.h1c` ships
   `scripts/GUI/Shop/PowerShopMenuContent.as`, overriding a stock script. Whether a scenario can
   add *new* classes is spike S2.
5. **HW2 sounds mostly aren't in AE.** HW2 units name FMOD events (`event:/sfx/…`). Of the 590
   that HW2 actors reference, 75 are also referenced somewhere in AE's assets, and for bosses 13
   of 202. The rest would be missing, so those monsters would be silent (or log errors,
   `[UNVERIFIED]`) unless their sounds are ported.
6. **Music can be ported the mistdeep way.**
   - **The pattern:** mistdeep (`<AE>/scenarios/mistdeep`, an unpacked scenario folder) ships
     `music/music.sbnk`:
     ```xml
     <soundbank>
       <sound category="music" name="swamp" volume="1" is3d="false" looping="true">
         <source res="./MoM_Swamp.ogg" />
       </sound>
     </soundbank>
     ```
     Its level mutes the stock music with a `PlayMusic` that has no `Music` value, then runs a
     `PlaySound` with `Sound` `music/music.sbnk:swamp` and `Looping` true. Its units name sounds
     the same way, e.g. `sounds/sounds.sbnk:wasp_hurt`.
   - **HW2's music.bank:** one FSB5 block of 54 named Vorbis samples, unencrypted, all stereo at
     48 kHz, with one Vorbis setup header (CRC `a4f666fc`). The tracks include Music_Crypt_120bpm,
     Music_Prison_135bpm, Music_Sewers_130bpm, Music_SpiderCave_105bpm,
     Music_BossTheme_115bpm_ts44, Music_ObsidianSpire_120bpm, Music_ThievesTower_bpm130,
     Music_SwampTheme_125bpm, Music_DesertTheme_125bpm, Music_SnowTheme_125bpm,
     Music_CorruptedMaze_110bpm, Music_CastleSuperbia_Dungeon_Normal_120bpm, Music_Caves_Dark_135bpm,
     Music_Highlands_Day_95bpm and Hammerwatch_Main_Theme_Demolite_Version.
   - **HW2's sfx.bank:** 5,900 named samples with two setup headers: `c55efa16` (5,855 mono
     samples) and `a4f666fc` (45 stereo).
   - **What converting takes:** FSB5 Vorbis to `.ogg` only means rebuilding the Vorbis
     identification, comment and setup headers and paging the packets. The two setup headers are
     FMOD's standard encoder setups, in vgmstream's table (ISC licence).
7. **Tilesets** start with `%include "tilesets/layers.inc"` and use a layer constant
   (`layer="CRYPT_DEFAULT"`) and `material="system/default.mats:floor"`. HW2's `layers.inc`
   ships under `hw2/` with them. HW2 themes use HW2 floors only, because HW2 layer values aren't
   ordered against AE's. Blending at the edges is `[UNVERIFIED]`.
8. **Packing.** AE's stock survival pack ships about 750 `actors/` files of its own (units,
   `.inc`, `.png`, `.sval`, `.effect`), so custom units and sprites inside a `.h1c` are normal
   `[VERIFIED]`. Two things are `[UNVERIFIED]`: textures read from HW2's `assets.bin` come out
   compiled (flag 3), and `.ogg` / `.sbnk` haven't been seen inside a `.h1c`, only in mistdeep's
   folder (spikes S3, S4).
