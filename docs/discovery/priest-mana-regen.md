# Priest gets no mana regen (explained: cripple aura, stock AE)

**Report (2026-10-14):** with the Original Hammerwatch boxes ticked and **Fully upgraded**,
the priest regenerated no mana at all; the only way to get mana back was to pick up mana.

## Cause `[VERIFIED]` (stock files)

`players/priest/skills/priest_cripple_aura.sval` is a `Skills::ToggleableSkill` whose
modifiers include `Modifiers::ConvertStat` from `ManaRegen` to `ManaRegen` with `mul` 0:
**while the aura is on, the priest's mana regen is 0.** `ToggleableSkill.GetModifiers`
returns its modifiers only while it is active, so regen comes back when the aura is
switched off. The aura also drains 1 mana every 500 ms while on; the top upgrade
(`priest_cripple_aura_drain`, `mana-drain` 0) removes the drain but not the regen block.

A priest normally meets this only after buying the aura (3500 gold). **Fully upgraded**
owns it from the start, so it is on the bar from the first floor. None of the Original
Hammerwatch boxes touches mana regen (`players/original.ts`).

## Also ruled out

- No player preset lowers the priest's regen (stock 1.75/s; the HW2 presets raise it).
- Mana shield only spends mana when the priest is hit (`ManaShield.as`).

## Resolved

Checklist #38 (beam mana cost) was judged with the aura off and is VERIFIED. Nothing to
change: the regen block is stock AE behaviour.
