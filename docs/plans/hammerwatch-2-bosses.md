# Hammerwatch 2 bosses (experimental "Load custom")

Plan commit 12 of `hammerwatch-2-content.md`. It was waiting on spike S2. S2 is now confirmed
(`docs/discovery/hammerwatch-2-spikes.md`): a scenario can ship script classes AE lacks, and
the grey wolves dash with HW2's own `DashStrike.as`. This plan brings the nine HW2 bosses into
the Arena tab. They show only while Hammerwatch 2 is loaded, like the rest of the HW2 content.

## What the research found (2026-11-26)

### The bosses depend on their arenas

The first thing to settle: an HW2 boss isn't a unit you can drop into any room. Each one
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

The arenas also spawn the boss themselves. None of the nine arenas places its boss unit; their
scripts do it. In our generated arenas, most of these fights would stall or break.

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

## Approach

**Recommended:** each HW2 boss fights in a port of its own HW2 arena, which is a fixed level.
Our generated arena can't stand in for it.

That's the only way most fights work as designed, and it keeps the port mechanical: the same
copy and rewrite rules as for themes and monsters, applied to a level. The trade-off is that
HW2 arenas don't take the generated-arena options (arena pattern, waves, traps, cover, several
bosses at once). Validation says so rather than silently dropping them.

A later step can test which bosses also work standing alone in a generated arena. Blight,
Malgar and Shock Widow are the likeliest, so the generated arena would be an option per boss,
not the default.

## Steps

Each step is a commit (or a few), each passing the gate.

1. **Shipping scripts, generally.** Generalise the S2 spike into the copier.
   - A unit closure's missing classes become script files: a whole HW2 file when AE has no file
     of that path and none of its names, otherwise just the class or function cut out of it.
   - Helpers are found by name, transitively, but never by following into a file AE has (so
     `Functions.as` never comes whole).
   - Shipped scripts never replace an AE file. They live at their HW2 path, or under
     `scripts/hw2/` if spike S5 shows a sub-folder compiles too.
   - Text rewrites for known API differences are data-driven rules with tests, like the speed
     rule.
   - Tested on fakes, and against the install: the 11 boss classes plan to 9 files plus 2
     symbols, with no name AE declares.
   - Monsters use the same path, which is how the wider HW2 roster (wolves, wasps, boars, the
     empire, the archons…) comes over afterwards.
2. **Spike S5: everything compiles.** One test scenario ships all 9 files, the cut symbols and
   the 7 arena script types. You start it; I read `HW1A.exe.log` and fix each compile error with
   a shim or a rewrite rule. Repeat until clean. One compile error stops every script, so this
   comes before any boss reaches a campaign.
3. **Porting an arena.** `readLevel` the HW2 arena, then:
   - prefix every unit, tileset and environment path with `hw2/`, including script parameters
     that name assets (a `SpawnUnit`'s unit);
   - make its closure the copy's roots;
   - replace its exits with our press-F exit and reward;
   - add our `CreateBossBar` on the boss;
   - keep its own boss spawn and phase scripts;
   - set the music from our music rig (HW2's boss track by default).

   The level stays HW2's own file, read from the user's install at install time. The repo stores
   only paths and the rewrite rules.
4. **Pilot boss: Commodore Sinkage.** His arena needs no arena script type AE lacks, and his
   unit needs just `CompositeActorUtilitySkill` plus `DashStrike`, which already compiles.
   - Generator: an `HW2_BOSSES` list (`hw2_sinkage` …) with `source: 'hw2'`, its arena level, a
     bar name and an HP setting, in a "Hammerwatch 2" group of the boss picker. Unloaded, it
     isn't offered, and an imported `hw2_` boss is an inline error (as `hw2_` themes are).
   - Validation: an HW2 boss fights alone, in its own arena, and never on a dungeon floor.
   - **Spike S6:** you play his arena: he spawns, the cannons fire, he dies, and the exit opens.
5. **The rest, easiest first:** Shock Widow, Malgar, Blight, Doombringer, Dace Arden, Judge
   Supreme, Barrington, then Archibald (a formation fight against a boss who yields). Each is a
   commit plus a play check on the boot checklist.
6. **Later, optional:** which bosses also stand alone in a generated arena; HW2 boss sounds
   (with the monster sounds, as an `hw2/sounds/sounds.sbnk`).

## Questions for you

1. **HW2 arenas, as recommended?** The other option is our generated arenas, accepting that
   most fights' set pieces won't happen.
2. **Health:** keep HW2's boss HP as is, or scale it? HW2 bosses are tuned for HW2 characters
   (the Endgame preset is the nearest match). A per-boss HP multiplier would be a new setting.
3. **Archibald:** include his formation fight, or leave him out?
4. **Order:** start with Sinkage as the pilot, then the rest easiest first?

## Risks

- **The compile loop is slow by nature.** Each round needs the game started, and an error
  anywhere blocks every script. Mitigations: the static name check before shipping anything, and
  S5 covering every boss class at once.
- **Shared class names with different parameters**, as with movement speed. Each boss needs a
  play check, and the copy's rewrite rules grow as each one is found.
- **Size.** Doombringer's unit closure alone is 8.3 MB, and arenas add more. A campaign with
  several HW2 bosses could ship 20–40 MB.
- **Network messages in `ChainAction`.** They may need registering for co-op; single-player
  first.
