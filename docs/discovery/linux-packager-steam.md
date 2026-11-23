# Linux: PACKAGER.exe needs Steam

> **Resolved (2026-11-23).** The app writes `.h1c` files itself (`src/main/h1c/write.ts`), on
> every OS, and reads the stock files it patches from the game's `res/assets.bin`. The wine and
> Proton route is gone. PACKAGER also fails on Windows from a sandboxed shell, with "Steam must
> be running … SteamAPI_Init() failed". Still open, in game: boot checklist #132 (Windows),
> #133 (the friend on Linux) and #134. The details are in the DISCOVERY-LOG entry "PACKAGER
> needs Steam; the app writes .h1c itself". The prompt below is what started this work.

## What was seen (2026-11-22)

A friend on Linux (**Bazzite**, the immutable Fedora gaming distro: no system wine, UMU-Proton present) tried PR #21 (branch `linux-install-proton`) from the AppImage. Steam is a
**Flatpak**, and it was running. The AE folder was `/run/media/…/SteamLibrary/steamapps/common/Hammerwatch Anniversary Edition`.

1. A dialog came up: "Steam is required to run Packager.exe".
2. After the dialog was closed, the app reported:

   > Installed dungeon_74303585 unpacked as scenarios/dungeon_74303585/ (packing with
   > UMU-Proton-11.0-2e-x86_64 wine failed: PACKAGER ran but dungeon_74303585.h1c was not
   > produced). … Note: the power shop still offers an extra life (no unpacked_assets_* folder
   > in the AE install to patch); the player settings were not applied: no unpacked_assets_*
   > folder in the AE install. [ERR] [22:08:02] Failed to initialize Steam!

## What it means

- `[VERIFIED]` (PACKAGER's own log line) `PACKAGER.exe` initialises Steamworks and stops
  without a Steam client it can reach. Our wine runs (system wine, or Proton's wine with a
  private prefix) have no Steam bridge: Proton's `lsteamclient` is set up only by Proton's
  own launch script, inside Steam. A Flatpak Steam is also sandboxed. So **no wine route
  outside Steam can pack**. The wine and Proton lookup in `src/main/wine.ts` only adds the
  dialog before the unpacked fallback.
- `[VERIFIED]` The unpacked fallback ran: `scenarios/<id>/` was written, and the app said why
  it didn't pack.
- Found by the way: `findWine` picked **UMU-Proton** from `compatibilitytools.d`, so the
  lookup works. It just can't help.
- Separate issue: the friend's install has **no `unpacked_assets_*` folder**, so the power
  shop patch (no extra life with 0 lives) and every Players-tab override are skipped. Is
  `unpacked_assets_66` something AE makes, or something the user extracted? Players need a
  way to get it, or the patches need another source (for example, read from the game's
  packed assets).

## Still to find out (ask the friend)

1. Is **Dungeon #74303585** in AE's scenario list, and does floor 1 play to the exit? That's
   boot checklist #133. Send `HW1A.exe.log` if it doesn't load.
2. Does the dialog block the app until it's closed? (The install waited for it.)

## Prompt to send later (from a Windows session with the AE install)

Copy everything in the block into a new Claude Code session in this repo.

```text
Read docs/discovery/linux-packager-steam.md first. On Linux, PACKAGER.exe fails with
"[ERR] Failed to initialize Steam!" because it needs Steamworks, so no wine/Proton route can
pack. Drop that route and write .h1c packs ourselves. The format is already read by
scripts/lib/h1c.ts (layout in its header comment and the DISCOVERY-LOG entry "Reading .h1c
packs").

1. Probe (Windows, needs the AE install). Write scripts/dev/probe-h1c-hash.ts:
   - Pack 2-3 tiny controlled scenarios with the real PACKAGER: a 1-floor level; the same
     with one byte changed; a different info.xml.
   - Read them and the stock packs with scripts/lib/h1c.ts.
   - Find what the header u32 hash and each .lvl's 8-byte hash cover, and which algorithm
     makes them. Try CRC32, FNV-1a 32/64, xxHash32/64 and Murmur3 over the raw text, the
     binary SVAL, the paths and the file table.
   - Record each file's flag (1 or 3), whether files are LZ4-packed or stored raw, and
     whether logos.png and info.xml are also in the file list.
   - Log the findings in DISCOVERY-LOG.md with [VERIFIED]/[UNVERIFIED] tags.
2. Writer. Add src/main/h1cWriter.ts, the inverse of scripts/lib/h1c.ts:
   - a text SVAL to binary SVAL encoder (reuse parseSval in src/generator/ae/sval.ts;
     compact forms are optional unless the game needs them);
   - the .lvl compile (8-byte hash + binary SVAL);
   - files stored raw (packed size 0) unless LZ4 is needed;
   - the header hash.
   If a hash can't be cracked, first test in game whether AE accepts zeroed hashes.
3. Install. On non-Windows, write the .h1c with the writer and never spawn wine. Keep the
   unpacked fallback for writer errors. Remove src/main/wine.ts and its README and
   discovery-log text, or keep HWAE_WINE only as an opt-in. Update PR #21 or open a new PR.
4. Tests:
   - Round trip: writer, then reader, gives back the same tree for generated levels.
   - With AE present, our pack of a generated scenario matches PACKAGER's byte for byte,
     or at least in every field the game checks.
5. Boot checklist: a natively packed .h1c lists and plays on Windows, and on Linux (the
   friend).
6. Separately: the friend's install has no unpacked_assets_* folder, so the power shop and
   Players-tab patches are skipped. Find out where unpacked_assets_66 comes from, and
   propose how a player without it gets those patches.

Gate: npm run typecheck && npm test, plus HWAE_PACK=1 npm test -- tests/packer.test.ts on
Windows. Commit in small, gated steps.
```
