# Hammerwatch 2 bosses (experimental "Load custom")

Plan commit 12 of `hammerwatch-2-content.md`. It was waiting on spike S2. S2 is now confirmed
(`docs/discovery/hammerwatch-2-spikes.md`): a scenario can ship script classes AE lacks, and
the grey wolves dash with HW2's own `DashStrike.as`. This plan brings the nine HW2 bosses into
the Arena tab. They show only while Hammerwatch 2 is loaded, like the rest of the HW2 content.

## What the research found (2026-11-26)

### The bosses depend on their arenas

Most HW2 bosses are built around their own arena. Each one
raises global events and sets flags as it fights, and its arena level (HW2's
`levels/boss_repeat/_boss_*_repeat.lvl`) reacts to them. Some examples:
- **Barrington** hides between rooms (flags `room_1`–`room_4`, `vanish`), and you work four
  levers to bring him out.
- **Commodore Sinkage** has broadside cannons on his ship (`cannons_left_ready`,
  `cannons_all_fire`).
- **Doombringer** takes off and lands (`take_flight`, `flying_high`, `landing`), with
  lightning buildings.
- **Judge Supreme** has 32 laser pillars and a throne.
- **Dace Arden** has lanterns (`lanterns_all`) and 26 skeleton spawn points.
- **Archibald Steelwill** isn't fought directly: his unit has 100,000 HP and yields
  (`boss_archibald_yield`). The fight is his soldier formations (shield wall, spear wall,
  sentries, warlocks).
- **Blight, Malgar and Shock Widow** have the fewest set pieces, but they still raise events
  (`hellcubes_destroyed`, `max_glyphs`, `lay_eggs`).

The arenas also spawn the boss themselves: none of the nine places its boss unit, their scripts
do. In our generated arena we place the boss, and nothing answers its events. See Approach.

| Boss | Script classes AE lacks | Arena script nodes | Arena scripts AE lacks | Copy |
|---|---|---|---|---|
| Archibald Steelwill | CompositeActorDamagedPeriodTriggeredSkill, CompositeActorUtilitySkill | 196 | CheckAssetDefinie | 12 files* |
| Barrington | ClearAggro, CompositeActorUtilitySkill, DashStrike | 267 | AllPlayersLevelExit, OpenPopupWindow, PlaySoundTracked | 155 files, 1.9 MB |
| Blight the Horrible | ChannelingSpewSkill, CompositeActorDamagedPeriodTriggeredSkill, CompositeActorUtilitySkill, EnemyOwnedActor, ResistBuffSkill, SteeringMovement | 294 | — | 379 files, 4.2 MB |
| Commodore Sinkage | CompositeActorUtilitySkill, DashStrike | 71 | — | 123 files, 1.6 MB |
| Dace Arden | ChainAction (+2 links), CompositeActorDamagedPeriodTriggeredSkill, DashStrike, ResistBuffSkill | 259 | AllPlayersLevelExit | 144 files, 1.6 MB |
| Doombringer | ChannelingSpewSkill, CompositeActorUtilitySkill, ResistBuffSkill | 214 | PlaySoundTracked, SpawnEffectParams | 274 files, 8.3 MB |
| Judge Supreme | ChainAction (+1 link), CompositeActorDamagedPeriodTriggeredSkill, CompositeActorUtilitySkill, DashStrike, ResistBuffSkill | 347 | AllPlayersLevelExit, SetBossBarPortrait | 290 files, 3.2 MB |
| Malgar | ChannelingSpewSkill, ClearAggro, CompositeActorDamagedPeriodTriggeredSkill, CompositeActorUtilitySkill, ResistBuffSkill | 111 | GameTimedScriptLink | 249 files, 2.2 MB |
| Shock Widow | ChannelingSpewSkill, CompositeActorDamagedPeriodTriggeredSkill, CompositeActorUtilitySkill, ResistBuffSkill | 81 | CheckAssetDefinie | 146 files, 2.8 MB |

\* Archibald's own unit only. The formations and the arena come on top.

The copy sizes are the boss unit's closure alone. An arena adds its own tiles, doodads and
props.

### The scripts are small, if they're cut finely

