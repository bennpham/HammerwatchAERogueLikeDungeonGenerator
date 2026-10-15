# Original Hammerwatch — class balance research

What players, the developers and the numbers say about class balance in the
**original Hammerwatch (2013)**. Compiled 2026-10-08 as the basis for the
**Dungeon Rebalanced** player preset (`src/generator/tweak/genericPresets.ts`).

Sources:
- the archived official forum (board 1, all 13 pages; read through the Wayback Machine);
- Steam: the discussion search was rate-limited, so the main source is one thread plus reviews;
- the patch history from GOG release notes and GamingOnLinux;
- a numbers comparison of `src/generator/tweak/baseline.ts`.

## When each class arrived
- **Launch** (August 2013): Paladin, Wizard, Ranger, Warlock.
- **Thief:** 1.22, April 2014.
- **Priest:** 1.23, July 2014.
- **Sorcerer:** 1.4 / 1.41, August–September 2018.

## Developer balance patches
- **1.1:** Warlock storm scales with combo and damage potions.
- **1.2** (December 2013, "focus has been on balancing the game"):
  - Ranger walks while attacking, but has lower health tiers, 0 starting armor and a weaker spread.
  - Warlock: poison explodes on death, lower dagger damage.
  - Paladin: weaker charge, lower end-game armor, a heal half as fast.
  - Pricier end-game damage upgrades.
- **1.22:** Thief added. Wizard flame spray pierces, ice nova casts instantly.
- **1.23:**
  - Ranger: slowed 50% while shooting, shorter range.
  - Paladin: heal only reaches nearby players, better starting shield.
  - Thief: faster attacks, more health.
  - Wizard: more health.
- **1.3:** Thief skills no longer cost gold per use, but cost more to buy.
- **1.41:**
  - Sorcerer added.
  - Wizard: fire nova and fire shield replace the ice ones.
  - Warlock: gargoyle replaces lifesteal nova.
  - Priest: beam passes through and heals allies.
  - Combo-shop mana-regen upgrade added.

## Per class

**Paladin (knight)** is the consensus overpowered class at launch, nerfed repeatedly.
- Developer Hipshot: "the paladin is really OP now, with his heal, insane amount of armor and HP" (forum topic 1671).
- Players: "Easily the best class" (topic 1787); "too strong and simply Overpowered" (Steam "Best Classes?").
- The one complaint, from the beta: weak against projectiles (topic 27). The developers later improved his starting shield.
- In numbers, the most gold-efficient tank: 165 HP and 6 armor for about 8,700g.

**Ranger** is the strongest solo class: "it'd be pretty hard to solo any class but the ranger" (topic 27). Players call it the easiest, the "safe starter" (Steam). The developers nerfed it twice, in 1.2 and 1.23.

**Wizard** is a glass cannon with a strong basic attack and mana spells players found weak.
- Hipshot: "The Wizard is OP" (Steam). Hipshot also warned that "making the wizard better, would turn medium into easy" (topic 2115).
- The developers buffed his spells in 1.22 and his health in 1.23.

**Warlock** is back-loaded: "a walking sandbag" early, a "late game destroyer" with lightning storm (topic 1787).
- The developer "don't care much for the Warlock" (topic 15).
- In numbers, the most expensive class to finish (136,950g) and short on mana throughout:
  - lightning costs 25→37 as it upgrades;
  - storm costs 175, more than the mana pool after mana-1.
- AE later cut lightning's mana cost by 5.

**Thief** is awkward and fragile early and strong once upgraded, with up to 50% dodge, the only true evasion stat. It has the cheapest full shop (95,200g). Its gold cost per skill use was removed in 1.3.

**Priest** is the clearest weak and unfun class early.
- Steam: "Your attack dealing 6 damage for when you start is horrific. Your HP scaling is atrocious. The mana shield efficiency absolutely screws you before you get at least one upgrade."
- Hipshot: "I never ever do smite."
- Forum: "takes a lot longer to make him strong" (topic 15). The draining field is "a really bad ability" (topic 2370).
- In numbers:
  - 30 HP at the start, topping out at 65;
  - armor costs 18,000g for 5;
  - its first skill costs 2,000g;
  - the most expensive mid-game kit (11,900g) for the worst result (50 HP, 2 armor);
  - mana-starved: the beam is both its damage and its heal, and the shield drains the same pool.

**Sorcerer** has almost no player data (it was added in 2018, ported from consoles).
- In numbers, second-weakest: 35 HP topping out at 100, and the lowest damage ceiling (shard 24).
- Its frost shield is a proc, not evasion (see the DISCOVERY-LOG).

## What Dungeon Rebalanced does with this
This is a buffs-only preset; no class is nerfed (owner's call). Everyone gets AE's movement (1.1, shop 1.2/1.3/1.4) and AE's longer combo window. Extra lives stay out of the shop.

| Class | Change | Why |
|---|---|---|
| Priest | HP 30→40, health tiers 55/70/80/90/100; smite 6→9; mana shield starts at 0.5 (tiers 0.75…1.75); beam heal 3→4 (tiers 5/6/7/8); draining field 2,000→1,200g; armor half price | Every early complaint above |
| Warlock | lightning mana 25→20 (tiers 23/26/29/32); armor half price; storm untouched | Easier early game and mana, same maxed ceiling |
| Thief | HP 40→50; knives 5→6 | Fragile and weak at the start; already strong late |
| Sorcerer | HP 35→40; comet mana 25→20 (tiers 25/30) | Second-weakest by the numbers |
| Paladin / Ranger / Wizard | unchanged (beyond movement and combo) | The consensus strong classes |

## Sources
- Steam, "Best Classes?" (January 2016, the developer posts in it): https://steamcommunity.com/app/239070/discussions/0/458606248622277822/
- Archived forum: `https://web.archive.org/web/2020/http://hammerwatch.com/forum/index.php?topic=N.0` for topics 15, 27, 1671, 1706, 1787, 1811, 1906, 1941, 1964, 2062, 2115, 2144, 2370, 2374.
- GOG release notes: https://www.gogdb.org/product/1207659483/releasenotes
- GamingOnLinux on the Thief (May 2014), Temple of the Sun (September 2014) and the 2018 updates.
