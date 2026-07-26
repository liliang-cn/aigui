import DOMPurify from "dompurify"

export interface SanitizeHtmlOptions {
  sanitizer?: (html: string) => string
  /** Bare SSR either escapes all markup (default) or fails explicitly. */
  ssr?: "escape" | "throw"
  /**
   * Whether a plugin may declare its own markup safe, which it does by returning `trusted: true`.
   * On by default: a plugin is code the host installed, and sanitizing the SVG it drew would
   * escape it into text. Set to `false` to sanitize every output whatever its origin.
   */
  trustPlugins?: boolean
}

/** Escape the HTML-significant characters so a string renders as inert text. */
function escapeHtml(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Sanitize an HTML string, stripping scripts and unsafe attributes.
 *
 * When a DOM is available (browser, or Node with jsdom) DOMPurify is used. In a
 * bare Node environment without a global `window`, DOMPurify cannot run, so we
 * fall back to escaping the HTML-significant characters. This never emits raw
 * markup and never throws.
 */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  if (options.sanitizer) return options.sanitizer(html)
  if (typeof window === "undefined") {
    if (options.ssr === "throw") throw new Error("sanitizeHtml requires a DOM or an injected sanitizer")
    return escapeHtml(html)
  }
  return DOMPurify.sanitize(html)
}

/** What a renderer was told to do about sanitizing: nothing, the default, or these options. */
export type SanitizeSetting = boolean | SanitizeHtmlOptions | undefined

/**
 * Sanitize one piece of rendered HTML, respecting a plugin's claim that it built the markup itself.
 *
 * Shared by every framework binding so the three of them cannot drift apart on what "sanitize"
 * means — and so a diagram is not escaped into its own source text in one of them.
 */
export function sanitizeRenderedHtml(html: string, sanitize: SanitizeSetting, trusted = false): string {
  if (sanitize === false) return html
  const options = typeof sanitize === "object" ? sanitize : undefined
  if (trusted && options?.trustPlugins !== false) return html
  return sanitizeHtml(html, options)
}
