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
])
