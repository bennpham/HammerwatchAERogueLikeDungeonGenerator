# Hammerwatch 1 — `tweak/` Balance Data

Full transcription of the official balance tables from Hammerwatch 1's `assets.bin`,
extracted at:

```
<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/tweak/
```

Files: `general.xml`, `shared.xml`, and one per class —
`knight`, `priest`, `ranger`, `sorcerer`, `thief`, `warlock`, `wizard`.
(There is no paladin/gladiator here; those are Heroes of Hammerwatch.)

This is **game-balance data, not level-generation data**. It draws no random
values and cannot change a seed's dungeon. The same numbers are transcribed
machine-readably in `src/generator/tweak/baseline.ts`, which is what the app
edits and emits; these tables are the human-readable copy. Both were checked
against the extracted files above and agree with them field for field.

Commented-out blocks in the originals — the warlock's cut `lifesteal` skill, the
superseded `shared.xml` speed tiers — are omitted here and in `baseline.ts`.

## File format

Every class file has the same two-section shape:

```xml
<tweak>
  <params>    <!-- starting values for every tunable key -->
  <upgrades>  <!-- purchasable shop entries -->
</tweak>
```

Rules that hold across all files:

- An upgrade **sets** a param to an absolute value; it does not add to it.
  `sword-dmg` 9 → upgrade `dmg1` → 14 (not 23).
- `req="<id>"` chains an upgrade behind another. No `req` = available immediately.
- `cat="<slot>"` is the UI grid position: `misc1`–`misc5`, `off1`–`off5`, `def1`–`def5`.
- `name` / `desc` are localization keys, not display text.
- `lvl` is a display-only tier number.
- Sentinel `-1` (and `9999` for mana costs) in `<params>` means "skill locked" —
  the unlock upgrade writes the real value.
- `mana-regen` is a **period in milliseconds per mana point**: lower = faster.
- Durations are inconsistent by design: `area-duration` and `fnova-ttl` are ms,
  `whirl-dur` / `storm-dur` / `combust-dur` / `orb-time` are seconds.

---

## `general.xml` — difficulty multipliers

`medium` is the 1.0 baseline. The `*Base`/`*Incr` pairs read as a per-level linear
ramp (`Base + Incr × level`). Lower `SpawnFreq` = faster spawns, so hard both starts
lower and decays at the same rate.

| Key | easy | medium | hard |
|---|---|---|---|
| EnemyHealthAll | 0.75 | 1 | 1.1 |
| EnemyHealthBase | 0.75 | 1 | 1.1 |
| EnemyHealthIncr | 0.35 | 0.5 | 0.65 |
| EnemySpeedMultiplier | 0.85 | 1 | 1.33 |
| EnemyDamageBase | 0.75 | 1 | 1.75 |
| EnemyDamageIncr | 0.1 | 0.15 | 0.3 |
| SpawnFreqBase | 1.2 | 1 | 0.75 |
| SpawnFreqDecr | 0.1 | 0.1 | 0.1 |
| MoneyBase | 1.2 | 1 | 0.75 |
| MoneyIncr | 0 | 0 | 0 |

Damage is the sharpest difficulty axis (0.75 → 1 → 1.75 base, 3× the per-level
increment on hard); enemy health barely moves. `MoneyIncr` is 0 everywhere, so gold
scaling is flat within a difficulty.

---

## `shared.xml` — cross-class upgrades

### Base params

| Param | Default |
|---|---|
| move-speed | 0.9 |
| dmg-mul | 1.0 |
| combo | false |
| combo-timer | 0.75 |
| combo-heal | 0 |
| combo-mana | 0 |
| combo-nova-dmg | 0 |
| combo-nova-parts | 0 |
| combo-nova-projectile | *(empty)* |

### Potions / life (cat `power`, no prereqs)

| id | cost | notes |
|---|---|---|
| life | 350 | `life-cost-scale="2.6"` — repeatable, cost ×2.6 each purchase |
| rejuv | 175 | |
| pot-dmg | 300 | |
| pot-rejuv | 300 | |
| pot-invul | 300 | |

### Movement speed (chained)

| id | cost | cat | move-speed |
|---|---|---|---|
| speed-1 | 600 | misc3 | 1.0 |
| speed-2 | 1200 | misc4 | 1.1 |
| speed-3 | 1600 | misc5 | 1.2 |

