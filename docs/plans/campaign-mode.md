# Campaign Mode presets

Date: 2026-11-14. A plan, not built. It needs no generator change: everything here is preset data.

## What it is

A new preset group, **Campaign Mode**, with one preset per stock campaign: Castle Hammerwatch, Shaftlocke Tower and Temple of the Sun. Each plays like the game's own campaign:

1. Start in the family's town.
2. Clear three floors.
3. Reach the town again. It now sells one more tier of skills and items.
4. Fight the act's boss.
5. Repeat for the next act. The run ends when the last boss dies.

As a slot order: `L1, 1, 2, 3, L2, B1, 4, 5, 6, L3, B2, …` ending on a boss arena.

The existing classics have one town at the start and one before the only boss. The closest existing preset is The Long Haul (acts of three floors with lobbies between), but its lobbies are all the house and sell everything from the start.

## The three presets

### Castle Campaign: 4 acts, 12 floors

| Act | Floors | Theme | Monsters | Boss | Music |
|---|---|---|---|---|---|
| 1 | 1–3 | `prison` | vermin and flowers, then the first skeletons | `boss_queen` | act1 |
| 2 | 4–6 | `armory` | skeletons, archers, soldiers | `boss_knight` | act2 |
| 3 | 7–9 | `archives` | eyes, wisps, liches | `boss_lich` | act3 |
| 4 | 10–12 | `chambers` | the mini-boss floors | `boss_dragon` | act4 |

- Town: `castle_bridge`, five times.
- Arenas use the act's own theme. The dragon's plays `boss_final`.
- Pools start from the tuned castle pools in `parameters.ts:2140-2183`, three floors per act instead of two.
- No world. The castle has no outdoors.

### Shaftlocke Campaign: 4 acts, 12 floors

| Act | Floors | Themes | Monsters | Boss |
|---|---|---|---|---|
| 1 | 1–3 | `prison2` ×3 | prison roster | `boss_warden` |
| 2 | 4–6 | `crypt`, `crypt`, `mine_granite` | crypt roster, then the gold-beetle mines | `boss_wraith` or `boss_golem` |
| 3 | 7–9 | `armory2`, `archives2`, `archives2` | bannermen and trappers | `boss_eye` or `boss_vampire` |
| 4 | 10–12 | `chambers2`, `chambers2`, `battlement` | the tower council | `boss_seeress` or `boss_dragon_hwr` |

- Town: `shaftlocke_town`, five times.
- Music `shaftlocke_20` on the floors and `shaftlocke_21` in the arenas, as the Shaftlocke Tower preset does.
- Pools start from `presets.ts:849-894` and Shaftlocke Siege (`claudePresets.ts:1518-1525`).
- Seven bosses and four acts, so acts 2 to 4 each pick one of two at random. No boss can repeat.
- No world. The town is the outdoors, and the rest is a tower climb.

### Desert Campaign: 3 acts, 9 floors, one island

| Act | Slots | Themes | Monsters | Boss |
|---|---|---|---|---|
| Opening | one island | `desert` biome, 128 tiles | the `temple` monster theme, light packs | – |
| 1 | floors 1–3 | `cave_desert` ×3 | bugs, scorpions, the outdoor swarms | `boss_worm` |
| 2 | floors 4–6 | `cave_crystal` ×3 | frost roster | `boss_krilith` |
| 3 | floors 7–9 | `pyramid_inside`, `pyramid_fancy`, `pyramid_fancy` | temple guards, mummies, the mummy mini-bosses | `boss_anubis` |

- Town: `sun_bazaar`, four times.
- The order opens `L1, W1, 1, 2, 3, L2, B1, …`. The island has three buttons and no boss. Finding the buttons opens the portal down into the caves. Temple of the Sun starts outdoors, so this fits.
- Pools start from `presets.ts:724-791` and The Long Haul's temple act (`claudePresets.ts:1121-1123`).
- The Temple family has only two tilesets, so the caves carry acts 1 and 2.
- **The island is optional.** Without it the preset is nine floors and nothing else changes. Drop it if the first mixed campaign should wait until the Open World group has been played.

## The tier lock

A town's `shopCategories` decides which skill and item columns it sells. Each town adds one tier to the one before, the way `colosseumPreset.ts:108-145` already does. A skill tier can only be bought if a town sells its column, so this is the whole lock. There is no new parameter.

