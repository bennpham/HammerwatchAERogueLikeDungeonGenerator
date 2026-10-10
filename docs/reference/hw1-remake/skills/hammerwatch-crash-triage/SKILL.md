---
name: hammerwatch-crash-triage
description: "Triage playbook for the Hammerwatch dungeon generator when something breaks — app crashes, Electron main/renderer stack traces, hangs, 'Could not generate level N' failures, LevelPacker or install errors, and parameter combinations that produce them. Load this when a log file, stack trace, error message or crash report arrives, when a user says the app froze, crashed, or refuses to generate, or when deciding whether a failure is a missing validation rule versus a real generator bug. Includes the full parameter-constraint matrix and where the app's logs and settings live on each platform."
---

# Crash & quick-fix triage

You are the cheap first responder. Your job: **classify fast, fix only what is
genuinely small, and escalate everything else with a clean writeup.** Do not
attempt algorithm surgery, RNG changes, or refactors — those go back to the
orchestrator.

## Step 1 — classify

| Symptom | Almost always | Go to |
| --- | --- | --- |
| `Could not generate level N after 60 attempts` | Parameters are geometrically impossible but passed validation | §A |
| App freezes, never returns from Generate | Unbounded loop (should not exist — real bug) | §B |
| `TypeError: Cannot read properties of undefined` in generator | Short `themes` / `levelMonsters` array, or an unknown monster id reaching the roster lookup | §A |
| `RangeError: Invalid array length` / OOM | `mapWidth`/`mapHeight` absurdly large — `Tile[]` is `w*h` | §A |
| `LevelPacker failed` / `.hwm was not produced` | Environment, not code | §C |
| Campaign packs but doesn't appear in game | Wrong destination folder or a bad asset path | §C |
| Campaign loads but a class/difficulty is broken in game | Player tweak values, not level generation | §E |
| Renderer blank / React error | UI bug | §D |
| Floor looks open in the preview but the exit can't be reached in game | The three-tile wall overhang — `reachability.ts` should have re-rolled that floor. A **real bug**, not a validation gap | §B |
| Arena walled off by dead towers / boss unreachable | A blocking-wreck monster on a scatter mode, or cover pruning | §F |
| "The whole floor damages us after a few minutes" / "a floor heals us" | Timer mode is on for that floor (`timerN` / the Dungeon tab's *Timer mode*). Negative damage heals — both are the feature, not a bug | §A |
| "The boss can't be hurt for half a minute" | An invulnerability window at 75/50/25% health. `boss<i>Invuln=0,0,0` disables all three | §F |
| "The whole floor is slowed / the monsters are enraged" | A buff aura on that floor (`buffN`), or an arena-wide tier buff (`boss<i>WaveBuffN`) | §A |
| "We got another floor *after* the boss and it killed us" | The escape floor. All three presets ship it, with `timer<N>` on — 90 s, then 1 health per 100 ms. Working as designed | §A |
| "The campaign runs the floors in the wrong order" / "the boss came too early" | `levelOrder`. Absent means the historical order; a stored one is validated, see §A | §A |
| "The last arena sends us onward instead of ending the run" | Only the **last** campaign slot carries the orb and `GameEnd`; an earlier arena emits `BossPortal` (`objects/objectSet.ts`) | §F |
| "The health drop at 50% never appeared" | Wave pickups land on the drop pad by the arena entrance (`boss/wavePickups.ts`), not where the tier spawns | §F |
| `Generate a dungeon first.` on export | User flow, not a bug | — |

## §A — Parameter-constraint failures (most common)

**The fix is almost always a validation rule, not a generator change.** If a
parameter set reaches the generator and breaks it, `validation.ts` failed to
catch it. Add the rule + a case in `tests/validation.test.ts`, with a message
that tells the user what to change.

Constraints enforced today (`src/generator/config/validation.ts`):

| Rule | Why |
| --- | --- |
| `levels` ≥ 1, integer | — |
| `minRoomSize`, `maxRoomSize` ≥ 3 | |
| `minPassageWidth`, `maxPassageWidth` ≥ 1 | |
| `minRoomCount`, `maxRoomCount` ≥ 2 | a level needs an entrance and an exit room |
| `mapWidth`, `mapHeight` ≥ 20 | one tilemap block |
| `edgePadding`, `roomPadding` ≥ 0 | |
| `min* ≤ max*` for size, passage width, room count | |
| `maxRoomSize + 2*edgePadding ≤ mapWidth` | rooms must fit horizontally |
| `maxRoomSize + 2 + 2*edgePadding ≤ mapHeight` | heights roll to `size+2` |
| **`maxPassageWidth ≤ minRoomSize`** | wider corridors put doors outside the room — crashed the original |
| **`maxRoomSize ≥ 7`** | the stair prefab is 6 tiles wide |
| `themes.length ≥ levels`, each an id in `THEME_DEFS` | short list → index out of bounds. Valid ids are the bases `a`–`i` and `bonus1`–`bonus5`, each base's overlay pairings (`c_tiles`, `d_carpet`, …) and its `_mixed` palette — the stock campaign is `a_mixed`…`g_mixed`. Never hard-code the list; read `config/themes.ts` |
| `levelMonsters.length ≥ levels`, none empty, all ids known | short/empty pool → index out of bounds |
| prep `startingGold` (`boss.fights.<i>.prep.startingGold`) / lobby `startingGold`: whole ≥ 0, multiple of 500, ≤ `GOLD_SAFETY_MAX` | one diamond per 500. The old 12000/42000 caps are **gone**; `GOLD_SAFETY_MAX` (5,000,000) only stops a typo emitting millions of item nodes |
| lobby/prep `shopCategories` all real columns | see `ALL_LOBBY_CATEGORIES`. Prep-room field keys are scoped per fight: `boss.fights.<i>.prep.shopCategories` |
| lobby/prep `upgrades[kind]` (prep: `boss.fights.<i>.prep.upgrades`): whole ≥ 0, ≤ `UPGRADE_COUNT_MAX` (10000) | free upgrade pickups; **not** a game limit, just the point past which the stack is too large to emit. 0 (the default for every kind) emits no item array |
| enabled `levelTimers[i]`: `seconds` whole 1…`MAX_TIMER_SECONDS` (3600), `freqMs` whole `MIN_TIMER_FREQ_MS`…`MAX_TIMER_FREQ_MS` (50…600000), `damage` whole, `|damage| ≤ MAX_TIMER_DAMAGE` (10000) | negative damage is **legal** — it heals. A disabled floor timer is never checked |
| every `levelBuffs[i][j]`: `buff` in `BUFF_DEFS`, `target` in `BUFF_TARGETS` | unknown ids are an error here; the rig itself skips them, so validation is the only gate |
| every `waves[i].buffs[j]`: same two rules | the arena tiers, same registry |
| every `waves[i].pickups[j]`: `item` in `PICKUP_DEFS`, `count` whole `1..MAX_PICKUP_COUNT` (64) | each copy is its own `SpawnObject` node, so the count is a node count (`objects/pickupTypes.ts`, `boss/wavePickups.ts`) |
| mystery buttons (issue #67): `mysteryButtons` has no size rule (the importer reports a button index or count ≥ `MYSTERY_PARSE_LIMIT` = 10000 as unknown instead of padding the pool to it); each loot `item` in `MYSTERY_LOOT_DEFS` with count `1..64`, each monster an arena key (`isKnownMonsterKey`) with count `1..100`, each trap row the floor-trap rules with count `1..MAX_TRAP_COUNT`, `trapSeconds` whole `0..3600`, `name` ≤ 40 / `text` ≤ 120 with no `= < > &` or line break. `levelMystery[i].count` whole `0..200`; count > 0 needs a pick, and every pick must index the pool | the text rules are crash rules: the XML writer does not escape, and `=` makes `parseParametersTxt` drop the line silently. Too many plates for a floor is only a warning — the rig places what fits (`mysteryCapacity`) |
| `boss.fights.<i>.arena.invulnerability.seconds`: exactly `BOSS_INVULN_COUNT` whole values ≥ 0 | one per `BOSS_INVULN_THRESHOLDS` (75/50/25%); 0 disables that one threshold |
| `boss.fights` non-empty when `boss.enabled` | a campaign with the boss on must have something to fight. **No upper bound** — `levels` has none either |
| `levelOrder`, when present: every entry a `floor` or `boss` slot; every index inside `levels` / `fights.length`; no slot twice; floors ascending among themselves and fights among themselves; every floor and every fight placed | five separate errors in `validateLevelOrder`. **Absent is always valid** — it means the default order. `campaign.normalizeOrder` repairs all five on import, so a stale `parameters.txt` is never fatal; the form edits the stored value directly, so a broken order there must still report |
| the whole boss block | see §F |
| chances in `[0,1]`; multipliers ≥ 0 | |
| every `monsterMax` an integer ≥ 0 | |
| every `playerTweaks` value finite | see §E |
| upgrade costs: whole number ≥ 0 | |
| `int`-typed tweak params: whole number | |
| `max-health` / `max-mana` ≥ 1 | |
| difficulty multipliers ≥ 0 | |

Warnings (non-blocking): room-area-vs-map capacity heuristic; map dimensions
not multiples of 20; a theme's own `cosmeticWarning` (theme `h` for the arena);
`max-health` above 10000; lobby/prep columns left with nothing to sell; an
empty *health* wave tier; a scattered monster's ignored interval; an arena
scattering ≥ `BOSS_SCATTER_WARN` (2000) spawns; a floor timer with 0 damage; a
countdown longer than `TIMER_COUNTDOWN_NODE_WARN` (200s — one announce node per
second); timer or buff entries past `levels`; the same buff twice on one floor
or tier; a **per-floor** `BUFF_HELPFUL_IDS` buff (`bloodlust`, `banner_bloodlust`,
`test`) aimed at anything but `players`; a monster-targeted buff on the
boss-death tier, which spawns none; every invulnerability window at 0 with the
feature still on; two fights whose one-entry `bossPool` pins the same boss; the
same pickup item on two rows of one tier; a tier wanting more scatter points
than the smallest arena it can roll has free floor for.

There is deliberately **no** helpful-buff warning on the arena's five tiers.
Strengthening the horde there is the feature — the stock boss-death tier ships
`bloodlust:monsters` — so the rule fires for `levelBuffs` only. A report that
"the arena buff warning disappeared" is that change, not a regression.

**Known gaps — likely causes of a §A report.** Confirm before "fixing":

- No upper bound on `mapWidth`/`mapHeight`. A 100000×100000 map allocates
  10^10 `Tile` objects and dies. A sane cap (or a warning + a documented
  ceiling) is a legitimate quick fix.
- No upper bound on `levels`, `maxRoomCount`, or `monsterMax`. Huge values are
  slow rather than wrong, but can look like a hang.
- The capacity heuristic is a *warning*, so a parameter set that provably
  cannot place `maxRoomCount` rooms still reaches the generator and burns all
  60 attempts. If a report shows this, the fix is to tighten the heuristic into
  an error for the clearly-impossible case — not to raise `MAX_LEVEL_ATTEMPTS`.
- Monster pools referencing types whose `monsterMax` is 0 produce empty lairs,
  not an error. That's a UX complaint, not a crash.

**Reproduce before you fix.** Every §A report should become a failing test
first:

```ts
// tests/validation.test.ts
const p = { ...plainParameters(), maxPassageWidth: 12, minRoomSize: 6 }
expect(validateParameters(p).valid).toBe(false)
```

Build on `plainParameters()` from `tests/params.ts`, not on
`defaultParameters()`. The stock defaults now carry a **non-default**
`levelOrder` (the escape floor), so spreading them and changing `levels` or the
fight count leaves the order naming a slot that no longer exists — a spurious
`levelOrder` error on top of the one you meant to provoke.

For generation failures, `generateDungeon(params, FIXED_SEED)` in
`tests/generation.test.ts` reproduces deterministically — always ask for the
**seed** along with the parameters; without it a report may be unreproducible.

## §B — Hangs

The generator has no unbounded loops by design: `MAX_LEVEL_ATTEMPTS = 60`
(`generator/index.ts`), 1000 attempts for room placement and passage
connection, 2000 for special-room assignment (`map/level.ts`). If the app
really hangs, either a new loop was added without a bound (find it, bound it)
or the work is merely enormous (see the missing upper bounds in §A).

A hang is never fixed by raising a bound. Fix the input validation or the
loop's exit condition.

**A floor that generates but cannot be walked is a §B-class bug, not a hang.**
`map/reachability.ts` flood-fills the finished grid with the wall overhang
modelled (`OVERHANG_ROWS = 2`: the two rows under any wall mass are dead space,
because the lettered wall art is three tiles tall) and rejects a floor unless
the entrance reaches the exit/orb/portal and every key; the 60-attempt loop
then re-rolls it. ~6% of first rolls are discarded this way. So a report of
"the tilemap looks open but I can't get through" means the check missed a case
— reproduce with the seed, extend the check, and never relax it or model fewer
rows to make a floor pass.

## §C — Packer / install failures

`src/main/packer.ts`. Each failure is already reported distinctly — read the
message before investigating:

| Message | Meaning | Fix |
| --- | --- | --- |
| `Set your Hammerwatch install folder first.` | empty setting | user action |
| `Hammerwatch folder not found: …` | bad path | user action |
| `LevelPacker.exe not found at …` | not an editor-equipped install | user action / Export folder |
| `LevelPacker failed: …` | packer non-zero exit or 120 s timeout | on Linux/macOS usually missing `wine`; the unpacked folder is left in place for manual packing |
| `…ran but <name>.hwm was not produced` | packer succeeded but emitted nothing | usually malformed level XML — open the folder in the game's editor |

The pack can also succeed and still kill the game at Start:

```
Resource error: : Could not find file: <hw>/assets/levels.xml
Unhandled Exception: System.NullReferenceException
  at ARPGGame.LevelList..ctor (…)
```

`assets/` does not exist in an installed game, so that path is always the
failed fallback: the pack's own `levels.xml` key is wrong. Cause is the packer
invocation, not the campaign XML — LevelPacker must be run with `cwd =
<HW>/editor` and the bare campaign name, never an absolute folder path
(2026-07-29 DISCOVERY-LOG entry). Confirm by dumping the pack's resource keys;
the `HWRP` layout is in the modding skill.

Environment issues are not code bugs. Say so, name the user action, stop.

## §D — Renderer / UI

`src/renderer/`. State lives in `App.tsx`; validation errors render inline via
`ParameterForm` + `fields.tsx`. The preview canvas (`LevelPreview.tsx`) draws
from the `walls` bitmap string and room/passage geometry — an exception there
usually means a preview field is missing for a newly added room type. Nothing
in the renderer should crash generation; if it does, the boundary leaked.

The left panel has Lobby / Dungeon / Boss / **Floor order** / Player tabs and
the right panel Preview/Loadout tabs (`App.tsx`). The order tab is
`FloorOrderEditor.tsx`; the arena's tier drops are `PickupListEditor.tsx` +
`PickupPicker.tsx`. Note that **"Reset defaults" is tab-sensitive**: on the
Player tab it clears tweaks only, on the Floor order tab it restores the
default order only, and on the other tabs it resets parameters and *keeps*
tweaks. "I hit reset and my changes are still there" is that, not a bug.

## §E — Player tweaks (`tweak/*.xml`)

`src/generator/tweak/`. Balance overrides for classes, upgrade costs and
difficulty multipliers. **This layer cannot break level generation**: it draws
no random values, runs after every level is built, and only appends files. If
a dungeon changed, tweaks are not the cause — say so and look elsewhere.

| Symptom | Cause |
| --- | --- |
| "I changed a value but no `tweak/` folder appeared" | The value equals stock. `pruneTweaks` drops those by design, and an empty override map emits nothing. Confirm with the badge count on the Player tab. |
| "My class edit didn't take effect in game" | The campaign's tweak file replaces the base file wholesale `[VERIFIED]`, so a partial file loses everything else — check the emitted file is complete. If *nothing* applied, suspect the packer path first: an absolute argument to `LevelPacker.exe` keys every tweak file by its full path and the game loads none of them (see the 2026-07-29 discovery-log entry). |
| "I set a chance stat huge and still take damage" | Not a bug, and which stat matters. Everything past 100 is wasted either way. `dodge-chance` at 100 makes a Thief or Ranger **unhittable**; `shield-chance` at 100 leaves a Sorcerer taking full damage, because it is the frost-shield *proc*, not evasion. For classes without `dodge-chance`, `max-health` and flat `dmg-reduction` are the levers. Validation warns once for the whole set and only claims invulnerability for evasion stats. |
| "A character is invincible and I didn't expect it" | `dodge-chance` ≥ 100, almost certainly from a Defense multiplier — the stock ladder tops out at 50, so ×2 reaches it. Working as designed; the warning says so. |
| "The maxed column looks wrong" | `buildLoadouts` applies every upgrade in `req`-depth order, last write wins, because an upgrade *sets* rather than adds. A value written by two upgrades shows the later one. |
| Inline error next to a tweak field | Validation is working. The `field` on the issue *is* the tweak key. |
| `player.*` key reported in `unknownKeys` on import | The key isn't in `TWEAK_FIELD_MAP` — a typo, or a `parameters.txt` from a build with a different baseline. Not fatal by design. |

### Fixed: NullReferenceException in PlayerActorBehavior.Update

```
System.NullReferenceException: Object reference not set to an instance of an object
  at ARPGGame.Behaviors.Players.PlayerActorBehavior.Update (Int32 ms, …)
```

Mid-combat, any class, on a campaign with pre-unlocked skills. A skill was armed
with an **empty asset path**: `combo-nova-projectile` and `aura-buff` are `""` at
creation and only an upgrade fills them in, so setting the numbers without the
string gives a combo nova with no projectile to spawn. Now blocked by
`armedWithEmptyPath` in `validation.ts` as an *error*. If this recurs, a string
param is empty while its siblings are live — check the emitted file for
`<string name="…"></string>`.

Note that `error.txt` **appends**, so a report may contain older unrelated crashes.
Check the timestamps before treating two traces as one incident.

### Known in-game crash: Thief autofire divides by zero

This is a **vanilla 1.41 engine bug** in the shipped binary — not something the
generator or any tweak file emits, and the developers will **not** patch 1.41.
The trigger is the player's own control binding: with `Autofire` held (the
reporter had it on `MouseL`), the engine path that divides by zero is reachable
on every class.

**Mechanism proven 2026-09-08** by disassembling the game itself — the editor
install ships `Hammerwatch.exe`, `Hammerwatch.pdb` and `TiltedEngine.dll`, so
`ikdasm` reads the real code (the old "no source available" blocker is gone).
Trace, first reported 2026-07-30, reproduced 2026-09-08 on four stock-param runs:

```
System.DivideByZeroException: Division by zero
  at ARPGGame.GameControls.Autofire (Int32 autofire, Int32 rate)
  at ARPGGame.PlayerKeyboardControls.Attack1Autofire (Int32 rate)
  at ARPGGame.Behaviors.Players.Thief.PlayerThiefActorBehavior.DoUpdate (Int32 ms)
```

The chain, bottom-up:

1. `GameControls.Autofire(autofire, rate)` scales then divides:
   `rate = (int)(rate * 1.25f)` (IL_0000–0009), then
   `!((autofire % rate) > lastMs)` (IL_000d `rem`). Throws **iff `rate == 0`**.
2. `PlayerThiefActorBehavior.DoUpdate` is the **only class that computes the
   rate** (IL_04f3–0502): `Attack1Autofire((int)((float)attackLength /
   attackSpeed))` — a float division truncated to int. The other six classes
   pass `attackLength` raw (Priest IL_02de, Knight IL_046e, Ranger IL_026c,
   Sorcerer IL_005a, Warlock IL_009e, Wizard IL_022e) — hence Thief-only.
3. `attackLength` (base `Initialize` IL_002c–003d) is
   `sprites["west-attack"].Length`; `Sprite.Length` = `SpriteFrames.TotalTime` =
   the sum of the animation's per-frame `time` attributes (missing → 100).
   Stock `thief_a..d.xml`: west-attack = 3 × 67 = **201 ms**, all four costumes.
4. `attackSpeed` (Thief-only float) is **0.0f until the first `Attack()`** — its
   only assignment is in `Attack()` (IL_0014–0028): `1 + 0.033f * fervorCount`.
   `fervorCount ≤ fervorMax` (`Math.Min` in `ProcKill`, guarded `fervorMax > 0`),
   `fervorMax = GetInteger("max-fervor", 1)`, stock 0 ⇒ a stock Thief's
   `attackSpeed` is exactly **1** after the first attack.
5. Reachability: `Attack1Autofire` returns early unless the **Autofire binding is
   held** (per-frame state of the action-14 key, `Update` IL_0290–02a9) **and**
   Attack1 is held. The reporter's `config.xml` binds **both to MouseL** — every
   held/clicked attack qualifies, including the level-load-finalize update (the
   `CheckFinishedLoading` stack flavor).

Crash condition: `(int)(attackLength / attackSpeed) == 0`. Mono, measured on
this machine: `(int)(201f/0f) = -2147483648` and `(int)NaN = -2147483648` —
÷0 and NaN produce int.MinValue, **never 0** — so the crash needs a finite
`0 ≤ attackLength < |attackSpeed|`: with stock values **`attackLength` is 0**
(a 1 ms animation would crash only once `fervorCount ≥ 1`). In words: *in a
crashing session the Thief's west-attack animation is ≤1 ms long*, versus 201 ms
in the stock files.

**Workaround for reporters (IL-proven, zero risk): remap or clear the game's
Autofire binding** (Options → Controls → P1 → Autofire, or `<Autofire>` in the
game's `config.xml` — the reporter had it on `MouseL`). With it not held,
`Attack1Autofire` returns before the division; the crash is unreachable for
every class. Cost: no hold-to-fire.

Ruled out — everything we emit:

- **Thief params.** The 2026-09-08 campaign crashed 4× as Thief with **no
  `thief.xml` emitted at all** (stock params). This also refutes the bisection
  round 1 below, whose short-run caveat has now bitten.
- **`shared.xml`.** Value-identical to the stock baseline; the Sorcerer played
  the same file to completion (2026-07-30).
- **The `.hwm` contents.** Both packs' resource tables were decompressed (HWRP:
  magic, u32 ver 100, u32 len + info.xml, u32 len + icon, one gzip stream with a
  name-keyed table) and enumerated: the generated pack carries
  `tweak/shared.xml` plus referenced `actors/`/`doodads/`/`sound/` keys and **no
  `actors/player/*`**; the stock `campaign.hwm` also ships `tweak/shared.xml`
  only. Player sprites come from `assets.bin` either way.
- **The stock actor data.** Zero-frame sprites are dropped by `ActorLoader`
  (absent key ⇒ KeyNotFoundException — a different crash), a missing `time`
  defaults to 100, and no stock file expresses `TotalTime == 0`.
- The July items stand: upgrade presence, `max-fervor` 10 vs 0, combo params,
  seed/RNG.

**Conclusion.** This is a vanilla 1.41 engine defect, not a generator-output
defect: the `Ruled out` list above holds, and nothing we emit feeds either
operand of the division. Since the shipped 1.41 binary is unpatchable, there is
no engine-side fix to ship, and — because the crash depends only on the player's
`Autofire` binding, not on any campaign XML — no validation rule or preset change
can reach it either. **The resolution is the in-game workaround already
documented above:** unmap the `Autofire` binding (Options → Controls → P1 →
Autofire, or the `<Autofire>` key in the game's `config.xml`) and remap it once
inside the game. With it not held, `Attack1Autofire` returns before the division,
so the crash is unreachable for every class. Cost: no hold-to-fire. No `tests/`
change, no `baseline.ts` edit, and no §A escalation is warranted — this lives
in the "Known issues" section of the README, not the bug queue.

## §F — Boss arena and the optional levels

The arenas are the only generated geometry outside the floor loop
(`src/generator/boss/`), and they draw from **`ctx.bossRand`**, a third stream,
**in fight-list order** — so fight 1 is exactly the arena a single-fight
campaign has always produced, and appending a fight cannot move an earlier one.
The lobby and prep rooms draw nothing at all. Consequence for triage: turning
any of them on or off must leave every `levels/level*.xml` byte-identical for a
seed. If a report says a dungeon floor changed when the boss was toggled, that
is an RNG-stream leak — escalate, do not patch.

| Symptom | Cause |
| --- | --- |
| "The arena is impassable" | `cover.density` — it is the fraction of *free floor*, so 0.25 (`BOSS_COVER_DENSITY_MAX`) is already dense. Validation errors above the cap; below it, `pruneForConnectivity` still guarantees the boss, all nine anchors and the alcove stay reachable. |
| "The arena walled itself off mid-fight" | A monster whose wreck keeps its collision (nova / frost / tracking towers — `objects/actorCollision.ts`) on a scatter mode. Validation rejects that combination; if one got through, the roster data is wrong, not the placer. |
| "Nothing spawns at a tier" | Empty pool, or every `monsterMax` scaled to 0 by `arena.monsterMultiplier`. An empty *health* tier warns; an empty **death** tier does not — it is legal, and that is how a campaign gets the quiet walk to the orb. |
| "The interval I set does nothing" | The monster is on a scatter mode: scattered spawns are one-shot, so both `defaultIntervalMs` and the per-monster override are ignored. Warned about, not an error. |
| "All the waves spawn at once late in the fight" | Working as designed. Tiers switch on and never off — no timer is ever disabled — so at 25% health all four health tiers are running. |
| "The death tier spawned nothing in game" | Check the pool is non-empty first. The mechanism itself is `[VERIFIED 2026-08-19]`: `SpawnObject` off `Boss Died` does fire after the boss dies. |
| Endless (`-1`) rejected | Only on a scatter mode — a one-shot spawn has no endless budget. `-1` is fine on `anchors`, and is never scaled by the multiplier. |
| Huge boss level / slow pack | Each scattered spawn is its own `SpawnObject` node; the stock presets emit ~1300. Validation warns at `BOSS_SCATTER_WARN` (2000). Not an error — there is no hard limit. |
| "Starting gold was rejected" | Whole number, multiple of 500, ≤ `GOLD_SAFETY_MAX`. The old 12000/42000 caps were removed — deeper diamond stacks are supported. |
| "Beating the boss didn't end the campaign" | Working as designed with more than one fight: fight *i*'s arena teleports the party into fight *i+1*'s **prep room**, and only the last campaign slot carries `Orb` + `GameEnd` (`objects/objectSet.ts`). |
| "A tier's item drops never showed up" | They spawn on the drop pad just inside the arena entrance, identical on every seed — not at the tier's spawn points. The tiers do **not** replace one another, so drops accumulate. |
| The **host** crashes mid-fight with `WorldItemPickupBehavior.NetPickup` → `NullReferenceException`, reached from `WorldHandler.ItemPickedUp(peerId, id)` | **Engine, not ours.** It is the host handling a *client's* pickup message for a world item that is already gone — multiplayer-only, since the host's own pickups never take that path. Our arena provokes it (a tier's drops fire at the matching health threshold, and tiers never switch off, so loot and corpses pile up), but nothing in the emitted XML is wrong and item ids cannot collide. See the 2026-09-03 DISCOVERY-LOG entry, including the solo-replay experiment. **Do not ship a fix** before that experiment runs. |
| "Adding a second fight changed the first one" | A `ctx.bossRand` leak — escalate. The fights share one stream in list order precisely so this cannot happen. |

Every arena field key is scoped per fight — `boss.fights.<i>.arena.*`, and
`boss.fights.<i>.prep.*` for the prep room (the `af()` / `pf()` helpers in
`validation.ts`). An inline message anchors to the fight tab that is wrong.

Arena constraints beyond the wave rules: `min ≤ max` on both axes,
`minWidth ≥ ARENA_MIN_WIDTH` (14) and `minHeight ≥ ARENA_MIN_HEIGHT` (18),
non-empty `bossPool` of known `BOSS_IDS`, exactly `BOSS_WAVE_COUNT` (5) waves,
intervals `MIN_WAVE_INTERVAL_MS`..`MAX_WAVE_INTERVAL_MS` (100..60000), wave pool
entries valid **variant keys** (`bat1#0`, `archer1#2` — a non-canonical spelling
of a pinned tier is its own error), `monsterMax ≥ -1`, a `BOSS_SPAWN_MODES`
name, integers ≥ 1 for every `cover.*` / `spawn.*` spacing and cluster knob
(including `spawn.batchSize`), and `spawn.batchIntervalMs` in the same
100..60000 window. `boss<i>Spawn` is the 5-field
`spacing,ringSpacing,clusters,batchSize,batchIntervalMs`; the older three-field
form still parses.

### Multiple bosses (issue #64, and the follow-up: exact lineups, stacking, raised cap)

`bossCount` (arena: `boss<i>Count`; floor: 4th field of `bossFloor<i>=`) —
**absent means 1**. `isMultiBoss(count)` is the single gate every rig and
validation rule reads. `MAX_BOSS_COUNT` is **100** (raised from the original 4);
`BOSS_COUNT_WARN` (12) is an *advisory* threshold above which validation warns
about a crowded arena and slower generation, never blocks.

**Two selection modes**, `bossSelection` (arena: `boss<i>Selection`; floor:
`bossFloor<i>Selection`) — **absent means `'random'`**, the historical pool
pick. `'lineup'` (`boss<i>Lineup` / `bossFloor<i>Lineup`, e.g.
`boss_knight:3,boss_lich:1`) picks an EXACT roster instead: `bossPool` is not
read at all in this mode, no pool errors apply, and the effective count
(`arenaBossCount`/`floorBossCount`) is the lineup's own total, not `bossCount`.
Read the mode through `bossSelection()`, never off the field.

| Symptom | Cause |
| --- | --- |
| "Boss invulnerability windows never fire with 2+ bosses" | Working as designed. The engine's `Boss 75/50/25%` events can't say WHICH boss crossed a threshold, so invulnerability (and checkpoints) is skipped outright above effective count 1. The values stay on the object, unread — lossless if the count drops back to 1 — and the renderer HIDES those fields entirely at 2+ bosses (not just greys them out), so there is nothing left to configure by mistake; validation no longer warns about it either (removed in the issue #64 UI follow-up — a warning pointing at a hidden field was noise). |
| "Wave tiers 75/50/25% never spawn anything with 2+ bosses" | Same reason — those tiers are skipped entirely, not fired for the wrong boss. Only tier 0 (100%, start) and the death tier run. The renderer hides tiers 1-3 in the wave editor at 2+ bosses; validation no longer warns about content left on them. |
| "The seal/alcove opened after only one of several bosses died" | **Fixed 2026-09-23 — a recurrence is a regression.** The old `Counter` node fired on the first kill; it was replaced by the `[VERIFIED]` Variable / ChangeVariable / CheckVariable rig (`boss/tierSource.ts`'s `buildAllBossesDied`, DISCOVERY-LOG 2026-09-23). Check the level's XML: exactly one `Variable` whose `parameters` equals the boss count; per boss one `ObjectEventTrigger(Destroyed, trigger-times 1)` whose `connections` are its own `ChangeVariable` (`mod` 2, `value` 1) then its own `CheckVariable` (`cmp-func` 0, `cmp-val` 0); every CheckVariable's `on-true` holds the seal's `DestroyObject`. A wrong initial value, a shared ChangeVariable, or a `Counter` node reappearing is the bug. If the XML matches and it still opens early, that contradicts the verified floor and arena playtests. Capture the level and log it. |
| "bossCount rejected even though the pool has several bosses" | The pool may be all-unique (only `boss_dragon`/`boss_queen`) — each can appear at most once, so `bossCount` cannot exceed the pool's size. Switching to `'lineup'` mode sidesteps this: a lineup states the exact roster, so there is no "pool too small for a random pick" question — only "at most 1 dragon/queen" and "does it fit the arena". |
| "bossCount rejected at a size that looks big enough" | `arenaBossLayout` (pure, no draws) could not fit every combination the pool could roll at `minWidth × minHeight` — raise the minimum size, narrow the pool, or lower the count. This is a real geometry check (footprints + a fixed gap + the entrance + the anchors), not a guess. The brute-force enumeration is capped at `ARENA_LAYOUT_SLOTS` (5), not at `bossCount` — a count of 50 costs the same validation work as a count of 5. |
| "20+ bosses all bunched on top of each other" | Working as designed (the follow-up's stacking): `arenaBossLayout` only ever computes 5 distinct positions (topWall + primary + 3 offsets); bosses beyond that cycle round-robin onto a slot already in use and literally share a tile. The engine pushes overlapping mobile actors apart at runtime — only the dragon and queen (unique, capped at 1) can never be part of a stack. |
| "A lineup with `boss_dragon: 2` (or `boss_queen: 2`) is rejected" | Working as designed — a lineup obeys the same "at most 1" rule `pickBosses` enforces for a random pick; the error names the field as `bossLineup`, not `bossCount`. |
| "A floor lineup naming `boss_dragon`/`boss_queen` is rejected" | Working as designed — a floor boss must be able to chase the party (`MOBILE_BOSS_IDS`); neither is mobile, same restriction `bossPool` already carries for a floor. |
| "Two identical bosses picked for one fight" | Expected for anything except `boss_dragon`/`boss_queen` — `pickBosses` only removes a candidate from the pool once picked when `BossDef.unique` is true. In `'lineup'` mode this is simply what was asked for. |
| "A boss floor's `invulnerability` + timer-mode error disappeared" | Working as designed — that error only applies to a single-boss floor (effective count 1); above that, invulnerability is already skipped, so it cannot compete with the timer. |

## Where the logs and state live

The app does not write its own log file. Ask the reporter for:

1. **The console output.** `npm run dev` prints main-process output to the
   terminal; renderer errors are in DevTools (Ctrl/Cmd+Shift+I). Packaged
   builds: Electron's default log locations, or relaunch from a terminal.
2. **The parameters and the seed.** Ideally an exported `parameters.txt`
   (header → *Export parameters.txt*) plus the seed shown on the result.
   Without both, most reports are unreproducible. The export carries player
   tweaks too, as trailing `player.*=…` lines — their absence means the user
   changed nothing, which rules out §E in one glance.
3. **Platform + whether wine is involved**, for anything packer-related.

Settings and the `parameters.txt` override live in Electron's userData dir
(`src/main/settings.ts`):

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%/hammerwatch-roguelike-dungeon-generator` |
| Linux | `~/.config/hammerwatch-roguelike-dungeon-generator` |
| macOS | `~/Library/Application Support/hammerwatch-roguelike-dungeon-generator` |

A corrupt settings file or a stale `parameters.txt` override there explains a
surprising number of "it worked yesterday" reports — check `paramsSource` in
the app's initial state, which reports whether defaults or an override loaded.

## What counts as a quick fix (yours)

- Adding or tightening a validation rule + its test.
- Improving an error message.
- A null/bounds guard in main or renderer code.
- A missing preview field for an existing room/entity type.
- Anything under ~20 lines, in one or two files, with a test.

## What you escalate (not yours)

- Anything that changes RNG draw order or generated output.
- Anything in `map/`, `objects/`, or `wallPattern.ts` beyond a guard.
- Anything needing a redesign, a new parameter, or a schema change.
- Anything you can't reproduce.
- Any change to `src/generator/tweak/baseline.ts` — it is a transcription of
  the shipped game files, and a wrong number there is invisible until someone
  plays the campaign.

**Escalation writeup** — hand back exactly this, nothing else:

```
SYMPTOM:     the error/stack, verbatim
REPRO:       parameters + seed, or "not reproduced"
CLASSIFIED:  §A/§B/§C/§D + one line of reasoning
ROOT CAUSE:  file:line, or "unknown — here's what I ruled out"
SUGGESTED:   the fix you'd make, and why it's above your line
```