Base is 0.9, so tier 1 is only +11% for 600g. A superseded tuning is commented out in
the file (200/600/1000 for 0.9/1.0/1.1, starting at `misc1`), plus two abandoned
tiers 4–5 reaching 1.3.

### Combo

Unlock `combo` = 250g (cat `combo1`), then four independent 5-tier branches sharing
one cost ladder. All branches `req` the previous tier in their own chain; tier 1 of
each `req="combo"`.

| Tier | Cost | cat | combo-timer | nova dmg / parts | combo-heal | combo-mana |
|---|---|---|---|---|---|---|
| 1 | 800 | combo1 | 1.0 | 12 / 6 | 2 | 4 |
| 2 | 1200 | combo2 | 1.25 | 17 / 10 | 4 | 6 |
| 3 | 1600 | combo3 | 1.5 | 26 / 14 | 6 | 8 |
| 4 | 2600 | combo4 | 1.75 | 34 / 18 | 8 | 10 |
| 5 | 3800 | combo5 | 2.0 | 42 / 22 | 10 | 12 |

- One branch maxed = 10,000g. All four + unlock = 40,250g.
- Nova projectile art swaps at tiers 1/3/5:
  `projectiles/player_combo_nova_1.xml` / `_2.xml` / `_3.xml`. Tiers 2 and 4 are
  stat-only.
- heal/mana are linear (+2/tier); nova damage accelerates (+5, +9, +8, +8).

---

## Class comparison

### Starting stats

| Class | HP | Mana | Armor | mana-regen (ms) |
|---|---|---|---|---|
| Knight | 75 | 50 | 2 | 1100 |
| Warlock | 75 | 75 | 0 | 600 |
| Ranger | 50 | 50 | 0 | 1000 |
| Thief | 40 | 40 | 1 | 1000 |
| Sorcerer | 35 | 75 | 0 | 600 |
| Wizard | 35 | 75 | 0 | 600 |
| Priest | 30 | 70 | 0 | 570 |

Knight is the only class starting with meaningful armor. Melee classes regen mana
slowly (1000–1100ms), casters quickly (570–600ms).

### Fully-upgraded ceilings

| Class | HP | Mana | regen | Armor | Armor tiers | Armor total cost |
|---|---|---|---|---|---|---|
| Knight | 300 | 175 | 600 | 10 | 5 | 9,500 |
| Ranger | 150 | 200 | 500 | 5 | 5 | 10,000 |
| Warlock | 130 | 450 | 350 | 5 | 5 | 18,000 |
| Thief | 120 | 165 | 500 | 6 | 5 | 5,700 |
| Sorcerer | 100 | 320 | 250 | 4 | 4 | 6,000 |
| Wizard | 100 | 350 | 250 | 4 | 4 | 6,000 |
| Priest | 65 | 370 | 285 | 5 | 5 | 18,000 |

Priest and Warlock pay a flat 1,200/tier for armor (18,000 total) — the
"casters shouldn't tank" tax. Sorcerer and Wizard have no armor tier 5 at all.
Thief's armor is both the cheapest and the highest-starting (+2 for 400g).

---

## Knight — `knight.xml`

Tank/melee. Only class with base `dmg-reduction` > 0 and the only one reaching 10.

### Params

