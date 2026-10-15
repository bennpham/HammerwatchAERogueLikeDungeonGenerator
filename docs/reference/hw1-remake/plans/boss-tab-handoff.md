# Boss tab — implementation handoff

> **Status: COMPLETE — historical.** Every phase below shipped (PRs #17,
> #20–#33). Kept as the record of the execution order and its acceptance bars;
> for what the arena does *now*, read `.claude/skills/hammerwatch-project`
> and `src/generator/boss/`.

Task spec for an implementing agent. The design lives in
[`boss-tab.md`](boss-tab.md) — **read it first, in full.** This file is the
execution order, the acceptance bar for each phase, and the things that will
silently break the project if you get them wrong.

Work the phases **in order**. Each ends with a gate you must actually run.
Do not start phase N+1 until phase N's gate passes.

---

## 0. Before you write anything

Read, in this order:

1. `CLAUDE.md` — the six non-negotiable invariants. They override everything here.
2. `docs/plans/boss-tab.md` — the design.
3. `docs/plans/lobby-tab.md` — the same feature shape, already shipped. The boss
   work is deliberately modelled on it; when in doubt, do what the lobby does.
4. `src/generator/lobby/build.ts` — you will be lifting code out of this file.
5. `tests/lobby.test.ts` — the test idioms you are expected to copy.

Run `npm install && npm run typecheck && npm test` once and confirm a green
baseline before touching anything. If it is already red, stop and report.

### The five things that will get the work rejected

1. **Nothing under `src/generator/**` may import `electron`, `fs`, `path`,
   `child_process`, or touch the DOM.** The generator takes `(params, seed)` and
   returns strings. All I/O lives in `src/main/**`.
2. **Never touch `ctx.rand` or `ctx.cosmeticRand` from boss code.** The arena
   draws from a new third stream, `ctx.bossRand`. Pulling a single value from
   `ctx.rand` shifts the layout stream and changes every existing seed's dungeon.
   This is the single easiest way to break the project.
3. **No unbounded loops.** Every retry loop gets a fixed attempt cap. `while
   (true)` is banned even when "it obviously terminates".
4. **No `Math.random()`, no `Date.now()`, no iteration over `Object` keys where
   order affects output.** Same params + same seed must give byte-identical
   files, every time.
5. **Never leave an `<int-arr>` empty.** `LevelPacker.exe` parses the contents
   and throws on nothing. If a list is empty, omit the whole element. See the
   `diamonds()` function in `lobby/build.ts` for the established pattern.

### Style

There is no linter. Match the surrounding file: 2-space indent, no semicolons,
single quotes, `export function` over default exports. Comments explain *why*,
not *what* — look at how `lobby/build.ts` and `objects/nodes.ts` are commented
and write at that density. Do not add JSDoc to everything.

---

## Phase 1 — script node plumbing

**Files:** `src/generator/objects/scriptNode.ts`, `src/generator/objects/nodes.ts`

### 1a. Make scalar `parameters` expressible

`ScriptNode.getXML()` currently hardcodes `this.getParametersDict()`. Three of
the four new nodes carry a bare scalar instead of a dictionary. Add an
overridable seam:

```ts
/**
 * The node's `parameters` element as raw XML.
 *
 * Most nodes emit a `<dictionary name="parameters">`, but SpawnObject,
 * GlobalEventTrigger and TimerTrigger carry a bare scalar instead
 * ([VERIFIED] 2026-08-10, see DISCOVERY-LOG.md), which a dictionary
 * cannot express — hence the seam.
 */
protected getParametersXML(): string {
  return this.getParametersDict().getXML()
}
```

and in `getXML()` replace `dict.addData(this.getParametersDict())` with the
equivalent raw-string append. `XMLDictionary.addData` takes an `XMLObject`, so
you will need to look at `src/generator/xml/xmlContainers.ts` and pick the
cleanest way to splice a raw string in — either a tiny `XMLRaw extends
XMLObject` primitive whose `getXML()` returns the string verbatim, or build the
node's XML by string concatenation. **Prefer `XMLRaw`**; it keeps `getXML()`
readable and is reusable.

Everything else about `getXML()` stays exactly as it is — including the quirk
that `delays` is filled with the connection ids rather than zeros. That is
inherited from the Java original and existing seeds depend on it.

**Acceptance:** `npm test` still green. Not one byte of any existing generated
level has changed.

### 1b. The four node classes

Extend `NodeTypeName` with `'SpawnObject' | 'GlobalEventTrigger' |
'TimerTrigger' | 'DestroyObject'`, then add to `nodes.ts`, following the exact
style of the existing `NodeAreaTrigger` / `NodeToggleElement`:

```ts
/** Spawns one actor per incoming trigger at its own position. */
export class NodeSpawnObject extends ScriptNode {
  constructor(ctx: GenerationContext, x: number, y: number, public actorPath: string) {
    super(ctx, x, y, 'SpawnObject')
  }
  protected getParametersXML(): string {
    return new XMLString('parameters', this.actorPath).getXML()
  }
}

/** Listens for an engine-wide event, e.g. "Boss 50%" or "Boss Died". */
export class NodeGlobalEventTrigger extends ScriptNode { /* bare XMLString */ }

/** Fires every `intervalMs`. Ships disabled; a ToggleElement{state:0} starts it. */
export class NodeTimerTrigger extends ScriptNode {
  constructor(ctx, x, y, public intervalMs: number) {
    super(ctx, x, y, 'TimerTrigger')
    this.enabled = false
  }
  protected getParametersXML(): string {
    return new XMLInt('parameters', this.intervalMs).getXML()
  }
}

/** Destroys doodads by id. Note: the id array sits DIRECTLY under
 *  `parameters`, with no `object`/`element` wrapper dict — unlike
 *  ObjectEventTrigger and ToggleElement. [VERIFIED] 2026-08-10 */
export class NodeDestroyObject extends ScriptNode {
  targets: Doodad[] = []
  connectDoodad(d: Doodad): void { this.targets.push(d) }
  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLIntArray('static', this.targets.map((t) => t.id)))
    return d
  }
}
```

**Gate:** `npm run typecheck && npm test` green.

---

## Phase 2 — shared template surgery

**Files:** new `src/generator/levelTemplate/surgery.ts`, modified
`src/generator/lobby/build.ts`

`lobby/build.ts` has four private helpers the prep room needs verbatim:
`elementSpan`, `removeElement`, `replaceInElement`, `setItems`. **Move** them
into `levelTemplate/surgery.ts` and export them. Do not copy-paste.

Two details:

- Their error messages currently say "lobby template has no element with id N".
  Make the caller pass a label, e.g. `elementSpan(xml, id, 'lobby')`, so the
  prep room's failures say "bossprep" instead. Update the lobby call sites.
- `diamondCount()` and `LOBBY_DIAMOND_VALUE` are also shared. Move
  `diamondCount` to the shared module; leave `LOBBY_DIAMOND_VALUE` and
  `LOBBY_GOLD_MAX` where they are and re-export.

`src/generator/lobby/build.ts` keeps its public API unchanged — `buildLobby`,
`diamondCount`, `LOBBY_DIAMOND_VALUE`, `LOBBY_GOLD_MAX`, `LOBBY_EXIT_TARGET`
must all still be importable from `./lobby` exactly as they are today, because
`src/generator/index.ts` re-exports them and the renderer uses them.

**Gate:** `npm run typecheck && npm test` green — this is a pure refactor, so
every lobby test must pass untouched. **If you find yourself editing
`tests/lobby.test.ts` in this phase, you have done it wrong.**

---

## Phase 3 — parameters, validation, config file

**Files:** `src/generator/config/{parameters,validation,configFile}.ts`,
`parameters.default.txt`

Add `BossOptions` / `BossWave` exactly as specified in `boss-tab.md` §6,
including `defaultIntervalMs` and the optional per-monster `intervalMs`.

Defaults: `enabled: true`; prep `shopCategories: ALL_LOBBY_CATEGORIES` (**with
`power` included** — unlike the lobby, which excludes it), `startingGold: 0`;
arena theme `'g'`, size 24–32 × 32–44, all seven bosses in the pool, cover
`random`, and four waves whose `defaultIntervalMs` are 4000 / 3000 / 2000 / 1000.

`validateBoss(p, errors, warnings)` called from `validateParameters` right next
to the existing `validateLobby` call. Use dotted field paths
(`boss.arena.minWidth`) so the renderer's `NumberField` can show the error
inline. Rules, at minimum:

| Rule | Severity |
| --- | --- |
| `minWidth <= maxWidth`, `minHeight <= maxHeight` | error |
| `minWidth >= 14`, `minHeight >= 18` (boss + alcove + anchors) | error |
| `bossPool` non-empty | error |
| exactly 4 waves | error |
| `defaultIntervalMs` and every override in 100..60000 | error |
| `startingGold` a non-negative multiple of 500, within range | error |
| unknown monster id in a wave pool, unknown theme id, unknown boss id | error |
| cover density exceeding the free floor area | warning |
| a wave with an empty monster pool | warning |

**An absent `boss` object means "off", not "invalid"** — mirror how
`validateLobby` and `configFile.ts:63` back-fill `params.lobby`.

`configFile.ts` gets lowercase keys `boss`, `bossgold`, `bossshops`,
`bosstheme`, `bosswidth`, `bossheight`, `bosspool`, `bosscover`,
`bosswave1`..`bosswave4`. Back-fill on parse, append on serialize next to the
`lobby` keys at the end of the function. **Unknown keys are reported, never
fatal** (invariant 5). Add the same keys commented out in
`parameters.default.txt`.

**Gate:** `npm run typecheck && npm test`. Add the validation matrix to
`tests/validation.test.ts` and the round-trip case to `tests/configFile.test.ts`
**in this phase**, not later.

---

## Phase 4 — prep room

**Files:** new `scripts/import-bossprep-assets.mjs`,
`src/generator/bossprep/{template,build,index}.ts`

Source level:
`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\pht6_quiky_dreadmann_mansion\levels\test_non_related_to_map\test_boss_prep_room.xml`

Clone `scripts/import-lobby-assets.mjs`. Keep its `--from/--level` import mode
and its `deriveMeta()` approach — **derive** `BOSSPREP_TEMPLATE_IDS`,
`BOSSPREP_EXIT_NODE_ID`, `BOSSPREP_DIAMOND_SLOTS` and `BOSSPREP_ITEM_ID_BASE`
from the file rather than hardcoding them. Drop the no-arg fallback-authoring
mode; the prep room always comes from the authored file.

Known values, for checking your work — the importer should independently
produce these:

- `BOSSPREP_EXIT_NODE_ID = 232` (a `LevelExitArea`; currently `<string
  name="level">1</string>`, must be rewritten to `boss`)
- Five `ShopArea` ids 3295 / 3297 / 3305 / 3307 / 3310 with `CircleShape` ids
  3294 / 3296 / 3304 / 3306 / 3309 — the same `cats` strings as the lobby, so
  `LOBBY_VENDORS`, `categoriesFor()` and `ALL_LOBBY_CATEGORIES` from
  `src/generator/lobby/shops.ts` are **reused unchanged**. Do not fork them.
- 42 diamond slots, item ids 3472–3513.
- **Stock assets only** — no `BOSSPREP_ASSETS` array, no `assets.ts`.

`buildBossPrep(options)` is `buildLobby` with a different template and a
different exit target. It imports its surgery helpers from
`levelTemplate/surgery.ts`.

**Gate:** `npm run typecheck && npm test`, plus a new test asserting the built
prep room's exit points at `boss` and that disabling every shop category
removes all five stalls *and* their shapes.

---

## Phase 5 — the arena

**Files:** new `src/generator/boss/{anchors,bosses,cover,waves,arena,index}.ts`,
modified `src/generator/objects/{doodad,objectSet}.ts`,
`src/generator/core/context.ts`

Largest phase. Build it in this sub-order and typecheck between each:

1. **`context.ts`** — add `readonly bossRand: Rand`, constructed as
   `new Rand(seed + 2)` alongside `cosmeticRand = new Rand(seed + 1)`. Add a
   comment saying why a third stream exists.
2. **`bosses.ts`** — the seven boss defs: id, actor path, footprint w/h,
   placement rule. `boss_dragon` goes in the **top wall** (no upward-facing art,
   `collision static="true"`); every other boss goes dead centre.
3. **`doodad.ts`** — add a `Pillar` entry to `DoodadType` and per-theme
   `doodadOverrides` in `themes.ts`: `*_special_pillar.xml` for a–g/i,
   `doodads/theme_h/h_deco_rock.xml` for h, `bonusN_pillar.xml` for the bonus
   themes. All four are confirmed solid. **Do not use `*_deco_pillar_*.xml`** —
   most have no collider and are pure art.
4. **`anchors.ts`** — the 9 spawn anchors (N/S/E/W, 4 corners, centre), inset
   from the wall band by the arena padding.
5. **`cover.ts`** — the four patterns (`random`, `ring`, `gaussian`,
   `symmetric`), all drawing from `ctx.bossRand`, all sharing one rejection
   filter (overlaps boss footprint / any anchor / entrance / alcove / another
   pillar) with a **fixed attempt cap**.
6. **`waves.ts`** — the rig from `boss-tab.md` §4. Re-read it; the shape is
   `trigger → ToggleElement{state:0} → TimerTrigger → SpawnObject × N`.
   Group each tier's monsters **by interval** so one shared interval yields one
   timer. Split each monster's `monsterMax` round-robin across the 9 anchors;
   `-1` passes through to every anchor unchanged.
7. **`arena.ts`** — `buildBossArena(options, theme, rand): { xml, preview }`.
   Not a `Level` (no rooms, passages or `wallPattern`), but it emits the same
   section order as `Level.getXML()` and reuses `Tile`, `Doodad`, `Item`,
   `Monster`, `ObjectSet` and `src/generator/xml/`.

Two arena details that are easy to get wrong and were verified the hard way:

- **The alcove interior is ordinary floor tiles from the start.** Destroying a
  doodad does not create ground. Lay the floor, then seal the mouth with wall
  doodads.
- **The three sealing doodads must be emitted with `need-sync="True"`.** Every
  other doodad in the arena stays `False`. Their ids are exactly the contents of
  the `DestroyObject` array.

Win chain: `GlobalEventTrigger "Boss Died"` → `DestroyObject`(the three seal
doodads) → wall opens → `ObjectSet.create(ctx, x, y, 'Orb', theme)` fires its
existing `ObjectEventTrigger → GameEnd`. **No lock, no key, no door** — the
campaign hands out gold keys on the last dungeon floor and a carried-over key
must not be able to open this early.

Also add the `BossPortal` `ObjectSet` type used on the final dungeon floor. It
replaces the `Orb` prefab at the *same* coordinates, and like `Orb` it must
consume **zero** RNG, so the floor's layout and wall bitmap are unchanged.

**Gate:** `npm run typecheck && npm test`.

---

## Phase 6 — wire it into generation

**File:** `src/generator/index.ts`

Emit both levels **after** the `params.levels` loop, exactly where the lobby is
emitted today (see the comment block above `const lobbyEnabled = ...`). Level
order becomes `lobby → 0 … N-1 → bossprep → boss`. Level ids are the **strings**
`bossprep` and `boss` — numeric floor ids `0..N-1` must not move. Append the two
`<level>` entries to `levelString` after the loop, and push the arena's preview
onto `previews` so the canvas shows it with no renderer change.

**Gate:** `npm run typecheck && npm test`, and the byte-identity test from
phase 7 must pass before you call this phase done.

---

## Phase 7 — tests (`tests/boss.test.ts`)

This is not optional and not "later". Copy the idioms from `tests/lobby.test.ts`
— in particular the `allIds(xml)` helper (line 39) and the `badIntArray(xml)`
scanner (line 125), which exists specifically to catch the `LevelPacker.exe`
empty-`int-arr` crash. Reuse both; do not re-invent them.

| # | Assertion |
| --- | --- |
| 1 | `boss.enabled: false` ⇒ `files` byte-identical to a boss-less run of the same seed, across seeds `[1, 4242, 987654]`. Copy the on/off idiom at `tests/lobby.test.ts:46`. |
| 2 | `boss.enabled: true` ⇒ `levels/level0..N-1.xml` differ from the boss-off run **only** inside the final floor's orb room. Every other floor and every wall bitmap identical. |
| 3 | Determinism: same params + same seed ⇒ `expect(a.files).toEqual(b.files)`. |
| 4 | Arena geometry: exactly one boss actor; boss inside the walls; all 9 anchors on walkable floor; alcove never on the N wall when the boss is the dragon; alcove interior is floor tiles; the three seal doodads are `need-sync="True"` and their ids are exactly the `DestroyObject` array; no pillar overlaps an anchor, the boss, the entrance or the alcove. |
| 5 | Wave graph: each tier has ≥1 `TimerTrigger` shipping `enabled="False"`, reached from exactly one `ToggleElement{state:0}`, itself reached from that tier's trigger; every `SpawnObject` is downstream of some timer; a tier whose monsters all use the wave default emits **exactly one** timer; a tier with two distinct intervals emits two. |
| 6 | Id integrity: every id in a `connections` array resolves to a real node; all ids unique across doodads / actors / items / scripting; `badIntArray` finds nothing in any generated file. |
| 7 | Cover: each of the four patterns produces pillars, respects the rejection filter, and terminates (no test may hang — if one does, your attempt cap is missing). |

Test 1 is the most important one in the suite. If it fails, something is
drawing from `ctx.rand` that should be drawing from `ctx.bossRand`.

**Gate:** `npm run typecheck && npm test`, all green.

---

## Phase 8 — UI

**Files:** new `src/renderer/components/BossForm.tsx`, modified
`src/renderer/App.tsx`, `src/renderer/styles/app.css`

`App.tsx`: extend `leftTab` to `'lobby' | 'dungeon' | 'player' | 'boss'`, add
the tab button right of Player with an `on`/`off` `tab-count` badge like the
lobby's, add the render branch, and add a `resetDefaults()` branch plus its
button label.

`BossForm.tsx` uses the existing `Section` / `Subsection` / `NumberField` /
`BoolField` / `ToggleGroup` from `src/renderer/components/fields.tsx`. Build
nothing new that already exists there. Two sub-tabs:

**Prep room** — mirrors `LobbyForm.tsx`, plus a **"Copy from Lobby"** button
that assigns `params.lobby.shopCategories` into `params.boss.prep.shopCategories`.
Starting gold defaults to 0.

**Boss room** —
- *General*: min/max width, min/max height
- *Chances & multipliers*: monster / gold / food only
- *Theme*: one `<select>` over `THEME_DEFS`, grouped by `ThemeDef.group`
- *Boss*: checkbox grid of the 7 bosses (reuse the `MonsterFilterBar` idiom)
- *Waves*: four `Subsection`s (100 / 75 / 50 / 25%), each with a monster pool, a
  max-count table accepting `-1`, and a single "spawn every N ms" field. An
  **Advanced** disclosure inside each reveals the per-monster interval column.
  Collapsed by default — the simple case must stay one field.
- *Cover*: pattern `ToggleGroup`, density slider, with `ringSpacing` and
  `clusters` shown **only** for the patterns that use them

CSS goes alongside the existing `.lobby-*` block in `app.css`, following the
same naming.

**Gate:** `npm run typecheck && npm test && npm run build`, then `npm run dev`
and click through: toggle the boss off and on, switch both sub-tabs, trip a
validation error and confirm it renders inline on the right field, hit reset
defaults, and generate a campaign.

---

## Phase 9 — docs

- `CHANGELOG.md` — a new entry, matching the existing format.
- `README.md` — describe the Boss tab in the user-facing feature list.
- `.claude/skills/hammerwatch-modding/references/ASSET-REGISTRY.md` — promote the
  four confirmed pillar paths (`a_special_pillar`, `c_special_pillar`,
  `h_deco_rock`, `bonus1_pillar`) and the boss actor paths, tagged `[VERIFIED]`.
- **If you discover anything new about what the editor or `LevelPacker.exe`
  accepts** — an asset path that resolves, a constraint that crashes — append it
  to `DISCOVERY-LOG.md` **in the same change**. This is required by `CLAUDE.md`.

---

## Stop and ask rather than guessing

These are judgement calls that are cheap to answer and expensive to redo:

- Any change to `src/generator/map/**`, `wallPattern`, or the `Level` class.
  The arena is *not* a `Level`; if you feel the urge to modify one to fit the
  other, that is a design question, not an implementation detail.
- Any test in `tests/lobby.test.ts`, `tests/generation.test.ts` or
  `tests/rand.test.ts` that goes red. These guard existing seeds. **Never edit a
  failing golden test to make it pass** — the failure is telling you the
  generator's output moved.
- The exact XML shape of anything not already quoted in `boss-tab.md` or the
  three verified scratch levels.
- Per-boss minimum arena sizes. The numbers are unknown; ship the generous
  defaults and the loose validation, and let playtesting settle it.

## Known open assumption

The new node types have only been observed in the **editor's** XML dialect
(`<vec2 name="pos">`, `connection-delays`). This repo emits `<float name="x">`,
`<float name="y">`, `delays` — a dialect already proven playable for the node
types that ship today, so new nodes inherit `getXML()` unchanged.

If in-game testing later shows a generated `SpawnObject` or `TimerTrigger` does
not fire, the fix is to override those four classes to the editor's dialect.
That is a contained change and leaves existing seeds untouched. **Do not
pre-emptively switch the whole repo to the editor dialect** — it would rewrite
every existing seed's level XML.

## Definition of done

- `npm run typecheck && npm test && npm run build` all green.
- A campaign generated with the boss **off** is byte-identical to one generated
  before this feature existed, for the same seed.
- The Boss tab renders, validates, resets, and round-trips through
  `parameters.txt`.
- In-game verification (items 9–14 of `boss-tab.md` § Verification) is **not**
  your responsibility — it needs a Hammerwatch install. List what still needs
  playtesting in your final summary.
