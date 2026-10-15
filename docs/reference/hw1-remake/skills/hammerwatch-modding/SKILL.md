---
name: hammerwatch-modding
description: "How Hammerwatch loads a custom campaign and what its level format actually contains — the editor/<name>/ folder, info.xml, levels.xml, level XML sections (tilemap, doodads, actors, scripting, items, lighting), the tweak/*.xml player-balance files, LevelPacker.exe and the .hwm, and the asset paths for actors, doodads, items and tilemaps. Load this when emitting or changing level XML, when changing class stats / upgrade costs / difficulty multipliers or anything under src/generator/tweak, when adding or wiring up custom monsters from the actor folder, custom doodads or terrain/tilesets, when a packed campaign fails to load or does not appear in the game's level list, when changing the install/export pipeline, or when recording a newly discovered asset path or editor constraint."
---

# Hammerwatch campaign format & modding surface

Every fact here is tagged:

- `[VERIFIED]` — confirmed working in the actual game/editor, evidence noted.
- `[EMITTED]` — this generator emits it and the original Java tool emitted it
  too, so it is very likely correct, but nobody in this repo has re-confirmed
  it against a live install.
- `[UNVERIFIED]` — inference or hearsay. **Never present these as fact to the
  user, and never build a feature on one without saying it's unconfirmed.**

Most of this file is `[EMITTED]`: the port was diffed against the Java tool,
not against the game. Upgrading tags is the whole point of the discovery log
(see "Keeping this skill current").

## How the game loads a campaign

```
<Hammerwatch>/
├── editor/
│   ├── LevelPacker.exe          Windows tool shipped with the game
│   ├── dungeon<seed>/           the unpacked campaign (input to the packer)
│   │   ├── info.xml
│   │   ├── levels.xml
│   │   ├── levels/level0.xml … levelN.xml
│   │   ├── levels/lobby.xml     optional: the prebuilt starting level
│   │   ├── levels/bossprep<i>.xml, levels/boss<i>.xml
│   │   │                        one pair per boss fight, 0-indexed
│   │   └── tweak/*.xml          optional: player balance overrides
│   ├── assetsExtract/tweak/     the game's own stock tweak files (reference)
│   └── dungeon<seed>.hwm        produced next to the folder by the packer
└── levels/
    └── dungeon<seed>.hwm        move it here; the game lists it as a campaign
```

Pipeline `[EMITTED]` (`src/main/packer.ts`, ported from `HammerwatchGen.main`):

1. Write the campaign folder under `<HW>/editor/<campaignName>/`.
2. `LevelPacker.exe <campaignName>` **with `cwd` set to `<HW>/editor/`** — one
   positional argument, no flags. Runs synchronously; the port gives it a 120 s
   timeout. The argument must be the bare folder name: LevelPacker uses the
   path it is handed verbatim as the resource key for every file it copies
   rather than compiles, so an absolute path yields keys like
   `Z:/home/…/editor/<name>/levels.xml`, the game can't find `levels.xml`, and
   it dies in `LevelList..ctor` at Start. `[VERIFIED]` — see the 2026-07-29
   packer-path entry in `references/DISCOVERY-LOG.md`.
3. The packer drops `<campaignName>.hwm` **beside** the folder, in `editor/`.
4. Move that `.hwm` into `<HW>/levels/`.
5. If `cleanupFiles`, delete the unpacked folder.

The campaign then appears in the in-game level list under the `<name>` from
`info.xml` (this generator uses `Dungeon #<seed>`).

Cross-platform `[VERIFIED in this codebase]`: `LevelPacker.exe` is
Windows-only. On Linux/macOS the app shells out to `wine`; without wine the
user must "Export folder" and pack elsewhere.