| Param | Value |
|---|---|
| max-health | 75 |
| max-mana | 50 |
| dmg-reduction | 2 |
| mana-regen | 1100 |
| sword-dmg | 9 |
| sword-arc | 90 |
| sword-arc-gfx | `effects/knight_slash_90.xml` |
| sword-range | 1 |
| charge-dist | 3 |
| charge-speed | 3 |
| charge-dmg-multiplier | 1.75 |
| charge-mana-cost | 10 |
| heal | false |
| heal-amount | -1 |
| heal-mana-cost | -1 |
| whirl | false |
| whirl-range | 1.5 |
| whirl-dur | -1 |
| whirl-dmg-multiplier | -1 |
| whirl-mana-cost | 50 |
| shield-arc | 75 |
| bash-chance | 0 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 600 / 1200 / 1800 / 2400 / 3000 | max-health 120 / 165 / 210 / 255 / 300 |
| mana-1..5 (misc1-5) | 800 / 1900 / 3000 / 4100 / 5200 | max-mana 75 / 100 / 125 / 150 / 175; regen 1000 / 900 / 800 / 700 / 600 |
| dmg1..5 (off1-5) | 800 / 1600 / 2700 / 3900 / 5200 | sword-dmg 14 / 20 / 26 / 32 / 38 |
| arc1..5 (off1-5) | 250 / 700 / 1500 / 2200 / 2700 | sword-arc 120 / 150 / 180 / 210 / 240 (gfx `knight_slash_<arc>.xml` per tier) |
| chrgdmg1..3 (off2-4) | 1600 / 3000 / 4200 | charge-dmg-multiplier 2.0 / 2.25 / 2.5 |
| chrgrng1..3 (off2-4) | 500 / 1200 / 1800 | charge-dist & charge-speed 4 / 5 / 6 |
| whirl (off3) | 2200 | whirl true, whirl-dur 4, multiplier 1.5 |
| whirldmg1..2 (off4-5) | 2800 / 3800 | whirl-dmg-multiplier 2 / 2.5 |
| whirldur1, whirldur (off4-5) | 3000 / 4000 | whirl-dur 6 / 8 |
| bash1..3 (def1-3) | 700 / 1600 / 2600 | bash-chance 10 / 20 / 30 |
| armor-1..5 (def1-5) | 600 / 1200 / 2000 / 2500 / 3200 | dmg-reduction 4 / 6 / 8 / 9 / 10 |
| heal (def2) | 700 | heal true, heal-amount 5, heal-mana-cost 10 |
| healeff1..3 (def3-5) | 1700 / 2600 / 3500 | heal-amount 6 / 7 / 8; mana-cost 8 / 7 / 6 |
| shield1..3 (def1-3) | 750 / 1500 / 3000 | shield-arc 120 / 180 / 240 |

Note: the tier-2 whirl-duration entry uses `id="whirldur"` (not `whirldur2`).

---

## Priest — `priest.xml`

Lowest HP in the game (30, capped at 65). Healing beam doubles as the main damage
tool.

### Params

| Param | Value |
|---|---|
| max-health | 30 |
| max-mana | 70 |
| dmg-reduction | 0 |
| mana-regen | 570 |
| smite-dmg | 6 |
| smite-range | 2.75 |
| smite-area | 1.15 |
| smite-effect | `effects/explodes.xml:priest_smite` |
| smite-speed-pen | 100 |
| beam-dmg | 19 |
| beam-heal | 3 |
| beam-range | 5 |
| beam-mana-cost | 3 |
| area | false |
| area-range | 0 |
| area-duration | 0 |
| area-effect | `effects/player_effects.xml:priest_drain_area` |
| area-dmg | 0 |
| area-heal-mul | 0 |
| area-limit | 0 |
| area-mana-cost | 35 |
| aura | false |
| aura-range | 0 |
| aura-effect | `effects/player_effects.xml:priest_cripple_aura` |
| aura-buff | *(empty)* |
| aura-mana-cost | 50 |
| aura-mana-drain | 0 |
| shield-distr | 50 |
| shield-dmg-per-mana | 0.25 |
| shield-effect | `effects/misc.xml:magicshield` |
| hp-regen | 0 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 800 / 1500 / 2200 / 2900 / 3600 | max-health 40 / 50 / 55 / 60 / 65 |
| mana-1..5 (misc1-5) | 800 / 1400 / 2200 / 3000 / 3800 | max-mana 130 / 190 / 250 / 310 / 370; regen 500 / 444 / 400 / 333 / 285 |
| dmg1..5 (off1-5) | 600 / 1200 / 1800 / 2500 / 3200 | smite-dmg 10 / 15 / 22 / 29 / 34; smite-area 1.2 / 1.25 / 1.3 / 1.35 / 1.4 |
| sspeed1..5 (off1-5) | 250 / 550 / 1200 / 2500 / 3300 | smite-speed-pen 80 / 70 / 60 / 50 / 40 |
| beamdmg1..4 (off2-5) | 1200 / 2000 / 3000 / 4300 | beam-dmg 25 / 37 / 48 / 60; beam-heal 4 / 4 / 5 / 5 |
| beamrng1..4 (off2-5) | 600 / 1200 / 2000 / 2800 | beam-range 6 / 7 / 8 / 9 |
| area (off2) | 2000 | area true, range 2.25, duration 7000ms, dmg 16, heal-mul 0.1, limit 1 |
| areadmg-1..3 (off3-5) | 2000 / 3500 / 4500 | area-dmg 24 / 32 / 38 |
| areanum-1..2 (off3-4) | 3000 / 4000 | area-limit 2 / 3 |
| armor-1..5 (def1-5) | 1200 / 2400 / 3600 / 4800 / 6000 | dmg-reduction 1 / 2 / 3 / 4 / 5 |
| aura (def3) | 3500 | aura true, range 5, buff `priest_cripple_1.xml`, mana-drain 1, slow 30 |
| auraslow-1..2 (def4-5) | 3500 / 4500 | buff `priest_cripple_2.xml` slow 50 / `_3.xml` slow 70 |
| auradrain (def3) | 5000 | aura-mana-drain 0 |
| hpregen1..5 (def1-5) | 500 / 1000 / 1500 / 2000 / 2500 | hp-regen 5 / 2.5 / 1.67 / 1.25 / 1 (seconds per HP) |
| mshield1..5 (def1-5) | 500 / 1200 / 1800 / 2600 / 3200 | shield-dmg-per-mana 0.5 / 0.75 / 1.0 / 1.25 / 1.5 |

