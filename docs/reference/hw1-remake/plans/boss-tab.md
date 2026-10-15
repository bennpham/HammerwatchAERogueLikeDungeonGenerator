# Boss tab — a pre-fight prep room and a generated boss arena

> **Status: SHIPPED** (PRs #17, #20–#33). This document is the design record,
> kept for the reasoning behind each decision; the code is the current truth.
> Notable changes since it was written: the arena has **five** wave tiers, not
> four — a fifth fires on `Boss Died` (verified in game 2026-08-19) — monsters
> can be **scattered** across the arena instead of trickling from the nine
> anchors, arena themes include the `_mixed` palettes with geometric floor
> patterns, and the starting-gold caps were removed. The nine open research
> items this document shipped with were all answered on a real install
> (2026-08-10); see "Verified mechanics".

## Context

[Issue #6](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/6)
asks for a boss fight before the campaign ends, with a shop room in front of it so
the gold collected on the way down has somewhere to go. Nothing in
`reference/original-java/` covers this — it is entirely new surface, not a port.

The issue asks whether the boss room can be auto-generated or must be
hand-authored. **Answer: both, split by role.** The prep room is hand-authored
(a verbatim template like the lobby, because a shop room has no interesting
geometry); the arena is generated (one big themed rectangle with seeded cover),
because that is what makes it replayable.

## Verified mechanics

Three scratch levels authored in the editor under
`<Steam>/…/Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_non_related_to_map/`
settle everything the design rests on. Recorded in full in
`.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` (2026-08-10).

**`test_break_alcove_finish.xml`**

- **Boss global events fire for a bare boss actor.** A plain
  `actors/boss_queen/boss_queen.xml` in `<actors>`, with no rig of its own, plus
  a single `GlobalEventTrigger` whose `parameters` is the bare string
  `Boss Died`, is enough. The engine also emits `Activate Boss`, `Boss 75%`,
  `Boss 50%`, `Boss 25%` (seen in `editor/campaign/levels/level_boss_1..4.xml`).
  No `ObjectEventTrigger` + `Counter` fallback is needed.
- **`DestroyObject` on wall doodads opens a walkable hole.** Its parameters are
  `<dictionary name="parameters"><int-arr name="static">…</int-arr></dictionary>`
  — the id array sits *directly* under `parameters`, with no `object`/`element`
  wrapper dict, unlike `ObjectEventTrigger` and `ToggleElement`.
- **Two constraints that fall out of it:** the destroyed doodads are the only
  ones in the file carrying `<bool name="need-sync">True</bool>`, so anything a
  `DestroyObject` targets must be emitted that way; and the alcove interior is
  authored as **real floor tiles**. Collision comes from the doodads alone, but
  destroying a doodad does not create ground — the floor has to be there first.
- **Pillars block.** `a_special_pillar`, `c_special_pillar`, `h_deco_rock` and
  `bonus1_pillar` all stop movement and projectiles.

**`test_spawner_spam.xml`**

- **`SpawnObject` needs no actor placement:** `parameters` is a bare `<string>`
  holding the actor path and the spawn position **is** the node's own position.
- **But it fires once per incoming trigger, not endlessly.** `trigger-times` is
  a *lifetime budget* — how many spawns remain — not a rate. Continuous
  spawning needs a `TimerTrigger` upstream, whose `parameters` is a **bare
  `<int>`** of milliseconds and whose own `trigger-times: -1` means "repeat
  forever". The timer ships `enabled=False` and is switched on by
  `ToggleElement{state: 0}` (`0` = enable, matching
  `NodeToggleElement.state = 1 // disable` in `src/generator/objects/nodes.ts`).

**`test_boss_prep_room.xml`**

- 42 `items/valuable_diamond_red.xml` slots authored (ids 3472–3513) — plenty
  for the starting-gold scheme, read straight out by the importer.
- Five `ShopArea` nodes at ids 3295 / 3297 / 3305 / 3307 / 3310 with the
  identical `cats` strings and `CircleShape` ids the lobby uses.
- `LevelExitArea` id 232 points `<string name="level">1</string>`; surgery
  repoints it at `boss`.
- Stock assets only — no campaign-local asset array is needed.

The one thing still unverified is item 14 in "Verification": the new node types
have only been observed in the *editor's* XML dialect. See §2.

## Decisions taken

| Question | Decision |
| --- | --- |
| Feature default | **On**, like the lobby. `boss.enabled: false` reproduces today's campaign byte-for-byte. |
| Campaign order | Append: `lobby → 0 … N-1 → bossprep → boss`. |
| Final dungeon floor | Keeps its gold-locked orb room, but with the boss on, the orb prefab is swapped for a **portal to the prep room**. With the boss off it stays the win condition exactly as today. |
| Orb / win condition | Lives in the boss arena, in a **3×3 alcove sealed by ordinary wall doodads**. `Boss Died` destroys those doodads, punching a hole in the wall; the existing `ObjectEventTrigger → GameEnd` chain is untouched. **Explicitly not a gold door** — a gold key carried out of the last dungeon floor would open it early and break the campaign. |
| Alcove wall | Seeded pick of N / E / W (entrance is always S), not signposted — players hunt for which wall opened. **N is excluded when the boss is the dragon**, so the dragon can never body-block the reward. |
| Boss choice | Multi-select pool of all seven bosses; the seed picks one. |
| Boss state | Live from level load. No dormancy, no `ToggleImmortality`. |
| First wave | An `AreaTrigger` (`trigger-times -1`) over the entrance. Waves 2–4 use `GlobalEventTrigger` on `Boss 75%` / `Boss 50%` / `Boss 25%`. |
| Wave config | Five tiers — 100/75/50/25 and boss death — each with **its own monster pool, its own per-monster max-count table and its own spawn intervals**. A max count of `-1` means endless. |
| Boss-death wave | A fifth tier on `GlobalEventTrigger "Boss Died"`, the same event the win chain listens to. The fight is over but the campaign is not: it spawns into the walk to the orb behind the opened alcove. **Empty in every preset** — filling it adds scatter draws to `ctx.bossRand`, which would move existing seeds' arenas. |
| Wave escalation | **Stacking.** Each tier switches its own spawner on and never switches the previous one off, so by 25% all four health tiers are running. A tier still burns out on its own once its `SpawnObject` budgets are spent. |
| Spawn rate | **Per monster.** Each wave has a default interval; individual monsters can override it, because a miniboss wants a long interval where trash wants a short one. The override table lives behind an "Advanced" disclosure. |
| Arena theme | One dropdown over the existing `THEME_DEFS` registry, independent of the dungeon's per-floor themes. |
| Prep coins | Authored diamond slots reusing the lobby's 500-gold-per-diamond scheme, **default 0**. |
| Cover patterns | All four ship: random scatter, border ring, gaussian clusters, symmetric/grid. |

## Design

### 1. Determinism — the load-bearing constraint

Both new levels are emitted **after** the `params.levels` loop in
`generateDungeon`, exactly like the lobby and `emitTweakFiles`. The arena needs
randomness, so it draws from a **third stream**, `ctx.bossRand = new Random(seed + 2)`
(mirroring `cosmeticRand = seed + 1`). `ctx.rand` and `ctx.cosmeticRand` are
never touched, so every existing seed's dungeon floors stay byte-identical
whether the boss is on or off.

The one deliberate exception is the final floor's orb room. Turning the boss on
swaps the `Orb` prefab for a `BossPortal` prefab in the *same* room at the *same*
coordinates. Neither prefab consumes RNG (check `ObjectSet`'s `Orb` case —
no `rand` calls), so **the layout, wall bitmap and every other object on that
floor are unchanged**; only the orb room's own doodads/items/script nodes differ.
That property must have a test.

New level ids are the strings `bossprep` and `boss`, for the same reason the
lobby's is `lobby`: numeric floor ids `0..N-1` must not move.

### 2. New script node types

`src/generator/objects/scriptNode.ts` + `nodes.ts` gain these to `NodeTypeName`:

| Class | Node | Parameters shape |
| --- | --- | --- |
| `NodeSpawnObject` | `SpawnObject` | bare `<string>` = actor path; budget = `trigger-times`; position = node position |
| `NodeGlobalEventTrigger` | `GlobalEventTrigger` | bare `<string>` = event name (`Boss 75%` / `Boss 50%` / `Boss 25%` / `Boss Died`) |
| `NodeTimerTrigger` | `TimerTrigger` | bare `<int>` = interval in ms; ships `enabled=False` |
| `NodeDestroyObject` | `DestroyObject` | `<int-arr name="static">` **directly** under `parameters`, no wrapper dict; `connectDoodad(d: Doodad)` collects ids |

`CircleShape`, `AllPlayersAreaTrigger` and `PlaySound` are **not** needed. They
only appear in the prep room, which is imported as a verbatim template string
and edited by text surgery — it never instantiates node classes.

Three of the four carry a bare scalar instead of a `parameters` dictionary,
which the current `ScriptNode.getXML()` cannot express — it always calls
`getParametersDict()` at
[`scriptNode.ts:53`](../../src/generator/objects/scriptNode.ts). Add an
overridable `getParametersXML(): string` whose default delegates to
`getParametersDict().getXML()`, and call *that* from `getXML()`.

**Format note:** the repo's `ScriptNode` emits `<float name="x">`/`<float name="y">`
and `<int-arr name="delays">`, whereas the editor writes `<vec2 name="pos">` and
`<int-arr name="connection-delays">`. Generated campaigns shipping the repo's
dialect are playable, so the engine's node reader clearly accepts it and new
nodes inherit `getXML()` unchanged. This is the one assumption left unverified
*for the new node types specifically*; if a generated `SpawnObject` or
`TimerTrigger` turns out not to fire, overriding those four classes to
`<vec2 name="pos">` is a contained fix that leaves existing seeds alone.

### 3. Prep room — `src/generator/bossprep/`

A direct clone of the `src/generator/lobby/` module shape:

- `template.ts` — `BOSSPREP_TEMPLATE`, generated by a new
  `scripts/import-bossprep-assets.mjs` modelled on `scripts/import-lobby-assets.mjs`,
  from
  `.../Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_non_related_to_map/test_boss_prep_room.xml`.
  Also exports `BOSSPREP_TEMPLATE_IDS`, `BOSSPREP_EXIT_NODE_ID = 232`,
  `BOSSPREP_DIAMOND_SLOTS`, `BOSSPREP_ITEM_ID_BASE`.
- `build.ts` — `buildBossPrep(options)`. Reuse the text-surgery helpers
  (`elementSpan`, `removeElement`, `replaceInElement`, `setItems`) and
  `diamondCount()` from `src/generator/lobby/build.ts` — **lift them into a shared
  `src/generator/levelTemplate/surgery.ts` rather than copy-pasting.**
- The prep room is a straight copy of the lobby's shop rig: **identical
  `ShopArea` ids (3295/3297/3305/3307/3310), identical `cats` strings, identical
  `CircleShape` ids (3294/3296/3304/3306/3309)** — only the positions differ.
  So `LOBBY_VENDORS` / `categoriesFor()` / `ALL_LOBBY_CATEGORIES` from
  `src/generator/lobby/shops.ts` are reused unchanged.
- The prep room references only stock assets, so **there is no `BOSSPREP_ASSETS`
  array** — the generated `assets.ts` is empty and the importer's `--asset`
  mode is unused.
- The exit rig at ids 228 (`RectangleShape`) / 231 (`AllPlayersAreaTrigger`) /
  232 (`LevelExitArea`) / 229 (`PlaySound`) is edited to point
  `<string name="level">` at `boss` — id 232 currently reads `1`.
- `<items>` now holds **42 authored `items/valuable_diamond_red.xml` slots**
  (ids 3472–3513): flanking rows at `y = -13` and `y = -11`, a diagonal apron
  either side of the walkway, and two columns at `x = ±3`. `deriveMeta()` reads
  them in the same reading order it uses for the lobby, so `BOSSPREP_DIAMOND_SLOTS`
  needs no hand-authoring.

### 4. Boss arena — `src/generator/boss/`

`buildBossArena(options, theme, rand): { xml, preview }`. Not a `Level` — it does
not use rooms/passages/`wallPattern` — but it reuses `Tile`, `Doodad`,
`Item`, `Monster`, `ObjectSet` and the `src/generator/xml/` primitives, and emits
the same section order as `Level.getXML()`.

```
+==================[SEALED WALL]================+   <- 3 wall doodads, destroyed
|                  (orb, 3x3)                   |      on "Boss Died"
|   NW              N / dragon              NE  |   alcove: seeded N/E/W,
|                                               |   never N when boss = dragon
|                                               |
|   W              centre / boss             E  |   9 spawn anchors, inset
|                                               |   from the walls
|   SW               S                      SE  |
|                 [ ENTRY / LevelStart ]        |
+-----------------------------------------------+
```

- **Geometry**: one solid wall band around a rectangle sized
  `rand(minWidth..maxWidth) × rand(minHeight..maxHeight)`. Walls use the same
  `THEMED_WALL_PIECES` doodad set as the dungeon via `wallPattern.searchPatterns`,
  which already handles theme H's edge-fence weirdness. **The alcove interior is
  laid as ordinary floor tiles in the tilemap from the start** — the three
  doodads across its mouth are the only thing sealing it, and destroying a
  doodad does not create ground. Those three are emitted with
  `need-sync="True"`; every other doodad in the arena stays `False`.
- **Boss placement**: `boss_dragon` goes in the top wall (it has no upward-facing
  art and `collision static="true"`; the shipped `level_boss_4.xml` places it at
  `-5 -26.5`). Every other boss goes dead-centre. `boss_queen` is also
  `static="true"` and has no movement dict at all, but attacks in all directions,
  so centre is correct for it.
- **Spawn anchors**: 9 positions (N/S/E/W + 4 corners + centre), each inset from
  the wall by the arena's padding.

- **Wave wiring** (`src/generator/boss/waves.ts`). A `SpawnObject` emits one
  actor per signal it receives, so every tier is driven by a timer:

  ```
  tier 100%  AreaTrigger(entrance RectangleShape, event 0, types 1) ─┐
  tier  75%  GlobalEventTrigger "Boss 75%" ─────────────────────────┤
  tier  50%  GlobalEventTrigger "Boss 50%" ─────────────────────────┼─> ToggleElement{state: 0}
  tier  25%  GlobalEventTrigger "Boss 25%" ─────────────────────────┤            │
  tier death GlobalEventTrigger "Boss Died" ────────────────────────┘            │
                                                                                 v
                       TimerTrigger(intervalMs, enabled=False, trigger-times -1)
                                     — one per DISTINCT interval within the tier
                                                                                 │
                                                                                 v
                       SpawnObject × (monster, anchor)
                         parameters   = actor path
                         trigger-times = that monster's budget share
                         position      = the anchor
  ```

  - Monsters in a tier are **grouped by interval**, one `TimerTrigger` per
    distinct value — so the common case, where every monster uses the wave
    default, emits exactly one timer per tier.
  - A monster's `monsterMax` is split round-robin across the 9 anchors;
    `-1` passes through to every anchor unchanged as "endless".
  - **Nothing ever disables a timer.** Waves stack: at 25% health all four
    tiers are spawning, and a tier stops only when its `SpawnObject` budgets
    are exhausted.
- **Win**: `GlobalEventTrigger "Boss Died"` → `DestroyObject` listing the ids of
  the wall doodads sealing the alcove mouth → the wall opens → players collect
  the orb → the existing `Orb` `ObjectSet` fires `ObjectEventTrigger → GameEnd`.
  Reuse `ObjectSet.create(ctx, x, y, 'Orb', theme)` as-is; only the wall seal is
  new. **No lock, no key, no door** — the campaign hands out gold keys on the
  final dungeon floor and a carried-over key must not be able to open this.
- **Preview**: emit a `LevelPreview` with a single `PreviewRoom` so the canvas
  preview shows the arena alongside the dungeon floors with no renderer change.

### 5. Cover pillars

New `src/generator/boss/cover.ts`.

Solid pillar doodad per theme, resolved through a new `DoodadType` entry
`Pillar` plus `ThemeDef.doodadOverrides`:

- themes a–g, i → `doodads/theme_<t>/<t>_special_pillar.xml`
- theme h (outdoor desert) → `doodads/theme_h/h_deco_rock.xml` *(the only cover
  asset theme H has; ~2.25 tiles across)*
- bonus1–5 → `doodads/theme_bonusN/bonusN_pillar.xml`

Confirmed solid: `*_special_pillar.xml` carry a `<polygon collision="true">`,
`h_deco_rock.xml` a `<circle radius="18"/>`. **Most `*_deco_pillar_*.xml` have no
collider at all and are pure art — do not use them.**

Four patterns, selected by an enum param:

| Pattern | Behaviour |
| --- | --- |
| `random` | `count` pillars at seeded positions |
| `ring` | evenly spaced around an inset border, with a **`ringSpacing` gap parameter** so the ring is walkable rather than a second wall |
| `gaussian` | `clusters` seeded centres, pillars normally distributed around each |
| `symmetric` | placed in one quadrant then mirrored 4-fold, so the fight is fair from any approach |

All four run through one rejection filter: a pillar is discarded if it overlaps
the boss footprint (largest is `boss_queen` at ~5.1 × 5.2 tiles), any of the 9
spawn anchors, the entrance, the alcove/door, or another pillar. The filter is
bounded — a fixed attempt cap, never a `while (true)` (invariant #3).

### 6. Parameters, validation, `parameters.txt`

`src/generator/config/parameters.ts`:

```ts
export interface BossOptions {
  enabled: boolean          // default true
  prep: {
    shopCategories: string[]   // default ALL_LOBBY_CATEGORIES (power INCLUDED)
    startingGold: number       // default 0, multiple of 500
  }
  arena: {
    theme: string              // default 'g'
    minWidth: number; maxWidth: number    // default 24 / 32
    minHeight: number; maxHeight: number  // default 32 / 44
    bossPool: string[]         // default all 7
    waves: BossWave[]          // exactly 4, in order 100 / 75 / 50 / 25
    cover: {
      pattern: 'random' | 'ring' | 'gaussian' | 'symmetric'
      density: number
      ringSpacing: number
      clusters: number
    }
    monsterMultiplier: number
    foodMultiplier: number
  }
}
export interface BossWave {
  monsters: string[]                    // ids from MONSTER_TYPES
  monsterMax: Record<string, number>    // -1 = endless
  defaultIntervalMs: number             // 4000 / 3000 / 2000 / 1000 by tier
  intervalMs?: Record<string, number>   // per-monster override ("Advanced")
}
```

Arena size defaults are deliberately generous — 24–32 × 32–44, against a hard
floor of 14 × 18 (largest boss footprint + the 3×3 alcove + anchor insets).
The real per-boss minimum is unknown; the author's own test arena is ~16 × 15
and wanted roughly 1.5–2× on the Y axis. Validation only rejects genuinely
broken input, so the numbers can be tuned in the UI after playtesting rather
than guessed at in a table now.

Note the Player-tab default divergence the user asked for: unlike the lobby,
**`power` is on by default in the prep room's shop** — extra lives matter more
right before a boss than they do at the start of a run.

**Post-Phase-5 follow-up (pre-Phase-6):** `goldMultiplier` was dropped from
`arena` entirely — there is nothing to buy in the arena itself once the prep
room's shop is behind the player, so a gold-scaling knob had no consumer and
never will. The other two, previously declared but read by nothing, are now
wired:

- `monsterMultiplier` scales each wave tier's `monsterMax` in
  `boss/waves.ts` (`buildWaveRig`'s new `monsterMultiplier` argument),
  `Math.max(0, Math.trunc(max * monsterMultiplier))` — mirroring
  `map/room.ts`'s own multiplier application. `-1` (endless) is a sentinel
  and is never scaled.
- `foodMultiplier` drives a new sparse food pass in `boss/arena.ts`
  (`placeFood`, run after `placeCoverPillars`): 2–4 clusters
  (`ctx.bossRand.iRand(2, 5)`), each with its own
  `Math.trunc(ctx.bossRand.fRand(2, 5) * foodMultiplier)` pickups of
  `ItemType.Food` (health/mana), rejected against the boss, anchors,
  entrance, alcove and every placed pillar via `cover.ts`'s now-exported
  `isFree`. `foodMultiplier: 0` yields zero food. Every `Item.create` call
  passes its variant `index` explicitly, rolled from `ctx.bossRand` — leaving
  it to default would silently roll from `ctx.rand`, the layout stream, and
  shift every existing seed's dungeon (see `Item.create` in `objects/item.ts`).
  `cover.ts`'s `placeCoverPillars` now returns `{ doodads, rects }` instead of
  a bare `Doodad[]` so the food pass can reuse the pillars' footprints as
  additional rejection rects.

- `src/generator/config/validation.ts`: a `validateBoss(p, errors, warnings)`
  called next to `validateLobby`. Dotted field paths (`boss.arena.minWidth`) so
  `NumberField` renders errors inline. Rules to cover at minimum: min ≤ max on
  both axes; arena large enough for the largest enabled boss plus 9 anchors plus
  the alcove; `bossPool` non-empty; exactly 4 waves; `startingGold` a multiple of
  500 within range; cover density not exceeding the free floor area; unknown
  monster/theme ids. Absent `boss` object means "off, not invalid".
- `src/generator/config/configFile.ts`: lowercase keys `boss`, `bossgold`,
  `bossshops`, `bosstheme`, `bosswidth`, `bossheight`, `bosspool`, `bosscover`,
  `bosswave1..4`. Back-fill on parse; append on serialize alongside the lobby
  keys. Unknown keys reported, never fatal (invariant #5).
- `parameters.default.txt`: add the commented keys.

### 7. UI — the Boss tab

`App.tsx`: extend `leftTab` to `'lobby' | 'dungeon' | 'player' | 'boss'`, add the
button (right of Player, with an `on`/`off` `tab-count` badge like the lobby's),
add the render branch, add a `resetDefaults()` branch and its button label.

New `src/renderer/components/BossForm.tsx`, with the two sub-tabs the user asked
for, using the existing `Section` / `Subsection` / `NumberField` / `BoolField` /
`ToggleGroup` from `src/renderer/components/fields.tsx`:

**Sub-tab "Prep room"** — mirrors `LobbyForm.tsx`, including a
**"Copy from Lobby"** button that assigns `params.lobby.shopCategories` into
`params.boss.prep.shopCategories`. Starting gold field defaults to 0.

**Sub-tab "Boss room"**:

- *General* — min/max width, min/max height (the Dungeon tab's "General" group is
  dropped; "Rooms & passages" becomes this, minus room counts and passage widths)
- *Chances & multipliers* — monster / gold / food only
- *Theme* — one `<select>` over `THEME_DEFS` grouped by `ThemeDef.group`
- *Boss* — checkbox grid of the 7 bosses (reuse the `MonsterFilterBar` idiom)
- *Waves* — four `Subsection`s (100% / 75% / 50% / 25%). Each has a monster
  pool (`MonsterPoolsEditor` idiom), a max-count table accepting `-1`
  (`MonsterMaxTable` idiom), and a single "spawn every N ms" field. An
  **Advanced** disclosure inside the subsection reveals a per-monster interval
  column that overrides the wave default — collapsed by default so the simple
  case stays one field
- *Cover* — pattern `ToggleGroup`, density slider, plus `ringSpacing` /
  `clusters` shown only for the patterns that use them

Add CSS alongside the existing `.lobby-*` block in
`src/renderer/styles/app.css`.

## Files

**New**
- `docs/plans/boss-tab.md` *(this document — the deliverable of this task)*
- `src/generator/levelTemplate/surgery.ts` — helpers lifted out of `lobby/build.ts`
- `src/generator/bossprep/{template,build,index}.ts`
- `src/generator/boss/{arena,cover,anchors,bosses,waves,index}.ts`
- `scripts/import-bossprep-assets.mjs`
- `src/renderer/components/BossForm.tsx`
- `tests/boss.test.ts`

**Modified**
- `src/generator/config/{parameters,validation,configFile,themes}.ts`
- `src/generator/objects/{scriptNode,nodes,objectSet,doodad}.ts` — new node types, `BossPortal` set type, `Pillar` doodad
- `src/generator/core/context.ts` — `bossRand`
- `src/generator/index.ts` — emit both levels, extend the barrel
- `src/generator/lobby/build.ts` — re-export from the shared surgery module
- `src/renderer/App.tsx`, `src/renderer/styles/app.css`
- `parameters.default.txt`, `README.md`, `CHANGELOG.md`
- `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` — done 2026-08-10; promote the pillar paths into `ASSET-REGISTRY.md` next

## Verification

Offline (`npm run typecheck && npm test`):

1. `boss.enabled: false` ⇒ `files` byte-identical to a pre-feature run of the
   same seed. Same assertion style as `tests/lobby.test.ts`.
2. `boss.enabled: true` ⇒ `levels/level0..N-1.xml` differ from the boss-off run
   **only** inside the final floor's orb room; wall bitmaps and every other
   floor identical.
3. Determinism: same params + same seed ⇒ `expect(a.files).toEqual(b.files)`.
4. Arena invariants: exactly one boss actor; boss inside the walls; 9 anchors on
   walkable floor; alcove never on the N wall when the boss is the dragon;
   alcove interior is floor tiles; its three sealing doodads are `need-sync=True`
   and their ids are exactly the `DestroyObject` array; no pillar overlaps an
   anchor, the boss, the entrance or the alcove.
5. Wave graph: each tier has ≥1 `TimerTrigger` shipping `enabled=False`, reached
   from exactly one `ToggleElement{state: 0}`, itself reached from that tier's
   trigger; every `SpawnObject` is downstream of some timer; a tier whose
   monsters all use the wave default emits exactly one timer.
6. Id integrity: every `connections` id resolves to a real node; all ids unique
   across doodads/actors/items/scripting (reuse `allIds(xml)` from
   `tests/lobby.test.ts`); one `GlobalEventTrigger` per health tier. Run
   `badIntArray` over the arena too — it guards the LevelPacker empty-`int-arr`
   crash.
7. Validation matrix in `tests/validation.test.ts` for each new rule.
8. `parameters.txt` round-trip in `tests/configFile.test.ts`.

In game (required before merge):

9. Pack and install; confirm both levels appear and the campaign is playable end
   to end for at least two different bosses.
10. Final dungeon floor: gold key still gates the room, the portal teleports to
    the prep room.
11. Prep room: all five stalls sell, `power` sells extra lives, exit teleports to
    the arena.
12. Arena: entry starts wave 1; each health threshold adds its wave *on top of*
    the running ones; killing the boss punches the hole in the alcove wall; the
    orb ends the game. Also carry a gold key in from the last floor and confirm
    it does **not** open the alcove early.
13. Run each of the four cover patterns once and eyeball that pillars are solid
    and the arena is navigable.
14. **The one open assumption:** confirm a *generated* `SpawnObject` and
    `TimerTrigger` — emitted in the repo's `<float name="x">` / `delays` dialect
    rather than the editor's `<vec2 name="pos">` — actually fire. If they do
    not, override those four node classes to the editor's dialect; existing
    seeds are unaffected either way.

## Deferred to post-1.0

Boss HP is not scaled or exposed. The recorded spread is 30× (dragon 15000,
anubis 10000, lich 3500, knight 2500, queen 2500, worm 850/500), so picking the
worm is a much shorter fight than picking the dragon — accepted. Rebalancing a
boss would mean a custom actor, and custom actors, monsters and themes are all
deliberately out of scope until after 1.0 (see `DISCOVERY-LOG.md` open question
1b).
