// mhchem installs itself into KaTeX. The plugin starts that import itself, but asynchronously, and
// a page draws its whole answer at once — before the import lands, so every \ce{} came out as
// red error text. Loaded here, first, it is in place when the answer is parsed.
import "katex/contrib/mhchem"
import { katex } from "@ai-gui/plugin-katex"
import { registerPack } from "../packs"

// `css` is empty because the page carries the real stylesheet, fonts inlined; the default is an
// `@import` a file page cannot resolve.
registerPack("katex", () => [katex({ css: "", chemistry: true })])
