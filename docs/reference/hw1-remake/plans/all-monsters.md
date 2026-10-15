# All monsters — roster audit against the game's actor folder

**Status: IMPLEMENTED — historical.** The audit's work items all landed:
`skeleton_3` and `tower_battlement_empty` are in `monsterTypes.ts`, and the
phantom `tower_battlement_archer_2` reference is gone. The roster has since
grown variant keys (`lich#2`, `slime#0`) on top of this. Kept as the record of
how the roster was checked against the game's actor folder.

Compared against `<HW>/editor/assetsExtract/actors/` on 2026-07-30.

---

## Context

[`src/generator/objects/monsterTypes.ts`](../../src/generator/objects/monsterTypes.ts)
holds 49 monster types. It was ported from the Java original, then extended
twice — the desert/tower sets, and the bonus pair in `c12b978`. Nobody had ever
checked it against the game's actual actor folder.

This audit does that check and turns the gaps into a work item. Three questions:
what real actors can the generator not place, what does the roster reference
that does not exist, and what is deliberately excluded.

---

## The audit

### Scope

187 actor XML files ship in `assetsExtract/actors/`. Excluded — three by
instruction, one on evidence:

| Bucket | Count | Why excluded |
| --- | --- | --- |
| `boss_*/` (7 dirs) | 47 | Tracked by [issue #6](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/6); bosses carry their own gimmicks and scripting |
| `player/` | 28 | We are the players |
| `bonus/` + `spawners/bonus/` | 3 | Already shipped in `c12b978` |
| `*_razed.xml` (in scope) | 27 | Corpse/destroyed states. **Verified:** all 27 are named in a live actor's `corpse` entry; none is ever placed directly |
| **Live, in scope** | **82** | The comparison set |

Method, reproducible from a bash shell:

```bash
cd "<HW>/editor/assetsExtract"
find actors -name '*.xml' | tr '\\' '/' | sort > /tmp/all.txt
grep -vE '^actors/(bonus/|boss_|player/|spawners/bonus/)' /tmp/all.txt \
  | grep -v '_razed\.xml$' > /tmp/inscope.txt
grep -oE "actors/[a-z0-9_/]+\.xml" src/generator/objects/monsterTypes.ts | sort -u > /tmp/ours.txt

comm -23 /tmp/inscope.txt /tmp/ours.txt   # in game, not in our roster
comm -13 /tmp/all.txt     /tmp/ours.txt   # in our roster, not on disk
```

### Result — 79 of 82 wired, plus one phantom

Every spawner in `actors/spawners/` is already wired. The gaps:

| Actor | What it is | Verdict |
| --- | --- | --- |
| `actors/skeleton_3.xml` | **Real monster.** 20 HP, 8 dmg, speed **1.1** (vs skeleton_1's 40 / 20 / 0.4), aggro 14, `behavior="melee"`, full 8-direction sprite set, `effects/gibs/gib_skeleton_3.xml` present. Placed in stock `campaign/levels/level_10.xml`, `level_11.xml` and `level_esc_1.xml`, and it is what `lich_3.xml` summons (3 per cast, 2 s timer) | **Add.** The one genuinely missing monster |
| `actors/tower_battlement_empty.xml` | Real actor: 450 HP, `multiplayer-scale-hp false`, **empty `skills` array**, `movement: passive`, full 32×32 blocking polygon, corpse → `tower_battlement_empty_razed.xml`. Used in `campaign2/levels/level_temple_3.xml` and `level_boss_1.xml` | **Add.** A destructible obstacle rather than an attacker |
| `actors/tower_static_frost_ground.xml` | Root element is **`<doodad>`**, not `<actor>` — the ground decal under the frost tower | **Out of scope for `monsterTypes.ts`.** Record it in the doodad registry only |
| `actors/tower_battlement_archer_2.xml` | **Does not exist.** `grep -rl tower_battlement_archer_2` over the whole `editor/` tree returns nothing — no XML, no PNG, no reference from any level or actor. The game shipped battlement archer **1** and **3** only; archer_1 even reuses `tower_battlement_archer_3_razed.xml` as its corpse | **Broken reference in our roster.** [monsterTypes.ts:56](../../src/generator/objects/monsterTypes.ts#L56) |

Also noted, no action: `guard_1.png` … `guard_4.png` exist with no accompanying
XML, so they are not placeable actors.

### Severity of the phantom

`tower_archer2` has `defaultMax: 0`, so it never appears unless a user enables
it — but nothing stops them. Enabling it emits
`<string name="type">actors/tower_battlement_archer_2.xml</string>` into a level,
which the game cannot resolve.

This is the same class of defect as the `>undefined<` actor path fixed in
`c12b978`, and nothing today would catch it:
[tests/monsters.test.ts](../../tests/monsters.test.ts) checks tier-array *shape*,
never that a path resolves to a real file.

---

## Design

Three roster changes plus one new guard test. All of it is data — the placement
algorithm, the RNG, and the XML emitters are untouched.

### 1. `skeleton3` — new type

```ts
// Fast swarm skeleton from stock levels 10/11, and what lich_3 summons.
// 20 HP / 8 dmg / speed 1.1 — half skeleton1's HP at nearly 3× its speed, so
// the cap is doubled to 200 on the same weaker-monster-higher-cap reasoning as
// bonus_skeleton1. Still well under the ~400/lair lag ceiling in DISCOVERY-LOG.
// No spawner and no small/elite variant ship for it; single-tier is safe
// because createRolled clamps to the last index (java-port divergence #8).
{ id: 'skeleton3', configKey: 'maxSkeletons3', upgradeChance: 1.0, defaultMax: 200, group: 'Classic', tiers: ['actors/skeleton_3.xml'] }
```

`group: 'Classic'` — it is a stock main-campaign monster.

### 2. `tower_empty` — new type

```ts
// 450 HP, no skills, full 32×32 blocking collision. An obstacle, not an
// attacker; off by default because it can wall off a passage.
{ id: 'tower_empty', configKey: 'maxTowers_Empty', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_battlement_empty.xml'] }
```

### 3. `tower_archer2` — repointed and hidden

Repointing the phantom onto the empty battlement *and* giving the empty
battlement its own entry would ship two visible ids emitting the same actor.
Reconciled as: **`tower_empty` is canonical and visible; `tower_archer2`
survives only as a back-compat alias.**

```ts
// The game never shipped a battlement archer 2 — this entry was always a
// phantom pointing at a file that does not exist. Kept so existing
// parameters.txt files and saved pools keep loading; repointed at the empty
// battlement and hidden from the GUI in favour of tower_empty.
// Do not delete: removing the id turns a saved pool entry into a hard
// validation error (validation.ts:124).
{ id: 'tower_archer2', configKey: 'maxTowers_Archer2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', deprecated: true, tiers: ['actors/tower_battlement_empty.xml'] }
```

`MonsterTypeDef` gains `deprecated?: boolean`. Both renderer components filter it
out; [configFile.ts](../../src/generator/config/configFile.ts) keeps parsing and
emitting the key, so a round-trip stays lossless.

- [MonsterPoolsEditor.tsx:51-71](../../src/renderer/components/MonsterPoolsEditor.tsx#L51) — filter `!t.deprecated`
- [MonsterMaxTable.tsx:25-46](../../src/renderer/components/MonsterMaxTable.tsx#L25) — same filter

### Ordering rule

**Append only.** `monsterTypeById` falls back to the positional
`MONSTER_TYPES[3]`
([monsterTypes.ts:90](../../src/generator/objects/monsterTypes.ts#L90)), locked by
`tests/monsters.test.ts:37`. The two new entries go after `bonus_archer1`; the
`tower_archer2` edit is in place and moves nothing.

### Default pools stay untouched

`defaultParameters().levelMonsters`
([parameters.ts:66-75](../../src/generator/config/parameters.ts#L66)) is **not**
changed. The new types are opt-in through the pool editor or `monstersN=`,
exactly like the bonus pair, so every existing seed's dungeon stays
byte-identical. `defaultMax` alone changes nothing — it is only a ceiling.

---

## Files

**Modified**
- `src/generator/objects/monsterTypes.ts` — 2 appended entries, 1 repointed, `deprecated?` on `MonsterTypeDef`
- `src/renderer/components/{MonsterPoolsEditor,MonsterMaxTable}.tsx` — filter deprecated
- `parameters.default.txt` — `maxSkeletons3=200`, `maxTowers_Empty=0` appended
- `tests/monsters.test.ts` — cases below, plus the new actor-path fixture
- `.claude/skills/hammerwatch-modding/references/ASSET-REGISTRY.md` — 49 → 51 types, 3 table rows, note the phantom
- `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` — mandatory, same change (CLAUDE.md skill-maintenance protocol): the missing `tower_battlement_archer_2`, `skeleton_3`'s stats and its lich_3 link, `tower_static_frost_ground` being a doodad
- `.claude/skills/hammerwatch-modding/SKILL.md:297` — says "47 monster types", already stale at 49
- `README.md:128-133` — monster-set prose, stale since `c12b978` (omits Bonus)
- `CHANGELOG.md`

Untouched by design: `parameters.ts` (defaults derive from the array),
`configFile.ts`, `validation.ts`, everything under `src/generator/map/**`.

---

## Verification

```bash
npm run typecheck && npm test
```

`tests/monsters.test.ts` additions:

1. **Single-tier safety** — add `skeleton3` and `tower_empty` to the existing
   `['bonus_archer1','spider','archer3','wisp2']` loop: a real path is emitted,
   never `>undefined<`.
2. **No phantom paths** — a new roster-wide invariant. Every path in every
   `tiers` array matches `/^actors\/[a-z0-9_/]+\.xml$/` **and** appears in a
   committed allow-list of known-good actor paths. The generator must stay pure
   (invariant 1), so the test cannot stat the Steam folder — commit the list as a
   fixture, regenerated by hand from `find actors -name '*.xml'`. This is the
   test that would have caught `tower_battlement_archer_2`.
3. **Opt-in** — `defaultParameters().levelMonsters` contains neither `skeleton3`
   nor `tower_empty`; `monsterMax.skeleton3 === 200`, `monsterMax.tower_empty === 0`.
4. **Deprecated hidden but round-trips** — `tower_archer2` is absent from what the
   UI would render, yet `serialize(parse(…))` still preserves `maxTowers_Archer2`.
5. **Seed stability** — `generateDungeon(defaultParameters(), seed)` produces the
   same files before and after the roster change, for a couple of fixed seeds.

### In-game verification — required before merge

1. Generate a floor pooled to `skeleton3` only, cap 200. They spawn, move fast,
   and do not lag the level.
2. Generate a floor pooled to `tower_empty`. Confirm the 32×32 collision does not
   seal a corridor or trap the party — if it does, this needs a placement
   restriction (rooms only, never passages) and that becomes a second work item.
3. Enable `tower_archer2` from a legacy `parameters.txt` and confirm the level
   still loads — i.e. the repoint fixed a real load failure.

Log all three outcomes in `DISCOVERY-LOG.md` with the correct
`[VERIFIED]` / `[EMITTED]` / `[UNVERIFIED]` tag.

---

## Explicitly out of scope

- **Bosses.** All 47 `actors/boss_*/` files —
  [issue #6](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/6).
  They have their own behaviour patterns and gimmicks and are not basic monsters.
- **`_razed` corpse actors.** All 27 in-scope ones are the `corpse` target of a
  live actor; placing one directly would put a pre-destroyed prop in the dungeon.
- **`tower_static_frost_ground.xml`** — a doodad, not an actor. Belongs to
  whatever doodad work comes next, not to `monsterTypes.ts`.
- **Rebalancing existing caps or tiers.** `bat2`'s tier list, the desert set's
  zero defaults, and every current `upgradeChance: 1.0` stay as they are.
- **Changing default level pools.** Would move every existing seed.
- **Shipping custom actors.** Same line
  [the lobby plan](lobby-tab.md#explicitly-out-of-scope) drew — everything here
  is a stock path already on disk.
