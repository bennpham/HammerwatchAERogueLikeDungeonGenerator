# World mode audit

Date: 2026-11-14. Covers PR #15 (pass 1) and PR #16 (plateaus and five biomes), as merged in `src/generator/world/`. The feature plan is [world-mode.md](world-mode.md).

Every item here comes from reading the code. Nothing was run or reproduced, so each is a candidate until a test or a play session confirms it.

Boot checklist #96–#101 are verified in game. #102–#115 are unchecked: monster themes, mystery plates, ambush types, presets, the village, landmarks, free roam, mystery traps, the save plate, and every plateau and new-biome item. About half the feature has not been played yet.

## A. Likely bugs and validation gaps

| # | Problem | Where | Fix |
|---|---|---|---|
| A1 | `safeRadius` is never compared with the island size. A safe radius of 64 on a 96-tile island leaves no room for any site, so all 20 attempts fail and the user gets the generic "Could not generate world N" error. | `validateWorld` in `src/generator/config/validation.ts`; `placeSites` in `world/place.ts` | Add a rule: the safe radius must leave land for the sites (compare it with the smaller of min width and min height, less the margin). Add a test. |
| A2 | `worldSiteCapacity` counts only area. It ignores plateaus, the village's 22-tile reserved disc, the safe radius and a ragged coast, so settings that pass validation can still fail to generate. | `world/options.ts` | Subtract the safe-radius disc, the village disc and the plateau area from the land estimate. Warn rather than refuse when it is close. |
| A3 | Landmark pieces check only `walkable` and `PATH`, not `RESERVED`. A pyramid (radius 6, 12 tiles north of its site) can land on a neighbouring site's clear disc, the village square, a stairway landing or, with a small safe radius, the save plate. The boss statue is placed after the landmarks and doesn't check them either. | `world/landmarks.ts` (`placeLandmarks`), `world/objectives.ts` | Test `grid.free` instead of `walkable && !PATH`, and reserve the statue's footprint before the landmarks are placed. |
| A4 | Monsters can spawn on the wrong level. Pack members (±2 tiles) and ambush ring spots (radius 5) check only `walkable`, so with plateaus a pack or an ambush can straddle a cliff and stand out of reach of the tripwire that sprang it. | `world/encounters.ts` (`springRing`, pack spots, `openGround`) | Require the spot to have the same `HIGH` flag as the centre, and no `CLIFF` cell between them. |
| A5 | Mystery payload spots and trap spewer lines are chosen before the scatter and aren't reserved. A tree can be placed on a loot or monster spawn point, or in a spewer's line of fire. | `world/encounters.ts` (the `emitPayload` callers) | Mark the chosen spots `RESERVED` when they are picked. |
| A6 | A plateau that doesn't fit after 30 tries is left out silently. The user asks for 5 and gets 3 with no word. | `world/plateau.ts` (`placePlateaus`) | Return the count placed and report it in the generation summary or the preview. |
| A7 | `validateWorld` reads `w.monsters.length`, `w.bossPool.length` and `type.monsters` directly. A hand-edited `parameters.txt` or preset that omits one may throw instead of producing a validation error. Whether loading always fills them in was not checked. | `validation.ts` (`validateWorld`), `config/configFile.ts` | Confirm the loader normalises them; if not, guard and report. Add a test with a world missing each array. |
| A8 | There is no cap on the number of worlds. Each is a full level, and a large one costs seconds and hundreds of MB. | `validateWorld`, `src/renderer/components/WorldForm.tsx` | Add a bound and a rule. |

Checked and dropped: the worry that unique bosses could run a world short of bosses. `MOBILE_BOSS_IDS` holds no unique boss (the dragons and the queen are excluded), so the random pick can always fill `bossCount`.

## B. Risks only the game can prove

- **B1. Stairs width.** The grid opens a 2-tile column for each stairway, but the stock `_stairs` walkway is 16 px wide. The flood may call a stairway passable that is tight or blocked in game. Checklist #111.
- **B2. Plateau rims have no fence.** The coast has one; plateaus rely on the pieces' own collision, as stock does. Corners are the likely leak. Checklist #112.
- **B3. Prop collision radii are hand-measured.** Scatter and landmark `solid` values aren't checked against the real unit colliders, so a prop wider than its entry could close a 2-tile path the flood believes is open. An install-backed test, like the closure tests in `tests/world.test.ts`, that reads each unit's collider and compares it with `solid` would guard this.
- **B4. Scale.** Up to 400 packs of 30 monsters are placed outright, plus tens of thousands of scatter units, on a map of up to 4 million tiles. Only 512 has been played. Checklist #115 covers the crystal biome's frame rate only.
- **B5. Reachability is proven for objective sites only.** Loot goes on reached tiles, but mystery plates and packs are placed before the scatter and aren't flood-checked afterwards. Neither blocks finishing, but a plate walled in by trees is a dead object.