The `aura` entries also write an `<int name="slow">` key that is not declared in
`<params>` — the real slow lives in the referenced `buffs/priest_cripple_N.xml`.

---

## Ranger — `ranger.xml`

### Params

| Param | Value |
|---|---|
| max-health | 50 |
| max-mana | 50 |
| dmg-reduction | 0 |
| mana-regen | 1000 |
| bow-dmg | 12 |
| bow-penetration | 2 |
| bow-projectile | `projectiles/player_arrow_1.xml` |
| bomb-item | `items/ranger_bomb.xml` |
| bomb-splash | 2.5 |
| bomb-dmg | 30 |
| bomb-mana-cost | 20 |
| growth | false |
| growth-range | -1 |
| growth-duration | -1 |
| growth-mana-cost | 20 |
| spread | false |
| spread-arrows | -1 |
| spread-waves | -1 |
| spread-mana-cost | 50 |
| crit-chance | 0 |
| dodge-chance | 0 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 700 / 1400 / 2200 / 2900 / 3500 | max-health 70 / 90 / 110 / 130 / 150 |
| mana-1..5 (misc1-5) | 700 / 1400 / 2200 / 2900 / 3500 | max-mana 80 / 110 / 140 / 170 / 200; regen 900 / 800 / 700 / 600 / 500 |
| dmg1..5 (off1-5) | 800 / 1600 / 2700 / 4000 / 6000 | bow-dmg 17 / 22 / 27 / 32 / 37; projectile → `player_arrow_2.xml` at t2, `_3.xml` at t4 |
| pen1..5 (off1-5) | 700 / 1400 / 2300 / 3200 / 4000 | bow-penetration 3 / 4 / 5 / 6 / 7 |
| bombdmg-1..3 (off2-4) | 900 / 2000 / 3200 | bomb-dmg 43 / 57 / 72 |
| spread (off3) | 1800 | spread true, 12 arrows, 2 waves |
| spreadshts-1..2 (off4-5) | 3500 / 4000 | spread-arrows 16 / 20 |
| spreadwvs-1..2 (off4-5) | 3800 / 4500 | spread-waves 3 / 4 |
| crit1..4 (off2-5) | 1200 / 2500 / 4000 / 5500 | crit-chance 10 / 15 / 20 / 25 |
| armor-1..5 (def1-5) | 600 / 1200 / 2000 / 2700 / 3500 | dmg-reduction 1 / 2 / 3 / 4 / 5 |
| dodge1..5 (def1-5) | 1000 / 2000 / 3000 / 4000 / 5000 | dodge-chance 10 / 20 / 30 / 40 / 50 |
| growth (def2) | 900 | growth true, range 5, duration 3 |
| growthdur-1..2 (def3-4) | 1500 / 2100 | growth-duration 4 / 5 |
| growthrng-1..2 (def4-5) | 1500 / 2500 | growth-range 6 / 6.5 |

---

## Sorcerer — `sorcerer.xml`

### Params

