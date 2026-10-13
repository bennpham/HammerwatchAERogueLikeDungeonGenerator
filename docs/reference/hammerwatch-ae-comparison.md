# Hammerwatch vs Anniversary Edition — player balance

How the original game's player tweak values (`src/generator/tweak/baseline.ts`,
transcribed from the stock `tweak/*.xml`) compare with **Hammerwatch
Anniversary Edition (AE)**. Compiled 2026-10-08 from AE's unpacked assets
(`Hammerwatch Anniversary Edition/unpacked_assets_66/players/`: `classes.sval`
and `<class>/skills/*.sval`, plus `tweak/buffs/buffs.sval` and
`scripts/GUI/Shop/PowerShopMenuContent.as`). This is the source for the
**Anniversary Edition** player preset (`src/generator/tweak/presets.ts`).

AE runs on a newer engine with its own `.sval` data, so most values had to be
matched by meaning rather than by key. AE's paladin is the original's knight.

## Reading AE's numbers

- **Units.** AE uses milliseconds where the original uses seconds, and pixels
  where it uses tiles (16 px per tile). Mana and health regen are per second
  in AE and **ms per point** in the original (`1000 / AE value`). Percent
  chances (bash, crit, dodge, kill-heal, frost shield, chill) are 0–1 in AE and
  0–100 in the original. The thief's `knives-speed-mod` is `AE move-speed-mul − 1`.
  The priest's `smite-speed-pen` is `(1 − AE mul) × 100`.
- **Tier nesting.** A shop ladder's first tier is usually a `modifier-skills`
  entry, and later tiers are its nested `upgrades`. For health, mana, armor and
  a few skills, the first tier is the skill's own top-level `cost`.
- **Damage scale.** Enemy HP is the same in both games (tick 16; bats
  3/5/35), so an AE damage number means the same thing in the original. AE's
  fireball has no separate splash damage: one `Explode` deals `proj-damage`
  to everything inside `proj-radius`.
- **Tier counts.** Every ladder has the same number of tiers in both games.

## What differs (copied into the preset)

| Unit | Original → AE |
|---|---|
| shared | `move-speed` 0.9 → AE ranged 1.0 / melee 1.2 (shop 1.1–1.3 / 1.3–1.5). The original has one shared key, so the preset uses **1.1** (shop 1.2/1.3/1.4). `combo-timer` 0.75 → 1.0, tiers 1/1.25/1.5/1.75/2 → 1.25/1.5/1.75/2/2.25 s. `pot-dmg` cost 300 → 1000 |
| knight | `sword-dmg` 9 → 13, tiers 14/20/26/32/38 → 20/26/33/40/46. Costs: dmg1 800 → 600, arc1 250 → 200, health-2..5 1200/1800/2400/3000 → 1000/2200/2900/3600. Armor tiers 4/5: 9/10 → 10/12. Mana regen tiers 2–5: 900/800/700/600 → 909/833/769/714 ms (AE 1.1/1.2/1.3/1.4 per s) |
| thief | knives-dmg tiers 1–3: 8/12/16 → 7/11/15. Costs: dmg1 800 → 700, aspeed1 250 → 150 |
| wizard | `fireball-dmg` 10 → 16, tiers 14/18/22/25/28 → 21/26/30/35/40. Costs: dmg1 800 → 650, rng1 500 → 400, health-2 1500 → 1000 |
| sorcerer | Costs: dmg1 800 → 700, rng1 500 → 450, health-2 1500 → 1000 |
| priest | Costs: dmg1 600 → 500, sspeed1 250 → 150 |
| ranger | Costs: dmg1 800 → 700, pen1 700 → 550, armor-3/4 2000/2700 → 1800/2400 |
| warlock | Costs: dmg1 800 → 700, dmg4/5 3800/4800 → 3900/5200, poison1 250 → 200. `lightning-mana-cost` 25 → 20, tiers 28/31/34/37 → 23/26/29/32 |

Everything else in the nine class files matches, either exactly or after unit
conversion within a rounding step. That includes base health, mana and regen,
every other price, meteor, nova, comet, ice orb, chill, beam, draining field,
cripple aura, bow, bomb, flurry, crit, dodge, growth, poison, storm, kill
mana/heal and the gargoyle's stats.

## Differs, but not copied

- **Extra lives.** AE sells them (350g, `PowerShopMenuContent.as`), but this
  generator's campaigns never do, so the preset keeps
  `player.shared.remove.life`. That is a house rule, not an AE difference.

- **Built differently in AE, so the numbers aren't comparable:**
  - **Wizard flame spray:** AE fires 2 piercing projectiles every 150 ms (damage 4…18, mana 2…4).
  - **Ranges and projectile speeds:** fireball range, shard bounce, comet drop distance, smite range, bow projectile speed, thief chain speed.
  - **Knight:** charge distance and speed (AE uses `20x+10` px and `2x+3`), sword and whirl reach.
  - **Warlock lightning:** AE adds a flat 10-damage orb hit and a 0.75× falloff per bounce.
  - **Warlock gargoyle:** AE fires a fan of 3 projectiles every 250 ms.
- **Only changeable by editing a buff file:** the thief smoke stun is 5000 ms in the original and 2000 ms in AE.
- **AE data that contradicts AE's own description text (the original value is kept):**
  - knight whirl-dur tier 2: AE's data says 6000 ms, its text says 8 s;
  - priest smite-speed tier 5: data 0.4, text 40;
  - priest mana-regen tier 5: data 4, text 3.5;
  - `priest_mana_shield.sval` holds two versions of the skill, one with 4 tiers and one with 5.

## AE-only (no original tweak key)

