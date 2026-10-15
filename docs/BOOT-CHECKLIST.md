# Boot checklist

Things the generator emits that only playing can confirm. The tests prove the levels are well formed and wired. They can't prove the game behaves the way the wiring intends.

**How to use it:** generate with the defaults, then **Install into Hammerwatch AE**. Start the scenario from the scenario list, play it, and set each row's status:
- `CONFIRMED <date>` when it works;
- `BROKEN <date>: what happened` when it doesn't, and paste the relevant lines of `<AE>/HW1A.exe.log`.

A confirmed row goes into the discovery log as `[VERIFIED]`.

| # | Feature | How to check | Status |
|---|---|---|---|
| 1 | Scenario loads | It's in the scenario list as "Dungeon #<seed>" and starts without errors in `HW1A.exe.log`. | VERIFIED |
| 2 | **0 lives** (`NO_LIVES` forced) | On the start screen, "No lives" is on and can't be turned off; the HUD shows no life counter; a dead player stays dead. If it can be toggled off, the `forced` value is wrong; try `forced="1"`, or `default-on`. | VERIFIED |
| 3 | Lobby: the house | The game starts in your house, at its spawn. | VERIFIED |
| 4 | Lobby doors | The `_door_1b` / `_door_1c` doors open as the party walks into them, or on F. If they stay shut, the portal room can't be reached. | VERIFIED |
| 5 | Lobby vendors | F at each stand opens its shop: combo, defense, misc, offense, power, and **items**. The defense shop sells the Warlock gargoyle (`def2`). | VERIFIED |
| 6 | Lobby payout | The red diamonds and any free upgrades lie near the spawn, on the floor and not inside furniture. | VERIFIED |
| 7 | Lobby exit | At the portal, F with the whole party moves everyone on to floor 1. Alone, it shows the gather-party message. | VERIFIED |
| 8 | Floor exit (stairs) | Same press-F, whole-party behaviour at the down stairs; the next floor starts at its up stairs. | VERIFIED |
| 9 | Floor banner | "Floor N" shows once on arrival. | VERIFIED |
| 10 | Walls | No gaps, no doubled or floating pieces, no wall art bleeding over floor. The tests prove each cell gets at most one piece; whether the art lines up is for the eye. Check every theme you use. | VERIFIED |
| 11 | Floor shops | F at a shop room's stand opens it, and you can buy from it. Before 2026-10-10 F showed the prompt but never opened the shop (the UseTrigger didn't fire the ShopArea). | VERIFIED |
| 12 | Keys and doors | A key opens its colour's door, which then stays open. | VERIFIED |
| 13 | Final-room button | Pressing the button plays its click, animates the plate and removes the seal. "The way to the final room has opened!" shows at the top of the screen. With several buttons, each press shows "N buttons remain" there too. On a timed floor (e.g. Shell Game) the countdown at the bottom must not wipe them. The final room's portal is the house's square pad. | VERIFIED |
| 14 | Mystery plates | A plate clicks once and spawns its loot or monsters; trap plates switch their spewers on (and off after the timer). | VERIFIED |
| 15 | Floor traps | Wall spewers fire in the direction set, at the rate set. | VERIFIED |
| 16 | Floor timer | The countdown ticks once a second, and the damage starts when it reaches 0:00. | VERIFIED |
| 17 | Buff fields | The buff applies to the target set (players, monsters or both). | VERIFIED |
| 18 | Boss portal | The last floor's red portal leads into the arena. | VERIFIED |
| 19 | Boss bar | The boss's health bar shows its stock title. | VERIFIED |
| 20 | Boss tiers | Waves start on entering and step up at 75/50/25% health; invulnerability windows count down. (Boss checkpoints were removed 2026-10-11: co-op players revive each other, and a dead party chooses to restart at the previous lobby or at the fight.) | VERIFIED |
| 21 | Boss death | The alcove seal opens when the boss dies. | VERIFIED |
| 22 | Victory | Picking up the orb shows "Victory!" and then the game-over screen (`ShowGameOver`). | VERIFIED |
| 23 | Floor boss | On a boss floor, killing the boss opens the sealed portal room. This was broken before 2026-10-10. | VERIFIED |
| 24 | Music | Each level plays its chosen track (FMOD music mode). | VERIFIED |
| 25 | Respawn point | A player who dies and is still dead when the party takes an exit arrives on the next level as a gravestone. AE has no respawn, only revive: a living player has to revive them. `SetRespawnPoint` does not bring them back by itself. | VERIFIED |
| 26 | Player skill values | Load the **HW2 Endgame** player preset, install, and buy the first health upgrade: health reads 384, the preset's patched value, which stock AE can't go above (300). This proves the scenario's copies of `players/<class>/skills/*.sval` replace the game's. | VERIFIED |
| 27 | Player base stats | With the same preset, the wizard starts at 105 health instead of 35. This proves the scenario's copy of `players/classes.sval` is read. It may not be, because the game loads classes.sval for the character screen, possibly before any scenario. If health stays 35, say so: base stats then need a different route. Confirmed with the HW2 Endgame preset: 366 mana is out of reach for any stock class (ranger max 200), and fits the patched base of 357 plus gear. | VERIFIED |
| 28 | Per-class move speed | In **Move speed → Per class**, set one class to 2.0 and leave the rest. That class runs twice as fast and the others don't change. This relies on #27, because each class is pointed at its own copy of the speed skill through classes.sval. | VERIFIED |
| 29 | Wall torches | Torches hang flush on the rooms' north walls, flames lit, and none float in mid-air or sit inside a doorway, exit or trap shooter. **Lighting → Wall torches** changes how many there are (none, sparse, normal, dense). | VERIFIED |
| 30 | Brightness | With **Lighting → Brightness** at Brighter (the default), enemies are visible away from torches. Daylight is clearly brighter, and AE stock is as dark as before. This also proves the scenario's copy of a lighting environment (`effects/lighting/*.env`) replaces the game's. | VERIFIED |
| 31 | Fully upgraded owns everything | Press **Fully upgraded**, install, and play a wizard: meteor shower, flame spray and the other bought skills are on the bar from the start, at full strength, and no vendor (combo, offense, defense, misc) lists anything. Kill a pack quickly: combo starts and fires the level-5 nova. This relies on AE reading `starting-level` (up to a skill's top level, on roots and modifier skills alike) from a scenario copy of a skill's `.sval`, and on a modifier moved to the `owned` column being listed by no vendor. | VERIFIED |
| 32 | Free potions and items | Press **Everything free**, install, and open the power shop and an item vendor: every potion, rejuvenation and item costs 0. Potions come from the scenario's copy of `scripts/GUI/Shop/PowerShopMenuContent.as` (already shipped for the extra-life fix); item prices come from its copy of `scripts/Data/Misc.as`, which nothing has replaced before. | VERIFIED |
| 33 | Ranger bow heat off | Tick **Original Hammerwatch feel → Ranger bow never overheats** (or load the Original Hammerwatch preset), install, and hold fire as the ranger for several seconds. Arrows keep the same rate and fly straight; stock AE slows the shots and spreads them after about three arrows. This relies on `overheating-max` 0 in the scenario's copy of `ran_bow.sval`. | VERIFIED |
| 34 | Original attack movement | With **Original movement while attacking** ticked: the wizard can't move from casting meteor until the last meteor lands; the paladin, wizard (fireball) and warlock (dagger) crawl at about a fifth of their speed while attacking, slow but enough to kite; the ranger walks at half speed while shooting. Stock AE lets the wizard walk off a third of a second into meteor. | VERIFIED |
| 35 | Original paladin swing | With **Original paladin swing speed** ticked, the paladin's sword hits on the click and swings about ten times a second when clicked or held, with the animation playing quickly. Stock swings about twice a second. | VERIFIED |
| 36 | Combo regen override | Tick **Original combo rewards** (or load Original Hammerwatch), buy a combo mana upgrade and get into combo: mana climbs about twice as fast as stock (8/s at tier 1, not 4). This proves a scenario's copy of `tweak/buffs/buffs.sval` is read, macros and all. | VERIFIED |
| 37 | Lightning reach override | Load **Dungeon Rebalanced** and play the warlock: lightning bolts strike enemies up to about six tiles from where the orb lands, not three. This proves a scenario's copy of a projectile unit (`players/warlock/projectiles/lightning_bolt.unit`) replaces the game's. | VERIFIED |
| 38 | Priest beam mana | With **Original beam mana cost** ticked (or either preset), a fresh priest's 70 mana lasts about 5 seconds of beam instead of about 2.5, and the beam still hits every 0.2 s. Judge it with cripple aura **off**: while the aura is on, AE stops the priest's mana regen entirely, which is stock behaviour (`docs/discovery/priest-mana-regen.md`). | VERIFIED |
| 39 | Play-order file names | Generate with a mixed order (a lobby, a floor with a floor boss, a boss arena, a survival arena) and install. The scenario folder lists `01_…`, `02_…` in play order. In game, each exit lands at the next level's arrival point, and a new game starts in the `01_` level. File names now differ from the StartIDs (`floor0`, `boss0`), which only works if AE resolves `LevelExit`'s `Level` path and `StartID` independently. | VERIFIED |
| 40 | Closed lobby vendors | In a lobby with a vendor's columns all unticked (e.g. power and items), that vendor's sign is gone; only its empty stand remains. | VERIFIED |
| 41 | Colosseum vendors | Every Colosseum lobby has a working potion vendor and an item vendor, the item tier rising with the run (equipment_1 in lobbies 1–2 up to equipment_4 in lobbies 7–8). | VERIFIED |
| 42 | No hole beside narrow stairs | On Desert cave, Crystal cave, Dark cave and Battlements floors, the top wall runs unbroken up to both sides of the up and down stairs; you can't walk outside the map there. | VERIFIED |
| 43 | Bonus walls and pads | On a Bonus 1–5 floor: the walls are whole (no holes, nothing walkable outside the map) and corners and junctions look like corners and junctions. The party arrives on the bonus entrance pad; the exit is the lit bonus exit pad, and F on it with the whole party moves everyone on. No prison stairs. Locked doors are the flat bonus bars, lined up with the walls, and the matching bronze, silver or gold key opens them. | VERIFIED |
| 44 | Combo owned from the start | With **Fully upgraded**, kill a pack quickly: the combo bar fills, combo starts, and the level-5 nova fires and heals and restores mana. #31 passed for skills and shops, but combo never started, because AE counts combo kills only for a bought combo. The fix ships patched copies of `scripts/Behaviors/Actors/Player/Player.as` and `scripts/Behaviors/Effects/GiveCombo.as`. If combo still never starts, the game is not reading a scenario copy of Player.as. | VERIFIED |
| 45 | Traps spare stationary bosses | Fight the queen, then a dragon, with traps on all four walls in every tier. No trap fires straight into the boss: its health drops only from the party (and the odd stray from a trap with spread). A mobile boss such as the lich can still walk into a trap lane. | VERIFIED |
| 46 | Frost dragon seat | In a frost dragon arena, the dragon sits flush under the north wall, 16 px higher than before, as in the hand-edited `04_arena_boss3.lvl`, with no gap between its shoulders and the wall. | VERIFIED |
| 47 | Bonus Gauntlet torches | The Bonus Gauntlet preset has wall torches off, and the bonus floors are still bright enough to play. | VERIFIED |
| 48 | One dragon per lineup | A boss lineup naming both the dragon and the frost dragon shows an error and won't generate. | VERIFIED |
