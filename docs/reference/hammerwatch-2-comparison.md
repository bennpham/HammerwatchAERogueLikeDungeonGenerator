# Hammerwatch 2 vs the original — player stats

How **Hammerwatch 2 (HW2)** player stats relate to the original game's player
tweak values (`src/generator/tweak/baseline.ts`). Compiled 2026-10-08 from HW2's
unpacked assets (`Hammerwatch 2/unpacked_assets_137/`: `players/classes.inc`,
`players/<class>/skills/*.sval`, `tweak/items/equipment/equipment_start.inc`
and `scripts/`). This is the source for the four **Hammerwatch 2** player
presets (`src/generator/tweak/hw2Presets.ts`). For the AE comparison, see
`hammerwatch-ae-comparison.md`.

HW2 is an RPG, not a rebalance. **Most of it has no tweak key in the original.**
What carries over is each class's *body* (health, mana, mana regen) at a chosen
level, plus a handful of skill values.

## Systems

| HW2 | Original | Where in HW2 |
|---|---|---|
| Str / Dex / Int attributes, 5 free points per level | none | `scripts/Data/Player.as`, `PlayerRecord.as:1040` |
| Str = +2 HP, +0.01 HP/s; Int = +2 mana, +0.03 mana/s; Dex = +2 stamina, +0.05 stamina/s | flat `max-health` / `max-mana` / `mana-regen` | `Modifiers.as:341-371` (`CalcAttributes`) |
| Levels 1–50; next level costs `1000 × L²` XP; 3–6 skill points per level | gold spent in shops | `PlayerRecord.as:940-958, 1262` |
| Damage = equipped weapon × skill multiplier; spells = flat + per-level bonus | flat per-skill damage | `Effects/Damage.as:155-164` |
| Armor is a percentage: `dmg × (1 − a/(1+a))`, with `a = armor/100` | flat `dmg-reduction` per hit | `Behaviors/Armor.as` |
| Stamina (dashes, some attacks), cooldowns on everything | none | skill `.sval` files |
| Move speed: multiplier 1.0 × base 3.1, gear +0.02 to +0.15 | shared `move-speed` 0.9 (shop 1.0–1.2) | `Player.as:1076-1111` |
| No lives; respawning is unlimited and costs 10–20% of your gold | extra lives | `GUI/DeadMenu.as` |

`players/player.inc`'s `speed 0.8` is the **dodge visual effect**, not move
speed. Only paladin, ranger, rogue, wizard and warlock are playable
(`classes.sval`). The `priest/` and `sorcerer/` folders hold sprites only.

## Class bodies (`classes.inc`; class base + 2 × attribute, no gear)

Each class maps to an original unit: paladin → knight, ranger → ranger,
rogue → thief, wizard → wizard, warlock → warlock. In the presets, the placed
attribute points are split in proportion to the class's base attributes
(largest remainder), so each class keeps its shape.

| Class | Str/Dex/Int | Lvl 1 HP / mana / regen | Lvl 10 | Lvl 25 | Lvl 50 | Original start |
|---|---|---|---|---|---|---|
| knight | 18/12/10 | 91 / 60 / 1250 ms | 167 / 100 / 493 | 295 / 168 / 244 | 507 / 280 / 133 | 75 / 50 / 1100 |
| ranger | 12/16/12 | 69 / 64 / 1163 | 124 / 117 / 465 | 213 / 208 / 230 | 364 / 357 / 126 | 50 / 50 / 1000 |
| thief | 12/18/10 | 69 / 60 / 1250 | 124 / 100 / 493 | 213 / 168 / 244 | 364 / 280 / 133 | 40 / 40 / 1000 |
| wizard | 10/10/20 | 60 / 100 / 625 | 100 / 191 / 313 | 168 / 340 / 172 | 280 / 591 / 98 | 35 / 75 / 600 |
| warlock | 12/10/18 | 74 / 86 / 649 | 129 / 153 / 329 | 218 / 266 / 180 | 369 / 453 / 103 | 75 / 75 / 600 |

How these compare with the original's fully upgraded characters (knight
300 HP / 175 mana, wizard 100 / 350, thief 120 / 165, ranger 150 / 200,
warlock 130 / 450):
- **Level 25** starts about as tough as a fully upgraded original character.
- **Level 50** is 2–3× past that.

In HW2 the endgame is balanced by gear, percentage armor and enemies with
450–1000 HP (bosses up to 60,000). Early enemies are close to the original's
(grey wolf 35, grub 30, beetle 10–20). The presets shift a class's own health
and mana ladders by the same amount its start moved, and scale its mana-regen
ladder by the same ratio, so every upgrade still improves on the new start.

