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
| 11 | Floor shops | F at a shop room's stand opens it. | VERIFIED |
| 12 | Keys and doors | A key opens its colour's door, which then stays open. | VERIFIED |
| 13 | Final-room button | Pressing the button plays its click, animates the plate and removes the seal. With several buttons, each press shows "N buttons remain". | UNCONFIRMED |
| 14 | Mystery plates | A plate clicks once and spawns its loot or monsters; trap plates switch their spewers on (and off after the timer). | UNCONFIRMED |
| 15 | Floor traps | Wall spewers fire in the direction set, at the rate set. | UNCONFIRMED |
| 16 | Floor timer | The countdown ticks once a second, and the damage starts when it reaches 0:00. | UNCONFIRMED |
| 17 | Buff fields | The buff applies to the target set (players, monsters or both). | UNCONFIRMED |
| 18 | Boss portal | The last floor's red portal leads into the arena. | UNCONFIRMED |
| 19 | Boss bar | The boss's health bar shows its stock title. | UNCONFIRMED |
| 20 | Boss tiers | Waves start on entering and step up at 75/50/25% health; invulnerability windows count down; checkpoints save. | UNCONFIRMED |
| 21 | Boss death | The alcove seal opens when the boss dies. | UNCONFIRMED |
| 22 | Victory | Picking up the orb shows "Victory!" and then the game-over screen (`ShowGameOver`). | UNCONFIRMED |
| 23 | Floor boss | On a boss floor, killing the boss opens the sealed portal room. This was broken before 2026-10-10. | UNCONFIRMED |
| 24 | Music | Each level plays its chosen track (FMOD music mode). | VERIFIED |
| 25 | Respawn point | A player who dies after an exit comes back at the new level's arrival point. With 0 lives, this only matters for co-op revives. | UNCONFIRMED |
| 26 | Player skill values | Load the **OP test run** player preset, install, and play a warlock: every shop price is 0 and the dagger hits ×3 harder. This proves the scenario's copies of `players/<class>/skills/*.sval` replace the game's. | UNCONFIRMED |
| 27 | Player base stats | With the same preset, the wizard starts at 105 health instead of 35. This proves the scenario's copy of `players/classes.sval` is read. It may not be, because the game loads classes.sval for the character screen, possibly before any scenario. If health stays 35, say so: base stats then need a different route. | UNCONFIRMED |
| 28 | Per-class move speed | In **Move speed → Per class**, set one class to 2.0 and leave the rest. That class runs twice as fast and the others don't change. This relies on #27, because each class is pointed at its own copy of the speed skill through classes.sval. | UNCONFIRMED |
