# Hammerwatch 2 content: what only the game can answer

These four questions decide how HW2 content ships. The facts behind them are in
`hammerwatch-2-assets.md`. Each spike is a small test scenario the app installs once the
copy-and-pack step lands (plan commit 7). Report each result as `CONFIRMED` or
`BROKEN: what happened`, with the relevant lines of `<AE>/HW1A.exe.log`.

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
