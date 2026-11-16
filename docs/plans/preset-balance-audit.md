# Campaign preset balance audit

Date: 2026-11-14. Covers the 17 campaign presets in `src/generator/config/presets.ts`, `claudePresets.ts` and `colosseumPreset.ts`, and how the 7 player presets in `src/generator/players/presets.ts` bear on them.

Nothing here was played. Each finding is marked:

- **computed**: worked out from the presets' own numbers and the stock prices and health in `players/stock.generated.ts`.
- **read**: seen in the preset code, with no number to back it.
- **needs play**: the code suggests a problem, but only a run can confirm it.

Nothing was changed. The fixes are proposals.

## Summary

Nothing is clearly broken. Five things are worth acting on, in this order:

1. The hunt-floor timers in Shell Game and Beat the Clock kill a party in one to four seconds once they expire (B1).
2. The two random multi-boss finales draw from all 14 bosses, so their difficulty swings widely from seed to seed (B2).
3. Bonus Gauntlet hands out 25000 gold and twelve free upgrades before an ordinary single-boss fight (B3).
4. The Long Haul runs six floors in a row without a town (B4).
5. Lobby gold only ever reaches skill tiers 1–2, and how much gold the floors add has never been measured (B5).

The rest (section C) is minor or by design.

## A. The numbers

### A1. What skills cost (computed)

The sum of every stock skill price in each shop column, per class:

| Class | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 | Everything | Base health |
|---|---|---|---|---|---|---|---|
| Paladin | 7700 | 17100 | 32100 | 41600 | 48000 | 146500 | 75 |
| Ranger | 7700 | 16800 | 32200 | 45900 | 58800 | 161400 | 50 |
| Thief | 6900 | 21100 | 33150 | 38700 | 38800 | 138650 | 40 |
| Wizard | 8500 | 14500 | 30800 | 48000 | 62400 | 164200 | 35 |
| Sorcerer | 7600 | 16500 | 33800 | 49500 | 62400 | 169800 | 35 |
| Priest | 7900 | 17850 | 38000 | 47900 | 55300 | 166950 | 30 |
| Warlock | 7950 | 20200 | 35800 | 56300 | 60700 | 180950 | 75 |

A single tier-1 skill costs 150 to 2000. Two rules of thumb follow:

- 10000 gold buys roughly one class's whole tier-1 column.
- 30000 gold buys roughly tiers 1 and 2. Tiers 3 to 5 cost another 110000 to 150000.

Whether co-op players share one purse or split the diamonds is not checked here (**needs play**). If they split, divide every lobby figure below by the party size.

### A2. Lobby gold per preset (computed)

| Preset | Floors | Arenas | Lobby gold | Free upgrades |
|---|---|---|---|---|
| Castle | 8 | 1 | 10000 + 20000 | – |
| Desert | 7 | 1 | 10000 + 20000 | – |
| Shaftlocke Tower | 8 | 1 | 10000 + 20000 | – |
| Bonus Gauntlet | 6 | 1 | 10000 + 25000 | 12 |
| Survival in Colosseum | 0 | 20 | 1000 rising to 4500 over 8 lobbies (22000) | 2 in each lobby after the first |
| Arena Marathon | 1 | 4 | 10000 + 20000 + 25000 | 12 |
| Beat the Clock | 5 | 1 | 10000 + 20000 | – |
| Boss Rush | 4 | 1 | 10000 + 25000 | 12 |
| Double or Nothing | 5 | 1 | 5000 + 10000 | – |
| Frozen Descent | 5 | 1 | 10000 + 20000 | – |
| Lunch Break | 3 | 1 | 15000 | – |
| Pandemonium | 4 | 1 | 10000 + 20000 | – |
| Shaftlocke Siege | 6 | 1 | 10000 + 20000 | – |
| Shell Game | 5 | 2 | 10000 + 20000 | – |
| The Long Haul | 13 | 2 | 10000 + 15000 + 20000 + 25000 | 12 |
| Trap Gauntlet | 5 | 1 | 10000 + 20000 | – |
| Pre-Alpha | 8 | 0 | none | – |

