import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { katexInlineCss } from "@ai-gui/plugin-katex/inline-css"

const PLACEHOLDER = "AIGUI_KATEX_FONTS/"

/**
 * KaTeX's stylesheet with its fonts inlined as data URIs.
 *
 * Two problems get solved together. The plugin's default `css` is an `@import` of a bare npm
 * specifier, which resolves to nothing inside `page.setContent` — without the real stylesheet a
 * formula renders as flat text, so `\frac{a}{b}` arrives as "ba". And `katexInlineCss({ fontBase })`
 * alone is not enough either: Chromium refuses `file://` subresources from an `about:blank`
 * document, so all twenty faces fail and the maths falls back to a serif. That fallback is
 * legible, but it has no blackboard bold or script faces — `\mathbb{R}` degrades to a bold R.
 *
 * Data URIs need no origin and no network, so the fonts simply work. 296 kB of woff2 becomes
 * roughly 368 kB of CSS, read once and kept for the life of the process.
 */
let cached: string | undefined

export function katexCss(): string {
  if (cached !== undefined) return cached
  const require_ = createRequire(import.meta.url)
  const fontDir = join(dirname(require_.resolve("katex/package.json")), "dist", "fonts")
  const inlined = new Map<string, string>()
  for (const file of readdirSync(fontDir)) {
    if (!file.endsWith(".woff2")) continue
    inlined.set(file, `data:font/woff2;base64,${readFileSync(join(fontDir, file)).toString("base64")}`)
  }
  let css = katexInlineCss({ fontBase: PLACEHOLDER })
  css = css.replace(new RegExp(`url\\(${PLACEHOLDER}([^)]+?)\\.woff2\\)`, "g"), (whole, name: string) => {
    const uri = inlined.get(`${name}.woff2`)
    return uri ? `url(${uri})` : whole
  })
  // Drop the woff/ttf fallbacks; they would 404 behind a woff2 that already loaded.
  css = css.replace(
    new RegExp(`,\\s*url\\(${PLACEHOLDER}[^)]+?\\.(?:woff|ttf)\\)\\s*format\\("(?:woff|truetype)"\\)`, "g"),
    "",
  )
  cached = css
  return cached
}
