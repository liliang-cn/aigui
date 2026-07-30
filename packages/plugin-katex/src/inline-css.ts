import { FONT_PLACEHOLDER, KATEX_CSS_TEMPLATE, KATEX_VERSION } from "./katex-css.generated"

export { KATEX_VERSION }

export interface KatexInlineCssOptions {
  /**
   * Where the KaTeX font files are served from, with a trailing slash.
   *
   * KaTeX's stylesheet declares its own `@font-face` rules pointing at `fonts/…` relative to the
   * stylesheet, which only works when a bundler emits it. Injected into a `<style>` those URLs
   * resolve against the page instead and every one of them 404s — the maths still lays out, but in
   * the browser's fallback fonts, which is not what KaTeX drew. Copy `katex/dist/fonts` next to
   * your other assets and say so here. The default points at a version-pinned CDN, which needs the
   * network: for a product served over a LAN, self-host and pass the path.
   */
  fontBase?: string
}

const CDN_FONT_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/fonts/`

/**
 * KaTeX's own stylesheet as a string, for a host that cannot import CSS.
 *
 * With a bundler prefer `import "@ai-gui/plugin-katex/style.css"`: it is one line, it emits the
 * fonts alongside the stylesheet, and it costs the JavaScript bundle nothing. This is for the
 * cases that cannot — a `<script type="module">` page, a widget injected into a host document —
 * where the plugin's `css` is the only way styles reach the page:
 *
 * ```ts
 * import { katex } from "@ai-gui/plugin-katex"
 * import { katexInlineCss } from "@ai-gui/plugin-katex/inline-css"
 *
 * katex({ css: katexInlineCss({ fontBase: "/assets/katex/fonts/" }) })
 * ```
 *
 * It lives behind its own entry point so the ~24 kB of CSS text is only in the bundle of a host
 * that asked for it.
 */
export function katexInlineCss(options: KatexInlineCssOptions = {}): string {
  const base = options.fontBase ?? CDN_FONT_BASE
  return KATEX_CSS_TEMPLATE.split(FONT_PLACEHOLDER).join(base.endsWith("/") ? base : `${base}/`)
}
