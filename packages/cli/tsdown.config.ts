import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // `import.meta.url` in the CommonJS build, for reading package.json beside dist.
  shims: true,
  // Plugins are imported by name at run time; bundling them would defeat the point.
  external: [/^@ai-gui\//, /^node:/],
})
