# Priest gets no mana regen (open, needs a retest)

**Report (2026-10-14):** with one of the player presets, the priest regenerated no mana at
all; the only way to get mana back was to pick up mana. Which preset, and which other
settings (Fully upgraded, Original Hammerwatch toggles), isn't known yet. This also blocks
checklist #38 (priest beam mana), which can't be judged while regen is 0.

## What's ruled out

- **No preset writes the priest's regen down.** None of the presets touches
  `class.priest.base-mana-regen` (stock 1.75/s) or `priest_misc_mana`'s
  `player-mana-regen-set` (2 → 4/s), except the HW2 presets, which raise them
  (HW2 level 10 is 3.49/s, level 50 is 11.15/s). Checked by building every preset in
  `PLAYER_PRESETS`.
- **Mana shield doesn't stop regen.** `Skills::ManaShield` (`ManaShield.as`) only spends
  mana when the priest takes damage (`dmg-per-mana`). The Dungeon Rebalanced and Original
  Rebalanced presets raise `dmg-per-mana`, which makes each hit cost *less* mana.

## Still possible

- A channelled skill (the beam) holding regen off while it runs, or the
  **Original beam mana cost** toggle changing more than the cost.
- **Fully upgraded** owning a priest skill whose top level costs mana over time, such as a
  drain or aura, so regen looks like 0.
- Another class's file being read for the priest, e.g. a forked shared file.

## To retest

1. Note the player preset, whether **Fully upgraded** is on, and which **Original
   Hammerwatch feel** boxes are ticked.
2. Start as the priest, use no skills, and watch the mana bar for 10 seconds. Does it rise?
3. If it rises, hold the beam and release it. Does regen come back after you release?
4. Send the `parameters.txt` / `playersettings.txt` from that run, if you can.