| Param | Value |
|---|---|
| max-health | 35 |
| max-mana | 75 |
| dmg-reduction | 0 |
| mana-regen | 600 |
| shard-dmg | 8 |
| shard-range | 6 |
| shard-bounces | 3 |
| shard-projectile | `projectiles/sorcerer_ice_shard.xml` |
| shard-bounce-range-mul | 0.75 |
| shard-bounce-dmg-mul | 1 |
| comet-dmg | 50 |
| comet-dist | 2.5 |
| comet-mana-cost | 25 |
| comet-freeze | 2.5 |
| nova | false |
| nova-shards | -1 |
| nova-mana-cost | 9999 |
| orb | false |
| orb-mana-cost | 90 |
| orb-projectile | `projectiles/sorcerer_ice_orb.xml` |
| orb-shard | `projectiles/sorcerer_orb_shard.xml` |
| orb-shard-dmg | 0 |
| orb-time | 0 |
| shield-chance | 0 |
| chill | false |
| chill-slow | 0 |
| chill-dur | -1 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 800 / 1500 / 2200 / 2900 / 3600 | max-health 45 / 60 / 70 / 85 / 100 |
| mana-1..5 (misc1-5) | 600 / 1400 / 2200 / 3000 / 3800 | max-mana 130 / 180 / 230 / 275 / 320; regen 500 / 400 / 350 / 300 / 250 |
| dmg1..5 (off1-5) | 800 / 1600 / 2700 / 4500 / 6000 | shard-dmg 11 / 14 / 17 / 21 / 24 |
| rng1..5 (off1-5) | 500 / 1000 / 1700 / 2500 / 3000 | shard-range 6.5 / 7 / 7.5 / 8 / 8.5; bounces 4 / 5 / 6 / 7 / 8 |
| cometdmg1..4 (off2-5) | 1000 / 1800 / 2400 / 3200 | comet-dmg 80 / 110 / 150 / 190; mana-cost → 30 at t2, → 35 at t4 |
| orb (off3) | 2200 | orb true, orb-shard-dmg 17, orb-time 3.5 |
| orbtime-1..3 (off3-5) | 2000 / 3000 / 4000 | orb-time 5 / 6.5 / 8 |
| orbdmg-1..2 (off4-5) | 4000 / 5000 | orb-shard-dmg 23 / 29 |
| chill (off2) | 1200 | chill true, chill-slow 20, chill-dur 2 |
| chillslow1..3 (off3-5) | 1800 / 3000 / 4500 | chill-slow 35 / 50 / 65 |
| chilldur1..3 (off3-5) | 1400 / 2200 / 3500 | chill-dur 3 / 4 / 5 |
| armor-1..4 (def1-4) | 600 / 1200 / 1800 / 2400 | dmg-reduction 1 / 2 / 3 / 4 (no tier 5) |
| nova (def2) | 1300 | nova true, nova-shards 9, mana-cost 50 |
| novamana-1..2 (def3,def5) | 2000 / 4000 | nova-mana-cost 40 / 30 |
| novanum-1..2 (def3-4) | 2000 / 4000 | nova-shards 13 / 17 |
| fshield1..5 (def1-5) | 1000 / 2000 / 3000 / 4000 / 5000 | shield-chance 20 / 40 / 60 / 80 / 100 |

---

## Thief — `thief.xml`

Unique mechanic: `chain` and `smoke` have a **gold cost per use** (1000 each) baked
into `<params>`. The unlock upgrades set that cost to 0 — the skills are technically
usable from level 1, just ruinously expensive.

### Params