| Town | Castle and Shaftlocke | Desert | Items | Gold (draft) |
|---|---|---|---|---|
| Start | skills tier 1 | tiers 1–2 | `equipment_1` | 5000 |
| Before boss 1 | tiers 1–2 | tiers 1–3 | `equipment_1`–`2` | 10000 |
| Before boss 2 | tiers 1–3 | tiers 1–4 | `equipment_2`–`3` | 15000 |
| Before boss 3 | tiers 1–4 | tiers 1–5 | `equipment_3`–`4` | 20000 |
| Before boss 4 | tiers 1–5 | – | `equipment_4`–`5` | 25000 |

Desert stops at the fourth row and jumps its items to `equipment_4`–`5` there.

- "Skills" means all four vendors: `combo`, `def`, `misc` and `off`. The `power` column is sold in every town.
- **Floor shop rooms are not locked.** They keep rolling whatever they roll, so a lucky find underground can be a tier ahead of the town. That is deliberate.
- The gold column is a draft. A class's tier columns cost about 7500, 17500, 33000, 47000 and 55000 (see [preset-balance-audit.md](preset-balance-audit.md), A1), so these payouts cover about half of each new tier and the floors must supply the rest. The audit's item B5 (measure floor gold) should be done before these numbers are fixed.
- No free upgrades in any town. The audit found them too generous before a single boss.

## Difficulty by act

The generator has no per-act monster multiplier and no boss health scaling, so each act gets harder through:

- **Pools.** Each act's three floors step up within the act and across acts.
- **Arena waves.** Act 1 uses a light table like `lightArenaWaves` (`claudePresets.ts:160`). The last act uses the family's full table (`castleWaves`, `shaftlockeWaves`, `desertWaves`).
- **Invulnerability.** 15 seconds per threshold in act 1, rising to the stock 30 by the last act.
- **Arena size.** 32–42 in act 1, the stock 42–64 in the last act.

Other rigs, kept light so the acts stay the point:

- A lock button on the third floor of each act. It leads to a portal, and `withGatewayLocks` (`parameters.ts:667`) derives exactly these floors.
- Mystery plates: one on the first floor of an act, two on the others, from `shallowLoot`, `midLoot` and `deepLoot` in `presetMystery.ts`.
- No floor timers, no escape floor, no floor bosses, no survival arenas.

Estimated length: three to four hours for the 12-floor presets, two and a half to three for Desert. Each description should say so.

## Building it

- **New file** `src/generator/config/campaignModePresets.ts`, exporting `CAMPAIGN_MODE_PRESETS`.
- **Shared helpers.** `campaign`, `L`, `F`, `B`, `floorRange`, `lobby` and `bossFight` are private to `claudePresets.ts` (lines 72–205). Move them to a small shared module, or export them, so both files use one copy.
- **One builder for all three.** An `acts()` helper takes the town id, the acts (themes, pools, boss pool, music) and the tier table, and returns the order, the lobbies and the fights. The three presets are then three data tables.
- **The group.** Add `campaign` ("Campaign Mode") to `PresetGroupId` and `PRESET_GROUPS` in `config/presets.ts:31-38`, after Classic, and the presets to `CAMPAIGN_PRESETS` (`:1089-1094`). The dialog reads the group list as data (`PresetGuide.tsx:116`), so the UI needs nothing.
- **Don't put them in Classic.** That group's tests require an escape floor after the boss.

Two round-trip traps, both already documented in `claudePresets.ts`:

- Lobby index 1 must set `music` explicitly, or re-importing the saved `parameters.txt` gives it the default's `boss_1`.
- Leave `levelBoss` unset. These presets have no floor bosses.

## Tests

The per-preset checks in `tests/presets.test.ts:328-411` already cover any new preset: it validates, generates on a fixed seed, is deterministic and round-trips through `parameters.txt`. Add:

- The group exists and holds exactly these three presets.
- The order is the act shape: every boss slot is preceded by a lobby, and every lobby after the first by exactly three floors.
- Each town's skill tier is one higher than the last and ends at 5.
- Each preset uses its family's town on every lobby.
- Desert's island is first after the start lobby and uses the `desert` biome.
- No boss id appears in two acts' pools.

## Play checks

Add to `docs/BOOT-CHECKLIST.md` when the presets are built:

- A town after floor 3 shows only the tiers it should, and its item stand wears the right badge.
- The portal out of a town is red (a fight follows) and the portal out of an arena leads to the next act's first floor.
- Returning to the same town room five times reads as progress, not repetition.
- Gold: at each town, a player can afford some but not all of the new tier.

## Open questions

1. Whether Desert keeps its opening island (recommended: yes, but it is the first mixed campaign anyone will have played).
2. Whether Shaftlocke should have five acts, since it has seven bosses and eight themes. Four keeps it the same length as Castle.
3. The town gold, after floor gold has been measured.