`.hwm` internals `[VERIFIED]`, read-only: it is **not** a zip. Magic `HWRP`,
`uint32` version (100), `uint32` length + `info.xml`, `uint32` length + icon
PNG (length 0 when the folder has no `icon.png`), then one gzip stream holding
a name-keyed resource table. Level XML is compiled into `levels/<n>.xml.bin`
entries alongside the raw source. Enough to inspect a pack's resource keys
when a campaign won't load; not enough to write one — keep using LevelPacker.

### info.xml

```xml
<info>
	<name>Dungeon #12345</name>
	<description></description>
	<lives>0</lives>
</info>
```

`lives` 0 = unlimited `[UNVERIFIED]`. Tabs, not spaces — the original used
tabs and the port reproduces them byte for byte.

### levels.xml

```xml
<levels start="0">
<act name="lvl.act1">
<level id="0" res="levels/level0.xml" name="lvl.floor?floor=0" />
…
       </act>
</levels>
```

- `start` = id of the first level.
- `act name` and `level name` are **localization keys**, not display strings.
  `lvl.act1` and `lvl.floor?floor=N` resolve against the game's string table;
  `?floor=N` is a parameter substituted into the localized template
  `[EMITTED]`. A raw string here may render literally or not at all
  `[UNVERIFIED]`.
- `res` is relative to the campaign root.
- Ids are **not** all integers. A floor's id is its own index, but the lobby is
  `"lobby"` and each fight emits **two** entries, `bossprep<i>` and `boss<i>`
  (`campaign.ts`'s `bossPrepId` / `bossArenaId` and the matching `*Path`
  helpers own that naming).
- Entries are listed in **campaign play order**, not numeric order
  (`src/generator/index.ts`, the `for (const slot of order)` loop). A boss fight
  can therefore sit between two floors, and its two entries appear there.
- `?floor=N` counts **positions in that order**, not floor indices — a fight
  takes two labels because it is two levels. Under the default order this is
  floors 0..N-1 then the fights, which is byte-for-byte what was emitted before
  the order was configurable.

### levelN.xml

One unnamed root `<dictionary>` containing, **in this order** (`[EMITTED]` —
`Level.getXML()`):

| Section | Contents |
| --- | --- |
| `tilemap` | `tiledata` array of 20×20 blocks |
| `doodads` | `doodads` array |
| `actors` | `actors` array (monsters) |
| `scripting` | `nodes` array |
| `items` | `items` array |
| `lighting` | `lights` array + `ambient-color` + `shadow-color` RGBA dicts |

XML dialect (`src/generator/xml/`):

```xml
<dictionary name="x"> … </dictionary>   children one per line, name attr omitted when empty
<array name="x"> … </array>             children concatenated, no separator
<int name="x">5</int>                   truncated
<float name="x">5.000000</float>        always 6 decimals (Java %f)
<bool name="x">True</bool>              capitalised
<string name="x">actors/bat_1.xml</string>
<int-arr name="x">0 1 2 3</int-arr>     space separated
```

**Tilemap blocks.** The map is cut into 20×20 blocks; the generator emits
`ceil(w/20)+1` × `ceil(h/20)+1` of them (the +1 is the original's behaviour —
extra empty blocks are harmless `[EMITTED]`). Each block carries `x`, `y` and a
`datasets` array of one or more dicts. The boss arena stacks `tilemaps/water.xml`
under its theme so nothing shows through as void, and an overlay theme
(`c - tiles`) stacks its alternate tileset over the base floor.

Draw order is the `level` attribute each **tileset XML** declares, *not* the
order datasets appear in the block `[VERIFIED]` — `water.xml` is `level` 1, below
every classic tileset, and each `<theme>_default` is the lowest `level` in its
own family. Emit low-to-high anyway so the file reads the way it renders. Each
dataset holds:

- `tileset` — path to the tilemap XML, e.g. `tilemaps/a_default.xml`
- `data-t` — 400 ints, floor tile variant per cell, `0` = wall/void, otherwise
  `1..tiles` for that tileset
