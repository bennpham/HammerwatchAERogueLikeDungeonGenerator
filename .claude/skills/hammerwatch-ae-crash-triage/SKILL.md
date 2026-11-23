---
name: hammerwatch-ae-crash-triage
description: Where to look and how to classify when the AE dungeon generator or a generated scenario breaks — HW1A.exe.log and crash dumps, PACKAGER failure modes, generation refusals and hangs, and the usual causes of each. Load when triaging a crash, error message, failed install or misbehaving scenario.
---

# Crash triage — Hammerwatch AE Dungeon Generator

## Where things are

| What | Where |
|---|---|
| Game log | `<AE>/HW1A.exe.log`, overwritten each launch. Search it for `[ERR]` / `[WRN]`. |
| Game crash dumps | `<AE>/HW1A_66_crash_<date>.mdmp`. Not readable here; ask for the log lines from just before the crash. |
| Packer output | Shown in the install message: the writer's reason when it installed unpacked, and a "Note:" for each patch it couldn't apply. |
| App settings | Electron userData `settings.json` (AE folder, `cleanupFiles`) |
| Parameters override | `parameters.txt` in userData or the working directory |

`<AE>` = `D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch Anniversary Edition`

## Classification

| § | Symptom | Usual cause | First move |
|---|---|---|---|
| A | Generate is refused with field errors | A validation rule caught bad input; working as intended | Is the message clear and the rule right? If the rule is too strict, escalate. |
| B | "Could not generate level N", or a hang | Room constraints that can't fit (sizes vs map) | Reproduce with params and seed. Add a validation rule; never raise the retry bound. |
| C | Install fails, installs "unpacked", or the scenario doesn't list | Wrong folder (no `HW1A.exe`); the writer refused a file (the reason is in the message, e.g. an SVAL tag with no known binary form, or an `info.xml` attribute the mapping doesn't know); or the game rejects the pack (`HW1A.exe.log`) | Add the missing form or mapping to `src/main/h1c/write.ts` with a test, checked against a pack PACKAGER made (`scripts/dev/probe-h1c.ts`). |
| D | The game logs errors, or a level misbehaves | A unit path the install lacks; a script parameter that's misnamed or has the wrong enum; a trigger watching no units; a toggle with the wrong state | Grep the log for the unit or script, then check `aeAssetExists` and the DISCOVERY-LOG enum tables. A seal that never opens usually means a boss trigger built before `ctx.bossActors` was registered. |
| E | Renderer crash or blank UI | A React error | Get the devtools console message. |

## Duplicate scenario in the list

A `scenarios/<id>/` folder was left beside `<id>.h1c`. Remove the folder; the installer does this unless "keep source" is on.

## Reproducing

Generation is deterministic: `generateDungeon(params, seed)` in a test reproduces any level exactly. `scripts/dev/inspect-lvl.ts` and `lobby-map.ts` show a level's contents.
