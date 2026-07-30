import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { katexInlineCss, KATEX_VERSION } from "./inline-css"
import { FONT_PLACEHOLDER, KATEX_CSS_TEMPLATE } from "./katex-css.generated"
import { katex } from "./index"

describe("katexInlineCss", () => {
  it("is KaTeX's own stylesheet", () => {
    const css = katexInlineCss()
    expect(css).toContain("@font-face")
    expect(css).toContain(".katex")
    expect(css.length).toBeGreaterThan(20_000)
  })
  it("leaves no font URL pointing at a path only a bundler could resolve", () => {
    // This is the whole reason the stylesheet cannot simply be injected as it ships: `url(fonts/…)`
    // resolves against the page, so every font 404s and the maths renders in fallback faces.
    const css = katexInlineCss({ fontBase: "/assets/katex/fonts/" })
    expect(css).not.toContain("url(fonts/")
    expect(css).not.toContain(FONT_PLACEHOLDER)
    expect(css).toContain("url(/assets/katex/fonts/KaTeX_Main-Regular.woff2)")
  })
  it("substitutes every font reference, not just the first", () => {
    const css = katexInlineCss({ fontBase: "/f/" })
    const references = css.match(/url\(\/f\//g) ?? []
    expect(references.length).toBe((KATEX_CSS_TEMPLATE.match(new RegExp(FONT_PLACEHOLDER, "g")) ?? []).length)
    expect(references.length).toBeGreaterThan(50)
  })
  it("adds the missing trailing slash to a font base", () => {
    expect(katexInlineCss({ fontBase: "/assets/fonts" })).toContain("url(/assets/fonts/KaTeX_Main-Regular.woff2)")
  })
  it("falls back to a version-pinned CDN", () => {
    expect(katexInlineCss()).toContain(`https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/fonts/KaTeX_Main-Regular.woff2`)
  })
  it("is what the plugin declares when handed to it", () => {
    const css = katexInlineCss({ fontBase: "/f/" })
    expect(katex({ css }).css).toBe(css)
  })
  it("is absent from the plugin by default, since the default cannot be injected", () => {
    // A bare `@import` of a bare specifier is dropped by the renderers, on purpose: the browser
    // would resolve it against the document and 404.
    expect(katex().css).toBe('@import "katex/dist/katex.min.css";')
  })
})

describe("the generated stylesheet", () => {
  it("matches the installed KaTeX", () => {
    // An upgrade that changes katex.min.css should fail here rather than ship the old copy.
    const require = createRequire(import.meta.url)
    const katexPackage = require.resolve("katex/package.json")
    const installed = JSON.parse(readFileSync(katexPackage, "utf8")).version
    const css = readFileSync(join(dirname(katexPackage), "dist", "katex.min.css"), "utf8")
    expect(KATEX_VERSION).toBe(installed)
    expect(KATEX_CSS_TEMPLATE).toBe(css.replace(/url\(fonts\//g, `url(${FONT_PLACEHOLDER}`))
  })
})
