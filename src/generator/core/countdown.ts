/**
 * The `M:SS` countdown format Hammerwatch's announce line uses ("0:30", "1:05",
 * "0:00"), shared by every rig that ticks a timer down on screen — the boss
 * arena's invulnerability windows and the per-floor timed hazard.
 *
 * Pure: draws nothing from any RNG stream and touches no context.
 */

/** How long one countdown tick stays on screen, in ms — one second, so ticks meet end to end. */
export const TICK_DISPLAY_MS = 1000

/**
 * AnnounceText's `type` for a countdown tick. Type 2 is the style the reference
 * levels use for their timers; 0 is the ordinary centred banner the win text uses.
 * [VERIFIED] 2026-08-22 from test_boss_invinc.xml.
 */
export const COUNTDOWN_TEXT_TYPE = 2

/** `M:SS`, the format the reference countdown announces ("0:30", "1:05", "0:00"). */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.trunc(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