- **Moving while casting:** each AE skill carries `move-speed-mul` over a cast-time window (`<ivec2 name="move-speed">`), or `speed-mul` for a channelled skill. The original hard-codes it in each class's `Player<Class>ActorBehavior.DoUpdate` (no tweak key); read off its IL, against AE stock:

  | Original | AE stock |
  |---|---|
  | Paladin sword ×0 | `pal_sword` 0.1 |
  | Wizard fireball ×0; meteor ×0 until the volley ends (~1.1 s); flame spray ×0.33; fire nova free | fireball 0.05; meteor 0.33 for 0–260 ms of a ~1000 ms cast; spray 0.33; fire nova 0 for 0–240 ms |
  | Sorcerer shard, nova, orb ×0.33; comet ×0 | shard 0.1, nova 0, orb 0; comet 0 |
  | Warlock dagger ×0; lightning, gargoyle free | dagger 0.05; lightning, gargoyle 0 for 0–260 ms |
  | Ranger bow ×0.5; flurry ×0; growth ×0.5 | bow 0.25; flurry `speed-mul` 0.33; growth free (no line to patch) |
  | Priest `smite-speed`, thief `knives-speed-mod` | the same, as binds |

  AE also halves every skill slow while combo is on (`Player.as`); the original applies them in full and moves ×1.4 in combo. The Players tab's **Original movement while attacking** switch sets the AE column to the original's, with one exception. For the paladin sword, wizard fireball and warlock dagger it uses ×0.2, not ×0. The original's ×0 lasts only while the attack sprite plays, and held autofire waits 1.25× the sprite between attacks, so you walk at full speed a fifth of the time and can kite. AE at the original attack speed has no such gap, so a flat ×0 would pin you; ×0.2 is that average. Meteor's lock stays ×0.
- **Attack rate:** the original attacks the moment you press, then again when the attack sprite ends (`attackLength` = the `west-attack` sprite; held autofire waits 1.25× that). AE plays an attack animation at `cast-speed-mul`, then waits `cooldown`:

  | Primary | Original | AE |
  |---|---|---|
  | Paladin sword | 100 ms | 540 ÷ 2 + 200 ≈ 470 ms |
  | Warlock dagger | 120 ms | 300 ÷ 2 + 150 = 300 ms |
  | Wizard fireball | 200 ms | 300 ÷ 1 + 150 = 450 ms |
  | Thief knives | 201 ms | 530 ÷ 2 + 100 ≈ 365 ms |
  | Ranger bow | 200 ms | 400 ÷ 1.5 + 0 ≈ 267 ms (plus heat) |
  | Priest smite | 200 ms | 240 ÷ 1.5 + 100 = 260 ms |
  | Sorcerer shard | 240 ms | 240 ÷ 1.2 + 80 = 280 ms |

  **Original attack speed** (`ORIGINAL_ATTACKS` in `players/original.ts`) brings each back: only the cooldown shrinks where AE's animation already fits, otherwise the animation speeds up and the cooldown goes.
- **Combo mana and health:** the original adds `combo-mana` mana and `combo-heal` health every 500 ms while combo is on (`PlayerActorBehavior.Update`). AE gives the same numbers as a regen buff that `PlayerBase.as` re-applies once a second (`tweak/buffs/buffs.sval`, `combo_mana_regen_level_N` 4–12, `combo_health_regen_level_N` 2–10), so half as much. **Original combo rewards** doubles them.
- **Priest beam mana:** both deal damage every 200 ms. The original takes 3 mana per damage tick (15/s). AE takes 3 mana per 100 ms cast loop (`castpoint` 100 in `PlayerSkillDirectionalChannelling`), 30/s. Both stop at the first enemy. **Original beam mana cost** sets `castpoint` 200.
- **Warlock lightning:** the original's strike jumps every 50 ms from a random enemy it already hit to the best target within about 2 tiles, damaging everything within about ±10 px of that target; a repeat hit on an enemy does 1/n (`WarlockLightningStrike.Update`). AE's orb lands, then a `BoltShooter` fires its bolts from that spot at random enemies within `range` 50 px, one each, ×0.75 per repeat on the same enemy (`players/warlock/projectiles/lightning_bolt.unit`). It no longer travels through a pack. **Original chain lightning reach** widens `range` to 96 px (no hop or splash is possible in data). Mana costs, damage and bolt counts match; AE's lightning is even 5 mana cheaper.
- **Priest smite tier 5:** AE's `smite-speed-pen` ladder is 0.2 / 0.3 / 0.4 / 0.5 / **0.4**; its own text and the original's penalty of 40 mean 0.6. Both presets fix it.
- **Cooldowns and cast points** on every skill.
- **Skills and shop items:**
  - thief acrobatics (a free evade stack every 6 s);
  - the speed potion (300g);
  - frost shield's slow and `physical-based`;
  - fire shield's combo on hit;
  - fire nova's fixed 3 damage per flame;
  - storm's cooldown, tied to its duration.
- **Ranger bow:** heat (overheating and recovery) and arrow lifetime. Heat is the bow's "stamina": +1 per arrow up to `overheating-max` 5, draining at `overheating-recovery`/s; past 2 it adds up to 300 ms between shots, past 3 up to 15° of spread. `overheating-max` 0 turns it off (**Ranger bow never overheats**).
- **Thief:** no gold cost per cast for fan, smoke or chain. Buying the skill unlocks it.

## Enemy difficulty (`general.xml`) — not a player setting

AE has no `general.xml` equivalent. It has four difficulties set by compile-time
flags. The only global scalar is `Tweak::EnemyHealthMul` (`scripts/Data/Misc.as`):
0.66 / 1.0 / 1.25 / 1.5, against the original's `EnemyHealthAll` of 0.75 / 1 / 1.1.
Enemy damage and speed are set per enemy (`%if DIFF_*` blocks in 135
`actors/` files). A player preset leaves all of this alone.
