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
| 10 | Walls | No gaps, no doubled or floating pieces, no wall art bleeding over floor. The tests prove each cell gets at most one piece; whether the art lines up is for the eye. Check every theme you use. | UNCONFIRMED |
| 11 | Floor shops | F at a shop room's stand opens it, and you can buy from it. Before 2026-10-10 F showed the prompt but never opened the shop (the UseTrigger didn't fire the ShopArea). | UNCONFIRMED |
| 12 | Keys and doors | A key opens its colour's door, which then stays open. | VERIFIED |
| 13 | Final-room button | Pressing the button plays its click, animates the plate and removes the seal. "The way to the final room has opened!" shows at the top of the screen. With several buttons, each press shows "N buttons remain" there too. On a timed floor (e.g. Shell Game) the countdown at the bottom must not wipe them. The final room's portal is the house's square pad. | UNCONFIRMED |
| 14 | Mystery plates | A plate clicks once and spawns its loot or monsters; trap plates switch their spewers on (and off after the timer). | UNCONFIRMED |
| 15 | Floor traps | Wall spewers fire in the direction set, at the rate set. | UNCONFIRMED |
| 16 | Floor timer | The countdown ticks once a second, and the damage starts when it reaches 0:00. | UNCONFIRMED |
| 17 | Buff fields | The buff applies to the target set (players, monsters or both). | UNCONFIRMED |
| 18 | Boss portal | The last floor's red portal leads into the arena. | UNCONFIRMED |
| 19 | Boss bar | The boss's health bar shows its stock title. | UNCONFIRMED |
| 20 | Boss tiers | Waves start on entering and step up at 75/50/25% health; invulnerability windows count down. (Boss checkpoints were removed 2026-10-11: co-op players revive each other, and a dead party chooses to restart at the previous lobby or at the fight.) | UNCONFIRMED |
| 21 | Boss death | The alcove seal opens when the boss dies. | UNCONFIRMED |
| 22 | Victory | Picking up the orb shows "Victory!" and then the game-over screen (`ShowGameOver`). | UNCONFIRMED |
| 23 | Floor boss | On a boss floor, killing the boss opens the sealed portal room. This was broken before 2026-10-10. | UNCONFIRMED |
| 24 | Music | Each level plays its chosen track (FMOD music mode). | VERIFIED |
| 25 | Respawn point | A player who dies after an exit comes back at the new level's arrival point. With 0 lives, this only matters for co-op revives. | UNCONFIRMED |
| 26 | Player skill values | Load the **HW2 Endgame** player preset, install, and buy the first health upgrade: health reads 384, the preset's patched value, which stock AE can't go above (300). This proves the scenario's copies of `players/<class>/skills/*.sval` replace the game's. | VERIFIED |
| 27 | Player base stats | With the same preset, the wizard starts at 105 health instead of 35. This proves the scenario's copy of `players/classes.sval` is read. It may not be, because the game loads classes.sval for the character screen, possibly before any scenario. If health stays 35, say so: base stats then need a different route. Confirmed with the HW2 Endgame preset: 366 mana is out of reach for any stock class (ranger max 200), and fits the patched base of 357 plus gear. | VERIFIED |
| 28 | Per-class move speed | In **Move speed → Per class**, set one class to 2.0 and leave the rest. That class runs twice as fast and the others don't change. This relies on #27, because each class is pointed at its own copy of the speed skill through classes.sval. | UNCONFIRMED |
| 29 | Wall torches | Torches hang flush on the rooms' north walls, flames lit, and none float in mid-air or sit inside a doorway, exit or trap shooter. **Lighting → Wall torches** changes how many there are (none, sparse, normal, dense). | UNCONFIRMED |
| 30 | Brightness | With **Lighting → Brightness** at Brighter (the default), enemies are visible away from torches. Daylight is clearly brighter, and AE stock is as dark as before. This also proves the scenario's copy of a lighting environment (`effects/lighting/*.env`) replaces the game's. | UNCONFIRMED |
| 31 | Bought skills owned from the start | Press **Fully upgraded**, install, and play a wizard: meteor shower, flame spray and the other bought skills are on the bar from the start, and the shop lists only their upgrades. This relies on AE reading `starting-level` from a scenario copy of a bought skill's `.sval`, which stock gives only the first skills. | UNCONFIRMED |
| 32 | Free potions and items | Press **Everything free**, install, and open the power shop and an item vendor: every potion, rejuvenation and item costs 0. Potions come from the scenario's copy of `scripts/GUI/Shop/PowerShopMenuContent.as` (already shipped for the extra-life fix); item prices come from its copy of `scripts/Data/Misc.as`, which nothing has replaced before. | UNCONFIRMED |
| 33 | Ranger bow heat off | Tick **Original Hammerwatch feel → Ranger bow never overheats** (or load the Original Hammerwatch preset), install, and hold fire as the ranger for several seconds. Arrows keep the same rate and fly straight; stock AE slows the shots and spreads them after about three arrows. This relies on `overheating-max` 0 in the scenario's copy of `ran_bow.sval`. | UNCONFIRMED |
| 34 | Original attack movement | With **Original movement while attacking** ticked: the wizard can't move from casting meteor until the last meteor lands; the paladin, wizard (fireball) and warlock (dagger) stand still while attacking; the ranger walks at half speed while shooting. Stock AE lets the wizard walk off a third of a second into meteor. | UNCONFIRMED |
| 35 | Original paladin swing | With **Original paladin swing speed** ticked, the paladin's sword hits on the click and swings about ten times a second when clicked or held, with the animation playing quickly. Stock swings about twice a second. | UNCONFIRMED |
