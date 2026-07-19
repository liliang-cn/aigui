import { fileURLToPath } from "node:url"
import { defineWorkspace } from "vitest/config"

// Resolve @aigui/* to TS source so tests never run against a stale dist build.
const alias = {
  "@aigui/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
}

export default defineWorkspace([
  {
    resolve: { alias },
    test: { name: "core", root: "packages/core" },
  },
  {
    resolve: { alias },
    test: { name: "react", root: "packages/react" },
  },
  {
    resolve: { alias },
    test: { name: "vanilla", root: "packages/vanilla" },
  },
  {
    resolve: { alias },
    test: { name: "vue", root: "packages/vue" },
  },
  {
    resolve: { alias },
    test: { name: "plugin-primitives", root: "packages/plugin-primitives" },
  },
  {
    resolve: { alias },
    test: { name: "plugin-katex", root: "packages/plugin-katex" },
  },
  {
    resolve: { alias },
    test: { name: "plugin-highlight", root: "packages/plugin-highlight" },
  },
  {
    resolve: { alias },
    test: { name: "plugin-mermaid", root: "packages/plugin-mermaid" },
  },
  {
    resolve: { alias },
    test: { name: "plugin-chart", root: "packages/plugin-chart" },
  },
])
