import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  external: [/^@ai-gui\//, "react", "react/jsx-runtime", "vue"],
})
