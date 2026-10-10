import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * Vitest's 5s default is not a realistic budget for this repo.
     *
     * Almost every suite here calls `generateDungeon` or `buildBossArena`,
     * which raster a whole map and pattern-match every wall tile; several sweep
     * all of `THEMES` or several seeds and build dozens of levels in one `it`.
     * The heaviest of those already carried explicit 30s/60s timeouts, but the
     * merely-slow ones sat just under 5s and only passed because the worker
     * pool happened not to be saturated — so adding a test *file* could fail an
     * unrelated test in a different one, on a machine with enough cores to run
     * them all at once. That is a false negative, not a real signal.
     *
     * A generous default fixes the whole class. A genuinely hung test still
     * fails, just 30s later; the explicit per-test timeouts that exceed this
     * still apply.
     */
    testTimeout: 30_000
  }
})
