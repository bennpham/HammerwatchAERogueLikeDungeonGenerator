# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Upgrade tiers.**
  - On the Players tab, every skill upgrade with more than one tier has a **− / + / Reset** stepper. You can take tiers away, or add them past stock up to 99 (AE has no cap).
  - An added tier copies the last one and carries on its step: health, damage, radius, buff strength and price. A chance (dodge, crit, block) closes in on 99% and never reaches it. Every added tier is editable like a stock one.
  - Upgrades that work through a buff (combo heal and mana, poison, chill, nova slow and the rest) get a new buff level for each added tier.
  - The quick setup's **Upgrade tiers** row sets every upgrade to the same count in one go.
  - Added tiers sell from the upgrade's tier-5 shop column, so a lobby needs those columns to sell them; the app warns when none does.
- **Fully upgraded with added tiers.** **Fully upgraded** now owns the stock tiers only, so tiers you add stay for sale. The skill shop script is patched so it lists the right next tier when some are owned from the start.

## [0.1.0] - 2026-10-21

The first official release. This is a port of the [Hammerwatch 1 remake](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake), forked from its 0.9.5, to **Hammerwatch Anniversary Edition**. It makes the same kind of campaigns (floors, lobbies, boss and survival arenas, and the floor order between them), but builds them out of AE's own levels, assets, scripts and player files. It has no Hammerwatch 1 output. The entries below describe what's different from the remake.

### Added

- **AE scenarios.** A campaign is written as an AE scenario: one `.lvl` per slot, `info.xml` and `logos.png`. It shows in the scenario list as **Dungeon #&lt;seed&gt;**. Level files are numbered in play order (`01_lobby1.lvl`, `02_floor1.lvl`, …).
- **Install into Hammerwatch AE.** One button writes the scenario into `<AE>/scenarios`, packs it into a `.h1c` with the game's own `PACKAGER.exe` and removes the unpacked folder. The app finds the AE install on first run, in the usual Steam folders and in every Steam library. **Export folder…** and **Export .zip…** are still there for packing by hand. On Linux and macOS, `PACKAGER.exe` runs through `wine`.
- **AE themes.** 22 wall sets in five groups:
  - Castle Hammerwatch: prison, armory, archives, chambers.
  - Shaftlocke Tower: prison2, crypt, armory2, archives2, chambers2, battlements, mines, challenge.
  - Temple of the Sun: pyramid, pyramid fancy.
  - Caves: desert, crystal, dark.
  - Bonus: bonus1–bonus5, with their own flat walls, entrance and exit pads, and keyed bars.