| Param | Value |
|---|---|
| max-health | 40 |
| max-mana | 40 |
| dmg-reduction | 1 |
| mana-regen | 1000 |
| knives-dmg | 5 |
| knives-arc | 210 |
| knives-arc-gfx | `effects/thief_slash.xml` |
| knives-range | 1 |
| knives-speed-mod | -0.6 |
| kfan-dmg | 10 |
| kfan-projs | 5 |
| kfan-arc | 50 |
| kfan-projectile | `projectiles/player_knife.xml` |
| kfan-mana-cost | 15 |
| kfan-money-cost | 0 |
| smoke | false |
| smoke-range | 0 |
| smoke-buff | `buffs/thief_smoke.xml` |
| smoke-mana-cost | 25 |
| smoke-money-cost | 1000 |
| chain | false |
| chain-buff | `buffs/thief_stun_1.xml` |
| chain-range | 8 |
| chain-speed | 4 |
| chain-mana-cost | 5 |
| chain-money-cost | 1000 |
| money-chance | 0 |
| max-fervor | 0 |
| dodge-chance | 0 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 600 / 1300 / 1950 / 2600 / 3000 | max-health 60 / 75 / 90 / 105 / 120 |
| mana-1..5 (misc1-5) | 800 / 1900 / 3000 / 4100 / 5200 | max-mana 65 / 90 / 115 / 140 / 165; regen 900 / 800 / 700 / 600 / 500 |
| dmg1..5 (off1-5) | 800 / 1700 / 2800 / 4100 / 5400 | knives-dmg 8 / 12 / 16 / 19 / 23 |
| aspeed1..4 (off1-4) | 250 / 700 / 1500 / 2200 | knives-speed-mod -0.5 / -0.4 / -0.3 / -0.2 |
| kfandmg1..3 (off2-4) | 1700 / 3100 / 4300 | kfan-dmg 16 / 23 / 30 |
| kfanprojs1..3 (off2-4) | 700 / 1400 / 2000 | kfan-projs 6 / 7 / 8; kfan-arc 55 / 60 / 65 |
| fervor1..3 (off2-4) | 800 / 1700 / 2800 | max-fervor 4 / 7 / 10 |
| dodge1..5 (def1-5) | 800 / 1600 / 2400 / 3200 / 3800 | dodge-chance 10 / 20 / 30 / 40 / 50 |
| armor-1..5 (def1-5) | 400 / 700 / 1100 / 1500 / 2000 | dmg-reduction 2 / 3 / 4 / 5 / 6 |
| chain (def2) | 900 | chain true, chain-money-cost 0 |
| chainrng1..2 (def2-3) | 1700 / 2600 | chain-range 10 / 12 |
| chainstn1..2 (def3-4) | 1700 / 2600 | chain-buff `thief_stun_2.xml` / `_3.xml` |
| smoke (def3) | 1200 | smoke true, smoke-range 4, smoke-money-cost 0 |
| smokerng1..2 (def4-5) | 2000 / 2600 | smoke-range 5 / 5.5 |

`money-chance` is declared in params but never touched by any upgrade in this file.

---

## Warlock — `warlock.xml`

Highest mana ceiling in the game (450). Sustains through kill-triggered heal/mana
rather than defenses.

### Params

| Param | Value |
|---|---|
| max-health | 75 |
| max-mana | 75 |
| dmg-reduction | 0 |
| mana-regen | 600 |
| dagger-dmg | 9 |
| poison-dur | 2500 |
| poison-dmg | 10 |
| lightning-dmg | 18 |
| lightning-bounces | 5 |
| lightning-mana-cost | 25 |
| garg-dmg | 0 |
| garg-dur | 0 |
| garg-projectile | `projectiles/player_gargoyle_fireball.xml` |
| garg-mana-cost | 35 |
| storm | false |
| storm-dur | -1 |
| storm-dmg | -1 |
| storm-mana-cost | 175 |
| kill-heal | 0 |
| kill-mana | 0 |

An entire **lifesteal skill is commented out** — both its params
(`lifesteal`, `-dur`, `-dmg`, `-heal`, `-mana-cost` 75) and its five upgrades
(`steal` 900g, `stealdmg-1/2`, `stealdur-1/2/3`). The gargoyle summon replaced it.

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 600 / 1200 / 1800 / 2400 / 3000 | max-health 90 / 100 / 110 / 120 / 130 |
| mana-1..5 (misc1-5) | 800 / 1400 / 2200 / 3000 / 3800 | max-mana 150 / 225 / 300 / 375 / 450; regen 550 / 500 / 450 / 400 / 350 |
| dmg1..5 (off1-5) | 800 / 1600 / 2700 / 3800 / 4800 | dagger-dmg 14 / 20 / 26 / 32 / 38 |
| poison1..5 (off1-5) | 250 / 700 / 1500 / 2800 / 3800 | poison-dmg 14 / 18 / 22 / 26 / 30 |
| lightningdmg1..4 (off2-5) | 1400 / 2400 / 3200 / 4500 | lightning-dmg 22 / 26 / 30 / 35 |
| lightningtrg1..4 (off2-5) | 800 / 1400 / 2600 / 3600 | lightning-bounces 6 / 7 / 8 / 9; mana-cost 28 / 31 / 34 / 37 |
| storm (off3) | 2200 | storm true, storm-dur 7, storm-dmg 16 |
| stormdmg-1..2 (off4-5) | 3500 / 4500 | storm-dmg 28 / 40 |
| stormdur-1..2 (off4-5) | 3500 / 4500 | storm-dur 9 / 11 |
| kmana1..3 (off2-4) | 3000 / 4000 / 5000 | kill-mana 1 / 2 / 3 |
| armor-1..5 (def1-5) | 1200 / 2400 / 3600 / 4800 / 6000 | dmg-reduction 1 / 2 / 3 / 4 / 5 |
| garg (def2) | 900 | garg-dmg 15, garg-dur 4.0, mana-cost 35 |
| gargdmg1..2 (def3-4) | 2000 / 3000 | garg-dmg 20 / 25 |
| gargdur1..2 (def3-4) | 2000 / 3000 | garg-dur 6.0 (mana 40) / 8.0 (mana 45) |
| kheal1..5 (def1-5) | 1000 / 2000 / 3000 / 4000 / 5000 | kill-heal 20 / 40 / 60 / 80 / 100 |

