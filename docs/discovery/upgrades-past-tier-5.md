# Upgrades past tier 5 (verified by experiment; built 2026-10-22)

**Built** as the Players tab's tier counts (`player.<chain>.levels`, `players/ladder.ts`,
`players/levels.ts`). Where it differs from the sketch below:
- Every chain with upgrades has a count, not only the stat chains. It can grow past
  stock when its last upgrade sets a number or a numbered buff.
- The cap is 999, not 99 (2026-10-22, the user's call). Past 99 is `[UNVERIFIED]` in game.
  It's the app's own limit: every chain at 999 writes ~37 MB of player files.
- Prices follow the stock price ladder, not +100 a level.
- Added tiers are editable.
- The starting-level trap is handled by patching the shop script, not by forbidding it.

See the 2026-10-22 discovery-log entry and checklist #90–#94.

**Experiment (2026-10-21):** can the shop sell upgrades past the stock tier 5, up to level 99?
The generated scenario `dungeon_1801046482` was hand-edited and installed as
`dungeon_1801046482_xp99` ("Dungeon #1801046482 (Lv99 test)"). The code wasn't changed.
**`[VERIFIED]` (user, in game): everything worked.** The diamonds paid out, and each chain
below was sold level by level up to 99 and took effect.

The edit script is `scripts/dev/extend-upgrades-xp99.mjs`. The unpacked build is in
`<AE>/editor/generated/dungeon_1801046482_xp99/`.

## How AE decides a skill's levels `[VERIFIED]` (stock scripts)

- **There is no cap.** A chain's level count is `1 + upgrades.length` (`PlayerClass.as`
  builds `m_levelParams` from the `skill` dict plus each `upgrades` entry). `SkillUp`
  (`PlayerRecord.as:399`), the `PlayerSyncSkillLevel` message and the save load
  (`PlayerRecord.as:321`, which clamps to `m_levelParams.length()`) all go by that length.
- **The shop sells a level by its `category`.** `SkillShopMenuContent.AddUpgradesToShop`
  lists the next level only if its `category` is one the ShopArea sells. A new level can
  reuse the chain's tier-5 column (`off5`, `def5`, `misc5` or `combo5`). Every lobby that
  sells that column then sells levels 6 and up, with no `.lvl` change.
- **The `lvl` field is cosmetic.** The engine goes by array position. Stock
  `thief_dodge.sval` has its 4th level marked `lvl 2`, so tiers must be keyed by position,
  never by `lvl`.
- **Names and descriptions take any level.** `.hp-uname?lvl=57` and the `curr-…`/`…`
  description arguments rendered fine.

## The starting-level trap `[VERIFIED]` (stock scripts)

The shop reads `m_levelParams[picked]`, but the skill's real level is
`picked + starting-level` (`GetSkillLevel`). The two only agree when `starting-level` is 0.

- **A root with `starting-level` > 0:** index 0 is the `skill` dict, which has no
  `category`, so none of the root's remaining upgrades are listed.
- **A modifier with `starting-level` > 0:** it is listed again at its level-1 price, as the
  2026-10-14 log entry says. After that the shop shows the label and price of a tier the
  player already owns, while `SkillUp` grants a higher one.

This refines the 2026-10-14 log entry, which says a root with `starting-level` > 0 "lists
only its next upgrade". That holds only when the root has no upgrades left to sell.

For this feature, an extended chain must ship with `starting-level` 0, so the player buys it
from level 1. The experiment's base scenario was **Fully upgraded** (`owned`, `cost 0`,
`starting-level` at the top), so each extended chain was reset to its stock column and costs.
Its bind values were kept, so the Players-tab tuning stayed. "Own levels 1–5, buy 6–99" would
need a patched `SkillShopMenuContent.as` that indexes by `GetSkillLevel`, the way `Player.as`
is already patched for owned combo. That is `[UNVERIFIED]`.

## What the experiment shipped