- **AE monsters and bosses.** The roster covers AE's actors, including the Shaftlocke Tower and Temple of the Sun monsters, their bosses (golem, warden, wraith, eye, vampire, frost dragon, worm, Krilith, Anubis) and the boss adds. Shaftlocke brings three mini-bosses of its own: its skeleton wizard (fireball bursts, glyph traps, blink), the blue-coated skeleton guard and the maggot that spawns grubs. The boss pickers group bosses by campaign.
- **The house lobby.** The default lobby is a hand-made AE editor level, the **house**. Its diamonds and upgrades lie where they were placed in the editor. More lobbies can be imported from the AE editor (`docs/LOBBY-AUTHORING.md`). The classic presets shop in their own campaign's stock room: Castle on the Castle Hammerwatch bridge, Desert in the Temple of the Sun bazaar, Shaftlocke Tower in Shaftlocke's town. Each stock room lays its gold and free upgrades on fixed spots, stacking the diamonds however big the purse: the bazaar under its stall, Shaftlocke in two houses by the square. A large purse no longer spills onto the bazaar's hills or into Shaftlocke's trees. The bazaar's way on is the pad on the sun circle in its temple courtyard, not the square's teleporter. The **Crystal Mines shop** is survival's shop rebuilt round a red room: glass walkways leave its four doorways for the stall islands over the void, and the way on is the teleporter on the east walkway. Every lobby's teleporter is blue before a dungeon floor and red before a boss or survival arena, as a floor's portal is.
- **Item vendor.** A sixth vendor sells AE equipment from AE's five item tiers. Each tier is 5 random items: tier 1 is all common, tiers 2–3 are common and uncommon, tier 4 adds rares, and tier 5 always has one epic. The Lobby tab shows each tier as five slot pips coloured by rarity, with its price range and a list of every item by rarity. A new lobby sells tiers 2–3, and a boss-prep lobby also sells tier 4. Floor shop rooms roll the item vendor along with the skill vendors (the **Shop room vendors** section on the Dungeon tab). Its tier is random: common/uncommon 70, rare 20, epic 10 by default. The stand shows its tier number. A lobby vendor with no columns ticked is removed from the room.
- **Items on mystery plates.** A plate can drop a unique item by name, a **random unique** (the *Lucky find* button), or a random rare or epic item. Uniques are never sold in shops.
- **Speed pickups.** AE's speed and attack-speed upgrades (I and II) and the speed potion (double move, attack and cast speed for 10 seconds) can drop from boss wave tiers, survival rounds and mystery plates. The starter plate set has a button for each.
- **The Wraith's statue.** The Wraith is immortal until its statue breaks, as in stock. Every Wraith, on a floor or in an arena, now stands with its own statue (1200 hp, novas when hit), within 6 tiles of it. Breaking the statue makes that Wraith mortal, and keeps it mortal until it's been hurt, however far away the statue was broken from. Before this the Wraith was placed alone and could never die, so its floor never opened.
- **Shaftlocke Tower**, a classic preset: Castle's shape on Shaftlocke's tilesets, music and monsters. Seven floors up the tower (prison, crypt, the gold-beetle mines, archives, chambers), then a random Shaftlocke boss in a chambers arena and an escape back through the chambers. It shops in Shaftlocke's town and pools every enemy the stock tower places.
- **Shaftlocke Siege**, a Claude preset built only from Shaftlocke's own content: six floors from the prison to the chambers, the town lobby and the tower music. The Wraith holds the crypt (smash its statue first) and the Golem the mines. Light bolts, dark beams and ballista bolts fire from the walls, bannermen, trappers and battlemages fill the upper floors, and the campaign ends on the Eye, the Vampire, the frost dragon or the Seeress.
- **Players tab for AE.** It edits AE's `players/` data: each class's base stats, and every skill's prices and numbers tier by tier (binds, cooldowns, cast speed, move speed while attacking, the ranger bow's heat).
  - **Quick setup:** multipliers for prices, damage, health, mana and armor.
  - **Move speed:** set for everyone, for melee and ranged separately, or per class.
  - **Everything free:** every skill, potion and item costs 0.
  - **Fully upgraded:** every class owns every skill and upgrade at its top level from the start, combo included.
  - **Potions and items:** their prices are their own section.
  - **Combo and lightning:** the combo's mana and health regen and the warlock's lightning reach can be edited.
- **Original Hammerwatch feel.** Switches on the Players tab bring back the original game's ranger bow (never overheats), its movement while attacking, the paladin's swing speed, the combo rewards, the priest's beam mana cost and the warlock's chain lightning.
- **Player presets.** *Dungeon Rebalanced*, *Original Hammerwatch* (and a rebalanced version), and Hammerwatch 2 bodies at level 1, 10, 25 and 50.
- **Wall-top cover.** Floors and boss arenas are capped with the wall set's colour over the solid rock, as stock levels are, so south walls no longer show their faces from behind. The bonus sets have no cover.
- **Lighting.** Floors get wall torches on their north walls (**Wall torches**: none, sparse, normal, dense). **Brightness** (AE stock, Brighter, Bright, Daylight) lifts the themes' lighting; the default, Brighter, keeps enemies visible away from torches.
- **The game's files stay out of the repo.** Player balance, prices, lighting and the shop fix are line patches. The install applies them to a copy of your own game files and ships that copy inside the scenario.

### Changed

