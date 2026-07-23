import { fileURLToPath } from "node:url"
import { defineWorkspace } from "vitest/config"

// Resolve @ai-gui/* to TS source so tests never run against a stale dist build.
const alias = {
  "@ai-gui/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@ai-gui/devtools": fileURLToPath(new URL("./packages/devtools/src/index.ts", import.meta.url)),
  "@ai-gui/react": fileURLToPath(new URL("./packages/react/src/index.ts", import.meta.url)),
  "@ai-gui/vue": fileURLToPath(new URL("./packages/vue/src/index.ts", import.meta.url)),
  "@ai-gui/vanilla": fileURLToPath(new URL("./packages/vanilla/src/index.ts", import.meta.url)),
}

const coverage = {
  provider: "v8" as const,
  reporter: ["text", "json", "html"],
  reportsDirectory: fileURLToPath(new URL("./coverage", import.meta.url)),
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["src/**/*.test.{ts,tsx}", "dist/**", "**/*.config.ts"],
}

export default defineWorkspace([
  {
    resolve: { alias },
    test: { name: "core", root: "packages/core", coverage },
  },
  {
    resolve: { alias },
    test: { name: "react", root: "packages/react", coverage },
  },
  {
    resolve: { alias },
    test: { name: "vanilla", root: "packages/vanilla", coverage },
  },
  {
    resolve: { alias },
    test: { name: "vue", root: "packages/vue", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-primitives", root: "packages/plugin-primitives", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-katex", root: "packages/plugin-katex", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-highlight", root: "packages/plugin-highlight", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-mermaid", root: "packages/plugin-mermaid", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-chart", root: "packages/plugin-chart", coverage },
  },
  {
    resolve: { alias },
    test: { name: "devtools", root: "packages/devtools", coverage },
  },
  {
    resolve: { alias },
    test: { name: "playground", root: "apps/playground", coverage },
  },
])
