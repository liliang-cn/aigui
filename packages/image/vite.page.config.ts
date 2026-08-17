import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

/**
 * The browser bundle, built separately from the library.
 *
 * A Vite *library* build does not shim `process.env` the way an app build does, and something in
 * the dependency tree reads it — without these defines the bundle dies on load with
 * `ReferenceError: process is not defined` before it can install `__aiguiRenderBlock`.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
    global: "globalThis",
  },
  build: {
    lib: { entry: "src/page/entry.ts", formats: ["iife"], name: "AiguiPage", fileName: () => "entry.js" },
    outDir: "dist/page",
    emptyOutDir: true,
    target: "chrome110",
  },
})