Every lobby outside the Colosseum sells all five skill tiers from the first room. Only the Colosseum gates tiers by lobby.

### A3. Floor timers after expiry (computed)

Damage per second once the countdown ends, and how long a fresh character lasts. Armor and health upgrades are not counted, and whether armor reduces the hazard is unverified.

| Preset and floor | Damage per second | Priest (30) dies in | Paladin (75) dies in |
|---|---|---|---|
| Escape floors (Castle, Desert, Shaftlocke, Bonus, Long Haul floor 13) | 10 | 3.0 s | 7.5 s |
| Beat the Clock, floors 1–4 | 8 → 14.6 | 3.8 → 2.1 s | 9.4 → 5.1 s |
| Beat the Clock, floor 5 (the hunt) | 20 | 1.5 s | 3.8 s |
| Shell Game, floors 1–4 | 15 → 24 | 2.0 → 1.3 s | 5.0 → 3.1 s |
| Shell Game, floor 5 (the hunt) | 30 | 1.0 s | 2.5 s |
| The Long Haul, floor 8 | 0.5 | 60 s | 150 s |

## B. Findings worth acting on

### B1. Hunt-floor timers are instant wipes (computed; needs play)

On the last floor of Shell Game and Beat the Clock the party has 300 seconds to find and kill a roaming boss. When the clock runs out the hazard deals 30 and 20 damage per second. With lives always at 0, that ends the run within four seconds, at the end of a 35 to 40 minute preset.

The short floors before it are meant to be steep, and there the party can still sprint to an exit. On the hunt floor there is no exit until the boss is dead, so expiry is a loss, not pressure.

**Proposed fix:** keep the 300 seconds but soften the hunt-floor hazard to about 5 damage per second (damage 1 every 200 ms), so a party that is mid-fight when it expires has 6 to 15 seconds to finish. Play one run of each first.


**Ben take:** Well no one knows its a 5 damage per second since nothing indicates them. Why not give them more time to go kill the boss like 8 or 10 minutes? Depends on some build, yes it's kind of crazy since the boss might wreck them.

### B2. Random multi-boss finales swing too far (read)

- Pandemonium's finale draws 6 bosses from all 14.
- Arena Marathon's finale draws 3 from all 14.

The dragons and the queen can each appear once, so a draw can stack both dragons and the queen with three mobile bosses, or contain none of them. The same preset can be a very different fight on two seeds. Pandemonium's only allowance is food ×1.6 on the floors, which doesn't apply in the arena (its arena food is the stock ×1.2).

**Proposed fix:** give each finale a curated pool or a fixed lineup. For example, Pandemonium takes at most one static boss plus five from the mobile list, which is how its floors already work (floors 1–2 draw from 6, floors 3–4 from 11).

### B3. Bonus Gauntlet's last lobby is too generous (computed; needs play)

Four presets pay 25000 gold and one of each of the twelve upgrades before the finale. For three of them the payout offsets a hard finale: Boss Rush (dragon and queen together), Arena Marathon (three bosses) and The Long Haul (13 floors in). Bonus Gauntlet's finale is one ordinary boss with stock waves.

**Proposed fix:** drop Bonus Gauntlet's last lobby to 20000 gold with no free upgrades, matching the other classics, or keep the upgrades and make its finale two bosses.

**Ben take:** HARD DISAGREE. I playtested many times and I did the 20000 gold with free upgrades ON PURPOSE. You're going to make some of my playtesters cry about being too hard again. Hard decline.

### B4. The Long Haul's third act has no town (read)

The order is lobby, 3 floors, lobby, 3 floors, lobby, arena, **6 floors**, lobby, arena, escape floor. The six-floor stretch is the hardest content (temple, bonus and mini-boss pools) and the longest gap between towns. Its only shops are whatever the floors roll.

