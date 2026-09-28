import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

/**
 * The page bundle `aigui_open` ships beside every HTML file it writes: the vanilla renderer and
 * every plugin that draws, in one classic script.
 *
 * Classic, not a module, because the page is opened from disk: Chrome refuses a `type="module"`
 * script from a `file://` origin but runs a plain `<script src>` beside it. The plugins are
 * devDependencies because they are inlined here and never imported at run time. The defines are
 * the ones `@ai-gui/image` needs for the same reason — something in the tree reads `process.env`.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
    global: "globalThis",
  },
  build: {
    lib: { entry: "src/viewer/entry.ts", formats: ["iife"], name: "AiguiViewer", fileName: () => "aigui-viewer.js" },
    outDir: "dist/viewer",
    emptyOutDir: true,
    target: "chrome110",
    // One file: a page opened from disk cannot fetch a chunk it was split into.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
