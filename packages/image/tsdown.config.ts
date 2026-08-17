import { defineConfig } from "tsdown"

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    external: ["playwright"],
  },
  {
    entry: ["src/page/entry.ts"],
    format: ["iife"],
    outDir: "dist/page",
    platform: "browser",
    dts: false,
    clean: false,
    noExternal: [/.*/],
  },
])
