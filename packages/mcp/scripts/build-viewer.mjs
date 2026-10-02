// Builds the page viewer: the main script and one classic script per pack, each self-contained.
// Classic IIFE files rather than module chunks, because a page opened from disk cannot import a
// module but can run a `<script src>` beside it.
import { readdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const root = fileURLToPath(new URL("..", import.meta.url))
const outDir = `${root}dist/viewer`
rmSync(outDir, { recursive: true, force: true })
const packs = readdirSync(`${root}src/viewer/packs`).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3))
const entries = [["core", "src/viewer/entry.ts"], ...packs.map((p) => [p, `src/viewer/packs/${p}.ts`])]
for (const [name, entry] of entries) {
  await build({
    root,
    logLevel: "warn",
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}", global: "globalThis" },
    build: {
      lib: { entry, formats: ["iife"], name: `AiguiViewer_${name}`, fileName: () => `${name}.js` },
      outDir,
      emptyOutDir: false,
      target: "chrome110",
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  })
}
