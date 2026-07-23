import DOMPurify from "dompurify"

export interface SanitizeHtmlOptions {
  sanitizer?: (html: string) => string
  /** Bare SSR either escapes all markup (default) or fails explicitly. */
  ssr?: "escape" | "throw"
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