Two smaller points in the same preset:

- The knight is the floor-3 boss and is also in the first arena's pool (lich or knight), so a run can fight him twice in six floors.
- Floor 8's timer has no countdown shown. At 0.5 damage per second that is mild, but the party is never told why it is losing health.

**Proposed fix:** add a lobby after floor 9 (15000 to 20000 gold), make the first arena the lich only, and turn the countdown on for floor 8.

### B5. Lobby gold stops at tier 2, and floor gold is unmeasured (computed)

A standard preset pays 30000 in lobby gold, enough for tiers 1 and 2 of one class (A1). Reaching tier 3 or higher depends on gold found on the floors, at `goldMultiplier` 1.1. Nobody has measured how much a floor yields, so the audit can't say whether a 5-floor preset ends at tier 2 or tier 4.

This matters most for the presets that cut monsters (Double or Nothing and Trap Gauntlet at ×0.6, Shell Game at ×0.5), since fewer monsters probably means fewer drops, and Double or Nothing also halves the lobby gold.

**Proposed fix:** write a dev script that generates each preset on a few seeds and sums the gold pickups per floor, then set lobby gold against the A1 table on purpose. This is also the input the Campaign Mode plan needs for its town gold.

## C. Minor or by design

| # | Finding | Kind | Note |
|---|---|---|---|
| C1 | Bosses have no health scaling. The last boss of The Long Haul is exactly as tough as Lunch Break's. | read | A generator limit, not a preset fault. Presets can only escalate through waves, boss count and invulnerability. |
| C2 | Monster variant tiers don't scale with depth, so "deeper is harder" rests on the pools. The classics' pools do escalate. | read | Fine as it stands. |
| C3 | Several Claude presets use two monster types per floor (Boss Rush, Pandemonium, Double or Nothing, most of The Long Haul). Shell Game's first floor has one (bats). | computed | These presets are about bosses, plates or traps, so thin pools are a reasonable choice. Three or four types a floor would add variety at no risk. |
| C4 | Lunch Break pays 15000 for three small floors and a boss at ×0.6 monsters with 15-second invulnerability. | computed | Easy by design. |
| C5 | Double or Nothing pays 15000 in total. | computed | Scarcity is the point: the plates are the income. See B5 for the unmeasured part. |
| C6 | The Colosseum opens on 1000 gold. | computed | Enough for one to three tier-1 skills (150 to 2000 each). Fine. |
| C7 | Castle, Shaftlocke Tower and Desert have one town at the start and one before the boss, six or seven floors apart. | read | The classic shape. The Campaign Mode plan is the answer for players who want a town every three floors. |
| C8 | No campaign preset is tuned for a player preset. The Hammerwatch 2 Level 50 bodies (280 to 507 health, against a stock 30 to 75) outlast every timer in A3 several times over and flatten every preset. | computed | Leave it. The player presets are a separate choice, and the Level 50 one is plainly a power fantasy. Worth one line in the preset dialog. |

## D. Not balance, but found on the way

- Two descriptions don't count the escape floor: Castle says "7 floors" and has 8, Bonus Gauntlet says "5 floors" and has 6. Both are right if the escape floor is not a "floor"; say so or change the number.
- `README.md`'s preset table leaves out Shaftlocke Tower and Shaftlocke Siege.
- Comments in `presets.ts` and `claudePresets.ts` still say "three classic presets"; there are four.

## How the numbers were made

A throwaway script built every preset with `CAMPAIGN_PRESETS[i].build()` and printed its order, lobbies, locks, timers, floor bosses, fights and pools. Prices and health came from `PLAYER_STOCK` (`players/stock.generated.ts`): each skill tier's `cost.stock`, grouped by the digit of its `category`. Timer damage per second is `damage × 1000 / freqMs`. The script was not committed.
