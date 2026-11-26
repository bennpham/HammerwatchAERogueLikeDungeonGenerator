# Hammerwatch 2 content: what only the game can answer

These four questions decide how HW2 content ships. The facts behind them are in
`hammerwatch-2-assets.md`. Each spike is a small test scenario the app installs once the
copy-and-pack step lands (plan commit 7). Report each result as `CONFIRMED` or
`BROKEN: what happened`, with the relevant lines of `<AE>/HW1A.exe.log`.

## Ready to play (installed 2026-11-26)

`node scripts/run-ts.mjs scripts/dev/hw2-spikes.ts` built these four scenarios with the app's
own generate, copy, pack and install path, and installed them into `<AE>/scenarios/`.
`--remove` deletes them again.

| Scenario | Spikes | What's in it |
|---|---|---|
| `dungeon_11260001` | S1, S3 | Floors 1–3 are HW2 Crypt, Sewers and Wolf caves, with HW2 monsters: brute trolls and ticks; rotten footmen, crabs and rotten sentries; black bats, horde crawlers and asps. Floor 1 plays HW2's Crypt track, floor 2 is left on default music (AE's should come back), and floor 3 plays HW2's dark caves track. The first lobby plays HW2's town track, and the arena is HW2 Obsidian Spire with HW2's boss track. Textures are plain PNG/TIF from the unpacked extract. |
| `dungeon_11260002` | S1, S3 | Right after the first lobby, a World island in HW2 Highlands, with HW2 trolls, crabs and ticks and HW2's highlands track. |
| `dungeon_11260003` | S4 | `dungeon_11260001`'s parameters on another seed, but every HW2 texture (53 of its 335 HW2 files) packed exactly as compiled in HW2's `res/assets.bin`. |
| `dungeon_11260004` | S2 | A stock campaign whose first floor has three of HW2's grey wolves in place of three stock monsters. The scenario ships HW2's own `scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as`, which AE doesn't have, so the wolves can only dash if AE compiles a scenario's scripts. |

Things to watch in `<AE>/HW1A.exe.log` for each:
- lines naming `hw2/` (a texture, include or unit that didn't load);
- lines naming `.sbnk` or `.ogg`;
- for `dungeon_11260004`, any script compile error naming `DashStrike`.

HW2 monsters are expected to be quiet: their HW2 sound events are blanked.

Every scenario starts with the Players tab's Hammerwatch 2 **Endgame (level 50)** preset, fully
upgraded, since HW2's monsters hit much harder than AE's.

### First play (2026-11-26)

`dungeon_11260001` loaded and its HW2 music played (S3, in part). Three ERROR boxes came from
`hw2/effects/particles/particles_smoke.unit`: a material only HW2's `system/default.mats` has
(`particle-storm`), and two effects named with arguments (`smoke_4.effect?scale=0.3`) that the
copier didn't read as paths. Both are fixed and the scenarios reinstalled. A new check in the
HW2 copy tests looks for both kinds in every theme, biome and monster copy; it found the same
problems in the rotten templar, the eye of confusion and the fire and ice particles.

On the next play, floor 1's brute trolls showed only their shadow and elite ring. HW2 draws them
from `.tif` sheets whose raw copy has 10 channels a pixel, which AE can't draw; the copy now
uses the `.png` of the same sheet beside each one. With that, floor 1's trolls and ticks draw
correctly, and the brutes throw their axes. Floors 2–3 and the other scenarios are still to play.

### Second play (2026-11-26)

- **S2 answered, in part:** AE compiles a scenario's scripts together with its own (790 files,
  `DashStrike.as` among them). But HW2's `DashStrike.as` calls `easeSineOut`, which only HW2's
  `Utils/Functions.as` defines, and one compile error stops every script: no doors, pickups or
  monsters, and the party stuck in the lobby. `dungeon_11260004` now also ships
  `scripts/Hw2Compat.as` with that helper. Still to see: does it compile now, and do the wolves
  dash?
- **Monsters standing still:** HW2 writes movement speed as a range; AE wants one number
  ("'speed' needs to be float"). The copy now uses the middle of the range.
- **Errors fixed:** the blight ice crystal model's texture (`.fbx` files name textures beside
  them), and the grey wolf's sheet (HW2's compiled `.tif` is a format AE refuses; the copy bakes a
  `.png` from the unpacked sheet and the wolf's colours instead).
- `dungeon_11260003` (S4) loads; floor 2 of `dungeon_11260001` plays through.

## S1: files under a top-level `hw2/` folder

**Setup:** one floor themed with an HW2 wall set (`hw2/doodads/walls/crypt/…`), an HW2 floor
tileset (`hw2/tilesets/crypt_default.tileset`), and a few sprite-only HW2 doodads. All are packed
in the `.h1c` with their textures as plain PNGs (flag 1), from the unpacked folder.

**Check:**
- the walls render with no missing-texture squares;
- the walls block the player;
- the floor shows the crypt tiles;
- the log has no "could not load" lines for `hw2/…`.

**If broken:** try the prefix inside an existing root (`doodads/hw2/…`) before anything else.

## S2: a scenario adding script classes

**Setup:** a test scenario that ships `scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as`
(HW2's, unchanged), plus one HW2 unit whose skills use `DashStrike` and nothing else AE lacks.

**Check:**
- the scenario starts and the log shows no script compile error;
- the unit dashes at the player.

**Why it matters:** every HW2 boss needs classes like this. If scenarios can't add classes, HW2
bosses can't come over as they are. A hint that they can: the community pack
`starcraft_campaign.h1c` ships `scripts/GUI/Shop/PowerShopMenuContent.as`, though that one
overrides an existing file rather than adding a new class.

## S3: `.sbnk` and `.ogg` inside a `.h1c`

**Setup:** a floor whose music is an HW2 track. The level gets a `PlayMusic` with no value plus
a looping `PlaySound` on `hw2/music/music.sbnk:<track>`, and the `.sbnk` and `.ogg` are packed
raw (flag 1).

**Check:**
- the HW2 track plays and loops, and the stock music is silent;
- on the next floor, a floor left on default music plays AE's music again rather than staying
  silent;
- leaving the level stops the loop.

**If it only works unpacked:** HW2 audio scenarios install as a folder.

## S4: compiled textures from HW2's `assets.bin`

**Setup:** the same floor as S1, but with its textures taken from `<HW2>/res/assets.bin`
(already compiled, flag 3) and passed through into the `.h1c` without recompiling.

**Check:**
- the art looks the same as in S1.

**If broken:** players without an `unpacked_assets_*` extract can't use HW2 art until the app
can decode those textures.