## C. Performance and robustness

- **C1. Generation blocks the app.** `src/main/ipc.ts` calls `generateDungeon` synchronously on the Electron main process: about 10 s at 1024 and 45 s at 2048, with the window frozen. A worker thread would keep the UI alive and allow a cancel button.
- **C2. Trails.** `carveTrails` runs a full-grid Dijkstra per site with an array-of-tuples heap and no early exit. Stopping when the target is popped, and a typed-array heap, would cut most of the time on large islands.
- **C3. Preview.** `previewOf` builds two strings of one character per tile with `+=` and sends them over IPC (8 MB at 2048). Downsample above a size, or send a typed array.
- **C4. Retry loop.** All 20 attempts reuse the same width and height, and the failure message doesn't say which step failed (mask, sites or reachability). Naming the step would make A1 and A2 self-explaining.
- **C5. Walk-through clumps mark their tile `SOLID`,** which over-blocks the flood and the preview. It errs on the safe side but can fail a world that is in fact fine.

## D. Design and quality

- **D1. Bosses cluster.** Bosses take sites 0…n−1, which are adjacent sectors, so they sit on one side of the island. Spread them (every k-th sector) or shuffle with the layout stream.
- **D2. `anchorRows` uses `piece.startsWith('s')`,** which also matches `se_i` and `sw_i`. The coast is verified in game, so the result is right; an explicit table per piece would make the intent readable.
- **D3. Plateau tops look like the low ground.** They use the same tiles, so height is hard to read except at the rim. A second ground tile per biome for `HIGH` cells would help.
- **D4. Trails paint across stairways** and stop at cliffs they can't cross. Route trails through stair cells deliberately.
- **D5. Stream seeding.** Streams are `seed + k`, so seed S's world stream equals seed S+6's layout stream. This is the existing pattern for all seven streams and harmless.
- **D6. Tests to add:** a per-site reachability test against real colliders (B3), a plateau level test for A4, and a property test that runs many seeds at the validation bounds and asserts no "could not generate" (A1, A2).

## Suggested order

1. A1, A2, A8 and C4: validation and a clear failure message. Small, and they remove the confusing failures.
2. A3, A4, A5: placement correctness with plateaus and landmarks.
3. Play #102–#115, then fix what B1–B4 turn up.
4. C1–C3 (worker thread, trails, preview), if large islands are meant to be used.
5. D items as polish.

Each A item gets a test in `tests/world.test.ts` or the validation suite and passes the gate. B items are settled by playing and recorded in `docs/BOOT-CHECKLIST.md`.

## Original Hammerwatch

A plan for an HW1 version of World mode is in the remake repo: `HammerwatchRogueLikeDungeonGeneratorRemake/docs/plans/world-mode.md`. This repo stays AE-only.

## Status

Implemented 2026-11-16 on `feature/pr17-audits`, one commit per item, each with a test:

| Item | Done |
|---|---|
| A1, A2, C4 | Safe-radius rule (`worldMaxSafeRadius`); `worldSiteCapacityOf` counts the start's disc (the village's too, also for a random start), and the plateaus that fit; filling the island exactly is a warning; the failure names the step. |
| A3 | Landmarks refuse reserved ground except their own site's disc; every boss site's statue spot is reserved first. |
| A4 | `WorldGrid.sameGround`: pack members and ambush spawns stay on their centre's level. |
| A5 | `emitPayload` returns its spawns and spewer lines; a world reserves them. |
| A6 | The preview reads "3 of 5 plateaus fit". |
| A7 | The loader already filled the lists; validation now reports a missing one instead of throwing. |
| A8 | `MAX_WORLDS` (20) in validation, the loader and the form. |
| B3 | Install-backed test of every prop's radius against its collider; the fir, the desert's minor stone and the pyramid were too small and are fixed. |
| C1 | Generation runs in a worker thread; Generate turns into Cancel. |
| C2 | The trail search stops at the last site, on a typed-array heap: byte-identical output. |
| C3 | The preview is built in one pass and shrunk above 512 tiles for the window only. |
| C5 | The real over-block was the village's walk-through props, not the clumps; fixed. |
| D1 | Bosses take every (n/b)-th site. |
| D2 | An explicit anchor table: byte-identical output. |
| D3 | Each biome has a `highGround` for plateau tops (boot checklist #116). |
| D4 | Trails keep the stairs as their corridor but paint no trail on them. |
| D6 | Edge-of-validation runs on six seeds each; the plateau pack test. |

Not done: D5 (harmless, as noted). B1, B2 and B4 need play: #111, #112 and #117. B5 is unchanged: plates and packs still aren't flood-checked after the scatter, though A5 now keeps the scatter off a plate's payload.