- **Always 0 lives.** `info.xml` forces AE's *No lives* modifier, and it can't be turned off. A player who dies arrives on the next level as a gravestone, and a living player has to revive them. The power shop no longer sells an extra life.
- **Exits are press-F and need the whole party.** Stairs, portals and pads all show the "gather the party" message to a player on their own.
- **Theme ids use AE names** (`prison`, `crypt`, `mines`…) instead of `a`, `b`, `c`.
- **Old `parameters.txt` files still import.** HW1 monster, theme and music ids are translated to their AE counterparts. Old HW1 player keys are reported as unknown.
- **Trap lanes spare stationary bosses.** AE bosses take trap damage, which they never did in the original, so no trap is aimed straight at the queen or either dragon.
- **One dragon per fight.** A boss lineup naming both the dragon and the frost dragon shows an error; random picks never roll both.
- **Announcements keep their place.** A timed floor's countdown no longer wipes the "final room opened" and "N buttons remain" lines.
- **Colosseum lobbies** each have a potion vendor and an item vendor, with the item tier rising over the run.
- **Claude presets retuned for AE.** They were tuned in the HW1 remake.
  - **Boss hunts:** Beat the Clock and Shell Game give five minutes instead of three. The boss is drawn from the ones with 2500 HP or less (the Knight, Krilith, the Worm, the Wraith and the Golem), because AE attacks are slower than the original's.
  - **Fixes:** Double or Nothing's extra-life prize did nothing under *No lives*; it's now the *Heirloom*, a unique item and a red diamond. The Long Haul escape floor fires at the classic presets' AE rate (1.5 s).
  - **Boss pools:** Pandemonium's first two floors draw from the lighter bosses.
  - **New content:** Shaftlocke, Temple of the Sun and AE-only monsters, traps and plates in the presets they suit. Boss Rush meets the Warden, Trap Gauntlet fires poison darts, light bolts, flame jets, dark beams and ballista bolts, and Frozen Descent ends on the frost dragon after Krilith. The Long Haul's desert act has scorpions, the temple skeletons and the desert archers.
- **Nothing hides behind south walls.** An AE south wall draws over the room's last two floor rows, so lock buttons, keys, lock powerups and mystery plates are no longer placed there.
- **Escape floors fire every 1.5 seconds**, not every second. Each wall still fires 8 fireballs.
- **Long countdowns warn later.** A floor timer's countdown warns about file size past 5 minutes instead of 200 seconds.

### Removed

- **Hammerwatch 1 output.** The app makes AE scenarios only.
- **Boss checkpoints.** AE doesn't need them: co-op players revive each other, and a dead party chooses to restart at the previous lobby or at the fight. Old `Checkpoints` lines are read and dropped.
- **Lobby save points.** AE saves on arriving at a level. Old `lobbySaves` lines are read and dropped.
- **The HW1 tweak editor**, replaced by the AE Players tab.
- **The generated lobby room.** Every lobby is now an AE editor level. Old files that name it (`lobbyNPreset=standin`) load the house.
- **The Anniversary Edition player preset**, which made the original game play like AE. *Original Hammerwatch* does the reverse here.

### Notes

- **Verified in game.** 82 of the 89 rows of `docs/BOOT-CHECKLIST.md` have been confirmed in play, from the scenario loading to the boss fights, the player patches, the Colosseum survival rounds, every stock lobby and both Shaftlocke presets.
- **Not yet played:** the Lucky find unique on a plate (#59), the speed pickups (#64), the five-minute boss hunts (#65), Frozen Descent's finale (#67), the Wraith statue's timer (#82), the bazaar's courtyard exit (#84) and the red lobby portal outside the Castle bridge (#85). The Wraith's statue was played on a floor, not in an arena or with two Wraiths.
- **Still a guess:** the names given to Shaftlocke Tower's music modes 20 and 21. The music plays either way.

[0.1.0]: https://github.com/bennpham/HammerwatchAERogueLikeDungeonGenerator/releases/tag/v0.1.0