These 11 class names need **9 HW2 script files, about 2,570 lines**, plus two helper symbols
from files AE also has: `easeSineOut` (`Utils/Functions.as`) and `IOwnedUnitLoad`
(`Behaviors/IOwnedUnit.as`). That counts every top-level name each file uses that HW2 declares
and AE doesn't.

Following whole files instead pulls in 76 files and 19,600 lines, HW2's inventory and quest
systems included, because `Functions.as` reaches everything. So helpers are cut out symbol by
symbol, the way `scripts/Hw2Compat.as` carries `easeSineOut` today.

One file clashes. `CompositeActorTriggeredSkill.as` also declares `SkillTrigger`,
`CompositeActorTriggeredSkill` and `CompositeActorDamagedTriggeredSkill`, which AE already
defines. Only `CompositeActorDamagedPeriodTriggeredSkill` is cut out of it.

Calls that may not exist in AE's engine or base classes, which only a compile will settle:
- `SteeringMovement`'s `GetRelativePosition` / `SetRelativePosition`;
- `ResistBuffSkill`'s `OnBuffApplied` / `OnStackApplied` hooks (HW2's skill base may call
  these; AE's won't);
- `CompositeActorTriggeredSkill`'s `SetCooldown`;
- `ChainAction`'s network messages (`NetScan`, `NetHit`).

The 7 arena script types AE lacks (`AllPlayersLevelExit`, `CheckAssetDefinie`,
`GameTimedScriptLink`, `OpenPopupWindow`, `PlaySoundTracked`, `SetBossBarPortrait`,
`SpawnEffectParams`) are WorldScript classes. They can ship the same way, or be swapped for
AE's own: our press-F exit replaces `AllPlayersLevelExit`, and `PlaySound` covers
`PlaySoundTracked`.

### Other things to handle
- **Boss bar.** HW2 bosses declare a `bossbar` block on the unit. AE's `CompositeActorBehavior`
  doesn't read it, so the arena gets our own `CreateBossBar` node, as AE bosses do.
- **Names.** HW2 bosses are named by HW2 language keys (`.actor.boss_*`), which AE doesn't
  have. Shock Widow's unit even uses `.actor.boss_queen.name`. So the boss bar gets a plain
  name.
- **Health.** HW2 boss HP is tuned for HW2 characters (`HP_BOSS_*` in HW2's
  `_actor_stats.inc`).
- **Game mode.** The arenas use `DungeonGameMode`, which AE has too.
- **Silence.** As with the monsters, HW2's boss sounds are FMOD events AE mostly lacks, so the
  bosses are quiet.

## Decisions (2026-11-26)

- **Arenas: our generated arenas.** HW2 bosses fight in the Arena tab's usual generated arena,
  like AE's bosses. Porting HW2's own arena levels waits, and only happens if fights go wrong
  without them.
- **Health:** HW2's own boss HP, unchanged.
- **Archibald:** included, last.
- **Order:** Commodore Sinkage is the pilot, then the rest easiest first.
- **Later, not part of this plan:** with the HW2 Endgame player presets, let players upgrade
  damage, armor, mana, health and so on up to level 99 or 255. Not combos: too many
  projectiles lag the game.

## Approach

Each HW2 boss is a boss of the generated arena, like an AE boss. It comes with its whole unit
closure and the HW2 script classes it needs, shipped in the scenario.

What won't happen in a generated arena is whatever the boss's HW2 arena did in answer to its
events and flags: Barrington's levers, Sinkage's cannons, Judge Supreme's pillars,
Doombringer's lightning buildings, Dace Arden's lanterns and skeletons, Archibald's formations.
The boss still raises those events, and nothing answers them. Each boss's play check (S6 for the
pilot, a checklist row for each one after) shows whether its fight still works. Two outcomes
mean a port of its HW2 arena: a boss that stalls (it waits for an arena event to change phase,
or never becomes hittable), and a fight that makes no sense without its set piece.

Archibald is the likeliest to need more than the arena gives: in HW2 he yields at 100,000 HP
while his formations fight. That's why he's last.

## Steps

Each step is a commit (or a few), each passing the gate.

