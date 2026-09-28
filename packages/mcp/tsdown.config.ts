import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // `import.meta.url` in the CommonJS build, for finding the viewer bundle beside dist.
  shims: true,
  external: [/^@ai-gui\//, /^@modelcontextprotocol\//, "zod", "playwright", /^node:/],
})
