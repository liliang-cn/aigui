import { createRenderer } from "@ai-gui/vanilla"
import { loadedPack, packsFor } from "./packs"
import { corePlugins } from "./plugins"
import { enableComments } from "./comments"

/**
 * The page's main script: read the answer out of the data block, load the packs its blocks need,
 * and draw it.
 *
 * Packs are classic scripts beside this one, not module chunks: a page opened from disk cannot
 * import a module, but it can run a `<script src>`. A page exported as one file carries its packs
 * inline, already registered, and nothing is fetched. `setText` rather than `push`, so the whole
 * answer is parsed as one finished text — nothing is streaming here.
 */
const data = JSON.parse(document.getElementById("aigui-data")?.textContent ?? "{}") as {
  markdown?: string
  theme?: "light" | "dark"
  /** Custom blocks this page uses: user scripts beside it, registered the same way as packs. */
  custom?: Array<{ name: string; fences: string[]; src: string }>
}
const theme = data.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
const root = document.getElementById("aigui-root") as HTMLElement
// `?still`: drawn as a picture rather than played — what an export or a look-over wants.
const still = new URLSearchParams(location.search).has("still")
if (still) document.documentElement.setAttribute("data-still", "")
const here = (document.currentScript as HTMLScriptElement | null)?.src ?? ""
const base = here.slice(0, here.lastIndexOf("/") + 1)

function load(name: string, src = `${base}${name}.js`): Promise<void> {
  if (loadedPack(name)) return Promise.resolve()
  return new Promise((resolve) => {
    const script = document.createElement("script")
    script.src = src
    // A pack that fails to load leaves its blocks as source; the rest of the answer still draws.
    script.onload = script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

const markdown = data.markdown ?? ""
const custom = data.custom ?? []
const names = [...packsFor(markdown, custom.flatMap((c) => c.fences)), ...custom.map((c) => c.name)]
const sources = new Map(custom.map((c) => [c.name, new URL(c.src, location.href).href]))
void Promise.all(names.map((name) => load(name, sources.get(name)))).then(() => {
  const plugins = [...corePlugins(still), ...names.flatMap((name) => loadedPack(name)?.(theme, still) ?? [])]
  createRenderer(root, { plugins, theme }).setText(markdown)
  if (!still) void enableComments(root)
})
