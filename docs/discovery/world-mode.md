# World mode: what only playing can answer

The plan is `docs/plans/world-mode.md`. Phase P0 emits a probe scenario (`scripts/dev/world-probe.ts`): a 192² and a
384² grass island with a cliff ring over water, a hidden `teleport_mt`, a `closed` `teleport_mt` frame, and one
floor button that reveals both. Install it, play it, and fill in the answers below. Each answer then goes into the
discovery log as `[VERIFIED]`.

## 1. The coast

- Does a ring of `doodads/cliffs/granite2` pieces over `tilesets/water_clear` read as a coast from all four sides?
  Do the north-facing (`n_*`) pieces and the inner corners (`*_i`) look right?
- Do the same for `basalt` and `silt`, which are the candidates for the desert and mud biomes.
- Does the party stop at every point of the ring? Check the outer corners, the inner corners, and any spot where only
  the invisible collision belt stops them.
- Can projectiles fly over the water? Cliff pieces are shoot-through, so that's expected.

Answer: Try and we can see.

## 2. Size and performance

- Load time for the 192² and the 384² levels.
- Frame rate while walking through dense scatter (trees, tufts).
- Does the minimap show the whole island? Do the `____minimap_*` helper layers and `ExploreMinimap` behave on a big
  map?

Answer: I think so. I don't know. Try it.

## 3. The portal

- `teleport_mt` placed `hidden: t` and later shown with `HideUnit` `State 2` (Show): while hidden, does it collide,
  show on the minimap, or react to F?
- `teleport_mt` in the `closed` scene, switched to `open` with `SetUnitScene`: does it read as "the portal came alive"?
- Which of the two styles should be the default?

Answer: While hidden no react to F. Yes portal came alive I suppose and default to open right?

## 4. Monsters on a big map

- Do monsters spawned by an ambush tripwire (`AreaTrigger` → `SpawnUnit`) attack straight away?

Yes or optional wait period if possible. Take the simpler option.

- Do roaming packs stay asleep until a player is within about 300 px (`SetUpdateDistanceLimit`)? Is that still fine
  when four players split up?

Answer: Sure.

## 5. Look

- Which stock environment and lighting looks best outdoors for each biome (grass, woods, desert, mud, snow)?
- Does the water need shore doodads (`ledges/___water/water_clear_*`, `terrain/water_coastline`) at the foot of the
  cliffs, or is the cliff face enough?

Answer: Try the cliff face for now and once we build it I can give feedback. Simplest is best. Take all the biome you listed?
