import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Coverage settings for the whole workspace.
 *
 * In workspace mode Vitest reads coverage from the root config only — the `coverage` key on each
 * project in `vitest.workspace.ts` is ignored. Without this file the report counted the
 * playground's built vendor bundles (3Dmol, cytoscape, mermaid) as uncovered source, which put
 * the workspace at 22% while the packages themselves were well covered.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: fileURLToPath(new URL("./coverage", import.meta.url)),
      // Only the published packages' sources count.
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/dist/**",
        "apps/**",
        "**/*.config.ts",
        // Type-only barrels have no statements to execute.
        "packages/*/src/**/types.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
    },
  },
})