`gargdmg1` and `gargdur1` carry no `req="garg"`, unlike other skill branch roots.

---

## Wizard — `wizard.xml`

### Params

| Param | Value |
|---|---|
| max-health | 35 |
| max-mana | 75 |
| dmg-reduction | 0 |
| mana-regen | 600 |
| fireball-dmg | 10 |
| fireball-splash | 1 |
| fireball-range | 3 |
| fireball-projectile | `projectiles/player_fireball_3.xml` |
| fireball-mana-cost | 0 |
| spray-dmg | 6 |
| spray-dist | 3 |
| spray-mana-cost | 4 |
| fnova | false |
| fnova-ttl | -1 |
| fnova-flames | -1 |
| fnova-slow | 0 |
| fnova-mana-cost | 20 |
| meteor | false |
| meteor-dmg | -1 |
| meteor-amount | -1 |
| meteor-mana-cost | 90 |
| fire-shield | false |
| combust | false |
| combust-dmg | -1 |
| combust-dur | -1 |

### Upgrades

| Chain | Tier costs | Values |
|---|---|---|
| health-1..5 (misc1-5) | 800 / 1500 / 2200 / 2900 / 3600 | max-health 45 / 60 / 70 / 85 / 100 |
| mana-1..5 (misc1-5) | 600 / 1400 / 2200 / 3000 / 3800 | max-mana 130 / 185 / 240 / 295 / 350; regen 500 / 400 / 350 / 300 / 250 |
| dmg1..5 (off1-5) | 800 / 1600 / 2700 / 4500 / 6000 | fireball-dmg 14 / 18 / 22 / 25 / 28; splash 1.25 / 1.45 / 1.65 / 1.85 / 2.0 |
| rng1..5 (off1-5) | 500 / 1000 / 1700 / 2500 / 3000 | fireball-range 3.5 / 4 / 4.5 / 5 / 6.5; projectile `player_fireball_` 3 / 4 / 4 / 5 / 6 |
| spraydmg1..4 (off2-5) | 1000 / 1800 / 2400 / 3200 | spray-dmg 10 / 14 / 18 / 22; mana-cost → 5 at t2, → 6 at t4 |
| meteor (off3) | 2200 | meteor true, meteor-dmg 60, meteor-amount 3 |
| meteornum-1..3 (off3-5) | 2000 / 3000 / 4000 | meteor-amount 5 / 6 / 7 |
| meteordmg-1..2 (off4-5) | 4000 / 5000 | meteor-dmg 100 / 140 |
| combust (off2) | 1200 | combust true, combust-dmg 8, combust-dur 3 |
| combustdmg1..3 (off3-5) | 1800 / 3000 / 4500 | combust-dmg 12 / 16 / 20 |
| combustdur1..3 (off3-5) | 1400 / 2200 / 3500 | combust-dur 4 / 5 / 6 |
| armor-1..4 (def1-4) | 600 / 1200 / 1800 / 2400 | dmg-reduction 1 / 2 / 3 / 4 (no tier 5) |
| fnova (def2) | 1300 | fnova true, flames 10, slow 30, ttl 275ms, mana-cost 30 |
| fnovanum-1..3 (def3-5) | 2000 / 4000 / 6000 | flames 13 / 16 / 18; ttl 350 / 500 / 600; mana-cost 40 / 50 / — |
| fnovaslow-1..3 (def3-5) | 2000 / 2500 / 3000 | fnova-slow 50 / 70 / 90 |
| fire-shield (def1) | 2000 | fire-shield true (flat toggle, no tiers) |

Wizard's fireball is the only primary attack with an explicit `mana-cost` of 0.