| Chain | Files | Stock levels | At level 99 (this scenario's tuning) |
|---|---|---|---|
| HP `.hp-uname` (root) | `<class>_misc_health`, 7 classes | 5 | 1,040–4,530 max HP |
| Mana `.mana-uname` (root) | `<class>_misc_mana` | 5 | 2,515–7,500 mana; regen 24–98 |
| Armor `.armor-uname` (modifier) | `<class>_misc_armor` | 5 (sorcerer and wizard 4) | about 100 flat block |
| Dodge `.dodge-uname` (root) | `ran_dodge`, `thief_dodge` | 5 | 99% (capped) |
| Move speed `.speed-uname` (modifier) | `shared_speed`, `shared_speed_melee` | 3 | 11× |
| Main attack damage (modifier) | `.paldmg` pal_sword, `.pridmg` priest_smite, `.rngdmg` ran_bow, `.srcdmg` sorc_shard, `.thidmg` thief_knives, `.wardmg` warlock_dagger, `.wizdmg` wiz_fireball | 5 | 306–602 per hit |
| Combo timer, nova, heal, mana (modifiers) | `shared_combo` | 5 each | 25.75 s; 398 nova parts; +396 HP/s; +400 mana/s |

Rules for each level past the stock top (N = last + 1 … 99):

- **Template:** the chain's last upgrade dict, with `name` `?lvl=N`, `lvl` N, and `category`
  set to the last column's tier 5.
- **Cost:** the last stock cost + 100 × (N − last). That is about 0.8M per chain from 1 to 99.
- **Numeric binds and description arguments:** linear from the last two levels,
  `v_last + (N − last)·(v_last − v_prev)`. Ints are rounded, floats kept to 3 decimals, and
  a bind a level doesn't set is inherited from the level below. A step of 0 stays flat, which
  is how the ranger's `proj-speed` and `proj-ttl` behaved.
- **Dodge** goes evenly from 50% at level 5 to 99% at level 99. Linear would pass 100% by
  level 10, and an `Evade` chance of 1 means never hit.
- **String binds:**
  - `combo_*_regen_level_K` becomes `level_N`. The buffs it names had to be added to
    `tweak/buffs/buffs.sval` as `%block Combo_health_regen combo_health_regen_level_N <v>`
    lines, and the same for mana (+4 per level here).
  - `combo-nova-projectile` stays `combo_nova_level_5.unit`. There is no level-6 unit, and
    `aeAssetExists` would reject one.
  - Wizard `proj-fx` (`wiz_fireball_hit.effect?radius=R`) follows the extrapolated
    `proj-radius`.
- **Money:** a scenario override of `items/pickups/money/diamond_red.unit` at 500,000 (20 per
  lobby). The generator's lobby purse already does this properly (see "Stock-town payout
  spots", 2026-10-21, in the log).

## Feature sketch for the Players tab

Players-tab overrides are line edits on the install's own files (`patch.ts`,
`applyLineEdits`). The game's files are never stored in the repo. Extending a chain adds
lines rather than changing values, so:

1. **Parameter.** Proposed: a per-chain level count, `player.<chain>.levels`, from the stock
   count to 99, absent meaning stock. Also a bulk action in `bulk.ts`: "extend the stat chains
   to N". The chains are the table above, keyed as in `fields.ts`, for example
   `warlock_dagger:warlock_dagger_dmg`. Per the invariants, it needs a validation rule and a
   test:
   - N is a whole number from the chain's stock count to 99.
   - `starting-level` must be 0 on an extended chain, unless the shop-script patch above is
     built and verified. That also means it conflicts with **Fully upgraded** on that chain.
   - At least one lobby must sell the chain's tier-5 column (`shopCategories`). Otherwise
     the new levels are unbuyable, so this is a warning.
2. **Emission.** Add a `LineEdit` kind that appends text after a line, for example
   `{ line, kind: 'append', text }` doing `lines[i] += '\n' + text`. Line indices stay as
   split, so the existing value edits keep their numbers.
   - The generator renders each new tier dict itself. It's pure: the `stock.generated.ts`
     snapshot has each tier's bind names, types and stock values. It anchors the text on the
     closing line of the chain's last upgrade dict, which needs that line number added to the
     snapshot (`scripts/scan-ae-players.ts`).
   - The new tiers extrapolate from the *effective* last two tiers, after the user's tweaks,
     as the experiment did.
   - Combo heal and mana also emit `buffs.sval` `%block` lines through the `player.extra`
     path that already patches that file.
3. **Special cases to carry over:**
   - The dodge cap.
   - The nova projectile staying at level 5.
   - Fireball `proj-fx` following `proj-radius`.
   - Keying by position (the `thief_dodge` typo).
   - Chains with fewer stock levels (armor 4 for sorcerer and wizard, speed 3).
4. **Per-tier editing past stock** (`player.<chain>.<tier>.<bind>` for tier > stock) would
   need fields generated from N. It's out of scope for a first cut: extrapolate and show the
   level-99 numbers in the loadout summary (`loadout.ts`).
5. **Tests:**
   - Read the patched file back: N tiers per chain, positions 1…N, tier-5 categories, no
     `starting-level`, balanced dicts.
   - Byte-identical output for the same parameters.
   - `aeAssetExists` on every string bind.

## Not tested

- More than 99 levels. No cap was seen in the scripts.
- Multiplayer sync and save/load at high levels. The code paths go by array length, as above.
- Extending skill-specific chains (fireball range, whirlwind duration and so on). The
  experiment covered stat chains only; linear extrapolation could take some of those
  negative or to absurd counts.
