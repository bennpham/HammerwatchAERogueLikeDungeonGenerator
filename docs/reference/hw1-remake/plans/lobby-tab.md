# Lobby tab — a prebuilt starting level with vendors and starting gold

Tracks [issue #5](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/5):
*"As the party, I would like a small lobby before diving into the dungeon."*

**Status: implemented** on `claude/lobby-tab-implementation-dnczao`, and the
template is now the real one. The first build shipped a stock-asset fallback
lobby authored by `scripts/import-lobby-assets.mjs` (no Hammerwatch install was
available at the time); played on a real install it worked but was not enclosed
— missing walls, and the party could walk off the map. It has been replaced by
`levels/test_lobby.xml` imported verbatim from the Dreadmann Mansion campaign,
with its 10 campaign-local files carried in `LOBBY_ASSETS`. The import now
derives the element ids `buildLobby` edits from the file it reads, so swapping
in a different lobby needs no hand-editing. See the newest 2026-07-31 entry in
`.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` and the "lobby
template" section of `ASSET-REGISTRY.md`. The in-game verification below is
still outstanding for the imported level.

The tab strip also leads with **Lobby | Dungeon | Player** and opens on Lobby:
setting up the lobby is the first thing a run needs, the other two are optional
passes.

---

## Context

Today a generated campaign drops the party straight into level 0 of a random
dungeon with 0 gold and no way to spend it until the first shop room rolls. The
Player tab lets you rebalance every class, but nothing signals that it's
*optional* — a new user sees a wall of stat editors and no obvious "just play"
path.

The fix from the issue is a small, hand-authored lobby: a safe room the party
spawns into, with the five upgrade vendors standing in a row and some gold on
the floor, and one teleport that takes everyone into the dungeon proper. Buying
your first upgrades in a room with no monsters in it makes the point that the
Player tab is for people who want to go further than that.

`test_lobby.xml` from the *Dreadmann Mansion* campaign is the interim art. It
gets replaced by a purpose-built lobby before 1.0, so **everything below treats
the lobby XML as a swappable template, not as generated geometry.**

Source of truth for this plan:
`<HW>/editor/pht6_quiky_dreadmann_mansion/levels/test_lobby.xml` (977 lines).

---

## What the template actually contains (decoded)

### Vendors — five stalls in a row at `y = 12`

Each stall is **three doodads + one `ShopArea` node + one `CircleShape`**:

| x | Vendor doodad | Speech doodad | Tier badge | `ShopArea` id → shape | `cats` |
| --- | --- | --- | --- | --- | --- |
| −8 | `vendor_combo` (56) | `vendor_speech_combo` (65) | `..._level5` (3349) | 3310 → 3309 | `combo1 combo2 combo3 combo4 combo5` |
| −4 | `vendor_defense` (57) | `vendor_speech_defense` (66) | `..._level5` (3348) | 3307 → 3306 | `def1 def2 def3 def4 def5` |
| 0 | `vendor_misc` (58) | `vendor_speech_misc` (67) | `..._level5` (3346) | 3305 → 3304 | `misc1 misc2 misc3 misc4 misc5` |
| 4 | `vendor_offense` (59) | `vendor_speech_offense` (68) | `..._level5` (3347) | 3297 → 3296 | `off1 off2 off3 off4 off5` |
| 8 | `vendor_power` (64) | `vendor_speech_power` (69) | *(none)* | 3295 → 3294 | `power` |

`ShopArea` nodes sit at `y = 8.5`, their `CircleShape` (`diameter 2`) at
`y = 11.75`, the doodads at `y = 12`.

Two findings that drive the whole design:

1. **`cats` is a list of independent shop columns, not a tier depth.** Writing
   `cats="misc1"` sells only the `misc1` column. `cats="misc1 misc3"` is equally
   legal. So the control must be an arbitrary subset, not a "first N" slider.
2. **The little numbers over the vendors are plain doodads**, not shop data —
   `doodads/special/vendor_speech_level<N>.xml`. Stock ships `level0` through
   `level6`, so the badge can be made to match whatever subset is selected. The
   power vendor carries no badge in the template because `power` is a single
   column.

`cat="power"` is real and stock: five `shared.xml` upgrades — `life`, `rejuv`,
`pot-dmg`, `pot-rejuv`, `pot-invul`.

This is deliberately a *starter* shop. Dungeon shop rooms
(`NodeShopArea`, [nodes.ts:134](../../src/generator/objects/nodes.ts#L134)) keep rolling
their full random 5-column set, so finding a richer vendor mid-run stays a
reward for exploring. **No change to dungeon shops is in scope.**

### Red diamonds — starting gold

`items/valuable_diamond_red.xml` is stock and pays **exactly 500** (`amount` in
its `behavior` dict). The template places 12 on a 6×2 grid:

```
x: −7.5  −4.5  −1.5   1.5   4.5   7.5
y:  −8 and −10                          → 12 slots = 6000 gold
```

Note the items section uses the **editor-saved dialect**
(`<array name="items/…xml"><array><int>id</int><vec2>x y</vec2></array>`), which
is *not* what `src/generator/xml/` emits (`<array name="items">` of dicts). One
more reason to treat the file as a text template.

### Teleport to the dungeon

```
LevelStart      15  @ (−13, 0)      id 0, dir 2
RectangleShape 228  @ (7, 0)        3×3
AllPlayersAreaTrigger 231           shape → 228, connections → [229, 232]
PlaySound      229                  sound/misc.xml:info_teleport_activate
LevelExitArea  232  @ (14, −2)      level "1", start id 0, empty shape
doodads exit_teleport_stand 3314 / exit_teleport 3315 @ (7, 0)
```

The `level "1"` string is the one value that has to be rewritten.

### Custom assets

Only **two** families referenced by the template are non-stock. Everything else
— `theme_c` ledges, all vendor doodads, `exit_teleport*`, `c_tiles.xml`,
`b_tiles_red.xml`, `c_default_border_*`, `sound/misc.xml`, the red diamond — is
in `<HW>/editor/assetsExtract/` and needs no shipping.

| File | Size | Referenced by |
| --- | --- | --- |
| `doodads/level1/c_v_16.xml`, `c_h_16.xml`, `c_v_cap_dn.xml`, `c_crn_l_up.xml`, `c_crn_r_up.xml`, `c_crn_l_dn.xml`, `c_crn_r_dn.xml` | text | 47 doodad placements |
| `doodads/level1/c_blood.png` | 26,857 B | all seven of the above |
| `doodads/lamp_torch_post_spor.xml` | text | 6 placements |
| `doodads/lamp_torch_post.png` | 3,645 B | the above |

Their only other references (`menus/minimap.xml:*`) are stock.

**Do not copy the campaign's `tweak/` folder.** Those seven files are Dreadmann
Mansion's balance and would fight the Player tab's emitted tweaks.

---

## Decisions taken

| | |
| --- | --- |
| **Level id** | Lobby ships as id `"lobby"`; `levels.xml` gets `start="lobby"`; its `LevelExitArea` points at `"0"`. Dungeon level files, ids and every existing seed's dungeon output stay byte-identical. |
| **Custom assets** | Embedded and shipped with the campaign. `GeneratedFile` gains an optional binary encoding. |
| **Shop control** | Per-category checkboxes — 5 per vendor for combo/def/misc/off, 1 for power (21 total), with an all/none shortcut per vendor. Badge doodad follows the selected count. |
| **Starting gold** | 500 increments. Fill the 12 authored slots, then **stack** extras on the same coordinates. Stacking is `[VERIFIED]` — 24 diamonds over 12 slots paid out 12000 in game (DISCOVERY-LOG, 2026-07-30). |
| **Default** | Lobby **on** by default, starting gold **0** (no diamonds), all vendors selling all their columns. |
| **Player-tab interaction** | Warn only. A vendor whose columns have no surviving upgrades after `playerTweaks` produces one advisory warning; the Lobby tab stays the sole owner of which stalls exist. |

---

## Design

### 1. Binary-capable `GeneratedFile`

[src/generator/index.ts:79](../../src/generator/index.ts#L79) — add an optional field
rather than changing `content`'s type, so every existing producer and consumer
keeps compiling:

```ts
export interface GeneratedFile {
  path: string
  /** utf-8 text, or base64 when `encoding` says so */
  content: string
  /** default 'utf-8' */
  encoding?: 'utf-8' | 'base64'
}
```

Three consumers to update:

- `writeCampaign` in [src/main/packer.ts:9](../../src/main/packer.ts#L9) —
  `writeFile(fullPath, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content, …)`.
- `dungeon:export-zip` in [src/main/ipc.ts:104](../../src/main/ipc.ts#L104) —
  `zip.file(name, file.content, { base64: file.encoding === 'base64' })`.
- `dungeon:export-folder` already routes through `writeCampaign`.

Purity is preserved: the generator still returns strings only, no `fs`, no
`Buffer`.

### 2. The lobby template module

New folder `src/generator/lobby/`:

```
lobby/
├── template.ts     LOBBY_TEMPLATE — test_lobby.xml verbatim as a string literal
├── assets.ts       LOBBY_ASSETS: GeneratedFile[] — the 4 xml + 2 png (base64)
├── shops.ts        LOBBY_VENDORS registry + cat→upgrade lookup
├── build.ts        buildLobby(options) → GeneratedFile
└── index.ts        public surface
```

`template.ts` and `assets.ts` are **generated once by a small script, then
committed**; the script lives in `scripts/import-lobby-assets.mjs` and is run by
hand when the template is replaced (which is planned before 1.0). Do not make
the build read from the Steam folder — the generator must stay pure and the app
must work without Hammerwatch installed.

`buildLobby` takes the template and applies four surgical edits. Implement them
by parsing the node/doodad/item blocks with anchored regexes over the known ids
listed above — the file is fixed and committed, so this is safe, and it survives
a template swap far better than index-based slicing:

1. **Vendor stalls.** For each of the five vendors, if its selected column set
   is empty, delete its `ShopArea`, its `CircleShape`, its vendor doodad, its
   speech doodad and its badge doodad. Otherwise rewrite `cats` to the selected
   columns (space-joined, in canonical `combo1..combo5` order) and rewrite the
   badge doodad's `type` to `vendor_speech_level<count>.xml`. `power` is
   on/off and keeps no badge.
2. **Diamonds.** Replace the entire
   `<array name="items/valuable_diamond_red.xml">` body with
   `startingGold / 500` entries, walking `LOBBY_DIAMOND_SLOTS` round-robin so
   the 13th lands on slot 0 again. Ids are allocated from a high base
   (`10000 +`) that cannot collide with the template's existing ids.
3. **Exit target.** Rewrite the `LevelExitArea` `<string name="level">1</string>`
   → `0`.
4. **Nothing else.** No RNG, no theme substitution, no re-serialization of the
   file through `src/generator/xml/`.

### 3. Parameters

[src/generator/config/parameters.ts](../../src/generator/config/parameters.ts) —
one new field on `DungeonParameters`:

```ts
/** Prebuilt starting level. `enabled: false` reproduces the pre-lobby campaign exactly. */
lobby: LobbyOptions

export interface LobbyOptions {
  enabled: boolean
  /** multiple of 500; each 500 is one red diamond */
  startingGold: number
  /** selected shop columns, e.g. ['misc1','misc2','off1','power'] */
  shopCategories: string[]
}
```

`defaultParameters()` returns
`{ enabled: true, startingGold: 0, shopCategories: ALL_LOBBY_CATEGORIES }` (all
21).

### 4. Wiring into `generateDungeon`

[src/generator/index.ts:142](../../src/generator/index.ts#L142). After the level loop,
before `info.xml`:

```ts
if (params.lobby.enabled) {
  files.push({ path: 'levels/lobby.xml', content: buildLobby(params.lobby) })
  files.push(...LOBBY_ASSETS)
  levelString = `<level id="lobby" res="levels/lobby.xml" name="lvl.floor?floor=0" />\n` + levelString
}
files.push({ path: 'levels.xml', content: `<levels start="${params.lobby.enabled ? 'lobby' : '0'}">…` })
```

**Critical:** this runs *after* the level loop and draws nothing from `ctx.rand`
or `ctx.cosmeticRand`, exactly like `emitTweakFiles`. Same seed ⇒ same dungeon
whether the lobby is on or off. A test must assert this.

The lobby is not added to the `levels` preview array — `LevelPreview` describes
procedural room/passage geometry that a hand-authored level has none of. The
Lobby tab renders its own static diagram instead (see below).

### 5. Validation

[src/generator/config/validation.ts:30](../../src/generator/config/validation.ts#L30) —
new rules, per invariant 4 in CLAUDE.md:

**Errors**
- `startingGold` must be an integer ≥ 0 and a multiple of 500.
- `startingGold` must not exceed `LOBBY_GOLD_MAX = 12000` — the depth actually
  confirmed in play (2 diamonds per slot). See the warning below for going higher.
- every id in `shopCategories` must be a member of `ALL_LOBBY_CATEGORIES`.

**Warnings**
- all 21 columns deselected while `enabled` → "the lobby has no vendors; the
  party can only walk to the teleport."
- `startingGold` above 12000 is not reachable today, but if `LOBBY_GOLD_MAX` is
  ever raised, warn past 12000 that the stack depth is untested rather than
  silently allowing it.
- a selected column whose upgrades are all removed by `playerTweaks` → **one**
  collapsed warning naming the affected vendors, following the existing
  collapse convention for bulk-triggered warnings. Reuse
  `applyTweaks` + the `cat` field on `TWEAK_BASELINE`'s upgrades rather than
  hardcoding a column→upgrade map.

### 6. `parameters.txt` round-trip

[src/generator/config/configFile.ts](../../src/generator/config/configFile.ts) — three
keys, matching the existing lowercase-key convention:

```
lobby=1
lobbyGold=2500
lobbyShops=misc1 misc2 off1 def1 power
```

`lobbyShops` is space-separated to mirror the `cats` string it becomes. Unknown
or malformed values go to `unknownKeys`, never throw (invariant 5). Add the keys
to `parameters.default.txt`.

### 7. UI — the Lobby tab

[src/renderer/App.tsx:23](../../src/renderer/App.tsx#L23) — `leftTab` becomes
`'dungeon' | 'player' | 'lobby'`. New
`src/renderer/components/LobbyForm.tsx`, styled after
`ParameterForm`/`QuickSetup`:

- **Enable lobby** checkbox.
- **Starting gold** — number field stepping by 500, with the derived line
  *"5 red diamonds on the lobby floor"* and, past 12, *"…stacked 2 deep on 3 of
  the 12 spots."*
- **Shops** — one row per vendor, each with 5 (or 1) column checkboxes plus
  an all/none toggle, and a live count that mirrors the badge the vendor will
  wear. Each column shows how many upgrades it actually contains, derived from
  `TWEAK_BASELINE` after `playerTweaks` — so the Player tab's removals are
  visible here without coupling the two.
- A small static SVG/CSS diagram of the stall row and diamond grid, so it is
  obvious what the numbers do. This replaces a preview-tab entry.

`resetDefaults` in [App.tsx:92](../../src/renderer/App.tsx#L92) already resets "the
tab you're looking at" — extend the branch so the Lobby tab resets only
`params.lobby`, and update the header button label the same way it handles the
Player tab.

---

## Files

**New**
- `src/generator/lobby/{template,assets,shops,build,index}.ts`
- `scripts/import-lobby-assets.mjs` (hand-run, regenerates the two data modules)
- `src/renderer/components/LobbyForm.tsx`
- `tests/lobby.test.ts`

**Modified**
- `src/generator/index.ts` — `GeneratedFile.encoding`, lobby emission, `levels.xml`
- `src/generator/config/{parameters,validation,configFile}.ts`
- `src/main/packer.ts`, `src/main/ipc.ts` — base64 handling
- `src/renderer/App.tsx`, `src/renderer/styles/app.css`
- `parameters.default.txt`, `CHANGELOG.md`
- `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` — mandatory,
  same change (CLAUDE.md skill-maintenance protocol)

---

## Verification

```bash
npm run typecheck && npm test
```

`tests/lobby.test.ts` must cover:

1. **Determinism / no RNG contamination** — for a fixed seed, the `levels/level*.xml`
   contents are byte-identical with the lobby enabled and disabled. This is the
   single most important test.
2. **Off ⇒ unchanged campaign** — `lobby.enabled = false` produces exactly the
   file list and `levels.xml` the app produced before the feature (mirrors the
   `emitTweakFiles` no-change-no-file test in `tests/tweak.test.ts`).
3. **`cats` rewriting** — `['misc1']` yields `cats="misc1"` and a
   `vendor_speech_level1.xml` badge; empty selection removes that stall's
   `ShopArea`, `CircleShape` and all three doodads, and leaves no dangling shape
   reference anywhere in the file.
4. **Diamond count** — `startingGold / 500` entries; 0 emits an empty array;
   past 6000 the slots repeat (12000 puts exactly two on every slot) and all ids
   stay unique across the whole file.
5. **Exit target** — the lobby's `LevelExitArea` `level` is `0`, and
   `levels.xml` has `start="lobby"` with a resolvable `res`.
6. **Assets** — the 6 asset files are present with the right `encoding`, and the
   embedded base64 round-trips to the exact byte length of the source PNGs
   (26,857 and 3,645).
7. **Validation matrix** in `tests/validation.test.ts` — non-multiple-of-500 gold,
   negative gold, over-cap gold, unknown category id.

### In-game verification — required before merge

The generator is testable offline; the *game's* behaviour is not. Generate,
install, and launch:

1. Campaign appears in the level list; the party spawns in the lobby, not the
   dungeon.
2. Each vendor sells exactly the selected columns, and the badge number matches.
3. Walking all players onto the pad plays the teleport sound and lands on
   dungeon level 0 — check the level 0 entrance stairs are where the dungeon
   preview says.
4. The blood-textured walls and post lamps render **and block movement** — the
   custom `doodads/level1` pieces carry a collision polygon and the modding
   skill's offset warning applies.
5. ~~**The stacking experiment.**~~ **Done — stacking works.** 24 diamonds over
   the 12 slots paid out 12000 in game. `LOBBY_GOLD_MAX` is 12000, the depth
   actually confirmed; see the 2026-07-30 entry in `DISCOVERY-LOG.md`.
6. **Two-player gold.** Still open, and it decides the wording of the Lobby tab's
   starting-gold label: does a 12000 drop give the *party* 12000 or give *each*
   player 12000? The confirming run was solo. Until this is answered the label
   should say "gold on the lobby floor", not "you start with N gold". Open
   question 12 in `DISCOVERY-LOG.md`.

---

## Explicitly out of scope

- **Custom actors / custom monsters — deferred to post-1.0.** The six embedded
  files are all *doodads and their textures*: seven `doodads/level1/` wall pieces
  with `c_blood.png`, and `lamp_torch_post_spor.xml` with `lamp_torch_post.png`.
  No `actors/`, no `MONSTER_TYPES` entry, no change to the monster roster or the
  pool editor. `GeneratedFile.encoding` is added to carry two PNGs, not to open
  the door to shipping monsters — that is its own piece of work, with its own
  verification, after 1.0.
- Replacing `test_lobby.xml` with a purpose-built lobby (user: "for 1.0").
- Any change to dungeon shop rooms — finding a better vendor underground is the
  intended reward.
- A lobby entry in the dungeon preview tab.
- Copying the Dreadmann Mansion `tweak/` files, or any of its actors, effects,
  projectiles, sounds, items or tilemaps — the lobby template references none
  of them.