### Priest and sorcerer (no HW2 class; anchored on the wizard)

Both are casters, and the wizard is their nearest HW2 sibling. Each keeps the
relationship it has to the wizard in the original game, and the ratios are read
from the baseline:

- **Sorcerer:** the original sorcerer starts with exactly the wizard's body (35 / 75 / 600), so it gets HW2's wizard body unchanged. It stays the wizard's twin, the other offensive caster.
- **Priest:** the wizard × 30/35 health, × 70/75 mana and × 570/600 regen period. It stays the frailest class, with the fastest regen.
- **Priest regen ladder:** this comes from the wizard's ladder tier by tier, × 570/600, instead of shifting the priest's own ladder. In the original, the priest's ladder (→ 285 ms) tops out slower than the wizard's (→ 250 ms); the owner wanted the priest to stay the regen class even when fully upgraded.
- **Priest health and mana ladders:** the priest's own, shifted, so it keeps its larger fully upgraded mana pool (393 vs 375 at level 1).

| Class | Lvl 1 | Lvl 10 | Lvl 25 | Lvl 50 | Original start |
|---|---|---|---|---|---|
| sorcerer | 60 / 100 / 625 | 100 / 191 / 313 | 168 / 340 / 172 | 280 / 591 / 98 | 35 / 75 / 600 |
| priest | 51 / 93 / 594 | 86 / 178 / 297 | 144 / 317 / 163 | 240 / 552 / 93 | 30 / 70 / 570 |

## Skill values that carry over

| HW2 | Original key | HW2 → original |
|---|---|---|
| paladin mace stun 5/10/15% | `knight bash1..3.bash-chance` | 10/20/30 → 5/10/15 |
| shield-charge dash, 80 px | `knight param.charge-dist`, `chrgrng1..3` | 3 → 5 (ladder 6/7/8) |
| rogue evasion 5/10/15/20% | `thief dodge1..4`, `remove.dodge5` | 10…50 → 5/10/15/20 |
| twin daggers move ×0.5 while attacking | `thief param.knives-speed-mod`, `aspeed1..4` | −0.6 → −0.5 (ladder −0.4…−0.1) |
| throwing-knife fan 3/5/7 | `thief param.kfan-projs`, `kfanprojs1/2`, `remove.kfanprojs3` | 5…8 → 3/5/7 |
| marksman aim crit 10/20/30% | `ranger crit1..3`, `remove.crit4` | 10/15/20/25 → 10/20/30 |
| entangle 4 → 6 s | `ranger growth-duration` | 3/4/5 → 4/5/6 |
| arcane bolt: wand 14 × 1.0…2.0 | `wizard fireball-dmg`, `dmg1..5` | 10…28 → 14/17/20/22/25/28 |
| frost nova, 12 shards | `wizard fnova-flames` | 10 → 12 (ladder 15/18/20) |
| the same ice ring as the sorcerer's nova | `sorcerer nova-shards` | 9 → 12 (ladder 13/17 → 16/20) |
| meteor shower, at most 5 | `wizard remove.meteornum-2/-3` | 3/5/6/7 → 3/5 |
| soul vortex 8/10/12 s | `warlock storm-dur` | 7/9/11 → 8/10/12 |
| arc lightning, 3–6 targets | `warlock param.lightning-bounces`, `lightningtrg1..3`, `remove.lightningtrg4` | 5…9 → 3/4/5/6 |

These are copied faithfully, including where HW2 is weaker (owner's call).

Not copied:
- **Bow pierce.** HW2's pierce 1/3/6 may not be the same quantity as the original's `bow-penetration` 2–7.

## Not portable

- **Damage.** Weapon-scaled damage (every basic attack and most skills) and spell damage tuned for HW2's late enemies, which is about 6–7× the original's. HW2 meteor does 400 against the original's 60, and arc lightning 120 against warlock lightning's 18.
- **Systems the original lacks.** Stamina and dashes, cooldowns, percentage armor and elemental resistances, crit damage, attack and cast speed, and HP regen on every class.
- **HW2-only skills.** Hammer, judgement, battle banner, wolves, rain of arrows, possession, ritual, the soul economy, haste, duplicate, barrier and around 40 more.
- **Missing classes.** HW2 has no priest or sorcerer, so the presets scale both off HW2's wizard (see below).
- **The original's ranger bomb.** It has no HW2 counterpart.

Data that disagrees with its own description text:
- `pal_battle_banner` cooldown: data 40000, text 30 s.
- `wiz_wall` damage: data 30/60/90, text 20/40/60.
