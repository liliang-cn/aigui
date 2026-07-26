import { fileURLToPath } from "node:url"
import { defineWorkspace } from "vitest/config"

// Resolve @ai-gui/* to TS source so tests never run against a stale dist build.
const alias = {
  "@ai-gui/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-form": fileURLToPath(new URL("./packages/plugin-form/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-sdk": fileURLToPath(new URL("./packages/plugin-sdk/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-citation": fileURLToPath(new URL("./packages/plugin-citation/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-artifact": fileURLToPath(new URL("./packages/plugin-artifact/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-ui": fileURLToPath(new URL("./packages/plugin-ui/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-molecule": fileURLToPath(new URL("./packages/plugin-molecule/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-physics": fileURLToPath(new URL("./packages/plugin-physics/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-figure": fileURLToPath(new URL("./packages/plugin-figure/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-map": fileURLToPath(new URL("./packages/plugin-map/src/index.ts", import.meta.url)),
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
    test: { name: "plugin-form", root: "packages/plugin-form", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-sdk", root: "packages/plugin-sdk", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-citation", root: "packages/plugin-citation", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-artifact", root: "packages/plugin-artifact", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-ui", root: "packages/plugin-ui", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-molecule", root: "packages/plugin-molecule", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-physics", root: "packages/plugin-physics", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-figure", root: "packages/plugin-figure", coverage },
  },
  {
    resolve: { alias },
    test: { name: "plugin-map", root: "packages/plugin-map", coverage },
  },
  {
    resolve: { alias },
    test: { name: "openai", root: "packages/openai", coverage },
  },
  {
    resolve: { alias },
    test: { name: "anthropic", root: "packages/anthropic", coverage },
  },
  {
    resolve: { alias },
    test: { name: "vercel-ai", root: "packages/vercel-ai", coverage },
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