- `data-r`, `data-g`, `data-b`, `data-a` — 400 ints, all `255` (per-tile tint).
  `data-a` may instead be `0` where `data-t` is `0`, which is what the shipped
  levels do for a layer meant to be transparent over the one below. For any layer
  stacked *above* another this is mandatory, not optional: a flat 255 paints the
  layer's art out over the void beyond the floor.

A block's `x`/`y` is **not** its top-left corner: cell *i* maps to world
`(x - 10 + i%20, y - 10 + floor(i/20))` — see `Level.getTiles`. That −10 is from
the original; don't "correct" it without checking the rendered map.

**`x` and `y` must be multiples of 20** `[VERIFIED 2026-08-13]`. The engine
snaps them to that grid and discards anything else, so a block declared at −25
draws as though it were −20. If your level's entities sit in a space offset from
its rasterisation grid, put the offset in the *sampling*, never in the declared
position. This cost several rounds of playtesting on the boss arena — see
ASSET-REGISTRY's "Block origins must be multiples of 20".

**Entities.** Doodads: `id`, `type` (path), `x`, `y` (float, with a per-type
offset applied), `need-sync` (bool). Actors and items: `id`, `type`, `x`, `y`.
`id` is level-local and restarts at 0 each floor; script nodes reference other
nodes and items by that id, so ids must stay unique within one file.

**Script nodes.** `src/generator/objects/nodes.ts` exports 17 — `LevelStart`,
`LevelExitArea`, `AreaTrigger`, `RectangleShape`, `ToggleElement`,
`ToggleImmortality` (the boss's invulnerability windows), `ChangeDoodadState`,
`AnnounceText`, `ObjectEventTrigger`, `GlobalEventTrigger`, `TimerTrigger`
(timer mode and the scatter batch timers), `SpawnObject` (the whole wave and
wave-pickup rig — one node per spawned copy), `DestroyObject`, `PlaySound`,
`ShopArea`, `GameEnd`, `DangerArea`, plus the plain `RespawnPlayers`. Nodes
wire to each other by id inside `<dictionary name="shape">` / `element` / … with
an `<int-arr name="static">` holding the target id. A connection can carry its
own delay, which is how the invulnerability rig sequences immortal-on, the
countdown announces and immortal-off off one trigger.

### tweak/*.xml — player balance

Optional. The game's own balance tables live in
`<HW>/editor/assetsExtract/tweak/` and a campaign may ship its own copies in
`tweak/` inside the campaign folder. Nine files `[VERIFIED — read from a real
install]`:

| File | Root | Contents |
| --- | --- | --- |
| `general.xml` | `<dictionary>` | one `<dictionary name="easy\|medium\|hard">` per difficulty, enemy health/damage/speed/spawn/money multipliers. No upgrades. |
| `shared.xml` | `<tweak>` | cross-class params + upgrades (health, rejuv, potions, movement speed, combos) |
| `knight.xml`, `priest.xml`, `ranger.xml`, `sorcerer.xml`, `thief.xml`, `warlock.xml`, `wizard.xml` | `<tweak>` | that class's starting params + its shop tree |

There is no paladin/gladiator — those are Heroes of Hammerwatch, a different
game.

**A campaign's tweak file replaces the base file wholesale** `[VERIFIED —
played in game 2026-07-30]`. Deleting the health upgrades from a campaign's
`knight.xml` removed them from the shop; under a key-level merge they would have
survived from the base file. (Corroborating: the official Temple of the Sun
campaign ships a *complete* `shared.xml` with 28 upgrade entries against the base
file's 34, deleting `pot-invul`.) This is why `src/generator/tweak/baseline.ts`
carries a full transcription of all nine stock files: changing one number still
means emitting the whole file, and that is now a requirement rather than a
precaution.

**Removing an upgrade is therefore a supported edit** — leave it out of the
emitted file and it is not in the shop. `player.<file>.remove.<upgradeId>` does
this, cascading to anything whose `req` chain reaches it so no dangling `req` is
ever written. It is a better "nothing to buy" than an unaffordable price.

Unit-file shape:

```xml
<tweak>
	<params>
		<dictionary>
			<int name="max-health">100</int>
			<float name="sword-dmg">9</float>
		</dictionary>
	</params>

	<upgrades>
		<dictionary id="health-1" cost="1000" cat="misc1" name="upg.health1" desc="upg.health1.desc" />
		<dictionary id="dmg1" cost="1500" req="health-1" cat="off1" name="…" desc="…">
			<float name="sword-dmg">14</float>
			<int name="lvl">1</int>
		</dictionary>
	</upgrades>