1. **Shipping scripts, generally.** *Done 2026-11-26:* `src/main/custom/angelscript.ts` reads
   a script's top-level declarations, and `scriptPlan.ts` plans what ships. The copier carries
   whatever classes a unit needs. The nine bosses come to 8 files plus 3 cut-out declarations,
   as planned (tests/scriptPlan.test.ts). Generalising the S2 spike into the copier:
   - A unit closure's missing classes become script files: a whole HW2 file when AE has no file
     of that path and none of its names, otherwise just the class or function cut out of it.
   - Helpers are found by name, transitively, but never by following into a file AE has (so
     `Functions.as` never comes whole).
   - Shipped scripts never replace an AE file.
   - Text rewrites for known API differences are data-driven rules with tests, like the speed
     rule.
   - Tested on fakes, and against the install: the 11 boss classes plan to 9 files plus 2
     symbols, with no name AE declares.
   - Monsters use the same path, which is how the wider HW2 roster (wolves, wasps, boars, the
     empire, the archons…) comes over afterwards.
2. **Spike S5: everything compiles.** *Confirmed 2026-11-26 (`dungeon_11260005`), after
   dropping `override` and three patches (src/main/custom/hw2/scriptPatches.ts).* One test scenario ships all 9 files and the cut symbols.
   You start it; I read `HW1A.exe.log` and fix each compile error with a shim or a rewrite rule.
   Repeat until clean. One compile error stops every script, so this comes before any boss
   reaches a campaign.
3. **Pilot boss: Commodore Sinkage.** *Done 2026-11-26 (`custom/hw2/bosses.ts`); S6 confirmed in
   game (`dungeon_11260006`): the bar shows his name and health, he fights without getting
   stuck, and he dies cleanly and opens the exit.*
   - Generator: HW2 bosses appended to `BOSS_IDS`/`BOSS_DEFS` (`hw2_sinkage` …). Each has
     `source: 'hw2'`, its unit, a footprint read from its collision, a plain bar name (HW2's
     language keys aren't in AE) and `mobile`. They sit in a "Hammerwatch 2" group of the boss
     picker. Unloaded, they aren't offered, and an imported `hw2_` boss is an inline error.
   - The boss bar is our own `CreateBossBar` node, as for AE bosses: AE ignores HW2's
     `bossbar` block. HW2 bosses set `hide-health`, as AE's do, so the bar is the only place
     their health shows (S5: Sinkage on a floor had none).
   - Loot: HW2 bosses drop from HW2 loot tables AE lacks (Sinkage's death runs `SpawnLoot` on
     `boss_sinkage`: a script error and nothing dropped, S5). The copy takes their HW2 loot
     actions out. Like AE's own end bosses, they then drop nothing themselves: an arena's
     loot is the pickups its waves are set to.
   - They stay off dungeon floors at first (Arena tab only, as asked); floors can follow once
     the play checks show which bosses chase.
   - **Spike S6:** you play an arena with him. Does he fight, take damage, die and open the exit?
     And what's missing without his cannons?
4. **The rest, easiest first:** Shock Widow, Malgar, Blight, Doombringer, Dace Arden, Judge
   Supreme, Barrington, then Archibald. Each is a commit plus a play check on the boot
   checklist.
5. **Only if a fight goes wrong: port its HW2 arena.** `readLevel` the HW2 arena, prefix every
   asset path (script parameters included), make its closure the copy's roots, replace its exits
   with ours, and add our boss bar and music. It also needs the arena script types AE lacks
   (`AllPlayersLevelExit`, `CheckAssetDefinie`, `GameTimedScriptLink`, `OpenPopupWindow`,
   `PlaySoundTracked`, `SetBossBarPortrait`, `SpawnEffectParams`): shipped, or swapped for AE's
   own.
6. **Later, optional:** HW2 boss sounds (with the monster sounds, as an `hw2/sounds/sounds.sbnk`).

## Risks

- **The compile loop is slow by nature.** Each round needs the game started, and an error
  anywhere blocks every script. Mitigations: the static name check before shipping anything, and
  S5 covering every boss class at once.
- **Shared class names with different parameters**, as with movement speed. Each boss needs a
  play check, and the copy's rewrite rules grow as each one is found.
- **Size.** Doombringer's unit closure alone is 8.3 MB. A campaign with several HW2 bosses
  could ship 10–30 MB.
- **Bosses that wait on their arena.** A generated arena doesn't answer the boss's events, so a
  boss may never change phase. Step 5 is the fallback.
- **Network messages in `ChainAction`.** They may need registering for co-op; single-player
  first.
