// mhchem installs itself into KaTeX. The plugin starts that import itself, but asynchronously, and
// a page draws its whole answer at once — before the import lands, so every \ce{} came out as
// red error text. Loaded here, first, it is in place when the answer is parsed.
import "katex/contrib/mhchem"
import { createRenderer } from "@ai-gui/vanilla"
import { viewerPlugins } from "./plugins"

/**
 * The page's own script: read the answer out of the data block and draw it.
 *
 * `setText` rather than `push`, so the whole answer is parsed as one finished text and the last
 * block is closed like every other — nothing is streaming here.
 */
const data = JSON.parse(document.getElementById("aigui-data")?.textContent ?? "{}") as { markdown?: string; theme?: "light" | "dark" }
const theme = data.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
const root = document.getElementById("aigui-root") as HTMLElement
createRenderer(root, { plugins: viewerPlugins(theme), theme }).setText(data.markdown ?? "")