</tweak>
```

**The tweak dialect is not the level dialect.** `src/generator/xml/` cannot
express it, which is why `src/generator/tweak/xml.ts` exists as a separate
serializer. Differences:

| | level XML | tweak XML |
| --- | --- | --- |
| attributes | only `name` | arbitrary: `id`, `cost`, `req`, `cat`, `name`, `desc`, `life-cost-scale`, … |
| bools | `True` / `False` | `true` / `false` (lowercase) |
| floats | always 6 decimals (Java `%f`) | shortest round-trippable form — `0.75`, `1` |
| empty elements | always paired tags | self-closing `<dictionary … />` when an upgrade has no children |

Semantics that matter when editing values `[VERIFIED — from the stock files;
see `reference/hammerwatch-tweak-stats.md` for the full tables]`:

- An upgrade **sets** a param to an absolute value, it does not add to it.
  `sword-dmg` 9 → upgrade `dmg1` → 14, not 23.
- `req="<id>"` chains an upgrade behind another; no `req` = available at once.
- `cat` is the shop grid slot: `misc1`–`misc5`, `off1`–`off5`, `def1`–`def5`.
- **A chain caps at 5 tiers and the engine hardcodes it** `[VERIFIED
  2026-07-30]`. Appending `health-6`…`health-10` with `cat="misc6"`…`"misc10"`
  does nothing at all — no shop rows, no stat change. Never offer to lengthen a
  ladder; `chains.ts` only ever rewrites tiers that already exist. Whether the
  ceiling is the chain length or the `cat` namespace is open question 11 in the
  discovery log.
- **`cost` may be 0 or negative** `[VERIFIED 2026-07-30]`. 0 buys normally for
  nothing; a negative price *pays* the player that much gold, which the app
  supports on purpose for "sell your character down" shops. `999999` is the
  largest figure the shop will display.
- `name` / `desc` are **localization keys**, not display text. Editing them to
  literal strings has the same unknowns as the `levels.xml` keys above.
- `lvl` inside an upgrade is a display-only tier number.
- `-1` in `<params>` (and `9999` for mana costs) is the "skill locked"
  sentinel — the unlocking upgrade writes the real value. **To hand a character
  a skill it would normally buy, set the `bool` true *and* write the numeric
  params the unlock upgrade would have written** `[VERIFIED 2026-07-30]`; the
  flag on its own gives a skill whose duration is -1. This is why
  validation only floors the handful of params that genuinely must be
  positive; negative is legitimate almost everywhere.
- **Two string params start empty and are lethal if left that way**
  `[VERIFIED 2026-07-30]`: `shared/combo-nova-projectile` and `priest/aura-buff`
  are `""` at creation and only an upgrade fills them in. Arm the skill's numbers
  without the path and the game throws a `NullReferenceException` in
  `PlayerActorBehavior.Update` the first time it fires — mid-combat, so it passes
  every load-time check. `validation.ts` blocks this shape.
- `mana-regen` is a **period in ms per mana point** — lower is faster.
- Duration units are inconsistent by design: `area-duration` and `fnova-ttl`
  are ms; `whirl-dur`, `storm-dur`, `combust-dur`, `orb-time` are seconds.

What this generator emits `[VERIFIED — loaded in game 2026-07-30]`:
only the files the user actually changed. A stock run writes no `tweak/`
folder at all, so the pre-tweak behaviour is preserved exactly.
`src/main/packer.ts` creates nested paths with `mkdir(dirname, {recursive})`,
so `tweak/knight.xml` needs no pipeline change.

### Changing what's editable

Values are **not** enumerated by hand — `TWEAK_FIELDS` in
`src/generator/tweak/overrides.ts` is derived by walking `TWEAK_BASELINE`. So:

- **To expose a value that already exists in the stock files:** nothing to do
  if it's an `int`/`float` — it's already a field, whether it sits in `<params>`
  or inside an upgrade's `children`. `bool` params are editable too, carried as
  0/1 so the skill unlocks can be pre-set, and `string` params as an **index** into
  `TweakFieldDef.choices` — every value the stock data gives them, starting value
  first — which keeps `PlayerTweaks` numeric and makes an unshipped path
  unrepresentable. Only an upgrade's `lvl` is excluded outright (it is the tier
  index, not balance).
- **To add a new param or upgrade:** add it to `baseline.ts`. The form, the
  `parameters.txt` round-trip, the validator and the loadout sheet all follow
  automatically. Keep the transcription faithful to the install — this file is
  supposed to be the stock game, and any drift silently ships wrong balance.
  (It has been checked field-for-field against a real install; see the
  DISCOVERY-LOG entry.)
- **A new file** needs a `TweakUnitFile`/`TweakGeneralFile` entry plus, if it's
  a playable class, an id in `TWEAK_CLASS_IDS` so the loadout sheet covers it.
- New upgrades also need a `shopGroupOf` rule, or they land under
  "Other upgrades" in the form.
- **Upgrade ladders** are grouped by `buildChains()` in
  `src/generator/tweak/chains.ts`, which strips trailing digits off the id to
  find the family and reads the tier number from the `lvl` child — never from the
  id, because knight's tier-2 whirl duration really is `id="whirldur"`. The form
  edits a ladder through a first cost, a per-tier cost step and a per-tier step
  per stat, then expands that back into ordinary per-tier overrides; the curve
  itself is never stored.

## Asset surface

Paths are relative to the game's asset root and are referenced as plain
strings — nothing in the campaign folder resolves them, so a typo produces a
silently missing entity or a load failure rather than a build error.

The full inventory of paths this generator emits is in
[`references/ASSET-REGISTRY.md`](references/ASSET-REGISTRY.md). Summary:

- **Actors** — `actors/*.xml` and `actors/spawners/*.xml`. 51 monster types in
  `src/generator/objects/monsterTypes.ts`, each with a **tier list**: index 0
  is usually the spawner variant, higher indices are *usually* stronger
  variants, rolled upward by `upgradeChance` (0.2-0.5 per type, from the original
  tool — a blanket `1.0` is the issue #58 bug that pinned every monster to its
  top tier). The order is authoring order, not a guaranteed difficulty ladder,
  and it is the wire format for `#N` pool keys: never reorder one.
  Every path in that file must also appear in
  `tests/fixtures/actor-paths.txt` — the roster once shipped an actor the game
  never had (see the 2026-07-31 discovery-log entry). A second registry,
  `MONSTER_FAMILIES`, groups several whole types under one dungeon-floor pool
  key (`tower_banner` → `tower_banner1/2/3`); it lives outside `MONSTER_TYPES`
  on purpose, which is what keeps it out of the arena picker.
- **Doodads** — `doodads/generic/*` (torches, markers), `doodads/special/*`
  (vendors, colour covers, the shared bonus entrance/exit), `doodads/theme_<t>/<t>_*.xml`
  (wall pieces; the theme's token is substituted **twice** into the path — it is
  a letter for the classic themes and `bonus1`…`bonus5` for the bonus sets).
- **Items** — `items/*.xml`: valuables 1–9, breakables, health/mana, powerup
  potions and chests, bronze/silver/gold keys and doors, three crystal orbs.
  The subset a boss wave tier can drop is the registry in
  `src/generator/objects/pickupTypes.ts` (`PICKUP_DEFS`); their verified in-game
  restore values are in `references/ASSET-REGISTRY.md`.
- **Tilemaps** — `tilemaps/{a,b,c,d,e,f,g,h,i}_default.xml` plus
  `tilemaps/bonus_{1..5}.xml`. Variant counts differ per theme (a: 2, b: 4,
  c: 4, d: 8, e–g: 2, h: 2, i: 8, bonus1: 2, bonus2–5: 1) and must match the
  `tiles` field in `config/themes.ts` or `data-t` will index a variant the
  tileset doesn't have. **Count top-level `<sprite>` only** — sprites inside a
  `<borders>` block are engine-selected, and counting them is what once recorded
  theme `h` as having 14 variants when it has 2.

## Adding custom content

### A new monster type

Pure data — append to `MONSTER_TYPES` in
`src/generator/objects/monsterTypes.ts`:

```ts
{ id: 'my_monster',            // id used in monstersN pools
  configKey: 'maxMy_Monsters', // parameters.txt key
  upgradeChance: 0.3,          // chance the tier roll climbs another rung;
                               // inert for a 1- or 2-tier type. NOT 1.0 —
                               // fRand(0, 1) is [0, 1), so 1.0 always tops out
  defaultMax: 0,               // 0 = disabled by default; safe for new types
  group: 'Special',            // must be a member of MONSTER_GROUPS
  tiers: ['actors/spawners/my_monster.xml', 'actors/my_monster.xml'] }
```

That single entry is enough — validation, the `parameters.txt` round-trip, the
monster-pool editor and the max-count table all derive from this array. Then:
verify the actor paths exist in the target install, add them to
`tests/fixtures/actor-paths.txt` (the roster-wide guard test fails otherwise —
that is the point of it), add the key to `parameters.default.txt`, and record
the paths in the discovery log with whatever tag the evidence supports.

**Retiring a type is a repoint, not a delete.** Removing an id turns a saved
pool entry in someone's `parameters.txt` into a hard validation error, so point
its `tiers` at a real actor and set `deprecated: true` — both
`MonsterPoolsEditor` and `MonsterMaxTable` filter those out, while
`configFile.ts` keeps parsing and emitting the key. `tower_archer2` is the
worked example.

**Append at the end.** `monsterTypeById` falls back to the *positional*
`MONSTER_TYPES[3]` (`bat1`) for unknown ids, so inserting at index ≤ 3 changes
what an unknown id resolves to. Appending does not make the GUI list read out of
order: both lists call `monsterTypesInGroup(group)`, which drops `deprecated`
types and sorts by id. Sort there, never by moving array entries.

**Size the cap by what actually kills a party.** `defaultMax` was twice reasoned
from HP alone and once corrected by play: `skeleton3` at 200 (half `skeleton1`'s
HP, so double its cap) swarmed and overran players, and came down to 100. For a
fast melee monster, movement speed sets the ceiling before HP or frame rate
does — see the 2026-07-31 entry in the discovery log.

**A single-tier entry is safe.** `createRolled` clamps to the last index, so a
type with one actor and no spawner (like `bonus_archer1`) emits that actor
everywhere, including in a Lair's spawner slots. It used to emit `undefined` —
see the discovery log.

**Adding a whole group** means adding it to `MONSTER_GROUPS` in the same file;
that array is the render order for both `MonsterPoolsEditor` and
`MonsterMaxTable`. A group that only exists in the `group` union renders nowhere,
with no typecheck error.

**Warning:** ids are matched exactly and `configKey` is matched
case-insensitively. Reusing an existing `configKey` silently overwrites.

**Every tier is addressable.** A boss-arena wave names a **variant key** —
`variantKey(type, tier)`: `bat1#0` the spawner, `archer1#2` the elite — while
the bare id keeps meaning the type's pinned tier, which is what stops older
pools breaking. Adding a tier therefore adds a pool entry the user can pick, so
add an entry to `MONSTER_NOTES` (keyed by variant key, falling back to the
bare id) if what the tier does is not obvious from its name.

**If the new actor is a tower or a spawner, record its wreck.** Add it to
`objects/actorCollision.ts`: an actor whose razed corpse keeps a `<collision>`
block is permanent geometry, so validation forbids scattering it in the arena
(a scattered wreck can wall the fight off). Read the razed XML — the answer is
produced three different ways and grepping for the tag gets the commented-out
cases exactly backwards.

**A stock default that changes must change `parameters.default.txt` too** —
`tests/configFile.test.ts` parses that file and asserts it round-trips to
`defaultParameters()`.

### A new doodad / terrain piece

Add to `DoodadType` in `src/generator/objects/doodad.ts` with its `path`,
`xOffset`/`yOffset` (added to the tile coordinate on emit — this is how the
game's anchor points get corrected) and `themeSubs` (`0`, `1`, or `2` — how
many times the theme letter is substituted into the path). Themed wall pieces
use `themeSubs: 2` (`doodads/theme_%s/%s_*.xml`).

To have the wall matcher actually place a new piece you must also add a
pattern to `src/generator/map/wallPattern.ts` — a 3×5 mask over the tile grid.
That changes emitted geometry, so add a fixed-seed test.

### A new pickup

Add one entry to `PICKUP_DEFS` in `src/generator/objects/pickupTypes.ts`. The
contract is the same as the monster and buff registries: a stable `id`, the
`items/*.xml` path, a `group`, a `lane` (which column of the arena's drop pad it
lands in — `boss/pickupPad.ts`), and a `description` the picker shows.
Everything else derives — `PICKUP_GROUPS` is built from first-seen `group`
order and is the `<optgroup>` render order in `PickupPicker.tsx`, `pickupById`
is what validation gates unknown ids with, and `parameters.txt` round-trips the
id as written.

The id is the file format, so **never rename one** — a `boss<i>WavePickupN` line
naming it stops loading. A count is bounded by `MAX_PICKUP_COUNT` (64) because
every copy is its own `SpawnObject` node. Confirm the actor path exists in the
install before adding it, the same way monster paths are checked.

### A new theme / tileset

Add one `ThemeDef` to `BASE_THEME_DEFS` in `config/themes.ts`. Everything else
derives from it: `THEME_DEFS`, `THEMES`, validation, the `parameters.txt`
round-trip, the grouped dropdown, the tileset emitted by `map/level.ts` and the
doodad paths.

An entry in `THEME_OVERLAYS` gives that base a paired `x - <suffix>` entry
whose second tileset is drawn over the floor, and any base with at least one
overlay automatically gains an `x - mixed` entry whose palette is
`[null, ...its overlays]` — one surface per room/corridor on a dungeon floor,
one geometric pattern in the arena. Both are generated by `overlayOf` /
`mixedOf`; do not hand-write either def, and never set `overlay` and `mixed` on
the same def. Check a candidate overlay's `level` attribute in its own tileset
XML: an overlay whose `level` is below its base's renders underneath and the
pairing silently does nothing.

The tileset path and the doodad token are **separate fields** on purpose — the
game does not name them consistently (`tilemaps/bonus_3.xml` pairs with
`doodads/theme_bonus3/bonus3_*.xml`). Do not try to derive one from the other.

Confirm the matching `doodads/theme_<token>/` wall set exists — a theme without
wall doodads produces a level with no visible walls. **List the folder; do not
search it for the names another theme uses** — that is how theme `h` was written
off for months as shipping "only corner pieces". If it is missing individual
pieces, use `doodadOverrides[piece].path` to point them at a complete replacement
(used verbatim, no `%s`). **Never just skip a missing piece**: wall doodads carry
the collision, so a gap in the set is a gap the player walks through.

**And never judge a piece's collision from its bounding box** `[VERIFIED
2026-08-13]`. Take the min/max of a `<polygon collision="true">`'s points and a
diagonal sliver reads as a solid tile. Sample the polygon instead. No piece in
theme `h` covers more than 56% of its tile and most cover 25%; it seals a room
only by joining fences into a closed loop around a *thick* wall mass, so a
one-tile wall band cannot be sealed with it at all. Three consecutive "fixes"
to the boss arena failed on this one mistake before anyone measured properly.

**Spend the effort on the tees.** The piece mix is roughly 84% `T*`, 6.5%
`CrossWall`, 6% corners, 1.7% straights and ~0% caps, so whatever art the tees
resolve to is what the theme looks like. A set with no tees may still have its
own answer: theme `h` is an outdoor cliff set with a face per direction and no
junctions, and each `T*` — a wall mass open on exactly one side — maps onto the
face pointing that way (`TDown`→`h_h_8_dn`, `TUp`→`h_h_8_up`, `TLeft`→`h_v_8_l`,
`TRight`→`h_v_8_r`). Borrowing another theme's tees instead would have made an
`h` level render as theme `i`.

**Then read the new art's `<origin>`, and do not assume the classic offsets
apply.** `DoodadType`'s offsets exist purely to compensate for the classic
anchor — `yOffset` = the asset's `origin_y / 16` — and they move the collision
polygon along with the sprite. The bonus sets are anchored `0 0` where the
lettered ones are `0 32`/`0 16`, so they override every wall piece to
`yOffset: 0`. Getting this wrong yields walls that render but do not block. See
`references/ASSET-REGISTRY.md` for the offset table.

Set `tiles` to the tileset's `<sprite>` count — read it out of the tileset XML
rather than guessing; when genuinely unknown, `1` is the only always-safe value.

All of this is checkable without launching the game: the assets are extracted at
`<HW>/editor/assetsExtract/`, and the stock campaigns under
`<HW>/editor/campaign*/levels/` show how the game itself uses a tileset.

## When a campaign fails to load

Work down this list before touching the generator:

1. Did `LevelPacker.exe` actually run, and did `<name>.hwm` appear in
   `editor/`? The port reports both failures distinctly.
2. Is the `.hwm` in `<HW>/levels/`, not `<HW>/editor/`?
3. Does every referenced asset path exist in that install? A path valid for
   one version/DLC may not be for another — the desert set in particular
   `[UNVERIFIED]`.
4. Is `levels.xml` `start` an id that exists, and does every `res` resolve?
5. Does `data-t` reference a variant index above the tileset's count?
6. Was a `tweak/` folder emitted? Re-generate with the Player tab reset (the
   header button clears tweaks when that tab is active) — if it then loads,
   the fault is in the tweak XML, not the levels. `[UNVERIFIED]` whether a
   malformed tweak file fails the pack, fails the load, or is silently ignored.
7. With more than one boss fight, or a non-default `levelOrder`: does
   `levels.xml` list a `bossprep<i>` **and** a `boss<i>` entry for every fight,
   with `res` paths that resolve? And does only the **last** campaign slot carry
   `GameEnd` + the orb? An earlier arena must emit `BossPortal` instead
   (`objects/objectSet.ts`); if two slots carry `GameEnd` the campaign ends at
   the first one.
8. Export the folder and open it in the Hammerwatch editor — it reports
   malformed level XML far better than the game does.

## Keeping this skill current

The asset surface is only partly known, and this is the file that has to grow
as we learn. Whenever a run teaches us something about what the editor or
`LevelPacker.exe` actually accepts:

1. Append an entry to
   [`references/DISCOVERY-LOG.md`](references/DISCOVERY-LOG.md) — date, what
   was tried, what happened, evidence, tag.
2. Once a fact is confirmed in game, promote it into
   [`references/ASSET-REGISTRY.md`](references/ASSET-REGISTRY.md) and upgrade
   its tag here.
3. Do this **in the same change** that discovered it. A finding that only
   lives in a chat transcript is lost.
